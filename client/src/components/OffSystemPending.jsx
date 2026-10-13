import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import './OffSystemPending.css';

const money = value => `N$ ${Number(value).toFixed(2)}`;
const count = value => Math.max(0, Number(value) || 0);
const totals = form => (form.quantities || []).reduce((sum, line) => ({
  historical: sum.historical + count(line.alreadyDispensed),
  live: sum.live + count(line.liveDispensed),
  pending: sum.pending + count(line.outstanding),
}), { historical: 0, live: 0, pending: 0 });
const storageKey = branch => `off-system-issue:${branch}`;
const remembered = branch => {
  try { return JSON.parse(sessionStorage.getItem(storageKey(branch))) || null; } catch { return null; }
};
const remember = (branch, request) => {
  try {
    if (request) sessionStorage.setItem(storageKey(branch), JSON.stringify(request));
    else sessionStorage.removeItem(storageKey(branch));
  } catch { /* In-memory retry remains available if session storage is disabled. */ }
};
const conflictError = err => err.status === 409 || /409|stale|version|reload|record changed|quantit.*chang|price.*chang|price.*mismatch|pricing.*chang|expected.?total|operation id already/i.test(err.message || '');

/** Historical references stay separate from the original prescription workflow. */
export default function OffSystemPending({ branch, userRole }) {
  const canIssue = ['dispenser', 'branch_manager', 'admin', 'super_admin'].includes(userRole);
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [physicalConfirmed, setPhysicalConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflicted, setConflicted] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [retryRequest, setRetryRequest] = useState(() => remembered(branch));
  const inFlight = useRef(false);
  const generation = useRef(0);
  const locked = busy || !!retryRequest || conflicted;

  const load = useCallback(async () => {
    if (!branch) return false;
    const token = ++generation.current;
    setLoading(true); setLoadError('');
    try {
      const result = await api.get(`/branch/off-system-pending?branch=${encodeURIComponent(branch)}`);
      if (!Array.isArray(result.forms)) throw new Error('The branch reference list could not be read.');
      if (token !== generation.current) return false;
      setForms(result.forms); return true;
    } catch (err) {
      if (token === generation.current) setLoadError(err.message || 'Unable to load branch references.');
      return false;
    } finally { if (token === generation.current) setLoading(false); }
  }, [branch]);
  useEffect(() => { load(); return () => { generation.current++; }; }, [load]);

  const choose = form => {
    if (locked) return;
    setSelected(form); setQuantities({}); setPaymentConfirmed(false); setPhysicalConfirmed(false); setError(''); setReceipt(null);
  };
  const lines = selected?.quantities || [];
  const items = lines.filter(line => !line.issueError && count(quantities[line.name]) > 0)
    .map(line => ({ name: line.name, quantity: Number(quantities[line.name]) }));
  const total = Number(items.reduce((sum, item) => sum + item.quantity * Number(lines.find(line => line.name === item.name).unitPrice), 0).toFixed(2));
  const valid = items.length > 0 && Number.isFinite(total) && items.every(item => {
    const line = lines.find(candidate => candidate.name === item.name);
    return Number.isSafeInteger(item.quantity) && item.quantity <= count(line.outstanding)
      && line.unitPrice != null && Number.isFinite(Number(line.unitPrice)) && Number(line.unitPrice) >= 0;
  });

  const send = async request => {
    if (!canIssue || inFlight.current || conflicted) return;
    inFlight.current = true; setBusy(true); setError('');
    setRetryRequest(request); remember(branch, request);
    try {
      const result = await api.post('/branch/off-system-pending', request);
      if (result.success !== true || !result.receipt) throw new Error('Issue result is unconfirmed. Do not take payment again.');
      setReceipt(result.receipt); setRetryRequest(null); remember(branch, null);
      setSelected(null); setQuantities({}); setPaymentConfirmed(false); setPhysicalConfirmed(false);
      await load();
    } catch (err) {
      if (conflictError(err)) {
        setRetryRequest(null); remember(branch, null); setConflicted(true);
        setError(`${err.message || 'The reference or price changed.'} Reload references and review current quantities and prices before issuing.`);
      } else if ([400, 401, 403, 404, 422].includes(err.status) || /invalid|required|access denied|permission|not authorized|insufficient|not enough|unavailable|cannot issue|not.*catalogue/i.test(err.message || '')) {
        setRetryRequest(null); remember(branch, null);
        setError(err.message || 'Issue rejected. Review the selected items.');
      } else {
        setError(`${err.message || 'The result could not be confirmed.'} Do not collect payment or issue the items again. Retry the exact request to confirm the original operation.`);
      }
    } finally { inFlight.current = false; setBusy(false); }
  };
  const issue = () => {
    if (locked || !valid || !paymentConfirmed || !physicalConfirmed) return;
    send({ operationId: crypto.randomUUID(), encounterId: selected.id, version: selected.version,
      items, paymentMethod, paymentConfirmed: true, physicalConfirmed: true, expectedTotal: total });
  };
  const reload = async () => {
    if (busy || retryRequest) return;
    if (await load()) {
      setSelected(null); setQuantities({}); setConflicted(false); setError('');
      setPaymentConfirmed(false); setPhysicalConfirmed(false);
    }
  };
  const print = () => {
    const win = window.open('', '_blank', 'width=480,height=640');
    if (!win) { setError('Allow pop-ups to print the receipt. The completed issue is unchanged.'); return; }
    // Text-only DOM construction avoids injecting reference or medicine names as HTML.
    const heading = win.document.createElement('h2'); heading.textContent = 'Dynapharm · Off-system issue receipt';
    const content = win.document.createElement('pre');
    content.style.whiteSpace = 'pre-wrap';
    content.textContent = [`Reference: ${receipt.reference}`, `Payment: ${receipt.paymentMethod}`,
      ...(receipt.items || []).map(item => `${item.name} — ${item.quantity} ${item.unit || ''}`),
      `Total received: ${money(receipt.total)}`].join('\n');
    win.document.title = 'Issue receipt'; win.document.body.append(heading, content); win.print();
  };
  const filtered = forms.filter(form => [form.client_name, form.client_id, form.data?.originalFormReference, form.id]
    .some(value => String(value || '').toLowerCase().includes(query.trim().toLowerCase())));
  const summary = selected ? totals(selected) : null;

  return <section className="off-system-pending" aria-label="Off-system pending references">
    <div className="op-heading"><div><p className="op-kicker">Assigned branch · existing source forms</p>
      <h3>Off-system pending medicines</h3></div>
      <button className="op-button secondary" onClick={reload} disabled={loading || busy || !!retryRequest || !branch}>Reload references</button></div>
    <p className="op-muted">Historical issues are reference only. A new issue below records payment and deducts branch stock through the server. Original prescription orders remain separate.</p>
    {!canIssue && <p className="op-muted">Read-only references. Live issue is available only to authorized branch staff.</p>}
    {!branch && <div className="op-empty">Select an assigned branch to view its forms.</div>}
    {error && <div className="op-notice error" role="alert">{error}</div>}
    {retryRequest && <div className="op-notice" role="alert">An issue request is awaiting confirmation. Its quantities and payment method are locked.
      <p>Encounter: {retryRequest.encounterId} · {money(retryRequest.expectedTotal)} · {retryRequest.paymentMethod}</p>
      <button className="op-button" disabled={busy || !canIssue} onClick={() => send(retryRequest)}>Retry exact request</button></div>}
    {receipt && <div className="op-notice" role="status"><strong>Issue completed · {receipt.reference}</strong>
      <p>Received {money(receipt.total)} · {receipt.paymentMethod}</p>
      {(receipt.items || []).map((item, index) => <p key={index}>{item.name} · {item.quantity} {item.unit || ''}</p>)}
      <button className="op-button secondary" onClick={print}>Print receipt</button></div>}
    {loading ? <div aria-label="Loading off-system references" aria-busy="true"><div className="op-skeleton" /><div className="op-skeleton" /></div>
      : loadError ? <div className="op-notice error" role="alert">{loadError}<button className="op-button secondary" disabled={busy || !!retryRequest} onClick={load}>Retry loading references</button></div>
        : branch && <>
          <label className="op-search">Search form reference or client<input value={query} onChange={event => setQuery(event.target.value)} type="search" /></label>
          {!filtered.length ? <div className="op-empty"><strong>{query ? 'No matching forms' : 'No off-system forms for this branch'}</strong><p>Original prescription orders are listed separately below.</p></div>
            : <div className="op-list"><div className="op-form-list">{filtered.map(form => {
              const amounts = totals(form);
              return <button key={form.id} className="op-form" aria-pressed={selected?.id === form.id} disabled={locked} onClick={() => choose(form)}>
                <strong>{form.data?.originalFormReference || form.id}</strong><span>{form.client_name || form.client_id}</span>
                <span className="op-muted">Historical issued {amounts.historical} · New issued {amounts.live} · Pending {amounts.pending}</span>
              </button>;
            })}</div>
              {!selected ? <div className="op-detail op-empty">Select a source form to review its medicine quantities.</div>
                : <div className="op-detail"><h3>{selected.data?.originalFormReference || selected.id}</h3>
                  <p>{selected.client_name || selected.client_id}</p>
                  <p className="op-muted">Recorded prescriber: {selected.data?.originalAuthor || 'Not recorded'} · {selected.source} · {selected.service_at ? new Date(selected.service_at).toLocaleString() : 'Date not recorded'}</p>
                  <p className="op-muted">{selected.pricingLabel || selected.customerType || 'Current server pricing'} · Version {selected.version}</p>
                  <div className="op-summary"><span>Historical issued <strong>{summary.historical}</strong></span><span>New issued <strong>{summary.live}</strong></span><span>Pending <strong>{summary.pending}</strong></span></div>
                  <div className="op-table-wrap"><table className="op-table"><thead><tr><th>Medicine / unit</th><th>Prescribed</th><th>Historical issued</th><th>New issued</th><th>Pending</th><th>Unit price</th><th>Issue now</th></tr></thead>
                    <tbody>{lines.map((line, index) => {
                      const blocked = !!line.issueError || count(line.outstanding) === 0 || line.unitPrice == null || !Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) < 0;
                      return <tr key={`${line.name}-${index}`}><td><strong>{line.name}</strong><p>{line.unit}</p>
                        {line.issueError && <p role="note" className="op-muted">{line.issueError}</p>}</td>
                        <td>{line.quantity}</td><td>{count(line.alreadyDispensed)}</td><td>{count(line.liveDispensed)}</td><td>{count(line.outstanding)}</td>
                        <td>{line.unitPrice == null ? 'Unavailable' : money(line.unitPrice)}</td>
                        <td>{canIssue ? <input aria-label={`Issue quantity for ${line.name}`} type="number" min="0" max={count(line.outstanding)} step="1"
                          disabled={locked || blocked} value={quantities[line.name] ?? 0}
                          onChange={event => { setQuantities(prev => ({ ...prev, [line.name]: event.target.value === '' ? '' : Math.min(count(line.outstanding), Math.max(0, Number(event.target.value))) })); setPaymentConfirmed(false); setPhysicalConfirmed(false); }} />
                          : 'Read-only'}</td></tr>;
                    })}</tbody></table></div>
                  <p className="op-muted">Enter whole quantities in the recorded unit only. No pack conversion. Unmatched catalogue medicines cannot be issued.</p>
                  {canIssue && <fieldset className="op-payment" disabled={locked}>
                    <label>Payment method<select value={paymentMethod} onChange={event => { setPaymentMethod(event.target.value); setPaymentConfirmed(false); }}>
                      <option value="cash">Cash</option><option value="card">Card</option><option value="eft">EFT</option></select></label>
                    <p className="op-total">Charge now: {money(total)}</p>
                    <label><input type="checkbox" checked={paymentConfirmed} onChange={event => setPaymentConfirmed(event.target.checked)} /> Payment received for the displayed total</label>
                    <label><input type="checkbox" checked={physicalConfirmed} onChange={event => setPhysicalConfirmed(event.target.checked)} /> Confirm physical issue of the selected quantities</label>
                    <div><button className="op-button" disabled={!valid || !paymentConfirmed || !physicalConfirmed} onClick={issue}>{busy ? 'Confirming issue…' : 'Record payment and issue'}</button></div>
                  </fieldset>}
                </div>}</div>}
        </>}
  </section>;
}

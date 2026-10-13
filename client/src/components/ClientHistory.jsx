import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ClipboardList, Plus, Save, Search } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import HistoryMedicineSelection from './HistoryMedicineSelection';
import './ClientHistory.css';

const SOURCES = ['outreach', 'paper', 'outage'];
const LABELS = { outreach: 'Outreach / field', paper: 'Paper form', outage: 'During an outage' };
const parse = value => {
  if (typeof value !== 'string') return value || {};
  try { return JSON.parse(value); } catch { return {}; }
};
const localDate = value => {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const isoDate = value => {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) throw new Error('Enter the actual service date and time.');
  if (date.getTime() > Date.now() + 60000) throw new Error('Actual service time cannot be in the future.');
  return date.toISOString();
};
const displayDate = value => value && Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleString('en-NA', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded';
const array = (data, key) => Array.isArray(data) ? data : data?.[key] || [];
const blankData = () => ({ location: '', originalAuthor: '', originalFormReference: '', notes: '', medicines: [], attachments: [] });
const clientName = client => client.full_name || client.fullName || 'Unnamed client';
const contactData = client => parse(client?.data);
const normal = value => String(value || '').toLowerCase().replace(/[\s()+-]/g, '');
const matches = (client, query) => [clientName(client), client.id, client.reference_number, client.referenceNumber,
  client.phone, client.email, client.id_number, contactData(client).idNumber, contactData(client).id_number,
  client.nb_number, client.nbNumber, contactData(client).nbNumber].some(value => normal(value).includes(normal(query)));
const historical = encounter => parse(encounter.data).offSystemHistorical === true;
const medicineCounts = encounter => encounter.quantities?.length ? encounter.quantities : (parse(encounter.data).medicines || []).map(line => {
  const alreadyDispensed = Number(line.alreadyDispensed || 0), liveDispensed = Number(line.liveDispensed || 0);
  const dispensed = Number(line.dispensed ?? alreadyDispensed + liveDispensed);
  return { ...line, alreadyDispensed, liveDispensed, dispensed,
    outstanding: line.outstanding ?? Math.max(0, Number(line.quantity) - dispensed) };
});
const medicinesLocked = encounter => !!encounter && medicineCounts(encounter).some(line => Number(line.liveDispensed || 0) > 0);
const attachmentUrl = (clientId, attachmentId) => `/api/client-history-attachment?clientId=${encodeURIComponent(clientId)}&attachmentId=${encodeURIComponent(attachmentId)}`;

function Button({ children, secondary = false, ...props }) {
  return <button type="button" className={`ch-button${secondary ? ' secondary' : ''}`} {...props}>{children}</button>;
}
function Field({ label, multiline = false, children, wide = false, ...props }) {
  return <label className={`ch-field${wide ? ' ch-wide' : ''}`}><span>{label}</span>
    {children || (multiline ? <textarea {...props} /> : <input {...props} />)}</label>;
}
function Notice({ children, error = false, success = false }) {
  return <div role={error ? 'alert' : 'status'} className={`ch-notice${error ? ' ch-error' : ''}${success ? ' ch-success' : ''}`}>{children}</div>;
}
function Skeleton() {
  return <div aria-label="Loading client records" aria-busy="true"><div className="ch-skeleton" /><div className="ch-skeleton" /></div>;
}
function Attachments({ items, clientId }) {
  return <div className="ch-attachments">{(items || []).map(item =>
    <a key={item.id} href={attachmentUrl(clientId, item.id)} target="_blank" rel="noreferrer">Download {item.name}</a>)}</div>;
}

/** Filing existing off-system forms only. Original portal ordering remains separate. */
export default function ClientHistory({ clientId, onBack, onClientUpdated }) {
  const { user } = useAuth();
  const canFile = ['frontdesk','admin'].includes(user?.role);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState(null);
  const [conflicted, setConflicted] = useState(false);
  const [storage, setStorage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const pending = useRef(null);
  const inFlight = useRef(false);
  const uploadInFlight = useRef(false);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const token = ++generation.current;
    setLoading(true); setLoadError('');
    try {
      const result = await api.get(`/client-history?clientId=${encodeURIComponent(clientId)}`);
      if (token === generation.current) setDetail(result);
      return result;
    } catch (err) {
      if (token === generation.current) setLoadError(err.message || 'Unable to load client history.');
      return null;
    } finally { if (token === generation.current) setLoading(false); }
  }, [clientId]);
  useEffect(() => {
    setDetail(null); setEditor(null); setError(''); setSuccess(''); setConflicted(false); pending.current = null;
    load();
    return () => { generation.current++; };
  }, [load]);
  useEffect(() => {
    let alive = true;
    setStorage(null);
    api.get(`/client-history-attachment?clientId=${encodeURIComponent(clientId)}&capabilities=true`)
      .then(result => { if (alive) setStorage(result.available === true); })
      .catch(() => { if (alive) setStorage(false); });
    return () => { alive = false; };
  }, [clientId]);

  const send = async body => {
    if (!canFile || inFlight.current || uploadInFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setSuccess('');
    // Preserve the exact operation after an uncertain outcome; never file twice on retry.
    if (!pending.current) pending.current = { ...body, operationId: crypto.randomUUID(), clientId };
    try {
      await api.post('/client-history', pending.current);
      pending.current = null; setEditor(null);
      setSuccess('Off-system historical form filed. No order, stock or accounting transaction was created.');
      await load();
    } catch (err) {
      const message = err.message || 'The request could not be confirmed.';
      const conflict = err.status === 409 || /reload|record changed|version|operation id already|immutable|medicine.*cannot.*chang|cannot.*amend.*medicine/i.test(message);
      const rejected = [400, 401, 403, 422].includes(err.status) || /required|invalid|access denied|permission|must be|cannot amend|read.only/i.test(message);
      if (conflict) { pending.current = null; setConflicted(true); }
      else if (rejected) pending.current = null;
      setError(`${message}${conflict ? ' Reload current records before making another change. Your entered form remains visible.'
        : rejected ? ' Correct the form or contact authorized staff.' : ' Retry sends the same operation, not a second entry.'}`);
    } finally { inFlight.current = false; setBusy(false); }
  };
  const reloadForConflict = async () => {
    if (pending.current) { setError('This request has an unconfirmed outcome. Retry the exact request before starting a different operation.'); return; }
    const result = await load();
    if (result) {
      if (editor?.encounter && conflicted) {
        setEditor(null); setError('Current record reloaded. Reopen it to review the latest version before re-entering your changes.');
      }
      setConflicted(false);
    }
  };
  const start = encounter => {
    if (!canFile || pending.current || conflicted || (encounter && !historical(encounter))) return;
    setError(''); setSuccess('');
    const data = encounter ? parse(encounter.data) : blankData();
    setEditor({ encounter: encounter || null, serviceAt: localDate(encounter?.service_at),
      source: encounter?.source || 'paper', data: { ...blankData(), ...data,
        medicines: (data.medicines || []).map(line => ({ ...line, alreadyDispensed: line.alreadyDispensed ?? 0 })),
        attachments: data.attachments || [] }, reason: '' });
  };
  const setData = (key, value) => setEditor(prev => ({ ...prev, data: { ...prev.data, [key]: value } }));
  const setLine = (index, changes) => setData('medicines', editor.data.medicines.map((line, i) => i === index ? { ...line, ...changes } : line));
  const toggleHistoricalMedicine = name => {
    if (!canFile || busy || uploading || pending.current || conflicted || medicinesLocked(editor?.encounter)) return;
    setEditor(prev => {
      if (!prev) return prev;
      const medicines = prev.data.medicines;
      const selected = medicines.some(line => (line.catalogueName || line.name) === name);
      return { ...prev, data: { ...prev.data, medicines: selected
        ? medicines.filter(line => (line.catalogueName || line.name) !== name)
        : [...medicines, { name, catalogueName: name, quantity: 1, directions: '', unit: 'unit', alreadyDispensed: 0 }] } };
    });
  };
  const save = () => {
    if (!canFile || !editor || pending.current || conflicted) return;
    try {
      if (!editor.data.originalAuthor.trim()) throw new Error('Recorded prescriber is required.');
      if (!editor.data.originalFormReference.trim()) throw new Error('Original form reference is required.');
      if (!editor.data.medicines.length) throw new Error('Transcribe at least one medicine from the original form.');
      const medicines = editor.data.medicines.map(line => {
        const quantity = Number(line.quantity), alreadyDispensed = Number(line.alreadyDispensed);
        if (!line.name.trim() || line.quantity === '' || !Number.isSafeInteger(quantity) || quantity <= 0)
          throw new Error('Each medicine needs a name and a positive whole prescribed quantity.');
        if (line.alreadyDispensed === '' || !Number.isSafeInteger(alreadyDispensed) || alreadyDispensed < 0 || alreadyDispensed > quantity)
          throw new Error('Already dispensed must be a nonnegative whole number no greater than prescribed quantity.');
        return { name: line.name.trim(), quantity, directions: line.directions || '', unit: line.unit || 'unit', alreadyDispensed };
      });
      if (editor.encounter && !editor.reason.trim()) throw new Error('An amendment reason is required.');
      send({ action: editor.encounter ? 'amend' : 'create', serviceAt: isoDate(editor.serviceAt), source: editor.source,
        data: { location: editor.data.location, originalAuthor: editor.data.originalAuthor.trim(),
          originalFormReference: editor.data.originalFormReference.trim(), notes: editor.data.notes,
          medicines, attachments: editor.data.attachments.map(({ id, name }) => ({ id, name })), offSystemHistorical: true },
        ...(editor.encounter ? { encounterId: editor.encounter.id, version: editor.encounter.version, reason: editor.reason.trim() } : {}) });
    } catch (err) { setError(err.message); }
  };
  const upload = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !canFile || !storage || !editor || pending.current || uploadInFlight.current) return;
    const token = generation.current;
    uploadInFlight.current = true; setUploading(true); setError('');
    try {
      const form = new FormData(); form.append('file', file);
      const response = await fetch(`/api/client-history-attachment?clientId=${encodeURIComponent(clientId)}`, {
        method: 'POST', credentials: 'include', body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.message || 'Upload failed. Retry or transcribe the form manually.');
      const item = result.attachment || result;
      if (!item.id || !item.name) throw new Error('Upload did not return an attachment reference. Retry or transcribe manually.');
      if (token === generation.current) setEditor(prev => prev ? { ...prev, data: { ...prev.data,
        attachments: [...prev.data.attachments, { id: item.id, name: item.name }] } } : prev);
    } catch (err) { if (token === generation.current) setError(err.message); }
    finally { uploadInFlight.current = false; setUploading(false); }
  };

  return <div className="client-history">
    {onBack && <Button secondary onClick={onBack} disabled={busy || uploading || !!pending.current}><ArrowLeft size={15} /> Back to clients</Button>}
    {loading ? <Skeleton /> : loadError ? <Notice error>{loadError} <Button secondary onClick={load}>Retry loading</Button></Notice> : detail && <>
      <section className="ch-panel ch-header">
        <div className="ch-row"><div><p className="ch-kicker">Persistent client profile</p><h2>{clientName(detail.client)}</h2>
          <p className="ch-muted">{detail.client.phone || 'No phone recorded'} · {detail.client.branch || 'No branch recorded'}</p>
          <p className="ch-caption">Client ID: {detail.client.id} · {detail.client.email || 'Email not provided'}</p></div>
          <div className="ch-actions"><Button secondary onClick={reloadForConflict} disabled={busy || uploading}>Reload history</Button>
            {canFile && <Button onClick={() => start()} disabled={busy || uploading || !!pending.current || conflicted}><Plus size={15} /> File off-system form</Button>}</div></div>
        <Notice>Record an existing off-system prescription form, not a new prescription order. Filing does not create orders, payments, BV / profit, stock reservations or deductions. Recorded prescriber details are source evidence, not electronic approval.</Notice>
        {!canFile && <p className="ch-caption">Read-only history. Only Front Desk can file or amend off-system forms.</p>}
        <dl className="ch-details">
          <div><dt>National ID / passport</dt><dd>{detail.client.id_number || contactData(detail.client).idNumber || contactData(detail.client).id_number || 'Not provided'}</dd></div>
          <div><dt>Birth date / gender</dt><dd>{String(detail.client.date_of_birth || '').slice(0, 10) || 'Not provided'} · {detail.client.gender || 'Not provided'}</dd></div>
          <div><dt>Address</dt><dd>{detail.client.address || 'Not provided'}</dd></div>
          <div><dt>NB / DZ membership reference</dt><dd>{detail.client.nbNumber || contactData(detail.client).nbNumber || 'Not provided · nonmember profile'}</dd></div>
        </dl>
        {onClientUpdated && <p className="ch-caption">Contact changes are managed in the client directory.</p>}
      </section>
      {success && <Notice success>{success}</Notice>}
      {error && <Notice error>{error}{pending.current && <div className="ch-actions"><Button onClick={() => send(pending.current)} disabled={busy}>Retry exact request</Button></div>}</Notice>}
      {editor && canFile && <section className="ch-panel ch-editor">
        <div className="ch-row"><div><p className="ch-kicker">Manual transcription · existing source form</p>
          <h3>{editor.encounter ? 'Amend off-system form' : 'File off-system prescription form'}</h3></div>
          <Button secondary onClick={() => setEditor(null)} disabled={busy || uploading || !!pending.current}>Close editor</Button></div>
        <fieldset disabled={busy || uploading || !!pending.current || conflicted}>
          <div className="ch-grid">
            <Field label="Actual service date and time (your local timezone)" type="datetime-local" required value={editor.serviceAt}
              onChange={event => setEditor(prev => ({ ...prev, serviceAt: event.target.value }))} />
            <Field label="Source"><select value={editor.source} onChange={event => setEditor(prev => ({ ...prev, source: event.target.value }))}>
              {SOURCES.map(source => <option key={source} value={source}>{LABELS[source]}</option>)}</select></Field>
            <Field label="Recorded prescriber (required)" required value={editor.data.originalAuthor} onChange={event => setData('originalAuthor', event.target.value)} />
            <Field label="Original form reference (required)" required value={editor.data.originalFormReference} onChange={event => setData('originalFormReference', event.target.value)} />
            <p className="ch-caption ch-wide">Enter the prescriber as written on the source form. No active staff account or new approval is required. Capture actor and timestamp are recorded by the server.</p>
            <Field label="Location / outreach site (optional)" value={editor.data.location} onChange={event => setData('location', event.target.value)} />
            <Field label="Source notes (optional)" multiline wide value={editor.data.notes} onChange={event => setData('notes', event.target.value)} />
          </div>
          <fieldset className="ch-section" style={{ border: 0, padding: 0, minWidth: 0 }} disabled={medicinesLocked(editor.encounter)}><div className="ch-row"><h4>Medicines as recorded on the original form</h4>
            <Button secondary onClick={() => setData('medicines', [...editor.data.medicines, { name: '', quantity: 1, directions: '', unit: 'unit', alreadyDispensed: 0 }])}><Plus size={14} /> Add medicine</Button></div>
            <p className="ch-caption">{medicinesLocked(editor.encounter)
              ? 'Medicines are locked after a live issue. Amend source details only; quantities and historical issued amounts cannot be changed.'
              : 'Manual names are accepted. Already dispensed is historical evidence only; recording it does not change stock or take payment.'}</p>
             <HistoryMedicineSelection medicines={editor.data.medicines} onToggle={toggleHistoricalMedicine}
                disabled={busy || uploading || !!pending.current || conflicted || medicinesLocked(editor.encounter)} />
            {editor.data.medicines.map((line, index) => <div className="ch-line" key={index}>
              <div className="ch-row"><strong>Medicine {index + 1}</strong><Button secondary onClick={() => setData('medicines', editor.data.medicines.filter((_, i) => i !== index))}>Remove medicine {index + 1}</Button></div>
              <div className="ch-grid">
                <Field label={`Medicine ${index + 1} name`} value={line.name} onChange={event => setLine(index, { name: event.target.value })} />
                <Field label={`Medicine ${index + 1} unit`} value={line.unit} onChange={event => setLine(index, { unit: event.target.value })} />
                <Field label={`Medicine ${index + 1} prescribed quantity`} type="number" min="1" step="1" value={line.quantity} onChange={event => setLine(index, { quantity: event.target.value })} />
                <Field label={`Medicine ${index + 1} already dispensed`} type="number" min="0" max={line.quantity} step="1" value={line.alreadyDispensed} onChange={event => setLine(index, { alreadyDispensed: event.target.value })} />
                <label className="ch-caption ch-wide"><input type="checkbox" aria-label={`Medicine ${index + 1} all historically dispensed`}
                  checked={Number(line.quantity) > 0 && Number(line.alreadyDispensed) === Number(line.quantity)}
                  onChange={event => setLine(index, { alreadyDispensed: event.target.checked ? line.quantity : 0 })} /> All prescribed units were historically dispensed (record only; no stock change)</label>
                <Field label={`Medicine ${index + 1} directions`} wide value={line.directions} onChange={event => setLine(index, { directions: event.target.value })} />
              </div></div>)}
            {!editor.data.medicines.length && <div className="ch-empty"><h4>Transcribe the medicine lines</h4><p>Add each prescribed medicine and the amount already dispensed on the source form.</p></div>}
          </fieldset>
          <div className="ch-section"><h4>Original form attachment (optional)</h4>
            {storage === null ? <p className="ch-caption">Checking secure storage. You can continue with manual transcription.</p>
              : storage ? <Field label={uploading ? 'Uploading original form…' : 'Upload original form'} type="file" onChange={upload} />
                : <Notice>Secure attachment storage is unavailable. Use manual transcription: record the prescriber, original form reference, medicines and already-dispensed amounts above. Keep the original form under your existing records procedure.</Notice>}
            <Attachments items={editor.data.attachments} clientId={clientId} />
            {editor.data.attachments.map(item => <div className="ch-row ch-line" key={item.id}><span>{item.name}</span>
              <Button secondary onClick={() => setData('attachments', editor.data.attachments.filter(value => value.id !== item.id))}>Remove attachment {item.name}</Button></div>)}
          </div>
          {editor.encounter && <Field label="Amendment reason (required)" multiline required wide value={editor.reason} onChange={event => setEditor(prev => ({ ...prev, reason: event.target.value }))} />}
          <div className="ch-actions ch-section"><Button onClick={save}><Save size={15} />{editor.encounter ? 'Save audited amendment' : 'File historical form'}</Button></div>
        </fieldset>
      </section>}
      <section className="ch-panel"><div className="ch-row"><h3><ClipboardList size={17} style={{ display: 'inline', marginRight: 8 }} />Off-system history and earlier evidence</h3>
        <span className="ch-caption">Oldest first · {(detail.encounters || []).length} records</span></div>
        {!detail.encounters?.length ? <div className="ch-empty"><h4>No historical forms recorded yet</h4><p className="ch-muted">File an existing outreach, paper or outage form. A booking is not required.</p></div>
          : <div className="ch-timeline">{[...detail.encounters].sort((a, b) => Date.parse(a.service_at) - Date.parse(b.service_at)).map(encounter => {
            const data = parse(encounter.data), isHistorical = historical(encounter);
            const quantities = medicineCounts(encounter);
            const totalPending = quantities.reduce((sum, line) => sum + Number(line.outstanding ?? Math.max(0,
              Number(line.quantity) - Number(line.dispensed ?? Number(line.alreadyDispensed || 0) + Number(line.liveDispensed || 0)))), 0);
            return <article key={encounter.id} className="ch-encounter">
              <div className="ch-row"><div><p className="ch-kicker">{LABELS[encounter.source] || encounter.source}</p><h4>{displayDate(encounter.service_at)}</h4></div>
                <span className={`ch-badge${isHistorical ? '' : ' earlier'}`}>{isHistorical ? 'Filed off-system history' : 'Earlier evidence · read-only'}</span></div>
              <p className="ch-caption">Captured {displayDate(encounter.captured_at)} by {encounter.captured_by} · Branch {encounter.branch} · Version {encounter.version}</p>
              <dl className="ch-details">{[['Location / event', [data.location, data.event].filter(Boolean).join(' · ')],
                ['Recorded prescriber', data.originalAuthor || encounter.responsible_consultant], ['Original form reference', data.originalFormReference],
                ['Source notes', data.notes], ...(!isHistorical ? [['Earlier findings', data.results], ['Earlier follow-up', data.followUp],
                  ['Original prescription date', data.originalPrescriptionDate ? displayDate(data.originalPrescriptionDate) : '']] : [])].map(([label, value]) =>
                <div key={label}><dt>{label}</dt><dd>{value || 'Not recorded'}</dd></div>)}</dl>
              <h4>Prescribed, historical and newly issued quantities</h4>
              <p className="ch-caption">Total pending: {totalPending} recorded units. Historical capture does not change stock. New issues are recorded by authorized branch staff, not from this history screen.</p>
              {quantities.length ? <div className="ch-table-wrap"><table className="ch-table"><thead><tr><th>Medicine / directions</th><th>Prescribed</th><th>Historical issued</th><th>New issued</th><th>Total issued</th><th>Pending</th></tr></thead>
                <tbody>{quantities.map((line, index) => <tr key={index}><td><strong>{line.name}</strong><p>{line.directions}</p><p>{line.notes}</p></td>
                  <td>{line.quantity} {line.unit}</td><td>{line.alreadyDispensed ?? 0}</td><td>{line.liveDispensed ?? 0}</td>
                  <td>{line.dispensed ?? Number(line.alreadyDispensed || 0) + Number(line.liveDispensed || 0)}</td>
                  <td><strong>{line.outstanding ?? Math.max(0, Number(line.quantity) - Number(line.dispensed ?? Number(line.alreadyDispensed || 0) + Number(line.liveDispensed || 0)))}</strong></td></tr>)}</tbody></table></div>
                : <p className="ch-caption">No medicine lines recorded.</p>}
              <Attachments items={data.attachments} clientId={clientId} />
              {!!encounter.evidence?.length && <div className="ch-section"><h4>Retained earlier dispensing evidence · read-only</h4>{encounter.evidence.map(evidence => {
                const evidenceData = parse(evidence.data);
                return <div className="ch-line" key={evidence.id}><p>{displayDate(evidence.service_at)} · Dispenser: {evidenceData.dispenser || 'Unknown'}</p>
                  <p className="ch-caption">Original mode: {evidence.mode} · Source: {evidenceData.source || 'Not recorded'} · Reference: {evidence.source_reference || 'Not recorded'}</p>
                  <p className="ch-caption">Captured {displayDate(evidence.captured_at)} by {evidence.captured_by}</p>
                  {(evidence.items || []).map((item, index) => <p key={index}>{item.name} · {item.quantity} {item.unit || 'unit'} · Batch {item.batch || 'unknown'}</p>)}
                  <p className="ch-caption">{evidenceData.reconciliation}</p></div>;
              })}</div>}
              {canFile && isHistorical && <div className="ch-actions ch-section"><Button secondary onClick={() => start(encounter)}
                disabled={busy || uploading || !!pending.current || conflicted}>Amend with reason</Button></div>}
              <details className="ch-audit"><summary>Audit trail · {encounter.history?.length || 0} events</summary>
                {(encounter.history || []).map(event => <div key={event.id} className="ch-line"><strong>{event.action}</strong><p>{displayDate(event.created_at)} · Actor {event.actor}</p>
                  {event.reason && <p>Reason: {event.reason}</p>}
                  <details><summary>Recorded original / snapshot</summary><pre className="ch-preserved">{JSON.stringify(parse(event.snapshot), null, 2)}</pre></details></div>)}</details>
            </article>;
          })}</div>}
      </section>
      <section className="ch-panel"><h3>Related appointments and legacy reports</h3><p className="ch-caption">Existing records only. Filing never fabricates an appointment or prescription order.</p>
        <div className="ch-grid"><div><h4>Appointments</h4>{detail.appointments?.length ? detail.appointments.map(item => <div className="ch-line" key={item.id}>
          <p>{String(item.date || '').slice(0, 10)} {item.time} · {item.status}</p><p className="ch-caption">{item.branch} · ID {item.id}</p></div>) : <p className="ch-muted">No linked appointments.</p>}</div>
          <div><h4>Unlinked legacy reports</h4>{detail.reports?.length ? detail.reports.map(item => <div className="ch-line" key={item.id}><p>{item.report_type} · {displayDate(item.created_at)}</p>
            <p className="ch-caption">Consultant {item.consultant} · Report ID {item.id}</p>
            <details><summary>Original report evidence</summary><pre className="ch-preserved">{JSON.stringify(parse(item.data), null, 2)}</pre></details>
          </div>) : <p className="ch-muted">No unlinked legacy reports.</p>}</div></div>
      </section>
    </>}
  </div>;
}

/** Embed inside existing Client Reg / Client Lookup / Clients sections; no added navigation. */
export function ClientHistoryDirectory({ allowRegistration = true, initialRegistration = false, consultants, metadataEndpoint }) {
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(initialRegistration ? {} : null);
  const [busy, setBusy] = useState(false);
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const creationId = useRef(null);
  const contactInFlight = useRef(false);
  const reload = useCallback(async () => {
    setLoading(true); setError('');
    try { setClients(array(await api.clients.list(), 'clients')); }
    catch (err) { setError(err.message || 'Client directory could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);
  const duplicates = form ? clients.filter(client => client.id !== form.id && (
    form.phone && normal(client.phone) === normal(form.phone) ||
    form.email && normal(client.email) === normal(form.email) ||
    form.idNumber && normal(contactData(client).idNumber || contactData(client).id_number || client.id_number) === normal(form.idNumber) ||
    form.full_name && normal(clientName(client)) === normal(form.full_name)
  )) : [];
  const update = (key, value) => { setForm(prev => ({ ...prev, [key]: value })); setDuplicateConfirmed(false); };
  const saveClient = async event => {
    event.preventDefault();
    if (contactInFlight.current) return;
    if (duplicates.length && !duplicateConfirmed) { setError('Review the possible duplicates and explicitly confirm a separate profile. No records will be merged.'); return; }
    contactInFlight.current = true; setBusy(true); setError('');
    try {
      if (!user?.branch && !form.id) throw new Error('A session branch is required to register a client. Contact an administrator.');
      if (form.idNumber && !/^[a-z0-9]{6,20}$/i.test(form.idNumber.replace(/\s/g, ''))) throw new Error('ID number must be 6–20 alphanumeric characters.');
      if (!creationId.current) creationId.current = crypto.randomUUID();
      const payload = { full_name: form.full_name.trim(), phone: form.phone || '', email: form.email || '',
        address: form.address || '', date_of_birth: form.date_of_birth || null, gender: form.gender || null,
        branch: form.branch || user.branch, data: { ...parse(form.data), idNumber: form.idNumber || '', nbNumber: form.nbNumber || '' },
        nbNumber: form.nbNumber || '' };
      const response = form.id ? await api.clients.update(form.id, payload) : await api.clients.create({ ...payload, id: creationId.current });
      const client = response.client || response;
      creationId.current = null; setForm(null); setDuplicateConfirmed(false);
      if (client.id) setSelected(client.id);
      await reload();
    } catch (err) { setError(err.message || 'Client could not be saved.'); }
    finally { contactInFlight.current = false; setBusy(false); }
  };
  if (selected && !form) return <ClientHistory clientId={selected} consultants={consultants} metadataEndpoint={metadataEndpoint} onBack={() => setSelected(null)} />;
  return <div className="client-history">
    <section className="ch-panel ch-header"><div className="ch-row"><div><p className="ch-kicker">Dynapharm Namibia · client records</p><h2>Client directory</h2>
      <p className="ch-muted">Find an existing profile before registering. One client, one persistent history.</p></div>
      {allowRegistration && <Button disabled={busy || loading || !!error && !clients.length} onClick={() => { setForm({}); creationId.current = null; setDuplicateConfirmed(false); setError(''); }}><Plus size={15} /> Register client</Button>}</div>
    </section>
    {error && <Notice error>{error}<Button secondary disabled={busy} onClick={reload}>Reload directory</Button></Notice>}
    {form && <section className="ch-panel"><div className="ch-row"><h3>{form.id ? 'Edit client contact details' : 'Register a client'}</h3>
      <Button secondary disabled={busy} onClick={() => { setForm(null); creationId.current = null; }}>Cancel</Button></div>
      <form onSubmit={saveClient}><fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}><div className="ch-grid">
        <Field label="Full name" required value={form.full_name || ''} onChange={event => update('full_name', event.target.value)} />
        <Field label="Phone number" type="tel" required value={form.phone || ''} onChange={event => update('phone', event.target.value)} />
        <Field label="Email (optional)" type="email" value={form.email || ''} onChange={event => update('email', event.target.value)} />
        <Field label="National ID / passport (optional)" value={form.idNumber || ''} onChange={event => update('idNumber', event.target.value)} />
        <Field label="Date of birth (optional)" type="date" value={(form.date_of_birth || '').slice(0, 10)} onChange={event => update('date_of_birth', event.target.value)} />
        <Field label="Gender (optional)"><select value={form.gender || ''} onChange={event => update('gender', event.target.value)}><option value="">Not provided</option><option value="Female">Female</option><option value="Male">Male</option><option value="Other">Other</option></select></Field>
        <Field label="Address (optional)" wide value={form.address || ''} onChange={event => update('address', event.target.value)} />
        <Field label="NB / DZ membership reference (optional)" wide value={form.nbNumber || ''} onChange={event => update('nbNumber', event.target.value)} />
      </div>
      <p className="ch-caption ch-section">Membership and email are not required. A membership reference is stored as supplied, not automatically verified or linked to another person.</p>
      {!!duplicates.length && <Notice><strong>Possible existing profiles — no automatic merge</strong>
        {duplicates.map(client => <div className="ch-contact ch-row" key={client.id}><div><strong>{clientName(client)}</strong><p>{client.phone} · {client.id}</p></div>
          <Button secondary onClick={() => { setForm(null); setSelected(client.id); }}>Open existing profile</Button></div>)}
        <label><input type="checkbox" checked={duplicateConfirmed} onChange={event => setDuplicateConfirmed(event.target.checked)} /> I reviewed these suggestions; this is a separate client.</label>
      </Notice>}
      <div className="ch-actions ch-section"><Button type="submit" disabled={loading || !!duplicates.length && !duplicateConfirmed}>{busy ? 'Saving client…' : form.id ? 'Save contact details' : 'Register and open profile'}</Button></div>
      </fieldset></form></section>}
    <section className="ch-panel"><div className="ch-row"><Field label="Search name, phone, email, client ID, national ID or membership reference" className="ch-search" wide
      value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a client…" /><Search size={18} /></div>
      {loading ? <Skeleton /> : <div className="ch-directory">{clients.filter(client => !query || matches(client, query)).slice(0, 100).map(client =>
        <div className="ch-contact ch-row" key={client.id}><div><strong>{clientName(client)}</strong><p className="ch-muted">{client.phone || 'No phone'} · {client.branch || 'No branch'}</p>
          <p className="ch-caption">{client.reference_number || client.id} · {client.email || 'No email'}</p></div><div className="ch-actions">
          <Button secondary onClick={() => { setForm(null); setSelected(client.id); }}>Open history</Button>
          <Button secondary onClick={() => { setForm({ ...client, idNumber: contactData(client).idNumber || contactData(client).id_number || client.id_number || '',
            nbNumber: client.nbNumber || contactData(client).nbNumber || '' }); setDuplicateConfirmed(false); setError(''); }}>Edit contact</Button></div></div>)}
        {!clients.some(client => !query || matches(client, query)) && <div className="ch-empty"><h4>{query ? 'No matching client' : 'No clients found'}</h4><p>Check another contact or ID before creating a profile.</p></div>}
        <p className="ch-caption">Showing up to 100 matches. Narrow your search for a specific client.</p></div>}
    </section>
  </div>;
}

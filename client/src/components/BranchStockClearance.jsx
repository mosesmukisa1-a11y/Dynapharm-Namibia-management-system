import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Alert, Button } from './ui';

const CONFIRMATION = 'WRITE OFF BRANCH STOCK';
export default function BranchStockClearance() {
  const [options, setOptions] = useState(null);
  const [branch, setBranch] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [backup, setBackup] = useState(false);
  const [missingCost, setMissingCost] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const load = async () => {
    try { setOptions(await api.get('/stock/branch-clearance')); }
    catch (error) { setMessage({ type:'error', text:error.message }); }
  };
  useEffect(() => { load(); }, []);
  const reset = () => { setPreview(null); setBackup(false); setMissingCost(false); setConfirmation(''); };
  const getPreview = async () => {
    if (branch==='__saved_scope__' && !preview?.branch_ids?.length) {
      setMessage({type:'error',text:'Reopen the saved clearance or choose a branch to recover the exact scope.'});return;
    }
    const ids = branch === '__saved_scope__' ? preview?.branch_ids : branch ? [branch] : [];
    setBusy(true); setMessage(null); reset();
    try {
      setPreview(await api.post('/stock/branch-clearance', { action:'preview', branch_ids:ids }));
      setMessage({ type:'info', text:'Preview saved. No stock has been deducted. Review every blocker and the exemptions before confirming.' });
    } catch (error) { setMessage({ type:'error', text:error.message }); }
    finally { setBusy(false); }
  };
  const execute = async () => {
    if (!preview || busy) return;
    setBusy(true); setMessage(null);
    try {
      const result = await api.post('/stock/branch-clearance', { action:'execute', id:preview.id,
        confirmation, backup_verified:backup, accept_missing_cost:missingCost });
      setPreview(result);
      setMessage({ type:'success', text:result.unchanged
        ? 'This clearance was already completed. No additional stock was deducted.'
        : `Clearance completed: ${result.total_units} units written off. Protected products and warehouse stock were not changed. Physical disposal is still separate.` });
      await load();
    } catch (error) {
      setMessage({ type:'error', text:`${error.message} On an uncertain response, retry this same preview ID; do not create a replacement until its status is checked.` });
    } finally { setBusy(false); }
  };
  const openSaved = async id => {
    setBusy(true); setMessage(null); reset();
    try {
      const result=await api.get(`/stock/branch-clearance?id=${encodeURIComponent(id)}`);
      setPreview(result);
      setBranch(result.all_branches ? '' : result.branch_ids.length===1 ? result.branch_ids[0] : '__saved_scope__');
    }
    catch (error) { setMessage({ type:'error',text:error.message }); }
    finally { setBusy(false); }
  };
  const blocked = preview && (preview.blocked_rows > 0 || preview.reserved_transfers?.length > 0);
  const canExecute = preview?.status === 'draft' && !blocked && preview.rows.length > 0 &&
    backup && confirmation === CONFIRMATION && (!preview.missing_cost_units || missingCost) && !busy;
  return (
    <section className="rounded-xl border border-red-200 bg-white p-4 space-y-3" aria-label="GM branch stock clearance">
      <h3 className="font-bold text-lg text-red-800">GM Branch Stock Clearance</h3>
      <p className="text-sm text-gray-700">Write off non-exempt branch stock while retaining historical records. Always preserves all D.I GROW types, HERBA WARISAN MAHARANI and DYNA SERENOA. Warehouse and transit stock are outside this action.</p>
      <p className="text-sm font-semibold text-red-800">Preview does not deduct stock. Execution is irreversible without a separate reviewed correction; it does not confirm physical disposal.</p>
      {message && <Alert type={message.type}>{message.text}</Alert>}
      <div className="flex gap-3 items-end flex-wrap">
        <label className="text-sm font-semibold">Branch scope
          <select aria-label="Clearance branch scope" className="block border rounded p-2 mt-1" disabled={busy || !options}
            value={branch} onChange={event => { setBranch(event.target.value); reset(); setMessage(null); }}>
            <option value="">All registered branches</option>
            {branch==='__saved_scope__' && <option value="__saved_scope__">Saved exact branch selection</option>}
            {options?.branches.map(b => <option key={b.id} value={b.id}>{b.name} [{b.id}]</option>)}
          </select>
        </label>
        <Button disabled={busy || !options} onClick={getPreview}>{busy ? 'Working…' : 'Preview branch clearance'}</Button>
        {!options && <Button disabled={busy} onClick={load}>Retry clearance setup</Button>}
      </div>
      {preview && <>
        <p className="text-sm"><strong>Preview ID:</strong> <span className="font-mono break-all">{preview.id}</span> — {preview.status}</p>
        <p className="text-sm"><strong>Saved execution scope:</strong> {(preview.branch_ids || []).join(', ')}</p>
        <p className="text-sm"><strong>Reason:</strong> {preview.reason}</p>
        <div className="flex gap-5 flex-wrap text-sm">
          <span><strong>{preview.rows.length}</strong> candidate batches / <strong>{preview.total_units}</strong> units</span>
          <span><strong>{preview.protected_units}</strong> protected units</span>
          <span><strong>{preview.missing_cost_units}</strong> units without complete original cost evidence</span>
        </div>
        {blocked && <Alert type="error">Execution blocked. Resolve inconsistent rows, pending write-offs, approved reservations or open stock operations, then create a fresh preview. Reserved transfers: {preview.reserved_transfers?.join(', ') || 'none'}.</Alert>}
        <details open={!!blocked}>
          <summary className="cursor-pointer font-semibold text-sm">Review candidate batches and blockers</summary>
          <div className="overflow-auto max-h-96 mt-2">
            <table className="w-full text-xs text-left"><thead><tr className="bg-red-50">
              {['Branch / batch ID','Product / lot','Units','Original cost evidence','Review'].map(h => <th key={h} className="p-2">{h}</th>)}
            </tr></thead><tbody>{preview.rows.map(r => <tr key={`${r.type}:${r.id}`} className="border-b">
              <td className="p-2">{r.branch_id}<br />{r.type}: {r.id}</td>
              <td className="p-2">{r.product_name}<br />{r.batch_no || 'No lot recorded'} / {r.expiry_date || 'No expiry recorded'}</td>
              <td className="p-2">{r.quantity} {r.stock_unit}</td>
              <td className="p-2">Known cost: N${r.cost.known_cost}<br />Missing: {r.cost.missing_qty} units; no catalogue estimate</td>
              <td className="p-2">{r.flags.join('; ') || 'No detected blocker; GM physical review required'}</td>
            </tr>)}</tbody></table>
          </div>
        </details>
        <details><summary className="cursor-pointer font-semibold text-sm">Protected stock — will not be written off</summary>
          <ul className="text-sm max-h-60 overflow-auto">{preview.protected_rows.map(r =>
            <li key={`${r.type}:${r.id}`}>{r.branch_id}: {r.product_name}, {r.quantity} units [{r.id}]</li>)}</ul>
        </details>
        {preview.status === 'draft' && <div className="space-y-2 border-t pt-3">
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={backup} disabled={busy}
            onChange={event => setBackup(event.target.checked)} />I have verified a recoverable backup and reviewed physical stock, holds and allocations. This is my attestation, not an automated backup check.</label>
          {!!preview.missing_cost_units && <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={missingCost} disabled={busy} onChange={event => setMissingCost(event.target.checked)} />
            I acknowledge missing original cost evidence. Only known original costs will be posted; the full financial expense remains incomplete.
          </label>}
          <label className="block text-sm font-semibold">Type {CONFIRMATION} to confirm
            <input aria-label="Clearance confirmation" className="block border rounded p-2 mt-1 w-full max-w-md" value={confirmation}
              disabled={busy} onChange={event => setConfirmation(event.target.value)} autoComplete="off" />
          </label>
          <p className="text-xs text-gray-600">Inventory and transfer writes briefly pause during the atomic commit. If any relevant stock changes after preview, execution is rejected with no deductions.</p>
          <Button variant="danger" disabled={!canExecute} onClick={execute}>Confirm GM branch clearance</Button>
        </div>}
      </>}
      {!!options?.history.length && <details><summary className="text-sm font-semibold cursor-pointer">Your recent clearance audit</summary>
        <ul className="text-xs">{options.history.map(h => <li key={h.id} className="my-2">
          {h.id} — {h.status} — {h.created_at}{' '}
          <button className="text-red-800 underline" disabled={busy} onClick={() => openSaved(h.id)}>Open saved clearance</button>
        </li>)}</ul>
      </details>}
    </section>
  );
}

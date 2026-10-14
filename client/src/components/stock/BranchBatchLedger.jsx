import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { BRANCH_DETAILS, formatCurrency } from '../../lib/constants';
import { branchBatchEvidence } from '../../lib/branchBatchEvidence';

export default function BranchBatchLedger({ branch }) {
  const [selected, select] = useState(branch && branch !== 'all' && !branch.includes('warehouse') ? branch : '');
  const [rows, setRows] = useState([]);
  const [movements, setMovements] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempt, retry] = useState(0);
  const [search, setSearch] = useState('');
  useEffect(() => { select(branch && branch !== 'all' && !branch.includes('warehouse') && branch !== 'country_stock' ? branch : ''); }, [branch]);
  useEffect(() => {
    let cancelled = false; setError(''); setRows([]); setMovements([]);
    if (!selected) return;
    setLoading(true);
    const params = new URLSearchParams({branch:selected,limit:'1000'}).toString();
    Promise.all([api.stock.branchInventory(params), api.stock.movements(params)])
      .then(([inventory, ledger]) => { if (!cancelled) { setRows(inventory.inventory || []); setMovements(ledger.movements || []); } })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selected, attempt]);
  return <section className="sp-panel sp-panel-content">
    <h2 className="font-bold">Branch-held batches — read-only</h2>
    <p>Physical quantities and original received costs. Received/sold/write-off columns are matched recorded movement subtotals (up to 1,000 lines), not reconstructed historical openings.</p>
    <label className="sp-label">Branch for batch evidence
      <select className="sp-input" value={selected} onChange={event => select(event.target.value)}>
        <option value="">Select branch</option>{BRANCH_DETAILS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    <label className="sp-label">Search branch product or batch<input className="sp-input" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Product / QA batch" /></label>
    {error && <p role="alert">{error} <button onClick={() => retry(n => n + 1)}>Retry branch batches</button></p>}
    {loading && <p role="status">Loading branch batches…</p>}
    {!loading && !error && selected && <div style={{overflowX:'auto'}}><table className="w-full text-sm">
      <thead><tr>{['Branch','Product','Batch','Expiry','Received (recorded)','Sold (recorded)','Written off (recorded)','Returned (recorded)','Net recorded movements','Remaining physical','History gap / other movements','Condition','Original CIF/unit','Original received DP/unit','Original DP total','Cost evidence','FEFO review'].map(title => <th key={title} className="p-2 text-left">{title}</th>)}</tr></thead>
      <tbody>{rows.filter(row=>!search || [row.product_name,row.batch_no].some(value=>String(value || '').toLowerCase().includes(search.toLowerCase()))).map(row => {
        const evidence = branchBatchEvidence(row,movements);
        const qty = Number(row.quantity), approvedZero=row.metadata?.zeroCostApproved === true;
        const known=value=>value!=null && value!=='' && Number.isFinite(Number(value)) &&
          (Number(value)>0 || (Number(value)===0 && approvedZero));
        const missingDP = known(row.stock_value_dp) ? Number(row.missing_dpc_quantity ?? qty) : qty;
        const missingCIF = known(row.stock_value_cif) ? Number(row.missing_cif_quantity ?? qty) : qty;
        const unit = (value, missing) => qty > 0 && !missing ? formatCurrency(Number(value)/qty) : 'Missing / partial';
        const earlier = row.expiry_date && rows.some(other => other.product_name === row.product_name &&
          Number(other.quantity)>0 && other.expiry_date && other.expiry_date < row.expiry_date);
        const fields = [row.branch_id,row.product_name,row.batch_no,row.expiry_date || 'Missing expiry',
          evidence.matchedLines ? evidence.received : 'No evidence',evidence.matchedLines ? evidence.sold : 'No evidence',
          evidence.matchedLines ? evidence.writtenOff : 'No evidence',evidence.matchedLines ? evidence.returned : 'No evidence',
          evidence.matchedLines ? evidence.ledgerRemaining : 'No evidence',qty,
          evidence.difference ? `Unreconciled ${evidence.difference} units; do not repair automatically` : 'Matches recorded subset; completeness not certified',
          row.status,unit(row.stock_value_cif,missingCIF),unit(row.stock_value_dp,missingDP),
          missingDP>=qty && qty>0 ? 'Missing original DP evidence' : formatCurrency(row.stock_value_dp || 0),
          qty===0 ? 'No physical units' : missingDP || missingCIF ? `Incomplete: DP ${missingDP}, CIF ${missingCIF} units` : 'Original',
          earlier ? 'Earlier expiry exists — review available condition' : 'No earlier expiry in this response'];
        return <tr key={row.id}>{fields.map((field,index) => <td key={index} className="p-2 border-b">{field}</td>)}</tr>;
      })}</tbody>
    </table>{!rows.length && <p>No branch-held batches returned.</p>}</div>}
  </section>;
}

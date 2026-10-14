import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { BRANCH_DETAILS, formatCurrency } from '../../lib/constants';
import { namibiaDay } from '../../lib/saleEvidence';
import { cleanStockStatus } from '../../../../shared/stockStatus';

const value = amount => amount == null ? 'Missing evidence' : formatCurrency(amount);
export default function StockMovementLedger({ branch, period, onPeriodChange, trace = false, initialSearch }) {
  const [search, setSearch] = useState(() => initialSearch ?? new URLSearchParams(window.location.search).get('search') ?? '');
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, retry] = useState(0);
  const [filters, setFilters] = useState({from:'',to:'',product:'',batch:'',type:'',cost:'',location:branch || 'all'});
  useEffect(()=>setFilters(previous=>({...previous,location:branch || 'all'})),[branch]);
  const from=period?.from ?? filters.from, to=period?.to ?? filters.to;
  const change=(field,value)=>setFilters(previous=>({...previous,[field]:value}));
  const dateChange=(field,value)=>onPeriodChange ? onPeriodChange({...period,[field]:value}) : change(field,value);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    const params = new URLSearchParams({ limit: '500' });
    if (filters.location && filters.location !== 'all') {
      params.set(filters.location.includes('warehouse') || filters.location === 'country_stock' ? 'location' : 'branch', filters.location);
    }
    if (from) params.set('date_from', from);
    if (to) params.set('date_to', to);
    if (filters.product) params.set('product_name',filters.product);
    if (filters.batch) params.set('batch_no',filters.batch);
    if (filters.type) params.set('type',filters.type);
    if (search.trim()) params.set('search', search.trim());
    api.stock.movements(params.toString()).then(result => {
      if (!cancelled) setRows(result.movements || []);
    }).catch(err => { if (!cancelled) { setRows([]); setError(err.message); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters.location,from,to,filters.product,filters.batch,filters.type,search,attempt]);
  const visible=filters.cost ? rows.filter(row=>(row.cost_evidence_status || 'missing')===filters.cost) : rows;
  return <section className="sp-panel sp-panel-content" style={{ marginBottom: 20 }}>
    <h2 className="font-bold">{trace ? 'Trace Stock — recorded movement timeline' : 'Movement Ledger'}</h2>
    <p className="text-sm text-gray-600">Africa/Windhoek business dates. DP selling value, customer charges and original received DP/CIF are separate bases.
      {' '}Up to 500 recorded movements; not proof of complete historical coverage. No quantities are changed here.</p>
    <label className="sp-label">Search receipt, reference, movement, batch, product or branch
      <input className="sp-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Receipt / reference / batch" />
    </label>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <label>From date<input aria-label="Ledger from date" type="date" className="sp-input" value={from} onChange={e=>dateChange('from',e.target.value)} /></label>
      <label>To date<input aria-label="Ledger to date" type="date" className="sp-input" value={to} onChange={e=>dateChange('to',e.target.value)} /></label>
      <label>Branch/location<select aria-label="Ledger location" className="sp-input" value={filters.location} onChange={e=>change('location',e.target.value)}>
        <option value="all">All allowed locations</option>{BRANCH_DETAILS.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
        <option value="country_stock">Country Stock</option><option value="windhoek_warehouse">Windhoek Warehouse</option><option value="ondangwa_warehouse">Ondangwa Warehouse</option>
      </select></label>
      <label>Product<input aria-label="Ledger product" className="sp-input" value={filters.product} onChange={e=>change('product',e.target.value)} /></label>
      <label>Batch<input aria-label="Ledger batch" className="sp-input" value={filters.batch} onChange={e=>change('batch',e.target.value)} /></label>
      <label>Movement type<input aria-label="Ledger movement type" className="sp-input" placeholder="sale / received / write_off" value={filters.type} onChange={e=>change('type',e.target.value)} /></label>
      <label>Cost evidence<select aria-label="Ledger cost evidence" className="sp-input" value={filters.cost} onChange={e=>change('cost',e.target.value)}>
        <option value="">All returned evidence</option>{['original','partial','estimated','missing'].map(status=><option key={status}>{status}</option>)}
      </select></label>
    </div>
    {filters.cost && <p className="text-sm">Cost filter applies to this bounded result set; refine dates/product/batch to inspect older evidence.</p>}
    <button className="sp-btn" onClick={() => retry(n => n + 1)}>Refresh ledger</button>
    {error && <p role="alert">{error} <button onClick={() => retry(n => n + 1)}>Retry</button></p>}
    {loading ? <p role="status">Loading movement evidence…</p> : !error && <div style={{ overflowX: 'auto' }}>
      <table className="w-full text-sm"><thead><tr>
        {['Date/time','Business date','Movement ID','Type','Reference','Receipt','Source → destination','Product','Batch','Qty','DP/unit','DP value','CP/customer charged value','Branch profit (charged − DP)','Original received DP/unit','Original CIF/unit','Cost evidence','Actor','Status'].map(label => <th key={label} className="p-2 text-left">{label}</th>)}
      </tr></thead><tbody>{visible.map(row => <tr key={row.id}>
        {[`${namibiaDay(row.created_at)} ${new Date(row.created_at).toLocaleTimeString('en-GB',{timeZone:'Africa/Windhoek'})}`,row.business_date || `${namibiaDay(row.created_at)} (from timestamp)`,row.id,row.movement_type,row.reference_id,row.receipt_no,
          `${row.source_location || '—'} → ${row.destination_location || '—'}`,row.product_name,row.batch_no || '—',row.signed_quantity ?? row.quantity,
          value(row.dp_unit_price),value(row.dp_value),value(row.charged_value),value(row.branch_profit_value),
          value(row.original_received_dpc),value(row.original_received_cost),row.cost_evidence_status || 'missing',row.created_by || 'Not recorded',cleanStockStatus(row.status)]
          .map((cell,index) => <td key={index} className="p-2 border-b">{cell}</td>)}
      </tr>)}</tbody></table>
      {!visible.length && <p>No matching recorded movements.</p>}
    </div>}
  </section>;
}

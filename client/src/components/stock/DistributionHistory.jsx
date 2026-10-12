import { useEffect, useState } from 'react';
import { ClipboardList, Edit2, Eye, Printer, RefreshCw, Search } from 'lucide-react';
import { Overlay, Pagination, Skeleton, StatusBadge } from './DistributionPrimitives';
import { createdOf, creatorOf, dateLabel, destinationOf, linesOf, locationLabel, needsReview, noteOf, quantityOf, recordedEvents, referenceOf, sourceOf, statusDisplay, totalOf, productCountOf } from './distributionModel';
import useDistributionHistory from './useDistributionHistory';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function printHistory(transfers) {
  const win = window.open('', '_blank', 'width=1000,height=720');
  if (!win) return false;
  const rows = transfers.map(transfer => `<tr><td>${escapeHtml(referenceOf(transfer))}</td><td>${escapeHtml(dateLabel(createdOf(transfer)))}</td><td>${escapeHtml(locationLabel(destinationOf(transfer)))}</td><td>${escapeHtml(linesOf(transfer).map(item => `${item.productName || item.product_name || 'Unlabelled product'} × ${quantityOf(item)}`).join(', '))}</td><td>${totalOf(transfer)}</td><td>${escapeHtml(statusDisplay(transfer.status).label)}${needsReview(transfer) ? ' — Needs review' : ''}</td><td>${escapeHtml(creatorOf(transfer))}</td></tr>`).join('');
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Distribution history</title><style>body{font-family:sans-serif;color:#23352a;padding:24px;font-size:11px}h1{font-size:18px;color:#187344}table{border-collapse:collapse;width:100%}th,td{padding:9px;border-bottom:1px solid #dfe6dc;text-align:left;overflow-wrap:anywhere}th{background:#eaf3e9}button{padding:10px 20px;background:#187344;color:white;border:0;margin-bottom:16px}@media print{button{display:none}@page{size:landscape;margin:12mm}}</style></head><body><button onclick="window.print()">Print / Save PDF</button><h1>Dynapharm International Namibia</h1><h2>Distribution history — Country Stock to warehouses</h2><p>Filtered records loaded in the portal · ${escapeHtml(new Date().toLocaleString('en-NA'))} · Internal use only</p><table><thead><tr><th>Reference</th><th>Date</th><th>Destination</th><th>Products</th><th>Total units</th><th>Status</th><th>Created by</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
  win.document.close();
  return true;
}

export default function DistributionHistory({ warehouses, revision, onPrint, onRequestAdjustment }) {
  const [search, setSearch] = useState('');
  const [destination, setDestination] = useState('');
  const [status, setStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);
  const [printError, setPrintError] = useState('');
  const { transfers: visible, total, loading, error, refresh: onRefresh } = useDistributionHistory({ page, pageSize: 20, search: search.trim(), destination, status, dateFrom: fromDate, dateTo: toDate, revision });
  const destinations = [...new Set(visible.map(destinationOf).filter(Boolean))];
  const statuses = [...new Set(['pending_approval', 'approved', 'pending', 'requested', 'submitted', 'dispatched', 'in_transit', 'awaiting_receipt', 'received', 'rejected', 'cancelled', ...visible.map(transfer => transfer.status).filter(Boolean)])];
  useEffect(() => { if (!loading && !error && page > 1 && page > Math.max(1, Math.ceil(total / 20))) setPage(Math.max(1, Math.ceil(total / 20))); }, [loading, error, page, total]);
  const filterChange = setter => event => { setter(event.target.value); setPage(1); };
  const reset = () => { setSearch(''); setDestination(''); setStatus(''); setFromDate(''); setToDate(''); setPage(1); };
  const hasFilters = search || destination || status || fromDate || toDate;
  return <section className="sp-panel sp-history" aria-labelledby="distribution-history-heading">
    <div className="sp-panel-head">
      <div><h2 id="distribution-history-heading">Transfer history</h2><p>Country Stock → Warehouse · Accountable at every handover</p></div>
      <div className="sp-actions"><button className="sp-btn" type="button" disabled={loading} onClick={onRefresh}><RefreshCw size={14} />Refresh</button><button className="sp-btn" type="button" disabled={loading || !!error || !visible.length} onClick={() => { setPrintError(printHistory(visible) ? '' : 'Allow pop-ups to print transfer history, then try again.'); }}><Printer size={14} />Print this page</button></div>
    </div>
    <div className="sp-filters">
      <label className="sp-label">Search transfers<div className="sp-search"><Search size={16} /><input className="sp-input" value={search} onChange={filterChange(setSearch)} placeholder="Reference, product or staff name" /></div></label>
      <label className="sp-label">Destination<select className="sp-input" value={destination} onChange={filterChange(setDestination)}><option value="">All warehouses</option>{[...new Set([...warehouses.map(warehouse => String(warehouse.id)), ...destinations])].map(id => <option key={id} value={id}>{warehouses.find(warehouse => String(warehouse.id) === id)?.name || locationLabel(id)}</option>)}</select></label>
      <label className="sp-label">Status<select className="sp-input" value={status} onChange={filterChange(setStatus)}><option value="">All statuses</option>{statuses.map(value => <option key={value} value={value}>{statusDisplay(value).label}</option>)}</select></label>
      <label className="sp-label">From date<input className="sp-input" type="date" value={fromDate} max={toDate || undefined} onChange={filterChange(setFromDate)} /></label>
      <label className="sp-label">To date<input className="sp-input" type="date" value={toDate} min={fromDate || undefined} onChange={filterChange(setToDate)} /></label>
    </div>
    <div style={{ padding: '0 20px' }}>
      <p className="sp-help" style={{ marginTop: 0, marginBottom: 12 }}>Search and filters cover the full distribution history. Printing includes the current page only.</p>
      {hasFilters && <button type="button" className="sp-btn" style={{ marginBottom: 12 }} onClick={reset}>Clear filters</button>}
      {printError && <div role="alert" className="sp-alert sp-alert-error">{printError}</div>}
      {error && <div role="alert" className="sp-alert sp-alert-error">{error}<button type="button" className="sp-btn" onClick={onRefresh}>Retry history</button></div>}
    </div>
    {loading ? <Skeleton label="Loading transfer history" /> : !error && (visible.length ? <>
      <div className="sp-table-wrap"><table className="sp-table"><caption className="sr-only">Country stock to warehouse transfer history</caption><thead><tr>{['Reference', 'Date', 'Destination', 'Product count', 'Total units', 'Status', 'Created by', 'Actions'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{visible.map(transfer => <tr key={transfer.id}>
        <td><button type="button" className="sp-btn" onClick={() => setDetail(transfer)}>{referenceOf(transfer)}</button></td>
        <td>{dateLabel(createdOf(transfer))}</td><td>{warehouses.find(warehouse => String(warehouse.id) === String(destinationOf(transfer)))?.name || locationLabel(destinationOf(transfer))}</td>
        <td>{productCountOf(transfer)}</td><td>{totalOf(transfer).toLocaleString()}</td>
        <td><StatusBadge status={transfer.status} />{needsReview(transfer) && <span className="sp-review-flag">Needs review · No products or units</span>}</td>
        <td>{creatorOf(transfer)}</td><td><div className="sp-actions">
          <button type="button" className="sp-btn sp-btn-icon" aria-label={`View transfer ${referenceOf(transfer)}`} title="View transfer" onClick={() => setDetail(transfer)}><Eye size={15} /></button>
          <button type="button" className="sp-btn sp-btn-icon" aria-label={`Print dispatch note ${referenceOf(transfer)}`} title="Print dispatch note" onClick={() => onPrint(transfer)}><Printer size={15} /></button>
          <button type="button" className="sp-btn sp-btn-icon" disabled={!onRequestAdjustment} aria-label={`Request correction for ${referenceOf(transfer)}`} title="Request correction · GM approval required" onClick={() => onRequestAdjustment?.(transfer)}><Edit2 size={15} /></button>
        </div></td>
      </tr>)}</tbody></table></div>
      <Pagination page={page} pageSize={20} total={total} onChange={setPage} label="transfers" />
    </> : <div className="sp-empty"><ClipboardList size={32} /><strong>{hasFilters ? 'No matching transfers' : 'No distribution transfers yet'}</strong><p>{hasFilters ? 'Try another search or clear your filters.' : 'Select products above to create a country-stock transfer for GM approval.'}</p></div>)}
    {detail && <Overlay title="Transfer details" drawer onClose={() => setDetail(null)} footer={<><button type="button" className="sp-btn" disabled={!onRequestAdjustment} onClick={() => { const record = detail; setDetail(null); onRequestAdjustment?.(record); }}><Edit2 size={14} />Request correction</button><button type="button" className="sp-btn sp-btn-primary" onClick={() => { const record = detail; setDetail(null); onPrint(record); }}><Printer size={14} />Dispatch note</button></>}>
      <div className="sp-panel-content">
        <div className="sp-actions" style={{ marginBottom: 18 }}><span className="sp-code">{referenceOf(detail)}</span><StatusBadge status={detail.status} /></div>
        {needsReview(detail) && <div role="alert" className="sp-alert">This received record contains no product lines or positive units. It needs an authorised review. No stock or record has been repaired automatically.</div>}
        <dl className="sp-detail-meta"><div><dt>Source</dt><dd>{locationLabel(sourceOf(detail))}</dd></div><div><dt>Destination</dt><dd>{locationLabel(destinationOf(detail))}</dd></div><div><dt>Created by</dt><dd>{creatorOf(detail)}</dd></div><div><dt>Created</dt><dd>{dateLabel(createdOf(detail))}</dd></div></dl>
        <h3 className="sp-product">Product lines · {linesOf(detail).length}</h3>
        {detail.itemsSource === 'legacy_transfer_header' && <p className="sp-help">These details come from the original transfer header. No separate item rows were recorded; this display does not recreate them or change stock.</p>}
        {(detail.metadata?.auto_received === true || detail.metadata?.auto_received === 'true') && <p className="sp-help">Recorded as auto-received by the legacy process. This is not a newly verified staff receipt.</p>}
        {linesOf(detail).length ? <div className="sp-table-wrap"><table className="sp-table"><thead><tr><th scope="col">Product / ID</th><th scope="col">SKU</th><th scope="col">Units</th></tr></thead><tbody>{linesOf(detail).map((item, index) => <tr key={`${item.productId ?? item.product_id ?? 'legacy'}-${index}`}><td className="sp-product">{item.productName || item.product_name || 'Unlabelled product'}<small>{item.productId ?? item.product_id ?? 'ID not recorded'}</small></td><td className="sp-code">{item.sku || item.productCode || item.product_code || 'Not recorded'}</td><td>{quantityOf(item)}</td></tr>)}</tbody></table></div> : <p className="sp-help">No product lines recorded.</p>}
        <div className="sp-totals"><span>Total units</span><strong>{totalOf(detail)}</strong></div>
        <h3 className="sp-product">Transfer note</h3><p className="sp-note">{noteOf(detail) || 'No note recorded.'}</p>
        <h3 className="sp-product" style={{ marginTop: 24 }}>Recorded status history</h3>
        <p className="sp-help">Only stored action timestamps and actors are shown. Missing events are not inferred from the current status.</p>
        <ol className="sp-timeline">{recordedEvents(detail).map(([label, date, actor]) => <li key={label}><strong>{label}</strong><small>{dateLabel(date)} · {actor || 'Actor not recorded'}</small></li>)}</ol>
        {!recordedEvents(detail).length && <p className="sp-help">No action timestamps recorded.</p>}
      </div>
    </Overlay>}
  </section>;
}

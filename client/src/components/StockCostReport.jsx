import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

const money = value => value == null ? '—' : `N$ ${Number(value).toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
const qty = value => Number(value || 0).toLocaleString('en-NA', { maximumFractionDigits: 4 });

export default function StockCostReport({ branchId: initialBranchId = '' }) {
  const today = new Date().toISOString().slice(0, 10);
  const [branchId, setBranchId] = useState(initialBranchId || '');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [productName,setProductName]=useState('');
  const [loadedFilters,setLoadedFilters]=useState(null);
  const [exporting,setExporting]=useState(false);
  const [auditFormat,setAuditFormat]=useState('json');
  const [downloadStatus,setDownloadStatus]=useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorAction,setErrorAction]=useState('report');
  const load = useCallback(async (pages={}) => {
    setLoading(true);
    setError('');
    setErrorAction('report');
    try {
      const filters={branchId:branchId.trim(),from,to,productName:productName.trim()};
      const data = await api.stock.costReport({ ...filters, pageSize:100,
        stockPage:pages.stockPage || 1,salesPage:pages.salesPage || 1 });
      setReport(data || { stock: [], sales: [], summary: {} });
      setLoadedFilters(filters);setDownloadStatus('');
    } catch (e) {
      setError(e.message || 'Cost report could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [branchId, from, to,productName]);
  const downloadAudit=async()=>{
    if(!loadedFilters)return;
    setExporting(true);setError('');setErrorAction('audit');setDownloadStatus('');
    try{
      const result=await api.stock.costAudit(loadedFilters,auditFormat);
      const content=auditFormat==='csv' ? '\uFEFF'+result.content : result.content;
      const url=URL.createObjectURL(new Blob([content],{type:result.mimeType}));
      const link=document.createElement('a');link.href=url;link.download=result.filename;
      try{document.body.appendChild(link);link.click();}
      finally{link.remove();setTimeout(URL.revokeObjectURL.bind(URL,url),1000);}
      setDownloadStatus(`Downloaded evidence for ${result.metadata.saleCount} sales and ${result.metadata.sourceLayerCount} source layers.`);
    }catch(e){setError(e.message || 'Audit download failed.');}
    finally{setExporting(false);}
  };
  useEffect(() => { if (initialBranchId) setBranchId(initialBranchId); }, [initialBranchId]);

  const summary = report?.summary || {};
  const incomplete = Number(summary.missingStockCostQuantity || 0) > 0
    || Number(summary.missingSalesCostQuantity || 0) > 0
    || Number(summary.missingSalesRevenueQuantity || 0) > 0
    || (report != null && summary.grossProfit == null);
  const th = 'whitespace-nowrap border-b border-slate-200 px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-600';
  const td = 'border-b border-slate-100 px-3 py-2 text-sm text-slate-700';
  const pager=kind=>{
    const meta=report?.pagination?.[kind];if(!meta)return null;
    const change=page=>load({stockPage:report.pagination.stock.page,salesPage:report.pagination.sales.page,
      [`${kind}Page`]:page});
    return <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
      <span>{qty(meta.total)} rows · Page {meta.page} of {Math.max(1,meta.pages)}. Totals and warnings cover all matching rows.</span>
      <div className="flex gap-3"><button type="button" onClick={()=>change(meta.page-1)} disabled={loading||meta.page<=1} className="font-semibold text-rose-700 disabled:opacity-40">Previous {kind}</button>
      <button type="button" onClick={()=>change(meta.page+1)} disabled={loading||meta.page>=meta.pages} className="font-semibold text-rose-700 disabled:opacity-40">Next {kind}</button></div>
    </div>;
  };
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="m-0 text-xs font-bold uppercase tracking-widest text-rose-700">Cost integrity</p><h3 className="m-0 mt-1 text-lg font-bold text-slate-800">Stock & sales cost report</h3><p className="m-0 mt-1 text-sm text-slate-500">Gross profit uses matched sales revenue and received CIF cost, never DP catalogue prices.</p></div>
        <button type="button" onClick={load} disabled={loading || exporting || !from || !to} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{loading ? 'Loading…' : report ? 'Refresh report' : 'Load report'}</button>
      </div>
      <div className="grid gap-3 rounded-lg bg-rose-50/70 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-semibold text-slate-600">Branch ID (optional)<input value={branchId} onChange={e => setBranchId(e.target.value)} placeholder="All branches" className="mt-1 block w-full rounded-md border border-rose-100 bg-white px-2.5 py-2 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600">From<input type="date" value={from} onChange={e => setFrom(e.target.value)} className="mt-1 block w-full rounded-md border border-rose-100 bg-white px-2.5 py-2 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600">To<input type="date" value={to} onChange={e => setTo(e.target.value)} className="mt-1 block w-full rounded-md border border-rose-100 bg-white px-2.5 py-2 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600">Product name (optional)<input value={productName} onChange={e=>setProductName(e.target.value)} placeholder="Exact product name" className="mt-1 block w-full rounded-md border border-rose-100 bg-white px-2.5 py-2 text-sm" /></label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <select aria-label="Audit download format" value={auditFormat} onChange={e=>setAuditFormat(e.target.value)} disabled={exporting} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="json">JSON · exact decimal strings</option><option value="csv">CSV · spreadsheet</option>
        </select>
        <button type="button" onClick={downloadAudit} disabled={!report||!loadedFilters||loading||exporting} className="rounded-lg border border-rose-700 px-4 py-2 text-sm font-semibold text-rose-700 disabled:opacity-40">{exporting?'Preparing audit…':'Download sale audit'}</button>
        <span className="text-xs text-slate-500">All sales matching the last loaded filters, not only this page. JSON keeps stored decimal precision; import CSV costs as text to avoid spreadsheet rounding.</span>
      </div>
      {loadedFilters&&<p className="text-xs text-slate-500">Loaded filters: {loadedFilters.branchId||'all branches'} · {loadedFilters.from}–{loadedFilters.to}{loadedFilters.productName?` · ${loadedFilters.productName}`:''}. Refresh after changing filters.</p>}
      {downloadStatus&&<p role="status" className="text-sm text-emerald-700">{downloadStatus}</p>}
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"><span>{error}</span><button type="button" onClick={errorAction==='audit'?downloadAudit:load} disabled={loading||exporting} className="font-semibold underline">{errorAction==='audit'?'Retry download':'Retry report'}</button></div>}
      {loading && !report && <div className="space-y-2">{[1, 2, 3].map(n => <div key={n} className="h-9 animate-pulse rounded bg-slate-100" />)}</div>}
      {report && <>
        {incomplete && <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>Incomplete revenue or costs:</strong> {qty(summary.missingStockCostQuantity)} stock units, {qty(summary.missingSalesCostQuantity)} sold units without received CIF cost, and {qty(summary.missingSalesRevenueQuantity)} sold units without matched revenue. Known totals exclude unknown amounts; gross profit is unavailable until all required revenue and cost values are known.</div>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Known stock cost', summary.knownStockCost],
            ['Stock units missing cost', summary.missingStockCostQuantity, true],
            ['Known sales cost', summary.knownSalesCost],
            ['Sold units missing cost', summary.missingSalesCostQuantity, true],
            ['Known sales revenue', summary.knownSalesRevenue],
            ['Missing-revenue quantity', summary.missingSalesRevenueQuantity, true],
            ['Gross profit · received CIF', summary.grossProfit, false, true],
          ].map(([label, value, isQty, isProfit]) =>
            <div key={label} className={`rounded-lg border p-3 ${((isQty && Number(value) > 0) || (isProfit && value == null)) ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}><div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div><div className={`mt-1 text-xl font-bold ${((isQty && Number(value) > 0) || (isProfit && value == null)) ? 'text-amber-800' : 'text-slate-800'}`}>{isQty ? qty(value) : isProfit && value == null ? 'Incomplete' : money(value)}</div></div>
          )}
        </div>
        <div className="space-y-2">
          <h4 className="m-0 font-bold text-slate-800">Stock by location and batch</h4>
          {pager('stock')}
          <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[1120px] border-collapse"><thead><tr className="bg-slate-50">{['Location','Product','Batch','Expiry','Condition','Available','Reserved','On hand','In transit','Expired','Unit CIF','Unit DPC','Missing cost'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead><tbody>
            {(report.stock || []).map((r, i) => <tr key={`${r.location}-${r.productName}-${r.batchNo}-${i}`} className={Number(r.missingCostQuantity) > 0 ? 'bg-amber-50/70' : ''}><td className={td}>{r.location || '—'}</td><td className={td}>{r.productName || '—'}</td><td className={td}>{r.batchNo || '—'}</td><td className={td}>{r.missingExpiry ? 'Missing expiry' : r.expiryDate || '—'}</td><td className={td}>{r.condition || '—'}</td><td className={td}>{qty(r.availableQty)}</td><td className={td}>{qty(r.reservedQty)}</td><td className={td}>{qty(r.onHandQty)}</td><td className={`${td} ${Number(r.inTransitQty) > 0 ? 'font-semibold text-blue-800' : ''}`}>{qty(r.inTransitQty)}</td><td className={td}>{qty(r.expiredQty)}</td><td className={td}>{r.unitCIF == null ? 'Missing' : money(r.unitCIF)}</td><td className={td}>{r.unitDPC == null ? 'Missing' : money(r.unitDPC)}</td><td className={`${td} font-semibold ${Number(r.missingCostQuantity) > 0 ? 'text-amber-800' : ''}`}>{qty(r.missingCostQuantity)}</td></tr>)}
            {!report.stock?.length && <tr><td colSpan="13" className="px-4 py-8 text-center text-sm text-slate-500">No stock rows on this page.</td></tr>}
          </tbody></table></div>
        </div>
        <div className="space-y-2">
          <h4 className="m-0 font-bold text-slate-800">Sales cost detail</h4>
          {pager('sales')}
          <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[900px] border-collapse"><thead><tr className="bg-slate-50">{['Sale reference','Product','Quantity','Known received-CIF cost','Revenue','Gross profit','Missing-cost qty','Missing-revenue qty'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead><tbody>
            {(report.sales || []).map((r, i) => <tr key={`${r.saleReference}-${r.productName}-${i}`} className={Number(r.missingCostQuantity) > 0 || Number(r.missingRevenueQuantity) > 0 || r.grossProfit == null ? 'bg-amber-50/70' : ''}><td className={td}>{r.saleReference || '—'}</td><td className={td}>{r.productName || '—'}</td><td className={td}>{qty(r.quantity)}</td><td className={td}>{money(r.knownCost)}</td><td className={td}>{money(r.revenue)}</td><td className={`${td} font-semibold`}>{r.grossProfit == null ? <span className="text-amber-800">Incomplete</span> : money(r.grossProfit)}</td><td className={`${td} font-semibold ${Number(r.missingCostQuantity) > 0 ? 'text-amber-800' : ''}`}>{qty(r.missingCostQuantity)}</td><td className={`${td} font-semibold ${Number(r.missingRevenueQuantity) > 0 ? 'text-amber-800' : ''}`}>{qty(r.missingRevenueQuantity)}</td></tr>)}
            {!report.sales?.length && <tr><td colSpan="8" className="px-4 py-8 text-center text-sm text-slate-500">No sales rows on this page.</td></tr>}
          </tbody></table></div>
        </div>
      </>}
    </section>
  );
}

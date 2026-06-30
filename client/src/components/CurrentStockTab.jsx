/**
 * CurrentStockTab — Countrywide live stock snapshot for GM Portal.
 * Shows total CIF + DP values, per-product quantities, and
 * location-level drill-down when a product row is clicked.
 *
 * Sources:
 *   country  → stock_batches WHERE location = 'country_stock'
 *   warehouse → stock_batches WHERE location IN (windhoek_warehouse, ondangwa_warehouse, …)
 *   branch   → inventory_balances WHERE location_type = 'branch'
 *   field    → field_stock balances
 */
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/constants';
import { Card, CardBody, CardHeader, LoadingSpinner, Alert } from './ui';
import { Package, TrendingUp, MapPin, ChevronDown, ChevronRight, Search, Download, Warehouse } from 'lucide-react';

const LOC_COLORS = {
  country:   { bg: 'bg-orange-100',  text: 'text-orange-700',  dot: 'bg-orange-500',  label: 'Country Stock' },
  warehouse: { bg: 'bg-purple-100',  text: 'text-purple-700',  dot: 'bg-purple-500',  label: 'Warehouse' },
  branch:    { bg: 'bg-blue-100',    text: 'text-blue-700',    dot: 'bg-blue-500',    label: 'Branch' },
  field:     { bg: 'bg-green-100',   text: 'text-green-700',   dot: 'bg-green-500',   label: 'Field' },
};

function fmt(v) { return formatCurrency(Number(v) || 0); }
function qty(v) { return Number(v || 0).toLocaleString('en-NA', { maximumFractionDigits: 0 }); }

function LocBadge({ type }) {
  const c = LOC_COLORS[type] || LOC_COLORS.warehouse;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function SummaryCard({ title, value, sub, color, icon }) {
  const colors = {
    green:  'border-green-200 bg-green-50',
    blue:   'border-blue-200 bg-blue-50',
    amber:  'border-amber-200 bg-amber-50',
    purple: 'border-purple-200 bg-purple-50',
    orange: 'border-orange-200 bg-orange-50',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] || colors.blue}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{title}</p>
          <p className="text-xl font-bold text-gray-800">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <span className="text-gray-400">{icon}</span>
      </div>
    </div>
  );
}

/** Roll up totals by location type across all products */
function buildLocTypeTotals(products) {
  const totals = {};
  for (const p of products) {
    for (const l of p.locations) {
      const t = l.locationType;
      if (!totals[t]) totals[t] = { qty: 0, valueDP: 0, valueCIF: 0 };
      totals[t].qty      += l.qty;
      totals[t].valueDP  += l.valueDP;
      totals[t].valueCIF += l.valueCIF;
    }
  }
  return totals;
}

export default function CurrentStockTab() {
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [data, setData]         = useState(null);
  const [search, setSearch]     = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    api.get('/stock/current-overview')
      .then(d => setData(d))
      .catch(e => setError(e.message || 'Failed to load stock data'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (name) => setExpanded(prev => prev === name ? null : name);

  const filtered = (data?.products || []).filter(p =>
    !search || p.productName.toLowerCase().includes(search.toLowerCase())
  );

  const locTypeTotals = data ? buildLocTypeTotals(data.products) : {};

  // "In operations" = warehouses + branches (country stock is pre-dispatch staging)
  const inOpsQty = (locTypeTotals.warehouse?.qty || 0) + (locTypeTotals.branch?.qty || 0) + (locTypeTotals.field?.qty || 0);
  const inOpsDP  = (locTypeTotals.warehouse?.valueDP || 0) + (locTypeTotals.branch?.valueDP || 0) + (locTypeTotals.field?.valueDP || 0);

  const exportCSV = () => {
    if (!data) return;
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Product', 'Total Qty', 'CIF Value (N$)', 'DP Value (N$)', 'Location Type', 'Location', 'Loc Qty', 'Loc CIF', 'Loc DP']];
    for (const p of data.products) {
      rows.push([p.productName, p.totalQty, p.totalValueCIF, p.totalValueDP, '', '', '', '', '']);
      for (const l of p.locations) {
        rows.push(['', '', '', '', l.locationType, l.locationName, l.qty, l.valueCIF, l.valueDP]);
      }
    }
    const csv = rows.map(r => r.map(q).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `Dynapharm-Stock-Overview-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const exportPDF = () => {
    if (!data) return;
    const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const fmtN = v => 'N$ ' + Number(v || 0).toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtQ = v => Number(v || 0).toLocaleString('en-NA', { maximumFractionDigits: 0 });
    const today = new Date().toLocaleDateString('en-NA', { day: '2-digit', month: 'long', year: 'numeric' });
    const logo = window.location.origin + '/assets/dynapharm-logo.png';

    const locColor = { country: '#f97316', warehouse: '#a855f7', branch: '#3b82f6', field: '#22c55e' };
    const locLabel = { country: 'Country Stock', warehouse: 'Warehouse', branch: 'Branch', field: 'Field' };

    const summaryCards = `
      <div class="summary-grid">
        <div class="card green"><div class="card-label">Total Value (DP)</div><div class="card-val">${fmtN(data.summary.totalValueDP)}</div><div class="card-sub">All locations</div></div>
        <div class="card amber"><div class="card-label">Total Value (CIF)</div><div class="card-val">${fmtN(data.summary.totalValueCIF)}</div><div class="card-sub">Landed cost</div></div>
        <div class="card purple"><div class="card-label">Total Units</div><div class="card-val">${fmtQ(data.summary.totalQtyUnits)}</div><div class="card-sub">All locations</div></div>
        <div class="card blue"><div class="card-label">In Operations (DP)</div><div class="card-val">${fmtN(inOpsDP)}</div><div class="card-sub">${fmtQ(inOpsQty)} units · WH + Branch + Field</div></div>
      </div>`;

    const productRows = data.products.map((p, idx) => {
      const locRows = p.locations.map(l => `
        <tr class="loc-row">
          <td style="padding-left:28px;color:#64748b;font-size:10px;">↳ <span style="display:inline-block;padding:1px 7px;border-radius:10px;background:${locColor[l.locationType] || '#64748b'}22;color:${locColor[l.locationType] || '#64748b'};font-weight:700;">${locLabel[l.locationType] || l.locationType}</span> ${esc(l.locationName)}</td>
          <td class="num">${fmtQ(l.qty)}</td>
          <td class="num amber">${l.valueCIF > 0 ? fmtN(l.valueCIF) : '—'}</td>
          <td class="num green">${l.valueDP > 0 ? fmtN(l.valueDP) : '—'}</td>
        </tr>`).join('');
      return `
        <tr class="prod-row ${idx % 2 === 0 ? 'even' : 'odd'}">
          <td><strong>${esc(p.productName)}</strong><br><span style="font-size:10px;color:#94a3b8">${p.locations.length} location${p.locations.length !== 1 ? 's' : ''}</span></td>
          <td class="num"><strong>${fmtQ(p.totalQty)}</strong></td>
          <td class="num amber"><strong>${fmtN(p.totalValueCIF)}</strong></td>
          <td class="num green"><strong>${fmtN(p.totalValueDP)}</strong></td>
        </tr>
        ${locRows}`;
    }).join('');

    const w = window.open('', '_blank', 'width=1050,height=800');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Dynapharm — Current Stock Overview — ${today}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;padding:20px;line-height:1.4;}
  .header{display:flex;align-items:center;gap:14px;border-bottom:3px solid #1d4ed8;padding-bottom:12px;margin-bottom:16px;}
  .logo{height:52px;}
  .co{font-size:1.1rem;font-weight:900;color:#1d4ed8;}
  .sub{font-size:0.75rem;color:#64748b;margin-top:2px;}
  .title{font-size:0.9rem;font-weight:800;color:#1e3a8a;margin-top:4px;}
  .meta{margin-left:auto;text-align:right;font-size:0.75rem;color:#64748b;line-height:1.8;}
  .summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;}
  .card{border-radius:10px;padding:10px 14px;border:1px solid #e5e7eb;}
  .card.green{background:#f0fdf4;border-color:#bbf7d0;}.card.amber{background:#fffbeb;border-color:#fde68a;}.card.blue{background:#eff6ff;border-color:#bfdbfe;}.card.purple{background:#faf5ff;border-color:#e9d5ff;}
  .card-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#64748b;margin-bottom:4px;}
  .card-val{font-size:1rem;font-weight:900;color:#1e293b;}
  .card-sub{font-size:9px;color:#94a3b8;margin-top:2px;}
  table{width:100%;border-collapse:collapse;font-size:11px;}
  thead tr{background:#1e3a8a;color:#fff;}
  thead th{padding:7px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;}
  thead th.num{text-align:right;}
  .prod-row.even{background:#fff;}.prod-row.odd{background:#f8fafc;}
  .prod-row td{padding:7px 10px;border-bottom:1px solid #f1f5f9;vertical-align:top;}
  .loc-row td{padding:4px 10px;border-bottom:1px dashed #f1f5f9;background:#f8fafc;}
  .num{text-align:right;font-family:monospace;}
  .amber{color:#b45309;}.green{color:#15803d;}
  .footer{margin-top:18px;border-top:2px solid #1d4ed8;padding-top:8px;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8;}
  .conf{background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;padding:2px 10px;border-radius:20px;font-size:9px;font-weight:700;}
  .print-btn{position:fixed;top:12px;right:12px;background:#1d4ed8;color:#fff;border:none;padding:7px 16px;border-radius:7px;font-weight:700;cursor:pointer;font-size:12px;}
  @media print{.print-btn{display:none;}body{padding:10px;}@page{size:A4 landscape;margin:10mm;}}
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨️ Print / Save PDF</button>
<div class="header">
  <img class="logo" src="${logo}" onerror="this.style.display='none'" />
  <div>
    <div class="co">DYNAPHARM INTERNATIONAL NAMIBIA</div>
    <div class="sub">Stock Management Division</div>
    <div class="title">CURRENT STOCK OVERVIEW — COUNTRYWIDE</div>
  </div>
  <div class="meta">
    <div><b>Date:</b> ${today}</div>
    <div><b>Products:</b> ${data.products.length}</div>
    <div><b>Scope:</b> Warehouses · Branches · Field</div>
  </div>
</div>
${summaryCards}
<table>
  <thead>
    <tr>
      <th>Product / Location</th>
      <th class="num">Units</th>
      <th class="num">CIF Value (N$)</th>
      <th class="num">DP Value (N$)</th>
    </tr>
  </thead>
  <tbody>${productRows}</tbody>
</table>
<div class="footer">
  <span class="conf">🔒 CONFIDENTIAL — INTERNAL USE ONLY</span>
  <span>Dynapharm International Namibia — Generated ${today}</span>
</div>
</body></html>`);
    w.document.close();
    setTimeout(() => { try { w.focus(); } catch {} }, 300);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-gray-800">Current Stock — Countrywide</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Warehouses · Branches · Field — live operational snapshot
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={load}
                className="px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded hover:bg-gray-50 text-gray-600">
                ↻ Refresh
              </button>
              {data && (
                <>
                  <button onClick={exportCSV}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-primary text-primary rounded hover:bg-primary/5">
                    <Download size={12} /> Export CSV
                  </button>
                  <button onClick={exportPDF}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-red-400 text-red-600 rounded hover:bg-red-50">
                    <Download size={12} /> Export PDF
                  </button>
                </>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {error && <Alert variant="error">{error}</Alert>}
      {loading && <LoadingSpinner />}

      {data && (
        <>
          {/* Grand summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard
              title="Total Stock Value (DP)"
              value={fmt(data.summary.totalValueDP)}
              sub="All locations combined"
              color="green"
              icon={<TrendingUp size={22} />}
            />
            <SummaryCard
              title="Total Stock Value (CIF)"
              value={fmt(data.summary.totalValueCIF)}
              sub="Landed cost — all locations"
              color="amber"
              icon={<Package size={22} />}
            />
            <SummaryCard
              title="Total Units"
              value={qty(data.summary.totalQtyUnits)}
              sub="All locations combined"
              color="purple"
              icon={<MapPin size={22} />}
            />
            <SummaryCard
              title="In Operations (DP)"
              value={fmt(inOpsDP)}
              sub={`${qty(inOpsQty)} units — warehouses + branches + field`}
              color="blue"
              icon={<Warehouse size={22} />}
            />
          </div>

          {/* Per-location-type breakdown strip — country stock excluded (staging/holding only) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { type: 'warehouse', label: 'Warehouses',           icon: '🏭' },
              { type: 'branch',    label: 'Branches',             icon: '🏪' },
              { type: 'field',     label: 'Field Officers',       icon: '👤' },
            ].map(({ type, label, icon }) => {
              const c  = LOC_COLORS[type];
              const t  = locTypeTotals[type];
              const q  = t?.qty     || 0;
              const dp = t?.valueDP || 0;
              return (
                <div key={type} className={`rounded-xl border p-3 ${c.bg} border-current/10`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span>{icon}</span>
                    <p className={`text-xs font-bold uppercase tracking-wide ${c.text}`}>{label}</p>
                  </div>
                  <p className="text-lg font-bold text-gray-800">{qty(q)} <span className="text-xs font-normal text-gray-500">units</span></p>
                  <p className={`text-xs font-semibold ${c.text} mt-0.5`}>{fmt(dp)}</p>
                </div>
              );
            })}
          </div>

          {/* Legend — country stock omitted (staging/holding, not in operations) */}
          <div className="flex flex-wrap gap-2 px-1">
            {Object.entries(LOC_COLORS).filter(([type]) => type !== 'country').map(([type, c]) => (
              <span key={type} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
                <span className={`w-2 h-2 rounded-full ${c.dot}`} /> {c.label}
              </span>
            ))}
          </div>

          {/* Product Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold text-gray-800">Products ({filtered.length})</h3>
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search products…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 w-52"
                  />
                </div>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase w-8" />
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Product</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Total Units</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Value (CIF)</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Value (DP)</th>
                    <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Locations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-12 text-gray-400 text-sm">No products found</td></tr>
                  )}
                  {filtered.map((p, idx) => {
                    const isOpen = expanded === p.productName;
                    return (
                      <>
                        {/* Product row */}
                        <tr
                          key={p.productName}
                          onClick={() => toggle(p.productName)}
                          className={`cursor-pointer transition-colors ${isOpen ? 'bg-blue-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/60`}
                        >
                          <td className="px-4 py-2.5 text-gray-400">
                            {isOpen
                              ? <ChevronDown size={14} className="text-primary" />
                              : <ChevronRight size={14} />}
                          </td>
                          <td className="px-4 py-2.5">
                            <p className="font-semibold text-gray-800 text-sm">{p.productName}</p>
                            <p className="text-xs text-gray-400">{p.locations.length} location{p.locations.length !== 1 ? 's' : ''}</p>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-800">{qty(p.totalQty)}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-amber-700">{fmt(p.totalValueCIF)}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-green-700">{fmt(p.totalValueDP)}</td>
                          <td className="px-4 py-2.5 text-center">
                            <div className="flex flex-wrap gap-1 justify-center">
                              {[...new Set(p.locations.map(l => l.locationType))].map(t => (
                                <LocBadge key={t} type={t} />
                              ))}
                            </div>
                          </td>
                        </tr>

                        {/* Expanded location breakdown */}
                        {isOpen && (
                          <tr key={`${p.productName}-detail`}>
                            <td colSpan={6} className="px-0 py-0 bg-blue-50">
                              <div className="border-l-4 border-primary ml-4 mr-4 mb-3 mt-1 rounded-r-lg overflow-hidden shadow-sm">
                                <div className="bg-blue-900/5 px-4 py-2 border-b border-blue-100">
                                  <p className="text-xs font-bold text-blue-800 uppercase tracking-wide">
                                    Location Breakdown — {p.productName}
                                  </p>
                                </div>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-white border-b border-blue-100">
                                      <th className="text-left px-4 py-2 font-semibold text-gray-500">Type</th>
                                      <th className="text-left px-4 py-2 font-semibold text-gray-500">Location</th>
                                      <th className="text-right px-4 py-2 font-semibold text-gray-500">Qty</th>
                                      <th className="text-right px-4 py-2 font-semibold text-gray-500">CIF Value</th>
                                      <th className="text-right px-4 py-2 font-semibold text-gray-500">DP Value</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-blue-50">
                                    {p.locations.map((l, li) => (
                                      <tr key={li} className="bg-white hover:bg-blue-50/40">
                                        <td className="px-4 py-2"><LocBadge type={l.locationType} /></td>
                                        <td className="px-4 py-2 font-medium text-gray-700">{l.locationName}</td>
                                        <td className="px-4 py-2 text-right font-mono font-semibold text-gray-800">{qty(l.qty)}</td>
                                        <td className="px-4 py-2 text-right font-mono text-amber-700">{l.valueCIF > 0 ? fmt(l.valueCIF) : <span className="text-gray-300">—</span>}</td>
                                        <td className="px-4 py-2 text-right font-mono font-bold text-green-700">{l.valueDP > 0 ? fmt(l.valueDP) : <span className="text-gray-300">—</span>}</td>
                                      </tr>
                                    ))}
                                    {/* Subtotal */}
                                    <tr className="bg-blue-100/60 font-bold">
                                      <td className="px-4 py-2 text-blue-800 text-xs font-bold uppercase" colSpan={2}>Total</td>
                                      <td className="px-4 py-2 text-right font-mono text-blue-800">{qty(p.totalQty)}</td>
                                      <td className="px-4 py-2 text-right font-mono text-amber-800">{fmt(p.totalValueCIF)}</td>
                                      <td className="px-4 py-2 text-right font-mono text-green-800">{fmt(p.totalValueDP)}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

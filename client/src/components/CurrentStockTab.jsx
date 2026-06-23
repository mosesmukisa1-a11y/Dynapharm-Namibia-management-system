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
    const rows = [['Product', 'Total Qty', 'CIF Value (N$)', 'DP Value (N$)', 'Location Type', 'Location', 'Loc Qty', 'Loc CIF', 'Loc DP']];
    for (const p of data.products) {
      rows.push([p.productName, p.totalQty, p.totalValueCIF, p.totalValueDP, '', '', '', '', '']);
      for (const l of p.locations) {
        rows.push(['', '', '', '', l.locationType, l.locationName, l.qty, l.valueCIF, l.valueDP]);
      }
    }
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `Dynapharm-Stock-Overview-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
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
                <button onClick={exportCSV}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-primary text-primary rounded hover:bg-primary/5">
                  <Download size={12} /> Export CSV
                </button>
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

/**
 * AccountsTab — Full financial statements with Namibian tax law calculations.
 * Shared across Finance, GM, and Director portals.
 */
import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { formatCurrency, formatDate } from '../lib/constants';
import { Card, CardBody, CardHeader, Button, LoadingSpinner, Alert } from './ui';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { FileText, TrendingUp, Scale, Receipt, Building2, Download } from 'lucide-react';

function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
const today = localDateStr(new Date());
const firstOfMonth = localDateStr(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
const firstOfYear  = localDateStr(new Date(new Date().getFullYear(), 0, 1));

/* ── Namibian Tax Law Constants ── */
const CIT_RATE = 0.32;          // Corporate Income Tax: 32%
const VAT_RATE = 0.15;          // VAT: 15% standard rate
const SSC_RATE = 0.009;         // Social Security: 0.9% employer + 0.9% employee
const SSC_MONTHLY_CAP = 81;     // SSC max N$81/month per person (N$9,000 ceiling × 0.9%)
const IMPORT_DUTY_RATE = 0.05;  // Conservative pharma import duty estimate: 5%

function fmt(n) { return formatCurrency(Number(n) || 0); }
function pct(n) { return `${(Number(n) || 0).toFixed(1)}%`; }

/* ── P&L Row helper ── */
function PRow({ label, value, indent = false, bold = false, border = false, highlight = false, negative = false }) {
  const numVal = Number(value) || 0;
  const isNeg = negative || numVal < 0;
  return (
    <div className={`flex justify-between items-center py-1.5 px-2 ${border ? 'border-t border-gray-200 mt-1 pt-2' : ''} ${highlight ? 'bg-blue-50 rounded font-bold' : ''} ${bold ? 'font-semibold' : ''}`}>
      <span className={`text-sm ${indent ? 'pl-4 text-gray-500' : bold || highlight ? 'text-gray-800' : 'text-gray-600'}`}>{label}</span>
      <span className={`text-sm font-mono ${highlight ? 'text-blue-800 font-bold' : isNeg && numVal < 0 ? 'text-red-600' : numVal > 0 && !negative ? 'text-gray-800' : 'text-gray-600'} ${bold || highlight ? 'font-bold' : ''}`}>
        {negative && numVal > 0 ? `(${fmt(numVal)})` : fmt(Math.abs(numVal))}
      </span>
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <div className="mb-1">
      <div className="bg-gray-100 rounded px-3 py-1.5 flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">{title}</span>
      </div>
      {children}
    </div>
  );
}

export default function AccountsTab({ role = 'finance' }) {
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeStatement, setActiveStatement] = useState('pl');
  const [data, setData] = useState(null);

  const loadData = useCallback(() => {
    setLoading(true);
    setError('');
    const qs = `startDate=${startDate}&endDate=${endDate}`;
    Promise.all([
      api.get(`/director/profit-loss?${qs}`).catch(() => ({})),
      api.finance.stockValue({ asOfDate: endDate }).catch(() => ({})),
      api.finance.pettyCash.accounts().catch(() => ({ accounts: [] })),
      api.finance.remittances().catch(() => []),
      api.get(`/finance/income-statement?${qs}`).catch(() => ({})),
    ]).then(([pl, sv, pc, remittances, incSt]) => {
      // Calculate period months for recurring fixed costs (salary, rent)
      const msPerMonth = 30.44 * 24 * 3600 * 1000;
      const periodMs = new Date(endDate).getTime() - new Date(startDate).getTime();
      const periodMonths = Math.max(1, Math.round(periodMs / msPerMonth));

      // ── Salary (from dedicated income-statement endpoint) ──
      const monthlyPayroll = Number(incSt?.salary?.monthly_total || 0);
      const totalSalaries  = monthlyPayroll * periodMonths;
      const salaryCount    = Number(incSt?.salary?.count || 0);

      // ── Rent (from dedicated income-statement endpoint) ──
      const monthlyRent = Number(incSt?.rent?.monthly_total || 0);
      const totalRent   = monthlyRent * periodMonths;
      const rentCount   = Number(incSt?.rent?.count || 0);

      // ── Misc period expenses: branch + dept + petty cash ──
      const totalMiscExpenses = Number(incSt?.misc_expenses?.total || 0);
      const expByCategory     = incSt?.misc_expenses?.by_category || {};

      // ── Bonus payouts ──
      const bonusPayout = Number(incSt?.bonus_payout || pl.bonusPayout || 0);

      const revenue     = Number(pl.totalRevenueDP || 0);
      const cogs        = Number(pl.cifCost || 0);
      const grossProfit = Number(pl.grossProfit ?? (revenue - cogs));
      const totalExpenses = totalMiscExpenses;
      const opExpenses    = totalMiscExpenses + bonusPayout + totalSalaries + totalRent;
      const ebit          = grossProfit - opExpenses;
      const sscEmployer   = ebit > 0 ? Math.min(ebit * SSC_RATE, SSC_MONTHLY_CAP * 12 * 10) : 0;
      const taxableIncome = Math.max(0, ebit - sscEmployer);
      const citProvision  = taxableIncome * CIT_RATE;
      const netProfit     = ebit - citProvision;

      const stockValueDP    = Number(sv?.companyValueDP || sv?.stockValue?.companyValueDP || 0);
      const pcBalance       = (pc?.accounts || []).reduce((s, a) => s + Number(a.balance || 0), 0);
      const depositsReceived = Number(pl.depositsReceived || 0);
      const remList = Array.isArray(remittances) ? remittances : remittances?.remittances || [];
      const pendingRemittances = remList
        .filter(r => r.status === 'pending' || r.status === 'submitted')
        .reduce((s, r) => s + Number(r.amount || 0), 0);

      const totalCurrentAssets = stockValueDP + pcBalance + depositsReceived;
      const vatOnRevenue   = revenue * VAT_RATE / (1 + VAT_RATE);
      const vatOnPurchases = cogs * VAT_RATE / (1 + VAT_RATE);
      const vatPayable     = Math.max(0, vatOnRevenue - vatOnPurchases);
      const importDuty     = cogs * IMPORT_DUTY_RATE;
      const totalLiabilities = citProvision + vatPayable + pendingRemittances;
      const equity           = totalCurrentAssets - totalLiabilities;

      setData({
        period: { start: startDate, end: endDate },
        revenue, cogs, grossProfit, opExpenses, ebit, citProvision, netProfit, sscEmployer,
        bonusPayout, totalExpenses, totalSalaries, totalRent,
        monthlyPayroll, monthlyRent, periodMonths,
        expByCategory,
        stockValueDP, pcBalance, depositsReceived,
        totalCurrentAssets, totalLiabilities, equity,
        vatOnRevenue, vatOnPurchases, vatPayable,
        importDuty, taxableIncome,
        grossMargin: revenue ? grossProfit / revenue * 100 : 0,
        netMargin:   revenue ? netProfit   / revenue * 100 : 0,
        expList: [],
        pendingRemittances,
        salaryCount,
        rentCount,
      });
    }).catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  useEffect(() => { loadData(); }, [loadData]);

  const setPeriodPreset = (p) => {
    setPeriod(p);
    const now = new Date();
    if (p === 'month') {
      setStartDate(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
      setEndDate(now.toISOString().slice(0, 10));
    } else if (p === 'quarter') {
      const q = Math.floor(now.getMonth() / 3);
      setStartDate(new Date(now.getFullYear(), q * 3, 1).toISOString().slice(0, 10));
      setEndDate(now.toISOString().slice(0, 10));
    } else if (p === 'ytd') {
      setStartDate(new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10));
      setEndDate(now.toISOString().slice(0, 10));
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const statTabs = [
    { id: 'pl', label: 'Income Statement', icon: '📈' },
    { id: 'balance', label: 'Financial Position', icon: '⚖️' },
    { id: 'tax', label: 'Tax & Compliance', icon: '🧾' },
    { id: 'ratios', label: 'Key Ratios', icon: '📊' },
  ];

  const expChartData = data
    ? [
        ...(data.totalSalaries > 0 ? [{ name: 'Staff Salaries', amount: data.totalSalaries }] : []),
        ...(data.totalRent > 0 ? [{ name: 'Rent & Lease', amount: data.totalRent }] : []),
        ...(data.bonusPayout > 0 ? [{ name: 'Distributor Bonuses', amount: data.bonusPayout }] : []),
        ...Object.entries(data.expByCategory).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([cat, val]) => ({ name: cat, amount: val })),
      ].filter(d => d.amount > 0)
    : [];

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  return (
    <div className="space-y-4">
      {/* Header & Controls */}
      <Card>
        <CardBody>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Period Preset</label>
              <div className="flex gap-1">
                {['month', 'quarter', 'ytd'].map(p => (
                  <button key={p} onClick={() => setPeriodPreset(p)}
                    className={`px-3 py-1.5 rounded text-xs font-semibold border transition ${period === p ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                    {p === 'month' ? 'This Month' : p === 'quarter' ? 'This Quarter' : 'Year to Date'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <Button onClick={loadData} disabled={loading} size="sm">
              {loading ? 'Loading…' : 'Generate Statements'}
            </Button>
            {data && (
              <button onClick={handlePrint}
                className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50">
                <Download size={13} /> Print / Export
              </button>
            )}
          </div>
        </CardBody>
      </Card>

      {error && <Alert variant="error">{error}</Alert>}
      {loading && <LoadingSpinner />}

      {data && (
        <>
          {/* Statement Tabs */}
          <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
            {statTabs.map(t => (
              <button key={t.id} onClick={() => setActiveStatement(t.id)}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition ${activeStatement === t.id ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* ── Income Statement (P&L) ── */}
          {activeStatement === 'pl' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <TrendingUp size={16} className="text-blue-600" />
                    <div>
                      <h3 className="font-bold text-gray-800">Income Statement</h3>
                      <p className="text-xs text-gray-400">{formatDate(data.period.start)} — {formatDate(data.period.end)}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardBody>
                  <Section title="Revenue" icon={<TrendingUp size={12} className="text-green-600" />}>
                    <PRow label="Total Revenue (at DP)" value={data.revenue} bold />
                  </Section>

                  <Section title="Cost of Goods Sold" icon={<FileText size={12} className="text-orange-600" />}>
                    <PRow label="CIF Procurement Cost" value={data.cogs} negative />
                    <PRow label="Gross Profit" value={data.grossProfit} bold border highlight />
                    <PRow label="Gross Margin" value={`${pct(data.grossMargin)}`} indent />
                  </Section>

                  <Section title="Operating Expenses" icon={<Building2 size={12} className="text-red-500" />}>
                    {data.totalSalaries > 0 && (
                      <PRow label={`Staff Salaries & Benefits (${data.salaryCount} employees × ${data.periodMonths}mo)`} value={data.totalSalaries} indent negative />
                    )}
                    {data.totalRent > 0 && (
                      <PRow label={`Branch Rent & Lease (${data.rentCount} locations × ${data.periodMonths}mo)`} value={data.totalRent} indent negative />
                    )}
                    {data.bonusPayout > 0 && <PRow label="Distributor Bonus Payouts" value={data.bonusPayout} indent negative />}
                    {Object.entries(data.expByCategory).sort((a, b) => b[1] - a[1]).map(([cat, val]) => (
                      <PRow key={cat} label={cat} value={val} indent negative />
                    ))}
                    {data.opExpenses === 0 && (
                      <p className="text-xs text-gray-400 pl-4 py-1">No operating expenses recorded for this period.</p>
                    )}
                    <PRow label="Total Operating Expenses" value={data.opExpenses} bold negative border />
                  </Section>

                  <Section title="Profitability" icon={<Scale size={12} className="text-blue-600" />}>
                    <PRow label="EBIT (Earnings Before Interest & Tax)" value={data.ebit} bold highlight />
                    <PRow label="SSC Employer Contribution (0.9%)" value={data.sscEmployer} indent negative />
                    <PRow label="Taxable Income" value={data.taxableIncome} bold />
                    <PRow label="CIT Provision @ 32% (Namibia)" value={data.citProvision} indent negative />
                    <PRow label="Net Profit / (Loss)" value={data.netProfit} bold highlight border />
                    <PRow label="Net Margin" value={`${pct(data.netMargin)}`} indent />
                  </Section>
                </CardBody>
              </Card>

              {/* Expense Breakdown Chart */}
              <Card>
                <CardHeader>
                  <h3 className="font-bold text-gray-800">Operating Expense Breakdown</h3>
                  <p className="text-xs text-gray-400">{formatDate(data.period.start)} — {formatDate(data.period.end)}</p>
                </CardHeader>
                <CardBody>
                  {expChartData.length === 0 ? (
                    <p className="text-center text-gray-400 py-10 text-sm">No expense data for this period.</p>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={expChartData} layout="vertical" margin={{ left: 10, right: 20 }}>
                          <XAxis type="number" tickFormatter={v => `N$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v) => [fmt(v), 'Amount']} />
                          <Bar dataKey="amount" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                            {expChartData.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>

                      <div className="mt-3 space-y-1">
                        {expChartData.map((item, i) => (
                          <div key={item.name} className="flex justify-between items-center text-xs">
                            <span className="flex items-center gap-1">
                              <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: COLORS[i % COLORS.length] }} />
                              {item.name}
                            </span>
                            <span className="font-mono text-gray-700">{fmt(item.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  <div className="mt-4 bg-blue-50 rounded-lg p-3 border border-blue-100">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-gray-500">Total Revenue</p>
                        <p className="font-bold text-gray-800">{fmt(data.revenue)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Gross Profit</p>
                        <p className="font-bold text-green-700">{fmt(data.grossProfit)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Total Expenses</p>
                        <p className="font-bold text-red-600">{fmt(data.opExpenses)}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Net Profit</p>
                        <p className={`font-bold ${data.netProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt(data.netProfit)}</p>
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </div>
          )}

          {/* ── Balance Sheet / Financial Position ── */}
          {activeStatement === 'balance' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Scale size={16} className="text-purple-600" />
                    <div>
                      <h3 className="font-bold text-gray-800">Statement of Financial Position</h3>
                      <p className="text-xs text-gray-400">As at {formatDate(data.period.end)}</p>
                    </div>
                  </div>
                </CardHeader>
                <CardBody>
                  <Section title="Current Assets" icon={<TrendingUp size={12} className="text-green-600" />}>
                    <PRow label="Inventory (Stock at DP)" value={data.stockValueDP} indent />
                    <PRow label="Petty Cash Balances" value={data.pcBalance} indent />
                    <PRow label="Cash & Bank Deposits (Period)" value={data.depositsReceived} indent />
                    <PRow label="Total Current Assets" value={data.totalCurrentAssets} bold border />
                  </Section>

                  <Section title="Estimated Liabilities" icon={<FileText size={12} className="text-red-500" />}>
                    <PRow label="Income Tax Payable (CIT @ 32%)" value={data.citProvision} indent negative />
                    <PRow label="VAT Payable (Output–Input)" value={data.vatPayable} indent negative />
                    <PRow label="Accounts Payable (Pending Remittances)" value={data.pendingRemittances} indent negative />
                    <PRow label="Total Liabilities" value={data.totalLiabilities} bold negative border />
                  </Section>

                  <Section title="Net Equity" icon={<Scale size={12} className="text-blue-600" />}>
                    <PRow label="Net Equity (Assets – Liabilities)" value={data.equity} bold highlight border />
                  </Section>

                  <div className="mt-3 bg-amber-50 border border-amber-100 rounded p-2">
                    <p className="text-xs text-amber-700">
                      <strong>Note:</strong> This is an estimated financial position derived from operational data. Fixed assets, long-term liabilities, and full equity structure require a complete chart of accounts from a Chartered Accountant.
                    </p>
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <h3 className="font-bold text-gray-800">Asset Distribution</h3>
                </CardHeader>
                <CardBody>
                  {data.totalCurrentAssets > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'Inventory', value: data.stockValueDP },
                              { name: 'Petty Cash', value: data.pcBalance },
                              { name: 'Cash/Deposits', value: data.depositsReceived },
                            ].filter(d => d.value > 0)}
                            cx="50%" cy="50%" outerRadius={80}
                            dataKey="value"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          >
                            {[0, 1, 2].map(i => <Cell key={i} fill={COLORS[i]} />)}
                          </Pie>
                          <Tooltip formatter={(v) => [fmt(v)]} />
                        </PieChart>
                      </ResponsiveContainer>

                      <div className="space-y-2 mt-2">
                        {[
                          { label: 'Inventory (Stock)', value: data.stockValueDP, color: COLORS[0] },
                          { label: 'Petty Cash', value: data.pcBalance, color: COLORS[1] },
                          { label: 'Cash & Deposits', value: data.depositsReceived, color: COLORS[2] },
                        ].filter(r => r.value > 0).map(r => (
                          <div key={r.label} className="flex justify-between items-center text-sm">
                            <span className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full inline-block" style={{ background: r.color }} />
                              {r.label}
                            </span>
                            <span className="font-mono font-semibold">{fmt(r.value)}</span>
                          </div>
                        ))}
                        <div className="border-t border-gray-200 pt-2 flex justify-between font-bold text-sm">
                          <span>Total Assets</span>
                          <span>{fmt(data.totalCurrentAssets)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-red-600">
                          <span>Total Liabilities</span>
                          <span>({fmt(data.totalLiabilities)})</span>
                        </div>
                        <div className="border-t border-gray-300 pt-2 flex justify-between font-bold text-base">
                          <span>Net Equity</span>
                          <span className={data.equity >= 0 ? 'text-green-700' : 'text-red-600'}>{fmt(data.equity)}</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-center text-gray-400 py-10">No asset data available.</p>
                  )}
                </CardBody>
              </Card>
            </div>
          )}

          {/* ── Tax & Compliance ── */}
          {activeStatement === 'tax' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* VAT Statement */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Receipt size={16} className="text-orange-600" />
                    <div>
                      <h3 className="font-bold text-gray-800">VAT Return Estimate</h3>
                      <p className="text-xs text-gray-400">VAT Act, Namibia — 15% Standard Rate</p>
                    </div>
                  </div>
                </CardHeader>
                <CardBody>
                  <Section title="Output VAT (on Sales)" icon={<TrendingUp size={12} className="text-green-600" />}>
                    <PRow label="Total Revenue (incl. VAT)" value={data.revenue} indent />
                    <PRow label="VAT-exclusive Base" value={data.revenue / (1 + VAT_RATE)} indent />
                    <PRow label="Output VAT @ 15%" value={data.vatOnRevenue} bold />
                  </Section>

                  <Section title="Input VAT (on Purchases)" icon={<FileText size={12} className="text-blue-500" />}>
                    <PRow label="CIF Procurement Cost (incl. VAT)" value={data.cogs} indent />
                    <PRow label="Input VAT @ 15% (claimable)" value={data.vatOnPurchases} bold />
                  </Section>

                  <Section title="Net VAT Payable" icon={<Scale size={12} className="text-red-500" />}>
                    <PRow label="Output VAT" value={data.vatOnRevenue} indent />
                    <PRow label="Less: Input VAT" value={data.vatOnPurchases} indent negative />
                    <PRow label="Net VAT Payable to NamRA" value={data.vatPayable} bold highlight border />
                  </Section>

                  <div className="bg-orange-50 border border-orange-100 rounded p-2 mt-2">
                    <p className="text-xs text-orange-700">
                      <strong>Submission:</strong> VAT returns are due by the 25th of the month following the tax period. Zero-rated supplies (essential medicines) should be separately identified.
                    </p>
                  </div>
                </CardBody>
              </Card>

              {/* CIT + Duties */}
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Building2 size={16} className="text-blue-600" />
                    <div>
                      <h3 className="font-bold text-gray-800">Corporate Tax & Duties</h3>
                      <p className="text-xs text-gray-400">Income Tax Act, Namibia — 32% CIT</p>
                    </div>
                  </div>
                </CardHeader>
                <CardBody>
                  <Section title="Corporate Income Tax (CIT)" icon={<FileText size={12} className="text-blue-600" />}>
                    <PRow label="EBIT (Operating Profit)" value={data.ebit} indent />
                    <PRow label="SSC Employer Deduction" value={data.sscEmployer} indent negative />
                    <PRow label="Taxable Income" value={data.taxableIncome} bold />
                    <PRow label="CIT @ 32% (Standard Rate)" value={data.citProvision} bold negative highlight border />
                  </Section>

                  <Section title="Import Duties (Estimate)" icon={<Receipt size={12} className="text-purple-600" />}>
                    <PRow label="CIF Value of Imports" value={data.cogs} indent />
                    <PRow label="Estimated Import Duty @ 5%" value={data.importDuty} bold negative />
                    <div className="bg-purple-50 border border-purple-100 rounded p-2 mt-1">
                      <p className="text-xs text-purple-700">
                        Pharmaceutical preparations (HS30) attract 0% duty within SACU and under AGOA. The 5% estimate applies to non-SACU, non-AGOA imports. Actual rates vary by HS code and country of origin.
                      </p>
                    </div>
                  </Section>

                  <Section title="Social Security Contributions" icon={<Building2 size={12} className="text-green-600" />}>
                    <PRow label="Employer SSC (0.9%, cap N$81/mth)" value={data.sscEmployer} indent negative />
                    <PRow label="Employee SSC (0.9%, deducted from salary)" value={data.sscEmployer} indent negative />
                    <div className="bg-green-50 border border-green-100 rounded p-2 mt-1">
                      <p className="text-xs text-green-700">
                        SSC contributions are capped at N$81/month per employee (N$9,000/year earnings ceiling). Submit monthly via SSC portal.
                      </p>
                    </div>
                  </Section>

                  <Section title="Total Tax Obligations" icon={<Scale size={12} className="text-red-600" />}>
                    <PRow label="CIT Provision" value={data.citProvision} indent negative />
                    <PRow label="VAT Payable" value={data.vatPayable} indent negative />
                    <PRow label="Estimated Import Duties" value={data.importDuty} indent negative />
                    <PRow label="Total Tax Obligations" value={data.citProvision + data.vatPayable + data.importDuty} bold negative highlight border />
                  </Section>
                </CardBody>
              </Card>
            </div>
          )}

          {/* ── Key Ratios ── */}
          {activeStatement === 'ratios' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  label: 'Gross Profit Margin',
                  value: `${pct(data.grossMargin)}`,
                  sub: 'Gross Profit ÷ Revenue',
                  color: 'green',
                  benchmark: '> 25% is healthy for pharma distribution',
                  good: data.grossMargin > 25,
                },
                {
                  label: 'Net Profit Margin',
                  value: `${pct(data.netMargin)}`,
                  sub: 'Net Profit ÷ Revenue (after CIT)',
                  color: 'blue',
                  benchmark: '> 5% is acceptable',
                  good: data.netMargin > 5,
                },
                {
                  label: 'COGS as % of Revenue',
                  value: data.revenue ? pct(data.cogs / data.revenue * 100) : '—',
                  sub: 'CIF Cost ÷ Revenue',
                  color: 'orange',
                  benchmark: '< 60% is good',
                  good: data.revenue && data.cogs / data.revenue < 0.6,
                },
                {
                  label: 'Operating Expense Ratio',
                  value: data.revenue ? pct(data.opExpenses / data.revenue * 100) : '—',
                  sub: 'OpEx ÷ Revenue',
                  color: 'red',
                  benchmark: '< 20% is efficient',
                  good: data.revenue && data.opExpenses / data.revenue < 0.2,
                },
                {
                  label: 'Effective Tax Rate',
                  value: data.ebit > 0 ? pct(data.citProvision / data.ebit * 100) : '0.0%',
                  sub: 'CIT Provision ÷ EBIT',
                  color: 'purple',
                  benchmark: 'Namibia standard: 32%',
                  good: null,
                },
                {
                  label: 'VAT Recovery Rate',
                  value: data.vatOnRevenue > 0 ? pct(data.vatOnPurchases / data.vatOnRevenue * 100) : '—',
                  sub: 'Input VAT ÷ Output VAT',
                  color: 'teal',
                  benchmark: 'Higher = less VAT to pay',
                  good: null,
                },
              ].map(r => (
                <Card key={r.label}>
                  <CardBody>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{r.label}</p>
                    <p className={`text-3xl font-bold ${r.good === true ? 'text-green-600' : r.good === false ? 'text-red-600' : 'text-gray-800'} mb-1`}>{r.value}</p>
                    <p className="text-xs text-gray-400 mb-2">{r.sub}</p>
                    <div className={`text-xs rounded px-2 py-1 ${r.good === true ? 'bg-green-50 text-green-700' : r.good === false ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600'}`}>
                      {r.good === true ? '✓ ' : r.good === false ? '⚠ ' : ''}{r.benchmark}
                    </div>
                  </CardBody>
                </Card>
              ))}

              {/* Compliance Checklist */}
              <div className="sm:col-span-2 lg:col-span-3">
                <Card>
                  <CardHeader>
                    <h3 className="font-bold text-gray-800">Namibian Compliance Checklist</h3>
                  </CardHeader>
                  <CardBody>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {[
                        { item: 'VAT Return (NamRA)', freq: 'Monthly — due 25th of following month', act: 'Value Added Tax Act 10 of 2000' },
                        { item: 'Corporate Income Tax (CIT)', freq: 'Annual — provisional tax 2× per year', act: 'Income Tax Act 24 of 1981' },
                        { item: 'PAYE Submission', freq: 'Monthly — due 20th of following month', act: 'Income Tax Act — Employees Tax' },
                        { item: 'SSC Contributions', freq: 'Monthly — due last day of month', act: 'Social Security Act 34 of 1994' },
                        { item: 'Import Duty & Customs', freq: 'Per shipment — via NAMCIS system', act: 'Customs & Excise Act 20 of 1998' },
                        { item: 'Annual Financial Statements', freq: 'Annually — within 6 months of year end', act: 'Companies Act 28 of 2004' },
                        { item: 'Transfer Pricing Disclosure', freq: 'If related-party transactions exist', act: 'Income Tax Act Section 95A' },
                        { item: 'Pharmacy Levy', freq: 'Annual — if applicable', act: 'Medicines & Related Substances Act' },
                        { item: 'Withholding Tax on Services', freq: 'On payment — if non-resident services', act: 'Income Tax Act Section 35' },
                      ].map(c => (
                        <div key={c.item} className="bg-gray-50 rounded p-2 border border-gray-100">
                          <p className="text-xs font-semibold text-gray-800">{c.item}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{c.freq}</p>
                          <p className="text-xs text-blue-600 mt-0.5">{c.act}</p>
                        </div>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

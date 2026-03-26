import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import DistributorPerformanceTab from '../../components/DistributorPerformanceTab';
import { api } from '../../lib/api';
import { getLiveProductList, findProductPrice } from '../../lib/pricing';
import { formatCurrency, formatDate, BRANCHES } from '../../lib/constants';
import {
  Tabs, Card, CardBody, CardHeader, Button, Input, StatCard,
  LoadingSpinner, Table, Badge, Alert, Modal,
} from '../../components/ui';
import {
  Briefcase, TrendingUp, DollarSign, BarChart3, Users, Package,
  AlertTriangle, Ship, Globe, Target, Activity,
} from 'lucide-react';
import { useStockRealtime } from '../../hooks/useStockRealtime';

const today = new Date().toISOString().slice(0, 10);
const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

const CHART_COLORS = ['#c41e3a', '#8b0000', '#e05c72', '#b03050', '#d44060',
  '#6b2133', '#a83048', '#cc3355', '#993344', '#dd5566'];

function useDirectorApi(path, params, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams(params).toString();
    api.get(`/director/${path}?${qs}`)
      .then(d => setData(d))
      .catch(e => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, deps);

  return { data, loading, error };
}

export default function DirectorPortal() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [applied, setApplied] = useState({ start: firstOfMonth, end: today });

  const tabs = [
    { id: 'dashboard', label: 'Executive Dashboard', icon: '📊' },
    { id: 'fastMoving', label: 'Fast Moving', icon: '🚀' },
    { id: 'branchAnalysis', label: 'Branch Analysis', icon: '🏢' },
    { id: 'registrations', label: 'Registrations', icon: '📋' },
    { id: 'distributors', label: 'Distributor Network', icon: '👥' },
    { id: 'profitAnalysis', label: 'Profit Analysis', icon: '💰' },
    { id: 'staff', label: 'Staff Services', icon: '👤' },
  ];

  const apply = () => setApplied({ start: startDate, end: endDate });

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-4 items-end justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Briefcase size={24} className="text-primary" /> Director Portal
          </h1>
          <p className="text-sm text-gray-500">Strategic intelligence dashboard — live company data</p>
        </div>
        <div className="flex gap-2 items-end">
          <Input label="From" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          <Input label="To" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          <Button onClick={apply} className="mb-0.5">Apply</Button>
        </div>
      </div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'dashboard' && <DashboardTab start={applied.start} end={applied.end} />}
        {activeTab === 'fastMoving' && <FastMovingTab start={applied.start} end={applied.end} />}
        {activeTab === 'branchAnalysis' && <BranchAnalysisTab start={applied.start} end={applied.end} />}
        {activeTab === 'registrations' && <RegistrationsTab start={applied.start} end={applied.end} />}
        {activeTab === 'distributors' && <DistributorPerformanceTab title="Distributor Network Performance" />}
        {activeTab === 'profitAnalysis' && <ProfitAnalysisTab />}
        {activeTab === 'staff' && <StaffTab />}
      </div>
    </div>
  );
}

function DashboardTab({ start, end }) {
  const { data: summary, loading: sLoad } = useDirectorApi('summary', { startDate: start, endDate: end }, [start, end]);
  const { data: pl, loading: plLoad } = useDirectorApi('profit-loss', { startDate: start, endDate: end }, [start, end]);
  const { data: trends, loading: tLoad } = useDirectorApi('revenue-trends', { startDate: start, endDate: end }, [start, end]);
  const [liveStockSummary, setLiveStockSummary] = useState(null);

  const onStockUpdate = useCallback(() => {
    api.stock.realtime().then(d => { if (d && d.success) setLiveStockSummary(d); }).catch(() => {});
  }, []);

  const { connected: wsConnected } = useStockRealtime({ onUpdate: onStockUpdate });

  useEffect(() => { onStockUpdate(); }, []);

  if (sLoad || plLoad || tLoad) return <LoadingSpinner />;

  const s = summary || {};
  const sales = s.sales || {};
  const stock = s.stock || {};
  const finance = s.finance || {};
  const network = s.network || {};
  const p = pl || {};

  const remittanceDue = finance.remittanceDue || 0;

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Sales Revenue" value={formatCurrency(sales.totalSalesRevenue || 0)} subtitle={`${sales.totalOrders || 0} transactions`} color="blue" icon={<TrendingUp size={24} />} />
        <StatCard title="Monthly Revenue" value={formatCurrency(sales.monthlyRevenue || 0)} subtitle={`${start} → ${end}`} color="green" icon={<DollarSign size={24} />} />
        <StatCard title="CIF Cost of Sales" value={formatCurrency(finance.cifCostOfSales || 0)} subtitle="Import cost" color="red" icon={<Ship size={24} />} />
        <StatCard title="Gross Profit" value={formatCurrency(finance.grossProfit || 0)} subtitle={sales.totalSalesRevenue > 0 ? `${((finance.grossProfit / sales.totalSalesRevenue) * 100).toFixed(1)}% margin` : ''} color={(finance.grossProfit || 0) >= 0 ? 'green' : 'red'} icon={<BarChart3 size={24} />} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Active Branches" value={network.activeBranches || 0} color="purple" icon={<Users size={24} />} />
        <StatCard title="Distributors" value={network.totalDistributors || 0} color="orange" icon={<Package size={24} />} />
        <StatCard title="Total Deposits" value={formatCurrency(finance.totalDeposits || 0)} color="teal" icon={<DollarSign size={24} />} />
        <StatCard title="Remittance Due" value={formatCurrency(remittanceDue)} color={remittanceDue > 0 ? 'red' : 'green'} icon={<AlertTriangle size={24} />} />
      </div>

      {liveStockSummary && (
        <Card className="mb-6 border-primary/20 bg-gradient-to-r from-red-50 to-rose-50">
          <CardBody>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Activity size={16} className="text-primary" /> Live Inventory Snapshot
                {wsConnected && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#dcfce7', color: '#166534', borderRadius: 99, padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />LIVE</span>}
              </h3>
              <span className="text-xs text-gray-400">Updates automatically on stock movements</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(liveStockSummary.stockCards || []).slice(0, 4).map((item, i) => (
                <div key={i} className="bg-white/80 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-500 truncate">{item.name}</p>
                  <p className="text-lg font-bold text-primary">{(item.qty || 0).toLocaleString()}</p>
                  <p className="text-xs text-gray-400">units</p>
                </div>
              ))}
            </div>
            <div className="flex gap-4 text-xs text-gray-500 mt-2">
              <span>Today's sales: {liveStockSummary.todayStats?.salesCount || 0} transactions</span>
              <span>•</span>
              <span>Revenue: {formatCurrency(liveStockSummary.todayStats?.revenue || 0)}</span>
            </div>
          </CardBody>
        </Card>
      )}

      <Card className="mb-6 bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200">
        <CardBody>
          <h3 className="font-bold text-indigo-900 mb-3">Profit &amp; Loss Overview</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'Total Revenue (DP)', value: formatCurrency(p.totalRevenueDP || 0), cls: 'text-blue-700' },
              { label: 'CIF Cost', value: formatCurrency(p.cifCost || 0), cls: 'text-red-600' },
              { label: 'Gross Profit', value: formatCurrency(p.grossProfit || 0), cls: (p.grossProfit || 0) >= 0 ? 'text-green-700' : 'text-red-600' },
              { label: 'Deposits Received', value: formatCurrency(p.depositsReceived || 0), cls: 'text-teal-700' },
              { label: 'Remittance', value: (p.remittanceStatusAmount || 0) <= 0 ? 'Clear' : formatCurrency(p.remittanceStatusAmount), cls: (p.remittanceStatusAmount || 0) <= 0 ? 'text-green-700' : 'text-orange-600' },
              { label: 'Bonus Payout', value: formatCurrency(p.bonusPayout || 0), cls: 'text-purple-700' },
            ].map(({ label, value, cls }) => (
              <div key={label} className="bg-white/80 rounded-lg p-3">
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-base font-bold ${cls}`}>{value}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-indigo-600 mt-2 font-medium">
            Gross Profit = DP Revenue − CIF Cost &nbsp;|&nbsp; Net = Gross Profit − Rent − Overheads − Bonus
          </p>
        </CardBody>
      </Card>

      {remittanceDue > 0 && (
        <Alert type="warning" className="mb-6">
          <strong>Remittance Due:</strong> {formatCurrency(remittanceDue)} outstanding to supplier. Coordinate with Finance department.
        </Alert>
      )}

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Revenue Trends</h3></CardHeader>
          <CardBody>
            <div className="space-y-3">
              {[
                { label: 'Total Orders', value: trends?.totalOrders || 0, cls: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Walk-in Sales Count', value: trends?.walkinSalesCount || 0, cls: 'text-green-600', bg: 'bg-green-50' },
                { label: 'Product Range', value: trends?.productRange || 0, cls: 'text-purple-600', bg: 'bg-purple-50' },
                { label: 'Avg Order Value', value: formatCurrency(trends?.avgOrderValue || 0), cls: 'text-orange-600', bg: 'bg-orange-50' },
                { label: 'Member Sales', value: formatCurrency(trends?.memberSales || 0), cls: 'text-teal-600', bg: 'bg-teal-50' },
                { label: 'Prescription Revenue', value: formatCurrency(trends?.prescriptionSales || 0), cls: 'text-pink-600', bg: 'bg-pink-50' },
              ].map(({ label, value, cls, bg }) => (
                <div key={label} className={`flex justify-between items-center p-3 ${bg} rounded-lg`}>
                  <span className="text-sm text-gray-700">{label}</span>
                  <span className={`font-bold ${cls}`}>{value}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Stock &amp; Network Health</h3></CardHeader>
          <CardBody>
            <div className="space-y-3">
              {[
                { label: 'Total Company Stock (units)', value: stock.totalCompanyStockQty || 0, cls: 'text-gray-700', bg: 'bg-gray-50' },
                { label: 'Warehouse Stock', value: stock.totalWarehouseStockQty || 0, cls: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Branch Stock', value: stock.totalBranchStockQty || 0, cls: 'text-green-600', bg: 'bg-green-50' },
                { label: 'In-Transit', value: stock.totalInTransitQty || 0, cls: 'text-orange-600', bg: 'bg-orange-50' },
                { label: 'Low Stock Items', value: stock.lowStockCount || 0, cls: stock.lowStockCount > 0 ? 'text-red-600' : 'text-green-600', bg: stock.lowStockCount > 0 ? 'bg-red-50' : 'bg-green-50' },
                { label: 'Expiring (90 days)', value: stock.expiringCount || 0, cls: stock.expiringCount > 0 ? 'text-yellow-600' : 'text-green-600', bg: stock.expiringCount > 0 ? 'bg-yellow-50' : 'bg-green-50' },
                { label: 'Countrywide Registrations', value: network.registrationsCountrywide || 0, cls: 'text-teal-600', bg: 'bg-teal-50' },
              ].map(({ label, value, cls, bg }) => (
                <div key={label} className={`flex justify-between items-center p-2 ${bg} rounded-lg`}>
                  <span className="text-sm text-gray-700">{label}</span>
                  <span className={`font-bold ${cls}`}>{value}</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function FastMovingTab({ start, end }) {
  const [productMode, setProductMode] = useState('units');
  const [branchMode, setBranchMode] = useState('revenue');

  const { data: fmProducts, loading: pmLoad } = useDirectorApi('products/fast-moving', { startDate: start, endDate: end, limit: 15 }, [start, end]);
  const { data: fmBranches, loading: bmLoad } = useDirectorApi('branches/fast-moving', { startDate: start, endDate: end }, [start, end]);
  const { data: fmByBranch, loading: fbbLoad } = useDirectorApi('products/fast-moving-by-branch', { startDate: start, endDate: end, limit: 5 }, [start, end]);

  const products = (fmProducts?.products || []).slice(0, 15);
  const branches = fmBranches?.branches || [];

  const productChartData = products.map(p => ({
    name: p.productName?.length > 30 ? p.productName.slice(0, 28) + '…' : p.productName,
    units: p.unitsSold,
    revenue: p.salesRevenue,
  }));

  const branchChartData = branches.map(b => ({
    name: b.branchName?.length > 18 ? b.branchName.slice(0, 16) + '…' : b.branchName,
    salesUnits: b.salesUnits,
    salesRevenue: b.salesRevenue,
    grossProfit: b.grossProfit,
  }));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Fast Moving Products</h3>
            <div className="flex gap-2">
              <Button size="sm" variant={productMode === 'units' ? 'primary' : 'secondary'} onClick={() => setProductMode('units')}>By Units</Button>
              <Button size="sm" variant={productMode === 'revenue' ? 'primary' : 'secondary'} onClick={() => setProductMode('revenue')}>By Revenue</Button>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {pmLoad ? <LoadingSpinner /> : products.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">No sales data for this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(products.length * 36, 200)}>
              <BarChart layout="vertical" data={productChartData} margin={{ left: 10, right: 30, top: 4, bottom: 4 }}>
                <XAxis type="number" tick={{ fontSize: 11 }}
                  tickFormatter={v => productMode === 'revenue' ? `N$${v.toLocaleString()}` : v} />
                <YAxis type="category" dataKey="name" width={220} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => productMode === 'revenue' ? formatCurrency(v) : v + ' units'} />
                <Bar dataKey={productMode === 'units' ? 'units' : 'revenue'} fill="#c41e3a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-gray-800">Fast Moving Branches</h3>
              <div className="flex gap-1">
                {['revenue', 'salesUnits', 'grossProfit'].map(m => (
                  <button key={m} onClick={() => setBranchMode(m)}
                    className={`px-2 py-0.5 text-xs rounded ${branchMode === m ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {m === 'salesUnits' ? 'Units' : m === 'grossProfit' ? 'Profit' : 'Revenue'}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardBody>
            {bmLoad ? <LoadingSpinner /> : branchChartData.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No branch data for this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={branchChartData.slice(0, 10)} margin={{ left: 4, right: 16, top: 4, bottom: 40 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => branchMode === 'salesUnits' ? v : `N$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => branchMode === 'salesUnits' ? v + ' units' : formatCurrency(v)} />
                  <Bar dataKey={branchMode} fill="#8b0000" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Top Products by Branch</h3></CardHeader>
          <CardBody>
            {fbbLoad ? <LoadingSpinner /> : (fmByBranch?.branches || []).length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No data for this period.</p>
            ) : (
              <div className="space-y-4 max-h-72 overflow-y-auto">
                {(fmByBranch?.branches || []).map(b => (
                  <div key={b.branchId}>
                    <p className="text-sm font-bold text-gray-700 mb-1">{b.branchName}</p>
                    <div className="space-y-1">
                      {b.products.map((p, i) => (
                        <div key={p.productName} className="flex justify-between text-xs px-2 py-1 bg-gray-50 rounded">
                          <span className="text-gray-600 truncate max-w-[180px]">{i + 1}. {p.productName}</span>
                          <span className="font-medium text-primary ml-2 shrink-0">{p.unitsSold} units</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Fast Moving Products — Detail Table</h3></CardHeader>
        <Table
          columns={[
            { header: '#', render: (r, i) => <span className="text-gray-400 font-mono text-xs">{i + 1}</span> },
            { header: 'Product', key: 'productName' },
            { header: 'Units Sold', render: r => <span className="font-bold text-primary">{r.unitsSold.toLocaleString()}</span> },
            { header: 'Sales Revenue', render: r => <span className="text-green-700 font-medium">{formatCurrency(r.salesRevenue)}</span> },
            { header: 'Branches Active', render: r => <Badge variant="info">{r.branchesActive}</Badge> },
          ]}
          data={products}
          emptyMessage="No product sales data for this period."
        />
      </Card>
    </div>
  );
}

function BranchAnalysisTab({ start, end }) {
  const { data: perf, loading: perfLoad } = useDirectorApi('branches/performance', { startDate: start, endDate: end }, [start, end]);
  const { data: contrib, loading: cLoad } = useDirectorApi('branches/revenue-contribution', { startDate: start, endDate: end }, [start, end]);

  const branches = perf?.branches || [];
  const contribBranches = (contrib?.branches || []).filter(b => b.salesRevenue > 0);

  const pieData = contribBranches.map(b => ({
    name: b.branchName,
    value: b.contributionPercent,
    revenue: b.salesRevenue,
  }));

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Revenue Contribution by Branch</h3></CardHeader>
          <CardBody>
            {cLoad ? <LoadingSpinner /> : pieData.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No revenue data for this period.</p>
            ) : (
              <div>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                      label={({ name, value }) => `${value}%`} labelLine={false}>
                      {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v, n, p) => [`${v}% (${formatCurrency(p.payload.revenue)})`, n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 grid grid-cols-2 gap-1">
                  {pieData.map((b, i) => (
                    <div key={b.name} className="flex items-center gap-1 text-xs">
                      <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="truncate text-gray-600">{b.name}</span>
                      <span className="ml-auto font-bold text-gray-800 shrink-0">{b.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Revenue Contribution — Top Branches</h3></CardHeader>
          <CardBody>
            {cLoad ? <LoadingSpinner /> : contribBranches.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No revenue data.</p>
            ) : (
              <div className="space-y-2">
                {contribBranches.map((b, i) => (
                  <div key={b.branchId}>
                    <div className="flex justify-between text-sm mb-0.5">
                      <span className="font-medium text-gray-700">{b.branchName}</span>
                      <span className="text-primary font-bold">{b.contributionPercent}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="h-2 rounded-full" style={{
                        width: `${b.contributionPercent}%`,
                        backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                      }} />
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 text-right">{formatCurrency(b.salesRevenue)}</p>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Branch Expense &amp; Burden Analysis</h3></CardHeader>
        {perfLoad ? <CardBody><LoadingSpinner /></CardBody> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-left">
                  {['Branch', 'Sales Revenue', 'Contrib %', 'CIF Cost', 'Gross Profit',
                    'Rent', 'Overheads', 'Bonus', 'Net Contribution', 'Transactions'].map(h => (
                    <th key={h} className="px-3 py-2.5 font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {branches.map(b => (
                  <tr key={b.branchId} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-800">{b.branchName}</td>
                    <td className="px-3 py-2 text-green-700 font-bold">{formatCurrency(b.salesRevenue)}</td>
                    <td className="px-3 py-2">
                      <span className={`font-bold ${b.revenueContributionPercent >= 20 ? 'text-green-600' : b.revenueContributionPercent >= 5 ? 'text-blue-600' : 'text-gray-400'}`}>
                        {b.revenueContributionPercent}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-red-600">{formatCurrency(b.cifCost)}</td>
                    <td className="px-3 py-2">
                      <span className={`font-bold ${b.grossProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatCurrency(b.grossProfit)}</span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{formatCurrency(b.rentExpense)}</td>
                    <td className="px-3 py-2 text-gray-600">{formatCurrency(b.monthlyOverheads)}</td>
                    <td className="px-3 py-2 text-purple-600">{formatCurrency(b.bonusPayout)}</td>
                    <td className="px-3 py-2">
                      <span className={`font-bold ${b.netContributionAfterExpenses >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {formatCurrency(b.netContributionAfterExpenses)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center"><Badge variant="info">{b.transactions}</Badge></td>
                  </tr>
                ))}
                {branches.length === 0 && (
                  <tr><td colSpan={10} className="px-3 py-6 text-center text-gray-400">No branch data for this period.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function RegistrationsTab({ start, end }) {
  const { data, loading } = useDirectorApi('registrations/summary', { startDate: start, endDate: end }, [start, end]);

  const branches = data?.branches || [];
  const chartData = branches.slice(0, 15).map(b => ({
    name: b.branchName?.length > 18 ? b.branchName.slice(0, 16) + '…' : b.branchName,
    count: b.registrationsCount,
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gradient-to-r from-teal-50 to-cyan-50 border-teal-200">
          <CardBody>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center">
                <Users size={28} className="text-teal-600" />
              </div>
              <div>
                <p className="text-sm text-teal-700">Total Countrywide Registrations</p>
                <p className="text-4xl font-bold text-teal-900">{(data?.countrywideRegistrations || 0).toLocaleString()}</p>
                <p className="text-xs text-teal-600 mt-1">{start} to {end}</p>
              </div>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <h3 className="font-bold text-gray-700 mb-2">Registrations by DPC</h3>
            {loading ? <LoadingSpinner /> : chartData.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No registrations for this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ left: 0, right: 12, top: 4, bottom: 40 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Registrations" fill="#c41e3a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Registrations per DPC</h3></CardHeader>
        {loading ? <CardBody><LoadingSpinner /></CardBody> : (
          <Table
            columns={[
              { header: '#', render: (r, i) => <span className="text-gray-400 text-xs">{i + 1}</span> },
              { header: 'Branch / DPC', key: 'branchName' },
              { header: 'Registrations', render: r => <span className="font-bold text-primary text-lg">{r.registrationsCount.toLocaleString()}</span> },
              {
                header: 'Share', render: r => {
                  const total = data?.countrywideRegistrations || 1;
                  const pct = ((r.registrationsCount / total) * 100).toFixed(1);
                  return (
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-gray-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-600">{pct}%</span>
                    </div>
                  );
                }
              },
            ]}
            data={branches}
            emptyMessage="No registrations for this period."
          />
        )}
      </Card>
    </div>
  );
}

function ProfitAnalysisTab() {
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [campaignPrices, setCampaignPrices] = useState({});
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [campaignPrice, setCampaignPrice] = useState('');

  useEffect(() => {
    Promise.all([
      api.orders.list().then(d => Array.isArray(d) ? d : d.orders || []).catch(() => []),
      api.branch.walkinSales().then(d => Array.isArray(d) ? d : d.sales || d.walkin_sales || []).catch(() => []),
    ]).then(([orders, walkinSales]) => {
      const allItems = [];
      const processItems = (items) => {
        (items || []).forEach(item => {
          const rawName = item.name || item.product_name || 'Unknown';
          const matched = findProductPrice(rawName);
          allItems.push({ product_name: matched ? matched.description : rawName, quantity: Number(item.quantity || item.qty || 1) });
        });
      };
      orders.forEach(o => processItems(o.items));
      walkinSales.forEach(s => processItems(s.items));
      setSalesData(allItems);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const byProduct = {};
  salesData.forEach(s => {
    if (!byProduct[s.product_name]) byProduct[s.product_name] = 0;
    byProduct[s.product_name] += s.quantity;
  });

  const profitRows = getLiveProductList().map(p => {
    const qtySold = byProduct[p.description] || 0;
    const campaign = campaignPrices[p.description];
    const sellingPrice = campaign || p.dp;
    const profit = sellingPrice - p.cif;
    const totalProfit = profit * qtySold;
    const margin = p.cif > 0 ? ((profit / sellingPrice) * 100) : 0;
    return { product_name: p.description, cif: p.cif, dp: p.dp, cp: p.cp, campaign_price: campaign || null, selling_price: sellingPrice, profit_per_unit: profit, margin: Math.round(margin * 10) / 10, qty_sold: qtySold, total_profit: totalProfit };
  }).sort((a, b) => b.total_profit - a.total_profit);

  const totalCIF = profitRows.reduce((s, r) => s + r.cif * r.qty_sold, 0);
  const totalRevenue = profitRows.reduce((s, r) => s + r.selling_price * r.qty_sold, 0);
  const grandProfit = profitRows.reduce((s, r) => s + r.total_profit, 0);
  const avgMargin = totalRevenue > 0 ? ((grandProfit / totalRevenue) * 100).toFixed(1) : '0';

  const saveCampaign = () => {
    if (editingCampaign && campaignPrice) setCampaignPrices(prev => ({ ...prev, [editingCampaign]: Number(campaignPrice) }));
    setEditingCampaign(null);
    setCampaignPrice('');
  };

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200">
        <CardBody>
          <div className="flex items-start gap-4">
            <TrendingUp size={32} className="text-emerald-600 mt-1" />
            <div>
              <h3 className="font-bold text-emerald-900">Profit Analysis — CIF vs DP</h3>
              <p className="text-sm text-emerald-700 mt-1">Stock is imported from Malaysia at CIF price. Sold at DP (Distributor Price). Profit = DP − CIF per unit.</p>
            </div>
          </div>
        </CardBody>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Total CIF Cost" value={formatCurrency(totalCIF)} color="red" icon={<Ship size={24} />} />
        <StatCard title="Total Revenue (DP)" value={formatCurrency(totalRevenue)} color="blue" icon={<DollarSign size={24} />} />
        <StatCard title="Gross Profit" value={formatCurrency(grandProfit)} color="green" icon={<TrendingUp size={24} />} />
        <StatCard title="Avg Margin" value={`${avgMargin}%`} color="purple" icon={<BarChart3 size={24} />} />
      </div>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Product Profit Breakdown</h3>
            <Badge variant="info">{profitRows.filter(r => r.qty_sold > 0).length} products with sales</Badge>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                {['Product', 'CIF', 'DP', 'Campaign', 'Profit/Unit', 'Margin', 'Qty Sold', 'Total Profit', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 font-semibold text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {profitRows.map(r => (
                <tr key={r.product_name} className={`border-b border-gray-100 hover:bg-gray-50 ${r.qty_sold > 0 ? '' : 'opacity-50'}`}>
                  <td className="px-4 py-2.5 text-gray-800 max-w-[250px] truncate" title={r.product_name}>{r.product_name}</td>
                  <td className="px-4 py-2.5 text-right text-red-600 font-medium">{formatCurrency(r.cif)}</td>
                  <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(r.dp)}</td>
                  <td className="px-4 py-2.5 text-right">{r.campaign_price ? <span className="text-orange-600 font-medium">{formatCurrency(r.campaign_price)}</span> : '-'}</td>
                  <td className="px-4 py-2.5 text-right text-green-700 font-bold">{formatCurrency(r.profit_per_unit)}</td>
                  <td className="px-4 py-2.5 text-right"><span className={`font-medium ${r.margin >= 50 ? 'text-green-600' : r.margin >= 30 ? 'text-blue-600' : 'text-orange-600'}`}>{r.margin}%</span></td>
                  <td className="px-4 py-2.5 text-right font-medium">{r.qty_sold > 0 ? r.qty_sold : '-'}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-green-700">{r.total_profit > 0 ? formatCurrency(r.total_profit) : '-'}</td>
                  <td className="px-4 py-2.5">
                    <button className="text-xs text-blue-600 hover:underline" onClick={() => { setEditingCampaign(r.product_name); setCampaignPrice(String(r.campaign_price || r.dp)); }}>Set Campaign</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Modal open={!!editingCampaign} onClose={() => setEditingCampaign(null)} title={`Campaign Price: ${editingCampaign}`} size="sm">
        <div className="p-6 space-y-4">
          {editingCampaign && (() => { const prod = getLiveProductList().find(p => p.description === editingCampaign); return prod ? <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded"><p>CIF: {formatCurrency(prod.cif)} | DP: {formatCurrency(prod.dp)} | CP: {formatCurrency(prod.cp)}</p></div> : null; })()}
          <Input label="Campaign Selling Price (N$)" type="number" min="0" step="0.01" value={campaignPrice} onChange={e => setCampaignPrice(e.target.value)} />
          <div className="flex gap-3">
            <Button onClick={saveCampaign}>Apply Campaign Price</Button>
            <Button variant="secondary" onClick={() => { setCampaignPrices(prev => { const n = { ...prev }; delete n[editingCampaign]; return n; }); setEditingCampaign(null); }}>Reset to DP</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function StaffTab() {
  const [form, setForm] = useState({ request_type: 'leave', leave_type: 'Annual', start_date: '', end_date: '', reason: '', amount: '' });
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.reason) { setMessage('Error: Please provide a reason.'); return; }
    setSubmitting(true);
    try {
      if (form.request_type === 'leave') {
        await api.post('/employees/leaves', { leave_type: form.leave_type, start_date: form.start_date, end_date: form.end_date, reason: form.reason, department: 'Executive' });
      } else {
        await api.branch.createCashMovement({ type: 'request', amount: Number(form.amount), reason: form.reason, department: 'Executive' });
      }
      setMessage('Request submitted successfully!');
      setForm({ request_type: 'leave', leave_type: 'Annual', start_date: '', end_date: '', reason: '', amount: '' });
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader><h3 className="font-bold text-gray-800">Executive Services</h3></CardHeader>
      <CardBody>
        {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} className="mb-4">{message}</Alert>}
        <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Request Type</label>
            <select value={form.request_type} onChange={e => setForm({ ...form, request_type: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
              <option value="leave">Leave Request</option>
              <option value="cash">Cash Request</option>
            </select>
          </div>
          {form.request_type === 'leave' && (
            <>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Leave Type</label>
                <select value={form.leave_type} onChange={e => setForm({ ...form, leave_type: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                  <option>Annual</option><option>Sick</option><option>Personal</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Start Date" type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                <Input label="End Date" type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
              </div>
            </>
          )}
          {form.request_type === 'cash' && (
            <Input label="Amount" type="number" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="Enter amount" />
          )}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Reason</label>
            <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 min-h-[80px] resize-y"
              placeholder="Provide details..." />
          </div>
          <Button type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit Request'}</Button>
        </form>
      </CardBody>
    </Card>
  );
}

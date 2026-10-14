import SavedSaleProfitReport from '../../components/SavedSaleProfitReport';
import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import DistributorPerformanceTab from '../../components/DistributorPerformanceTab';
import DailySalesCard from '../../components/DailySalesCard';
import { api } from '../../lib/api';
import { setLivePrices } from '../../lib/pricing';
import { formatCurrency, formatDate, BRANCHES, BRANCH_DETAILS } from '../../lib/constants';
import {
  Tabs, Card, CardBody, CardHeader, Button, Input, StatCard,
  LoadingSpinner, Table, Badge, Alert, Modal,
} from '../../components/ui';
import {
  Briefcase, TrendingUp, DollarSign, BarChart3, Users, Package,
  AlertTriangle, Ship, Globe, Target, Activity, Wallet, CheckCircle, XCircle,
} from 'lucide-react';

import { useStockRealtime } from '../../hooks/useStockRealtime';
import AccountsTab from '../../components/AccountsTab';
import SalaryLedgerTab from '../../components/SalaryLedgerTab';
import StaffServicesTab from '../../components/StaffServicesTab';
import StaffMessagesTab from '../../components/StaffMessagesTab';

const BRANCH_NAME_MAP_D = Object.fromEntries(BRANCH_DETAILS.map(b => [b.id, b.name]));
const branchLabelD = (id) => BRANCH_NAME_MAP_D[id] || (id === 'head_office' ? 'Head Office' : id || '—');

const _pad = (n) => String(n).padStart(2, '0');
const _localDate = (d) => `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`;
const _now = new Date();
const today = _localDate(_now);
const firstOfMonth = _localDate(new Date(_now.getFullYear(), _now.getMonth(), 1));

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

  useEffect(() => {
    api.prices.list().then(data => {
      if (Array.isArray(data) && data.length > 0) setLivePrices(data);
    }).catch(() => {});
  }, []);

  const tabs = [
    { id: 'dashboard', label: 'Executive Dashboard', icon: '📊' },
    { id: 'fastMoving', label: 'Fast Moving', icon: '🚀' },
    { id: 'branchAnalysis', label: 'Branch Analysis', icon: '🏢' },
    { id: 'registrations', label: 'Registrations', icon: '📋' },
    { id: 'distributors', label: 'Distributor Network', icon: '👥' },
    { id: 'profitAnalysis', label: 'Profit Analysis', icon: '💰' },
    { id: 'accounts', label: 'Accounts', icon: '📒' },
    { id: 'salary', label: 'Salary Ledger', icon: '💼' },
    { id: 'financeApprovals', label: 'Finance Approvals', icon: '💵' },
    { id: 'staff', label: 'Staff Services', icon: '👤' },
    { id: 'messages', label: 'My Messages', icon: '📨' },
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
        {activeTab === 'profitAnalysis' && <SavedSaleProfitReport />}
        {activeTab === 'accounts' && <AccountsTab role="director" />}
        {activeTab === 'salary' && <SalaryLedgerTab role="director" />}
        {activeTab === 'financeApprovals' && <FinanceApprovalsTab />}
        {activeTab === 'staff' && <StaffTab />}
        {activeTab === 'messages' && <StaffMessagesTab accentColor="#1e3a5f" />}
      </div>
    </div>
  );
}

function DashboardTab({ start, end }) {
  const { data: summary, loading: sLoad } = useDirectorApi('summary', { startDate: start, endDate: end }, [start, end]);
  const { data: trends, loading: tLoad } = useDirectorApi('revenue-trends', { startDate: start, endDate: end }, [start, end]);
  const [liveStockSummary, setLiveStockSummary] = useState(null);

  const onStockUpdate = useCallback(() => {
    api.stock.realtime().then(d => { if (d && d.success) setLiveStockSummary(d); }).catch(() => {});
  }, []);

  const { connected: wsConnected } = useStockRealtime({ onUpdate: onStockUpdate });

  useEffect(() => { onStockUpdate(); }, []);

  if (sLoad || tLoad) return <LoadingSpinner />;

  const s = summary || {};
  const sales = s.sales || {};
  const stock = s.stock || {};
  const finance = s.finance || {};
  const network = s.network || {};

  const totalSalesRevenue = sales.totalSalesRevenue || 0;
  const cifCostOfSales = finance.cifCostOfSales || 0;
  const grossProfit = finance.grossProfit || 0;
  const totalDeposits = finance.totalDeposits || 0;
  const remittanceDue = finance.remittanceDue || 0;
  const bonusPayout = finance.bonusPayout || 0;
  const totalOrders = sales.totalOrders || 0;

  return (
    <div>
      <DailySalesCard className="mb-6" />
      {finance.originalEvidence && <div className="mb-6 rounded-lg border border-red-100 bg-white p-3 text-sm text-gray-700">
        <strong>Original-evidence gross profit: </strong>
        {finance.originalEvidence.financialComplete
          ? formatCurrency(finance.originalEvidence.grossProfitAfterReturns)
          : `Unavailable — ${finance.originalEvidence.missingFinancialCostQuantity || 0} units missing original cost, ${finance.originalEvidence.missingFinancialRevenueQuantity || 0} units missing charged revenue, ${finance.originalEvidence.unmatchedSaleRecords || 0} unmatched receipts.`}
        <span> This is separate from the estimated DP margin below.</span>
      </div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Sales Revenue" value={formatCurrency(totalSalesRevenue)} subtitle={`${totalOrders} transactions`} color="blue" icon={<TrendingUp size={24} />} />
        <StatCard title="Estimated CIF Cost" value={formatCurrency(cifCostOfSales)} subtitle="May use current price-list cost" color="red" icon={<Ship size={24} />} />
        <StatCard title="Estimated DP Margin" value={formatCurrency(grossProfit)} subtitle="Not original-evidence gross profit" color={grossProfit >= 0 ? 'green' : 'red'} icon={<BarChart3 size={24} />} />
        <StatCard title="Remittance Due" value={formatCurrency(remittanceDue)} color={remittanceDue > 0 ? 'red' : 'green'} icon={<AlertTriangle size={24} />} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Active Branches" value={network.activeBranches || 0} color="purple" icon={<Users size={24} />} />
        <StatCard title="Distributors" value={network.totalDistributors || 0} color="orange" icon={<Package size={24} />} />
        <StatCard title="Total Deposits" value={formatCurrency(totalDeposits)} color="teal" icon={<DollarSign size={24} />} />
        <StatCard title="Total Orders" value={totalOrders} color="green" icon={<DollarSign size={24} />} />
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
              <span>Net DP: {formatCurrency(liveStockSummary.todayStats?.revenue || 0)}{liveStockSummary.todayStats?.dpComplete===false?' · incomplete evidence':''}</span>
            </div>
          </CardBody>
        </Card>
      )}

      <Card className="mb-6 bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200">
        <CardBody>
          <h3 className="font-bold text-indigo-900 mb-3">Profit &amp; Loss Overview</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'Total Revenue (DP)', value: formatCurrency(totalSalesRevenue), cls: 'text-blue-700' },
              { label: 'Estimated CIF Cost', value: formatCurrency(cifCostOfSales), cls: 'text-red-600' },
              { label: 'Estimated DP Margin', value: formatCurrency(grossProfit), cls: grossProfit >= 0 ? 'text-green-700' : 'text-red-600' },
              { label: 'Deposits Received', value: formatCurrency(totalDeposits), cls: 'text-teal-700' },
              { label: 'Remittance', value: remittanceDue <= 0 ? 'Clear' : formatCurrency(remittanceDue), cls: remittanceDue <= 0 ? 'text-green-700' : 'text-orange-600' },
              { label: 'Bonus Payout', value: formatCurrency(bonusPayout), cls: 'text-purple-700' },
            ].map(({ label, value, cls }) => (
              <div key={label} className="bg-white/80 rounded-lg p-3">
                <p className="text-xs text-gray-500">{label}</p>
                <p className={`text-base font-bold ${cls}`}>{value}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-indigo-600 mt-2 font-medium">
            Estimated DP margin = DP revenue − estimated CIF cost. This is not matched-original charged-revenue gross profit.
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

function StaffTab() {
  return <StaffServicesTab accentColor="#1e3a5f" />;
}

function FinanceApprovalsTab() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [issueModal, setIssueModal] = useState(null);
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [financeNotices, setFinanceNotices] = useState([]);
  const [noticesLoading, setNoticesLoading] = useState(true);

  const loadRequests = () => {
    setLoading(true);
    api.finance.pettyCash.requests()
      .then(d => setRequests((d.requests || []).filter(r => r.status === 'pending_director')))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRequests();
    api.finance.notices()
      .then(d => setFinanceNotices(Array.isArray(d) ? d : d.notices || []))
      .catch(() => setFinanceNotices([]))
      .finally(() => setNoticesLoading(false));
  }, []);

  const handleIssue = async () => {
    if (!issueModal) return;
    setProcessing(true);
    try {
      await api.finance.pettyCash.issue(issueModal.id, notes);
      setRequests(prev => prev.filter(r => r.id !== issueModal.id));
      setMessage('✅ Funds issued — branch petty cash account has been credited.');
      setIssueModal(null);
      setNotes('');
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async (req) => {
    setProcessing(true);
    try {
      await api.finance.pettyCash.reject(req.id, 'Rejected by Director');
      setRequests(prev => prev.filter(r => r.id !== req.id));
      setMessage('❌ Petty cash request rejected.');
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {message && (
        <Alert variant={message.startsWith('✅') ? 'success' : message.startsWith('❌') ? 'error' : 'error'}
          onClose={() => setMessage('')}>{message}</Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="text-blue-600">📋</span>
            <h3 className="font-bold text-gray-800">Finance Notices</h3>
            {financeNotices.length > 0 && <Badge variant="info">{financeNotices.length}</Badge>}
          </div>
        </CardHeader>
        <CardBody>
          {noticesLoading ? <LoadingSpinner /> : financeNotices.length === 0 ? (
            <p className="text-sm text-gray-500 py-3 text-center">No finance notices posted.</p>
          ) : (
            <div className="space-y-3">
              {financeNotices.slice(0, 5).map(n => (
                <div key={n.id} className="border border-blue-100 rounded-lg p-3 bg-blue-50/40">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant={n.priority === 'Urgent' ? 'danger' : n.priority === 'Info' ? 'success' : 'info'}>{n.priority || 'Normal'}</Badge>
                    {n.title && <span className="font-semibold text-sm text-gray-900">{n.title}</span>}
                    <span className="text-xs text-gray-400">{n.createdAt || n.created_at ? new Date(n.createdAt || n.created_at).toLocaleString('en-NA') : ''}</span>
                    {n.createdBy && <span className="text-xs text-gray-400">by {n.createdBy}</span>}
                  </div>
                  <p className="text-sm text-gray-700">{n.message}</p>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wallet size={18} className="text-green-600" />
            <h3 className="font-bold text-gray-800">Petty Cash — Pending Issuance</h3>
          </div>
        </CardHeader>
        <CardBody>
          {requests.length === 0 ? (
            <p className="text-center text-gray-400 py-8">No petty cash requests awaiting issuance.</p>
          ) : (
            <div className="space-y-3">
              {requests.map(req => (
                <div key={req.id} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="primary">💵 Petty Cash</Badge>
                        <span className="font-bold text-gray-800">#{req.id}</span>
                        <span className="text-xs text-gray-400">
                          {req.created_at ? new Date(req.created_at).toLocaleDateString() : ''}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-gray-700">
                        {req.created_by_name || req.created_by || '—'}
                        <span className="ml-2 text-xs font-normal text-gray-400">
                          {branchLabelD(req.location)}
                        </span>
                      </p>
                      <p className="text-sm text-gray-600 mt-1">{req.purpose || '—'}</p>
                      <p className="text-xl font-bold text-green-700 mt-1">{formatCurrency(req.amount)}</p>
                      {req.gm_notes && (
                        <p className="text-xs text-gray-400 mt-1">GM note: {req.gm_notes}</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setIssueModal(req); setNotes(''); }}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 cursor-pointer"
                      >
                        <CheckCircle size={13} /> Issue Funds
                      </button>
                      <button
                        onClick={() => handleReject(req)}
                        disabled={processing}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 cursor-pointer"
                      >
                        <XCircle size={13} /> Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {issueModal && (
        <Modal title="Issue Petty Cash" onClose={() => setIssueModal(null)}>
          <div className="space-y-4 p-4">
            <div className="bg-green-50 rounded-lg p-3 border border-green-100">
              <p className="text-sm text-gray-600">{issueModal.purpose}</p>
              <p className="text-2xl font-bold text-green-700 mt-1">{formatCurrency(issueModal.amount)}</p>
              <p className="text-xs text-gray-400">For {branchLabelD(issueModal.location)}</p>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Director Notes (optional)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[70px] resize-y"
                placeholder="Any notes for Finance team..."
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={handleIssue} disabled={processing} className="flex-1">
                {processing ? 'Processing…' : `Confirm & Issue ${formatCurrency(issueModal.amount)}`}
              </Button>
              <Button variant="secondary" onClick={() => setIssueModal(null)} className="flex-1">Cancel</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

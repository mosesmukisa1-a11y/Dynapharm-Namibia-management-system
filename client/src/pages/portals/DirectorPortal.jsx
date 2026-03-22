import { useState, useEffect } from 'react';
import DistributorPerformanceTab from '../../components/DistributorPerformanceTab';
import { api } from '../../lib/api';
import { PRICE_LIST, getCIFPrice, findProductPrice, getLiveProductList } from '../../lib/pricing';
import { formatCurrency, formatDateTime, formatDate, BRANCHES } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, StatCard, LoadingSpinner, EmptyState, Table, Badge, Alert, Select, Modal } from '../../components/ui';
import { Briefcase, TrendingUp, DollarSign, BarChart3, Users, Package, ClipboardList, Target, Globe, Ship, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function DirectorPortal() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const tabs = [
    { id: 'dashboard', label: 'Executive Dashboard', icon: '📊' },
    { id: 'branches', label: 'Branch Overview', icon: '🏢' },
    { id: 'distributors', label: 'Distributor Network', icon: '👥' },
    { id: 'profitAnalysis', label: 'Profit Analysis', icon: '💰' },
    { id: 'staff', label: 'Staff Services', icon: '👤' },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Briefcase size={24} className="text-primary" /> Director Portal
        </h1>
        <p className="text-sm text-gray-500">Strategic KPIs and executive oversight</p>
      </div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'branches' && <BranchOverviewTab />}
        {activeTab === 'distributors' && <DistributorPerformanceTab title="Distributor Network Performance" />}
        {activeTab === 'profitAnalysis' && <ProfitAnalysisTab />}
        {activeTab === 'staff' && <StaffTab />}
      </div>
    </div>
  );
}

function DashboardTab() {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.orders.list().then(d => (Array.isArray(d) ? d : d.orders || [])).catch(() => []),
      api.branches.list().then(d => (Array.isArray(d) ? d : d.branches || [])).catch(() => []),
      api.products.list().then(d => (Array.isArray(d) ? d : d.products || [])).catch(() => []),
      api.branch.walkinSales().then(d => (Array.isArray(d) ? d : d.sales || [])).catch(() => []),
      api.distributors.list().then(d => (Array.isArray(d) ? d : d.distributors || [])).catch(() => []),
      api.branch.deposits().then(d => (Array.isArray(d) ? d : d.deposits || [])).catch(() => []),
    ]).then(([orders, branches, products, sales, distributors, deposits]) => {
      setData({ orders, branches, products, sales, distributors, deposits });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const totalRevenue = (data.orders || []).reduce((sum, o) => sum + Number(o.total || 0), 0) +
    (data.sales || []).reduce((sum, s) => sum + Number(s.total || s.amount || 0), 0);

  const totalDeposits = (data.deposits || []).reduce((sum, d) => sum + Number(d.amount || 0), 0);

  const thisMonth = new Date();
  thisMonth.setDate(1);
  const monthlyOrders = (data.orders || []).filter(o => new Date(o.created_at) >= thisMonth);
  const monthlySales = (data.sales || []).filter(s => new Date(s.created_at) >= thisMonth);
  const monthlyRevenue = monthlyOrders.reduce((sum, o) => sum + Number(o.total || 0), 0) +
    monthlySales.reduce((sum, s) => sum + Number(s.total || s.amount || 0), 0);

  const allSalesItems = [];
  const processItems = (items) => {
    (items || []).forEach(item => {
      const rawName = item.name || item.product_name || 'Unknown';
      const matched = findProductPrice(rawName);
      const qty = Number(item.quantity || item.qty || 1);
      const price = matched ? matched.dp : Number(item.price || item.unit_price || 0);
      const cif = matched ? matched.cif : 0;
      allSalesItems.push({ product_name: matched ? matched.description : rawName, quantity: qty, price, cif });
    });
  };
  (data.orders || []).forEach(o => processItems(o.items));
  (data.sales || []).forEach(s => processItems(s.items));

  const totalCIFCost = allSalesItems.reduce((sum, i) => sum + (i.cif * i.quantity), 0);
  const totalDPRevenue = allSalesItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  const grossProfit = totalDPRevenue - totalCIFCost;
  const marginPct = totalDPRevenue > 0 ? ((grossProfit / totalDPRevenue) * 100).toFixed(1) : '0';

  const remittanceDue = totalCIFCost - totalDeposits;

  const branchPerformance = {};
  (data.sales || []).forEach(s => {
    const branch = s.branch_id || s.branch || 'Unknown';
    if (!branchPerformance[branch]) branchPerformance[branch] = { sales: 0, count: 0, cifCost: 0 };
    branchPerformance[branch].sales += Number(s.total || s.amount || 0);
    branchPerformance[branch].count += 1;
    const items = s.items || [];
    items.forEach(item => {
      const matched = findProductPrice(item.name || item.product_name || '');
      if (matched) {
        branchPerformance[branch].cifCost += matched.cif * Number(item.quantity || item.qty || 1);
      }
    });
  });

  const branchRows = Object.entries(branchPerformance)
    .map(([name, d]) => ({ name, ...d, profit: d.sales - d.cifCost }))
    .sort((a, b) => b.sales - a.sales);

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Sales" value={formatCurrency(totalRevenue)} color="blue" icon={<TrendingUp size={24} />} />
        <StatCard title="Monthly Revenue" value={formatCurrency(monthlyRevenue)} subtitle="Current month" color="green" icon={<DollarSign size={24} />} />
        <StatCard title="CIF Cost of Sales" value={formatCurrency(totalCIFCost)} subtitle="Import cost from Malaysia" color="red" icon={<Ship size={24} />} />
        <StatCard title="Gross Profit" value={formatCurrency(grossProfit)} subtitle={`${marginPct}% margin`} color={grossProfit >= 0 ? 'green' : 'red'} icon={<BarChart3 size={24} />} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Active Branches" value={data.branches?.length || 0} color="purple" icon={<Users size={24} />} />
        <StatCard title="Distributors" value={data.distributors?.length || 0} color="orange" icon={<Package size={24} />} />
        <StatCard title="Total Deposits" value={formatCurrency(totalDeposits)} color="teal" icon={<DollarSign size={24} />} />
        <StatCard title="Remittance Due" value={formatCurrency(Math.max(0, remittanceDue))} color={remittanceDue > 0 ? 'red' : 'green'} icon={<AlertTriangle size={24} />} />
      </div>

      <Card className="mb-6 bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200">
        <CardBody>
          <h3 className="font-bold text-indigo-900 mb-3">Profit & Loss Overview</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white/80 rounded-lg p-3">
              <p className="text-xs text-gray-500">Total Revenue (DP)</p>
              <p className="text-lg font-bold text-blue-700">{formatCurrency(totalDPRevenue)}</p>
            </div>
            <div className="bg-white/80 rounded-lg p-3">
              <p className="text-xs text-gray-500">CIF Cost</p>
              <p className="text-lg font-bold text-red-600">{formatCurrency(totalCIFCost)}</p>
            </div>
            <div className="bg-white/80 rounded-lg p-3">
              <p className="text-xs text-gray-500">Gross Profit</p>
              <p className={`text-lg font-bold ${grossProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatCurrency(grossProfit)}</p>
            </div>
            <div className="bg-white/80 rounded-lg p-3">
              <p className="text-xs text-gray-500">Deposits Received</p>
              <p className="text-lg font-bold text-teal-700">{formatCurrency(totalDeposits)}</p>
            </div>
            <div className="bg-white/80 rounded-lg p-3">
              <p className="text-xs text-gray-500">Remittance Status</p>
              <p className={`text-lg font-bold ${remittanceDue <= 0 ? 'text-green-700' : 'text-orange-600'}`}>
                {remittanceDue <= 0 ? 'No Remittance Due' : formatCurrency(remittanceDue)}
              </p>
            </div>
          </div>
          <p className="text-xs text-indigo-600 mt-2 font-medium">
            Profit = DP (Distributor Price) - CIF (Cost, Insurance, Freight from Malaysia)
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
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                <span className="text-sm text-gray-700">Total Orders</span>
                <span className="font-bold text-blue-600">{data.orders?.length || 0}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                <span className="text-sm text-gray-700">Walk-in Sales</span>
                <span className="font-bold text-green-600">{data.sales?.length || 0}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                <span className="text-sm text-gray-700">Product Range</span>
                <span className="font-bold text-purple-600">{data.products?.length || 0}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg">
                <span className="text-sm text-gray-700">Avg Order Value</span>
                <span className="font-bold text-orange-600">
                  {formatCurrency(data.orders?.length ? totalRevenue / (data.orders.length + (data.sales?.length || 0)) : 0)}
                </span>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Branch Performance (with Profit)</h3></CardHeader>
          {branchRows.length > 0 ? (
            <Table
              columns={[
                { header: 'Branch', key: 'name' },
                { header: 'Sales', render: r => <span className="font-bold text-green-600">{formatCurrency(r.sales)}</span> },
                { header: 'CIF Cost', render: r => <span className="text-red-600">{formatCurrency(r.cifCost)}</span> },
                { header: 'Profit', render: r => <span className={`font-bold ${r.profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatCurrency(r.profit)}</span> },
                { header: 'Txns', render: r => <Badge variant="info">{r.count}</Badge> },
              ]}
              data={branchRows}
            />
          ) : (
            <CardBody>
              <p className="text-sm text-gray-500 py-4 text-center">Branch comparison metrics will appear when sales data is available.</p>
            </CardBody>
          )}
        </Card>
      </div>
    </div>
  );
}

function BranchOverviewTab() {
  const [branches, setBranches] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.branches.list().then(d => Array.isArray(d) ? d : d.branches || []).catch(() => []),
      api.branch.walkinSales().then(d => Array.isArray(d) ? d : d.sales || []).catch(() => []),
    ]).then(([b, s]) => { setBranches(b); setSales(s); }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const branchStats = {};
  BRANCHES.forEach(name => { branchStats[name] = { sales: 0, revenue: 0, cifCost: 0 }; });
  sales.forEach(s => {
    const b = s.branch_id || s.branch || 'Unknown';
    if (!branchStats[b]) branchStats[b] = { sales: 0, revenue: 0, cifCost: 0 };
    branchStats[b].sales += 1;
    branchStats[b].revenue += Number(s.total_amount || s.total || s.amount || 0);
    const items = s.items || [];
    items.forEach(item => {
      const matched = findProductPrice(item.name || item.product_name || '');
      if (matched) {
        branchStats[b].cifCost += matched.cif * Number(item.quantity || item.qty || 1);
      }
    });
  });

  const rows = Object.entries(branchStats).map(([name, d]) => ({ name, ...d, profit: d.revenue - d.cifCost })).sort((a, b) => b.revenue - a.revenue);

  return (
    <Card>
      <CardHeader><h3 className="font-bold text-gray-800 flex items-center gap-2"><Globe size={18} /> All Branches Performance</h3></CardHeader>
      <Table
        columns={[
          { header: 'Branch', render: r => <span className="font-medium">{r.name}</span> },
          { header: 'Transactions', render: r => <Badge variant="info">{r.sales}</Badge> },
          { header: 'Revenue', render: r => <span className="font-bold text-green-600">{formatCurrency(r.revenue)}</span> },
          { header: 'CIF Cost', render: r => <span className="text-red-600">{formatCurrency(r.cifCost)}</span> },
          { header: 'Profit', render: r => <span className={`font-bold ${r.profit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatCurrency(r.profit)}</span> },
          { header: 'Status', render: r => <Badge variant={r.sales > 0 ? 'success' : 'default'}>{r.sales > 0 ? 'Active' : 'No Sales'}</Badge> },
        ]}
        data={rows}
      />
    </Card>
  );
}

function DistributorNetworkTab() {
  const [distributors, setDistributors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.distributors.list()
      .then(d => setDistributors(Array.isArray(d) ? d : d.distributors || []))
      .catch(() => [])
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const byBranch = {};
  distributors.forEach(d => {
    const b = d.branch || 'Unassigned';
    byBranch[b] = (byBranch[b] || 0) + 1;
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Distributors" value={distributors.length} color="blue" />
        <StatCard title="Branches Covered" value={Object.keys(byBranch).length} color="green" />
        <StatCard title="Active" value={distributors.filter(d => d.status === 'active' || !d.status).length} color="purple" />
        <StatCard title="New This Month" value={distributors.filter(d => {
          const created = new Date(d.created_at);
          const now = new Date();
          return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
        }).length} color="orange" />
      </div>
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Distributors by Branch</h3></CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(byBranch).sort((a, b) => b[1] - a[1]).map(([branch, count]) => (
              <div key={branch} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                <span className="text-sm font-medium text-gray-700">{branch}</span>
                <Badge variant="primary">{count}</Badge>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Recent Distributors</h3></CardHeader>
        <Table
          columns={[
            { header: 'Code', render: r => <span className="font-mono text-sm">{r.distributor_code || r.id}</span> },
            { header: 'Name', key: 'distributor_name' },
            { header: 'Branch', key: 'branch' },
            { header: 'Joined', render: r => formatDate(r.created_at) },
          ]}
          data={distributors.slice(0, 20)}
          emptyMessage="No distributors found"
        />
      </Card>
    </div>
  );
}

function StaffTab() {
  const [form, setForm] = useState({ request_type: 'leave', leave_type: 'Annual', start_date: '', end_date: '', reason: '', amount: '' });
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.reason) {
      setMessage('Error: Please provide a reason.');
      return;
    }
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
                  <option>Annual</option>
                  <option>Sick</option>
                  <option>Personal</option>
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
          <Button type="submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Request'}</Button>
        </form>
      </CardBody>
    </Card>
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
                <th className="px-4 py-3 font-semibold text-gray-600">Product</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-right">CIF</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-right">DP</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-right">Campaign</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-right">Profit/Unit</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-right">Margin</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-right">Qty Sold</th>
                <th className="px-4 py-3 font-semibold text-gray-600 text-right">Total Profit</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Actions</th>
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

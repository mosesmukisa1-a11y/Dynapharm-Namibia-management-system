import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatCurrency, formatDateTime, formatDate, BRANCHES } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, StatCard, LoadingSpinner, EmptyState, Table, Badge, Alert, Select } from '../../components/ui';
import { Briefcase, TrendingUp, DollarSign, BarChart3, Users, Package, ClipboardList, Target, Globe } from 'lucide-react';

export default function DirectorPortal() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const tabs = [
    { id: 'dashboard', label: 'Executive Dashboard', icon: '📊' },
    { id: 'branches', label: 'Branch Overview', icon: '🏢' },
    { id: 'distributors', label: 'Distributor Network', icon: '👥' },
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
        {activeTab === 'distributors' && <DistributorNetworkTab />}
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
    ]).then(([orders, branches, products, sales, distributors]) => {
      setData({ orders, branches, products, sales, distributors });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const totalRevenue = (data.orders || []).reduce((sum, o) => sum + Number(o.total || 0), 0) +
    (data.sales || []).reduce((sum, s) => sum + Number(s.total || s.amount || 0), 0);

  const thisMonth = new Date();
  thisMonth.setDate(1);
  const monthlyOrders = (data.orders || []).filter(o => new Date(o.created_at) >= thisMonth);
  const monthlySales = (data.sales || []).filter(s => new Date(s.created_at) >= thisMonth);
  const monthlyRevenue = monthlyOrders.reduce((sum, o) => sum + Number(o.total || 0), 0) +
    monthlySales.reduce((sum, s) => sum + Number(s.total || s.amount || 0), 0);

  const branchPerformance = {};
  (data.sales || []).forEach(s => {
    const branch = s.branch_id || s.branch || 'Unknown';
    if (!branchPerformance[branch]) branchPerformance[branch] = { sales: 0, count: 0 };
    branchPerformance[branch].sales += Number(s.total || s.amount || 0);
    branchPerformance[branch].count += 1;
  });

  const branchRows = Object.entries(branchPerformance)
    .map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.sales - a.sales);

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Revenue" value={formatCurrency(totalRevenue)} color="blue" icon={<TrendingUp size={24} />} />
        <StatCard title="Monthly Revenue" value={formatCurrency(monthlyRevenue)} subtitle="Current month" color="green" icon={<DollarSign size={24} />} />
        <StatCard title="Active Branches" value={data.branches?.length || 0} color="purple" icon={<Users size={24} />} />
        <StatCard title="Distributors" value={data.distributors?.length || 0} color="orange" icon={<Package size={24} />} />
      </div>

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
          <CardHeader><h3 className="font-bold text-gray-800">Branch Performance</h3></CardHeader>
          {branchRows.length > 0 ? (
            <Table
              columns={[
                { header: 'Branch', key: 'name' },
                { header: 'Sales', render: r => <span className="font-bold text-green-600">{formatCurrency(r.sales)}</span> },
                { header: 'Transactions', render: r => <Badge variant="info">{r.count}</Badge> },
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
  BRANCHES.forEach(name => { branchStats[name] = { sales: 0, revenue: 0 }; });
  sales.forEach(s => {
    const b = s.branch_id || s.branch || 'Unknown';
    if (!branchStats[b]) branchStats[b] = { sales: 0, revenue: 0 };
    branchStats[b].sales += 1;
    branchStats[b].revenue += Number(s.total_amount || s.total || s.amount || 0);
  });

  const rows = Object.entries(branchStats).map(([name, d]) => ({ name, ...d })).sort((a, b) => b.revenue - a.revenue);

  return (
    <Card>
      <CardHeader><h3 className="font-bold text-gray-800 flex items-center gap-2"><Globe size={18} /> All Branches Performance</h3></CardHeader>
      <Table
        columns={[
          { header: 'Branch', render: r => <span className="font-medium">{r.name}</span> },
          { header: 'Transactions', render: r => <Badge variant="info">{r.sales}</Badge> },
          { header: 'Revenue', render: r => <span className="font-bold text-green-600">{formatCurrency(r.revenue)}</span> },
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

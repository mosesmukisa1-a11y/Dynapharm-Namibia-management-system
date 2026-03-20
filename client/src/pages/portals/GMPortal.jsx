import { useState, useEffect } from 'react';
import DistributorPerformanceTab from '../../components/DistributorPerformanceTab';
import { api } from '../../lib/api';
import { PRICE_LIST, getCIFPrice, findProductPrice } from '../../lib/pricing';
import { formatCurrency, formatDateTime, formatDate, BRANCHES } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Table, Modal, Alert } from '../../components/ui';
import { BarChart3, ClipboardList, CheckCircle, Megaphone, TrendingUp, Users, DollarSign, Package, XCircle, Download, Ship, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function GMPortal() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'approvals', label: 'Approvals', icon: '✅' },
    { id: 'campaigns', label: 'Campaigns', icon: '📢' },
    { id: 'profitAnalysis', label: 'Profit Analysis', icon: '💰' },
    { id: 'bonus', label: 'Bonus History', icon: '🎁' },
    { id: 'communication', label: 'Communication', icon: '💬' },
    { id: 'staff', label: 'Staff Services', icon: '👤' },
    { id: 'distributors', label: 'Distributor Performance', icon: '👥' },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">GM Portal</h1>
        <p className="text-sm text-gray-500">Country-wide oversight, approvals, and strategic management</p>
      </div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'approvals' && <ApprovalsTab />}
        {activeTab === 'campaigns' && <CampaignsTab />}
        {activeTab === 'profitAnalysis' && <ProfitAnalysisTab />}
        {activeTab === 'bonus' && <BonusHistoryTab />}
        {activeTab === 'communication' && <CommunicationTab />}
        {activeTab === 'staff' && <StaffTab />}
        {activeTab === 'distributors' && <DistributorPerformanceTab title="Distributor Performance — All Branches" />}
      </div>
    </div>
  );
}

function DashboardTab() {
  const [data, setData] = useState({ orders: [], branches: [], products: [], sales: [], deposits: [], expenses: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.orders.list().then(d => Array.isArray(d) ? d : d.orders || []).catch(() => []),
      api.branches.list().then(d => Array.isArray(d) ? d : d.branches || []).catch(() => []),
      api.products.list().then(d => Array.isArray(d) ? d : d.products || []).catch(() => []),
      api.branch.walkinSales().then(d => Array.isArray(d) ? d : d.sales || []).catch(() => []),
      api.branch.deposits().then(d => Array.isArray(d) ? d : d.deposits || []).catch(() => []),
    ]).then(([orders, branches, products, sales, deposits]) => {
      setData({ orders, branches, products, sales, deposits });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const totalRevenue = data.orders.reduce((sum, o) => sum + Number(o.total || 0), 0) +
    data.sales.reduce((sum, s) => sum + Number(s.total || s.amount || 0), 0);

  const totalDeposits = data.deposits.reduce((sum, d) => sum + Number(d.amount || 0), 0);

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
  data.orders.forEach(o => processItems(o.items));
  data.sales.forEach(s => processItems(s.items));

  const totalCIFCost = allSalesItems.reduce((sum, i) => sum + (i.cif * i.quantity), 0);
  const totalDPRevenue = allSalesItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  const grossProfit = totalDPRevenue - totalCIFCost;

  const remittanceDue = totalCIFCost - totalDeposits;

  const totalBV = data.sales.reduce((sum, s) => {
    const items = s.items || [];
    return sum + items.reduce((iSum, item) => iSum + Number(item.bv || item.bonus_volume || 0), 0);
  }, 0);

  const productCounts = {};
  data.sales.forEach(s => {
    const items = s.items || [];
    items.forEach(item => {
      const name = item.name || item.product_name || 'Unknown';
      productCounts[name] = (productCounts[name] || 0) + (item.qty || item.quantity || 1);
    });
  });
  const topProducts = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const branchRevenue = {};
  data.sales.forEach(s => {
    const branch = s.branch_id || s.branch || 'Unknown';
    branchRevenue[branch] = (branchRevenue[branch] || 0) + Number(s.total || s.amount || 0);
  });

  const kpiCards = [
    { label: 'Total Sales', value: formatCurrency(totalRevenue), icon: '💰', gradient: 'linear-gradient(135deg, #43e97b, #38f9d7)' },
    { label: 'CIF Cost of Sales', value: formatCurrency(totalCIFCost), icon: '🚢', gradient: 'linear-gradient(135deg, #f093fb, #f5576c)' },
    { label: 'Gross Profit', value: formatCurrency(grossProfit), icon: '📊', gradient: grossProfit >= 0 ? 'linear-gradient(135deg, #43e97b, #38f9d7)' : 'linear-gradient(135deg, #f5576c, #f093fb)' },
    { label: 'Remittance Due', value: formatCurrency(Math.max(0, remittanceDue)), icon: '📦', gradient: remittanceDue > 0 ? 'linear-gradient(135deg, #fa709a, #fee140)' : 'linear-gradient(135deg, #43e97b, #38f9d7)' },
  ];

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpiCards.map((kpi) => (
          <div key={kpi.label} style={{ background: kpi.gradient }} className="rounded-xl p-5 shadow-lg text-white">
            <div className="flex items-start justify-between">
              <div>
                <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>{kpi.label}</p>
                <p style={{ fontSize: '2rem' }} className="font-bold mt-1">{kpi.value}</p>
              </div>
              <span style={{ fontSize: '2.5rem' }}>{kpi.icon}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Orders" value={data.orders.length} color="green" icon={<DollarSign size={24} />} />
        <StatCard title="Active Branches" value={data.branches.length} color="purple" icon={<Users size={24} />} />
        <StatCard title="Products" value={data.products.length} color="orange" icon={<Package size={24} />} />
        <StatCard title="Total BV Points" value={totalBV.toLocaleString()} color="teal" icon={<TrendingUp size={24} />} />
      </div>

      <Card className="mb-6 bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200">
        <CardBody>
          <h3 className="font-bold text-emerald-900 mb-3">Profit & Loss Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/80 rounded-lg p-3">
              <p className="text-xs text-gray-500">Total Revenue (DP)</p>
              <p className="text-lg font-bold text-blue-700">{formatCurrency(totalDPRevenue)}</p>
            </div>
            <div className="bg-white/80 rounded-lg p-3">
              <p className="text-xs text-gray-500">Total CIF Cost</p>
              <p className="text-lg font-bold text-red-600">{formatCurrency(totalCIFCost)}</p>
            </div>
            <div className="bg-white/80 rounded-lg p-3">
              <p className="text-xs text-gray-500">Gross Profit</p>
              <p className={`text-lg font-bold ${grossProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatCurrency(grossProfit)}</p>
            </div>
            <div className="bg-white/80 rounded-lg p-3">
              <p className="text-xs text-gray-500">Margin %</p>
              <p className="text-lg font-bold text-purple-700">{totalDPRevenue > 0 ? ((grossProfit / totalDPRevenue) * 100).toFixed(1) : '0'}%</p>
            </div>
          </div>
          <p className="text-xs text-emerald-600 mt-2 font-medium">
            Profit = DP Selling Price - CIF Cost (actual cost from Malaysia import)
          </p>
        </CardBody>
      </Card>

      {remittanceDue > 0 && (
        <Alert type="warning" className="mb-6">
          <strong>Remittance Due:</strong> {formatCurrency(remittanceDue)} — CIF cost of goods sold exceeds deposits received. Coordinate with Finance for remittance to supplier.
        </Alert>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Revenue by Branch</h3></CardHeader>
          <CardBody>
            {Object.keys(branchRevenue).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(branchRevenue).sort((a, b) => b[1] - a[1]).map(([branch, rev]) => (
                  <div key={branch} className="flex justify-between items-center">
                    <span className="text-sm text-gray-700">{branch}</span>
                    <span className="font-bold text-sm text-green-600">{formatCurrency(rev)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-4 text-center">Revenue data will appear when sales are recorded.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Top Products</h3></CardHeader>
          <CardBody>
            {topProducts.length > 0 ? (
              <div className="space-y-3">
                {topProducts.map(([name, count], i) => (
                  <div key={name} className="flex justify-between items-center">
                    <span className="text-sm text-gray-700">
                      <span className="font-bold text-primary mr-2">#{i + 1}</span>{name}
                    </span>
                    <Badge variant="info">{count} sold</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-4 text-center">Top products will appear when sales data is available.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function ApprovalsTab() {
  const [approvalTab, setApprovalTab] = useState('all');
  const [cashRequests, setCashRequests] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [stockRequests, setStockRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [noteModal, setNoteModal] = useState(null);
  const [note, setNote] = useState('');

  const subTabs = [
    { id: 'all', label: 'All Requests' },
    { id: 'cash', label: 'Cash Requests' },
    { id: 'leave', label: 'Leave Requests' },
    { id: 'stock', label: 'Stock Movements' },
    { id: 'other', label: 'Other Requests' },
  ];

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.branch.cashMovements().then(d => Array.isArray(d) ? d : d.movements || []).catch(() => []),
      api.get('/employees/leaves').then(d => Array.isArray(d) ? d : d.leaves || []).catch(() => []),
      api.stock.requests().then(d => Array.isArray(d) ? d : d.requests || []).catch(() => []),
    ]).then(([cash, leaves, stock]) => {
      setCashRequests(cash.filter(c => c.status === 'pending'));
      setLeaveRequests(leaves.filter(l => l.status === 'pending'));
      setStockRequests(stock.filter(s => s.status === 'pending'));
    }).finally(() => setLoading(false));
  }, []);

  const handleAction = async (type, id, action) => {
    try {
      if (type === 'cash') {
        await api.put(`/branch/cash-movements/${id}`, { status: action, notes: note });
        setCashRequests(prev => prev.filter(r => r.id !== id));
      } else if (type === 'leave') {
        await api.put(`/employees/leaves/${id}`, { status: action, notes: note });
        setLeaveRequests(prev => prev.filter(r => r.id !== id));
      } else if (type === 'stock') {
        await api.put(`/stock-requests/${id}`, { status: action, notes: note });
        setStockRequests(prev => prev.filter(r => r.id !== id));
      }
      setMessage(`Request ${action} successfully!`);
      setNoteModal(null);
      setNote('');
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
  };

  if (loading) return <LoadingSpinner />;

  const getFilteredItems = () => {
    const allItems = [
      ...cashRequests.map(r => ({ ...r, _type: 'cash' })),
      ...leaveRequests.map(r => ({ ...r, _type: 'leave' })),
      ...stockRequests.map(r => ({ ...r, _type: 'stock' })),
    ];

    if (approvalTab === 'all') return allItems;
    if (approvalTab === 'cash') return allItems.filter(r => r._type === 'cash' || r.type === 'cash' || r.type === 'cash_request');
    if (approvalTab === 'leave') return allItems.filter(r => r._type === 'leave' || r.type === 'leave' || r.type === 'leave_request');
    if (approvalTab === 'stock') return allItems.filter(r => r._type === 'stock' || r.type === 'stock' || r.type === 'stock_movement');
    if (approvalTab === 'other') return allItems.filter(r => {
      const t = r._type || r.type || '';
      return !['cash', 'cash_request', 'leave', 'leave_request', 'stock', 'stock_movement'].includes(t);
    });
    return allItems;
  };

  const filteredItems = getFilteredItems();
  const totalCount = cashRequests.length + leaveRequests.length + stockRequests.length;

  const renderRequests = () => {
    if (filteredItems.length === 0) {
      return <EmptyState icon={<CheckCircle size={48} />} title="No Pending Approvals" description={`No pending ${approvalTab === 'all' ? '' : approvalTab + ' '}requests require your approval.`} />;
    }

    return (
      <Card>
        <Table
          columns={[
            { header: 'Date', render: r => formatDateTime(r.created_at) },
            { header: 'Type', render: r => <Badge variant={r._type === 'cash' ? 'warning' : r._type === 'leave' ? 'info' : 'success'}>{r._type || 'other'}</Badge> },
            { header: 'Requester', render: r => r.employee_name || r.requested_by || r.user || '-' },
            { header: 'Details', render: r => r.reason || r.description || r.product_name || '-' },
            { header: 'Amount/Qty', render: r => r.amount ? formatCurrency(r.amount) : (r.quantity || '-') },
            { header: 'Actions', render: r => (
              <div className="flex gap-1">
                <Button size="sm" variant="success" onClick={() => setNoteModal({ type: r._type, id: r.id, action: 'approved' })}>Approve</Button>
                <Button size="sm" variant="danger" onClick={() => setNoteModal({ type: r._type, id: r.id, action: 'rejected' })}>Reject</Button>
              </div>
            )},
          ]}
          data={filteredItems}
        />
      </Card>
    );
  };

  return (
    <div>
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} className="mb-4">{message}</Alert>}
      <div className="flex gap-2 mb-4 flex-wrap">
        {subTabs.map(t => (
          <button key={t.id} onClick={() => setApprovalTab(t.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all ${approvalTab === t.id ? 'bg-primary text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t.label}
            {t.id === 'all' && totalCount > 0 && <span className="ml-1.5 bg-white/20 px-1.5 rounded-full text-xs">{totalCount}</span>}
            {t.id === 'cash' && cashRequests.length > 0 && <span className="ml-1.5 bg-white/20 px-1.5 rounded-full text-xs">{cashRequests.length}</span>}
            {t.id === 'leave' && leaveRequests.length > 0 && <span className="ml-1.5 bg-white/20 px-1.5 rounded-full text-xs">{leaveRequests.length}</span>}
            {t.id === 'stock' && stockRequests.length > 0 && <span className="ml-1.5 bg-white/20 px-1.5 rounded-full text-xs">{stockRequests.length}</span>}
          </button>
        ))}
      </div>
      {renderRequests()}

      <Modal open={!!noteModal} onClose={() => { setNoteModal(null); setNote(''); }} title={noteModal?.action === 'approved' ? 'Approve Request' : 'Reject Request'}>
        <div className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Notes (optional)</label>
            <textarea value={note} onChange={e => setNote(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 min-h-[80px] resize-y"
              placeholder="Add notes for this decision..." />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setNoteModal(null); setNote(''); }}>Cancel</Button>
            <Button variant={noteModal?.action === 'approved' ? 'success' : 'danger'}
              onClick={() => handleAction(noteModal.type, noteModal.id, noteModal.action)}>
              {noteModal?.action === 'approved' ? 'Approve' : 'Reject'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function CampaignsTab() {
  const [campaigns, setCampaigns] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', start_date: '', end_date: '', target_branches: '', discount_percentage: '' });
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.start_date || !form.end_date) {
      setMessage('Error: Please fill in required fields.');
      return;
    }
    try {
      await api.post('/campaigns', {
        ...form,
        discount_percentage: Number(form.discount_percentage) || 0,
        target_branches: form.target_branches ? form.target_branches.split(',').map(b => b.trim()) : [],
      });
      setMessage('Campaign created successfully!');
      setCampaigns(prev => [...prev, { ...form, id: Date.now(), status: 'active', created_at: new Date().toISOString() }]);
      setForm({ name: '', description: '', start_date: '', end_date: '', target_branches: '', discount_percentage: '' });
      setShowForm(false);
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
  };

  return (
    <div className="space-y-4">
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'}>{message}</Alert>}

      <div className="flex justify-between items-center">
        <h3 className="font-bold text-gray-800">Sales Campaigns</h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ New Campaign'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Create Campaign</h3></CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input label="Campaign Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. March Promotion" />
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 min-h-[80px] resize-y"
                  placeholder="Campaign details..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Start Date *" type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                <Input label="End Date *" type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
              </div>
              <Input label="Target Branches (comma-separated)" value={form.target_branches} onChange={e => setForm({ ...form, target_branches: e.target.value })} placeholder="e.g. Windhoek CBD, Oshakati" />
              <Input label="Discount %" type="number" min="0" max="100" value={form.discount_percentage} onChange={e => setForm({ ...form, discount_percentage: e.target.value })} />
              <Alert type="info">Campaign pricing affects profit calculations. Discount reduces the selling price, which reduces the margin between DP and CIF.</Alert>
              <Button type="submit">Create Campaign</Button>
            </form>
          </CardBody>
        </Card>
      )}

      <Card>
        <Table
          columns={[
            { header: 'Name', key: 'name' },
            { header: 'Period', render: r => `${formatDate(r.start_date)} - ${formatDate(r.end_date)}` },
            { header: 'Discount', render: r => r.discount_percentage ? `${r.discount_percentage}%` : '-' },
            { header: 'Status', render: r => {
              const now = new Date();
              const end = new Date(r.end_date);
              const start = new Date(r.start_date);
              const status = now > end ? 'ended' : now < start ? 'upcoming' : 'active';
              return <Badge variant={status === 'active' ? 'success' : status === 'upcoming' ? 'info' : 'default'}>{status}</Badge>;
            }},
          ]}
          data={campaigns}
          emptyMessage="No campaigns created yet"
        />
      </Card>
    </div>
  );
}

function BonusHistoryTab() {
  const [filterForm, setFilterForm] = useState({ start_date: '', end_date: '', branch: '' });
  const [bonusData] = useState([
    { id: 1, period: 'March 2026', branch: 'Windhoek CBD', total_amount: 45200, distributors_count: 23, status: 'Paid', date: '2026-03-15' },
    { id: 2, period: 'March 2026', branch: 'Oshakati', total_amount: 32100, distributors_count: 18, status: 'Paid', date: '2026-03-15' },
    { id: 3, period: 'February 2026', branch: 'Windhoek CBD', total_amount: 41800, distributors_count: 21, status: 'Paid', date: '2026-02-15' },
    { id: 4, period: 'February 2026', branch: 'Walvis Bay', total_amount: 28500, distributors_count: 15, status: 'Paid', date: '2026-02-15' },
    { id: 5, period: 'April 2026', branch: 'Katutura', total_amount: 38900, distributors_count: 20, status: 'Pending', date: '2026-04-15' },
    { id: 6, period: 'April 2026', branch: 'Rundu', total_amount: 19700, distributors_count: 12, status: 'Pending', date: '2026-04-15' },
  ]);

  const filteredData = bonusData.filter(b => {
    if (filterForm.branch && b.branch !== filterForm.branch) return false;
    if (filterForm.start_date && b.date < filterForm.start_date) return false;
    if (filterForm.end_date && b.date > filterForm.end_date) return false;
    return true;
  });

  const totalPaid = filteredData.filter(b => b.status === 'Paid').reduce((sum, b) => sum + b.total_amount, 0);
  const pendingAmount = filteredData.filter(b => b.status === 'Pending').reduce((sum, b) => sum + b.total_amount, 0);
  const lastPayout = filteredData.filter(b => b.status === 'Paid').sort((a, b) => b.date.localeCompare(a.date))[0]?.date || '-';

  const handleCSVExport = () => {
    const headers = 'Period,Branch,Total Amount,Distributors,Status,Date\n';
    const rows = filteredData.map(b => `${b.period},${b.branch},${b.total_amount},${b.distributors_count},${b.status},${b.date}`).join('\n');
    const csv = headers + rows;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bonus_history.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div style={{ background: 'linear-gradient(135deg, #43e97b, #38f9d7)' }} className="rounded-xl p-5 shadow-lg text-white">
          <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>Total Paid</p>
          <p style={{ fontSize: '2rem' }} className="font-bold mt-1">{formatCurrency(totalPaid)}</p>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #fa709a, #fee140)' }} className="rounded-xl p-5 shadow-lg text-white">
          <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>Pending Amount</p>
          <p style={{ fontSize: '2rem' }} className="font-bold mt-1">{formatCurrency(pendingAmount)}</p>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #4facfe, #00f2fe)' }} className="rounded-xl p-5 shadow-lg text-white">
          <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>Last Payout Date</p>
          <p style={{ fontSize: '2rem' }} className="font-bold mt-1">{formatDate(lastPayout)}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">Bonus History Filter</h3>
            <Button size="sm" onClick={handleCSVExport}><Download size={16} /> Export CSV</Button>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Input label="Start Date" type="date" value={filterForm.start_date} onChange={e => setFilterForm({ ...filterForm, start_date: e.target.value })} />
            <Input label="End Date" type="date" value={filterForm.end_date} onChange={e => setFilterForm({ ...filterForm, end_date: e.target.value })} />
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Branch</label>
              <select value={filterForm.branch} onChange={e => setFilterForm({ ...filterForm, branch: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                <option value="">All Branches</option>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <Button size="sm" variant="secondary" onClick={() => setFilterForm({ start_date: '', end_date: '', branch: '' })}>Clear Filters</Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <Table
          columns={[
            { header: 'Period', key: 'period' },
            { header: 'Branch', key: 'branch' },
            { header: 'Total Amount', render: r => formatCurrency(r.total_amount) },
            { header: 'Distributors', key: 'distributors_count' },
            { header: 'Status', render: r => <Badge variant={r.status === 'Paid' ? 'success' : 'warning'}>{r.status}</Badge> },
            { header: 'Date', render: r => formatDate(r.date) },
          ]}
          data={filteredData}
          emptyMessage="No bonus records found"
        />
      </Card>
    </div>
  );
}

function CommunicationTab() {
  const [form, setForm] = useState({ message: '', priority: 'Normal', target: 'all_staff', branch: '' });
  const [messages, setMessages] = useState([
    { id: 1, message: 'Monthly targets have been updated for all branches. Please review your dashboard.', priority: 'Info', sender: 'GM Office', timestamp: '2026-03-10T09:00:00Z' },
    { id: 2, message: 'Urgent: Stock audit scheduled for next week. All branch managers must prepare inventory reports.', priority: 'Urgent', sender: 'GM Office', timestamp: '2026-03-08T14:30:00Z' },
    { id: 3, message: 'Congratulations to Windhoek CBD branch for exceeding March targets!', priority: 'Normal', sender: 'GM Office', timestamp: '2026-03-05T11:00:00Z' },
  ]);
  const [submitMessage, setSubmitMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.message.trim()) {
      setSubmitMessage('Error: Please enter a message.');
      return;
    }
    const newMsg = {
      id: Date.now(),
      message: form.message,
      priority: form.priority,
      sender: 'GM Office',
      target: form.target === 'specific_branch' ? form.branch : form.target,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [newMsg, ...prev]);
    setForm({ message: '', priority: 'Normal', target: 'all_staff', branch: '' });
    setSubmitMessage('Message sent successfully!');
  };

  const priorityColors = { Normal: 'default', Urgent: 'danger', Info: 'info' };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Send Communication</h3></CardHeader>
        <CardBody>
          {submitMessage && <Alert type={submitMessage.startsWith('Error') ? 'error' : 'success'} className="mb-4">{submitMessage}</Alert>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Message</label>
              <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 min-h-[100px] resize-y"
                placeholder="Type your message to staff..." />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Priority</label>
                <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                  <option value="Normal">Normal</option>
                  <option value="Urgent">Urgent</option>
                  <option value="Info">Info</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Target</label>
                <select value={form.target} onChange={e => setForm({ ...form, target: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                  <option value="all_staff">All Staff</option>
                  <option value="branch_managers">Branch Managers</option>
                  <option value="specific_branch">Specific Branch</option>
                </select>
              </div>
              {form.target === 'specific_branch' && (
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">Branch</label>
                  <select value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                    <option value="">Select Branch</option>
                    {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}
            </div>
            <Button type="submit">Send Message</Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Message History</h3></CardHeader>
        <CardBody>
          {messages.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">No messages sent yet.</p>
          ) : (
            <div className="space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className="border border-gray-100 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-gray-400">{formatDateTime(msg.timestamp)}</span>
                    <Badge variant={priorityColors[msg.priority] || 'default'}>{msg.priority}</Badge>
                    <span className="text-xs font-medium text-gray-600">{msg.sender}</span>
                    {msg.target && <span className="text-xs text-gray-400">→ {msg.target}</span>}
                  </div>
                  <p className="text-sm text-gray-700">{msg.message}</p>
                </div>
              ))}
            </div>
          )}
        </CardBody>
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
      <CardHeader><h3 className="font-bold text-gray-800">Executive Request</h3></CardHeader>
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

  const profitRows = PRICE_LIST.map(p => {
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
          {editingCampaign && (() => { const prod = PRICE_LIST.find(p => p.description === editingCampaign); return prod ? <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded"><p>CIF: {formatCurrency(prod.cif)} | DP: {formatCurrency(prod.dp)} | CP: {formatCurrency(prod.cp)}</p></div> : null; })()}
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

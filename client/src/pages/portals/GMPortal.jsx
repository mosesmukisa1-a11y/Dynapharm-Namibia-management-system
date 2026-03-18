import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatCurrency, formatDateTime, formatDate, BRANCHES } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Table, Modal, Alert } from '../../components/ui';
import { BarChart3, ClipboardList, CheckCircle, Megaphone, TrendingUp, Users, DollarSign, Package, XCircle } from 'lucide-react';

export default function GMPortal() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'approvals', label: 'Approvals', icon: '✅' },
    { id: 'campaigns', label: 'Campaigns', icon: '📢' },
    { id: 'staff', label: 'Staff Services', icon: '👤' },
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
        {activeTab === 'staff' && <StaffTab />}
      </div>
    </div>
  );
}

function DashboardTab() {
  const [data, setData] = useState({ orders: [], branches: [], products: [], sales: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.orders.list().then(d => Array.isArray(d) ? d : d.orders || []).catch(() => []),
      api.branches.list().then(d => Array.isArray(d) ? d : d.branches || []).catch(() => []),
      api.products.list().then(d => Array.isArray(d) ? d : d.products || []).catch(() => []),
      api.branch.walkinSales().then(d => Array.isArray(d) ? d : d.sales || []).catch(() => []),
    ]).then(([orders, branches, products, sales]) => {
      setData({ orders, branches, products, sales });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const totalRevenue = data.orders.reduce((sum, o) => sum + Number(o.total || 0), 0) +
    data.sales.reduce((sum, s) => sum + Number(s.total || s.amount || 0), 0);

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

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Revenue" value={formatCurrency(totalRevenue)} color="blue" icon={<TrendingUp size={24} />} />
        <StatCard title="Total Orders" value={data.orders.length} color="green" icon={<DollarSign size={24} />} />
        <StatCard title="Active Branches" value={data.branches.length} color="purple" icon={<Users size={24} />} />
        <StatCard title="Products" value={data.products.length} color="orange" icon={<Package size={24} />} />
      </div>

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
  const [approvalTab, setApprovalTab] = useState('cash');
  const [cashRequests, setCashRequests] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [stockRequests, setStockRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [noteModal, setNoteModal] = useState(null);
  const [note, setNote] = useState('');

  const subTabs = [
    { id: 'cash', label: 'Cash Requests' },
    { id: 'leave', label: 'Leave Requests' },
    { id: 'stock', label: 'Stock Requests' },
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

  const renderRequests = () => {
    let items = [];
    let type = '';
    if (approvalTab === 'cash') { items = cashRequests; type = 'cash'; }
    else if (approvalTab === 'leave') { items = leaveRequests; type = 'leave'; }
    else { items = stockRequests; type = 'stock'; }

    if (items.length === 0) {
      return <EmptyState icon={<CheckCircle size={48} />} title="No Pending Approvals" description={`No pending ${approvalTab} requests require your approval.`} />;
    }

    return (
      <Card>
        <Table
          columns={[
            { header: 'Date', render: r => formatDateTime(r.created_at) },
            { header: 'Requester', render: r => r.employee_name || r.requested_by || r.user || '-' },
            { header: 'Details', render: r => r.reason || r.description || r.product_name || '-' },
            { header: 'Amount/Qty', render: r => r.amount ? formatCurrency(r.amount) : (r.quantity || '-') },
            { header: 'Actions', render: r => (
              <div className="flex gap-1">
                <Button size="sm" variant="success" onClick={() => setNoteModal({ type, id: r.id, action: 'approved' })}>Approve</Button>
                <Button size="sm" variant="danger" onClick={() => setNoteModal({ type, id: r.id, action: 'rejected' })}>Reject</Button>
              </div>
            )},
          ]}
          data={items}
        />
      </Card>
    );
  };

  return (
    <div>
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} className="mb-4">{message}</Alert>}
      <div className="flex gap-2 mb-4">
        {subTabs.map(t => (
          <button key={t.id} onClick={() => setApprovalTab(t.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer ${approvalTab === t.id ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t.label}
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

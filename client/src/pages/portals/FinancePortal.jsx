import { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import { formatCurrency, formatDateTime, formatDate, BRANCHES } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Table, Modal, Alert } from '../../components/ui';
import { DollarSign, TrendingUp, Landmark, Upload, CheckCircle, FileSpreadsheet, ClipboardList, Download, Eye, Trash2, Send, MessageSquare, Receipt } from 'lucide-react';

export default function FinancePortal() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'deposits', label: 'Deposit Inbox', icon: '🏦' },
    { id: 'bonus', label: 'Bonus Workflow', icon: '💰' },
    { id: 'expenses', label: 'Expenses', icon: '💸' },
    { id: 'communication', label: 'Communication', icon: '💬' },
    { id: 'staff', label: 'Staff Services', icon: '👤' },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Finance Portal</h1>
        <p className="text-sm text-gray-500">Financial overview, deposits, and bonus processing</p>
      </div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'deposits' && <DepositsTab />}
        {activeTab === 'bonus' && <BonusTab />}
        {activeTab === 'expenses' && <ExpensesTab />}
        {activeTab === 'communication' && <CommunicationTab />}
        {activeTab === 'staff' && <StaffTab />}
      </div>
    </div>
  );
}

function DashboardTab() {
  const [data, setData] = useState({ sales: [], deposits: [] });
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState('All Branches');
  const [comparisonPeriod, setComparisonPeriod] = useState('none');

  useEffect(() => {
    Promise.all([
      api.branch.walkinSales().then(d => Array.isArray(d) ? d : d.sales || []).catch(() => []),
      api.branch.deposits().then(d => Array.isArray(d) ? d : d.deposits || []).catch(() => []),
    ]).then(([sales, deposits]) => {
      setData({ sales, deposits });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const filteredSales = selectedBranch === 'All Branches'
    ? data.sales
    : data.sales.filter(s => s.branch_id === selectedBranch || s.branch === selectedBranch);
  const filteredDeposits = selectedBranch === 'All Branches'
    ? data.deposits
    : data.deposits.filter(d => d.branch_id === selectedBranch || d.branch === selectedBranch);

  const totalSales = filteredSales.reduce((sum, s) => sum + Number(s.total || s.amount || 0), 0);
  const totalDeposits = filteredDeposits.reduce((sum, d) => sum + Number(d.amount || 0), 0);
  const cashSales = filteredSales.filter(s => (s.payment_method || '').toLowerCase() === 'cash').reduce((sum, s) => sum + Number(s.total || s.amount || 0), 0);
  const cardSales = totalSales - cashSales;
  const totalBV = filteredSales.reduce((sum, s) => sum + Number(s.bv || 0), 0);
  const grossMargin = totalSales - (totalSales * 0.6);

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-center mb-6">
        <select
          value={selectedBranch}
          onChange={e => setSelectedBranch(e.target.value)}
          className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
        >
          <option>All Branches</option>
          {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select
          value={comparisonPeriod}
          onChange={e => setComparisonPeriod(e.target.value)}
          className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
        >
          <option value="none">No Comparison</option>
          <option value="yesterday">vs Yesterday</option>
          <option value="lastWeek">vs Last Week</option>
          <option value="lastMonth">vs Last Month</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="rounded-xl p-5 text-white bg-gradient-to-br from-purple-500 to-purple-700">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm opacity-90">Total Sales</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(totalSales)}</p>
              <p className="text-xs opacity-75 mt-1">Cash: {formatCurrency(cashSales)} · Card: {formatCurrency(cardSales)}</p>
            </div>
            <div className="opacity-80"><TrendingUp size={24} /></div>
          </div>
        </div>
        <div className="rounded-xl p-5 text-white bg-gradient-to-br from-pink-500 to-pink-700">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm opacity-90">Total Deposits</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(totalDeposits)}</p>
              <p className="text-xs opacity-75 mt-1">{filteredDeposits.length} deposits recorded</p>
            </div>
            <div className="opacity-80"><Landmark size={24} /></div>
          </div>
        </div>
        <div className="rounded-xl p-5 text-white bg-gradient-to-br from-blue-500 to-blue-700">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm opacity-90">Total BV Points</p>
              <p className="text-2xl font-bold mt-1">{totalBV.toLocaleString()}</p>
              <p className="text-xs opacity-75 mt-1">From {filteredSales.length} sales</p>
            </div>
            <div className="opacity-80"><FileSpreadsheet size={24} /></div>
          </div>
        </div>
        <div className="rounded-xl p-5 text-white bg-gradient-to-br from-orange-500 to-orange-700">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm opacity-90">Gross Margin</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(grossMargin)}</p>
              <p className="text-xs opacity-75 mt-1">40% margin on sales</p>
            </div>
            <div className="opacity-80"><DollarSign size={24} /></div>
          </div>
        </div>
      </div>

      {comparisonPeriod !== 'none' && (
        <Alert type="info" className="mb-4">
          Comparison mode: <strong>{comparisonPeriod === 'yesterday' ? 'vs Yesterday' : comparisonPeriod === 'lastWeek' ? 'vs Last Week' : 'vs Last Month'}</strong> — comparison data will be available when historical records are loaded.
        </Alert>
      )}

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Recent Transactions</h3></CardHeader>
        <Table
          columns={[
            { header: 'Date', render: r => formatDateTime(r.created_at) },
            { header: 'Type', render: r => <Badge variant="info">{r.type || 'Sale'}</Badge> },
            { header: 'Amount', render: r => <span className="font-bold text-green-600">{formatCurrency(r.amount || r.total)}</span> },
            { header: 'Branch', render: r => r.branch || r.branch_id || '-' },
          ]}
          data={[...filteredSales, ...filteredDeposits].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20)}
          emptyMessage="No recent transactions"
        />
      </Card>
    </div>
  );
}

function DepositsTab() {
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState(null);
  const [message, setMessage] = useState('');
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState([]);
  const [slipReference, setSlipReference] = useState('');
  const [bankStatementMatch, setBankStatementMatch] = useState(false);

  const loadDeposits = () => {
    setLoading(true);
    api.branch.deposits()
      .then(d => setDeposits(Array.isArray(d) ? d : d.deposits || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(loadDeposits, []);

  const handleVerify = async (id) => {
    try {
      await api.branch.verifyDeposit(id);
      setMessage('Deposit verified successfully!');
      setConfirmId(null);
      setSlipReference('');
      setBankStatementMatch(false);
      loadDeposits();
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
  };

  const handleBatchVerify = async () => {
    try {
      for (const id of selected) {
        await api.branch.verifyDeposit(id);
      }
      setMessage(`${selected.length} deposits verified successfully!`);
      setSelected([]);
      setBatchMode(false);
      loadDeposits();
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
  };

  const toggleSelect = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  if (loading) return <LoadingSpinner />;

  const pendingDeposits = deposits.filter(d => d.status !== 'verified');

  return (
    <div>
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} className="mb-4">{message}</Alert>}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Bank Deposit Inbox</h3>
            <div className="flex gap-2 items-center">
              <Badge variant="warning">{pendingDeposits.length} pending</Badge>
              {pendingDeposits.length > 0 && (
                <Button size="sm" variant={batchMode ? 'danger' : 'secondary'} onClick={() => { setBatchMode(!batchMode); setSelected([]); }}>
                  {batchMode ? 'Cancel Batch' : 'Batch Verify'}
                </Button>
              )}
              {batchMode && selected.length > 0 && (
                <Button size="sm" variant="success" onClick={handleBatchVerify}>
                  <CheckCircle size={14} /> Verify ({selected.length})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <Table
          columns={[
            ...(batchMode ? [{ header: '', render: r => r.status !== 'verified' && (
              <input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggleSelect(r.id)} className="w-4 h-4 cursor-pointer" />
            )}] : []),
            { header: 'Date', render: r => formatDateTime(r.created_at) },
            { header: 'Branch', render: r => r.branch || r.branch_id || '-' },
            { header: 'Deposited By', render: r => r.deposited_by || r.created_by || '-' },
            { header: 'Bank', key: 'bank_name' },
            { header: 'Amount', render: r => <span className="font-bold">{formatCurrency(r.amount)}</span> },
            { header: 'Reference', key: 'reference' },
            { header: 'Status', render: r => <Badge variant={r.status === 'verified' ? 'success' : 'warning'}>{r.status || 'Pending'}</Badge> },
            { header: 'Action', render: r => r.status !== 'verified' && !batchMode && (
              <Button size="sm" variant="success" onClick={() => setConfirmId(r.id)}>
                <CheckCircle size={14} /> Verify
              </Button>
            )},
          ]}
          data={deposits}
          emptyMessage="No pending deposits"
        />
      </Card>

      <Modal open={!!confirmId} onClose={() => { setConfirmId(null); setSlipReference(''); setBankStatementMatch(false); }} title="Confirm Verification">
        <div className="p-6">
          <p className="text-sm text-gray-600 mb-4">Are you sure you want to verify this deposit? This action confirms the funds have been received.</p>
          <div className="space-y-3 mb-4">
            <Input
              label="Deposit Slip Reference"
              placeholder="Enter deposit slip reference number"
              value={slipReference}
              onChange={e => setSlipReference(e.target.value)}
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={bankStatementMatch}
                onChange={e => setBankStatementMatch(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/20"
              />
              <span className="text-sm text-gray-700">Matches bank statement entry</span>
            </label>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setConfirmId(null); setSlipReference(''); setBankStatementMatch(false); }}>Cancel</Button>
            <Button variant="success" onClick={() => handleVerify(confirmId)}>
              <CheckCircle size={14} /> Confirm Verification
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function BonusTab() {
  const [bonuses, setBonuses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'bonus');
      const result = await api.upload(formData);
      const rows = result.data || result.rows || [];
      setBonuses(rows.map((r, i) => ({ id: i + 1, ...r, status: 'pending' })));
      setMessage(`Uploaded ${rows.length} bonus records for review.`);
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleApprove = (id) => {
    setBonuses(prev => prev.map(b => b.id === id ? { ...b, status: 'approved' } : b));
  };

  const handleReject = (id) => {
    setBonuses(prev => prev.map(b => b.id === id ? { ...b, status: 'rejected' } : b));
  };

  const handleApproveAll = () => {
    setBonuses(prev => prev.map(b => b.status === 'pending' ? { ...b, status: 'approved' } : b));
  };

  const handleExport = () => {
    const approved = bonuses.filter(b => b.status === 'approved');
    if (approved.length === 0) return;
    const headers = ['Distributor', 'NB Number', 'Amount', 'BV'];
    const rows = approved.map(b => [b.distributor_name || b.name || '', b.nb_number || '', b.amount || '', b.bv || '']);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `approved-bonuses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'}>{message}</Alert>}

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Upload Bonus CSV</h3></CardHeader>
        <CardBody>
          <div className="flex items-center gap-4">
            <input ref={fileRef} type="file" accept=".csv,.xlsx" onChange={handleUpload} className="hidden" />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload size={16} /> {uploading ? 'Uploading...' : 'Select CSV File'}
            </Button>
            <p className="text-xs text-gray-500">Upload a CSV with columns: distributor_name, nb_number, amount, bv</p>
          </div>
        </CardBody>
      </Card>

      {bonuses.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-gray-800">Review Bonuses ({bonuses.length})</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="success" onClick={handleApproveAll}>Approve All Pending</Button>
                <Button size="sm" variant="secondary" onClick={handleExport}>
                  <Download size={14} /> Export Approved
                </Button>
              </div>
            </div>
          </CardHeader>
          <Table
            columns={[
              { header: 'Distributor', render: r => r.distributor_name || r.name || '-' },
              { header: 'NB Number', render: r => r.nb_number || '-' },
              { header: 'Amount', render: r => <span className="font-bold">{formatCurrency(r.amount)}</span> },
              { header: 'BV', render: r => r.bv || '-' },
              { header: 'Status', render: r => (
                <Badge variant={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}>
                  {r.status}
                </Badge>
              )},
              { header: 'Actions', render: r => r.status === 'pending' && (
                <div className="flex gap-1">
                  <Button size="sm" variant="success" onClick={() => handleApprove(r.id)}>Approve</Button>
                  <Button size="sm" variant="danger" onClick={() => handleReject(r.id)}>Reject</Button>
                </div>
              )},
            ]}
            data={bonuses}
            emptyMessage="No bonus records"
          />
        </Card>
      )}
    </div>
  );
}

function ExpensesTab() {
  const CATEGORIES = ['Office Supplies', 'Transport', 'Utilities', 'Maintenance', 'Marketing', 'Other'];
  const emptyForm = { description: '', amount: '', category: 'Office Supplies', date: new Date().toISOString().slice(0, 10), branch: BRANCHES[0], receipt_number: '' };
  const [expenses, setExpenses] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');

  const handleAdd = (e) => {
    e.preventDefault();
    if (!form.description || !form.amount || !form.date) {
      setMessage('Error: Please fill in description, amount, and date.');
      return;
    }
    const newExpense = {
      id: Date.now(),
      ...form,
      amount: Number(form.amount),
      created_at: new Date().toISOString(),
    };
    setExpenses(prev => [newExpense, ...prev]);
    setForm(emptyForm);
    setMessage('Expense added successfully!');
  };

  const handleDelete = (id) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
    setMessage('Expense deleted.');
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const thisMonth = expenses.filter(e => {
    const d = new Date(e.date);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((sum, e) => sum + e.amount, 0);
  const categoriesUsed = new Set(expenses.map(e => e.category)).size;

  const categoryVariant = (cat) => {
    const map = { 'Office Supplies': 'info', 'Transport': 'warning', 'Utilities': 'primary', 'Maintenance': 'danger', 'Marketing': 'success', 'Other': 'default' };
    return map[cat] || 'default';
  };

  return (
    <div className="space-y-4">
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} className="mb-2">{message}</Alert>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Expenses" value={formatCurrency(totalExpenses)} color="red" icon={<DollarSign size={24} />} />
        <StatCard title="This Month" value={formatCurrency(thisMonth)} color="orange" icon={<Receipt size={24} />} />
        <StatCard title="Categories Used" value={categoriesUsed} color="purple" icon={<ClipboardList size={24} />} />
      </div>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Add Expense</h3></CardHeader>
        <CardBody>
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <Input label="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Expense description" />
            <Input label="Amount" type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Category</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <Input label="Date" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Branch</label>
              <select value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <Input label="Receipt Number" value={form.receipt_number} onChange={e => setForm({ ...form, receipt_number: e.target.value })} placeholder="REC-001" />
            <div className="flex items-end">
              <Button type="submit">Add Expense</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Expense Records ({expenses.length})</h3></CardHeader>
        <Table
          columns={[
            { header: 'Date', render: r => formatDate(r.date) },
            { header: 'Description', key: 'description' },
            { header: 'Category', render: r => <Badge variant={categoryVariant(r.category)}>{r.category}</Badge> },
            { header: 'Amount', render: r => <span className="font-bold text-red-600">{formatCurrency(r.amount)}</span> },
            { header: 'Branch', key: 'branch' },
            { header: 'Receipt #', key: 'receipt_number' },
            { header: 'Actions', render: r => (
              <Button size="sm" variant="danger" onClick={() => handleDelete(r.id)}>
                <Trash2 size={14} />
              </Button>
            )},
          ]}
          data={expenses}
          emptyMessage="No expenses recorded yet"
        />
      </Card>
    </div>
  );
}

function CommunicationTab() {
  const [messages, setMessages] = useState([
    { id: 1, content: 'All branch deposit slips must be submitted by 3:00 PM daily. Late submissions will be flagged for review.', priority: 'Urgent', timestamp: new Date(Date.now() - 86400000).toISOString() },
    { id: 2, content: 'Monthly financial reports are due by the 5th of each month. Please ensure all reconciliations are completed.', priority: 'Normal', timestamp: new Date(Date.now() - 172800000).toISOString() },
    { id: 3, content: 'New expense claim forms are now available on the portal. Please use the updated version for all submissions.', priority: 'Info', timestamp: new Date(Date.now() - 259200000).toISOString() },
  ]);
  const [form, setForm] = useState({ message: '', priority: 'Normal' });
  const [msgAlert, setMsgAlert] = useState('');

  const handleSend = (e) => {
    e.preventDefault();
    if (!form.message.trim()) {
      setMsgAlert('Error: Please enter a message.');
      return;
    }
    const newMsg = {
      id: Date.now(),
      content: form.message.trim(),
      priority: form.priority,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [newMsg, ...prev]);
    setForm({ message: '', priority: 'Normal' });
    setMsgAlert('Message sent successfully!');
  };

  const priorityVariant = (p) => {
    const map = { Urgent: 'danger', Normal: 'info', Info: 'success' };
    return map[p] || 'default';
  };

  return (
    <div className="space-y-4">
      {msgAlert && <Alert type={msgAlert.startsWith('Error') ? 'error' : 'success'} className="mb-2">{msgAlert}</Alert>}

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Send Staff Communication</h3></CardHeader>
        <CardBody>
          <form onSubmit={handleSend} className="space-y-3 max-w-2xl">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Message</label>
              <textarea
                value={form.message}
                onChange={e => setForm({ ...form, message: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 min-h-[80px] resize-y"
                placeholder="Type your message to finance staff..."
              />
            </div>
            <div className="flex gap-3 items-end">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Priority</label>
                <select
                  value={form.priority}
                  onChange={e => setForm({ ...form, priority: e.target.value })}
                  className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                >
                  <option>Normal</option>
                  <option>Urgent</option>
                  <option>Info</option>
                </select>
              </div>
              <Button type="submit"><Send size={14} /> Send Message</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Messages ({messages.length})</h3></CardHeader>
        <CardBody>
          {messages.length === 0 ? (
            <EmptyState icon={<MessageSquare size={48} />} title="No Messages" description="No staff communications yet." />
          ) : (
            <div className="space-y-3">
              {messages.map(msg => (
                <div key={msg.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant={priorityVariant(msg.priority)}>{msg.priority}</Badge>
                    <span className="text-xs text-gray-400">{formatDateTime(msg.timestamp)}</span>
                  </div>
                  <p className="text-sm text-gray-700">{msg.content}</p>
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
  const [form, setForm] = useState({ leave_type: 'Annual', start_date: '', end_date: '', reason: '' });
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.start_date || !form.end_date || !form.reason) {
      setMessage('Error: Please fill in all fields.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/employees/leaves', { ...form, department: 'Finance' });
      setMessage('Leave request submitted successfully!');
      setForm({ leave_type: 'Annual', start_date: '', end_date: '', reason: '' });
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader><h3 className="font-bold text-gray-800">Personal Leave Request</h3></CardHeader>
      <CardBody>
        {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} className="mb-4">{message}</Alert>}
        <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Leave Type</label>
            <select value={form.leave_type} onChange={e => setForm({ ...form, leave_type: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
              <option>Annual</option>
              <option>Sick</option>
              <option>Personal</option>
              <option>Maternity</option>
            </select>
          </div>
          <Input label="Start Date" type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
          <Input label="End Date" type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Reason</label>
            <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 min-h-[80px] resize-y"
              placeholder="Reason for leave request" />
          </div>
          <Button type="submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Request'}</Button>
        </form>
      </CardBody>
    </Card>
  );
}

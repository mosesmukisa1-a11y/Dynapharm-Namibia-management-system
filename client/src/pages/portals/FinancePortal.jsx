import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../lib/api';
import { useStockRealtime } from '../../hooks/useStockRealtime';
import { PRICE_LIST, findProductPrice } from '../../lib/pricing';
import { formatCurrency, formatDateTime, formatDate, BRANCH_DETAILS, BRANCHES } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Table, Modal, Alert } from '../../components/ui';
import { DollarSign, TrendingUp, Landmark, Upload, CheckCircle, FileSpreadsheet, ClipboardList, Download, Eye, Trash2, Send, MessageSquare, Receipt, Ship, XCircle, Filter, RefreshCw } from 'lucide-react';

const BRANCH_NAME_MAP = Object.fromEntries(BRANCH_DETAILS.map(b => [b.id, b.name]));
const branchLabel = (id) => BRANCH_NAME_MAP[id] || id || '—';

export default function FinancePortal() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'remittance', label: 'Remittance', icon: '🚢' },
    { id: 'deposits', label: 'Deposit Inbox', icon: '🏦' },
    { id: 'expenses', label: 'Expenses', icon: '💸' },
    { id: 'bonus', label: 'Bonus Workflow', icon: '💰' },
    { id: 'reports', label: 'Reports', icon: '📈' },
    { id: 'communication', label: 'Notices', icon: '📢' },
    { id: 'staff', label: 'Staff Services', icon: '👤' },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Finance Portal</h1>
        <p className="text-sm text-gray-500">Financial oversight, deposit verification, expense approvals, remittance and reporting</p>
      </div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'remittance' && <RemittanceTab />}
        {activeTab === 'deposits' && <DepositsTab />}
        {activeTab === 'expenses' && <ExpensesTab />}
        {activeTab === 'bonus' && <BonusTab />}
        {activeTab === 'reports' && <ReportsTab />}
        {activeTab === 'communication' && <CommunicationTab />}
        {activeTab === 'staff' && <StaffTab />}
      </div>
    </div>
  );
}

/* ─── DASHBOARD ─────────────────────────────────────────── */
function DashboardTab() {
  const [data, setData] = useState({ sales: [], deposits: [], orders: [] });
  const [branchSummary, setBranchSummary] = useState([]);
  const [financeSummary, setFinanceSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshFinanceSummary = useCallback(() => {
    api.finance.summary().then(d => { if (d?.success) setFinanceSummary(d); }).catch(() => {});
  }, []);

  const { connected: wsConnected } = useStockRealtime({ onUpdate: refreshFinanceSummary });

  useEffect(() => {
    Promise.all([
      api.branch.walkinSales().then(d => Array.isArray(d) ? d : d.sales || []).catch(() => []),
      api.branch.deposits().then(d => Array.isArray(d) ? d : d.deposits || []).catch(() => []),
      api.orders.list().then(d => Array.isArray(d) ? d : d.orders || []).catch(() => []),
      api.finance.branchesSummary().then(d => Array.isArray(d) ? d : d.branches || []).catch(() => []),
    ]).then(([sales, deposits, orders, branches]) => {
      setData({ sales, deposits, orders });
      setBranchSummary(branches);
    }).finally(() => setLoading(false));
    refreshFinanceSummary();
  }, []);

  if (loading) return <LoadingSpinner />;

  const totalSales = data.sales.reduce((s, x) => s + Number(x.total || x.amount || 0), 0)
    + data.orders.reduce((s, x) => s + Number(x.total || 0), 0);
  const pendingDeposits = data.deposits.filter(d => d.status !== 'verified' && d.status !== 'approved');
  const totalPendingAmt = pendingDeposits.reduce((s, d) => s + Number(d.amount || 0), 0);
  const totalVerified = data.deposits.filter(d => d.status === 'verified' || d.status === 'approved').reduce((s, d) => s + Number(d.amount || 0), 0);
  const totalExpenses = 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl p-5 text-white bg-gradient-to-br from-purple-500 to-purple-700">
          <p className="text-xs opacity-80 uppercase tracking-wide">Total Sales Revenue</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totalSales)}</p>
          <p className="text-xs opacity-70 mt-1">All channels combined</p>
        </div>
        <div className="rounded-xl p-5 text-white bg-gradient-to-br from-orange-400 to-orange-600">
          <p className="text-xs opacity-80 uppercase tracking-wide">Pending Deposits</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totalPendingAmt)}</p>
          <p className="text-xs opacity-70 mt-1">{pendingDeposits.length} awaiting verification</p>
        </div>
        <div className="rounded-xl p-5 text-white bg-gradient-to-br from-green-500 to-green-700">
          <p className="text-xs opacity-80 uppercase tracking-wide">Verified Deposits</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totalVerified)}</p>
          <p className="text-xs opacity-70 mt-1">Confirmed in bank</p>
        </div>
        <div className="rounded-xl p-5 text-white bg-gradient-to-br from-blue-500 to-blue-700">
          <p className="text-xs opacity-80 uppercase tracking-wide">Total Branches</p>
          <p className="text-2xl font-bold mt-1">{branchSummary.length || BRANCH_DETAILS.length}</p>
          <p className="text-xs opacity-70 mt-1">Active locations</p>
        </div>
      </div>

      {financeSummary && (
        <Card className="bg-gradient-to-r from-indigo-50 to-blue-50 border-indigo-200">
          <CardBody>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <FileSpreadsheet size={16} className="text-indigo-600" /> Finance Summary
                {wsConnected && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#dcfce7', color: '#166534', borderRadius: 99, padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />LIVE</span>}
              </h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white/80 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Total Revenue</p>
                <p className="text-lg font-bold text-green-700">{formatCurrency(financeSummary.revenue?.totalSales || 0)}</p>
                <p className="text-xs text-gray-400">Walk-in: {formatCurrency(financeSummary.revenue?.walkinSales || 0)}</p>
              </div>
              <div className="bg-white/80 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Member Revenue</p>
                <p className="text-lg font-bold text-blue-700">{formatCurrency(financeSummary.revenue?.memberSales || 0)}</p>
                <p className="text-xs text-gray-400">Non-member: {formatCurrency(financeSummary.revenue?.nonMemberSales || 0)}</p>
              </div>
              <div className="bg-white/80 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Stock Value (DP)</p>
                <p className="text-lg font-bold text-purple-700">{formatCurrency(financeSummary.stockValue?.companyValueDP || 0)}</p>
                <p className="text-xs text-gray-400">Warehouse: {formatCurrency(financeSummary.stockValue?.warehouseValueDP || 0)}</p>
              </div>
              <div className="bg-white/80 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Branch Stock Value</p>
                <p className="text-lg font-bold text-orange-700">{formatCurrency(financeSummary.stockValue?.branchValueDP || 0)}</p>
                <p className="text-xs text-gray-400">Write-offs: {formatCurrency(financeSummary.stockValue?.writeOffValueDP || 0)}</p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {branchSummary.length > 0 && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Branch Financial Overview</h3></CardHeader>
          <Table
            columns={[
              { header: 'Branch', render: r => <span className="font-semibold">{r.branchName || branchLabel(r.branchId)}</span> },
              { header: 'Sales Revenue', render: r => <span className="font-bold text-green-700">{formatCurrency(r.salesRevenue || 0)}</span> },
              { header: 'Cash', render: r => formatCurrency(r.cashTotal || 0) },
              { header: 'Swipe/EFT', render: r => formatCurrency((r.swipeTotal || 0) + (r.eftTotal || 0)) },
              { header: 'Stock Value (DP)', render: r => formatCurrency(r.stockValueDP || 0) },
            ]}
            data={branchSummary}
            emptyMessage="No branch data"
          />
        </Card>
      )}

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Recent Transactions</h3></CardHeader>
        <Table
          columns={[
            { header: 'Date', render: r => formatDateTime(r.created_at) },
            { header: 'Type', render: r => <Badge variant="info">{r.type || 'Sale'}</Badge> },
            { header: 'Amount', render: r => <span className="font-bold text-green-600">{formatCurrency(r.amount || r.total)}</span> },
            { header: 'Branch', render: r => branchLabel(r.branch_id || r.branch) },
          ]}
          data={[...data.sales, ...data.deposits].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 15)}
          emptyMessage="No recent transactions"
        />
      </Card>
    </div>
  );
}

/* ─── REMITTANCE ─────────────────────────────────────────── */
function RemittanceTab() {
  const [data, setData] = useState({ sales: [], deposits: [], orders: [] });
  const [loading, setLoading] = useState(true);
  const [remittances, setRemittances] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: '', reference: '', date: new Date().toISOString().slice(0, 10), notes: '' });
  const [message, setMessage] = useState('');

  useEffect(() => {
    Promise.all([
      api.branch.walkinSales().then(d => Array.isArray(d) ? d : d.sales || []).catch(() => []),
      api.branch.deposits().then(d => Array.isArray(d) ? d : d.deposits || []).catch(() => []),
      api.orders.list().then(d => Array.isArray(d) ? d : d.orders || []).catch(() => []),
      api.finance.remittances().then(d => Array.isArray(d) ? d : d.remittances || []).catch(() => []),
    ]).then(([sales, deposits, orders, history]) => {
      setData({ sales, deposits, orders });
      setRemittances(history);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const allItems = [];
  const processItems = items => (items || []).forEach(item => {
    const matched = findProductPrice(item.name || item.product_name || '');
    allItems.push({ quantity: Number(item.quantity || item.qty || 1), cif: matched ? matched.cif : 0 });
  });
  data.orders.forEach(o => processItems(o.items));
  data.sales.forEach(s => processItems(s.items));

  const totalCIF = allItems.reduce((s, i) => s + i.cif * i.quantity, 0);
  const totalDeposits = data.deposits.reduce((s, d) => s + Number(d.amount || 0), 0);
  const totalRemitted = remittances.reduce((s, r) => s + Number(r.amount || 0), 0);
  const remittanceDue = Math.max(0, totalCIF - totalDeposits - totalRemitted);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) { setMessage('Error: Please enter a valid amount.'); return; }
    if (!form.reference) { setMessage('Error: Please enter a payment reference.'); return; }
    try {
      const saved = await api.finance.createRemittance({ amount: Number(form.amount), reference: form.reference, date: form.date, notes: form.notes, status: 'completed' });
      setRemittances(prev => [saved.remittance || { id: Date.now(), ...form, amount: Number(form.amount), payment_date: form.date, status: 'completed', created_at: new Date().toISOString() }, ...prev]);
      setForm({ amount: '', reference: '', date: new Date().toISOString().slice(0, 10), notes: '' });
      setShowForm(false);
      setMessage('Remittance recorded successfully!');
    } catch (err) { setMessage('Error: ' + (err.message || 'Failed to save')); }
  };

  const markNoRemittanceDue = async () => {
    try {
      const saved = await api.finance.createRemittance({ amount: 0, reference: 'STATUS-UPDATE', date: new Date().toISOString().slice(0, 10), notes: 'Status updated: No remittance due', status: 'no_remittance_due' });
      setRemittances(prev => [saved.remittance || { id: Date.now(), amount: 0, reference: 'STATUS-UPDATE', payment_date: new Date().toISOString().slice(0, 10), status: 'no_remittance_due', created_at: new Date().toISOString() }, ...prev]);
      setMessage('Status updated: No Remittance Due');
    } catch (err) { setMessage('Error: ' + (err.message || 'Failed')); }
  };

  return (
    <div className="space-y-6">
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} className="mb-4">{message}</Alert>}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardBody>
          <div className="flex items-start gap-4">
            <Ship size={32} className="text-blue-600 mt-1" />
            <div>
              <h3 className="font-bold text-blue-900">Remittance to Supplier (Malaysia)</h3>
              <p className="text-sm text-blue-700 mt-1">Track CIF cost against deposits received and record remittance payments to Dynapharm International Malaysia.</p>
            </div>
          </div>
        </CardBody>
      </Card>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total CIF Cost" value={formatCurrency(totalCIF)} subtitle="Cost of goods sold" color="red" icon={<Ship size={24} />} />
        <StatCard title="Deposits Received" value={formatCurrency(totalDeposits)} subtitle="From all branches" color="blue" icon={<Landmark size={24} />} />
        <StatCard title="Total Remitted" value={formatCurrency(totalRemitted)} subtitle="Paid to supplier" color="green" icon={<CheckCircle size={24} />} />
        <StatCard title={remittanceDue > 0 ? 'Outstanding' : 'Status'} value={remittanceDue > 0 ? formatCurrency(remittanceDue) : 'Settled'} subtitle={remittanceDue > 0 ? 'Due to supplier' : 'No remittance due'} color={remittanceDue > 0 ? 'orange' : 'green'} icon={<DollarSign size={24} />} />
      </div>
      <div className="flex gap-3">
        <Button onClick={() => setShowForm(true)}><DollarSign size={16} /> Record Remittance Payment</Button>
        {remittanceDue <= 0
          ? <Button variant="success" onClick={markNoRemittanceDue}><CheckCircle size={16} /> Confirm: No Remittance Due</Button>
          : <Button variant="secondary" onClick={markNoRemittanceDue}>Override: Mark No Remittance Due</Button>}
      </div>
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Remittance History</h3></CardHeader>
        <Table
          columns={[
            { header: 'Date', render: r => formatDate(r.payment_date || r.date) },
            { header: 'Amount', render: r => r.amount > 0 ? <span className="font-bold text-green-600">{formatCurrency(r.amount)}</span> : '—' },
            { header: 'Reference', key: 'reference' },
            { header: 'Status', render: r => <Badge variant={r.status === 'completed' ? 'success' : r.status === 'no_remittance_due' ? 'info' : 'warning'}>{r.status === 'no_remittance_due' ? 'No Remittance Due' : r.status === 'completed' ? 'Completed' : r.status}</Badge> },
            { header: 'Notes', render: r => <span className="text-sm text-gray-600">{r.notes || '—'}</span> },
          ]}
          data={remittances}
          emptyMessage="No remittance records yet"
        />
      </Card>
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Record Remittance Payment" size="md">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="bg-orange-50 p-3 rounded-lg text-sm">Outstanding: <strong className="text-orange-600">{formatCurrency(remittanceDue)}</strong></div>
          <Input label="Amount (N$)" type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="Enter amount" />
          <Input label="Payment Reference" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="e.g. TT-2026-0042" />
          <Input label="Date" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          <Input label="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Bank details, remarks…" />
          <div className="flex gap-3">
            <Button type="submit"><DollarSign size={16} /> Record Payment</Button>
            <Button variant="secondary" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/* ─── DEPOSIT INBOX ──────────────────────────────────────── */
function DepositsTab() {
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [actionId, setActionId] = useState(null);
  const [actionType, setActionType] = useState('');
  const [actionNotes, setActionNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState([]);

  const load = () => {
    setLoading(true);
    api.branch.deposits()
      .then(d => setDeposits(Array.isArray(d) ? d : d.deposits || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const doAction = async () => {
    setSubmitting(true);
    try {
      if (actionType === 'approve') {
        await api.branch.verifyDeposit(actionId, actionNotes);
        setMessage('Deposit verified and approved!');
      } else {
        await api.branch.rejectDeposit(actionId, actionNotes);
        setMessage('Deposit rejected.');
      }
      setActionId(null); setActionNotes('');
      load();
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setSubmitting(false); }
  };

  const doBatchApprove = async () => {
    setSubmitting(true);
    try {
      for (const id of selected) await api.branch.verifyDeposit(id);
      setMessage(`${selected.length} deposits approved.`);
      setSelected([]); setBatchMode(false); load();
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setSubmitting(false); }
  };

  const exportCSV = () => {
    const headers = ['Date', 'Branch', 'Deposited By', 'Bank', 'Amount', 'Reference', 'Status'];
    const rows = filtered.map(d => [
      formatDate(d.deposit_date || d.date || d.created_at),
      branchLabel(d.branch_id || d.branch),
      d.deposited_by || d.deposited_by || '',
      d.bank_name || '',
      d.amount,
      d.reference || d.slip_number || '',
      d.status || 'pending',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `deposits-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  if (loading) return <LoadingSpinner />;

  let filtered = deposits;
  if (filterBranch) filtered = filtered.filter(d => (d.branch_id || d.branch) === filterBranch);
  if (filterStatus) filtered = filtered.filter(d => (d.status || 'pending') === filterStatus);
  if (filterDate) filtered = filtered.filter(d => {
    const dt = (d.deposit_date || d.date || d.created_at || '').slice(0, 10);
    return dt === filterDate;
  });

  const pending = deposits.filter(d => d.status !== 'approved' && d.status !== 'verified');
  const approved = deposits.filter(d => d.status === 'approved' || d.status === 'verified');
  const totalPending = pending.reduce((s, d) => s + Number(d.amount || 0), 0);
  const totalApproved = approved.reduce((s, d) => s + Number(d.amount || 0), 0);
  const pendingFiltered = filtered.filter(d => d.status !== 'approved' && d.status !== 'verified');

  return (
    <div className="space-y-5">
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} className="mb-2">{message}</Alert>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Pending Deposits" value={pending.length} subtitle={formatCurrency(totalPending) + ' pending'} color="orange" icon={<Landmark size={24} />} />
        <StatCard title="Verified Deposits" value={approved.length} subtitle={formatCurrency(totalApproved) + ' confirmed'} color="green" icon={<CheckCircle size={24} />} />
        <StatCard title="Total Records" value={deposits.length} subtitle="All branches" color="blue" icon={<Receipt size={24} />} />
        <StatCard title="Branches Active" value={new Set(deposits.map(d => d.branch_id || d.branch).filter(Boolean)).size} subtitle="Submitting deposits" color="purple" icon={<TrendingUp size={24} />} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div>
              <h3 className="font-bold text-gray-800">Deposit Inbox — All Branches</h3>
              <p className="text-xs text-gray-500 mt-0.5">Branches record deposits; Finance verifies against bank statements</p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {batchMode && selected.length > 0 && (
                <Button size="sm" variant="success" onClick={doBatchApprove} disabled={submitting}>
                  <CheckCircle size={14} /> Approve ({selected.length})
                </Button>
              )}
              <Button size="sm" variant={batchMode ? 'danger' : 'secondary'} onClick={() => { setBatchMode(!batchMode); setSelected([]); }}>
                {batchMode ? 'Cancel Batch' : 'Batch Approve'}
              </Button>
              <Button size="sm" variant="secondary" onClick={exportCSV}><Download size={14} /> Export CSV</Button>
              <Button size="sm" variant="secondary" onClick={load}><RefreshCw size={14} /> Refresh</Button>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-3 mb-4">
            <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
              <option value="">All Branches</option>
              {BRANCH_DETAILS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="verified">Verified</option>
              <option value="rejected">Rejected</option>
            </select>
            <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20" />
            {(filterBranch || filterStatus || filterDate) && (
              <Button size="sm" variant="secondary" onClick={() => { setFilterBranch(''); setFilterStatus(''); setFilterDate(''); }}>
                <XCircle size={14} /> Clear
              </Button>
            )}
          </div>
          <Table
            columns={[
              ...(batchMode ? [{
                header: '',
                render: r => (r.status !== 'approved' && r.status !== 'verified') && (
                  <input type="checkbox" checked={selected.includes(r.id)} onChange={() => setSelected(prev => prev.includes(r.id) ? prev.filter(x => x !== r.id) : [...prev, r.id])} className="w-4 h-4 cursor-pointer" />
                )
              }] : []),
              { header: 'Date', render: r => formatDate(r.deposit_date || r.date || r.created_at) },
              { header: 'Branch', render: r => <span className="font-semibold text-sm">{branchLabel(r.branch_id || r.branch)}</span> },
              { header: 'Deposited By', render: r => <span className="text-sm">{r.deposited_by || r.created_by || '—'}</span> },
              { header: 'Bank', render: r => <span className="text-sm">{r.bank_name || '—'}</span> },
              { header: 'Amount', render: r => <span className="font-bold text-green-700">{formatCurrency(r.amount)}</span> },
              { header: 'Reference', render: r => <span className="text-xs font-mono">{r.reference || r.slip_number || '—'}</span> },
              { header: 'Status', render: r => {
                const s = r.status || 'pending';
                return <Badge variant={s === 'approved' || s === 'verified' ? 'success' : s === 'rejected' ? 'danger' : 'warning'}>{s.charAt(0).toUpperCase() + s.slice(1)}</Badge>;
              }},
              { header: 'Actions', render: r => {
                const s = r.status || 'pending';
                if (s === 'approved' || s === 'verified') return <span className="text-xs text-green-600 font-semibold">✓ Verified</span>;
                if (s === 'rejected') return <span className="text-xs text-red-500">Rejected</span>;
                return !batchMode && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="success" onClick={() => { setActionId(r.id); setActionType('approve'); setActionNotes(''); }}>
                      <CheckCircle size={12} /> Verify
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => { setActionId(r.id); setActionType('reject'); setActionNotes(''); }}>
                      <XCircle size={12} /> Reject
                    </Button>
                  </div>
                );
              }},
            ]}
            data={filtered}
            emptyMessage="No deposits found"
          />
        </CardBody>
      </Card>

      <Modal open={!!actionId} onClose={() => { setActionId(null); setActionNotes(''); }} title={actionType === 'approve' ? 'Verify Deposit' : 'Reject Deposit'} size="sm">
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">
            {actionType === 'approve'
              ? 'Confirm this deposit has been verified against the bank statement.'
              : 'Provide a reason for rejecting this deposit.'}
          </p>
          <Input
            label={actionType === 'approve' ? 'Verification Notes (optional)' : 'Rejection Reason *'}
            value={actionNotes}
            onChange={e => setActionNotes(e.target.value)}
            placeholder={actionType === 'approve' ? 'Bank slip ref, notes…' : 'Reason for rejection…'}
          />
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setActionId(null); setActionNotes(''); }}>Cancel</Button>
            <Button variant={actionType === 'approve' ? 'success' : 'danger'} onClick={doAction} disabled={submitting}>
              {submitting ? 'Processing…' : actionType === 'approve' ? '✓ Confirm Verification' : '✗ Reject Deposit'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ─── EXPENSES ───────────────────────────────────────────── */
function ExpensesTab() {
  const CATEGORIES = ['Office Supplies', 'Transport', 'Utilities', 'Maintenance', 'Marketing', 'Staff Welfare', 'Equipment', 'Cleaning', 'Communication', 'Other'];
  const emptyHQForm = { description: '', amount: '', category: 'Office Supplies', date: new Date().toISOString().slice(0, 10), receipt_number: '' };
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showHQForm, setShowHQForm] = useState(false);
  const [hqForm, setHQForm] = useState(emptyHQForm);
  const [submitting, setSubmitting] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [actionType, setActionType] = useState('');
  const [actionNotes, setActionNotes] = useState('');

  const load = () => {
    setLoading(true);
    api.branch.expenses()
      .then(d => setExpenses(Array.isArray(d) ? d : d.expenses || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleAddHQ = async (e) => {
    e.preventDefault();
    if (!hqForm.description || !hqForm.amount) { setMessage('Error: Description and amount are required.'); return; }
    setSubmitting(true);
    try {
      const result = await api.branch.createExpense({
        branchId: 'head_office',
        date: hqForm.date,
        amount: Number(hqForm.amount),
        description: hqForm.description,
        category: hqForm.category,
        paymentMethod: 'cash',
        metadata: hqForm.receipt_number ? { receipt_number: hqForm.receipt_number } : null,
      });
      setExpenses(prev => [result.expense || result, ...prev]);
      setHQForm(emptyHQForm);
      setShowHQForm(false);
      setMessage('Head Office expense recorded.');
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setSubmitting(false); }
  };

  const doAction = async () => {
    setSubmitting(true);
    try {
      if (actionType === 'approve') {
        await api.finance.approveExpense(actionId, actionNotes);
        setMessage('Expense approved.');
      } else {
        await api.finance.rejectExpense(actionId, actionNotes);
        setMessage('Expense rejected.');
      }
      setActionId(null); setActionNotes('');
      load();
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setSubmitting(false); }
  };

  if (loading) return <LoadingSpinner />;

  let filtered = expenses;
  if (filterBranch) filtered = filtered.filter(e => (e.branchId || e.branch_id) === filterBranch);
  if (filterStatus) filtered = filtered.filter(e => (e.status || 'recorded') === filterStatus);
  if (filterCategory) filtered = filtered.filter(e => e.category === filterCategory);

  const totalAll = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const pendingReview = expenses.filter(e => e.status === 'recorded' || !e.status).length;
  const totalApproved = expenses.filter(e => e.status === 'approved').reduce((s, e) => s + Number(e.amount || 0), 0);

  const categoryVariant = cat => ({ 'Office Supplies': 'info', 'Transport': 'warning', 'Utilities': 'primary', 'Maintenance': 'danger', 'Marketing': 'success', 'Other': 'default' }[cat] || 'default');

  return (
    <div className="space-y-5">
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} className="mb-2">{message}</Alert>}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard title="Total Expenses" value={formatCurrency(totalAll)} color="red" icon={<DollarSign size={24} />} />
        <StatCard title="Pending Review" value={pendingReview} subtitle="Awaiting approval" color="orange" icon={<ClipboardList size={24} />} />
        <StatCard title="Approved Amount" value={formatCurrency(totalApproved)} color="green" icon={<CheckCircle size={24} />} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div>
              <h3 className="font-bold text-gray-800">Branch & Company Expenses</h3>
              <p className="text-xs text-gray-500 mt-0.5">Branch users submit expenses; Finance reviews and approves</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setShowHQForm(true)}><Receipt size={14} /> Add HQ Expense</Button>
              <Button size="sm" variant="secondary" onClick={load}><RefreshCw size={14} /> Refresh</Button>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-3 mb-4">
            <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none">
              <option value="">All Branches</option>
              {BRANCH_DETAILS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              <option value="head_office">Head Office</option>
            </select>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none">
              <option value="">All Statuses</option>
              <option value="recorded">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none">
              <option value="">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {(filterBranch || filterStatus || filterCategory) && (
              <Button size="sm" variant="secondary" onClick={() => { setFilterBranch(''); setFilterStatus(''); setFilterCategory(''); }}>
                <XCircle size={14} /> Clear
              </Button>
            )}
          </div>
          <Table
            columns={[
              { header: 'Date', render: r => formatDate(r.date || r.created_at) },
              { header: 'Branch', render: r => <span className="text-sm font-semibold">{branchLabel(r.branchId || r.branch_id) === '—' ? 'Head Office' : branchLabel(r.branchId || r.branch_id)}</span> },
              { header: 'Category', render: r => <Badge variant={categoryVariant(r.category)}>{r.category || '—'}</Badge> },
              { header: 'Description', render: r => <span className="text-sm">{r.description || '—'}</span> },
              { header: 'Amount', render: r => <span className="font-bold text-red-600">{formatCurrency(r.amount)}</span> },
              { header: 'Status', render: r => {
                const s = r.status || 'recorded';
                return <Badge variant={s === 'approved' ? 'success' : s === 'rejected' ? 'danger' : 'warning'}>{s === 'recorded' ? 'Pending' : s.charAt(0).toUpperCase() + s.slice(1)}</Badge>;
              }},
              { header: 'Actions', render: r => {
                const s = r.status || 'recorded';
                if (s === 'approved') return <span className="text-xs text-green-600 font-semibold">✓ Approved</span>;
                if (s === 'rejected') return <span className="text-xs text-red-500">Rejected</span>;
                return (
                  <div className="flex gap-1">
                    <Button size="sm" variant="success" onClick={() => { setActionId(r.id); setActionType('approve'); setActionNotes(''); }}>
                      <CheckCircle size={12} /> Approve
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => { setActionId(r.id); setActionType('reject'); setActionNotes(''); }}>
                      <XCircle size={12} /> Reject
                    </Button>
                  </div>
                );
              }},
            ]}
            data={filtered}
            emptyMessage="No expenses found"
          />
        </CardBody>
      </Card>

      <Modal open={showHQForm} onClose={() => setShowHQForm(false)} title="Add Head Office Expense" size="md">
        <form onSubmit={handleAddHQ} className="p-6 space-y-4">
          <div className="bg-blue-50 p-3 rounded-lg text-xs text-blue-700">Head Office expenses are recorded under company-level accounts, not branch-specific.</div>
          <Input label="Description *" value={hqForm.description} onChange={e => setHQForm({ ...hqForm, description: e.target.value })} placeholder="e.g. Office stationery" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Amount (N$) *" type="number" min="0" step="0.01" value={hqForm.amount} onChange={e => setHQForm({ ...hqForm, amount: e.target.value })} />
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Category</label>
              <select value={hqForm.category} onChange={e => setHQForm({ ...hqForm, category: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Date" type="date" value={hqForm.date} onChange={e => setHQForm({ ...hqForm, date: e.target.value })} />
            <Input label="Receipt Number" value={hqForm.receipt_number} onChange={e => setHQForm({ ...hqForm, receipt_number: e.target.value })} placeholder="REC-001" />
          </div>
          <div className="flex gap-3">
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Record Expense'}</Button>
            <Button variant="secondary" type="button" onClick={() => setShowHQForm(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!actionId} onClose={() => { setActionId(null); setActionNotes(''); }} title={actionType === 'approve' ? 'Approve Expense' : 'Reject Expense'} size="sm">
        <div className="p-6 space-y-4">
          <Input
            label={actionType === 'approve' ? 'Approval Notes (optional)' : 'Rejection Reason *'}
            value={actionNotes}
            onChange={e => setActionNotes(e.target.value)}
            placeholder={actionType === 'approve' ? 'Optional notes…' : 'Reason for rejection…'}
          />
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setActionId(null); setActionNotes(''); }}>Cancel</Button>
            <Button variant={actionType === 'approve' ? 'success' : 'danger'} onClick={doAction} disabled={submitting}>
              {submitting ? 'Processing…' : actionType === 'approve' ? '✓ Approve' : '✗ Reject'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ─── BONUS WORKFLOW ─────────────────────────────────────── */
function BonusTab() {
  const [bonuses, setBonuses] = useState([]);
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true); setMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'bonus');
      const result = await api.upload(formData);
      const rows = result.data || result.rows || [];
      setBonuses(rows.map((r, i) => ({ id: i + 1, ...r, status: 'pending' })));
      setMessage(`Uploaded ${rows.length} bonus records for review.`);
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setUploading(false); }
  };

  const approve = id => setBonuses(prev => prev.map(b => b.id === id ? { ...b, status: 'approved' } : b));
  const reject = id => setBonuses(prev => prev.map(b => b.id === id ? { ...b, status: 'rejected' } : b));
  const approveAll = () => setBonuses(prev => prev.map(b => b.status === 'pending' ? { ...b, status: 'approved' } : b));

  const exportCSV = () => {
    const approved = bonuses.filter(b => b.status === 'approved');
    if (!approved.length) return;
    const csv = [
      ['Distributor', 'NB Number', 'Amount', 'BV'],
      ...approved.map(b => [b.distributor_name || b.name || '', b.nb_number || '', b.amount || '', b.bv || '']),
    ].map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `approved-bonuses-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const pending = bonuses.filter(b => b.status === 'pending');
  const approved = bonuses.filter(b => b.status === 'approved');

  return (
    <div className="space-y-4">
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'}>{message}</Alert>}

      <Card className="bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200">
        <CardBody>
          <h3 className="font-bold text-orange-900 mb-1">Distributor Bonus Processing</h3>
          <p className="text-sm text-orange-700">Upload a bonus CSV from the company system, review each record, then export approved bonuses for payroll processing.</p>
        </CardBody>
      </Card>

      {bonuses.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard title="Total Records" value={bonuses.length} color="blue" icon={<ClipboardList size={24} />} />
          <StatCard title="Pending Review" value={pending.length} color="orange" icon={<Receipt size={24} />} />
          <StatCard title="Approved" value={approved.length} subtitle={formatCurrency(approved.reduce((s, b) => s + Number(b.amount || 0), 0))} color="green" icon={<CheckCircle size={24} />} />
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Upload Bonus CSV</h3>
            <div className="text-xs text-gray-500">Required columns: distributor_name, nb_number, amount, bv</div>
          </div>
        </CardHeader>
        <CardBody>
          <input ref={fileRef} type="file" accept=".csv,.xlsx" onChange={handleUpload} className="hidden" />
          <div className="flex gap-3 items-center">
            <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Upload size={16} /> {uploading ? 'Uploading…' : 'Select CSV File'}
            </Button>
            {bonuses.length > 0 && (
              <>
                <Button variant="success" onClick={approveAll} disabled={!pending.length}>Approve All Pending ({pending.length})</Button>
                <Button variant="secondary" onClick={exportCSV} disabled={!approved.length}>
                  <Download size={14} /> Export Approved ({approved.length})
                </Button>
                <Button variant="danger" size="sm" onClick={() => setBonuses([])}>Clear</Button>
              </>
            )}
          </div>
        </CardBody>
      </Card>

      {bonuses.length > 0 && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Bonus Records — Review</h3></CardHeader>
          <Table
            columns={[
              { header: 'Distributor', render: r => r.distributor_name || r.name || '—' },
              { header: 'NB Number', render: r => r.nb_number || '—' },
              { header: 'Amount', render: r => <span className="font-bold">{formatCurrency(r.amount || 0)}</span> },
              { header: 'BV', render: r => r.bv || '—' },
              { header: 'Status', render: r => <Badge variant={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}>{r.status.charAt(0).toUpperCase() + r.status.slice(1)}</Badge> },
              { header: 'Actions', render: r => r.status === 'pending' && (
                <div className="flex gap-1">
                  <Button size="sm" variant="success" onClick={() => approve(r.id)}>Approve</Button>
                  <Button size="sm" variant="danger" onClick={() => reject(r.id)}>Reject</Button>
                </div>
              )},
            ]}
            data={bonuses}
            emptyMessage="No records"
          />
        </Card>
      )}
    </div>
  );
}

/* ─── REPORTS ────────────────────────────────────────────── */
function ReportsTab() {
  const [branchSummary, setBranchSummary] = useState([]);
  const [stockValue, setStockValue] = useState(null);
  const [writeoffs, setWriteoffs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');

  const periodParams = { all: {}, today: { days: 1 }, week: { days: 7 }, month: { days: 30 }, quarter: { days: 90 } };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.finance.branchesSummary(periodParams[period] || {}).then(d => Array.isArray(d) ? d : d.branches || []).catch(() => []),
      api.finance.stockValue().then(d => d).catch(() => null),
      api.finance.writeoffs().then(d => d).catch(() => null),
    ]).then(([branches, stock, wo]) => {
      setBranchSummary(branches);
      setStockValue(stock);
      setWriteoffs(wo);
    }).finally(() => setLoading(false));
  }, [period]);

  const totalRevenue = branchSummary.reduce((s, b) => s + parseFloat(b.salesRevenue || 0), 0);
  const totalCash = branchSummary.reduce((s, b) => s + parseFloat(b.cashTotal || 0), 0);
  const totalSwipe = branchSummary.reduce((s, b) => s + parseFloat(b.swipeTotal || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Period:</label>
        {['today', 'week', 'month', 'quarter', 'all'].map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${period === p ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
            {p === 'all' ? 'All Time' : p.charAt(0).toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard title="Total Revenue" value={formatCurrency(totalRevenue)} color="green" icon={<TrendingUp size={24} />} />
            <StatCard title="Cash Collected" value={formatCurrency(totalCash)} color="blue" icon={<DollarSign size={24} />} />
            <StatCard title="Swipe / EFT" value={formatCurrency(totalSwipe)} color="purple" icon={<Landmark size={24} />} />
          </div>

          <Card>
            <CardHeader><h3 className="font-bold text-gray-800">Branch Financial Summary</h3></CardHeader>
            <Table
              columns={[
                { header: 'Branch', render: r => <span className="font-semibold">{r.branchName || branchLabel(r.branchId)}</span> },
                { header: 'Sales Revenue', render: r => <span className="font-bold text-green-700">{formatCurrency(r.salesRevenue || 0)}</span> },
                { header: 'Units Sold', render: r => r.salesUnits || 0 },
                { header: 'Cash', render: r => formatCurrency(r.cashTotal || 0) },
                { header: 'Swipe', render: r => formatCurrency(r.swipeTotal || 0) },
                { header: 'EFT', render: r => formatCurrency(r.eftTotal || 0) },
                { header: 'Stock Value (DP)', render: r => formatCurrency(r.stockValueDP || 0) },
              ]}
              data={branchSummary}
              emptyMessage="No branch data available"
            />
          </Card>

          {stockValue && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-gray-800">Stock Value Report</h3>
                  <span className="text-xs text-gray-400">As of {stockValue.asOfDate ? new Date(stockValue.asOfDate).toLocaleDateString() : 'today'}</span>
                </div>
              </CardHeader>
              <CardBody>
                <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">Total Company Stock Value (Selling Price / DP)</p>
                  <p className="text-3xl font-bold text-primary">{formatCurrency(stockValue.totalCompanyValueDP || 0)}</p>
                </div>
                <Table
                  columns={[
                    { header: 'Location', render: r => r.branchName || branchLabel(r.branchId) || '—' },
                    { header: 'Retail Value (DP)', render: r => <span className="font-semibold text-blue-700">{formatCurrency(r.totalValueDP || 0)}</span> },
                    { header: 'SKUs', render: r => Array.isArray(r.items) ? r.items.length : '—' },
                  ]}
                  data={[...(stockValue.warehouses || []), ...(stockValue.branches || [])]}
                  emptyMessage="No stock breakdown"
                />
              </CardBody>
            </Card>
          )}

          {writeoffs && (
            <Card>
              <CardHeader><h3 className="font-bold text-gray-800">Write-Off Report</h3></CardHeader>
              <CardBody>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">Total Write-off Value (DP)</p>
                    <p className="text-xl font-bold text-red-700">{formatCurrency(writeoffs.totalValueDP || writeoffs.total_value_dp || 0)}</p>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">Total Write-off Value (CP)</p>
                    <p className="text-xl font-bold text-orange-700">{formatCurrency(writeoffs.totalValueCP || writeoffs.total_value_cp || 0)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">Total Records</p>
                    <p className="text-xl font-bold text-gray-700">{writeoffs.totalRecords || writeoffs.total_records || (writeoffs.writeoffs || []).length}</p>
                  </div>
                </div>
                {Array.isArray(writeoffs.writeoffs) && writeoffs.writeoffs.length > 0 && (
                  <Table
                    columns={[
                      { header: 'Branch', render: r => branchLabel(r.branch_id || r.location_id) },
                      { header: 'Product', render: r => r.product_name || r.description || '—' },
                      { header: 'Qty', render: r => r.quantity || r.qty || '—' },
                      { header: 'Value (DP)', render: r => formatCurrency(r.value_dp || r.total_dp || 0) },
                      { header: 'Reason', render: r => r.reason || '—' },
                      { header: 'Date', render: r => formatDate(r.date || r.created_at) },
                    ]}
                    data={writeoffs.writeoffs.slice(0, 20)}
                    emptyMessage="No write-offs"
                  />
                )}
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/* ─── COMMUNICATION / NOTICES ────────────────────────────── */
function CommunicationTab() {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ title: '', message: '', priority: 'Normal' });
  const [msgAlert, setMsgAlert] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    api.finance.notices()
      .then(d => setNotices(Array.isArray(d) ? d : d.notices || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!form.message.trim()) { setMsgAlert('Error: Please enter a message.'); return; }
    setSubmitting(true);
    try {
      const result = await api.finance.createNotice(form);
      setNotices(prev => [result.notice || { id: Date.now(), ...form, createdAt: new Date().toISOString() }, ...prev]);
      setForm({ title: '', message: '', priority: 'Normal' });
      setMsgAlert('Notice posted successfully!');
    } catch (err) { setMsgAlert('Error: ' + (err.message || 'Failed to post')); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/finance/notices?id=${id}`);
      setNotices(prev => prev.filter(n => n.id !== id));
    } catch { setNotices(prev => prev.filter(n => n.id !== id)); }
  };

  const priorityVariant = p => ({ Urgent: 'danger', Normal: 'info', Info: 'success' }[p] || 'default');

  return (
    <div className="space-y-4">
      {msgAlert && <Alert type={msgAlert.startsWith('Error') ? 'error' : 'success'} className="mb-2">{msgAlert}</Alert>}

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Post Finance Notice</h3></CardHeader>
        <CardBody>
          <form onSubmit={handleSend} className="space-y-3 max-w-2xl">
            <Input label="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Notice title (optional)" />
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Message *</label>
              <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 min-h-[80px] resize-y"
                placeholder="Type your notice for finance staff…" />
            </div>
            <div className="flex gap-3 items-end">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Priority</label>
                <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                  className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none">
                  <option>Normal</option>
                  <option>Urgent</option>
                  <option>Info</option>
                </select>
              </div>
              <Button type="submit" disabled={submitting}><Send size={14} /> {submitting ? 'Posting…' : 'Post Notice'}</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Posted Notices ({loading ? '…' : notices.length})</h3>
            <Button size="sm" variant="secondary" onClick={load}><RefreshCw size={14} /> Refresh</Button>
          </div>
        </CardHeader>
        <CardBody>
          {loading ? <LoadingSpinner /> : notices.length === 0 ? (
            <EmptyState icon={<MessageSquare size={48} />} title="No Notices" description="No finance notices posted yet." />
          ) : (
            <div className="space-y-3">
              {notices.map(n => (
                <div key={n.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={priorityVariant(n.priority)}>{n.priority || 'Normal'}</Badge>
                      {n.title && <span className="font-semibold text-sm text-gray-900">{n.title}</span>}
                      <span className="text-xs text-gray-400">{formatDateTime(n.createdAt || n.created_at)}</span>
                      {n.createdBy && <span className="text-xs text-gray-400">by {n.createdBy}</span>}
                    </div>
                    <button onClick={() => handleDelete(n.id)} className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0">
                      <Trash2 size={15} />
                    </button>
                  </div>
                  <p className="text-sm text-gray-700 mt-2">{n.message}</p>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

/* ─── STAFF SERVICES ─────────────────────────────────────── */
function StaffTab() {
  const [form, setForm] = useState({ leave_type: 'Annual', start_date: '', end_date: '', reason: '' });
  const [leaveList, setLeaveList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [subTab, setSubTab] = useState('request');

  useEffect(() => {
    api.hr.leaves('department=Finance')
      .then(d => setLeaveList(Array.isArray(d) ? d : d.leaves || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.start_date || !form.end_date || !form.reason) { setMessage('Error: Please fill in all fields.'); return; }
    setSubmitting(true);
    try {
      const result = await api.hr.createLeave({ ...form, department: 'Finance' });
      setLeaveList(prev => [result.leave || { id: Date.now(), ...form, status: 'pending', created_at: new Date().toISOString() }, ...prev]);
      setMessage('Leave request submitted successfully!');
      setForm({ leave_type: 'Annual', start_date: '', end_date: '', reason: '' });
      setSubTab('history');
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-4">
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} className="mb-2">{message}</Alert>}
      <div className="flex gap-2 mb-4">
        {[{ id: 'request', label: '📝 Request Leave' }, { id: 'history', label: '📋 Leave History' }].map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`px-5 py-2 rounded-full text-sm font-semibold border transition-colors ${subTab === t.id ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'request' && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Submit Leave Request</h3></CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Leave Type</label>
                <select value={form.leave_type} onChange={e => setForm({ ...form, leave_type: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none">
                  {['Annual', 'Sick', 'Personal', 'Maternity', 'Paternity', 'Study'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Start Date" type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                <Input label="End Date" type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Reason</label>
                <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none min-h-[80px] resize-y"
                  placeholder="Reason for leave request" />
              </div>
              <Button type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit Request'}</Button>
            </form>
          </CardBody>
        </Card>
      )}

      {subTab === 'history' && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Finance Department Leave History</h3></CardHeader>
          {loading ? <LoadingSpinner /> : (
            <Table
              columns={[
                { header: 'Type', render: r => <Badge variant="info">{r.leave_type || r.leaveType || '—'}</Badge> },
                { header: 'Start', render: r => formatDate(r.start_date || r.startDate) },
                { header: 'End', render: r => formatDate(r.end_date || r.endDate) },
                { header: 'Reason', render: r => <span className="text-sm">{r.reason || '—'}</span> },
                { header: 'Status', render: r => {
                  const s = r.status || 'pending';
                  return <Badge variant={s === 'approved' ? 'success' : s === 'rejected' ? 'danger' : 'warning'}>{s.charAt(0).toUpperCase() + s.slice(1)}</Badge>;
                }},
                { header: 'Submitted', render: r => formatDate(r.created_at) },
              ]}
              data={leaveList}
              emptyMessage="No leave records found"
            />
          )}
        </Card>
      )}
    </div>
  );
}

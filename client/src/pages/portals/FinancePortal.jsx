import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../lib/api';
import { useStockRealtime } from '../../hooks/useStockRealtime';
import { setLivePrices } from '../../lib/pricing';
import { formatCurrency, formatDateTime, formatDate, BRANCH_DETAILS, BRANCHES } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Table, Modal, Alert } from '../../components/ui';
import { DollarSign, TrendingUp, Landmark, Upload, CheckCircle, FileSpreadsheet, ClipboardList, Download, Eye, Trash2, Send, MessageSquare, Receipt, Ship, XCircle, Filter, RefreshCw, Wallet, Building2, Users, Printer } from 'lucide-react';
import AccountsTab from '../../components/AccountsTab';
import SalaryLedgerTab from '../../components/SalaryLedgerTab';
import StaffServicesTab from '../../components/StaffServicesTab';
import StaffMessagesTab from '../../components/StaffMessagesTab';

const BRANCH_NAME_MAP = Object.fromEntries(BRANCH_DETAILS.map(b => [b.id, b.name]));
const branchLabel = (id) => {
  if (!id) return '—';
  if (id === 'finance' || id === 'FINANCE') return 'Finance Dept.';
  return BRANCH_NAME_MAP[id] || id;
};

const localDate  = (d = new Date()) => { const dt = d instanceof Date ? d : new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`; };
const localMonth = (d = new Date()) => { const dt = d instanceof Date ? d : new Date(d); return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; };
const firstOfCurrentMonth = () => { const n = new Date(); return localDate(new Date(n.getFullYear(), n.getMonth(), 1)); };

export default function FinancePortal() {
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    api.prices.list().then(data => {
      if (Array.isArray(data) && data.length > 0) setLivePrices(data);
    }).catch(() => {});
  }, []);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'remittance', label: 'Remittance', icon: '🚢' },
    { id: 'deposits', label: 'Deposit Inbox', icon: '🏦' },
    { id: 'expenses', label: 'Expenses', icon: '💸' },
    { id: 'pettyCash', label: 'Petty Cash', icon: '💵' },
    { id: 'overheads', label: 'Overheads', icon: '🏢' },
    { id: 'accounts', label: 'Accounts', icon: '📒' },
    { id: 'bonus', label: 'Bonus Workflow', icon: '💰' },
    { id: 'reports', label: 'Reports', icon: '📈' },
    { id: 'communication', label: 'Notices', icon: '📢' },
    { id: 'payments', label: 'Payment Vouchers', icon: '🧾' },
    { id: 'casReview', label: 'CAS Review', icon: '✅' },
    { id: 'staff', label: 'Staff Services', icon: '👤' },
    { id: 'messages', label: 'My Messages', icon: '📨' },
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
        {activeTab === 'pettyCash' && <PettyCashTab />}
        {activeTab === 'overheads' && <OverheadsTab />}
        {activeTab === 'accounts' && <AccountsTab role="finance" />}
        {activeTab === 'bonus' && <BonusTab />}
        {activeTab === 'reports' && <ReportsTab />}
        {activeTab === 'communication' && <CommunicationTab />}
        {activeTab === 'payments' && <PaymentVouchersTab />}
        {activeTab === 'casReview' && <CASReviewTab />}
        {activeTab === 'staff' && <StaffTab />}
        {activeTab === 'messages' && <StaffMessagesTab accentColor="#1d4ed8" />}
      </div>
    </div>
  );
}

/* ─── DASHBOARD ─────────────────────────────────────────── */
function DashboardTab() {
  const [data, setData] = useState({ sales: [], deposits: [], orders: [], expenses: [] });
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
      api.branch.expenses().then(d => Array.isArray(d) ? d : d.expenses || []).catch(() => []),
    ]).then(([sales, deposits, orders, branches, expenses]) => {
      setData({ sales, deposits, orders, expenses });
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
  const approvedExpenses = data.expenses.filter(e => e.status === 'approved');
  const pendingExpenses = data.expenses.filter(e => !e.status || e.status === 'recorded');
  const totalExpenses = approvedExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalPendingExpenses = pendingExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);

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
        <div className="rounded-xl p-5 text-white bg-gradient-to-br from-red-500 to-red-700">
          <p className="text-xs opacity-80 uppercase tracking-wide">Approved Expenses</p>
          <p className="text-2xl font-bold mt-1">{formatCurrency(totalExpenses)}</p>
          <p className="text-xs opacity-70 mt-1">{pendingExpenses.length} pending review ({formatCurrency(totalPendingExpenses)})</p>
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
  const nowStr        = localDate();
  const firstOfMonth  = firstOfCurrentMonth();

  const [data, setData] = useState({ sales: [], deposits: [], orders: [] });
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [remittances, setRemittances] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: '', reference: '', date: nowStr, notes: '' });
  const [message, setMessage] = useState('');
  const [cifStart, setCifStart] = useState(firstOfMonth);
  const [cifEnd, setCifEnd] = useState(nowStr);
  const [cifPeriod, setCifPeriod] = useState('month');

  useEffect(() => {
    Promise.all([
      api.prices.list().catch(() => []),
      api.branch.walkinSales().then(d => Array.isArray(d) ? d : d.sales || []).catch(() => []),
      api.branch.deposits().then(d => Array.isArray(d) ? d : d.deposits || []).catch(() => []),
      api.orders.list().then(d => Array.isArray(d) ? d : d.orders || []).catch(() => []),
      api.finance.remittances().then(d => Array.isArray(d) ? d : d.remittances || []).catch(() => []),
    ]).then(([priceData, sales, deposits, orders, history]) => {
      if (Array.isArray(priceData) && priceData.length > 0) setPrices(priceData);
      setData({ sales, deposits, orders });
      setRemittances(history);
    }).finally(() => setLoading(false));
  }, []);

  const applyCifPreset = (p) => {
    setCifPeriod(p);
    const n = new Date();
    const today = localDate(n);
    if (p === 'all') { setCifStart(''); setCifEnd(''); return; }
    if (p === 'today') { setCifStart(today); setCifEnd(today); return; }
    if (p === 'week') { const s = new Date(n); s.setDate(s.getDate() - 7); setCifStart(localDate(s)); setCifEnd(today); return; }
    if (p === 'month') { const s = new Date(n.getFullYear(), n.getMonth(), 1); setCifStart(localDate(s)); setCifEnd(today); return; }
    if (p === 'quarter') { const s = new Date(n); s.setMonth(s.getMonth() - 3); setCifStart(localDate(s)); setCifEnd(today); return; }
  };

  if (loading) return <LoadingSpinner />;

  const inCifRange = (record) => {
    const d = (record.payment_date || record.date || record.created_at || record.sale_date || '').slice(0, 10);
    if (cifStart && d < cifStart) return false;
    if (cifEnd && d > cifEnd) return false;
    return true;
  };

  const filteredSales       = data.sales.filter(inCifRange);
  const filteredOrders      = data.orders.filter(inCifRange);
  const filteredDeposits    = data.deposits.filter(inCifRange);
  const filteredRemittances = remittances.filter(inCifRange);

  const priceIndex = new Map(prices.map(p => [(p.description || '').toUpperCase().trim(), p]));
  const findCIF = (name) => {
    const match = priceIndex.get((name || '').toUpperCase().trim());
    return match ? Number(match.cif) || 0 : 0;
  };

  const allItems = [];
  const processItems = items => (items || []).forEach(item => {
    const cif = findCIF(item.name || item.product_name || '');
    allItems.push({ quantity: Number(item.quantity || item.qty || 1), cif });
  });
  filteredOrders.forEach(o => processItems(o.items));
  filteredSales.forEach(s => processItems(s.items));

  const totalCIF           = allItems.reduce((s, i) => s + i.cif * i.quantity, 0);
  const totalDeposits      = filteredDeposits.reduce((s, d) => s + Number(d.amount || 0), 0);
  const totalRemitted      = filteredRemittances.filter(r => r.status === 'completed').reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalRemittedAllTime = remittances.filter(r => r.status === 'completed').reduce((s, r) => s + Number(r.amount || 0), 0);
  const remittanceDue      = Math.max(0, totalCIF - totalDeposits - totalRemitted);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) { setMessage('Error: Please enter a valid amount.'); return; }
    if (!form.reference) { setMessage('Error: Please enter a payment reference.'); return; }
    try {
      const saved = await api.finance.createRemittance({ amount: Number(form.amount), reference: form.reference, date: form.date, notes: form.notes, status: 'completed' });
      setRemittances(prev => [saved.remittance || { id: Date.now(), ...form, amount: Number(form.amount), payment_date: form.date, status: 'completed', created_at: new Date().toISOString() }, ...prev]);
      setForm({ amount: '', reference: '', date: localDate(), notes: '' });
      setShowForm(false);
      setMessage('Remittance recorded successfully!');
    } catch (err) { setMessage('Error: ' + (err.message || 'Failed to save')); }
  };

  const markNoRemittanceDue = async () => {
    try {
      const saved = await api.finance.createRemittance({ amount: 0, reference: 'STATUS-UPDATE', date: localDate(), notes: 'Status updated: No remittance due', status: 'no_remittance_due' });
      setRemittances(prev => [saved.remittance || { id: Date.now(), amount: 0, reference: 'STATUS-UPDATE', payment_date: localDate(), status: 'no_remittance_due', created_at: new Date().toISOString() }, ...prev]);
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
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">CIF Calculation Period</p>
              <div className="flex flex-wrap gap-2">
                {['today', 'week', 'month', 'quarter', 'all'].map(p => (
                  <button key={p} onClick={() => applyCifPreset(p)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${cifPeriod === p ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                    {p === 'all' ? 'All Time' : p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="date" value={cifStart} onChange={e => { setCifStart(e.target.value); setCifPeriod('custom'); }}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none" />
              <span className="text-gray-400 text-sm">to</span>
              <input type="date" value={cifEnd} onChange={e => { setCifEnd(e.target.value); setCifPeriod('custom'); }}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none" />
            </div>
            <p className="text-xs text-gray-400 ml-auto">Showing {filteredSales.length + filteredOrders.length} transactions</p>
          </div>
        </CardBody>
      </Card>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total CIF Cost" value={formatCurrency(totalCIF)} subtitle={cifPeriod === 'all' ? 'All time' : `${cifStart || '—'} to ${cifEnd || '—'}`} color="red" icon={<Ship size={24} />} />
        <StatCard title="Deposits Received" value={formatCurrency(totalDeposits)} subtitle="In selected period" color="blue" icon={<Landmark size={24} />} />
        <StatCard title="Total Remitted" value={formatCurrency(totalRemittedAllTime)} subtitle="Paid to supplier (all time)" color="green" icon={<CheckCircle size={24} />} />
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
    a.download = `deposits-${localDate()}.csv`;
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
  const emptyHQForm = { description: '', amount: '', category: 'Office Supplies', date: localDate(), receipt_number: '' };
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
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

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
  if (filterStartDate) filtered = filtered.filter(e => { const d = (e.date || e.created_at || '').slice(0, 10); return d >= filterStartDate; });
  if (filterEndDate) filtered = filtered.filter(e => { const d = (e.date || e.created_at || '').slice(0, 10); return d <= filterEndDate; });

  const totalAll = filtered.reduce((s, e) => s + Number(e.amount || 0), 0);
  const pendingReview = filtered.filter(e => e.status === 'recorded' || !e.status).length;
  const totalApproved = filtered.filter(e => e.status === 'approved').reduce((s, e) => s + Number(e.amount || 0), 0);

  const categoryVariant = cat => ({ 'Office Supplies': 'info', 'Transport': 'warning', 'Utilities': 'primary', 'Maintenance': 'danger', 'Marketing': 'success', 'Other': 'default' }[cat] || 'default');

  const exportExpensesCSV = () => {
    const headers = ['Date', 'Branch', 'Category', 'Description', 'Amount (NAD)', 'Status', 'Submitted By'];
    const rows = filtered.map(e => [
      (e.date || e.created_at || '').slice(0, 10),
      branchLabel(e.branchId || e.branch_id) === '—' ? 'Head Office' : branchLabel(e.branchId || e.branch_id),
      e.category || '—',
      `"${(e.description || '').replace(/"/g, '""')}"`,
      Number(e.amount || 0).toFixed(2),
      e.status || 'recorded',
      e.submitted_by || e.user_name || '—',
    ]);
    rows.push(['TOTAL', '', '', '', totalAll.toFixed(2), '', '']);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `expenses${filterStartDate ? `-${filterStartDate}` : ''}${filterEndDate ? `-to-${filterEndDate}` : ''}.csv`;
    a.click();
  };

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
            <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)}
              title="From date" placeholder="From"
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none" />
            <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)}
              title="To date" placeholder="To"
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none" />
            {(filterBranch || filterStatus || filterCategory || filterStartDate || filterEndDate) && (
              <Button size="sm" variant="secondary" onClick={() => { setFilterBranch(''); setFilterStatus(''); setFilterCategory(''); setFilterStartDate(''); setFilterEndDate(''); }}>
                <XCircle size={14} /> Clear
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={exportExpensesCSV} className="ml-auto">
              <Download size={14} /> Export CSV ({filtered.length})
            </Button>
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
  const [activeSubTab, setActiveSubTab] = useState('upload');
  const subTabs = [
    { id: 'upload', label: 'Upload Bonuses' },
    { id: 'history', label: 'Bonus History & Search' },
    { id: 'committed', label: 'All Committed Bonuses' },
  ];
  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-gray-200 pb-0">
        {subTabs.map(t => (
          <button key={t.id} onClick={() => setActiveSubTab(t.id)}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${activeSubTab === t.id ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {activeSubTab === 'upload' && <BonusUploadSubTab />}
      {activeSubTab === 'history' && <BonusHistorySubTab />}
      {activeSubTab === 'committed' && <BonusCommittedSubTab />}
    </div>
  );
}

function BonusUploadSubTab() {
  const [previewRows, setPreviewRows] = useState([]);
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [period, setPeriod] = useState(localMonth());
  const fileRef = useRef(null);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true); setMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await api.finance.uploadDistributorBonuses(formData);
      if (!result.success) throw new Error(result.error || 'Upload failed');
      setPreviewRows(result.rows || []);
      setMessage(`Parsed ${result.count} bonus records. Review below then commit.`);
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const removeRow = (idx) => setPreviewRows(prev => prev.filter((_, i) => i !== idx));

  const handleCommit = async () => {
    if (!previewRows.length) return;
    if (!period) { setMessage('Error: Please enter a period (e.g. 2026-03).'); return; }
    setCommitting(true); setMessage('');
    try {
      const result = await api.finance.commitDistributorBonuses({ rows: previewRows, period });
      if (!result.success) throw new Error(result.error || 'Commit failed');
      setMessage(result.message || `Committed ${result.inserted} bonus records.`);
      setPreviewRows([]);
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setCommitting(false); }
  };

  const exportPreviewXlsx = () => {
    const rows = [
      ['NB Number', 'Distributor Name', 'Amount Earned', 'Period'],
      ...previewRows.map(r => [r.nb_number, r.distributor_name, r.amount_earned, period]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `bonus-preview-${period}.csv`;
    a.click();
  };

  const totalAmount = previewRows.reduce((s, r) => s + Number(r.amount_earned || 0), 0);

  return (
    <div className="space-y-4">
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'}>{message}</Alert>}

      <Card className="bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200">
        <CardBody>
          <h3 className="font-bold text-orange-900 mb-1 flex items-center gap-2"><Upload size={16} /> Upload Distributor Bonus File</h3>
          <div className="text-sm text-orange-700 space-y-1">
            <p>Upload the Dynapharm bonus CSV or Excel file. Review the parsed records then commit to store them.</p>
            <div className="flex flex-wrap gap-4 mt-2">
              <div className="bg-orange-100 rounded px-3 py-2 text-xs">
                <p className="font-bold mb-1">✅ Dynapharm CSV Format (recommended)</p>
                <p>Columns: <strong>DRN, NAME, STOCKIST, AREA, NAD</strong></p>
                <p>Amounts like <strong>2 565,80</strong> are handled automatically</p>
                <p>Header rows (company name, date, area) are skipped automatically</p>
              </div>
              <div className="bg-orange-100 rounded px-3 py-2 text-xs">
                <p className="font-bold mb-1">📊 Excel / Generic CSV</p>
                <p>Columns: <strong>NB Number, Distributor Name, Amount</strong></p>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bonus Period — Year &amp; Month <span className="text-xs text-gray-400 font-normal">(past or current)</span></label>
              <div className="flex gap-2 items-center">
                <select
                  value={period.slice(0, 4)}
                  onChange={e => setPeriod(`${e.target.value}-${period.slice(5, 7)}`)}
                  className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                  {Array.from({ length: new Date().getFullYear() - 2019 }, (_, i) => new Date().getFullYear() - i).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <select
                  value={period.slice(5, 7)}
                  onChange={e => setPeriod(`${period.slice(0, 4)}-${e.target.value}`)}
                  className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                  {[['01','January'],['02','February'],['03','March'],['04','April'],['05','May'],['06','June'],['07','July'],['08','August'],['09','September'],['10','October'],['11','November'],['12','December']].map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <span className="text-xs font-mono bg-gray-100 px-2 py-1.5 rounded text-gray-600">{period}</span>
              </div>
            </div>
            <div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleUpload} className="hidden" />
              <Button onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Upload size={16} /> {uploading ? 'Parsing…' : 'Select Excel / CSV File'}
              </Button>
            </div>
            {previewRows.length > 0 && (
              <>
                <Button variant="secondary" onClick={exportPreviewXlsx}><Download size={14} /> Export Preview</Button>
                <Button variant="danger" size="sm" onClick={() => setPreviewRows([])}>Clear</Button>
              </>
            )}
          </div>
        </CardBody>
      </Card>

      {previewRows.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <StatCard title="Records Parsed" value={previewRows.length} color="blue" icon={<ClipboardList size={24} />} />
            <StatCard title="Total Amount" value={formatCurrency(totalAmount)} color="green" icon={<DollarSign size={24} />} />
            <StatCard title="Period" value={period} color="orange" icon={<Receipt size={24} />} />
          </div>

          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-gray-800">Preview — Review Before Committing</h3>
                <Button onClick={handleCommit} disabled={committing} variant="success">
                  <CheckCircle size={16} /> {committing ? 'Committing…' : `Commit ${previewRows.length} Records`}
                </Button>
              </div>
            </CardHeader>
            <Table
              columns={[
                { header: 'DRN / NB #', render: r => <span className="font-mono font-bold text-primary">{r.nb_number}</span> },
                { header: 'Distributor Name', render: r => r.distributor_name },
                ...(previewRows.some(r => r.area) ? [{ header: 'Area', render: r => <span className="text-xs text-gray-500">{r.area || '—'}</span> }] : []),
                ...(previewRows.some(r => r.stockist) ? [{ header: 'Stockist', render: r => <span className="text-xs text-gray-500">{r.stockist || '—'}</span> }] : []),
                { header: 'Amount (NAD)', render: r => <span className="font-bold text-green-700">{formatCurrency(r.amount_earned || 0)}</span> },
                { header: '', render: (r, idx) => <button className="text-xs text-red-500 hover:text-red-700" onClick={() => removeRow(idx)}>✕ Remove</button> },
              ]}
              data={previewRows}
              emptyMessage="No records"
            />
          </Card>
        </>
      )}
    </div>
  );
}

function BonusHistorySubTab() {
  const [search, setSearch] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = async () => {
    if (!search.trim()) return;
    setLoading(true);
    try {
      const result = await api.finance.distributorBonusHistory({ search: search.trim() });
      setHistory(result.history || []);
      setSearched(true);
    } catch (err) { setHistory([]); setSearched(true); }
    finally { setLoading(false); }
  };

  const exportHistory = () => {
    if (!history.length) return;
    const rows = [
      ['Period', 'NB Number', 'Distributor', 'Amount Earned', 'Amount Paid', 'Outstanding', 'Status', 'Branch Paid', 'Payment Date'],
      ...history.map(b => [b.period, b.nb_number, b.distributor_name, b.amount_earned, b.amount_paid, Number(b.amount_earned)-Number(b.amount_paid), b.status, b.paid_by_branch_id||'', b.payment_date||'']),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `bonus-history-${search.replace(/[^a-z0-9]/gi,'_')}-${localDate()}.csv`;
    a.click();
  };

  const totalEarned = history.reduce((s, b) => s + Number(b.amount_earned || 0), 0);
  const totalPaid = history.reduce((s, b) => s + Number(b.amount_paid || 0), 0);
  const totalOutstanding = totalEarned - totalPaid;

  return (
    <div className="space-y-4">
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardBody>
          <h3 className="font-bold text-blue-900 mb-1">Bonus History Report</h3>
          <p className="text-sm text-blue-700">Search by distributor NB number or name to view their full bonus history across all periods.</p>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Search Distributor (NB/DZ Number or Name)</label>
              <input value={search} onChange={e => setSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') doSearch(); }}
                placeholder="e.g. NB001234 or DZ001234 or John Doe"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <Button onClick={doSearch} disabled={loading || !search.trim()}>
              <Filter size={16} /> {loading ? 'Searching…' : 'Search'}
            </Button>
            {history.length > 0 && (
              <Button variant="secondary" onClick={exportHistory}><Download size={14} /> Export</Button>
            )}
          </div>
        </CardBody>
      </Card>

      {searched && history.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <StatCard title="Total Earned" value={formatCurrency(totalEarned)} color="green" icon={<DollarSign size={24} />} />
            <StatCard title="Total Paid" value={formatCurrency(totalPaid)} color="blue" icon={<CheckCircle size={24} />} />
            <StatCard title="Outstanding" value={formatCurrency(totalOutstanding)} color={totalOutstanding > 0 ? 'orange' : 'green'} icon={<Wallet size={24} />} />
          </div>

          <Card>
            <CardHeader><h3 className="font-bold text-gray-800">Bonus History — {history[0]?.distributor_name || search}</h3></CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Period</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">NB Number</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Distributor</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Earned</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Paid</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Outstanding</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {history.map(r => {
                    const out = Number(r.amount_earned) - Number(r.amount_paid);
                    return (
                      <React.Fragment key={r.id}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-semibold">{r.period}</td>
                          <td className="px-4 py-3 font-mono text-primary">{r.nb_number}</td>
                          <td className="px-4 py-3">{r.distributor_name}</td>
                          <td className="px-4 py-3 text-right font-bold text-green-700">{formatCurrency(r.amount_earned)}</td>
                          <td className="px-4 py-3 text-right font-bold text-blue-700">{formatCurrency(r.amount_paid)}</td>
                          <td className="px-4 py-3 text-right font-bold" style={{ color: out > 0.01 ? '#ea580c' : '#16a34a' }}>{formatCurrency(out)}</td>
                          <td className="px-4 py-3"><Badge variant={r.status === 'paid' ? 'success' : r.status === 'partial' ? 'warning' : 'danger'}>{r.status}</Badge></td>
                        </tr>
                        {Array.isArray(r.payments) && r.payments.map(p => (
                          <tr key={p.id} style={{ background: '#f0f9ff' }}>
                            <td className="px-4 py-2 pl-10 text-xs text-gray-400 italic" colSpan={1}>↳ Payment</td>
                            <td className="px-4 py-2 text-xs text-gray-500">{p.paid_at ? formatDate(p.paid_at) : '—'}</td>
                            <td className="px-4 py-2 text-xs text-gray-500">{branchLabel(p.branch_id)}</td>
                            <td className="px-4 py-2 text-xs text-gray-400" colSpan={2}></td>
                            <td className="px-4 py-2 text-right text-xs font-bold text-blue-700">{formatCurrency(p.amount)}</td>
                            <td className="px-4 py-2 text-xs text-gray-400">{p.recorded_by || '—'}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
      {searched && history.length === 0 && (
        <div className="text-center text-gray-400 py-8">No bonus records found for "{search}".</div>
      )}
    </div>
  );
}

function BonusCommittedSubTab() {
  const [bonuses, setBonuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');
  const [deleteModal, setDeleteModal] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleteMsg, setDeleteMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingDeletes, setPendingDeletes] = useState([]);
  const [payModal, setPayModal] = useState(null);
  const [payDate, setPayDate] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [paySuccess, setPaySuccess] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterPeriod) params.period = filterPeriod;
      const [result, delReqs] = await Promise.all([
        api.finance.distributorBonuses({ ...params, include_payments: true }),
        api.finance.getBonusPeriodDeleteRequests('pending_gm').catch(() => ({ requests: [] })),
      ]);
      setBonuses(result.bonuses || []);
      setPendingDeletes(delReqs.requests || []);
    } catch (err) { setBonuses([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filterStatus, filterPeriod]);

  const totalEarned = bonuses.reduce((s, b) => s + Number(b.amount_earned || 0), 0);
  const totalPaid = bonuses.reduce((s, b) => s + Number(b.amount_paid || 0), 0);

  const periods = [...new Set(bonuses.map(b => b.period).filter(Boolean))].sort().reverse();

  const periodStats = periods.map(p => {
    const rows = bonuses.filter(b => b.period === p);
    return {
      period: p,
      count: rows.length,
      earned: rows.reduce((s, b) => s + Number(b.amount_earned || 0), 0),
      paid: rows.reduce((s, b) => s + Number(b.amount_paid || 0), 0),
      hasPending: pendingDeletes.some(d => d.period === p),
    };
  });

  const handleRequestDelete = async () => {
    if (!deleteModal) return;
    setSubmitting(true);
    setDeleteMsg('');
    try {
      const result = await api.finance.requestBonusPeriodDelete({ period: deleteModal.period, reason: deleteReason });
      setDeleteMsg(`✅ ${result.message}`);
      setPendingDeletes(prev => [...prev, { period: deleteModal.period, status: 'pending_gm' }]);
      setTimeout(() => { setDeleteModal(null); setDeleteReason(''); setDeleteMsg(''); }, 2500);
    } catch (err) {
      setDeleteMsg(`❌ ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const openPayModal = (bonus) => {
    setPayModal(bonus);
    setPayDate(localDate());
    setPayNotes('');
    setPayError('');
    setPaySuccess('');
  };

  const handlePayBonus = async () => {
    if (!payModal) return;
    setPaying(true);
    setPayError('');
    setPaySuccess('');
    try {
      const result = await api.branch.recordBonusPayment({
        bonus_id: payModal.id,
        paid_at: payDate,
        notes: payNotes.trim() || null,
        branch_id: 'finance',
      });
      setPaySuccess(`✅ Paid ${formatCurrency(result.amount_paid)} — marked as paid by Finance Dept.`);
      setBonuses(prev => prev.map(b =>
        b.id === payModal.id
          ? { ...b, status: 'paid', amount_paid: b.amount_earned, paid_by_branch_id: 'finance', payment_date: payDate }
          : b
      ));
      setTimeout(() => { setPayModal(null); setPaySuccess(''); }, 2500);
    } catch (err) {
      setPayError(err.message || 'Payment failed. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="space-y-4">
      {payModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <DollarSign size={20} className="text-green-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Pay Bonus — Finance</h3>
                <p className="text-sm text-gray-500">This will be marked as paid by Finance Dept.</p>
              </div>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
              <div className="text-sm font-semibold text-green-800">{payModal.distributor_name} — {payModal.nb_number}</div>
              <div className="text-sm text-green-700">Period: {payModal.period}</div>
              <div className="text-base font-bold text-green-900">
                Outstanding: {formatCurrency(Number(payModal.amount_earned) - Number(payModal.amount_paid || 0))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
              <input
                type="date"
                value={payDate}
                onChange={e => setPayDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea
                value={payNotes}
                onChange={e => setPayNotes(e.target.value)}
                rows={2}
                placeholder="e.g. Paid via bank transfer, EFT reference..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
              />
            </div>
            {payError && <div className="text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{payError}</div>}
            {paySuccess && <div className="text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{paySuccess}</div>}
            <div className="flex gap-3 pt-1">
              <Button variant="secondary" onClick={() => setPayModal(null)} className="flex-1" disabled={paying}>Cancel</Button>
              <Button
                onClick={handlePayBonus}
                disabled={paying || !payDate || !!paySuccess}
                className="flex-1"
                style={{ background: '#16a34a', color: '#fff', border: 'none' }}
              >
                {paying ? 'Processing…' : `Confirm Payment`}
              </Button>
            </div>
          </div>
        </div>
      )}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900">Request Period Deletion</h3>
                <p className="text-sm text-gray-500">This will require GM approval before records are deleted.</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1">
              <div className="text-sm font-semibold text-red-800">Period: {deleteModal.period}</div>
              <div className="text-sm text-red-700">{deleteModal.count} bonus records — Total Earned: {formatCurrency(deleteModal.earned)}</div>
              {deleteModal.paid > 0 && (
                <div className="text-xs text-red-600 font-medium">⚠️ {formatCurrency(deleteModal.paid)} has already been paid out — deletion will not reverse payments.</div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Deletion <span className="text-red-500">*</span></label>
              <textarea
                value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)}
                rows={3}
                placeholder="Explain why this entire period should be deleted (e.g. uploaded wrong file, duplicate period)..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              />
            </div>
            {deleteMsg && <div className={`text-sm font-medium ${deleteMsg.startsWith('✅') ? 'text-green-700' : 'text-red-600'}`}>{deleteMsg}</div>}
            <div className="flex gap-3 pt-1">
              <Button variant="secondary" onClick={() => { setDeleteModal(null); setDeleteReason(''); setDeleteMsg(''); }} className="flex-1">Cancel</Button>
              <Button
                variant="danger"
                onClick={handleRequestDelete}
                disabled={submitting || !deleteReason.trim()}
                className="flex-1"
              >
                {submitting ? 'Submitting…' : 'Submit for GM Approval'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {loading ? <LoadingSpinner /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Bonuses" value={bonuses.length} color="blue" icon={<ClipboardList size={24} />} />
            <StatCard title="Total Earned" value={formatCurrency(totalEarned)} color="green" icon={<DollarSign size={24} />} />
            <StatCard title="Total Paid" value={formatCurrency(totalPaid)} color="blue" icon={<CheckCircle size={24} />} />
            <StatCard title="Outstanding" value={formatCurrency(totalEarned - totalPaid)} color={totalEarned - totalPaid > 0 ? 'orange' : 'green'} icon={<Wallet size={24} />} />
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none">
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
            </select>
            <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none">
              <option value="">All Periods</option>
              {periods.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <Button size="sm" variant="secondary" onClick={load}><RefreshCw size={14} /> Refresh</Button>
          </div>

          {periodStats.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="font-bold text-gray-800">Periods — Delete Management</h3>
                <p className="text-sm text-gray-500">Request GM approval to delete an entire bonus period upload.</p>
              </CardHeader>
              <div className="divide-y divide-gray-100">
                {periodStats.map(ps => (
                  <div key={ps.period} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                    <div className="space-y-0.5">
                      <div className="font-semibold text-gray-900">{ps.period}</div>
                      <div className="text-xs text-gray-500">{ps.count} records · Earned {formatCurrency(ps.earned)} · Paid {formatCurrency(ps.paid)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {ps.hasPending ? (
                        <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-3 py-1 rounded-full">Pending GM Approval</span>
                      ) : (
                        <button
                          onClick={() => setDeleteModal(ps)}
                          className="flex items-center gap-1 text-xs font-medium text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
                        >
                          <Trash2 size={12} /> Request Deletion
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader><h3 className="font-bold text-gray-800">All Committed Bonuses</h3></CardHeader>
            <Table
              columns={[
                { header: 'Period', render: r => <span className="font-semibold">{r.period}</span> },
                { header: 'NB Number', render: r => <span className="font-mono text-primary text-sm">{r.nb_number}</span> },
                { header: 'Distributor', render: r => r.distributor_name },
                { header: 'Earned', render: r => <span className="font-bold text-green-700">{formatCurrency(r.amount_earned)}</span> },
                { header: 'Paid', render: r => <span className="font-bold text-blue-700">{formatCurrency(r.amount_paid)}</span> },
                { header: 'Outstanding', render: r => {
                  const out = Number(r.amount_earned) - Number(r.amount_paid);
                  return <span className={`font-bold ${out > 0.01 ? 'text-orange-600' : 'text-green-600'}`}>{formatCurrency(out)}</span>;
                }},
                { header: 'Status', render: r => <Badge variant={r.status === 'paid' ? 'success' : r.status === 'partial' ? 'warning' : 'danger'}>{r.status}</Badge> },
                { header: 'Paid By', render: r => r.paid_by_branch_id ? (
                  <span className={`text-sm font-semibold ${r.paid_by_branch_id === 'finance' || r.paid_by_branch_id === 'FINANCE' ? 'text-purple-700' : 'text-gray-700'}`}>
                    {branchLabel(r.paid_by_branch_id)}
                  </span>
                ) : '—' },
                { header: 'Action', render: r => {
                  const out = Number(r.amount_earned) - Number(r.amount_paid);
                  if (r.status === 'paid' || out < 0.01) {
                    return <span className="text-xs text-green-600 font-semibold">✓ Paid</span>;
                  }
                  return (
                    <button
                      onClick={() => openPayModal(r)}
                      className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                      style={{ background: '#f0fdf4', color: '#16a34a', border: '1.5px solid #86efac' }}
                    >
                      <DollarSign size={12} /> Pay
                    </button>
                  );
                }},
              ]}
              data={bonuses}
              emptyMessage="No committed bonus records found"
            />
          </Card>
        </>
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
  const [startDate, setStartDate] = useState(firstOfCurrentMonth());
  const [endDate, setEndDate] = useState(localDate());

  const getPresetDates = (p) => {
    const n = new Date();
    const today = localDate(n);
    if (p === 'all') return {};
    if (p === 'today') return { startDate: today, endDate: today };
    if (p === 'week') { const s = new Date(n); s.setDate(s.getDate() - 7); return { startDate: localDate(s), endDate: today }; }
    if (p === 'month') { const s = new Date(n.getFullYear(), n.getMonth(), 1); return { startDate: localDate(s), endDate: today }; }
    if (p === 'quarter') { const s = new Date(n); s.setMonth(s.getMonth() - 3); return { startDate: localDate(s), endDate: today }; }
    return {};
  };

  const loadData = useCallback((params) => {
    setLoading(true);
    Promise.all([
      api.finance.branchesSummary(params).then(d => Array.isArray(d) ? d : d.branches || []).catch(() => []),
      api.finance.stockValue().then(d => d).catch(() => null),
      api.finance.writeoffs().then(d => d).catch(() => null),
    ]).then(([branches, stock, wo]) => {
      setBranchSummary(branches);
      setStockValue(stock);
      setWriteoffs(wo);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const params = getPresetDates(period);
    if (period === 'month') { setStartDate(params.startDate || firstOfMonth); setEndDate(params.endDate || todayStr); }
    loadData(params);
  }, [period]);

  const applyCustomRange = () => {
    if (!startDate || !endDate) return;
    setPeriod('custom');
    loadData({ startDate, endDate });
  };

  const totalRevenue = branchSummary.reduce((s, b) => s + parseFloat(b.salesRevenue || 0), 0);
  const totalCash = branchSummary.reduce((s, b) => s + parseFloat(b.cashTotal || 0), 0);
  const totalSwipe = branchSummary.reduce((s, b) => s + parseFloat(b.swipeTotal || 0) + parseFloat(b.eftTotal || 0), 0);

  const exportBranchCSV = () => {
    const headers = ['Branch', 'Sales Revenue', 'Units Sold', 'Cash', 'Swipe/EFT', 'Stock Value (DP)'];
    const rows = branchSummary.map(r => [
      r.branchName || branchLabel(r.branchId),
      r.salesRevenue || 0,
      r.salesUnits || 0,
      r.cashTotal || 0,
      (Number(r.swipeTotal || 0) + Number(r.eftTotal || 0)).toFixed(2),
      r.stockValueDP || 0,
    ]);
    rows.push(['TOTAL', totalRevenue.toFixed(2), '', totalCash.toFixed(2), totalSwipe.toFixed(2), '']);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `finance-report-${startDate}-to-${endDate}.csv`;
    a.click();
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Quick Period</p>
              <div className="flex flex-wrap gap-2">
                {['today', 'week', 'month', 'quarter', 'all'].map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${period === p ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                    {p === 'all' ? 'All Time' : p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Custom Range</p>
                <div className="flex gap-2 items-center">
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none" />
                  <span className="text-gray-400 text-sm">to</span>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                    className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none" />
                  <Button size="sm" onClick={applyCustomRange}>Apply</Button>
                </div>
              </div>
            </div>
            {branchSummary.length > 0 && (
              <Button size="sm" variant="secondary" onClick={exportBranchCSV} className="ml-auto">
                <Download size={14} /> Export CSV
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      {loading ? <LoadingSpinner /> : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard title="Total Revenue" value={formatCurrency(totalRevenue)} color="green" icon={<TrendingUp size={24} />} />
            <StatCard title="Cash Collected" value={formatCurrency(totalCash)} color="blue" icon={<DollarSign size={24} />} />
            <StatCard title="Swipe / EFT" value={formatCurrency(totalSwipe)} color="purple" icon={<Landmark size={24} />} />
          </div>

          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-gray-800">Branch Financial Summary</h3>
                <span className="text-xs text-gray-400">{period === 'custom' ? `${startDate} → ${endDate}` : period === 'all' ? 'All time' : `Last ${period}`}</span>
              </div>
            </CardHeader>
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

/* ─── PAYMENT VOUCHERS ───────────────────────────────────── */
const PAYMENT_TYPES = [
  { value: 'cash_request', label: 'Cash Request Payout' },
  { value: 'salary', label: 'Salary / Wage Payment' },
  { value: 'bonus', label: 'Distributor Bonus' },
  { value: 'expense_reimbursement', label: 'Expense Reimbursement' },
  { value: 'supplier_remittance', label: 'Supplier Remittance' },
  { value: 'rent', label: 'Rent / Lease Payment' },
  { value: 'ad_hoc', label: 'Ad-Hoc Payment' },
];
const PAYMENT_METHODS = ['EFT', 'Cheque', 'Cash', 'Bank Transfer', 'Wire Transfer'];
const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-600',
  pending_auth: 'bg-yellow-100 text-yellow-700',
  authorised: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-600',
};
const EMPTY_VOUCHER = {
  payment_type: 'cash_request', payee_name: '', payee_bank: '', payee_account: '',
  payee_branch_code: '', amount: '', currency: 'NAD', payment_method: 'EFT',
  reference_number: '', narration: '', authorised_by: '', payment_date: localDate(),
  notes: '', status: 'draft',
};

function PaymentVouchersTab() {
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_VOUCHER });
  const [submitting, setSubmitting] = useState(false);
  const [viewVoucher, setViewVoucher] = useState(null);
  const [editStatus, setEditStatus] = useState(null);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  // Bonus-specific state
  const [bonusPeriods, setBonusPeriods] = useState([]);
  const [bonusSearchQ, setBonusSearchQ] = useState('');
  const [bonusSearchPeriod, setBonusSearchPeriod] = useState('');
  const [bonusResults, setBonusResults] = useState([]);
  const [bonusSearching, setBonusSearching] = useState(false);
  const [selectedBonus, setSelectedBonus] = useState(null);
  const bonusSearchTimer = useRef(null);

  const load = () => {
    setLoading(true);
    const params = {};
    if (filterType) params.type = filterType;
    if (filterStatus) params.status = filterStatus;
    if (filterFrom) params.from = filterFrom;
    if (filterTo) params.to = filterTo;
    api.paymentVouchers.list(params)
      .then(d => setVouchers(Array.isArray(d) ? d : []))
      .catch(() => setVouchers([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [filterType, filterStatus, filterFrom, filterTo]);

  // Load bonus periods when bonus type is selected
  useEffect(() => {
    if (form.payment_type === 'bonus' && bonusPeriods.length === 0) {
      api.paymentVouchers.bonusPeriods()
        .then(d => setBonusPeriods(Array.isArray(d) ? d : []))
        .catch(() => {});
    }
  }, [form.payment_type]);

  // Debounced bonus search
  useEffect(() => {
    if (form.payment_type !== 'bonus') return;
    if (!bonusSearchQ && !bonusSearchPeriod) { setBonusResults([]); return; }
    clearTimeout(bonusSearchTimer.current);
    bonusSearchTimer.current = setTimeout(() => {
      setBonusSearching(true);
      const p = {};
      if (bonusSearchQ) p.q = bonusSearchQ;
      if (bonusSearchPeriod) p.period = bonusSearchPeriod;
      api.paymentVouchers.bonusSearch(p)
        .then(d => setBonusResults(Array.isArray(d) ? d : []))
        .catch(() => setBonusResults([]))
        .finally(() => setBonusSearching(false));
    }, 350);
  }, [bonusSearchQ, bonusSearchPeriod, form.payment_type]);

  const selectBonus = (bonus) => {
    setSelectedBonus(bonus);
    setBonusResults([]);
    setForm(f => ({
      ...f,
      payee_name: bonus.distributor_name,
      amount: parseFloat(bonus.outstanding || bonus.amount_earned).toFixed(2),
      narration: `Distributor bonus payment — ${bonus.distributor_name} (${bonus.nb_number}) for period ${bonus.period}`,
      linked_request_id: bonus.id,
      linked_request_type: 'distributor_bonus',
    }));
  };

  const clearBonusSelection = () => {
    setSelectedBonus(null);
    setBonusSearchQ('');
    setBonusSearchPeriod('');
    setBonusResults([]);
    setForm(f => ({ ...f, payee_name: '', amount: '', narration: '', linked_request_id: '', linked_request_type: '' }));
  };

  const fv = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.payee_name || !form.amount || !form.payment_method) {
      setMsg('Error: Payee name, amount and payment method are required.'); return;
    }
    if (form.payment_type === 'bonus' && !selectedBonus) {
      setMsg('Error: Please search and select a distributor bonus record.'); return;
    }
    setSubmitting(true);
    try {
      const res = await api.paymentVouchers.create({ ...form, amount: parseFloat(form.amount) });
      setVouchers(prev => [res.voucher, ...prev]);
      setForm({ ...EMPTY_VOUCHER });
      setSelectedBonus(null); setBonusSearchQ(''); setBonusSearchPeriod(''); setBonusResults([]);
      setShowForm(false);
      const bonusNote = res.bonusReceipt ? ` Distributor portal and all branch records updated automatically.` : '';
      setMsg(`✅ Voucher ${res.voucher.voucher_number} created successfully.${bonusNote}`);
    } catch (err) { setMsg('Error: ' + err.message); }
    finally { setSubmitting(false); }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      const res = await api.paymentVouchers.update(id, { status: newStatus });
      setVouchers(prev => prev.map(v => v.id === id ? res.voucher : v));
      if (viewVoucher?.id === id) setViewVoucher(res.voucher);
      setEditStatus(null);
      if (newStatus === 'paid' && res.bonusReceipt) {
        setMsg(`✅ Voucher marked as Paid. Distributor portal and all branch records updated automatically.`);
      }
    } catch (err) { setMsg('Error: ' + err.message); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this draft voucher?')) return;
    try {
      await api.paymentVouchers.delete(id);
      setVouchers(prev => prev.filter(v => v.id !== id));
      if (viewVoucher?.id === id) setViewVoucher(null);
    } catch (err) { setMsg('Error: ' + err.message); }
  };

  const totalPaid = vouchers.filter(v => v.status === 'paid').reduce((s, v) => s + parseFloat(v.amount || 0), 0);
  const totalAuthorised = vouchers.filter(v => v.status === 'authorised').reduce((s, v) => s + parseFloat(v.amount || 0), 0);
  const totalPending = vouchers.filter(v => v.status === 'pending_auth').reduce((s, v) => s + parseFloat(v.amount || 0), 0);

  const typeLabel = (t) => PAYMENT_TYPES.find(x => x.value === t)?.label || t;

  const printVoucher = (v) => {
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><title>Payment Voucher ${v.voucher_number}</title>
    <style>
      body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#1e293b}
      .header{text-align:center;border-bottom:2px solid #1d4ed8;padding-bottom:16px;margin-bottom:20px}
      .title{font-size:22px;font-weight:800;color:#1d4ed8;letter-spacing:1px}
      .subtitle{font-size:13px;color:#64748b;margin-top:4px}
      .vnum{font-size:14px;font-weight:700;color:#1e293b;margin-top:6px}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}
      td{padding:7px 10px;font-size:13px;border:1px solid #e2e8f0;vertical-align:top}
      td:first-child{font-weight:600;background:#f8fafc;width:35%;color:#374151}
      .amount-row td{font-size:18px;font-weight:800;color:#1d4ed8}
      .status-badge{display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;text-transform:uppercase;background:${v.status==='paid'?'#dcfce7':v.status==='authorised'?'#dbeafe':'#fef9c3'};color:${v.status==='paid'?'#166534':v.status==='authorised'?'#1e40af':'#92400e'}}
      .sigs{display:flex;gap:40px;margin-top:30px}
      .sig-box{flex:1;border-top:1.5px solid #1e293b;padding-top:8px;font-size:12px;color:#64748b}
      .footer{text-align:center;margin-top:32px;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:10px}
      @media print{body{padding:12px}}
    </style></head><body>
    <div class="header">
      <div class="title">DYNAPHARM INTERNATIONAL NAMIBIA</div>
      <div class="subtitle">Payment Voucher</div>
      <div class="vnum">${v.voucher_number} &nbsp;|&nbsp; <span class="status-badge">${v.status?.replace('_',' ').toUpperCase()}</span></div>
    </div>
    <table>
      <tr><td>Payment Type</td><td>${typeLabel(v.payment_type)}</td></tr>
      <tr><td>Payment Date</td><td>${v.payment_date ? new Date(v.payment_date).toLocaleDateString('en-NA',{day:'2-digit',month:'long',year:'numeric'}) : '—'}</td></tr>
      <tr class="amount-row"><td>Amount</td><td>${v.currency || 'NAD'} ${parseFloat(v.amount).toFixed(2)}</td></tr>
      <tr><td>Payment Method</td><td>${v.payment_method}</td></tr>
      <tr><td>Reference / Cheque No.</td><td>${v.reference_number || '—'}</td></tr>
    </table>
    <table>
      <tr><td>Payee Name</td><td>${v.payee_name}</td></tr>
      <tr><td>Bank</td><td>${v.payee_bank || '—'}</td></tr>
      <tr><td>Account Number</td><td>${v.payee_account || '—'}</td></tr>
      <tr><td>Branch Code</td><td>${v.payee_branch_code || '—'}</td></tr>
    </table>
    <table>
      <tr><td>Narration / Description</td><td>${v.narration || '—'}</td></tr>
      <tr><td>Internal Notes</td><td>${v.notes || '—'}</td></tr>
    </table>
    <div class="sigs">
      <div class="sig-box">Prepared By<br><strong>${v.prepared_by || '—'}</strong><br><br>Signature: ___________________</div>
      <div class="sig-box">Authorised By<br><strong>${v.authorised_by || '—'}</strong><br><br>Signature: ___________________</div>
      <div class="sig-box">Received By<br><br><br>Signature: ___________________</div>
    </div>
    <div class="footer">Generated ${new Date().toLocaleString('en-NA')} &nbsp;|&nbsp; Dynapharm International Namibia</div>
    </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  return (
    <div className="space-y-5">
      {msg && (
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${msg.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {msg} <button onClick={() => setMsg('')} className="ml-2 text-xs opacity-60 cursor-pointer">✕</button>
        </div>
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Vouchers', val: vouchers.length, color: 'blue' },
          { label: 'Pending Auth', val: formatCurrency(totalPending), sub: vouchers.filter(v=>v.status==='pending_auth').length + ' voucher(s)', color: 'yellow' },
          { label: 'Authorised', val: formatCurrency(totalAuthorised), sub: vouchers.filter(v=>v.status==='authorised').length + ' voucher(s)', color: 'blue' },
          { label: 'Paid Out', val: formatCurrency(totalPaid), sub: vouchers.filter(v=>v.status==='paid').length + ' voucher(s)', color: 'green' },
        ].map(k => (
          <div key={k.label} className={`bg-white rounded-xl border p-4 border-${k.color}-100`}>
            <p className="text-xs text-gray-500 font-medium">{k.label}</p>
            <p className={`text-lg font-bold text-${k.color}-700 mt-1`}>{k.val}</p>
            {k.sub && <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>}
          </div>
        ))}
      </div>

      {/* Header + New Voucher Button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-bold text-gray-800">Payment Voucher Register</h3>
        <button onClick={() => { setShowForm(true); setMsg(''); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm font-bold rounded-lg hover:bg-blue-800 cursor-pointer">
          + New Payment Voucher
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 bg-gray-50 p-3 rounded-xl border border-gray-200">
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none">
          <option value="">All Types</option>
          {PAYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none">
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="pending_auth">Pending Auth</option>
          <option value="authorised">Authorised</option>
          <option value="paid">Paid</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="From" />
        <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="To" />
        <button onClick={() => { setFilterType(''); setFilterStatus(''); setFilterFrom(''); setFilterTo(''); }}
          className="text-xs text-gray-500 underline px-2 cursor-pointer">Clear</button>
      </div>

      {/* Voucher List */}
      {loading ? (
        <div className="text-center py-10 text-gray-400 text-sm">Loading vouchers…</div>
      ) : vouchers.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <div className="text-4xl mb-2">🧾</div>
          <p className="text-gray-500 font-medium">No payment vouchers yet.</p>
          <p className="text-sm text-gray-400 mt-1">Create a new voucher to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {vouchers.map(v => (
            <div key={v.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex flex-wrap items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50 gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{v.voucher_number}</span>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${STATUS_COLORS[v.status] || 'bg-gray-100 text-gray-600'}`}>
                    {v.status?.replace('_', ' ').toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full">{typeLabel(v.payment_type)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setViewVoucher(v)} className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer">View</button>
                  <button onClick={() => printVoucher(v)} className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 cursor-pointer">🖨 Print</button>
                  {v.status === 'draft' && <button onClick={() => handleDelete(v.id)} className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 cursor-pointer">Delete</button>}
                </div>
              </div>
              <div className="px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1">
                <div>
                  <p className="text-xs text-gray-400">Payee</p>
                  <p className="text-sm font-bold text-gray-800">{v.payee_name}</p>
                  {v.payee_bank && <p className="text-xs text-gray-500">{v.payee_bank}{v.payee_account ? ' · ' + v.payee_account : ''}</p>}
                </div>
                <div>
                  <p className="text-xs text-gray-400">Amount</p>
                  <p className="text-base font-extrabold text-blue-700">{v.currency || 'NAD'} {parseFloat(v.amount).toLocaleString('en-NA', { minimumFractionDigits: 2 })}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Method</p>
                  <p className="text-sm font-semibold text-gray-700">{v.payment_method}</p>
                  {v.reference_number && <p className="text-xs text-gray-400">Ref: {v.reference_number}</p>}
                </div>
                <div>
                  <p className="text-xs text-gray-400">Date</p>
                  <p className="text-sm font-semibold text-gray-700">{v.payment_date ? new Date(v.payment_date).toLocaleDateString('en-NA') : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Authorised By</p>
                  <p className="text-sm font-semibold text-gray-700">{v.authorised_by || '—'}</p>
                </div>
                {v.narration && (
                  <div className="w-full">
                    <p className="text-xs text-gray-400">Narration</p>
                    <p className="text-sm text-gray-600 italic">{v.narration}</p>
                  </div>
                )}
              </div>
              {/* Quick status update bar */}
              {editStatus === v.id ? (
                <div className="px-4 pb-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-gray-600">Update status to:</span>
                  {['draft','pending_auth','authorised','paid','cancelled'].map(s => (
                    <button key={s} onClick={() => handleStatusChange(v.id, s)}
                      className={`px-2.5 py-1 text-xs font-bold rounded-full cursor-pointer ${STATUS_COLORS[s] || 'bg-gray-100'}`}>
                      {s.replace('_',' ').toUpperCase()}
                    </button>
                  ))}
                  <button onClick={() => setEditStatus(null)} className="text-xs text-gray-400 underline cursor-pointer ml-1">Cancel</button>
                </div>
              ) : (
                <div className="px-4 pb-2">
                  <button onClick={() => setEditStatus(v.id)} className="text-xs text-blue-600 underline cursor-pointer">Change Status</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New Voucher Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-6">
            <div className="flex items-center justify-between px-6 py-4 bg-blue-700 rounded-t-2xl">
              <div>
                <h3 className="text-white font-bold text-lg">New Payment Voucher</h3>
                <p className="text-blue-200 text-xs mt-0.5">Dynapharm International Namibia</p>
              </div>
              <button onClick={() => setShowForm(false)} className="text-white/80 hover:text-white text-xl cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {/* Payment classification */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Payment Type *</label>
                  <select value={form.payment_type} onChange={e => fv('payment_type', e.target.value)} required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    {PAYMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Status</label>
                  <select value={form.status} onChange={e => fv('status', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="draft">Draft</option>
                    <option value="pending_auth">Pending Authorisation</option>
                    <option value="authorised">Authorised</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
              </div>

              {/* ── BONUS-SPECIFIC: Distributor Search ─────────────── */}
              {form.payment_type === 'bonus' && (
                <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-200 space-y-3">
                  <p className="text-xs font-bold text-yellow-700 uppercase tracking-wide">🔍 Distributor Bonus Lookup</p>
                  {selectedBonus ? (
                    <div className="bg-white rounded-lg border border-yellow-300 p-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold text-gray-800 text-sm">{selectedBonus.distributor_name}</p>
                        <p className="text-xs text-gray-500 mt-0.5">NB: {selectedBonus.nb_number} · Period: {selectedBonus.period}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-green-700 font-semibold">Earned: {formatCurrency(selectedBonus.amount_earned)}</span>
                          <span className="text-xs text-blue-700 font-semibold">Paid: {formatCurrency(selectedBonus.amount_paid)}</span>
                          <span className="text-xs text-orange-700 font-bold">Outstanding: {formatCurrency(selectedBonus.outstanding)}</span>
                        </div>
                        {parseFloat(selectedBonus.outstanding) <= 0 && (
                          <p className="text-xs text-red-600 font-semibold mt-1">⚠️ This bonus is already fully paid.</p>
                        )}
                      </div>
                      <button type="button" onClick={clearBonusSelection} className="text-xs text-red-500 underline cursor-pointer shrink-0">Change</button>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-gray-600 mb-1">Period</label>
                          <select value={bonusSearchPeriod} onChange={e => setBonusSearchPeriod(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 outline-none bg-white">
                            <option value="">All periods</option>
                            {bonusPeriods.map(p => (
                              <option key={p.period} value={p.period}>
                                {p.period} — {p.unpaid_count} unpaid / {p.total} total
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="relative">
                          <label className="block text-xs font-bold text-gray-600 mb-1">Search by NB number or name</label>
                          <input value={bonusSearchQ} onChange={e => setBonusSearchQ(e.target.value)}
                            placeholder="e.g. NB001234 or Distributor Name"
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-yellow-400 outline-none" />
                          {bonusSearching && <span className="absolute right-2 top-8 text-xs text-gray-400">Searching…</span>}
                        </div>
                      </div>
                      {bonusResults.length > 0 && (
                        <div className="bg-white rounded-lg border border-gray-200 shadow-sm max-h-48 overflow-y-auto divide-y divide-gray-100">
                          {bonusResults.map(b => (
                            <button key={b.id} type="button" onClick={() => selectBonus(b)}
                              className={`w-full text-left px-3 py-2.5 hover:bg-yellow-50 transition-colors cursor-pointer ${parseFloat(b.outstanding) <= 0 ? 'opacity-50' : ''}`}>
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <p className="text-sm font-bold text-gray-800">{b.distributor_name}</p>
                                  <p className="text-xs text-gray-500">NB: {b.nb_number} · Period: {b.period}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-sm font-extrabold text-orange-700">{formatCurrency(b.outstanding)}</p>
                                  <p className="text-xs text-gray-400">{parseFloat(b.outstanding) <= 0 ? 'Fully Paid' : 'Outstanding'}</p>
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {bonusSearchQ.length > 1 && bonusResults.length === 0 && !bonusSearching && (
                        <p className="text-xs text-gray-500 text-center py-2">No matching bonus records found. Try a different search or period.</p>
                      )}
                      <p className="text-xs text-gray-400">Select a distributor record to auto-fill the payee name and outstanding amount.</p>
                    </>
                  )}
                </div>
              )}

              {/* Payee info */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Payee Details {form.payment_type === 'bonus' && selectedBonus ? '(auto-filled from bonus record)' : ''}</p>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Payee Name *</label>
                  <input value={form.payee_name} onChange={e => fv('payee_name', e.target.value)} required
                    placeholder="Full name or company name"
                    readOnly={form.payment_type === 'bonus' && !!selectedBonus}
                    className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none ${form.payment_type === 'bonus' && selectedBonus ? 'bg-gray-100 text-gray-600' : ''}`} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Bank Name</label>
                    <input value={form.payee_bank} onChange={e => fv('payee_bank', e.target.value)}
                      placeholder="e.g. FNB, Standard Bank" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Account Number</label>
                    <input value={form.payee_account} onChange={e => fv('payee_account', e.target.value)}
                      placeholder="Account number" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Branch Code</label>
                    <input value={form.payee_branch_code} onChange={e => fv('payee_branch_code', e.target.value)}
                      placeholder="Branch/sort code" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                </div>
              </div>

              {/* Payment details */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Payment Details</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Amount (NAD) *</label>
                    <input type="number" step="0.01" min="0.01" value={form.amount}
                      onChange={e => fv('amount', e.target.value)} required
                      readOnly={form.payment_type === 'bonus' && !!selectedBonus}
                      placeholder="0.00"
                      className={`w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none ${form.payment_type === 'bonus' && selectedBonus ? 'bg-gray-100 font-bold text-blue-800' : ''}`} />
                    {form.payment_type === 'bonus' && selectedBonus && (
                      <p className="text-xs text-orange-600 mt-0.5">Auto-filled from outstanding bonus balance</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Currency</label>
                    <select value={form.currency} onChange={e => fv('currency', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                      <option value="NAD">NAD (N$)</option>
                      <option value="USD">USD ($)</option>
                      <option value="ZAR">ZAR (R)</option>
                      <option value="MYR">MYR (RM)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Payment Method *</label>
                    <select value={form.payment_method} onChange={e => fv('payment_method', e.target.value)} required
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                      {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Reference / Cheque No.</label>
                    <input value={form.reference_number} onChange={e => fv('reference_number', e.target.value)}
                      placeholder="EFT ref, cheque number, etc." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">Payment Date</label>
                    <input type="date" value={form.payment_date} onChange={e => fv('payment_date', e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                </div>
              </div>

              {/* Authorisation & narration */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Authorisation</p>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Authorised By</label>
                  <input value={form.authorised_by} onChange={e => fv('authorised_by', e.target.value)}
                    placeholder="Name of authorising manager/director" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Narration / Description *</label>
                  <textarea value={form.narration} onChange={e => fv('narration', e.target.value)} rows={2}
                    placeholder="What is this payment for? (be specific)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Internal Notes</label>
                  <textarea value={form.notes} onChange={e => fv('notes', e.target.value)} rows={2}
                    placeholder="Any internal notes (not printed on voucher)" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="px-5 py-2 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
                <button type="submit" disabled={submitting}
                  className="px-6 py-2 rounded-lg text-sm font-bold bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-60 cursor-pointer">
                  {submitting ? 'Creating…' : 'Create Voucher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Voucher Detail Modal */}
      {viewVoucher && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-6">
            <div className="flex items-center justify-between px-6 py-4 bg-blue-700 rounded-t-2xl">
              <div>
                <h3 className="text-white font-bold">{viewVoucher.voucher_number}</h3>
                <p className="text-blue-200 text-xs">{typeLabel(viewVoucher.payment_type)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => printVoucher(viewVoucher)} className="text-white/80 hover:text-white text-sm cursor-pointer">🖨 Print</button>
                <button onClick={() => setViewVoucher(null)} className="text-white/80 hover:text-white text-xl cursor-pointer">✕</button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${STATUS_COLORS[viewVoucher.status] || 'bg-gray-100 text-gray-600'}`}>
                {viewVoucher.status?.replace('_', ' ').toUpperCase()}
              </div>
              {[
                ['Amount', `${viewVoucher.currency || 'NAD'} ${parseFloat(viewVoucher.amount).toLocaleString('en-NA', { minimumFractionDigits: 2 })}`],
                ['Payment Method', viewVoucher.payment_method],
                ['Reference', viewVoucher.reference_number || '—'],
                ['Payment Date', viewVoucher.payment_date ? new Date(viewVoucher.payment_date).toLocaleDateString('en-NA') : '—'],
                ['Payee', viewVoucher.payee_name],
                ['Bank', viewVoucher.payee_bank || '—'],
                ['Account', viewVoucher.payee_account || '—'],
                ['Branch Code', viewVoucher.payee_branch_code || '—'],
                ['Narration', viewVoucher.narration || '—'],
                ['Authorised By', viewVoucher.authorised_by || '—'],
                ['Prepared By', viewVoucher.prepared_by],
                ['Notes', viewVoucher.notes || '—'],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between text-sm border-b border-gray-100 pb-2">
                  <span className="text-gray-500 font-medium">{label}</span>
                  <span className="text-gray-800 font-semibold text-right max-w-xs">{val}</span>
                </div>
              ))}
              <div className="pt-2">
                <p className="text-xs text-gray-400 font-medium mb-2">Change Status:</p>
                <div className="flex flex-wrap gap-2">
                  {['draft','pending_auth','authorised','paid','cancelled'].map(s => (
                    <button key={s} onClick={() => handleStatusChange(viewVoucher.id, s)}
                      className={`px-3 py-1 text-xs font-bold rounded-full cursor-pointer border-0 ${viewVoucher.status === s ? 'ring-2 ring-blue-500 ' : ''}${STATUS_COLORS[s] || 'bg-gray-100'}`}>
                      {s.replace('_',' ').toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
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
  return <StaffServicesTab accentColor="#1e40af" />;
}

/* ─── CAS REVIEW ─────────────────────────────────────────── */
function CASReviewTab() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [reviewModal, setReviewModal] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [processing, setProcessing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('pending');

  const load = () => {
    setLoading(true);
    api.get(`/cash-requests/admin${statusFilter ? `?status=${statusFilter}` : ''}`)
      .then(d => setRequests(Array.isArray(d) ? d : []))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [statusFilter]);

  const handleReview = async () => {
    if (!reviewModal) return;
    setProcessing(true);
    try {
      await api.patch(`/cash-requests/${reviewModal.id}`, { status: 'finance_reviewed', note: reviewNote });
      setMessage(`✅ Request ${reviewModal.request_number} marked as Finance Reviewed — sent to GM for approval.`);
      setRequests(prev => prev.filter(r => r.id !== reviewModal.id));
      setReviewModal(null);
      setReviewNote('');
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally { setProcessing(false); }
  };

  const handleReject = async () => {
    if (!reviewModal) return;
    setProcessing(true);
    try {
      await api.patch(`/cash-requests/${reviewModal.id}`, { status: 'rejected', note: reviewNote });
      setMessage(`❌ Request ${reviewModal.request_number} rejected.`);
      setRequests(prev => prev.filter(r => r.id !== reviewModal.id));
      setReviewModal(null);
      setReviewNote('');
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally { setProcessing(false); }
  };

  const statusBadge = (s) => {
    const map = { pending: { bg: '#fffbeb', c: '#92400e', label: 'Pending' }, finance_reviewed: { bg: '#eff6ff', c: '#1e40af', label: 'Finance Reviewed' }, approved: { bg: '#f0fdf4', c: '#166534', label: 'Approved' }, rejected: { bg: '#fef2f2', c: '#991b1b', label: 'Rejected' } };
    const m = map[s] || map.pending;
    return <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: m.bg, color: m.c, border: `1px solid ${m.c}33` }}>{m.label}</span>;
  };

  return (
    <div>
      <div className="rounded-xl p-5 mb-5 flex justify-between items-center flex-wrap gap-3" style={{ background: 'linear-gradient(135deg,#1e40af,#1d4ed8)', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
        <div>
          <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1 m-0">Finance Department</p>
          <h3 className="text-white text-lg font-bold m-0">✅ CAS Review — Branch Expense Requests</h3>
          <p className="text-white/70 text-sm mt-1 m-0">Review branch expense cash advance requests before GM final approval</p>
        </div>
        <button onClick={load} className="px-4 py-2 rounded-full font-semibold text-sm cursor-pointer bg-white" style={{ color: '#1e40af', border: 'none', fontWeight: 700 }}>🔄 Refresh</button>
      </div>

      {message && <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: message.startsWith('Error') ? '#fef2f2' : '#f0fdf4', color: message.startsWith('Error') ? '#991b1b' : '#166534', border: `1px solid ${message.startsWith('Error') ? '#fca5a5' : '#86efac'}` }}>{message}</div>}

      <div className="flex gap-2 mb-5 flex-wrap">
        {[{ v: 'pending', l: '⏳ Pending Review' }, { v: 'finance_reviewed', l: '💼 Finance Reviewed' }, { v: 'approved', l: '✅ Approved' }, { v: 'rejected', l: '❌ Rejected' }, { v: '', l: '📋 All' }].map(t => (
          <button key={t.v} onClick={() => setStatusFilter(t.v)}
            style={{ padding: '7px 16px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: statusFilter === t.v ? '#1e40af' : '#f1f5f9', color: statusFilter === t.v ? '#fff' : '#64748b', transition: 'all 0.2s' }}>
            {t.l}
          </button>
        ))}
      </div>

      {loading ? <div className="py-10 text-center text-gray-400">Loading requests…</div> : requests.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          <div className="text-4xl mb-3">✅</div>
          <p className="font-semibold text-gray-500">No {statusFilter || ''} requests</p>
          <p className="text-sm">All branch expense cash advance requests have been processed</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(r => (
            <Card key={r.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="font-bold text-gray-800">{r.request_number}</span>
                      {statusBadge(r.status)}
                      {r.expense_category && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: '#eff6ff', color: '#1e40af', border: '1px solid #93c5fd' }}>{r.expense_category}</span>}
                      <span className="font-bold text-lg" style={{ color: '#166534' }}>N$ {Number(r.amount || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mb-1">
                      <span className="text-sm font-bold text-gray-800">📍 {r.branch || 'Unknown Branch'}</span>
                      {(r.submitted_by_name || r.requested_by) && <span className="text-xs text-gray-500">Submitted by: {r.submitted_by_name || r.requested_by}</span>}
                    </div>
                    <div className="text-sm text-gray-700 mb-1"><span className="font-semibold">Expense Description:</span> {r.purpose}</div>
                    {r.needed_by && <div className="text-xs text-gray-500">Needed by: {r.needed_by}</div>}
                    {r.finance_note && <div className="text-xs mt-1 p-2 rounded" style={{ background: '#eff6ff' }}>Finance Note: {r.finance_note}</div>}
                    <div className="text-xs text-gray-400 mt-1">Submitted: {r.created_at ? new Date(r.created_at).toLocaleString('en-NA') : '—'}</div>
                  </div>
                  {r.status === 'pending' && (
                    <button onClick={() => { setReviewModal(r); setReviewNote(''); }} style={{ padding: '8px 18px', borderRadius: 10, background: '#1e40af', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.83rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      ✅ Review Request
                    </button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {reviewModal && (
        <div onClick={e => { if (e.target === e.currentTarget) { setReviewModal(null); setReviewNote(''); } }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 500, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#1d4ed8)', padding: '16px 24px' }}>
              <p style={{ color: '#fff', fontWeight: 800, fontSize: '1.05rem', margin: 0 }}>✅ Review Branch Expense Request (CAS)</p>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.83rem', margin: '4px 0 0' }}>{reviewModal.request_number} · {reviewModal.branch || 'Branch'}{reviewModal.expense_category ? ` · ${reviewModal.expense_category}` : ''}</p>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Branch</div>
                    <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.95rem' }}>{reviewModal.branch || '—'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Amount Requested</div>
                    <div style={{ fontWeight: 800, color: '#166534', fontSize: '1.1rem' }}>N$ {Number(reviewModal.amount || 0).toFixed(2)}</div>
                  </div>
                </div>
                {reviewModal.expense_category && <div style={{ marginBottom: 6 }}><span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: '#eff6ff', color: '#1e40af', border: '1px solid #93c5fd' }}>{reviewModal.expense_category}</span></div>}
                <div style={{ fontSize: '0.87rem', color: '#374151', marginTop: 4 }}>{reviewModal.purpose}</div>
                {reviewModal.needed_by && <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>Needed by: {reviewModal.needed_by}</div>}
                {(reviewModal.submitted_by_name || reviewModal.requested_by) && <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 4 }}>Submitted by: {reviewModal.submitted_by_name || reviewModal.requested_by}</div>}
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Finance Note (optional)</label>
                <textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)} rows={3} placeholder="Add any notes for the GM…" style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: '0.87rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '8px 12px' }}>
                💡 Marking as reviewed sends this to the GM for final approval. You can also reject it if the request is invalid.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setReviewModal(null); setReviewNote(''); }} style={{ flex: 1, padding: '11px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600 }}>Cancel</button>
                <button onClick={handleReject} disabled={processing} style={{ flex: 1, padding: '11px', border: 'none', borderRadius: 10, background: '#fef2f2', color: '#dc2626', fontWeight: 700, cursor: processing ? 'not-allowed' : 'pointer', opacity: processing ? 0.65 : 1 }}>❌ Reject</button>
                <button onClick={handleReview} disabled={processing} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#1e40af,#1d4ed8)', color: '#fff', fontWeight: 800, cursor: processing ? 'not-allowed' : 'pointer', opacity: processing ? 0.65 : 1 }}>
                  {processing ? '⏳ Processing…' : '✅ Mark as Reviewed → GM'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── PETTY CASH ─────────────────────────────────────────── */
function PettyCashTab() {
  const OVERHEAD_CATS = ['Office Supplies', 'Transport', 'Utilities', 'Maintenance', 'Cleaning', 'Communication', 'Staff Welfare', 'Entertainment', 'Other'];
  const [accounts, setAccounts] = useState([]);
  const [requests, setRequests] = useState([]);
  const [txns, setTxns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [subTab, setSubTab] = useState('account');
  const [showRequest, setShowRequest] = useState(false);
  const [showSpend, setShowSpend] = useState(false);
  const [reqForm, setReqForm] = useState({ amount: '', purpose: '', location: 'head_office' });
  const [spendForm, setSpendForm] = useState({ amount: '', description: '', category: 'Office Supplies', branch_id: 'head_office', location: 'head_office' });
  const [submitting, setSubmitting] = useState(false);
  const [actionModal, setActionModal] = useState(null);
  const [actionNote, setActionNote] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      api.finance.pettyCash.accounts().then(d => d.accounts || []).catch(() => []),
      api.finance.pettyCash.requests().then(d => d.requests || []).catch(() => []),
      api.finance.pettyCash.transactions().then(d => d.transactions || []).catch(() => []),
    ]).then(([accts, reqs, txs]) => {
      setAccounts(accts);
      setRequests(reqs);
      setTxns(txs);
    }).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleRequest = async (e) => {
    e.preventDefault();
    if (!reqForm.amount || !reqForm.purpose) { setMessage('Error: Amount and purpose are required.'); return; }
    setSubmitting(true);
    try {
      await api.finance.pettyCash.createRequest({ amount: Number(reqForm.amount), purpose: reqForm.purpose, location: reqForm.location });
      setReqForm({ amount: '', purpose: '', location: 'head_office' });
      setShowRequest(false);
      setMessage('Petty cash request submitted — awaiting GM approval.');
      load();
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setSubmitting(false); }
  };

  const handleSpend = async (e) => {
    e.preventDefault();
    if (!spendForm.amount || !spendForm.description) { setMessage('Error: Amount and description are required.'); return; }
    setSubmitting(true);
    try {
      await api.finance.pettyCash.spend({ ...spendForm, amount: Number(spendForm.amount) });
      setSpendForm({ amount: '', description: '', category: 'Office Supplies', branch_id: 'head_office', location: 'head_office' });
      setShowSpend(false);
      setMessage('Expense recorded against petty cash.');
      load();
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setSubmitting(false); }
  };

  if (loading) return <LoadingSpinner />;

  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  const pendingReqs = requests.filter(r => r.status === 'pending_gm' || r.status === 'pending_director');
  const issuedReqs = requests.filter(r => r.status === 'issued');

  const statusBadge = (s) => {
    const map = { pending_gm: ['warning', 'Awaiting GM'], pending_director: ['info', 'Awaiting Director'], issued: ['success', 'Issued'], rejected: ['danger', 'Rejected'] };
    const [v, l] = map[s] || ['default', s];
    return <Badge variant={v}>{l}</Badge>;
  };

  return (
    <div className="space-y-5">
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} onClose={() => setMessage('')}>{message}</Alert>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Petty Cash Balance" value={formatCurrency(totalBalance)} color="green" icon={<Wallet size={24} />} />
        <StatCard title="Pending Requests" value={pendingReqs.length} subtitle="Awaiting approval" color="orange" icon={<ClipboardList size={24} />} />
        <StatCard title="Issued This Month" value={formatCurrency(issuedReqs.filter(r => r.issued_at?.startsWith(localMonth())).reduce((s,r)=>s+Number(r.amount||0),0))} color="blue" icon={<TrendingUp size={24} />} />
        <StatCard title="Total Transactions" value={txns.length} color="primary" icon={<Receipt size={24} />} />
      </div>

      <div className="flex flex-wrap gap-2 mb-2">
        {['account', 'requests', 'history'].map(t => (
          <button key={t} onClick={() => setSubTab(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer border-none transition-all ${subTab === t ? 'bg-primary text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t === 'account' ? '💵 Account' : t === 'requests' ? '📋 Requests' : '📜 Transaction History'}
          </button>
        ))}
        <button onClick={load} className="px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer border border-gray-200 bg-white text-gray-500 ml-auto">↺ Refresh</button>
      </div>

      {subTab === 'account' && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap justify-between items-center gap-3">
              <div>
                <h3 className="font-bold text-gray-800">Petty Cash Accounts</h3>
                <p className="text-xs text-gray-500">Cash issued from banking account for daily office expenses</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setShowRequest(true)}><ClipboardList size={14} /> Request Cash</Button>
                <Button size="sm" variant="secondary" onClick={() => setShowSpend(true)}><Receipt size={14} /> Record Spend</Button>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            {accounts.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Wallet size={40} className="mx-auto mb-2 opacity-40" />
                <p className="font-medium">No petty cash accounts yet</p>
                <p className="text-sm mt-1">Request petty cash from the banking account to get started.</p>
                <Button className="mt-4" size="sm" onClick={() => setShowRequest(true)}>Request Petty Cash</Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {accounts.map(a => (
                  <div key={a.id} className="border border-gray-200 rounded-xl p-4 bg-gradient-to-br from-white to-green-50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{branchLabel(a.location) || a.location}</span>
                      <Badge variant={Number(a.balance) > 0 ? 'success' : 'danger'}>{Number(a.balance) > 0 ? 'Active' : 'Depleted'}</Badge>
                    </div>
                    <div className="text-2xl font-bold text-gray-900 mb-1">{formatCurrency(a.balance)}</div>
                    {a.last_topped_up_at && (
                      <p className="text-xs text-gray-400">Last topped up {formatDate(a.last_topped_up_at)} by {a.last_topped_up_by}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {subTab === 'requests' && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-gray-800">Petty Cash Requests</h3>
                <p className="text-xs text-gray-500">Finance → GM approval → Director issues</p>
              </div>
              <Button size="sm" onClick={() => setShowRequest(true)}><ClipboardList size={14} /> New Request</Button>
            </div>
          </CardHeader>
          <CardBody>
            <Table
              columns={[
                { header: 'Date', render: r => formatDate(r.created_at) },
                { header: 'Request #', render: r => <span className="text-xs font-mono text-gray-500">{r.request_number || r.id}</span> },
                { header: 'Location', render: r => <span className="font-medium">{branchLabel(r.location) || r.location || 'Head Office'}</span> },
                { header: 'Amount', render: r => <span className="font-bold text-green-700">{formatCurrency(r.amount)}</span> },
                { header: 'Purpose', render: r => <span className="text-sm">{r.purpose}</span> },
                { header: 'Status', render: r => statusBadge(r.status) },
                { header: 'Requested By', render: r => <span className="text-xs text-gray-500">{r.requested_by || '—'}</span> },
                { header: 'GM', render: r => r.gm_approved_by ? <span className="text-xs text-green-600">✓ {r.gm_approved_by}</span> : <span className="text-xs text-gray-400">Pending</span> },
                { header: 'Issued By', render: r => r.issued_by ? <span className="text-xs text-green-700 font-semibold">✓ {r.issued_by}</span> : <span className="text-xs text-gray-400">—</span> },
              ]}
              data={requests}
              emptyMessage="No petty cash requests yet"
            />
          </CardBody>
        </Card>
      )}

      {subTab === 'history' && (
        <Card>
          <CardHeader>
            <h3 className="font-bold text-gray-800">Transaction History</h3>
          </CardHeader>
          <CardBody>
            <Table
              columns={[
                { header: 'Date', render: r => formatDate(r.created_at) },
                { header: 'Type', render: r => <Badge variant={r.type === 'top_up' ? 'success' : 'danger'}>{r.type === 'top_up' ? '⬆ Top-Up' : '⬇ Expense'}</Badge> },
                { header: 'Location', render: r => branchLabel(r.location) || r.location },
                { header: 'Amount', render: r => <span className={`font-bold ${r.type === 'top_up' ? 'text-green-700' : 'text-red-600'}`}>{r.type === 'top_up' ? '+' : '-'}{formatCurrency(r.amount)}</span> },
                { header: 'Description', render: r => <span className="text-sm">{r.description}</span> },
                { header: 'Category', render: r => r.category ? <Badge variant="info">{r.category}</Badge> : '—' },
                { header: 'By', render: r => <span className="text-xs text-gray-500">{r.performed_by || '—'}</span> },
              ]}
              data={txns}
              emptyMessage="No transactions yet"
            />
          </CardBody>
        </Card>
      )}

      <Modal open={showRequest} onClose={() => setShowRequest(false)} title="Request Petty Cash" size="md">
        <form onSubmit={handleRequest} className="p-6 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
            This request will be sent to the GM for approval, then to the Director for cash issuance. Once issued, the petty cash account balance will be updated.
          </div>
          <Input label="Amount (N$) *" type="number" min="1" step="0.01" value={reqForm.amount} onChange={e => setReqForm(f => ({ ...f, amount: e.target.value }))} placeholder="e.g. 500" required />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Location</label>
            <select value={reqForm.location} onChange={e => setReqForm(f => ({ ...f, location: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none">
              <option value="head_office">Head Office</option>
              {BRANCH_DETAILS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Purpose *</label>
            <textarea value={reqForm.purpose} onChange={e => setReqForm(f => ({ ...f, purpose: e.target.value }))} required
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none resize-none" rows={3}
              placeholder="Explain what the petty cash will be used for..." />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" type="button" onClick={() => setShowRequest(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit Request'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={showSpend} onClose={() => setShowSpend(false)} title="Record Petty Cash Expense" size="md">
        <form onSubmit={handleSpend} className="p-6 space-y-4">
          {accounts.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-green-700 font-medium">
              Available balance: {formatCurrency(accounts.find(a => a.location === spendForm.location)?.balance || 0)}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input label="Amount (N$) *" type="number" min="1" step="0.01" value={spendForm.amount} onChange={e => setSpendForm(f => ({ ...f, amount: e.target.value }))} required />
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Category</label>
              <select value={spendForm.category} onChange={e => setSpendForm(f => ({ ...f, category: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none">
                {OVERHEAD_CATS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">From Account</label>
              <select value={spendForm.location} onChange={e => setSpendForm(f => ({ ...f, location: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none">
                <option value="head_office">Head Office</option>
                {BRANCH_DETAILS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Associated Branch</label>
              <select value={spendForm.branch_id} onChange={e => setSpendForm(f => ({ ...f, branch_id: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none">
                <option value="head_office">Head Office</option>
                {BRANCH_DETAILS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Description *</label>
            <textarea value={spendForm.description} onChange={e => setSpendForm(f => ({ ...f, description: e.target.value }))} required
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none resize-none" rows={2}
              placeholder="What was the expense for?" />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" type="button" onClick={() => setShowSpend(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Recording…' : 'Record Expense'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/* ─── OVERHEADS ──────────────────────────────────────────── */
function OverheadsTab() {
  const [subTab, setSubTab] = useState('overheads');
  const subTabs = [
    { id: 'overheads', label: '🏢 Overhead Expenses' },
    { id: 'salary',   label: '💼 Salary Ledger' },
    { id: 'payroll',  label: '👷 Payroll' },
    { id: 'rent',     label: '🏘️ Rent / Lease' },
  ];
  return (
    <div>
      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {subTabs.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap rounded-t-lg border-b-2 transition-colors ${subTab === t.id ? 'border-blue-900 text-blue-900 bg-blue-50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'} cursor-pointer`}>
            {t.label}
          </button>
        ))}
      </div>
      {subTab === 'overheads' && <OverheadExpensesSubTab />}
      {subTab === 'salary'    && <SalaryLedgerTab role="finance" />}
      {subTab === 'payroll'   && <PayrollTab />}
      {subTab === 'rent'      && <RentPaymentsTab />}
    </div>
  );
}

function OverheadExpensesSubTab() {
  const OVERHEAD_CATEGORIES = ['Rent', 'Salaries', 'Utilities', 'Internet & Telecoms', 'Security', 'Cleaning & Hygiene', 'Transport & Fuel', 'Office Supplies', 'Maintenance & Repairs', 'Marketing & Advertising', 'Staff Welfare', 'Insurance', 'Equipment & Assets', 'Professional Services', 'Banking Charges', 'Other Overhead'];
  const emptyForm = { description: '', amount: '', category: 'Rent', branch_id: 'head_office', date: localDate(), payment_method: 'bank_transfer', notes: '' };
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [filterBranch, setFilterBranch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterMonth, setFilterMonth] = useState(localMonth());

  const load = () => {
    setLoading(true);
    api.branch.expenses()
      .then(d => {
        const all = Array.isArray(d) ? d : d.expenses || [];
        setExpenses(all.filter(e => OVERHEAD_CATEGORIES.includes(e.category)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.description || !form.amount || !form.branch_id) { setMessage('Error: Description, amount and branch are required.'); return; }
    setSubmitting(true);
    try {
      await api.branch.createExpense({
        branchId: form.branch_id,
        date: form.date,
        amount: Number(form.amount),
        description: form.description,
        category: form.category,
        paymentMethod: form.payment_method,
        notes: form.notes,
        metadata: { type: 'overhead' },
      });
      setForm(emptyForm);
      setShowForm(false);
      setMessage('Overhead expense recorded.');
      load();
    } catch (err) { setMessage('Error: ' + err.message); }
    finally { setSubmitting(false); }
  };

  if (loading) return <LoadingSpinner />;

  let filtered = expenses;
  if (filterBranch) filtered = filtered.filter(e => (e.branchId || e.branch_id) === filterBranch);
  if (filterCat) filtered = filtered.filter(e => e.category === filterCat);
  if (filterMonth) filtered = filtered.filter(e => {
    const d = e.date || e.created_at || '';
    return d.startsWith(filterMonth);
  });

  const totalAll = filtered.reduce((s, e) => s + Number(e.amount || 0), 0);

  // Branch breakdown
  const branchTotals = {};
  filtered.forEach(e => {
    const bid = e.branchId || e.branch_id || 'head_office';
    branchTotals[bid] = (branchTotals[bid] || 0) + Number(e.amount || 0);
  });

  // Category breakdown
  const catTotals = {};
  filtered.forEach(e => {
    catTotals[e.category] = (catTotals[e.category] || 0) + Number(e.amount || 0);
  });

  const sortedCats = Object.entries(catTotals).sort(([,a],[,b]) => b - a);

  return (
    <div className="space-y-5">
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} onClose={() => setMessage('')}>{message}</Alert>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Overheads" value={formatCurrency(totalAll)} color="red" icon={<Building2 size={24} />} />
        <StatCard title="Branches Covered" value={Object.keys(branchTotals).length} color="blue" icon={<Building2 size={24} />} />
        <StatCard title="Top Category" value={sortedCats[0]?.[0] || '—'} subtitle={sortedCats[0] ? formatCurrency(sortedCats[0][1]) : ''} color="orange" icon={<ClipboardList size={24} />} />
        <StatCard title="Records" value={filtered.length} color="primary" icon={<Receipt size={24} />} />
      </div>

      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none" />
          <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none">
            <option value="">All Branches</option>
            <option value="head_office">Head Office</option>
            {BRANCH_DETAILS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none">
            <option value="">All Categories</option>
            {OVERHEAD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {(filterBranch || filterCat) && (
            <Button size="sm" variant="secondary" onClick={() => { setFilterBranch(''); setFilterCat(''); }}>
              <XCircle size={13} /> Clear
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowForm(true)}><Receipt size={14} /> Add Overhead</Button>
          <Button size="sm" variant="secondary" onClick={load}><RefreshCw size={14} /></Button>
        </div>
      </div>

      {Object.keys(branchTotals).length > 0 && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Branch Overhead Summary</h3></CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {Object.entries(branchTotals).sort(([,a],[,b]) => b - a).map(([bid, total]) => (
                <div key={bid} className="border border-gray-200 rounded-xl p-3 bg-red-50 cursor-pointer hover:border-red-300 transition-colors"
                  onClick={() => setFilterBranch(bid === filterBranch ? '' : bid)}>
                  <div className="text-xs font-semibold text-gray-500 mb-1 truncate">{branchLabel(bid) === '—' ? 'Head Office' : branchLabel(bid)}</div>
                  <div className="text-lg font-bold text-red-700">{formatCurrency(total)}</div>
                  <div className="text-xs text-gray-400">{filtered.filter(e=>(e.branchId||e.branch_id)===bid).length} records</div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {sortedCats.length > 0 && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Overhead by Category</h3></CardHeader>
          <CardBody>
            <div className="space-y-2">
              {sortedCats.map(([cat, total]) => {
                const pct = totalAll > 0 ? (total / totalAll) * 100 : 0;
                return (
                  <div key={cat} className="flex items-center gap-3">
                    <span className="text-sm text-gray-700 w-44 truncate font-medium">{cat}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                      <div className="bg-red-600 h-2.5 rounded-full" style={{ width: pct + '%' }} />
                    </div>
                    <span className="text-sm font-bold text-gray-800 w-24 text-right">{formatCurrency(total)}</span>
                    <span className="text-xs text-gray-400 w-10 text-right">{pct.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-gray-800">All Overhead Expenses</h3>
              <p className="text-xs text-gray-500">{filtered.length} records · Total: {formatCurrency(totalAll)}</p>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <Table
            columns={[
              { header: 'Date', render: r => formatDate(r.date || r.created_at) },
              { header: 'Branch', render: r => {
                const bid = r.branchId || r.branch_id;
                const lbl = bid === 'head_office' ? 'Head Office' : branchLabel(bid);
                return <span className="font-semibold text-primary text-sm">{lbl || '—'}</span>;
              }},
              { header: 'Category', render: r => <Badge variant="danger">{r.category || '—'}</Badge> },
              { header: 'Description', render: r => <span className="text-sm">{r.description || '—'}</span> },
              { header: 'Amount', render: r => <span className="font-bold text-red-700">{formatCurrency(r.amount)}</span> },
              { header: 'Method', render: r => <span className="text-xs text-gray-500 capitalize">{(r.payment_method || r.paymentMethod || '—').replace(/_/g,' ')}</span> },
              { header: 'Status', render: r => {
                const s = r.status || 'recorded';
                return <Badge variant={s === 'approved' ? 'success' : s === 'rejected' ? 'danger' : 'warning'}>{s === 'recorded' ? 'Pending' : s.charAt(0).toUpperCase() + s.slice(1)}</Badge>;
              }},
            ]}
            data={filtered}
            emptyMessage="No overhead expenses for this period. Add one using the button above."
          />
        </CardBody>
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Overhead Expense" size="md">
        <form onSubmit={handleAdd} className="p-6 space-y-4">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-xs text-orange-700">
            Overhead expenses are recurring or operational costs associated with a specific branch or head office.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Amount (N$) *" type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
            <Input label="Date" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Branch *</label>
              <select value={form.branch_id} onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))} required
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none">
                <option value="">Select branch…</option>
                <option value="head_office">Head Office</option>
                {BRANCH_DETAILS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none">
                {OVERHEAD_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Description *" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Office rent April 2026" required />
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Payment Method</label>
              <select value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none">
                <option value="bank_transfer">Bank Transfer</option>
                <option value="petty_cash">Petty Cash</option>
                <option value="cheque">Cheque</option>
                <option value="eft">EFT</option>
                <option value="cash">Cash</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none resize-none" rows={2}
              placeholder="Invoice number, supplier, etc." />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Record Overhead'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/* ─── PAYROLL ───────────────────────────────────────────── */
const SSC_RATE_P = 0.009;
const SSC_CAP_MONTHLY = 81;

function calcPAYE(annualGross) {
  let tax = 0;
  const brackets = [
    { from: 0,       to: 50000,    rate: 0 },
    { from: 50001,   to: 100000,   rate: 0.18 },
    { from: 100001,  to: 300000,   rate: 0.25 },
    { from: 300001,  to: 500000,   rate: 0.28 },
    { from: 500001,  to: 800000,   rate: 0.30 },
    { from: 800001,  to: 1500000,  rate: 0.32 },
    { from: 1500001, to: Infinity, rate: 0.37 },
  ];
  for (const b of brackets) {
    if (annualGross > b.from) {
      const taxable = Math.min(annualGross, b.to) - b.from;
      tax += taxable * b.rate;
    }
  }
  return tax;
}

/* ─── RENT / LEASE PAYMENTS ──────────────────────────────── */
function RentPaymentsTab() {
  const [rents, setRents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [editModal, setEditModal] = useState(null);
  const [addModal, setAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [addForm, setAddForm] = useState({
    branch_name: '', lease_property_name: '', total_payable: '', operational_expenses: '0',
    rent_amount: '', outstanding_payments: '', comment: '', account_number: '', bank_branch_name: '', code: '', effective_from: '2026-04'
  });

  const load = () => {
    setLoading(true);
    api.finance.rent.list()
      .then(d => setRents(d.rents || []))
      .catch(() => setMsg('Error: Failed to load rent data'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openEdit = (r) => {
    setEditForm({ ...r });
    setEditModal(r);
    setMsg('');
  };

  const submitEdit = async () => {
    if (!editModal) return;
    setSaving(true); setMsg('');
    try {
      const changes = {
        lease_property_name: editForm.lease_property_name,
        total_payable: Number(editForm.total_payable) || 0,
        operational_expenses: Number(editForm.operational_expenses) || 0,
        rent_amount: Number(editForm.rent_amount) || 0,
        outstanding_payments: editForm.outstanding_payments || '',
        comment: editForm.comment || '',
        account_number: editForm.account_number || '',
        bank_branch_name: editForm.bank_branch_name || '',
        code: editForm.code || '',
        effective_from: editForm.effective_from || '',
      };
      const result = await api.finance.rent.proposeEdit(editModal.id, changes);
      if (!result.success) throw new Error(result.error || 'Failed to submit');
      setMsg('Edit submitted for GM approval.');
      setEditModal(null);
      load();
    } catch (e) { setMsg('Error: ' + e.message); }
    finally { setSaving(false); }
  };

  const submitAdd = async () => {
    if (!addForm.branch_name) { setMsg('Error: Branch name is required'); return; }
    setSaving(true); setMsg('');
    try {
      const result = await api.finance.rent.add({
        ...addForm,
        total_payable: Number(addForm.total_payable) || 0,
        operational_expenses: Number(addForm.operational_expenses) || 0,
        rent_amount: Number(addForm.rent_amount) || 0,
      });
      if (!result.success) throw new Error(result.error || 'Failed to add');
      setMsg('New rent record added successfully.');
      setAddModal(false);
      setAddForm({ branch_name: '', lease_property_name: '', total_payable: '', operational_expenses: '0', rent_amount: '', outstanding_payments: '', comment: '', account_number: '', bank_branch_name: '', code: '', effective_from: '2026-04' });
      load();
    } catch (e) { setMsg('Error: ' + e.message); }
    finally { setSaving(false); }
  };

  const totalRent = rents.reduce((s, r) => s + Number(r.rent_amount || 0), 0);
  const totalPayable = rents.reduce((s, r) => s + Number(r.total_payable || 0), 0);
  const pendingCount = rents.filter(r => r.pending_edit).length;

  const FIELDS = [
    { key: 'lease_property_name', label: 'Lease Property / Landlord', type: 'text' },
    { key: 'total_payable', label: 'Total Payable (N$)', type: 'number' },
    { key: 'operational_expenses', label: 'Operational Expenses (N$)', type: 'number' },
    { key: 'rent_amount', label: 'Rent Amount (N$)', type: 'number' },
    { key: 'outstanding_payments', label: 'Outstanding Payments / Ref', type: 'text' },
    { key: 'comment', label: 'Comment', type: 'text' },
    { key: 'account_number', label: 'Account Number', type: 'text' },
    { key: 'bank_branch_name', label: 'Bank / Branch Name', type: 'text' },
    { key: 'code', label: 'Branch Code', type: 'text' },
    { key: 'effective_from', label: 'Effective From (YYYY-MM)', type: 'month' },
  ];

  return (
    <div className="space-y-4">
      {msg && <Alert type={msg.startsWith('Error') ? 'error' : 'success'}>{msg}</Alert>}

      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardBody>
          <div className="flex justify-between items-start flex-wrap gap-3">
            <div>
              <h3 className="font-bold text-blue-900 flex items-center gap-2">🏘️ Branch Rent &amp; Lease Payments</h3>
              <p className="text-sm text-blue-700 mt-1">All edits require GM approval before taking effect.</p>
            </div>
            <Button onClick={() => { setAddModal(true); setMsg(''); }}>+ Add Branch</Button>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <StatCard title="Total Rent (Month)" value={formatCurrency(totalRent)} color="blue" icon={<Landmark size={24} />} />
        <StatCard title="Total Payable" value={formatCurrency(totalPayable)} color="green" icon={<DollarSign size={24} />} />
        <StatCard title="Pending GM Approval" value={pendingCount} color={pendingCount > 0 ? 'orange' : 'gray'} icon={<Receipt size={24} />} />
      </div>

      {loading ? <LoadingSpinner /> : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-indigo-50 text-indigo-800 text-xs font-semibold">
                  <th className="p-2 text-left">Branch / DPC</th>
                  <th className="p-2 text-left">Lease / Landlord</th>
                  <th className="p-2 text-right">Total Payable</th>
                  <th className="p-2 text-right">Op. Expenses</th>
                  <th className="p-2 text-right">Rent Amount</th>
                  <th className="p-2 text-left">Ref / Outstanding</th>
                  <th className="p-2 text-left">Account #</th>
                  <th className="p-2 text-left">Bank / Branch</th>
                  <th className="p-2 text-left">Code</th>
                  <th className="p-2 text-center">Status</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rents.map(r => (
                  <tr key={r.id} className={`border-t border-gray-100 hover:bg-gray-50 ${r.pending_edit ? 'bg-amber-50' : ''}`}>
                    <td className="p-2 font-semibold text-gray-800 text-xs">{r.branch_name}</td>
                    <td className="p-2 text-xs text-gray-600">{r.lease_property_name || '—'}</td>
                    <td className="p-2 text-right font-mono text-xs">{Number(r.total_payable) > 0 ? formatCurrency(r.total_payable) : '—'}</td>
                    <td className="p-2 text-right font-mono text-xs">{Number(r.operational_expenses) > 0 ? formatCurrency(r.operational_expenses) : '—'}</td>
                    <td className="p-2 text-right font-bold text-xs text-blue-700">{Number(r.rent_amount) > 0 ? formatCurrency(r.rent_amount) : '—'}</td>
                    <td className="p-2 text-xs text-gray-500">{r.outstanding_payments || r.comment || '—'}</td>
                    <td className="p-2 font-mono text-xs">{r.account_number || '—'}</td>
                    <td className="p-2 text-xs">{r.bank_branch_name || '—'}</td>
                    <td className="p-2 font-mono text-xs">{r.code || '—'}</td>
                    <td className="p-2 text-center">
                      {r.pending_edit
                        ? <Badge variant="warning">Pending GM</Badge>
                        : <Badge variant="success">Active</Badge>}
                    </td>
                    <td className="p-2">
                      <button onClick={() => openEdit(r)} className="text-xs text-blue-600 hover:underline disabled:opacity-40"
                        disabled={!!r.pending_edit} title={r.pending_edit ? 'Edit already pending GM approval' : 'Edit this record'}>
                        ✏️ Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {rents.length === 0 && (
                  <tr><td colSpan={11} className="p-6 text-center text-gray-400">No rent records found</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-indigo-50 font-bold text-sm border-t-2 border-indigo-200">
                  <td className="p-2" colSpan={2}>TOTALS</td>
                  <td className="p-2 text-right">{formatCurrency(totalPayable)}</td>
                  <td className="p-2 text-right">{formatCurrency(rents.reduce((s,r)=>s+Number(r.operational_expenses||0),0))}</td>
                  <td className="p-2 text-right text-blue-700">{formatCurrency(totalRent)}</td>
                  <td colSpan={6}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* Edit Modal */}
      {editModal && (
        <Modal title={`Edit Rent — ${editModal.branch_name}`} onClose={() => setEditModal(null)}>
          <div className="space-y-3">
            <Alert type="info">This edit will be sent to the GM for approval before it takes effect.</Alert>
            {FIELDS.map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                <input type={f.type} value={editForm[f.key] ?? ''} onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button onClick={submitEdit} disabled={saving} variant="primary">
                {saving ? 'Submitting…' : 'Submit for GM Approval'}
              </Button>
              <Button variant="secondary" onClick={() => setEditModal(null)}>Cancel</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Modal */}
      {addModal && (
        <Modal title="Add New Rent / Lease Record" onClose={() => setAddModal(false)}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Branch / DPC Name *</label>
              <input type="text" value={addForm.branch_name} onChange={e => setAddForm(p => ({ ...p, branch_name: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="e.g. RUNDU SHOP" />
            </div>
            {FIELDS.map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                <input type={f.type} value={addForm[f.key] ?? ''} onChange={e => setAddForm(p => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button onClick={submitAdd} disabled={saving} variant="primary">
                {saving ? 'Adding…' : 'Add Record'}
              </Button>
              <Button variant="secondary" onClick={() => setAddModal(false)}>Cancel</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PayrollTab() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [month, setMonth] = useState(localMonth());
  const [search, setSearch] = useState('');
  const [adjustments, setAdjustments] = useState({});
  const [showSlip, setShowSlip] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.get('/employees?limit=500')
      .then(d => {
        const list = Array.isArray(d) ? d : d.employees || [];
        setEmployees(list.filter(e => e.salary > 0 || e.employmentType === 'full_time' || e.employmentType === 'part_time'));
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = employees.filter(e =>
    !search || (e.name || e.fullName || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.branch || '').toLowerCase().includes(search.toLowerCase())
  );

  const rows = filtered.map(emp => {
    const gross = Number(emp.salary || 0);
    const adj = adjustments[emp.id] || {};
    const allowances = Number(adj.allowances || 0);
    const deductions = Number(adj.deductions || 0);
    const totalGross = gross + allowances;
    const annualGross = totalGross * 12;
    const annualPAYE = calcPAYE(annualGross);
    const monthlyPAYE = annualPAYE / 12;
    const sscEmployee = Math.min(totalGross * SSC_RATE_P, SSC_CAP_MONTHLY);
    const sscEmployer = Math.min(totalGross * SSC_RATE_P, SSC_CAP_MONTHLY);
    const net = totalGross - monthlyPAYE - sscEmployee - deductions;
    const employerCost = totalGross + sscEmployer;
    return { ...emp, gross, allowances, deductions, totalGross, monthlyPAYE, sscEmployee, sscEmployer, net, employerCost };
  });

  const totals = rows.reduce((acc, r) => ({
    gross: acc.gross + r.totalGross,
    paye: acc.paye + r.monthlyPAYE,
    sscEmp: acc.sscEmp + r.sscEmployee,
    sscEr: acc.sscEr + r.sscEmployer,
    net: acc.net + r.net,
    cost: acc.cost + r.employerCost,
  }), { gross: 0, paye: 0, sscEmp: 0, sscEr: 0, net: 0, cost: 0 });

  const fmt = (n) => formatCurrency(Number(n) || 0);

  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}

      {/* Header */}
      <Card>
        <CardBody>
          <div className="flex flex-wrap gap-3 items-end justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-800 flex items-center gap-2"><Users size={16} />Payroll Run</h2>
              <p className="text-xs text-gray-400">Namibian PAYE · SSC Act 34 of 1994 · Income Tax Act</p>
            </div>
            <div className="flex gap-2 items-end flex-wrap">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Pay Period</label>
                <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Search</label>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or branch…"
                  className="px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none w-40" />
              </div>
              <button onClick={() => window.print()}
                className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                <Printer size={13} /> Print
              </button>
              <button onClick={() => {
                const headers = ['Employee', 'Branch', 'Gross Salary', 'Allowances', 'Total Gross', 'PAYE', 'SSC (Emp)', 'SSC (Er)', 'Deductions', 'Net Pay', 'Employer Cost'];
                const dataRows = rows.map(r => [
                  r.name || r.fullName || '—',
                  r.branch || '—',
                  r.gross.toFixed(2),
                  r.allowances.toFixed(2),
                  r.totalGross.toFixed(2),
                  r.monthlyPAYE.toFixed(2),
                  r.sscEmployee.toFixed(2),
                  r.sscEmployer.toFixed(2),
                  r.deductions.toFixed(2),
                  r.net.toFixed(2),
                  r.employerCost.toFixed(2),
                ]);
                dataRows.push(['TOTALS', '', '', '', totals.gross.toFixed(2), totals.paye.toFixed(2), totals.sscEmp.toFixed(2), totals.sscEr.toFixed(2), '', totals.net.toFixed(2), totals.cost.toFixed(2)]);
                const csv = [headers, ...dataRows].map(r => r.join(',')).join('\n');
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
                a.download = `payroll-${month}.csv`;
                a.click();
              }} className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                <Download size={13} /> Export CSV
              </button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total Gross', value: fmt(totals.gross), color: 'blue' },
          { label: 'PAYE Deducted', value: fmt(totals.paye), color: 'orange' },
          { label: 'SSC (Employee)', value: fmt(totals.sscEmp), color: 'purple' },
          { label: 'SSC (Employer)', value: fmt(totals.sscEr), color: 'indigo' },
          { label: 'Total Net Pay', value: fmt(totals.net), color: 'green' },
          { label: 'Total Employer Cost', value: fmt(totals.cost), color: 'red' },
        ].map(s => (
          <Card key={s.label}>
            <CardBody>
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-base font-bold text-${s.color}-600 mt-0.5`}>{s.value}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Employee Table */}
      {loading ? <LoadingSpinner /> : (
        <Card>
          <CardHeader>
            <h3 className="font-bold text-gray-800">Employee Payroll — {month}</h3>
            <p className="text-xs text-gray-400">{rows.length} employee{rows.length !== 1 ? 's' : ''}</p>
          </CardHeader>
          <CardBody>
            {rows.length === 0 ? (
              <div className="text-center text-gray-400 py-10">
                <Users size={32} className="mx-auto mb-2 opacity-40" />
                <p>No employees with salary data found.</p>
                <p className="text-xs mt-1">Add salary information via the HR portal to generate payroll.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                      <th className="text-left px-3 py-2">Employee</th>
                      <th className="text-left px-3 py-2">Branch</th>
                      <th className="text-right px-3 py-2">Basic Salary</th>
                      <th className="text-right px-3 py-2">Allowances</th>
                      <th className="text-right px-3 py-2">Gross Pay</th>
                      <th className="text-right px-3 py-2">PAYE</th>
                      <th className="text-right px-3 py-2">SSC (Emp)</th>
                      <th className="text-right px-3 py-2">Other Ded.</th>
                      <th className="text-right px-3 py-2 text-green-700">Net Pay</th>
                      <th className="text-right px-3 py-2">Total Cost</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-800">{r.name || r.fullName || r.full_name || '—'}</p>
                          <p className="text-xs text-gray-400">{r.position || r.role || ''}</p>
                        </td>
                        <td className="px-3 py-2 text-gray-600">{branchLabel(r.branch) || r.branch || '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmt(r.gross)}</td>
                        <td className="px-3 py-2 text-right">
                          <input type="number" min="0"
                            value={adjustments[r.id]?.allowances || ''}
                            onChange={e => setAdjustments(prev => ({ ...prev, [r.id]: { ...prev[r.id], allowances: e.target.value } }))}
                            className="w-24 text-right border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
                            placeholder="0" />
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">{fmt(r.totalGross)}</td>
                        <td className="px-3 py-2 text-right font-mono text-orange-600">{fmt(r.monthlyPAYE)}</td>
                        <td className="px-3 py-2 text-right font-mono text-purple-600">{fmt(r.sscEmployee)}</td>
                        <td className="px-3 py-2 text-right">
                          <input type="number" min="0"
                            value={adjustments[r.id]?.deductions || ''}
                            onChange={e => setAdjustments(prev => ({ ...prev, [r.id]: { ...prev[r.id], deductions: e.target.value } }))}
                            className="w-24 text-right border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
                            placeholder="0" />
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-green-700">{fmt(r.net)}</td>
                        <td className="px-3 py-2 text-right font-mono text-red-600">{fmt(r.employerCost)}</td>
                        <td className="px-3 py-2">
                          <button onClick={() => setShowSlip(r)}
                            className="px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 text-gray-600">
                            Slip
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-50 font-bold text-sm border-t-2 border-blue-200">
                      <td className="px-3 py-2" colSpan={2}>TOTALS ({rows.length} employees)</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(totals.gross)}</td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(totals.gross)}</td>
                      <td className="px-3 py-2 text-right font-mono text-orange-700">{fmt(totals.paye)}</td>
                      <td className="px-3 py-2 text-right font-mono text-purple-700">{fmt(totals.sscEmp)}</td>
                      <td className="px-3 py-2"></td>
                      <td className="px-3 py-2 text-right font-mono text-green-700">{fmt(totals.net)}</td>
                      <td className="px-3 py-2 text-right font-mono text-red-700">{fmt(totals.cost)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Namibian PAYE Rate Table */}
            <div className="mt-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h4 className="text-sm font-bold text-gray-700 mb-2">Namibian PAYE Brackets (Annual — Income Tax Act)</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                {[
                  ['N$0 – N$50,000', '0%'],
                  ['N$50,001 – N$100,000', '18%'],
                  ['N$100,001 – N$300,000', '25%'],
                  ['N$300,001 – N$500,000', '28%'],
                  ['N$500,001 – N$800,000', '30%'],
                  ['N$800,001 – N$1,500,000', '32%'],
                  ['Above N$1,500,000', '37%'],
                ].map(([range, rate]) => (
                  <div key={range} className="flex justify-between bg-white rounded px-2 py-1 border border-gray-100">
                    <span className="text-gray-600">{range}</span>
                    <span className="font-bold text-gray-800">{rate}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">SSC: 0.9% employee + 0.9% employer (cap: N$81/month). Submit monthly by last working day.</p>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Pay Slip Modal */}
      {showSlip && (
        <Modal title={`Pay Slip — ${showSlip.name || showSlip.fullName || '—'}`} onClose={() => setShowSlip(null)}>
          <div className="p-4 space-y-3 text-sm">
            <div className="border-b pb-2">
              <p className="font-bold text-lg text-gray-800">{showSlip.name || showSlip.fullName}</p>
              <p className="text-gray-500">{showSlip.position || showSlip.role} · {showSlip.branch || 'Head Office'}</p>
              <p className="text-gray-400 text-xs">Pay Period: {month}</p>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between"><span className="text-gray-600">Basic Salary</span><span className="font-mono">{fmt(showSlip.gross)}</span></div>
              {showSlip.allowances > 0 && <div className="flex justify-between"><span className="text-gray-600">Allowances</span><span className="font-mono text-green-600">+{fmt(showSlip.allowances)}</span></div>}
              <div className="flex justify-between font-semibold border-t pt-1"><span>Gross Pay</span><span className="font-mono">{fmt(showSlip.totalGross)}</span></div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-gray-500 uppercase">Deductions</p>
              <div className="flex justify-between text-orange-600"><span>PAYE (Income Tax)</span><span className="font-mono">-{fmt(showSlip.monthlyPAYE)}</span></div>
              <div className="flex justify-between text-purple-600"><span>SSC (Employee 0.9%)</span><span className="font-mono">-{fmt(showSlip.sscEmployee)}</span></div>
              {showSlip.deductions > 0 && <div className="flex justify-between text-red-600"><span>Other Deductions</span><span className="font-mono">-{fmt(showSlip.deductions)}</span></div>}
            </div>
            <div className="border-t pt-2 flex justify-between font-bold text-base text-green-700">
              <span>NET PAY</span><span className="font-mono">{fmt(showSlip.net)}</span>
            </div>
            <div className="bg-gray-50 rounded p-2 text-xs text-gray-500">
              <div className="flex justify-between"><span>Employer SSC Cost</span><span>{fmt(showSlip.sscEmployer)}</span></div>
              <div className="flex justify-between font-semibold"><span>Total Cost to Employer</span><span>{fmt(showSlip.employerCost)}</span></div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={() => window.print()} className="flex-1">Print Slip</Button>
              <Button variant="secondary" onClick={() => setShowSlip(null)} className="flex-1">Close</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

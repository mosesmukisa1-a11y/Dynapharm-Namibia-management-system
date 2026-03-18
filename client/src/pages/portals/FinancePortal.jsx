import { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import { formatCurrency, formatDateTime } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Table, Modal, Alert } from '../../components/ui';
import { DollarSign, TrendingUp, Landmark, Upload, CheckCircle, FileSpreadsheet, ClipboardList, Download, Eye } from 'lucide-react';

export default function FinancePortal() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'deposits', label: 'Deposit Inbox', icon: '🏦' },
    { id: 'bonus', label: 'Bonus Workflow', icon: '💰' },
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
        {activeTab === 'staff' && <StaffTab />}
      </div>
    </div>
  );
}

function DashboardTab() {
  const [data, setData] = useState({ sales: [], deposits: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.branch.walkinSales().then(d => Array.isArray(d) ? d : d.sales || []).catch(() => []),
      api.branch.deposits().then(d => Array.isArray(d) ? d : d.deposits || []).catch(() => []),
    ]).then(([sales, deposits]) => {
      setData({ sales, deposits });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const totalSales = data.sales.reduce((sum, s) => sum + Number(s.total || s.amount || 0), 0);
  const totalDeposits = data.deposits.reduce((sum, d) => sum + Number(d.amount || 0), 0);

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Sales" value={formatCurrency(totalSales)} color="blue" icon={<TrendingUp size={24} />} />
        <StatCard title="Total Deposits" value={formatCurrency(totalDeposits)} color="green" icon={<Landmark size={24} />} />
        <StatCard title="Pending Deposits" value={data.deposits.filter(d => d.status === 'pending').length} color="orange" icon={<DollarSign size={24} />} />
        <StatCard title="Transactions" value={data.sales.length + data.deposits.length} color="purple" icon={<FileSpreadsheet size={24} />} />
      </div>
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Recent Transactions</h3></CardHeader>
        <Table
          columns={[
            { header: 'Date', render: r => formatDateTime(r.created_at) },
            { header: 'Type', render: r => <Badge variant="info">{r.type || 'Sale'}</Badge> },
            { header: 'Amount', render: r => <span className="font-bold text-green-600">{formatCurrency(r.amount || r.total)}</span> },
            { header: 'Branch', key: 'branch_id' },
          ]}
          data={[...data.sales, ...data.deposits].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20)}
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
            { header: 'Branch', key: 'branch_id' },
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

      <Modal open={!!confirmId} onClose={() => setConfirmId(null)} title="Confirm Verification">
        <div className="p-6">
          <p className="text-sm text-gray-600 mb-4">Are you sure you want to verify this deposit? This action confirms the funds have been received.</p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setConfirmId(null)}>Cancel</Button>
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

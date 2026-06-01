import { useState, useEffect, useCallback } from 'react';
import DistributorPerformanceTab from '../../components/DistributorPerformanceTab';
import StaffServicesTab from '../../components/StaffServicesTab';
import StaffMessagesTab from '../../components/StaffMessagesTab';
import { api } from '../../lib/api';
import { formatCurrency, formatDateTime, formatDate, BRANCHES, BRANCH_DETAILS, BRANCH_ID_TO_NAME } from '../../lib/constants';
import { getLiveProductList, setLivePrices } from '../../lib/pricing';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, Table, Modal, Alert } from '../../components/ui';
import { BarChart3, FileSearch, GitCompare, Activity, Receipt, Package, BookOpen, FileEdit, Search, AlertTriangle, Download, Printer } from 'lucide-react';
import { useStockRealtime } from '../../hooks/useStockRealtime';
import * as XLSX from 'xlsx';

export default function MISPortal() {
  const [activeTab, setActiveTab] = useState('audit');

  useEffect(() => {
    api.prices.list().then(data => {
      if (Array.isArray(data) && data.length > 0) setLivePrices(data);
    }).catch(() => {});
  }, []);

  const tabs = [
    { id: 'audit', label: 'Audit', icon: '🔍' },
    { id: 'reconcile', label: 'Reconcile', icon: '⚖️' },
    { id: 'branchStatus', label: 'Branch Status', icon: '📊' },
    { id: 'encodedSales', label: 'Encoded Sales', icon: '📝' },
    { id: 'receipts', label: 'Receipts', icon: '🧾' },
    { id: 'csiEntry', label: 'CSI Entry', icon: '📋' },
    { id: 'stock', label: 'Stock', icon: '📦' },
    { id: 'catalogs', label: 'Catalogs', icon: '📖' },
    { id: 'drafts', label: 'Drafts', icon: '✏️' },
    { id: 'distributors', label: 'Distributor Performance', icon: '👥' },
    { id: 'staffServices', label: 'Staff Services', icon: '👤' },
    { id: 'messages', label: 'My Messages', icon: '📨' },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 size={24} className="text-primary" /> MIS Portal
        </h1>
        <p className="text-sm text-gray-500">Management Information System - Reports, audits, and data reconciliation</p>
      </div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'audit' && <AuditTab />}
        {activeTab === 'reconcile' && <ReconcileTab />}
        {activeTab === 'branchStatus' && <BranchStatusTab />}
        {activeTab === 'encodedSales' && <EncodedSalesTab />}
        {activeTab === 'receipts' && <ReceiptsTab />}
        {activeTab === 'csiEntry' && <CSIEntryTab />}
        {activeTab === 'stock' && <MISStockTab />}
        {activeTab === 'catalogs' && <CatalogsTab />}
        {activeTab === 'drafts' && <DraftsTab />}
        {activeTab === 'distributors' && <DistributorPerformanceTab title="Distributor Performance — MIS Overview" />}
        {activeTab === 'staffServices' && <StaffServicesTab accentColor="#6d28d9" />}
        {activeTab === 'messages' && <StaffMessagesTab accentColor="#6d28d9" />}
      </div>
    </div>
  );
}

const AUDIT_EVENT_TYPES = [
  'sale_created', 'sale_updated', 'sale_deleted',
  'deposit_created', 'deposit_approved', 'deposit_rejected',
  'expense_created', 'expense_approved', 'expense_rejected',
  'lines_verified', 'stock_updated', 'user_login',
];

function AuditTab() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterBranch, setFilterBranch] = useState('');
  const [filterEvent, setFilterEvent] = useState('');

  const fetchAudit = async () => {
    setLoading(true);
    const params = [];
    if (startDate) params.push(`start=${startDate}`);
    if (endDate)   params.push(`end=${endDate}`);
    if (filterBranch) params.push(`branch=${encodeURIComponent(filterBranch)}`);
    if (filterEvent)  params.push(`event=${encodeURIComponent(filterEvent)}`);
    try {
      const d = await api.mis.audit(params.join('&'));
      setData(Array.isArray(d) ? d : d.logs || []);
      setLoaded(true);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!data.length) return;
    const headers = ['Date', 'Event Type', 'User', 'Details'];
    const rows = data.map(r => {
      const det = r.details;
      const detStr = !det ? '' : typeof det === 'object' ? Object.entries(det).map(([k,v]) => `${k}:${v}`).join('; ') : String(det);
      return [
        formatDateTime(r.createdAt || r.created_at),
        r.eventType || r.action || '',
        r.user || '',
        detStr,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`);
    });
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `audit-trail-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Audit Trail</h3></CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
            <Input label="From" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <Input label="To" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Branch</label>
              <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                <option value="">All Branches</option>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Event Type</label>
              <select value={filterEvent} onChange={e => setFilterEvent(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                <option value="">All Events</option>
                {AUDIT_EVENT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <Button onClick={fetchAudit} disabled={loading}>
              <Search size={14} /> {loading ? 'Loading…' : 'Search'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {loading && <LoadingSpinner />}

      {loaded && !loading && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-bold text-gray-800">{data.length} record{data.length !== 1 ? 's' : ''}</h3>
              {data.length > 0 && (
                <Button size="sm" variant="secondary" onClick={exportCSV}>
                  <Download size={14} /> Export CSV
                </Button>
              )}
            </div>
          </CardHeader>
          <Table
            columns={[
              { header: 'Date', render: r => formatDateTime(r.createdAt || r.created_at) },
              { header: 'Event', render: r => <Badge variant="info">{(r.eventType || r.action || '-').replace(/_/g, ' ')}</Badge> },
              { header: 'User', render: r => r.user || '-' },
              { header: 'Details', render: r => {
                const d = r.details;
                if (!d) return '-';
                if (typeof d === 'object') return Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(' | ') || '-';
                return String(d);
              }},
            ]}
            data={data}
            emptyMessage="No audit records match these filters"
          />
        </Card>
      )}

      {!loaded && !loading && (
        <div className="text-center py-12 text-gray-400 text-sm">
          <FileSearch size={32} className="mx-auto mb-3 opacity-40" />
          <p>Select filters and click Search to load the audit trail</p>
        </div>
      )}
    </div>
  );
}

function ReconcileTab() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');

  const handleReconcile = async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    try {
      const data = await api.mis.reconcile({ start: startDate, end: endDate });
      setResult(data);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!result?.rows?.length) return;
    const headers = ['Branch', 'Product', 'Encoded Qty', 'Encoded Amount', 'Receipt Qty', 'Receipt Amount', 'Difference', 'Status'];
    const rows = result.rows.map(r => [
      r.branch, r.productName, r.encodedQuantity, r.encodedAmount.toFixed(2),
      r.receiptQuantity, r.receiptAmount.toFixed(2), r.difference.toFixed(2), r.status,
    ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`));
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `reconciliation-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const rows = result?.rows || [];
  const fmtBranch = b => BRANCH_ID_TO_NAME[b] || (b ? b.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '-');

  const matched   = rows.filter(r => r.status === 'matched').length;
  const issues    = rows.filter(r => r.status !== 'matched').length;
  const totalDiff = rows.reduce((s, r) => s + Math.abs(Number(r.difference || 0)), 0);

  const displayRows = filterStatus === 'all' ? rows : rows.filter(r => r.status === filterStatus);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Data Reconciliation</h3></CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <Input label="Start Date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <Input label="End Date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            <Button onClick={handleReconcile} disabled={loading || !startDate || !endDate}>
              <GitCompare size={14} /> {loading ? 'Reconciling…' : 'Run Reconciliation'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {result && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Lines', value: rows.length, color: 'text-gray-800', bg: 'bg-gray-50 border border-gray-200' },
              { label: '✓ Matched', value: matched, color: 'text-green-700', bg: 'bg-green-50 border border-green-200' },
              { label: '⚠ With Issues', value: issues, color: 'text-red-700', bg: 'bg-red-50 border border-red-200' },
              { label: 'Total Variance', value: formatCurrency(totalDiff), color: totalDiff > 0 ? 'text-red-700' : 'text-green-700', bg: totalDiff > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={`rounded-lg px-4 py-3 ${bg}`}>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</div>
                <div className={`text-xl font-bold mt-0.5 ${color}`}>{value}</div>
              </div>
            ))}
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex gap-2">
                  {['all', 'matched', 'encoded-higher', 'receipt-higher'].map(s => (
                    <button key={s} onClick={() => setFilterStatus(s)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${filterStatus === s ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-300 hover:border-primary'}`}>
                      {s === 'all' ? 'All' : s === 'matched' ? '✓ Matched' : s === 'encoded-higher' ? '↑ Encoded Higher' : '↓ Receipt Higher'}
                    </button>
                  ))}
                </div>
                {rows.length > 0 && (
                  <Button size="sm" variant="secondary" onClick={exportCSV}>
                    <Download size={14} /> Export CSV
                  </Button>
                )}
              </div>
            </CardHeader>
            <Table
              columns={[
                { header: 'Branch', render: r => <span className="font-semibold">{fmtBranch(r.branch)}</span> },
                { header: 'Product', render: r => r.productName || '-' },
                { header: 'Encoded Qty', render: r => <span className="text-right block">{r.encodedQuantity}</span> },
                { header: 'Encoded Amt', render: r => <span className="text-right block">{formatCurrency(r.encodedAmount)}</span> },
                { header: 'Receipt Qty', render: r => <span className="text-right block">{r.receiptQuantity}</span> },
                { header: 'Receipt Amt', render: r => <span className="text-right block">{formatCurrency(r.receiptAmount)}</span> },
                { header: 'Difference', render: r => {
                  const d = Number(r.difference || 0);
                  return <span className={`text-right block font-bold ${Math.abs(d) < 1 ? 'text-green-600' : 'text-red-600'}`}>{d >= 0 ? '+' : ''}{formatCurrency(d)}</span>;
                }},
                { header: 'Status', render: r => {
                  const v = { matched: 'success', 'encoded-higher': 'warning', 'receipt-higher': 'danger' };
                  const l = { matched: 'Matched', 'encoded-higher': 'Encoded Higher', 'receipt-higher': 'Receipt Higher' };
                  return <Badge variant={v[r.status] || 'info'}>{l[r.status] || r.status}</Badge>;
                }},
              ]}
              data={displayRows}
              emptyMessage="No reconciliation data for this period"
            />
          </Card>
        </>
      )}
    </div>
  );
}

function BranchStatusTab() {
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState('');

  const load = (d) => {
    setLoading(true);
    api.mis.branchStatus(d || '')
      .then(sd => setStatusData(sd))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const pending = statusData?.pending || [];
  const encoded = statusData?.encoded || [];
  const reconciliation = statusData?.reconciliation || [];

  const fmtBranch = b => BRANCH_ID_TO_NAME[b] || (b ? b.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '-');

  const allBranches = [...new Set([
    ...pending.map(r => r.branch),
    ...encoded.map(r => r.branch),
    ...reconciliation.map(r => r.branch),
  ])].sort();

  const pendingMap = Object.fromEntries(pending.map(r => [r.branch, r]));
  const encodedMap = Object.fromEntries(encoded.map(r => [r.branch, r]));
  const reconMap   = Object.fromEntries(reconciliation.map(r => [r.branch, r]));

  const rows = allBranches.map(branch => ({
    branch,
    pending: pendingMap[branch]?.pending ?? 0,
    lastUpload: pendingMap[branch]?.lastUpload || encodedMap[branch]?.lastUpload || null,
    draft: encodedMap[branch]?.draft ?? 0,
    verified: encodedMap[branch]?.verified ?? 0,
    receiptCount: encodedMap[branch]?.receiptCount ?? 0,
    matched: reconMap[branch]?.matched ?? 0,
    unmatched: reconMap[branch]?.unmatched ?? 0,
    discrepancies: reconMap[branch]?.discrepancies || 'No data',
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="font-bold text-gray-800">Branch Status Overview</h3>
            <div className="flex items-center gap-2">
              <Input label="" type="date" value={date}
                onChange={e => { setDate(e.target.value); load(e.target.value); }}
                className="text-sm" />
              {date && (
                <button onClick={() => { setDate(''); load(''); }}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors">✕ Today</button>
              )}
            </div>
          </div>
        </CardHeader>
        {loading ? <LoadingSpinner /> : rows.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No branch activity recorded{date ? ` for ${date}` : ' today'}</div>
        ) : (
          <Table
            columns={[
              { header: 'Branch', render: r => <span className="font-semibold">{fmtBranch(r.branch)}</span> },
              { header: 'Pending Lines', render: r => r.pending > 0
                ? <Badge variant="warning">{r.pending} pending</Badge>
                : <Badge variant="success">Clear</Badge> },
              { header: 'Drafts', render: r => r.draft > 0 ? `${r.draft} total` : '-' },
              { header: 'Verified', render: r => r.verified > 0
                ? <Badge variant="success">{r.verified} verified</Badge>
                : '-' },
              { header: 'Receipts', render: r => r.receiptCount > 0 ? r.receiptCount : '-' },
              { header: 'Reconciliation', render: r => (
                <span className={`text-xs ${r.unmatched > 0 ? 'text-red-600 font-semibold' : 'text-green-600'}`}>
                  {r.unmatched > 0 ? `${r.unmatched} unmatched` : r.discrepancies}
                </span>
              )},
              { header: 'Last Upload', render: r => r.lastUpload ? formatDateTime(r.lastUpload) : '-' },
            ]}
            data={rows}
            emptyMessage="No branch data available"
          />
        )}
      </Card>
    </div>
  );
}

function EncodedSalesTab() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [header, setHeader] = useState({ date: new Date().toISOString().slice(0,10), branch: '', receipt_number: '' });
  const emptyRow = () => ({ product: '', quantity: '1', price: '' });
  const [rows, setRows] = useState([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const loadSales = () => {
    api.mis.encodedSales()
      .then(d => setSales(Array.isArray(d) ? d : d.rows || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadSales(); }, []);

  const updateRow = (i, field, value) => setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r));
  const addRow = () => setRows(prev => [...prev, emptyRow()]);
  const removeRow = (i) => setRows(prev => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!header.date || !header.branch) { setMessage('Error: Date and Branch are required.'); return; }
    const validRows = rows.filter(r => r.product && Number(r.quantity) > 0 && Number(r.price) >= 0);
    if (!validRows.length) { setMessage('Error: Add at least one product line.'); return; }
    setSubmitting(true);
    try {
      await Promise.all(validRows.map(r => api.mis.createEncodedSale({
        date: header.date,
        branch: header.branch,
        receipt_number: header.receipt_number,
        product: r.product,
        quantity: Number(r.quantity),
        price: Number(r.price),
      })));
      setMessage(`${validRows.length} line${validRows.length > 1 ? 's' : ''} encoded successfully!`);
      setRows([emptyRow()]);
      setShowForm(false);
      loadSales();
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const products = getLiveProductList();
  const grandTotal = rows.reduce((s, r) => s + Number(r.quantity || 0) * Number(r.price || 0), 0);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'}>{message}</Alert>}

      <div className="flex justify-between items-center">
        <h3 className="font-bold text-gray-800">Encoded Sales</h3>
        <Button size="sm" onClick={() => { setShowForm(!showForm); setMessage(''); }}>
          {showForm ? 'Cancel' : '+ Encode Sale'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><h4 className="font-semibold text-gray-700">New Encoded Sale — Multi-line Entry</h4></CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input label="Date *" type="date" value={header.date} onChange={e => setHeader({ ...header, date: e.target.value })} />
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">Branch *</label>
                  <select value={header.branch} onChange={e => setHeader({ ...header, branch: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                    <option value="">Select Branch</option>
                    {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <Input label="Receipt #" value={header.receipt_number} onChange={e => setHeader({ ...header, receipt_number: e.target.value })} placeholder="RCP-..." />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">#</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Product *</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase w-24">Qty *</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase w-32">Price *</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase w-28">Line Total</th>
                      <th className="px-2 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="px-3 py-2 text-gray-400 text-xs">{i + 1}</td>
                        <td className="px-3 py-2">
                          <select value={row.product} onChange={e => {
                            const prod = products.find(p => p.description === e.target.value);
                            updateRow(i, 'product', e.target.value);
                            if (prod) updateRow(i, 'price', String(prod.cp));
                          }} className="w-full px-2 py-1.5 rounded border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                            <option value="">Select Product</option>
                            {products.map(p => <option key={p.description} value={p.description}>{p.description}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min="1" value={row.quantity} onChange={e => updateRow(i, 'quantity', e.target.value)}
                            className="w-full px-2 py-1.5 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min="0" step="0.01" value={row.price} onChange={e => updateRow(i, 'price', e.target.value)}
                            className="w-full px-2 py-1.5 rounded border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                        </td>
                        <td className="px-3 py-2 font-semibold text-gray-700">
                          {formatCurrency(Number(row.quantity || 0) * Number(row.price || 0))}
                        </td>
                        <td className="px-2 py-2">
                          <button type="button" onClick={() => removeRow(i)}
                            className="text-red-400 hover:text-red-600 transition-colors text-lg leading-none">×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                      <td colSpan={4} className="px-3 py-2 text-sm font-semibold text-gray-600 text-right">Grand Total ({rows.length} line{rows.length > 1 ? 's' : ''})</td>
                      <td className="px-3 py-2 font-bold text-primary">{formatCurrency(grandTotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex items-center justify-between">
                <button type="button" onClick={addRow}
                  className="text-sm text-primary font-semibold hover:underline flex items-center gap-1">
                  + Add Product Line
                </button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Saving…' : `Save ${rows.filter(r => r.product).length || ''} Line${rows.filter(r => r.product).length !== 1 ? 's' : ''}`}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      <Card>
        <Table
          columns={[
            { header: 'Branch', render: r => r.branch || '-' },
            { header: 'Product', render: r => r.productName || r.product_name || '-' },
            { header: 'Distributor', render: r => r.distributorName || '-' },
            { header: 'Qty', render: r => r.quantity || '-' },
            { header: 'Unit Price', render: r => formatCurrency(r.unitPrice || r.unit_price || r.amount) },
            { header: 'Total', render: r => formatCurrency(r.amount || (r.quantity * (r.unitPrice || 0))) },
            { header: 'Status', render: r => <Badge variant={r.status === 'verified' ? 'success' : 'warning'}>{r.status || 'draft'}</Badge> },
          ]}
          data={sales}
          emptyMessage="No encoded sales"
        />
      </Card>
    </div>
  );
}

function ReceiptsTab() {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchBranch, setSearchBranch] = useState('');

  const handleSearch = async () => {
    setLoading(true);
    setSearched(true);
    try {
      const params = [];
      if (search) params.push(`q=${encodeURIComponent(search)}`);
      if (startDate) params.push(`start=${startDate}`);
      if (endDate)   params.push(`end=${endDate}`);
      if (searchBranch) params.push(`branch=${encodeURIComponent(searchBranch)}`);
      const data = await api.mis.receipts(params.length ? params.join('&') : '');
      setReceipts(Array.isArray(data) ? data : data.receipts || []);
    } catch {
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!receipts.length) return;
    const headers = ['Receipt #', 'Date', 'Branch', 'Customer', 'Phone', 'Type', 'Payment', 'Amount'];
    const rows = receipts.map(r => [
      r.receiptNumber || r.saleNumber || r.id || '',
      r.saleDate || r.date || '',
      r.branchId || r.branch || '',
      r.customerName || '',
      r.customerPhone || '',
      r.customerType || '',
      r.paymentMethod || '',
      Number(r.total || r.totalAmount || 0).toFixed(2),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`));
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `receipts-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const totalAmt = receipts.reduce((s, r) => s + Number(r.total || r.totalAmount || 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Receipt Search</h3></CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
            <Input label="Receipt # / Customer" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" />
            <Input label="From Date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <Input label="To Date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Branch</label>
              <select value={searchBranch} onChange={e => setSearchBranch(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                <option value="">All Branches</option>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <Button onClick={handleSearch} disabled={loading}>
              <Search size={14} /> {loading ? 'Searching…' : 'Search'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {searched && !loading && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="font-bold text-gray-800">{receipts.length} receipt{receipts.length !== 1 ? 's' : ''}</span>
                {receipts.length > 0 && <span className="text-sm text-gray-500 ml-2">· Total: <strong>{formatCurrency(totalAmt)}</strong></span>}
              </div>
              {receipts.length > 0 && (
                <Button size="sm" variant="secondary" onClick={exportCSV}>
                  <Download size={14} /> Export CSV
                </Button>
              )}
            </div>
          </CardHeader>
          <Table
            columns={[
              { header: 'Receipt #', render: r => <span className="font-mono text-xs text-blue-700">{r.receiptNumber || r.saleNumber || r.id || '-'}</span> },
              { header: 'Date', render: r => formatDateTime(r.createdAt || r.saleDate || r.timestamp) },
              { header: 'Branch', render: r => r.branchId || r.branch || '-' },
              { header: 'Customer', render: r => r.customerName || r.clientName || '-' },
              { header: 'Type', render: r => r.customerType ? <Badge variant="info">{r.customerType}</Badge> : '-' },
              { header: 'Amount', render: r => <span className="font-bold">{formatCurrency(r.total || r.totalAmount)}</span> },
              { header: 'Payment', render: r => <Badge variant="default">{r.paymentMethod || r.payment_method || '-'}</Badge> },
            ]}
            data={receipts}
            emptyMessage="No receipts found for these filters"
          />
        </Card>
      )}
    </div>
  );
}

// ─── Stock Report PDF helpers ──────────────────────────────────────────────────
function printStockReportDoc(branchData, title, period) {
  const win = window.open('', '_blank');
  if (!win) return;
  const fmtQty = (n) => Number(n || 0).toLocaleString();
  const fmtCur = (n) => `N$ ${Number(n || 0).toFixed(2)}`;
  const fmtBranch = (b) => BRANCH_ID_TO_NAME[b] || (b ? b.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'All Branches');

  const branchCards = (Array.isArray(branchData) ? branchData : [branchData]).map(br => {
    const f = br.formula || {};
    const productRows = (br.products || []).map(p =>
      `<tr><td>${p.product_name}</td><td>${fmtQty(p.received)}</td><td>${fmtQty(p.returns)}</td><td style="color:#c41e3a">${fmtQty(p.sales)}</td><td>${fmtQty(p.write_offs)}</td><td style="font-weight:800;color:#166534">${fmtQty(p.closing_qty)}</td></tr>`
    ).join('');

    return `
    <div class="branch-block">
      <div class="branch-title">📍 ${fmtBranch(br.branch)}</div>
      <div class="formula-grid">
        <div class="fbox opening"><div class="flabel">Opening Stock</div><div class="fval">${fmtQty(f.opening)}</div></div>
        <div class="fbox plus"><div class="flabel">+ Issued / Received</div><div class="fval green">${fmtQty(f.issued)}</div></div>
        <div class="fbox minus"><div class="flabel">− Sales (units sold)</div><div class="fval red">${fmtQty(f.sales)}</div></div>
        <div class="fbox minus"><div class="flabel">− Returns</div><div class="fval amber">${fmtQty(f.returns)}</div></div>
        <div class="fbox minus"><div class="flabel">− Expiring / Expired</div><div class="fval red">${fmtQty(f.expiring)}</div></div>
        <div class="fbox minus"><div class="flabel">− Promotions / Campaign</div><div class="fval red">${fmtQty(f.promotions)}</div></div>
        <div class="fbox closing"><div class="flabel">= Closing Stock</div><div class="fval closing-val">${fmtQty(f.closing)}</div></div>
      </div>
      <div style="margin-top:8px;font-size:10px;color:#64748b">Stock Value: <strong style="color:#c41e3a">${fmtCur(f.closing_value)}</strong> &nbsp;|&nbsp; Sales (units): <strong>${fmtQty(f.sales)}</strong></div>
      ${br.products && br.products.length > 0 ? `
      <table style="margin-top:12px">
        <thead><tr><th>Product</th><th>Received</th><th>Returns</th><th>Sales</th><th>Write-offs</th><th>Closing Qty</th></tr></thead>
        <tbody>${productRows}</tbody>
      </table>` : ''}
    </div>`;
  }).join('');

  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; padding: 24px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #c41e3a; padding-bottom:10px; margin-bottom:18px; }
    .company { color:#c41e3a; font-weight:900; font-size:15px; }
    .report-title { font-size:14px; font-weight:800; color:#8b0000; margin-top:4px; }
    .meta { text-align:right; color:#64748b; font-size:10px; line-height:1.6; }
    .branch-block { border:1.5px solid #f0e8ea; border-radius:10px; padding:14px 16px; margin-bottom:18px; background:#fff; page-break-inside:avoid; }
    .branch-title { font-size:13px; font-weight:800; color:#c41e3a; margin-bottom:12px; border-bottom:1px solid #fecaca; padding-bottom:6px; }
    .formula-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
    .fbox { padding:9px 12px; border-radius:8px; background:#f9f5f5; border:1px solid #f0e8ea; }
    .fbox.opening { border-color:#c8d8e8; background:#f4f7fb; }
    .fbox.closing { border-color:#bbf7d0; background:#f0fdf4; grid-column:span 3; }
    .flabel { font-size:9px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:.06em; margin-bottom:4px; }
    .fval { font-size:15px; font-weight:900; color:#1e293b; }
    .fval.green { color:#166534; }
    .fval.amber { color:#92400e; }
    .fval.red { color:#c41e3a; }
    .fval.closing-val { color:#15803d; font-size:18px; }
    table { width:100%; border-collapse:collapse; margin-top:4px; }
    th { background:#c41e3a; color:#fff; padding:6px 8px; text-align:left; font-size:9.5px; font-weight:700; }
    td { padding:5px 8px; border-bottom:1px solid #f1f5f9; font-size:9.5px; }
    tr:nth-child(even) td { background:#fdf7f8; }
    .summary-box { background:linear-gradient(135deg,#c41e3a,#8b0000); color:#fff; border-radius:10px; padding:16px 20px; margin-bottom:18px; display:grid; grid-template-columns:repeat(4,1fr); gap:12px; text-align:center; }
    .sval { font-size:18px; font-weight:900; margin-top:4px; }
    .slabel { font-size:9px; font-weight:700; text-transform:uppercase; opacity:.7; }
    .print-btn { position:fixed; top:12px; right:12px; background:#c41e3a; color:#fff; border:none; padding:8px 18px; border-radius:8px; font-weight:700; cursor:pointer; }
    @media print { .print-btn { display:none; } body { padding:10px; } }
  </style></head><body>
  <button class="print-btn" onclick="window.print()">🖨️ Print</button>
  <div class="header">
    <div>
      <div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div>
      <div class="report-title">📊 ${title}</div>
      <div style="color:#64748b;font-size:10px;margin-top:3px">Period: ${period || 'Current Month'}</div>
    </div>
    <div class="meta">Date: ${new Date().toLocaleDateString('en-NA',{day:'2-digit',month:'long',year:'numeric'})}<br>Time: ${new Date().toLocaleTimeString('en-NA',{hour:'2-digit',minute:'2-digit'})}<br>Generated by: MIS Portal</div>
  </div>
  ${branchCards}
  </body></html>`);
  win.document.close();
}

function printCompanySummaryDoc(summary, branches, period) {
  const win = window.open('', '_blank');
  if (!win) return;
  const fmtQty = (n) => Number(n || 0).toLocaleString();
  const fmtCur = (n) => `N$ ${Number(n || 0).toFixed(2)}`;
  const fmtBranch = (b) => BRANCH_ID_TO_NAME[b] || (b ? b.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '-');
  const branchRows = (branches || []).map(br =>
    `<tr><td style="font-weight:700">${fmtBranch(br.branch)}</td><td>${fmtQty(br.formula.opening)}</td><td style="color:#166534;font-weight:700">${fmtQty(br.formula.issued)}</td><td style="color:#92400e">${fmtQty(br.formula.returns)}</td><td style="color:#c41e3a">${fmtQty(br.formula.expiring)}</td><td style="color:#c41e3a">${fmtQty(br.formula.sales)}</td><td style="font-weight:800;color:#15803d">${fmtQty(br.formula.closing)}</td><td>${fmtCur(br.formula.closing_value)}</td></tr>`
  ).join('');

  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Company Stock Summary</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; padding: 24px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #c41e3a; padding-bottom:10px; margin-bottom:18px; }
    .company { color:#c41e3a; font-weight:900; font-size:15px; }
    .report-title { font-size:14px; font-weight:800; color:#8b0000; margin-top:4px; }
    .meta { text-align:right; color:#64748b; font-size:10px; line-height:1.6; }
    .kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:18px; }
    .kpi { background:#fff; border:1.5px solid #f0e8ea; border-radius:8px; padding:12px 14px; text-align:center; }
    .kpi-val { font-size:20px; font-weight:900; color:#c41e3a; margin-top:4px; }
    .kpi-label { font-size:9px; font-weight:700; color:#64748b; text-transform:uppercase; }
    .formula-banner { background:linear-gradient(135deg,#c41e3a,#8b0000); color:#fff; border-radius:10px; padding:14px 18px; margin-bottom:16px; display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
    .fb-item { text-align:center; }
    .fb-val { font-size:15px; font-weight:900; }
    .fb-label { font-size:9px; opacity:.7; font-weight:700; text-transform:uppercase; }
    table { width:100%; border-collapse:collapse; }
    th { background:#c41e3a; color:#fff; padding:7px 8px; text-align:left; font-size:10px; font-weight:700; }
    td { padding:6px 8px; border-bottom:1px solid #f1f5f9; font-size:10px; }
    tr:nth-child(even) td { background:#fdf7f8; }
    .total-row td { font-weight:800; background:#fff0f3 !important; border-top:2px solid #fecaca; }
    .print-btn { position:fixed; top:12px; right:12px; background:#c41e3a; color:#fff; border:none; padding:8px 18px; border-radius:8px; font-weight:700; cursor:pointer; }
    @media print { .print-btn { display:none; } body { padding:10px; } }
  </style></head><body>
  <button class="print-btn" onclick="window.print()">🖨️ Print</button>
  <div class="header">
    <div>
      <div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div>
      <div class="report-title">🏢 Company-Wide Stock Summary Report</div>
      <div style="color:#64748b;font-size:10px;margin-top:3px">Period: ${period || 'Current Month'} &nbsp;·&nbsp; ${(branches||[]).length} Branch(es)</div>
    </div>
    <div class="meta">Date: ${new Date().toLocaleDateString('en-NA',{day:'2-digit',month:'long',year:'numeric'})}<br>Time: ${new Date().toLocaleTimeString('en-NA',{hour:'2-digit',minute:'2-digit'})}<br>Generated by: MIS Portal</div>
  </div>
  <div class="formula-banner">
    <div class="fb-item"><div class="fb-val">${fmtQty(summary.opening)}</div><div class="fb-label">Opening</div></div>
    <div style="font-size:20px;font-weight:900">+</div>
    <div class="fb-item"><div class="fb-val">${fmtQty(summary.issued)}</div><div class="fb-label">Issued/Received</div></div>
    <div style="font-size:20px;font-weight:900">−</div>
    <div class="fb-item"><div class="fb-val">${fmtQty(summary.sales)}</div><div class="fb-label">Sales</div></div>
    <div style="font-size:20px;font-weight:900">−</div>
    <div class="fb-item"><div class="fb-val">${fmtQty(summary.returns)}</div><div class="fb-label">Returns</div></div>
    <div style="font-size:20px;font-weight:900">−</div>
    <div class="fb-item"><div class="fb-val">${fmtQty(summary.expiring)}</div><div class="fb-label">Expiring</div></div>
    <div style="font-size:20px;font-weight:900">−</div>
    <div class="fb-item"><div class="fb-val">${fmtQty(summary.promotions)}</div><div class="fb-label">Promotions</div></div>
    <div style="font-size:20px;font-weight:900">=</div>
    <div class="fb-item"><div class="fb-val" style="font-size:20px">${fmtQty(summary.closing)}</div><div class="fb-label">Closing Stock</div></div>
  </div>
  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-label">Total Closing Stock</div><div class="kpi-val">${fmtQty(summary.closing)}</div></div>
    <div class="kpi"><div class="kpi-label">Total Stock Value</div><div class="kpi-val">${fmtCur(summary.closing_value)}</div></div>
    <div class="kpi"><div class="kpi-label">Total Sales (units)</div><div class="kpi-val">${fmtQty(summary.sales)}</div></div>
    <div class="kpi"><div class="kpi-label">Branches Reporting</div><div class="kpi-val">${summary.branch_count || (branches||[]).length}</div></div>
  </div>
  <table>
    <thead><tr><th>Branch</th><th>Opening</th><th>Issued/Received</th><th>Returns</th><th>Expiring</th><th>Sales</th><th>Closing Qty</th><th>Closing Value</th></tr></thead>
    <tbody>${branchRows}</tbody>
    <tfoot><tr class="total-row">
      <td><strong>COMPANY TOTAL</strong></td>
      <td><strong>${fmtQty(summary.opening)}</strong></td>
      <td><strong style="color:#166534">${fmtQty(summary.issued)}</strong></td>
      <td><strong style="color:#92400e">${fmtQty(summary.returns)}</strong></td>
      <td><strong style="color:#c41e3a">${fmtQty(summary.expiring)}</strong></td>
      <td><strong style="color:#c41e3a">${fmtQty(summary.sales)}</strong></td>
      <td><strong style="color:#15803d">${fmtQty(summary.closing)}</strong></td>
      <td><strong>${fmtCur(summary.closing_value)}</strong></td>
    </tr></tfoot>
  </table>
  </body></html>`);
  win.document.close();
}

function printMISSalesBreakdown(products, branchLabel, dateFrom, dateTo) {
  const win = window.open('', '_blank');
  if (!win) return;
  const fmtD = d => d ? new Date(d).toLocaleDateString('en-NA', { day:'2-digit', month:'long', year:'numeric' }) : '-';
  const fmtN = n => n > 0 ? Number(n).toLocaleString() : '';
  const fmtV = v => v > 0 ? `N$ ${Number(v).toLocaleString('en-NA', { minimumFractionDigits:2, maximumFractionDigits:2 })}` : '-';
  const grandWalkin = products.reduce((s, p) => s + (p.walkin       || 0), 0);
  const grandRx     = products.reduce((s, p) => s + (p.prescription || 0), 0);
  const grandCamp   = products.reduce((s, p) => s + (p.campaigns    || 0), 0);
  const grandTotal  = products.reduce((s, p) => s + (p.total        || 0), 0);
  const grandVal    = products.reduce((s, p) => s + (p.dp_value     || 0), 0);
  const grandRefunded = products.reduce((s, p) => s + (p.refunded || 0), 0);
  const grandNet      = products.reduce((s, p) => s + (p.net ?? (p.total || 0)), 0);
  const grandRefundDp = products.reduce((s, p) => s + (p.refund_dp || 0), 0);
  const hasRefunds    = grandRefunded > 0;
  const colspan       = hasRefunds ? 9 : 7;
  const rows = products.map((p, i) => `<tr>
    <td style="color:#777;font-size:10px">${String(i+1).padStart(2,'0')}</td>
    <td style="font-weight:700">${p.product_name || '-'}</td>
    <td style="text-align:center;font-weight:700">${fmtN(p.walkin)}</td>
    <td style="text-align:center">${fmtN(p.prescription)}</td>
    <td style="text-align:center">${fmtN(p.campaigns)}</td>
    <td style="text-align:center;font-weight:900">${Number(p.total || 0).toLocaleString()}</td>
    ${hasRefunds ? `<td style="text-align:center;color:#c41e3a;font-weight:700">${(p.refunded||0)>0?'−'+Number(p.refunded).toLocaleString():''}</td>
    <td style="text-align:center;font-weight:900;color:#166534">${Number(p.net??(p.total||0)).toLocaleString()}</td>` : ''}
    <td style="text-align:right;font-weight:700">${fmtV(p.dp_value)}</td>
  </tr>`).join('');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Sales Breakdown — ${branchLabel}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Segoe UI',Arial,sans-serif; font-size:11px; color:#1e293b; background:#fff; padding:20px; }
    .header { display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #8b0000; padding-bottom:12px; margin-bottom:16px; }
    .header-left h1 { font-size:1.2rem; font-weight:900; color:#8b0000; }
    .header-left p { font-size:0.78rem; color:#64748b; margin-top:2px; }
    .header-right { text-align:right; font-size:0.78rem; color:#64748b; }
    table { width:100%; border-collapse:collapse; margin-top:12px; }
    thead th { background:#8b0000; color:#fff; padding:7px 8px; text-align:left; font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:.05em; }
    thead th.refund { background:#7f1d1d; }
    tbody tr:nth-child(even) { background:#fdf4f5; }
    tbody td { padding:6px 8px; border-bottom:1px solid #f1f5f9; font-size:11px; }
    tfoot td { background:#8b0000; color:#fff; font-weight:800; padding:7px 8px; font-size:11px; }
    .info { display:flex; gap:40px; margin-bottom:8px; }
    .info-block .lbl { font-size:9px; font-weight:800; color:#8b0000; text-transform:uppercase; letter-spacing:.05em; border-bottom:1px solid #ddd; padding-bottom:3px; margin-bottom:5px; }
    .info-block div { font-size:10px; line-height:1.8; }
    @media print { @page { size:A4 landscape; margin:10mm; } }
  </style></head><body>
  <div class="header">
    <div class="header-left">
      <h1>DYNAPHARM INTERNATIONAL NAMIBIA</h1>
      <p>Branch Sales Breakdown — ${branchLabel.toUpperCase()}</p>
    </div>
    <div class="header-right">
      <strong>MIS REPORT</strong><br>
      ${fmtD(dateFrom)} to ${fmtD(dateTo)}<br>
      Printed: ${new Date().toLocaleString('en-NA')}
    </div>
  </div>
  <div class="info">
    <div class="info-block"><div class="lbl">Period</div><div>From: ${fmtD(dateFrom)}<br>To: ${fmtD(dateTo)}</div></div>
    <div class="info-block"><div class="lbl">Branch</div><div>${branchLabel}</div></div>
    <div class="info-block"><div class="lbl">Summary</div><div>${products.length} products · ${grandTotal.toLocaleString()} sold${hasRefunds?` · ${grandRefunded.toLocaleString()} refunded · ${grandNet.toLocaleString()} net`:''}</div></div>
  </div>
  <table>
    <thead><tr>
      <th style="width:30px">#</th>
      <th>Description</th>
      <th style="text-align:center;width:75px">Walk-in</th>
      <th style="text-align:center;width:75px">Prescription</th>
      <th style="text-align:center;width:65px">Campaigns</th>
      <th style="text-align:center;width:55px">Total</th>
      ${hasRefunds ? `<th class="refund" style="text-align:center;width:65px">Refunded</th><th class="refund" style="text-align:center;width:60px">Net Sold</th>` : ''}
      <th style="text-align:right;width:110px">DP Value</th>
    </tr></thead>
    <tbody>${rows || `<tr><td colspan="${colspan}" style="text-align:center;padding:20px;color:#aaa">No sales for this period</td></tr>`}</tbody>
    <tfoot><tr>
      <td colspan="2">TOTALS — ${products.length} product${products.length !== 1 ? 's' : ''}</td>
      <td style="text-align:center">${grandWalkin > 0 ? grandWalkin.toLocaleString() : ''}</td>
      <td style="text-align:center">${grandRx     > 0 ? grandRx.toLocaleString()     : ''}</td>
      <td style="text-align:center">${grandCamp   > 0 ? grandCamp.toLocaleString()   : ''}</td>
      <td style="text-align:center">${grandTotal.toLocaleString()}</td>
      ${hasRefunds ? `<td style="text-align:center">−${grandRefunded.toLocaleString()}</td><td style="text-align:center">${grandNet.toLocaleString()}</td>` : ''}
      <td style="text-align:right">${fmtV(grandVal)}${hasRefunds&&grandRefundDp>0?`<br><small style="font-weight:400;opacity:.85">−${fmtV(grandRefundDp)} refunded</small><br><strong style="font-size:11.5px">Net: ${fmtV(Math.max(0,grandVal-grandRefundDp))}</strong>`:''}</td>
    </tr></tfoot>
  </table>
  </body></html>`);
  win.document.close();
  setTimeout(() => { win.focus(); win.print(); }, 400);
}

const branchName = (id) => BRANCH_ID_TO_NAME[id] || (id ? id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '-');

function MISStockTab() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);

  const [reportData, setReportData] = useState(null);
  const [salesData, setSalesData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('summary');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [productSearch, setProductSearch] = useState('');
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(todayStr);

  const loadData = useCallback(() => {
    setLoading(true);
    const stockParams = `start=${startDate}&end=${endDate}`;
    const salesParams = { date_from: startDate, date_to: endDate, branch_id: selectedBranch };
    Promise.all([
      api.mis.stockReport(stockParams).catch(() => null),
      api.reports.branchProductRange(salesParams).catch(() => null),
    ]).then(([report, sales]) => {
      setReportData(report);
      setSalesData(sales);
    }).finally(() => setLoading(false));
  }, [startDate, endDate, selectedBranch]);

  const { connected: wsConnected } = useStockRealtime({ onUpdate: loadData });

  useEffect(() => { loadData(); }, []);

  const branches = reportData?.branches || [];
  const summary = reportData?.summary || {};
  const period = startDate && endDate
    ? `${startDate} → ${endDate}`
    : reportData?.period
      ? `${new Date(reportData.period.start).toLocaleDateString('en-NA', { month: 'long', year: 'numeric' })}`
      : 'Current Month';

  const displayBranches = selectedBranch === 'all' ? branches : branches.filter(b => b.branch === selectedBranch);

  const allSalesProducts = (salesData?.products || []);
  const filteredProducts = allSalesProducts.filter(p =>
    !productSearch || (p.product_name || '').toLowerCase().includes(productSearch.toLowerCase())
  );

  const exportProductCSV = () => {
    if (!filteredProducts.length) return;
    const branchLabel = selectedBranch === 'all' ? 'All Branches' : branchName(selectedBranch);
    const headers = ['Branch', 'Product', 'Walk-in Sales', 'By Prescription', 'Campaigns', 'Total Sold', 'Refunded', 'Net Sold', 'DP Value (N$)', 'Refund Deduction (N$)'];
    const rows = filteredProducts.map(r => [
      branchLabel, r.product_name || '',
      r.walkin || 0, r.prescription || 0, r.campaigns || 0,
      r.total || 0, r.refunded || 0, r.net || (r.total || 0),
      Number(r.dp_value || 0).toFixed(2), Number(r.refund_dp || 0).toFixed(2),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`));
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `sales-breakdown-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const statCard = (label, value, color, bg) => (
    <div style={{ background: bg || '#fff', border: '1.5px solid #f0e8ea', borderRadius: 12, padding: '14px 16px', textAlign: 'center', minWidth: 110 }}>
      <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 900, color: color || '#1e293b', marginTop: 4 }}>{Number(value || 0).toLocaleString()}</div>
    </div>
  );

  const formulaRow = (label, value, color) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ fontSize: '0.88rem', color: '#374151', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: '1rem', fontWeight: 800, color: color || '#1e293b' }}>{Number(value || 0).toLocaleString()}</span>
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', borderRadius: 14, padding: '16px 20px', marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.12em', margin: 0 }}>MIS · Stock Intelligence</p>
          <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800, margin: '3px 0 0' }}>📊 Stock Dashboard — All {BRANCH_DETAILS.length} Branches</h3>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.78rem', margin: '3px 0 0' }}>
            {period}
            {wsConnected && <span style={{ marginLeft: 8, background: 'rgba(255,255,255,0.2)', borderRadius: 99, padding: '1px 8px', fontSize: '0.7rem', fontWeight: 700 }}>● LIVE</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '6px 10px' }}>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              style={{ border: 'none', background: 'transparent', color: '#fff', fontSize: '0.78rem', outline: 'none', fontWeight: 600 }} />
            <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>→</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              style={{ border: 'none', background: 'transparent', color: '#fff', fontSize: '0.78rem', outline: 'none', fontWeight: 600 }} />
            <button onClick={loadData} disabled={loading} style={{ background: '#fff', border: 'none', color: '#c41e3a', padding: '4px 10px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer' }}>
              {loading ? '…' : 'Go'}
            </button>
          </div>
          <button onClick={() => printCompanySummaryDoc(summary, branches, period)} style={{ background: '#fff', border: 'none', color: '#c41e3a', padding: '7px 14px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer' }}>🖨️ Company PDF</button>
        </div>
      </div>

      {loading && <LoadingSpinner />}

      {!loading && (
        <>
          {/* Company KPI summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, marginBottom: 18 }}>
            {statCard('Opening Stock', summary.opening, '#1e3a5f', '#f4f7fb')}
            {statCard('+ Issued', summary.issued, '#166534', '#f0fdf4')}
            {statCard('− Sales', summary.sales, '#c41e3a', '#fff0f3')}
            {statCard('− Returns', summary.returns, '#92400e', '#fffbeb')}
            {statCard('− Expired', summary.expiring, '#c41e3a', '#fef2f2')}
            {statCard('= Closing', summary.closing, '#15803d', '#f0fdf4')}
            {statCard('Branches', BRANCH_DETAILS.length, '#1e3a5f', '#f4f7fb')}
            <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', border: 'none', borderRadius: 12, padding: '14px 16px', textAlign: 'center', minWidth: 110 }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Stock Value</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff', marginTop: 4 }}>N$ {Number(summary.closing_value || 0).toFixed(0)}</div>
            </div>
          </div>

          {/* View tabs + branch/filter controls */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { id: 'summary', label: '📋 Per-Branch Formula' },
              { id: 'products', label: '📦 Product Breakdown' },
            ].map(t => (
              <button key={t.id} onClick={() => setActiveView(t.id)} style={{ padding: '7px 18px', borderRadius: 20, fontSize: '0.83rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: activeView === t.id ? '#c41e3a' : '#f1f5f9', color: activeView === t.id ? '#fff' : '#64748b' }}>{t.label}</button>
            ))}
            <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} style={{ marginLeft: 'auto', padding: '7px 12px', border: '1.5px solid #e8d5d8', borderRadius: 20, fontSize: '0.83rem', outline: 'none', color: '#374151', fontWeight: 600 }}>
              <option value="all">All Branches ({BRANCH_DETAILS.length})</option>
              {BRANCH_DETAILS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          {/* Per-branch formula view */}
          {activeView === 'summary' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 14 }}>
              {displayBranches.map(br => {
                const f = br.formula || {};
                const hasData = !br.no_data;
                const name = branchName(br.branch);
                const bd = BRANCH_DETAILS.find(b => b.id === br.branch);
                return (
                  <div key={br.branch} style={{ background: '#fff', border: hasData ? '1.5px solid #f0e8ea' : '1.5px dashed #e2e8f0', borderRadius: 14, overflow: 'hidden', boxShadow: hasData ? '0 2px 8px rgba(196,30,58,0.06)' : 'none', opacity: hasData ? 1 : 0.65 }}>
                    <div style={{ background: hasData ? 'linear-gradient(135deg,#c41e3a,#8b0000)' : '#94a3b8', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem' }}>📍 {name}</div>
                        {bd?.region && <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.72rem', marginTop: 2 }}>{bd.region}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.72rem' }}>{br.product_count} products</span>
                        {hasData && (
                          <button onClick={() => printStockReportDoc(br, `Stock Report — ${name}`, period)} style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', padding: '4px 10px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>🖨️ Print</button>
                        )}
                      </div>
                    </div>
                    {!hasData ? (
                      <div style={{ padding: '18px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
                        No stock activity for this period
                      </div>
                    ) : (
                      <div>
                        {formulaRow('Opening Stock', f.opening, '#1e3a5f')}
                        {formulaRow('+ Issued / Received', f.issued, '#166534')}
                        {formulaRow('− Sales (units sold)', f.sales, '#c41e3a')}
                        {formulaRow('− Returns', f.returns, '#92400e')}
                        {formulaRow('− Expiring / Expired', f.expiring, '#c41e3a')}
                        {f.promotions > 0 && formulaRow('− Promotions', f.promotions, '#c41e3a')}
                        {f.write_offs > 0 && formulaRow('− Write-offs', f.write_offs, '#7c3aed')}
                        {f.transfers_in > 0 && formulaRow('+ Transfers In', f.transfers_in, '#166534')}
                        {f.transfers_out > 0 && formulaRow('− Transfers Out', f.transfers_out, '#c41e3a')}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', borderTop: '2px solid #86efac' }}>
                          <span style={{ fontSize: '0.9rem', color: '#166534', fontWeight: 800 }}>= Closing Stock</span>
                          <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#15803d' }}>{Number(f.closing || 0).toLocaleString()}</span>
                        </div>
                        <div style={{ padding: '8px 16px', background: '#fafafa', display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#64748b' }}>
                          <span>Sales: <strong style={{ color: '#c41e3a' }}>{Number(f.sales || 0).toLocaleString()} units</strong></span>
                          <span>Value: <strong style={{ color: '#1e3a5f' }}>N$ {Number(f.closing_value || 0).toFixed(2)}</strong></span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Product breakdown view — source: branch_inventory_movements via product-range API */}
          {activeView === 'products' && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="font-bold text-gray-800">
                      Sales Breakdown — {selectedBranch === 'all' ? 'All Branches' : branchName(selectedBranch)}
                      <span className="text-sm font-normal text-gray-400 ml-2">({filteredProducts.length} products)</span>
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5">Source: branch sales records · {startDate} → {endDate}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="secondary" onClick={exportProductCSV}>
                      <Download size={13} /> Export CSV
                    </Button>
                    <button onClick={() => {
                      const branchLabel = selectedBranch === 'all' ? 'All Branches' : branchName(selectedBranch);
                      printMISSalesBreakdown(filteredProducts, branchLabel, startDate, endDate);
                    }} style={{ background: '#c41e3a', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>🖨️ Print PDF</button>
                  </div>
                </div>
              </CardHeader>

              {/* Totals banner */}
              {salesData?.totals && (
                <div style={{ display: 'flex', gap: 12, padding: '10px 16px', background: '#fdf4f5', borderBottom: '1px solid #f0e8ea', flexWrap: 'wrap', alignItems: 'center' }}>
                  {[
                    { label: 'Walk-in', value: salesData.totals.walkin,       color: '#1e3a5f' },
                    { label: 'Prescription', value: salesData.totals.prescription, color: '#166534' },
                    { label: 'Campaigns', value: salesData.totals.campaigns,   color: '#92400e' },
                    { label: 'Total Sold', value: salesData.totals.total,      color: '#8b0000' },
                  ].map(s => (
                    <div key={s.label} style={{ textAlign: 'center', minWidth: 80 }}>
                      <div style={{ fontSize: '0.63rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>{s.label}</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 900, color: s.color }}>{Number(s.value || 0).toLocaleString()}</div>
                    </div>
                  ))}
                  {(salesData.totals.refunded || 0) > 0 && (
                    <>
                      <div style={{ width: 1, height: 40, background: '#f0e8ea', margin: '0 4px' }} />
                      <div style={{ textAlign: 'center', minWidth: 80 }}>
                        <div style={{ fontSize: '0.63rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>Refunded</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#dc2626' }}>−{Number(salesData.totals.refunded || 0).toLocaleString()}</div>
                      </div>
                      <div style={{ textAlign: 'center', minWidth: 80 }}>
                        <div style={{ fontSize: '0.63rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>Net Sold</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 900, color: '#15803d' }}>{Number(salesData.totals.net || 0).toLocaleString()}</div>
                      </div>
                    </>
                  )}
                  <div style={{ textAlign: 'right', marginLeft: 'auto' }}>
                    <div style={{ fontSize: '0.63rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>DP Value</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#c41e3a' }}>N$ {Number(salesData.totals.dp_value || 0).toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    {(salesData.totals.refund_dp || 0) > 0 && (
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#dc2626' }}>−N$ {Number(salesData.totals.refund_dp || 0).toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} refunded</div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
                <input type="text" value={productSearch} onChange={e => setProductSearch(e.target.value)}
                  placeholder="Search products…"
                  style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <Table
                columns={[
                  { header: '#', render: (r, i) => <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>{String(i + 1).padStart(2, '0')}</span> },
                  { header: 'Product', render: r => <span style={{ fontWeight: 700 }}>{r.product_name || '-'}</span> },
                  { header: 'Walk-in', render: r => r.walkin > 0 ? <span style={{ fontWeight: 700, color: '#1e3a5f' }}>{Number(r.walkin).toLocaleString()}</span> : <span style={{ color: '#cbd5e1' }}>—</span> },
                  { header: 'Prescription', render: r => r.prescription > 0 ? <span style={{ fontWeight: 600, color: '#166534' }}>{Number(r.prescription).toLocaleString()}</span> : <span style={{ color: '#cbd5e1' }}>—</span> },
                  { header: 'Campaigns', render: r => r.campaigns > 0 ? <span style={{ fontWeight: 600, color: '#92400e' }}>{Number(r.campaigns).toLocaleString()}</span> : <span style={{ color: '#cbd5e1' }}>—</span> },
                  { header: 'Total', render: r => <span style={{ fontWeight: 900, color: '#8b0000' }}>{Number(r.total || 0).toLocaleString()}</span> },
                  { header: 'Refunded', render: r => r.refunded > 0
                      ? <span style={{ fontWeight: 800, color: '#dc2626' }}>−{Number(r.refunded).toLocaleString()}</span>
                      : <span style={{ color: '#cbd5e1' }}>—</span> },
                  { header: 'Net Sold', render: r => {
                      const net = r.net ?? (r.total || 0);
                      const hasRefund = (r.refunded || 0) > 0;
                      return <span style={{ fontWeight: 900, color: hasRefund ? '#15803d' : '#8b0000' }}>{Number(net).toLocaleString()}</span>;
                  }},
                  { header: 'DP Value', render: r => r.dp_value > 0 ? <span style={{ fontWeight: 700, color: '#c41e3a' }}>N$ {Number(r.dp_value).toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> : <span style={{ color: '#cbd5e1' }}>—</span> },
                ]}
                data={filteredProducts}
                emptyMessage="No sales recorded for this period"
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function CatalogsTab() {
  const [search, setSearch] = useState('');

  const filtered = getLiveProductList().filter(p =>
    !search || p.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <Badge variant="info">{filtered.length} products</Badge>
      </div>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Product Catalog</h3></CardHeader>
        <Table
          columns={[
            { header: 'Product', render: r => <span className="text-sm">{r.description}</span> },
            { header: 'DP (Member)', render: r => <span className="font-bold text-green-600">{formatCurrency(r.dp)}</span> },
            { header: 'CP (Retail)', render: r => <span className="font-bold text-blue-600">{formatCurrency(r.cp)}</span> },
            { header: 'BV', render: r => <Badge variant="primary">{r.bv}</Badge> },
            { header: 'Margin', render: r => <span className="text-sm text-gray-500">{formatCurrency(r.cp - r.dp)}</span> },
          ]}
          data={filtered}
          emptyMessage="No products match your search"
        />
      </Card>
    </div>
  );
}

function printCSIDoc(entries, filters) {
  const win = window.open('', '_blank');
  if (!win) return;
  const fmt = (v) => v != null && v !== '' ? String(v).replace(/</g,'&lt;').replace(/>/g,'&gt;') : '-';
  const fmtNum = (v) => Number(v || 0).toFixed(2);
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-NA', { day:'2-digit', month:'short', year:'numeric' }) : '-';
  const branchLabel = filters.branch && filters.branch !== 'all' ? filters.branch : 'All Branches';
  const dateRange = [filters.startDate, filters.endDate].filter(Boolean).join(' to ') || 'All Dates';

  // Group by receipt number
  const groups = [];
  const seen = new Map();
  for (const row of entries) {
    const key = row.receipt_number || row.date + '|' + row.nb_number;
    if (!seen.has(key)) { seen.set(key, groups.length); groups.push({ header: row, items: [row] }); }
    else { groups[seen.get(key)].items.push(row); }
  }

  let rowNum = 0;
  const rows = groups.map(({ header, items }) => {
    rowNum++;
    const rs = items.length;
    const recQty = items.reduce((s, r) => s + Number(r.qty || 0), 0);
    const recDP  = items.reduce((s, r) => s + Number(r.total_dp || 0), 0);
    const recBV  = items.reduce((s, r) => s + Number(r.total_bv || 0), 0);
    return items.map((item, ii) => `
      <tr>
        ${ii === 0 ? `
          <td rowspan="${rs}">${rowNum}</td>
          <td rowspan="${rs}">${fmt(header.branch_name)}</td>
          <td rowspan="${rs}">${fmt(header.nb_number)}</td>
          <td rowspan="${rs}">${fmt(header.name)}</td>
          <td rowspan="${rs}" style="font-family:monospace">${fmt(header.receipt_number)}</td>
          <td rowspan="${rs}">${fmtDate(header.date)}</td>
        ` : ''}
        <td style="${item.is_free ? 'background:#fff0f0' : ''}">${fmt(item.product_code)}</td>
        <td style="${item.is_free ? 'background:#fff0f0' : ''}">${fmt(item.product_description)}${item.is_free ? ' <span style="display:inline-block;background:#ef4444;color:#fff;font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px;vertical-align:middle;">FREE</span>' : ''}</td>
        <td style="text-align:right;${item.is_free ? 'background:#fff0f0;color:#b91c1c;font-weight:700' : ''}">${item.is_free ? 'FREE' : fmtNum(item.dp)}</td>
        <td style="text-align:right;${item.is_free ? 'background:#fff0f0;color:#b91c1c' : ''}">${item.is_free ? '—' : fmtNum(item.bv)}</td>
        <td style="text-align:right;${item.is_free ? 'background:#fff0f0' : ''}">${fmt(item.qty)}</td>
        <td style="text-align:right;${item.is_free ? 'background:#fff0f0;color:#b91c1c;font-weight:700' : ''}">${item.is_free ? 'FREE' : fmtNum(item.total_dp)}</td>
        <td style="text-align:right;${item.is_free ? 'background:#fff0f0;color:#b91c1c' : ''}">${item.is_free ? '—' : fmtNum(item.total_bv)}</td>
      </tr>`).join('') + `
      <tr class="subtotal-row">
        <td colspan="10" style="text-align:right;font-style:italic;color:#64748b">Receipt subtotal (${items.length} item${items.length !== 1 ? 's' : ''})</td>
        <td style="text-align:right;font-weight:800;color:#374151">${recQty}</td>
        <td style="text-align:right;font-weight:800;color:#1d4ed8">N$ ${recDP.toFixed(2)}</td>
        <td style="text-align:right;font-weight:800;color:#15803d">${recBV.toFixed(2)}</td>
      </tr>`;
  }).join('');

  const grandQty = entries.reduce((s, r) => s + Number(r.qty || 0), 0);
  const grandDP  = entries.reduce((s, r) => s + Number(r.total_dp || 0), 0);
  const grandBV  = entries.reduce((s, r) => s + Number(r.total_bv || 0), 0);
  const receiptCount = groups.length;

  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>CSI Entry Report</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size: 10px; color: #1e293b; padding: 20px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #c41e3a; padding-bottom:10px; margin-bottom:16px; }
    .company { color:#c41e3a; font-weight:900; font-size:14px; }
    .report-title { font-size:13px; font-weight:800; color:#8b0000; margin-top:4px; }
    .meta { text-align:right; color:#64748b; font-size:9px; line-height:1.6; }
    .summary-bar { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:12px; }
    .summary-card { border:1px solid #e2e8f0; border-radius:6px; padding:7px 10px; background:#f8fafc; }
    .summary-label { font-size:7.5px; color:#94a3b8; text-transform:uppercase; font-weight:700; letter-spacing:0.4px; }
    .summary-value { font-size:13px; font-weight:900; margin-top:2px; }
    .c-gray { color:#1e293b; } .c-yellow { color:#b45309; } .c-blue { color:#1d4ed8; } .c-green { color:#15803d; }
    table { width:100%; border-collapse:collapse; margin-top:4px; }
    th { background:#c41e3a; color:#fff; padding:5px 6px; text-align:left; font-size:8.5px; font-weight:700; white-space:nowrap; }
    td { padding:4px 6px; border-bottom:1px solid #f1f5f9; font-size:8.5px; vertical-align:top; }
    td[rowspan] { border-right:1px solid #e2e8f0; background:#fff; font-weight:600; }
    tr td:not([rowspan]):not(:first-of-type) { border-left:1px dotted #e2e8f0; }
    .subtotal-row td { background:#f1f5f9; border-top:1px solid #cbd5e1; font-size:8.5px; padding:3px 6px; }
    tfoot td { background:#111827; color:#fff; font-weight:800; font-size:9px; padding:6px; border:none; }
    tfoot .t-yellow { color:#fde68a; text-align:right; }
    tfoot .t-blue   { color:#93c5fd; text-align:right; }
    tfoot .t-green  { color:#86efac; text-align:right; }
    .print-btn { position:fixed; top:12px; right:12px; background:#c41e3a; color:#fff; border:none; padding:8px 18px; border-radius:8px; font-weight:700; cursor:pointer; }
    .filter-row { font-size:9px; color:#64748b; margin-bottom:10px; }
    @media print { .print-btn { display:none; } body { padding:8px; } }
  </style></head><body>
  <button class="print-btn" onclick="window.print()">🖨️ Print</button>
  <div class="header">
    <div>
      <div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div>
      <div class="report-title">📋 CSI Entry Report</div>
      <div class="filter-row">Branch: ${branchLabel} &nbsp;|&nbsp; Period: ${dateRange}</div>
    </div>
    <div class="meta">Date: ${new Date().toLocaleDateString('en-NA',{day:'2-digit',month:'long',year:'numeric'})}<br>Time: ${new Date().toLocaleTimeString('en-NA',{hour:'2-digit',minute:'2-digit'})}<br>Line Items: ${entries.length}</div>
  </div>
  <div class="summary-bar">
    <div class="summary-card"><div class="summary-label">Total Receipts</div><div class="summary-value c-gray">${receiptCount}</div></div>
    <div class="summary-card"><div class="summary-label">Total Items (QTY)</div><div class="summary-value c-yellow">${grandQty}</div></div>
    <div class="summary-card"><div class="summary-label">Grand Total DP</div><div class="summary-value c-blue">N$ ${grandDP.toFixed(2)}</div></div>
    <div class="summary-card"><div class="summary-label">Grand Total BV</div><div class="summary-value c-green">${grandBV.toFixed(2)}</div></div>
  </div>
  <table>
    <thead><tr>
      <th>#</th><th>Branch Name</th><th>NB Number</th><th>Name</th><th>Receipt No.</th>
      <th>Date</th><th>Product Code</th><th>Product Description</th>
      <th>DP</th><th>BV</th><th>QTY</th><th>Total DP</th><th>Total BV</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <td colspan="10">GRAND TOTALS — ${receiptCount} receipt${receiptCount !== 1 ? 's' : ''}, ${entries.length} line item${entries.length !== 1 ? 's' : ''}</td>
      <td class="t-yellow">${grandQty}</td>
      <td class="t-blue">N$ ${grandDP.toFixed(2)}</td>
      <td class="t-green">${grandBV.toFixed(2)}</td>
    </tr></tfoot>
  </table>
  </body></html>`);
  win.document.close();
}

const CSI_PAGE_SIZE = 100;

function CSIGroupedTable({ entries }) {
  const groups = [];
  const seen = new Map();
  for (const row of entries) {
    const key = row.receipt_number || row.date + '|' + row.nb_number;
    if (!seen.has(key)) {
      seen.set(key, groups.length);
      groups.push({ key, header: row, items: [row] });
    } else {
      groups[seen.get(key)].items.push(row);
    }
  }

  const totalQty    = entries.reduce((s, r) => s + Number(r.qty || 0), 0);
  const totalDP     = entries.reduce((s, r) => s + Number(r.total_dp || 0), 0);
  const totalBV     = entries.reduce((s, r) => s + Number(r.total_bv || 0), 0);

  const th = 'px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-50 border-b border-gray-200 whitespace-nowrap';
  const td = 'px-3 py-2 text-sm text-gray-700 align-top';
  const tdNum = 'px-3 py-2 text-sm text-right align-top';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className={th}>Branch</th>
            <th className={th}>NB Number</th>
            <th className={th}>Name</th>
            <th className={th}>Receipt No.</th>
            <th className={th}>Date</th>
            <th className={th}>Product Code</th>
            <th className={th}>Product Description</th>
            <th className={`${th} text-right`}>DP</th>
            <th className={`${th} text-right`}>BV</th>
            <th className={`${th} text-right`}>QTY</th>
            <th className={`${th} text-right`}>Total DP</th>
            <th className={`${th} text-right`}>Total BV</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group, gi) => {
            const { header, items } = group;
            const rowSpan = items.length;
            const isEven = gi % 2 === 0;
            const rowBg = isEven ? 'bg-white' : 'bg-gray-50/60';
            const borderTop = 'border-t-2 border-gray-200';
            const recQty = items.reduce((s, r) => s + Number(r.qty || 0), 0);
            const recDP  = items.reduce((s, r) => s + Number(r.total_dp || 0), 0);
            const recBV  = items.reduce((s, r) => s + Number(r.total_bv || 0), 0);
            return [
              ...items.map((item, ii) => (
                <tr key={`${group.key}-${ii}`} className={`${rowBg} hover:bg-blue-50/40 transition-colors`}>
                  {ii === 0 && (
                    <>
                      <td className={`${td} font-medium text-primary ${borderTop}`} rowSpan={rowSpan}>
                        {header.branch_name || '-'}
                      </td>
                      <td className={`${td} font-semibold text-gray-800 ${borderTop}`} rowSpan={rowSpan}>
                        {header.nb_number || '-'}
                      </td>
                      <td className={`${td} ${borderTop}`} rowSpan={rowSpan}>
                        {header.name || '-'}
                      </td>
                      <td className={`${td} font-mono text-xs text-blue-700 ${borderTop}`} rowSpan={rowSpan}>
                        {header.receipt_number || '-'}
                      </td>
                      <td className={`${td} whitespace-nowrap ${borderTop}`} rowSpan={rowSpan}>
                        {header.date ? new Date(header.date).toLocaleDateString('en-NA', { day:'2-digit', month:'short', year:'numeric' }) : '-'}
                      </td>
                    </>
                  )}
                  <td className={`${td} text-gray-500 ${ii === 0 ? borderTop : ''}`} style={item.is_free ? { background: '#fff0f0' } : {}}>{item.product_code || '-'}</td>
                  <td className={`${td} font-medium ${ii === 0 ? borderTop : ''}`} style={item.is_free ? { background: '#fff0f0' } : {}}>
                    {item.product_description || '-'}
                    {item.is_free && (
                      <span style={{ display: 'inline-block', marginLeft: 6, background: '#ef4444', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4, verticalAlign: 'middle', letterSpacing: '0.05em' }}>FREE</span>
                    )}
                  </td>
                  <td className={`${tdNum} ${ii === 0 ? borderTop : ''}`} style={item.is_free ? { background: '#fff0f0', color: '#b91c1c', fontWeight: 700 } : {}}>{item.is_free ? 'FREE' : Number(item.dp || 0).toFixed(2)}</td>
                  <td className={`${tdNum} ${ii === 0 ? borderTop : ''}`} style={item.is_free ? { background: '#fff0f0', color: '#b91c1c' } : {}}>{item.is_free ? '—' : Number(item.bv || 0).toFixed(2)}</td>
                  <td className={`${tdNum} font-semibold ${ii === 0 ? borderTop : ''}`} style={item.is_free ? { background: '#fff0f0' } : {}}>{Number(item.qty || 0)}</td>
                  <td className={`${tdNum} font-semibold ${ii === 0 ? borderTop : ''}`} style={item.is_free ? { background: '#fff0f0', color: '#b91c1c', fontWeight: 700 } : { color: '#1d4ed8' }}>{item.is_free ? 'FREE' : Number(item.total_dp || 0).toFixed(2)}</td>
                  <td className={`${tdNum} font-semibold ${ii === 0 ? borderTop : ''}`} style={item.is_free ? { background: '#fff0f0', color: '#b91c1c' } : { color: '#15803d' }}>{item.is_free ? '—' : Number(item.total_bv || 0).toFixed(2)}</td>
                </tr>
              )),
              <tr key={`${group.key}-subtotal`} className="bg-slate-100 border-t border-slate-300">
                <td colSpan={9} className="px-3 py-1.5 text-xs font-semibold text-slate-500 text-right italic">
                  Receipt subtotal ({items.length} item{items.length !== 1 ? 's' : ''})
                </td>
                <td className="px-3 py-1.5 text-xs font-bold text-right text-slate-700 whitespace-nowrap">{recQty}</td>
                <td className="px-3 py-1.5 text-xs font-bold text-right text-blue-700 whitespace-nowrap">{recDP.toFixed(2)}</td>
                <td className="px-3 py-1.5 text-xs font-bold text-right text-green-700 whitespace-nowrap">{recBV.toFixed(2)}</td>
              </tr>,
            ];
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-4 border-gray-300 bg-gray-900">
            <td colSpan={9} className="px-3 py-2.5 text-sm font-bold text-white uppercase tracking-wide">
              Page Totals ({entries.length} line{entries.length !== 1 ? 's' : ''}, {groups.length} receipt{groups.length !== 1 ? 's' : ''})
            </td>
            <td className="px-3 py-2.5 text-sm font-bold text-right text-yellow-300 whitespace-nowrap">
              {totalQty}
            </td>
            <td className="px-3 py-2.5 text-sm font-bold text-right text-blue-300 whitespace-nowrap">
              {totalDP.toFixed(2)}
            </td>
            <td className="px-3 py-2.5 text-sm font-bold text-right text-green-300 whitespace-nowrap">
              {totalBV.toFixed(2)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function CSIEntryTab() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);
  const [branch, setBranch] = useState('');
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(todayStr);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [page, setPage] = useState(1);

  const handleSearch = async (overrides = {}) => {
    setLoading(true);
    setSearched(true);
    setPage(1);
    try {
      const params = {};
      const b = overrides.branch !== undefined ? overrides.branch : branch;
      const s = overrides.startDate !== undefined ? overrides.startDate : startDate;
      const e = overrides.endDate !== undefined ? overrides.endDate : endDate;
      if (b && b !== 'all') params.branch = b;
      if (s) params.startDate = s;
      if (e) params.endDate = e;
      const data = await api.mis.csiEntries(params);
      setEntries(Array.isArray(data) ? data : data.entries || []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { handleSearch(); }, []);

  const exportCSV = () => {
    if (entries.length === 0) return;
    const headers = ['Branch Name', 'NB Number', 'Name', 'Receipt Number', 'Date', 'Product Code', 'Product Description', 'DP', 'BV', 'QTY', 'Total DP', 'Total BV'];
    const rows = entries.map(e => [
      e.branch_name, e.nb_number, e.name, e.receipt_number, e.date,
      e.product_code, e.product_description, e.dp, e.bv, e.qty, e.total_dp, e.total_bv,
    ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`));
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `csi-entries-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportExcel = () => {
    if (entries.length === 0) return;
    const wsData = [
      ['Branch Name', 'NB Number', 'Name', 'Receipt Number', 'Date', 'Product Code', 'Product Description', 'DP', 'BV', 'QTY', 'Total DP', 'Total BV'],
      ...entries.map(e => [
        e.branch_name, e.nb_number, e.name, e.receipt_number, e.date,
        e.product_code, e.product_description,
        Number(e.dp || 0), Number(e.bv || 0), Number(e.qty || 0),
        Number(e.total_dp || 0), Number(e.total_bv || 0),
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CSI Entries');
    XLSX.writeFile(wb, `csi-entries-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const filters = { branch, startDate, endDate };
  const totalPages = Math.max(1, Math.ceil(entries.length / CSI_PAGE_SIZE));
  const pagedEntries = entries.slice((page - 1) * CSI_PAGE_SIZE, page * CSI_PAGE_SIZE);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">CSI Entry Report</h3></CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Branch</label>
              <select value={branch} onChange={e => setBranch(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                <option value="">All Branches / Country</option>
                {BRANCH_DETAILS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <Input label="Start Date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <Input label="End Date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            <Button onClick={() => handleSearch()} disabled={loading}>
              <Search size={14} /> {loading ? 'Searching...' : 'Search / Filter'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {searched && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-bold text-gray-800">
                Results — {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                {totalPages > 1 && <span className="text-sm font-normal text-gray-500 ml-2">(page {page} of {totalPages})</span>}
              </h3>
              {entries.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="secondary" onClick={() => printCSIDoc(entries, filters)}>
                    🖨️ Print PDF
                  </Button>
                  <Button size="sm" variant="secondary" onClick={exportCSV}>
                    <Download size={14} /> Export CSV
                  </Button>
                  <Button size="sm" variant="secondary" onClick={exportExcel}>
                    <Download size={14} /> Export Excel
                  </Button>
                </div>
              )}
            </div>
            {entries.length > 0 && (() => {
              const grandQty = entries.reduce((s, r) => s + Number(r.qty || 0), 0);
              const grandDP  = entries.reduce((s, r) => s + Number(r.total_dp || 0), 0);
              const grandBV  = entries.reduce((s, r) => s + Number(r.total_bv || 0), 0);
              const receipts = new Set(entries.map(r => r.receipt_number || (r.date + '|' + r.nb_number))).size;
              return (
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Total Receipts', value: receipts, color: 'text-gray-800', bg: 'bg-gray-100' },
                    { label: 'Total Items (QTY)', value: grandQty, color: 'text-yellow-700', bg: 'bg-yellow-50 border border-yellow-200' },
                    { label: 'Grand Total DP', value: `N$ ${grandDP.toFixed(2)}`, color: 'text-blue-700', bg: 'bg-blue-50 border border-blue-200' },
                    { label: 'Grand Total BV', value: grandBV.toFixed(2), color: 'text-green-700', bg: 'bg-green-50 border border-green-200' },
                  ].map(({ label, value, color, bg }) => (
                    <div key={label} className={`rounded-lg px-4 py-3 ${bg}`}>
                      <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</div>
                      <div className={`text-lg font-bold mt-0.5 ${color}`}>{value}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardHeader>
          {loading ? <LoadingSpinner /> : (
            <>
              {pagedEntries.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">No CSI entries found for the selected filters</div>
              ) : (
                <CSIGroupedTable entries={pagedEntries} />
              )}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-gray-100">
                  <Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>← Prev</Button>
                  <span className="text-sm text-gray-600">{page} / {totalPages}</span>
                  <Button size="sm" variant="secondary" disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next →</Button>
                </div>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
}

function DraftsTab() {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadDrafts = () => {
    setLoading(true);
    api.mis.drafts()
      .then(d => setDrafts(Array.isArray(d) ? d : d.drafts || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadDrafts(); }, []);

  const handlePublish = async (id) => {
    try {
      await api.patch(`/mis/drafts`, { action: 'publish', id });
      setDrafts(prev => prev.map(d => d.id === id ? { ...d, status: 'published' } : d));
      setMessage('Draft published successfully!');
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
  };

  if (loading) return <LoadingSpinner />;

  const fmtBranch = b => BRANCH_ID_TO_NAME[b] || (b ? b.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '-');

  return (
    <div className="space-y-4">
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'}>{message}</Alert>}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-800">Sales Drafts</h3>
            <Button size="sm" variant="secondary" onClick={loadDrafts}>Refresh</Button>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Draft ID', render: r => <span className="font-mono text-xs text-gray-600">{r.id}</span> },
            { header: 'Branch', render: r => fmtBranch(r.branch_id) },
            { header: 'Lines', render: r => r.line_count ?? '-' },
            { header: 'Total Amount', render: r => formatCurrency(r.total_amount) },
            { header: 'Created By', render: r => r.created_by || '-' },
            { header: 'Last Updated', render: r => formatDateTime(r.updated_at || r.created_at) },
            { header: 'Status', render: r => <Badge variant={r.status === 'published' ? 'success' : r.status === 'verified' ? 'primary' : 'warning'}>{r.status || 'draft'}</Badge> },
            { header: 'Actions', render: r => r.status !== 'published' && (
              <Button size="sm" variant="success" onClick={() => handlePublish(r.id)}>Publish</Button>
            )},
          ]}
          data={drafts}
          emptyMessage="No drafts saved"
        />
      </Card>
    </div>
  );
}

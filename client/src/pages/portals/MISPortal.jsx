import { useState, useEffect } from 'react';
import DistributorPerformanceTab from '../../components/DistributorPerformanceTab';
import { api } from '../../lib/api';
import { formatCurrency, formatDateTime, formatDate, BRANCHES } from '../../lib/constants';
import { PRICE_LIST } from '../../lib/pricing';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, Table, Modal, Alert } from '../../components/ui';
import { BarChart3, FileSearch, GitCompare, Activity, Receipt, Package, BookOpen, FileEdit, Search, AlertTriangle } from 'lucide-react';

export default function MISPortal() {
  const [activeTab, setActiveTab] = useState('audit');
  const tabs = [
    { id: 'audit', label: 'Audit', icon: '🔍' },
    { id: 'reconcile', label: 'Reconcile', icon: '⚖️' },
    { id: 'branchStatus', label: 'Branch Status', icon: '📊' },
    { id: 'encodedSales', label: 'Encoded Sales', icon: '📝' },
    { id: 'receipts', label: 'Receipts', icon: '🧾' },
    { id: 'stock', label: 'Stock', icon: '📦' },
    { id: 'catalogs', label: 'Catalogs', icon: '📖' },
    { id: 'drafts', label: 'Drafts', icon: '✏️' },
    { id: 'distributors', label: 'Distributor Performance', icon: '👥' },
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
        {activeTab === 'stock' && <MISStockTab />}
        {activeTab === 'catalogs' && <CatalogsTab />}
        {activeTab === 'drafts' && <DraftsTab />}
        {activeTab === 'distributors' && <DistributorPerformanceTab title="Distributor Performance — MIS Overview" />}
      </div>
    </div>
  );
}

function AuditTab() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.mis.audit()
      .then(d => setData(Array.isArray(d) ? d : d.records || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <Card>
      <CardHeader><h3 className="font-bold text-gray-800">Audit Trail</h3></CardHeader>
      <Table
        columns={[
          { header: 'Date', render: r => formatDateTime(r.created_at || r.timestamp) },
          { header: 'Action', key: 'action' },
          { header: 'User', key: 'user' },
          { header: 'Details', key: 'details' },
        ]}
        data={data}
        emptyMessage="No audit records"
      />
    </Card>
  );
}

function ReconcileTab() {
  const [branch, setBranch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleReconcile = async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    try {
      const params = [`start_date=${startDate}`, `end_date=${endDate}`];
      if (branch) params.push(`branch=${encodeURIComponent(branch)}`);

      const [salesData, depositsData] = await Promise.all([
        api.branch.walkinSales(params.join('&')).then(d => Array.isArray(d) ? d : d.sales || []).catch(() => []),
        api.branch.deposits().then(d => Array.isArray(d) ? d : d.deposits || []).catch(() => []),
      ]);

      const filteredDeposits = depositsData.filter(d => {
        const date = new Date(d.created_at);
        return date >= new Date(startDate) && date <= new Date(endDate + 'T23:59:59') &&
          (!branch || d.branch_id === branch);
      });

      const totalSales = salesData.reduce((sum, s) => sum + Number(s.total || s.amount || 0), 0);
      const totalDeposits = filteredDeposits.reduce((sum, d) => sum + Number(d.amount || 0), 0);
      const discrepancy = totalSales - totalDeposits;

      setResult({ salesData, filteredDeposits, totalSales, totalDeposits, discrepancy });
    } catch (err) {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Data Reconciliation</h3></CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Branch</label>
              <select value={branch} onChange={e => setBranch(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                <option value="">All Branches</option>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <Input label="Start Date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <Input label="End Date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            <Button onClick={handleReconcile} disabled={loading || !startDate || !endDate}>
              {loading ? 'Loading...' : 'Reconcile'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardBody>
                <p className="text-sm text-gray-500">Total Sales</p>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(result.totalSales)}</p>
                <p className="text-xs text-gray-400">{result.salesData.length} transactions</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-sm text-gray-500">Total Deposits</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(result.totalDeposits)}</p>
                <p className="text-xs text-gray-400">{result.filteredDeposits.length} deposits</p>
              </CardBody>
            </Card>
            <Card className={Math.abs(result.discrepancy) > 0 ? 'border-red-200 bg-red-50' : ''}>
              <CardBody>
                <p className="text-sm text-gray-500">Discrepancy</p>
                <p className={`text-2xl font-bold ${Math.abs(result.discrepancy) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(Math.abs(result.discrepancy))}
                </p>
                {Math.abs(result.discrepancy) > 0 && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertTriangle size={12} /> {result.discrepancy > 0 ? 'Under-deposited' : 'Over-deposited'}
                  </p>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function BranchStatusTab() {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.mis.branchStatus()
      .then(d => setBranches(Array.isArray(d) ? d : d.branches || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <Card>
      <CardHeader><h3 className="font-bold text-gray-800">Branch Status Overview</h3></CardHeader>
      <Table
        columns={[
          { header: 'Branch', key: 'name' },
          { header: 'Status', render: r => <Badge variant={r.status === 'active' ? 'success' : 'warning'}>{r.status || 'Active'}</Badge> },
          { header: 'Last Update', render: r => formatDateTime(r.last_update || r.updated_at) },
        ]}
        data={branches}
        emptyMessage="No branch data available"
      />
    </Card>
  );
}

function EncodedSalesTab() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: '', branch: '', product: '', quantity: '1', price: '', receipt_number: '' });
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.mis.encodedSales()
      .then(d => setSales(Array.isArray(d) ? d : d.sales || d.records || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.date || !form.branch || !form.product || !form.price) {
      setMessage('Error: Please fill in all required fields.');
      return;
    }
    try {
      await api.mis.createEncodedSale({
        ...form,
        quantity: Number(form.quantity),
        price: Number(form.price),
      });
      setMessage('Sale encoded successfully!');
      setSales(prev => [{ ...form, id: Date.now(), quantity: Number(form.quantity), price: Number(form.price), created_at: new Date().toISOString() }, ...prev]);
      setForm({ date: '', branch: '', product: '', quantity: '1', price: '', receipt_number: '' });
      setShowForm(false);
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'}>{message}</Alert>}

      <div className="flex justify-between items-center">
        <h3 className="font-bold text-gray-800">Encoded Sales</h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Encode Sale'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="Date *" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">Branch *</label>
                  <select value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                    <option value="">Select Branch</option>
                    {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Product *</label>
                <select value={form.product} onChange={e => {
                  const prod = PRICE_LIST.find(p => p.description === e.target.value);
                  setForm({ ...form, product: e.target.value, price: prod ? String(prod.cp) : form.price });
                }}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                  <option value="">Select Product</option>
                  {PRICE_LIST.map(p => <option key={p.description} value={p.description}>{p.description}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Input label="Quantity *" type="number" min="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} />
                <Input label="Price *" type="number" min="0" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
                <Input label="Receipt #" value={form.receipt_number} onChange={e => setForm({ ...form, receipt_number: e.target.value })} placeholder="RCP-..." />
              </div>
              <Button type="submit">Save Encoded Sale</Button>
            </form>
          </CardBody>
        </Card>
      )}

      <Card>
        <Table
          columns={[
            { header: 'Date', render: r => formatDate(r.date || r.created_at) },
            { header: 'Branch', render: r => r.branch || r.branch_id || '-' },
            { header: 'Product', render: r => r.product || r.product_name || '-' },
            { header: 'Qty', render: r => r.quantity || '-' },
            { header: 'Price', render: r => formatCurrency(r.price || r.amount) },
            { header: 'Receipt', render: r => r.receipt_number || '-' },
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
  const [search, setSearch] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [searchBranch, setSearchBranch] = useState('');

  const handleSearch = async () => {
    setLoading(true);
    try {
      const params = [];
      if (search) params.push(`q=${encodeURIComponent(search)}`);
      if (searchDate) params.push(`date=${searchDate}`);
      if (searchBranch) params.push(`branch=${encodeURIComponent(searchBranch)}`);
      const data = await api.mis.receipts(params.length ? params.join('&') : '');
      setReceipts(Array.isArray(data) ? data : data.receipts || data.records || []);
    } catch {
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Receipt Search</h3></CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <Input label="Receipt # or Keyword" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." />
            <Input label="Date" type="date" value={searchDate} onChange={e => setSearchDate(e.target.value)} />
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Branch</label>
              <select value={searchBranch} onChange={e => setSearchBranch(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                <option value="">All Branches</option>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <Button onClick={handleSearch} disabled={loading}>
              <Search size={14} /> {loading ? 'Searching...' : 'Search'}
            </Button>
          </div>
        </CardBody>
      </Card>

      {receipts.length > 0 && (
        <Card>
          <Table
            columns={[
              { header: 'Receipt #', render: r => r.receipt_number || r.id || '-' },
              { header: 'Date', render: r => formatDateTime(r.created_at || r.date) },
              { header: 'Branch', render: r => r.branch || r.branch_id || '-' },
              { header: 'Customer', render: r => r.customer_name || r.distributor_name || '-' },
              { header: 'Amount', render: r => <span className="font-bold">{formatCurrency(r.total || r.amount)}</span> },
              { header: 'Payment', render: r => <Badge variant="info">{r.payment_method || '-'}</Badge> },
            ]}
            data={receipts}
            emptyMessage="No receipts found"
          />
        </Card>
      )}
    </div>
  );
}

function MISStockTab() {
  const [stockData, setStockData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.mis.stock()
      .then(d => setStockData(Array.isArray(d) ? d : d.stock || d.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const lowStock = stockData.filter(s => Number(s.quantity || s.stock || 0) < 10);

  return (
    <div className="space-y-4">
      {lowStock.length > 0 && (
        <Alert type="warning">
          <span className="font-medium">Low Stock Alert:</span> {lowStock.length} product(s) have stock below 10 units.
        </Alert>
      )}

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Cross-Branch Stock Levels</h3></CardHeader>
        <Table
          columns={[
            { header: 'Product', render: r => r.product_name || r.name || '-' },
            { header: 'Location', render: r => r.location || r.branch || '-' },
            { header: 'Quantity', render: r => {
              const qty = Number(r.quantity || r.stock || 0);
              return <span className={qty < 10 ? 'text-red-600 font-bold' : 'font-medium'}>{qty}</span>;
            }},
            { header: 'Status', render: r => {
              const qty = Number(r.quantity || r.stock || 0);
              if (qty === 0) return <Badge variant="danger">Out of Stock</Badge>;
              if (qty < 10) return <Badge variant="warning">Low Stock</Badge>;
              return <Badge variant="success">In Stock</Badge>;
            }},
          ]}
          data={stockData}
          emptyMessage="No stock data available"
        />
      </Card>
    </div>
  );
}

function CatalogsTab() {
  const [search, setSearch] = useState('');

  const filtered = PRICE_LIST.filter(p =>
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

function DraftsTab() {
  const [drafts, setDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.mis.drafts()
      .then(d => setDrafts(Array.isArray(d) ? d : d.drafts || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handlePublish = async (id) => {
    try {
      await api.put(`/mis/drafts/${id}`, { status: 'published' });
      setDrafts(prev => prev.map(d => d.id === id ? { ...d, status: 'published' } : d));
      setMessage('Draft published successfully!');
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'}>{message}</Alert>}
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Report Drafts</h3></CardHeader>
        <Table
          columns={[
            { header: 'Title', render: r => r.title || r.name || 'Untitled Draft' },
            { header: 'Created', render: r => formatDateTime(r.created_at) },
            { header: 'Status', render: r => <Badge variant={r.status === 'published' ? 'success' : 'warning'}>{r.status || 'draft'}</Badge> },
            { header: 'Actions', render: r => r.status !== 'published' && (
              <div className="flex gap-1">
                <Button size="sm" variant="secondary">Edit</Button>
                <Button size="sm" variant="success" onClick={() => handlePublish(r.id)}>Publish</Button>
              </div>
            )},
          ]}
          data={drafts}
          emptyMessage="No drafts saved"
        />
      </Card>
    </div>
  );
}

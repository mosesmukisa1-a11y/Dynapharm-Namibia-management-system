import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { PRICE_LIST } from '../../lib/pricing';
import { formatCurrency, formatDateTime, formatDate, BRANCHES } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Table, Modal, Alert, Select, Textarea } from '../../components/ui';
import { Package, Warehouse, Truck, ArrowLeftRight, Globe, BarChart3, ClipboardList, FileSpreadsheet, Zap, Share2, ShoppingCart, Plus, Download, Filter, Search } from 'lucide-react';

export default function StockPortal() {
  const [activeTab, setActiveTab] = useState('overview');
  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'countryStock', label: 'Country Stock', icon: '🌍' },
    { id: 'windhoek', label: 'Windhoek', icon: '🏢' },
    { id: 'ondangwa', label: 'Ondangwa', icon: '🏬' },
    { id: 'distribution', label: 'Distribution', icon: '🚚' },
    { id: 'transfers', label: 'Transfers', icon: '🔄' },
    { id: 'inventory', label: 'Inventory', icon: '📦' },
    { id: 'orders', label: 'Orders', icon: '🧾' },
    { id: 'sharing', label: 'Sharing', icon: '🔗' },
    { id: 'countryInventory', label: 'Country Inv.', icon: '🗂️' },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Package size={24} className="text-primary" /> Stock Management
        </h1>
        <p className="text-sm text-gray-500">Warehouse management, transfers, and inventory tracking</p>
      </div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'countryStock' && <CountryStockTab />}
        {activeTab === 'windhoek' && <WarehouseTab name="Windhoek" />}
        {activeTab === 'ondangwa' && <WarehouseTab name="Ondangwa" />}
        {activeTab === 'distribution' && <DistributionTab />}
        {activeTab === 'transfers' && <TransfersTab />}
        {activeTab === 'inventory' && <InventoryTab />}
        {activeTab === 'orders' && <OrdersTab />}
        {activeTab === 'sharing' && <SharingTab />}
        {activeTab === 'countryInventory' && <CountryInventoryTab />}
      </div>
    </div>
  );
}

function OverviewTab() {
  const [data, setData] = useState({ batches: [], movements: [], transfers: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.stock.batches().then(d => Array.isArray(d) ? d : d.batches || []).catch(() => []),
      api.stock.movements().then(d => Array.isArray(d) ? d : d.movements || []).catch(() => []),
      api.stock.transfers().then(d => Array.isArray(d) ? d : d.transfers || []).catch(() => []),
    ]).then(([batches, movements, transfers]) => {
      setData({ batches, movements, transfers });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const totalItems = data.batches.reduce((sum, b) => sum + Number(b.quantity || 0), 0);
  const totalValue = data.batches.reduce((sum, b) => sum + Number(b.quantity || 0) * Number(b.unit_price || 0), 0);

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Stock Items" value={totalItems.toLocaleString()} color="blue" icon={<Package size={24} />} />
        <StatCard title="Total Stock Value" value={formatCurrency(totalValue)} color="green" icon={<BarChart3 size={24} />} />
        <StatCard title="Pending Transfers" value={data.transfers.filter(t => t.status === 'pending').length} color="orange" icon={<ArrowLeftRight size={24} />} />
        <StatCard title="Stock Batches" value={data.batches.length} color="purple" icon={<Warehouse size={24} />} />
      </div>
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Recent Stock Movements</h3></CardHeader>
        <Table
          columns={[
            { header: 'Date', render: r => formatDateTime(r.created_at) },
            { header: 'Product', key: 'product_name' },
            { header: 'Type', render: r => <Badge variant={r.movement_type === 'in' ? 'success' : 'warning'}>{r.movement_type || 'Movement'}</Badge> },
            { header: 'Quantity', key: 'quantity' },
            { header: 'Location', key: 'location' },
          ]}
          data={data.movements.slice(0, 20)}
          emptyMessage="No recent movements"
        />
      </Card>
    </div>
  );
}

function CountryStockTab() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState({ product_name: '', quantity: '', batch_number: '', expiry_date: '', unit_price: '' });
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);

  const loadBatches = useCallback(() => {
    setLoading(true);
    api.stock.batches()
      .then(d => setBatches((Array.isArray(d) ? d : d.batches || []).filter(b => b.location === 'country_stock')))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  const handleImport = async (e) => {
    e.preventDefault();
    if (!form.product_name || !form.quantity || Number(form.quantity) <= 0) {
      setAlert({ type: 'error', msg: 'Product and quantity are required' });
      return;
    }
    setSubmitting(true);
    try {
      await api.stock.createBatch({
        product_name: form.product_name,
        quantity: Number(form.quantity),
        batch_number: form.batch_number || `BATCH-${Date.now()}`,
        expiry_date: form.expiry_date || null,
        unit_price: Number(form.unit_price) || 0,
        location: 'country_stock',
      });
      setAlert({ type: 'success', msg: 'Stock imported successfully' });
      setForm({ product_name: '', quantity: '', batch_number: '', expiry_date: '', unit_price: '' });
      setShowImport(false);
      loadBatches();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const selectedProduct = PRICE_LIST.find(p => p.description === form.product_name);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {alert && <Alert type={alert.type} className="mb-4">{alert.msg}</Alert>}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Country Stock Inventory</h3>
            <Button size="sm" onClick={() => setShowImport(true)}><Plus size={16} /> Import Stock</Button>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Product', key: 'product_name' },
            { header: 'Batch', key: 'batch_number' },
            { header: 'Quantity', render: r => <span className={Number(r.quantity) < 10 ? 'text-red-600 font-bold' : 'font-medium'}>{r.quantity}</span> },
            { header: 'Expiry', render: r => formatDateTime(r.expiry_date) },
            { header: 'Value', render: r => formatCurrency(Number(r.quantity || 0) * Number(r.unit_price || 0)) },
          ]}
          data={batches}
          emptyMessage="No country stock data"
        />
      </Card>

      <Modal open={showImport} onClose={() => setShowImport(false)} title="Import Stock to Country Stock" size="md">
        <form onSubmit={handleImport} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Product</label>
            <select
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
              value={form.product_name}
              onChange={e => {
                const prod = PRICE_LIST.find(p => p.description === e.target.value);
                setForm(f => ({ ...f, product_name: e.target.value, unit_price: prod ? String(prod.dp) : f.unit_price }));
              }}
              required
            >
              <option value="">Select a product...</option>
              {PRICE_LIST.map(p => (
                <option key={p.description} value={p.description}>{p.description}</option>
              ))}
            </select>
          </div>
          {selectedProduct && (
            <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
              DP: {formatCurrency(selectedProduct.dp)} | CP: {formatCurrency(selectedProduct.cp)} | BV: {selectedProduct.bv}
            </div>
          )}
          <Input label="Quantity" type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} required />
          <Input label="Batch Number" value={form.batch_number} onChange={e => setForm(f => ({ ...f, batch_number: e.target.value }))} placeholder="Auto-generated if empty" />
          <Input label="Expiry Date" type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} />
          <Input label="Unit Price (N$)" type="number" min="0" step="0.01" value={form.unit_price} onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))} />
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={submitting}>{submitting ? 'Importing...' : 'Import Stock'}</Button>
            <Button variant="secondary" type="button" onClick={() => setShowImport(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function WarehouseTab({ name }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTransfer, setShowTransfer] = useState(false);
  const [form, setForm] = useState({ product_name: '', quantity: '' });
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);
  const location = name.toLowerCase() + '_warehouse';

  const loadBatches = useCallback(() => {
    setLoading(true);
    api.stock.batches()
      .then(d => setBatches((Array.isArray(d) ? d : d.batches || []).filter(b => b.location === location)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [location]);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  const handleTransferIn = async (e) => {
    e.preventDefault();
    if (!form.product_name || !form.quantity || Number(form.quantity) <= 0) {
      setAlert({ type: 'error', msg: 'Product and quantity are required' });
      return;
    }
    setSubmitting(true);
    try {
      await api.stock.createTransfer({
        from_location: 'country_stock',
        to_location: location,
        product_name: form.product_name,
        quantity: Number(form.quantity),
      });
      setAlert({ type: 'success', msg: `Transfer to ${name} warehouse initiated` });
      setForm({ product_name: '', quantity: '' });
      setShowTransfer(false);
      loadBatches();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {alert && <Alert type={alert.type} className="mb-4">{alert.msg}</Alert>}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">{name} Warehouse Inventory</h3>
            <Button size="sm" onClick={() => setShowTransfer(true)}><Plus size={16} /> Transfer In</Button>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Product', key: 'product_name' },
            { header: 'Batch', key: 'batch_number' },
            { header: 'Quantity', render: r => <span className={Number(r.quantity) < 10 ? 'text-red-600 font-bold' : ''}>{r.quantity}</span> },
            { header: 'Expiry', render: r => formatDateTime(r.expiry_date) },
          ]}
          data={batches}
          emptyMessage={`No stock in ${name} warehouse`}
        />
      </Card>

      <Modal open={showTransfer} onClose={() => setShowTransfer(false)} title={`Transfer Stock to ${name} Warehouse`} size="md">
        <form onSubmit={handleTransferIn} className="p-6 space-y-4">
          <Alert type="info">Transfer from Country Stock to {name} Warehouse</Alert>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Product</label>
            <select
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
              value={form.product_name}
              onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
              required
            >
              <option value="">Select a product...</option>
              {PRICE_LIST.map(p => (
                <option key={p.description} value={p.description}>{p.description}</option>
              ))}
            </select>
          </div>
          <Input label="Quantity" type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} required />
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={submitting}>{submitting ? 'Transferring...' : 'Initiate Transfer'}</Button>
            <Button variant="secondary" type="button" onClick={() => setShowTransfer(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function DistributionTab() {
  const [form, setForm] = useState({ from_location: '', to_location: '', product_name: '', quantity: '' });
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);
  const [recentTransfers, setRecentTransfers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.stock.transfers()
      .then(d => setRecentTransfers(Array.isArray(d) ? d : d.transfers || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const warehouses = [
    { value: '', label: 'Select source...' },
    { value: 'country_stock', label: 'Country Stock' },
    { value: 'windhoek_warehouse', label: 'Windhoek Warehouse' },
    { value: 'ondangwa_warehouse', label: 'Ondangwa Warehouse' },
  ];

  const destinations = [
    { value: '', label: 'Select destination...' },
    ...BRANCHES.map(b => ({ value: b.toLowerCase().replace(/\s+/g, '_'), label: b })),
    { value: 'windhoek_warehouse', label: 'Windhoek Warehouse' },
    { value: 'ondangwa_warehouse', label: 'Ondangwa Warehouse' },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.from_location || !form.to_location || !form.product_name || !form.quantity) {
      setAlert({ type: 'error', msg: 'All fields are required' });
      return;
    }
    if (form.from_location === form.to_location) {
      setAlert({ type: 'error', msg: 'Source and destination must be different' });
      return;
    }
    setSubmitting(true);
    try {
      await api.stock.createTransfer({
        from_location: form.from_location,
        to_location: form.to_location,
        product_name: form.product_name,
        quantity: Number(form.quantity),
      });
      setAlert({ type: 'success', msg: 'Distribution transfer created successfully' });
      setForm({ from_location: '', to_location: '', product_name: '', quantity: '' });
      const d = await api.stock.transfers().catch(() => []);
      setRecentTransfers(Array.isArray(d) ? d : d.transfers || []);
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} className="mb-4">{alert.msg}</Alert>}
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Create Distribution Transfer</h3></CardHeader>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select label="Source Warehouse" options={warehouses} value={form.from_location} onChange={e => setForm(f => ({ ...f, from_location: e.target.value }))} />
              <Select label="Destination Branch" options={destinations} value={form.to_location} onChange={e => setForm(f => ({ ...f, to_location: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Product</label>
                <select
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                  value={form.product_name}
                  onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
                  required
                >
                  <option value="">Select product...</option>
                  {PRICE_LIST.map(p => (
                    <option key={p.description} value={p.description}>{p.description}</option>
                  ))}
                </select>
              </div>
              <Input label="Quantity" type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} required />
            </div>
            <Button type="submit" disabled={submitting}><Truck size={16} /> {submitting ? 'Creating...' : 'Create Distribution'}</Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Recent Distribution Transfers</h3></CardHeader>
        {loading ? <LoadingSpinner /> : (
          <Table
            columns={[
              { header: 'Date', render: r => formatDateTime(r.created_at) },
              { header: 'From', key: 'from_location' },
              { header: 'To', key: 'to_location' },
              { header: 'Product', key: 'product_name' },
              { header: 'Qty', key: 'quantity' },
              { header: 'Status', render: r => <Badge variant={r.status === 'completed' || r.status === 'delivered' ? 'success' : r.status === 'in_transit' || r.status === 'dispatched' ? 'info' : 'warning'}>{r.status || 'Pending'}</Badge> },
            ]}
            data={recentTransfers}
            emptyMessage="No distribution transfers"
          />
        )}
      </Card>
    </div>
  );
}

function TransfersTab() {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ from_location: '', to_location: '', product_name: '', quantity: '' });
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);

  const loadTransfers = useCallback(() => {
    setLoading(true);
    api.stock.transfers()
      .then(d => setTransfers(Array.isArray(d) ? d : d.transfers || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadTransfers(); }, [loadTransfers]);

  const locations = [
    { value: '', label: 'Select location...' },
    { value: 'country_stock', label: 'Country Stock' },
    { value: 'windhoek_warehouse', label: 'Windhoek Warehouse' },
    { value: 'ondangwa_warehouse', label: 'Ondangwa Warehouse' },
    ...BRANCHES.map(b => ({ value: b.toLowerCase().replace(/\s+/g, '_'), label: b })),
  ];

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.from_location || !form.to_location || !form.product_name || !form.quantity) {
      setAlert({ type: 'error', msg: 'All fields are required' });
      return;
    }
    setSubmitting(true);
    try {
      await api.stock.createTransfer({
        from_location: form.from_location,
        to_location: form.to_location,
        product_name: form.product_name,
        quantity: Number(form.quantity),
      });
      setAlert({ type: 'success', msg: 'Transfer created successfully' });
      setForm({ from_location: '', to_location: '', product_name: '', quantity: '' });
      setShowNew(false);
      loadTransfers();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id, newStatus) => {
    try {
      await api.stock.updateTransfer(id, { status: newStatus });
      setAlert({ type: 'success', msg: `Transfer marked as ${newStatus}` });
      loadTransfers();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {alert && <Alert type={alert.type} className="mb-4">{alert.msg}</Alert>}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Stock Transfers</h3>
            <Button size="sm" onClick={() => setShowNew(true)}><Plus size={16} /> New Transfer</Button>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Date', render: r => formatDateTime(r.created_at) },
            { header: 'From', key: 'from_location' },
            { header: 'To', key: 'to_location' },
            { header: 'Product', key: 'product_name' },
            { header: 'Qty', key: 'quantity' },
            { header: 'Status', render: r => <Badge variant={r.status === 'completed' || r.status === 'delivered' ? 'success' : r.status === 'in_transit' || r.status === 'dispatched' ? 'info' : 'warning'}>{r.status || 'Pending'}</Badge> },
            { header: 'Actions', render: r => (
              <div className="flex gap-1 flex-wrap">
                {(!r.status || r.status === 'pending') && (
                  <Button size="sm" variant="warning" onClick={() => updateStatus(r.id, 'dispatched')}>Dispatch</Button>
                )}
                {r.status === 'dispatched' && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, 'in_transit')}>In Transit</Button>
                )}
                {(r.status === 'dispatched' || r.status === 'in_transit') && (
                  <Button size="sm" variant="success" onClick={() => updateStatus(r.id, 'delivered')}>Delivered</Button>
                )}
              </div>
            )},
          ]}
          data={transfers}
          emptyMessage="No transfers recorded"
        />
      </Card>

      <Modal open={showNew} onClose={() => setShowNew(false)} title="New Stock Transfer" size="md">
        <form onSubmit={handleCreate} className="p-6 space-y-4">
          <Select label="From Location" options={locations} value={form.from_location} onChange={e => setForm(f => ({ ...f, from_location: e.target.value }))} />
          <Select label="To Location" options={locations} value={form.to_location} onChange={e => setForm(f => ({ ...f, to_location: e.target.value }))} />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Product</label>
            <select
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
              value={form.product_name}
              onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
              required
            >
              <option value="">Select product...</option>
              {PRICE_LIST.map(p => (
                <option key={p.description} value={p.description}>{p.description}</option>
              ))}
            </select>
          </div>
          <Input label="Quantity" type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} required />
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create Transfer'}</Button>
            <Button variant="secondary" type="button" onClick={() => setShowNew(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function InventoryTab() {
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    api.stock.movements()
      .then(d => setMovements(Array.isArray(d) ? d : d.movements || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = movements.filter(m => {
    if (filterType && m.movement_type !== filterType) return false;
    if (filterLocation && m.location !== filterLocation) return false;
    if (searchTerm && !(m.product_name || '').toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const locations = [...new Set(movements.map(m => m.location).filter(Boolean))];
  const types = [...new Set(movements.map(m => m.movement_type).filter(Boolean))];

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">Stock Movements</h3>
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="pl-7 pr-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                  placeholder="Search product..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <select className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="">All Types</option>
                {types.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm" value={filterLocation} onChange={e => setFilterLocation(e.target.value)}>
                <option value="">All Locations</option>
                {locations.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Date', render: r => formatDateTime(r.created_at) },
            { header: 'Product', key: 'product_name' },
            { header: 'Type', render: r => <Badge variant={r.movement_type === 'in' ? 'success' : r.movement_type === 'out' ? 'danger' : 'warning'}>{r.movement_type || '-'}</Badge> },
            { header: 'Quantity', key: 'quantity' },
            { header: 'Location', key: 'location' },
            { header: 'Reference', key: 'reference' },
          ]}
          data={filtered}
          emptyMessage="No stock movements found"
        />
      </Card>
    </div>
  );
}

function OrdersTab() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ product_name: '', quantity: '', urgency: 'normal', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);

  const loadRequests = useCallback(() => {
    setLoading(true);
    api.stock.requests()
      .then(d => setRequests(Array.isArray(d) ? d : d.requests || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.product_name || !form.quantity) {
      setAlert({ type: 'error', msg: 'Product and quantity are required' });
      return;
    }
    setSubmitting(true);
    try {
      await api.stock.createRequest({
        product_name: form.product_name,
        quantity: Number(form.quantity),
        urgency: form.urgency,
        notes: form.notes,
      });
      setAlert({ type: 'success', msg: 'Stock request submitted successfully' });
      setForm({ product_name: '', quantity: '', urgency: 'normal', notes: '' });
      setShowForm(false);
      loadRequests();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {alert && <Alert type={alert.type} className="mb-4">{alert.msg}</Alert>}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Stock Orders / Requests</h3>
            <Button size="sm" onClick={() => setShowForm(true)}><Plus size={16} /> New Request</Button>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Date', render: r => formatDateTime(r.created_at) },
            { header: 'Product', key: 'product_name' },
            { header: 'Quantity', key: 'quantity' },
            { header: 'Urgency', render: r => <Badge variant={r.urgency === 'urgent' ? 'danger' : r.urgency === 'high' ? 'warning' : 'default'}>{r.urgency || 'Normal'}</Badge> },
            { header: 'Status', render: r => <Badge variant={r.status === 'approved' || r.status === 'fulfilled' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}>{r.status || 'Pending'}</Badge> },
            { header: 'Notes', key: 'notes' },
          ]}
          data={requests}
          emptyMessage="No stock requests"
        />
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="New Stock Request" size="md">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Product</label>
            <select
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
              value={form.product_name}
              onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
              required
            >
              <option value="">Select product...</option>
              {PRICE_LIST.map(p => (
                <option key={p.description} value={p.description}>{p.description}</option>
              ))}
            </select>
          </div>
          <Input label="Quantity" type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} required />
          <Select
            label="Urgency"
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'high', label: 'High' },
              { value: 'urgent', label: 'Urgent' },
            ]}
            value={form.urgency}
            onChange={e => setForm(f => ({ ...f, urgency: e.target.value }))}
          />
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional details..." />
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Request'}</Button>
            <Button variant="secondary" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function SharingTab() {
  const [configs, setConfigs] = useState([]);
  const [form, setForm] = useState({ from_branch: '', to_branch: '', product_name: '', max_quantity: '', auto_share: false });
  const [alert, setAlert] = useState(null);

  const handleAdd = (e) => {
    e.preventDefault();
    if (!form.from_branch || !form.to_branch || !form.product_name) {
      setAlert({ type: 'error', msg: 'All fields are required' });
      return;
    }
    if (form.from_branch === form.to_branch) {
      setAlert({ type: 'error', msg: 'Source and destination must be different' });
      return;
    }
    setConfigs(prev => [...prev, { ...form, id: Date.now(), max_quantity: Number(form.max_quantity) || 0 }]);
    setForm({ from_branch: '', to_branch: '', product_name: '', max_quantity: '', auto_share: false });
    setAlert({ type: 'success', msg: 'Sharing rule added' });
  };

  const removeConfig = (id) => {
    setConfigs(prev => prev.filter(c => c.id !== id));
  };

  const branchOptions = [
    { value: '', label: 'Select branch...' },
    { value: 'windhoek_warehouse', label: 'Windhoek Warehouse' },
    { value: 'ondangwa_warehouse', label: 'Ondangwa Warehouse' },
    ...BRANCHES.map(b => ({ value: b.toLowerCase().replace(/\s+/g, '_'), label: b })),
  ];

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} className="mb-4">{alert.msg}</Alert>}
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Add Sharing Rule</h3></CardHeader>
        <CardBody>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select label="From Branch/Warehouse" options={branchOptions} value={form.from_branch} onChange={e => setForm(f => ({ ...f, from_branch: e.target.value }))} />
              <Select label="To Branch/Warehouse" options={branchOptions} value={form.to_branch} onChange={e => setForm(f => ({ ...f, to_branch: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Product</label>
                <select
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                  value={form.product_name}
                  onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
                >
                  <option value="">Select product...</option>
                  {PRICE_LIST.map(p => (
                    <option key={p.description} value={p.description}>{p.description}</option>
                  ))}
                </select>
              </div>
              <Input label="Max Quantity" type="number" min="1" value={form.max_quantity} onChange={e => setForm(f => ({ ...f, max_quantity: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="autoShare" checked={form.auto_share} onChange={e => setForm(f => ({ ...f, auto_share: e.target.checked }))} className="rounded" />
              <label htmlFor="autoShare" className="text-sm text-gray-700">Enable automatic sharing when stock is low</label>
            </div>
            <Button type="submit"><Share2 size={16} /> Add Sharing Rule</Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Active Sharing Rules</h3></CardHeader>
        <Table
          columns={[
            { header: 'From', key: 'from_branch' },
            { header: 'To', key: 'to_branch' },
            { header: 'Product', key: 'product_name' },
            { header: 'Max Qty', key: 'max_quantity' },
            { header: 'Auto', render: r => <Badge variant={r.auto_share ? 'success' : 'default'}>{r.auto_share ? 'Yes' : 'No'}</Badge> },
            { header: 'Actions', render: r => <Button size="sm" variant="danger" onClick={() => removeConfig(r.id)}>Remove</Button> },
          ]}
          data={configs}
          emptyMessage="No sharing rules configured"
        />
      </Card>
    </div>
  );
}

function CountryInventoryTab() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    api.stock.batches()
      .then(d => setBatches(Array.isArray(d) ? d : d.batches || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const aggregated = {};
  batches.forEach(b => {
    const key = `${b.product_name}__${b.location}`;
    if (!aggregated[key]) {
      aggregated[key] = { product_name: b.product_name, location: b.location || 'Unknown', total_quantity: 0, total_value: 0, batch_count: 0 };
    }
    aggregated[key].total_quantity += Number(b.quantity || 0);
    aggregated[key].total_value += Number(b.quantity || 0) * Number(b.unit_price || 0);
    aggregated[key].batch_count += 1;
  });

  let aggregatedList = Object.values(aggregated);
  if (searchTerm) {
    aggregatedList = aggregatedList.filter(a => (a.product_name || '').toLowerCase().includes(searchTerm.toLowerCase()));
  }

  const exportCSV = () => {
    const headers = ['Product', 'Location', 'Total Quantity', 'Total Value', 'Batches'];
    const rows = aggregatedList.map(a => [
      `"${a.product_name}"`,
      `"${a.location}"`,
      a.total_quantity,
      a.total_value.toFixed(2),
      a.batch_count,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `country-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <LoadingSpinner />;

  const totalQty = aggregatedList.reduce((s, a) => s + a.total_quantity, 0);
  const totalVal = aggregatedList.reduce((s, a) => s + a.total_value, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Products" value={aggregatedList.length} color="blue" icon={<Package size={24} />} />
        <StatCard title="Total Quantity" value={totalQty.toLocaleString()} color="green" icon={<ClipboardList size={24} />} />
        <StatCard title="Total Value" value={formatCurrency(totalVal)} color="purple" icon={<BarChart3 size={24} />} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">Country-Wide Inventory</h3>
            <div className="flex gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="pl-7 pr-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                  placeholder="Search product..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <Button size="sm" variant="secondary" onClick={exportCSV}><Download size={16} /> Export CSV</Button>
            </div>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Product', key: 'product_name' },
            { header: 'Location', key: 'location' },
            { header: 'Total Qty', render: r => <span className={r.total_quantity < 10 ? 'text-red-600 font-bold' : 'font-medium'}>{r.total_quantity}</span> },
            { header: 'Value', render: r => formatCurrency(r.total_value) },
            { header: 'Batches', key: 'batch_count' },
          ]}
          data={aggregatedList}
          emptyMessage="No inventory data available"
        />
      </Card>
    </div>
  );
}

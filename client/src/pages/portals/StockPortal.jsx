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
    { id: 'invoices', label: 'Invoices', icon: '🧾' },
    { id: 'valuation', label: 'Valuation', icon: '💰' },
    { id: 'barcode', label: 'Barcode', icon: '🏷️' },
    { id: 'reorder', label: 'Reorder', icon: '⚠️' },
    { id: 'batch', label: 'Batch', icon: '🔢' },
    { id: 'realtime', label: 'Realtime', icon: '⚡' },
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
        {activeTab === 'invoices' && <InvoicesTab />}
        {activeTab === 'valuation' && <ValuationTab />}
        {activeTab === 'barcode' && <BarcodeTab />}
        {activeTab === 'reorder' && <ReorderTab />}
        {activeTab === 'batch' && <BatchTab />}
        {activeTab === 'realtime' && <RealtimeTab />}
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

function InvoicesTab() {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [viewPO, setViewPO] = useState(null);
  const [alert, setAlert] = useState(null);
  const [form, setForm] = useState({ supplier: '', items: [{ product_name: '', quantity: 1, unit_price: 0 }], status: 'Draft' });

  const generatePONumber = () => {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(purchaseOrders.length + 1).padStart(3, '0');
    return `PO-${date}-${seq}`;
  };

  const addItem = () => {
    setForm(f => ({ ...f, items: [...f.items, { product_name: '', quantity: 1, unit_price: 0 }] }));
  };

  const removeItem = (idx) => {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  };

  const updateItem = (idx, field, value) => {
    setForm(f => {
      const items = [...f.items];
      items[idx] = { ...items[idx], [field]: value };
      if (field === 'product_name') {
        const prod = PRICE_LIST.find(p => p.description === value);
        if (prod) items[idx].unit_price = prod.dp;
      }
      return { ...f, items };
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.supplier || form.items.length === 0 || !form.items[0].product_name) {
      setAlert({ type: 'error', msg: 'Supplier and at least one product are required' });
      return;
    }
    const po = {
      id: Date.now(),
      po_number: generatePONumber(),
      supplier: form.supplier,
      items: form.items.filter(i => i.product_name),
      items_count: form.items.filter(i => i.product_name).length,
      total_amount: form.items.filter(i => i.product_name).reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_price), 0),
      status: form.status,
      date: new Date().toISOString(),
    };
    setPurchaseOrders(prev => [po, ...prev]);
    setForm({ supplier: '', items: [{ product_name: '', quantity: 1, unit_price: 0 }], status: 'Draft' });
    setShowForm(false);
    setAlert({ type: 'success', msg: `Purchase order ${po.po_number} created` });
  };

  const markReceived = (id) => {
    setPurchaseOrders(prev => prev.map(po => po.id === id ? { ...po, status: 'Received' } : po));
    setAlert({ type: 'success', msg: 'Purchase order marked as received' });
  };

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} className="mb-4">{alert.msg}</Alert>}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Purchase Orders</h3>
            <Button size="sm" onClick={() => setShowForm(true)}><Plus size={16} /> New Purchase Order</Button>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'PO Number', key: 'po_number' },
            { header: 'Supplier', key: 'supplier' },
            { header: 'Items', key: 'items_count' },
            { header: 'Total', render: r => formatCurrency(r.total_amount) },
            { header: 'Status', render: r => <Badge variant={r.status === 'Received' ? 'success' : r.status === 'Submitted' ? 'info' : 'warning'}>{r.status}</Badge> },
            { header: 'Date', render: r => formatDate(r.date) },
            { header: 'Actions', render: r => (
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" onClick={() => setViewPO(r)}>View</Button>
                {r.status !== 'Received' && <Button size="sm" variant="success" onClick={() => markReceived(r.id)}>Mark Received</Button>}
              </div>
            )},
          ]}
          data={purchaseOrders}
          emptyMessage="No purchase orders yet"
        />
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="New Purchase Order" size="lg">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Input label="Supplier Name" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} required />
          <Select
            label="Status"
            options={[{ value: 'Draft', label: 'Draft' }, { value: 'Submitted', label: 'Submitted' }]}
            value={form.status}
            onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
          />
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">Products</label>
              <Button type="button" size="sm" variant="secondary" onClick={addItem}><Plus size={14} /> Add Item</Button>
            </div>
            {form.items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 mb-2 items-end">
                <div className="col-span-5">
                  <select
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                    value={item.product_name}
                    onChange={e => updateItem(idx, 'product_name', e.target.value)}
                  >
                    <option value="">Select product...</option>
                    {PRICE_LIST.map(p => <option key={p.description} value={p.description}>{p.description}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <input type="number" min="1" className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm" placeholder="Qty" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} />
                </div>
                <div className="col-span-2">
                  <input type="number" min="0" step="0.01" className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm" placeholder="Price" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', e.target.value)} />
                </div>
                <div className="col-span-2 text-sm font-medium text-gray-700 py-2.5">
                  {formatCurrency(Number(item.quantity) * Number(item.unit_price))}
                </div>
                <div className="col-span-1">
                  {form.items.length > 1 && <Button type="button" size="sm" variant="danger" onClick={() => removeItem(idx)}>×</Button>}
                </div>
              </div>
            ))}
            <div className="text-right font-bold text-gray-800 mt-2">
              Total: {formatCurrency(form.items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unit_price), 0))}
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit">Create Purchase Order</Button>
            <Button variant="secondary" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!viewPO} onClose={() => setViewPO(null)} title={viewPO ? `Purchase Order: ${viewPO.po_number}` : ''} size="lg">
        {viewPO && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><span className="text-sm text-gray-500">Supplier:</span> <span className="font-medium">{viewPO.supplier}</span></div>
              <div><span className="text-sm text-gray-500">Date:</span> <span className="font-medium">{formatDate(viewPO.date)}</span></div>
              <div><span className="text-sm text-gray-500">Status:</span> <Badge variant={viewPO.status === 'Received' ? 'success' : 'warning'}>{viewPO.status}</Badge></div>
              <div><span className="text-sm text-gray-500">Total:</span> <span className="font-bold">{formatCurrency(viewPO.total_amount)}</span></div>
            </div>
            <Table
              columns={[
                { header: 'Product', key: 'product_name' },
                { header: 'Quantity', key: 'quantity' },
                { header: 'Unit Price', render: r => formatCurrency(r.unit_price) },
                { header: 'Total', render: r => formatCurrency(Number(r.quantity) * Number(r.unit_price)) },
              ]}
              data={viewPO.items}
              emptyMessage="No items"
            />
          </div>
        )}
      </Modal>
    </div>
  );
}

function ValuationTab() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.stock.batches()
      .then(d => setBatches(Array.isArray(d) ? d : d.batches || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const getDP = (productName) => {
    const prod = PRICE_LIST.find(p => p.description === productName);
    return prod ? prod.dp : 0;
  };

  const locationGroups = {};
  batches.forEach(b => {
    const loc = (b.location || 'unknown').includes('windhoek') ? 'Windhoek' : (b.location || 'unknown').includes('ondangwa') ? 'Ondangwa' : 'Country';
    if (!locationGroups[loc]) locationGroups[loc] = { items: 0, value: 0 };
    const qty = Number(b.quantity || 0);
    const dp = getDP(b.product_name) || Number(b.unit_price || 0);
    locationGroups[loc].items += qty;
    locationGroups[loc].value += qty * dp;
  });

  const breakdown = batches.map(b => {
    const qty = Number(b.quantity || 0);
    const dp = getDP(b.product_name) || Number(b.unit_price || 0);
    return { product_name: b.product_name, location: b.location || 'Unknown', quantity: qty, unit_price: dp, total_value: qty * dp };
  });

  const grandTotal = breakdown.reduce((s, r) => s + r.total_value, 0);
  const grandItems = breakdown.reduce((s, r) => s + r.quantity, 0);

  const colors = { Windhoek: 'blue', Ondangwa: 'orange', Country: 'green' };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {['Windhoek', 'Ondangwa', 'Country'].map(loc => (
          <StatCard
            key={loc}
            title={`${loc} Stock`}
            value={formatCurrency((locationGroups[loc] || {}).value || 0)}
            subtitle={`${((locationGroups[loc] || {}).items || 0).toLocaleString()} items`}
            color={colors[loc]}
            icon={<Warehouse size={24} />}
          />
        ))}
      </div>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Category Breakdown</h3></CardHeader>
        <Table
          columns={[
            { header: 'Product', key: 'product_name' },
            { header: 'Location', key: 'location' },
            { header: 'Quantity', key: 'quantity' },
            { header: 'Unit Price (DP)', render: r => formatCurrency(r.unit_price) },
            { header: 'Total Value', render: r => formatCurrency(r.total_value) },
          ]}
          data={breakdown}
          emptyMessage="No stock data for valuation"
        />
      </Card>

      <Card className="bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200">
        <CardBody>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-emerald-600 font-medium">Grand Total Stock Value</p>
              <p className="text-3xl font-bold text-emerald-800">{formatCurrency(grandTotal)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-emerald-600">Total Items</p>
              <p className="text-2xl font-bold text-emerald-800">{grandItems.toLocaleString()}</p>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function BarcodeTab() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);

  const results = searchTerm.length >= 2
    ? PRICE_LIST.map((p, idx) => ({ ...p, idx })).filter(p => p.description.toLowerCase().includes(searchTerm.toLowerCase()))
    : [];

  const generateBarcode = (idx) => `DYN-${String(idx).padStart(4, '0')}`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Barcode Lookup</h3></CardHeader>
        <CardBody>
          <div className="relative max-w-lg">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
              placeholder="Search by product name or code..."
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setSelectedProduct(null); }}
            />
          </div>
        </CardBody>
      </Card>

      {selectedProduct && (
        <Card className="border-primary/30">
          <CardBody>
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-1 space-y-3">
                <h3 className="text-lg font-bold text-gray-800">{selectedProduct.description}</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 p-3 rounded-lg text-center">
                    <p className="text-xs text-blue-600">DP Price</p>
                    <p className="text-lg font-bold text-blue-800">{formatCurrency(selectedProduct.dp)}</p>
                  </div>
                  <div className="bg-green-50 p-3 rounded-lg text-center">
                    <p className="text-xs text-green-600">CP Price</p>
                    <p className="text-lg font-bold text-green-800">{formatCurrency(selectedProduct.cp)}</p>
                  </div>
                  <div className="bg-purple-50 p-3 rounded-lg text-center">
                    <p className="text-xs text-purple-600">BV</p>
                    <p className="text-lg font-bold text-purple-800">{selectedProduct.bv}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center bg-gray-50 p-6 rounded-lg min-w-[200px]">
                <div className="flex gap-[2px] mb-2">
                  {generateBarcode(selectedProduct.idx).split('').map((c, i) => (
                    <div key={i} className="bg-black" style={{ width: (c.charCodeAt(0) % 3) + 1 + 'px', height: '60px' }} />
                  ))}
                  {Array.from({ length: 20 }).map((_, i) => (
                    <div key={`b${i}`} className="bg-black" style={{ width: ((i * 7 + 3) % 3) + 1 + 'px', height: '60px', marginLeft: ((i * 3) % 2) + 1 + 'px' }} />
                  ))}
                </div>
                <p className="text-sm font-mono font-bold text-gray-700">{generateBarcode(selectedProduct.idx)}</p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {results.length > 0 && !selectedProduct && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Search Results ({results.length})</h3></CardHeader>
          <Table
            columns={[
              { header: 'Code', render: r => <span className="font-mono text-xs">{generateBarcode(r.idx)}</span> },
              { header: 'Product', key: 'description' },
              { header: 'DP', render: r => formatCurrency(r.dp) },
              { header: 'CP', render: r => formatCurrency(r.cp) },
              { header: 'BV', key: 'bv' },
              { header: 'Action', render: r => <Button size="sm" onClick={() => setSelectedProduct(r)}>View</Button> },
            ]}
            data={results}
            emptyMessage="No products found"
          />
        </Card>
      )}

      {searchTerm.length >= 2 && results.length === 0 && (
        <EmptyState icon={<Search size={48} />} title="No products found" description={`No products matching "${searchTerm}"`} />
      )}
    </div>
  );
}

function ReorderTab() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [thresholds, setThresholds] = useState({});
  const [editProduct, setEditProduct] = useState(null);
  const [editThreshold, setEditThreshold] = useState('');
  const defaultReorderLevel = 10;

  useEffect(() => {
    api.stock.batches()
      .then(d => setBatches(Array.isArray(d) ? d : d.batches || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const stockByProduct = {};
  batches.forEach(b => {
    const name = b.product_name || 'Unknown';
    if (!stockByProduct[name]) stockByProduct[name] = 0;
    stockByProduct[name] += Number(b.quantity || 0);
  });

  const alerts = Object.entries(stockByProduct).map(([product_name, current_qty]) => {
    const reorder_level = thresholds[product_name] || defaultReorderLevel;
    let status = 'OK';
    if (current_qty < 5) status = 'Critical';
    else if (current_qty < reorder_level) status = 'Low';
    return { product_name, current_qty, reorder_level, status };
  }).sort((a, b) => {
    const order = { Critical: 0, Low: 1, OK: 2 };
    return order[a.status] - order[b.status];
  });

  const criticalCount = alerts.filter(a => a.status === 'Critical').length;
  const lowCount = alerts.filter(a => a.status === 'Low').length;

  const saveThreshold = () => {
    if (editProduct && editThreshold) {
      setThresholds(prev => ({ ...prev, [editProduct]: Number(editThreshold) }));
      setEditProduct(null);
      setEditThreshold('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Critical Items" value={criticalCount} color="red" icon={<Package size={24} />} />
        <StatCard title="Low Stock Items" value={lowCount} color="orange" icon={<Package size={24} />} />
        <StatCard title="OK Items" value={alerts.length - criticalCount - lowCount} color="green" icon={<Package size={24} />} />
      </div>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Reorder Alerts</h3></CardHeader>
        <Table
          columns={[
            { header: 'Product', key: 'product_name' },
            { header: 'Current Qty', render: r => <span className={r.status === 'Critical' ? 'text-red-600 font-bold' : r.status === 'Low' ? 'text-amber-600 font-bold' : 'font-medium'}>{r.current_qty}</span> },
            { header: 'Reorder Level', key: 'reorder_level' },
            { header: 'Status', render: r => <Badge variant={r.status === 'Critical' ? 'danger' : r.status === 'Low' ? 'warning' : 'success'}>{r.status}</Badge> },
            { header: 'Actions', render: r => (
              <Button size="sm" variant="secondary" onClick={() => { setEditProduct(r.product_name); setEditThreshold(String(r.reorder_level)); }}>Set Threshold</Button>
            )},
          ]}
          data={alerts}
          emptyMessage="No stock data available"
        />
      </Card>

      <Modal open={!!editProduct} onClose={() => setEditProduct(null)} title={`Set Reorder Threshold: ${editProduct}`} size="sm">
        <div className="p-6 space-y-4">
          <Input label="Reorder Threshold" type="number" min="1" value={editThreshold} onChange={e => setEditThreshold(e.target.value)} />
          <div className="flex gap-3">
            <Button onClick={saveThreshold}>Save Threshold</Button>
            <Button variant="secondary" onClick={() => setEditProduct(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function BatchTab() {
  const [localBatches, setLocalBatches] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [alert, setAlert] = useState(null);
  const [form, setForm] = useState({ product_name: '', quantity: '', manufacture_date: '', expiry_date: '', location: 'Windhoek' });

  const generateBatchNumber = () => {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const seq = String(localBatches.length + 1).padStart(3, '0');
    return `BATCH-${date}-${seq}`;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.product_name || !form.quantity) {
      setAlert({ type: 'error', msg: 'Product and quantity are required' });
      return;
    }
    const batch = {
      id: Date.now(),
      batch_number: generateBatchNumber(),
      product_name: form.product_name,
      quantity: Number(form.quantity),
      manufacture_date: form.manufacture_date || null,
      expiry_date: form.expiry_date || null,
      location: form.location,
    };
    setLocalBatches(prev => [batch, ...prev]);
    setForm({ product_name: '', quantity: '', manufacture_date: '', expiry_date: '', location: 'Windhoek' });
    setShowForm(false);
    setAlert({ type: 'success', msg: `Batch ${batch.batch_number} created` });
  };

  const getDaysUntilExpiry = (expiryDate) => {
    if (!expiryDate) return null;
    const diff = new Date(expiryDate) - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const getExpiryStatus = (days) => {
    if (days === null) return { label: 'N/A', variant: 'default' };
    if (days <= 0) return { label: 'Expired', variant: 'danger' };
    if (days <= 30) return { label: 'Expiring Soon', variant: 'warning' };
    return { label: 'OK', variant: 'success' };
  };

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} className="mb-4">{alert.msg}</Alert>}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Batch Tracking</h3>
            <Button size="sm" onClick={() => setShowForm(true)}><Plus size={16} /> New Batch</Button>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Batch Number', key: 'batch_number' },
            { header: 'Product', key: 'product_name' },
            { header: 'Quantity', key: 'quantity' },
            { header: 'Manufacture Date', render: r => formatDate(r.manufacture_date) },
            { header: 'Expiry Date', render: r => formatDate(r.expiry_date) },
            { header: 'Location', key: 'location' },
            { header: 'Days to Expiry', render: r => { const d = getDaysUntilExpiry(r.expiry_date); return d !== null ? d : '-'; } },
            { header: 'Status', render: r => { const s = getExpiryStatus(getDaysUntilExpiry(r.expiry_date)); return <Badge variant={s.variant}>{s.label}</Badge>; } },
          ]}
          data={localBatches}
          emptyMessage="No batches tracked yet"
        />
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="New Batch" size="md">
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
              {PRICE_LIST.map(p => <option key={p.description} value={p.description}>{p.description}</option>)}
            </select>
          </div>
          <Input label="Quantity" type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} required />
          <Input label="Manufacture Date" type="date" value={form.manufacture_date} onChange={e => setForm(f => ({ ...f, manufacture_date: e.target.value }))} />
          <Input label="Expiry Date" type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} />
          <Select
            label="Location"
            options={[{ value: 'Windhoek', label: 'Windhoek' }, { value: 'Ondangwa', label: 'Ondangwa' }]}
            value={form.location}
            onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
          />
          <div className="flex gap-3 pt-2">
            <Button type="submit">Create Batch</Button>
            <Button variant="secondary" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function RealtimeTab() {
  const [batches, setBatches] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchData = useCallback(() => {
    Promise.all([
      api.stock.batches().then(d => Array.isArray(d) ? d : d.batches || []).catch(() => []),
      api.stock.movements().then(d => Array.isArray(d) ? d : d.movements || []).catch(() => []),
    ]).then(([b, m]) => {
      setBatches(b);
      setMovements(m);
      setLastRefresh(new Date());
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) return <LoadingSpinner />;

  const stockByProduct = {};
  batches.forEach(b => {
    const name = b.product_name || 'Unknown';
    if (!stockByProduct[name]) stockByProduct[name] = { qty: 0, lastMovement: null };
    stockByProduct[name].qty += Number(b.quantity || 0);
  });

  movements.forEach(m => {
    const name = m.product_name || 'Unknown';
    if (stockByProduct[name] && (!stockByProduct[name].lastMovement || new Date(m.created_at) > new Date(stockByProduct[name].lastMovement))) {
      stockByProduct[name].lastMovement = m.created_at;
    }
  });

  const stockCards = Object.entries(stockByProduct).map(([name, data]) => ({ name, ...data }));
  const recentMovements = [...movements].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <Zap size={20} className="text-yellow-500" /> Real-Time Stock Dashboard
          </h3>
          <p className="text-xs text-gray-500">Auto-refreshes every 30 seconds • Last: {formatDateTime(lastRefresh)}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={fetchData}><Zap size={14} /> Refresh Now</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {stockCards.map(item => (
          <Card key={item.name} className="hover:shadow-md transition-shadow">
            <CardBody>
              <h4 className="text-sm font-semibold text-gray-800 truncate" title={item.name}>{item.name}</h4>
              <div className="flex justify-between items-end mt-2">
                <div>
                  <p className="text-2xl font-bold text-primary">{item.qty}</p>
                  <p className="text-xs text-gray-400">in stock</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">{item.lastMovement ? formatDateTime(item.lastMovement) : 'No movements'}</p>
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
        {stockCards.length === 0 && <div className="col-span-full"><EmptyState icon={<Package size={48} />} title="No stock data" description="No real-time stock data available" /></div>}
      </div>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Live Movement Feed</h3></CardHeader>
        <Table
          columns={[
            { header: 'Time', render: r => formatDateTime(r.created_at) },
            { header: 'Product', key: 'product_name' },
            { header: 'Type', render: r => <Badge variant={r.movement_type === 'in' ? 'success' : r.movement_type === 'out' ? 'danger' : 'warning'}>{r.movement_type || 'Movement'}</Badge> },
            { header: 'Quantity', key: 'quantity' },
            { header: 'Location', key: 'location' },
          ]}
          data={recentMovements}
          emptyMessage="No recent movements"
        />
      </Card>
    </div>
  );
}

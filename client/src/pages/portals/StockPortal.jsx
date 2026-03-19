import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';
import { PRICE_LIST, getCIFPrice, getProductProfit, findProductPrice } from '../../lib/pricing';
import { formatCurrency, formatDateTime, formatDate, BRANCHES } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Table, Modal, Alert, Select, Textarea } from '../../components/ui';
import { Package, Warehouse, Truck, ArrowLeftRight, Globe, BarChart3, ClipboardList, FileSpreadsheet, Zap, Share2, ShoppingCart, Plus, Download, Filter, Search, DollarSign, TrendingUp, Ship, Calendar } from 'lucide-react';

export default function StockPortal() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const canViewProfit = ['admin', 'gm', 'director'].includes(user?.role);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'supplierImport', label: 'Supplier Import', icon: '🚢' },
    { id: 'countryStock', label: 'Country Stock', icon: '🌍' },
    { id: 'windhoek', label: 'Windhoek', icon: '🏢' },
    { id: 'ondangwa', label: 'Ondangwa', icon: '🏬' },
    { id: 'distribution', label: 'Distribution', icon: '🚚' },
    { id: 'transfers', label: 'Transfers', icon: '🔄' },
    { id: 'inventory', label: 'Inventory', icon: '📦' },
    { id: 'orders', label: 'Orders', icon: '🧾' },
    { id: 'monthlySales', label: 'Monthly Sales', icon: '📈' },
    ...(canViewProfit ? [{ id: 'profitAnalysis', label: 'Profit Analysis', icon: '💰' }] : []),
    { id: 'countryInventory', label: 'Country Inv.', icon: '🗂️' },
    { id: 'valuation', label: 'Valuation', icon: '💎' },
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
        <p className="text-sm text-gray-500">Warehouse management, supplier imports, transfers, and inventory tracking</p>
      </div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'supplierImport' && <SupplierImportTab />}
        {activeTab === 'countryStock' && <CountryStockTab />}
        {activeTab === 'windhoek' && <WarehouseTab name="Windhoek" />}
        {activeTab === 'ondangwa' && <WarehouseTab name="Ondangwa" />}
        {activeTab === 'distribution' && <DistributionTab />}
        {activeTab === 'transfers' && <TransfersTab />}
        {activeTab === 'inventory' && <InventoryTab />}
        {activeTab === 'orders' && <OrdersTab />}
        {activeTab === 'monthlySales' && <MonthlySalesTab />}
        {activeTab === 'profitAnalysis' && canViewProfit && <ProfitAnalysisTab />}
        {activeTab === 'countryInventory' && <CountryInventoryTab />}
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
  const pendingTransfers = data.transfers.filter(t => t.status === 'pending').length;
  const inTransit = data.transfers.filter(t => t.status === 'in_transit' || t.status === 'dispatched').length;

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Stock Items" value={totalItems.toLocaleString()} color="blue" icon={<Package size={24} />} />
        <StatCard title="Total Stock Value (DP)" value={formatCurrency(totalValue)} color="green" icon={<BarChart3 size={24} />} />
        <StatCard title="Pending Transfers" value={pendingTransfers} color="orange" icon={<ArrowLeftRight size={24} />} />
        <StatCard title="In Transit" value={inTransit} color="purple" icon={<Truck size={24} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Recent Stock Movements</h3></CardHeader>
          <Table
            columns={[
              { header: 'Date', render: r => formatDateTime(r.created_at) },
              { header: 'Product', key: 'product_name' },
              { header: 'Type', render: r => <Badge variant={r.movement_type === 'in' ? 'success' : 'warning'}>{r.movement_type || 'Movement'}</Badge> },
              { header: 'Qty', key: 'quantity' },
              { header: 'Location', key: 'location' },
            ]}
            data={data.movements.slice(0, 15)}
            emptyMessage="No recent movements"
          />
        </Card>

        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Stock by Location</h3></CardHeader>
          <CardBody>
            {(() => {
              const byLoc = {};
              data.batches.forEach(b => {
                const loc = b.location || 'unknown';
                const label = loc.includes('windhoek') ? 'Windhoek Warehouse' : loc.includes('ondangwa') ? 'Ondangwa Warehouse' : loc === 'country_stock' ? 'Country Stock' : loc;
                if (!byLoc[label]) byLoc[label] = { qty: 0, value: 0 };
                const qty = Number(b.quantity || 0);
                byLoc[label].qty += qty;
                byLoc[label].value += qty * Number(b.unit_price || 0);
              });
              return Object.entries(byLoc).map(([loc, d]) => (
                <div key={loc} className="flex justify-between items-center py-3 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="font-medium text-gray-800">{loc}</p>
                    <p className="text-xs text-gray-500">{d.qty.toLocaleString()} items</p>
                  </div>
                  <span className="font-bold text-gray-700">{formatCurrency(d.value)}</span>
                </div>
              ));
            })()}
            {data.batches.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No stock data</p>}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function SupplierImportTab() {
  const [showForm, setShowForm] = useState(false);
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);
  const [items, setItems] = useState([{ product_name: '', quantity: '', cif_price: '' }]);
  const [form, setForm] = useState({ supplier: 'Dynapharm International (Malaysia)', shipping_ref: '', arrival_date: '', notes: '' });

  useEffect(() => {
    api.stock.batches()
      .then(d => {
        const all = Array.isArray(d) ? d : d.batches || [];
        setImports(all.filter(b => b.location === 'country_stock').sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const addItem = () => setItems(prev => [...prev, { product_name: '', quantity: '', cif_price: '' }]);
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = (idx, field, value) => {
    setItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      if (field === 'product_name') {
        const cif = getCIFPrice(value);
        if (cif > 0) updated[idx].cif_price = String(cif);
      }
      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validItems = items.filter(i => i.product_name && Number(i.quantity) > 0);
    if (validItems.length === 0) {
      setAlert({ type: 'error', msg: 'Add at least one product with quantity' });
      return;
    }
    setSubmitting(true);
    try {
      for (const item of validItems) {
        await api.stock.createBatch({
          product_name: item.product_name,
          quantity: Number(item.quantity),
          batch_number: form.shipping_ref || `IMP-${Date.now()}`,
          expiry_date: null,
          unit_price: Number(item.cif_price) || getCIFPrice(item.product_name),
          location: 'country_stock',
          notes: `Supplier: ${form.supplier} | Ref: ${form.shipping_ref} | ${form.notes}`,
        });
      }
      setAlert({ type: 'success', msg: `${validItems.length} product(s) imported to Country Stock successfully` });
      setItems([{ product_name: '', quantity: '', cif_price: '' }]);
      setForm({ supplier: 'Dynapharm International (Malaysia)', shipping_ref: '', arrival_date: '', notes: '' });
      setShowForm(false);
      const d = await api.stock.batches().catch(() => []);
      const all = Array.isArray(d) ? d : d.batches || [];
      setImports(all.filter(b => b.location === 'country_stock').sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const totalCIF = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.cif_price) || 0), 0);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} className="mb-4">{alert.msg}</Alert>}

      <Card className="bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200">
        <CardBody>
          <div className="flex items-start gap-4">
            <Ship size={32} className="text-blue-600 mt-1" />
            <div>
              <h3 className="font-bold text-blue-900">Supplier Import from Malaysia</h3>
              <p className="text-sm text-blue-700 mt-1">
                Record stock shipments from Dynapharm International Malaysia. CIF (Cost, Insurance, Freight) prices are auto-populated from the price list.
                Stock arrives at Country Stock level, then gets distributed to warehouses and branches.
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Supplier Import Shipments</h3>
            <Button size="sm" onClick={() => setShowForm(true)}><Plus size={16} /> New Import Shipment</Button>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Date', render: r => formatDateTime(r.created_at) },
            { header: 'Product', key: 'product_name' },
            { header: 'Batch/Ref', key: 'batch_number' },
            { header: 'Qty', key: 'quantity' },
            { header: 'CIF Price', render: r => formatCurrency(Number(r.unit_price || 0)) },
            { header: 'CIF Total', render: r => formatCurrency(Number(r.quantity || 0) * Number(r.unit_price || 0)) },
          ]}
          data={imports.slice(0, 50)}
          emptyMessage="No import shipments recorded"
        />
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Record Import Shipment from Malaysia" size="lg">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Supplier" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} />
            <Input label="Shipping Reference / B/L No." value={form.shipping_ref} onChange={e => setForm(f => ({ ...f, shipping_ref: e.target.value }))} placeholder="e.g. BL-2026-0042" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Arrival Date" type="date" value={form.arrival_date} onChange={e => setForm(f => ({ ...f, arrival_date: e.target.value }))} />
            <Input label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Container no., remarks..." />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">Products in Shipment</label>
              <Button type="button" size="sm" variant="secondary" onClick={addItem}><Plus size={14} /> Add Product</Button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
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
                    <input type="number" min="0" step="0.01" className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm" placeholder="CIF N$" value={item.cif_price} onChange={e => updateItem(idx, 'cif_price', e.target.value)} />
                  </div>
                  <div className="col-span-2 text-sm font-medium text-gray-700 py-2.5">
                    {formatCurrency((Number(item.quantity) || 0) * (Number(item.cif_price) || 0))}
                  </div>
                  <div className="col-span-1">
                    {items.length > 1 && <Button type="button" size="sm" variant="danger" onClick={() => removeItem(idx)}>×</Button>}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-right mt-3 font-bold text-gray-800">
              Total CIF Value: {formatCurrency(totalCIF)}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={submitting}><Ship size={16} /> {submitting ? 'Importing...' : 'Record Import'}</Button>
            <Button variant="secondary" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
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

  const totalQty = batches.reduce((s, b) => s + Number(b.quantity || 0), 0);
  const totalValue = batches.reduce((s, b) => s + Number(b.quantity || 0) * Number(b.unit_price || 0), 0);

  return (
    <div>
      {alert && <Alert type={alert.type} className="mb-4">{alert.msg}</Alert>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard title="Products in Country" value={batches.length} color="blue" icon={<Globe size={24} />} />
        <StatCard title="Total Quantity" value={totalQty.toLocaleString()} color="green" icon={<Package size={24} />} />
        <StatCard title="Total Value" value={formatCurrency(totalValue)} color="purple" icon={<DollarSign size={24} />} />
      </div>

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
                setForm(f => ({ ...f, product_name: e.target.value, unit_price: prod ? String(prod.cif) : f.unit_price }));
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
              CIF: {formatCurrency(selectedProduct.cif)} | DP: {formatCurrency(selectedProduct.dp)} | CP: {formatCurrency(selectedProduct.cp)} | BV: {selectedProduct.bv}
            </div>
          )}
          <Input label="Quantity" type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} required />
          <Input label="Batch Number" value={form.batch_number} onChange={e => setForm(f => ({ ...f, batch_number: e.target.value }))} placeholder="Auto-generated if empty" />
          <Input label="Expiry Date" type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} />
          <Input label="CIF Price (N$)" type="number" min="0" step="0.01" value={form.unit_price} onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))} />
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

function MonthlySalesTab() {
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.orders.list().then(d => Array.isArray(d) ? d : d.orders || []).catch(() => []),
      api.branch.walkinSales().then(d => Array.isArray(d) ? d : d.sales || d.walkin_sales || []).catch(() => []),
    ]).then(([orders, walkinSales]) => {
      const allSales = [];

      orders.forEach(o => {
        const date = new Date(o.created_at || o.date);
        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const items = o.items || [];
        items.forEach(item => {
          const itemName = item.name || item.product_name || 'Unknown';
          const prod = findProductPrice(itemName);
          allSales.push({
            month,
            product_name: prod ? prod.description : itemName,
            quantity: Number(item.quantity || item.qty || 1),
            dp_price: prod ? prod.dp : Number(item.unit_price || item.price || 0),
            cif_price: prod ? prod.cif : 0,
            source: 'online',
            branch: o.branch || o.delivery_branch || '-',
          });
        });
      });

      walkinSales.forEach(s => {
        const date = new Date(s.created_at || s.sale_date);
        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const items = s.items || [];
        items.forEach(item => {
          const itemName = item.name || item.product_name || 'Unknown';
          const prod = findProductPrice(itemName);
          allSales.push({
            month,
            product_name: prod ? prod.description : itemName,
            quantity: Number(item.quantity || item.qty || 1),
            dp_price: prod ? prod.dp : Number(item.unit_price || item.price || 0),
            cif_price: prod ? prod.cif : 0,
            source: 'walkin',
            branch: s.branch || '-',
          });
        });
      });

      setSalesData(allSales);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const months = [...new Set(salesData.map(s => s.month))].sort().reverse();
  if (months.length > 0 && !months.includes(selectedMonth)) {
    // keep selected or fallback
  }

  const monthData = salesData.filter(s => s.month === selectedMonth);

  const byProduct = {};
  monthData.forEach(s => {
    if (!byProduct[s.product_name]) byProduct[s.product_name] = { product_name: s.product_name, total_qty: 0, total_revenue: 0 };
    byProduct[s.product_name].total_qty += s.quantity;
    byProduct[s.product_name].total_revenue += s.quantity * s.dp_price;
  });
  const productSummary = Object.values(byProduct).sort((a, b) => b.total_revenue - a.total_revenue);

  const totalRevenue = productSummary.reduce((s, p) => s + p.total_revenue, 0);
  const totalQty = productSummary.reduce((s, p) => s + p.total_qty, 0);

  const monthLabel = selectedMonth ? new Date(selectedMonth + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) : 'All';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar size={20} className="text-gray-500" />
          <select
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
          >
            {months.length > 0 ? months.map(m => (
              <option key={m} value={m}>{new Date(m + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}</option>
            )) : <option value={selectedMonth}>{monthLabel}</option>}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title={`Sales Revenue (${monthLabel})`} value={formatCurrency(totalRevenue)} color="green" icon={<DollarSign size={24} />} />
        <StatCard title="Units Sold" value={totalQty.toLocaleString()} color="blue" icon={<Package size={24} />} />
        <StatCard title="Products Sold" value={productSummary.length} color="purple" icon={<BarChart3 size={24} />} />
      </div>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Sales by Product — {monthLabel}</h3></CardHeader>
        <Table
          columns={[
            { header: '#', render: (_, i) => i + 1 },
            { header: 'Product', key: 'product_name' },
            { header: 'Qty Sold', render: r => r.total_qty.toLocaleString() },
            { header: 'DP Revenue', render: r => formatCurrency(r.total_revenue) },
            { header: '% of Total', render: r => totalRevenue > 0 ? `${((r.total_revenue / totalRevenue) * 100).toFixed(1)}%` : '0%' },
          ]}
          data={productSummary}
          emptyMessage="No sales data for this month"
        />
      </Card>

      {monthData.length === 0 && (
        <Alert type="info">No sales recorded for {monthLabel}. Sales data comes from online orders and branch walk-in sales.</Alert>
      )}
    </div>
  );
}

function ProfitAnalysisTab() {
  const { user } = useAuth();
  const canView = ['admin', 'gm', 'director'].includes(user?.role);
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [campaignPrices, setCampaignPrices] = useState({});
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [campaignPrice, setCampaignPrice] = useState('');

  useEffect(() => {
    if (!canView) { setLoading(false); return; }
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
  }, [canView]);

  if (!canView) {
    return (
      <Alert type="error">
        <strong>Access Restricted</strong> — Profit analysis is only available to the General Manager and Director.
      </Alert>
    );
  }

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
    return {
      product_name: p.description,
      cif: p.cif,
      dp: p.dp,
      cp: p.cp,
      campaign_price: campaign || null,
      selling_price: sellingPrice,
      profit_per_unit: profit,
      margin: Math.round(margin * 10) / 10,
      qty_sold: qtySold,
      total_profit: totalProfit,
    };
  }).sort((a, b) => b.total_profit - a.total_profit);

  const totalCIF = profitRows.reduce((s, r) => s + r.cif * r.qty_sold, 0);
  const totalRevenue = profitRows.reduce((s, r) => s + r.selling_price * r.qty_sold, 0);
  const grandProfit = profitRows.reduce((s, r) => s + r.total_profit, 0);
  const avgMargin = totalRevenue > 0 ? ((grandProfit / totalRevenue) * 100).toFixed(1) : '0';

  const saveCampaign = () => {
    if (editingCampaign && campaignPrice) {
      setCampaignPrices(prev => ({ ...prev, [editingCampaign]: Number(campaignPrice) }));
    }
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
              <p className="text-sm text-emerald-700 mt-1">
                Stock is imported from Malaysia at CIF price (Cost + Insurance + Freight). Sold at DP (Distributor Price).
                Profit = DP - CIF per unit. Campaign pricing adjustments are supported.
              </p>
              <p className="text-xs text-emerald-600 mt-1 font-medium">
                Restricted to General Manager and Director only.
              </p>
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
                  <td className="px-4 py-2.5 text-right">
                    <span className={`font-medium ${r.margin >= 50 ? 'text-green-600' : r.margin >= 30 ? 'text-blue-600' : 'text-orange-600'}`}>
                      {r.margin}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">{r.qty_sold > 0 ? r.qty_sold : '-'}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-green-700">{r.total_profit > 0 ? formatCurrency(r.total_profit) : '-'}</td>
                  <td className="px-4 py-2.5">
                    <button
                      className="text-xs text-blue-600 hover:underline"
                      onClick={() => { setEditingCampaign(r.product_name); setCampaignPrice(String(r.campaign_price || r.dp)); }}
                    >
                      Set Campaign
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={!!editingCampaign} onClose={() => setEditingCampaign(null)} title={`Campaign Price: ${editingCampaign}`} size="sm">
        <div className="p-6 space-y-4">
          {editingCampaign && (() => {
            const prod = PRICE_LIST.find(p => p.description === editingCampaign);
            return prod ? (
              <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                <p>CIF: {formatCurrency(prod.cif)} | DP: {formatCurrency(prod.dp)} | CP: {formatCurrency(prod.cp)}</p>
              </div>
            ) : null;
          })()}
          <Input label="Campaign Selling Price (N$)" type="number" min="0" step="0.01" value={campaignPrice} onChange={e => setCampaignPrice(e.target.value)} />
          <div className="flex gap-3">
            <Button onClick={saveCampaign}>Apply Campaign Price</Button>
            <Button variant="secondary" onClick={() => {
              setCampaignPrices(prev => { const n = { ...prev }; delete n[editingCampaign]; return n; });
              setEditingCampaign(null);
            }}>Reset to DP</Button>
          </div>
        </div>
      </Modal>
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
        <CardHeader><h3 className="font-bold text-gray-800">Stock Valuation Breakdown (DP Prices)</h3></CardHeader>
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
  const [apiBatches, setApiBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [alert, setAlert] = useState(null);
  const [form, setForm] = useState({ product_name: '', quantity: '', manufacture_date: '', expiry_date: '', location: 'country_stock' });

  useEffect(() => {
    api.stock.batches()
      .then(d => setApiBatches(Array.isArray(d) ? d : d.batches || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.product_name || !form.quantity) {
      setAlert({ type: 'error', msg: 'Product and quantity are required' });
      return;
    }
    try {
      await api.stock.createBatch({
        product_name: form.product_name,
        quantity: Number(form.quantity),
        batch_number: `BATCH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(localBatches.length + apiBatches.length + 1).padStart(3, '0')}`,
        expiry_date: form.expiry_date || null,
        unit_price: getCIFPrice(form.product_name),
        location: form.location,
      });
      setAlert({ type: 'success', msg: 'Batch created and saved' });
      setForm({ product_name: '', quantity: '', manufacture_date: '', expiry_date: '', location: 'country_stock' });
      setShowForm(false);
      const d = await api.stock.batches().catch(() => []);
      setApiBatches(Array.isArray(d) ? d : d.batches || []);
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    }
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

  if (loading) return <LoadingSpinner />;

  const allBatches = [...apiBatches.map(b => ({
    batch_number: b.batch_number || b.barcode || '-',
    product_name: b.product_name,
    quantity: b.quantity,
    manufacture_date: null,
    expiry_date: b.expiry_date,
    location: b.location || '-',
  }))];

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
            { header: 'Expiry Date', render: r => r.expiry_date ? formatDate(r.expiry_date) : '-' },
            { header: 'Location', key: 'location' },
            { header: 'Days to Expiry', render: r => { const d = getDaysUntilExpiry(r.expiry_date); return d !== null ? d : '-'; } },
            { header: 'Status', render: r => { const s = getExpiryStatus(getDaysUntilExpiry(r.expiry_date)); return <Badge variant={s.variant}>{s.label}</Badge>; } },
          ]}
          data={allBatches}
          emptyMessage="No batches tracked"
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
            options={[
              { value: 'country_stock', label: 'Country Stock' },
              { value: 'windhoek_warehouse', label: 'Windhoek Warehouse' },
              { value: 'ondangwa_warehouse', label: 'Ondangwa Warehouse' },
            ]}
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
          <p className="text-xs text-gray-500">Auto-refreshes every 30 seconds | Last: {formatDateTime(lastRefresh)}</p>
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

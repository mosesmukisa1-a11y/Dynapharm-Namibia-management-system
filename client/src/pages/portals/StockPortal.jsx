import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { PRICE_LIST, getCIFPrice, getProductProfit, findProductPrice } from '../../lib/pricing';
import { formatCurrency, formatDateTime, formatDate, BRANCHES } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Table, Modal, Alert, Select, Textarea } from '../../components/ui';
import { Package, Warehouse, Truck, ArrowLeftRight, Globe, BarChart3, ClipboardList, FileSpreadsheet, Zap, Share2, ShoppingCart, Plus, Download, Filter, Search, DollarSign, TrendingUp, Ship, Calendar, CheckCircle, Printer, Tag } from 'lucide-react';

function printDocument(title, bodyHtml, landscape = false) {
  const w = window.open('', '_blank', 'width=900,height=700');
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
    @media print { @page { size: ${landscape ? 'landscape' : 'portrait'}; margin: 12mm; } }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 0; padding: 16px; }
    h2 { font-size: 16px; margin: 0 0 4px; color: #8b0000; }
    .meta { font-size: 11px; color: #555; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #8b0000; color: white; padding: 6px 8px; text-align: left; font-size: 11px; }
    td { padding: 5px 8px; border-bottom: 1px solid #eee; font-size: 11px; }
    tr:nth-child(even) td { background: #f9f9f9; }
    .footer { margin-top: 16px; font-size: 10px; color: #888; border-top: 1px solid #ddd; padding-top: 6px; }
    .label-grid { display: flex; flex-wrap: wrap; gap: 6px; }
    .label { border: 1px solid #333; padding: 8px; width: 160px; text-align: center; font-size: 10px; }
    .label .code { font-family: monospace; font-size: 13px; font-weight: bold; letter-spacing: 1px; }
    .label .bars { display: flex; gap: 1px; justify-content: center; margin: 4px 0; height: 40px; align-items: flex-end; }
    .label .bar { background: #000; }
    .label .product { font-size: 9px; margin-top: 4px; }
    .label .price { font-size: 11px; font-weight: bold; color: #8b0000; }
    no-print { display: none !important; }
    @media print { .no-print { display: none !important; } }
  </style></head><body>
    <h2>DYNAPHARM INTERNATIONAL NAMIBIA</h2>
    <div class="meta">${title} &nbsp;|&nbsp; Printed: ${new Date().toLocaleString('en-NA')}</div>
    ${bodyHtml}
    <div class="footer">Dynapharm International Namibia &mdash; Confidential</div>
    <div class="no-print" style="margin-top:16px;text-align:center">
      <button onclick="window.print()" style="padding:8px 24px;background:#8b0000;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px">Print / Save PDF</button>
    </div>
  </body></html>`);
  w.document.close();
}

function barsForCode(code) {
  return code.split('').map((c, i) => {
    const w = ((c.charCodeAt(0) * 7 + i * 13) % 3) + 1;
    const h = 30 + ((c.charCodeAt(0) + i) % 10) * 2;
    return `<div class="bar" style="width:${w}px;height:${h}px"></div>`;
  }).join('') + Array.from({ length: 15 }, (_, i) => {
    const w = ((i * 7 + 3) % 3) + 1;
    return `<div class="bar" style="width:${w}px;height:${25 + (i % 8) * 2}px"></div>`;
  }).join('');
}

export default function StockPortal() {
  const [activeTab, setActiveTab] = useState('overview');

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
  const [items, setItems] = useState([{ product_name: '', quantity: '', cif_price: '', carton_no: '', expiry_date: '', batch_number: '' }]);
  const [form, setForm] = useState({ supplier: 'Dynapharm International (Malaysia)', shipping_ref: '', arrival_date: '', notes: '' });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    api.stock.batches()
      .then(d => {
        const all = Array.isArray(d) ? d : d.batches || [];
        setImports(all.filter(b => b.location === 'country_stock').sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const addItem = () => setItems(prev => [...prev, { product_name: '', quantity: '', cif_price: '', carton_no: '', expiry_date: '', batch_number: '' }]);
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

  const validateItems = () => {
    const errs = {};
    items.forEach((item, idx) => {
      if (!item.product_name) errs[`${idx}_product`] = true;
      if (!item.quantity || Number(item.quantity) <= 0) errs[`${idx}_qty`] = true;
      if (!item.carton_no?.trim()) errs[`${idx}_carton`] = true;
      if (!item.expiry_date) errs[`${idx}_expiry`] = true;
      if (!item.batch_number?.trim()) errs[`${idx}_batch`] = true;
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateItems()) {
      setAlert({ type: 'error', msg: 'All mandatory fields required: Product, Carton No, Expiry Date, Quantity, Batch Number' });
      return;
    }
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
          batch_number: item.batch_number || form.shipping_ref || `IMP-${Date.now()}`,
          expiry_date: item.expiry_date || null,
          unit_price: Number(item.cif_price) || getCIFPrice(item.product_name),
          location: 'country_stock',
          notes: `Supplier: ${form.supplier} | Ref: ${form.shipping_ref} | Carton: ${item.carton_no} | ${form.notes}`,
          metadata: JSON.stringify({ carton_no: item.carton_no, shipping_ref: form.shipping_ref, arrival_date: form.arrival_date }),
        });
      }
      setAlert({ type: 'success', msg: `${validItems.length} product(s) imported to Country Stock successfully` });
      setItems([{ product_name: '', quantity: '', cif_price: '', carton_no: '', expiry_date: '', batch_number: '' }]);
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
              <p className="text-xs text-blue-600 mt-1 font-semibold">
                Mandatory fields per item: Product/Description, Carton No, Expiry Date, Quantity, Batch Number
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">Supplier Import Shipments</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => {
                const rows = imports.slice(0, 50).map(r => `<tr><td>${formatDateTime(r.created_at)}</td><td>${r.product_name||''}</td><td>${r.batch_number||''}</td><td>${r.expiry_date?formatDate(r.expiry_date):'-'}</td><td>${r.quantity||''}</td><td>${formatCurrency(Number(r.unit_price||0))}</td><td>${formatCurrency(Number(r.quantity||0)*Number(r.unit_price||0))}</td></tr>`).join('');
                printDocument('Supplier Import Shipments', `<table><thead><tr><th>Date</th><th>Product</th><th>Batch #</th><th>Expiry</th><th>Qty</th><th>CIF Price</th><th>CIF Total</th></tr></thead><tbody>${rows}</tbody></table>`);
              }}><Printer size={14} /> Print</Button>
              <Button size="sm" onClick={() => setShowForm(true)}><Plus size={16} /> New Import Shipment</Button>
            </div>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Date', render: r => formatDateTime(r.created_at) },
            { header: 'Product', key: 'product_name' },
            { header: 'Batch #', key: 'batch_number' },
            { header: 'Expiry', render: r => r.expiry_date ? formatDate(r.expiry_date) : '-' },
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
              <label className="block text-sm font-medium text-gray-700">Products in Shipment <span className="text-red-500">*</span></label>
              <Button type="button" size="sm" variant="secondary" onClick={addItem}><Plus size={14} /> Add Product</Button>
            </div>
            <div className="text-xs text-gray-500 mb-2 bg-yellow-50 border border-yellow-200 rounded p-2">
              All fields are mandatory: Product/Description, Carton No, Expiry Date, Quantity, Batch Number
            </div>
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-12 md:col-span-4">
                      <label className="text-xs text-gray-500 mb-1 block">Product/Description *</label>
                      <select
                        className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 ${errors[`${idx}_product`] ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'}`}
                        value={item.product_name}
                        onChange={e => updateItem(idx, 'product_name', e.target.value)}
                      >
                        <option value="">Select product...</option>
                        {PRICE_LIST.map(p => <option key={p.description} value={p.description}>{p.description}</option>)}
                      </select>
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className="text-xs text-gray-500 mb-1 block">Carton No *</label>
                      <input className={`w-full px-3 py-2 rounded-lg border text-sm ${errors[`${idx}_carton`] ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} placeholder="CTN-001" value={item.carton_no} onChange={e => updateItem(idx, 'carton_no', e.target.value)} />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className="text-xs text-gray-500 mb-1 block">Expiry Date *</label>
                      <input type="date" className={`w-full px-3 py-2 rounded-lg border text-sm ${errors[`${idx}_expiry`] ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} value={item.expiry_date} onChange={e => updateItem(idx, 'expiry_date', e.target.value)} />
                    </div>
                    <div className="col-span-4 md:col-span-1">
                      <label className="text-xs text-gray-500 mb-1 block">Qty *</label>
                      <input type="number" min="1" className={`w-full px-3 py-2 rounded-lg border text-sm ${errors[`${idx}_qty`] ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} placeholder="0" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <label className="text-xs text-gray-500 mb-1 block">Batch # *</label>
                      <input className={`w-full px-3 py-2 rounded-lg border text-sm ${errors[`${idx}_batch`] ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} placeholder="B001" value={item.batch_number} onChange={e => updateItem(idx, 'batch_number', e.target.value)} />
                    </div>
                    <div className="col-span-6 md:col-span-1 flex items-end gap-1">
                      {items.length > 1 && <Button type="button" size="sm" variant="danger" onClick={() => removeItem(idx)}>×</Button>}
                    </div>
                  </div>
                  <div className="grid grid-cols-12 gap-2 items-center mt-2">
                    <div className="col-span-4 md:col-span-2">
                      <label className="text-xs text-gray-500 mb-1 block">CIF Price (N$)</label>
                      <input type="number" min="0" step="0.01" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" placeholder="Auto" value={item.cif_price} onChange={e => updateItem(idx, 'cif_price', e.target.value)} />
                    </div>
                    <div className="col-span-4 md:col-span-2 text-sm font-medium text-gray-700 pt-5">
                      CIF Total: {formatCurrency((Number(item.quantity) || 0) * (Number(item.cif_price) || 0))}
                    </div>
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
  const [showDetail, setShowDetail] = useState(false);

  const loadBatches = useCallback(() => {
    setLoading(true);
    api.stock.batches()
      .then(d => {
        const all = Array.isArray(d) ? d : d.batches || [];
        setBatches(all.filter(b => b.location === 'country_stock'));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  if (loading) return <LoadingSpinner />;

  const totalQty = batches.reduce((s, b) => s + Number(b.quantity || 0), 0);
  const totalValue = batches.reduce((s, b) => s + Number(b.quantity || 0) * Number(b.unit_price || 0), 0);

  const byProduct = {};
  batches.forEach(b => {
    const name = b.product_name || 'Unknown';
    if (!byProduct[name]) byProduct[name] = { product_name: name, total_qty: 0, total_value: 0, batch_count: 0, earliest_expiry: null };
    byProduct[name].total_qty += Number(b.quantity || 0);
    byProduct[name].total_value += Number(b.quantity || 0) * Number(b.unit_price || 0);
    byProduct[name].batch_count += 1;
    if (b.expiry_date) {
      const d = b.expiry_date;
      if (!byProduct[name].earliest_expiry || d < byProduct[name].earliest_expiry) byProduct[name].earliest_expiry = d;
    }
  });
  const productRows = Object.values(byProduct).sort((a, b) => b.total_qty - a.total_qty);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Distinct Products" value={productRows.length} color="blue" icon={<Globe size={24} />} />
        <StatCard title="Total Units" value={totalQty.toLocaleString()} color="green" icon={<Package size={24} />} />
        <StatCard title="Total CIF Value" value={formatCurrency(totalValue)} color="purple" icon={<DollarSign size={24} />} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div>
              <h3 className="font-bold text-gray-800">Country Stock — Product Summary</h3>
              <p className="text-xs text-gray-500 mt-0.5">Inventory received via Supplier Import. Use the Supplier Import tab to add new shipments.</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setShowDetail(v => !v)}>
                {showDetail ? 'Show Summary' : 'Show Batch Detail'}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => {
                const rows = productRows.map(r => `<tr><td>${r.product_name||''}</td><td>${r.batch_count||0}</td><td>${r.total_qty||0}</td><td>${r.earliest_expiry?formatDate(r.earliest_expiry):'—'}</td><td>${formatCurrency(r.total_value||0)}</td></tr>`).join('');
                printDocument('Country Stock — Product Summary', `<table><thead><tr><th>Product</th><th>Batches</th><th>Total Qty</th><th>Earliest Expiry</th><th>CIF Value</th></tr></thead><tbody>${rows}</tbody></table>`);
              }}><Printer size={14} /> Print</Button>
            </div>
          </div>
        </CardHeader>
        {!showDetail ? (
          <Table
            columns={[
              { header: 'Product', render: r => <span className="font-medium text-gray-800">{r.product_name}</span> },
              { header: 'Batches', render: r => <span className="text-sm text-gray-500">{r.batch_count}</span> },
              { header: 'Total Qty', render: r => (
                <span className={r.total_qty < 10 ? 'text-red-600 font-bold' : r.total_qty < 50 ? 'text-amber-600 font-semibold' : 'text-green-700 font-semibold'}>
                  {r.total_qty.toLocaleString()}
                </span>
              )},
              { header: 'Earliest Expiry', render: r => r.earliest_expiry ? formatDate(r.earliest_expiry) : '—' },
              { header: 'CIF Value', render: r => formatCurrency(r.total_value) },
            ]}
            data={productRows}
            emptyMessage="No country stock yet — record a supplier import to populate this."
          />
        ) : (
          <Table
            columns={[
              { header: 'Product', key: 'product_name' },
              { header: 'Batch #', render: r => r.batch_number || '—' },
              { header: 'Quantity', render: r => <span className={Number(r.quantity) < 10 ? 'text-red-600 font-bold' : 'font-medium'}>{r.quantity}</span> },
              { header: 'Expiry', render: r => r.expiry_date ? formatDate(r.expiry_date) : '—' },
              { header: 'CIF/Unit', render: r => formatCurrency(Number(r.unit_price || 0)) },
              { header: 'Notes', render: r => <span className="text-xs text-gray-500 truncate max-w-xs block">{r.notes || '—'}</span> },
            ]}
            data={batches}
            emptyMessage="No country stock batches found."
          />
        )}
      </Card>
    </div>
  );
}

function WarehouseTab({ name }) {
  const [batches, setBatches] = useState([]);
  const [incomingTransfers, setIncomingTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTransfer, setShowTransfer] = useState(false);
  const [form, setForm] = useState({ product_name: '', quantity: '' });
  const [submitting, setSubmitting] = useState(false);
  const [receivingId, setReceivingId] = useState(null);
  const [alert, setAlert] = useState(null);
  const location = name.toLowerCase() + '_warehouse';

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.stock.batches().then(d => (Array.isArray(d) ? d : d.batches || []).filter(b => b.location === location)),
      api.stock.transfers(`to_branch=${encodeURIComponent(location)}`).then(d => Array.isArray(d) ? d : d.transfers || []),
    ])
      .then(([batchData, transferData]) => {
        setBatches(batchData);
        setIncomingTransfers(transferData.filter(t => t.status !== 'cancelled'));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [location]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleMarkReceived = async (transfer) => {
    setReceivingId(transfer.id);
    try {
      await api.stock.createBatch({
        product_name: transfer.product_name,
        quantity: transfer.quantity,
        location,
        batch_number: `RCV-${transfer.id.slice(-6).toUpperCase()}`,
        notes: `Received from transfer ${transfer.id}`,
      });
      await api.stock.updateTransfer(transfer.id, { status: 'received' });
      setAlert({ type: 'success', msg: `${transfer.product_name} (qty ${transfer.quantity}) received into ${name} warehouse` });
      loadData();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message || 'Failed to receive transfer' });
    } finally {
      setReceivingId(null);
    }
  };

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
      loadData();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const statusColor = { pending: 'warning', dispatched: 'info', received: 'success', cancelled: 'default' };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} className="mb-2" onClose={() => setAlert(null)}>{alert.msg}</Alert>}

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">{name} Warehouse — Current Inventory</h3>
            <Button size="sm" onClick={() => setShowTransfer(true)}><Plus size={16} className="mr-1" /> Request Transfer In</Button>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Product', key: 'product_name' },
            { header: 'Batch Ref', key: 'batch_number' },
            { header: 'Quantity', render: r => <span className={Number(r.quantity) < 10 ? 'text-red-600 font-bold' : 'font-medium'}>{r.quantity}</span> },
            { header: 'Expiry', render: r => r.expiry_date ? formatDateTime(r.expiry_date) : '—' },
          ]}
          data={batches}
          emptyMessage={`No confirmed stock in ${name} warehouse yet`}
        />
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-bold text-gray-800">{name} Warehouse — Incoming Transfers</h3>
          <p className="text-xs text-gray-500 mt-0.5">Stock transferred to this warehouse. Click "Mark Received" to add it to inventory.</p>
        </CardHeader>
        <Table
          columns={[
            { header: 'Product', render: r => <span className="font-medium">{r.product_name}</span> },
            { header: 'Qty', render: r => <span className="font-semibold text-primary">{r.quantity}</span> },
            { header: 'From', render: r => <span className="text-xs text-gray-600">{(r.from_location || r.fromWarehouse || '—').replace(/_/g, ' ')}</span> },
            { header: 'Status', render: r => <Badge variant={statusColor[r.status] || 'default'}>{r.status}</Badge> },
            { header: 'Date', render: r => formatDate(r.created_at || r.createdAt) },
            {
              header: 'Action',
              render: r => r.status === 'received' ? (
                <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle size={14} /> Received</span>
              ) : (
                <Button
                  size="sm"
                  variant="success"
                  onClick={() => handleMarkReceived(r)}
                  disabled={receivingId === r.id}
                >
                  {receivingId === r.id ? 'Receiving...' : 'Mark Received'}
                </Button>
              ),
            },
          ]}
          data={incomingTransfers}
          emptyMessage={`No incoming transfers for ${name} warehouse`}
        />
      </Card>

      <Modal open={showTransfer} onClose={() => setShowTransfer(false)} title={`Request Stock Transfer to ${name} Warehouse`} size="md">
        <form onSubmit={handleTransferIn} className="p-6 space-y-4">
          <Alert type="info">This will create a transfer request from Country Stock to {name} Warehouse.</Alert>
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
            <Button type="submit" disabled={submitting}>{submitting ? 'Requesting...' : 'Initiate Transfer'}</Button>
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
  const [barcodeInput, setBarcodeInput] = useState('');

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

  const handleBarcodeSearch = () => {
    if (!barcodeInput) return;
    const code = barcodeInput.toUpperCase().trim();
    const idx = code.startsWith('DYN-') ? parseInt(code.replace('DYN-', ''), 10) : -1;
    if (idx >= 0 && idx < PRICE_LIST.length) {
      setForm(f => ({ ...f, product_name: PRICE_LIST[idx].description }));
      setAlert({ type: 'success', msg: `Product found: ${PRICE_LIST[idx].description}` });
    } else {
      const found = PRICE_LIST.find(p => p.description.toLowerCase().includes(barcodeInput.toLowerCase()));
      if (found) {
        setForm(f => ({ ...f, product_name: found.description }));
        setAlert({ type: 'success', msg: `Product found: ${found.description}` });
      } else {
        setAlert({ type: 'error', msg: 'Product not found for scanned barcode' });
      }
    }
    setBarcodeInput('');
  };

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
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <label className="text-sm font-medium text-blue-800 block mb-1">Barcode Scan / Search</label>
            <div className="flex gap-2">
              <input
                className="flex-1 px-3 py-2 rounded-lg border border-blue-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                placeholder="Scan barcode or type product code (e.g. DYN-0001)..."
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleBarcodeSearch(); } }}
              />
              <Button type="button" size="sm" onClick={handleBarcodeSearch}>Search</Button>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select label="Source Warehouse" options={warehouses} value={form.from_location} onChange={e => setForm(f => ({ ...f, from_location: e.target.value }))} />
              <Select label="Destination" options={destinations} value={form.to_location} onChange={e => setForm(f => ({ ...f, to_location: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Product (or use barcode scan above)</label>
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
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">Recent Distribution Transfers</h3>
            <Button size="sm" variant="secondary" onClick={() => {
              const rows = recentTransfers.map(r => `<tr><td>${formatDateTime(r.created_at)}</td><td>${r.from_location||''}</td><td>${r.to_location||''}</td><td>${r.product_name||''}</td><td>${r.quantity||''}</td><td>${r.status||'Pending'}</td></tr>`).join('');
              printDocument('Distribution Transfers', `<table><thead><tr><th>Date</th><th>From</th><th>To</th><th>Product</th><th>Qty</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`);
            }}><Printer size={14} /> Print Report</Button>
          </div>
        </CardHeader>
        {loading ? <LoadingSpinner /> : (
          <Table
            columns={[
              { header: 'Date', render: r => formatDateTime(r.created_at) },
              { header: 'From', key: 'from_location' },
              { header: 'To', key: 'to_location' },
              { header: 'Product', key: 'product_name' },
              { header: 'Qty', key: 'quantity' },
              { header: 'Status', render: r => <Badge variant={r.status === 'completed' || r.status === 'delivered' ? 'success' : r.status === 'in_transit' || r.status === 'dispatched' ? 'info' : 'warning'}>{r.status || 'Pending'}</Badge> },
              { header: '', render: r => (
                <Button size="sm" variant="ghost" onClick={() => printDocument(`Dispatch Note — ${r.product_name}`, `<table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody><tr><td>Transfer ID</td><td>${r.id||''}</td></tr><tr><td>Date</td><td>${formatDateTime(r.created_at)}</td></tr><tr><td>From</td><td>${r.from_location||''}</td></tr><tr><td>To</td><td>${r.to_location||''}</td></tr><tr><td>Product</td><td>${r.product_name||''}</td></tr><tr><td>Quantity</td><td>${r.quantity||''}</td></tr><tr><td>Status</td><td>${r.status||'Pending'}</td></tr></tbody></table>`)}>
                  <Printer size={12} />
                </Button>
              )},
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
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">Stock Transfers</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => {
                const rows = transfers.map(r => `<tr><td>${formatDateTime(r.created_at)}</td><td>${r.from_location||''}</td><td>${r.to_location||''}</td><td>${r.product_name||''}</td><td>${r.quantity||''}</td><td>${r.status||'Pending'}</td></tr>`).join('');
                printDocument('Stock Transfers Report', `<table><thead><tr><th>Date</th><th>From</th><th>To</th><th>Product</th><th>Qty</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`);
              }}><Printer size={14} /> Print Report</Button>
              <Button size="sm" onClick={() => setShowNew(true)}><Plus size={16} /> New Transfer</Button>
            </div>
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
                <Button size="sm" variant="ghost" title="Print dispatch note" onClick={() => printDocument(`Dispatch Note — ${r.product_name}`, `<table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody><tr><td><b>Transfer ID</b></td><td>${r.id||''}</td></tr><tr><td><b>Date</b></td><td>${formatDateTime(r.created_at)}</td></tr><tr><td><b>From</b></td><td>${r.from_location||''}</td></tr><tr><td><b>To</b></td><td>${r.to_location||''}</td></tr><tr><td><b>Product</b></td><td>${r.product_name||''}</td></tr><tr><td><b>Quantity</b></td><td>${r.quantity||''}</td></tr><tr><td><b>Status</b></td><td>${r.status||'Pending'}</td></tr><tr><td><b>Notes</b></td><td>${r.notes||'-'}</td></tr></tbody></table>`)}><Printer size={12} /></Button>
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
              <Button size="sm" variant="secondary" onClick={() => {
                const rows = aggregatedList.map(r => `<tr><td>${r.product_name||''}</td><td>${r.location||''}</td><td>${r.total_quantity||0}</td><td>${formatCurrency(r.total_value||0)}</td><td>${r.batch_count||0}</td></tr>`).join('');
                printDocument('Full Inventory Report', `<table><thead><tr><th>Product</th><th>Location</th><th>Total Qty</th><th>Value</th><th>Batches</th></tr></thead><tbody>${rows}</tbody></table>`, true);
              }}><Printer size={14} /> Print</Button>
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
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">Stock Valuation Breakdown (DP Prices)</h3>
            <Button size="sm" variant="secondary" onClick={() => {
              const rows = breakdown.map(r => `<tr><td>${r.product_name||''}</td><td>${r.location||''}</td><td>${r.quantity||0}</td><td>${formatCurrency(r.unit_price||0)}</td><td>${formatCurrency(r.total_value||0)}</td></tr>`).join('');
              const total = `<tr style="font-weight:bold;background:#f0fdf4"><td colspan="4">Grand Total</td><td>${formatCurrency(grandTotal)}</td></tr>`;
              printDocument('Stock Valuation Report (DP Prices)', `<table><thead><tr><th>Product</th><th>Location</th><th>Qty</th><th>Unit Price (DP)</th><th>Total Value</th></tr></thead><tbody>${rows}${total}</tbody></table>`, true);
            }}><Printer size={14} /> Print Report</Button>
          </div>
        </CardHeader>
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

function BarcodeLabelDisplay({ code, name, dp }) {
  return (
    <div className="border border-gray-300 rounded p-3 text-center bg-white w-48 flex-shrink-0">
      <p className="text-[9px] font-bold text-primary uppercase tracking-wide mb-1">Dynapharm Namibia</p>
      <p className="text-[10px] font-semibold text-gray-800 leading-tight mb-2 h-8 overflow-hidden">{name}</p>
      <div className="flex gap-[1px] justify-center mb-1 h-10 items-end mx-auto w-36">
        {code.split('').map((c, i) => (
          <div key={i} className="bg-black" style={{ width: ((c.charCodeAt(0) * 7 + i * 13) % 3) + 1 + 'px', height: 25 + ((c.charCodeAt(0) + i) % 10) * 2 + 'px' }} />
        ))}
        {Array.from({ length: 12 }, (_, i) => (
          <div key={`p${i}`} className="bg-black" style={{ width: ((i * 7 + 3) % 3) + 1 + 'px', height: 22 + (i % 6) * 3 + 'px' }} />
        ))}
      </div>
      <p className="text-[11px] font-mono font-bold text-gray-700 tracking-wider">{code}</p>
      {dp > 0 && <p className="text-[11px] font-bold text-primary mt-1">NAD {formatCurrency(dp)}</p>}
    </div>
  );
}

function BarcodeTab() {
  const [subTab, setSubTab] = useState('lookup');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [batches, setBatches] = useState([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [assignSearch, setAssignSearch] = useState('');
  const [assigningId, setAssigningId] = useState(null);
  const [assignCode, setAssignCode] = useState('');
  const [assignAlert, setAssignAlert] = useState(null);
  const [printSelected, setPrintSelected] = useState({});
  const [printQty, setPrintQty] = useState({});

  const generateBarcode = (idx) => `DYN-${String(idx).padStart(4, '0')}`;

  const indexedProducts = PRICE_LIST.map((p, idx) => ({ ...p, idx, code: generateBarcode(idx) }));

  const lookupResults = searchTerm.length >= 2
    ? indexedProducts.filter(p => p.description.toLowerCase().includes(searchTerm.toLowerCase()) || p.code.toLowerCase().includes(searchTerm.toLowerCase()))
    : [];

  const loadBatches = () => {
    setBatchLoading(true);
    api.stock.batches()
      .then(d => setBatches(Array.isArray(d) ? d : d.batches || []))
      .catch(() => {})
      .finally(() => setBatchLoading(false));
  };

  const handleAssignCode = async (batchId) => {
    if (!assignCode.trim()) return;
    try {
      await api.stock.updateBatch(batchId, { barcode: assignCode.trim() });
      setAssignAlert({ type: 'success', msg: 'Barcode assigned successfully' });
      setAssigningId(null);
      setAssignCode('');
      loadBatches();
    } catch {
      setAssignAlert({ type: 'error', msg: 'Failed to assign barcode' });
    }
  };

  const printLabels = () => {
    const toPrint = indexedProducts.filter(p => printSelected[p.idx] && Number(printQty[p.idx] || 1) > 0);
    if (!toPrint.length) return;
    const labels = toPrint.flatMap(p => Array.from({ length: Number(printQty[p.idx] || 1) }, () => `
      <div class="label">
        <div class="product" style="font-weight:bold;font-size:9px;color:#8b0000">DYNAPHARM NAMIBIA</div>
        <div class="product" style="min-height:24px;overflow:hidden">${p.description}</div>
        <div class="bars">${barsForCode(p.code)}</div>
        <div class="code">${p.code}</div>
        <div class="price">NAD ${formatCurrency(p.dp)}</div>
      </div>`)).join('');
    printDocument('Barcode Labels', `<div class="label-grid">${labels}</div>`, false);
  };

  const filteredBatches = batches.filter(b =>
    !assignSearch || (b.product_name || '').toLowerCase().includes(assignSearch.toLowerCase()) || (b.barcode || '').toLowerCase().includes(assignSearch.toLowerCase())
  );

  const subTabs = [
    { id: 'lookup', label: 'Lookup & Print' },
    { id: 'assign', label: 'Assign Codes' },
    { id: 'printlabels', label: 'Print Labels' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200">
        {subTabs.map(t => (
          <button
            key={t.id}
            onClick={() => { setSubTab(t.id); if (t.id === 'assign') loadBatches(); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${subTab === t.id ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'lookup' && (
        <div className="space-y-4">
          <Card>
            <CardBody>
              <div className="relative max-w-lg">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                  placeholder="Search by product name or code (e.g. DYN-0001)..."
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
                    <div className="flex justify-between items-start">
                      <h3 className="text-lg font-bold text-gray-800">{selectedProduct.description}</h3>
                      <Button size="sm" variant="secondary" onClick={() => {
                        printDocument(`Label — ${selectedProduct.description}`, `<div class="label-grid"><div class="label"><div class="product" style="font-weight:bold;font-size:9px;color:#8b0000">DYNAPHARM NAMIBIA</div><div class="product">${selectedProduct.description}</div><div class="bars">${barsForCode(selectedProduct.code)}</div><div class="code">${selectedProduct.code}</div><div class="price">NAD ${formatCurrency(selectedProduct.dp)}</div></div></div>`);
                      }}><Printer size={14} /> Print Label</Button>
                    </div>
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
                  <div className="flex flex-col items-center justify-center">
                    <BarcodeLabelDisplay code={selectedProduct.code} name={selectedProduct.description} dp={selectedProduct.dp} />
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          {lookupResults.length > 0 && !selectedProduct && (
            <Card>
              <CardHeader><h3 className="font-bold text-gray-800">Results ({lookupResults.length})</h3></CardHeader>
              <Table
                columns={[
                  { header: 'Code', render: r => <span className="font-mono text-xs font-bold text-gray-700">{r.code}</span> },
                  { header: 'Product', key: 'description' },
                  { header: 'DP', render: r => formatCurrency(r.dp) },
                  { header: 'CP', render: r => formatCurrency(r.cp) },
                  { header: 'BV', key: 'bv' },
                  { header: 'Actions', render: r => (
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => setSelectedProduct(r)}>View</Button>
                      <Button size="sm" variant="secondary" onClick={() => {
                        printDocument(`Label — ${r.description}`, `<div class="label-grid"><div class="label"><div class="product" style="font-weight:bold;font-size:9px;color:#8b0000">DYNAPHARM NAMIBIA</div><div class="product">${r.description}</div><div class="bars">${barsForCode(r.code)}</div><div class="code">${r.code}</div><div class="price">NAD ${formatCurrency(r.dp)}</div></div></div>`);
                      }}><Printer size={12} /></Button>
                    </div>
                  )},
                ]}
                data={lookupResults}
                emptyMessage="No products found"
              />
            </Card>
          )}

          {searchTerm.length >= 2 && lookupResults.length === 0 && (
            <EmptyState icon={<Search size={48} />} title="No products found" description={`No products matching "${searchTerm}"`} />
          )}
          {searchTerm.length < 2 && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {indexedProducts.slice(0, 12).map(p => (
                <button key={p.idx} onClick={() => setSelectedProduct(p)} className="text-left hover:shadow-md transition-shadow">
                  <BarcodeLabelDisplay code={p.code} name={p.description} dp={p.dp} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === 'assign' && (
        <div className="space-y-4">
          {assignAlert && <Alert type={assignAlert.type} className="mb-2">{assignAlert.msg}</Alert>}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center flex-wrap gap-2">
                <h3 className="font-bold text-gray-800">Assign Barcodes to Batches</h3>
                <Button size="sm" variant="secondary" onClick={loadBatches}>{batchLoading ? 'Loading...' : 'Refresh'}</Button>
              </div>
            </CardHeader>
            <CardBody className="pb-2">
              <p className="text-sm text-gray-500 mb-3">Each batch record from stock imports can have a specific barcode assigned. You can override or assign a custom code below.</p>
              <div className="relative max-w-md mb-4">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20" placeholder="Filter by product or barcode..." value={assignSearch} onChange={e => setAssignSearch(e.target.value)} />
              </div>
            </CardBody>
            {batchLoading ? <LoadingSpinner /> : (
              <Table
                columns={[
                  { header: 'Batch #', render: r => <span className="font-mono text-xs">{r.batch_number || r.id || '-'}</span> },
                  { header: 'Product', key: 'product_name' },
                  { header: 'Location', key: 'location' },
                  { header: 'Qty', key: 'quantity' },
                  { header: 'Current Code', render: r => (
                    <span className={`font-mono text-xs ${r.barcode ? 'text-green-700 font-bold' : 'text-gray-400'}`}>{r.barcode || 'Not assigned'}</span>
                  )},
                  { header: 'Assign', render: r => assigningId === r.id ? (
                    <div className="flex gap-1 items-center">
                      <input
                        className="px-2 py-1 rounded border border-gray-300 text-xs w-28 focus:outline-none focus:ring-1 focus:border-primary"
                        value={assignCode}
                        onChange={e => setAssignCode(e.target.value)}
                        placeholder="e.g. DYN-0001"
                        autoFocus
                      />
                      <Button size="sm" variant="success" onClick={() => handleAssignCode(r.id)}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setAssigningId(null)}>✕</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => { setAssigningId(r.id); setAssignCode(r.barcode || generateBarcode(indexedProducts.findIndex(p => p.description === r.product_name))); }}><Tag size={12} /> {r.barcode ? 'Change' : 'Assign'}</Button>
                  )},
                ]}
                data={filteredBatches}
                emptyMessage={batchLoading ? '' : 'No batches found — import stock first'}
              />
            )}
          </Card>
        </div>
      )}

      {subTab === 'printlabels' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center flex-wrap gap-2">
                <h3 className="font-bold text-gray-800">Print Label Sheet</h3>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => {
                    const allSelected = {};
                    const allQty = {};
                    indexedProducts.forEach(p => { allSelected[p.idx] = true; allQty[p.idx] = 1; });
                    setPrintSelected(allSelected);
                    setPrintQty(allQty);
                  }}>Select All</Button>
                  <Button size="sm" variant="secondary" onClick={() => { setPrintSelected({}); setPrintQty({}); }}>Clear</Button>
                  <Button size="sm" onClick={printLabels} disabled={Object.keys(printSelected).filter(k => printSelected[k]).length === 0}>
                    <Printer size={14} /> Print {Object.keys(printSelected).filter(k => printSelected[k]).length > 0 ? `(${Object.keys(printSelected).filter(k => printSelected[k]).length})` : ''} Labels
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-gray-500 mb-4">Select products and set how many copies of each label to print.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {indexedProducts.map(p => (
                  <label key={p.idx} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${printSelected[p.idx] ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="checkbox" checked={!!printSelected[p.idx]} onChange={e => setPrintSelected(prev => ({ ...prev, [p.idx]: e.target.checked }))} className="accent-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{p.description}</p>
                      <p className="text-xs font-mono text-gray-500">{p.code}</p>
                    </div>
                    {printSelected[p.idx] && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500">×</span>
                        <input
                          type="number"
                          min="1"
                          max="99"
                          value={printQty[p.idx] || 1}
                          onChange={e => setPrintQty(prev => ({ ...prev, [p.idx]: e.target.value }))}
                          onClick={e => e.preventDefault()}
                          className="w-12 px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:border-primary text-center"
                        />
                      </div>
                    )}
                  </label>
                ))}
              </div>
            </CardBody>
          </Card>

          {Object.keys(printSelected).some(k => printSelected[k]) && (
            <Card>
              <CardHeader><h3 className="font-bold text-gray-800">Preview</h3></CardHeader>
              <CardBody>
                <div className="flex flex-wrap gap-3">
                  {indexedProducts.filter(p => printSelected[p.idx]).map(p => (
                    <BarcodeLabelDisplay key={p.idx} code={p.code} name={p.description} dp={p.dp} />
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
        </div>
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
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">Batch Tracking</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => {
                const rows = allBatches.map(r => `<tr><td>${r.batch_number||''}</td><td>${r.product_name||''}</td><td>${r.quantity||0}</td><td>${r.expiry_date?formatDate(r.expiry_date):'-'}</td><td>${r.location||''}</td></tr>`).join('');
                printDocument('Batch Tracking Report', `<table><thead><tr><th>Batch #</th><th>Product</th><th>Qty</th><th>Expiry</th><th>Location</th></tr></thead><tbody>${rows}</tbody></table>`);
              }}><Printer size={14} /> Print</Button>
              <Button size="sm" onClick={() => setShowForm(true)}><Plus size={16} /> New Batch</Button>
            </div>
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

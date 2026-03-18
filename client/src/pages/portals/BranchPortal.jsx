import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatCurrency, formatDateTime, formatDate, BRANCHES } from '../../lib/constants';
import { enrichProductsWithPricing, calculateCartTotals, generateReceiptNumber, PRICE_LIST } from '../../lib/pricing';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Table, Modal, Alert, Select, Textarea } from '../../components/ui';
import { ShoppingCart, FileText, Package, Landmark, CreditCard, ClipboardList, Gift, MessageSquare, Users, UserPlus, Map } from 'lucide-react';

export default function BranchPortal() {
  const [activeTab, setActiveTab] = useState('walkIn');
  const tabs = [
    { id: 'walkIn', label: 'Walk-in Sales', icon: '🛒' },
    { id: 'prescriptions', label: 'Prescriptions', icon: '💊' },
    { id: 'stock', label: 'Stock', icon: '📦' },
    { id: 'banking', label: 'Banking', icon: '🏦' },
    { id: 'payments', label: 'Payments', icon: '💳' },
    { id: 'onlineOrders', label: 'Online Orders', icon: '📦' },
    { id: 'bonus', label: 'Bonus', icon: '🎁' },
    { id: 'communication', label: 'Communication', icon: '💬' },
    { id: 'staff', label: 'Staff', icon: '👥' },
    { id: 'registration', label: 'Distributor Reg', icon: '📝' },
    { id: 'fieldProgram', label: 'Field Program', icon: '🗺️' },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Branch Portal</h1>
        <p className="text-sm text-gray-500">Manage branch operations, sales, and inventory</p>
      </div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'walkIn' && <WalkInSalesTab />}
        {activeTab === 'prescriptions' && <PrescriptionsTab />}
        {activeTab === 'stock' && <BranchStockTab />}
        {activeTab === 'banking' && <BankingTab />}
        {activeTab === 'payments' && <BranchPaymentsTab />}
        {activeTab === 'onlineOrders' && <OnlineOrdersTab />}
        {activeTab === 'bonus' && <BonusTab />}
        {activeTab === 'communication' && <CommunicationTab />}
        {activeTab === 'staff' && <StaffTab />}
        {activeTab === 'registration' && <DistributorRegTab />}
        {activeTab === 'fieldProgram' && <FieldProgramTab />}
      </div>
    </div>
  );
}

function WalkInSalesTab() {
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [isMember, setIsMember] = useState(false);
  const [distributorSearch, setDistributorSearch] = useState('');
  const [selectedDistributor, setSelectedDistributor] = useState(null);
  const [distributorResults, setDistributorResults] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [showReview, setShowReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.products.list().then(d => {
        const raw = Array.isArray(d) ? d : d.products || [];
        setProducts(enrichProductsWithPricing(raw));
      }),
      api.branch.walkinSales().then(d => setSales(Array.isArray(d) ? d : d.sales || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const filtered = products.filter(p => !search || (p.name || p.description || '').toLowerCase().includes(search.toLowerCase()));

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === product.id);
      if (existing) return prev.map(c => c.id === product.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const updateQty = (id, delta) => {
    setCart(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(1, c.qty + delta) } : c));
  };

  const removeFromCart = (id) => {
    setCart(prev => prev.filter(c => c.id !== id));
  };

  const cartData = calculateCartTotals(cart, isMember);

  const searchDistributors = async (q) => {
    setDistributorSearch(q);
    if (q.length < 2) { setDistributorResults([]); return; }
    try {
      const res = await api.distributors.search(q);
      setDistributorResults(Array.isArray(res) ? res : res.distributors || []);
    } catch { setDistributorResults([]); }
  };

  const selectDistributor = (d) => {
    setSelectedDistributor(d);
    setIsMember(true);
    setDistributorResults([]);
    setDistributorSearch(d.name || d.full_name || '');
  };

  const completeSale = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    setError('');
    try {
      const receiptNumber = generateReceiptNumber();
      const saleData = {
        receipt_number: receiptNumber,
        customer_type: isMember ? 'member' : 'non_member',
        distributor_id: selectedDistributor?.id || null,
        distributor_name: selectedDistributor?.name || selectedDistributor?.full_name || null,
        payment_method: paymentMethod,
        items: cartData.items.map(item => ({
          product_id: item.id,
          product_name: item.name || item.description,
          quantity: item.qty,
          unit_price: item.unitPrice,
          line_total: item.lineTotal,
          bv: item.lineBV,
        })),
        total_amount: cartData.totalAmount,
        total_bv: cartData.totalBV,
      };
      await api.branch.createWalkinSale(saleData);
      setReceipt({ ...saleData, created_at: new Date().toISOString() });
      setCart([]);
      setShowReview(false);
      const salesRes = await api.branch.walkinSales().catch(() => ({ sales: [] }));
      setSales(Array.isArray(salesRes) ? salesRes : salesRes.sales || []);
    } catch (err) {
      setError(err.message || 'Failed to complete sale');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  if (receipt) {
    return (
      <div className="max-w-lg mx-auto">
        <Card>
          <CardHeader><h3 className="font-bold text-green-700 text-center">Sale Complete</h3></CardHeader>
          <CardBody>
            <div className="text-center mb-4">
              <p className="text-2xl font-bold text-green-600">✓</p>
              <p className="text-sm text-gray-500">Receipt: {receipt.receipt_number}</p>
              <p className="text-sm text-gray-500">{formatDateTime(receipt.created_at)}</p>
            </div>
            <div className="border-t pt-3 space-y-1">
              {receipt.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>{item.product_name} x{item.quantity}</span>
                  <span>{formatCurrency(item.line_total)}</span>
                </div>
              ))}
            </div>
            <div className="border-t mt-3 pt-3 flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>{formatCurrency(receipt.total_amount)}</span>
            </div>
            <p className="text-sm text-gray-500 mt-1">BV: {receipt.total_bv} | Payment: {receipt.payment_method}</p>
            {receipt.distributor_name && <p className="text-sm text-gray-500">Member: {receipt.distributor_name}</p>}
            <Button className="w-full mt-4" onClick={() => setReceipt(null)}>New Sale</Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div>
      {error && <Alert type="error" className="mb-4">{error}</Alert>}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-2 bg-white border rounded-lg p-2">
              <button
                onClick={() => { setIsMember(false); setSelectedDistributor(null); setDistributorSearch(''); }}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${!isMember ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Non-Member (CP)
              </button>
              <button
                onClick={() => setIsMember(true)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer ${isMember ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Member (DP)
              </button>
            </div>
            {isMember && (
              <div className="relative flex-1 min-w-[200px]">
                <Input
                  placeholder="Search distributor by name or NB#..."
                  value={distributorSearch}
                  onChange={e => searchDistributors(e.target.value)}
                />
                {distributorResults.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto mt-1">
                    {distributorResults.map(d => (
                      <button
                        key={d.id}
                        onClick={() => selectDistributor(d)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b cursor-pointer"
                      >
                        <span className="font-medium">{d.name || d.full_name}</span>
                        {d.nb_number && <span className="text-gray-400 ml-2">#{d.nb_number}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {selectedDistributor && (
                  <Badge variant="success" className="mt-1">Selected: {selectedDistributor.name || selectedDistributor.full_name}</Badge>
                )}
              </div>
            )}
          </div>
          <div className="mb-4">
            <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {filtered.slice(0, 30).map(p => (
              <button key={p.id} onClick={() => addToCart(p)} className="p-3 bg-white border border-gray-200 rounded-lg text-left hover:border-primary hover:shadow-sm transition-all cursor-pointer">
                <p className="text-sm font-medium text-gray-800 line-clamp-2">{p.name || p.description}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-sm font-bold text-primary">{formatCurrency(isMember ? (p.dp || p.price) : (p.cp || p.price))}</p>
                  {p.bv > 0 && <span className="text-xs text-gray-400">BV: {p.bv}</span>}
                </div>
              </button>
            ))}
          </div>

          {sales.length > 0 && (
            <Card className="mt-6">
              <CardHeader><h3 className="font-bold text-gray-800">Recent Sales</h3></CardHeader>
              <Table
                columns={[
                  { header: 'Receipt', key: 'receipt_number' },
                  { header: 'Customer', render: r => r.distributor_name || r.customer_type || '-' },
                  { header: 'Total', render: r => <span className="font-bold">{formatCurrency(r.total_amount)}</span> },
                  { header: 'Payment', key: 'payment_method' },
                  { header: 'Date', render: r => formatDateTime(r.created_at) },
                ]}
                data={sales.slice(0, 20)}
                emptyMessage="No recent sales"
              />
            </Card>
          )}
        </div>
        <div>
          <Card className="sticky top-20">
            <CardHeader><h3 className="font-bold text-gray-800">Current Sale</h3></CardHeader>
            <CardBody>
              {cart.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Add items to start a sale</p>
              ) : (
                <div className="space-y-2">
                  {cartData.items.map(item => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <span className="flex-1 truncate">{item.name || item.description}</span>
                      <div className="flex items-center gap-1 mx-2">
                        <button onClick={() => updateQty(item.id, -1)} className="w-6 h-6 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer">−</button>
                        <span className="w-6 text-center">{item.qty}</span>
                        <button onClick={() => updateQty(item.id, 1)} className="w-6 h-6 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 cursor-pointer">+</button>
                      </div>
                      <span className="font-semibold w-20 text-right">{formatCurrency(item.lineTotal)}</span>
                      <button onClick={() => removeFromCart(item.id)} className="ml-2 text-red-400 hover:text-red-600 cursor-pointer">×</button>
                    </div>
                  ))}
                  <div className="border-t pt-2 space-y-1">
                    <div className="flex justify-between font-bold text-lg">
                      <span>Total</span>
                      <span className="text-primary">{formatCurrency(cartData.totalAmount)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Total BV</span>
                      <span>{cartData.totalBV.toFixed(1)}</span>
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['Cash', 'Card', 'Mobile', 'Bank'].map(m => (
                        <button
                          key={m}
                          onClick={() => setPaymentMethod(m)}
                          className={`px-3 py-2 text-sm rounded-lg border transition-colors cursor-pointer ${paymentMethod === m ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary'}`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button className="flex-1" variant="success" onClick={() => setShowReview(true)}>Review Sale</Button>
                    <Button variant="ghost" onClick={() => setCart([])}>Clear</Button>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <Modal open={showReview} onClose={() => setShowReview(false)} title="Review Sale" size="md">
        <div className="p-6 space-y-4">
          <div className="space-y-2">
            {cartData.items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{item.name || item.description} x{item.qty}</span>
                <span className="font-semibold">{formatCurrency(item.lineTotal)}</span>
              </div>
            ))}
          </div>
          <div className="border-t pt-3 space-y-1">
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span className="text-primary">{formatCurrency(cartData.totalAmount)}</span>
            </div>
            <div className="flex justify-between text-sm text-gray-500">
              <span>Total BV</span>
              <span>{cartData.totalBV.toFixed(1)}</span>
            </div>
          </div>
          <div className="text-sm text-gray-600 space-y-1">
            <p>Customer: {isMember ? `Member${selectedDistributor ? ` - ${selectedDistributor.name || selectedDistributor.full_name}` : ''}` : 'Non-Member'}</p>
            <p>Pricing: {isMember ? 'DP (Distributor Price)' : 'CP (Consumer Price)'}</p>
            <p>Payment: {paymentMethod}</p>
          </div>
          <div className="flex gap-3">
            <Button className="flex-1" variant="success" onClick={completeSale} disabled={submitting}>
              {submitting ? 'Processing...' : 'Confirm Sale'}
            </Button>
            <Button variant="ghost" onClick={() => setShowReview(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function PrescriptionsTab() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dispensing, setDispensing] = useState(null);
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    api.reports.list()
      .then(d => setReports(Array.isArray(d) ? d : d.reports || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDispense = async (report) => {
    setDispensing(report.id);
    try {
      await api.put(`/reports/${report.id}`, { dispensed: true, dispensed_at: new Date().toISOString() });
      setAlert({ type: 'success', message: `Prescription for ${report.client_name || 'patient'} dispensed successfully.` });
      setReports(prev => prev.map(r => r.id === report.id ? { ...r, dispensed: true } : r));
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to dispense' });
    } finally {
      setDispensing(null);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {alert && <Alert type={alert.type} className="mb-4">{alert.message}</Alert>}
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Prescriptions from Consultant Reports</h3></CardHeader>
        {reports.length === 0 ? (
          <CardBody><EmptyState icon={<FileText size={48} />} title="No Prescriptions" description="No consultant reports with prescriptions found." /></CardBody>
        ) : (
          <Table
            columns={[
              { header: 'Client', render: r => r.client_name || r.patient_name || '-' },
              { header: 'Date', render: r => formatDate(r.created_at || r.date) },
              { header: 'Prescriptions', render: r => {
                const prescriptions = r.prescriptions || r.prescription || [];
                if (Array.isArray(prescriptions)) return prescriptions.map(p => typeof p === 'string' ? p : p.product_name || p.name).join(', ') || '-';
                return String(prescriptions) || '-';
              }},
              { header: 'Status', render: r => <Badge variant={r.dispensed ? 'success' : 'warning'}>{r.dispensed ? 'Dispensed' : 'Pending'}</Badge> },
              { header: 'Action', render: r => !r.dispensed && (
                <Button size="sm" variant="success" onClick={() => handleDispense(r)} disabled={dispensing === r.id}>
                  {dispensing === r.id ? 'Dispensing...' : 'Dispense'}
                </Button>
              )},
            ]}
            data={reports}
            emptyMessage="No prescriptions"
          />
        )}
      </Card>
    </div>
  );
}

function BranchStockTab() {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.branch.inventory()
      .then(d => setInventory(Array.isArray(d) ? d : d.inventory || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <Card>
      <CardHeader><h3 className="font-bold text-gray-800">Branch Inventory</h3></CardHeader>
      <Table
        columns={[
          { header: 'Product', key: 'product_name' },
          { header: 'Quantity', render: r => <span className={r.quantity < 10 ? 'text-red-600 font-bold' : ''}>{r.quantity || 0}</span> },
          { header: 'Batch', key: 'batch_number' },
          { header: 'Expiry', render: r => formatDateTime(r.expiry_date) },
        ]}
        data={inventory}
        emptyMessage="No inventory data"
      />
    </Card>
  );
}

function BankingTab() {
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);
  const [form, setForm] = useState({ amount: '', bank_name: '', reference: '', deposit_date: '', notes: '' });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    api.branch.deposits()
      .then(d => setDeposits(Array.isArray(d) ? d : d.deposits || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const validate = () => {
    const e = {};
    if (!form.amount || Number(form.amount) <= 0) e.amount = 'Amount must be greater than 0';
    if (!form.bank_name.trim()) e.bank_name = 'Bank name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setAlert(null);
    try {
      await api.branch.createDeposit({
        amount: Number(form.amount),
        bank_name: form.bank_name.trim(),
        reference: form.reference.trim(),
        deposit_date: form.deposit_date || new Date().toISOString().slice(0, 10),
        notes: form.notes.trim(),
      });
      setAlert({ type: 'success', message: 'Deposit recorded successfully' });
      setForm({ amount: '', bank_name: '', reference: '', deposit_date: '', notes: '' });
      setShowForm(false);
      const res = await api.branch.deposits().catch(() => ({ deposits: [] }));
      setDeposits(Array.isArray(res) ? res : res.deposits || []);
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to record deposit' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {alert && <Alert type={alert.type} className="mb-4">{alert.message}</Alert>}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="New Bank Deposit">
        <div className="p-6 space-y-4">
          <Input label="Amount (N$)" type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} error={errors.amount} />
          <Input label="Bank Name" value={form.bank_name} onChange={e => setForm({ ...form, bank_name: e.target.value })} error={errors.bank_name} placeholder="e.g. FNB, Standard Bank" />
          <Input label="Reference Number" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="Deposit slip reference" />
          <Input label="Deposit Date" type="date" value={form.deposit_date} onChange={e => setForm({ ...form, deposit_date: e.target.value })} />
          <Textarea label="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." />
          <div className="flex gap-3">
            <Button className="flex-1" variant="success" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Record Deposit'}
            </Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Bank Deposits</h3>
            <Button size="sm" onClick={() => setShowForm(true)}>New Deposit</Button>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Date', render: r => formatDateTime(r.deposit_date || r.created_at) },
            { header: 'Amount', render: r => <span className="font-bold text-green-600">{formatCurrency(r.amount)}</span> },
            { header: 'Bank', key: 'bank_name' },
            { header: 'Reference', key: 'reference' },
            { header: 'Status', render: r => <Badge variant={r.status === 'verified' ? 'success' : 'warning'}>{r.status || 'Pending'}</Badge> },
          ]}
          data={deposits}
          emptyMessage="No deposits"
        />
      </Card>
    </div>
  );
}

function BranchPaymentsTab() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.branch.payments()
      .then(d => setPayments(Array.isArray(d) ? d : d.payments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <Card>
      <CardHeader><h3 className="font-bold text-gray-800">Payment Records</h3></CardHeader>
      <Table
        columns={[
          { header: 'Date', render: r => formatDateTime(r.created_at) },
          { header: 'Client', render: r => r.client_name || '-' },
          { header: 'Amount', render: r => <span className="font-bold text-green-600">{formatCurrency(r.amount)}</span> },
          { header: 'Method', key: 'payment_method' },
          { header: 'Reference', key: 'reference' },
        ]}
        data={payments}
        emptyMessage="No payment records"
      />
    </Card>
  );
}

function OnlineOrdersTab() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    api.orders.list()
      .then(d => setOrders(Array.isArray(d) ? d : d.orders || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateStatus = async (id, status) => {
    setUpdating(id);
    setAlert(null);
    try {
      await api.orders.update(id, { status });
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
      setAlert({ type: 'success', message: `Order #${id} marked as ${status}` });
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to update order' });
    } finally {
      setUpdating(null);
    }
  };

  const statusBadge = (status) => {
    const map = { pending: 'warning', processing: 'info', shipped: 'primary', delivered: 'success', completed: 'success', cancelled: 'danger' };
    return <Badge variant={map[status] || 'default'}>{status}</Badge>;
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {alert && <Alert type={alert.type} className="mb-4">{alert.message}</Alert>}
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Online Orders</h3></CardHeader>
        <Table
          columns={[
            { header: 'Order #', key: 'id' },
            { header: 'Customer', render: r => r.customer_name || r.distributor_name || '-' },
            { header: 'Total', render: r => <span className="font-bold">{formatCurrency(r.total || r.total_amount)}</span> },
            { header: 'Status', render: r => statusBadge(r.status) },
            { header: 'Date', render: r => formatDateTime(r.created_at) },
            { header: 'Actions', render: r => (
              <div className="flex gap-1 flex-wrap">
                {(!r.status || r.status === 'pending') && (
                  <Button size="sm" variant="warning" onClick={() => updateStatus(r.id, 'processing')} disabled={updating === r.id}>Processing</Button>
                )}
                {r.status === 'processing' && (
                  <Button size="sm" variant="primary" onClick={() => updateStatus(r.id, 'shipped')} disabled={updating === r.id}>Ship</Button>
                )}
                {r.status === 'shipped' && (
                  <Button size="sm" variant="success" onClick={() => updateStatus(r.id, 'delivered')} disabled={updating === r.id}>Delivered</Button>
                )}
              </div>
            )},
          ]}
          data={orders}
          emptyMessage="No online orders"
        />
      </Card>
    </div>
  );
}

function BonusTab() {
  const [bonuses, setBonuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);
  const [form, setForm] = useState({ distributor_name: '', nb_number: '', amount: '', bv_amount: '', period: '', notes: '' });

  useEffect(() => {
    api.get('/branch/payments?type=bonus')
      .then(d => setBonuses(Array.isArray(d) ? d : d.payments || d.bonuses || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async () => {
    if (!form.distributor_name.trim() || !form.amount || Number(form.amount) <= 0) return;
    setSubmitting(true);
    try {
      await api.branch.createPayment({
        type: 'bonus',
        client_name: form.distributor_name.trim(),
        nb_number: form.nb_number.trim(),
        amount: Number(form.amount),
        bv_amount: Number(form.bv_amount) || 0,
        period: form.period,
        notes: form.notes,
        payment_method: 'Bank Transfer',
      });
      setAlert({ type: 'success', message: 'Bonus payout recorded' });
      setForm({ distributor_name: '', nb_number: '', amount: '', bv_amount: '', period: '', notes: '' });
      setShowForm(false);
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to record bonus' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {alert && <Alert type={alert.type} className="mb-4">{alert.message}</Alert>}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Record Bonus Payout">
        <div className="p-6 space-y-4">
          <Input label="Distributor Name" value={form.distributor_name} onChange={e => setForm({ ...form, distributor_name: e.target.value })} />
          <Input label="NB Number" value={form.nb_number} onChange={e => setForm({ ...form, nb_number: e.target.value })} />
          <Input label="Bonus Amount (N$)" type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          <Input label="BV Amount" type="number" value={form.bv_amount} onChange={e => setForm({ ...form, bv_amount: e.target.value })} />
          <Input label="Period" value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} placeholder="e.g. March 2026" />
          <Textarea label="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <div className="flex gap-3">
            <Button className="flex-1" variant="success" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Recording...' : 'Record Payout'}
            </Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Bonus Payments</h3>
            <Button size="sm" onClick={() => setShowForm(true)}>Record Payout</Button>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Distributor', render: r => r.client_name || r.distributor_name || '-' },
            { header: 'Amount', render: r => <span className="font-bold text-green-600">{formatCurrency(r.amount)}</span> },
            { header: 'Period', key: 'period' },
            { header: 'Status', render: r => <Badge variant={r.status === 'paid' ? 'success' : 'warning'}>{r.status || 'Pending'}</Badge> },
            { header: 'Date', render: r => formatDateTime(r.created_at) },
          ]}
          data={bonuses}
          emptyMessage="No bonus records"
        />
      </Card>
    </div>
  );
}

function CommunicationTab() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);
  const [form, setForm] = useState({ title: '', message: '' });

  useEffect(() => {
    api.notifications.list()
      .then(d => setAnnouncements(Array.isArray(d) ? d : d.notifications || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.message.trim()) return;
    setSubmitting(true);
    try {
      await api.notifications.create({
        title: form.title.trim(),
        message: form.message.trim(),
        type: 'announcement',
        target: 'branch',
      });
      setAlert({ type: 'success', message: 'Announcement posted' });
      setForm({ title: '', message: '' });
      const res = await api.notifications.list().catch(() => ({ notifications: [] }));
      setAnnouncements(Array.isArray(res) ? res : res.notifications || []);
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to post announcement' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type}>{alert.message}</Alert>}
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Post Announcement</h3></CardHeader>
        <CardBody>
          <div className="space-y-3">
            <Input label="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Announcement title" />
            <Textarea label="Message" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} placeholder="Write your announcement..." />
            <Button onClick={handleSubmit} disabled={submitting}>{submitting ? 'Posting...' : 'Post Announcement'}</Button>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Announcements</h3></CardHeader>
        {announcements.length === 0 ? (
          <CardBody><p className="text-sm text-gray-400 text-center py-4">No announcements</p></CardBody>
        ) : (
          <CardBody>
            <div className="space-y-3">
              {announcements.map((a, i) => (
                <div key={a.id || i} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-start">
                    <h4 className="font-semibold text-gray-800">{a.title}</h4>
                    <span className="text-xs text-gray-400">{formatDateTime(a.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{a.message}</p>
                </div>
              ))}
            </div>
          </CardBody>
        )}
      </Card>
    </div>
  );
}

function StaffTab() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.employees.list()
      .then(d => setEmployees(Array.isArray(d) ? d : d.employees || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <Card>
      <CardHeader><h3 className="font-bold text-gray-800">Branch Staff</h3></CardHeader>
      {employees.length === 0 ? (
        <CardBody><EmptyState icon={<Users size={48} />} title="No Staff Records" description="No employees found for this branch." /></CardBody>
      ) : (
        <Table
          columns={[
            { header: 'Name', render: r => r.full_name || r.name || '-' },
            { header: 'Position', key: 'position' },
            { header: 'Department', key: 'department' },
            { header: 'Phone', key: 'phone' },
            { header: 'Email', key: 'email' },
            { header: 'Status', render: r => <Badge variant={r.is_active !== false ? 'success' : 'danger'}>{r.is_active !== false ? 'Active' : 'Inactive'}</Badge> },
          ]}
          data={employees}
          emptyMessage="No staff records"
        />
      )}
    </Card>
  );
}

function DistributorRegTab() {
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);
  const [form, setForm] = useState({
    full_name: '', id_number: '', phone: '', email: '',
    nb_number: '', sponsor_name: '', sponsor_nb: '',
    physical_address: '', town: '', registration_type: 'new',
  });

  const handleSubmit = async () => {
    if (!form.full_name.trim() || !form.phone.trim()) {
      setAlert({ type: 'error', message: 'Name and phone are required' });
      return;
    }
    setSubmitting(true);
    setAlert(null);
    try {
      await api.distributors.create({
        name: form.full_name.trim(),
        full_name: form.full_name.trim(),
        id_number: form.id_number.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        nb_number: form.nb_number.trim(),
        sponsor_name: form.sponsor_name.trim(),
        sponsor_nb: form.sponsor_nb.trim(),
        physical_address: form.physical_address.trim(),
        town: form.town.trim(),
        registration_type: form.registration_type,
      });
      setAlert({ type: 'success', message: `Distributor ${form.full_name} registered successfully!` });
      setForm({ full_name: '', id_number: '', phone: '', email: '', nb_number: '', sponsor_name: '', sponsor_nb: '', physical_address: '', town: '', registration_type: 'new' });
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Registration failed' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {alert && <Alert type={alert.type} className="mb-4">{alert.message}</Alert>}
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Register New Distributor</h3></CardHeader>
        <CardBody>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Full Name *" value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} />
              <Input label="ID Number" value={form.id_number} onChange={e => setForm({ ...form, id_number: e.target.value })} />
              <Input label="Phone *" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              <Input label="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              <Input label="NB Number" value={form.nb_number} onChange={e => setForm({ ...form, nb_number: e.target.value })} placeholder="Assigned NB number" />
              <Input label="Town" value={form.town} onChange={e => setForm({ ...form, town: e.target.value })} />
            </div>
            <Input label="Physical Address" value={form.physical_address} onChange={e => setForm({ ...form, physical_address: e.target.value })} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Sponsor Name" value={form.sponsor_name} onChange={e => setForm({ ...form, sponsor_name: e.target.value })} />
              <Input label="Sponsor NB Number" value={form.sponsor_nb} onChange={e => setForm({ ...form, sponsor_nb: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Registration Type</label>
              <div className="flex gap-3">
                {['new', 'transfer', 'renewal'].map(t => (
                  <button
                    key={t}
                    onClick={() => setForm({ ...form, registration_type: t })}
                    className={`px-4 py-2 text-sm rounded-lg border transition-colors cursor-pointer capitalize ${form.registration_type === t ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <Button className="w-full" variant="success" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Registering...' : 'Register Distributor'}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function FieldProgramTab() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);
  const [form, setForm] = useState({
    activity_type: 'health_screening', location: '', date: '', time: '',
    coordinator: '', target_audience: '', notes: '',
  });

  useEffect(() => {
    api.get('/field_program_requests')
      .then(d => setActivities(Array.isArray(d) ? d : d.activities || d.requests || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async () => {
    if (!form.location.trim() || !form.date) return;
    setSubmitting(true);
    try {
      await api.post('/field_program_requests', {
        activity_type: form.activity_type,
        location: form.location.trim(),
        date: form.date,
        time: form.time,
        coordinator: form.coordinator.trim(),
        target_audience: form.target_audience.trim(),
        notes: form.notes.trim(),
        status: 'scheduled',
      });
      setAlert({ type: 'success', message: 'Field activity scheduled' });
      setForm({ activity_type: 'health_screening', location: '', date: '', time: '', coordinator: '', target_audience: '', notes: '' });
      setShowForm(false);
      const res = await api.get('/field_program_requests').catch(() => []);
      setActivities(Array.isArray(res) ? res : res.activities || res.requests || []);
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to schedule activity' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {alert && <Alert type={alert.type} className="mb-4">{alert.message}</Alert>}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Schedule Field Activity">
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Activity Type</label>
            <select
              value={form.activity_type}
              onChange={e => setForm({ ...form, activity_type: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
            >
              <option value="health_screening">Health Screening</option>
              <option value="product_demo">Product Demo</option>
              <option value="community_outreach">Community Outreach</option>
              <option value="training">Training Session</option>
              <option value="recruitment">Recruitment Drive</option>
            </select>
          </div>
          <Input label="Location *" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Date *" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            <Input label="Time" type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} />
          </div>
          <Input label="Coordinator" value={form.coordinator} onChange={e => setForm({ ...form, coordinator: e.target.value })} />
          <Input label="Target Audience" value={form.target_audience} onChange={e => setForm({ ...form, target_audience: e.target.value })} placeholder="e.g. Community members, distributors" />
          <Textarea label="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <div className="flex gap-3">
            <Button className="flex-1" variant="success" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Scheduling...' : 'Schedule Activity'}
            </Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Field Program Activities</h3>
            <Button size="sm" onClick={() => setShowForm(true)}>Schedule Activity</Button>
          </div>
        </CardHeader>
        {activities.length === 0 ? (
          <CardBody><EmptyState icon={<Map size={48} />} title="No Field Activities" description="No field program activities scheduled." /></CardBody>
        ) : (
          <Table
            columns={[
              { header: 'Type', render: r => <Badge variant="info">{(r.activity_type || '').replace(/_/g, ' ')}</Badge> },
              { header: 'Location', key: 'location' },
              { header: 'Date', render: r => formatDate(r.date) },
              { header: 'Coordinator', key: 'coordinator' },
              { header: 'Status', render: r => <Badge variant={r.status === 'completed' ? 'success' : r.status === 'cancelled' ? 'danger' : 'warning'}>{r.status || 'Scheduled'}</Badge> },
            ]}
            data={activities}
            emptyMessage="No activities"
          />
        )}
      </Card>
    </div>
  );
}

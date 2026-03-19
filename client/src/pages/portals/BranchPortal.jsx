import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatCurrency, formatDateTime, formatDate, BRANCHES, COMPANY_INFO, BRANCH_DETAILS } from '../../lib/constants';
import { enrichProductsWithPricing, calculateCartTotals, generateReceiptNumber, PRICE_LIST } from '../../lib/pricing';
import { generateReceiptHTML, printReceipt } from '../../lib/receipt';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Table, Modal, Alert, Select, Textarea } from '../../components/ui';
import { ShoppingCart, FileText, Package, Landmark, CreditCard, ClipboardList, Gift, MessageSquare, Users, UserPlus, Map, Printer, AlertTriangle, Search, ArrowRightLeft, Trash2, RotateCcw } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { MembershipAgreementForm } from '../../components/MembershipAgreementForm';

const DEFAULT_REFERRAL = { name: 'Dynapharm Namibia', nb_number: 'NB005676', id: 'DEFAULT_REFERRAL' };

export default function BranchPortal() {
  const [activeTab, setActiveTab] = useState('walkIn');
  const tabs = [
    { id: 'walkIn', label: 'Walk-in Sales', icon: '🛒' },
    { id: 'prescriptions', label: 'Prescriptions', icon: '💊' },
    { id: 'stock', label: 'Stock', icon: '📦' },
    { id: 'banking', label: 'Banking', icon: '🏦' },
    { id: 'payments', label: 'Payments', icon: '💳' },
    { id: 'onlineOrders', label: 'Online Orders', icon: '🛍️' },
    { id: 'bonus', label: 'Bonus', icon: '🎁' },
    { id: 'communication', label: 'Communication', icon: '💬' },
    { id: 'staff', label: 'Staff', icon: '👤' },
    { id: 'registration', label: 'Distributor Registration', icon: '📝' },
    { id: 'fieldProgram', label: 'Field Program', icon: '🚐' },
  ];

  return (
    <div>
      <h2 className="text-center text-2xl font-bold mb-6" style={{ color: '#2c3e50' }}>🏬 Branch Portal</h2>
      <div className="flex gap-2 mb-8 overflow-x-auto pb-1 flex-wrap" style={{ borderBottom: '3px solid #c41e3a' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="px-4 py-3 text-sm font-medium rounded-t-lg whitespace-nowrap cursor-pointer transition-all"
            style={activeTab === tab.id
              ? { background: 'linear-gradient(135deg, #3498db, #2980b9)', color: 'white', fontWeight: 600, boxShadow: '0 2px 8px rgba(52,152,219,0.2)' }
              : { background: 'transparent', color: '#64748b', border: 'none' }
            }
          >
            <span className="mr-1.5">{tab.icon}</span>{tab.label}
          </button>
        ))}
      </div>
      <div>
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
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [customerType, setCustomerType] = useState(null);
  const [isMember, setIsMember] = useState(false);
  const [distributorSearch, setDistributorSearch] = useState('');
  const [selectedDistributor, setSelectedDistributor] = useState(null);
  const [distributorResults, setDistributorResults] = useState([]);
  const [referralSearch, setReferralSearch] = useState('');
  const [selectedReferral, setSelectedReferral] = useState(null);
  const [referralResults, setReferralResults] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [showReview, setShowReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState('');
  const [receiptSearch, setReceiptSearch] = useState('');
  const [foundReceipt, setFoundReceipt] = useState(null);

  const loadSales = () => {
    return api.branch.walkinSales().then(d => setSales(Array.isArray(d) ? d : d.sales || [])).catch(() => {});
  };

  useEffect(() => {
    Promise.all([
      api.products.list().then(d => {
        const raw = Array.isArray(d) ? d : d.products || [];
        setProducts(enrichProductsWithPricing(raw));
      }),
      loadSales(),
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

  const normalizeDistributor = (d) => ({
    ...d,
    name: d.name || d.distributor_name || d.full_name || '',
    nb_number: d.nb_number || d.distributor_code || '',
    phone: d.phone || d.mobile_no || '',
  });

  const selectDistributor = (d) => {
    const norm = normalizeDistributor(d);
    setSelectedDistributor(norm);
    setIsMember(true);
    setDistributorResults([]);
    setDistributorSearch(norm.name);
  };

  const searchReferrals = async (q) => {
    setReferralSearch(q);
    if (q.length < 2) { setReferralResults([]); return; }
    try {
      const res = await api.distributors.search(q);
      setReferralResults(Array.isArray(res) ? res : res.distributors || []);
    } catch { setReferralResults([]); }
  };

  const selectReferral = (d) => {
    const norm = normalizeDistributor(d);
    setSelectedReferral(norm);
    setReferralResults([]);
    setReferralSearch(norm.name);
  };

  const selectCustomerType = (type) => {
    setCustomerType(type);
    if (type === 'member') {
      setIsMember(true);
      setSelectedReferral(null);
      setReferralSearch('');
    } else {
      setIsMember(false);
      setSelectedDistributor(null);
      setDistributorSearch('');
      setSelectedReferral(DEFAULT_REFERRAL);
      setReferralSearch(DEFAULT_REFERRAL.name);
    }
  };

  const resetSale = () => {
    setCustomerType(null);
    setIsMember(false);
    setSelectedDistributor(null);
    setDistributorSearch('');
    setSelectedReferral(null);
    setReferralSearch('');
    setCart([]);
    setPaymentMethod('Cash');
    setReceipt(null);
    setError('');
  };

  const canCompleteSale = cart.length > 0 && (!isMember || selectedDistributor);

  const completeSale = async () => {
    if (cart.length === 0) return;
    if (isMember && !selectedDistributor) {
      setError('Please select a distributor before completing a member sale.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const receiptNumber = generateReceiptNumber();
      const referral = isMember ? selectedDistributor : (selectedReferral || DEFAULT_REFERRAL);
      const saleData = {
        receipt_number: receiptNumber,
        branch: user?.branch || '',
        branchId: user?.branch || '',
        customer_type: isMember ? 'member' : 'non_member',
        customerType: isMember ? 'member' : 'non_member',
        distributor_id: isMember ? (selectedDistributor?.id || null) : null,
        distributor_name: isMember ? (selectedDistributor?.name || selectedDistributor?.full_name || null) : null,
        distributor_nb: isMember ? (selectedDistributor?.nb_number || null) : null,
        referral_id: referral?.id || DEFAULT_REFERRAL.id,
        referral_name: referral?.name || referral?.full_name || DEFAULT_REFERRAL.name,
        referral_nb: referral?.nb_number || DEFAULT_REFERRAL.nb_number,
        payment_method: paymentMethod,
        paymentMethod: paymentMethod,
        items: cartData.items.map(item => ({
          product_id: item.id,
          product_name: item.name || item.description,
          quantity: item.qty,
          unit_price: item.unitPrice,
          line_total: item.lineTotal,
          bv: item.lineBV,
        })),
        products: cartData.items.map(item => ({
          product_id: item.id,
          name: item.name || item.description,
          quantity: item.qty,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          bv: item.lineBV,
        })),
        total_amount: cartData.totalAmount,
        total: cartData.totalAmount,
        subtotal: cartData.totalAmount,
        total_bv: cartData.totalBV,
        totalBV: cartData.totalBV,
        soldBy: user?.full_name || user?.username || null,
        distributorReferral: {
          id: referral?.id || DEFAULT_REFERRAL.id,
          name: referral?.name || referral?.full_name || DEFAULT_REFERRAL.name,
          nb_number: referral?.nb_number || DEFAULT_REFERRAL.nb_number,
        },
      };
      await api.branch.createWalkinSale(saleData);
      setReceipt({ ...saleData, branch: user?.branch || '', created_at: new Date().toISOString() });
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

  const searchReceipt = async () => {
    if (!receiptSearch.trim()) return;
    const all = sales.length > 0 ? sales : [];
    const found = all.find(s => (s.receipt_number || s.saleNumber || s.id || '').toLowerCase().includes(receiptSearch.toLowerCase())
      || (s.customer_name || s.distributor_name || '').toLowerCase().includes(receiptSearch.toLowerCase()));
    setFoundReceipt(found || null);
  };

  if (loading) return <LoadingSpinner />;

  if (receipt) {
    const isM = receipt.customer_type === 'member';
    const receiptHTML = generateReceiptHTML({
      receiptNumber: receipt.receipt_number,
      branch: receipt.branch || user?.branch || '',
      items: receipt.items,
      totalAmount: receipt.total_amount,
      totalBV: receipt.total_bv || 0,
      paymentMethod: receipt.payment_method,
      customerType: receipt.customer_type,
      customerName: isM ? receipt.distributor_name : (receipt.customer_name || 'Walk-in Customer'),
      nbNumber: isM ? receipt.distributor_nb : null,
      referralName: !isM ? (receipt.referral_name || DEFAULT_REFERRAL.name) : null,
      referralNB: !isM ? (receipt.referral_nb || DEFAULT_REFERRAL.nb_number) : null,
      cashier: user?.full_name || user?.username || null,
      showBV: true,
    });

    return (
      <div className="max-w-lg mx-auto">
        <Card className="overflow-hidden">
          <div className="p-5 flex justify-between items-center" style={{ background: 'linear-gradient(135deg, #27ae60, #1e8449)' }}>
            <div>
              <h3 className="text-white text-lg font-bold m-0">✓ Sale Complete</h3>
              <p className="text-white/80 text-sm mt-1 m-0">Transaction recorded successfully</p>
            </div>
            <button onClick={() => printReceipt(receiptHTML)} className="px-4 py-2 bg-white/20 text-white border border-white/40 rounded-lg text-sm font-semibold cursor-pointer hover:bg-white/30 transition-all">
              <span className="inline-flex items-center gap-1"><Printer size={14} /> Print Receipt</span>
            </button>
          </div>
          <CardBody>
            <div className="text-center mb-4">
              <img src={COMPANY_INFO.logo} alt="Dynapharm" className="h-12 mx-auto mb-2" onError={e => { e.target.style.display = 'none'; }} />
              <p className="text-xs text-gray-500 font-semibold">{COMPANY_INFO.name}</p>
              <p className="text-xs text-gray-400">{COMPANY_INFO.tagline}</p>
              {(user?.branch || receipt.branch) && (() => {
                const bi = BRANCH_DETAILS.find(b => b.name === (user?.branch || receipt.branch));
                return bi ? <p className="text-xs text-gray-400 mt-1">{bi.name} | {bi.phone}</p> : null;
              })()}
            </div>
            <div className="text-center mb-3">
              <p className="text-sm text-gray-500">Receipt: <strong>{receipt.receipt_number}</strong></p>
              <p className="text-sm text-gray-500">{formatDateTime(receipt.created_at)}</p>
              {user?.full_name && <p className="text-xs text-gray-400">Cashier: {user.full_name}</p>}
            </div>
            <div className="border rounded-lg overflow-hidden mt-2">
              <div className="bg-gray-50 px-3 py-2">
                <p className="text-xs font-bold uppercase text-gray-500">Products</p>
              </div>
              <div className="divide-y">
                {receipt.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="flex-1">
                      <span className="font-medium">{item.product_name}</span>
                      <span className="text-gray-400 ml-1">x{item.quantity}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold">{formatCurrency(item.line_total)}</span>
                      {Number(item.bv || 0) > 0 && <span className="text-xs text-orange-500 ml-2">{Number(item.bv).toFixed(1)} BV</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t px-3 py-2 flex justify-between items-center bg-gray-50">
                <div className="text-sm text-gray-500">BV earned: <strong className="text-orange-500">{Number(receipt.total_bv || 0).toFixed(1)}</strong></div>
                <div className="text-lg font-bold">Total: <span className="text-green-600">{formatCurrency(receipt.total_amount)}</span></div>
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-2">Payment: {receipt.payment_method}</p>
            {isM && receipt.distributor_name && (
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg mt-2 text-sm">
                <p className="text-xs font-bold uppercase text-gray-500 mb-1">Member Details</p>
                <div className="grid grid-cols-2 gap-1 text-sm">
                  <p><span className="text-gray-400">Name:</span> <strong>{receipt.distributor_name}</strong></p>
                  <p><span className="text-gray-400">NB#:</span> <strong>{receipt.distributor_nb || '—'}</strong></p>
                </div>
                <p className="text-blue-600 text-xs mt-1">DP Price Applied | BV: {Number(receipt.total_bv || 0).toFixed(1)}</p>
              </div>
            )}
            {!isM && (
              <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg mt-2 text-sm">
                <p className="text-xs font-bold uppercase text-gray-500 mb-1">Non-Member Sale (CP)</p>
                <div className="grid grid-cols-2 gap-1 text-sm">
                  <p><span className="text-gray-400">Referral:</span> <strong className="text-orange-600">{receipt.referral_name || DEFAULT_REFERRAL.name}</strong></p>
                  <p><span className="text-gray-400">NB#:</span> <strong>{receipt.referral_nb || DEFAULT_REFERRAL.nb_number}</strong></p>
                </div>
                <p className="text-yellow-600 text-xs mt-1">BV & profit assigned to referral distributor</p>
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <Button className="flex-1" onClick={resetSale}>New Sale</Button>
              <Button variant="secondary" onClick={() => printReceipt(receiptHTML)}>
                <Printer size={14} /> Print
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  if (!customerType) {
    return (
      <div>
        <div className="rounded-xl p-6 mb-5 flex justify-between items-center flex-wrap gap-4" style={{ background: 'linear-gradient(135deg, #1e3a5f, #2980b9)' }}>
          <div>
            <h3 className="text-white text-xl font-bold m-0">🛒 Walk-in Sales</h3>
            <p className="text-white/75 text-sm mt-1 m-0">Process walk-in purchases for registered clients and new customers</p>
          </div>
          <button
            onClick={() => selectCustomerType('non-member')}
            className="px-7 py-3.5 text-white border-none rounded-xl text-base font-bold cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #27ae60, #1e8449)', boxShadow: '0 3px 8px rgba(0,0,0,0.2)' }}
          >
            ➕ New Walk-in Sale
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mb-5">
          <div className="rounded-xl p-4 cursor-pointer transition-all hover:shadow-md" style={{ background: '#ebf5fb', border: '2px solid #3498db' }} onClick={() => selectCustomerType('member')}>
            <div className="text-lg font-bold mb-1.5" style={{ color: '#1a5276' }}>🪪 Registered Client</div>
            <ul className="m-0 pl-5 text-sm leading-7" style={{ color: '#2c3e50' }}>
              <li>Has an NB number in the system</li>
              <li>Pays at <strong>DP price</strong> (distributor price)</li>
              <li>Earns <strong>BV points</strong> on their account</li>
              <li>No referral required</li>
            </ul>
          </div>
          <div className="rounded-xl p-4 cursor-pointer transition-all hover:shadow-md" style={{ background: '#fef9e7', border: '2px solid #f39c12' }} onClick={() => selectCustomerType('non-member')}>
            <div className="text-lg font-bold mb-1.5" style={{ color: '#784212' }}>👤 New Customer</div>
            <ul className="m-0 pl-5 text-sm leading-7" style={{ color: '#2c3e50' }}>
              <li>Walk-in, not yet registered</li>
              <li>Pays at <strong>CP price</strong> (retail price)</li>
              <li>Referring distributor gets <strong>BVs &amp; commission</strong></li>
              <li>Referral distributor required (or tick "no referral")</li>
            </ul>
          </div>
        </div>

        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #e2e8f0' }}>
          <div className="flex justify-between items-center px-4 py-3" style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
            <h4 className="m-0 text-base font-semibold" style={{ color: '#1e293b' }}>📋 Recent Walk-in Sales</h4>
            <div className="flex gap-2 items-center">
              {sales.length > 0 && (
                <div className="flex gap-2 items-center">
                  <Input placeholder="Receipt # or customer name..." value={receiptSearch} onChange={e => setReceiptSearch(e.target.value)} className="text-sm" style={{ minWidth: 180 }} />
                  <Button size="sm" variant="secondary" onClick={searchReceipt}><Search size={14} /></Button>
                </div>
              )}
              <button onClick={loadSales} className="px-3 py-1.5 rounded-md bg-white cursor-pointer text-xs" style={{ border: '1px solid #cbd5e1', color: '#64748b' }}>🔄 Refresh</button>
            </div>
          </div>
          <div className="min-h-[80px] py-1.5 px-0">
            {foundReceipt && (
              <div className="mx-4 mt-2 p-3 bg-gray-50 rounded-lg text-sm">
                <p className="font-medium">{foundReceipt.receipt_number || foundReceipt.saleNumber || foundReceipt.id}</p>
                <p className="text-gray-500">{foundReceipt.distributor_name || foundReceipt.customer_name || foundReceipt.customerName || 'Walk-in'}</p>
                <p className="text-gray-500">{formatCurrency(foundReceipt.total || foundReceipt.totalAmount || foundReceipt.total_amount)} | {formatDateTime(foundReceipt.created_at || foundReceipt.timestamp)}</p>
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => {
                  const fIsM = (foundReceipt.customerType || foundReceipt.customer_type) === 'member';
                  const html = generateReceiptHTML({
                    receiptNumber: foundReceipt.receipt_number || foundReceipt.saleNumber || foundReceipt.id,
                    branch: foundReceipt.branch || user?.branch || '',
                    items: foundReceipt.products || foundReceipt.items || [],
                    totalAmount: foundReceipt.total || foundReceipt.totalAmount || foundReceipt.total_amount || 0,
                    totalBV: foundReceipt.totalBV || foundReceipt.total_bv || 0,
                    paymentMethod: foundReceipt.paymentMethod || foundReceipt.payment_method || '',
                    customerType: foundReceipt.customerType || foundReceipt.customer_type || 'non_member',
                    customerName: foundReceipt.distributor_name || foundReceipt.customerName || foundReceipt.customer_name || (fIsM ? null : 'Walk-in Customer'),
                    nbNumber: fIsM ? (foundReceipt.distributor_nb || foundReceipt.distributorReferral?.nb_number || null) : null,
                    referralName: !fIsM ? (foundReceipt.referral_name || foundReceipt.distributorReferral?.name || null) : null,
                    referralNB: !fIsM ? (foundReceipt.referral_nb || foundReceipt.distributorReferral?.nb_number || null) : null,
                    cashier: foundReceipt.soldBy || '',
                    showBV: true,
                  });
                  printReceipt(html);
                }}><Printer size={14} /> Reprint</Button>
              </div>
            )}
            {sales.length === 0 && !foundReceipt && (
              <p className="text-center py-6" style={{ color: '#94a3b8' }}>No walk-in sales recorded yet</p>
            )}
            {sales.length > 0 && !foundReceipt && (
              <div className="divide-y">
                {sales.slice(0, 10).map((s, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-gray-50">
                    <div>
                      <span className="font-medium">{s.receipt_number || s.saleNumber || `#${s.id}`}</span>
                      <span className="text-gray-400 mx-2">|</span>
                      <span className="text-gray-500">{s.distributor_name || s.customer_name || s.customerName || 'Walk-in'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{formatCurrency(s.total || s.totalAmount || s.total_amount || 0)}</span>
                      <span className="text-xs text-gray-400">{formatDate(s.created_at || s.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="rounded-xl p-5 mb-5 flex justify-between items-center flex-wrap gap-3" style={{ background: 'linear-gradient(135deg, #1e3a5f, #2980b9)' }}>
        <div>
          <h3 className="text-white text-lg font-bold m-0">🛒 Walk-in Sales</h3>
          <p className="text-white/75 text-xs mt-1 m-0">Processing {isMember ? 'Registered Client (DP)' : 'New Customer (CP)'} sale</p>
        </div>
        <button onClick={resetSale} className="px-4 py-2 bg-white/20 text-white border border-white/40 rounded-lg text-sm font-semibold cursor-pointer hover:bg-white/30 transition-all">✕ Cancel Sale</button>
      </div>
      {error && <Alert type="error" className="mb-4">{error}</Alert>}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-2 bg-white border rounded-lg p-2">
              <button
                onClick={() => selectCustomerType('non-member')}
                className="px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer"
                style={!isMember ? { background: 'linear-gradient(135deg, #3498db, #2980b9)', color: 'white', fontWeight: 600 } : { color: '#64748b' }}
              >
                Non-Member (CP)
              </button>
              <button
                onClick={() => selectCustomerType('member')}
                className="px-3 py-1.5 text-sm rounded-md transition-colors cursor-pointer"
                style={isMember ? { background: 'linear-gradient(135deg, #3498db, #2980b9)', color: 'white', fontWeight: 600 } : { color: '#64748b' }}
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
                        <span className="font-medium">{d.name || d.distributor_name || d.full_name}</span>
                        <span className="text-gray-400 ml-2">#{d.nb_number || d.distributor_code}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedDistributor && (
                  <Badge variant="success" className="mt-1">Selected: {selectedDistributor.name || selectedDistributor.full_name} ({selectedDistributor.nb_number})</Badge>
                )}
              </div>
            )}
            {!isMember && (
              <div className="relative flex-1 min-w-[200px]">
                <Input
                  placeholder="Search referral distributor (or leave default)..."
                  value={referralSearch}
                  onChange={e => searchReferrals(e.target.value)}
                />
                {referralResults.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto mt-1">
                    {referralResults.map(d => (
                      <button
                        key={d.id}
                        onClick={() => selectReferral(d)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b cursor-pointer"
                      >
                        <span className="font-medium">{d.name || d.distributor_name || d.full_name}</span>
                        <span className="text-gray-400 ml-2">#{d.nb_number || d.distributor_code}</span>
                      </button>
                    ))}
                  </div>
                )}
                <Badge variant="info" className="mt-1">
                  Referral: {selectedReferral?.name || selectedReferral?.full_name || DEFAULT_REFERRAL.name} ({selectedReferral?.nb_number || DEFAULT_REFERRAL.nb_number})
                </Badge>
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={resetSale}><RotateCcw size={14} /> Reset</Button>
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
                  { header: 'Receipt', render: r => r.receipt_number || r.saleNumber || r.id || '-' },
                  { header: 'Customer', render: r => r.distributor_name || r.customerName || r.customer_name || r.customer_type || '-' },
                  { header: 'Total', render: r => <span className="font-bold">{formatCurrency(r.total_amount || r.total || r.totalAmount)}</span> },
                  { header: 'Payment', render: r => r.payment_method || r.paymentMethod || '-' },
                  { header: 'Date', render: r => formatDateTime(r.created_at || r.timestamp) },
                  { header: '', render: r => {
                    const rIsM = (r.customerType || r.customer_type) === 'member';
                    return (
                    <Button size="sm" variant="ghost" onClick={() => {
                      const html = generateReceiptHTML({
                        receiptNumber: r.receipt_number || r.saleNumber || r.id,
                        branch: r.branch || user?.branch || '',
                        items: r.products || r.items || [],
                        totalAmount: r.total || r.totalAmount || r.total_amount || 0,
                        totalBV: r.totalBV || r.total_bv || 0,
                        paymentMethod: r.paymentMethod || r.payment_method || '',
                        customerType: r.customerType || r.customer_type || 'non_member',
                        customerName: r.distributor_name || r.customerName || r.customer_name || (rIsM ? null : 'Walk-in Customer'),
                        nbNumber: rIsM ? (r.distributor_nb || r.distributorReferral?.nb_number || null) : null,
                        referralName: !rIsM ? (r.referral_name || r.distributorReferral?.name || null) : null,
                        referralNB: !rIsM ? (r.referral_nb || r.distributorReferral?.nb_number || null) : null,
                        cashier: r.soldBy || '',
                        showBV: true,
                      });
                      printReceipt(html);
                    }}><Printer size={12} /></Button>
                    );
                  }},
                ]}
                data={sales.slice(0, 20)}
                emptyMessage="No recent sales"
              />
            </Card>
          )}
        </div>
        <div>
          <Card className="sticky top-20 overflow-hidden">
            <div className="px-5 py-3" style={{ background: 'linear-gradient(135deg, #1e3a5f, #2980b9)' }}>
              <h3 className="font-bold text-white m-0 text-sm">🛒 Current Sale</h3>
            </div>
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
                    {isMember && (
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>Total BV</span>
                        <span>{cartData.totalBV.toFixed(1)}</span>
                      </div>
                    )}
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
                    <Button className="flex-1" variant="success" onClick={() => setShowReview(true)} disabled={!canCompleteSale}>Review Sale</Button>
                    <Button variant="ghost" onClick={() => setCart([])}>Clear</Button>
                  </div>
                  {isMember && !selectedDistributor && cart.length > 0 && (
                    <p className="text-xs text-red-500 mt-1">Select a distributor to continue</p>
                  )}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <Modal open={showReview} onClose={() => setShowReview(false)} title="Confirm Sale" size="md">
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs font-bold uppercase text-gray-500 mb-2">Customer</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-gray-400">Name:</span> <strong>{isMember ? (selectedDistributor?.name || selectedDistributor?.full_name || 'Not selected') : 'Walk-in Customer'}</strong></div>
              <div><span className="text-gray-400">Type:</span> <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${isMember ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'}`}>{isMember ? 'Member (DP)' : 'Non-Member (CP)'}</span></div>
              <div><span className="text-gray-400">NB#:</span> <span>{isMember ? (selectedDistributor?.nb_number || selectedDistributor?.distributor_code || '—') : '—'}</span></div>
              <div><span className="text-gray-400">Phone:</span> <span>{isMember ? (selectedDistributor?.phone || selectedDistributor?.mobile_no || '—') : '—'}</span></div>
              {!isMember && (
                <div className="col-span-2"><span className="text-gray-400">Referral:</span> <span className="text-orange-600 font-semibold">{selectedReferral?.name || selectedReferral?.full_name || DEFAULT_REFERRAL.name} ({selectedReferral?.nb_number || selectedReferral?.distributor_code || DEFAULT_REFERRAL.nb_number})</span></div>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs font-bold uppercase text-gray-500 mb-2">Products</p>
            <div className="divide-y max-h-48 overflow-y-auto">
              {cartData.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex-1">
                    <span className="font-medium">{item.name || item.description}</span>
                    <span className="text-gray-400 ml-1">x{item.qty}</span>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <span className="font-semibold">{formatCurrency(item.lineTotal)}</span>
                    {Number(item.lineBV || 0) > 0 && <span className="text-xs text-orange-500 font-medium">{Number(item.lineBV).toFixed(1)} BV</span>}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t mt-2 pt-2 flex justify-between items-center">
              <div className="text-sm text-gray-500">BV earned: <strong className="text-orange-500">{cartData.totalBV.toFixed(1)}</strong></div>
              <div className="text-lg font-bold">Total: <span className="text-green-600">{formatCurrency(cartData.totalAmount)}</span></div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs font-bold uppercase text-gray-500 mb-1">Payment</p>
            <p className="text-base font-semibold text-gray-800">{paymentMethod}</p>
          </div>

          {!isMember && (
            <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg text-xs text-yellow-700">
              BV and profit from this sale will be assigned to referral: {selectedReferral?.name || DEFAULT_REFERRAL.name} ({selectedReferral?.nb_number || DEFAULT_REFERRAL.nb_number})
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowReview(false)}>Edit</Button>
            <Button className="flex-1" variant="success" onClick={completeSale} disabled={submitting}>
              {submitting ? 'Processing...' : 'Complete Sale'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function PrescriptionsTab() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dispensing, setDispensing] = useState(null);
  const [alert, setAlert] = useState(null);
  const [dispensedReceipt, setDispensedReceipt] = useState(null);

  useEffect(() => {
    api.reports.list()
      .then(d => setReports(Array.isArray(d) ? d : d.reports || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const getPrescriptionItems = (report) => {
    const prescriptions = report.prescriptions || report.prescription || [];
    if (!Array.isArray(prescriptions)) return [];
    return prescriptions.map(p => {
      if (typeof p === 'string') {
        const match = PRICE_LIST.find(pl => (pl.name || pl.description || '').toLowerCase().includes(p.toLowerCase()));
        return { product_name: p, quantity: 1, unit_price: match?.cp || 0, line_total: match?.cp || 0, bv: match?.bv || 0 };
      }
      return {
        product_name: p.product_name || p.name || p.product || '',
        quantity: p.quantity || 1,
        unit_price: p.unit_price || p.unitPrice || p.price || 0,
        line_total: (p.quantity || 1) * (p.unit_price || p.unitPrice || p.price || 0),
        bv: (p.bv || 0) * (p.quantity || 1),
      };
    });
  };

  const handleDispense = async (report) => {
    setDispensing(report.id);
    try {
      await api.put(`/reports/${report.id}`, { dispensed: true, dispensed_at: new Date().toISOString() });
      setReports(prev => prev.map(r => r.id === report.id ? { ...r, dispensed: true } : r));
      const items = getPrescriptionItems(report);
      const totalAmount = items.reduce((s, i) => s + (i.line_total || 0), 0);
      const totalBV = items.reduce((s, i) => s + (i.bv || 0), 0);
      setDispensedReceipt({
        receipt_number: generateReceiptNumber(),
        client_name: report.client_name || report.full_name || 'Patient',
        nb_number: report.nb_number || report.distributor_code || null,
        items,
        totalAmount,
        totalBV,
        created_at: new Date().toISOString(),
      });
      setAlert({ type: 'success', message: `Prescription for ${report.client_name || 'patient'} dispensed successfully.` });
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to dispense' });
    } finally {
      setDispensing(null);
    }
  };

  const printPrescriptionReceipt = () => {
    if (!dispensedReceipt) return;
    const html = generateReceiptHTML({
      receiptNumber: dispensedReceipt.receipt_number,
      branch: user?.branch || '',
      items: dispensedReceipt.items,
      totalAmount: dispensedReceipt.totalAmount,
      totalBV: dispensedReceipt.totalBV,
      paymentMethod: 'Prescription',
      customerType: 'non_member',
      customerName: dispensedReceipt.client_name,
      nbNumber: dispensedReceipt.nb_number,
      cashier: user?.full_name || user?.username || null,
      showBV: true,
    });
    printReceipt(html);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="rounded-xl p-5 mb-5 flex justify-between items-center flex-wrap gap-3" style={{ background: 'linear-gradient(135deg, #27ae60, #1e8449)' }}>
        <div>
          <h3 className="text-white text-lg font-bold m-0">💊 Prescription Dispensing</h3>
          <p className="text-white/85 text-sm mt-1 m-0">Search, filter and dispense client prescriptions</p>
        </div>
      </div>

      {alert && <Alert type={alert.type} className="mb-4">{alert.message}</Alert>}

      {dispensedReceipt && (
        <Card className="mb-4">
          <CardHeader>
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-green-700">Prescription Dispensed</h3>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={printPrescriptionReceipt}><Printer size={14} /> Print Receipt</Button>
                <Button size="sm" variant="ghost" onClick={() => setDispensedReceipt(null)}>Close</Button>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="text-center mb-3">
              <p className="text-2xl font-bold text-green-600">&#10003;</p>
              <p className="text-sm text-gray-500">Receipt: {dispensedReceipt.receipt_number}</p>
              <p className="text-sm font-medium">{dispensedReceipt.client_name}</p>
              {dispensedReceipt.nb_number && <p className="text-xs text-gray-400">NB: {dispensedReceipt.nb_number}</p>}
            </div>
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-3 py-2">
                <p className="text-xs font-bold uppercase text-gray-500">Prescribed Items</p>
              </div>
              <div className="divide-y">
                {dispensedReceipt.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="flex-1">
                      <span className="font-medium">{item.product_name}</span>
                      <span className="text-gray-400 ml-1">x{item.quantity}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-semibold">{formatCurrency(item.line_total)}</span>
                      {Number(item.bv || 0) > 0 && <span className="text-xs text-orange-500 ml-2">{Number(item.bv).toFixed(1)} BV</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t px-3 py-2 flex justify-between items-center bg-gray-50">
                <div className="text-sm text-gray-500">BV: <strong className="text-orange-500">{dispensedReceipt.totalBV.toFixed(1)}</strong></div>
                <div className="text-lg font-bold">Total: <span className="text-green-600">{formatCurrency(dispensedReceipt.totalAmount)}</span></div>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Prescriptions from Consultant Reports</h3></CardHeader>
        {reports.length === 0 ? (
          <CardBody><EmptyState icon={<FileText size={48} />} title="No Prescriptions" description="No consultant reports with prescriptions found." /></CardBody>
        ) : (
          <Table
            columns={[
              { header: 'Client', render: r => r.client_name || r.full_name || '-' },
              { header: 'Date', render: r => formatDate(r.created_at || r.date) },
              { header: 'Prescriptions', render: r => {
                const prescriptions = r.prescriptions || r.prescription || [];
                if (Array.isArray(prescriptions)) return prescriptions.map(p => typeof p === 'string' ? p : p.product_name || p.name || p.product).join(', ') || '-';
                return String(prescriptions) || '-';
              }},
              { header: 'Status', render: r => <Badge variant={r.dispensed ? 'success' : 'warning'}>{r.dispensed ? 'Dispensed' : 'Pending'}</Badge> },
              { header: 'Action', render: r => (
                <div className="flex gap-1">
                  {!r.dispensed && (
                    <Button size="sm" variant="success" onClick={() => handleDispense(r)} disabled={dispensing === r.id}>
                      {dispensing === r.id ? 'Dispensing...' : 'Dispense'}
                    </Button>
                  )}
                  {r.dispensed && (
                    <Button size="sm" variant="ghost" onClick={() => {
                      const items = getPrescriptionItems(r);
                      const totalAmount = items.reduce((s, i) => s + (i.line_total || 0), 0);
                      const totalBV = items.reduce((s, i) => s + (i.bv || 0), 0);
                      const html = generateReceiptHTML({
                        receiptNumber: r.id || 'RX-' + Date.now(),
                        branch: user?.branch || '',
                        items,
                        totalAmount,
                        totalBV,
                        paymentMethod: 'Prescription',
                        customerType: 'non_member',
                        customerName: r.client_name || r.full_name || 'Patient',
                        nbNumber: r.nb_number || null,
                        cashier: user?.full_name || user?.username || null,
                        showBV: true,
                      });
                      printReceipt(html);
                    }}><Printer size={12} /></Button>
                  )}
                </div>
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
  const { user } = useAuth();
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState('inventory');
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [showWriteOffForm, setShowWriteOffForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);
  const [requests, setRequests] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [movements, setMovements] = useState([]);
  const [requestForm, setRequestForm] = useState({ items: '', priority: 'normal', notes: '' });
  const [transferForm, setTransferForm] = useState({ product_name: '', quantity: '', to_branch: '', notes: '' });
  const [writeOffForm, setWriteOffForm] = useState({ product_name: '', quantity: '', reason: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const branchParam = user?.branch ? `branch=${encodeURIComponent(user.branch)}` : '';
      const [inv, reqs, trans, movs] = await Promise.all([
        api.branch.inventory(branchParam).catch(() => []),
        api.stock.requests().catch(() => ({ requests: [] })),
        api.stock.transfers().catch(() => ({ transfers: [] })),
        api.get('/stock-movements').catch(() => []),
      ]);
      setInventory(Array.isArray(inv) ? inv : inv.inventory || []);
      setRequests(Array.isArray(reqs) ? reqs : reqs.requests || []);
      setTransfers(Array.isArray(trans) ? trans : trans.transfers || []);
      setMovements(Array.isArray(movs) ? movs : movs.movements || []);
    } catch {}
    setLoading(false);
  };

  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const lowStock = inventory.filter(i => Number(i.quantity || 0) < 10 && Number(i.quantity || 0) > 0);
  const outOfStock = inventory.filter(i => Number(i.quantity || 0) <= 0);
  const expiringItems = inventory.filter(i => {
    if (!i.expiry_date) return false;
    const exp = new Date(i.expiry_date);
    return exp <= thirtyDays && exp >= now;
  });
  const expiredItems = inventory.filter(i => {
    if (!i.expiry_date) return false;
    return new Date(i.expiry_date) < now;
  });

  const handleStockRequest = async () => {
    if (!requestForm.items.trim()) return;
    setSubmitting(true);
    try {
      const items = requestForm.items.split('\n').filter(l => l.trim()).map(line => {
        const parts = line.split(/[,\-–]/).map(s => s.trim());
        return { product_name: parts[0] || line.trim(), quantity: Number(parts[1]) || 1 };
      });
      await api.stock.createRequest({
        requesting_branch: user?.branch || '',
        request_type: 'branch_restock',
        items: JSON.stringify(items),
        notes: requestForm.notes,
        priority: requestForm.priority,
        created_by: user?.full_name || user?.username || '',
      });
      setAlert({ type: 'success', message: 'Stock request submitted to Stock Management' });
      setRequestForm({ items: '', priority: 'normal', notes: '' });
      setShowRequestForm(false);
      loadData();
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to submit request' });
    } finally { setSubmitting(false); }
  };

  const handleTransfer = async () => {
    if (!transferForm.product_name.trim() || !transferForm.quantity || !transferForm.to_branch) return;
    setSubmitting(true);
    try {
      await api.stock.createTransfer({
        fromWarehouse: user?.branch || '',
        toBranch: transferForm.to_branch,
        items: [{ product_name: transferForm.product_name, quantity: Number(transferForm.quantity) }],
        created_by: user?.full_name || user?.username || '',
        notes: transferForm.notes,
      });
      setAlert({ type: 'success', message: 'Stock transfer initiated' });
      setTransferForm({ product_name: '', quantity: '', to_branch: '', notes: '' });
      setShowTransferForm(false);
      loadData();
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to create transfer' });
    } finally { setSubmitting(false); }
  };

  const handleWriteOff = async () => {
    if (!writeOffForm.product_name.trim() || !writeOffForm.quantity || !writeOffForm.reason.trim()) return;
    setSubmitting(true);
    try {
      await api.stock.createMovement({
        product_name: writeOffForm.product_name,
        quantity: Number(writeOffForm.quantity),
        movement_type: 'write_off',
        source_location: user?.branch || '',
        destination_location: 'written_off',
        notes: `Write-off: ${writeOffForm.reason}`,
        reference_id: `WO-${Date.now()}`,
      });
      setAlert({ type: 'success', message: 'Stock write-off recorded. Pending approval from Stock Management.' });
      setWriteOffForm({ product_name: '', quantity: '', reason: '' });
      setShowWriteOffForm(false);
      loadData();
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to record write-off' });
    } finally { setSubmitting(false); }
  };

  if (loading) return <LoadingSpinner />;

  const stockSubTabs = [
    { id: 'inventory', label: 'Inventory' },
    { id: 'alerts', label: `Alerts (${lowStock.length + expiringItems.length + expiredItems.length + outOfStock.length})` },
    { id: 'requests', label: 'Requests' },
    { id: 'transfers', label: 'Transfers' },
    { id: 'movements', label: 'Movements' },
  ];

  return (
    <div>
      <div className="rounded-xl p-5 mb-5 flex justify-between items-center flex-wrap gap-3" style={{ background: 'radial-gradient(120% 150% at 100% 0%, rgba(99,102,241,0.55) 0%, rgba(30,64,175,0.92) 55%, rgba(17,24,39,0.98) 100%)' }}>
        <div>
          <p className="text-white/70 text-xs font-bold uppercase tracking-widest mb-1 m-0">Branch Operations</p>
          <h3 className="text-white text-lg font-bold m-0">📦 Stock Management</h3>
          <p className="text-white/80 text-sm mt-1 m-0">Monitor inventory levels, request stock & manage transfers</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setShowRequestForm(true)} className="px-5 py-2.5 border-none rounded-full font-semibold text-sm cursor-pointer text-white" style={{ background: 'linear-gradient(135deg, #22d3ee, #0ea5e9)', boxShadow: '0 14px 28px rgba(15,23,42,0.18)' }}>📋 Request Stock</button>
          <button onClick={() => setShowTransferForm(true)} className="px-5 py-2.5 border-none rounded-full font-semibold text-sm cursor-pointer text-white" style={{ background: 'linear-gradient(135deg, #a855f7, #6366f1)', boxShadow: '0 14px 28px rgba(15,23,42,0.18)' }}>↔ Transfer</button>
          <button onClick={() => setShowWriteOffForm(true)} className="px-5 py-2.5 border-none rounded-full font-semibold text-sm cursor-pointer text-white" style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', boxShadow: '0 14px 28px rgba(15,23,42,0.18)' }}>🗑️ Write Off</button>
        </div>
      </div>

      {alert && <Alert type={alert.type} className="mb-4">{alert.message}</Alert>}
      <div className="flex gap-2 mb-4 flex-wrap">
        {stockSubTabs.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)} className="px-4 py-2 rounded-full text-sm font-semibold cursor-pointer transition-all" style={subTab === t.id ? { background: 'rgba(99,102,241,0.15)', color: '#312e81', border: 'none' } : { background: 'rgba(99,102,241,0.06)', color: '#64748b', border: 'none' }}>{t.label}</button>
        ))}
      </div>

      {subTab === 'inventory' && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Branch Inventory</h3></CardHeader>
          <Table
            columns={[
              { header: 'Product', render: r => r.product_name || r.description || '-' },
              { header: 'Qty', render: r => {
                const q = Number(r.quantity || 0);
                return <span className={q < 10 ? (q <= 0 ? 'text-red-700 font-bold' : 'text-orange-600 font-bold') : 'text-green-600 font-semibold'}>{q}</span>;
              }},
              { header: 'Batch', render: r => r.batch_no || r.batch_number || '-' },
              { header: 'Expiry', render: r => {
                if (!r.expiry_date) return '-';
                const exp = new Date(r.expiry_date);
                const isExpired = exp < now;
                const isExpiring = exp <= thirtyDays;
                return <span className={isExpired ? 'text-red-700 font-bold' : isExpiring ? 'text-orange-600' : ''}>{formatDate(r.expiry_date)}{isExpired ? ' (EXPIRED)' : isExpiring ? ' (EXPIRING)' : ''}</span>;
              }},
              { header: 'Unit Price', render: r => formatCurrency(r.unit_price || 0) },
            ]}
            data={inventory}
            emptyMessage="No inventory data"
          />
        </Card>
      )}

      {subTab === 'alerts' && (
        <div className="space-y-4">
          {outOfStock.length > 0 && (
            <Card>
              <CardHeader><h3 className="font-bold text-red-700">Out of Stock ({outOfStock.length})</h3></CardHeader>
              <Table columns={[{ header: 'Product', render: r => r.product_name || r.description || '-' }, { header: 'Qty', render: () => <Badge variant="danger">0</Badge> }]} data={outOfStock} />
            </Card>
          )}
          {lowStock.length > 0 && (
            <Card>
              <CardHeader><h3 className="font-bold text-orange-600">Low Stock ({lowStock.length})</h3></CardHeader>
              <Table columns={[{ header: 'Product', render: r => r.product_name || r.description || '-' }, { header: 'Qty', render: r => <Badge variant="warning">{r.quantity}</Badge> }]} data={lowStock} />
            </Card>
          )}
          {expiredItems.length > 0 && (
            <Card>
              <CardHeader><h3 className="font-bold text-red-700">Expired ({expiredItems.length})</h3></CardHeader>
              <Table columns={[{ header: 'Product', render: r => r.product_name || r.description || '-' }, { header: 'Expiry', render: r => <Badge variant="danger">{formatDate(r.expiry_date)}</Badge> }, { header: 'Qty', render: r => r.quantity }]} data={expiredItems} />
            </Card>
          )}
          {expiringItems.length > 0 && (
            <Card>
              <CardHeader><h3 className="font-bold text-orange-600">Expiring Soon ({expiringItems.length})</h3></CardHeader>
              <Table columns={[{ header: 'Product', render: r => r.product_name || r.description || '-' }, { header: 'Expiry', render: r => <Badge variant="warning">{formatDate(r.expiry_date)}</Badge> }, { header: 'Qty', render: r => r.quantity }]} data={expiringItems} />
            </Card>
          )}
          {outOfStock.length === 0 && lowStock.length === 0 && expiredItems.length === 0 && expiringItems.length === 0 && (
            <Card><CardBody><p className="text-center text-green-600 font-medium py-4">All stock levels are healthy</p></CardBody></Card>
          )}
        </div>
      )}

      {subTab === 'requests' && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Stock Requests</h3></CardHeader>
          <Table
            columns={[
              { header: 'Request #', render: r => r.request_number || r.id },
              { header: 'Branch', render: r => r.requesting_branch || '-' },
              { header: 'Priority', render: r => <Badge variant={r.priority === 'urgent' ? 'danger' : r.priority === 'high' ? 'warning' : 'info'}>{r.priority || 'normal'}</Badge> },
              { header: 'Status', render: r => <Badge variant={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}>{r.status || 'pending'}</Badge> },
              { header: 'Date', render: r => formatDateTime(r.created_at) },
            ]}
            data={requests}
            emptyMessage="No stock requests"
          />
        </Card>
      )}

      {subTab === 'transfers' && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Stock Transfers</h3></CardHeader>
          <Table
            columns={[
              { header: 'From', render: r => r.from_warehouse || '-' },
              { header: 'To', render: r => r.to_branch || '-' },
              { header: 'Status', render: r => <Badge variant={r.status === 'delivered' ? 'success' : r.status === 'dispatched' ? 'info' : 'warning'}>{r.status || 'pending'}</Badge> },
              { header: 'Date', render: r => formatDateTime(r.created_at) },
            ]}
            data={transfers}
            emptyMessage="No transfers"
          />
        </Card>
      )}

      {subTab === 'movements' && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Stock Movements</h3></CardHeader>
          <Table
            columns={[
              { header: 'Product', render: r => r.product_name || '-' },
              { header: 'Type', render: r => <Badge variant={r.movement_type === 'sale' ? 'info' : r.movement_type === 'write_off' ? 'danger' : 'success'}>{(r.movement_type || '').replace(/_/g, ' ')}</Badge> },
              { header: 'Qty', render: r => r.quantity },
              { header: 'From', render: r => r.source_location || '-' },
              { header: 'To', render: r => r.destination_location || '-' },
              { header: 'Date', render: r => formatDateTime(r.created_at) },
            ]}
            data={movements}
            emptyMessage="No movements recorded"
          />
        </Card>
      )}

      <Modal open={showRequestForm} onClose={() => setShowRequestForm(false)} title="Request Stock from Warehouse">
        <div className="p-6 space-y-4">
          <Textarea label="Items (one per line: Product Name, Quantity)" value={requestForm.items} onChange={e => setRequestForm({ ...requestForm, items: e.target.value })} placeholder="e.g. Spirulina 500 Tablets, 20&#10;Ginseng Coffee, 50" rows={5} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select value={requestForm.priority} onChange={e => setRequestForm({ ...requestForm, priority: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <Textarea label="Notes" value={requestForm.notes} onChange={e => setRequestForm({ ...requestForm, notes: e.target.value })} />
          <div className="flex gap-3">
            <Button className="flex-1" variant="success" onClick={handleStockRequest} disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Request'}</Button>
            <Button variant="ghost" onClick={() => setShowRequestForm(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      <Modal open={showTransferForm} onClose={() => setShowTransferForm(false)} title="Transfer Stock">
        <div className="p-6 space-y-4">
          <Input label="Product" value={transferForm.product_name} onChange={e => setTransferForm({ ...transferForm, product_name: e.target.value })} />
          <Input label="Quantity" type="number" value={transferForm.quantity} onChange={e => setTransferForm({ ...transferForm, quantity: e.target.value })} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To Branch</label>
            <select value={transferForm.to_branch} onChange={e => setTransferForm({ ...transferForm, to_branch: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
              <option value="">Select branch...</option>
              {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <Textarea label="Notes" value={transferForm.notes} onChange={e => setTransferForm({ ...transferForm, notes: e.target.value })} />
          <div className="flex gap-3">
            <Button className="flex-1" variant="success" onClick={handleTransfer} disabled={submitting}>{submitting ? 'Processing...' : 'Initiate Transfer'}</Button>
            <Button variant="ghost" onClick={() => setShowTransferForm(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      <Modal open={showWriteOffForm} onClose={() => setShowWriteOffForm(false)} title="Write Off Stock">
        <div className="p-6 space-y-4">
          <Input label="Product" value={writeOffForm.product_name} onChange={e => setWriteOffForm({ ...writeOffForm, product_name: e.target.value })} />
          <Input label="Quantity" type="number" value={writeOffForm.quantity} onChange={e => setWriteOffForm({ ...writeOffForm, quantity: e.target.value })} />
          <Textarea label="Reason for write-off *" value={writeOffForm.reason} onChange={e => setWriteOffForm({ ...writeOffForm, reason: e.target.value })} placeholder="e.g. Expired, Damaged, Lost" />
          <div className="flex gap-3">
            <Button className="flex-1" variant="danger" onClick={handleWriteOff} disabled={submitting}>{submitting ? 'Processing...' : 'Write Off'}</Button>
            <Button variant="ghost" onClick={() => setShowWriteOffForm(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
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
            { header: 'Date', render: r => formatDateTime(r.deposit_date || r.date || r.created_at) },
            { header: 'Amount', render: r => <span className="font-bold text-green-600">{formatCurrency(r.amount)}</span> },
            { header: 'Bank', render: r => r.bank_name || r.bankName || '-' },
            { header: 'Reference', render: r => r.reference || r.slip_number || r.slipNumber || '-' },
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
  const { user } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);
  const [form, setForm] = useState({ client_name: '', amount: '', payment_method: 'Cash', reference: '', notes: '' });

  useEffect(() => {
    api.branch.payments()
      .then(d => setPayments(Array.isArray(d) ? d : d.payments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async () => {
    if (!form.client_name.trim() || !form.amount || Number(form.amount) <= 0) return;
    setSubmitting(true);
    try {
      await api.branch.createPayment({
        client_name: form.client_name.trim(),
        amount: Number(form.amount),
        payment_method: form.payment_method,
        reference: form.reference.trim(),
        notes: form.notes.trim(),
        branch: user?.branch || '',
        status: 'pending',
      });
      setAlert({ type: 'success', message: 'Payment recorded. Sent to Finance for processing.' });
      setForm({ client_name: '', amount: '', payment_method: 'Cash', reference: '', notes: '' });
      setShowForm(false);
      const res = await api.branch.payments().catch(() => ({ payments: [] }));
      setPayments(Array.isArray(res) ? res : res.payments || []);
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to record payment' });
    } finally { setSubmitting(false); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {alert && <Alert type={alert.type} className="mb-4">{alert.message}</Alert>}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Record Payment">
        <div className="p-6 space-y-4">
          <Input label="Client Name" value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} />
          <Input label="Amount (N$)" type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
            <select value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="Mobile">Mobile</option>
              <option value="Bank Transfer">Bank Transfer</option>
            </select>
          </div>
          <Input label="Reference" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} />
          <Textarea label="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          <div className="flex gap-3">
            <Button className="flex-1" variant="success" onClick={handleSubmit} disabled={submitting}>{submitting ? 'Recording...' : 'Record Payment'}</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Payment Records</h3>
            <Button size="sm" onClick={() => setShowForm(true)}>Record Payment</Button>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Date', render: r => formatDateTime(r.created_at) },
            { header: 'Client', render: r => r.client_name || '-' },
            { header: 'Amount', render: r => <span className="font-bold text-green-600">{formatCurrency(r.amount)}</span> },
            { header: 'Method', render: r => r.payment_method || '-' },
            { header: 'Reference', render: r => r.reference || '-' },
            { header: 'Status', render: r => <Badge variant={r.status === 'processed' ? 'success' : r.status === 'approved' ? 'info' : 'warning'}>{r.status || 'Pending'}</Badge> },
          ]}
          data={payments}
          emptyMessage="No payment records"
        />
      </Card>
    </div>
  );
}

function OnlineOrdersTab() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    api.orders.list()
      .then(d => {
        const all = Array.isArray(d) ? d : d.orders || [];
        const branchOrders = user?.branch
          ? all.filter(o => (o.branch_id || o.branch || '').toLowerCase() === user.branch.toLowerCase()
              || (o.branch_name || '').toLowerCase().includes(user.branch.toLowerCase()))
          : all;
        setOrders(branchOrders);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateStatus = async (id, status) => {
    setUpdating(id);
    setAlert(null);
    try {
      await api.orders.update(id, { status });
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
      if (status === 'delivered' || status === 'completed') {
        setAlert({ type: 'success', message: `Order completed. Income recorded and stock updated.` });
      } else {
        setAlert({ type: 'success', message: `Order status updated to ${status}` });
      }
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
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Online Orders{user?.branch ? ` - ${user.branch}` : ''}</h3>
            <Badge variant="info">{orders.length} orders</Badge>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Order #', render: r => r.order_number || r.id },
            { header: 'Customer', render: r => r.customer_name || r.distributor_name || '-' },
            { header: 'Items', render: r => {
              const items = Array.isArray(r.items) ? r.items : [];
              return items.length > 0 ? items.map(i => i.name || i.product_name).join(', ') : '-';
            }},
            { header: 'Total', render: r => <span className="font-bold">{formatCurrency(r.total_amount || r.total || 0)}</span> },
            { header: 'Status', render: r => statusBadge(r.status) },
            { header: 'Date', render: r => formatDateTime(r.created_at) },
            { header: 'Actions', render: r => (
              <div className="flex gap-1 flex-wrap">
                {(!r.status || r.status === 'pending') && (
                  <Button size="sm" variant="warning" onClick={() => updateStatus(r.id, 'processing')} disabled={updating === r.id}>Process</Button>
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
          emptyMessage="No online orders for this branch"
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
  const { user } = useAuth();
  return <MembershipAgreementForm mode="branch" userBranch={user?.branch} />;
}

function FieldProgramTab() {
  const { user } = useAuth();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showProductRequest, setShowProductRequest] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);
  const [form, setForm] = useState({
    activity_type: 'health_screening', location: '', date: '', time: '',
    coordinator: '', target_audience: '', notes: '',
  });
  const [productRequestForm, setProductRequestForm] = useState({ items: '', activity_id: '', notes: '' });

  useEffect(() => {
    api.get('/field_program_requests')
      .then(d => setActivities(Array.isArray(d) ? d : d.activities || d.requests || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadActivities = async () => {
    const res = await api.get('/field_program_requests').catch(() => []);
    setActivities(Array.isArray(res) ? res : res.activities || res.requests || []);
  };

  const handleSubmit = async () => {
    if (!form.location.trim() || !form.date) return;
    setSubmitting(true);
    try {
      await api.post('/field_program_requests', {
        id: `FP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        activity_type: form.activity_type,
        location: form.location.trim(),
        date: form.date,
        time: form.time,
        coordinator: form.coordinator.trim(),
        target_audience: form.target_audience.trim(),
        notes: form.notes.trim(),
        status: 'scheduled',
        branch: user?.branch || '',
        created_by: user?.full_name || user?.username || '',
      });
      setAlert({ type: 'success', message: 'Field activity scheduled' });
      setForm({ activity_type: 'health_screening', location: '', date: '', time: '', coordinator: '', target_audience: '', notes: '' });
      setShowForm(false);
      loadActivities();
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to schedule activity' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleProductRequest = async () => {
    if (!productRequestForm.items.trim()) return;
    setSubmitting(true);
    try {
      const items = productRequestForm.items.split('\n').filter(l => l.trim()).map(line => {
        const parts = line.split(/[,\-–]/).map(s => s.trim());
        return { product_name: parts[0] || line.trim(), quantity: Number(parts[1]) || 1 };
      });
      await api.stock.createRequest({
        requesting_branch: user?.branch || '',
        request_type: 'field_program',
        items: JSON.stringify(items),
        notes: `Field program: ${productRequestForm.activity_id || 'General'}\n${productRequestForm.notes}`,
        priority: 'normal',
        created_by: user?.full_name || user?.username || '',
      });
      setAlert({ type: 'success', message: 'Product request submitted. Awaiting stock approval.' });
      setProductRequestForm({ items: '', activity_id: '', notes: '' });
      setShowProductRequest(false);
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to submit product request' });
    } finally { setSubmitting(false); }
  };

  const markReturned = async (activity) => {
    try {
      await api.put('/field_program_requests', {
        id: activity.id,
        status: 'items_returned',
        returned_items: activity.products || [],
      });
      setAlert({ type: 'success', message: 'Items marked as returned' });
      loadActivities();
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to update' });
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {alert && <Alert type={alert.type} className="mb-4">{alert.message}</Alert>}
      <div className="flex gap-2 mb-4">
        <Button size="sm" onClick={() => setShowForm(true)}>Schedule Activity</Button>
        <Button size="sm" variant="secondary" onClick={() => setShowProductRequest(true)}>Request Products</Button>
      </div>

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

      <Modal open={showProductRequest} onClose={() => setShowProductRequest(false)} title="Request Products for Field Use">
        <div className="p-6 space-y-4">
          <Textarea label="Products (one per line: Product, Qty)" value={productRequestForm.items} onChange={e => setProductRequestForm({ ...productRequestForm, items: e.target.value })} placeholder="e.g. Spirulina 500 Tablets, 10&#10;Ginseng Coffee, 20" rows={5} />
          <Input label="For Activity (optional)" value={productRequestForm.activity_id} onChange={e => setProductRequestForm({ ...productRequestForm, activity_id: e.target.value })} placeholder="Activity location or ID" />
          <Textarea label="Notes" value={productRequestForm.notes} onChange={e => setProductRequestForm({ ...productRequestForm, notes: e.target.value })} />
          <p className="text-xs text-gray-400">This request requires approval from Stock Management before products are issued.</p>
          <div className="flex gap-3">
            <Button className="flex-1" variant="success" onClick={handleProductRequest} disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Request'}</Button>
            <Button variant="ghost" onClick={() => setShowProductRequest(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Field Program Activities</h3></CardHeader>
        {activities.length === 0 ? (
          <CardBody><EmptyState icon={<Map size={48} />} title="No Field Activities" description="No field program activities scheduled." /></CardBody>
        ) : (
          <Table
            columns={[
              { header: 'Type', render: r => <Badge variant="info">{(r.activity_type || '').replace(/_/g, ' ')}</Badge> },
              { header: 'Location', key: 'location' },
              { header: 'Date', render: r => formatDate(r.date) },
              { header: 'Coordinator', key: 'coordinator' },
              { header: 'Status', render: r => <Badge variant={r.status === 'completed' ? 'success' : r.status === 'cancelled' ? 'danger' : r.status === 'items_returned' ? 'info' : 'warning'}>{(r.status || 'Scheduled').replace(/_/g, ' ')}</Badge> },
              { header: 'Actions', render: r => (
                <div className="flex gap-1">
                  {r.status === 'completed' && r.status !== 'items_returned' && (
                    <Button size="sm" variant="secondary" onClick={() => markReturned(r)}>Mark Returned</Button>
                  )}
                </div>
              )},
            ]}
            data={activities}
            emptyMessage="No activities"
          />
        )}
      </Card>
    </div>
  );
}

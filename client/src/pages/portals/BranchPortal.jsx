import { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import { formatCurrency, formatDateTime, formatDate, BRANCHES, COMPANY_INFO, BRANCH_DETAILS } from '../../lib/constants';
import { enrichProductsWithPricing, calculateCartTotals, generateReceiptNumber, PRICE_LIST, PACKAGE_DATABASE, findProductPrice, calculatePrescriptionTotals, getConsultationFee } from '../../lib/pricing';
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
  const [showModal, setShowModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [cart, setCart] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [customerType, setCustomerType] = useState('registered');
  const [regSearch, setRegSearch] = useState('');
  const [regResults, setRegResults] = useState([]);
  const [selectedReg, setSelectedReg] = useState(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [referralSearch, setReferralSearch] = useState('');
  const [referralResults, setReferralResults] = useState([]);
  const [selectedReferral, setSelectedReferral] = useState(null);
  const [noReferral, setNoReferral] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadSales = () =>
    api.branch.walkinSales().then(d => setSales(Array.isArray(d) ? d : d.sales || [])).catch(() => {});

  useEffect(() => {
    Promise.all([
      api.products.list().then(d => {
        const raw = Array.isArray(d) ? d : d.products || [];
        setProducts(enrichProductsWithPricing(raw));
      }),
      loadSales(),
    ]).finally(() => setLoading(false));
  }, []);

  const normalizeDistributor = (d) => ({
    ...d,
    name: d.name || d.distributor_name || d.full_name || '',
    nb_number: d.nb_number || d.distributor_code || '',
    phone: d.phone || d.mobile_no || '',
  });

  const regSearchTimer = useRef(null);
  const searchRegistered = (q) => {
    setRegSearch(q);
    if (q.length < 2) { setRegResults([]); return; }
    if (regSearchTimer.current) clearTimeout(regSearchTimer.current);
    regSearchTimer.current = setTimeout(async () => {
      try { const res = await api.distributors.search(q); setRegResults(Array.isArray(res) ? res : res.distributors || []); } catch { setRegResults([]); }
    }, 300);
  };
  const selectRegistered = (d) => { setSelectedReg(normalizeDistributor(d)); setRegResults([]); setRegSearch(''); };
  const clearRegistered = () => { setSelectedReg(null); setRegSearch(''); };

  const refSearchTimer = useRef(null);
  const searchReferrals = (q) => {
    setReferralSearch(q);
    if (q.length < 2) { setReferralResults([]); return; }
    if (refSearchTimer.current) clearTimeout(refSearchTimer.current);
    refSearchTimer.current = setTimeout(async () => {
      try { const res = await api.distributors.search(q); setReferralResults(Array.isArray(res) ? res : res.distributors || []); } catch { setReferralResults([]); }
    }, 300);
  };
  const selectReferral = (d) => { setSelectedReferral(normalizeDistributor(d)); setReferralResults([]); setReferralSearch(''); };
  const clearReferral = () => { setSelectedReferral(null); setReferralSearch(''); };

  const toggleNoReferral = (checked) => {
    setNoReferral(checked);
    if (checked) { setSelectedReferral(DEFAULT_REFERRAL); setReferralSearch(''); setReferralResults([]); }
    else { setSelectedReferral(null); }
  };

  const isMember = customerType === 'registered';
  const filteredProducts = products.filter(p => !productSearch || (p.name || p.description || '').toLowerCase().includes(productSearch.toLowerCase()));

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === product.id);
      if (existing) return prev.map(c => c.id === product.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { ...product, qty: 1 }];
    });
  };
  const updateQty = (id, delta) => setCart(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(1, c.qty + delta) } : c));
  const removeFromCart = (id) => setCart(prev => prev.filter(c => c.id !== id));

  const cartData = calculateCartTotals(cart, isMember);
  const branchProfit = !isMember ? cartData.items.reduce((s, item) => s + ((item.cp || 0) - (item.dp || 0)) * item.qty, 0) : 0;

  const openModal = () => {
    setCustomerType('registered'); setRegSearch(''); setRegResults([]); setSelectedReg(null);
    setNewName(''); setNewPhone(''); setReferralSearch(''); setReferralResults([]);
    setSelectedReferral(null); setNoReferral(false); setCart([]); setProductSearch('');
    setPaymentMethod('cash'); setError(''); setShowModal(true);
  };
  const closeModal = () => setShowModal(false);

  const wiSetCustomerType = (type) => {
    setCustomerType(type);
    if (type === 'registered') { setNewName(''); setNewPhone(''); setReferralSearch(''); setReferralResults([]); setSelectedReferral(null); setNoReferral(false); }
    else { setSelectedReg(null); setRegSearch(''); setRegResults([]); }
  };

  const wiReviewSale = () => {
    if (cart.length === 0) { setError('Please add products to cart'); return; }
    if (isMember && !selectedReg) { setError('Please select a registered client'); return; }
    if (!isMember && !newName.trim()) { setError('Please enter customer name'); return; }
    if (!isMember && !noReferral && !selectedReferral) { setError('Please select a referral distributor or tick "no referral"'); return; }
    setError('');
    setShowConfirmModal(true);
  };

  const completeSale = async () => {
    setSubmitting(true);
    setError('');
    try {
      const receiptNumber = generateReceiptNumber();
      const referral = isMember ? selectedReg : (selectedReferral || DEFAULT_REFERRAL);
      const custName = isMember ? (selectedReg?.name || '') : newName;
      const custPhone = isMember ? (selectedReg?.phone || '') : newPhone;

      const itemsWithProfit = cartData.items.map(item => ({
        product_id: item.id,
        product_name: item.name || item.description,
        quantity: item.qty,
        unit_price: item.unitPrice,
        line_total: item.lineTotal,
        bv: item.lineBV,
        lineProfit: !isMember ? ((item.cp || 0) - (item.dp || 0)) * item.qty : null,
      }));

      const saleData = {
        receipt_number: receiptNumber,
        branch: user?.branch || '',
        branchId: user?.branch || '',
        customer_type: isMember ? 'member' : 'non_member',
        customerType: isMember ? 'member' : 'non_member',
        customer_name: custName,
        customerName: custName,
        customerPhone: custPhone,
        distributor_id: isMember ? (selectedReg?.id || null) : null,
        distributor_name: isMember ? custName : null,
        distributor_nb: isMember ? (selectedReg?.nb_number || null) : null,
        referral_id: referral?.id || DEFAULT_REFERRAL.id,
        referral_name: referral?.name || referral?.full_name || DEFAULT_REFERRAL.name,
        referral_nb: referral?.nb_number || DEFAULT_REFERRAL.nb_number,
        payment_method: paymentMethod,
        paymentMethod: paymentMethod,
        items: itemsWithProfit,
        products: cartData.items.map(item => ({
          product_id: item.id, name: item.name || item.description, quantity: item.qty,
          unitPrice: item.unitPrice, lineTotal: item.lineTotal, bv: item.lineBV,
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

      const commonReceiptParams = {
        receiptNumber,
        branch: user?.branch || '',
        items: itemsWithProfit,
        totalAmount: saleData.total_amount,
        totalBV: saleData.total_bv || 0,
        paymentMethod: saleData.payment_method,
        customerType: saleData.customer_type,
        customerName: isMember ? custName : (custName || 'Walk-in Customer'),
        nbNumber: isMember ? (selectedReg?.nb_number || null) : null,
        referralName: !isMember ? (referral?.name || DEFAULT_REFERRAL.name) : null,
        referralNB: !isMember ? (referral?.nb_number || DEFAULT_REFERRAL.nb_number) : null,
        cashier: user?.full_name || user?.username || null,
      };

      if (isMember) {
        printReceipt(generateReceiptHTML({ ...commonReceiptParams, showBV: true }));
      } else {
        printReceipt(generateReceiptHTML({ ...commonReceiptParams, showBV: false, copyType: 'customer' }));
        setTimeout(() => {
          printReceipt(generateReceiptHTML({
            ...commonReceiptParams,
            showBV: true,
            copyType: 'staff',
            branchProfit,
            distributorBV: cartData.totalBV,
          }));
        }, 800);
      }

      setShowConfirmModal(false);
      setShowModal(false);
      const salesRes = await api.branch.walkinSales().catch(() => ({ sales: [] }));
      setSales(Array.isArray(salesRes) ? salesRes : salesRes.sales || []);
    } catch (err) {
      setError(err.message || 'Failed to complete sale');
    } finally {
      setSubmitting(false);
    }
  };

  const paymentMethods = [
    { id: 'cash', label: 'Cash', icon: '💵' },
    { id: 'card', label: 'Card', icon: '💳' },
    { id: 'mobile', label: 'Mobile', icon: '📱' },
    { id: 'bank', label: 'Bank', icon: '🏦' },
  ];

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-5 p-5 rounded-2xl text-white" style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)', boxShadow: '0 4px 20px rgba(15,23,42,0.25)' }}>
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'rgba(255,255,255,0.15)' }}>🛒</div>
            <div>
              <h3 className="text-xl font-bold m-0">Walk-in Sales</h3>
              <p className="text-sm m-0" style={{ color: 'rgba(255,255,255,0.65)' }}>
                {user?.branch ? `${user.branch} Branch POS` : 'Branch Point of Sale'}
              </p>
            </div>
          </div>
        </div>
        <button onClick={openModal} className="flex items-center gap-2 font-bold text-sm px-5 py-3 rounded-xl cursor-pointer transition-all" style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', border: 'none', boxShadow: '0 3px 10px rgba(22,163,74,0.4)', letterSpacing: '0.02em' }}>
          ＋ New Walk-in Sale
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '1.5px solid #93c5fd' }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">🪪</span>
            <span className="font-bold text-base" style={{ color: '#1e40af' }}>Registered Member</span>
          </div>
          <ul className="m-0 pl-4 space-y-1 text-sm" style={{ color: '#1e3a8a' }}>
            <li>Has an NB number in the system</li>
            <li>Pays at <strong>DP price</strong> (distributor price)</li>
            <li>Earns <strong>BV points</strong> on their account</li>
          </ul>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '1.5px solid #fcd34d' }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">👤</span>
            <span className="font-bold text-base" style={{ color: '#92400e' }}>New Customer</span>
          </div>
          <ul className="m-0 pl-4 space-y-1 text-sm" style={{ color: '#78350f' }}>
            <li>Walk-in, not yet registered</li>
            <li>Pays at <strong>CP price</strong> (consumer price)</li>
            <li>Referring distributor earns <strong>BVs &amp; profit</strong></li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <h4 className="m-0 font-semibold text-gray-700">Recent Walk-in Sales</h4>
          <button onClick={loadSales} className="text-xs px-3 py-1.5 rounded-lg border cursor-pointer" style={{ color: '#64748b', borderColor: '#e2e8f0', background: '#fff' }}>↻ Refresh</button>
        </div>
        {sales.length === 0 ? (
          <p className="text-center text-gray-400 py-8">No walk-in sales recorded yet</p>
        ) : (
          <div className="divide-y">
            {sales.slice(0, 10).map((s, i) => {
              const sIsM = (s.customerType || s.customer_type) === 'member';
              return (
                <div key={i} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold text-gray-700">{s.receipt_number || s.saleNumber || `#${s.id}`}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ background: sIsM ? '#dbeafe' : '#fef3c7', color: sIsM ? '#1e40af' : '#92400e' }}>
                      {sIsM ? 'Member' : 'Walk-in'}
                    </span>
                    <span className="text-gray-500">{s.distributor_name || s.customer_name || s.customerName || '—'}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-gray-800">{formatCurrency(s.total || s.totalAmount || s.total_amount || 0)}</span>
                    <span className="text-xs text-gray-400">{formatDate(s.created_at || s.timestamp)}</span>
                    <button onClick={(e) => {
                      e.stopPropagation();
                      const html = generateReceiptHTML({
                        receiptNumber: s.receipt_number || s.saleNumber || s.id,
                        branch: s.branch || user?.branch || '',
                        items: s.products || s.items || [],
                        totalAmount: s.total || s.totalAmount || s.total_amount || 0,
                        totalBV: s.totalBV || s.total_bv || 0,
                        paymentMethod: s.paymentMethod || s.payment_method || '',
                        customerType: s.customerType || s.customer_type || 'non_member',
                        customerName: s.distributor_name || s.customerName || s.customer_name || (sIsM ? null : 'Walk-in Customer'),
                        nbNumber: sIsM ? (s.distributor_nb || s.distributorReferral?.nb_number || null) : null,
                        referralName: !sIsM ? (s.referral_name || s.distributorReferral?.name || null) : null,
                        referralNB: !sIsM ? (s.referral_nb || s.distributorReferral?.nb_number || null) : null,
                        cashier: s.soldBy || '',
                        showBV: true,
                      });
                      printReceipt(html);
                    }} className="px-2.5 py-1 text-xs rounded border cursor-pointer" style={{ color: '#64748b', borderColor: '#e2e8f0', background: '#fff' }}>🖨️</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(2px)' }} onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div style={{ width: '100%', maxWidth: '1100px', background: '#fff', borderRadius: '20px', overflow: 'hidden', maxHeight: '95vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(0,0,0,0.35)' }}>

            <div style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div className="flex items-center gap-3">
                <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>🏪</div>
                <div>
                  <div style={{ color: '#fff', fontSize: '1.15rem', fontWeight: 700, letterSpacing: '0.01em' }}>Branch Point of Sale</div>
                  <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.78rem', marginTop: 1 }}>
                    {user?.branch || 'Walk-in'} &nbsp;·&nbsp; {isMember ? '🪪 DP Prices' : '👤 CP Prices'} &nbsp;·&nbsp; {cart.length} item{cart.length !== 1 ? 's' : ''} in cart
                  </div>
                </div>
              </div>
              <button onClick={closeModal} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

              <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid #f1f5f9', overflowY: 'auto', background: '#fafbfc', padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
                {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '8px 12px', borderRadius: '8px', fontSize: '0.82rem' }}>{error}</div>}

                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '.1em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>Customer Type</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      { type: 'registered', icon: '🪪', label: 'Member', sub: 'DP price + BV', color: '#1e40af', bg: '#eff6ff', border: '#93c5fd' },
                      { type: 'new', icon: '👤', label: 'New Customer', sub: 'CP price', color: '#92400e', bg: '#fffbeb', border: '#fcd34d' },
                    ].map(opt => (
                      <button key={opt.type} type="button" onClick={() => wiSetCustomerType(opt.type)}
                        style={{ padding: '10px 8px', border: customerType === opt.type ? `2px solid ${opt.border}` : '2px solid #e2e8f0', borderRadius: 10, background: customerType === opt.type ? opt.bg : '#fff', cursor: 'pointer', textAlign: 'center', transition: 'all .15s' }}>
                        <div style={{ fontSize: '1.2rem', marginBottom: 2 }}>{opt.icon}</div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: customerType === opt.type ? opt.color : '#374151' }}>{opt.label}</div>
                        <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 1 }}>{opt.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {customerType === 'registered' ? (
                  <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '.1em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>Member Lookup</div>
                    <div style={{ position: 'relative' }}>
                      <input type="text" value={regSearch} placeholder="Search by name or NB#…" onChange={e => searchRegistered(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.88rem', boxSizing: 'border-box', background: '#fff' }} />
                      {regResults.length > 0 && (
                        <div style={{ position: 'absolute', zIndex: 2000, width: '100%', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, maxHeight: 180, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.12)', top: 'calc(100% + 4px)', left: 0 }}>
                          {regResults.map(d => (
                            <button key={d.id} onClick={() => selectRegistered(d)}
                              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderBottom: '1px solid #f8fafc', background: 'none', cursor: 'pointer', fontSize: '0.84rem' }}>
                              <strong>{d.name || d.full_name}</strong>
                              <span style={{ color: '#3b82f6', marginLeft: 6, fontSize: '0.78rem' }}>#{d.nb_number || d.distributor_code}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedReg && (
                      <div style={{ marginTop: 8, padding: '10px 12px', background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '1px solid #86efac', borderRadius: 8, fontSize: '0.84rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#166534' }}>{selectedReg.name}</div>
                          <div style={{ color: '#16a34a', fontSize: '0.78rem' }}>NB#{selectedReg.nb_number} &nbsp;·&nbsp; {selectedReg.phone || 'No phone'}</div>
                        </div>
                        <button type="button" onClick={clearRegistered} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>×</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '.1em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>Customer Details</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full name *"
                        style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.88rem', boxSizing: 'border-box' }} />
                      <input type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Phone (optional)"
                        style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.88rem', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '.1em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>Referral Distributor</div>
                      <div style={{ position: 'relative' }}>
                        <input type="text" value={referralSearch} onChange={e => searchReferrals(e.target.value)} placeholder="Search distributor…" disabled={noReferral}
                          style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #fcd34d', borderRadius: 8, fontSize: '0.88rem', boxSizing: 'border-box', opacity: noReferral ? 0.5 : 1 }} />
                        {referralResults.length > 0 && !noReferral && (
                          <div style={{ position: 'absolute', zIndex: 2000, width: '100%', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, maxHeight: 160, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.12)', top: 'calc(100% + 4px)', left: 0 }}>
                            {referralResults.map(d => (
                              <button key={d.id} onClick={() => selectReferral(d)}
                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderBottom: '1px solid #f8fafc', background: 'none', cursor: 'pointer', fontSize: '0.84rem' }}>
                                <strong>{d.name || d.full_name}</strong>
                                <span style={{ color: '#f59e0b', marginLeft: 6, fontSize: '0.78rem' }}>#{d.nb_number || d.distributor_code}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {selectedReferral && !noReferral && (
                        <div style={{ marginTop: 6, padding: '8px 12px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, fontSize: '0.84rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 700, color: '#92400e' }}>{selectedReferral.name}</div>
                            <div style={{ color: '#b45309', fontSize: '0.78rem' }}>NB#{selectedReferral.nb_number}</div>
                          </div>
                          <button type="button" onClick={clearReferral} style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>×</button>
                        </div>
                      )}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: '0.82rem', cursor: 'pointer', color: '#64748b' }}>
                        <input type="checkbox" checked={noReferral} onChange={e => toggleNoReferral(e.target.checked)} style={{ width: 15, height: 15 }} />
                        No referral (direct walk-in)
                      </label>
                    </div>
                  </div>
                )}

                <div>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '.1em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>Payment Method</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {paymentMethods.map(m => (
                      <button key={m.id} type="button" onClick={() => setPaymentMethod(m.id)}
                        style={{ padding: '10px 6px', border: paymentMethod === m.id ? '2px solid #16a34a' : '2px solid #e2e8f0', borderRadius: 10, background: paymentMethod === m.id ? '#f0fdf4' : '#fff', cursor: 'pointer', fontSize: '0.82rem', fontWeight: paymentMethod === m.id ? 700 : 400, color: paymentMethod === m.id ? '#166534' : '#374151', transition: 'all .15s', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.1rem', marginBottom: 2 }}>{m.icon}</div>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', background: '#fff', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '.1em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>Products</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="text" value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search products by name…"
                      style={{ flex: 1, padding: '9px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.88rem' }} />
                    <span style={{ fontSize: '0.75rem', padding: '5px 12px', borderRadius: 20, fontWeight: 700, whiteSpace: 'nowrap', background: isMember ? '#dbeafe' : '#fef3c7', color: isMember ? '#1e40af' : '#92400e', border: `1px solid ${isMember ? '#93c5fd' : '#fcd34d'}` }}>
                      {isMember ? '🪪 DP Price' : '👤 CP Price'}
                    </span>
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(175px,1fr))', gap: 10 }}>
                    {filteredProducts.length === 0 ? (
                      <p style={{ color: '#94a3b8', gridColumn: '1/-1', textAlign: 'center', padding: '32px 0' }}>No products found</p>
                    ) : filteredProducts.slice(0, 60).map(p => {
                      const price = isMember ? (p.dp || p.price) : (p.cp || p.price);
                      const inCart = cart.find(c => c.id === p.id);
                      const profit = !isMember ? (p.cp || 0) - (p.dp || 0) : 0;
                      return (
                        <button key={p.id} onClick={() => addToCart(p)} type="button"
                          style={{ padding: '12px', border: inCart ? '2px solid #16a34a' : '1.5px solid #e2e8f0', borderRadius: 12, background: inCart ? '#f0fdf4' : '#fff', cursor: 'pointer', textAlign: 'left', transition: 'all .15s', boxShadow: inCart ? '0 2px 8px rgba(22,163,74,0.15)' : '0 1px 3px rgba(0,0,0,0.04)', position: 'relative' }}>
                          {inCart && <div style={{ position: 'absolute', top: 8, right: 8, background: '#16a34a', color: '#fff', borderRadius: '50%', width: 20, height: 20, fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{inCart.qty}</div>}
                          <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 6, lineHeight: 1.3, fontSize: '0.82rem', paddingRight: inCart ? 22 : 0 }}>{p.name || p.description}</div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 800, color: '#16a34a', fontSize: '0.92rem' }}>{formatCurrency(price)}</span>
                            {p.bv > 0 && <span style={{ fontSize: '0.68rem', color: '#f59e0b', fontWeight: 600 }}>{p.bv} BV</span>}
                          </div>
                          {!isMember && profit > 0 && <div style={{ fontSize: '0.68rem', color: '#0891b2', marginTop: 3, fontWeight: 600 }}>+{formatCurrency(profit)} profit</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ flexShrink: 0, borderTop: '1px solid #f1f5f9', background: '#fff' }}>
                  <div style={{ padding: '12px 20px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '.1em', color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #f8fafc' }}>Cart</div>
                  <div style={{ maxHeight: 200, overflowY: 'auto', padding: '8px 20px' }}>
                    {cart.length === 0 ? (
                      <p style={{ color: '#cbd5e1', textAlign: 'center', padding: '16px 0', fontSize: '0.85rem' }}>Add products from above</p>
                    ) : cartData.items.map(item => {
                      const lineProfit = !isMember ? ((item.cp || 0) - (item.dp || 0)) * item.qty : null;
                      return (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f8fafc', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.84rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name || item.description}</div>
                            {lineProfit != null && lineProfit > 0 && <div style={{ fontSize: '0.7rem', color: '#0891b2', fontWeight: 600 }}>+{formatCurrency(lineProfit)} profit</div>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <button type="button" onClick={() => updateQty(item.id, -1)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: '0.85rem' }}>−</button>
                            <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700, fontSize: '0.88rem' }}>{item.qty}</span>
                            <button type="button" onClick={() => updateQty(item.id, 1)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', fontSize: '0.85rem' }}>+</button>
                            <span style={{ fontWeight: 700, color: '#1e293b', minWidth: 65, textAlign: 'right', fontSize: '0.88rem' }}>{formatCurrency(item.lineTotal)}</span>
                            <button type="button" onClick={() => removeFromCart(item.id)} style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem' }}>×</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div style={{ padding: '14px 20px', background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                      {isMember && <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.82rem' }}>BV: <strong style={{ color: '#fbbf24' }}>{cartData.totalBV.toFixed(1)}</strong></div>}
                      {!isMember && branchProfit > 0 && <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.82rem' }}>Branch Profit: <strong style={{ color: '#34d399' }}>{formatCurrency(branchProfit)}</strong></div>}
                      <div style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 700 }}>Total: <span style={{ color: '#4ade80' }}>{formatCurrency(cartData.totalAmount)}</span></div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={closeModal} style={{ padding: '9px 18px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
                      <button type="button" onClick={wiReviewSale} style={{ padding: '9px 22px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#16a34a,#15803d)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem', boxShadow: '0 2px 8px rgba(22,163,74,0.4)' }}>
                        Review &amp; Confirm →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(2px)' }}>
          <div style={{ maxWidth: 600, width: '100%', borderRadius: 20, overflow: 'hidden', background: '#fff', boxShadow: '0 25px 60px rgba(0,0,0,0.35)' }}>
            <div style={{ background: 'linear-gradient(135deg,#166534,#15803d)', padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 700 }}>✅ Confirm Sale</div>
                <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.78rem', marginTop: 2 }}>Review before processing payment</div>
              </div>
              <button onClick={() => setShowConfirmModal(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            <div style={{ padding: '20px', maxHeight: '65vh', overflowY: 'auto', background: '#f8fafc' }}>
              {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: '0.82rem' }}>{error}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div style={{ background: '#fff', borderRadius: 12, padding: '14px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '.1em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>Customer</div>
                  <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>{isMember ? selectedReg?.name : newName}</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>
                    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: isMember ? '#dbeafe' : '#fef3c7', color: isMember ? '#1e40af' : '#92400e', marginRight: 6 }}>
                      {isMember ? 'Member (DP)' : 'Walk-in (CP)'}
                    </span>
                    {isMember ? (selectedReg?.nb_number ? `NB#${selectedReg.nb_number}` : '') : (newPhone || '')}
                  </div>
                  {!isMember && (selectedReferral || noReferral) && (
                    <div style={{ marginTop: 6, fontSize: '0.78rem', color: '#92400e', background: '#fffbeb', padding: '4px 8px', borderRadius: 6, border: '1px solid #fcd34d' }}>
                      Referral: <strong>{selectedReferral?.name || DEFAULT_REFERRAL.name}</strong>
                    </div>
                  )}
                </div>
                <div style={{ background: '#fff', borderRadius: 12, padding: '14px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '.1em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>Payment</div>
                  <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '1rem' }}>
                    {paymentMethods.find(m => m.id === paymentMethod)?.icon} {paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)}
                  </div>
                  <div style={{ marginTop: 8, padding: '6px 10px', background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', borderRadius: 8 }}>
                    <div style={{ color: '#4ade80', fontWeight: 800, fontSize: '1.15rem' }}>{formatCurrency(cartData.totalAmount)}</div>
                    {isMember && <div style={{ color: '#fbbf24', fontSize: '0.72rem', marginTop: 1 }}>{cartData.totalBV.toFixed(1)} BV earned</div>}
                    {!isMember && branchProfit > 0 && <div style={{ color: '#34d399', fontSize: '0.72rem', marginTop: 1 }}>Branch profit: {formatCurrency(branchProfit)}</div>}
                  </div>
                </div>
              </div>

              <div style={{ background: '#fff', borderRadius: 12, padding: '14px', border: '1px solid #e2e8f0', marginBottom: 12 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '.1em', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>Items ({cart.length})</div>
                <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                  {cartData.items.map((item, i) => {
                    const lineProfit = !isMember ? ((item.cp || 0) - (item.dp || 0)) * item.qty : null;
                    return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: i < cartData.items.length - 1 ? '1px solid #f8fafc' : 'none', fontSize: '0.85rem' }}>
                        <div>
                          <span style={{ fontWeight: 600, color: '#1e293b' }}>{item.name || item.description}</span>
                          <span style={{ color: '#94a3b8', marginLeft: 4 }}>×{item.qty}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 700 }}>{formatCurrency(item.lineTotal)}</div>
                          {lineProfit != null && lineProfit > 0 && <div style={{ fontSize: '0.72rem', color: '#0891b2' }}>+{formatCurrency(lineProfit)} profit</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {!isMember && (
                <div style={{ background: 'linear-gradient(135deg,#ecfdf5,#d1fae5)', borderRadius: 12, padding: '12px 16px', border: '1px solid #6ee7b7' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>Non-Member Sale Summary</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                    <div>
                      <div style={{ fontSize: '0.68rem', color: '#059669', marginBottom: 2 }}>Customer Pays</div>
                      <div style={{ fontWeight: 800, color: '#064e3b', fontSize: '0.95rem' }}>{formatCurrency(cartData.totalAmount)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.68rem', color: '#059669', marginBottom: 2 }}>Branch Profit</div>
                      <div style={{ fontWeight: 800, color: '#064e3b', fontSize: '0.95rem' }}>{formatCurrency(branchProfit)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.68rem', color: '#d97706', marginBottom: 2 }}>Distributor BV</div>
                      <div style={{ fontWeight: 800, color: '#064e3b', fontSize: '0.95rem' }}>{cartData.totalBV.toFixed(1)}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, fontSize: '0.72rem', color: '#047857', textAlign: 'center' }}>Two receipts will print: Customer copy + Staff/Distributor copy</div>
                </div>
              )}
            </div>

            <div style={{ padding: '14px 20px', background: '#fff', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setShowConfirmModal(false)} style={{ padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontSize: '0.88rem' }}>← Edit</button>
              <button type="button" onClick={completeSale} disabled={submitting}
                style={{ padding: '10px 28px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#166534,#15803d)', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', opacity: submitting ? 0.65 : 1, boxShadow: '0 3px 10px rgba(22,101,52,0.35)' }}>
                {submitting ? '⏳ Processing…' : '✅ Complete Sale'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PrescriptionsTab() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [rxSearch, setRxSearch] = useState('');
  const [rxBranchFilter, setRxBranchFilter] = useState('');
  const [rxStatusFilter, setRxStatusFilter] = useState('all');
  const [rxFromDate, setRxFromDate] = useState('');
  const [rxToDate, setRxToDate] = useState('');
  const [rxGroupTab, setRxGroupTab] = useState('all');

  useEffect(() => {
    api.reports.list()
      .then(d => setReports(Array.isArray(d) ? d : d.reports || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const clearRxFilters = () => {
    setRxSearch(''); setRxBranchFilter(''); setRxStatusFilter('all'); setRxFromDate(''); setRxToDate(''); setRxGroupTab('all');
  };

  const refreshDispenserData = () => {
    setLoading(true);
    api.reports.list()
      .then(d => setReports(Array.isArray(d) ? d : d.reports || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const getMedicines = (r) => {
    if (r.medicines && Array.isArray(r.medicines) && r.medicines.length > 0) return r.medicines;
    const prescriptions = r.prescriptions || r.prescription || [];
    if (!Array.isArray(prescriptions)) return [];
    return prescriptions.map(p => {
      const name = typeof p === 'string' ? p : (p.product_name || p.name || p.product || '');
      return { name, dispensed: false, paid: false };
    });
  };

  const toggleDispense = (reportId, medIndex) => {
    setReports(prev => prev.map(r => {
      if (r.id !== reportId) return r;
      const meds = [...getMedicines(r)];
      meds[medIndex] = { ...meds[medIndex], dispensed: !meds[medIndex].dispensed };
      return { ...r, medicines: meds };
    }));
  };

  const togglePayment = (reportId, medIndex) => {
    setReports(prev => prev.map(r => {
      if (r.id !== reportId) return r;
      const meds = [...getMedicines(r)];
      meds[medIndex] = { ...meds[medIndex], paid: !meds[medIndex].paid };
      return { ...r, medicines: meds };
    }));
  };

  const getEffectivePrice = (medName) => {
    const pkg = PACKAGE_DATABASE[medName];
    if (pkg) return { dp: pkg.price.dp, cp: pkg.price.cp, bv: pkg.price.bv, isPackage: true, products: pkg.products };
    const p = findProductPrice(medName);
    if (p) return { dp: p.dp, cp: p.cp, bv: p.bv, isPackage: false };
    return { dp: 0, cp: 0, bv: 0, isPackage: false };
  };

  const printPrescription = (report) => {
    const meds = getMedicines(report);
    const w = window.open('', '_blank', 'width=800,height=600');
    w.document.write(`<html><head><title>Prescription - ${report.client_name || ''}</title><style>body{font-family:Arial;padding:20px}h2{color:#c41e3a;text-align:center}.med{padding:6px 12px;border-bottom:1px solid #eee}table{width:100%;border-collapse:collapse}th,td{padding:8px;text-align:left;border-bottom:1px solid #ddd}th{background:#f8f9fa}</style></head><body>`);
    w.document.write(`<h2>DYNAPHARM INTERNATIONAL NAMIBIA</h2><h3 style="text-align:center">Prescription</h3>`);
    w.document.write(`<p><strong>Patient:</strong> ${report.client_name || ''} | <strong>Report:</strong> ${report.id} | <strong>Date:</strong> ${new Date(report.created_at || report.date || Date.now()).toLocaleDateString()}</p>`);
    w.document.write(`<table><tr><th>Medicine</th><th>Status</th><th>Price</th></tr>`);
    meds.forEach(m => {
      const price = getEffectivePrice(m.name);
      w.document.write(`<tr><td>${m.name}</td><td>${m.dispensed ? 'Dispensed' : 'Pending'}</td><td>N$${price.cp}</td></tr>`);
    });
    w.document.write(`</table></body></html>`);
    w.document.close();
    w.print();
  };

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  let filteredReports = reports.filter(r => {
    const meds = getMedicines(r);
    if (!meds || meds.length === 0) return false;
    if (rxSearch) {
      const q = rxSearch.toLowerCase();
      const match = (r.client_name || r.full_name || '').toLowerCase().includes(q)
        || (r.id || '').toString().includes(q)
        || (r.consultant || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (rxBranchFilter && (r.branch || '') !== rxBranchFilter) return false;
    if (rxStatusFilter !== 'all') {
      if (rxStatusFilter === 'pending') return meds.some(m => !m.dispensed);
      if (rxStatusFilter === 'dispensed') return meds.length > 0 && meds.every(m => m.dispensed);
      if (rxStatusFilter === 'paid') return meds.filter(m => m.dispensed).every(m => m.paid);
      if (rxStatusFilter === 'outstanding') return meds.some(m => m.dispensed && !m.paid);
    }
    if (rxFromDate) { const d = (r.created_at || r.date || '').slice(0, 10); if (d < rxFromDate) return false; }
    if (rxToDate) { const d = (r.created_at || r.date || '').slice(0, 10); if (d > rxToDate) return false; }
    if (rxGroupTab === 'recent') {
      const created = new Date(r.created_at || r.date || 0);
      if (created < sevenDaysAgo) return false;
    }
    if (rxGroupTab === 'partial') {
      const dispensed = meds.filter(m => m.dispensed).length;
      if (dispensed === 0 || dispensed === meds.length) return false;
    }
    if (rxGroupTab === 'full') {
      if (meds.length === 0 || !meds.every(m => m.dispensed)) return false;
    }
    return true;
  });

  filteredReports.sort((a, b) => new Date(b.created_at || b.date || 0) - new Date(a.created_at || a.date || 0));

  const groupCounts = {
    all: reports.filter(r => getMedicines(r).length > 0).length,
    recent: reports.filter(r => { const meds = getMedicines(r); return meds.length > 0 && new Date(r.created_at || r.date || 0) >= sevenDaysAgo; }).length,
    partial: reports.filter(r => { const meds = getMedicines(r); const d = meds.filter(m => m.dispensed).length; return d > 0 && d < meds.length; }).length,
    full: reports.filter(r => { const meds = getMedicines(r); return meds.length > 0 && meds.every(m => m.dispensed); }).length,
  };

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #27ae60, #1e8449)', color: 'white', padding: '20px 24px', borderRadius: '12px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>💊 Prescription Dispensing</h3>
          <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: '0.9rem' }}>Search, filter and dispense client prescriptions</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.4)', borderRadius: '8px', padding: '8px 16px', fontSize: '0.9rem', cursor: 'pointer' }}>📊 Daily Statement</button>
          <button onClick={refreshDispenserData} style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.4)', borderRadius: '8px', padding: '8px 16px', fontSize: '0.9rem', cursor: 'pointer' }}>🔄 Refresh</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {[
          { id: 'all', label: 'All Prescriptions', icon: '💊', color: '#1e40af', bg: '#eff6ff', border: '#93c5fd', activeBg: '#1e40af' },
          { id: 'recent', label: 'Recent (7 days)', icon: '🕐', color: '#065f46', bg: '#ecfdf5', border: '#6ee7b7', activeBg: '#059669' },
          { id: 'partial', label: 'Partially Dispensed', icon: '⏳', color: '#92400e', bg: '#fffbeb', border: '#fcd34d', activeBg: '#d97706' },
          { id: 'full', label: 'Fully Dispensed', icon: '✅', color: '#166534', bg: '#f0fdf4', border: '#86efac', activeBg: '#16a34a' },
        ].map(tab => {
          const count = groupCounts[tab.id];
          const isActive = rxGroupTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setRxGroupTab(tab.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', border: `2px solid ${isActive ? tab.activeBg : tab.border}`, borderRadius: 10, background: isActive ? tab.activeBg : tab.bg, color: isActive ? '#fff' : tab.color, cursor: 'pointer', fontWeight: isActive ? 700 : 500, fontSize: '0.85rem', transition: 'all .15s', boxShadow: isActive ? `0 3px 10px ${tab.activeBg}55` : 'none' }}>
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              <span style={{ marginLeft: 2, padding: '1px 7px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700, background: isActive ? 'rgba(255,255,255,0.25)' : tab.activeBg, color: isActive ? '#fff' : '#fff' }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', marginBottom: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <input type="text" placeholder="Search by client name, report ID or consultant…" value={rxSearch} onChange={e => setRxSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') refreshDispenserData(); }} style={{ flex: 1, minWidth: '200px', padding: '10px 14px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem' }} />
          <button onClick={refreshDispenserData} style={{ padding: '10px 18px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>🔍 Search</button>
          <button onClick={() => { setRxSearch(''); setRxStatusFilter('all'); setRxGroupTab('all'); refreshDispenserData(); }} style={{ padding: '10px 18px', background: '#3498db', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>💊 Show All</button>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={rxBranchFilter} onChange={e => setRxBranchFilter(e.target.value)} style={{ padding: '9px 12px', border: '2px solid #e2e8f0', borderRadius: '8px', background: 'white', fontSize: '0.9rem' }}>
            <option value="">All Branches</option>
            {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={rxStatusFilter} onChange={e => setRxStatusFilter(e.target.value)} style={{ padding: '9px 12px', border: '2px solid #e2e8f0', borderRadius: '8px', background: 'white', fontSize: '0.9rem' }}>
            <option value="all">All Status</option>
            <option value="pending">⏳ Pending</option>
            <option value="dispensed">✅ Dispensed</option>
            <option value="paid">💰 Paid</option>
            <option value="outstanding">⚠️ Outstanding</option>
          </select>
          <input type="date" value={rxFromDate} onChange={e => setRxFromDate(e.target.value)} title="From date" style={{ padding: '9px 12px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }} />
          <input type="date" value={rxToDate} onChange={e => setRxToDate(e.target.value)} title="To date" style={{ padding: '9px 12px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '0.9rem' }} />
          <button onClick={clearRxFilters} style={{ padding: '9px 14px', background: '#f1f5f9', color: '#64748b', border: '2px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer' }}>♻️ Clear</button>
          <button style={{ padding: '9px 14px', background: '#f39c12', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>💰 Update Pricing</button>
        </div>
      </div>

      {alert && <div style={{ padding: '10px 16px', marginBottom: '12px', borderRadius: '8px', background: alert.type === 'success' ? '#dcfce7' : '#fee2e2', color: alert.type === 'success' ? '#166534' : '#991b1b' }}>{alert.message}</div>}

      <div id="prescriptionList">
        {filteredReports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#7f8c8d' }}>
            <h3>💊 No prescriptions to dispense</h3>
            <p>Prescriptions will appear here once consultants create reports.</p>
          </div>
        ) : filteredReports.map(report => {
          const medicines = getMedicines(report);
          const pending = medicines.filter(m => !m.dispensed).length;
          const dispensed = medicines.filter(m => m.dispensed).length;
          const total = medicines.length;
          const clientMembershipStatus = report.membership_status || 'referred';
          const consultFee = getConsultationFee(clientMembershipStatus);
          const totals = calculatePrescriptionTotals(medicines, clientMembershipStatus);

          return (
            <div key={report.id} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
              <div style={{ background: 'linear-gradient(135deg, #c41e3a 0%, #a0172e 100%)', padding: '16px', color: 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', opacity: 0.9, marginBottom: '4px' }}>PRESCRIPTION</div>
                    <h4 style={{ color: 'white', margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>{report.id}</h4>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>{new Date(report.created_at || report.date || Date.now()).toLocaleDateString()}</div>
                    <div style={{ fontSize: '0.85rem', opacity: 0.9, marginTop: '2px' }}>By: {report.consultant || 'Consultant'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                  <span style={{ background: 'rgba(255,255,255,0.2)', padding: '3px 10px', borderRadius: '12px', fontSize: '0.8rem' }}>👤 {report.client_name || report.full_name || 'Patient'}</span>
                  {clientMembershipStatus === 'member' && <span style={{ background: 'rgba(39,174,96,0.3)', padding: '3px 10px', borderRadius: '12px', fontSize: '0.8rem' }}>🏅 Member</span>}
                  <span style={{ background: pending > 0 ? 'rgba(255,255,255,0.2)' : 'rgba(39,174,96,0.3)', padding: '3px 10px', borderRadius: '12px', fontSize: '0.8rem' }}>
                    {pending > 0 ? `⏳ ${pending} pending` : '✅ All dispensed'} ({dispensed}/{total})
                  </span>
                </div>
              </div>

              <div style={{ padding: '16px' }}>
                <h4 style={{ margin: '0 0 12px', fontSize: '0.95rem', color: '#2c3e50' }}>Prescribed Items:</h4>
                {medicines.map((med, i) => {
                  const price = getEffectivePrice(med.name);
                  return (
                    <div key={i} style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={!!med.dispensed} onChange={() => toggleDispense(report.id, i)} style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                        <span style={{ flex: 1, fontWeight: 500, fontSize: '0.95rem', textDecoration: med.dispensed ? 'line-through' : 'none', color: med.dispensed ? '#27ae60' : '#1e293b' }}>
                          {med.dispensed ? '✅ ' : ''}{med.name}
                          {price.isPackage && <span style={{ marginLeft: '6px', fontSize: '0.75rem', background: '#e8f5e9', color: '#27ae60', padding: '2px 6px', borderRadius: '4px' }}>📦 Package</span>}
                        </span>
                      </div>
                      {price.isPackage && price.products && (
                        <div style={{ marginLeft: '28px', background: '#f8f9fa', padding: '8px', borderRadius: '6px', border: '1px solid #e0e0e0' }}>
                          {price.products.map((product, pi) => (
                            <div key={pi} style={{ padding: '3px 0', fontSize: '0.8rem', color: '#555', display: 'flex', justifyContent: 'space-between' }}>
                              <span>{product.name}</span>
                              <span>Qty: {product.quantity} | {clientMembershipStatus === 'member' ? `DP: N$${product.dp} | BV: ${product.bv}` : `CP: N$${product.cp}`}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ fontSize: '0.9rem', color: '#666', marginLeft: '28px' }}>
                        {clientMembershipStatus === 'member' ? (
                          <><span style={{ marginRight: '15px' }}><strong>DP:</strong> N${price.dp}</span><span><strong>BV:</strong> {price.bv}</span></>
                        ) : (
                          <span><strong>CP:</strong> N${price.cp}</span>
                        )}
                      </div>
                      {med.dispensed && (
                        <div style={{ marginLeft: '28px', marginTop: '4px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!med.paid} onChange={() => togglePayment(report.id, i)} style={{ marginRight: '8px' }} />
                            <span style={{ fontSize: '0.85rem', color: '#27ae60', fontWeight: 500 }}>💰 Payment Received</span>
                          </label>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', padding: '20px', borderRadius: '8px', marginTop: '20px', boxShadow: '0 4px 15px rgba(102, 126, 234, 0.3)' }}>
                  <h4 style={{ color: 'white', marginBottom: '12px', textAlign: 'center', fontSize: '1.1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>💰 Prescription Summary</h4>
                  <div style={{ textAlign: 'center', fontSize: '0.85rem', color: 'rgba(255,255,255,0.9)', marginBottom: '18px' }}>
                    <div style={{ marginBottom: '4px' }}>{consultFee.label}: N${consultFee.total}</div>
                    <div style={{ fontSize: '0.78rem', opacity: 0.85 }}>{consultFee.note}</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.75, marginTop: '2px' }}>Consultation fees not included in branch sales</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                    <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.95)', padding: '14px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                      <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase' }}>Total</div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#c41e3a' }}>
                        {clientMembershipStatus === 'member' ? (
                          <><div>N${totals.total.dp}</div><div style={{ fontSize: '0.75rem', color: '#27ae60', marginTop: '4px' }}>BV: {totals.total.bv}</div></>
                        ) : <div>N${totals.total.cp}</div>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.95)', padding: '14px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', borderLeft: '4px solid #27ae60' }}>
                      <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase' }}>Dispensed</div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#27ae60' }}>
                        {clientMembershipStatus === 'member' ? (
                          <><div>N${totals.dispensed.dp}</div><div style={{ fontSize: '0.75rem', marginTop: '4px' }}>BV: {totals.dispensed.bv}</div></>
                        ) : <div>N${totals.dispensed.cp}</div>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.95)', padding: '14px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', borderLeft: '4px solid #3498db' }}>
                      <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase' }}>Paid</div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#3498db' }}>
                        {clientMembershipStatus === 'member' ? (
                          <><div>N${totals.paid.dp}</div><div style={{ fontSize: '0.75rem', marginTop: '4px' }}>BV: {totals.paid.bv}</div></>
                        ) : <div>N${totals.paid.cp}</div>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.95)', padding: '14px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', borderLeft: '4px solid #e74c3c' }}>
                      <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase' }}>Outstanding</div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#e74c3c' }}>
                        {clientMembershipStatus === 'member' ? (
                          <><div>N${totals.outstanding.dp}</div><div style={{ fontSize: '0.75rem', marginTop: '4px' }}>BV: {totals.outstanding.bv}</div></>
                        ) : <div>N${totals.outstanding.cp}</div>}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button onClick={() => printPrescription(report)} style={{ padding: '8px 16px', background: '#f39c12', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>🖨️ Print Prescription</button>
                  <button onClick={() => {
                    const meds = getMedicines(report);
                    const items = meds.map(m => {
                      const p = getEffectivePrice(m.name);
                      return { product_name: m.name, quantity: 1, unit_price: p.cp, line_total: p.cp, bv: p.bv };
                    });
                    const totalAmount = items.reduce((s, it) => s + it.line_total, 0);
                    const totalBV = items.reduce((s, it) => s + it.bv, 0);
                    const html = generateReceiptHTML({
                      receiptNumber: report.id || 'RX-' + Date.now(),
                      branch: user?.branch || '',
                      items, totalAmount, totalBV,
                      paymentMethod: 'Prescription',
                      customerType: clientMembershipStatus === 'member' ? 'member' : 'non_member',
                      customerName: report.client_name || report.full_name || 'Patient',
                      nbNumber: report.nb_number || null,
                      cashier: user?.full_name || user?.username || null,
                      showBV: true,
                    });
                    printReceipt(html);
                  }} style={{ padding: '8px 16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>🧾 Print Receipt</button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
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
      <div className="rounded-xl p-5 mb-5" style={{ background: 'linear-gradient(135deg, #1e3a5f, #2980b9)' }}>
        <h3 className="text-white text-lg font-bold m-0">🏦 Banking Operations</h3>
        <p className="text-white/75 text-sm mt-1 m-0">Manage deposits, cash drawer, and expenses</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <button onClick={() => setShowForm(true)} className="p-5 rounded-lg text-white text-base font-semibold cursor-pointer border-none" style={{ background: 'linear-gradient(135deg, #27ae60, #1e8449)' }}>💰 Make Deposit</button>
        <button className="p-5 rounded-lg text-white text-base font-semibold cursor-pointer border-none" style={{ background: 'linear-gradient(135deg, #3498db, #2471a3)' }}>💵 Cash Drawer</button>
        <button className="p-5 rounded-lg text-white text-base font-semibold cursor-pointer border-none" style={{ background: 'linear-gradient(135deg, #f39c12, #d68910)' }}>💸 Record Expense</button>
        <button className="p-5 rounded-lg text-gray-700 text-base font-semibold cursor-pointer border-none bg-gray-100 hover:bg-gray-200">📋 Banking History</button>
      </div>

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
  const [search, setSearch] = useState('');

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

  const filteredPayments = payments.filter(p => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (p.client_name || '').toLowerCase().includes(q) || (p.reference || '').toLowerCase().includes(q) || (p.invoice_number || '').toLowerCase().includes(q);
  });

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="rounded-xl p-5 mb-5" style={{ background: 'linear-gradient(135deg, #1e3a5f, #2980b9)' }}>
        <h3 className="text-white text-lg font-bold m-0">💳 Payment Management</h3>
        <p className="text-white/75 text-sm mt-1 m-0">Record and track payments</p>
      </div>

      <div className="flex gap-3 items-center mb-4 flex-wrap" style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
        <input type="text" placeholder="Search by client name or invoice number..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1 min-w-[200px] px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        <button onClick={() => setShowForm(true)} className="px-4 py-2.5 rounded-lg text-white text-sm font-semibold cursor-pointer border-none" style={{ background: 'linear-gradient(135deg, #27ae60, #1e8449)' }}>➕ Record Payment</button>
        <button onClick={async () => { setLoading(true); const res = await api.branch.payments().catch(() => ({ payments: [] })); setPayments(Array.isArray(res) ? res : res.payments || []); setLoading(false); }} className="px-4 py-2.5 rounded-lg text-white text-sm font-semibold cursor-pointer border-none" style={{ background: 'linear-gradient(135deg, #3498db, #2471a3)' }}>🔄 Refresh</button>
      </div>

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
          data={filteredPayments}
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

  const receivingOrders = orders.filter(o => ['pending', 'processing'].includes(o.status));
  const dispensingOrders = orders.filter(o => ['shipped', 'delivered', 'completed'].includes(o.status));

  return (
    <div>
      <div className="rounded-xl p-5 mb-5" style={{ background: 'linear-gradient(135deg, #1e3a5f, #2980b9)' }}>
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div>
            <h3 className="text-white text-lg font-bold m-0">🛍️ Online Orders{user?.branch ? ` - ${user.branch}` : ''}</h3>
            <p className="text-white/75 text-sm mt-1 m-0">Receive and dispense online orders assigned to this branch.</p>
          </div>
          <button onClick={async () => { setLoading(true); try { const d = await api.orders.list(); const all = Array.isArray(d) ? d : d.orders || []; setOrders(user?.branch ? all.filter(o => (o.branch_id || o.branch || '').toLowerCase() === user.branch.toLowerCase() || (o.branch_name || '').toLowerCase().includes(user.branch.toLowerCase())) : all); } catch {} setLoading(false); }} className="px-4 py-2.5 rounded-lg text-white text-sm font-semibold cursor-pointer border-none" style={{ background: 'linear-gradient(135deg, #27ae60, #1e8449)' }}>🔄 Refresh</button>
        </div>
      </div>

      {alert && <Alert type={alert.type} className="mb-4">{alert.message}</Alert>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-gray-800 font-bold m-0 mb-3">📥 Receiving</h4>
          <div className="max-h-[420px] overflow-auto">
            {receivingOrders.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-4">No orders to receive</p>
            ) : receivingOrders.map(r => (
              <div key={r.id} className="p-3 mb-2 rounded-lg border border-gray-100 bg-gray-50">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-semibold text-sm">{r.order_number || r.id}</span>
                  {statusBadge(r.status)}
                </div>
                <p className="text-xs text-gray-600 m-0">{r.customer_name || r.distributor_name || '-'}</p>
                <p className="text-xs text-gray-500 m-0">{formatDateTime(r.created_at)}</p>
                <div className="flex gap-1 mt-2">
                  {(!r.status || r.status === 'pending') && <Button size="sm" variant="warning" onClick={() => updateStatus(r.id, 'processing')} disabled={updating === r.id}>Process</Button>}
                  {r.status === 'processing' && <Button size="sm" variant="primary" onClick={() => updateStatus(r.id, 'shipped')} disabled={updating === r.id}>Ship</Button>}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-gray-800 font-bold m-0 mb-3">📦 Dispensing</h4>
          <div className="max-h-[420px] overflow-auto">
            {dispensingOrders.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-4">No orders to dispense</p>
            ) : dispensingOrders.map(r => (
              <div key={r.id} className="p-3 mb-2 rounded-lg border border-gray-100 bg-gray-50">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-semibold text-sm">{r.order_number || r.id}</span>
                  {statusBadge(r.status)}
                </div>
                <p className="text-xs text-gray-600 m-0">{r.customer_name || r.distributor_name || '-'}</p>
                <p className="text-xs font-bold m-0">{formatCurrency(r.total_amount || r.total || 0)}</p>
                <div className="flex gap-1 mt-2">
                  {r.status === 'shipped' && <Button size="sm" variant="success" onClick={() => updateStatus(r.id, 'delivered')} disabled={updating === r.id}>Delivered</Button>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
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
  const [bonusMonth, setBonusMonth] = useState('');
  const [bonusSearch, setBonusSearch] = useState('');

  const loadBonuses = () => {
    setLoading(true);
    api.get('/branch/payments?type=bonus')
      .then(d => setBonuses(Array.isArray(d) ? d : d.payments || d.bonuses || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadBonuses(); }, []);

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
      loadBonuses();
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to record bonus' });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredBonuses = bonuses.filter(b => {
    let match = true;
    if (bonusSearch.trim()) {
      const q = bonusSearch.toLowerCase();
      match = (b.client_name || b.distributor_name || '').toLowerCase().includes(q) || (b.nb_number || '').toLowerCase().includes(q);
    }
    if (bonusMonth && b.period) {
      match = match && b.period.toLowerCase().includes(bonusMonth.toLowerCase());
    }
    return match;
  });

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="rounded-xl p-5 mb-5" style={{ background: 'linear-gradient(135deg, #1e3a5f, #2980b9)' }}>
        <h3 className="text-white text-lg font-bold m-0">🎁 Bonus Payouts</h3>
        <p className="text-white/75 text-sm mt-1 m-0">Manage distributor bonus payments</p>
      </div>

      <div className="flex gap-3 items-center mb-4 flex-wrap" style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
        <input type="month" value={bonusMonth} onChange={e => setBonusMonth(e.target.value)} className="px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" style={{ maxWidth: '200px' }} />
        <input type="text" placeholder="Search NB or Name..." value={bonusSearch} onChange={e => setBonusSearch(e.target.value)} className="flex-1 min-w-[240px] px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        <button onClick={loadBonuses} className="px-4 py-2.5 rounded-lg text-white text-sm font-semibold cursor-pointer border-none" style={{ background: 'linear-gradient(135deg, #27ae60, #1e8449)' }}>🔄 Refresh</button>
      </div>

      <div className="mb-3 text-sm" style={{ color: '#2c3e50' }}>
        {filteredBonuses.length} bonus record{filteredBonuses.length !== 1 ? 's' : ''} found
      </div>

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

      <div style={{ maxHeight: '460px', overflowY: 'auto', background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
        {filteredBonuses.length === 0 ? (
          <p className="text-center py-5" style={{ color: '#7f8c8d' }}>No pending bonuses</p>
        ) : (
          <Table
            columns={[
              { header: 'Distributor', render: r => r.client_name || r.distributor_name || '-' },
              { header: 'NB Number', render: r => r.nb_number || '-' },
              { header: 'Amount', render: r => <span className="font-bold text-green-600">{formatCurrency(r.amount)}</span> },
              { header: 'Period', key: 'period' },
              { header: 'Status', render: r => <Badge variant={r.status === 'paid' ? 'success' : 'warning'}>{r.status || 'Pending'}</Badge> },
              { header: 'Date', render: r => formatDateTime(r.created_at) },
            ]}
            data={filteredBonuses}
            emptyMessage="No bonus records"
          />
        )}
      </div>
    </div>
  );
}

function CommunicationTab() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);
  const [commFilter, setCommFilter] = useState('all');
  const [recipients, setRecipients] = useState({ hr: false, gm: false, director: false, finance: false, frontdesk: false, mis: false });
  const [commMessage, setCommMessage] = useState('');

  useEffect(() => {
    api.notifications.list()
      .then(d => setAnnouncements(Array.isArray(d) ? d : d.notifications || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    const selectedRecipients = Object.entries(recipients).filter(([,v]) => v).map(([k]) => k);
    if (!commMessage.trim() || selectedRecipients.length === 0) return;
    setSubmitting(true);
    try {
      await api.notifications.create({
        title: 'Staff Communication',
        message: commMessage.trim(),
        type: 'communication',
        target: 'branch',
        recipients: selectedRecipients,
      });
      setAlert({ type: 'success', message: 'Communication sent successfully' });
      setCommMessage('');
      setRecipients({ hr: false, gm: false, director: false, finance: false, frontdesk: false, mis: false });
      const res = await api.notifications.list().catch(() => ({ notifications: [] }));
      setAnnouncements(Array.isArray(res) ? res : res.notifications || []);
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to send communication' });
    } finally {
      setSubmitting(false);
    }
  };

  const filterTabs = [
    { key: 'all', label: 'All' },
    { key: 'hr', label: '👥 HR' },
    { key: 'gm', label: '👔 GM' },
    { key: 'director', label: '🎯 Director' },
    { key: 'finance', label: '💰 Finance' },
    { key: 'frontdesk', label: '🖥️ Front Desk' },
    { key: 'mis', label: '📊 MIS' },
  ];

  const filteredAnnouncements = commFilter === 'all'
    ? announcements
    : announcements.filter(a => (a.target || a.type || '').toLowerCase().includes(commFilter));

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="rounded-xl p-5 mb-5" style={{ background: 'linear-gradient(135deg, #1e3a5f, #2980b9)' }}>
        <h3 className="text-white text-lg font-bold m-0">💬 Staff Communications</h3>
        <p className="text-white/75 text-sm mt-1 m-0">Review messages from HR, GM, Director, Finance, Front Desk and MIS, then send updates back to them.</p>
      </div>

      {alert && <Alert type={alert.type} className="mb-4">{alert.message}</Alert>}

      <div className="flex gap-2 mb-4 flex-wrap" style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
        {filterTabs.map(t => (
          <button key={t.key} onClick={() => setCommFilter(t.key)} className="px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer border-none transition-colors" style={commFilter === t.key ? { background: 'linear-gradient(135deg, #3498db, #2980b9)', color: 'white' } : { background: '#e2e8f0', color: '#4a5568' }}>{t.label}</button>
        ))}
      </div>

      <div style={{ maxHeight: '300px', overflowY: 'auto', background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '20px' }}>
        {filteredAnnouncements.length === 0 ? (
          <p className="text-center py-5" style={{ color: '#7f8c8d' }}>No messages</p>
        ) : (
          <div className="space-y-3">
            {filteredAnnouncements.map((a, i) => (
              <div key={a.id || i} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex justify-between items-start">
                  <h4 className="font-semibold text-gray-800 text-sm">{a.title}</h4>
                  <span className="text-xs text-gray-400">{formatDateTime(a.created_at)}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">{a.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2" style={{ color: '#c41e3a' }}>Choose recipients</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {[
              { key: 'hr', label: '👥 HR' },
              { key: 'gm', label: '👔 GM' },
              { key: 'director', label: '🎯 Director' },
              { key: 'finance', label: '💰 Finance' },
              { key: 'frontdesk', label: '🖥️ Front Desk' },
              { key: 'mis', label: '📊 MIS' },
            ].map(r => (
              <label key={r.key} className="flex items-center gap-2 text-sm cursor-pointer p-1.5 rounded hover:bg-gray-50">
                <input type="checkbox" checked={recipients[r.key]} onChange={e => setRecipients({ ...recipients, [r.key]: e.target.checked })} className="w-4 h-4" />
                {r.label}
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={() => setRecipients({ hr: true, gm: true, director: true, finance: true, frontdesk: true, mis: true })} className="px-3 py-1 rounded text-xs font-semibold cursor-pointer border-none" style={{ background: 'linear-gradient(135deg, #3498db, #2471a3)', color: 'white' }}>Select All</button>
            <button type="button" onClick={() => setRecipients({ hr: false, gm: false, director: false, finance: false, frontdesk: false, mis: false })} className="px-3 py-1 rounded text-xs font-semibold cursor-pointer border-none bg-gray-200 text-gray-600">Clear</button>
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2" style={{ color: '#c41e3a' }}>Message</label>
          <textarea value={commMessage} onChange={e => setCommMessage(e.target.value)} rows={4} placeholder="Type your update or request..." required className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-vertical" />
        </div>
        <div className="flex gap-3 flex-wrap">
          <button type="submit" disabled={submitting} className="px-5 py-2.5 rounded-lg text-white text-sm font-semibold cursor-pointer border-none" style={{ background: 'linear-gradient(135deg, #27ae60, #1e8449)' }}>{submitting ? 'Sending...' : 'Send Communication'}</button>
          <button type="button" onClick={() => { setCommMessage(''); setRecipients({ hr: false, gm: false, director: false, finance: false, frontdesk: false, mis: false }); }} className="px-5 py-2.5 rounded-lg text-sm font-semibold cursor-pointer border-none bg-gray-200 text-gray-600">Clear</button>
        </div>
      </form>
    </div>
  );
}

function StaffTab() {
  const [alert, setAlert] = useState(null);
  const [leaveStatus, setLeaveStatus] = useState('');
  const [cashStatus, setCashStatus] = useState('');

  return (
    <div>
      <div className="rounded-xl p-5 mb-5" style={{ background: 'linear-gradient(135deg, #1e3a5f, #2980b9)' }}>
        <h3 className="text-white text-lg font-bold m-0">👤 Staff Services</h3>
        <p className="text-white/75 text-sm mt-1 m-0">Leave management and cash requests</p>
      </div>

      {alert && <Alert type={alert.type} className="mb-4">{alert.message}</Alert>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div style={{ background: '#e8f5e9', padding: '20px', borderRadius: '8px', border: '2px solid #4caf50' }}>
          <h4 style={{ color: '#2e7d32', marginBottom: '15px', marginTop: 0 }}>📅 Leave Management</h4>
          <div className="flex gap-3 flex-wrap">
            <button onClick={() => setAlert({ type: 'info', message: 'Leave request form coming soon' })} className="px-4 py-2.5 rounded-lg text-white text-sm font-semibold cursor-pointer border-none" style={{ background: 'linear-gradient(135deg, #27ae60, #1e8449)' }}>Request Leave</button>
            <button onClick={() => setAlert({ type: 'info', message: 'Leave history coming soon' })} className="px-4 py-2.5 rounded-lg text-white text-sm font-semibold cursor-pointer border-none" style={{ background: 'linear-gradient(135deg, #3498db, #2471a3)' }}>My Leave Requests</button>
          </div>
          {leaveStatus && <div className="mt-4 text-sm" style={{ color: '#2e7d32' }}>{leaveStatus}</div>}
        </div>

        <div style={{ background: '#e3f2fd', padding: '20px', borderRadius: '8px', border: '2px solid #2196f3' }}>
          <h4 style={{ color: '#1565c0', marginBottom: '15px', marginTop: 0 }}>💵 Cash Requests</h4>
          <div className="flex gap-3 flex-wrap">
            <button onClick={() => setAlert({ type: 'info', message: 'Cash request form coming soon' })} className="px-4 py-2.5 rounded-lg text-white text-sm font-semibold cursor-pointer border-none" style={{ background: 'linear-gradient(135deg, #27ae60, #1e8449)' }}>Request Cash</button>
            <button onClick={() => setAlert({ type: 'info', message: 'Cash request history coming soon' })} className="px-4 py-2.5 rounded-lg text-white text-sm font-semibold cursor-pointer border-none" style={{ background: 'linear-gradient(135deg, #3498db, #2471a3)' }}>My Cash Requests</button>
          </div>
          {cashStatus && <div className="mt-4 text-sm" style={{ color: '#1565c0' }}>{cashStatus}</div>}
        </div>
      </div>
    </div>
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
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);
  const [distributorSearch, setDistributorSearch] = useState('');
  const [distributorResults, setDistributorResults] = useState([]);
  const [selectedDistributor, setSelectedDistributor] = useState(null);
  const [productRows, setProductRows] = useState([{ product: '', quantity: '', unit: '' }]);
  const [requestDate, setRequestDate] = useState(new Date().toISOString().slice(0, 10));
  const [requestBranch, setRequestBranch] = useState(user?.branch || '');
  const [requestNotes, setRequestNotes] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [signature, setSignature] = useState('');

  useEffect(() => {
    api.get('/field_program_requests')
      .then(d => setActivities(Array.isArray(d) ? d : d.activities || d.requests || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadActivities = async () => {
    setLoading(true);
    const res = await api.get('/field_program_requests').catch(() => []);
    setActivities(Array.isArray(res) ? res : res.activities || res.requests || []);
    setLoading(false);
  };

  const distSearchTimer = useRef(null);
  const searchDistributor = (val) => {
    setDistributorSearch(val);
    if (val.length < 2) { setDistributorResults([]); return; }
    if (distSearchTimer.current) clearTimeout(distSearchTimer.current);
    distSearchTimer.current = setTimeout(async () => {
      try {
        const res = await api.distributors.search(val);
        const list = Array.isArray(res) ? res : res.distributors || [];
        setDistributorResults(list.slice(0, 8));
      } catch { setDistributorResults([]); }
    }, 300);
  };

  const selectDistributor = (d) => {
    setSelectedDistributor(d);
    setDistributorSearch(d.distributor_name || d.name || '');
    setDistributorResults([]);
  };

  const addProductRow = () => setProductRows([...productRows, { product: '', quantity: '', unit: '' }]);
  const removeProductRow = (idx) => setProductRows(productRows.filter((_, i) => i !== idx));
  const updateProductRow = (idx, field, val) => {
    const rows = [...productRows];
    rows[idx][field] = val;
    setProductRows(rows);
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!selectedDistributor || !agreeTerms || !signature.trim()) return;
    const validProducts = productRows.filter(r => r.product.trim() && r.quantity);
    if (validProducts.length === 0) return;
    setSubmitting(true);
    try {
      await api.post('/field_program_requests', {
        id: `FP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        distributor_id: selectedDistributor.id,
        distributor_name: selectedDistributor.distributor_name || selectedDistributor.name,
        distributor_code: selectedDistributor.distributor_code || selectedDistributor.nb_number,
        date: requestDate,
        branch: requestBranch,
        products: validProducts.map(r => ({ product_name: r.product, quantity: Number(r.quantity), unit: r.unit })),
        notes: requestNotes.trim(),
        signature: signature.trim(),
        status: 'pending',
        created_by: user?.full_name || user?.username || '',
      });
      setAlert({ type: 'success', message: 'Stock request submitted successfully' });
      setShowForm(false);
      setSelectedDistributor(null);
      setDistributorSearch('');
      setProductRows([{ product: '', quantity: '', unit: '' }]);
      setRequestNotes('');
      setAgreeTerms(false);
      setSignature('');
      loadActivities();
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to submit request' });
    } finally { setSubmitting(false); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="rounded-xl p-5 mb-5" style={{ background: 'linear-gradient(135deg, #1e3a5f, #2980b9)' }}>
        <h3 className="text-white text-lg font-bold m-0">🚐 Field Program - Stock Requests</h3>
        <p className="text-white/75 text-sm mt-1 m-0">Manage stock requests from distributors for field program activities. All requests require distributor verification and FEFO compliance.</p>
      </div>

      {alert && <Alert type={alert.type} className="mb-4">{alert.message}</Alert>}

      <div className="flex gap-4 mb-5 flex-wrap">
        <button onClick={() => setShowForm(true)} className="px-6 py-3 rounded-lg text-white font-semibold cursor-pointer border-none" style={{ background: '#c41e3a' }}>➕ New Stock Request</button>
        <button onClick={loadActivities} className="px-6 py-3 rounded-lg text-white font-semibold cursor-pointer border-none" style={{ background: '#6c757d' }}>🔄 Refresh</button>
      </div>

      <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
        {activities.length === 0 ? (
          <p className="text-center py-5" style={{ color: '#7f8c8d' }}>No field program requests</p>
        ) : (
          <Table
            columns={[
              { header: 'ID', render: r => <span className="text-xs font-mono">{r.id}</span> },
              { header: 'Distributor', render: r => r.distributor_name || r.coordinator || '-' },
              { header: 'Date', render: r => formatDate(r.date) },
              { header: 'Products', render: r => {
                const prods = Array.isArray(r.products) ? r.products : [];
                return prods.length > 0 ? prods.map(p => `${p.product_name} x${p.quantity}`).join(', ') : '-';
              }},
              { header: 'Status', render: r => <Badge variant={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}>{(r.status || 'Pending').replace(/_/g, ' ')}</Badge> },
            ]}
            data={activities}
            emptyMessage="No requests"
          />
        )}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="🚐 Field Program Stock Request Form">
        <div className="p-6" style={{ maxHeight: '80vh', overflowY: 'auto' }}>
          <div style={{ background: '#fff3cd', border: '2px solid #ffc107', borderRadius: '8px', padding: '15px', marginBottom: '20px' }}>
            <h4 style={{ marginTop: 0, color: '#856404' }}>Distributor Verification *</h4>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Search Distributor by NB Number or Name *</label>
              <input type="text" value={distributorSearch} onChange={e => searchDistributor(e.target.value)} placeholder="Type NB number (e.g., NB001544) or name" className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm" autoComplete="off" />
              {distributorResults.length > 0 && (
                <div className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-lg w-full mt-1 max-h-[200px] overflow-auto">
                  {distributorResults.map((d, i) => (
                    <div key={d.id || i} onClick={() => selectDistributor(d)} className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-100">
                      <span className="font-semibold">{d.distributor_name || d.name}</span> <span className="text-gray-500">({d.distributor_code || d.nb_number})</span>
                    </div>
                  ))}
                </div>
              )}
              {selectedDistributor && (
                <div style={{ marginTop: '10px', padding: '10px', background: 'white', borderRadius: '5px', border: '1px solid #ddd' }}>
                  <p className="text-sm m-0"><strong>Selected:</strong> {selectedDistributor.distributor_name || selectedDistributor.name}</p>
                  <p className="text-sm m-0"><strong>NB Number:</strong> {selectedDistributor.distributor_code || selectedDistributor.nb_number}</p>
                  <p className="text-sm m-0"><strong>Mobile:</strong> {selectedDistributor.mobile_no || selectedDistributor.phone || '-'}</p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Request Date *</label>
              <input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Branch *</label>
              <input type="text" value={requestBranch} onChange={e => setRequestBranch(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm" />
            </div>
          </div>

          <h4 style={{ color: '#2c3e50', marginBottom: '15px' }}>Requested Products *</h4>
          {productRows.map((row, idx) => (
            <div key={idx} className="grid gap-3 mb-3 items-end" style={{ gridTemplateColumns: '2fr 1fr 1fr auto' }}>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Product *</label>
                <input type="text" value={row.product} onChange={e => updateProductRow(idx, 'product', e.target.value)} placeholder="Product name" className="w-full px-2 py-2 rounded border border-gray-300 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Qty *</label>
                <input type="number" value={row.quantity} onChange={e => updateProductRow(idx, 'quantity', e.target.value)} min="1" className="w-full px-2 py-2 rounded border border-gray-300 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Unit</label>
                <input type="text" value={row.unit} onChange={e => updateProductRow(idx, 'unit', e.target.value)} placeholder="boxes" className="w-full px-2 py-2 rounded border border-gray-300 text-sm" />
              </div>
              <button type="button" onClick={() => removeProductRow(idx)} className="px-3 py-2 rounded text-white text-xs font-semibold cursor-pointer border-none bg-red-500" disabled={productRows.length === 1}>Remove</button>
            </div>
          ))}
          <button type="button" onClick={addProductRow} className="px-4 py-2 rounded-lg text-sm cursor-pointer border-none bg-gray-200 text-gray-700 mb-4">➕ Add Product</button>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Purpose/Notes</label>
            <textarea value={requestNotes} onChange={e => setRequestNotes(e.target.value)} rows={3} placeholder="Brief description of field program activity or purpose" className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm resize-vertical" />
          </div>

          <div style={{ background: '#f8f9fa', border: '2px solid #c41e3a', borderRadius: '8px', padding: '15px', marginBottom: '20px', maxHeight: '200px', overflowY: 'auto' }}>
            <h4 style={{ marginTop: 0, color: '#c41e3a' }}>Terms and Conditions of Stock Handling Commitment</h4>
            <ol className="text-sm" style={{ lineHeight: 1.6 }}>
              <li><strong>Stock Accountability:</strong> The distributor is fully responsible for all stock received and must account for every item.</li>
              <li><strong>FEFO Compliance:</strong> Stock will be issued following First Expired First Out (FEFO) principles.</li>
              <li><strong>Storage Requirements:</strong> Stock must be stored in appropriate conditions as per product specifications.</li>
              <li><strong>Damage/Loss Reporting:</strong> Any damaged or lost stock must be reported immediately to the branch manager.</li>
              <li><strong>Return Policy:</strong> Unused stock may be returned within 30 days if in original condition and packaging.</li>
              <li><strong>Sales Records:</strong> Complete sales records must be maintained and submitted as required.</li>
              <li><strong>Payment Terms:</strong> Payment for stock must be made according to agreed terms.</li>
              <li><strong>Compliance:</strong> All stock must be used/sold in compliance with Dynapharm policies and local regulations.</li>
            </ol>
            <label className="flex items-center gap-2 cursor-pointer mt-3">
              <input type="checkbox" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)} className="w-[18px] h-[18px]" />
              <span className="text-sm">I have read and agree to the Terms and Conditions of Stock Handling Commitment *</span>
            </label>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Distributor Signature (Type Full Name) *</label>
            <input type="text" value={signature} onChange={e => setSignature(e.target.value)} placeholder="Full name as signature" className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm" required />
          </div>

          <div className="flex gap-3">
            <button onClick={handleSubmit} disabled={submitting || !agreeTerms || !selectedDistributor || !signature.trim()} className="flex-1 px-5 py-3 rounded-lg text-white font-semibold cursor-pointer border-none disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #27ae60, #1e8449)' }}>{submitting ? 'Submitting...' : 'Submit Request'}</button>
            <button onClick={() => setShowForm(false)} className="px-5 py-3 rounded-lg text-sm font-semibold cursor-pointer border-none bg-gray-200 text-gray-600">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

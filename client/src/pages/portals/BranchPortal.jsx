import { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import { formatCurrency, formatDateTime, formatDate, BRANCHES, COMPANY_INFO, BRANCH_DETAILS } from '../../lib/constants';
import { enrichProductsWithPricing, calculateCartTotals, generateReceiptNumber, PRICE_LIST, PACKAGE_DATABASE, findProductPrice, calculatePrescriptionTotals, getConsultationFee } from '../../lib/pricing';
import { generateReceiptHTML, printReceipt, generateSalesPDFHTML, printSalesPDF } from '../../lib/receipt';
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
      <div className="flex items-center justify-between mb-5 p-5 rounded-2xl text-white" style={{ background: 'linear-gradient(135deg,#c41e3a 0%,#8b0000 100%)', boxShadow: '0 4px 20px rgba(196,30,58,0.28)' }}>
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'rgba(255,255,255,0.15)' }}>🛒</div>
            <div>
              <h3 className="text-xl font-bold m-0">Walk-in Sales</h3>
              <p className="text-sm m-0" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {user?.branch ? `${user.branch} Branch · Point of Sale` : 'Branch Point of Sale'}
              </p>
            </div>
          </div>
        </div>
        <button onClick={openModal} className="flex items-center gap-2 font-bold text-sm px-5 py-3 rounded-xl cursor-pointer transition-all" style={{ background: '#fff', color: '#c41e3a', border: 'none', boxShadow: '0 3px 12px rgba(0,0,0,0.18)', letterSpacing: '0.02em' }}>
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
              const saleParams = {
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
                saleDate: s.created_at || s.timestamp,
              };
              return (
                <div key={i} className="flex items-center justify-between px-5 py-3.5 text-sm hover:bg-gray-50 transition-colors gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="font-mono font-semibold text-gray-700 text-xs">{saleParams.receiptNumber}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0" style={{ background: sIsM ? '#dbeafe' : '#fef3c7', color: sIsM ? '#1e40af' : '#92400e' }}>
                      {sIsM ? '🏅 Member' : '👤 Walk-in'}
                    </span>
                    <span className="text-gray-500 truncate">{saleParams.customerName || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold text-gray-800">{formatCurrency(saleParams.totalAmount)}</span>
                    <span className="text-xs text-gray-400 hidden sm:inline">{formatDate(s.created_at || s.timestamp)}</span>
                    <button onClick={(e) => { e.stopPropagation(); printReceipt(generateReceiptHTML({ ...saleParams, showBV: sIsM })); }}
                      title="Print 80mm thermal receipt"
                      className="px-2.5 py-1 text-xs rounded border cursor-pointer" style={{ color: '#374151', borderColor: '#e2e8f0', background: '#fff' }}>🖨️ Thermal</button>
                    {!sIsM && (
                      <button onClick={(e) => {
                        e.stopPropagation();
                        printReceipt(generateReceiptHTML({ ...saleParams, showBV: false, copyType: 'customer' }));
                        setTimeout(() => printReceipt(generateReceiptHTML({ ...saleParams, showBV: true, copyType: 'staff' })), 900);
                      }}
                        title="Print customer copy + staff copy"
                        className="px-2.5 py-1 text-xs rounded border cursor-pointer" style={{ color: '#1e40af', borderColor: '#93c5fd', background: '#eff6ff' }}>🧾🧾 Both</button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); printSalesPDF({ ...saleParams, showBV: sIsM }); }}
                      title="Open A4 PDF invoice"
                      className="px-2.5 py-1 text-xs rounded border cursor-pointer" style={{ color: '#fff', borderColor: '#c41e3a', background: '#c41e3a', fontWeight: 600 }}>📄 PDF</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.72)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', backdropFilter: 'blur(3px)' }} onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div style={{ width: '100%', maxWidth: '1160px', background: '#fff', borderRadius: '22px', overflow: 'hidden', maxHeight: '96vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(196,30,58,0.25)' }}>

            {/* POS Header — Dynapharm Red */}
            <div style={{ background: 'linear-gradient(135deg,#c41e3a 0%,#8b0000 100%)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: 13, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', backdropFilter: 'blur(4px)' }}>🏪</div>
                <div>
                  <div style={{ color: '#fff', fontSize: '1.18rem', fontWeight: 800, letterSpacing: '-0.01em' }}>Branch Point of Sale</div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', marginTop: 1 }}>
                    {user?.branch ? `${user.branch} Branch` : 'Dynapharm'} &nbsp;·&nbsp;
                    <span style={{ color: '#ffd0d8', fontWeight: 600 }}>{isMember ? '🏅 Member — DP Prices' : '👤 Walk-in — CP Prices'}</span>
                    &nbsp;·&nbsp; {cart.length} item{cart.length !== 1 ? 's' : ''} in cart
                  </div>
                </div>
              </div>
              <button onClick={closeModal} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

              {/* LEFT SIDEBAR */}
              <div style={{ width: 310, flexShrink: 0, borderRight: '1px solid #f0e8ea', overflowY: 'auto', background: '#fff', padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                {error && <div style={{ background: '#fff0f3', border: '1px solid #fecaca', color: '#c41e3a', padding: '8px 12px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 500 }}>{error}</div>}

                {/* Customer Type */}
                <div>
                  <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '.12em', color: '#c41e3a', textTransform: 'uppercase', marginBottom: 8 }}>Customer Type</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      { type: 'registered', icon: '🏅', label: 'Member', sub: 'DP price · BV', activeColor: '#c41e3a', activeBg: '#fff0f3', activeBorder: '#c41e3a' },
                      { type: 'new', icon: '👤', label: 'Walk-in', sub: 'CP price', activeColor: '#92400e', activeBg: '#fffbeb', activeBorder: '#f59e0b' },
                    ].map(opt => {
                      const isAct = customerType === opt.type;
                      return (
                        <button key={opt.type} type="button" onClick={() => wiSetCustomerType(opt.type)}
                          style={{ padding: '11px 8px', border: isAct ? `2.5px solid ${opt.activeBorder}` : '1.5px solid #ede8e8', borderRadius: 12, background: isAct ? opt.activeBg : '#fafafa', cursor: 'pointer', textAlign: 'center', transition: 'all .15s', boxShadow: isAct ? `0 3px 10px ${opt.activeBorder}33` : 'none' }}>
                          <div style={{ fontSize: '1.3rem', marginBottom: 3 }}>{opt.icon}</div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: isAct ? opt.activeColor : '#374151' }}>{opt.label}</div>
                          <div style={{ fontSize: '0.67rem', color: isAct ? opt.activeColor : '#94a3b8', marginTop: 1, opacity: 0.8 }}>{opt.sub}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Member or New Customer details */}
                {customerType === 'registered' ? (
                  <div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '.12em', color: '#c41e3a', textTransform: 'uppercase', marginBottom: 8 }}>Member Lookup</div>
                    <div style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#c41e3a', fontSize: '0.9rem', pointerEvents: 'none' }}>🔍</div>
                      <input type="text" value={regSearch} placeholder="Search by name or NB#…" onChange={e => searchRegistered(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.87rem', boxSizing: 'border-box', background: '#fff', outline: 'none' }} />
                      {regResults.length > 0 && (
                        <div style={{ position: 'absolute', zIndex: 2000, width: '100%', background: '#fff', border: '1.5px solid #fecaca', borderRadius: 10, maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 28px rgba(196,30,58,0.15)', top: 'calc(100% + 4px)', left: 0 }}>
                          {regResults.map(d => (
                            <button key={d.id} onClick={() => selectRegistered(d)}
                              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderBottom: '1px solid #fff5f5', background: 'none', cursor: 'pointer', fontSize: '0.84rem' }}>
                              <div style={{ fontWeight: 700, color: '#1e293b' }}>{d.name || d.full_name}</div>
                              <div style={{ color: '#c41e3a', fontSize: '0.76rem', marginTop: 1 }}>NB#{d.nb_number || d.distributor_code}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedReg && (
                      <div style={{ marginTop: 8, padding: '10px 13px', background: 'linear-gradient(135deg,#fff0f3,#ffe4e8)', border: '1.5px solid #f9a8b4', borderRadius: 10, fontSize: '0.84rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 800, color: '#9b1c2e' }}>{selectedReg.name}</div>
                          <div style={{ color: '#c41e3a', fontSize: '0.75rem', marginTop: 2 }}>NB#{selectedReg.nb_number} &nbsp;·&nbsp; {selectedReg.phone || '—'}</div>
                        </div>
                        <button type="button" onClick={clearRegistered} style={{ border: 'none', background: '#fecaca', color: '#c41e3a', cursor: 'pointer', width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 700 }}>×</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '.12em', color: '#c41e3a', textTransform: 'uppercase', marginBottom: 8 }}>Customer Details</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full name *"
                        style={{ padding: '9px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.87rem', boxSizing: 'border-box', outline: 'none' }} />
                      <input type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Phone number (optional)"
                        style={{ padding: '9px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.87rem', boxSizing: 'border-box', outline: 'none' }} />
                    </div>

                    <div style={{ marginTop: 14, padding: '13px', background: '#fffbeb', borderRadius: 11, border: '1.5px solid #fcd34d' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '.12em', color: '#92400e', textTransform: 'uppercase', marginBottom: 8 }}>Referral Distributor</div>
                      <div style={{ position: 'relative' }}>
                        <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#f59e0b', fontSize: '0.9rem', pointerEvents: 'none', opacity: noReferral ? 0.4 : 1 }}>🔍</div>
                        <input type="text" value={referralSearch} onChange={e => searchReferrals(e.target.value)} placeholder="Search by name or NB#…" disabled={noReferral}
                          style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1.5px solid #fcd34d', borderRadius: 9, fontSize: '0.87rem', boxSizing: 'border-box', outline: 'none', opacity: noReferral ? 0.5 : 1, background: noReferral ? '#fef9ee' : '#fff' }} />
                        {referralResults.length > 0 && !noReferral && (
                          <div style={{ position: 'absolute', zIndex: 2000, width: '100%', background: '#fff', border: '1.5px solid #fcd34d', borderRadius: 10, maxHeight: 170, overflowY: 'auto', boxShadow: '0 8px 28px rgba(245,158,11,0.15)', top: 'calc(100% + 4px)', left: 0 }}>
                            {referralResults.map(d => (
                              <button key={d.id} onClick={() => selectReferral(d)}
                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderBottom: '1px solid #fffbeb', background: 'none', cursor: 'pointer', fontSize: '0.84rem' }}>
                                <div style={{ fontWeight: 700, color: '#1e293b' }}>{d.name || d.full_name}</div>
                                <div style={{ color: '#d97706', fontSize: '0.76rem', marginTop: 1 }}>NB#{d.nb_number || d.distributor_code}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {selectedReferral && !noReferral && (
                        <div style={{ marginTop: 8, padding: '9px 12px', background: '#fff', border: '1px solid #fcd34d', borderRadius: 9, fontSize: '0.84rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 800, color: '#92400e' }}>{selectedReferral.name}</div>
                            <div style={{ color: '#d97706', fontSize: '0.75rem', marginTop: 2 }}>NB#{selectedReferral.nb_number}</div>
                          </div>
                          <button type="button" onClick={clearReferral} style={{ border: 'none', background: '#fef3c7', color: '#d97706', cursor: 'pointer', width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 700 }}>×</button>
                        </div>
                      )}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: '0.82rem', cursor: 'pointer', color: '#92400e', userSelect: 'none' }}>
                        <input type="checkbox" checked={noReferral} onChange={e => toggleNoReferral(e.target.checked)} style={{ width: 15, height: 15, accentColor: '#c41e3a' }} />
                        No referral — direct walk-in
                      </label>
                    </div>
                  </div>
                )}

                {/* Payment Method */}
                <div>
                  <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '.12em', color: '#c41e3a', textTransform: 'uppercase', marginBottom: 8 }}>Payment Method</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                    {paymentMethods.map(m => {
                      const isAct = paymentMethod === m.id;
                      return (
                        <button key={m.id} type="button" onClick={() => setPaymentMethod(m.id)}
                          style={{ padding: '11px 6px', border: isAct ? '2.5px solid #c41e3a' : '1.5px solid #ede8e8', borderRadius: 11, background: isAct ? '#fff0f3' : '#fafafa', cursor: 'pointer', fontSize: '0.82rem', fontWeight: isAct ? 800 : 400, color: isAct ? '#c41e3a' : '#374151', transition: 'all .15s', textAlign: 'center', boxShadow: isAct ? '0 2px 8px rgba(196,30,58,0.15)' : 'none' }}>
                          <div style={{ fontSize: '1.2rem', marginBottom: 3 }}>{m.icon}</div>
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* RIGHT PANEL — Products + Cart */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, background: '#f9f5f5' }}>

                {/* Products header */}
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0e8ea', background: '#fff', flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#c41e3a', fontSize: '0.9rem', pointerEvents: 'none' }}>🔍</div>
                      <input type="text" value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search products…"
                        style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <span style={{ fontSize: '0.78rem', padding: '6px 14px', borderRadius: 20, fontWeight: 700, whiteSpace: 'nowrap', background: isMember ? '#fff0f3' : '#fffbeb', color: isMember ? '#c41e3a' : '#92400e', border: `1.5px solid ${isMember ? '#fecaca' : '#fcd34d'}` }}>
                      {isMember ? '🏅 DP Price' : '👤 CP Price'}
                    </span>
                  </div>
                </div>

                {/* Product grid */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 10 }}>
                    {filteredProducts.length === 0 ? (
                      <div style={{ color: '#c4a0a7', gridColumn: '1/-1', textAlign: 'center', padding: '40px 0', fontSize: '0.9rem' }}>No products found</div>
                    ) : filteredProducts.slice(0, 60).map(p => {
                      const price = isMember ? (p.dp || p.price) : (p.cp || p.price);
                      const inCart = cart.find(c => c.id === p.id);
                      const profit = !isMember ? (p.cp || 0) - (p.dp || 0) : 0;
                      return (
                        <button key={p.id} onClick={() => addToCart(p)} type="button"
                          style={{ padding: '12px 11px', border: inCart ? '2.5px solid #c41e3a' : '1.5px solid #f0e8ea', borderRadius: 13, background: inCart ? '#fff0f3' : '#fff', cursor: 'pointer', textAlign: 'left', transition: 'all .15s', boxShadow: inCart ? '0 4px 14px rgba(196,30,58,0.18)' : '0 1px 4px rgba(196,30,58,0.04)', position: 'relative' }}>
                          {inCart && (
                            <div style={{ position: 'absolute', top: 8, right: 8, background: '#c41e3a', color: '#fff', borderRadius: '50%', width: 22, height: 22, fontSize: '0.72rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{inCart.qty}</div>
                          )}
                          <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 7, lineHeight: 1.35, fontSize: '0.82rem', paddingRight: inCart ? 24 : 0 }}>{p.name || p.description}</div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                            <span style={{ fontWeight: 900, color: '#c41e3a', fontSize: '0.95rem' }}>{formatCurrency(price)}</span>
                            {p.bv > 0 && <span style={{ fontSize: '0.67rem', color: '#d97706', fontWeight: 700, background: '#fffbeb', padding: '1px 5px', borderRadius: 8 }}>{p.bv} BV</span>}
                          </div>
                          {!isMember && profit > 0 && <div style={{ fontSize: '0.68rem', color: '#0891b2', marginTop: 4, fontWeight: 700 }}>+{formatCurrency(profit)} profit</div>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Cart */}
                <div style={{ flexShrink: 0, borderTop: '2px solid #f0e8ea', background: '#fff' }}>
                  <div style={{ padding: '10px 18px', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '.12em', color: '#c41e3a', textTransform: 'uppercase', borderBottom: '1px solid #f9f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Shopping Cart</span>
                    {cart.length > 0 && <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8' }}>{cart.length} item{cart.length !== 1 ? 's' : ''}</span>}
                  </div>
                  <div style={{ maxHeight: 190, overflowY: 'auto', padding: '6px 18px' }}>
                    {cart.length === 0 ? (
                      <p style={{ color: '#c4a0a7', textAlign: 'center', padding: '18px 0', fontSize: '0.85rem' }}>No items yet — select products above</p>
                    ) : cartData.items.map(item => {
                      const lineProfit = !isMember ? ((item.cp || 0) - (item.dp || 0)) * item.qty : null;
                      return (
                        <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #fdf5f5', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.84rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name || item.description}</div>
                            {lineProfit != null && lineProfit > 0 && <div style={{ fontSize: '0.7rem', color: '#0891b2', fontWeight: 600 }}>+{formatCurrency(lineProfit)} profit</div>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                            <button type="button" onClick={() => updateQty(item.id, -1)} style={{ width: 26, height: 26, borderRadius: 7, border: '1.5px solid #fecaca', background: '#fff', cursor: 'pointer', color: '#c41e3a', fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                            <span style={{ minWidth: 22, textAlign: 'center', fontWeight: 800, fontSize: '0.9rem', color: '#1e293b' }}>{item.qty}</span>
                            <button type="button" onClick={() => updateQty(item.id, 1)} style={{ width: 26, height: 26, borderRadius: 7, border: '1.5px solid #fecaca', background: '#fff', cursor: 'pointer', color: '#c41e3a', fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                            <span style={{ fontWeight: 800, color: '#1e293b', minWidth: 68, textAlign: 'right', fontSize: '0.9rem' }}>{formatCurrency(item.lineTotal)}</span>
                            <button type="button" onClick={() => removeFromCart(item.id)} style={{ border: 'none', background: '#fef2f2', color: '#ef4444', cursor: 'pointer', width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem' }}>×</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Cart footer / totals bar */}
                  <div style={{ padding: '13px 18px', background: 'linear-gradient(135deg,#c41e3a 0%,#8b0000 100%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                      {isMember && cartData.totalBV > 0 && <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.82rem' }}>BV: <strong style={{ color: '#fbbf24' }}>{cartData.totalBV.toFixed(1)}</strong></div>}
                      {!isMember && branchProfit > 0 && <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.82rem' }}>Profit: <strong style={{ color: '#86efac' }}>{formatCurrency(branchProfit)}</strong></div>}
                      <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>Total: <span style={{ color: '#ffd0d8' }}>{formatCurrency(cartData.totalAmount)}</span></div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={closeModal} style={{ padding: '9px 16px', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 10, background: 'transparent', color: 'rgba(255,255,255,0.65)', cursor: 'pointer', fontSize: '0.84rem' }}>Cancel</button>
                      <button type="button" onClick={wiReviewSale} style={{ padding: '9px 22px', border: 'none', borderRadius: 10, background: '#fff', color: '#c41e3a', fontWeight: 800, cursor: 'pointer', fontSize: '0.88rem', boxShadow: '0 3px 12px rgba(0,0,0,0.2)', letterSpacing: '0.01em' }}>
                        Review Sale →
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.72)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(3px)' }}>
          <div style={{ maxWidth: 620, width: '100%', borderRadius: 22, overflow: 'hidden', background: '#fff', boxShadow: '0 30px 80px rgba(196,30,58,0.25)' }}>

            {/* Confirm header — red */}
            <div style={{ background: 'linear-gradient(135deg,#c41e3a 0%,#8b0000 100%)', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>Confirm Sale</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', marginTop: 2 }}>Review details before processing payment</div>
              </div>
              <button onClick={() => setShowConfirmModal(false)} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            <div style={{ padding: '20px', maxHeight: '68vh', overflowY: 'auto', background: '#fdf7f8' }}>
              {error && <div style={{ background: '#fff0f3', border: '1px solid #fecaca', color: '#c41e3a', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: '0.82rem', fontWeight: 500 }}>{error}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                {/* Customer card */}
                <div style={{ background: '#fff', borderRadius: 14, padding: '15px', border: '1.5px solid #f0e8ea', boxShadow: '0 2px 8px rgba(196,30,58,0.06)' }}>
                  <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '.12em', color: '#c41e3a', textTransform: 'uppercase', marginBottom: 8 }}>Customer</div>
                  <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.97rem' }}>{isMember ? selectedReg?.name : newName}</div>
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 800, background: isMember ? '#fff0f3' : '#fffbeb', color: isMember ? '#c41e3a' : '#92400e', border: `1px solid ${isMember ? '#fecaca' : '#fcd34d'}` }}>
                      {isMember ? '🏅 Member' : '👤 Walk-in'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {isMember ? (selectedReg?.nb_number ? `NB#${selectedReg.nb_number}` : '') : (newPhone || '')}
                    </span>
                  </div>
                  {!isMember && (selectedReferral || noReferral) && (
                    <div style={{ marginTop: 8, padding: '5px 9px', background: '#fffbeb', borderRadius: 7, border: '1px solid #fcd34d', fontSize: '0.77rem', color: '#92400e' }}>
                      Referral: <strong>{selectedReferral?.name || DEFAULT_REFERRAL.name}</strong>
                      {selectedReferral?.nb_number && <span style={{ color: '#d97706', marginLeft: 4 }}>({selectedReferral.nb_number})</span>}
                    </div>
                  )}
                </div>

                {/* Payment card */}
                <div style={{ background: '#fff', borderRadius: 14, padding: '15px', border: '1.5px solid #f0e8ea', boxShadow: '0 2px 8px rgba(196,30,58,0.06)' }}>
                  <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '.12em', color: '#c41e3a', textTransform: 'uppercase', marginBottom: 8 }}>Payment</div>
                  <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>
                    {paymentMethods.find(m => m.id === paymentMethod)?.icon} {paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)}
                  </div>
                  <div style={{ marginTop: 10, padding: '10px 13px', background: 'linear-gradient(135deg,#c41e3a,#8b0000)', borderRadius: 10 }}>
                    <div style={{ color: '#ffd0d8', fontWeight: 900, fontSize: '1.3rem' }}>{formatCurrency(cartData.totalAmount)}</div>
                    {isMember && <div style={{ color: '#fbbf24', fontSize: '0.72rem', marginTop: 2 }}>{cartData.totalBV.toFixed(1)} BV earned</div>}
                    {!isMember && branchProfit > 0 && <div style={{ color: '#86efac', fontSize: '0.72rem', marginTop: 2 }}>Branch profit: {formatCurrency(branchProfit)}</div>}
                  </div>
                </div>
              </div>

              {/* Items list */}
              <div style={{ background: '#fff', borderRadius: 14, padding: '15px', border: '1.5px solid #f0e8ea', marginBottom: 12, boxShadow: '0 2px 8px rgba(196,30,58,0.04)' }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '.12em', color: '#c41e3a', textTransform: 'uppercase', marginBottom: 10 }}>Items ({cart.length})</div>
                <div style={{ maxHeight: 175, overflowY: 'auto' }}>
                  {cartData.items.map((item, i) => {
                    const lineProfit = !isMember ? ((item.cp || 0) - (item.dp || 0)) * item.qty : null;
                    return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < cartData.items.length - 1 ? '1px solid #fdf5f5' : 'none', fontSize: '0.86rem' }}>
                        <div>
                          <span style={{ fontWeight: 700, color: '#1e293b' }}>{item.name || item.description}</span>
                          <span style={{ color: '#94a3b8', marginLeft: 5 }}>×{item.qty}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, color: '#c41e3a' }}>{formatCurrency(item.lineTotal)}</div>
                          {lineProfit != null && lineProfit > 0 && <div style={{ fontSize: '0.72rem', color: '#0891b2' }}>+{formatCurrency(lineProfit)} profit</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Non-member receipt notice */}
              {!isMember && (
                <div style={{ background: 'linear-gradient(135deg,#fff0f3,#ffe4e8)', borderRadius: 13, padding: '13px 16px', border: '1.5px solid #fecaca' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#9b1c2e', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Non-Member Sale Summary</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: 9, padding: '9px 6px', border: '1px solid #fecaca' }}>
                      <div style={{ fontSize: '0.65rem', color: '#c41e3a', marginBottom: 3, fontWeight: 700 }}>Customer Pays</div>
                      <div style={{ fontWeight: 900, color: '#8b0000', fontSize: '0.95rem' }}>{formatCurrency(cartData.totalAmount)}</div>
                    </div>
                    <div style={{ background: '#fff', borderRadius: 9, padding: '9px 6px', border: '1px solid #fecaca' }}>
                      <div style={{ fontSize: '0.65rem', color: '#c41e3a', marginBottom: 3, fontWeight: 700 }}>Branch Profit</div>
                      <div style={{ fontWeight: 900, color: '#166534', fontSize: '0.95rem' }}>{formatCurrency(branchProfit)}</div>
                    </div>
                    <div style={{ background: '#fff', borderRadius: 9, padding: '9px 6px', border: '1px solid #fecaca' }}>
                      <div style={{ fontSize: '0.65rem', color: '#d97706', marginBottom: 3, fontWeight: 700 }}>Distributor BV</div>
                      <div style={{ fontWeight: 900, color: '#8b0000', fontSize: '0.95rem' }}>{cartData.totalBV.toFixed(1)}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 10, fontSize: '0.73rem', color: '#9b1c2e', textAlign: 'center', fontWeight: 600 }}>🧾🧾 Two receipts will print: Customer copy → Staff/Distributor copy</div>
                </div>
              )}
            </div>

            {/* Action footer */}
            <div style={{ padding: '14px 24px', background: '#fff', borderTop: '1px solid #f0e8ea', display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center' }}>
              <button type="button" onClick={() => setShowConfirmModal(false)} style={{ padding: '10px 20px', border: '1.5px solid #e8d5d8', borderRadius: 11, background: '#fff', cursor: 'pointer', color: '#64748b', fontSize: '0.88rem', fontWeight: 600 }}>← Edit Sale</button>
              <button type="button" onClick={completeSale} disabled={submitting}
                style={{ padding: '11px 32px', border: 'none', borderRadius: 11, background: 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '0.92rem', opacity: submitting ? 0.65 : 1, boxShadow: '0 4px 14px rgba(196,30,58,0.35)', letterSpacing: '0.01em' }}>
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
  const [consultFeeMode, setConsultFeeMode] = useState({});
  const [consultFeePaid, setConsultFeePaid] = useState({});

  useEffect(() => {
    api.reports.list()
      .then(d => setReports(Array.isArray(d) ? d : d.reports || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const getConsultMode = (reportId) => consultFeeMode[reportId] || 'separate';
  const setConsultMode = (reportId, mode) => setConsultFeeMode(prev => ({ ...prev, [reportId]: mode }));
  const isConsultPaid = (reportId) => !!consultFeePaid[reportId];
  const toggleConsultPaid = (reportId) => setConsultFeePaid(prev => ({ ...prev, [reportId]: !prev[reportId] }));

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

  const printPrescriptionPDF = (report, consultMode) => {
    const meds = getMedicines(report);
    const membershipStatus = report.membership_status || 'referred';
    const isMember = membershipStatus === 'member';
    const consultFee = getConsultationFee(membershipStatus);
    const totals = calculatePrescriptionTotals(meds, membershipStatus);
    const isInclusive = consultMode === 'inclusive';
    const medTotal = isMember ? totals.total.dp : totals.total.cp;
    const grandTotal = medTotal + (isInclusive ? consultFee.total : 0);
    const dateStr = new Date(report.created_at || report.date || Date.now()).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
    const branchInfo = BRANCH_DETAILS.find(b => b.name === (user?.branch || '')) || {};

    const rows = meds.map(m => {
      const p = getEffectivePrice(m.name);
      return `<tr style="border-bottom:1px solid #eee;">
        <td style="padding:8px 10px;">${m.name}${p.isPackage ? ' <span style="font-size:10px;background:#e8f5e9;color:#27ae60;padding:1px 5px;border-radius:3px;">Package</span>' : ''}</td>
        <td style="padding:8px 10px;text-align:center;">${m.dispensed ? '<span style="color:#27ae60;">✅ Dispensed</span>' : '<span style="color:#e67e22;">⏳ Pending</span>'}</td>
        ${isMember ? `<td style="padding:8px 10px;text-align:right;">N$ ${p.dp}</td><td style="padding:8px 10px;text-align:right;color:#e67e22;">${p.bv}</td>` : `<td style="padding:8px 10px;text-align:right;">N$ ${p.cp}</td>`}
      </tr>`;
    }).join('');

    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(`<!DOCTYPE html><html><head><title>Prescription Quote — ${report.client_name || report.id}</title>
    <style>
      @media print { body { margin:0; } @page { size:A4; margin:15mm; } .no-print{display:none;} }
      * { box-sizing:border-box; }
      body { font-family:Arial,sans-serif; font-size:12px; color:#333; margin:20px; }
      .header { text-align:center; padding-bottom:16px; margin-bottom:20px; border-bottom:3px solid #c41e3a; }
      .logo { height:55px; margin-bottom:6px; }
      .co-name { color:#c41e3a; font-size:18px; font-weight:bold; margin:0; }
      .co-tag { color:#888; font-size:11px; margin:2px 0; }
      .rx-title { background:#c41e3a; color:white; font-size:14px; font-weight:bold; letter-spacing:2px; padding:5px 20px; border-radius:20px; display:inline-block; margin-top:8px; }
      .patient-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 24px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px; margin-bottom:18px; }
      .patient-grid .field { font-size:11px; color:#64748b; }
      .patient-grid .value { font-weight:bold; color:#1e293b; font-size:12px; }
      table { width:100%; border-collapse:collapse; margin-bottom:16px; }
      thead tr { background:#1e3a5f; }
      thead th { color:white; padding:9px 10px; text-align:left; font-size:11px; font-weight:600; letter-spacing:0.5px; }
      tbody tr:nth-child(even) { background:#f8fafc; }
      .consult-box { border:2px solid #f59e0b; border-radius:8px; padding:14px; background:#fffbeb; margin-bottom:16px; }
      .consult-title { font-weight:bold; color:#92400e; font-size:13px; margin-bottom:6px; }
      .consult-row { display:flex; justify-content:space-between; font-size:11px; color:#78350f; padding:2px 0; }
      .summary-box { background:#0f172a; color:white; border-radius:8px; padding:16px 20px; margin-bottom:20px; }
      .sum-row { display:flex; justify-content:space-between; font-size:12px; padding:3px 0; color:rgba(255,255,255,0.8); }
      .sum-row.total { font-size:15px; font-weight:bold; color:#4ade80; border-top:1px solid rgba(255,255,255,0.2); padding-top:8px; margin-top:4px; }
      .sig { margin-top:40px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:30px; }
      .sig-line { border-top:1px solid #aaa; padding-top:4px; font-size:10px; color:#666; text-align:center; }
      .print-btn { background:#1e3a5f; color:white; border:none; padding:10px 24px; border-radius:8px; font-size:13px; cursor:pointer; margin-bottom:16px; }
    </style></head><body>
    <button class="no-print print-btn" onclick="window.print()">🖨️ Print PDF</button>
    <div class="header">
      <img class="logo" src="${COMPANY_INFO.logo}" onerror="this.style.display='none'" />
      <div class="co-name">${COMPANY_INFO.name}</div>
      <div class="co-tag">${COMPANY_INFO.tagline}</div>
      ${branchInfo.name ? `<div style="font-size:11px;color:#555;margin-top:2px;">${branchInfo.name} Branch${branchInfo.address ? ' · ' + branchInfo.address : ''}</div>` : ''}
      <div class="rx-title">PRESCRIPTION QUOTE</div>
    </div>

    <div class="patient-grid">
      <div><div class="field">Patient Name</div><div class="value">${report.client_name || report.full_name || '—'}</div></div>
      <div><div class="field">Prescription #</div><div class="value">${report.id}</div></div>
      <div><div class="field">Membership</div><div class="value">${isMember ? '🏅 Member (DP Price)' : '👤 Non-Member (CP Price)'}</div></div>
      <div><div class="field">Date</div><div class="value">${dateStr}</div></div>
      <div><div class="field">Consultant</div><div class="value">${report.consultant || '—'}</div></div>
      <div><div class="field">Branch</div><div class="value">${user?.branch || '—'}</div></div>
    </div>

    <table>
      <thead><tr>
        <th>Prescribed Item</th>
        <th style="text-align:center;">Status</th>
        <th style="text-align:right;">${isMember ? 'DP Price' : 'CP Price'}</th>
        ${isMember ? '<th style="text-align:right;">BV</th>' : ''}
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr style="background:#f1f5f9;font-weight:bold;">
        <td colspan="2" style="padding:9px 10px;">Medicines Subtotal</td>
        <td style="padding:9px 10px;text-align:right;">N$ ${medTotal}</td>
        ${isMember ? `<td style="padding:9px 10px;text-align:right;color:#e67e22;">${totals.total.bv}</td>` : ''}
      </tr></tfoot>
    </table>

    <div class="consult-box">
      <div class="consult-title">💼 Consultation Fee — ${consultFee.label}</div>
      <div class="consult-row"><span>Total Consultation Fee:</span><span style="font-weight:bold;font-size:14px;">N$ ${consultFee.total}</span></div>
      <div class="consult-row" style="margin-top:4px;"><span>• Credited to Consultant:</span><span>N$ ${consultFee.consultantCredit}</span></div>
      ${!isMember ? `<div class="consult-row"><span>• Credited to Referral Distributor:</span><span>N$ ${consultFee.referralCredit}</span></div>` : ''}
      <div style="margin-top:8px;font-size:11px;color:#b45309;font-style:italic;">
        ${isInclusive ? '✅ Consultation fee is included in the Grand Total below.' : '⚠️ Consultation fee is billed separately from medicine total.'}
      </div>
    </div>

    <div class="summary-box">
      <div class="sum-row"><span>Medicines Subtotal:</span><span>N$ ${medTotal}</span></div>
      ${isMember ? `<div class="sum-row"><span>BV Earned:</span><span style="color:#fbbf24;">${totals.total.bv} BV</span></div>` : ''}
      <div class="sum-row"><span>Consultation Fee (${isInclusive ? 'inclusive' : 'separate'}):</span><span>N$ ${consultFee.total}</span></div>
      <div class="sum-row total"><span>GRAND TOTAL${isInclusive ? '' : ' (medicines only)'}:</span><span>N$ ${grandTotal}</span></div>
    </div>

    <div class="sig">
      <div class="sig-line">Dispensed by: ___________________</div>
      <div class="sig-line">Patient / Guardian Signature</div>
      <div class="sig-line">Date: ___________________________</div>
    </div>
    <script>/* auto-print removed so user can review first */<\/script>
    </body></html>`);
    w.document.close();
  };

  const printPrescriptionReceipt = (report, consultMode, copyType) => {
    const meds = getMedicines(report);
    const membershipStatus = report.membership_status || 'referred';
    const isMember = membershipStatus === 'member';
    const consultFee = getConsultationFee(membershipStatus);
    const totals = calculatePrescriptionTotals(meds, membershipStatus);
    const isInclusive = consultMode === 'inclusive';
    const medTotal = isMember ? totals.total.dp : totals.total.cp;

    const items = meds.map(m => {
      const p = getEffectivePrice(m.name);
      const price = isMember ? p.dp : p.cp;
      return { product_name: m.name, quantity: 1, unit_price: price, line_total: price, bv: p.bv, lineBV: p.bv };
    });

    if (isInclusive) {
      items.push({ product_name: `Consultation Fee (${consultFee.label})`, quantity: 1, unit_price: consultFee.total, line_total: consultFee.total, bv: 0, lineBV: 0 });
    }

    const totalAmount = items.reduce((s, it) => s + it.line_total, 0);
    const totalBV = totals.total.bv;

    const commonParams = {
      receiptNumber: report.id || ('RX-' + Date.now()),
      branch: user?.branch || '',
      items,
      totalAmount,
      totalBV,
      paymentMethod: 'Prescription',
      customerType: isMember ? 'member' : 'non_member',
      customerName: report.client_name || report.full_name || 'Patient',
      nbNumber: report.nb_number || null,
      cashier: user?.full_name || user?.username || null,
    };

    if (isMember) {
      printReceipt(generateReceiptHTML({ ...commonParams, showBV: true }));
    } else {
      if (copyType === 'customer' || copyType === 'both') {
        printReceipt(generateReceiptHTML({ ...commonParams, showBV: false, copyType: 'customer' }));
      }
      if (copyType === 'staff' || copyType === 'both') {
        const delay = copyType === 'both' ? 900 : 0;
        setTimeout(() => {
          const branchProfit = meds.reduce((s, m) => {
            const p = getEffectivePrice(m.name);
            return s + ((p.cp || 0) - (p.dp || 0));
          }, 0);
          printReceipt(generateReceiptHTML({
            ...commonParams,
            showBV: true,
            copyType: 'staff',
            branchProfit,
            distributorBV: totalBV,
          }));
        }, delay);
      }
    }
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
    if (rxGroupTab === 'recent') { if (new Date(r.created_at || r.date || 0) < sevenDaysAgo) return false; }
    if (rxGroupTab === 'partial') { const d = meds.filter(m => m.dispensed).length; if (d === 0 || d === meds.length) return false; }
    if (rxGroupTab === 'full') { if (!meds.every(m => m.dispensed)) return false; }
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
      <div className="flex items-center justify-between mb-5 p-5 rounded-2xl text-white" style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)', boxShadow: '0 4px 20px rgba(15,23,42,0.25)' }}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl" style={{ background: 'rgba(255,255,255,0.12)' }}>💊</div>
          <div>
            <h3 className="text-xl font-bold m-0">Prescription Dispensing</h3>
            <p className="text-sm m-0" style={{ color: 'rgba(255,255,255,0.6)' }}>{user?.branch ? `${user.branch} Branch` : 'Branch'} · Dispense, track and quote</p>
          </div>
        </div>
        <button onClick={refreshDispenserData} className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl cursor-pointer" style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}>↻ Refresh</button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { id: 'all', label: 'All', icon: '💊', activeBg: '#1e40af', border: '#93c5fd', bg: '#eff6ff', color: '#1e40af' },
          { id: 'recent', label: 'Recent (7 days)', icon: '🕐', activeBg: '#059669', border: '#6ee7b7', bg: '#ecfdf5', color: '#065f46' },
          { id: 'partial', label: 'Partially Dispensed', icon: '⏳', activeBg: '#d97706', border: '#fcd34d', bg: '#fffbeb', color: '#92400e' },
          { id: 'full', label: 'Fully Dispensed', icon: '✅', activeBg: '#16a34a', border: '#86efac', bg: '#f0fdf4', color: '#166534' },
        ].map(tab => {
          const isActive = rxGroupTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setRxGroupTab(tab.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: `2px solid ${isActive ? tab.activeBg : tab.border}`, borderRadius: 10, background: isActive ? tab.activeBg : tab.bg, color: isActive ? '#fff' : tab.color, cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', transition: 'all .15s', boxShadow: isActive ? `0 3px 10px ${tab.activeBg}55` : 'none' }}>
              {tab.icon} {tab.label}
              <span style={{ padding: '1px 6px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 700, background: isActive ? 'rgba(255,255,255,0.25)' : tab.activeBg, color: '#fff' }}>{groupCounts[tab.id]}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl p-4 mb-4" style={{ background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div className="flex gap-2 flex-wrap mb-3">
          <input type="text" placeholder="Search by name, report ID or consultant…" value={rxSearch} onChange={e => setRxSearch(e.target.value)}
            className="flex-1 text-sm rounded-lg px-3 py-2.5" style={{ minWidth: 200, border: '1.5px solid #e2e8f0' }} />
          <button onClick={refreshDispenserData} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white cursor-pointer border-none" style={{ background: '#16a34a' }}>🔍 Search</button>
          <button onClick={clearRxFilters} className="px-4 py-2.5 rounded-lg text-sm font-medium cursor-pointer border-none" style={{ background: '#f1f5f9', color: '#64748b' }}>♻️ Clear</button>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <select value={rxBranchFilter} onChange={e => setRxBranchFilter(e.target.value)} className="text-sm rounded-lg px-3 py-2" style={{ border: '1.5px solid #e2e8f0' }}>
            <option value="">All Branches</option>
            {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={rxStatusFilter} onChange={e => setRxStatusFilter(e.target.value)} className="text-sm rounded-lg px-3 py-2" style={{ border: '1.5px solid #e2e8f0' }}>
            <option value="all">All Status</option>
            <option value="pending">⏳ Pending</option>
            <option value="dispensed">✅ Dispensed</option>
            <option value="paid">💰 Paid</option>
            <option value="outstanding">⚠️ Outstanding</option>
          </select>
          <input type="date" value={rxFromDate} onChange={e => setRxFromDate(e.target.value)} className="text-sm rounded-lg px-3 py-2" style={{ border: '1.5px solid #e2e8f0' }} />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={rxToDate} onChange={e => setRxToDate(e.target.value)} className="text-sm rounded-lg px-3 py-2" style={{ border: '1.5px solid #e2e8f0' }} />
        </div>
      </div>

      {alert && <div className="p-3 mb-3 rounded-lg text-sm" style={{ background: alert.type === 'success' ? '#dcfce7' : '#fee2e2', color: alert.type === 'success' ? '#166534' : '#991b1b' }}>{alert.message}</div>}

      {filteredReports.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">💊</div>
          <h3 className="text-lg font-semibold text-gray-500 mb-1">No prescriptions found</h3>
          <p className="text-sm">Prescriptions appear here once consultants create health reports.</p>
        </div>
      ) : filteredReports.map(report => {
        const medicines = getMedicines(report);
        const pendingCount = medicines.filter(m => !m.dispensed).length;
        const dispensedCount = medicines.filter(m => m.dispensed).length;
        const total = medicines.length;
        const pct = total > 0 ? Math.round((dispensedCount / total) * 100) : 0;
        const membershipStatus = report.membership_status || 'referred';
        const isMember = membershipStatus === 'member';
        const consultFee = getConsultationFee(membershipStatus);
        const totals = calculatePrescriptionTotals(medicines, membershipStatus);
        const consultMode = getConsultMode(report.id);
        const isInclusive = consultMode === 'inclusive';
        const medTotal = isMember ? totals.total.dp : totals.total.cp;
        const grandTotal = medTotal + (isInclusive ? consultFee.total : 0);
        const allDispensed = pendingCount === 0 && total > 0;
        const headerGradient = allDispensed
          ? 'linear-gradient(135deg,#166534,#16a34a)'
          : pendingCount < total
            ? 'linear-gradient(135deg,#92400e,#d97706)'
            : 'linear-gradient(135deg,#1e3a5f,#2980b9)';

        return (
          <div key={report.id} className="rounded-2xl overflow-hidden mb-5" style={{ background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.07)' }}>

            <div className="p-5 text-white" style={{ background: headerGradient }}>
              <div className="flex justify-between items-start gap-3">
                <div>
                  <div className="text-xs font-bold tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.6)', letterSpacing: '0.12em' }}>PRESCRIPTION</div>
                  <div className="text-xl font-bold">{report.id}</div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ background: 'rgba(255,255,255,0.18)' }}>👤 {report.client_name || report.full_name || 'Patient'}</span>
                    {isMember
                      ? <span className="text-xs px-3 py-1 rounded-full font-bold" style={{ background: 'rgba(99,220,143,0.3)', color: '#d1fae5' }}>🏅 Member</span>
                      : <span className="text-xs px-3 py-1 rounded-full font-bold" style={{ background: 'rgba(251,191,36,0.3)', color: '#fef3c7' }}>👤 Non-Member</span>}
                    <span className="text-xs px-3 py-1 rounded-full" style={{ background: allDispensed ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.15)' }}>
                      {allDispensed ? `✅ All dispensed` : `⏳ ${pendingCount} pending`}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>{new Date(report.created_at || report.date || Date.now()).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.65)' }}>By: {report.consultant || 'Consultant'}</div>
                  <div className="text-xs mt-2 font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>{dispensedCount}/{total} dispensed</div>
                </div>
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  <span>Dispensing progress</span><span>{pct}%</span>
                </div>
                <div className="rounded-full overflow-hidden" style={{ height: 6, background: 'rgba(255,255,255,0.2)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? '#4ade80' : '#fbbf24' }} />
                </div>
              </div>
            </div>

            <div className="p-5">

              <div className="mb-4">
                <div className="text-xs font-bold tracking-widest mb-3" style={{ color: '#94a3b8', letterSpacing: '0.12em' }}>PRESCRIBED MEDICINES</div>
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #f1f5f9' }}>
                  {medicines.map((med, i) => {
                    const price = getEffectivePrice(med.name);
                    const unitPrice = isMember ? price.dp : price.cp;
                    return (
                      <div key={i} style={{ borderBottom: i < medicines.length - 1 ? '1px solid #f8fafc' : 'none', padding: '12px 14px', background: med.dispensed ? '#f0fdf4' : '#fff' }}>
                        <div className="flex items-start gap-3">
                          <input type="checkbox" checked={!!med.dispensed} onChange={() => toggleDispense(report.id, i)}
                            style={{ width: 18, height: 18, marginTop: 2, accentColor: '#16a34a', cursor: 'pointer', flexShrink: 0 }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm" style={{ color: med.dispensed ? '#16a34a' : '#1e293b', textDecoration: med.dispensed ? 'line-through' : 'none' }}>
                                {med.name}
                              </span>
                              {price.isPackage && <span className="text-xs px-2 py-0.5 rounded-md font-medium" style={{ background: '#dbeafe', color: '#1e40af' }}>📦 Package</span>}
                              {med.dispensed && <span className="text-xs font-bold" style={{ color: '#16a34a' }}>✅ Dispensed</span>}
                            </div>
                            <div className="flex items-center gap-4 mt-1">
                              <span className="text-sm font-bold" style={{ color: '#16a34a' }}>
                                {isMember ? `DP: N$ ${price.dp}` : `CP: N$ ${price.cp}`}
                              </span>
                              {isMember && price.bv > 0 && <span className="text-xs font-semibold" style={{ color: '#f59e0b' }}>{price.bv} BV</span>}
                            </div>
                            {price.isPackage && price.products && (
                              <div className="mt-2 rounded-lg p-2 text-xs" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                {price.products.map((pp, pi) => (
                                  <div key={pi} className="flex justify-between py-0.5" style={{ color: '#64748b' }}>
                                    <span>{pp.name} ×{pp.quantity}</span>
                                    <span>{isMember ? `DP: N$${pp.dp}` : `CP: N$${pp.cp}`}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {med.dispensed && (
                              <label className="flex items-center gap-2 mt-2 cursor-pointer" style={{ display: 'inline-flex' }}>
                                <input type="checkbox" checked={!!med.paid} onChange={() => togglePayment(report.id, i)}
                                  style={{ width: 15, height: 15, accentColor: '#2563eb' }} />
                                <span className="text-xs font-semibold" style={{ color: med.paid ? '#2563eb' : '#94a3b8' }}>
                                  {med.paid ? '💰 Payment received' : '⏳ Payment pending'}
                                </span>
                              </label>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-bold text-sm" style={{ color: '#1e293b' }}>N$ {unitPrice}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl p-4 mb-4" style={{ background: '#fffbeb', border: '2px solid #fcd34d' }}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">💼</span>
                  <div>
                    <div className="font-bold text-sm" style={{ color: '#92400e' }}>{consultFee.label}</div>
                    <div className="text-xs" style={{ color: '#b45309' }}>{consultFee.note}</div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-xl font-black" style={{ color: '#92400e' }}>N$ {consultFee.total}</div>
                  </div>
                </div>
                <div className="flex gap-2 mb-3">
                  <button onClick={() => setConsultMode(report.id, 'separate')}
                    style={{ flex: 1, padding: '8px', borderRadius: 8, border: `2px solid ${!isInclusive ? '#f59e0b' : '#e2e8f0'}`, background: !isInclusive ? '#fef3c7' : '#fff', color: !isInclusive ? '#92400e' : '#64748b', fontWeight: !isInclusive ? 700 : 400, cursor: 'pointer', fontSize: '0.78rem', transition: 'all .15s' }}>
                    💳 Separate Payment
                  </button>
                  <button onClick={() => setConsultMode(report.id, 'inclusive')}
                    style={{ flex: 1, padding: '8px', borderRadius: 8, border: `2px solid ${isInclusive ? '#16a34a' : '#e2e8f0'}`, background: isInclusive ? '#f0fdf4' : '#fff', color: isInclusive ? '#166534' : '#64748b', fontWeight: isInclusive ? 700 : 400, cursor: 'pointer', fontSize: '0.78rem', transition: 'all .15s' }}>
                    ➕ Include in Total
                  </button>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={isConsultPaid(report.id)} onChange={() => toggleConsultPaid(report.id)}
                    style={{ width: 16, height: 16, accentColor: '#16a34a' }} />
                  <span className="text-xs font-semibold" style={{ color: isConsultPaid(report.id) ? '#16a34a' : '#b45309' }}>
                    {isConsultPaid(report.id) ? '✅ Consultation fee paid' : '⏳ Consultation fee unpaid'}
                  </span>
                </label>
              </div>

              <div className="rounded-xl p-4 mb-4" style={{ background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', color: '#fff' }}>
                <div className="text-xs font-bold tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '0.12em' }}>QUOTE SUMMARY</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span style={{ color: 'rgba(255,255,255,0.7)' }}>Medicines subtotal ({total} item{total !== 1 ? 's' : ''})</span>
                    <span className="font-bold">N$ {medTotal}</span>
                  </div>
                  {isMember && <div className="flex justify-between items-center">
                    <span style={{ color: 'rgba(255,255,255,0.7)' }}>Total BV earned</span>
                    <span className="font-bold" style={{ color: '#fbbf24' }}>{totals.total.bv} BV</span>
                  </div>}
                  <div className="flex justify-between items-center">
                    <span style={{ color: 'rgba(255,255,255,0.7)' }}>Consultation fee <span style={{ fontSize: '0.7rem', background: isInclusive ? '#16a34a44' : '#f59e0b44', padding: '1px 6px', borderRadius: 10, color: isInclusive ? '#4ade80' : '#fbbf24' }}>{isInclusive ? 'included' : 'separate'}</span></span>
                    <span className="font-semibold" style={{ color: isInclusive ? '#4ade80' : '#fbbf24' }}>N$ {consultFee.total}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
                    <span className="font-bold text-base">GRAND TOTAL {!isInclusive ? '(medicines)' : ''}</span>
                    <span className="text-xl font-black" style={{ color: '#4ade80' }}>N$ {grandTotal}</span>
                  </div>
                  {!isInclusive && <div className="text-xs pt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>+ N$ {consultFee.total} consultation fee billed separately</div>}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  {[
                    { label: 'Dispensed', val: isMember ? totals.dispensed.dp : totals.dispensed.cp, color: '#4ade80' },
                    { label: 'Paid', val: isMember ? totals.paid.dp : totals.paid.cp, color: '#60a5fa' },
                    { label: 'Outstanding', val: isMember ? totals.outstanding.dp : totals.outstanding.cp, color: '#f87171' },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="text-center rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.07)' }}>
                      <div className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</div>
                      <div className="font-bold text-sm" style={{ color }}>N$ {val}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 flex-wrap justify-end">
                <button onClick={() => printPrescriptionReceipt(report, consultMode, isMember ? 'member' : 'customer')}
                  style={{ padding: '8px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#374151', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                  🖨️ Thermal Receipt
                </button>
                {!isMember && (
                  <button onClick={() => printPrescriptionReceipt(report, consultMode, 'both')}
                    style={{ padding: '8px 14px', border: '1.5px solid #93c5fd', borderRadius: 8, background: '#eff6ff', color: '#1e40af', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                    🧾🧾 Both Receipts
                  </button>
                )}
                <button onClick={() => printPrescriptionPDF(report, consultMode)}
                  style={{ padding: '8px 14px', border: 'none', borderRadius: 8, background: 'linear-gradient(135deg,#c41e3a,#991b1b)', color: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, boxShadow: '0 2px 8px rgba(196,30,58,0.3)' }}>
                  📄 PDF Quote
                </button>
              </div>
            </div>
          </div>
        );
      })}
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

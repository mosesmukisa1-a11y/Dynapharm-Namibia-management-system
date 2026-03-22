import { useState, useEffect, useRef, useMemo } from 'react';
import { api } from '../../lib/api';
import DistributorPerformanceTab from '../../components/DistributorPerformanceTab';
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
    { id: 'distributorPerf', label: 'Distributor Performance', icon: '👥' },
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
        {activeTab === 'distributorPerf' && <DistributorPerformanceTabWrapper />}
      </div>
    </div>
  );
}

function DistributorPerformanceTabWrapper() {
  const { user } = useAuth();
  return <DistributorPerformanceTab branchFilter={user?.branch || null} title="Distributor Performance" />;
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
  const branchAmount = !isMember ? cartData.items.reduce((s, item) => s + (item.dp || 0) * item.qty, 0) : 0;

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
        dpPrice: item.dp || 0,
        cpPrice: item.cp || 0,
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
        printReceipt(generateReceiptHTML({
          ...commonReceiptParams,
          showBV: false,
          copyType: 'customer',
          cashback: 50,
        }));
        setTimeout(() => {
          printReceipt(generateReceiptHTML({
            ...commonReceiptParams,
            showBV: true,
            copyType: 'staff',
            branchProfit,
            distributorBV: cartData.totalBV,
            branchAmount,
            distributorProfit: branchProfit,
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

  const getConsultMode = (reportId, isMem = false) => consultFeeMode[reportId] || (isMem ? 'inclusive' : 'separate');
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
    const pdfBranchAmount = meds.reduce((s, m) => { const p = getEffectivePrice(m.name); return s + (p.dp || 0); }, 0);
    const pdfDistProfit = meds.reduce((s, m) => { const p = getEffectivePrice(m.name); return s + ((p.cp || 0) - (p.dp || 0)); }, 0);

    const rows = meds.map(m => {
      const p = getEffectivePrice(m.name);
      if (isMember) {
        return `<tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px 10px;">${m.name}${p.isPackage ? ' <span style="font-size:10px;background:#e8f5e9;color:#27ae60;padding:1px 5px;border-radius:3px;">Package</span>' : ''}</td>
          <td style="padding:8px 10px;text-align:center;">${m.dispensed ? '<span style="color:#27ae60;">✅ Dispensed</span>' : '<span style="color:#e67e22;">⏳ Pending</span>'}</td>
          <td style="padding:8px 10px;text-align:right;">N$ ${p.dp}</td>
          <td style="padding:8px 10px;text-align:right;color:#e67e22;">${p.bv}</td>
        </tr>`;
      } else {
        const distProfit = (p.cp || 0) - (p.dp || 0);
        return `<tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px 10px;">${m.name}${p.isPackage ? ' <span style="font-size:10px;background:#e8f5e9;color:#27ae60;padding:1px 5px;border-radius:3px;">Package</span>' : ''}</td>
          <td style="padding:8px 10px;text-align:center;">${m.dispensed ? '<span style="color:#27ae60;">✅ Dispensed</span>' : '<span style="color:#e67e22;">⏳ Pending</span>'}</td>
          <td style="padding:8px 10px;text-align:right;color:#1e40af;font-weight:600;">N$ ${p.dp}</td>
          <td style="padding:8px 10px;text-align:right;">N$ ${p.cp}</td>
          <td style="padding:8px 10px;text-align:right;color:#e67e22;">${p.bv > 0 ? p.bv : '—'}</td>
          <td style="padding:8px 10px;text-align:right;color:#16a34a;font-weight:600;">N$ ${distProfit}</td>
        </tr>`;
      }
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
        ${isMember
          ? `<th style="text-align:right;">DP Price</th><th style="text-align:right;">BV</th>`
          : `<th style="text-align:right;background:#1e40af;">DP (Branch)</th>
             <th style="text-align:right;">CP (Customer)</th>
             <th style="text-align:right;color:#fde68a;">BV</th>
             <th style="text-align:right;color:#86efac;">Dist. Profit</th>`
        }
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr style="background:#f1f5f9;font-weight:bold;">
        <td colspan="2" style="padding:9px 10px;">Medicines Subtotal</td>
        ${isMember
          ? `<td style="padding:9px 10px;text-align:right;">N$ ${medTotal}</td>
             <td style="padding:9px 10px;text-align:right;color:#e67e22;">${totals.total.bv}</td>`
          : `<td style="padding:9px 10px;text-align:right;color:#1e40af;">N$ ${pdfBranchAmount}</td>
             <td style="padding:9px 10px;text-align:right;">N$ ${medTotal}</td>
             <td style="padding:9px 10px;text-align:right;color:#e67e22;">${totals.total.bv}</td>
             <td style="padding:9px 10px;text-align:right;color:#16a34a;">N$ ${pdfDistProfit}</td>`
        }
      </tr></tfoot>
    </table>

    <div class="summary-box">
      <div class="sum-row"><span>Medicines Subtotal (${isMember ? 'DP' : 'CP'}):</span><span>N$ ${medTotal}</span></div>
      ${isMember
        ? `<div class="sum-row"><span>BV Earned:</span><span style="color:#fbbf24;">${totals.total.bv} BV</span></div>`
        : `<div class="sum-row"><span style="color:#93c5fd;">Branch Amount (DP):</span><span style="color:#93c5fd;font-weight:bold;">N$ ${pdfBranchAmount}</span></div>
           <div class="sum-row"><span style="color:#86efac;">Distributor Profit (CP−DP):</span><span style="color:#86efac;font-weight:bold;">N$ ${pdfDistProfit}</span></div>
           <div class="sum-row" style="font-size:10px;color:rgba(255,255,255,0.35);font-style:italic;"><span>* Distributor profit is off branch books</span></div>`
      }
      ${isInclusive
        ? `<div class="sum-row"><span>Consultation Fee (${consultFee.label}):</span><span style="color:#fbbf24;">N$ ${consultFee.total}</span></div>
           <div class="sum-row" style="font-size:10px;color:rgba(255,255,255,0.35);font-style:italic;"><span>* Consult fee collected but NOT in branch sales</span></div>`
        : `<div class="sum-row" style="color:rgba(255,255,255,0.5);font-size:11px;"><span>Consultation Fee (${consultFee.label}) — billed separately:</span><span>N$ ${consultFee.total}</span></div>`
      }
      <div class="sum-row total"><span>GRAND TOTAL (${isMember ? 'DP' : 'CP'}):</span><span>N$ ${grandTotal}</span></div>
    </div>

    ${!isMember ? `
    <div style="margin-bottom:20px;padding:14px;border-radius:8px;background:#fef3c7;border:2px solid #f59e0b;text-align:center;">
      <div style="font-size:16px;font-weight:900;color:#92400e;">🎁 N$50 CASHBACK</div>
      <div style="font-size:11px;color:#b45309;margin-top:4px;">Patient is entitled to N$50 cashback for this non-member purchase</div>
    </div>` : ''}

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
      return {
        product_name: m.name,
        quantity: 1,
        unit_price: price,
        line_total: price,
        bv: p.bv,
        lineBV: p.bv,
        dpPrice: p.dp || 0,
        cpPrice: p.cp || 0,
        lineProfit: !isMember ? ((p.cp || 0) - (p.dp || 0)) : null,
      };
    });

    if (isInclusive) {
      items.push({ product_name: `Consultation Fee (${consultFee.label})`, quantity: 1, unit_price: consultFee.total, line_total: consultFee.total, bv: 0, lineBV: 0, dpPrice: 0, cpPrice: 0, lineProfit: null });
    }

    const totalAmount = items.filter(it => it.product_name !== `Consultation Fee (${consultFee.label})` || isInclusive).reduce((s, it) => s + it.line_total, 0);
    const totalBV = totals.total.bv;
    const rxBranchAmount = meds.reduce((s, m) => { const p = getEffectivePrice(m.name); return s + (p.dp || 0); }, 0);
    const rxDistProfit = meds.reduce((s, m) => { const p = getEffectivePrice(m.name); return s + ((p.cp || 0) - (p.dp || 0)); }, 0);

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
        printReceipt(generateReceiptHTML({
          ...commonParams,
          showBV: false,
          copyType: 'customer',
          cashback: 50,
        }));
      }
      if (copyType === 'staff' || copyType === 'both') {
        const delay = copyType === 'both' ? 900 : 0;
        setTimeout(() => {
          printReceipt(generateReceiptHTML({
            ...commonParams,
            showBV: true,
            copyType: 'staff',
            branchProfit: rxDistProfit,
            distributorBV: totalBV,
            branchAmount: rxBranchAmount,
            distributorProfit: rxDistProfit,
            consultFeeAmount: consultFee.total,
            consultFeeMode: consultMode,
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
      <div className="flex items-center justify-between mb-5 p-5 rounded-2xl text-white" style={{ background: 'linear-gradient(135deg,#c41e3a 0%,#8b0000 100%)', boxShadow: '0 4px 20px rgba(196,30,58,0.28)' }}>
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
          { id: 'all', label: 'All', icon: '💊', activeBg: '#c41e3a', border: '#fecaca', bg: '#fff0f3', color: '#c41e3a' },
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
        const consultMode = getConsultMode(report.id, isMember);
        const isInclusive = consultMode === 'inclusive';
        const medTotal = isMember ? totals.total.dp : totals.total.cp;
        const grandTotal = medTotal + (isInclusive ? consultFee.total : 0);
        const allDispensed = pendingCount === 0 && total > 0;
        const headerGradient = allDispensed
          ? 'linear-gradient(135deg,#166534,#16a34a)'
          : pendingCount < total
            ? 'linear-gradient(135deg,#92400e,#d97706)'
            : 'linear-gradient(135deg,#c41e3a,#8b0000)';

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
                <div className="text-xs mt-2 px-2 py-1 rounded" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
                  ⚠️ Consultation fee is <strong>NOT counted</strong> in branch sales totals
                </div>
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
                  {!isMember && (() => {
                    const nm_branchAmt = medicines.reduce((s, m) => { const p = getEffectivePrice(m.name); return s + (p.dp || 0); }, 0);
                    const nm_distProfit = medicines.reduce((s, m) => { const p = getEffectivePrice(m.name); return s + ((p.cp || 0) - (p.dp || 0)); }, 0);
                    return (<>
                      <div className="flex justify-between items-center">
                        <span style={{ color: '#93c5fd' }}>Branch Amount (DP total)</span>
                        <span className="font-bold" style={{ color: '#93c5fd' }}>N$ {nm_branchAmt}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span style={{ color: '#86efac' }}>Distributor Profit (CP−DP)</span>
                        <span className="font-bold" style={{ color: '#86efac' }}>N$ {nm_distProfit}</span>
                      </div>
                      <div className="text-xs" style={{ color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>* Distributor profit is off branch books</div>
                    </>);
                  })()}
                  <div className="flex justify-between items-center">
                    <span style={{ color: 'rgba(255,255,255,0.7)' }}>Consultation fee <span style={{ fontSize: '0.7rem', background: isInclusive ? '#16a34a44' : '#f59e0b44', padding: '1px 6px', borderRadius: 10, color: isInclusive ? '#4ade80' : '#fbbf24' }}>{isInclusive ? 'included' : 'separate'}</span></span>
                    <span className="font-semibold" style={{ color: isInclusive ? '#4ade80' : '#fbbf24' }}>N$ {consultFee.total}</span>
                  </div>
                  <div className="text-xs" style={{ color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>* Consult fee not counted in branch sales</div>
                  <div className="flex justify-between items-center pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
                    <span className="font-bold text-base">GRAND TOTAL {!isInclusive ? '(medicines)' : ''}</span>
                    <span className="text-xl font-black" style={{ color: '#4ade80' }}>N$ {grandTotal}</span>
                  </div>
                  {!isInclusive && <div className="text-xs pt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>+ N$ {consultFee.total} consultation fee billed separately</div>}
                  {!isMember && <div className="flex justify-between items-center mt-1 px-2 py-1 rounded-lg" style={{ background: '#fef3c711', border: '1px solid #f59e0b44' }}>
                    <span style={{ color: '#fbbf24', fontSize: '0.8rem' }}>🎁 N$50 Cashback for non-member</span>
                    <span style={{ color: '#fbbf24', fontWeight: 700 }}>N$ 50</span>
                  </div>}
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
                {isMember ? (
                  <button onClick={() => printPrescriptionReceipt(report, consultMode, 'member')}
                    style={{ padding: '8px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#374151', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                    🖨️ Thermal Receipt
                  </button>
                ) : (<>
                  <button onClick={() => printPrescriptionReceipt(report, consultMode, 'customer')}
                    style={{ padding: '8px 14px', border: '1.5px solid #86efac', borderRadius: 8, background: '#f0fdf4', color: '#166534', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                    🧾 Customer Copy
                  </button>
                  <button onClick={() => printPrescriptionReceipt(report, consultMode, 'staff')}
                    style={{ padding: '8px 14px', border: '1.5px solid #fcd34d', borderRadius: 8, background: '#fffbeb', color: '#92400e', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                    📊 Distributor Copy
                  </button>
                  <button onClick={() => printPrescriptionReceipt(report, consultMode, 'both')}
                    style={{ padding: '8px 14px', border: '1.5px solid #93c5fd', borderRadius: 8, background: '#eff6ff', color: '#1e40af', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>
                    🧾🧾 Both Copies
                  </button>
                </>)}
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

// ─── PDF print helpers for reports ────────────────────────────────────────────
function printStockDocument(title, htmlBody, branch = '') {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; padding: 24px; }
    h1 { font-size: 16px; font-weight: 800; color: #c41e3a; margin-bottom: 2px; }
    h2 { font-size: 13px; font-weight: 700; color: #374151; margin-bottom: 12px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #c41e3a; padding-bottom: 10px; margin-bottom: 16px; }
    .company { color: #c41e3a; font-weight: 900; font-size: 15px; }
    .meta { text-align: right; color: #64748b; font-size: 10px; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #c41e3a; color: #fff; font-weight: 700; padding: 7px 8px; text-align: left; font-size: 10px; }
    td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; font-size: 10px; }
    tr:nth-child(even) td { background: #fdf7f8; }
    .total-row td { font-weight: 800; background: #fff0f3 !important; border-top: 2px solid #fecaca; }
    .badge { display:inline-block; padding: 1px 7px; border-radius: 20px; font-weight: 700; font-size: 9px; }
    .badge-red { background:#fef2f2; color:#c41e3a; border:1px solid #fecaca; }
    .badge-green { background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; }
    .badge-amber { background:#fffbeb; color:#92400e; border:1px solid #fcd34d; }
    .badge-blue { background:#eff6ff; color:#1e40af; border:1px solid #93c5fd; }
    .print-btn { position:fixed; top:12px; right:12px; background:#c41e3a; color:#fff; border:none; padding:8px 18px; border-radius:8px; font-weight:700; cursor:pointer; font-size:12px; }
    @media print { .print-btn { display:none; } body { padding:10px; } }
  </style></head><body>
  <button class="print-btn" onclick="window.print()">🖨️ Print</button>
  <div class="header">
    <div><div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div><h1>${title}</h1><h2>${branch ? branch + ' Branch' : ''}</h2></div>
    <div class="meta">Date: ${new Date().toLocaleDateString('en-NA', {day:'2-digit',month:'long',year:'numeric'})}<br>Time: ${new Date().toLocaleTimeString('en-NA', {hour:'2-digit',minute:'2-digit'})}<br>Generated by: Branch Portal</div>
  </div>
  ${htmlBody}
  </body></html>`);
  win.document.close();
}

function printPhysicalStockReport(inventory, branch) {
  const rows = inventory.map(r => `<tr><td>${r.product_name||r.description||'-'}</td><td>${r.batch_no||r.batch_number||'-'}</td><td style="font-weight:700;color:${Number(r.quantity||0)<=0?'#c41e3a':Number(r.quantity||0)<10?'#d97706':'#166534'}">${r.quantity||0}</td><td>${r.unit_price?`N$ ${Number(r.unit_price).toFixed(2)}`:'-'}</td><td>${r.expiry_date?new Date(r.expiry_date).toLocaleDateString('en-NA'):'—'}</td></tr>`).join('');
  const total = inventory.reduce((s, r) => s + Number(r.quantity||0), 0);
  printStockDocument('Physical Stock Report', `<table><thead><tr><th>Product</th><th>Batch</th><th>Qty</th><th>Unit Price</th><th>Expiry</th></tr></thead><tbody>${rows}<tr class="total-row"><td colspan="2"><strong>TOTAL ITEMS</strong></td><td><strong>${total}</strong></td><td colspan="2"></td></tr></tbody></table>`, branch);
}

function printStockMovementsReport(movements, branch) {
  const rows = movements.map(r => `<tr><td>${r.product_name||'-'}</td><td>${(r.movement_type||'').replace(/_/g,' ')}</td><td>${r.quantity||0}</td><td>${r.source_location||'-'}</td><td>${r.destination_location||'-'}</td><td>${r.created_at?new Date(r.created_at).toLocaleDateString('en-NA'):'-'}</td></tr>`).join('');
  printStockDocument('Stock Movements Report', `<table><thead><tr><th>Product</th><th>Type</th><th>Qty</th><th>From</th><th>To</th><th>Date</th></tr></thead><tbody>${rows||'<tr><td colspan="6" style="text-align:center;color:#94a3b8">No movements recorded</td></tr>'}</tbody></table>`, branch);
}

function printReceivingStockReport(requests, branch) {
  const received = requests.filter(r => r.status === 'received' || r.status === 'approved' || r.status === 'dispatched');
  const rows = received.map(r => {
    const items = (() => { try { return typeof r.items === 'string' ? JSON.parse(r.items) : (r.items||[]); } catch { return []; } })();
    return `<tr><td>${r.request_number||r.id||'-'}</td><td>${r.requesting_branch||'-'}</td><td>${items.map(i=>`${i.product_name} ×${i.quantity}`).join(', ')||'-'}</td><td>${r.priority||'normal'}</td><td><span class="badge ${r.status==='received'?'badge-green':r.status==='approved'||r.status==='dispatched'?'badge-blue':'badge-amber'}">${r.status||'pending'}</span></td><td>${r.created_at?new Date(r.created_at).toLocaleDateString('en-NA'):'-'}</td></tr>`;
  }).join('');
  printStockDocument('Receiving Stock Report', `<table><thead><tr><th>Request #</th><th>Branch</th><th>Items</th><th>Priority</th><th>Status</th><th>Date</th></tr></thead><tbody>${rows||'<tr><td colspan="6" style="text-align:center;color:#94a3b8">No receiving records</td></tr>'}</tbody></table>`, branch);
}

function printSalesReportDoc(sales, period, branch, onlineOrders, prescriptions) {
  const now = new Date();
  const periodLabel = period === 'today' ? now.toDateString() : now.toLocaleDateString('en-NA', { month: 'long', year: 'numeric' });

  const inPeriod = (dateStr) => {
    const d = new Date(dateStr);
    return period === 'today'
      ? d.toDateString() === now.toDateString()
      : d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  };

  // Walk-in sales breakdown
  const filtered = (Array.isArray(sales) ? sales : []).filter(s => inPeriod(s.created_at || s.timestamp));
  const memberSales = filtered.filter(r => (r.customerType || r.customer_type) === 'member');
  const nonMemberSales = filtered.filter(r => (r.customerType || r.customer_type) !== 'member');
  const memberTotal = memberSales.reduce((s, r) => s + Number(r.total || r.totalAmount || r.total_amount || 0), 0);
  const nonMemberTotal = nonMemberSales.reduce((s, r) => s + Number(r.total || r.totalAmount || r.total_amount || 0), 0);
  const walkinTotal = memberTotal + nonMemberTotal;

  // Payment method breakdown
  const cashSales = filtered.filter(r => (r.paymentMethod || r.payment_method || '').toLowerCase().includes('cash'));
  const cardSales = filtered.filter(r => (r.paymentMethod || r.payment_method || '').toLowerCase().includes('card') || (r.paymentMethod || r.payment_method || '').toLowerCase().includes('eft'));
  const cashTotal = cashSales.reduce((s, r) => s + Number(r.total || r.total_amount || 0), 0);
  const cardTotal = cardSales.reduce((s, r) => s + Number(r.total || r.total_amount || 0), 0);

  // Online orders breakdown
  const filteredOnline = (Array.isArray(onlineOrders) ? onlineOrders : []).filter(o => inPeriod(o.created_at));
  const onlineMember = filteredOnline.filter(o => o.customer_type === 'member');
  const onlineNonMember = filteredOnline.filter(o => o.customer_type !== 'member');
  const onlineMemberTotal = onlineMember.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const onlineNonMemberTotal = onlineNonMember.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const onlineTotal = onlineMemberTotal + onlineNonMemberTotal;

  // Prescription sales
  const filteredRx = (Array.isArray(prescriptions) ? prescriptions : []).filter(p => inPeriod(p.created_at || p.updated_at));
  const rxMember = filteredRx.filter(p => p.membership_status === 'member' || p.customer_type === 'member');
  const rxNonMember = filteredRx.filter(p => p.membership_status !== 'member' && p.customer_type !== 'member');

  const grandTotal = walkinTotal + onlineTotal;

  const fmtC = n => `N$ ${Number(n || 0).toFixed(2)}`;
  const statCard = (label, value, sub, color) =>
    `<div style="background:#fff;border:1.5px solid #f0e8ea;border-radius:10px;padding:12px;text-align:center">
      <div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.06em">${label}</div>
      <div style="font-size:15px;font-weight:900;color:${color || '#c41e3a'};margin-top:4px">${value}</div>
      ${sub ? `<div style="font-size:9px;color:#94a3b8;margin-top:3px">${sub}</div>` : ''}
    </div>`;

  const sectionTitle = t => `<div style="font-size:10px;font-weight:800;color:#c41e3a;text-transform:uppercase;letter-spacing:.1em;border-bottom:2px solid #fecaca;padding-bottom:4px;margin:18px 0 10px">${t}</div>`;

  const tableRow = (cols, bold) => `<tr>${cols.map((c, i) => `<td style="${bold ? 'font-weight:800;background:#fff0f3;' : ''}${i === cols.length - 1 ? 'text-align:right;font-weight:700;color:#166534;' : ''}">${c}</td>`).join('')}</tr>`;

  const walkinRows = filtered.map(r => {
    const isM = (r.customerType || r.customer_type) === 'member';
    return `<tr>
      <td>${r.receipt_number || r.saleNumber || r.id || '-'}</td>
      <td><span style="color:${isM ? '#1d4ed8' : '#374151'};font-weight:600">${isM ? '👤 Member' : '🚶 Walk-in'}</span></td>
      <td>${r.distributor_name || r.customer_name || r.customerName || 'Walk-in'}</td>
      <td>${r.paymentMethod || r.payment_method || '-'}</td>
      <td style="font-weight:700;color:#166534;text-align:right">${fmtC(r.total || r.totalAmount || r.total_amount || 0)}</td>
      <td>${r.created_at ? new Date(r.created_at).toLocaleDateString('en-NA') : '-'}</td>
    </tr>`;
  }).join('');

  const onlineRows = filteredOnline.map(o => {
    const isM = o.customer_type === 'member';
    return `<tr>
      <td>${o.order_number || o.id || '-'}</td>
      <td><span style="color:${isM ? '#1d4ed8' : '#374151'};font-weight:600">${isM ? '👤 Member (DP)' : '🚶 Non-Member (CP)'}</span></td>
      <td>${o.customer_name || '-'}</td>
      <td>${o.payment_method || o.delivery_method || '-'}</td>
      <td style="font-weight:700;color:#166534;text-align:right">${fmtC(o.total_amount || 0)}</td>
      <td>${o.created_at ? new Date(o.created_at).toLocaleDateString('en-NA') : '-'}</td>
    </tr>`;
  }).join('');

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Sales Report — ${branch}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:Arial,sans-serif; font-size:11px; color:#1e293b; padding:24px; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #c41e3a; padding-bottom:10px; margin-bottom:16px; }
  .company { color:#c41e3a; font-weight:900; font-size:15px; }
  .grid-4 { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:14px; }
  .grid-5 { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; margin-bottom:14px; }
  table { width:100%; border-collapse:collapse; margin-top:4px; }
  th { background:#c41e3a; color:#fff; font-weight:700; padding:6px 8px; text-align:left; font-size:9.5px; }
  td { padding:5px 8px; border-bottom:1px solid #f1f5f9; font-size:9.5px; }
  tr:nth-child(even) td { background:#fdf7f8; }
  .total-row td { font-weight:800; background:#fff0f3 !important; border-top:2px solid #fecaca; }
  .meta { text-align:right; color:#64748b; font-size:10px; line-height:1.6; }
  .print-btn { position:fixed; top:12px; right:12px; background:#c41e3a; color:#fff; border:none; padding:8px 18px; border-radius:8px; font-weight:700; cursor:pointer; }
  @media print { .print-btn { display:none; } body { padding:10px; } }
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨️ Print / PDF</button>
<div class="header">
  <div>
    <div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div>
    <div style="font-size:14px;font-weight:800;color:#8b0000;margin-top:4px">📊 Sales Report — ${period === 'today' ? 'Daily' : 'Monthly'}</div>
    <div style="color:#64748b;font-size:10px;margin-top:3px">${branch} Branch &nbsp;·&nbsp; Period: ${periodLabel}</div>
  </div>
  <div class="meta">Date: ${now.toLocaleDateString('en-NA', { day: '2-digit', month: 'long', year: 'numeric' })}<br>Time: ${now.toLocaleTimeString('en-NA', { hour: '2-digit', minute: '2-digit' })}</div>
</div>

<div style="background:#fff0f3;border:1.5px solid #fecaca;border-radius:10px;padding:14px;margin-bottom:16px">
  <div style="font-size:12px;font-weight:900;color:#c41e3a;margin-bottom:10px">GRAND TOTAL REVENUE</div>
  <div class="grid-4">
    ${statCard('Walk-in Sales Total', fmtC(walkinTotal), `${filtered.length} transactions`, '#c41e3a')}
    ${statCard('Online Orders Total', fmtC(onlineTotal), `${filteredOnline.length} orders`, '#1e40af')}
    ${statCard('Prescription Sales', `${filteredRx.length} Rx`, `${rxMember.length} member · ${rxNonMember.length} non-member`, '#166534')}
    ${statCard('GRAND TOTAL', fmtC(grandTotal), 'Walk-in + Online', '#7c2d12')}
  </div>
</div>

${sectionTitle('Walk-in Sales Breakdown')}
<div class="grid-5">
  ${statCard('Member Sales', fmtC(memberTotal), `${memberSales.length} transactions`, '#1d4ed8')}
  ${statCard('Non-Member Sales', fmtC(nonMemberTotal), `${nonMemberSales.length} transactions`, '#374151')}
  ${statCard('Cash Payments', fmtC(cashTotal), `${cashSales.length} transactions`, '#166534')}
  ${statCard('Card / EFT', fmtC(cardTotal), `${cardSales.length} transactions`, '#0891b2')}
  ${statCard('Other Payments', fmtC(walkinTotal - cashTotal - cardTotal), `${filtered.length - cashSales.length - cardSales.length} transactions`, '#92400e')}
</div>
<table>
  <thead><tr><th>Receipt #</th><th>Customer Type</th><th>Customer</th><th>Payment</th><th style="text-align:right">Amount</th><th>Date</th></tr></thead>
  <tbody>${walkinRows || '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:12px">No walk-in sales in this period</td></tr>'}</tbody>
  ${filtered.length > 0 ? `<tfoot><tr class="total-row"><td colspan="3"><strong>WALK-IN TOTAL</strong></td><td></td><td style="text-align:right"><strong>${fmtC(walkinTotal)}</strong></td><td></td></tr></tfoot>` : ''}
</table>

${sectionTitle('Online Orders Breakdown')}
<div class="grid-4" style="margin-bottom:10px">
  ${statCard('Member Orders (DP)', fmtC(onlineMemberTotal), `${onlineMember.length} orders`, '#1d4ed8')}
  ${statCard('Non-Member Orders (CP)', fmtC(onlineNonMemberTotal), `${onlineNonMember.length} orders`, '#374151')}
  ${statCard('Total Orders', filteredOnline.length, '', '#c41e3a')}
  ${statCard('Online Revenue', fmtC(onlineTotal), '', '#166534')}
</div>
<table>
  <thead><tr><th>Order #</th><th>Customer Type</th><th>Customer</th><th>Method</th><th style="text-align:right">Amount</th><th>Date</th></tr></thead>
  <tbody>${onlineRows || '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:12px">No online orders in this period</td></tr>'}</tbody>
  ${filteredOnline.length > 0 ? `<tfoot><tr class="total-row"><td colspan="3"><strong>ONLINE TOTAL</strong></td><td></td><td style="text-align:right"><strong>${fmtC(onlineTotal)}</strong></td><td></td></tr></tfoot>` : ''}
</table>

${sectionTitle('Prescription Sales')}
<div class="grid-4" style="margin-bottom:10px">
  ${statCard('Total Prescriptions', filteredRx.length, 'Consultations', '#c41e3a')}
  ${statCard('Member Prescriptions', rxMember.length, 'N$150 consult fee', '#1d4ed8')}
  ${statCard('Non-Member Prescriptions', rxNonMember.length, 'N$200 consult fee', '#374151')}
  ${statCard('Consult Fee Revenue', fmtC(rxMember.length * 150 + rxNonMember.length * 200), 'estimated', '#166534')}
</div>
${filteredRx.length === 0 ? '<p style="color:#94a3b8;text-align:center;padding:12px">No prescriptions in this period</p>' : ''}

</body></html>`);
  win.document.close();
}
function printStockFormulaReport(inventory, movements, sales, branch) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodLabel = now.toLocaleDateString('en-NA', { month: 'long', year: 'numeric' });

  // Compute formula components from movements
  const movsPeriod = movements.filter(m => m.created_at && new Date(m.created_at) >= monthStart);
  const received = movsPeriod.filter(m => (m.movement_type||'').includes('received') || (m.type||'').includes('receive')).reduce((s, m) => s + Number(m.quantity||0), 0);
  const returns_ = movsPeriod.filter(m => (m.movement_type||'').includes('return') || (m.type||'').includes('return')).reduce((s, m) => s + Number(m.quantity||0), 0);
  const writeOffs = movsPeriod.filter(m => (m.movement_type||'').includes('write_off') || (m.type||'').includes('write_off')).reduce((s, m) => s + Number(m.quantity||0), 0);
  const expiryItems = inventory.filter(i => i.expiry_date && new Date(i.expiry_date) < now);
  const expiryQty = expiryItems.reduce((s, i) => s + Number(i.quantity||0), 0);
  const closingQty = inventory.reduce((s, i) => s + Number(i.quantity||0), 0);
  const closingValue = inventory.reduce((s, i) => s + (Number(i.quantity||0) * Number(i.unit_price||0)), 0);
  const salesPeriod = sales.filter(s => s.created_at && new Date(s.created_at) >= monthStart);
  const salesQty = salesPeriod.reduce((s, r) => {
    const items = (() => { try { return typeof r.items === 'string' ? JSON.parse(r.items) : (r.items||[]); } catch { return []; } })();
    return s + items.reduce((si, i) => si + Number(i.quantity||0), 0);
  }, 0);
  // Opening = Closing − Issued + Sales + Returns + Expiring + Write-offs (backwards from closing)
  const opening = Math.max(0, closingQty - received + salesQty + returns_ + expiryQty + writeOffs);

  const win = window.open('', '_blank');
  if (!win) return;
  const fmt = (n) => Number(n||0).toLocaleString();
  const fmtC = (n) => `N$ ${Number(n||0).toFixed(2)}`;
  const fRow = (label, val, color, bg, borderTop) =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 18px;${bg?`background:${bg};`:''}${borderTop?`border-top:2px solid ${borderTop};`:''}border-bottom:1px solid #f1f5f9">
       <span style="font-size:12px;font-weight:700;color:#374151">${label}</span>
       <span style="font-size:16px;font-weight:900;color:${color||'#1e293b'}">${val}</span>
     </div>`;
  const invRows = inventory.map(i => `<tr><td>${i.product_name||i.description||'-'}</td><td>${i.batch_no||'-'}</td><td style="font-weight:800;color:${Number(i.quantity||0)<=0?'#c41e3a':Number(i.quantity||0)<10?'#d97706':'#166534'}">${i.quantity||0}</td><td>${i.unit_price?fmtC(i.unit_price):'-'}</td><td style="font-weight:700">${fmtC(Number(i.quantity||0)*Number(i.unit_price||0))}</td><td>${i.expiry_date?new Date(i.expiry_date).toLocaleDateString('en-NA'):'—'}</td></tr>`).join('');

  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Stock Report — ${branch}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; padding: 24px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #c41e3a; padding-bottom:10px; margin-bottom:16px; }
    .company { color:#c41e3a; font-weight:900; font-size:15px; }
    .sec-title { font-size:9px; font-weight:800; color:#c41e3a; text-transform:uppercase; letter-spacing:.12em; margin:14px 0 6px; border-bottom:1px solid #fecaca; padding-bottom:4px; }
    .formula-card { border:1.5px solid #f0e8ea; border-radius:12px; overflow:hidden; margin-bottom:16px; }
    .formula-header { background:linear-gradient(135deg,#c41e3a,#8b0000); color:#fff; padding:12px 18px; font-weight:800; font-size:13px; }
    table { width:100%; border-collapse:collapse; margin-top:4px; }
    th { background:#c41e3a; color:#fff; font-weight:700; padding:6px 8px; text-align:left; font-size:9.5px; }
    td { padding:5px 8px; border-bottom:1px solid #f1f5f9; font-size:9.5px; }
    tr:nth-child(even) td { background:#fdf7f8; }
    .total-row td { font-weight:800; background:#fff0f3 !important; border-top:2px solid #fecaca; }
    .meta { text-align:right; color:#64748b; font-size:10px; line-height:1.6; }
    .print-btn { position:fixed; top:12px; right:12px; background:#c41e3a; color:#fff; border:none; padding:8px 18px; border-radius:8px; font-weight:700; cursor:pointer; }
    @media print { .print-btn { display:none; } body { padding:10px; } }
  </style></head><body>
  <button class="print-btn" onclick="window.print()">🖨️ Print</button>
  <div class="header">
    <div><div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div><div style="font-size:14px;font-weight:800;color:#8b0000;margin-top:4px">📊 Branch Stock Formula Report</div><div style="color:#64748b;font-size:10px;margin-top:3px">${branch} Branch &nbsp;·&nbsp; ${periodLabel}</div></div>
    <div class="meta">Date: ${now.toLocaleDateString('en-NA',{day:'2-digit',month:'long',year:'numeric'})}<br>Time: ${now.toLocaleTimeString('en-NA',{hour:'2-digit',minute:'2-digit'})}<br>Generated by: Branch Portal</div>
  </div>
  <div class="formula-card">
    <div class="formula-header">📐 Stock Calculation — ${periodLabel}</div>
    ${fRow('Opening Stock (estimated)', fmt(opening), '#1e3a5f', '#f4f7fb')}
    ${fRow('+ Issued / Received Stock', '+' + fmt(received), '#166534', '#f0fdf4')}
    ${fRow('− Sales (units sold)', '−' + fmt(salesQty), '#c41e3a', '#fef2f2')}
    ${fRow('− Returns', '−' + fmt(returns_), '#92400e', '#fffbeb')}
    ${fRow('− Expiring / Expired Stock', '−' + fmt(expiryQty), '#c41e3a', '#fef2f2')}
    ${fRow('− Promotions / Campaign Adjustments', '−0', '#c41e3a', '#fef2f2')}
    ${fRow('= Closing Stock', fmt(closingQty), '#15803d', 'linear-gradient(135deg,#f0fdf4,#dcfce7)', '#86efac')}
    <div style="padding:8px 18px;background:#fafafa;font-size:10px;color:#64748b;display:flex;justify-content:space-between"><span>Closing Value: <strong style="color:#c41e3a">${fmtC(closingValue)}</strong></span><span>Write-offs: <strong>${fmt(writeOffs)}</strong></span></div>
  </div>
  <div class="sec-title">Current Inventory — ${branch}</div>
  <table><thead><tr><th>Product</th><th>Batch</th><th>Qty</th><th>Unit Price</th><th>Stock Value</th><th>Expiry</th></tr></thead>
  <tbody>${invRows||'<tr><td colspan="6" style="text-align:center;color:#94a3b8">No inventory data</td></tr>'}
  <tr class="total-row"><td colspan="2"><strong>TOTALS</strong></td><td><strong>${fmt(closingQty)}</strong></td><td></td><td><strong>${fmtC(closingValue)}</strong></td><td></td></tr>
  </tbody></table>
  </body></html>`);
  win.document.close();
}
// ─── End PDF helpers ───────────────────────────────────────────────────────────

function BranchStockTab() {
  const { user } = useAuth();
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState('inventory');
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [showWriteOffForm, setShowWriteOffForm] = useState(false);
  const [showReceiveForm, setShowReceiveForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);
  const [requests, setRequests] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [movements, setMovements] = useState([]);
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [requestItems, setRequestItems] = useState([]);
  const [requestPriority, setRequestPriority] = useState('normal');
  const [requestNotes, setRequestNotes] = useState('');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [receiveItems, setReceiveItems] = useState([]);
  const [receiveDeliveryNote, setReceiveDeliveryNote] = useState('');
  const [receiveReceivedBy, setReceiveReceivedBy] = useState('');
  const [transferForm, setTransferForm] = useState({ product_name: '', quantity: '', to_branch: '', notes: '' });
  const [writeOffForm, setWriteOffForm] = useState({ product_name: '', quantity: '', reason: '' });
  const [transferItems, setTransferItems] = useState([]);
  const [transferProductSearch, setTransferProductSearch] = useState('');
  const [transferToBranch, setTransferToBranch] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [viewRequest, setViewRequest] = useState(null);
  const [viewTransfer, setViewTransfer] = useState(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const branchParam = user?.branch ? `branch=${encodeURIComponent(user.branch)}` : '';
      const [inv, reqs, trans, movs, prods, sl] = await Promise.all([
        api.branch.inventory(branchParam).catch(() => []),
        api.stock.requests().catch(() => ({ requests: [] })),
        api.stock.transfers().catch(() => ({ transfers: [] })),
        api.get('/stock-movements').catch(() => []),
        api.products.list().catch(() => []),
        api.branch.walkinSales(branchParam).catch(() => []),
      ]);
      setInventory(Array.isArray(inv) ? inv : inv.inventory || []);
      setRequests(Array.isArray(reqs) ? reqs : reqs.requests || []);
      setTransfers(Array.isArray(trans) ? trans : trans.transfers || []);
      setMovements(Array.isArray(movs) ? movs : movs.movements || []);
      setProducts(Array.isArray(prods) ? prods : prods.products || []);
      setSales(Array.isArray(sl) ? sl : sl.sales || []);
    } catch {}
    setLoading(false);
  };

  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const lowStock = inventory.filter(i => Number(i.quantity || 0) < 10 && Number(i.quantity || 0) > 0);
  const outOfStock = inventory.filter(i => Number(i.quantity || 0) <= 0);
  const expiringItems = inventory.filter(i => { if (!i.expiry_date) return false; const exp = new Date(i.expiry_date); return exp <= thirtyDays && exp >= now; });
  const expiredItems = inventory.filter(i => { if (!i.expiry_date) return false; return new Date(i.expiry_date) < now; });

  const filteredProducts = products.filter(p => !productSearch || (p.name || p.description || '').toLowerCase().includes(productSearch.toLowerCase()));

  const addToRequestItems = (p) => {
    setRequestItems(prev => {
      const ex = prev.find(i => i.id === p.id);
      if (ex) return prev.map(i => i.id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { id: p.id, product_name: p.name || p.description, quantity: 1, dp: p.dp || p.price || 0, cp: p.cp || p.price || 0 }];
    });
  };
  const updateRequestQty = (id, delta) => setRequestItems(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i));
  const removeRequestItem = (id) => setRequestItems(prev => prev.filter(i => i.id !== id));

  const filteredTransferProducts = products.filter(p => !transferProductSearch || (p.name || p.description || '').toLowerCase().includes(transferProductSearch.toLowerCase()));
  const addToTransferItems = (p) => {
    setTransferItems(prev => {
      const ex = prev.find(i => i.id === p.id);
      if (ex) return prev.map(i => i.id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { id: p.id, product_name: p.name || p.description, quantity: 1 }];
    });
  };
  const updateTransferQty = (id, delta) => setTransferItems(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i));
  const removeTransferItem = (id) => setTransferItems(prev => prev.filter(i => i.id !== id));
  const openTransferForm = () => { setTransferItems([]); setTransferProductSearch(''); setTransferToBranch(''); setTransferNotes(''); setShowTransferForm(true); };
  const parseItems = (r) => { try { return typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []); } catch { return []; } };

  const handleStockRequest = async () => {
    if (requestItems.length === 0) return;
    setSubmitting(true);
    try {
      await api.stock.createRequest({
        requesting_branch: user?.branch || '',
        request_type: 'branch_restock',
        items: JSON.stringify(requestItems.map(i => ({ product_name: i.product_name, quantity: i.quantity }))),
        notes: requestNotes,
        priority: requestPriority,
        created_by: user?.full_name || user?.username || '',
      });
      setAlert({ type: 'success', message: 'Stock request submitted to Stock Management' });
      setRequestItems([]); setRequestPriority('normal'); setRequestNotes(''); setProductSearch('');
      setShowRequestForm(false);
      loadData();
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to submit request' });
    } finally { setSubmitting(false); }
  };

  const openReceiveForm = (req) => {
    const items = (() => { try { return typeof req.items === 'string' ? JSON.parse(req.items) : (req.items || []); } catch { return []; } })();
    setSelectedRequest(req);
    setReceiveItems(items.map(i => ({ ...i, received_qty: i.quantity })));
    setReceiveDeliveryNote('');
    setReceiveReceivedBy(user?.full_name || user?.username || '');
    setShowReceiveForm(true);
  };

  const handleReceiveStock = async () => {
    if (!selectedRequest) return;
    setSubmitting(true);
    try {
      for (const item of receiveItems) {
        if (Number(item.received_qty) > 0) {
          await api.stock.createMovement({
            product_name: item.product_name,
            quantity: Number(item.received_qty),
            movement_type: 'received',
            source_location: 'Warehouse',
            destination_location: user?.branch || 'Branch',
            notes: `Received from request ${selectedRequest.request_number || selectedRequest.id}. Delivery note: ${receiveDeliveryNote || 'N/A'}`,
            reference_id: selectedRequest.id,
          });
        }
      }
      await api.stock.updateRequest(selectedRequest.id, { status: 'received' });
      setAlert({ type: 'success', message: 'Stock received and recorded successfully' });
      setShowReceiveForm(false);
      setSelectedRequest(null);
      loadData();
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to record receipt' });
    } finally { setSubmitting(false); }
  };

  const handleTransfer = async () => {
    if (transferItems.length === 0 || !transferToBranch) return;
    setSubmitting(true);
    try {
      await api.stock.createTransfer({
        fromWarehouse: user?.branch || '',
        toBranch: transferToBranch,
        items: transferItems.map(i => ({ product_name: i.product_name, quantity: i.quantity })),
        created_by: user?.full_name || user?.username || '',
        notes: transferNotes,
      });
      setAlert({ type: 'success', message: 'Stock transfer initiated successfully' });
      setTransferItems([]); setTransferToBranch(''); setTransferNotes(''); setTransferProductSearch('');
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
      setAlert({ type: 'success', message: 'Write-off recorded. Pending approval from Stock Management.' });
      setWriteOffForm({ product_name: '', quantity: '', reason: '' });
      setShowWriteOffForm(false);
      loadData();
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to record write-off' });
    } finally { setSubmitting(false); }
  };

  if (loading) return <LoadingSpinner />;

  const pendingReceive = requests.filter(r => r.status === 'approved' || r.status === 'dispatched');
  const stockSubTabs = [
    { id: 'inventory', label: '📦 Inventory' },
    { id: 'alerts', label: `⚠️ Alerts (${lowStock.length + expiringItems.length + expiredItems.length + outOfStock.length})` },
    { id: 'requests', label: '📋 Requests' },
    { id: 'receive', label: `📥 Receive Stock${pendingReceive.length > 0 ? ` (${pendingReceive.length})` : ''}` },
    { id: 'transfers', label: '↔ Transfers' },
    { id: 'movements', label: '📊 Movements' },
    { id: 'reports', label: '🖨️ Reports' },
  ];

  const sectionLabel = (txt) => <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '.12em', color: '#c41e3a', textTransform: 'uppercase', marginBottom: 10 }}>{txt}</div>;

  return (
    <div>
      <div className="rounded-xl p-5 mb-5 flex justify-between items-center flex-wrap gap-3" style={{ background: 'linear-gradient(135deg,#c41e3a 0%,#8b0000 100%)', boxShadow: '0 4px 20px rgba(196,30,58,0.28)' }}>
        <div>
          <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1 m-0">Branch Operations</p>
          <h3 className="text-white text-lg font-bold m-0">📦 Stock Management</h3>
          <p className="text-white/70 text-sm mt-1 m-0">Inventory · Request Stock · Receive · Reports</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => { setRequestItems([]); setProductSearch(''); setShowRequestForm(true); }} className="px-4 py-2 rounded-full font-semibold text-sm cursor-pointer" style={{ background: '#fff', color: '#c41e3a', border: 'none', fontWeight: 700 }}>📋 Request Stock</button>
          <button onClick={openTransferForm} className="px-4 py-2 rounded-full font-semibold text-sm cursor-pointer text-white" style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)' }}>↔ Transfer</button>
          <button onClick={() => setShowWriteOffForm(true)} className="px-4 py-2 rounded-full font-semibold text-sm cursor-pointer text-white" style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)' }}>🗑️ Write Off</button>
        </div>
      </div>

      {alert && <Alert type={alert.type} className="mb-4" onClose={() => setAlert(null)}>{alert.message}</Alert>}

      <div className="flex gap-2 mb-5 flex-wrap">
        {stockSubTabs.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)} className="px-4 py-2 rounded-full text-sm font-semibold cursor-pointer transition-all border-none"
            style={subTab === t.id ? { background: '#fff0f3', color: '#c41e3a', border: '2px solid #fecaca' } : { background: '#f9f5f5', color: '#64748b', border: '2px solid transparent' }}>{t.label}</button>
        ))}
      </div>

      {subTab === 'inventory' && (
        <Card>
          <CardHeader className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Branch Inventory — {user?.branch || 'All'}</h3>
            <button onClick={() => printPhysicalStockReport(inventory, user?.branch || '')} className="px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer" style={{ background: '#c41e3a', color: '#fff' }}>📄 Print Physical Stock</button>
          </CardHeader>
          <Table
            columns={[
              { header: 'Product', render: r => r.product_name || r.description || '-' },
              { header: 'Qty', render: r => { const q = Number(r.quantity || 0); return <span style={{ fontWeight: 700, color: q<=0?'#c41e3a':q<10?'#d97706':'#166534' }}>{q}</span>; }},
              { header: 'Batch', render: r => r.batch_no || r.batch_number || '-' },
              { header: 'Expiry', render: r => { if (!r.expiry_date) return '-'; const exp = new Date(r.expiry_date); const isExp = exp < now; const isExpiring = exp <= thirtyDays; return <span style={{ color: isExp?'#c41e3a':isExpiring?'#d97706':'inherit', fontWeight: (isExp||isExpiring)?700:400 }}>{formatDate(r.expiry_date)}{isExp?' (EXPIRED)':isExpiring?' ⚠️':''}</span>; }},
              { header: 'Unit Price', render: r => formatCurrency(r.unit_price || 0) },
            ]}
            data={inventory}
            emptyMessage="No inventory data for this branch"
          />
        </Card>
      )}

      {subTab === 'alerts' && (
        <div className="space-y-4">
          {outOfStock.length > 0 && <Card><CardHeader><h3 className="font-bold" style={{ color: '#c41e3a' }}>🔴 Out of Stock ({outOfStock.length})</h3></CardHeader><Table columns={[{ header: 'Product', render: r => r.product_name || r.description || '-' }, { header: 'Qty', render: () => <Badge variant="danger">0</Badge> }]} data={outOfStock} /></Card>}
          {lowStock.length > 0 && <Card><CardHeader><h3 className="font-bold text-orange-600">🟡 Low Stock ({lowStock.length})</h3></CardHeader><Table columns={[{ header: 'Product', render: r => r.product_name || r.description || '-' }, { header: 'Qty', render: r => <Badge variant="warning">{r.quantity}</Badge> }]} data={lowStock} /></Card>}
          {expiredItems.length > 0 && <Card><CardHeader><h3 className="font-bold" style={{ color: '#c41e3a' }}>🔴 Expired ({expiredItems.length})</h3></CardHeader><Table columns={[{ header: 'Product', render: r => r.product_name || r.description || '-' }, { header: 'Expiry', render: r => <Badge variant="danger">{formatDate(r.expiry_date)}</Badge> }, { header: 'Qty', render: r => r.quantity }]} data={expiredItems} /></Card>}
          {expiringItems.length > 0 && <Card><CardHeader><h3 className="font-bold text-orange-600">🟡 Expiring Soon ({expiringItems.length})</h3></CardHeader><Table columns={[{ header: 'Product', render: r => r.product_name || r.description || '-' }, { header: 'Expiry', render: r => <Badge variant="warning">{formatDate(r.expiry_date)}</Badge> }, { header: 'Qty', render: r => r.quantity }]} data={expiringItems} /></Card>}
          {outOfStock.length === 0 && lowStock.length === 0 && expiredItems.length === 0 && expiringItems.length === 0 && (
            <Card><CardBody><p className="text-center text-green-600 font-semibold py-4">✅ All stock levels are healthy</p></CardBody></Card>
          )}
        </div>
      )}

      {subTab === 'requests' && (
        <Card>
          <CardHeader className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Stock Requests</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => printReceivingStockReport(requests, user?.branch||'')} className="px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer" style={{ background: '#f1f5f9', color: '#374151' }}>📄 Print</button>
              <button onClick={() => { setRequestItems([]); setProductSearch(''); setShowRequestForm(true); }} className="px-4 py-2 rounded-lg text-sm font-bold border-none cursor-pointer" style={{ background: '#c41e3a', color: '#fff' }}>📋 New Request</button>
            </div>
          </CardHeader>
          <Table
            columns={[
              { header: 'Request #', render: r => <span className="font-mono text-xs">{r.request_number || r.id}</span> },
              { header: 'Branch', render: r => <span className="font-semibold text-xs">{r.requesting_branch || user?.branch || '-'}</span> },
              { header: 'Items', render: r => { const items = parseItems(r); return <span className="text-xs text-gray-600">{items.slice(0,2).map(i=>`${i.product_name} ×${i.quantity}`).join(', ')}{items.length>2?` +${items.length-2} more`:''}{items.length===0?'-':''}</span>; }},
              { header: 'Priority', render: r => <Badge variant={r.priority==='urgent'?'danger':r.priority==='high'?'warning':'info'}>{r.priority||'normal'}</Badge> },
              { header: 'Status', render: r => <Badge variant={r.status==='approved'?'success':r.status==='received'?'success':r.status==='rejected'?'danger':'warning'}>{r.status||'pending'}</Badge> },
              { header: 'Date', render: r => formatDateTime(r.created_at) },
              { header: '', render: r => (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setViewRequest(r)} className="px-3 py-1 text-xs rounded-lg font-bold border-none cursor-pointer" style={{ background: '#f1f5f9', color: '#374151' }}>👁 View</button>
                  {(r.status==='approved'||r.status==='dispatched') && <button onClick={() => openReceiveForm(r)} className="px-3 py-1 text-xs rounded-lg font-bold border-none cursor-pointer" style={{ background: '#166534', color: '#fff' }}>📥 Receive</button>}
                </div>
              )},
            ]}
            data={requests}
            emptyMessage="No stock requests yet — click New Request to start"
          />
        </Card>
      )}

      {subTab === 'receive' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-gray-800 text-lg m-0">📥 Receive Stock from Warehouse</h3>
          </div>
          {pendingReceive.length === 0 ? (
            <Card><CardBody><p className="text-center text-gray-400 py-8">No stock ready to receive — requests must be approved or dispatched by Stock Management first</p></CardBody></Card>
          ) : (
            <div className="space-y-4">
              {pendingReceive.map(req => {
                const items = (() => { try { return typeof req.items==='string'?JSON.parse(req.items):(req.items||[]); } catch { return []; } })();
                return (
                  <div key={req.id} style={{ background: '#fff', border: '1.5px solid #f0e8ea', borderRadius: 14, padding: 18, boxShadow: '0 2px 8px rgba(196,30,58,0.06)' }}>
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="font-bold text-gray-800">Request: <span className="font-mono text-sm">{req.request_number || req.id}</span></div>
                        <div className="text-sm text-gray-500 mt-1">From: Warehouse → {req.requesting_branch || 'Branch'} · {formatDateTime(req.created_at)}</div>
                        {req.notes && <div className="text-xs text-gray-400 mt-1">Notes: {req.notes}</div>}
                      </div>
                      <div className="flex gap-2 items-center">
                        <Badge variant={req.status==='dispatched'?'info':'success'}>{req.status}</Badge>
                        <button onClick={() => openReceiveForm(req)} className="px-4 py-2 rounded-lg text-sm font-bold border-none cursor-pointer" style={{ background: '#c41e3a', color: '#fff' }}>📥 Receive</button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {items.map((item, i) => (
                        <span key={i} className="px-3 py-1 rounded-full text-xs font-medium" style={{ background: '#f9f5f5', border: '1px solid #f0e8ea', color: '#374151' }}>{item.product_name} × {item.quantity}</span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {subTab === 'transfers' && (
        <Card>
          <CardHeader className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Stock Transfers</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { const win = window.open('','_blank'); if (!win) return; const rows = transfers.map(r => { const items = (()=>{try{return typeof r.items==='string'?JSON.parse(r.items):(r.items||[]);}catch{return [];}})(); return `<tr><td>${r.from_warehouse||user?.branch||'-'}</td><td>${r.to_branch||'-'}</td><td>${items.map(i=>`${i.product_name} ×${i.quantity}`).join(', ')||'-'}</td><td><span class="badge ${r.status==='delivered'?'badge-green':r.status==='dispatched'?'badge-blue':'badge-amber'}">${r.status||'pending'}</span></td><td>${r.created_at?new Date(r.created_at).toLocaleDateString('en-NA'):'-'}</td></tr>`; }).join(''); win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Stock Transfers</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;padding:24px}.header{display:flex;justify-content:space-between;border-bottom:3px solid #c41e3a;padding-bottom:10px;margin-bottom:16px}.company{color:#c41e3a;font-weight:900;font-size:15px}table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#c41e3a;color:#fff;font-weight:700;padding:7px 8px;text-align:left;font-size:10px}td{padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:10px}tr:nth-child(even) td{background:#fdf7f8}.badge{display:inline-block;padding:1px 7px;border-radius:20px;font-weight:700;font-size:9px}.badge-green{background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}.badge-blue{background:#eff6ff;color:#1e40af;border:1px solid #93c5fd}.badge-amber{background:#fffbeb;color:#92400e;border:1px solid #fcd34d}.print-btn{position:fixed;top:12px;right:12px;background:#c41e3a;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:700;cursor:pointer}@media print{.print-btn{display:none}}</style></head><body><button class="print-btn" onclick="window.print()">🖨️ Print</button><div class="header"><div><div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div><div style="font-size:14px;font-weight:800;color:#8b0000;margin-top:4px">↔ Stock Transfers Report</div><div style="color:#64748b;font-size:10px;margin-top:3px">${user?.branch||'Branch'}</div></div><div style="text-align:right;color:#64748b;font-size:10px">Date: ${new Date().toLocaleDateString('en-NA',{day:'2-digit',month:'long',year:'numeric'})}</div></div><table><thead><tr><th>From</th><th>To Branch</th><th>Items</th><th>Status</th><th>Date</th></tr></thead><tbody>${rows||'<tr><td colspan="5" style="text-align:center;color:#94a3b8">No transfers</td></tr>'}</tbody></table></body></html>`); win.document.close(); }} className="px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer" style={{ background: '#f1f5f9', color: '#374151' }}>📄 Print</button>
              <button onClick={openTransferForm} className="px-4 py-2 rounded-lg text-sm font-bold border-none cursor-pointer" style={{ background: '#c41e3a', color: '#fff' }}>↔ New Transfer</button>
            </div>
          </CardHeader>
          <Table
            columns={[
              { header: 'From Branch', render: r => <span className="font-semibold text-xs">{r.from_warehouse || user?.branch || '-'}</span> },
              { header: 'To Branch', render: r => <span className="font-semibold text-xs">{r.to_branch || '-'}</span> },
              { header: 'Items', render: r => { const items = parseItems(r); return <span className="text-xs text-gray-600">{items.slice(0,2).map(i=>`${i.product_name} ×${i.quantity}`).join(', ')}{items.length>2?` +${items.length-2} more`:''}{items.length===0?'-':''}</span>; }},
              { header: 'Status', render: r => <Badge variant={r.status==='delivered'?'success':r.status==='dispatched'?'info':'warning'}>{r.status||'pending'}</Badge> },
              { header: 'Date', render: r => formatDateTime(r.created_at) },
              { header: '', render: r => <button onClick={() => setViewTransfer(r)} className="px-3 py-1 text-xs rounded-lg font-bold border-none cursor-pointer" style={{ background: '#f1f5f9', color: '#374151' }}>👁 View</button> },
            ]}
            data={transfers}
            emptyMessage="No transfers yet — click New Transfer to start"
          />
        </Card>
      )}

      {subTab === 'movements' && (
        <Card>
          <CardHeader className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Stock Movements</h3>
            <button onClick={() => printStockMovementsReport(movements, user?.branch||'')} className="px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer" style={{ background: '#c41e3a', color: '#fff' }}>📄 Print Report</button>
          </CardHeader>
          <Table
            columns={[
              { header: 'Product', render: r => r.product_name || '-' },
              { header: 'Type', render: r => <Badge variant={r.movement_type==='sale'?'info':r.movement_type==='write_off'?'danger':r.movement_type==='received'?'success':'warning'}>{(r.movement_type||'').replace(/_/g,' ')}</Badge> },
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

      {subTab === 'reports' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14 }}>
            {[
              { icon: '📊', title: 'Daily Sales Report', desc: "Today's complete sales — walk-in, online & prescription breakdown", action: () => printSalesReportDoc(sales, 'today', user?.branch||'', [], []) },
              { icon: '📈', title: 'Monthly Sales Report', desc: `${new Date().toLocaleDateString('en-NA',{month:'long',year:'numeric'})} — walk-in, online & prescription breakdown`, action: () => printSalesReportDoc(sales, 'month', user?.branch||'', [], []) },
              { icon: '📦', title: 'Physical Stock Report', desc: 'Current inventory levels with batch & expiry', action: () => printPhysicalStockReport(inventory, user?.branch||'') },
              { icon: '🔢', title: 'Stock Formula Report', desc: 'Opening + Issued − Sales − Returns − Expiring − Promotions = Closing', action: () => printStockFormulaReport(inventory, movements, sales, user?.branch||'') },
              { icon: '🔄', title: 'Stock Movements Report', desc: 'All stock movements: sales, received, write-offs', action: () => printStockMovementsReport(movements, user?.branch||'') },
              { icon: '📥', title: 'Receiving Stock Report', desc: 'Stock received from warehouse', action: () => printReceivingStockReport(requests, user?.branch||'') },
            ].map(card => (
              <div key={card.title} style={{ background: '#fff', border: '1.5px solid #f0e8ea', borderRadius: 14, padding: '18px 20px', boxShadow: '0 2px 8px rgba(196,30,58,0.06)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: '2rem' }}>{card.icon}</div>
                <div>
                  <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.95rem' }}>{card.title}</div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>{card.desc}</div>
                </div>
                <button onClick={card.action} className="mt-auto px-4 py-2.5 rounded-xl font-bold text-sm border-none cursor-pointer" style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', boxShadow: '0 3px 10px rgba(196,30,58,0.25)' }}>
                  🖨️ Preview &amp; Print
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Request Stock Modal — Product Table */}
      {showRequestForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', backdropFilter: 'blur(3px)' }}>
          <div style={{ width: '100%', maxWidth: 900, background: '#fff', borderRadius: 20, overflow: 'hidden', maxHeight: '95vh', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(196,30,58,0.2)' }}>
            <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>📋 Request Stock from Warehouse</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', marginTop: 2 }}>{user?.branch ? `${user.branch} Branch` : ''} · Select products from catalogue</div>
              </div>
              <button onClick={() => setShowRequestForm(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* Product picker */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #f0e8ea' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0e8ea', flexShrink: 0 }}>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#c41e3a', fontSize: '0.9rem', pointerEvents: 'none' }}>🔍</div>
                    <input type="text" value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search catalogue products…"
                      style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: 8 }}>
                    {filteredProducts.slice(0, 80).map(p => {
                      const inReq = requestItems.find(i => i.id === p.id);
                      return (
                        <button key={p.id} onClick={() => addToRequestItems(p)} type="button"
                          style={{ padding: '10px', border: inReq ? '2.5px solid #c41e3a' : '1.5px solid #f0e8ea', borderRadius: 11, background: inReq ? '#fff0f3' : '#fff', cursor: 'pointer', textAlign: 'left', position: 'relative' }}>
                          {inReq && <div style={{ position: 'absolute', top: 6, right: 6, background: '#c41e3a', color: '#fff', borderRadius: '50%', width: 20, height: 20, fontSize: '0.7rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{inReq.quantity}</div>}
                          <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.8rem', lineHeight: 1.3, paddingRight: inReq ? 22 : 0 }}>{p.name || p.description}</div>
                          <div style={{ fontSize: '0.75rem', color: '#c41e3a', fontWeight: 700, marginTop: 5 }}>DP: {formatCurrency(p.dp || p.price || 0)}</div>
                        </button>
                      );
                    })}
                    {filteredProducts.length === 0 && <p style={{ color: '#94a3b8', gridColumn: '1/-1', textAlign: 'center', padding: '24px 0' }}>No products found</p>}
                  </div>
                </div>
              </div>

              {/* Request summary sidebar */}
              <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#fdf7f8' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0e8ea', flexShrink: 0 }}>
                  {sectionLabel('Request Items')}
                  <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                    {requestItems.length === 0 ? <p style={{ color: '#c4a0a7', fontSize: '0.82rem', textAlign: 'center', padding: '16px 0' }}>Click products to add them</p> : requestItems.map(item => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid #fdf5f5' }}>
                        <div style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600, color: '#1e293b', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.product_name}</div>
                        <button onClick={() => updateRequestQty(item.id, -1)} style={{ width: 22, height: 22, border: '1px solid #fecaca', borderRadius: 5, background: '#fff', cursor: 'pointer', color: '#c41e3a', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                        <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 800, fontSize: '0.85rem' }}>{item.quantity}</span>
                        <button onClick={() => updateRequestQty(item.id, 1)} style={{ width: 22, height: 22, border: '1px solid #fecaca', borderRadius: 5, background: '#fff', cursor: 'pointer', color: '#c41e3a', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                        <button onClick={() => removeRequestItem(item.id)} style={{ width: 20, height: 20, border: 'none', borderRadius: 5, background: '#fef2f2', cursor: 'pointer', color: '#ef4444', fontWeight: 800, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ padding: '14px 16px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    {sectionLabel('Priority')}
                    <select value={requestPriority} onChange={e => setRequestPriority(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.87rem', outline: 'none' }}>
                      <option value="normal">Normal</option>
                      <option value="high">High Priority</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                  <div>
                    {sectionLabel('Notes')}
                    <textarea value={requestNotes} onChange={e => setRequestNotes(e.target.value)} rows={3} placeholder="Reason or additional notes…" style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.85rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>

                <div style={{ padding: '12px 16px', borderTop: '1px solid #f0e8ea', display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => setShowRequestForm(false)} style={{ flex: 1, padding: '10px', border: '1.5px solid #e8d5d8', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600, fontSize: '0.87rem' }}>Cancel</button>
                  <button onClick={handleStockRequest} disabled={submitting || requestItems.length === 0}
                    style={{ flex: 2, padding: '10px', border: 'none', borderRadius: 10, background: requestItems.length === 0 ? '#fecaca' : 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', fontWeight: 800, cursor: requestItems.length===0?'not-allowed':'pointer', fontSize: '0.87rem', opacity: submitting?0.65:1 }}>
                    {submitting ? '⏳ Submitting…' : `📋 Submit (${requestItems.length} item${requestItems.length!==1?'s':''})`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receive Stock Modal */}
      {showReceiveForm && selectedRequest && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', backdropFilter: 'blur(3px)' }}>
          <div style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 30px 80px rgba(196,30,58,0.2)' }}>
            <div style={{ background: 'linear-gradient(135deg,#166534,#15803d)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>📥 Receive Stock</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', marginTop: 2 }}>Request: {selectedRequest.request_number || selectedRequest.id}</div>
              </div>
              <button onClick={() => setShowReceiveForm(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: '20px', maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ marginBottom: 16 }}>
                {sectionLabel('Items to Receive')}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {receiveItems.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#f9f5f5', borderRadius: 10, border: '1px solid #f0e8ea' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.88rem' }}>{item.product_name}</div>
                        <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 1 }}>Requested: {item.quantity}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        <label style={{ fontSize: '0.68rem', color: '#c41e3a', fontWeight: 700 }}>Qty Received</label>
                        <input type="number" min="0" value={item.received_qty}
                          onChange={e => setReceiveItems(prev => prev.map((r, j) => j===i ? {...r, received_qty: e.target.value} : r))}
                          style={{ width: 70, padding: '5px 8px', border: '1.5px solid #fecaca', borderRadius: 7, fontSize: '0.87rem', textAlign: 'center', outline: 'none' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Delivery Note / Waybill #</label>
                  <input type="text" value={receiveDeliveryNote} onChange={e => setReceiveDeliveryNote(e.target.value)} placeholder="e.g. WB-20240320-001"
                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Received By</label>
                  <input type="text" value={receiveReceivedBy} onChange={e => setReceiveReceivedBy(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid #f0e8ea', display: 'flex', gap: 10, justifyContent: 'flex-end', background: '#fff' }}>
              <button onClick={() => setShowReceiveForm(false)} style={{ padding: '10px 20px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600, fontSize: '0.87rem' }}>Cancel</button>
              <button onClick={handleReceiveStock} disabled={submitting}
                style={{ padding: '10px 28px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#166534,#15803d)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '0.9rem', opacity: submitting?0.65:1 }}>
                {submitting ? '⏳ Recording…' : '✅ Confirm Receipt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Stock Form - full catalogue picker */}
      {showTransferForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', backdropFilter: 'blur(3px)' }}>
          <div style={{ width: '100%', maxWidth: 900, background: '#fff', borderRadius: 20, overflow: 'hidden', maxHeight: '95vh', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(196,30,58,0.2)' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e3a5f,#0f2040)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>↔ Transfer Stock to Branch</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', marginTop: 2 }}>From: <strong style={{ color: '#fff' }}>{user?.branch || 'Your Branch'}</strong> · Select destination and products</div>
              </div>
              <button onClick={() => setShowTransferForm(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* Product picker */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #e8eef4' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #e8eef4', flexShrink: 0 }}>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#1e3a5f', fontSize: '0.9rem', pointerEvents: 'none' }}>🔍</div>
                    <input type="text" value={transferProductSearch} onChange={e => setTransferProductSearch(e.target.value)} placeholder="Search catalogue products…"
                      style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1.5px solid #c8d8e8', borderRadius: 9, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: 8 }}>
                    {filteredTransferProducts.slice(0, 80).map(p => {
                      const inList = transferItems.find(i => i.id === p.id);
                      return (
                        <button key={p.id} onClick={() => addToTransferItems(p)} type="button"
                          style={{ padding: '10px', border: inList ? '2.5px solid #1e3a5f' : '1.5px solid #e0e8f0', borderRadius: 11, background: inList ? '#eef3f9' : '#fff', cursor: 'pointer', textAlign: 'left', position: 'relative' }}>
                          {inList && <div style={{ position: 'absolute', top: 6, right: 6, background: '#1e3a5f', color: '#fff', borderRadius: '50%', width: 20, height: 20, fontSize: '0.7rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{inList.quantity}</div>}
                          <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.8rem', lineHeight: 1.3, paddingRight: inList ? 22 : 0 }}>{p.name || p.description}</div>
                          <div style={{ fontSize: '0.75rem', color: '#1e3a5f', fontWeight: 700, marginTop: 5 }}>DP: {formatCurrency(p.dp || p.price || 0)}</div>
                        </button>
                      );
                    })}
                    {filteredTransferProducts.length === 0 && <p style={{ color: '#94a3b8', gridColumn: '1/-1', textAlign: 'center', padding: '24px 0' }}>No products found</p>}
                  </div>
                </div>
              </div>

              {/* Transfer summary sidebar */}
              <div style={{ width: 290, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#f4f7fb' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #dbe6f0', flexShrink: 0 }}>
                  {sectionLabel('Transfer Details')}
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: '0.73rem', fontWeight: 700, color: '#1e3a5f', display: 'block', marginBottom: 4 }}>From Branch</label>
                    <div style={{ padding: '8px 12px', background: '#dbe6f0', borderRadius: 8, fontSize: '0.87rem', fontWeight: 700, color: '#0f2040' }}>{user?.branch || 'Your Branch'}</div>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.73rem', fontWeight: 700, color: '#1e3a5f', display: 'block', marginBottom: 4 }}>To Branch *</label>
                    <select value={transferToBranch} onChange={e => setTransferToBranch(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #c8d8e8', borderRadius: 8, fontSize: '0.87rem', outline: 'none', background: '#fff' }}>
                      <option value="">Select destination branch…</option>
                      {BRANCHES.filter(b => b !== user?.branch).map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ padding: '12px 16px', borderBottom: '1px solid #dbe6f0', flexShrink: 0 }}>
                  {sectionLabel('Items to Transfer')}
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {transferItems.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '0.82rem', textAlign: 'center', padding: '16px 0' }}>Click products to add them</p> : transferItems.map(item => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid #e8f0f8' }}>
                        <div style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600, color: '#1e293b', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.product_name}</div>
                        <button onClick={() => updateTransferQty(item.id, -1)} style={{ width: 22, height: 22, border: '1px solid #c8d8e8', borderRadius: 5, background: '#fff', cursor: 'pointer', color: '#1e3a5f', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                        <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 800, fontSize: '0.85rem' }}>{item.quantity}</span>
                        <button onClick={() => updateTransferQty(item.id, 1)} style={{ width: 22, height: 22, border: '1px solid #c8d8e8', borderRadius: 5, background: '#fff', cursor: 'pointer', color: '#1e3a5f', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                        <button onClick={() => removeTransferItem(item.id)} style={{ width: 20, height: 20, border: 'none', borderRadius: 5, background: '#e8f0f8', cursor: 'pointer', color: '#1e3a5f', fontWeight: 800, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ padding: '12px 16px', flexShrink: 0 }}>
                  {sectionLabel('Notes')}
                  <textarea value={transferNotes} onChange={e => setTransferNotes(e.target.value)} rows={3} placeholder="Reason for transfer or additional notes…" style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #c8d8e8', borderRadius: 8, fontSize: '0.85rem', resize: 'none', outline: 'none', boxSizing: 'border-box', background: '#fff' }} />
                </div>

                <div style={{ padding: '12px 16px', borderTop: '1px solid #dbe6f0', display: 'flex', gap: 8, flexShrink: 0, marginTop: 'auto' }}>
                  <button onClick={() => setShowTransferForm(false)} style={{ flex: 1, padding: '10px', border: '1.5px solid #c8d8e8', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600, fontSize: '0.87rem' }}>Cancel</button>
                  <button onClick={handleTransfer} disabled={submitting || transferItems.length === 0 || !transferToBranch}
                    style={{ flex: 2, padding: '10px', border: 'none', borderRadius: 10, background: (transferItems.length === 0 || !transferToBranch) ? '#c8d8e8' : 'linear-gradient(135deg,#1e3a5f,#0f2040)', color: '#fff', fontWeight: 800, cursor: (transferItems.length===0||!transferToBranch)?'not-allowed':'pointer', fontSize: '0.87rem', opacity: submitting?0.65:1 }}>
                    {submitting ? '⏳ Transferring…' : `↔ Transfer (${transferItems.length} item${transferItems.length!==1?'s':''})`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Request Modal */}
      {viewRequest && (
        <div onClick={e => { if (e.target === e.currentTarget) setViewRequest(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(3px)' }}>
          <div style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 30px 80px rgba(196,30,58,0.2)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 800 }}>📋 Request Details</div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.77rem', marginTop: 2, fontFamily: 'monospace' }}>{viewRequest.request_number || viewRequest.id}</div>
              </div>
              <button onClick={() => setViewRequest(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Requesting Branch', value: viewRequest.requesting_branch || user?.branch || '-' },
                  { label: 'Priority', value: viewRequest.priority || 'normal' },
                  { label: 'Status', value: viewRequest.status || 'pending' },
                  { label: 'Date', value: formatDateTime(viewRequest.created_at) },
                  { label: 'Created By', value: viewRequest.created_by || '-' },
                  { label: 'Request Type', value: (viewRequest.request_type || 'branch_restock').replace(/_/g, ' ') },
                ].map(f => (
                  <div key={f.label} style={{ background: '#f8f9fa', padding: '10px 14px', borderRadius: 10 }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#c41e3a', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 3 }}>{f.label}</div>
                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.88rem' }}>{f.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#c41e3a', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Requested Items</div>
                {parseItems(viewRequest).map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f9f5f5', borderRadius: 9, border: '1px solid #f0e8ea', marginBottom: 6 }}>
                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.88rem' }}>{item.product_name}</div>
                    <div style={{ background: '#c41e3a', color: '#fff', borderRadius: 20, padding: '2px 12px', fontWeight: 800, fontSize: '0.82rem' }}>× {item.quantity}</div>
                  </div>
                ))}
                {parseItems(viewRequest).length === 0 && <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No items recorded</p>}
              </div>
              {viewRequest.notes && (
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Notes</div>
                  <div style={{ color: '#374151', fontSize: '0.87rem' }}>{viewRequest.notes}</div>
                </div>
              )}
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #f0e8ea', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
              {(viewRequest.status==='approved'||viewRequest.status==='dispatched') && (
                <button onClick={() => { openReceiveForm(viewRequest); setViewRequest(null); }} style={{ padding: '10px 22px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#166534,#15803d)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '0.9rem' }}>📥 Receive Stock</button>
              )}
              <button onClick={() => setViewRequest(null)} style={{ padding: '10px 22px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600, fontSize: '0.87rem' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* View Transfer Modal */}
      {viewTransfer && (
        <div onClick={e => { if (e.target === e.currentTarget) setViewTransfer(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(3px)' }}>
          <div style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 30px 80px rgba(30,58,95,0.25)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e3a5f,#0f2040)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 800 }}>↔ Transfer Details</div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.77rem', marginTop: 2, fontFamily: 'monospace' }}>{viewTransfer.id || '-'}</div>
              </div>
              <button onClick={() => setViewTransfer(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'From Branch', value: viewTransfer.from_warehouse || user?.branch || '-' },
                  { label: 'To Branch', value: viewTransfer.to_branch || '-' },
                  { label: 'Status', value: viewTransfer.status || 'pending' },
                  { label: 'Date', value: formatDateTime(viewTransfer.created_at) },
                  { label: 'Created By', value: viewTransfer.created_by || '-' },
                ].map(f => (
                  <div key={f.label} style={{ background: '#f4f7fb', padding: '10px 14px', borderRadius: 10 }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#1e3a5f', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 3 }}>{f.label}</div>
                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.88rem' }}>{f.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#1e3a5f', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Items Transferred</div>
                {parseItems(viewTransfer).map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f4f7fb', borderRadius: 9, border: '1px solid #dbe6f0', marginBottom: 6 }}>
                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.88rem' }}>{item.product_name}</div>
                    <div style={{ background: '#1e3a5f', color: '#fff', borderRadius: 20, padding: '2px 12px', fontWeight: 800, fontSize: '0.82rem' }}>× {item.quantity}</div>
                  </div>
                ))}
                {parseItems(viewTransfer).length === 0 && <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No items recorded</p>}
              </div>
              {viewTransfer.notes && (
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Notes</div>
                  <div style={{ color: '#374151', fontSize: '0.87rem' }}>{viewTransfer.notes}</div>
                </div>
              )}
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
              <button onClick={() => setViewTransfer(null)} style={{ padding: '10px 22px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600, fontSize: '0.87rem' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      <Modal open={showWriteOffForm} onClose={() => setShowWriteOffForm(false)} title="Write Off Stock">
        <div className="p-6 space-y-4">
          <Input label="Product Name" value={writeOffForm.product_name} onChange={e => setWriteOffForm({ ...writeOffForm, product_name: e.target.value })} />
          <Input label="Quantity" type="number" value={writeOffForm.quantity} onChange={e => setWriteOffForm({ ...writeOffForm, quantity: e.target.value })} />
          <Textarea label="Reason for write-off *" value={writeOffForm.reason} onChange={e => setWriteOffForm({ ...writeOffForm, reason: e.target.value })} placeholder="e.g. Expired, Damaged, Lost" />
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => setShowWriteOffForm(false)}>Cancel</Button>
            <Button className="flex-1" variant="danger" onClick={handleWriteOff} disabled={submitting}>{submitting ? 'Processing...' : '🗑️ Write Off'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function BankingTab() {
  const { user } = useAuth();
  const [deposits, setDeposits] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bankSubTab, setBankSubTab] = useState('deposits');
  const [alert, setAlert] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Deposit form
  const [showDepositForm, setShowDepositForm] = useState(false);
  const [depositForm, setDepositForm] = useState({ amount: '', bank_name: '', reference: '', deposit_date: '', notes: '' });

  // Expense form
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ category: 'Supplies', amount: '', description: '', receipt_ref: '', date: new Date().toISOString().slice(0, 10) });

  // Cash drawer
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerOpening, setDrawerOpening] = useState('');
  const [drawerEntries, setDrawerEntries] = useState([]);
  const [drawerEntry, setDrawerEntry] = useState({ type: 'in', amount: '', description: '' });

  useEffect(() => {
    Promise.all([
      api.branch.deposits().catch(() => []),
      api.branch.expenses().catch(() => []),
    ]).then(([d, e]) => {
      setDeposits(Array.isArray(d) ? d : d.deposits || []);
      setExpenses(Array.isArray(e) ? e : e.expenses || []);
    }).finally(() => setLoading(false));
  }, []);

  const reloadAll = async () => {
    const [d, e] = await Promise.all([api.branch.deposits().catch(() => []), api.branch.expenses().catch(() => [])]);
    setDeposits(Array.isArray(d) ? d : d.deposits || []);
    setExpenses(Array.isArray(e) ? e : e.expenses || []);
  };

  const submitDeposit = async () => {
    if (!depositForm.amount || Number(depositForm.amount) <= 0 || !depositForm.bank_name.trim()) {
      setAlert({ type: 'error', message: 'Amount and bank name are required' }); return;
    }
    setSubmitting(true);
    try {
      await api.branch.createDeposit({ amount: Number(depositForm.amount), bank_name: depositForm.bank_name.trim(), reference: depositForm.reference.trim(), deposit_date: depositForm.deposit_date || new Date().toISOString().slice(0, 10), notes: depositForm.notes.trim() });
      setAlert({ type: 'success', message: 'Deposit recorded successfully' });
      setDepositForm({ amount: '', bank_name: '', reference: '', deposit_date: '', notes: '' });
      setShowDepositForm(false);
      await reloadAll();
    } catch (err) { setAlert({ type: 'error', message: err.message || 'Failed to record deposit' }); }
    finally { setSubmitting(false); }
  };

  const submitExpense = async () => {
    if (!expenseForm.amount || Number(expenseForm.amount) <= 0 || !expenseForm.description.trim()) {
      setAlert({ type: 'error', message: 'Amount and description are required' }); return;
    }
    setSubmitting(true);
    try {
      await api.branch.createExpense({ category: expenseForm.category, amount: Number(expenseForm.amount), description: expenseForm.description.trim(), receipt_ref: expenseForm.receipt_ref.trim(), date: expenseForm.date, branch: user?.branch || '' });
      setAlert({ type: 'success', message: 'Expense recorded successfully' });
      setExpenseForm({ category: 'Supplies', amount: '', description: '', receipt_ref: '', date: new Date().toISOString().slice(0, 10) });
      setShowExpenseForm(false);
      await reloadAll();
    } catch (err) { setAlert({ type: 'error', message: err.message || 'Failed to record expense' }); }
    finally { setSubmitting(false); }
  };

  const addDrawerEntry = () => {
    if (!drawerEntry.amount || Number(drawerEntry.amount) <= 0) return;
    setDrawerEntries(prev => [...prev, { ...drawerEntry, amount: Number(drawerEntry.amount), time: new Date().toLocaleTimeString('en-NA', { hour: '2-digit', minute: '2-digit' }) }]);
    setDrawerEntry({ type: 'in', amount: '', description: '' });
  };
  const drawerBalance = Number(drawerOpening || 0) + drawerEntries.reduce((s, e) => s + (e.type === 'in' ? e.amount : -e.amount), 0);

  if (loading) return <LoadingSpinner />;

  const inputStyle = { width: '100%', padding: '10px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' };
  const labelStyle = { fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 };

  return (
    <div>
      <div className="rounded-xl p-5 mb-5 flex justify-between items-center flex-wrap gap-3" style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', boxShadow: '0 4px 20px rgba(196,30,58,0.28)' }}>
        <div>
          <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1 m-0">Branch Finance</p>
          <h3 className="text-white text-lg font-bold m-0">🏦 Banking & Finance</h3>
          <p className="text-white/70 text-sm mt-1 m-0">Deposits · Cash Drawer · Expenses</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => { setShowDepositForm(true); setAlert(null); }} className="px-4 py-2 rounded-full font-semibold text-sm cursor-pointer" style={{ background: '#fff', color: '#c41e3a', border: 'none', fontWeight: 700 }}>💰 New Deposit</button>
          <button onClick={() => { setShowDrawer(true); setAlert(null); }} className="px-4 py-2 rounded-full font-semibold text-sm cursor-pointer text-white" style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)' }}>💵 Cash Drawer</button>
          <button onClick={() => { setShowExpenseForm(true); setAlert(null); setBankSubTab('expenses'); }} className="px-4 py-2 rounded-full font-semibold text-sm cursor-pointer text-white" style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)' }}>💸 Record Expense</button>
        </div>
      </div>

      {alert && <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: alert.type === 'success' ? '#f0fdf4' : '#fef2f2', color: alert.type === 'success' ? '#166534' : '#991b1b', border: `1px solid ${alert.type === 'success' ? '#86efac' : '#fca5a5'}` }}>{alert.message}</div>}

      <div className="flex gap-2 mb-5">
        {[{ id: 'deposits', label: '💰 Deposits' }, { id: 'expenses', label: '💸 Expenses' }].map(t => (
          <button key={t.id} onClick={() => setBankSubTab(t.id)}
            style={{ padding: '8px 20px', borderRadius: 20, fontSize: '0.85rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: bankSubTab === t.id ? '#c41e3a' : '#f1f5f9', color: bankSubTab === t.id ? '#fff' : '#64748b' }}>
            {t.label}
          </button>
        ))}
      </div>

      {bankSubTab === 'deposits' && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Bank Deposits</h3></CardHeader>
          <Table
            columns={[
              { header: 'Date', render: r => formatDateTime(r.deposit_date || r.date || r.created_at) },
              { header: 'Amount', render: r => <span className="font-bold text-green-600">{formatCurrency(r.amount)}</span> },
              { header: 'Bank', render: r => r.bank_name || r.bankName || '-' },
              { header: 'Reference', render: r => r.reference || r.slip_number || '-' },
              { header: 'Status', render: r => <Badge variant={r.status === 'verified' ? 'success' : 'warning'}>{r.status || 'Pending'}</Badge> },
            ]}
            data={deposits}
            emptyMessage="No deposits recorded — click New Deposit to start"
          />
        </Card>
      )}

      {bankSubTab === 'expenses' && (
        <Card>
          <CardHeader className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Branch Expenses</h3>
            <div style={{ fontWeight: 700, color: '#c41e3a', fontSize: '0.9rem' }}>Total: {formatCurrency(expenses.reduce((s, e) => s + Number(e.amount || 0), 0))}</div>
          </CardHeader>
          <Table
            columns={[
              { header: 'Date', render: r => formatDateTime(r.date || r.created_at) },
              { header: 'Category', render: r => <Badge variant="info">{r.category || '-'}</Badge> },
              { header: 'Description', render: r => <span className="text-sm">{r.description || '-'}</span> },
              { header: 'Amount', render: r => <span className="font-bold text-red-600">{formatCurrency(r.amount)}</span> },
              { header: 'Receipt Ref', render: r => r.receipt_ref || r.receiptRef || '-' },
              { header: 'Status', render: r => <Badge variant={r.status === 'approved' ? 'success' : 'warning'}>{r.status || 'Pending'}</Badge> },
            ]}
            data={expenses}
            emptyMessage="No expenses recorded — click Record Expense to start"
          />
        </Card>
      )}

      {/* Deposit Form Modal */}
      {showDepositForm && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowDepositForm(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(3px)' }}>
          <div style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 30px 80px rgba(196,30,58,0.2)' }}>
            <div style={{ background: 'linear-gradient(135deg,#166534,#15803d)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 800 }}>💰 Record Bank Deposit</div>
              <button onClick={() => setShowDepositForm(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelStyle}>Amount (N$) *</label><input type="number" min="1" value={depositForm.amount} onChange={e => setDepositForm(f => ({ ...f, amount: e.target.value }))} style={inputStyle} placeholder="0.00" /></div>
                <div><label style={labelStyle}>Bank Name *</label><input type="text" value={depositForm.bank_name} onChange={e => setDepositForm(f => ({ ...f, bank_name: e.target.value }))} style={inputStyle} placeholder="e.g. FNB, Standard Bank" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelStyle}>Reference / Slip #</label><input type="text" value={depositForm.reference} onChange={e => setDepositForm(f => ({ ...f, reference: e.target.value }))} style={inputStyle} placeholder="Deposit slip ref" /></div>
                <div><label style={labelStyle}>Deposit Date</label><input type="date" value={depositForm.deposit_date} onChange={e => setDepositForm(f => ({ ...f, deposit_date: e.target.value }))} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>Notes</label><textarea value={depositForm.notes} onChange={e => setDepositForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Optional notes…" style={{ ...inputStyle, resize: 'none' }} /></div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowDepositForm(false)} style={{ flex: 1, padding: '11px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600 }}>Cancel</button>
                <button onClick={submitDeposit} disabled={submitting} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#166534,#15803d)', color: '#fff', fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.65 : 1 }}>{submitting ? '⏳ Saving…' : '💰 Record Deposit'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expense Form Modal */}
      {showExpenseForm && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowExpenseForm(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(3px)' }}>
          <div style={{ width: '100%', maxWidth: 500, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 30px 80px rgba(196,30,58,0.2)' }}>
            <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 800 }}>💸 Record Branch Expense</div>
              <button onClick={() => setShowExpenseForm(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Expense Category *</label>
                  <select value={expenseForm.category} onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                    {['Supplies', 'Transport', 'Maintenance', 'Utilities', 'Marketing', 'Staff Welfare', 'Equipment', 'Cleaning', 'Communication', 'Other'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><label style={labelStyle}>Amount (N$) *</label><input type="number" min="1" value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))} style={inputStyle} placeholder="0.00" /></div>
              </div>
              <div><label style={labelStyle}>Description *</label><textarea value={expenseForm.description} onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Describe the expense…" style={{ ...inputStyle, resize: 'none' }} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelStyle}>Receipt / Ref #</label><input type="text" value={expenseForm.receipt_ref} onChange={e => setExpenseForm(f => ({ ...f, receipt_ref: e.target.value }))} style={inputStyle} placeholder="Receipt reference" /></div>
                <div><label style={labelStyle}>Date</label><input type="date" value={expenseForm.date} onChange={e => setExpenseForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} /></div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowExpenseForm(false)} style={{ flex: 1, padding: '11px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600 }}>Cancel</button>
                <button onClick={submitExpense} disabled={submitting} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.65 : 1 }}>{submitting ? '⏳ Saving…' : '💸 Record Expense'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cash Drawer Modal */}
      {showDrawer && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowDrawer(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(3px)' }}>
          <div style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 30px 80px rgba(196,30,58,0.2)', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e3a5f,#0f2040)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 800 }}>💵 Cash Drawer</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.77rem', marginTop: 2 }}>Daily cash register — {new Date().toLocaleDateString('en-NA', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
              </div>
              <button onClick={() => setShowDrawer(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
              {/* Opening balance */}
              <div style={{ background: '#f4f7fb', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e3a5f', textTransform: 'uppercase', letterSpacing: '.08em', display: 'block', marginBottom: 6 }}>Opening Balance (N$)</label>
                <input type="number" min="0" value={drawerOpening} onChange={e => setDrawerOpening(e.target.value)} placeholder="Enter opening cash amount…" style={{ width: '100%', padding: '10px 14px', border: '2px solid #c8d8e8', borderRadius: 9, fontSize: '1.05rem', fontWeight: 700, outline: 'none', boxSizing: 'border-box', textAlign: 'right' }} />
              </div>

              {/* Add entry */}
              <div style={{ border: '1.5px dashed #fecaca', borderRadius: 12, padding: '14px 16px', marginBottom: 16, background: '#fff8f8' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#c41e3a', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Add Cash Movement</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <select value={drawerEntry.type} onChange={e => setDrawerEntry(d => ({ ...d, type: e.target.value }))} style={{ padding: '8px 12px', border: '1.5px solid #fecaca', borderRadius: 8, fontSize: '0.87rem', fontWeight: 700, color: drawerEntry.type === 'in' ? '#166534' : '#c41e3a', outline: 'none', background: drawerEntry.type === 'in' ? '#f0fdf4' : '#fff0f3' }}>
                    <option value="in">+ Cash In</option>
                    <option value="out">− Cash Out</option>
                  </select>
                  <input type="number" min="1" value={drawerEntry.amount} onChange={e => setDrawerEntry(d => ({ ...d, amount: e.target.value }))} placeholder="Amount" style={{ flex: 1, padding: '8px 12px', border: '1.5px solid #fecaca', borderRadius: 8, fontSize: '0.87rem', fontWeight: 700, outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="text" value={drawerEntry.description} onChange={e => setDrawerEntry(d => ({ ...d, description: e.target.value }))} placeholder="Description (e.g. Sale payment, Petty cash)" style={{ flex: 1, padding: '8px 12px', border: '1.5px solid #fecaca', borderRadius: 8, fontSize: '0.85rem', outline: 'none' }} />
                  <button onClick={addDrawerEntry} style={{ padding: '8px 16px', border: 'none', borderRadius: 8, background: '#c41e3a', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>+ Add</button>
                </div>
              </div>

              {/* Entries */}
              {drawerEntries.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Today's Movements</div>
                  {drawerEntries.map((e, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: e.type === 'in' ? '#f0fdf4' : '#fef2f2', borderRadius: 9, border: `1px solid ${e.type === 'in' ? '#86efac' : '#fca5a5'}`, marginBottom: 6 }}>
                      <div>
                        <span style={{ fontWeight: 700, color: e.type === 'in' ? '#166534' : '#c41e3a', fontSize: '0.85rem' }}>{e.type === 'in' ? '+' : '−'} N$ {Number(e.amount).toFixed(2)}</span>
                        <span style={{ marginLeft: 10, fontSize: '0.8rem', color: '#64748b' }}>{e.description || '—'}</span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{e.time}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Balance summary */}
              <div style={{ background: 'linear-gradient(135deg,#1e3a5f,#0f2040)', borderRadius: 12, padding: '16px 20px', color: '#fff' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, textAlign: 'center' }}>
                  <div><div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', fontWeight: 700 }}>Opening</div><div style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: 4 }}>N$ {Number(drawerOpening || 0).toFixed(2)}</div></div>
                  <div><div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', fontWeight: 700 }}>Movements</div><div style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: 4, color: drawerBalance - Number(drawerOpening || 0) >= 0 ? '#86efac' : '#fca5a5' }}>{drawerBalance - Number(drawerOpening || 0) >= 0 ? '+' : ''}N$ {(drawerBalance - Number(drawerOpening || 0)).toFixed(2)}</div></div>
                  <div><div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', fontWeight: 700 }}>Closing Balance</div><div style={{ fontSize: '1.3rem', fontWeight: 900, marginTop: 4, color: '#fbbf24' }}>N$ {drawerBalance.toFixed(2)}</div></div>
                </div>
              </div>
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
              <button onClick={() => setShowDrawer(false)} style={{ padding: '10px 28px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600 }}>Close</button>
            </div>
          </div>
        </div>
      )}
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

function parseOrderItems(raw) {
  try { return typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []); } catch { return []; }
}

function OrderItemsTable({ items, customerType }) {
  if (!items || items.length === 0) return <p className="text-xs text-gray-400 italic">No product details available.</p>;
  const isMember = customerType === 'member';
  const subtotal = items.reduce((s, i) => s + Number(i.unit_price || i.dp || i.cp || 0) * Number(i.quantity || 1), 0);
  return (
    <table className="w-full text-xs border-collapse mt-2">
      <thead>
        <tr style={{ background: '#f8fafc' }}>
          <th className="text-left py-1 px-2 border-b text-gray-500 font-semibold">Product</th>
          <th className="text-center py-1 px-2 border-b text-gray-500 font-semibold">Qty</th>
          <th className="text-right py-1 px-2 border-b text-gray-500 font-semibold">Unit Price</th>
          <th className="text-right py-1 px-2 border-b text-gray-500 font-semibold">BV</th>
          <th className="text-right py-1 px-2 border-b text-gray-500 font-semibold">Line Total</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => {
          const qty = Number(item.quantity || 1);
          const price = Number(item.unit_price || (isMember ? item.dp : item.cp) || 0);
          const bv = Number(item.bv || 0);
          return (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
              <td className="py-1 px-2 border-b font-medium text-gray-800">{item.product_name || item.name || item.description || '-'}</td>
              <td className="py-1 px-2 border-b text-center text-gray-700">{qty}</td>
              <td className="py-1 px-2 border-b text-right text-gray-700">{formatCurrency(price)}</td>
              <td className="py-1 px-2 border-b text-right text-blue-600">{(bv * qty).toFixed(1)}</td>
              <td className="py-1 px-2 border-b text-right font-bold text-green-700">{formatCurrency(price * qty)}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr style={{ background: '#fff8f8' }}>
          <td colSpan={4} className="py-1 px-2 border-t-2 font-bold text-right text-gray-700">Subtotal:</td>
          <td className="py-1 px-2 border-t-2 font-bold text-right text-green-800">{formatCurrency(subtotal)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function OrderPaymentModal({ order, onClose, onPaid }) {
  const [method, setMethod] = useState('cash');
  const [cashGiven, setCashGiven] = useState('');
  const [cardRef, setCardRef] = useState('');
  const [partialCash, setPartialCash] = useState('');
  const [partialCard, setPartialCard] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const total = Number(order.total_amount || order.total || 0);
  const cashChange = method === 'cash' ? Math.max(0, Number(cashGiven || 0) - total) : 0;
  const partialTotal = Number(partialCash || 0) + Number(partialCard || 0);
  const partialValid = Math.abs(partialTotal - total) < 0.01;

  const handlePay = async () => {
    setErr('');
    if (method === 'cash' && Number(cashGiven || 0) < total) { setErr(`Cash given must be at least ${formatCurrency(total)}`); return; }
    if (method === 'card' && !cardRef.trim()) { setErr('Please enter card/EFT reference number.'); return; }
    if (method === 'partial' && !partialValid) { setErr(`Partial amounts must total exactly ${formatCurrency(total)} (currently ${formatCurrency(partialTotal)})`); return; }
    setSaving(true);
    try {
      await api.orders.update(order.id, {
        payment_status: 'paid',
        payment_method: method === 'partial' ? `Cash N$${partialCash} + Card N$${partialCard}` : method,
        status: 'delivered',
      });
      onPaid(order.id, method);
      onClose();
    } catch (e) { setErr(e.message || 'Payment failed'); }
    setSaving(false);
  };

  const btnStyle = (m) => ({
    flex: 1, padding: '10px 8px', borderRadius: 8, border: method === m ? '2px solid #c41e3a' : '2px solid #e5e7eb',
    background: method === m ? '#fff5f5' : '#fff', fontWeight: 700, fontSize: '0.82rem',
    cursor: 'pointer', color: method === m ? '#c41e3a' : '#374151',
  });

  return (
    <Modal title={`💳 Process Payment — ${order.order_number || order.id}`} onClose={onClose}>
      <div className="p-5 space-y-4">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Customer</span><span className="font-semibold">{order.customer_name || '-'}</span></div>
          <div className="flex justify-between mt-1"><span className="text-gray-500">Type</span>
            <span className={`font-semibold ${order.customer_type === 'member' ? 'text-blue-600' : 'text-gray-700'}`}>
              {order.customer_type === 'member' ? '👤 Member (DP)' : '🚶 Non-Member (CP)'}
            </span>
          </div>
          {order.delivery_method && <div className="flex justify-between mt-1"><span className="text-gray-500">Delivery</span><span className="font-semibold capitalize">{order.delivery_method}</span></div>}
          {Number(order.delivery_fee) > 0 && <div className="flex justify-between mt-1"><span className="text-gray-500">Delivery Fee</span><span className="font-semibold">{formatCurrency(order.delivery_fee)}</span></div>}
          <div className="flex justify-between mt-2 pt-2 border-t border-gray-200">
            <span className="font-bold text-gray-700">TOTAL DUE</span>
            <span className="font-bold text-lg text-red-700">{formatCurrency(total)}</span>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Payment Method</p>
          <div className="flex gap-2">
            <button style={btnStyle('cash')} onClick={() => setMethod('cash')}>💵 Cash</button>
            <button style={btnStyle('card')} onClick={() => setMethod('card')}>💳 Card / EFT</button>
            <button style={btnStyle('partial')} onClick={() => setMethod('partial')}>⚖️ Partial</button>
          </div>
        </div>

        {method === 'cash' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Cash Given (N$)</label>
            <input type="number" min={total} step="0.01" value={cashGiven} onChange={e => setCashGiven(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" placeholder="0.00" />
            {Number(cashGiven) >= total && (
              <div className="bg-green-50 border border-green-200 rounded p-2 text-sm font-bold text-green-700">
                Change to give: {formatCurrency(cashChange)}
              </div>
            )}
          </div>
        )}

        {method === 'card' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Card / EFT Reference #</label>
            <input type="text" value={cardRef} onChange={e => setCardRef(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" placeholder="e.g. TXN123456" />
          </div>
        )}

        {method === 'partial' && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">Cash + Card split must equal {formatCurrency(total)}</p>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Cash (N$)</label>
                <input type="number" min="0" step="0.01" value={partialCash} onChange={e => setPartialCash(e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Card / EFT (N$)</label>
                <input type="number" min="0" step="0.01" value={partialCard} onChange={e => setPartialCard(e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" />
              </div>
            </div>
            <div className={`text-xs font-bold ${partialValid ? 'text-green-700' : 'text-red-600'}`}>
              Total: {formatCurrency(partialTotal)} {partialValid ? '✓ Matches' : `(need ${formatCurrency(total - partialTotal)} more)`}
            </div>
          </div>
        )}

        {err && <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700">{err}</div>}

        <div className="flex gap-3 pt-1">
          <button onClick={handlePay} disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-white font-bold text-sm disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#27ae60,#1e8449)' }}>
            {saving ? 'Processing…' : `✓ Confirm Payment ${formatCurrency(total)}`}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-600 font-medium text-sm hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

function OnlineOrdersTab() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [alert, setAlert] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [statusFilter, setStatusFilter] = useState('active');

  const loadOrders = async () => {
    setLoading(true);
    try {
      const d = await api.orders.list();
      const all = Array.isArray(d) ? d : d.orders || [];
      const branchOrders = user?.branch
        ? all.filter(o => (o.branch_id || o.branch || '').toLowerCase() === user.branch.toLowerCase()
            || (o.branch_name || '').toLowerCase().includes(user.branch.toLowerCase()))
        : all;
      setOrders(branchOrders);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadOrders(); }, []);

  const updateStatus = async (id, status) => {
    setUpdating(id);
    setAlert(null);
    try {
      await api.orders.update(id, { status });
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
      setAlert({ type: 'success', message: status === 'delivered' ? 'Order marked delivered.' : `Order status updated to ${status}.` });
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to update order' });
    } finally { setUpdating(null); }
  };

  const onPaid = (id, method) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, payment_status: 'paid', payment_method: method, status: 'delivered' } : o));
    setAlert({ type: 'success', message: 'Payment processed. Order marked as delivered.' });
  };

  const statusBadge = (status) => {
    const map = { pending: 'warning', processing: 'info', shipped: 'primary', delivered: 'success', completed: 'success', cancelled: 'danger' };
    return <Badge variant={map[status] || 'default'}>{status}</Badge>;
  };

  const payBadge = (ps) => {
    if (ps === 'paid') return <span className="text-xs font-bold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">✓ Paid</span>;
    return <span className="text-xs font-bold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">⏳ Unpaid</span>;
  };

  if (loading) return <LoadingSpinner />;

  const filterMap = {
    active: orders.filter(o => ['pending','processing','shipped'].includes(o.status)),
    completed: orders.filter(o => ['delivered','completed'].includes(o.status)),
    cancelled: orders.filter(o => o.status === 'cancelled'),
    all: orders,
  };

  const displayed = filterMap[statusFilter] || orders;

  const stats = {
    pending: orders.filter(o => o.status === 'pending').length,
    processing: orders.filter(o => o.status === 'processing').length,
    delivered: orders.filter(o => ['delivered','completed'].includes(o.status)).length,
    unpaid: orders.filter(o => o.payment_status !== 'paid' && ['shipped','delivered'].includes(o.status)).length,
  };

  return (
    <div>
      <div className="rounded-xl p-5 mb-5" style={{ background: 'linear-gradient(135deg, #1e3a5f, #2980b9)' }}>
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div>
            <h3 className="text-white text-lg font-bold m-0">🛍️ Online Orders{user?.branch ? ` — ${user.branch}` : ''}</h3>
            <p className="text-white/75 text-sm mt-1 m-0">Full order details, product breakdown, and payment processing.</p>
          </div>
          <button onClick={loadOrders} className="px-4 py-2.5 rounded-lg text-white text-sm font-semibold cursor-pointer border-none" style={{ background: 'linear-gradient(135deg, #27ae60, #1e8449)' }}>🔄 Refresh</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {[['Pending',stats.pending,'#fbbf24'],['Processing',stats.processing,'#60a5fa'],['Delivered',stats.delivered,'#4ade80'],['Unpaid',stats.unpaid,'#f87171']].map(([l,v,c]) => (
            <div key={l} className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-white/70 text-xs mb-0.5">{l}</p>
              <p className="text-2xl font-bold" style={{ color: c }}>{v}</p>
            </div>
          ))}
        </div>
      </div>

      {alert && <Alert type={alert.type} className="mb-4">{alert.message}</Alert>}

      <div className="flex gap-2 mb-4 flex-wrap">
        {[['active','Active Orders'],['completed','Completed'],['cancelled','Cancelled'],['all','All']].map(([key,lbl]) => (
          <button key={key} onClick={() => setStatusFilter(key)}
            className="px-4 py-1.5 rounded-full text-sm font-semibold border cursor-pointer transition-all"
            style={{ background: statusFilter === key ? '#1e3a5f' : '#f1f5f9', color: statusFilter === key ? '#fff' : '#475569', borderColor: statusFilter === key ? '#1e3a5f' : '#e2e8f0' }}>
            {lbl} {key === 'active' && stats.pending + stats.processing > 0 && <span className="ml-1 bg-yellow-400 text-yellow-900 rounded-full px-1.5 text-xs">{stats.pending + stats.processing}</span>}
          </button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-100">
          <p className="text-lg">📭 No {statusFilter === 'all' ? '' : statusFilter} orders</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map(order => {
            const items = parseOrderItems(order.items);
            const isExpanded = expandedId === order.id;
            const totalBV = items.reduce((s, i) => s + Number(i.bv || 0) * Number(i.quantity || 1), 0);

            return (
              <div key={order.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="p-4">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-800">{order.order_number || order.id}</span>
                        {statusBadge(order.status)}
                        {payBadge(order.payment_status)}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${order.customer_type === 'member' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-gray-50 text-gray-600 border border-gray-200'}`}>
                          {order.customer_type === 'member' ? '👤 Member (DP)' : '🚶 Non-Member (CP)'}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-gray-700 mt-1">{order.customer_name || '-'}</p>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                        <span>📅 {formatDateTime(order.created_at)}</span>
                        {order.delivery_method && <span>🚚 {order.delivery_method}</span>}
                        {order.payment_method && <span>💳 {order.payment_method}</span>}
                        {order.distributor_code && order.distributor_code !== 'NB005676' && <span>🔗 Ref: {order.distributor_code}</span>}
                        <span>📦 {items.length} product{items.length !== 1 ? 's' : ''} · BV: {totalBV.toFixed(1)}</span>
                      </div>
                    </div>
                    <div className="text-right ml-3">
                      <p className="text-lg font-bold text-green-700">{formatCurrency(order.total_amount || order.total || 0)}</p>
                      {Number(order.delivery_fee) > 0 && <p className="text-xs text-gray-500">incl. delivery {formatCurrency(order.delivery_fee)}</p>}
                    </div>
                  </div>

                  <div className="flex gap-2 mt-3 flex-wrap">
                    <button onClick={() => setExpandedId(isExpanded ? null : order.id)}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer">
                      {isExpanded ? '▲ Hide Products' : `▼ Show Products (${items.length})`}
                    </button>
                    {order.status === 'pending' && (
                      <button onClick={() => updateStatus(order.id, 'processing')} disabled={updating === order.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white cursor-pointer border-none"
                        style={{ background: '#d97706' }}>⚙️ Process</button>
                    )}
                    {order.status === 'processing' && (
                      <button onClick={() => updateStatus(order.id, 'shipped')} disabled={updating === order.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white cursor-pointer border-none"
                        style={{ background: '#2563eb' }}>🚚 Ship</button>
                    )}
                    {order.status === 'shipped' && order.payment_status !== 'paid' && (
                      <button onClick={() => setPaymentOrder(order)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white cursor-pointer border-none"
                        style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)' }}>💳 Process Payment</button>
                    )}
                    {order.status === 'shipped' && order.payment_status === 'paid' && (
                      <button onClick={() => updateStatus(order.id, 'delivered')} disabled={updating === order.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white cursor-pointer border-none"
                        style={{ background: '#16a34a' }}>✓ Mark Delivered</button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/60">
                    <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Order Items — Price shown is {order.customer_type === 'member' ? 'Distributor Price (DP)' : 'Consumer Price (CP)'}</p>
                    <OrderItemsTable items={items} customerType={order.customer_type} />
                    {order.notes && <p className="text-xs text-gray-500 mt-2"><strong>Notes:</strong> {order.notes}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {paymentOrder && (
        <OrderPaymentModal
          order={paymentOrder}
          onClose={() => setPaymentOrder(null)}
          onPaid={onPaid}
        />
      )}
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
  const { user } = useAuth();
  const [alert, setAlert] = useState(null);
  const [staffSubTab, setStaffSubTab] = useState('leave');

  // Leave state
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveLoading, setLeaveLoading] = useState(true);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ type: 'Annual', startDate: '', endDate: '', reason: '', urgent: false });

  // Cash state
  const [cashRequests, setCashRequests] = useState([]);
  const [cashLoading, setCashLoading] = useState(true);
  const [showCashForm, setShowCashForm] = useState(false);
  const [cashSubmitting, setCashSubmitting] = useState(false);
  const [cashForm, setCashForm] = useState({ amount: '', purpose: '', neededBy: '', urgent: false });

  useEffect(() => {
    api.get('/leave-requests').then(d => setLeaveRequests(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLeaveLoading(false));
    api.get('/cash-requests').then(d => setCashRequests(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setCashLoading(false));
  }, []);

  const refreshLeave = () => api.get('/leave-requests').then(d => setLeaveRequests(Array.isArray(d) ? d : [])).catch(() => {});
  const refreshCash = () => api.get('/cash-requests').then(d => setCashRequests(Array.isArray(d) ? d : [])).catch(() => {});

  const submitLeave = async () => {
    if (!leaveForm.startDate || !leaveForm.endDate || !leaveForm.reason.trim()) {
      setAlert({ type: 'error', message: 'Please fill in all required fields' }); return;
    }
    setLeaveSubmitting(true);
    try {
      await api.post('/leave-requests', { type: leaveForm.type, startDate: leaveForm.startDate, endDate: leaveForm.endDate, reason: leaveForm.reason, urgent: leaveForm.urgent });
      setAlert({ type: 'success', message: 'Leave request submitted successfully' });
      setLeaveForm({ type: 'Annual', startDate: '', endDate: '', reason: '', urgent: false });
      setShowLeaveForm(false);
      await refreshLeave();
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to submit leave request' });
    } finally { setLeaveSubmitting(false); }
  };

  const submitCash = async () => {
    if (!cashForm.amount || Number(cashForm.amount) <= 0 || !cashForm.purpose.trim()) {
      setAlert({ type: 'error', message: 'Please enter a valid amount and purpose' }); return;
    }
    setCashSubmitting(true);
    try {
      await api.post('/cash-requests', { amount: Number(cashForm.amount), purpose: cashForm.purpose, neededBy: cashForm.neededBy, urgent: cashForm.urgent });
      setAlert({ type: 'success', message: 'Cash request submitted successfully' });
      setCashForm({ amount: '', purpose: '', neededBy: '', urgent: false });
      setShowCashForm(false);
      await refreshCash();
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to submit cash request' });
    } finally { setCashSubmitting(false); }
  };

  const leaveTypeColor = (t) => ({ Annual: '#166534', Sick: '#9a3412', Emergency: '#7c2d12', Unpaid: '#374151' }[t] || '#374151');
  const statusBadge = (s) => {
    const colors = { Pending: { bg: '#fffbeb', color: '#92400e', border: '#fcd34d' }, Approved: { bg: '#f0fdf4', color: '#166534', border: '#86efac' }, Rejected: { bg: '#fef2f2', color: '#991b1b', border: '#fca5a5' } };
    const c = colors[s] || colors.Pending;
    return <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.73rem', fontWeight: 700, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>{s || 'Pending'}</span>;
  };

  return (
    <div>
      <div className="rounded-xl p-5 mb-5 flex justify-between items-center flex-wrap gap-3" style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', boxShadow: '0 4px 20px rgba(196,30,58,0.28)' }}>
        <div>
          <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1 m-0">Staff Services</p>
          <h3 className="text-white text-lg font-bold m-0">👤 Leave & Cash Management</h3>
          <p className="text-white/70 text-sm mt-1 m-0">Submit and track your leave and cash requests</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowLeaveForm(true); setAlert(null); setStaffSubTab('leave'); }} className="px-4 py-2 rounded-full font-semibold text-sm cursor-pointer" style={{ background: '#fff', color: '#c41e3a', border: 'none', fontWeight: 700 }}>📅 Request Leave</button>
          <button onClick={() => { setShowCashForm(true); setAlert(null); setStaffSubTab('cash'); }} className="px-4 py-2 rounded-full font-semibold text-sm cursor-pointer text-white" style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)' }}>💵 Request Cash</button>
        </div>
      </div>

      {alert && <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: alert.type === 'success' ? '#f0fdf4' : '#fef2f2', color: alert.type === 'success' ? '#166534' : '#991b1b', border: `1px solid ${alert.type === 'success' ? '#86efac' : '#fca5a5'}` }}>{alert.message}</div>}

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-5">
        {[{ id: 'leave', label: '📅 Leave Requests' }, { id: 'cash', label: '💵 Cash Requests' }].map(t => (
          <button key={t.id} onClick={() => setStaffSubTab(t.id)}
            style={{ padding: '8px 20px', borderRadius: 20, fontSize: '0.85rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: staffSubTab === t.id ? '#c41e3a' : '#f1f5f9', color: staffSubTab === t.id ? '#fff' : '#64748b', transition: 'all 0.2s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Leave Requests */}
      {staffSubTab === 'leave' && (
        <Card>
          <CardHeader className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">My Leave Requests</h3>
            <button onClick={refreshLeave} className="px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer" style={{ background: '#f9f5f5', color: '#64748b' }}>🔄 Refresh</button>
          </CardHeader>
          {leaveLoading ? <div className="p-6 text-center text-gray-400">Loading…</div> : leaveRequests.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <div className="text-4xl mb-3">📅</div>
              <p className="font-semibold text-gray-500">No leave requests yet</p>
              <p className="text-sm mt-1">Click "Request Leave" to submit your first request</p>
            </div>
          ) : (
            <div className="divide-y">
              {leaveRequests.map((r, i) => (
                <div key={r.id || i} style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 800, background: '#fff0f3', color: leaveTypeColor(r.type), border: `1px solid #fecaca` }}>{r.type || 'Annual'}</span>
                      {r.urgent && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}>URGENT</span>}
                      {statusBadge(r.status)}
                    </div>
                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem' }}>{r.startDate} → {r.endDate}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>{r.reason}</div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'right' }}>{r.submittedAt ? new Date(r.submittedAt).toLocaleDateString('en-NA') : '-'}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Cash Requests */}
      {staffSubTab === 'cash' && (
        <Card>
          <CardHeader className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">My Cash Requests</h3>
            <button onClick={refreshCash} className="px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer" style={{ background: '#f9f5f5', color: '#64748b' }}>🔄 Refresh</button>
          </CardHeader>
          {cashLoading ? <div className="p-6 text-center text-gray-400">Loading…</div> : cashRequests.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <div className="text-4xl mb-3">💵</div>
              <p className="font-semibold text-gray-500">No cash requests yet</p>
              <p className="text-sm mt-1">Click "Request Cash" to submit a cash request</p>
            </div>
          ) : (
            <div className="divide-y">
              {cashRequests.map((r, i) => (
                <div key={r.id || i} style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, color: '#166534', fontSize: '0.95rem' }}>N$ {Number(r.amount || 0).toFixed(2)}</span>
                      {r.urgent && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}>URGENT</span>}
                      {statusBadge(r.status)}
                    </div>
                    <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.88rem' }}>{r.purpose}</div>
                    {r.neededBy && <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>Needed by: {r.neededBy}</div>}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'right' }}>{r.submittedAt ? new Date(r.submittedAt).toLocaleDateString('en-NA') : '-'}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Leave Request Form Modal */}
      {showLeaveForm && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowLeaveForm(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(3px)' }}>
          <div style={{ width: '100%', maxWidth: 500, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 30px 80px rgba(196,30,58,0.2)' }}>
            <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 800 }}>📅 Submit Leave Request</div>
              <button onClick={() => setShowLeaveForm(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Leave Type *</label>
                <select value={leaveForm.type} onChange={e => setLeaveForm(f => ({ ...f, type: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.9rem', outline: 'none' }}>
                  {['Annual', 'Sick', 'Emergency', 'Unpaid', 'Maternity', 'Study'].map(t => <option key={t} value={t}>{t} Leave</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Start Date *</label>
                  <input type="date" value={leaveForm.startDate} onChange={e => setLeaveForm(f => ({ ...f, startDate: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>End Date *</label>
                  <input type="date" value={leaveForm.endDate} min={leaveForm.startDate} onChange={e => setLeaveForm(f => ({ ...f, endDate: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Reason / Notes *</label>
                <textarea value={leaveForm.reason} onChange={e => setLeaveForm(f => ({ ...f, reason: e.target.value }))} rows={3} placeholder="Please provide a reason for your leave request…" style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.87rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: '#dc2626', userSelect: 'none' }}>
                <input type="checkbox" checked={leaveForm.urgent} onChange={e => setLeaveForm(f => ({ ...f, urgent: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#c41e3a' }} />
                Mark as URGENT (requires immediate approval)
              </label>
              <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                <button onClick={() => setShowLeaveForm(false)} style={{ flex: 1, padding: '11px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600, fontSize: '0.9rem' }}>Cancel</button>
                <button onClick={submitLeave} disabled={leaveSubmitting} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', fontWeight: 800, cursor: leaveSubmitting ? 'not-allowed' : 'pointer', fontSize: '0.9rem', opacity: leaveSubmitting ? 0.65 : 1 }}>
                  {leaveSubmitting ? '⏳ Submitting…' : '📅 Submit Leave Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cash Request Form Modal */}
      {showCashForm && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowCashForm(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(3px)' }}>
          <div style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 30px 80px rgba(196,30,58,0.2)' }}>
            <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 800 }}>💵 Submit Cash Request</div>
              <button onClick={() => setShowCashForm(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Amount Requested (N$) *</label>
                <input type="number" min="1" value={cashForm.amount} onChange={e => setCashForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '1rem', fontWeight: 700, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Purpose / Reason *</label>
                <textarea value={cashForm.purpose} onChange={e => setCashForm(f => ({ ...f, purpose: e.target.value }))} rows={3} placeholder="Describe what the cash will be used for…" style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.87rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Date Needed By</label>
                <input type="date" value={cashForm.neededBy} onChange={e => setCashForm(f => ({ ...f, neededBy: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: '#dc2626', userSelect: 'none' }}>
                <input type="checkbox" checked={cashForm.urgent} onChange={e => setCashForm(f => ({ ...f, urgent: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#c41e3a' }} />
                Mark as URGENT
              </label>
              <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                <button onClick={() => setShowCashForm(false)} style={{ flex: 1, padding: '11px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600, fontSize: '0.9rem' }}>Cancel</button>
                <button onClick={submitCash} disabled={cashSubmitting} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', fontWeight: 800, cursor: cashSubmitting ? 'not-allowed' : 'pointer', fontSize: '0.9rem', opacity: cashSubmitting ? 0.65 : 1 }}>
                  {cashSubmitting ? '⏳ Submitting…' : '💵 Submit Cash Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DistributorRegTab() {
  const { user } = useAuth();
  return <MembershipAgreementForm mode="branch" userBranch={user?.branch} />;
}

function printFieldRequestDoc(req, branchName) {
  const prods = Array.isArray(req.products) ? req.products : [];
  const rows = prods.map((p, i) => `<tr><td>${i+1}</td><td>${p.product_name||'-'}</td><td style="text-align:center">${p.quantity||0}</td><td>${p.unit||'units'}</td><td style="width:120px;border-bottom:1px solid #ccc">&nbsp;</td></tr>`).join('');
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Field Program Request — ${req.id}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; padding: 28px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #c41e3a; padding-bottom: 12px; margin-bottom: 18px; }
    .company { color: #c41e3a; font-weight: 900; font-size: 16px; }
    .title { font-size: 14px; font-weight: 800; color: #8b0000; margin-top: 4px; }
    .meta { text-align: right; color: #64748b; font-size: 10px; line-height: 1.7; }
    .section { margin-bottom: 16px; }
    .section-title { font-size: 9px; font-weight: 800; color: #c41e3a; text-transform: uppercase; letter-spacing: .12em; margin-bottom: 8px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .info-box { background: #fdf7f8; border: 1px solid #f0e8ea; border-radius: 6px; padding: 8px 12px; }
    .info-label { font-size: 9px; color: #94a3b8; text-transform: uppercase; font-weight: 700; }
    .info-value { font-size: 12px; font-weight: 800; color: #1e293b; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th { background: #c41e3a; color: #fff; font-weight: 700; padding: 7px 8px; text-align: left; font-size: 10px; }
    td { padding: 7px 8px; border-bottom: 1px solid #f1f5f9; font-size: 10px; }
    tr:nth-child(even) td { background: #fdf7f8; }
    .terms { background: #fff8f8; border: 1.5px solid #fecaca; border-radius: 6px; padding: 12px; margin-top: 16px; font-size: 9.5px; line-height: 1.6; }
    .terms h4 { color: #c41e3a; font-size: 10px; margin-bottom: 8px; }
    .sig-area { margin-top: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .sig-box { border-top: 2px solid #c41e3a; padding-top: 6px; }
    .sig-label { font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase; }
    .sig-value { font-size: 11px; font-weight: 800; color: #1e293b; margin-top: 3px; font-style: italic; }
    .copy-label { text-align: center; margin-top: 20px; font-size: 9px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; border-top: 1px dashed #e2e8f0; padding-top: 8px; }
    .print-btn { position:fixed; top:12px; right:12px; background:#c41e3a; color:#fff; border:none; padding:8px 18px; border-radius:8px; font-weight:700; cursor:pointer; font-size:12px; }
    @media print { .print-btn { display:none; } }
  </style></head><body>
  <button class="print-btn" onclick="window.print()">🖨️ Print</button>
  <div class="header">
    <div><div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div><div class="title">🚐 Field Program Stock Request</div><div style="color:#64748b;font-size:10px;margin-top:3px">${branchName ? branchName + ' Branch' : ''}</div></div>
    <div class="meta">Request ID: <strong>${req.id||'-'}</strong><br>Date: ${req.date ? new Date(req.date).toLocaleDateString('en-NA',{day:'2-digit',month:'long',year:'numeric'}) : '-'}<br>Status: <strong>${(req.status||'Pending').toUpperCase()}</strong><br>Printed: ${new Date().toLocaleDateString('en-NA')}</div>
  </div>
  <div class="section">
    <div class="section-title">Distributor Details</div>
    <div class="info-grid">
      <div class="info-box"><div class="info-label">Full Name</div><div class="info-value">${req.distributor_name||'-'}</div></div>
      <div class="info-box"><div class="info-label">NB Number</div><div class="info-value">${req.distributor_code||'-'}</div></div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">Requested Products</div>
    <table><thead><tr><th>#</th><th>Product Name</th><th style="text-align:center">Qty</th><th>Unit</th><th>Verified Qty</th></tr></thead><tbody>${rows}</tbody></table>
  </div>
  ${req.notes ? `<div class="section"><div class="section-title">Notes / Purpose</div><div style="padding:8px 12px;background:#fdf7f8;border-radius:6px;font-size:10.5px">${req.notes}</div></div>` : ''}
  <div class="terms">
    <h4>Terms and Conditions of Stock Handling Commitment</h4>
    <ol style="padding-left:16px">
      <li><strong>Stock Accountability:</strong> The distributor is fully responsible for all stock received and must account for every item.</li>
      <li><strong>FEFO Compliance:</strong> Stock will be issued following First Expired First Out (FEFO) principles.</li>
      <li><strong>Storage Requirements:</strong> Stock must be stored in appropriate conditions as per product specifications.</li>
      <li><strong>Damage/Loss Reporting:</strong> Any damaged or lost stock must be reported immediately to the branch manager.</li>
      <li><strong>Return Policy:</strong> Unused stock may be returned within 30 days if in original condition and packaging.</li>
      <li><strong>Sales Records:</strong> Complete sales records must be maintained and submitted as required.</li>
      <li><strong>Payment Terms:</strong> Payment for stock must be made according to agreed terms.</li>
      <li><strong>Compliance:</strong> All stock must be used/sold in compliance with Dynapharm policies and local regulations.</li>
    </ol>
  </div>
  <div class="sig-area">
    <div class="sig-box"><div class="sig-label">Distributor Signature</div><div class="sig-value">${req.signature||'&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}</div><div style="font-size:9px;color:#94a3b8;margin-top:2px">${req.distributor_name||''}</div></div>
    <div class="sig-box"><div class="sig-label">Branch Manager Signature</div><div class="sig-value">&nbsp;</div><div style="font-size:9px;color:#94a3b8;margin-top:2px">Date: ___________________</div></div>
  </div>
  <div class="copy-label">DISTRIBUTOR COPY — Please keep this copy for your records</div>
  </body></html>`);
  win.document.close();
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
  const [productRows, setProductRows] = useState([{ product: '', quantity: '', unit: '', suggestions: [], showSug: false }]);
  const [requestDate, setRequestDate] = useState(new Date().toISOString().slice(0, 10));
  const [requestBranch, setRequestBranch] = useState(user?.branch || '');
  const [requestNotes, setRequestNotes] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [signature, setSignature] = useState('');
  const [catalogue, setCatalogue] = useState([]);
  const [lastSubmitted, setLastSubmitted] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/field_program_requests').catch(() => []),
      api.products.list().catch(() => []),
    ]).then(([d, prods]) => {
      setActivities(Array.isArray(d) ? d : d.activities || d.requests || []);
      setCatalogue(Array.isArray(prods) ? prods : prods.products || []);
    }).finally(() => setLoading(false));
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

  const addProductRow = () => setProductRows([...productRows, { product: '', quantity: '', unit: '', suggestions: [], showSug: false }]);
  const removeProductRow = (idx) => setProductRows(productRows.filter((_, i) => i !== idx));
  const updateProductRow = (idx, field, val) => {
    const rows = [...productRows];
    rows[idx][field] = val;
    if (field === 'product') {
      const q = val.toLowerCase();
      const filtered = q.length === 0
        ? catalogue.slice(0, 10)
        : catalogue.filter(p => (p.name||p.description||'').toLowerCase().includes(q)).slice(0, 8);
      rows[idx].suggestions = filtered;
      rows[idx].showSug = filtered.length > 0;
    }
    setProductRows(rows);
  };
  const focusProductRow = (idx) => {
    const rows = [...productRows];
    if (!rows[idx].product) {
      rows[idx].suggestions = catalogue.slice(0, 10);
      rows[idx].showSug = rows[idx].suggestions.length > 0;
      setProductRows(rows);
    }
  };
  const blurProductRow = (idx) => {
    setTimeout(() => {
      const rows = [...productRows];
      rows[idx].showSug = false;
      setProductRows(rows);
    }, 180);
  };
  const selectProductSuggestion = (idx, p) => {
    const rows = [...productRows];
    rows[idx].product = p.name || p.description;
    rows[idx].suggestions = [];
    rows[idx].showSug = false;
    setProductRows(rows);
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!selectedDistributor || !agreeTerms || !signature.trim()) return;
    const validProducts = productRows.filter(r => r.product.trim() && r.quantity);
    if (validProducts.length === 0) return;
    setSubmitting(true);
    const reqData = {
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
    };
    try {
      await api.post('/field_program_requests', reqData);
      setAlert({ type: 'success', message: 'Field program request submitted successfully' });
      setLastSubmitted(reqData);
      setShowForm(false);
      setSelectedDistributor(null);
      setDistributorSearch('');
      setProductRows([{ product: '', quantity: '', unit: '', suggestions: [], showSug: false }]);
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
      <div className="rounded-xl p-5 mb-5 flex justify-between items-center flex-wrap gap-3" style={{ background: 'linear-gradient(135deg,#c41e3a 0%,#8b0000 100%)', boxShadow: '0 4px 20px rgba(196,30,58,0.28)' }}>
        <div>
          <h3 className="text-white text-lg font-bold m-0">🚐 Field Program — Stock Requests</h3>
          <p className="text-white/70 text-sm mt-1 m-0">Distributor stock requests for field program activities. FEFO compliant.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="px-5 py-2.5 rounded-full font-bold text-sm cursor-pointer border-none" style={{ background: '#fff', color: '#c41e3a' }}>➕ New Stock Request</button>
      </div>

      {alert && <Alert type={alert.type} className="mb-4" onClose={() => setAlert(null)}>{alert.message}</Alert>}

      {lastSubmitted && (
        <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.87rem', color: '#166534', fontWeight: 600 }}>Last request: <span className="font-mono">{lastSubmitted.id}</span> for {lastSubmitted.distributor_name}</div>
          <button onClick={() => printFieldRequestDoc(lastSubmitted, user?.branch||'')} className="px-4 py-2 rounded-lg text-sm font-bold border-none cursor-pointer" style={{ background: '#c41e3a', color: '#fff' }}>🖨️ Print Distributor Copy</button>
        </div>
      )}

      <Card>
        <CardHeader className="flex justify-between items-center">
          <h3 className="font-bold text-gray-800">Field Program Requests</h3>
          <button onClick={loadActivities} className="px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer" style={{ background: '#f9f5f5', color: '#64748b' }}>🔄 Refresh</button>
        </CardHeader>
        <Table
          columns={[
            { header: 'ID', render: r => <span className="text-xs font-mono">{r.id}</span> },
            { header: 'Distributor', render: r => <div><div className="font-semibold">{r.distributor_name||'-'}</div><div className="text-xs text-gray-400">{r.distributor_code||''}</div></div> },
            { header: 'Date', render: r => formatDate(r.date) },
            { header: 'Products', render: r => { const prods = Array.isArray(r.products)?r.products:[]; return <span className="text-xs text-gray-600">{prods.slice(0,2).map(p=>`${p.product_name} ×${p.quantity}`).join(', ')}{prods.length>2?` +${prods.length-2} more`:''}</span>; }},
            { header: 'Status', render: r => <Badge variant={r.status==='approved'?'success':r.status==='rejected'?'danger':'warning'}>{(r.status||'Pending').replace(/_/g,' ')}</Badge> },
            { header: '', render: r => <button onClick={() => printFieldRequestDoc(r, user?.branch||'')} className="px-3 py-1.5 text-xs rounded-lg font-bold border-none cursor-pointer" style={{ background: '#c41e3a', color: '#fff', whiteSpace: 'nowrap' }}>🖨️ Print</button> },
          ]}
          data={activities}
          emptyMessage="No field program requests yet"
        />
      </Card>

      {/* Field Program Request Form Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', backdropFilter: 'blur(3px)' }}>
          <div style={{ width: '100%', maxWidth: 720, background: '#fff', borderRadius: 22, overflow: 'hidden', maxHeight: '96vh', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(196,30,58,0.25)' }}>
            <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>🚐 Field Program Stock Request</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', marginTop: 2 }}>{user?.branch ? `${user.branch} Branch` : ''} · Distributor verification required</div>
              </div>
              <button onClick={() => setShowForm(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Distributor verification */}
              <div style={{ background: '#fffbeb', border: '2px solid #fcd34d', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '.12em', color: '#92400e', textTransform: 'uppercase', marginBottom: 10 }}>Distributor Verification *</div>
                <div style={{ position: 'relative' }}>
                  <input type="text" value={distributorSearch} onChange={e => searchDistributor(e.target.value)} placeholder="Search by NB number or name…" autoComplete="off"
                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #fcd34d', borderRadius: 9, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box' }} />
                  {distributorResults.length > 0 && (
                    <div style={{ position: 'absolute', zIndex: 100, width: '100%', background: '#fff', border: '1.5px solid #fcd34d', borderRadius: 10, maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 24px rgba(245,158,11,.15)', top: 'calc(100% + 4px)', left: 0 }}>
                      {distributorResults.map((d, i) => (
                        <div key={d.id||i} onClick={() => selectDistributor(d)} style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #fffbeb', fontSize: '0.85rem' }}>
                          <div style={{ fontWeight: 700, color: '#1e293b' }}>{d.distributor_name||d.name}</div>
                          <div style={{ color: '#d97706', fontSize: '0.76rem', marginTop: 2 }}>NB#{d.distributor_code||d.nb_number}{d.mobile_no||d.phone ? ` · ${d.mobile_no||d.phone}` : ''}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {selectedDistributor && (
                  <div style={{ marginTop: 10, padding: '10px 14px', background: '#fff', border: '1px solid #fcd34d', borderRadius: 9, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 800, color: '#92400e' }}>{selectedDistributor.distributor_name||selectedDistributor.name}</div>
                      <div style={{ fontSize: '0.78rem', color: '#d97706', marginTop: 2 }}>NB#{selectedDistributor.distributor_code||selectedDistributor.nb_number} · {selectedDistributor.mobile_no||selectedDistributor.phone||'—'}</div>
                    </div>
                    <button onClick={() => { setSelectedDistributor(null); setDistributorSearch(''); }} style={{ border: 'none', background: '#fef3c7', color: '#d97706', cursor: 'pointer', width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>×</button>
                  </div>
                )}
              </div>

              {/* Date and Branch */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Request Date *</label>
                  <input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Branch *</label>
                  {user?.branch ? (
                    <div style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.87rem', background: '#faf9f9', color: '#374151', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#c41e3a', fontWeight: 700 }}>🏪</span>
                      <span style={{ fontWeight: 700 }}>{user.branch}</span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: 4 }}>(your branch)</span>
                    </div>
                  ) : (
                    <select value={requestBranch} onChange={e => setRequestBranch(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box', background: '#fff', color: '#374151', cursor: 'pointer' }}>
                      <option value="">Select branch…</option>
                      {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  )}
                </div>
              </div>

              {/* Requested Products with catalogue search */}
              <div>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '.12em', color: '#c41e3a', textTransform: 'uppercase', marginBottom: 10 }}>Requested Products *</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {productRows.map((row, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 0.8fr auto', gap: 8, alignItems: 'end' }}>
                      <div style={{ position: 'relative' }}>
                        {idx === 0 && <label style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 3 }}>Product *</label>}
                        <input type="text" value={row.product} onChange={e => updateProductRow(idx, 'product', e.target.value)} onFocus={() => focusProductRow(idx)} onBlur={() => blurProductRow(idx)} placeholder="Click to browse or type to search…"
                          style={{ width: '100%', padding: '8px 11px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                        {row.showSug && row.suggestions.length > 0 && (
                          <div style={{ position: 'absolute', zIndex: 200, width: '100%', background: '#fff', border: '1.5px solid #fecaca', borderRadius: 9, maxHeight: 170, overflowY: 'auto', boxShadow: '0 6px 20px rgba(196,30,58,.12)', top: '100%', left: 0 }}>
                            {row.suggestions.map((p, si) => (
                              <div key={si} onClick={() => selectProductSuggestion(idx, p)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #fff5f5', fontSize: '0.84rem', display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 600 }}>{p.name||p.description}</span>
                                <span style={{ color: '#c41e3a', fontSize: '0.78rem', fontWeight: 700 }}>DP: {formatCurrency(p.dp||p.price||0)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        {idx === 0 && <label style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 3 }}>Qty *</label>}
                        <input type="number" value={row.quantity} onChange={e => updateProductRow(idx, 'quantity', e.target.value)} min="1" placeholder="0"
                          style={{ width: '100%', padding: '8px 11px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', textAlign: 'center' }} />
                      </div>
                      <div>
                        {idx === 0 && <label style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 3 }}>Unit</label>}
                        <input type="text" value={row.unit} onChange={e => updateProductRow(idx, 'unit', e.target.value)} placeholder="boxes"
                          style={{ width: '100%', padding: '8px 11px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                      <button type="button" onClick={() => removeProductRow(idx)} disabled={productRows.length === 1}
                        style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: productRows.length===1?'#f1f5f9':'#fef2f2', color: productRows.length===1?'#94a3b8':'#c41e3a', cursor: productRows.length===1?'not-allowed':'pointer', fontWeight: 700, fontSize: '0.85rem' }}>×</button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addProductRow} style={{ marginTop: 10, padding: '8px 16px', borderRadius: 9, border: '1.5px dashed #fecaca', background: '#fff0f3', color: '#c41e3a', cursor: 'pointer', fontWeight: 700, fontSize: '0.83rem' }}>➕ Add Product Row</button>
              </div>

              {/* Notes */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Purpose / Notes</label>
                <textarea value={requestNotes} onChange={e => setRequestNotes(e.target.value)} rows={3} placeholder="Brief description of field program activity or purpose…"
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.85rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
              </div>

              {/* Terms */}
              <div style={{ background: '#fff8f8', border: '2px solid #fecaca', borderRadius: 11, padding: 16, maxHeight: 220, overflowY: 'auto' }}>
                <div style={{ fontWeight: 800, color: '#c41e3a', fontSize: '0.87rem', marginBottom: 10 }}>Terms and Conditions of Stock Handling Commitment</div>
                <ol style={{ paddingLeft: 16, fontSize: '0.82rem', lineHeight: 1.65, color: '#374151' }}>
                  <li><strong>Stock Accountability:</strong> The distributor is fully responsible for all stock received and must account for every item.</li>
                  <li><strong>FEFO Compliance:</strong> Stock will be issued following First Expired First Out (FEFO) principles.</li>
                  <li><strong>Storage Requirements:</strong> Stock must be stored in appropriate conditions as per product specifications.</li>
                  <li><strong>Damage/Loss Reporting:</strong> Any damaged or lost stock must be reported immediately to the branch manager.</li>
                  <li><strong>Return Policy:</strong> Unused stock may be returned within 30 days if in original condition and packaging.</li>
                  <li><strong>Sales Records:</strong> Complete sales records must be maintained and submitted as required.</li>
                  <li><strong>Payment Terms:</strong> Payment for stock must be made according to agreed terms.</li>
                  <li><strong>Compliance:</strong> All stock must be used/sold in compliance with Dynapharm policies and local regulations.</li>
                </ol>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer', fontSize: '0.83rem', color: '#374151' }}>
                  <input type="checkbox" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#c41e3a' }} />
                  I have read and agree to the Terms and Conditions of Stock Handling Commitment *
                </label>
              </div>

              {/* Signature */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Distributor Signature (Type Full Name) *</label>
                <input type="text" value={signature} onChange={e => setSignature(e.target.value)} placeholder="Type full name as signature"
                  style={{ width: '100%', padding: '10px 14px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', fontStyle: 'italic' }} />
              </div>
            </div>

            {/* Footer buttons */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #f0e8ea', display: 'flex', gap: 10, justifyContent: 'flex-end', background: '#fff', flexShrink: 0 }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '10px 20px', border: '1.5px solid #e8d5d8', borderRadius: 11, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600, fontSize: '0.87rem' }}>Cancel</button>
              <button onClick={handleSubmit} disabled={submitting || !agreeTerms || !selectedDistributor || !signature.trim() || productRows.filter(r=>r.product.trim()&&r.quantity).length===0}
                style={{ padding: '11px 32px', border: 'none', borderRadius: 11, background: 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '0.92rem', opacity: (submitting||!agreeTerms||!selectedDistributor||!signature.trim())?0.55:1, boxShadow: '0 4px 14px rgba(196,30,58,0.3)' }}>
                {submitting ? '⏳ Submitting…' : '✅ Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

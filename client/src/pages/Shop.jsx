import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { formatCurrency, BRANCHES } from '../lib/constants';
import { enrichProductsWithPricing, calculateCartTotals } from '../lib/pricing';
import { Card, Button, Input, Modal, Badge, LoadingSpinner, EmptyState, Alert, Select } from '../components/ui';
import { ShoppingCart, Search, Plus, Minus, Package, User, Users, Truck, Store } from 'lucide-react';

const DEFAULT_REFERRAL_NAME = 'Dynapharm Namibia';
const DEFAULT_REFERRAL_NB = 'NB005676';

export default function Shop() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [category, setCategory] = useState('all');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState('');
  const [orderError, setOrderError] = useState('');

  const [customerType, setCustomerType] = useState(null);
  const [distributors, setDistributors] = useState([]);
  const [selectedDistributor, setSelectedDistributor] = useState(null);
  const [distributorSearch, setDistributorSearch] = useState('');
  const [referralName, setReferralName] = useState('');
  const [referralNB, setReferralNB] = useState('');

  const [checkoutForm, setCheckoutForm] = useState({
    name: '', phone: '', email: '',
    deliveryMethod: 'pickup',
    branch: 'Windhoek CBD',
    address: '',
    paymentMethod: 'cash',
    notes: ''
  });

  const isMember = customerType === 'member';

  useEffect(() => {
    Promise.all([
      api.products.list().then(data => {
        const raw = Array.isArray(data) ? data : data.products || [];
        setProducts(enrichProductsWithPricing(raw));
      }).catch(() => {}),
      api.distributors.list().then(data => {
        const raw = Array.isArray(data) ? data : data.distributors || [];
        setDistributors(raw);
      }).catch(() => []),
    ]).finally(() => setLoading(false));
  }, []);

  const categories = ['all', ...new Set(products.map(p => p.category || 'General').filter(Boolean))];

  const filtered = products.filter(p => {
    const matchesSearch = !search || (p.name || p.description || '').toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'all' || (p.category || 'General') === category;
    return matchesSearch && matchesCategory;
  });

  const addToCart = (product) => {
    if (!customerType) {
      setOrderError('Please select whether you are a Registered Member or Non-Member first.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setCart(prev => {
      const existing = prev.find(c => c.id === product.id);
      if (existing) return prev.map(c => c.id === product.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const updateCartQty = (id, delta) => {
    setCart(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(0, c.qty + delta) } : c).filter(c => c.qty > 0));
  };

  const { items: cartItems, totalAmount, totalBV } = calculateCartTotals(cart, isMember);
  const cartCount = cart.reduce((sum, c) => sum + c.qty, 0);

  const filteredDistributors = distributors.filter(d =>
    !distributorSearch ||
    (d.distributor_name || '').toLowerCase().includes(distributorSearch.toLowerCase()) ||
    (d.distributor_code || '').toLowerCase().includes(distributorSearch.toLowerCase())
  );

  const effectiveReferralName = isMember
    ? (selectedDistributor?.distributor_name || '')
    : (referralName.trim() || DEFAULT_REFERRAL_NAME);
  const effectiveReferralNB = isMember
    ? (selectedDistributor?.distributor_code || '')
    : (referralNB.trim() || DEFAULT_REFERRAL_NB);

  const handleCheckout = async () => {
    setOrderError('');
    if (!checkoutForm.name.trim()) { setOrderError('Please enter your full name'); return; }
    if (!checkoutForm.phone.trim()) { setOrderError('Please enter your phone number'); return; }
    if (isMember && !selectedDistributor) { setOrderError('Please select your NB number from the distributor list'); return; }
    if (checkoutForm.deliveryMethod === 'delivery' && !checkoutForm.address.trim()) { setOrderError('Please enter a delivery address'); return; }

    try {
      await api.orders.create({
        customer_name: checkoutForm.name,
        customer_phone: checkoutForm.phone,
        customer_email: checkoutForm.email,
        customer_type: isMember ? 'member' : 'non-member',
        delivery_method: checkoutForm.deliveryMethod,
        delivery_address: checkoutForm.deliveryMethod === 'delivery' ? checkoutForm.address : undefined,
        subtotal: totalAmount,
        payment_method: checkoutForm.paymentMethod,
        notes: [
          checkoutForm.notes,
          `Referral: ${effectiveReferralName} (${effectiveReferralNB})`,
          `Pricing: ${isMember ? 'DP (Member)' : 'CP (Non-Member)'}`,
        ].filter(Boolean).join(' | '),
        items: cartItems.map(item => ({
          product_id: item.id,
          product_name: item.name || item.description,
          quantity: item.qty,
          unit_price: item.unitPrice,
          bv: item.bv || 0,
        })),
      });
      setOrderSuccess('Order placed successfully! You will be contacted for delivery arrangements.');
      setCart([]);
      setCheckoutOpen(false);
      setCartOpen(false);
    } catch (err) {
      setOrderError(err.message || 'Failed to place order');
    }
  };

  if (loading) return <LoadingSpinner />;

  if (!customerType) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dynapharm Online Shop</h1>
          <p className="text-gray-500">Please select your customer type to continue</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button onClick={() => setCustomerType('member')}
            className="p-8 bg-white rounded-2xl border-2 border-gray-200 hover:border-primary hover:shadow-lg transition-all cursor-pointer text-left group">
            <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
              <Users size={28} className="text-primary" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Registered Member</h3>
            <p className="text-sm text-gray-500 mb-3">I am a Dynapharm distributor with an NB number</p>
            <ul className="text-xs text-gray-400 space-y-1">
              <li>Distributor Price (DP) applies</li>
              <li>Select your NB number from the list</li>
              <li>BV points will be tracked</li>
            </ul>
          </button>
          <button onClick={() => setCustomerType('non-member')}
            className="p-8 bg-white rounded-2xl border-2 border-gray-200 hover:border-primary hover:shadow-lg transition-all cursor-pointer text-left group">
            <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
              <User size={28} className="text-blue-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Non-Member</h3>
            <p className="text-sm text-gray-500 mb-3">I am a regular customer or walk-in</p>
            <ul className="text-xs text-gray-400 space-y-1">
              <li>Consumer Price (CP) applies</li>
              <li>Optional referral field</li>
              <li>Default referral: {DEFAULT_REFERRAL_NAME}</li>
            </ul>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {orderSuccess && (
        <Alert type="success" className="mb-4">
          {orderSuccess}
          <button onClick={() => setOrderSuccess('')} className="ml-3 text-xs underline cursor-pointer">Dismiss</button>
        </Alert>
      )}
      {orderError && (
        <Alert type="error" className="mb-4">
          {orderError}
          <button onClick={() => setOrderError('')} className="ml-3 text-xs underline cursor-pointer">Dismiss</button>
        </Alert>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Product Catalog</h1>
          <p className="text-sm text-gray-500 mt-1">{products.length} products available</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button onClick={() => { setCustomerType('non-member'); setSelectedDistributor(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all cursor-pointer ${!isMember ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>
              <User size={14} /> Non-Member
            </button>
            <button onClick={() => setCustomerType('member')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all cursor-pointer ${isMember ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>
              <Users size={14} /> Member (DP)
            </button>
          </div>
          <div className="relative flex-1 md:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20" />
          </div>
          <button onClick={() => setCartOpen(true)}
            className="relative px-4 py-2 bg-primary text-white rounded-lg hover:opacity-90 flex items-center gap-2 cursor-pointer">
            <ShoppingCart size={18} />
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 w-5 h-5 bg-accent-red text-white text-xs rounded-full flex items-center justify-center font-bold">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {isMember && (
        <div className="mb-4 p-4 bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <Users size={16} className="text-primary" />
            <span className="text-sm font-semibold text-gray-800">Member Purchase — Select Your NB Number</span>
          </div>
          {selectedDistributor ? (
            <div className="flex items-center justify-between bg-white rounded-lg p-3 border border-primary/30">
              <div>
                <span className="font-bold text-primary">{selectedDistributor.distributor_code}</span>
                <span className="text-gray-600 ml-2">{selectedDistributor.distributor_name}</span>
                {selectedDistributor.branch && <span className="text-gray-400 ml-2 text-xs">({selectedDistributor.branch})</span>}
              </div>
              <button onClick={() => setSelectedDistributor(null)} className="text-xs text-primary underline cursor-pointer">Change</button>
            </div>
          ) : (
            <div>
              <input
                value={distributorSearch}
                onChange={e => setDistributorSearch(e.target.value)}
                placeholder="Search by NB number or distributor name..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <div className="max-h-40 overflow-y-auto bg-white rounded-lg border border-gray-200">
                {filteredDistributors.length === 0 ? (
                  <p className="p-3 text-sm text-gray-400 text-center">No distributors found</p>
                ) : (
                  filteredDistributors.slice(0, 20).map(d => (
                    <button key={d.id} onClick={() => { setSelectedDistributor(d); setDistributorSearch(''); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-primary/5 border-b border-gray-100 last:border-0 cursor-pointer transition-colors">
                      <span className="font-semibold text-primary">{d.distributor_code}</span>
                      <span className="text-gray-600 ml-2">{d.distributor_name}</span>
                      {d.branch && <span className="text-gray-400 ml-1 text-xs">- {d.branch}</span>}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {!isMember && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <User size={16} className="text-blue-600" />
            <span className="text-sm font-semibold text-gray-800">Non-Member Purchase — Referral (Optional)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={referralName}
              onChange={e => setReferralName(e.target.value)}
              placeholder={`Referral name (default: ${DEFAULT_REFERRAL_NAME})`}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <input
              value={referralNB}
              onChange={e => setReferralNB(e.target.value)}
              placeholder={`NB number (default: ${DEFAULT_REFERRAL_NB})`}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            If no referral is entered, the default referral <strong>{DEFAULT_REFERRAL_NAME} ({DEFAULT_REFERRAL_NB})</strong> will be used.
          </p>
        </div>
      )}

      <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
        Showing <strong>{isMember ? 'Distributor Price (DP)' : 'Consumer Price (CP)'}</strong> — Toggle above to switch pricing.
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {categories.map(cat => (
          <button key={cat} onClick={() => setCategory(cat)}
            className={`px-4 py-1.5 text-sm rounded-full whitespace-nowrap transition-all cursor-pointer ${category === cat ? 'bg-primary text-white font-semibold' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {cat === 'all' ? 'All Products' : cat}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Package size={48} />} title="No products found" description="Try adjusting your search or filter." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(product => {
            const displayPrice = isMember ? product.dp : product.cp;
            const imgSrc = (product.images && product.images.length > 0) ? (product.images[0].image_data || product.images[0].image_url || '') : '';
            return (
              <Card key={product.id} className="flex flex-col hover:shadow-md transition-shadow overflow-hidden">
                {imgSrc ? (
                  <img src={imgSrc} alt={product.name || product.description} className="w-full h-44 object-contain bg-gray-50" onError={e => { e.target.style.display = 'none'; }} />
                ) : (
                  <div className="w-full h-44 bg-gray-50 flex items-center justify-center text-gray-300">
                    <Package size={48} />
                  </div>
                )}
                <div className="p-4 flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-gray-900 text-sm leading-tight">{product.name || product.description}</h3>
                    {product.bv > 0 && <Badge variant="info">{product.bv} BV</Badge>}
                  </div>
                  {product.category && <Badge variant="default" className="mb-2">{product.category}</Badge>}
                  <div className="flex items-center justify-between mt-2">
                    <div>
                      <span className="text-lg font-bold text-primary">{formatCurrency(displayPrice)}</span>
                      {isMember && product.cp !== product.dp && (
                        <span className="text-xs text-gray-400 line-through ml-1.5">{formatCurrency(product.cp)}</span>
                      )}
                    </div>
                    <Button size="sm" onClick={() => addToCart(product)}>
                      <Plus size={14} /> Add
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={cartOpen} onClose={() => setCartOpen(false)} title={`Shopping Cart (${cartCount} items)`} size="lg">
        <div className="p-6">
          <div className="mb-3 flex justify-between items-center text-sm">
            <span className="text-gray-500">Pricing: <strong>{isMember ? 'Member (DP)' : 'Non-Member (CP)'}</strong></span>
          </div>

          {cart.length === 0 ? (
            <p className="text-center text-gray-400 py-8">Your cart is empty.</p>
          ) : (
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2 text-center">Qty</th>
                      <th className="px-3 py-2 text-right">Price</th>
                      <th className="px-3 py-2 text-right">BV</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cartItems.map(item => (
                      <tr key={item.id} className="border-b border-gray-100">
                        <td className="px-3 py-2 text-gray-800">{item.name || item.description}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => updateCartQty(item.id, -1)} className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center cursor-pointer"><Minus size={12} /></button>
                            <span className="w-6 text-center font-semibold">{item.qty}</span>
                            <button onClick={() => updateCartQty(item.id, 1)} className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center cursor-pointer"><Plus size={12} /></button>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                        <td className="px-3 py-2 text-right text-blue-600">{item.lineBV.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{formatCurrency(item.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-primary/5 rounded-lg p-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-gray-700">Subtotal</span>
                  <span className="font-bold text-lg text-primary">{formatCurrency(totalAmount)}</span>
                </div>
                <div className="flex justify-between items-center text-sm text-blue-600">
                  <span>Total BV</span>
                  <span className="font-semibold">{totalBV.toFixed(1)} BV</span>
                </div>
                {isMember && selectedDistributor && (
                  <div className="flex justify-between items-center text-sm text-gray-500 mt-1">
                    <span>NB Number</span>
                    <span className="font-semibold">{selectedDistributor.distributor_code}</span>
                  </div>
                )}
                {!isMember && (
                  <div className="flex justify-between items-center text-sm text-gray-500 mt-1">
                    <span>Referral</span>
                    <span className="font-semibold">{effectiveReferralName} ({effectiveReferralNB})</span>
                  </div>
                )}
              </div>

              <Button className="w-full" onClick={() => setCheckoutOpen(true)}>
                Proceed to Checkout
              </Button>
            </div>
          )}
        </div>
      </Modal>

      <Modal open={checkoutOpen} onClose={() => { setCheckoutOpen(false); setOrderError(''); }} title="Checkout" size="md">
        <div className="p-6 space-y-4">
          {orderError && <Alert type="error">{orderError}</Alert>}

          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <div className="flex justify-between">
              <span>Customer Type:</span>
              <span className="font-semibold">{isMember ? 'Registered Member' : 'Non-Member'}</span>
            </div>
            {isMember && selectedDistributor && (
              <div className="flex justify-between mt-1">
                <span>NB Number:</span>
                <span className="font-semibold text-primary">{selectedDistributor.distributor_code} - {selectedDistributor.distributor_name}</span>
              </div>
            )}
            {!isMember && (
              <div className="flex justify-between mt-1">
                <span>Referral:</span>
                <span className="font-semibold">{effectiveReferralName} ({effectiveReferralNB})</span>
              </div>
            )}
          </div>

          <Input label="Full Name *" value={checkoutForm.name} onChange={e => setCheckoutForm(f => ({ ...f, name: e.target.value }))} placeholder="Enter your full name" required />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Phone Number *" type="tel" value={checkoutForm.phone} onChange={e => setCheckoutForm(f => ({ ...f, phone: e.target.value }))} placeholder="+264 81 123 4567" required />
            <Input label="Email" type="email" value={checkoutForm.email} onChange={e => setCheckoutForm(f => ({ ...f, email: e.target.value }))} placeholder="name@example.com" />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Delivery Method *</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setCheckoutForm(f => ({ ...f, deliveryMethod: 'pickup' }))}
                className={`flex items-center justify-center gap-2 px-3 py-3 text-sm rounded-lg border-2 transition-all cursor-pointer ${checkoutForm.deliveryMethod === 'pickup' ? 'border-primary bg-primary/5 text-primary font-semibold' : 'border-gray-200 text-gray-600'}`}>
                <Store size={16} /> Branch Pickup
              </button>
              <button onClick={() => setCheckoutForm(f => ({ ...f, deliveryMethod: 'delivery' }))}
                className={`flex items-center justify-center gap-2 px-3 py-3 text-sm rounded-lg border-2 transition-all cursor-pointer ${checkoutForm.deliveryMethod === 'delivery' ? 'border-primary bg-primary/5 text-primary font-semibold' : 'border-gray-200 text-gray-600'}`}>
                <Truck size={16} /> Delivery
              </button>
            </div>
          </div>

          {checkoutForm.deliveryMethod === 'pickup' && (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Pickup Branch</label>
              <select
                value={checkoutForm.branch}
                onChange={e => setCheckoutForm(f => ({ ...f, branch: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
              >
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}

          {checkoutForm.deliveryMethod === 'delivery' && (
            <Input label="Delivery Address *" value={checkoutForm.address} onChange={e => setCheckoutForm(f => ({ ...f, address: e.target.value }))} placeholder="Full delivery address" required />
          )}

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Payment Method</label>
            <div className="grid grid-cols-2 gap-2">
              {['cash', 'card', 'mobile', 'bank'].map(m => (
                <button key={m} onClick={() => setCheckoutForm(f => ({ ...f, paymentMethod: m }))}
                  className={`px-3 py-2 text-sm rounded-lg border-2 capitalize transition-all cursor-pointer ${checkoutForm.paymentMethod === m ? 'border-primary bg-primary/5 text-primary font-semibold' : 'border-gray-200 text-gray-600'}`}>
                  {m === 'mobile' ? 'Mobile Money' : m === 'bank' ? 'Bank Transfer' : m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 text-sm">
            <div className="flex justify-between mb-1">
              <span>Items:</span><span>{cartCount}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span>Pricing:</span><span>{isMember ? 'Member (DP)' : 'Non-Member (CP)'}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span>Delivery:</span><span className="capitalize">{checkoutForm.deliveryMethod}</span>
            </div>
            <div className="flex justify-between font-bold text-lg border-t pt-2 mt-2">
              <span>Total:</span><span className="text-primary">{formatCurrency(totalAmount)}</span>
            </div>
            <div className="flex justify-between text-blue-600 text-sm">
              <span>Total BV:</span><span>{totalBV.toFixed(1)}</span>
            </div>
          </div>
          <Button className="w-full" onClick={handleCheckout} disabled={!checkoutForm.name || !checkoutForm.phone}>
            Place Order — {formatCurrency(totalAmount)}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

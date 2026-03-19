import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatCurrency, formatDate } from '../../lib/constants';
import { enrichProductsWithPricing, calculateCartTotals } from '../../lib/pricing';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Modal, Alert } from '../../components/ui';
import { ShoppingCart, Heart, Newspaper, MessageSquare, Search, Plus, Minus, Package, Trash2, Send, User, BarChart3, ShoppingBag, Star, UserPlus, Printer } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { MembershipAgreementForm } from '../../components/MembershipAgreementForm';

export default function DistributorPortal() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'shop', label: 'Shop', icon: '🛒' },
    { id: 'register', label: 'New Member', icon: '📝' },
    { id: 'bv', label: 'BV & Profit', icon: '💰' },
    { id: 'communications', label: 'Communications', icon: '📩' },
    { id: 'checkup', label: 'Full Body Check Up', icon: '🏥' },
    { id: 'media', label: 'Media & News', icon: '📰' },
    { id: 'testimonials', label: 'Testimonials', icon: '💬' },
  ];

  return (
    <div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'shop' && <ShopTab />}
        {activeTab === 'register' && <NewMemberTab />}
        {activeTab === 'bv' && <BVProfitTab />}
        {activeTab === 'communications' && <CommunicationsTab />}
        {activeTab === 'checkup' && <CheckupTab />}
        {activeTab === 'media' && <MediaTab />}
        {activeTab === 'testimonials' && <TestimonialsTab />}
      </div>
    </div>
  );
}

function NewMemberTab() {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <UserPlus size={20} className="text-primary" />
        <h3 className="font-bold text-gray-800">Register a New Distributor</h3>
      </div>
      <p className="text-sm text-gray-500 mb-6">Fill in the Distributor Agreement Form below. The new member must indicate the branch where they will process their registration and payment.</p>
      <MembershipAgreementForm mode="standalone" />
    </div>
  );
}

function escHtml(str) {
  if (!str) return '-';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function printDistributorProfile(profile) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Distributor Profile - ${escHtml(profile.distributor_code)}</title>
<style>
  @page { size: A5 landscape; margin: 15mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; background: white; }
  .card { max-width: 600px; margin: 20px auto; border: 3px solid #c41e3a; border-radius: 12px; overflow: hidden; }
  .header { background: linear-gradient(135deg, #c41e3a, #8b0000); color: white; padding: 20px; display: flex; align-items: center; gap: 16px; }
  .header h1 { font-size: 16px; }
  .header p { font-size: 11px; opacity: 0.85; }
  .nb-box { background: #fff5f5; padding: 12px; text-align: center; border-bottom: 1px solid #f0d0d0; }
  .nb-box span { font-size: 28px; font-weight: bold; color: #c41e3a; letter-spacing: 3px; }
  .nb-box p { font-size: 10px; color: #999; }
  .body { padding: 20px; }
  .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
  .row:last-child { border-bottom: none; }
  .label { color: #888; }
  .value { font-weight: bold; color: #333; }
  .footer { background: #f8f8f8; padding: 10px; text-align: center; font-size: 9px; color: #999; }
</style></head><body>
<div class="card">
  <div class="header">
    <div>
      <h1>DYNAPHARM NAMIBIA</h1>
      <p>Distributor Profile Card</p>
    </div>
  </div>
  <div class="nb-box">
    <p>Distributor ID Number</p>
    <span>${escHtml(profile.distributor_code)}</span>
  </div>
  <div class="body">
    <div class="row"><span class="label">Full Name</span><span class="value">${escHtml(profile.distributor_name)}</span></div>
    <div class="row"><span class="label">Position</span><span class="value">${escHtml(profile.position || 'Distributor')}</span></div>
    <div class="row"><span class="label">Date Joined</span><span class="value">${escHtml(profile.date_joined)}</span></div>
    <div class="row"><span class="label">Sponsor</span><span class="value">${escHtml(profile.sponsor_code)}</span></div>
    <div class="row"><span class="label">Mobile</span><span class="value">${escHtml(profile.mobile_no)}</span></div>
    <div class="row"><span class="label">Location</span><span class="value">${escHtml(profile.location || profile.branch)}</span></div>
    <div class="row"><span class="label">Status</span><span class="value" style="color:${profile.status === 'active' ? '#27ae60' : '#e67e22'}">${escHtml((profile.status || 'active').toUpperCase())}</span></div>
  </div>
  <div class="footer">Dynapharm International Namibia &mdash; Printed ${new Date().toLocaleDateString()}</div>
</div>
</body></html>`;
  const w = window.open('', '_blank', 'width=700,height=500');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

function DashboardTab() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [publicNBCode, setPublicNBCode] = useState('');
  const [nbInput, setNBInput] = useState('');

  const fetchByNB = async (nbCode) => {
    setLoading(true);
    try {
      const [orderData, distData] = await Promise.all([
        api.orders.list({ distributor_code: nbCode }).catch(() => []),
        api.get(`/distributors?code=${encodeURIComponent(nbCode)}`).catch(() => null),
      ]);
      const all = Array.isArray(orderData) ? orderData : orderData.orders || [];
      setOrders(all);
      if (distData && distData.distributor_code) setProfile(distData);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    if (user?.username) {
      const nbCode = user.username.toUpperCase();
      setPublicNBCode(nbCode);
      fetchByNB(nbCode);
    } else {
      setLoading(false);
    }
  }, [user]);

  if (loading) return <LoadingSpinner />;

  const myOrders = orders;
  const totalSpent = myOrders.reduce((sum, o) => sum + Number(o.total_amount || o.subtotal || 0), 0);
  const totalBV = myOrders.reduce((sum, o) => {
    const items = typeof o.items === 'string' ? JSON.parse(o.items || '[]') : (o.items || []);
    return sum + items.reduce((s, i) => s + Number(i.bv || 0) * Number(i.quantity || 1), 0);
  }, 0);

  const displayName = profile?.distributor_name || user?.full_name || publicNBCode || 'Distributor';
  const nbNumber = profile?.distributor_code || publicNBCode || '';
  const position = profile?.position || 'Distributor';
  const dateJoined = profile?.date_joined || (user?.created_at ? formatDate(user.created_at) : 'N/A');

  return (
    <div className="space-y-6">
      {!user && (
        <Card>
          <CardBody>
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Enter your NB Number to view your dashboard</label>
                <input
                  type="text"
                  value={nbInput}
                  onChange={e => setNBInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter' && nbInput.trim()) { setPublicNBCode(nbInput.trim()); fetchByNB(nbInput.trim()); } }}
                  placeholder="e.g. NB001234"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                />
              </div>
              <Button onClick={() => { const nb = nbInput.trim(); if (nb) { setPublicNBCode(nb); fetchByNB(nb); } }}>Look Up</Button>
            </div>
            {publicNBCode && <p className="text-xs text-gray-500 mt-2">Showing dashboard for: <strong>{publicNBCode}</strong></p>}
          </CardBody>
        </Card>
      )}
      <div className="bg-gradient-to-r from-primary to-primary-dark rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
              <User size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{displayName}</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className="bg-white/20 px-3 py-0.5 rounded-full text-xs font-semibold">{nbNumber}</span>
                <span className="bg-white/20 px-3 py-0.5 rounded-full text-xs font-semibold">{position}</span>
              </div>
            </div>
          </div>
          {profile && (
            <button onClick={() => printDistributorProfile(profile)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-semibold cursor-pointer transition-colors">
              <Printer size={14} /> Print Profile
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className="bg-white/15 rounded-xl p-4 text-center">
            <p className="text-white/70 text-xs mb-1">Total Orders</p>
            <p className="text-2xl font-bold">{myOrders.length}</p>
          </div>
          <div className="bg-white/15 rounded-xl p-4 text-center">
            <p className="text-white/70 text-xs mb-1">Total Spent</p>
            <p className="text-2xl font-bold">{formatCurrency(totalSpent)}</p>
          </div>
          <div className="bg-white/15 rounded-xl p-4 text-center">
            <p className="text-white/70 text-xs mb-1">Total BV</p>
            <p className="text-2xl font-bold">{totalBV.toFixed(1)}</p>
          </div>
          <div className="bg-white/15 rounded-xl p-4 text-center">
            <p className="text-white/70 text-xs mb-1">Date Joined</p>
            <p className="text-lg font-bold">{dateJoined}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <h3 className="font-bold text-gray-800 flex items-center gap-2"><User size={18} /> Profile Details</h3>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500 text-sm">Full Name</span>
                <span className="font-medium text-sm">{displayName}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500 text-sm">NB Number</span>
                <span className="font-bold text-sm text-primary">{nbNumber}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500 text-sm">Position</span>
                <Badge variant="info">{position}</Badge>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500 text-sm">Date Joined</span>
                <span className="font-medium text-sm">{dateJoined}</span>
              </div>
              {profile?.sponsor_code && (
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500 text-sm">Sponsor</span>
                  <span className="font-medium text-sm">{profile.sponsor_code}</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500 text-sm">Email</span>
                <span className="font-medium text-sm">{user?.email || profile?.email || '-'}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-500 text-sm">Status</span>
                <Badge variant={(profile?.status || 'active') === 'active' ? 'success' : 'warning'}>{profile?.status || 'active'}</Badge>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="font-bold text-gray-800 flex items-center gap-2"><ShoppingBag size={18} /> Recent Orders</h3>
          </CardHeader>
          <CardBody>
            {myOrders.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">No orders yet. Visit the Shop tab to place your first order.</p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {myOrders.slice(0, 10).map((order, idx) => (
                  <div key={order.id || idx} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{order.order_number || `Order #${idx + 1}`}</p>
                      <p className="text-xs text-gray-400">{formatDate(order.created_at)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-primary">{formatCurrency(order.total_amount || order.subtotal || 0)}</p>
                      <Badge variant={
                        order.status === 'delivered' ? 'success' :
                        order.status === 'shipped' ? 'info' :
                        order.status === 'processing' ? 'warning' : 'default'
                      }>{order.status || 'pending'}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h3 className="font-bold text-gray-800 flex items-center gap-2"><Star size={18} /> Quick Actions</h3>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button onClick={() => window.location.href = '/shop'} className="p-4 bg-primary/5 rounded-xl text-center hover:bg-primary/10 transition-colors cursor-pointer">
              <ShoppingCart size={24} className="text-primary mx-auto mb-2" />
              <span className="text-sm font-medium text-gray-700">Shop Products</span>
            </button>
            <button onClick={() => window.location.href = '/checkup'} className="p-4 bg-green-50 rounded-xl text-center hover:bg-green-100 transition-colors cursor-pointer">
              <Heart size={24} className="text-green-600 mx-auto mb-2" />
              <span className="text-sm font-medium text-gray-700">Health Check Up</span>
            </button>
            <button className="p-4 bg-blue-50 rounded-xl text-center hover:bg-blue-100 transition-colors cursor-pointer">
              <BarChart3 size={24} className="text-blue-600 mx-auto mb-2" />
              <span className="text-sm font-medium text-gray-700">BV Summary</span>
            </button>
            <button className="p-4 bg-purple-50 rounded-xl text-center hover:bg-purple-100 transition-colors cursor-pointer">
              <MessageSquare size={24} className="text-purple-600 mx-auto mb-2" />
              <span className="text-sm font-medium text-gray-700">Communications</span>
            </button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function ShopTab() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.products.list()
      .then(data => {
        const raw = Array.isArray(data) ? data : data.products || [];
        setProducts(enrichProductsWithPricing(raw));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = products.filter(p => !search || (p.name || p.description || '').toLowerCase().includes(search.toLowerCase()));

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(c => (c.id || c.description) === (product.id || product.description));
      if (existing) return prev.map(c => (c.id || c.description) === (product.id || product.description) ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const updateQty = (productId, delta) => {
    setCart(prev => prev.map(c => {
      if ((c.id || c.description) === productId) {
        const newQty = c.qty + delta;
        return newQty > 0 ? { ...c, qty: newQty } : c;
      }
      return c;
    }).filter(c => c.qty > 0));
  };

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(c => (c.id || c.description) !== productId));
  };

  const cartTotals = calculateCartTotals(cart, true);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      await api.orders.create({
        customer_name: 'Distributor Order',
        delivery_method: 'pickup',
        subtotal: cartTotals.totalAmount,
        items: cartTotals.items.map(item => ({
          product_id: item.id,
          product_name: item.name || item.description,
          quantity: item.qty,
          unit_price: item.unitPrice,
          bv: item.bv || 0,
        })),
        customer_type: 'member',
        payment_method: 'cash',
        notes: `Distributor purchase | Pricing: DP | Total BV: ${cartTotals.totalBV.toFixed(1)}`,
      });
      setMessage('Order submitted successfully!');
      setCart([]);
      setShowCart(false);
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} className="mb-4">{message}</Alert>}

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <Button onClick={() => setShowCart(true)} className="relative">
          <ShoppingCart size={16} /> Cart
          {cart.length > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
              {cart.length}
            </span>
          )}
        </Button>
      </div>

      <div className="mb-3 px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg text-sm text-primary font-medium">
        Showing Distributor Price (DP) — BV points tracked on all purchases
      </div>

      {cart.length > 0 && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex justify-between items-center">
          <span className="text-sm text-green-700">
            <strong>{cart.reduce((s, c) => s + c.qty, 0)}</strong> items | Total: <strong>{formatCurrency(cartTotals.totalAmount)}</strong> | BV: <strong>{cartTotals.totalBV.toFixed(1)}</strong>
          </span>
          <Button size="sm" variant="success" onClick={() => setShowCart(true)}>View Cart</Button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((product, idx) => {
          const imgSrc = (product.images && product.images.length > 0) ? (product.images[0].image_data || product.images[0].image_url || '') : '';
          return (
            <Card key={product.id || idx} className="hover:shadow-md transition-shadow overflow-hidden">
              {imgSrc ? (
                <img src={imgSrc} alt={product.name || product.description} className="w-full h-40 object-contain bg-gray-50" onError={e => { e.target.style.display = 'none'; }} />
              ) : (
                <div className="w-full h-40 bg-gray-50 flex items-center justify-center text-gray-300">
                  <Package size={40} />
                </div>
              )}
              <CardBody>
                <h3 className="font-semibold text-gray-900 text-sm mb-1">{product.name || product.description}</h3>
                <div className="flex items-center justify-between mt-2">
                  <div>
                    <span className="text-lg font-bold text-primary">{formatCurrency(product.dp)}</span>
                    <span className="text-xs text-gray-400 ml-1">DP</span>
                    {product.bv > 0 && <span className="text-xs text-blue-600 ml-2">{product.bv} BV</span>}
                  </div>
                  <Button size="sm" onClick={() => addToCart(product)}><Plus size={14} /> Add</Button>
                </div>
                {product.cp > product.dp && (
                  <p className="text-xs text-gray-400 mt-1">Retail: {formatCurrency(product.cp)}</p>
                )}
              </CardBody>
            </Card>
          );
        })}
      </div>

      <Modal open={showCart} onClose={() => setShowCart(false)} title="Shopping Cart" size="lg">
        <div className="p-6">
          {cart.length === 0 ? (
            <EmptyState icon={<ShoppingCart size={48} />} title="Cart is Empty" description="Add products to your cart to place an order." />
          ) : (
            <div>
              <div className="space-y-3 mb-6">
                {cartTotals.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{item.name || item.description}</p>
                      <p className="text-xs text-gray-500">{formatCurrency(item.unitPrice)} x {item.qty} = {formatCurrency(item.lineTotal)}</p>
                      {item.lineBV > 0 && <p className="text-xs text-blue-500">{item.lineBV.toFixed(1)} BV</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQty(item.id || item.description, -1)}
                        className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center cursor-pointer hover:bg-gray-300">
                        <Minus size={14} />
                      </button>
                      <span className="text-sm font-bold w-6 text-center">{item.qty}</span>
                      <button onClick={() => updateQty(item.id || item.description, 1)}
                        className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center cursor-pointer hover:bg-gray-300">
                        <Plus size={14} />
                      </button>
                      <button onClick={() => removeFromCart(item.id || item.description)}
                        className="ml-2 text-red-400 hover:text-red-600 cursor-pointer">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-bold">{formatCurrency(cartTotals.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total BV</span>
                  <span className="font-bold text-primary">{cartTotals.totalBV.toFixed(1)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold mt-2 pt-2 border-t">
                  <span>Total</span>
                  <span className="text-primary">{formatCurrency(cartTotals.totalAmount)}</span>
                </div>
              </div>

              <div className="mt-6 flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowCart(false)}>Continue Shopping</Button>
                <Button variant="success" onClick={handleCheckout} disabled={submitting}>
                  <Send size={14} /> {submitting ? 'Placing Order...' : 'Place Order'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

function BVProfitTab() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [publicNBCode, setPublicNBCode] = useState('');
  const [nbInput, setNBInput] = useState('');

  const fetchByNB = (nbCode) => {
    setLoading(true);
    api.orders.list({ distributor_code: nbCode })
      .then(data => {
        const all = Array.isArray(data) ? data : data.orders || [];
        setOrders(all);
      })
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (user?.username) {
      fetchByNB(user.username.toUpperCase());
    } else {
      setLoading(false);
    }
  }, [user]);

  if (loading) return <LoadingSpinner />;

  const monthlyData = {};
  orders.forEach(o => {
    const month = (o.created_at || '').slice(0, 7);
    if (!month) return;
    if (!monthlyData[month]) monthlyData[month] = { orders: 0, amount: 0, bv: 0, profit: 0 };
    monthlyData[month].orders += 1;
    const amt = Number(o.total_amount || o.subtotal || 0);
    monthlyData[month].amount += amt;
    const items = typeof o.items === 'string' ? JSON.parse(o.items || '[]') : (o.items || []);
    items.forEach(i => {
      monthlyData[month].bv += Number(i.bv || 0) * Number(i.quantity || 1);
      const dp = Number(i.unit_price || i.dp || 0);
      const cp = Number(i.cp || dp * 1.3);
      monthlyData[month].profit += (cp - dp) * Number(i.quantity || 1);
    });
  });

  const months = Object.entries(monthlyData).sort((a, b) => b[0].localeCompare(a[0]));
  const totalBV = months.reduce((s, [, d]) => s + d.bv, 0);
  const totalProfit = months.reduce((s, [, d]) => s + d.profit, 0);

  return (
    <div className="space-y-6">
      {!user && (
        <Card>
          <CardBody>
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Enter your NB Number to view your BV & Profit</label>
                <input
                  type="text"
                  value={nbInput}
                  onChange={e => setNBInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter' && nbInput.trim()) { setPublicNBCode(nbInput.trim()); fetchByNB(nbInput.trim()); } }}
                  placeholder="e.g. NB001234"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                />
              </div>
              <Button onClick={() => { const nb = nbInput.trim(); if (nb) { setPublicNBCode(nb); fetchByNB(nb); } }}>Look Up</Button>
            </div>
            {publicNBCode && <p className="text-xs text-gray-500 mt-2">Showing BV data for: <strong>{publicNBCode}</strong></p>}
          </CardBody>
        </Card>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total BV" value={totalBV.toFixed(1)} color="blue" />
        <StatCard title="Est. Profit" value={formatCurrency(totalProfit)} color="green" />
        <StatCard title="Total Orders" value={orders.length} color="purple" />
        <StatCard title="Months Active" value={months.length} color="orange" />
      </div>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800 flex items-center gap-2"><BarChart3 size={18} /> Monthly BV & Profit Breakdown</h3></CardHeader>
        <CardBody>
          {months.length === 0 ? (
            <EmptyState icon={<BarChart3 size={48} />} title="No Data Yet" description="Place orders to see BV and profit tracking here." />
          ) : (
            <div className="space-y-3">
              {months.map(([month, data]) => (
                <div key={month} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-semibold text-gray-800">{new Date(month + '-01').toLocaleDateString('en-ZA', { year: 'numeric', month: 'long' })}</p>
                    <p className="text-xs text-gray-500">{data.orders} order(s) | Total: {formatCurrency(data.amount)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-blue-600">{data.bv.toFixed(1)} BV</p>
                    <p className="text-sm font-bold text-green-600">{formatCurrency(data.profit)} profit</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">BV Accumulation Guide</h3></CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="font-bold text-blue-800 mb-1">Personal BV</p>
              <p className="text-blue-600">BV earned from your own purchases at Distributor Price (DP).</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="font-bold text-green-800 mb-1">Retail Profit</p>
              <p className="text-green-600">Difference between Consumer Price (CP) and Distributor Price (DP) on retail sales.</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg">
              <p className="font-bold text-purple-800 mb-1">Group BV</p>
              <p className="text-purple-600">Combined BV from your downline network for bonus qualification.</p>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function CommunicationsTab() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeForm, setComposeForm] = useState({ subject: '', message: '' });
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const code = user?.distributor_code || user?.username || '';
    api.get(`/notifications?recipient_id=${encodeURIComponent(code)}`)
      .then(d => setNotifications(Array.isArray(d) ? d : d.notifications || []))
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  }, [user]);

  const [sendError, setSendError] = useState('');

  const handleSend = async (e) => {
    e.preventDefault();
    if (!composeForm.subject || !composeForm.message) return;
    setSendError('');
    try {
      await api.notifications.create({
        title: composeForm.subject,
        message: composeForm.message,
        type: 'distributor_message',
        recipient_type: 'admin',
        recipient_id: 'ADMIN',
        metadata: JSON.stringify({ sender: user?.full_name || user?.username || 'Distributor', sender_id: user?.distributor_code || user?.username }),
      });
      setSent(true);
      setComposeForm({ subject: '', message: '' });
      setComposeOpen(false);
      setTimeout(() => setSent(false), 3000);
    } catch (err) {
      setSendError(err.message || 'Failed to send message. Please try again.');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {sent && <Alert type="success">Message sent successfully!</Alert>}
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-800">Messages & Announcements</h3>
        <Button size="sm" onClick={() => setComposeOpen(true)}><Send size={14} /> Compose</Button>
      </div>

      {notifications.length === 0 ? (
        <EmptyState icon={<MessageSquare size={48} />} title="No Messages" description="No announcements or messages at this time." />
      ) : (
        <div className="space-y-3">
          {notifications.map((n, idx) => (
            <Card key={n.id || idx}>
              <CardBody>
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-gray-800">{n.title || 'Announcement'}</h4>
                    <p className="text-sm text-gray-600 mt-1">{n.message || n.content}</p>
                    {n.sender && <p className="text-xs text-gray-400 mt-2">From: {n.sender}</p>}
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap ml-4">
                    {n.created_at ? new Date(n.created_at).toLocaleDateString() : ''}
                  </span>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal open={composeOpen} onClose={() => setComposeOpen(false)} title="Compose Message">
        <form onSubmit={handleSend} className="p-6 space-y-4">
          {sendError && <Alert type="error">{sendError}</Alert>}
          <Input label="Subject" value={composeForm.subject} onChange={e => setComposeForm(f => ({ ...f, subject: e.target.value }))} required />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea
              value={composeForm.message}
              onChange={e => setComposeForm(f => ({ ...f, message: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 min-h-[120px] resize-y"
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setComposeOpen(false)}>Cancel</Button>
            <Button type="submit"><Send size={14} /> Send</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function CheckupTab() {
  return (
    <Card>
      <CardBody>
        <div className="text-center py-8">
          <Heart size={48} className="text-primary mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-800 mb-2">Full Body Check Up</h3>
          <p className="text-gray-500 mb-6">Get a comprehensive health assessment at any Dynapharm branch.</p>
          <Button onClick={() => window.location.href = '/checkup'}>Book a Check Up</Button>
        </div>
      </CardBody>
    </Card>
  );
}

function MediaTab() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.notifications.list()
      .then(d => setNews(Array.isArray(d) ? d : d.notifications || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  if (news.length === 0) {
    return <EmptyState icon={<Newspaper size={48} />} title="Media & News" description="Stay updated with the latest Dynapharm news, events, and product announcements." />;
  }

  return (
    <div className="space-y-4">
      {news.map((item, idx) => (
        <Card key={item.id || idx}>
          <CardBody>
            <h3 className="font-bold text-gray-800 mb-1">{item.title || 'Announcement'}</h3>
            <p className="text-sm text-gray-600">{item.message || item.content || item.description}</p>
            {item.created_at && <p className="text-xs text-gray-400 mt-2">{new Date(item.created_at).toLocaleDateString()}</p>}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function TestimonialsTab() {
  const [testimonials, setTestimonials] = useState([]);
  const [form, setForm] = useState({ name: '', message: '', product: '' });
  const [message, setMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.message) {
      setMessage('Error: Please fill in your name and testimonial.');
      return;
    }
    setTestimonials(prev => [...prev, { ...form, id: Date.now(), created_at: new Date().toISOString() }]);
    setMessage('Thank you for sharing your testimonial!');
    setForm({ name: '', message: '', product: '' });
  };

  return (
    <div className="space-y-6">
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'}>{message}</Alert>}

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Share Your Testimonial</h3></CardHeader>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
            <Input label="Your Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
            <Input label="Product (optional)" value={form.product} onChange={e => setForm({ ...form, product: e.target.value })} placeholder="Which product are you reviewing?" />
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Your Testimonial *</label>
              <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 min-h-[100px] resize-y"
                placeholder="Share your experience with Dynapharm products..." />
            </div>
            <Button type="submit">Submit Testimonial</Button>
          </form>
        </CardBody>
      </Card>

      {testimonials.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-bold text-gray-800">Recent Testimonials</h3>
          {testimonials.map(t => (
            <Card key={t.id}>
              <CardBody>
                <p className="text-sm text-gray-600 italic">"{t.message}"</p>
                <div className="flex justify-between items-center mt-3">
                  <p className="text-sm font-medium text-gray-800">— {t.name}</p>
                  {t.product && <Badge variant="info">{t.product}</Badge>}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

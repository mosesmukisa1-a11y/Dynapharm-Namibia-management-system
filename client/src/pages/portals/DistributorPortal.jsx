import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatCurrency } from '../../lib/constants';
import { enrichProductsWithPricing, calculateCartTotals } from '../../lib/pricing';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Modal, Alert } from '../../components/ui';
import { ShoppingCart, Heart, Newspaper, MessageSquare, Search, Plus, Minus, Package, Trash2, Send } from 'lucide-react';

export default function DistributorPortal() {
  const [activeTab, setActiveTab] = useState('shop');
  const tabs = [
    { id: 'shop', label: 'Shop', icon: '🛒' },
    { id: 'checkup', label: 'Full Body Check Up', icon: '🏥' },
    { id: 'media', label: 'Media & News', icon: '📰' },
    { id: 'testimonials', label: 'Testimonials', icon: '💬' },
  ];

  return (
    <div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'shop' && <ShopTab />}
        {activeTab === 'checkup' && <CheckupTab />}
        {activeTab === 'media' && <MediaTab />}
        {activeTab === 'testimonials' && <TestimonialsTab />}
      </div>
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
        items: cartTotals.items.map(item => ({
          product_name: item.name || item.description,
          quantity: item.qty,
          unit_price: item.unitPrice,
          bv: item.bv || 0,
        })),
        total: cartTotals.totalAmount,
        total_bv: cartTotals.totalBV,
        pricing_type: 'DP',
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

      {cart.length > 0 && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex justify-between items-center">
          <span className="text-sm text-green-700">
            <strong>{cart.reduce((s, c) => s + c.qty, 0)}</strong> items | Total: <strong>{formatCurrency(cartTotals.totalAmount)}</strong> | BV: <strong>{cartTotals.totalBV.toFixed(1)}</strong>
          </span>
          <Button size="sm" variant="success" onClick={() => setShowCart(true)}>View Cart</Button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((product, idx) => (
          <Card key={product.id || idx} className="hover:shadow-md transition-shadow">
            <CardBody>
              <h3 className="font-semibold text-gray-900 text-sm mb-1">{product.name || product.description}</h3>
              <div className="flex items-center justify-between mt-2">
                <div>
                  <span className="text-lg font-bold text-primary">{formatCurrency(product.dp)}</span>
                  <span className="text-xs text-gray-400 ml-1">DP</span>
                  {product.bv > 0 && <span className="text-xs text-gray-400 ml-2">{product.bv} BV</span>}
                </div>
                <Button size="sm" onClick={() => addToCart(product)}><Plus size={14} /> Add</Button>
              </div>
              {product.cp > product.dp && (
                <p className="text-xs text-gray-400 mt-1">Retail: {formatCurrency(product.cp)}</p>
              )}
            </CardBody>
          </Card>
        ))}
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
                      {item.lineBV > 0 && <p className="text-xs text-gray-400">{item.lineBV.toFixed(1)} BV</p>}
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

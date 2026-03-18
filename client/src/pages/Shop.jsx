import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/constants';
import { enrichProductsWithPricing, calculateCartTotals } from '../lib/pricing';
import { Card, Button, Input, Modal, Badge, LoadingSpinner, EmptyState, Alert } from '../components/ui';
import { ShoppingCart, Search, Plus, Minus, Package, User, Users } from 'lucide-react';

export default function Shop() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [category, setCategory] = useState('all');
  const [isMember, setIsMember] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({ name: '', phone: '', email: '', nbNumber: '', paymentMethod: 'cash' });
  const [orderSuccess, setOrderSuccess] = useState('');

  useEffect(() => {
    api.products.list()
      .then(data => {
        const raw = Array.isArray(data) ? data : data.products || [];
        setProducts(enrichProductsWithPricing(raw));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const categories = ['all', ...new Set(products.map(p => p.category || 'General').filter(Boolean))];

  const filtered = products.filter(p => {
    const matchesSearch = !search || (p.name || p.description || '').toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'all' || (p.category || 'General') === category;
    return matchesSearch && matchesCategory;
  });

  const addToCart = (product) => {
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

  const handleCheckout = async () => {
    try {
      await api.orders.create({
        customer_name: checkoutForm.name,
        phone: checkoutForm.phone,
        email: checkoutForm.email,
        nb_number: checkoutForm.nbNumber,
        is_member: isMember,
        payment_method: checkoutForm.paymentMethod,
        items: cartItems.map(item => ({
          product_id: item.id,
          product_name: item.name || item.description,
          quantity: item.qty,
          unit_price: item.unitPrice,
          bv: item.bv || 0,
        })),
        total: totalAmount,
        total_bv: totalBV,
      });
      setOrderSuccess('Order placed successfully! You will be contacted for delivery arrangements.');
      setCart([]);
      setCheckoutOpen(false);
      setCartOpen(false);
    } catch (err) {
      alert(err.message || 'Failed to place order');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Product Catalog</h1>
          <p className="text-sm text-gray-500 mt-1">{products.length} products available</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button onClick={() => setIsMember(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-all cursor-pointer ${!isMember ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>
              <User size={14} /> Non-Member
            </button>
            <button onClick={() => setIsMember(true)}
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

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {categories.map(cat => (
          <button key={cat} onClick={() => setCategory(cat)}
            className={`px-4 py-1.5 text-sm rounded-full whitespace-nowrap transition-all cursor-pointer ${category === cat ? 'bg-primary text-white font-semibold' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {cat === 'all' ? 'All Products' : cat}
          </button>
        ))}
      </div>

      <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
        Showing <strong>{isMember ? 'Distributor Price (DP)' : 'Consumer Price (CP)'}</strong> — Toggle above to switch pricing.
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Package size={48} />} title="No products found" description="Try adjusting your search or filter." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(product => {
            const displayPrice = isMember ? product.dp : product.cp;
            return (
              <Card key={product.id} className="flex flex-col hover:shadow-md transition-shadow">
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
            <button onClick={() => setIsMember(!isMember)} className="text-primary underline cursor-pointer text-sm">
              Switch to {isMember ? 'CP' : 'DP'}
            </button>
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
              </div>

              <Button className="w-full" onClick={() => setCheckoutOpen(true)}>
                Proceed to Checkout
              </Button>
            </div>
          )}
        </div>
      </Modal>

      <Modal open={checkoutOpen} onClose={() => setCheckoutOpen(false)} title="Checkout" size="md">
        <div className="p-6 space-y-4">
          {orderSuccess && <Alert type="success">{orderSuccess}</Alert>}
          <Input label="Full Name" value={checkoutForm.name} onChange={e => setCheckoutForm(f => ({ ...f, name: e.target.value }))} required />
          <Input label="Phone Number" type="tel" value={checkoutForm.phone} onChange={e => setCheckoutForm(f => ({ ...f, phone: e.target.value }))} required />
          <Input label="Email" type="email" value={checkoutForm.email} onChange={e => setCheckoutForm(f => ({ ...f, email: e.target.value }))} />
          {isMember && (
            <Input label="NB Number (Distributor ID)" value={checkoutForm.nbNumber} onChange={e => setCheckoutForm(f => ({ ...f, nbNumber: e.target.value }))} placeholder="e.g. NB001234" />
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

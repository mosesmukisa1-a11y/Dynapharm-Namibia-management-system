import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/constants';
import { Card, Button, Input, Modal, Badge, LoadingSpinner, EmptyState } from '../components/ui';
import { ShoppingCart, Search, Plus, Minus, X, Package } from 'lucide-react';

export default function Shop() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [category, setCategory] = useState('all');

  useEffect(() => {
    api.products.list()
      .then(data => setProducts(Array.isArray(data) ? data : data.products || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const categories = ['all', ...new Set(products.map(p => p.category || 'General').filter(Boolean))];

  const filtered = products.filter(p => {
    const matchesSearch = !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.description?.toLowerCase().includes(search.toLowerCase());
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

  const cartTotal = cart.reduce((sum, c) => sum + (Number(c.price || 0) * c.qty), 0);
  const cartCount = cart.reduce((sum, c) => sum + c.qty, 0);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Product Catalog</h1>
          <p className="text-sm text-gray-500 mt-1">{products.length} products available</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-64">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button
            onClick={() => setCartOpen(true)}
            className="relative px-4 py-2 bg-primary text-white rounded-lg hover:opacity-90 flex items-center gap-2 cursor-pointer"
          >
            <ShoppingCart size={18} />
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 w-5 h-5 bg-accent-red text-white text-xs rounded-full flex items-center justify-center font-bold">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-4 py-1.5 text-sm rounded-full whitespace-nowrap transition-all cursor-pointer ${
              category === cat
                ? 'bg-primary text-white font-semibold'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {cat === 'all' ? 'All Products' : cat}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Package size={48} />} title="No products found" description="Try adjusting your search or filter." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(product => (
            <Card key={product.id} className="flex flex-col hover:shadow-md transition-shadow">
              <div className="p-4 flex-1">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 text-sm leading-tight">{product.name}</h3>
                  {product.bv_points && <Badge variant="info">{product.bv_points} BV</Badge>}
                </div>
                {product.description && (
                  <p className="text-xs text-gray-500 mb-3 line-clamp-2">{product.description}</p>
                )}
                <div className="flex items-center justify-between mt-auto">
                  <span className="text-lg font-bold text-primary">{formatCurrency(product.price)}</span>
                  <Button size="sm" onClick={() => addToCart(product)}>
                    <Plus size={14} /> Add
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={cartOpen} onClose={() => setCartOpen(false)} title={`Shopping Cart (${cartCount} items)`} size="md">
        <div className="p-6">
          {cart.length === 0 ? (
            <p className="text-center text-gray-400 py-8">Your cart is empty.</p>
          ) : (
            <div className="space-y-3">
              {cart.map(item => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-sm text-gray-800">{item.name}</p>
                    <p className="text-xs text-gray-500">{formatCurrency(item.price)} each</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateCartQty(item.id, -1)} className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300 cursor-pointer">
                      <Minus size={14} />
                    </button>
                    <span className="w-8 text-center font-semibold text-sm">{item.qty}</span>
                    <button onClick={() => updateCartQty(item.id, 1)} className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center hover:opacity-90 cursor-pointer">
                      <Plus size={14} />
                    </button>
                  </div>
                  <span className="font-bold text-sm text-gray-800 ml-4 min-w-[80px] text-right">
                    {formatCurrency(item.price * item.qty)}
                  </span>
                </div>
              ))}
              <div className="border-t pt-3 mt-3 flex justify-between items-center">
                <span className="font-bold text-lg text-gray-900">Total</span>
                <span className="font-bold text-xl text-primary">{formatCurrency(cartTotal)}</span>
              </div>
              <Button className="w-full mt-3" disabled>
                Checkout (Coming Soon)
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatCurrency } from '../../lib/constants';
import { Tabs, Card, CardBody, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Modal, Alert } from '../../components/ui';
import { ShoppingCart, Heart, Newspaper, MessageSquare, Search, Plus, Minus, Package } from 'lucide-react';

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

  useEffect(() => {
    api.products.list()
      .then(data => setProducts(Array.isArray(data) ? data : data.products || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = products.filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()));

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === product.id);
      if (existing) return prev.map(c => c.id === product.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { ...product, qty: 1 }];
    });
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <Badge variant="primary">{cart.length} in cart</Badge>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(product => (
          <Card key={product.id} className="hover:shadow-md transition-shadow">
            <CardBody>
              <h3 className="font-semibold text-gray-900 text-sm mb-1">{product.name}</h3>
              {product.description && <p className="text-xs text-gray-500 mb-2 line-clamp-2">{product.description}</p>}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-lg font-bold text-primary">{formatCurrency(product.price)}</span>
                  {product.bv_points && <span className="text-xs text-gray-400 ml-2">{product.bv_points} BV</span>}
                </div>
                <Button size="sm" onClick={() => addToCart(product)}><Plus size={14} /> Add</Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
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
  return (
    <EmptyState
      icon={<Newspaper size={48} />}
      title="Media & News"
      description="Stay updated with the latest Dynapharm news, events, and product announcements."
    />
  );
}

function TestimonialsTab() {
  return (
    <EmptyState
      icon={<MessageSquare size={48} />}
      title="Testimonials"
      description="Read stories from our distributors and customers about their Dynapharm experience."
    />
  );
}

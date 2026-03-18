import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatCurrency, formatDateTime } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Table, Modal, Alert } from '../../components/ui';
import { ShoppingCart, FileText, Package, Landmark, CreditCard, ClipboardList, Gift, MessageSquare, Users, UserPlus, Map } from 'lucide-react';

export default function BranchPortal() {
  const [activeTab, setActiveTab] = useState('walkIn');
  const tabs = [
    { id: 'walkIn', label: 'Walk-in Sales', icon: '🛒' },
    { id: 'prescriptions', label: 'Prescriptions', icon: '💊' },
    { id: 'stock', label: 'Stock', icon: '📦' },
    { id: 'banking', label: 'Banking', icon: '🏦' },
    { id: 'payments', label: 'Payments', icon: '💳' },
    { id: 'onlineOrders', label: 'Online Orders', icon: '📦' },
    { id: 'bonus', label: 'Bonus', icon: '🎁' },
    { id: 'communication', label: 'Communication', icon: '💬' },
    { id: 'staff', label: 'Staff', icon: '👥' },
    { id: 'registration', label: 'Distributor Reg', icon: '📝' },
    { id: 'fieldProgram', label: 'Field Program', icon: '🗺️' },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Branch Portal</h1>
        <p className="text-sm text-gray-500">Manage branch operations, sales, and inventory</p>
      </div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
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
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([
      api.products.list().then(d => setProducts(Array.isArray(d) ? d : d.products || [])),
      api.branch.walkinSales().then(d => setSales(Array.isArray(d) ? d : d.sales || [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const filtered = products.filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()));

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === product.id);
      if (existing) return prev.map(c => c.id === product.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const cartTotal = cart.reduce((sum, c) => sum + Number(c.price || 0) * c.qty, 0);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <div className="mb-4">
          <Input placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {filtered.slice(0, 30).map(p => (
            <button key={p.id} onClick={() => addToCart(p)} className="p-3 bg-white border border-gray-200 rounded-lg text-left hover:border-primary hover:shadow-sm transition-all cursor-pointer">
              <p className="text-sm font-medium text-gray-800 line-clamp-2">{p.name}</p>
              <p className="text-sm font-bold text-primary mt-1">{formatCurrency(p.price)}</p>
            </button>
          ))}
        </div>
      </div>
      <div>
        <Card className="sticky top-20">
          <CardHeader><h3 className="font-bold text-gray-800">Current Sale</h3></CardHeader>
          <CardBody>
            {cart.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Add items to start a sale</p>
            ) : (
              <div className="space-y-2">
                {cart.map(item => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <span className="flex-1 truncate">{item.name}</span>
                    <span className="mx-2 text-gray-400">x{item.qty}</span>
                    <span className="font-semibold">{formatCurrency(item.price * item.qty)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 flex justify-between font-bold text-lg">
                  <span>Total</span>
                  <span className="text-primary">{formatCurrency(cartTotal)}</span>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button className="flex-1" variant="success">Complete Sale</Button>
                  <Button variant="ghost" onClick={() => setCart([])}>Clear</Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function PrescriptionsTab() { return <EmptyState icon={<FileText size={48} />} title="Prescriptions" description="View and dispense prescriptions from consultant reports." />; }
function BranchStockTab() {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.branch.inventory()
      .then(d => setInventory(Array.isArray(d) ? d : d.inventory || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <Card>
      <CardHeader><h3 className="font-bold text-gray-800">Branch Inventory</h3></CardHeader>
      <Table
        columns={[
          { header: 'Product', key: 'product_name' },
          { header: 'Quantity', render: r => <span className={r.quantity < 10 ? 'text-red-600 font-bold' : ''}>{r.quantity || 0}</span> },
          { header: 'Batch', key: 'batch_number' },
          { header: 'Expiry', render: r => formatDateTime(r.expiry_date) },
        ]}
        data={inventory}
        emptyMessage="No inventory data"
      />
    </Card>
  );
}

function BankingTab() {
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.branch.deposits()
      .then(d => setDeposits(Array.isArray(d) ? d : d.deposits || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-gray-800">Bank Deposits</h3>
          <Button size="sm">New Deposit</Button>
        </div>
      </CardHeader>
      <Table
        columns={[
          { header: 'Date', render: r => formatDateTime(r.created_at) },
          { header: 'Amount', render: r => <span className="font-bold text-green-600">{formatCurrency(r.amount)}</span> },
          { header: 'Bank', key: 'bank_name' },
          { header: 'Reference', key: 'reference' },
          { header: 'Status', render: r => <Badge variant={r.status === 'verified' ? 'success' : 'warning'}>{r.status || 'Pending'}</Badge> },
        ]}
        data={deposits}
        emptyMessage="No deposits"
      />
    </Card>
  );
}

function BranchPaymentsTab() { return <EmptyState icon={<CreditCard size={48} />} title="Payments" description="View and process branch payment records." />; }
function OnlineOrdersTab() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.orders.list()
      .then(d => setOrders(Array.isArray(d) ? d : d.orders || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <Card>
      <CardHeader><h3 className="font-bold text-gray-800">Online Orders</h3></CardHeader>
      <Table
        columns={[
          { header: 'Order #', key: 'id' },
          { header: 'Customer', key: 'customer_name' },
          { header: 'Total', render: r => <span className="font-bold">{formatCurrency(r.total)}</span> },
          { header: 'Status', render: r => <Badge variant={r.status === 'completed' ? 'success' : r.status === 'processing' ? 'info' : 'warning'}>{r.status}</Badge> },
          { header: 'Date', render: r => formatDateTime(r.created_at) },
        ]}
        data={orders}
        emptyMessage="No online orders"
      />
    </Card>
  );
}

function BonusTab() { return <EmptyState icon={<Gift size={48} />} title="Bonus Processing" description="Manage distributor bonus payments and calculations." />; }
function CommunicationTab() { return <EmptyState icon={<MessageSquare size={48} />} title="Communication" description="Internal messaging and staff announcements." />; }
function StaffTab() { return <EmptyState icon={<Users size={48} />} title="Staff Management" description="Manage branch staff schedules and records." />; }
function DistributorRegTab() { return <EmptyState icon={<UserPlus size={48} />} title="Distributor Registration" description="Register new distributors and process applications." />; }
function FieldProgramTab() { return <EmptyState icon={<Map size={48} />} title="Field Program" description="Manage field outreach programs and community health activities." />; }

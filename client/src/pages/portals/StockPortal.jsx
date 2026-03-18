import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatCurrency, formatDateTime } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Table, Modal, Alert } from '../../components/ui';
import { Package, Warehouse, Truck, ArrowLeftRight, Globe, BarChart3, ClipboardList, FileSpreadsheet, Zap, Share2, ShoppingCart } from 'lucide-react';

export default function StockPortal() {
  const [activeTab, setActiveTab] = useState('overview');
  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'countryStock', label: 'Country Stock', icon: '🌍' },
    { id: 'windhoek', label: 'Windhoek', icon: '🏢' },
    { id: 'ondangwa', label: 'Ondangwa', icon: '🏬' },
    { id: 'distribution', label: 'Distribution', icon: '🚚' },
    { id: 'transfers', label: 'Transfers', icon: '🔄' },
    { id: 'inventory', label: 'Inventory', icon: '📦' },
    { id: 'orders', label: 'Orders', icon: '🧾' },
    { id: 'sharing', label: 'Sharing', icon: '🔗' },
    { id: 'countryInventory', label: 'Country Inv.', icon: '🗂️' },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Package size={24} className="text-primary" /> Stock Management
        </h1>
        <p className="text-sm text-gray-500">Warehouse management, transfers, and inventory tracking</p>
      </div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'countryStock' && <CountryStockTab />}
        {activeTab === 'windhoek' && <WarehouseTab name="Windhoek" />}
        {activeTab === 'ondangwa' && <WarehouseTab name="Ondangwa" />}
        {activeTab === 'distribution' && <DistributionTab />}
        {activeTab === 'transfers' && <TransfersTab />}
        {activeTab === 'inventory' && <InventoryTab />}
        {activeTab === 'orders' && <OrdersTab />}
        {activeTab === 'sharing' && <SharingTab />}
        {activeTab === 'countryInventory' && <CountryInventoryTab />}
      </div>
    </div>
  );
}

function OverviewTab() {
  const [data, setData] = useState({ batches: [], movements: [], transfers: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.stock.batches().then(d => Array.isArray(d) ? d : d.batches || []).catch(() => []),
      api.stock.movements().then(d => Array.isArray(d) ? d : d.movements || []).catch(() => []),
      api.stock.transfers().then(d => Array.isArray(d) ? d : d.transfers || []).catch(() => []),
    ]).then(([batches, movements, transfers]) => {
      setData({ batches, movements, transfers });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const totalItems = data.batches.reduce((sum, b) => sum + Number(b.quantity || 0), 0);
  const totalValue = data.batches.reduce((sum, b) => sum + Number(b.quantity || 0) * Number(b.unit_price || 0), 0);

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Stock Items" value={totalItems.toLocaleString()} color="blue" icon={<Package size={24} />} />
        <StatCard title="Total Stock Value" value={formatCurrency(totalValue)} color="green" icon={<BarChart3 size={24} />} />
        <StatCard title="Pending Transfers" value={data.transfers.filter(t => t.status === 'pending').length} color="orange" icon={<ArrowLeftRight size={24} />} />
        <StatCard title="Stock Batches" value={data.batches.length} color="purple" icon={<Warehouse size={24} />} />
      </div>
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Recent Stock Movements</h3></CardHeader>
        <Table
          columns={[
            { header: 'Date', render: r => formatDateTime(r.created_at) },
            { header: 'Product', key: 'product_name' },
            { header: 'Type', render: r => <Badge variant={r.movement_type === 'in' ? 'success' : 'warning'}>{r.movement_type || 'Movement'}</Badge> },
            { header: 'Quantity', key: 'quantity' },
            { header: 'Location', key: 'location' },
          ]}
          data={data.movements.slice(0, 20)}
          emptyMessage="No recent movements"
        />
      </Card>
    </div>
  );
}

function CountryStockTab() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.stock.batches()
      .then(d => setBatches((Array.isArray(d) ? d : d.batches || []).filter(b => b.location === 'country_stock')))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-gray-800">Country Stock Inventory</h3>
          <Button size="sm">Import Stock</Button>
        </div>
      </CardHeader>
      <Table
        columns={[
          { header: 'Product', key: 'product_name' },
          { header: 'Batch', key: 'batch_number' },
          { header: 'Quantity', render: r => <span className={Number(r.quantity) < 10 ? 'text-red-600 font-bold' : 'font-medium'}>{r.quantity}</span> },
          { header: 'Expiry', render: r => formatDateTime(r.expiry_date) },
          { header: 'Value', render: r => formatCurrency(Number(r.quantity || 0) * Number(r.unit_price || 0)) },
        ]}
        data={batches}
        emptyMessage="No country stock data"
      />
    </Card>
  );
}

function WarehouseTab({ name }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const location = name.toLowerCase() + '_warehouse';

  useEffect(() => {
    api.stock.batches()
      .then(d => setBatches((Array.isArray(d) ? d : d.batches || []).filter(b => b.location === location)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [location]);

  if (loading) return <LoadingSpinner />;

  return (
    <Card>
      <CardHeader>
        <h3 className="font-bold text-gray-800">{name} Warehouse Inventory</h3>
      </CardHeader>
      <Table
        columns={[
          { header: 'Product', key: 'product_name' },
          { header: 'Batch', key: 'batch_number' },
          { header: 'Quantity', render: r => <span className={Number(r.quantity) < 10 ? 'text-red-600 font-bold' : ''}>{r.quantity}</span> },
          { header: 'Expiry', render: r => formatDateTime(r.expiry_date) },
        ]}
        data={batches}
        emptyMessage={`No stock in ${name} warehouse`}
      />
    </Card>
  );
}

function DistributionTab() { return <EmptyState icon={<Truck size={48} />} title="Distribution" description="Manage stock distribution from warehouses to branches." />; }

function TransfersTab() {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.stock.transfers()
      .then(d => setTransfers(Array.isArray(d) ? d : d.transfers || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-gray-800">Stock Transfers</h3>
          <Button size="sm">New Transfer</Button>
        </div>
      </CardHeader>
      <Table
        columns={[
          { header: 'Date', render: r => formatDateTime(r.created_at) },
          { header: 'From', key: 'from_location' },
          { header: 'To', key: 'to_location' },
          { header: 'Product', key: 'product_name' },
          { header: 'Qty', key: 'quantity' },
          { header: 'Status', render: r => <Badge variant={r.status === 'completed' ? 'success' : r.status === 'in_transit' ? 'info' : 'warning'}>{r.status || 'Pending'}</Badge> },
        ]}
        data={transfers}
        emptyMessage="No transfers recorded"
      />
    </Card>
  );
}

function InventoryTab() { return <EmptyState icon={<ClipboardList size={48} />} title="Inventory Movements" description="Track all inventory movements and adjustments." />; }
function OrdersTab() { return <EmptyState icon={<ShoppingCart size={48} />} title="Stock Orders" description="Manage stock orders and purchase requests." />; }
function SharingTab() { return <EmptyState icon={<Share2 size={48} />} title="Stock Sharing" description="Configure stock sharing rules between branches." />; }
function CountryInventoryTab() { return <EmptyState icon={<Globe size={48} />} title="Country Inventory" description="Complete country-wide inventory overview and export." />; }

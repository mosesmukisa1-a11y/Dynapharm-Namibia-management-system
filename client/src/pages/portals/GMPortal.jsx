import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatCurrency, formatDateTime } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Badge, LoadingSpinner, EmptyState, StatCard, Table } from '../../components/ui';
import { BarChart3, ClipboardList, CheckCircle, Megaphone, TrendingUp, Users, DollarSign, Package } from 'lucide-react';

export default function GMPortal() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'approvals', label: 'Approvals', icon: '✅' },
    { id: 'campaigns', label: 'Campaigns', icon: '📢' },
    { id: 'staff', label: 'Staff Services', icon: '👤' },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">GM Portal</h1>
        <p className="text-sm text-gray-500">Country-wide oversight, approvals, and strategic management</p>
      </div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'approvals' && <ApprovalsTab />}
        {activeTab === 'campaigns' && <CampaignsTab />}
        {activeTab === 'staff' && <StaffTab />}
      </div>
    </div>
  );
}

function DashboardTab() {
  const [stats, setStats] = useState({ orders: 0, branches: 0, products: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.orders.list().then(d => (Array.isArray(d) ? d : d.orders || []).length).catch(() => 0),
      api.branches.list().then(d => (Array.isArray(d) ? d : d.branches || []).length).catch(() => 0),
      api.products.list().then(d => (Array.isArray(d) ? d : d.products || []).length).catch(() => 0),
    ]).then(([orders, branches, products]) => {
      setStats({ orders, branches, products });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Orders" value={stats.orders} color="blue" icon={<TrendingUp size={24} />} />
        <StatCard title="Active Branches" value={stats.branches} color="green" icon={<Users size={24} />} />
        <StatCard title="Products" value={stats.products} color="purple" icon={<Package size={24} />} />
        <StatCard title="Monthly Revenue" value={formatCurrency(0)} subtitle="Connect POS for live data" color="orange" icon={<DollarSign size={24} />} />
      </div>
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Country Performance Overview</h3></CardHeader>
        <CardBody>
          <p className="text-sm text-gray-500">Performance charts and branch comparisons will appear here when sales data is available.</p>
        </CardBody>
      </Card>
    </div>
  );
}

function ApprovalsTab() {
  const [approvalTab, setApprovalTab] = useState('cash');
  const subTabs = [
    { id: 'cash', label: 'Cash Requests' },
    { id: 'leave', label: 'Leave Requests' },
    { id: 'stock', label: 'Stock Requests' },
    { id: 'other', label: 'Other' },
  ];

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {subTabs.map(t => (
          <button key={t.id} onClick={() => setApprovalTab(t.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer ${approvalTab === t.id ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <EmptyState icon={<CheckCircle size={48} />} title="No Pending Approvals" description={`No pending ${approvalTab} requests require your approval.`} />
    </div>
  );
}

function CampaignsTab() { return <EmptyState icon={<Megaphone size={48} />} title="Sales Campaigns" description="Create and manage promotional campaigns across all branches." />; }
function StaffTab() { return <EmptyState icon={<ClipboardList size={48} />} title="Staff Services" description="Submit executive leave or cash requests." />; }

import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatCurrency } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, StatCard, LoadingSpinner, EmptyState } from '../../components/ui';
import { Briefcase, TrendingUp, DollarSign, BarChart3, Users, Package, ClipboardList } from 'lucide-react';

export default function DirectorPortal() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const tabs = [
    { id: 'dashboard', label: 'Executive Dashboard', icon: '📊' },
    { id: 'staff', label: 'Staff Services', icon: '👤' },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Briefcase size={24} className="text-primary" /> Director Portal
        </h1>
        <p className="text-sm text-gray-500">Strategic KPIs and executive oversight</p>
      </div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'staff' && <StaffTab />}
      </div>
    </div>
  );
}

function DashboardTab() {
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.orders.list().then(d => (Array.isArray(d) ? d : d.orders || [])).catch(() => []),
      api.branches.list().then(d => (Array.isArray(d) ? d : d.branches || [])).catch(() => []),
      api.products.list().then(d => (Array.isArray(d) ? d : d.products || [])).catch(() => []),
    ]).then(([orders, branches, products]) => {
      setData({ orders, branches, products });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const totalRevenue = (data.orders || []).reduce((sum, o) => sum + Number(o.total || 0), 0);

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Revenue" value={formatCurrency(totalRevenue)} color="blue" icon={<TrendingUp size={24} />} />
        <StatCard title="Total Orders" value={data.orders?.length || 0} color="green" icon={<DollarSign size={24} />} />
        <StatCard title="Active Branches" value={data.branches?.length || 0} color="purple" icon={<Users size={24} />} />
        <StatCard title="Product Range" value={data.products?.length || 0} color="orange" icon={<Package size={24} />} />
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Revenue Trends</h3></CardHeader>
          <CardBody>
            <p className="text-sm text-gray-500 py-8 text-center">Revenue charts will display when sufficient sales data is collected.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Branch Performance</h3></CardHeader>
          <CardBody>
            <p className="text-sm text-gray-500 py-8 text-center">Branch comparison metrics will appear here.</p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function StaffTab() { return <EmptyState icon={<ClipboardList size={48} />} title="Staff Services" description="Submit executive leave or cash requests." />; }

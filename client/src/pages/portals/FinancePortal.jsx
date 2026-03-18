import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatCurrency, formatDateTime } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Badge, LoadingSpinner, EmptyState, StatCard, Table } from '../../components/ui';
import { DollarSign, TrendingUp, Landmark, Upload, CheckCircle, FileSpreadsheet, ClipboardList } from 'lucide-react';

export default function FinancePortal() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'deposits', label: 'Deposit Inbox', icon: '🏦' },
    { id: 'bonus', label: 'Bonus Workflow', icon: '💰' },
    { id: 'staff', label: 'Staff Services', icon: '👤' },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Finance Portal</h1>
        <p className="text-sm text-gray-500">Financial overview, deposits, and bonus processing</p>
      </div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'deposits' && <DepositsTab />}
        {activeTab === 'bonus' && <BonusTab />}
        {activeTab === 'staff' && <StaffTab />}
      </div>
    </div>
  );
}

function DashboardTab() {
  const [data, setData] = useState({ sales: [], deposits: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.branch.walkinSales().then(d => Array.isArray(d) ? d : d.sales || []).catch(() => []),
      api.branch.deposits().then(d => Array.isArray(d) ? d : d.deposits || []).catch(() => []),
    ]).then(([sales, deposits]) => {
      setData({ sales, deposits });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const totalSales = data.sales.reduce((sum, s) => sum + Number(s.total || s.amount || 0), 0);
  const totalDeposits = data.deposits.reduce((sum, d) => sum + Number(d.amount || 0), 0);

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Sales" value={formatCurrency(totalSales)} color="blue" icon={<TrendingUp size={24} />} />
        <StatCard title="Total Deposits" value={formatCurrency(totalDeposits)} color="green" icon={<Landmark size={24} />} />
        <StatCard title="Pending Deposits" value={data.deposits.filter(d => d.status === 'pending').length} color="orange" icon={<DollarSign size={24} />} />
        <StatCard title="Transactions" value={data.sales.length + data.deposits.length} color="purple" icon={<FileSpreadsheet size={24} />} />
      </div>
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Recent Transactions</h3></CardHeader>
        <Table
          columns={[
            { header: 'Date', render: r => formatDateTime(r.created_at) },
            { header: 'Type', render: r => <Badge variant="info">{r.type || 'Sale'}</Badge> },
            { header: 'Amount', render: r => <span className="font-bold text-green-600">{formatCurrency(r.amount || r.total)}</span> },
            { header: 'Branch', key: 'branch_id' },
          ]}
          data={[...data.sales, ...data.deposits].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20)}
          emptyMessage="No recent transactions"
        />
      </Card>
    </div>
  );
}

function DepositsTab() {
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
          <h3 className="font-bold text-gray-800">Bank Deposit Inbox</h3>
          <Badge variant="warning">{deposits.filter(d => d.status !== 'verified').length} pending</Badge>
        </div>
      </CardHeader>
      <Table
        columns={[
          { header: 'Date', render: r => formatDateTime(r.created_at) },
          { header: 'Branch', key: 'branch_id' },
          { header: 'Amount', render: r => <span className="font-bold">{formatCurrency(r.amount)}</span> },
          { header: 'Reference', key: 'reference' },
          { header: 'Status', render: r => <Badge variant={r.status === 'verified' ? 'success' : 'warning'}>{r.status || 'Pending'}</Badge> },
          { header: 'Action', render: r => r.status !== 'verified' && <Button size="sm" variant="success">Verify</Button> },
        ]}
        data={deposits}
        emptyMessage="No pending deposits"
      />
    </Card>
  );
}

function BonusTab() { return <EmptyState icon={<Upload size={48} />} title="Bonus Workflow" description="Upload, review, approve, and export distributor bonus payments." />; }
function StaffTab() { return <EmptyState icon={<ClipboardList size={48} />} title="Staff Services" description="Access personal leave requests and HR forms." />; }

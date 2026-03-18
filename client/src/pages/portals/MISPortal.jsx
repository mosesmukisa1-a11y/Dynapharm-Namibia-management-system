import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Badge, LoadingSpinner, EmptyState, Table } from '../../components/ui';
import { BarChart3, FileSearch, GitCompare, Activity, Receipt, Package, BookOpen, FileEdit } from 'lucide-react';

export default function MISPortal() {
  const [activeTab, setActiveTab] = useState('audit');
  const tabs = [
    { id: 'audit', label: 'Audit', icon: '🔍' },
    { id: 'reconcile', label: 'Reconcile', icon: '⚖️' },
    { id: 'branchStatus', label: 'Branch Status', icon: '📊' },
    { id: 'encodedSales', label: 'Encoded Sales', icon: '📝' },
    { id: 'receipts', label: 'Receipts', icon: '🧾' },
    { id: 'stock', label: 'Stock', icon: '📦' },
    { id: 'catalogs', label: 'Catalogs', icon: '📖' },
    { id: 'drafts', label: 'Drafts', icon: '✏️' },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 size={24} className="text-primary" /> MIS Portal
        </h1>
        <p className="text-sm text-gray-500">Management Information System - Reports, audits, and data reconciliation</p>
      </div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'audit' && <AuditTab />}
        {activeTab === 'reconcile' && <ReconcileTab />}
        {activeTab === 'branchStatus' && <BranchStatusTab />}
        {activeTab === 'encodedSales' && <EncodedSalesTab />}
        {activeTab === 'receipts' && <ReceiptsTab />}
        {activeTab === 'stock' && <MISStockTab />}
        {activeTab === 'catalogs' && <CatalogsTab />}
        {activeTab === 'drafts' && <DraftsTab />}
      </div>
    </div>
  );
}

function AuditTab() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.mis.audit()
      .then(d => setData(Array.isArray(d) ? d : d.records || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <Card>
      <CardHeader><h3 className="font-bold text-gray-800">Audit Trail</h3></CardHeader>
      <Table
        columns={[
          { header: 'Date', render: r => formatDateTime(r.created_at || r.timestamp) },
          { header: 'Action', key: 'action' },
          { header: 'User', key: 'user' },
          { header: 'Details', key: 'details' },
        ]}
        data={data}
        emptyMessage="No audit records"
      />
    </Card>
  );
}

function ReconcileTab() { return <EmptyState icon={<GitCompare size={48} />} title="Data Reconciliation" description="Compare and reconcile sales data across branches." />; }
function BranchStatusTab() {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.mis.branchStatus()
      .then(d => setBranches(Array.isArray(d) ? d : d.branches || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <Card>
      <CardHeader><h3 className="font-bold text-gray-800">Branch Status Overview</h3></CardHeader>
      <Table
        columns={[
          { header: 'Branch', key: 'name' },
          { header: 'Status', render: r => <Badge variant={r.status === 'active' ? 'success' : 'warning'}>{r.status || 'Active'}</Badge> },
          { header: 'Last Update', render: r => formatDateTime(r.last_update || r.updated_at) },
        ]}
        data={branches}
        emptyMessage="No branch data available"
      />
    </Card>
  );
}

function EncodedSalesTab() { return <EmptyState icon={<FileEdit size={48} />} title="Encoded Sales" description="Review and manage manually encoded sales data." />; }
function ReceiptsTab() { return <EmptyState icon={<Receipt size={48} />} title="Receipts" description="View and verify transaction receipts from all branches." />; }
function MISStockTab() { return <EmptyState icon={<Package size={48} />} title="Stock Reports" description="Comprehensive stock level reports across all branches." />; }
function CatalogsTab() { return <EmptyState icon={<BookOpen size={48} />} title="Product Catalogs" description="Manage product catalog versions and pricing updates." />; }
function DraftsTab() { return <EmptyState icon={<FileEdit size={48} />} title="Report Drafts" description="View and edit saved report drafts before publishing." />; }

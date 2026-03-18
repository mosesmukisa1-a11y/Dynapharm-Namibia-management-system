import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, Table, Modal, Alert } from '../../components/ui';
import { Settings, Users, Shield, Database, GitBranch, UserCheck, UserX, Plus, Trash2, Edit } from 'lucide-react';

export default function AdminPortal() {
  const [activeTab, setActiveTab] = useState('registrations');
  const tabs = [
    { id: 'registrations', label: 'Staff Approvals', icon: '✅' },
    { id: 'users', label: 'User Management', icon: '👥' },
    { id: 'branches', label: 'Branches', icon: '🏬' },
    { id: 'system', label: 'System', icon: '⚙️' },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Settings size={24} className="text-primary" /> Admin Portal
        </h1>
        <p className="text-sm text-gray-500">System administration, user management, and configuration</p>
      </div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'registrations' && <RegistrationsTab />}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'branches' && <BranchesTab />}
        {activeTab === 'system' && <SystemTab />}
      </div>
    </div>
  );
}

function RegistrationsTab() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadPending = () => {
    setLoading(true);
    api.admin.pendingRegistrations()
      .then(d => setPending(Array.isArray(d) ? d : d.registrations || d.users || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(loadPending, []);

  const handleApprove = async (userId, username) => {
    try {
      await api.admin.approveRegistration({ userId, username });
      setMessage('Registration approved!');
      loadPending();
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
  };

  const handleReject = async (userId) => {
    try {
      await api.admin.rejectRegistration({ userId });
      setMessage('Registration rejected.');
      loadPending();
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} className="mb-4">{message}</Alert>}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Pending Staff Registrations</h3>
            <Badge variant="warning">{pending.length} pending</Badge>
          </div>
        </CardHeader>
        {pending.length === 0 ? (
          <CardBody>
            <EmptyState icon={<UserCheck size={48} />} title="No Pending Registrations" description="All staff registrations have been processed." />
          </CardBody>
        ) : (
          <div className="divide-y">
            {pending.map(user => (
              <div key={user.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-800">{user.full_name}</p>
                  <p className="text-sm text-gray-500">Role: <Badge variant="info">{user.role}</Badge></p>
                  <p className="text-xs text-gray-400">{formatDateTime(user.created_at)}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="success" onClick={() => handleApprove(user.id, user.username || user.full_name.toLowerCase().replace(/\s+/g, '.'))}>
                    <UserCheck size={14} /> Approve
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => handleReject(user.id)}>
                    <UserX size={14} /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.users.list()
      .then(d => setUsers(Array.isArray(d) ? d : d.users || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-gray-800">User Management</h3>
          <Button size="sm"><Plus size={14} /> Add User</Button>
        </div>
      </CardHeader>
      <Table
        columns={[
          { header: 'Username', key: 'username' },
          { header: 'Full Name', key: 'full_name' },
          { header: 'Role', render: r => <Badge variant="info">{r.role}</Badge> },
          { header: 'Status', render: r => <Badge variant={r.is_active ? 'success' : 'danger'}>{r.is_active ? 'Active' : 'Inactive'}</Badge> },
          { header: 'Created', render: r => formatDateTime(r.created_at) },
        ]}
        data={users}
        emptyMessage="No users found"
      />
    </Card>
  );
}

function BranchesTab() {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.branches.list()
      .then(d => setBranches(Array.isArray(d) ? d : d.branches || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <Card>
      <CardHeader><h3 className="font-bold text-gray-800">Branch Configuration</h3></CardHeader>
      <Table
        columns={[
          { header: 'Name', key: 'name' },
          { header: 'Code', key: 'code' },
          { header: 'Location', key: 'location' },
          { header: 'Status', render: r => <Badge variant="success">{r.status || 'Active'}</Badge> },
        ]}
        data={branches}
        emptyMessage="No branches configured"
      />
    </Card>
  );
}

function SystemTab() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    api.health()
      .then(setHealth)
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">System Health</h3></CardHeader>
        <CardBody>
          {health ? (
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-4 bg-green-50 rounded-lg">
                <p className="text-sm text-green-600 font-medium">Server Status</p>
                <p className="text-lg font-bold text-green-700">{health.status || 'Healthy'}</p>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-600 font-medium">Database</p>
                <p className="text-lg font-bold text-blue-700">{health.database || 'Connected'}</p>
              </div>
              <div className="p-4 bg-purple-50 rounded-lg">
                <p className="text-sm text-purple-600 font-medium">Uptime</p>
                <p className="text-lg font-bold text-purple-700">{health.uptime || 'Running'}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Unable to fetch system health data.</p>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Database</h3></CardHeader>
        <CardBody>
          <p className="text-sm text-gray-500">Database management tools for administrators.</p>
        </CardBody>
      </Card>
    </div>
  );
}

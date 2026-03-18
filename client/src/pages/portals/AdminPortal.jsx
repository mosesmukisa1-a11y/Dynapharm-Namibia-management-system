import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatDateTime, BRANCHES } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, Table, Modal, Alert } from '../../components/ui';
import { Settings, Users, Shield, Database, GitBranch, UserCheck, UserX, Plus, Trash2, Edit, Activity } from 'lucide-react';

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
  const [editUser, setEditUser] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [message, setMessage] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [editForm, setEditForm] = useState({ role: '', is_active: true, branch: '' });

  const loadUsers = () => {
    setLoading(true);
    api.users.list()
      .then(d => setUsers(Array.isArray(d) ? d : d.users || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(loadUsers, []);

  const handleEdit = (user) => {
    setEditUser(user);
    setEditForm({ role: user.role || '', is_active: user.is_active !== false, branch: user.branch || '' });
  };

  const handleSaveEdit = async () => {
    try {
      await api.users.update(editUser.id, editForm);
      setMessage('User updated successfully!');
      setEditUser(null);
      loadUsers();
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.users.delete(id);
      setMessage('User deleted.');
      setDeleteConfirm(null);
      loadUsers();
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
  };

  if (loading) return <LoadingSpinner />;

  const roles = [...new Set(users.map(u => u.role).filter(Boolean))];
  const filtered = roleFilter ? users.filter(u => u.role === roleFilter) : users;

  return (
    <div>
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} className="mb-4">{message}</Alert>}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">User Management</h3>
            <div className="flex gap-2 items-center">
              <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm">
                <option value="">All Roles</option>
                {roles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <Badge variant="info">{filtered.length} users</Badge>
            </div>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Username', key: 'username' },
            { header: 'Full Name', key: 'full_name' },
            { header: 'Role', render: r => <Badge variant="info">{r.role}</Badge> },
            { header: 'Branch', render: r => r.branch || '-' },
            { header: 'Status', render: r => <Badge variant={r.is_active !== false ? 'success' : 'danger'}>{r.is_active !== false ? 'Active' : 'Inactive'}</Badge> },
            { header: 'Created', render: r => formatDateTime(r.created_at) },
            { header: 'Actions', render: r => (
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" onClick={() => handleEdit(r)}><Edit size={14} /></Button>
                <Button size="sm" variant="danger" onClick={() => setDeleteConfirm(r)}><Trash2 size={14} /></Button>
              </div>
            )},
          ]}
          data={filtered}
          emptyMessage="No users found"
        />
      </Card>

      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Edit User">
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-500">Editing: <strong>{editUser?.full_name}</strong></p>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Role</label>
            <select value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
              {['admin', 'branch', 'frontdesk', 'consultant', 'hr', 'finance', 'gm', 'director', 'mis', 'stock', 'distributor'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Branch Assignment</label>
            <select value={editForm.branch} onChange={e => setEditForm({ ...editForm, branch: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
              <option value="">No Branch</option>
              {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Active</label>
            <button type="button" onClick={() => setEditForm({ ...editForm, is_active: !editForm.is_active })}
              className={`w-12 h-6 rounded-full transition-colors cursor-pointer ${editForm.is_active ? 'bg-green-500' : 'bg-gray-300'}`}>
              <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform ${editForm.is_active ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm text-gray-500">{editForm.is_active ? 'Active' : 'Inactive'}</span>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Confirm Delete">
        <div className="p-6">
          <p className="text-sm text-gray-600 mb-4">
            Are you sure you want to delete user <strong>{deleteConfirm?.full_name}</strong>? This action cannot be undone.
          </p>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => handleDelete(deleteConfirm.id)}>
              <Trash2 size={14} /> Delete User
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function BranchesTab() {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', location: '', manager: '' });
  const [message, setMessage] = useState('');

  const loadBranches = () => {
    setLoading(true);
    api.branches.list()
      .then(d => setBranches(Array.isArray(d) ? d : d.branches || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(loadBranches, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.code) {
      setMessage('Error: Name and code are required.');
      return;
    }
    try {
      await api.branches.create(form);
      setMessage('Branch created successfully!');
      setForm({ name: '', code: '', location: '', manager: '' });
      setShowForm(false);
      loadBranches();
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'}>{message}</Alert>}

      <div className="flex justify-between items-center">
        <h3 className="font-bold text-gray-800">Branch Configuration</h3>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : <><Plus size={14} /> Add Branch</>}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="Branch Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Windhoek CBD" />
                <Input label="Branch Code *" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="e.g. WDH-CBD" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Location" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="City/Address" />
                <Input label="Manager" value={form.manager} onChange={e => setForm({ ...form, manager: e.target.value })} placeholder="Branch manager name" />
              </div>
              <Button type="submit">Create Branch</Button>
            </form>
          </CardBody>
        </Card>
      )}

      <Card>
        <Table
          columns={[
            { header: 'Name', key: 'name' },
            { header: 'Code', key: 'code' },
            { header: 'Location', key: 'location' },
            { header: 'Manager', render: r => r.manager || '-' },
            { header: 'Status', render: r => <Badge variant="success">{r.status || 'Active'}</Badge> },
          ]}
          data={branches}
          emptyMessage="No branches configured"
        />
      </Card>
    </div>
  );
}

function SystemTab() {
  const [health, setHealth] = useState(null);
  const [stats, setStats] = useState({ users: 0, orders: 0, products: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.health().catch(() => null),
      api.users.list().then(d => (Array.isArray(d) ? d : d.users || []).length).catch(() => 0),
      api.orders.list().then(d => (Array.isArray(d) ? d : d.orders || []).length).catch(() => 0),
      api.products.list().then(d => (Array.isArray(d) ? d : d.products || []).length).catch(() => 0),
    ]).then(([h, users, orders, products]) => {
      setHealth(h);
      setStats({ users, orders, products });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

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
        <CardHeader><h3 className="font-bold text-gray-800">Database Statistics</h3></CardHeader>
        <CardBody>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg text-center">
              <p className="text-sm text-gray-500">Total Users</p>
              <p className="text-2xl font-bold text-gray-800">{stats.users}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg text-center">
              <p className="text-sm text-gray-500">Total Orders</p>
              <p className="text-2xl font-bold text-gray-800">{stats.orders}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg text-center">
              <p className="text-sm text-gray-500">Products</p>
              <p className="text-2xl font-bold text-gray-800">{stats.products}</p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">System Settings</h3></CardHeader>
        <CardBody>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-700">Maintenance Mode</p>
                <p className="text-xs text-gray-400">Disable public access during maintenance</p>
              </div>
              <Badge variant="success">Off</Badge>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-700">Auto Backups</p>
                <p className="text-xs text-gray-400">Automatic database backups</p>
              </div>
              <Badge variant="success">Enabled</Badge>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-700">API Rate Limiting</p>
                <p className="text-xs text-gray-400">Protect against abuse</p>
              </div>
              <Badge variant="success">Active</Badge>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

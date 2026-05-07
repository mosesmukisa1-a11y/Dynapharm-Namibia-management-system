import { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import { formatDateTime, formatCurrency, BRANCHES, BRANCH_DETAILS } from '../../lib/constants';
import { enrichProductsWithPricing, setLivePrices, getLiveProductList, PACKAGE_DATABASE } from '../../lib/pricing';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, Table, Modal, Alert } from '../../components/ui';
import { Settings, Users, Shield, Database, GitBranch, UserCheck, UserX, Plus, Trash2, Edit, Activity, Upload, Image, Key, Package, DollarSign, List } from 'lucide-react';

export default function AdminPortal() {
  const [activeTab, setActiveTab] = useState('registrations');
  const tabs = [
    { id: 'registrations', label: 'Staff Approvals', icon: '✅' },
    { id: 'users', label: 'User Management', icon: '👥' },
    { id: 'appointments', label: 'Appointments', icon: '📅' },
    { id: 'products', label: 'Products & Photos', icon: '📸' },
    { id: 'distributors', label: 'Distributor List', icon: '📋' },
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
        {activeTab === 'appointments' && <AppointmentsTab />}
        {activeTab === 'products' && <ProductsTab />}
        {activeTab === 'distributors' && <DistributorsTab />}
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
      setMessage('✅ Account approved — the applicant has been notified and can now log in.');
      loadPending();
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
  };

  const handleReject = async (userId, name) => {
    if (!window.confirm(`Reject and permanently delete this registration${name ? ` for ${name}` : ''}?\n\nThis will remove them completely from the system.`)) return;
    try {
      await api.admin.rejectRegistration({ userId });
      setMessage('🗑️ Registration rejected — account fully removed from the system.');
      loadPending();
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
  };

  if (loading) return <LoadingSpinner />;

  const distributorPending = pending.filter(u => u.role === 'distributor');
  const staffPending = pending.filter(u => u.role !== 'distributor');

  const renderUserRow = (user) => {
    let meta = {};
    try { meta = typeof user.metadata === 'string' ? JSON.parse(user.metadata || '{}') : (user.metadata || {}); } catch(e) {}
    return (
      <div key={user.id} className="p-4 flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-800">{user.full_name}</p>
          <p className="text-sm text-gray-500">
            Username: <strong>{user.username || '-'}</strong> | Role: <Badge variant="info">{user.role}</Badge>
            {(user.branch || meta.branch) && (
              <> | {['stock','warehouse'].includes(user.role) ? 'Warehouse' : 'Branch'}: <strong>{user.branch || meta.branch}</strong></>
            )}
            {meta.warehouse_location && <> | Location: <strong>{meta.warehouse_location}</strong></>}
          </p>
          {user.email && <p className="text-xs text-gray-400">{user.email}</p>}
          <p className="text-xs text-gray-400">{formatDateTime(user.created_at)}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="success" onClick={() => handleApprove(user.id, user.username || user.full_name.toLowerCase().replace(/\s+/g, '.'))}>
            <UserCheck size={14} /> Approve
          </Button>
          <Button size="sm" variant="danger" onClick={() => handleReject(user.id, user.full_name)}>
            <UserX size={14} /> Reject
          </Button>
        </div>
      </div>
    );
  };

  const renderDistributorRow = (user) => {
    let meta = {};
    try { meta = typeof user.metadata === 'string' ? JSON.parse(user.metadata || '{}') : (user.metadata || {}); } catch(e) {}
    return (
      <div key={user.id} className="p-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-800">{user.full_name}</p>
            <Badge variant="primary">Distributor</Badge>
          </div>
          <p className="text-sm text-gray-500">
            NB Number: <strong>{(user.username || '').toUpperCase()}</strong> | Branch: {user.branch || meta.branch || '-'}
          </p>
          {user.email && <p className="text-xs text-gray-400">{user.email}</p>}
          <p className="text-xs text-gray-400">{formatDateTime(user.created_at)}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="success" onClick={() => handleApprove(user.id, user.username)}>
            <UserCheck size={14} /> Approve
          </Button>
          <Button size="sm" variant="danger" onClick={() => handleReject(user.id, user.full_name)}>
            <UserX size={14} /> Reject
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} className="mb-2">{message}</Alert>}

      {/* Staff Pending — clearly separated section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">👔</span>
              <h3 className="font-bold text-gray-800">Pending Staff Registrations</h3>
            </div>
            <Badge variant={staffPending.length > 0 ? 'warning' : 'success'}>
              {staffPending.length > 0 ? `${staffPending.length} pending` : 'All clear'}
            </Badge>
          </div>
        </CardHeader>
        {staffPending.length === 0 ? (
          <CardBody>
            <EmptyState icon={<UserCheck size={40} />} title="No Pending Staff" description="All staff registrations have been reviewed." />
          </CardBody>
        ) : (
          <div className="divide-y">{staffPending.map(renderUserRow)}</div>
        )}
      </Card>

      {/* Distributor Pending — clearly separated section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔵</span>
              <h3 className="font-bold text-gray-800">Pending Distributor Sign-Ups</h3>
            </div>
            <Badge variant={distributorPending.length > 0 ? 'warning' : 'success'}>
              {distributorPending.length > 0 ? `${distributorPending.length} pending` : 'All clear'}
            </Badge>
          </div>
        </CardHeader>
        {distributorPending.length === 0 ? (
          <CardBody>
            <EmptyState icon={<UserCheck size={40} />} title="No Pending Distributors" description="All distributor portal sign-ups have been reviewed." />
          </CardBody>
        ) : (
          <div className="divide-y">{distributorPending.map(renderDistributorRow)}</div>
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
  const [resetPwUser, setResetPwUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [section, setSection] = useState('staff');
  const [editForm, setEditForm] = useState({ role: '', is_active: true, branch: '', additional_roles: [], consultant_branches: [] });

  const STAFF_ROLES = ['admin', 'branch_manager', 'frontdesk', 'consultant', 'dispenser', 'hr_manager', 'finance', 'gm', 'director', 'mis', 'stock', 'warehouse', 'training', 'trainer', 'cleaner', 'security_guard', 'support_staff'];
  const ALL_ROLES = [...STAFF_ROLES, 'distributor'];

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
    const additionalRoles = Array.isArray(user.additional_roles) ? user.additional_roles : [];
    const branch = user.role === 'distributor'
      ? (user.distributor_branch || user.branch || '')
      : (user.branch || '');
    const consultantBranches = Array.isArray(user.branches) ? user.branches : [];
    setEditForm({ role: user.role || '', is_active: user.is_active !== false, branch, additional_roles: additionalRoles, consultant_branches: consultantBranches });
  };

  const toggleAdditionalRole = (role) => {
    setEditForm(prev => {
      const current = Array.isArray(prev.additional_roles) ? prev.additional_roles : [];
      const next = current.includes(role) ? current.filter(r => r !== role) : [...current, role];
      return { ...prev, additional_roles: next };
    });
  };

  const handleSaveEdit = async () => {
    try {
      await api.users.update(editUser.id, {
        role: editForm.role,
        branch: editForm.branch,
        isActive: editForm.is_active,
        additional_roles: editForm.additional_roles,
        branches: editForm.consultant_branches,
      });
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

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      setMessage('Error: Password must be at least 6 characters');
      return;
    }
    try {
      await api.users.update(resetPwUser.id, { password: newPassword });
      setMessage(`Password reset successfully for ${resetPwUser.full_name || resetPwUser.fullName || resetPwUser.username}`);
      setResetPwUser(null);
      setNewPassword('');
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
  };

  if (loading) return <LoadingSpinner />;

  const staffUsers = users.filter(u => u.role !== 'distributor');
  const distributorUsers = users.filter(u => u.role === 'distributor');

  const activeUsers = section === 'staff' ? staffUsers : distributorUsers;
  const availableRoles = section === 'staff'
    ? [...new Set(staffUsers.map(u => u.role).filter(Boolean))]
    : ['distributor'];

  const filtered = roleFilter ? activeUsers.filter(u => u.role === roleFilter) : activeUsers;

  const displayName = (u) => u.full_name || u.fullName || u.username || '-';

  return (
    <div>
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} className="mb-4">{message}</Alert>}

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => { setSection('staff'); setRoleFilter(''); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all ${section === 'staff' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          <Users size={15} /> Staff
          <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${section === 'staff' ? 'bg-white/20' : 'bg-gray-200'}`}>{staffUsers.length}</span>
        </button>
        <button
          onClick={() => { setSection('distributors'); setRoleFilter(''); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all ${section === 'distributors' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          <GitBranch size={15} /> Distributors
          <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${section === 'distributors' ? 'bg-white/20' : 'bg-gray-200'}`}>{distributorUsers.length}</span>
        </button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">{section === 'staff' ? 'Staff Users' : 'Distributor Users'}</h3>
            <div className="flex gap-2 items-center">
              {section === 'staff' && (
                <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm">
                  <option value="">All Roles</option>
                  {availableRoles.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              )}
              <Badge variant="info">{filtered.length} users</Badge>
            </div>
          </div>
        </CardHeader>
        {section === 'staff' ? (
          <Table
            columns={[
              { header: 'Username', key: 'username' },
              { header: 'Full Name', render: r => displayName(r) },
              { header: 'Role', render: r => <Badge variant="info">{r.role}</Badge> },
              { header: 'Branch', render: r => r.branch || '-' },
              { header: 'Status', render: r => <Badge variant={r.is_active !== false ? 'success' : 'danger'}>{r.is_active !== false ? 'Active' : 'Inactive'}</Badge> },
              { header: 'Actions', render: r => (
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => handleEdit(r)} title="Edit"><Edit size={14} /></Button>
                  <Button size="sm" variant="secondary" onClick={() => { setResetPwUser(r); setNewPassword(''); }} title="Reset Password"><Key size={14} /></Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleteConfirm(r)} title="Delete"><Trash2 size={14} /></Button>
                </div>
              )},
            ]}
            data={filtered}
            emptyMessage="No staff users found"
          />
        ) : (
          <Table
            columns={[
              { header: 'NB / Code', key: 'username' },
              { header: 'Name', render: r => displayName(r) },
              { header: 'Branch', render: r => r.distributor_branch || r.branch || '-' },
              { header: 'Status', render: r => <Badge variant={r.is_active !== false ? 'success' : 'danger'}>{r.is_active !== false ? 'Active' : 'Inactive'}</Badge> },
              { header: 'Actions', render: r => (
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => handleEdit(r)} title="Edit"><Edit size={14} /></Button>
                  <Button size="sm" variant="secondary" onClick={() => { setResetPwUser(r); setNewPassword(''); }} title="Reset Password"><Key size={14} /></Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleteConfirm(r)} title="Delete"><Trash2 size={14} /></Button>
                </div>
              )},
            ]}
            data={filtered}
            emptyMessage="No distributor users found"
          />
        )}
      </Card>

      <Modal open={!!editUser} onClose={() => setEditUser(null)} title="Edit User" size="md">
        <div className="p-6 space-y-5">
          <p className="text-sm text-gray-500">Editing: <strong>{editUser ? displayName(editUser) : ''}</strong> ({editUser?.username})</p>

          <div className="grid grid-cols-2 gap-4">
            {editUser?.role !== 'distributor' && (
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Primary Role</label>
                <select value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                  {ALL_ROLES.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                {editUser?.role === 'distributor' ? 'Primary Branch' : 'Branch / Location Assignment'}
              </label>
              <select value={editForm.branch} onChange={e => setEditForm({ ...editForm, branch: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                <option value="">No Branch</option>
                {BRANCH_DETAILS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                <option value="windhoek_warehouse">Windhoek Warehouse</option>
                <option value="ondangwa_warehouse">Ondangwa Warehouse</option>
              </select>
            </div>
          </div>

          {(editForm.role === 'consultant' || editUser?.role === 'consultant') && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Assigned Branches
                <span className="ml-2 text-xs text-gray-400 font-normal">All branches this consultant can service</span>
              </label>
              <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200 max-h-52 overflow-y-auto">
                {BRANCH_DETAILS.map(b => {
                  const checked = (editForm.consultant_branches || []).includes(b.id);
                  return (
                    <label key={b.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors text-xs ${checked ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-gray-100 text-gray-600'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const current = editForm.consultant_branches || [];
                          const next = current.includes(b.id) ? current.filter(x => x !== b.id) : [...current, b.id];
                          setEditForm({ ...editForm, consultant_branches: next });
                        }}
                        className="w-3.5 h-3.5 accent-primary cursor-pointer"
                      />
                      {b.name}
                    </label>
                  );
                })}
              </div>
              {(editForm.consultant_branches || []).length > 0 && (
                <p className="text-xs text-primary">
                  Assigned to {(editForm.consultant_branches || []).length} branch{(editForm.consultant_branches || []).length !== 1 ? 'es' : ''}
                </p>
              )}
            </div>
          )}

          {editUser?.role !== 'distributor' && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Additional Roles
                <span className="ml-2 text-xs text-gray-400 font-normal">Grant access to extra portals alongside the primary role</span>
              </label>
              <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                {ALL_ROLES.filter(r => r !== editForm.role).map(r => {
                  const checked = (editForm.additional_roles || []).includes(r);
                  return (
                    <label key={r} className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors text-xs ${checked ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-gray-100 text-gray-600'}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAdditionalRole(r)}
                        className="w-3.5 h-3.5 accent-primary cursor-pointer"
                      />
                      {r}
                    </label>
                  );
                })}
              </div>
              {(editForm.additional_roles || []).length > 0 && (
                <p className="text-xs text-primary">
                  Extra access: {editForm.additional_roles.join(', ')}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Active</label>
            <button type="button" onClick={() => setEditForm({ ...editForm, is_active: !editForm.is_active })}
              className={`w-12 h-6 rounded-full transition-colors cursor-pointer ${editForm.is_active ? 'bg-green-500' : 'bg-gray-300'}`}>
              <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform ${editForm.is_active ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
            <span className="text-sm text-gray-500">{editForm.is_active ? 'Active' : 'Inactive'}</span>
          </div>

          <div className="flex gap-3 justify-end pt-2 border-t">
            <Button variant="secondary" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!resetPwUser} onClose={() => setResetPwUser(null)} title="Reset Password">
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">Resetting password for: <strong>{resetPwUser ? displayName(resetPwUser) : ''}</strong> ({resetPwUser?.username})</p>
          <Input label="New Password *" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Enter new password (min 6 chars)" />
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setResetPwUser(null)}>Cancel</Button>
            <Button onClick={handleResetPassword}><Key size={14} /> Reset Password</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Confirm Delete">
        <div className="p-6">
          <p className="text-sm text-gray-600 mb-4">
            Are you sure you want to delete user <strong>{deleteConfirm ? displayName(deleteConfirm) : ''}</strong>? This action cannot be undone.
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

function ProductsTab() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const fileInputRef = useRef(null);

  const loadProducts = () => {
    setLoading(true);
    Promise.all([
      api.prices.list().catch(() => []),
      api.products.list().catch(() => []),
    ]).then(([priceData, data]) => {
      if (Array.isArray(priceData) && priceData.length > 0) setLivePrices(priceData);
      const raw = Array.isArray(data) ? data : data.products || [];
      setProducts(enrichProductsWithPricing(raw));
    }).finally(() => setLoading(false));
  };

  useEffect(loadProducts, []);

  const handlePhotoUpload = async (product, file) => {
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const imageData = e.target.result;
        try {
          if (product.images && product.images.length > 0) {
            await Promise.all(product.images.map(img => api.products.deleteImage(img.id)));
          }
          await api.products.uploadImage({
            productId: product.id,
            productName: product.name || product.description,
            imageData,
            imageType: file.type.replace('image/', '') || 'jpg',
            fileSize: file.size,
            isPrimary: true,
            displayOrder: 0,
          });
          setMessage(`Photo uploaded for ${product.name || product.description}`);
          loadProducts();
        } catch (err) {
          setMessage('Error: ' + err.message);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
  };

  if (loading) return <LoadingSpinner />;

  const filtered = products.filter(p =>
    !search || (p.name || p.description || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} className="mb-4">{message}</Alert>}

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Package size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <Badge variant="info">{products.length} products</Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(product => {
          const imgSrc = (product.images && product.images.length > 0) ? (product.images[0].image_data || product.images[0].image_url || '') : '';
          return (
            <Card key={product.id} className="overflow-hidden">
              {imgSrc ? (
                <img src={imgSrc} alt={product.name} className="w-full h-36 object-contain bg-gray-50" onError={e => { e.target.style.display = 'none'; }} />
              ) : (
                <div className="w-full h-36 bg-gray-50 flex items-center justify-center text-gray-300">
                  <Image size={32} />
                  <span className="ml-2 text-sm">No Photo</span>
                </div>
              )}
              <CardBody>
                <h3 className="font-semibold text-gray-900 text-sm mb-1">{product.name || product.description}</h3>
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                  <span>DP: {formatCurrency(product.dp)}</span>
                  <span>CP: {formatCurrency(product.cp)}</span>
                  <span>BV: {product.bv}</span>
                </div>
                <div className="flex gap-2">
                  <label className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs bg-primary/10 text-primary rounded-lg cursor-pointer hover:bg-primary/20 transition-colors">
                    <Upload size={14} /> Upload Photo
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => e.target.files?.[0] && handlePhotoUpload(product, e.target.files[0])} />
                  </label>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function DistributorsTab() {
  const [distributors, setDistributors] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const fileInputRef = useRef(null);
  const [form, setForm] = useState({ distributor_code: '', distributor_name: '', branch: '', mobile_no: '', email: '' });

  const loadDistributors = (searchTerm) => {
    setLoading(true);
    const endpoint = searchTerm
      ? `/distributors?search=${encodeURIComponent(searchTerm)}&limit=100`
      : '/distributors?limit=100';
    api.get(endpoint)
      .then(d => {
        const list = Array.isArray(d) ? d : d.distributors || [];
        setDistributors(list);
        if (d.total_count) setTotalCount(d.total_count);
        else if (!searchTerm) setTotalCount(list.length);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => loadDistributors(''), []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.distributor_code || !form.distributor_name) {
      setMessage('Error: NB Number and Name are required');
      return;
    }
    try {
      await api.distributors.create(form);
      setMessage('Distributor added successfully!');
      setForm({ distributor_code: '', distributor_name: '', branch: '', mobile_no: '', email: '' });
      setShowForm(false);
      loadDistributors();
    } catch (err) {
      setMessage('Error: ' + err.message);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      setMessage('Error: Please upload a CSV or Excel file (.csv, .xlsx, .xls)');
      return;
    }

    setUploading(true);
    setUploadResult(null);
    setMessage('');

    try {
      const XLSX = await import('xlsx');
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);

      if (rows.length === 0) {
        setMessage('Error: No data rows found in the file');
        setUploading(false);
        return;
      }

      setMessage(`Processing ${rows.length} rows...`);

      const BATCH = 500;
      let totalInserted = 0, totalUpdated = 0, totalSkipped = 0, totalErrors = 0;

      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        setMessage(`Importing batch ${Math.floor(i/BATCH)+1}/${Math.ceil(rows.length/BATCH)} (${i+1}-${Math.min(i+BATCH, rows.length)} of ${rows.length})...`);

        const result = await api.post('/distributor-import', { distributors: chunk });
        if (result.summary) {
          totalInserted += result.summary.inserted;
          totalUpdated += result.summary.updated;
          totalSkipped += result.summary.skipped;
          totalErrors += result.summary.errors;
        }
      }

      setUploadResult({ inserted: totalInserted, updated: totalUpdated, skipped: totalSkipped, errors: totalErrors, total: rows.length });
      setMessage(`Import complete: ${totalInserted} new, ${totalUpdated} updated, ${totalSkipped} unchanged`);
      loadDistributors();
    } catch (err) {
      setMessage('Error: ' + (err.message || 'Upload failed'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => loadDistributors(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  if (loading) return <LoadingSpinner />;

  const filtered = distributors;

  return (
    <div>
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} className="mb-4">{message}</Alert>}

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <List size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by NB/DZ number or name..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <Badge variant="info">{totalCount > distributors.length ? `${distributors.length} of ${totalCount}` : distributors.length} distributors</Badge>
        <Button size="sm" variant="secondary" onClick={() => { setShowUpload(!showUpload); setShowForm(false); }}>
          {showUpload ? 'Cancel Upload' : <><Upload size={14} /> Import CSV/Excel</>}
        </Button>
        <Button size="sm" onClick={() => { setShowForm(!showForm); setShowUpload(false); }}>
          {showForm ? 'Cancel' : <><Plus size={14} /> Add Distributor</>}
        </Button>
      </div>

      {showUpload && (
        <Card className="mb-4">
          <CardBody>
            <div className="space-y-4">
              <div>
                <h4 className="font-bold text-gray-800 mb-1">Bulk Import Distributors</h4>
                <p className="text-xs text-gray-500 mb-3">
                  Upload a CSV or Excel file with distributor data. The system will automatically detect columns
                  (DRN/NB/DZ Number, NAME, POSITION, DATE_CREATE, SPONSOR_CODE, MOBILE_TELE, etc.).
                  All code formats from the master list are accepted (NB, DZ, and others). Existing distributors will be skipped unless their position has changed.
                </p>
              </div>
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-primary/50 transition-colors">
                <Upload size={32} className="text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600 mb-3">Select a CSV or Excel file to upload</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="block mx-auto text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 file:cursor-pointer cursor-pointer"
                />
              </div>
              {uploading && (
                <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                  <LoadingSpinner />
                  <span className="text-sm text-blue-700">Importing... Please wait.</span>
                </div>
              )}
              {uploadResult && (
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-green-600">{uploadResult.inserted}</p>
                    <p className="text-xs text-green-500">New</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-blue-600">{uploadResult.updated}</p>
                    <p className="text-xs text-blue-500">Updated</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-gray-600">{uploadResult.skipped}</p>
                    <p className="text-xs text-gray-500">Unchanged</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold text-red-600">{uploadResult.errors}</p>
                    <p className="text-xs text-red-500">Errors</p>
                  </div>
                </div>
              )}
              <div className="text-xs text-gray-400">
                <p className="font-semibold mb-1">Expected columns (auto-detected):</p>
                <p>DRN (NB Number), NAME, POSITION, DATE_CREATE, SPONSOR_CODE, MOBILE_TELE, SEX, CITY/ADDR1, STATUS, EMAIL</p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {showForm && (
        <Card className="mb-4">
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="NB / DZ Number / Code *" value={form.distributor_code} onChange={e => setForm({ ...form, distributor_code: e.target.value })} placeholder="e.g. NB005676 or DZ001234" />
                <Input label="Distributor Name *" value={form.distributor_name} onChange={e => setForm({ ...form, distributor_name: e.target.value })} placeholder="Full name" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">Branch</label>
                  <select value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                    <option value="">Select Branch</option>
                    {BRANCH_DETAILS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <Input label="Phone" value={form.mobile_no} onChange={e => setForm({ ...form, mobile_no: e.target.value })} placeholder="+264 81..." />
                <Input label="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" />
              </div>
              <Button type="submit">Add Distributor</Button>
            </form>
          </CardBody>
        </Card>
      )}

      <Card>
        <Table
          columns={[
            { header: 'NB Number', render: r => r.distributor_code || r.nb_number || r.id || '-' },
            { header: 'Name', render: r => r.distributor_name || r.full_name || r.name || '-' },
            { header: 'Position', render: r => r.position || r.position_code || '-' },
            { header: 'Branch', render: r => r.branch || r.location || '-' },
            { header: 'Phone', render: r => r.mobile_no || '-' },
            { header: 'Joined', render: r => r.date_joined || '-' },
            { header: 'Status', render: r => <Badge variant={r.status === 'active' ? 'success' : 'warning'}>{r.status || 'active'}</Badge> },
          ]}
          data={filtered}
          emptyMessage="No distributors found"
        />
      </Card>
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

      <Card className="mb-4">
        <CardHeader><h3 className="font-bold text-gray-800">Official Dynapharm Outlets</h3></CardHeader>
        <CardBody>
          <div className="grid md:grid-cols-3 gap-3">
            {BRANCH_DETAILS.map((bd, i) => (
              <div key={i} className="p-3 bg-gray-50 rounded-lg text-sm">
                <p className="font-bold text-gray-800">{bd.name}</p>
                <p className="text-xs text-gray-500">{bd.address}</p>
                <p className="text-xs text-primary mt-1">{bd.phone}</p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <div className="flex justify-between items-center">
        <h3 className="font-bold text-gray-800">Database Branches</h3>
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
    </div>
  );
}

function AppointmentsTab() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [editApt, setEditApt] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editReport, setEditReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [activeSection, setActiveSection] = useState('basic');
  const [editPrescMeds, setEditPrescMeds] = useState(new Set());
  const [editPrescDiagnosis, setEditPrescDiagnosis] = useState('');
  const [editPrescFollowUp, setEditPrescFollowUp] = useState('');
  const [editPrescFollowUpNotes, setEditPrescFollowUpNotes] = useState('');
  const [editPrescMedSearch, setEditPrescMedSearch] = useState('');

  const load = () => {
    setLoading(true);
    api.appointments.list()
      .then(d => setAppointments(Array.isArray(d) ? d : d.appointments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const STATUS_OPTIONS = ['pending', 'walk-in', 'scheduled', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show'];

  const filtered = appointments.filter(a => {
    if (statusFilter && (a.status || '').toLowerCase() !== statusFilter) return false;
    if (branchFilter && !(a.branch || '').toLowerCase().includes(branchFilter.toLowerCase())) return false;
    if (search) {
      const q = search.toLowerCase();
      return (a.full_name || '').toLowerCase().includes(q)
        || (a.phone || '').includes(q)
        || String(a.id || '').toLowerCase().includes(q)
        || (a.client_reference || '').toLowerCase().includes(q)
        || (a.email || '').toLowerCase().includes(q);
    }
    return true;
  });

  const parseData = (apt) => { try { return typeof apt.data === 'string' ? JSON.parse(apt.data) : (apt.data || {}); } catch { return {}; } };

  const openEdit = async (apt) => {
    const d = parseData(apt);
    setEditForm({
      full_name: apt.full_name || '',
      phone: apt.phone || '',
      email: apt.email || '',
      client_reference: apt.client_reference || '',
      date: apt.date || '',
      time: apt.time || '',
      branch: apt.branch || '',
      type: apt.type || '',
      status: apt.status || 'pending',
      notes: apt.notes || '',
      gender: d.gender || '',
      dob: d.dob || '',
      height: d.height || '',
      weight: d.weight || '',
      membership_status: d.membershipStatus || d.membership_status || d.customer_type || 'referred',
      primary_reason: d.primary_reason || d.primaryReason || d.reason || '',
      referral_name: d.referral_name || d.referralName || d.distributorName || '',
      referral_nb: d.referral_nb || d.referralNB || d.distributorNB || d.referralNb || '',
      water_intake: d.water_intake || d.waterIntake || '',
      exercise_freq: d.exercise_freq || d.exerciseFreq || '',
      sleep_hours: d.sleep_hours || d.sleepHours || '',
      stress_level: String(d.stress_level || d.stressLevel || ''),
      current_medications: d.current_medications || d.currentMedications || d.medications || '',
      allergies: d.allergies || '',
      medical_history: Array.isArray(d.medical_history || d.medicalHistory)
        ? (d.medical_history || d.medicalHistory).join(', ')
        : (d.medical_history || d.medicalHistory || ''),
    });
    setEditApt({ ...apt, _parsedData: d });
    setActiveSection('basic');
    setMsg('');
    setEditReport(undefined);
    setLoadingReport(true);
    setEditPrescMeds(new Set());
    setEditPrescDiagnosis('');
    setEditPrescFollowUp('');
    setEditPrescFollowUpNotes('');
    setEditPrescMedSearch('');
    try {
      const result = await api.reports.list({ appointment_id: apt.id });
      const reports = Array.isArray(result) ? result : (result?.reports || []);
      const report = reports[0] || null;
      setEditReport(report);
      if (report) {
        const existing = Array.isArray(report.prescriptions)
          ? report.prescriptions.map(p => typeof p === 'string' ? p : (p.product || p.name || ''))
          : Array.isArray(report.medicines)
            ? report.medicines.map(m => typeof m === 'string' ? m : (m.name || ''))
            : [];
        setEditPrescMeds(new Set(existing.filter(Boolean)));
        setEditPrescDiagnosis(report.diagnosis || report.recommendations || '');
        setEditPrescFollowUp(report.follow_up_date ? String(report.follow_up_date).slice(0, 10) : '');
        setEditPrescFollowUpNotes(report.follow_up_notes || '');
      }
    } catch { setEditReport(null); }
    finally { setLoadingReport(false); }
  };

  const togglePrescMed = (name) => setEditPrescMeds(prev => {
    const next = new Set(prev); if (next.has(name)) next.delete(name); else next.add(name); return next;
  });

  const handleSave = async () => {
    if (!editApt) return;
    setSaving(true); setMsg('');
    try {
      const d = editApt._parsedData || {};
      const mergedData = {
        ...d,
        gender: editForm.gender, dob: editForm.dob,
        height: editForm.height, weight: editForm.weight,
        membershipStatus: editForm.membership_status,
        membership_status: editForm.membership_status,
        customer_type: editForm.membership_status,
        primary_reason: editForm.primary_reason, primaryReason: editForm.primary_reason,
        referral_name: editForm.referral_name, referralName: editForm.referral_name,
        distributorName: editForm.referral_name,
        referral_nb: editForm.referral_nb, referralNB: editForm.referral_nb,
        distributorNB: editForm.referral_nb,
        water_intake: editForm.water_intake, waterIntake: editForm.water_intake,
        exercise_freq: editForm.exercise_freq, exerciseFreq: editForm.exercise_freq,
        sleep_hours: editForm.sleep_hours, sleepHours: editForm.sleep_hours,
        stress_level: editForm.stress_level, stressLevel: editForm.stress_level,
        current_medications: editForm.current_medications, currentMedications: editForm.current_medications,
        allergies: editForm.allergies,
        medical_history: editForm.medical_history, medicalHistory: editForm.medical_history,
      };
      await api.appointments.update(editApt.id, {
        full_name: editForm.full_name,
        phone: editForm.phone,
        email: editForm.email,
        client_reference: editForm.client_reference,
        date: editForm.date,
        time: editForm.time,
        branch: editForm.branch,
        type: editForm.type,
        status: editForm.status,
        notes: editForm.notes,
        data: mergedData,
      });
      if (editReport) {
        const medicines = Array.from(editPrescMeds).map(name => ({ name, dispensed: false }));
        const prescriptions = medicines.map(m => ({ product: m.name, quantity: 1 }));
        await api.reports.update(editReport.id, {
          diagnosis: editPrescDiagnosis, recommendations: editPrescDiagnosis,
          medicines, prescriptions,
          follow_up_date: editPrescFollowUp || null,
          follow_up_notes: editPrescFollowUpNotes || null,
        });
      }
      setMsg('✅ Appointment updated successfully.');
      load();
    } catch (err) {
      setMsg('❌ Error: ' + (err.message || 'Failed to save'));
    } finally {
      setSaving(false);
    }
  };

  const allProducts = getLiveProductList();
  const seenPkg = new Set();
  const pkgList = allProducts.filter(p => p.is_package && !seenPkg.has(p.description) && seenPkg.add(p.description));
  const pkgNames = new Set(pkgList.map(p => p.description));
  const seenProd = new Set();
  const prodList = allProducts.filter(p => !p.is_package && !pkgNames.has(p.description) && !seenProd.has(p.description) && seenProd.add(p.description));
  const qp = (editPrescMedSearch || '').toLowerCase();
  const visPkgs = qp ? pkgList.filter(p => p.description.toLowerCase().includes(qp)) : pkgList;
  const visProds = qp ? prodList.filter(p => p.description.toLowerCase().includes(qp)) : prodList;

  const inp = { width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' };
  const lbl = { display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: '4px' };

  return (
    <div>
      <Card className="mb-4">
        <CardBody>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Search by name, phone, NB number, ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: '220px', padding: '9px 14px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem' }}
            />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem' }}>
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
            <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} style={{ padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem' }}>
              <option value="">All Branches</option>
              {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <button onClick={load} style={{ padding: '9px 18px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.88rem' }}>↺ Refresh</button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: '#6b7280' }}>{filtered.length} appointment{filtered.length !== 1 ? 's' : ''}</p>
        </CardBody>
      </Card>

      {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
        <EmptyState icon={<span style={{ fontSize: '3rem' }}>📅</span>} title="No appointments found" description="Try adjusting your search or filters." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(apt => {
            const d = parseData(apt);
            const sl = (apt.status || '').toLowerCase();
            const sColor = sl === 'completed' ? '#22c55e' : sl === 'no_show' ? '#f97316' : sl === 'cancelled' ? '#ef4444' : sl === 'in_progress' ? '#8b5cf6' : '#3b82f6';
            return (
              <div key={apt.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderLeft: `4px solid ${sColor}`, borderRadius: '10px', padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b' }}>{apt.full_name || 'Unknown'}</span>
                      <span style={{ padding: '2px 10px', background: `${sColor}20`, color: sColor, borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'capitalize' }}>{sl}</span>
                    </div>
                    <div style={{ fontSize: '0.83rem', color: '#64748b', marginTop: '3px' }}>
                      {apt.phone || ''}{apt.email ? ` · ${apt.email}` : ''}
                      {apt.client_reference ? <> · NB: <strong>{apt.client_reference}</strong></> : null}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '3px' }}>
                      📅 {apt.date || 'N/A'}{apt.time ? ` at ${apt.time}` : ''} · 🏥 {apt.branch || 'N/A'}
                      {(d.referral_name || d.distributorName) ? ` · Referred by: ${d.referral_name || d.distributorName}` : ''}
                    </div>
                  </div>
                  <button onClick={() => openEdit(apt)} style={{ padding: '8px 18px', background: '#1e293b', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Edit size={14} /> Edit
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editApt && (
        <div onClick={e => { if (e.target === e.currentTarget) setEditApt(null); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 999999, overflowY: 'auto', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ maxWidth: '920px', margin: '20px auto', background: 'white', borderRadius: '14px', boxShadow: '0 12px 48px rgba(0,0,0,0.35)', overflow: 'hidden' }}>

            <div style={{ background: 'linear-gradient(135deg,#1e293b,#334155)', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', fontWeight: 700 }}>Edit Appointment</h3>
                <p style={{ margin: '3px 0 0', color: 'rgba(255,255,255,0.7)', fontSize: '0.83rem' }}>{editApt.full_name || editApt.id} · ID: {editApt.id}</p>
              </div>
              <button onClick={() => setEditApt(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: '1.6rem', cursor: 'pointer', borderRadius: '6px', padding: '1px 10px', lineHeight: 1 }}>×</button>
            </div>

            <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', padding: '0 24px', background: '#f8fafc', overflowX: 'auto' }}>
              {[['basic','👤 Personal & Referral'],['appt','📅 Appointment'],['health','🩺 Health Profile'],['lifestyle','🌿 Lifestyle'],['prescription','💊 Prescription']].map(([id, label]) => (
                <button key={id} onClick={() => setActiveSection(id)}
                  style={{ padding: '12px 18px', border: 'none', background: 'none', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', color: activeSection === id ? '#1d4ed8' : '#64748b', borderBottom: activeSection === id ? '3px solid #1d4ed8' : '3px solid transparent', whiteSpace: 'nowrap' }}>
                  {label}
                </button>
              ))}
            </div>

            <div style={{ padding: '24px', maxHeight: '62vh', overflowY: 'auto' }}>
              {msg && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.9rem', background: msg.startsWith('✅') ? '#f0fdf4' : '#fee2e2', color: msg.startsWith('✅') ? '#166534' : '#b91c1c', border: `1px solid ${msg.startsWith('✅') ? '#bbf7d0' : '#fca5a5'}` }}>{msg}</div>
              )}

              {activeSection === 'basic' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div><label style={lbl}>Full Name</label><input style={inp} value={editForm.full_name} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} /></div>
                  <div><label style={lbl}>Phone</label><input style={inp} value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} /></div>
                  <div><label style={lbl}>Email</label><input style={inp} value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <div><label style={lbl}>NB / Client Reference</label><input style={inp} value={editForm.client_reference} onChange={e => setEditForm(f => ({ ...f, client_reference: e.target.value }))} placeholder="Distributor NB number" /></div>
                  <div><label style={lbl}>Referral / Distributor Name</label><input style={inp} value={editForm.referral_name} onChange={e => setEditForm(f => ({ ...f, referral_name: e.target.value }))} /></div>
                  <div><label style={lbl}>Referral NB Number</label><input style={inp} value={editForm.referral_nb} onChange={e => setEditForm(f => ({ ...f, referral_nb: e.target.value }))} /></div>
                  <div>
                    <label style={lbl}>Client / Membership Type</label>
                    <select style={inp} value={editForm.membership_status} onChange={e => setEditForm(f => ({ ...f, membership_status: e.target.value }))}>
                      <option value="referred">Non-Member (Referred)</option>
                      <option value="member">Member (Distributor)</option>
                    </select>
                  </div>
                </div>
              )}

              {activeSection === 'appt' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div><label style={lbl}>Date</label><input type="date" style={inp} value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} /></div>
                  <div><label style={lbl}>Time</label><input type="time" style={inp} value={editForm.time} onChange={e => setEditForm(f => ({ ...f, time: e.target.value }))} /></div>
                  <div>
                    <label style={lbl}>Branch</label>
                    <select style={inp} value={editForm.branch} onChange={e => setEditForm(f => ({ ...f, branch: e.target.value }))}>
                      <option value="">— Select Branch —</option>
                      {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                  <div><label style={lbl}>Appointment Type</label><input style={inp} value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))} placeholder="e.g. Full Body Checkup" /></div>
                  <div>
                    <label style={lbl}>Status</label>
                    <select style={inp} value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Notes</label><textarea style={{ ...inp, resize: 'vertical' }} rows={3} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} /></div>
                </div>
              )}

              {activeSection === 'health' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={lbl}>Gender</label>
                    <select style={inp} value={editForm.gender} onChange={e => setEditForm(f => ({ ...f, gender: e.target.value }))}>
                      <option value="">— Select —</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                  <div><label style={lbl}>Date of Birth</label><input type="date" style={inp} value={editForm.dob} onChange={e => setEditForm(f => ({ ...f, dob: e.target.value }))} /></div>
                  <div><label style={lbl}>Height (cm)</label><input type="number" style={inp} value={editForm.height} onChange={e => setEditForm(f => ({ ...f, height: e.target.value }))} /></div>
                  <div><label style={lbl}>Weight (kg)</label><input type="number" style={inp} value={editForm.weight} onChange={e => setEditForm(f => ({ ...f, weight: e.target.value }))} /></div>
                  <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Primary Reason for Visit</label><input style={inp} value={editForm.primary_reason} onChange={e => setEditForm(f => ({ ...f, primary_reason: e.target.value }))} placeholder="e.g. Weight management, Joint pain" /></div>
                  <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Allergies</label><input style={inp} value={editForm.allergies} onChange={e => setEditForm(f => ({ ...f, allergies: e.target.value }))} /></div>
                  <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Medical History (comma-separated)</label><input style={inp} value={editForm.medical_history} onChange={e => setEditForm(f => ({ ...f, medical_history: e.target.value }))} placeholder="e.g. Diabetes, Hypertension" /></div>
                  <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Current Medications</label><input style={inp} value={editForm.current_medications} onChange={e => setEditForm(f => ({ ...f, current_medications: e.target.value }))} /></div>
                </div>
              )}

              {activeSection === 'lifestyle' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={lbl}>Water Intake</label>
                    <select style={inp} value={editForm.water_intake} onChange={e => setEditForm(f => ({ ...f, water_intake: e.target.value }))}>
                      <option value="">— Select —</option>
                      <option value="less1">Less than 1L/day</option>
                      <option value="1-2">1–2L/day</option>
                      <option value="2-3">2–3L/day</option>
                      <option value="3+">3+ L/day</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Exercise Frequency</label>
                    <select style={inp} value={editForm.exercise_freq} onChange={e => setEditForm(f => ({ ...f, exercise_freq: e.target.value }))}>
                      <option value="">— Select —</option>
                      <option value="never">Never</option>
                      <option value="1-2">1–2×/week</option>
                      <option value="3-4">3–4×/week</option>
                      <option value="5+">5+×/week</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Sleep (hours/night)</label>
                    <select style={inp} value={editForm.sleep_hours} onChange={e => setEditForm(f => ({ ...f, sleep_hours: e.target.value }))}>
                      <option value="">— Select —</option>
                      <option value="<5">Less than 5 hrs</option>
                      <option value="5-6">5–6 hrs</option>
                      <option value="7-8">7–8 hrs</option>
                      <option value="8+">8+ hrs</option>
                    </select>
                  </div>
                  <div>
                    <label style={lbl}>Stress Level (1–10)</label>
                    <select style={inp} value={editForm.stress_level} onChange={e => setEditForm(f => ({ ...f, stress_level: e.target.value }))}>
                      <option value="">— Select —</option>
                      {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {activeSection === 'prescription' && (
                loadingReport ? <LoadingSpinner /> : (
                  <div>
                    {!editReport ? (
                      <div style={{ padding: '20px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', color: '#92400e', fontSize: '0.9rem' }}>
                        ℹ️ No consultation report has been created for this appointment yet. A report must be created by the consultant before prescriptions can be edited here.
                      </div>
                    ) : (
                      <div>
                        <div style={{ marginBottom: '16px' }}>
                          <label style={lbl}>Consultant Notes &amp; Diagnosis</label>
                          <textarea rows={4} style={{ ...inp, resize: 'vertical' }} value={editPrescDiagnosis} onChange={e => setEditPrescDiagnosis(e.target.value)} placeholder="Updated diagnosis and notes..." />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                          <div><label style={lbl}>Follow-up Date</label><input type="date" style={inp} value={editPrescFollowUp} onChange={e => setEditPrescFollowUp(e.target.value)} /></div>
                          <div><label style={lbl}>Follow-up Notes</label><input style={inp} value={editPrescFollowUpNotes} onChange={e => setEditPrescFollowUpNotes(e.target.value)} placeholder="e.g. Review progress..." /></div>
                        </div>
                        <div style={{ border: '1px solid #e0e0e0', borderRadius: '10px', padding: '14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
                            <h4 style={{ margin: 0, fontSize: '0.92rem', color: '#1e293b' }}>Prescribed Products</h4>
                            <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>{editPrescMeds.size} selected</span>
                          </div>
                          <input type="text" placeholder="Search products…" value={editPrescMedSearch} onChange={e => setEditPrescMedSearch(e.target.value)} style={{ ...inp, marginBottom: '8px' }} />
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '7px', maxHeight: '300px', overflowY: 'auto', marginBottom: '10px' }}>
                            {visPkgs.map((pkg, i) => {
                              const chk = editPrescMeds.has(pkg.description);
                              return (
                                <div key={`apkg-${i}`} onClick={() => togglePrescMed(pkg.description)}
                                  style={{ background: chk ? '#dcfce7' : '#e8f5e9', borderLeft: `4px solid ${chk ? '#16a34a' : '#27ae60'}`, padding: '8px 10px', borderRadius: '6px', display: 'flex', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                                  <input type="checkbox" checked={chk} onChange={() => togglePrescMed(pkg.description)} onClick={e => e.stopPropagation()} style={{ marginTop: '2px' }} />
                                  <div>📦 <strong style={{ color: '#166534' }}>{pkg.description}</strong></div>
                                </div>
                              );
                            })}
                            {visProds.map((p, i) => {
                              const chk = editPrescMeds.has(p.description);
                              return (
                                <div key={`aprod-${i}`} onClick={() => togglePrescMed(p.description)}
                                  style={{ padding: '7px 10px', borderRadius: '6px', display: 'flex', gap: '8px', border: `1px solid ${chk ? '#86efac' : '#f0f0f0'}`, background: chk ? '#f0fdf4' : 'white', cursor: 'pointer', fontSize: '0.85rem' }}>
                                  <input type="checkbox" checked={chk} onChange={() => togglePrescMed(p.description)} onClick={e => e.stopPropagation()} style={{ marginTop: '2px' }} />
                                  <span style={{ color: chk ? '#166534' : '#1e293b', fontWeight: chk ? 600 : 400 }}>{p.description}</span>
                                </div>
                              );
                            })}
                          </div>
                          {editPrescMeds.size > 0 && (
                            <div style={{ background: '#f0fdf4', padding: '10px', borderRadius: '8px', border: '1px solid #86efac' }}>
                              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#166534', marginBottom: '6px' }}>✅ Prescribed ({editPrescMeds.size})</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                {Array.from(editPrescMeds).map((m, i) => (
                                  <span key={i} style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', padding: '2px 10px', borderRadius: '20px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    {m}
                                    <button onClick={() => togglePrescMed(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', fontWeight: 700, fontSize: '1rem', padding: 0, lineHeight: 1 }}>×</button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>

            <div style={{ padding: '16px 24px', borderTop: '2px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button onClick={() => setEditApt(null)} style={{ padding: '10px 22px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>Close</button>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '10px 24px', background: saving ? '#1a5c2e' : '#16a34a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', opacity: saving ? 0.7 : 1 }}>
                {saving ? '⏳ Saving...' : '💾 Save All Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatCurrency, formatDateTime, formatDate, BRANCHES, BRANCH_DETAILS, WINDHOEK_BRANCHES, DELIVERY_FEE_RULES } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Modal, Table, Alert, Select, Textarea } from '../../components/ui';
import { Calendar, UserPlus, CreditCard, Search, Users, Truck, Bell, MessageSquare, ClipboardList, Heart, Plus, Package, Eye, Send, Megaphone } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import StaffServicesTab from '../../components/StaffServicesTab';
import StaffMessagesTab from '../../components/StaffMessagesTab';

export default function FrontDeskPortal() {
  const [activeTab, setActiveTab] = useState('appointments');
  const tabs = [
    { id: 'appointments', label: 'Appointments', icon: '📅' },
    { id: 'checkup', label: 'Full Body Checkup', icon: '🏥' },
    { id: 'registration', label: 'Client Reg', icon: '📝' },
    { id: 'orders', label: 'Orders', icon: '📦' },
    { id: 'payments', label: 'Payments', icon: '💳' },
    { id: 'lookup', label: 'Client Lookup', icon: '🔍' },
    { id: 'delivery', label: 'Delivery', icon: '🚚' },
    { id: 'visitors', label: 'Visitors', icon: '🪪' },
    { id: 'crm', label: 'CRM', icon: '👥' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'staffcomm', label: 'Staff Comm', icon: '📢' },
    { id: 'staff', label: 'Staff Services', icon: '👤' },
    { id: 'messages', label: 'My Messages', icon: '📨' },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Front Desk Portal</h1>
        <p className="text-sm text-gray-500">Manage appointments, clients, and daily operations</p>
      </div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'appointments' && <AppointmentsTab />}
        {activeTab === 'checkup' && <CheckupTab />}
        {activeTab === 'registration' && <RegistrationTab />}
        {activeTab === 'orders' && <OrdersTab />}
        {activeTab === 'payments' && <PaymentsTab />}
        {activeTab === 'lookup' && <ClientLookupTab />}
        {activeTab === 'delivery' && <DeliveryTab />}
        {activeTab === 'visitors' && <VisitorsTab />}
        {activeTab === 'crm' && <CRMTab />}
        {activeTab === 'notifications' && <NotificationsTab />}
        {activeTab === 'staffcomm' && <StaffCommunicationTab />}
        {activeTab === 'staff' && <StaffServicesTab />}
        {activeTab === 'messages' && <StaffMessagesTab />}
      </div>
    </div>
  );
}

function AppointmentsTab() {
  const { user } = useAuth();
  const userBranch = user?.branch || '';
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState('today');
  const [form, setForm] = useState({ full_name: '', phone: '', date: '', time: '', branch: userBranch, type: 'General' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadAppointments = () => {
    setLoading(true);
    const branchParam = userBranch ? `branch=${encodeURIComponent(userBranch)}` : '';
    api.appointments.list(branchParam)
      .then(data => setAppointments(Array.isArray(data) ? data : data.appointments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAppointments(); }, [userBranch]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.full_name || !form.phone || !form.date || !form.time) {
      setError('Name, phone, date and time are required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.appointments.create({
        full_name: form.full_name,
        phone: form.phone,
        date: form.date,
        time: form.time,
        branch: form.branch,
        type: form.type,
        status: 'pending',
      });
      setShowModal(false);
      setForm({ full_name: '', phone: '', date: '', time: '', branch: userBranch, type: 'General' });
      loadAppointments();
    } catch (err) {
      setError(err.message || 'Failed to create appointment');
    }
    setSubmitting(false);
  };

  const handleStatusUpdate = async (id, status) => {
    try {
      await api.appointments.update(id, { status });
      loadAppointments();
    } catch {}
  };

  const today = new Date().toISOString().slice(0, 10);
  const filtered = filter === 'today'
    ? appointments.filter(a => (a.date || a.created_at || '').slice(0, 10) === today)
    : appointments;

  if (loading) return <LoadingSpinner />;

  const columns = [
    { header: 'Patient', key: 'full_name' },
    { header: 'Type', render: (row) => <Badge variant="info">{row.type || 'General'}</Badge> },
    { header: 'Date', render: (row) => formatDateTime(row.date || row.created_at) },
    { header: 'Status', render: (row) => <Badge variant={row.status === 'completed' ? 'success' : row.status === 'cancelled' ? 'danger' : 'warning'}>{row.status || 'Pending'}</Badge> },
    { header: 'Branch', key: 'branch' },
    { header: 'Actions', render: (row) => (
      <div className="flex gap-1">
        {row.status !== 'completed' && (
          <Button size="sm" variant="success" onClick={() => handleStatusUpdate(row.id, 'completed')}>Complete</Button>
        )}
        {row.status !== 'cancelled' && row.status !== 'completed' && (
          <Button size="sm" variant="danger" onClick={() => handleStatusUpdate(row.id, 'cancelled')}>Cancel</Button>
        )}
      </div>
    )},
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-2 items-center">
          <h3 className="font-semibold text-gray-800">Appointments</h3>
          <div className="flex gap-1 ml-4">
            <button onClick={() => setFilter('today')} className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer ${filter === 'today' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}>Today</button>
            <button onClick={() => setFilter('all')} className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer ${filter === 'all' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}>All</button>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Badge variant="primary">{filtered.length} total</Badge>
          <Button size="sm" onClick={() => { setForm(f => ({ ...f, branch: userBranch || f.branch })); setShowModal(true); }}><Plus size={14} /> New Appointment</Button>
        </div>
      </div>
      <Card>
        <Table columns={columns} data={filtered} emptyMessage="No appointments scheduled" />
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Appointment">
        <form onSubmit={handleCreate} className="p-6 space-y-4">
          {error && <Alert type="error">{error}</Alert>}
          <Input label="Full Name" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
          <Input label="Phone Number" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required placeholder="e.g. 0812345678" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Date" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
            <Input label="Time" type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} required />
          </div>
          <Select
            label="Branch"
            value={form.branch}
            onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}
            options={[{ value: '', label: 'Select Branch' }, ...BRANCHES.map(b => ({ value: b, label: b }))]}
          />
          <Select
            label="Type"
            value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
            options={[
              { value: 'General', label: 'General' },
              { value: 'Checkup', label: 'Health Checkup' },
              { value: 'Follow-up', label: 'Follow-up' },
              { value: 'Consultation', label: 'Consultation' },
            ]}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create Appointment'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function CheckupTab() {
  const navigate = useNavigate();
  const [recentCheckups, setRecentCheckups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.appointments.list()
      .then(data => {
        const all = Array.isArray(data) ? data : data.appointments || [];
        setRecentCheckups(all.filter(a => (a.type || '').toLowerCase().includes('check')).slice(0, 20));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardBody>
          <div className="text-center py-8">
            <Heart size={48} className="text-primary mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-800 mb-2">Full Body Check Up</h3>
            <p className="text-gray-500 mb-4">Process walk-in health checkup forms</p>
            <Button onClick={() => navigate('/checkup')}>Open Checkup Form</Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Recent Checkup Forms</h3></CardHeader>
        {loading ? <LoadingSpinner /> : (
          <Table
            columns={[
              { header: 'Patient', key: 'full_name' },
              { header: 'Date', render: r => formatDateTime(r.date || r.created_at) },
              { header: 'Branch', key: 'branch' },
              { header: 'Status', render: r => <Badge variant={r.status === 'completed' ? 'success' : 'warning'}>{r.status || 'Pending'}</Badge> },
            ]}
            data={recentCheckups}
            emptyMessage="No recent checkup forms"
          />
        )}
      </Card>
    </div>
  );
}

function RegistrationTab() {
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', idNumber: '', address: '' });
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const validateIdNumber = (id) => {
    if (!id) return true;
    const cleaned = id.replace(/\s/g, '');
    return cleaned.length >= 6 && cleaned.length <= 20 && /^[A-Za-z0-9]+$/.test(cleaned);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (form.idNumber && !validateIdNumber(form.idNumber)) {
      setError('ID Number must be 6-20 alphanumeric characters');
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.clients.create({
        full_name: form.fullName,
        phone: form.phone,
        email: form.email,
        id_number: form.idNumber,
        address: form.address,
      });
      const clientId = result?.id || result?.client_id || 'N/A';
      setSuccess(`Client registered successfully! Client ID: ${clientId}`);
      setForm({ fullName: '', phone: '', email: '', idNumber: '', address: '' });
    } catch (err) {
      setError(err.message || 'Registration failed');
    }
    setSubmitting(false);
  };

  return (
    <Card>
      <CardHeader><h3 className="font-bold text-gray-800">Register New Client</h3></CardHeader>
      <CardBody>
        {success && <Alert type="success" className="mb-4">{success}</Alert>}
        {error && <Alert type="error" className="mb-4">{error}</Alert>}
        <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
          <Input label="Full Name" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} required />
          <Input label="Phone" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required />
          <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <Input
            label="ID Number"
            value={form.idNumber}
            onChange={e => setForm(f => ({ ...f, idNumber: e.target.value }))}
            error={form.idNumber && !validateIdNumber(form.idNumber) ? 'Must be 6-20 alphanumeric characters' : ''}
          />
          <div className="md:col-span-2">
            <Input label="Address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" disabled={submitting}>{submitting ? 'Registering...' : 'Register Client'}</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function OrdersTab() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subView, setSubView] = useState('pending');

  useEffect(() => {
    api.orders.list()
      .then(data => setOrders(Array.isArray(data) ? data : data.orders || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleStatusUpdate = async (id, status) => {
    try {
      await api.orders.update(id, { status });
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    } catch {}
  };

  const subTabs = [
    { id: 'pending', label: 'Pending Orders' },
    { id: 'processing', label: 'Processing' },
    { id: 'shipped', label: 'Shipped' },
    { id: 'delivered', label: 'Delivered' },
    { id: 'all', label: 'All Orders' },
  ];

  const filteredOrders = subView === 'all'
    ? orders
    : orders.filter(o => (o.status || 'pending').toLowerCase() === subView);

  const statusCounts = {
    pending: orders.filter(o => (o.status || 'pending').toLowerCase() === 'pending').length,
    processing: orders.filter(o => (o.status || '').toLowerCase() === 'processing').length,
    shipped: orders.filter(o => (o.status || '').toLowerCase() === 'shipped').length,
    delivered: orders.filter(o => (o.status || '').toLowerCase() === 'delivered').length,
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard title="Pending" value={statusCounts.pending} color="orange" />
        <StatCard title="Processing" value={statusCounts.processing} color="blue" />
        <StatCard title="Shipped" value={statusCounts.shipped} color="purple" />
        <StatCard title="Delivered" value={statusCounts.delivered} color="green" />
      </div>

      <div className="flex gap-1 mb-4 bg-gray-50 p-1 rounded-lg overflow-x-auto">
        {subTabs.map(t => (
          <button
            key={t.id}
            onClick={() => setSubView(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all cursor-pointer whitespace-nowrap ${subView === t.id ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
            {t.id !== 'all' && <span className="ml-1.5 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full">{statusCounts[t.id]}</span>}
          </button>
        ))}
      </div>

      <Card>
        <Table
          columns={[
            { header: 'Order ID', render: r => <span className="font-mono text-xs">#{r.id}</span> },
            { header: 'Client', key: 'client_name', render: r => r.client_name || r.distributor_name || r.customer_name || '-' },
            { header: 'Date', render: r => formatDateTime(r.created_at || r.order_date) },
            { header: 'Total', render: r => <span className="font-bold text-green-600">{formatCurrency(r.total_amount || r.total || 0)}</span> },
            { header: 'Status', render: r => {
              const s = (r.status || 'pending').toLowerCase();
              const v = s === 'delivered' ? 'success' : s === 'shipped' ? 'info' : s === 'processing' ? 'primary' : 'warning';
              return <Badge variant={v}>{r.status || 'Pending'}</Badge>;
            }},
            { header: 'Actions', render: r => {
              const s = (r.status || 'pending').toLowerCase();
              return (
                <div className="flex gap-1">
                  {s === 'pending' && <Button size="sm" variant="primary" onClick={() => handleStatusUpdate(r.id, 'processing')}>Process</Button>}
                  {s === 'processing' && <Button size="sm" variant="warning" onClick={() => handleStatusUpdate(r.id, 'shipped')}>Ship</Button>}
                  {s === 'shipped' && <Button size="sm" variant="success" onClick={() => handleStatusUpdate(r.id, 'delivered')}>Delivered</Button>}
                </div>
              );
            }},
          ]}
          data={filteredOrders}
          emptyMessage={`No ${subView === 'all' ? '' : subView + ' '}orders found`}
        />
      </Card>
    </div>
  );
}

function PaymentsTab() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ client_name: '', amount: '', payment_method: 'Cash', reference: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadPayments = () => {
    setLoading(true);
    api.branch.payments()
      .then(data => setPayments(Array.isArray(data) ? data : data.payments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadPayments(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.client_name || !form.amount || Number(form.amount) <= 0) {
      setError('Client name and valid amount are required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.branch.createPayment({
        client_name: form.client_name,
        amount: Number(form.amount),
        payment_method: form.payment_method,
        reference: form.reference,
      });
      setShowModal(false);
      setForm({ client_name: '', amount: '', payment_method: 'Cash', reference: '' });
      loadPayments();
    } catch (err) {
      setError(err.message || 'Failed to record payment');
    }
    setSubmitting(false);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-800">Payment Records</h3>
        <Button size="sm" onClick={() => setShowModal(true)}><Plus size={14} /> Record Payment</Button>
      </div>
      <Card>
        <Table
          columns={[
            { header: 'Date', render: (r) => formatDateTime(r.created_at) },
            { header: 'Client', key: 'client_name' },
            { header: 'Amount', render: (r) => <span className="font-bold text-green-600">{formatCurrency(r.amount)}</span> },
            { header: 'Method', key: 'payment_method' },
            { header: 'Reference', key: 'reference' },
            { header: 'Status', render: (r) => <Badge variant="success">{r.status || 'Completed'}</Badge> },
          ]}
          data={payments}
          emptyMessage="No payment records"
        />
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Record Payment">
        <form onSubmit={handleCreate}>
          <div className="p-6 space-y-4">
            {error && <Alert type="error">{error}</Alert>}
            <Input label="Client Name" value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} required />
            <Input label="Amount (N$)" type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
            <Select
              label="Payment Method"
              value={form.payment_method}
              onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}
              options={[
                { value: 'Cash', label: 'Cash' },
                { value: 'Card', label: 'Card' },
                { value: 'Mobile', label: 'Mobile Money' },
                { value: 'Bank', label: 'Bank Transfer' },
              ]}
            />
            <Input label="Reference" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} />
          </div>
          <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Recording...' : '💾 Save Payment'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function ClientLookupTab() {
  const [search, setSearch] = useState('');
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!search.trim()) return;
    setLoading(true);
    try {
      const data = await api.clients.list();
      const all = Array.isArray(data) ? data : data.clients || [];
      setClients(all.filter(c => c.full_name?.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)));
    } catch {}
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader><h3 className="font-bold text-gray-800">Client Lookup</h3></CardHeader>
      <CardBody>
        <div className="flex gap-2 mb-4">
          <Input placeholder="Search by name or phone..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1" />
          <Button onClick={handleSearch} disabled={loading}><Search size={16} /> Search</Button>
        </div>
        {loading ? <LoadingSpinner /> : (
          <Table
            columns={[
              { header: 'Name', key: 'full_name' },
              { header: 'Phone', key: 'phone' },
              { header: 'Email', key: 'email' },
              { header: 'ID Number', key: 'id_number' },
              { header: 'Registered', render: r => formatDate(r.created_at) },
            ]}
            data={clients}
            emptyMessage="Search for a client above"
          />
        )}
      </CardBody>
    </Card>
  );
}

function DeliveryTab() {
  const { user } = useAuth();
  const [deliveries, setDeliveries] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ order_id: '', delivery_date: '', address: '', driver: '', notes: '', destination_branch: '', proof_of_payment: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const deliveryFee = form.destination_branch
    ? (DELIVERY_FEE_RULES.isWindhoek(form.destination_branch) ? DELIVERY_FEE_RULES.windhoekFee : DELIVERY_FEE_RULES.outsideWindhoekFee)
    : null;

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.delivery_date || !form.address) {
      setError('Delivery date and address are required');
      return;
    }
    if (!form.destination_branch) {
      setError('Please select a destination branch');
      return;
    }
    if (deliveryFee > 0 && !form.proof_of_payment) {
      setError('Proof of payment is required for deliveries outside Windhoek (N$150 delivery fee)');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const delivery = {
        order_id: form.order_id,
        delivery_date: form.delivery_date,
        address: form.address,
        driver: form.driver,
        notes: form.notes,
        destination_branch: form.destination_branch,
        delivery_fee: deliveryFee,
        proof_of_payment: form.proof_of_payment,
        status: 'scheduled',
      };
      setDeliveries(prev => [...prev, { ...delivery, id: Date.now(), created_at: new Date().toISOString() }]);
      setShowModal(false);
      setForm({ order_id: '', delivery_date: '', address: '', driver: '', notes: '', destination_branch: '', proof_of_payment: '' });
    } catch (err) {
      setError(err.message || 'Failed to schedule delivery');
    }
    setSubmitting(false);
  };

  const updateStatus = (id, status) => {
    setDeliveries(prev => prev.map(d => d.id === id ? { ...d, status } : d));
  };

  return (
    <div>
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg mb-4 text-sm">
        <p className="font-medium text-blue-800">Delivery Fee Rules:</p>
        <p className="text-blue-700">Windhoek (CBD, Hochlandpark, Khomasdal) = <strong>FREE</strong> | Outside Windhoek = <strong>N$ 150.00</strong></p>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-800">Delivery Management</h3>
        <Button size="sm" onClick={() => setShowModal(true)}><Plus size={14} /> Schedule Delivery</Button>
      </div>
      <Card>
        <Table
          columns={[
            { header: 'Order ID', key: 'order_id' },
            { header: 'Date', render: r => formatDate(r.delivery_date) },
            { header: 'Destination', key: 'destination_branch' },
            { header: 'Address', key: 'address' },
            { header: 'Fee', render: r => <span className={r.delivery_fee > 0 ? 'text-orange-600 font-semibold' : 'text-green-600'}>{r.delivery_fee > 0 ? formatCurrency(r.delivery_fee) : 'FREE'}</span> },
            { header: 'Driver', key: 'driver' },
            { header: 'Status', render: r => (
              <Badge variant={r.status === 'delivered' ? 'success' : r.status === 'in_transit' ? 'info' : 'warning'}>
                {r.status}
              </Badge>
            )},
            { header: 'Actions', render: r => (
              <div className="flex gap-1">
                {r.status === 'scheduled' && <Button size="sm" variant="warning" onClick={() => updateStatus(r.id, 'in_transit')}>Dispatch</Button>}
                {r.status === 'in_transit' && <Button size="sm" variant="success" onClick={() => updateStatus(r.id, 'delivered')}>Delivered</Button>}
              </div>
            )},
          ]}
          data={deliveries}
          emptyMessage="No deliveries scheduled"
        />
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Schedule Delivery">
        <form onSubmit={handleCreate} className="p-6 space-y-4">
          {error && <Alert type="error">{error}</Alert>}
          <Input label="Order ID" value={form.order_id} onChange={e => setForm(f => ({ ...f, order_id: e.target.value }))} />
          <Select
            label="Destination Branch"
            value={form.destination_branch}
            onChange={e => setForm(f => ({ ...f, destination_branch: e.target.value }))}
            options={[{ value: '', label: 'Select Branch' }, ...BRANCHES.map(b => ({ value: b, label: b }))]}
          />
          {form.destination_branch && (
            <div className={`p-3 rounded-lg text-sm ${deliveryFee > 0 ? 'bg-orange-50 border border-orange-200' : 'bg-green-50 border border-green-200'}`}>
              <span className="font-medium">{deliveryFee > 0 ? `Delivery Fee: ${formatCurrency(deliveryFee)} (Outside Windhoek)` : 'Delivery Fee: FREE (Windhoek area)'}</span>
            </div>
          )}
          <Input label="Delivery Date" type="date" value={form.delivery_date} onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))} required />
          <Input label="Delivery Address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} required />
          {deliveryFee > 0 && (
            <Input
              label="Proof of Payment Reference *"
              value={form.proof_of_payment}
              onChange={e => setForm(f => ({ ...f, proof_of_payment: e.target.value }))}
              placeholder="e.g. bank transfer ref, mobile payment ID"
              required
            />
          )}
          <Input label="Driver" value={form.driver} onChange={e => setForm(f => ({ ...f, driver: e.target.value }))} />
          <Textarea label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Scheduling...' : 'Schedule Delivery'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function VisitorsTab() {
  const [visitors, setVisitors] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', company: '', purpose: '', time_in: '', time_out: '', badge_number: '' });
  const [error, setError] = useState('');

  const handleCreate = (e) => {
    e.preventDefault();
    if (!form.name || !form.purpose || !form.time_in) {
      setError('Name, purpose and time in are required');
      return;
    }
    setError('');
    const visitor = {
      ...form,
      id: Date.now(),
      created_at: new Date().toISOString(),
      date: new Date().toISOString().slice(0, 10),
    };
    setVisitors(prev => [visitor, ...prev]);
    setShowModal(false);
    setForm({ name: '', company: '', purpose: '', time_in: '', time_out: '', badge_number: '' });
  };

  const signOut = (id) => {
    const now = new Date().toTimeString().slice(0, 5);
    setVisitors(prev => prev.map(v => v.id === id ? { ...v, time_out: now } : v));
  };

  const todayVisitors = visitors.filter(v => v.date === new Date().toISOString().slice(0, 10));

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-2 items-center">
          <h3 className="font-semibold text-gray-800">Visitor Log</h3>
          <Badge variant="primary">{todayVisitors.length} today</Badge>
        </div>
        <Button size="sm" onClick={() => setShowModal(true)}><Plus size={14} /> Log Visitor</Button>
      </div>

      <div className="grid md:grid-cols-3 gap-3 mb-4">
        <StatCard title="Total Visitors Today" value={todayVisitors.length} color="blue" />
        <StatCard title="Currently In" value={todayVisitors.filter(v => !v.time_out).length} color="green" />
        <StatCard title="Signed Out" value={todayVisitors.filter(v => v.time_out).length} color="orange" />
      </div>

      <Card>
        <Table
          columns={[
            { header: 'Name', key: 'name' },
            { header: 'Company', render: r => r.company || '-' },
            { header: 'Purpose', key: 'purpose' },
            { header: 'Badge #', render: r => r.badge_number || '-' },
            { header: 'Time In', key: 'time_in' },
            { header: 'Time Out', render: r => r.time_out || <Badge variant="warning">Still In</Badge> },
            { header: 'Actions', render: r => (
              !r.time_out && <Button size="sm" variant="danger" onClick={() => signOut(r.id)}>Sign Out</Button>
            )},
          ]}
          data={visitors}
          emptyMessage="No visitors logged"
        />
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Log Visitor">
        <form onSubmit={handleCreate} className="p-6 space-y-4">
          {error && <Alert type="error">{error}</Alert>}
          <Input label="Visitor Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          <Input label="Company / Organization" value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} />
          <Select
            label="Purpose of Visit"
            value={form.purpose}
            onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
            options={[
              { value: '', label: 'Select Purpose' },
              { value: 'Meeting', label: 'Meeting' },
              { value: 'Delivery', label: 'Delivery' },
              { value: 'Interview', label: 'Interview' },
              { value: 'Client Visit', label: 'Client Visit' },
              { value: 'Maintenance', label: 'Maintenance' },
              { value: 'Other', label: 'Other' },
            ]}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Time In" type="time" value={form.time_in} onChange={e => setForm(f => ({ ...f, time_in: e.target.value }))} required />
            <Input label="Time Out" type="time" value={form.time_out} onChange={e => setForm(f => ({ ...f, time_out: e.target.value }))} />
          </div>
          <Input label="Badge Number" value={form.badge_number} onChange={e => setForm(f => ({ ...f, badge_number: e.target.value }))} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit">Log Visitor</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function CRMTab() {
  const [interactions, setInteractions] = useState([]);
  const [form, setForm] = useState({ client_name: '', type: 'Call', notes: '', follow_up_date: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.client_name || !form.notes) {
      setError('Client name and notes are required');
      return;
    }
    setError('');
    const interaction = {
      ...form,
      id: Date.now(),
      created_at: new Date().toISOString(),
    };
    setInteractions(prev => [interaction, ...prev]);
    setSuccess('Interaction logged successfully');
    setForm({ client_name: '', type: 'Call', notes: '', follow_up_date: '' });
    setTimeout(() => setSuccess(''), 3000);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Log Client Interaction</h3></CardHeader>
        <CardBody>
          {success && <Alert type="success" className="mb-4">{success}</Alert>}
          {error && <Alert type="error" className="mb-4">{error}</Alert>}
          <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
            <Input label="Client Name" value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} required />
            <Select
              label="Interaction Type"
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              options={[
                { value: 'Call', label: 'Phone Call' },
                { value: 'Visit', label: 'Walk-in Visit' },
                { value: 'Email', label: 'Email' },
                { value: 'Follow-up', label: 'Follow-up' },
              ]}
            />
            <div className="md:col-span-2">
              <Textarea label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} required />
            </div>
            <Input label="Follow-up Date" type="date" value={form.follow_up_date} onChange={e => setForm(f => ({ ...f, follow_up_date: e.target.value }))} />
            <div className="flex items-end">
              <Button type="submit">Log Interaction</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {interactions.length > 0 && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Recent Interactions</h3></CardHeader>
          <Table
            columns={[
              { header: 'Client', key: 'client_name' },
              { header: 'Type', render: r => <Badge variant="info">{r.type}</Badge> },
              { header: 'Notes', key: 'notes' },
              { header: 'Follow-up', render: r => r.follow_up_date ? formatDate(r.follow_up_date) : '-' },
              { header: 'Logged', render: r => formatDateTime(r.created_at) },
            ]}
            data={interactions}
            emptyMessage="No interactions logged"
          />
        </Card>
      )}
    </div>
  );
}

function NotificationsTab() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.notifications.list()
      .then(data => setNotifications(Array.isArray(data) ? data : data.notifications || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-3">
      {notifications.length === 0 ? (
        <EmptyState icon={<Bell size={48} />} title="No Notifications" description="You're all caught up!" />
      ) : (
        notifications.map((n, i) => (
          <Card key={i}>
            <CardBody>
              <div className="flex items-start gap-3">
                <Bell size={18} className="text-primary mt-0.5" />
                <div>
                  <p className="text-sm text-gray-800">{n.message || n.title}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatDateTime(n.created_at)}</p>
                </div>
              </div>
            </CardBody>
          </Card>
        ))
      )}
    </div>
  );
}

function StaffCommunicationTab() {
  const [announcements, setAnnouncements] = useState([]);
  const [messages, setMessages] = useState([]);
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [showMessageForm, setShowMessageForm] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({ title: '', content: '', priority: 'normal' });
  const [messageForm, setMessageForm] = useState({ recipient: '', subject: '', body: '' });
  const [success, setSuccess] = useState('');

  const handleAnnouncement = (e) => {
    e.preventDefault();
    if (!announcementForm.title || !announcementForm.content) return;
    const announcement = {
      ...announcementForm,
      id: Date.now(),
      author: 'Front Desk',
      created_at: new Date().toISOString(),
    };
    setAnnouncements(prev => [announcement, ...prev]);
    setAnnouncementForm({ title: '', content: '', priority: 'normal' });
    setShowAnnouncementForm(false);
    setSuccess('Announcement posted successfully');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleMessage = (e) => {
    e.preventDefault();
    if (!messageForm.recipient || !messageForm.body) return;
    const message = {
      ...messageForm,
      id: Date.now(),
      sender: 'Front Desk',
      status: 'sent',
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [message, ...prev]);
    setMessageForm({ recipient: '', subject: '', body: '' });
    setShowMessageForm(false);
    setSuccess('Message sent successfully');
    setTimeout(() => setSuccess(''), 3000);
  };

  return (
    <div className="space-y-6">
      {success && <Alert type="success">{success}</Alert>}

      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-800">Staff Communication</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={() => setShowAnnouncementForm(true)}><Megaphone size={14} /> New Announcement</Button>
          <Button size="sm" variant="secondary" onClick={() => setShowMessageForm(true)}><Send size={14} /> Send Message</Button>
        </div>
      </div>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Announcements</h3></CardHeader>
        {announcements.length === 0 ? (
          <CardBody>
            <EmptyState icon={<Megaphone size={40} />} title="No Announcements" description="Post an announcement for all staff" />
          </CardBody>
        ) : (
          <div className="divide-y divide-gray-100">
            {announcements.map(a => (
              <div key={a.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-gray-800">{a.title}</h4>
                      {a.priority === 'urgent' && <Badge variant="danger">Urgent</Badge>}
                      {a.priority === 'important' && <Badge variant="warning">Important</Badge>}
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{a.content}</p>
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap ml-4">{formatDateTime(a.created_at)}</span>
                </div>
                <p className="text-xs text-gray-400 mt-2">Posted by {a.author}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Messages</h3></CardHeader>
        <Table
          columns={[
            { header: 'To', key: 'recipient' },
            { header: 'Subject', render: r => r.subject || '-' },
            { header: 'Message', render: r => <span className="truncate max-w-[200px] block">{r.body}</span> },
            { header: 'Status', render: r => <Badge variant="success">{r.status}</Badge> },
            { header: 'Sent', render: r => formatDateTime(r.created_at) },
          ]}
          data={messages}
          emptyMessage="No messages sent"
        />
      </Card>

      <Modal open={showAnnouncementForm} onClose={() => setShowAnnouncementForm(false)} title="New Announcement">
        <form onSubmit={handleAnnouncement} className="p-6 space-y-4">
          <Input label="Title" value={announcementForm.title} onChange={e => setAnnouncementForm(f => ({ ...f, title: e.target.value }))} required />
          <Textarea label="Content" value={announcementForm.content} onChange={e => setAnnouncementForm(f => ({ ...f, content: e.target.value }))} required />
          <Select
            label="Priority"
            value={announcementForm.priority}
            onChange={e => setAnnouncementForm(f => ({ ...f, priority: e.target.value }))}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'important', label: 'Important' },
              { value: 'urgent', label: 'Urgent' },
            ]}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowAnnouncementForm(false)}>Cancel</Button>
            <Button type="submit">Post Announcement</Button>
          </div>
        </form>
      </Modal>

      <Modal open={showMessageForm} onClose={() => setShowMessageForm(false)} title="Send Message">
        <form onSubmit={handleMessage} className="p-6 space-y-4">
          <Input label="Recipient" value={messageForm.recipient} onChange={e => setMessageForm(f => ({ ...f, recipient: e.target.value }))} required />
          <Input label="Subject" value={messageForm.subject} onChange={e => setMessageForm(f => ({ ...f, subject: e.target.value }))} />
          <Textarea label="Message" value={messageForm.body} onChange={e => setMessageForm(f => ({ ...f, body: e.target.value }))} required />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowMessageForm(false)}>Cancel</Button>
            <Button type="submit">Send Message</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}


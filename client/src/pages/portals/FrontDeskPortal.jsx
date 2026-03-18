import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatCurrency, formatDateTime, formatDate, BRANCHES } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Modal, Table, Alert, Select, Textarea } from '../../components/ui';
import { Calendar, UserPlus, CreditCard, Search, Users, Truck, Bell, MessageSquare, ClipboardList, Heart, Plus } from 'lucide-react';

export default function FrontDeskPortal() {
  const [activeTab, setActiveTab] = useState('appointments');
  const tabs = [
    { id: 'appointments', label: 'Appointments', icon: '📅' },
    { id: 'checkup', label: 'Checkup', icon: '🏥' },
    { id: 'registration', label: 'Client Reg', icon: '📝' },
    { id: 'payments', label: 'Payments', icon: '💳' },
    { id: 'lookup', label: 'Client Lookup', icon: '🔍' },
    { id: 'delivery', label: 'Delivery', icon: '🚚' },
    { id: 'crm', label: 'CRM', icon: '👥' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'staff', label: 'Staff Services', icon: '👤' },
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
        {activeTab === 'payments' && <PaymentsTab />}
        {activeTab === 'lookup' && <ClientLookupTab />}
        {activeTab === 'delivery' && <DeliveryTab />}
        {activeTab === 'crm' && <CRMTab />}
        {activeTab === 'notifications' && <NotificationsTab />}
        {activeTab === 'staff' && <StaffServicesTab />}
      </div>
    </div>
  );
}

function AppointmentsTab() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filter, setFilter] = useState('today');
  const [form, setForm] = useState({ full_name: '', date: '', time: '', branch: '', type: 'General' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadAppointments = () => {
    setLoading(true);
    api.appointments.list()
      .then(data => setAppointments(Array.isArray(data) ? data : data.appointments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAppointments(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.full_name || !form.date || !form.time) {
      setError('Name, date and time are required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.appointments.create({
        patient_name: form.full_name,
        appointment_date: `${form.date}T${form.time}`,
        branch_id: form.branch,
        type: form.type,
        status: 'pending',
      });
      setShowModal(false);
      setForm({ full_name: '', date: '', time: '', branch: '', type: 'General' });
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
    ? appointments.filter(a => (a.appointment_date || a.created_at || '').slice(0, 10) === today)
    : appointments;

  if (loading) return <LoadingSpinner />;

  const columns = [
    { header: 'Patient', key: 'patient_name' },
    { header: 'Type', render: (row) => <Badge variant="info">{row.type || 'General'}</Badge> },
    { header: 'Date', render: (row) => formatDateTime(row.appointment_date || row.created_at) },
    { header: 'Status', render: (row) => <Badge variant={row.status === 'completed' ? 'success' : row.status === 'cancelled' ? 'danger' : 'warning'}>{row.status || 'Pending'}</Badge> },
    { header: 'Branch', key: 'branch_id' },
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
          <Button size="sm" onClick={() => setShowModal(true)}><Plus size={14} /> New Appointment</Button>
        </div>
      </div>
      <Card>
        <Table columns={columns} data={filtered} emptyMessage="No appointments scheduled" />
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="New Appointment">
        <form onSubmit={handleCreate} className="p-6 space-y-4">
          {error && <Alert type="error">{error}</Alert>}
          <Input label="Full Name" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
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
  return (
    <Card>
      <CardBody>
        <div className="text-center py-8">
          <Heart size={48} className="text-primary mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-800 mb-2">Full Body Check Up</h3>
          <p className="text-gray-500 mb-4">Process walk-in health checkup forms</p>
          <Button onClick={() => window.location.href = '/checkup'}>Open Checkup Form</Button>
        </div>
      </CardBody>
    </Card>
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
        <form onSubmit={handleCreate} className="p-6 space-y-4">
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
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Recording...' : 'Record Payment'}</Button>
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
  const [deliveries, setDeliveries] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ order_id: '', delivery_date: '', address: '', driver: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.delivery_date || !form.address) {
      setError('Delivery date and address are required');
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
        status: 'scheduled',
      };
      setDeliveries(prev => [...prev, { ...delivery, id: Date.now(), created_at: new Date().toISOString() }]);
      setShowModal(false);
      setForm({ order_id: '', delivery_date: '', address: '', driver: '', notes: '' });
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
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-800">Delivery Management</h3>
        <Button size="sm" onClick={() => setShowModal(true)}><Plus size={14} /> Schedule Delivery</Button>
      </div>
      <Card>
        <Table
          columns={[
            { header: 'Order ID', key: 'order_id' },
            { header: 'Date', render: r => formatDate(r.delivery_date) },
            { header: 'Address', key: 'address' },
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
          <Input label="Delivery Date" type="date" value={form.delivery_date} onChange={e => setForm(f => ({ ...f, delivery_date: e.target.value }))} required />
          <Input label="Delivery Address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} required />
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

function StaffServicesTab() {
  const [form, setForm] = useState({ leave_type: 'Annual', start_date: '', end_date: '', reason: '' });
  const [submitted, setSubmitted] = useState(false);
  const [requests, setRequests] = useState([]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const request = {
      ...form,
      id: Date.now(),
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    setRequests(prev => [request, ...prev]);
    setSubmitted(true);
    setForm({ leave_type: 'Annual', start_date: '', end_date: '', reason: '' });
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Leave Request</h3></CardHeader>
        <CardBody>
          {submitted && <Alert type="success" className="mb-4">Leave request submitted successfully!</Alert>}
          <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
            <Select
              label="Leave Type"
              value={form.leave_type}
              onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))}
              options={[
                { value: 'Annual', label: 'Annual Leave' },
                { value: 'Sick', label: 'Sick Leave' },
                { value: 'Personal', label: 'Personal Leave' },
                { value: 'Family', label: 'Family Responsibility' },
              ]}
            />
            <div />
            <Input label="Start Date" type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} required />
            <Input label="End Date" type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} required />
            <div className="md:col-span-2">
              <Textarea label="Reason" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} required />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit">Submit Leave Request</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {requests.length > 0 && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">My Leave Requests</h3></CardHeader>
          <Table
            columns={[
              { header: 'Type', render: r => <Badge variant="info">{r.leave_type}</Badge> },
              { header: 'From', render: r => formatDate(r.start_date) },
              { header: 'To', render: r => formatDate(r.end_date) },
              { header: 'Status', render: r => <Badge variant="warning">{r.status}</Badge> },
            ]}
            data={requests}
            emptyMessage="No leave requests"
          />
        </Card>
      )}
    </div>
  );
}

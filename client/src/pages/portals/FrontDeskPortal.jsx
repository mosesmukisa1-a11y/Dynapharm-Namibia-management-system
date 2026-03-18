import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatCurrency, formatDateTime } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Modal, Table, Alert } from '../../components/ui';
import { Calendar, UserPlus, CreditCard, Search, Users, Truck, Bell, MessageSquare, ClipboardList, Heart } from 'lucide-react';

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

  useEffect(() => {
    api.appointments.list()
      .then(data => setAppointments(Array.isArray(data) ? data : data.appointments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const columns = [
    { header: 'Patient', key: 'patient_name' },
    { header: 'Type', render: (row) => <Badge variant="info">{row.type || 'General'}</Badge> },
    { header: 'Date', render: (row) => formatDateTime(row.appointment_date || row.created_at) },
    { header: 'Status', render: (row) => <Badge variant={row.status === 'completed' ? 'success' : row.status === 'cancelled' ? 'danger' : 'warning'}>{row.status || 'Pending'}</Badge> },
    { header: 'Branch', key: 'branch_id' },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-800">Today's Appointments</h3>
        <Badge variant="primary">{appointments.length} total</Badge>
      </div>
      <Card>
        <Table columns={columns} data={appointments} emptyMessage="No appointments scheduled" />
      </Card>
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.clients.create({ full_name: form.fullName, phone: form.phone, email: form.email, id_number: form.idNumber, address: form.address });
      setSuccess('Client registered successfully!');
      setForm({ fullName: '', phone: '', email: '', idNumber: '', address: '' });
    } catch (err) {
      setSuccess('');
    }
  };

  return (
    <Card>
      <CardHeader><h3 className="font-bold text-gray-800">Register New Client</h3></CardHeader>
      <CardBody>
        {success && <Alert type="success" className="mb-4">{success}</Alert>}
        <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
          <Input label="Full Name" value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} required />
          <Input label="Phone" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} required />
          <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <Input label="ID Number" value={form.idNumber} onChange={e => setForm(f => ({ ...f, idNumber: e.target.value }))} />
          <div className="md:col-span-2">
            <Input label="Address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit">Register Client</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

function PaymentsTab() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.branch.payments()
      .then(data => setPayments(Array.isArray(data) ? data : data.payments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <Card>
      <CardHeader><h3 className="font-bold text-gray-800">Payment Records</h3></CardHeader>
      <Table
        columns={[
          { header: 'Date', render: (r) => formatDateTime(r.created_at) },
          { header: 'Client', key: 'client_name' },
          { header: 'Amount', render: (r) => <span className="font-bold text-green-600">{formatCurrency(r.amount)}</span> },
          { header: 'Method', key: 'payment_method' },
          { header: 'Status', render: (r) => <Badge variant="success">{r.status || 'Completed'}</Badge> },
        ]}
        data={payments}
        emptyMessage="No payment records"
      />
    </Card>
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
  return <EmptyState icon={<Truck size={48} />} title="Delivery Management" description="Track and manage product deliveries to customers." />;
}

function CRMTab() {
  return <EmptyState icon={<Users size={48} />} title="Customer Relationship Management" description="Manage customer interactions and follow-ups." />;
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
  return <EmptyState icon={<ClipboardList size={48} />} title="Staff Services" description="Access leave requests, HR forms, and internal tools." />;
}

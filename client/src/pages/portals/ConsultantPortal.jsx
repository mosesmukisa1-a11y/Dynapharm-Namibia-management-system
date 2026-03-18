import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatDateTime, formatDate } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Badge, LoadingSpinner, EmptyState, Table, Modal } from '../../components/ui';
import { Stethoscope, Users, FileText, Bell, BarChart3, ClipboardList } from 'lucide-react';

export default function ConsultantPortal() {
  const [activeTab, setActiveTab] = useState('checkups');
  const tabs = [
    { id: 'checkups', label: 'Checkup Forms', icon: '📋' },
    { id: 'clients', label: 'Clients', icon: '👥' },
    { id: 'reports', label: 'Reports', icon: '📝' },
    { id: 'followups', label: 'Follow-ups', icon: '🔔' },
    { id: 'analytics', label: 'Analytics', icon: '📊' },
    { id: 'staff', label: 'Staff Services', icon: '👤' },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Stethoscope size={24} className="text-primary" /> Consultant Portal
        </h1>
        <p className="text-sm text-gray-500">Review checkups, manage clients, and create health reports</p>
      </div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'checkups' && <CheckupsTab />}
        {activeTab === 'clients' && <ClientsTab />}
        {activeTab === 'reports' && <ReportsTab />}
        {activeTab === 'followups' && <FollowupsTab />}
        {activeTab === 'analytics' && <AnalyticsTab />}
        {activeTab === 'staff' && <StaffTab />}
      </div>
    </div>
  );
}

function CheckupsTab() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('upcoming');

  useEffect(() => {
    api.appointments.list('type=checkup')
      .then(data => setAppointments(Array.isArray(data) ? data : data.appointments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const filtered = appointments.filter(a => {
    if (filter === 'upcoming') return a.status !== 'completed';
    return a.status === 'completed';
  });

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setFilter('upcoming')} className={`px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer ${filter === 'upcoming' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}>Upcoming</button>
        <button onClick={() => setFilter('completed')} className={`px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer ${filter === 'completed' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'}`}>Completed</button>
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={<Stethoscope size={48} />} title="No checkup forms" description={`No ${filter} checkups found.`} />
      ) : (
        <div className="grid gap-3">
          {filtered.map(apt => (
            <Card key={apt.id} className="hover:shadow-md transition-shadow">
              <CardBody>
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-gray-800">{apt.patient_name}</h4>
                    <p className="text-xs text-gray-500 mt-1">{formatDateTime(apt.appointment_date || apt.created_at)}</p>
                    <p className="text-xs text-gray-400">{apt.branch_id}</p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant={apt.status === 'completed' ? 'success' : 'warning'}>{apt.status || 'Pending'}</Badge>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ClientsTab() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.clients.list()
      .then(data => setClients(Array.isArray(data) ? data : data.clients || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <Card>
      <Table
        columns={[
          { header: 'Name', key: 'full_name' },
          { header: 'Phone', key: 'phone' },
          { header: 'Email', key: 'email' },
          { header: 'Created', render: (r) => formatDate(r.created_at) },
        ]}
        data={clients}
        emptyMessage="No clients found"
      />
    </Card>
  );
}

function ReportsTab() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.reports.list()
      .then(data => setReports(Array.isArray(data) ? data : data.reports || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-3">
      {reports.length === 0 ? (
        <EmptyState icon={<FileText size={48} />} title="No Reports" description="Create reports from checkup forms." />
      ) : (
        reports.map(r => (
          <Card key={r.id}>
            <CardBody>
              <h4 className="font-semibold text-gray-800">{r.client_name || r.title || 'Report'}</h4>
              <p className="text-xs text-gray-500 mt-1">{formatDateTime(r.created_at)}</p>
            </CardBody>
          </Card>
        ))
      )}
    </div>
  );
}

function FollowupsTab() {
  return <EmptyState icon={<Bell size={48} />} title="Follow-ups" description="Track patient follow-up appointments and check-in reminders." />;
}

function AnalyticsTab() {
  return <EmptyState icon={<BarChart3 size={48} />} title="Analytics" description="View consultation statistics and health trends." />;
}

function StaffTab() {
  return <EmptyState icon={<ClipboardList size={48} />} title="Staff Services" description="Access leave requests, HR forms, and internal tools." />;
}

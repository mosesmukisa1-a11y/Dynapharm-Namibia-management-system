import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatDate, formatDateTime } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, Table, Modal, Alert } from '../../components/ui';
import { Users, Calendar, AlertTriangle, UserX, Clock, Star, MessageSquare, Database, ClipboardList, Plus } from 'lucide-react';

export default function HRPortal() {
  const [activeTab, setActiveTab] = useState('employees');
  const tabs = [
    { id: 'employees', label: 'Employees', icon: '👥' },
    { id: 'leave', label: 'Leave', icon: '📅' },
    { id: 'warnings', label: 'Warnings', icon: '⚠️' },
    { id: 'terminations', label: 'Terminations', icon: '🚫' },
    { id: 'attendance', label: 'Attendance', icon: '🕐' },
    { id: 'performance', label: 'Performance', icon: '⭐' },
    { id: 'communication', label: 'Communication', icon: '💬' },
    { id: 'data', label: 'Data Collection', icon: '📊' },
    { id: 'staff', label: 'Staff Services', icon: '👤' },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">HR Portal</h1>
        <p className="text-sm text-gray-500">Human Resources management and employee services</p>
      </div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'employees' && <EmployeesTab />}
        {activeTab === 'leave' && <LeaveTab />}
        {activeTab === 'warnings' && <WarningsTab />}
        {activeTab === 'terminations' && <TerminationsTab />}
        {activeTab === 'attendance' && <AttendanceTab />}
        {activeTab === 'performance' && <PerformanceTab />}
        {activeTab === 'communication' && <CommunicationTab />}
        {activeTab === 'data' && <DataTab />}
        {activeTab === 'staff' && <StaffServicesTab />}
      </div>
    </div>
  );
}

function EmployeesTab() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.employees.list()
      .then(d => setEmployees(Array.isArray(d) ? d : d.employees || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-800">Employee Directory</h3>
        <Button size="sm"><Plus size={14} /> Add Employee</Button>
      </div>
      <Card>
        <Table
          columns={[
            { header: 'Name', key: 'full_name' },
            { header: 'Position', key: 'position' },
            { header: 'Department', key: 'department' },
            { header: 'Branch', key: 'branch' },
            { header: 'Status', render: r => <Badge variant={r.status === 'active' ? 'success' : 'danger'}>{r.status || 'Active'}</Badge> },
            { header: 'Joined', render: r => formatDate(r.hire_date || r.created_at) },
          ]}
          data={employees}
          emptyMessage="No employees found"
        />
      </Card>
    </div>
  );
}

function LeaveTab() { return <EmptyState icon={<Calendar size={48} />} title="Leave Management" description="Process leave applications, track balances, and manage schedules." />; }
function WarningsTab() { return <EmptyState icon={<AlertTriangle size={48} />} title="Warnings & Disciplinary" description="Issue and track employee warnings and disciplinary actions." />; }
function TerminationsTab() { return <EmptyState icon={<UserX size={48} />} title="Terminations" description="Process employee terminations and offboarding." />; }
function AttendanceTab() { return <EmptyState icon={<Clock size={48} />} title="Attendance" description="Track daily attendance and working hours." />; }
function PerformanceTab() { return <EmptyState icon={<Star size={48} />} title="Performance Reviews" description="Conduct and track employee performance evaluations." />; }
function CommunicationTab() { return <EmptyState icon={<MessageSquare size={48} />} title="Staff Communication" description="Send announcements and internal memos to staff." />; }
function DataTab() { return <EmptyState icon={<Database size={48} />} title="Data Collection" description="Collect and manage employee payroll and personal data." />; }
function StaffServicesTab() { return <EmptyState icon={<ClipboardList size={48} />} title="Staff Services" description="Access personal leave requests and HR forms." />; }

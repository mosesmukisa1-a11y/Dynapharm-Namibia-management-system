import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatDate, formatDateTime, BRANCH_DETAILS } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, Table, Modal, Alert, Select, Textarea } from '../../components/ui';
import { Users, Calendar, AlertTriangle, UserX, Clock, Star, MessageSquare, Database, ClipboardList, Plus } from 'lucide-react';
import SalaryLedgerTab from '../../components/SalaryLedgerTab';
import StaffServicesTab from '../../components/StaffServicesTab';

export default function HRPortal() {
  const [activeTab, setActiveTab] = useState('employees');
  const tabs = [
    { id: 'employees', label: 'Employees', icon: '👥' },
    { id: 'salary', label: 'Salary Ledger', icon: '💼' },
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
        {activeTab === 'salary' && <SalaryLedgerTab role="hr" />}
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
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ full_name: '', position: '', department: '', branch: '', hire_date: '', phone: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadEmployees = () => {
    setLoading(true);
    api.employees.list()
      .then(d => setEmployees(Array.isArray(d) ? d : d.employees || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadEmployees(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.full_name || !form.position) {
      setError('Name and position are required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.employees.create(form);
      setShowModal(false);
      setForm({ full_name: '', position: '', department: '', branch: '', hire_date: '', phone: '', email: '' });
      loadEmployees();
    } catch (err) {
      setError(err.message || 'Failed to add employee');
    }
    setSubmitting(false);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-gray-800">Employee Directory</h3>
        <Button size="sm" onClick={() => setShowModal(true)}><Plus size={14} /> Add Employee</Button>
      </div>
      <Card>
        <Table
          columns={[
            { header: 'Name', key: 'full_name' },
            { header: 'Position', key: 'position' },
            { header: 'Department', key: 'department' },
            { header: 'Branch', key: 'branch' },
            { header: 'Phone', key: 'phone' },
            { header: 'Status', render: r => <Badge variant={r.status === 'active' ? 'success' : 'danger'}>{r.status || 'Active'}</Badge> },
            { header: 'Joined', render: r => formatDate(r.hire_date || r.created_at) },
          ]}
          data={employees}
          emptyMessage="No employees found"
        />
      </Card>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Employee">
        <form onSubmit={handleCreate} className="p-6 space-y-4">
          {error && <Alert type="error">{error}</Alert>}
          <div className="grid grid-cols-2 gap-4">
            <Input label="Full Name" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
            <Input label="Position" value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Department"
              value={form.department}
              onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
              options={[
                { value: '', label: 'Select Department' },
                { value: 'Operations', label: 'Operations' },
                { value: 'Sales', label: 'Sales' },
                { value: 'Finance', label: 'Finance' },
                { value: 'HR', label: 'Human Resources' },
                { value: 'IT', label: 'IT' },
                { value: 'Warehouse', label: 'Warehouse' },
                { value: 'Health', label: 'Health Services' },
              ]}
            />
            <Select
              label="Branch"
              value={form.branch}
              onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}
              options={[{ value: '', label: 'Select Branch' }, ...BRANCH_DETAILS.map(b => ({ value: b.id, label: b.name }))]}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Hire Date" type="date" value={form.hire_date} onChange={e => setForm(f => ({ ...f, hire_date: e.target.value }))} />
            <Input label="Phone" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Adding...' : 'Add Employee'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function LeaveTab() {
  const [employees, setEmployees] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ employee_id: '', employee_name: '', leave_type: 'Annual', start_date: '', end_date: '', reason: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = () => {
    Promise.all([
      api.employees.list().then(d => Array.isArray(d) ? d : d.employees || []).catch(() => []),
      api.hr.leaves().then(d => Array.isArray(d) ? d : d.leaves || []).catch(() => []),
    ]).then(([emps, lvs]) => {
      setEmployees(emps);
      setLeaves(lvs);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.employee_name || !form.start_date || !form.end_date) {
      setError('Employee, start date, and end date are required');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await api.hr.createLeave(form);
      setSuccess('Leave request submitted');
      setForm({ employee_id: '', employee_name: '', leave_type: 'Annual', start_date: '', end_date: '', reason: '' });
      setTimeout(() => setSuccess(''), 3000);
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to submit leave request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await api.hr.updateLeave(id, { status: 'approved' });
      setLeaves(prev => prev.map(l => l.id === id ? { ...l, status: 'approved' } : l));
    } catch (err) {
      setError(err.message || 'Failed to approve leave');
    }
  };

  const handleReject = async (id) => {
    try {
      await api.hr.updateLeave(id, { status: 'rejected' });
      setLeaves(prev => prev.map(l => l.id === id ? { ...l, status: 'rejected' } : l));
    } catch (err) {
      setError(err.message || 'Failed to reject leave');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Leave Request</h3></CardHeader>
        <CardBody>
          {success && <Alert type="success" className="mb-4">{success}</Alert>}
          {error && <Alert type="error" className="mb-4">{error}</Alert>}
          <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
            <Select
              label="Employee"
              value={form.employee_name}
              onChange={e => setForm(f => ({ ...f, employee_name: e.target.value }))}
              options={[
                { value: '', label: 'Select Employee' },
                ...employees.map(emp => ({ value: emp.full_name, label: emp.full_name })),
              ]}
            />
            <Select
              label="Leave Type"
              value={form.leave_type}
              onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))}
              options={[
                { value: 'Annual', label: 'Annual Leave' },
                { value: 'Sick', label: 'Sick Leave' },
                { value: 'Personal', label: 'Personal Leave' },
                { value: 'Maternity', label: 'Maternity Leave' },
              ]}
            />
            <Input label="Start Date" type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} required />
            <Input label="End Date" type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} required />
            <div className="md:col-span-2">
              <Textarea label="Reason" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit">Submit Leave Request</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Leave Requests</h3></CardHeader>
        <Table
          columns={[
            { header: 'Employee', key: 'employee_name' },
            { header: 'Type', render: r => <Badge variant="info">{r.leave_type}</Badge> },
            { header: 'From', render: r => formatDate(r.start_date) },
            { header: 'To', render: r => formatDate(r.end_date) },
            { header: 'Reason', key: 'reason' },
            { header: 'Status', render: r => (
              <Badge variant={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}>{r.status}</Badge>
            )},
            { header: 'Actions', render: r => r.status === 'pending' ? (
              <div className="flex gap-1">
                <Button size="sm" variant="success" onClick={() => handleApprove(r.id)}>Approve</Button>
                <Button size="sm" variant="danger" onClick={() => handleReject(r.id)}>Reject</Button>
              </div>
            ) : null },
          ]}
          data={leaves}
          emptyMessage="No leave requests"
        />
      </Card>
    </div>
  );
}

function WarningsTab() {
  const [employees, setEmployees] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ employee_name: '', warning_type: 'Verbal', reason: '', date: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = () => {
    Promise.all([
      api.employees.list().then(d => Array.isArray(d) ? d : d.employees || []).catch(() => []),
      api.hr.records('warning').then(d => Array.isArray(d) ? d : d.records || []).catch(() => []),
    ]).then(([emps, recs]) => {
      setEmployees(emps);
      setWarnings(recs);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.employee_name || !form.reason) {
      setError('Employee and reason are required');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await api.hr.createRecord({ type: 'warning', subtype: form.warning_type, employee_name: form.employee_name, reason: form.reason, date: form.date || new Date().toISOString().slice(0, 10) });
      setSuccess('Warning issued successfully');
      setForm({ employee_name: '', warning_type: 'Verbal', reason: '', date: '' });
      setTimeout(() => setSuccess(''), 3000);
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to issue warning');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Issue Warning</h3></CardHeader>
        <CardBody>
          {success && <Alert type="success" className="mb-4">{success}</Alert>}
          {error && <Alert type="error" className="mb-4">{error}</Alert>}
          <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
            <Select
              label="Employee"
              value={form.employee_name}
              onChange={e => setForm(f => ({ ...f, employee_name: e.target.value }))}
              options={[
                { value: '', label: 'Select Employee' },
                ...employees.map(emp => ({ value: emp.full_name, label: emp.full_name })),
              ]}
            />
            <Select
              label="Warning Type"
              value={form.warning_type}
              onChange={e => setForm(f => ({ ...f, warning_type: e.target.value }))}
              options={[
                { value: 'Verbal', label: 'Verbal Warning' },
                { value: 'Written', label: 'Written Warning' },
                { value: 'Final', label: 'Final Warning' },
              ]}
            />
            <div className="md:col-span-2">
              <Textarea label="Reason" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} required />
            </div>
            <Input label="Date" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            <div className="flex items-end">
              <Button type="submit">Issue Warning</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Warnings History</h3></CardHeader>
        <Table
          columns={[
            { header: 'Employee', key: 'employee_name' },
            { header: 'Type', render: r => {
              const wt = r.subtype || r.warning_type || 'Verbal';
              return <Badge variant={wt === 'Final' ? 'danger' : wt === 'Written' ? 'warning' : 'info'}>{wt}</Badge>;
            }},
            { header: 'Reason', key: 'reason' },
            { header: 'Date', render: r => formatDate(r.date) },
          ]}
          data={warnings}
          emptyMessage="No warnings issued"
        />
      </Card>
    </div>
  );
}

function TerminationsTab() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ employee_name: '', reason: '', effective_date: '', severance: '' });
  const [showConfirm, setShowConfirm] = useState(false);
  const [terminations, setTerminations] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = () => {
    Promise.all([
      api.employees.list().then(d => Array.isArray(d) ? d : d.employees || []).catch(() => []),
      api.hr.records('termination').then(d => Array.isArray(d) ? d : d.records || []).catch(() => []),
    ]).then(([emps, recs]) => {
      setEmployees(emps);
      setTerminations(recs);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.employee_name || !form.reason || !form.effective_date) {
      setError('Employee, reason, and effective date are required');
      return;
    }
    setError('');
    setShowConfirm(true);
  };

  const confirmTermination = async () => {
    setSubmitting(true);
    try {
      await api.hr.createRecord({ type: 'termination', employee_name: form.employee_name, reason: form.reason, effective_date: form.effective_date, severance: form.severance ? Number(form.severance) : 0 });
      setShowConfirm(false);
      setForm({ employee_name: '', reason: '', effective_date: '', severance: '' });
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to process termination');
      setShowConfirm(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Process Termination</h3></CardHeader>
        <CardBody>
          {error && <Alert type="error" className="mb-4">{error}</Alert>}
          <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
            <Select
              label="Employee"
              value={form.employee_name}
              onChange={e => setForm(f => ({ ...f, employee_name: e.target.value }))}
              options={[
                { value: '', label: 'Select Employee' },
                ...employees.map(emp => ({ value: emp.full_name, label: emp.full_name })),
              ]}
            />
            <Input label="Effective Date" type="date" value={form.effective_date} onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))} required />
            <div className="md:col-span-2">
              <Textarea label="Reason for Termination" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} required />
            </div>
            <Input label="Severance Amount (N$)" type="number" min="0" step="0.01" value={form.severance} onChange={e => setForm(f => ({ ...f, severance: e.target.value }))} />
            <div className="flex items-end">
              <Button type="submit" variant="danger">Process Termination</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Termination Records</h3></CardHeader>
        <Table
          columns={[
            { header: 'Employee', key: 'employee_name' },
            { header: 'Reason', key: 'reason' },
            { header: 'Effective Date', render: r => formatDate(r.effective_date) },
            { header: 'Severance', render: r => r.severance ? `N$ ${Number(r.severance).toFixed(2)}` : '-' },
            { header: 'Processed', render: r => formatDateTime(r.created_at) },
          ]}
          data={terminations}
          emptyMessage="No terminations processed"
        />
      </Card>

      <Modal open={showConfirm} onClose={() => setShowConfirm(false)} title="Confirm Termination" size="sm">
        <div className="p-6">
          <Alert type="warning" className="mb-4">
            Are you sure you want to terminate <strong>{form.employee_name}</strong>? This action cannot be undone.
          </Alert>
          <p className="text-sm text-gray-600 mb-2"><strong>Effective Date:</strong> {formatDate(form.effective_date)}</p>
          <p className="text-sm text-gray-600 mb-4"><strong>Reason:</strong> {form.reason}</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowConfirm(false)}>Cancel</Button>
            <Button variant="danger" onClick={confirmTermination}>Confirm Termination</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function AttendanceTab() {
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ employee_name: '', date: new Date().toISOString().slice(0, 10), clock_in: '', clock_out: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const getNow = () => {
    const now = new Date();
    return now.toTimeString().slice(0, 5);
  };

  const loadData = () => {
    Promise.all([
      api.employees.list().then(d => Array.isArray(d) ? d : d.employees || []).catch(() => []),
      api.hr.records('attendance').then(d => Array.isArray(d) ? d : d.records || []).catch(() => []),
    ]).then(([emps, recs]) => {
      setEmployees(emps);
      setRecords(recs);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.employee_name || !form.date) {
      setError('Employee and date are required');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await api.hr.createRecord({ type: 'attendance', employee_name: form.employee_name, date: form.date, clock_in: form.clock_in, clock_out: form.clock_out });
      setForm({ employee_name: '', date: new Date().toISOString().slice(0, 10), clock_in: '', clock_out: '' });
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to log attendance');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Log Attendance</h3></CardHeader>
        <CardBody>
          {error && <Alert type="error" className="mb-4">{error}</Alert>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Select
                label="Employee"
                value={form.employee_name}
                onChange={e => setForm(f => ({ ...f, employee_name: e.target.value }))}
                options={[
                  { value: '', label: 'Select Employee' },
                  ...employees.map(emp => ({ value: emp.full_name, label: emp.full_name })),
                ]}
              />
              <Input label="Date" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Input label="Clock In" type="time" value={form.clock_in} onChange={e => setForm(f => ({ ...f, clock_in: e.target.value }))} />
                <Button type="button" size="sm" variant="secondary" className="mt-1" onClick={() => setForm(f => ({ ...f, clock_in: getNow() }))}>
                  <Clock size={13} /> Clock In Now
                </Button>
              </div>
              <div>
                <Input label="Clock Out" type="time" value={form.clock_out} onChange={e => setForm(f => ({ ...f, clock_out: e.target.value }))} />
                <Button type="button" size="sm" variant="secondary" className="mt-1" onClick={() => setForm(f => ({ ...f, clock_out: getNow() }))}>
                  <Clock size={13} /> Clock Out Now
                </Button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Log Attendance'}</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Attendance Records</h3></CardHeader>
        <Table
          columns={[
            { header: 'Employee', key: 'employee_name' },
            { header: 'Date', render: r => formatDate(r.date) },
            { header: 'Clock In', key: 'clock_in' },
            { header: 'Clock Out', key: 'clock_out' },
            { header: 'Status', render: r => {
              const s = r.subtype || r.status || 'Present';
              return <Badge variant={s === 'Late' ? 'warning' : s === 'Present' ? 'success' : s === 'Absent' ? 'danger' : 'info'}>{s}</Badge>;
            }},
          ]}
          data={records}
          emptyMessage="No attendance records"
        />
      </Card>
    </div>
  );
}

function PerformanceTab() {
  const [employees, setEmployees] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ employee_name: '', rating: '3', strengths: '', improvements: '', goals: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = () => {
    Promise.all([
      api.employees.list().then(d => Array.isArray(d) ? d : d.employees || []).catch(() => []),
      api.hr.records('performance').then(d => Array.isArray(d) ? d : d.records || []).catch(() => []),
    ]).then(([emps, recs]) => {
      setEmployees(emps);
      setReviews(recs);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.employee_name) {
      setError('Employee is required');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await api.hr.createRecord({ type: 'performance', employee_name: form.employee_name, rating: Number(form.rating), strengths: form.strengths, improvements: form.improvements, goals: form.goals });
      setSuccess('Performance review saved');
      setForm({ employee_name: '', rating: '3', strengths: '', improvements: '', goals: '' });
      setTimeout(() => setSuccess(''), 3000);
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to save review');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  const ratingStars = (rating) => {
    return Array.from({ length: 5 }, (_, i) => (
      <span key={i} className={i < rating ? 'text-yellow-400' : 'text-gray-300'}>★</span>
    ));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Performance Review</h3></CardHeader>
        <CardBody>
          {success && <Alert type="success" className="mb-4">{success}</Alert>}
          {error && <Alert type="error" className="mb-4">{error}</Alert>}
          <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
            <Select
              label="Employee"
              value={form.employee_name}
              onChange={e => setForm(f => ({ ...f, employee_name: e.target.value }))}
              options={[
                { value: '', label: 'Select Employee' },
                ...employees.map(emp => ({ value: emp.full_name, label: emp.full_name })),
              ]}
            />
            <Select
              label="Rating (1-5)"
              value={form.rating}
              onChange={e => setForm(f => ({ ...f, rating: e.target.value }))}
              options={[
                { value: '1', label: '1 - Needs Improvement' },
                { value: '2', label: '2 - Below Average' },
                { value: '3', label: '3 - Average' },
                { value: '4', label: '4 - Above Average' },
                { value: '5', label: '5 - Excellent' },
              ]}
            />
            <Textarea label="Strengths" value={form.strengths} onChange={e => setForm(f => ({ ...f, strengths: e.target.value }))} />
            <Textarea label="Areas for Improvement" value={form.improvements} onChange={e => setForm(f => ({ ...f, improvements: e.target.value }))} />
            <div className="md:col-span-2">
              <Textarea label="Goals" value={form.goals} onChange={e => setForm(f => ({ ...f, goals: e.target.value }))} />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit">Save Review</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Review History</h3></CardHeader>
        <Table
          columns={[
            { header: 'Employee', key: 'employee_name' },
            { header: 'Rating', render: r => <span className="text-lg">{ratingStars(r.rating)}</span> },
            { header: 'Strengths', key: 'strengths' },
            { header: 'Improvements', key: 'improvements' },
            { header: 'Date', render: r => formatDateTime(r.created_at) },
          ]}
          data={reviews}
          emptyMessage="No reviews recorded"
        />
      </Card>
    </div>
  );
}

function CommunicationTab() {
  const [announcements, setAnnouncements] = useState([]);
  const [form, setForm] = useState({ title: '', message: '', target: 'All Staff' });
  const [success, setSuccess] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.title || !form.message) return;
    const announcement = {
      ...form,
      id: Date.now(),
      created_at: new Date().toISOString(),
    };
    setAnnouncements(prev => [announcement, ...prev]);
    setSuccess('Announcement posted');
    setForm({ title: '', message: '', target: 'All Staff' });
    setTimeout(() => setSuccess(''), 3000);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Post Announcement</h3></CardHeader>
        <CardBody>
          {success && <Alert type="success" className="mb-4">{success}</Alert>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
              <Select
                label="Target Audience"
                value={form.target}
                onChange={e => setForm(f => ({ ...f, target: e.target.value }))}
                options={[
                  { value: 'All Staff', label: 'All Staff' },
                  { value: 'Management', label: 'Management' },
                  { value: 'Branch Staff', label: 'Branch Staff' },
                  { value: 'HR Department', label: 'HR Department' },
                ]}
              />
            </div>
            <Textarea label="Message" value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} required />
            <div className="flex justify-end">
              <Button type="submit">Post Announcement</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {announcements.length > 0 && (
        <div className="space-y-3">
          {announcements.map(a => (
            <Card key={a.id}>
              <CardBody>
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-gray-800">{a.title}</h4>
                    <p className="text-sm text-gray-600 mt-1">{a.message}</p>
                    <p className="text-xs text-gray-400 mt-2">{formatDateTime(a.created_at)}</p>
                  </div>
                  <Badge variant="info">{a.target}</Badge>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function DataTab() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.employees.list()
      .then(d => setEmployees(Array.isArray(d) ? d : d.employees || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const exportCSV = () => {
    if (employees.length === 0) return;
    const headers = ['Name', 'Position', 'Department', 'Branch', 'Phone', 'Email', 'Status', 'Hire Date'];
    const rows = employees.map(e => [
      e.full_name || '', e.position || '', e.department || '', e.branch || '',
      e.phone || '', e.email || '', e.status || 'active', e.hire_date || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `employees_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <LoadingSpinner />;

  const deptCounts = {};
  const branchCounts = {};
  employees.forEach(e => {
    deptCounts[e.department || 'Unassigned'] = (deptCounts[e.department || 'Unassigned'] || 0) + 1;
    branchCounts[e.branch || 'Unassigned'] = (branchCounts[e.branch || 'Unassigned'] || 0) + 1;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-800">Employee Data Summary</h3>
        <Button size="sm" onClick={exportCSV}><Database size={14} /> Export CSV</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-primary">{employees.length}</p>
            <p className="text-xs text-gray-500">Total Employees</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-green-600">{employees.filter(e => e.status === 'active' || !e.status).length}</p>
            <p className="text-xs text-gray-500">Active</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-blue-600">{Object.keys(deptCounts).length}</p>
            <p className="text-xs text-gray-500">Departments</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-orange-600">{Object.keys(branchCounts).length}</p>
            <p className="text-xs text-gray-500">Branches</p>
          </CardBody>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">By Department</h3></CardHeader>
          <CardBody>
            <div className="space-y-2">
              {Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).map(([dept, count]) => (
                <div key={dept} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{dept}</span>
                  <Badge variant="primary">{count}</Badge>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">By Branch</h3></CardHeader>
          <CardBody>
            <div className="space-y-2">
              {Object.entries(branchCounts).sort((a, b) => b[1] - a[1]).map(([branch, count]) => (
                <div key={branch} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{branch}</span>
                  <Badge variant="primary">{count}</Badge>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}


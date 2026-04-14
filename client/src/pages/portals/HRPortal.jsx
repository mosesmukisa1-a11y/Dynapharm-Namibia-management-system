import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatDate, formatDateTime, BRANCH_DETAILS } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, Table, Modal, Alert, Select, Textarea } from '../../components/ui';
import { Users, Calendar, AlertTriangle, UserX, Clock, Star, MessageSquare, Database, ClipboardList, Plus, CheckCircle2, XCircle, UserCheck, Building2, AlertCircle, Info, Briefcase } from 'lucide-react';
import SalaryLedgerTab from '../../components/SalaryLedgerTab';
import StaffServicesTab from '../../components/StaffServicesTab';
import StaffMessagesTab from '../../components/StaffMessagesTab';

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
    { id: 'messages', label: 'My Messages', icon: '📨' },
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
        {activeTab === 'messages' && <StaffMessagesTab accentColor="#dc2626" />}
      </div>
    </div>
  );
}

const DEPT_OPTIONS = [
  { value: '', label: 'Select Department' },
  { value: 'Operations', label: 'Operations' },
  { value: 'Sales', label: 'Sales' },
  { value: 'Finance', label: 'Finance' },
  { value: 'HR', label: 'Human Resources' },
  { value: 'IT', label: 'IT' },
  { value: 'Warehouse', label: 'Warehouse' },
  { value: 'Health', label: 'Health Services' },
  { value: 'Security', label: 'Security' },
  { value: 'Cleaning', label: 'Cleaning' },
];

function EmployeesTab() {
  const [employees, setEmployees] = useState([]);
  const [changeRequests, setChangeRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [form, setForm] = useState({ full_name: '', position: '', department: '', branch: '', hire_date: '', phone: '', email: '', reason: '' });
  const [removeReason, setRemoveReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.employees.list().then(d => Array.isArray(d) ? d : d.employees || []).catch(() => []),
      api.hr.staffChangeRequests.list().then(d => d.requests || []).catch(() => []),
    ]).then(([emps, reqs]) => {
      setEmployees(emps);
      setChangeRequests(reqs);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleAddRequest = async (e) => {
    e.preventDefault();
    if (!form.full_name || !form.position) { setError('Name and position are required'); return; }
    setSubmitting(true); setError('');
    try {
      await api.hr.staffChangeRequests.create({ request_type: 'add', ...form });
      setSuccess('Add request submitted — awaiting GM approval.');
      setShowAddModal(false);
      setForm({ full_name: '', position: '', department: '', branch: '', hire_date: '', phone: '', email: '', reason: '' });
      setTimeout(() => setSuccess(''), 5000);
      loadData();
    } catch (err) { setError(err.message || 'Failed to submit request'); }
    finally { setSubmitting(false); }
  };

  const handleRemoveRequest = async () => {
    if (!removeTarget) return;
    setSubmitting(true); setError('');
    try {
      await api.hr.staffChangeRequests.create({
        request_type: 'remove',
        full_name: removeTarget.full_name,
        employee_row_id: removeTarget.id,
        position: removeTarget.position,
        department: removeTarget.department,
        branch: removeTarget.branch,
        reason: removeReason,
      });
      setSuccess(`Removal request for ${removeTarget.full_name} submitted — awaiting GM approval.`);
      setRemoveTarget(null);
      setRemoveReason('');
      setTimeout(() => setSuccess(''), 5000);
      loadData();
    } catch (err) { setError(err.message || 'Failed to submit removal request'); }
    finally { setSubmitting(false); }
  };

  const pending = changeRequests.filter(r => r.status === 'pending');
  const history = changeRequests.filter(r => r.status !== 'pending');

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {success && <Alert type="success">{success}</Alert>}
      {error && <Alert type="error">{error}</Alert>}

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-start gap-3">
        <AlertCircle size={18} className="text-amber-600 mt-0.5 shrink-0" />
        <div className="text-sm text-amber-800">
          <strong>HR Note:</strong> Adding or removing employees requires GM approval. Submit your request below and the GM will be notified. The change takes effect only after approval.
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-800">Employee Directory ({employees.filter(e => e.employment_status !== 'inactive').length} active)</h3>
        <Button size="sm" onClick={() => { setShowAddModal(true); setError(''); }}>
          <Plus size={14} className="mr-1" /> Request to Add Employee
        </Button>
      </div>

      <Card>
        <Table
          columns={[
            { header: 'Name', key: 'full_name' },
            { header: 'Position', key: 'position' },
            { header: 'Department', key: 'department' },
            { header: 'Branch', key: 'branch' },
            { header: 'Phone', key: 'phone' },
            { header: 'Status', render: r => (
              <Badge variant={r.employment_status === 'inactive' ? 'danger' : 'success'}>
                {r.employment_status === 'inactive' ? 'Inactive' : 'Active'}
              </Badge>
            )},
            { header: 'Joined', render: r => formatDate(r.hire_date || r.created_at) },
            { header: 'Actions', render: r => r.employment_status !== 'inactive' ? (
              <Button size="sm" variant="danger" onClick={() => { setRemoveTarget(r); setRemoveReason(''); setError(''); }}>
                Request Removal
              </Button>
            ) : null },
          ]}
          data={employees}
          emptyMessage="No employees found"
        />
      </Card>

      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-gray-800">Pending GM Approval</h3>
              <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">{pending.length}</span>
            </div>
          </CardHeader>
          <Table
            columns={[
              { header: 'Type', render: r => (
                <Badge variant={r.request_type === 'add' ? 'success' : 'danger'}>
                  {r.request_type === 'add' ? '+ Add' : '− Remove'}
                </Badge>
              )},
              { header: 'Employee', render: r => (
                <div>
                  <p className="font-semibold text-sm text-gray-800">{r.full_name}</p>
                  <p className="text-xs text-gray-400">{r.position}{r.branch ? ` · ${r.branch}` : ''}</p>
                </div>
              )},
              { header: 'Reason', render: r => <span className="text-xs text-gray-600">{r.reason || '—'}</span> },
              { header: 'Requested', render: r => formatDate(r.requested_at) },
              { header: 'Status', render: () => <Badge variant="warning">Awaiting GM</Badge> },
            ]}
            data={pending}
            emptyMessage=""
          />
        </Card>
      )}

      {history.length > 0 && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Request History</h3></CardHeader>
          <Table
            columns={[
              { header: 'Type', render: r => <Badge variant={r.request_type === 'add' ? 'success' : 'danger'}>{r.request_type === 'add' ? '+ Add' : '− Remove'}</Badge> },
              { header: 'Employee', key: 'full_name' },
              { header: 'Status', render: r => <Badge variant={r.status === 'approved' ? 'success' : 'danger'}>{r.status}</Badge> },
              { header: 'GM Note', render: r => <span className="text-xs text-gray-500">{r.gm_note || '—'}</span> },
              { header: 'Reviewed By', render: r => <span className="text-xs">{r.reviewed_by || '—'}</span> },
              { header: 'Date', render: r => formatDate(r.reviewed_at || r.requested_at) },
            ]}
            data={history}
            emptyMessage="No request history"
          />
        </Card>
      )}

      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="Request to Add Employee">
        <form onSubmit={handleAddRequest} className="p-6 space-y-4">
          {error && <Alert type="error">{error}</Alert>}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-800">
            This request will be sent to the GM for approval. The employee will only be added to the system after the GM approves.
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Full Name *" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
            <Input label="Position *" value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Department" value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} options={DEPT_OPTIONS} />
            <Select label="Branch" value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}
              options={[{ value: '', label: 'Select Branch' }, ...BRANCH_DETAILS.map(b => ({ value: b.id, label: b.name }))]} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Hire Date" type="date" value={form.hire_date} onChange={e => setForm(f => ({ ...f, hire_date: e.target.value }))} />
            <Input label="Phone" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <Textarea label="Reason for Adding *" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Why is this employee being added? (e.g. replacement hire, new branch opening)" />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit for GM Approval'}</Button>
          </div>
        </form>
      </Modal>

      {removeTarget && (
        <Modal title={`Request Removal: ${removeTarget.full_name}`} onClose={() => setRemoveTarget(null)}>
          <div className="p-6 space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <p className="text-sm font-semibold text-red-800">You are requesting to deactivate this employee.</p>
              <p className="text-sm text-red-700 mt-1">
                <strong>{removeTarget.full_name}</strong> · {removeTarget.position} · {removeTarget.branch || '—'}
              </p>
              <p className="text-xs text-red-500 mt-2">This request requires GM approval before any change is made.</p>
            </div>
            <Textarea
              label="Reason for Removal *"
              value={removeReason}
              onChange={e => setRemoveReason(e.target.value)}
              placeholder="State the reason (e.g. resignation, contract ended, termination)…"
              rows={3}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRemoveTarget(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleRemoveRequest} disabled={submitting || !removeReason.trim()}>
                {submitting ? 'Submitting…' : 'Submit Removal Request'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

const QUICK_REJECT_REASONS = [
  'Operational requirements – cannot release staff at this time',
  'Insufficient notice period provided',
  'Leave entitlement exhausted for this cycle',
  'Overlapping with another approved leave in the same department',
  'Peak period – coverage cannot be arranged',
  'Application incomplete or missing supporting documents',
  'Leave dates conflict with scheduled training or audit',
];

const LEAVE_TYPE_COLORS = {
  Annual: 'info',
  Sick: 'warning',
  Personal: 'secondary',
  Maternity: 'success',
  Paternity: 'success',
  Unpaid: 'danger',
};

function LeaveCard({ leave, onApprove, onRejectClick }) {
  const empNum = leave.employee_id || leave.emp_number || '—';
  const position = leave.emp_position || '—';
  const branch = leave.emp_branch || '—';
  const dept = leave.emp_department || null;
  const days = leave.working_days ?? 0;
  const coverage = leave.coverage_staff || [];

  let entitlementInfo = null;
  if (leave.leave_entitlements && typeof leave.leave_entitlements === 'object') {
    const key = Object.keys(leave.leave_entitlements).find(
      k => k.toLowerCase().includes(leave.leave_type?.toLowerCase() || '')
    );
    if (key) entitlementInfo = leave.leave_entitlements[key];
  }

  return (
    <div className="border border-amber-200 rounded-xl bg-amber-50 overflow-hidden">
      <div className="flex items-start justify-between gap-4 px-5 py-4 bg-white border-b border-amber-100">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold text-gray-900">{leave.employee_name}</span>
            {leave.urgent && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                <AlertCircle size={11} /> URGENT
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <Info size={13} className="text-gray-400" />
              <span className="font-mono font-semibold text-gray-700">{empNum}</span>
            </span>
            <span className="flex items-center gap-1"><Briefcase size={13} />{position}</span>
            <span className="flex items-center gap-1"><Building2 size={13} />{branch}</span>
            {dept && <span className="text-gray-400">{dept}</span>}
          </div>
        </div>
        <Badge variant={LEAVE_TYPE_COLORS[leave.leave_type] || 'info'} className="shrink-0 text-sm px-3 py-1">
          {leave.leave_type}
        </Badge>
      </div>

      <div className="px-5 py-4 grid md:grid-cols-2 gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400 mb-2 font-semibold">Leave Period</p>
          <div className="flex items-center gap-3 text-sm">
            <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-center min-w-[90px]">
              <p className="text-xs text-gray-400">From</p>
              <p className="font-semibold text-gray-800">{formatDate(leave.start_date)}</p>
            </div>
            <span className="text-gray-400">→</span>
            <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-center min-w-[90px]">
              <p className="text-xs text-gray-400">To</p>
              <p className="font-semibold text-gray-800">{formatDate(leave.end_date)}</p>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Calendar size={14} className="text-amber-600" />
            <span className="text-sm font-semibold text-amber-700">{days} working day{days !== 1 ? 's' : ''}</span>
            {entitlementInfo != null && (
              <span className="text-xs text-gray-500">(entitlement: {entitlementInfo})</span>
            )}
          </div>
          {leave.reason && (
            <div className="mt-3">
              <p className="text-xs uppercase tracking-wide text-gray-400 mb-1 font-semibold">Reason</p>
              <p className="text-sm text-gray-700 bg-white border border-gray-100 rounded-lg px-3 py-2">{leave.reason}</p>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-gray-400 mb-2 font-semibold flex items-center gap-1">
            <UserCheck size={13} /> Available Coverage at {branch}
          </p>
          {position === '—' ? (
            <p className="text-xs text-gray-400 italic">Employee position not set — cannot determine coverage.</p>
          ) : coverage.length === 0 ? (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <XCircle size={15} className="text-red-500 shrink-0" />
              <p className="text-xs text-red-600 font-medium">No available staff with the same position at {branch} during this period.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {coverage.map((s, i) => (
                <div key={i} className="flex items-center gap-2 bg-white border border-green-100 rounded-lg px-3 py-2">
                  <CheckCircle2 size={14} className="text-green-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{s.full_name}</p>
                    <p className="text-xs text-gray-400">{s.employee_id || 'No EMP#'} · {s.position}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-3 border-t border-amber-100 bg-white flex justify-end gap-2">
        <Button size="sm" variant="success" onClick={() => onApprove(leave.id)}>
          <CheckCircle2 size={14} className="mr-1" /> Approve
        </Button>
        <Button size="sm" variant="danger" onClick={() => onRejectClick(leave)}>
          <XCircle size={14} className="mr-1" /> Reject
        </Button>
      </div>
    </div>
  );
}

function LeaveTab() {
  const [employees, setEmployees] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ employee_id: '', employee_name: '', leave_type: 'Annual', start_date: '', end_date: '', reason: '', urgent: false });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

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
      const selectedEmp = employees.find(em => em.full_name === form.employee_name);
      await api.hr.createLeave({ ...form, employee_id: selectedEmp?.employee_id || selectedEmp?.id || '' });
      setSuccess('Leave request submitted');
      setForm({ employee_id: '', employee_name: '', leave_type: 'Annual', start_date: '', end_date: '', reason: '', urgent: false });
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
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to approve leave');
    }
  };

  const openReject = (leave) => {
    setRejectTarget(leave);
    setRejectReason('');
  };

  const handleRejectConfirm = async () => {
    if (!rejectTarget) return;
    setRejectSubmitting(true);
    try {
      await api.hr.updateLeave(rejectTarget.id, { status: 'rejected', rejection_reason: rejectReason || 'Rejected by HR' });
      setRejectTarget(null);
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to reject leave');
    } finally {
      setRejectSubmitting(false);
    }
  };

  const pending = leaves.filter(l => l.status === 'pending');
  const history = leaves.filter(l => l.status !== 'pending');

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">New Leave Request</h3></CardHeader>
        <CardBody>
          {success && <Alert type="success" className="mb-4">{success}</Alert>}
          {error && <Alert type="error" className="mb-4">{error}</Alert>}
          <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
            <Select
              label="Employee"
              value={form.employee_name}
              onChange={e => {
                const emp = employees.find(em => em.full_name === e.target.value);
                setForm(f => ({ ...f, employee_name: e.target.value, employee_id: emp?.employee_id || emp?.id || '' }));
              }}
              options={[
                { value: '', label: 'Select Employee' },
                ...employees.map(emp => ({ value: emp.full_name, label: `${emp.full_name}${emp.employee_id ? ' · ' + emp.employee_id : ''}` })),
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
                { value: 'Paternity', label: 'Paternity Leave' },
                { value: 'Unpaid', label: 'Unpaid Leave' },
              ]}
            />
            <Input label="Start Date" type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} required />
            <Input label="End Date" type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} required />
            <div className="md:col-span-2">
              <Textarea label="Reason" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
            <div className="md:col-span-2 flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input type="checkbox" checked={form.urgent} onChange={e => setForm(f => ({ ...f, urgent: e.target.checked }))}
                  className="w-4 h-4 accent-red-500" />
                Mark as urgent
              </label>
              <Button type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit Leave Request'}</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <div>
        <h3 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
          <Clock size={17} className="text-amber-500" />
          Pending Approval
          {pending.length > 0 && <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">{pending.length}</span>}
        </h3>
        {pending.length === 0 ? (
          <EmptyState icon={<CheckCircle2 size={40} className="text-green-400" />} title="All caught up" description="No leave requests awaiting approval." />
        ) : (
          <div className="space-y-4">
            {pending.map(leaf => (
              <LeaveCard key={leaf.id} leave={leaf} onApprove={handleApprove} onRejectClick={openReject} />
            ))}
          </div>
        )}
      </div>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Leave History</h3></CardHeader>
        <Table
          columns={[
            { header: 'Employee', render: r => (
              <div>
                <p className="font-semibold text-gray-800 text-sm">{r.employee_name}</p>
                <p className="text-xs text-gray-400 font-mono">{r.employee_id || r.emp_number || '—'}</p>
              </div>
            )},
            { header: 'Type', render: r => <Badge variant={LEAVE_TYPE_COLORS[r.leave_type] || 'info'}>{r.leave_type}</Badge> },
            { header: 'Period', render: r => (
              <span className="text-sm text-gray-700">{formatDate(r.start_date)} → {formatDate(r.end_date)}</span>
            )},
            { header: 'Days', render: r => <span className="font-semibold">{r.working_days ?? '—'}</span> },
            { header: 'Status', render: r => (
              <Badge variant={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}>{r.status}</Badge>
            )},
            { header: 'Rejection Reason', render: r => r.rejection_reason ? (
              <span className="text-xs text-red-600 max-w-[200px] block">{r.rejection_reason}</span>
            ) : null },
          ]}
          data={history}
          emptyMessage="No leave history"
        />
      </Card>

      {rejectTarget && (
        <Modal title="Reject Leave Request" onClose={() => setRejectTarget(null)}>
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
              <p className="text-sm font-semibold text-gray-800">{rejectTarget.employee_name}</p>
              <p className="text-xs text-gray-500">{rejectTarget.leave_type} · {formatDate(rejectTarget.start_date)} → {formatDate(rejectTarget.end_date)} · {rejectTarget.working_days ?? '?'} working day(s)</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Quick Reasons</p>
              <div className="space-y-1.5">
                {QUICK_REJECT_REASONS.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => setRejectReason(r)}
                    className={`w-full text-left text-sm px-3 py-2 rounded-lg border transition-colors ${
                      rejectReason === r
                        ? 'bg-red-50 border-red-400 text-red-700 font-medium'
                        : 'bg-white border-gray-200 text-gray-700 hover:border-red-200 hover:bg-red-50'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1">Custom Reason (optional)</p>
              <Textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Type a custom reason or edit the selected one above…"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setRejectTarget(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleRejectConfirm} disabled={rejectSubmitting}>
                {rejectSubmitting ? 'Rejecting…' : 'Confirm Rejection'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
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

const NAMIBIAN_PUBLIC_HOLIDAYS = new Set([
  '2025-01-01','2025-03-21','2025-04-18','2025-04-19','2025-04-21','2025-05-01','2025-05-04',
  '2025-05-25','2025-08-26','2025-09-10','2025-10-07','2025-12-10','2025-12-25','2025-12-26',
  '2026-01-01','2026-03-21','2026-04-03','2026-04-04','2026-04-06','2026-05-01','2026-05-24',
  '2026-05-25','2026-08-26','2026-09-10','2026-10-07','2026-12-10','2026-12-25','2026-12-26',
]);

function calcAttendanceStatus(dateStr, clockInTime) {
  if (!clockInTime || !dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  if (dow === 0) return 'Present';
  const isHoliday = NAMIBIAN_PUBLIC_HOLIDAYS.has(dateStr);
  const isSat = dow === 6;
  const [h, m] = clockInTime.split(':').map(Number);
  const mins = h * 60 + m;
  const threshold = (isHoliday || isSat) ? (8 * 60 + 10) : (8 * 60 + 30);
  return mins > threshold ? 'Late' : 'Present';
}

function shiftLabel(dateStr) {
  if (!dateStr) return 'Weekdays by 08:30 | Saturdays by 08:10';
  const d = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay();
  if (dow === 0) return 'Sunday — no attendance required';
  const isHoliday = NAMIBIAN_PUBLIC_HOLIDAYS.has(dateStr);
  const isSat = dow === 6;
  if (isHoliday) return 'Public Holiday — shift starts by 08:10';
  if (isSat) return 'Saturday — shift starts by 08:10';
  return 'Weekday — shift starts by 08:30';
}

function AttendanceTab() {
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ employee_name: '', date: new Date().toISOString().slice(0, 10), clock_in: '', clock_out: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().slice(0, 10));

  const getNow = () => new Date().toTimeString().slice(0, 5);

  const loadData = () => {
    Promise.all([
      api.employees.list().then(d => Array.isArray(d) ? d : d.employees || []).catch(() => []),
      api.hr.records('attendance').then(d => Array.isArray(d) ? d : d.records || []).catch(() => []),
    ]).then(([emps, recs]) => {
      setEmployees(emps.filter(e => (e.employment_status || '').toLowerCase() === 'active' || !e.employment_status));
      setRecords(recs);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.employee_name || !form.date) { setError('Employee and date are required'); return; }
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

  const previewStatus = calcAttendanceStatus(form.date, form.clock_in);

  const todayRecords = records.filter(r => r.date === filterDate || (r.date || '').startsWith(filterDate));
  const lateCount = todayRecords.filter(r => (r.subtype || r.status) === 'Late').length;
  const presentCount = todayRecords.filter(r => (r.subtype || r.status) === 'Present').length;
  const absentCount = Math.max(0, employees.length - todayRecords.length);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#16a34a' }}>{presentCount}</div>
          <div><div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#86efac', textTransform: 'uppercase', letterSpacing: '.06em' }}>Present</div><div style={{ fontSize: '0.83rem', color: '#15803d', fontWeight: 600 }}>On Time</div></div>
        </div>
        <div style={{ background: '#fefce8', border: '1.5px solid #fde047', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#ca8a04' }}>{lateCount}</div>
          <div><div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fde047', textTransform: 'uppercase', letterSpacing: '.06em' }}>Late</div><div style={{ fontSize: '0.83rem', color: '#a16207', fontWeight: 600 }}>After shift start</div></div>
        </div>
        <div style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#dc2626' }}>{absentCount}</div>
          <div><div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '.06em' }}>Not Logged</div><div style={{ fontSize: '0.83rem', color: '#b91c1c', fontWeight: 600 }}>No record yet</div></div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h3 className="font-bold text-gray-800">Log Attendance</h3>
            <div style={{ fontSize: '0.8rem', color: '#6b7280', background: '#f3f4f6', padding: '5px 12px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={13} /> {shiftLabel(form.date)}
            </div>
          </div>
        </CardHeader>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setForm(f => ({ ...f, clock_in: getNow() }))}>
                    <Clock size={13} /> Clock In Now
                  </Button>
                  {previewStatus && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 12px',
                      borderRadius: 20, fontWeight: 700, fontSize: '0.8rem',
                      background: previewStatus === 'Late' ? '#fef3c7' : '#dcfce7',
                      color: previewStatus === 'Late' ? '#b45309' : '#16a34a',
                      border: `1.5px solid ${previewStatus === 'Late' ? '#fde68a' : '#86efac'}`
                    }}>
                      {previewStatus === 'Late' ? '⚠️ LATE' : '✅ ON TIME'} — will be logged as {previewStatus}
                    </span>
                  )}
                </div>
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
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h3 className="font-bold text-gray-800">Attendance Records</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Filter by date:</span>
              <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                style={{ padding: '4px 10px', border: '1.5px solid #d1d5db', borderRadius: 8, fontSize: '0.85rem', color: '#374151' }} />
              <button onClick={() => setFilterDate('')} style={{ fontSize: '0.78rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>Show all</button>
            </div>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Employee', key: 'employee_name' },
            { header: 'Date', render: r => formatDate(r.date) },
            { header: 'Clock In', render: r => r.clock_in || '—' },
            { header: 'Clock Out', render: r => r.clock_out || '—' },
            { header: 'Status', render: r => {
              const s = r.subtype || r.status || 'Present';
              return <Badge variant={s === 'Late' ? 'warning' : s === 'Present' ? 'success' : s === 'Absent' ? 'danger' : 'info'}>{s}</Badge>;
            }},
          ]}
          data={filterDate ? records.filter(r => (r.date || '').startsWith(filterDate)) : records}
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


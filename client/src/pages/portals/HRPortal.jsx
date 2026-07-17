import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatDate, formatDateTime, BRANCH_DETAILS, BRANCHES } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, Table, Modal, Alert, Select, Textarea } from '../../components/ui';
import { Users, Calendar, AlertTriangle, UserX, Clock, Star, MessageSquare, Database, ClipboardList, Plus, CheckCircle2, XCircle, UserCheck, Building2, AlertCircle, Info, Briefcase, FileText, Upload, Award, BarChart3, Shield, LogOut, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import SalaryLedgerTab from '../../components/SalaryLedgerTab';
import StaffServicesTab from '../../components/StaffServicesTab';
import StaffMessagesTab from '../../components/StaffMessagesTab';
import { generateWarningLetter, generateTerminationLetter, generateTransferLetter } from '../../lib/labourLetter';

export default function HRPortal() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📋' },
    { id: 'employees', label: 'Employees', icon: '👥' },
    { id: 'salary', label: 'Salary Ledger', icon: '💼' },
    { id: 'leave', label: 'Leave', icon: '📅' },
    { id: 'attendance', label: 'Attendance', icon: '🕐' },
    { id: 'performance', label: 'Performance', icon: '⭐' },
    { id: 'staff', label: 'Staff', icon: '👤' },
    { id: 'onboarding', label: 'Onboarding', icon: '📋' },
    { id: 'offboarding', label: 'Offboarding', icon: '🚪' },
    { id: 'documents', label: 'Documents', icon: '📁' },
    { id: 'skills', label: 'Skills & Certs', icon: '🎓' },
    { id: 'disciplinary', label: 'Disciplinary', icon: '⚖️' },
    { id: 'calendar', label: 'Team Calendar', icon: '📅' },
    { id: 'celebrations', label: 'Celebrations', icon: '🎂' },
    { id: 'analytics', label: 'HR Analytics', icon: '📊' },
    { id: 'data', label: 'Data Collection', icon: '🗃️' },
    { id: 'services', label: 'My Services', icon: '🛎️' },
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
        {activeTab === 'dashboard' && <HRDashboardTab />}
        {activeTab === 'employees' && <EmployeesTab />}
        {activeTab === 'salary' && <SalaryLedgerTab role="hr" />}
        {activeTab === 'leave' && <LeaveTab />}
        {activeTab === 'attendance' && <AttendanceTab />}
        {activeTab === 'performance' && <PerformanceTab />}
        {activeTab === 'staff' && <StaffActionsTab />}
        {activeTab === 'onboarding' && <OnboardingTab />}
        {activeTab === 'offboarding' && <OffboardingTab />}
        {activeTab === 'documents' && <DocumentVaultTab />}
        {activeTab === 'skills' && <SkillsTab />}
        {activeTab === 'disciplinary' && <DisciplinaryTab />}
        {activeTab === 'calendar' && <TeamCalendarTab />}
        {activeTab === 'celebrations' && <CelebrationsTab />}
        {activeTab === 'analytics' && <HRAnalyticsTab />}
        {activeTab === 'data' && <DataTab />}
        {activeTab === 'services' && <StaffServicesTab />}
        {activeTab === 'messages' && <StaffMessagesTab accentColor="#dc2626" />}
      </div>
    </div>
  );
}

function HRDashboardTab() {
  const [employees, setEmployees] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.employees.list().then(d => Array.isArray(d) ? d : d.employees || []).catch(() => []),
      api.hr.leaves().then(d => Array.isArray(d) ? d : d.leaves || []).catch(() => []),
      api.hr.records('attendance').then(d => Array.isArray(d) ? d : d.records || []).catch(() => []),
      api.hr.records('warning').then(d => Array.isArray(d) ? d : d.records || []).catch(() => []),
    ]).then(([emps, lvs, att, warns]) => {
      setEmployees(emps); setLeaves(lvs); setAttendance(att); setWarnings(warns);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now - 7 * 86400000).toISOString().slice(0, 10);
  const monthPfx = today.slice(0, 7);

  const active = employees.filter(e => e.employment_status !== 'inactive');
  const pendingLeave = leaves.filter(l => l.status === 'pending');
  const onLeaveToday = leaves.filter(l => l.status === 'approved' && l.start_date <= today && l.end_date >= today);
  const att7 = attendance.filter(a => a.date >= weekAgo);
  const lateThisWeek = att7.filter(a => (a.subtype || a.status) === 'Late');
  const warningsMonth = warnings.filter(w => (w.date || w.created_at || '').startsWith(monthPfx));
  const staleLeave = pendingLeave.filter(l => (now - new Date(l.created_at || 0)) > 48 * 3600000);

  const anniversaries = active.filter(e => {
    if (!e.hire_date) return false;
    const h = new Date(e.hire_date);
    const ann = new Date(now.getFullYear(), h.getMonth(), h.getDate());
    if (ann < now) ann.setFullYear(now.getFullYear() + 1);
    const d = Math.ceil((ann - now) / 86400000);
    return d >= 0 && d <= 14;
  }).map(e => {
    const h = new Date(e.hire_date);
    const ann = new Date(now.getFullYear(), h.getMonth(), h.getDate());
    if (ann < now) ann.setFullYear(now.getFullYear() + 1);
    return { ...e, years: ann.getFullYear() - h.getFullYear(), daysUntil: Math.ceil((ann - now) / 86400000) };
  });

  const probation = active.filter(e => {
    if (!e.hire_date) return false;
    const end = new Date(new Date(e.hire_date).getTime() + 90 * 86400000);
    const d = Math.ceil((end - now) / 86400000);
    return d >= 0 && d <= 30;
  }).map(e => {
    const end = new Date(new Date(e.hire_date).getTime() + 90 * 86400000);
    return { ...e, daysLeft: Math.ceil((end - now) / 86400000) };
  });

  const onTime7 = att7.filter(a => (a.subtype || a.status) === 'Present').length;
  const late7 = lateThisWeek.length;
  const total7 = onTime7 + late7;
  const lateMap = lateThisWeek.reduce((acc, r) => { acc[r.employee_name] = (acc[r.employee_name] || 0) + 1; return acc; }, {});

  const STATS = [
    { label: 'Active Staff', value: active.length, icon: '👥', color: '#3b82f6', bg: '#eff6ff' },
    { label: 'On Leave Today', value: onLeaveToday.length, icon: '🌴', color: '#f59e0b', bg: '#fffbeb' },
    { label: 'Late This Week', value: lateThisWeek.length, icon: '⚠️', color: '#ef4444', bg: '#fef2f2' },
    { label: 'Warnings (Month)', value: warningsMonth.length, icon: '📋', color: '#8b5cf6', bg: '#f5f3ff' },
    { label: 'Pending Leave', value: pendingLeave.length, icon: '🕐', color: pendingLeave.length ? '#dc2626' : '#16a34a', bg: pendingLeave.length ? '#fef2f2' : '#f0fdf4' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {STATS.map(s => (
          <div key={s.label} style={{ background: s.bg, border: `1.5px solid ${s.color}30`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.5rem' }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: '0.68rem', color: s.color, fontWeight: 600, marginTop: 2, lineHeight: 1.2 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {staleLeave.length > 0 && (
        <div style={{ background: '#fef3c7', border: '1.5px solid #f59e0b', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.3rem' }}>⏰</span>
          <div>
            <p style={{ fontWeight: 700, color: '#92400e', fontSize: '0.85rem', margin: 0 }}>
              {staleLeave.length} leave request{staleLeave.length > 1 ? 's' : ''} pending for over 48 hours
            </p>
            <p style={{ fontSize: '0.78rem', color: '#b45309', margin: 0 }}>
              {staleLeave.map(l => l.employee_name || l.full_name || '?').join(', ')} — review in the Leave tab
            </p>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><h3 style={{ fontWeight: 700, fontSize: '0.88rem', color: '#374151' }}>📊 Attendance (7 Days)</h3></CardHeader>
          <CardBody>
            {total7 === 0 ? <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>No records this week</p> : (
              <div className="space-y-3">
                {[{ label: 'On Time', count: onTime7, color: '#16a34a' }, { label: 'Late', count: late7, color: '#b45309' }].map(row => (
                  <div key={row.label}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700, color: row.color, marginBottom: 3 }}>
                      <span>{row.label}</span><span>{row.count}</span>
                    </div>
                    <div style={{ background: '#f1f5f9', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                      <div style={{ width: `${(row.count / total7) * 100}%`, background: row.color, height: '100%', borderRadius: 4, transition: 'width 0.4s' }} />
                    </div>
                  </div>
                ))}
                <p style={{ fontSize: '0.73rem', color: '#9ca3af' }}>{total7} logins recorded this week</p>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h3 style={{ fontWeight: 700, fontSize: '0.88rem', color: '#374151' }}>🎂 Upcoming Anniversaries</h3></CardHeader>
          <CardBody>
            {anniversaries.length === 0 ? <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>None in the next 14 days</p> : (
              <div className="space-y-2">
                {anniversaries.map(e => (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1f2937', margin: 0 }}>{e.full_name}</p>
                      <p style={{ fontSize: '0.73rem', color: '#6b7280', margin: 0 }}>{e.years} yr{e.years !== 1 ? 's' : ''} · {e.position || '—'}</p>
                    </div>
                    <span style={{ background: e.daysUntil === 0 ? '#fef3c7' : '#eff6ff', color: e.daysUntil === 0 ? '#b45309' : '#1d4ed8', fontSize: '0.72rem', fontWeight: 700, padding: '2px 7px', borderRadius: 6 }}>
                      {e.daysUntil === 0 ? '🎉 Today' : `${e.daysUntil}d`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h3 style={{ fontWeight: 700, fontSize: '0.88rem', color: '#374151' }}>⏳ Probation Ending (30 days)</h3></CardHeader>
          <CardBody>
            {probation.length === 0 ? <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>None ending soon</p> : (
              <div className="space-y-2">
                {probation.map(e => (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1f2937', margin: 0 }}>{e.full_name}</p>
                      <p style={{ fontSize: '0.73rem', color: '#6b7280', margin: 0 }}>{e.position || '—'} · {e.branch || '—'}</p>
                    </div>
                    <span style={{ background: e.daysLeft <= 7 ? '#fef2f2' : '#fefce8', color: e.daysLeft <= 7 ? '#dc2626' : '#a16207', fontSize: '0.72rem', fontWeight: 700, padding: '2px 7px', borderRadius: 6 }}>
                      {e.daysLeft === 0 ? 'Today' : `${e.daysLeft}d`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {Object.keys(lateMap).length > 0 && (
        <Card>
          <CardHeader><h3 style={{ fontWeight: 700, fontSize: '0.88rem', color: '#374151' }}>⚠️ Late Arrivals This Week</h3></CardHeader>
          <CardBody>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {Object.entries(lateMap).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
                <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '4px 10px' }}>
                  <span style={{ fontWeight: 700, color: '#92400e', fontSize: '0.82rem' }}>{name}</span>
                  <span style={{ background: '#f59e0b', color: '#fff', borderRadius: 4, fontSize: '0.7rem', fontWeight: 800, padding: '1px 5px' }}>{count}×</span>
                </span>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
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
  const [search, setSearch] = useState('');
  const [profileEmp, setProfileEmp] = useState(null);
  const [profileData, setProfileData] = useState({ attendance: [], leaves: [], warnings: [], reviews: [] });
  const [profileLoading, setProfileLoading] = useState(false);

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

  const openProfile = async (emp) => {
    setProfileEmp(emp);
    setProfileLoading(true);
    try {
      const [att, lvs, warns, perf] = await Promise.all([
        api.hr.records('attendance').then(d => (Array.isArray(d) ? d : d.records || []).filter(r => r.employee_name === emp.full_name)).catch(() => []),
        api.hr.leaves().then(d => (Array.isArray(d) ? d : d.leaves || []).filter(l => l.employee_name === emp.full_name)).catch(() => []),
        api.hr.records('warning').then(d => (Array.isArray(d) ? d : d.records || []).filter(r => r.employee_name === emp.full_name)).catch(() => []),
        api.hr.records('performance').then(d => (Array.isArray(d) ? d : d.records || []).filter(r => r.employee_name === emp.full_name)).catch(() => []),
      ]);
      setProfileData({ attendance: att, leaves: lvs, warnings: warns, reviews: perf });
    } finally { setProfileLoading(false); }
  };

  const getTenure = (hire_date) => {
    if (!hire_date) return null;
    const h = new Date(hire_date);
    const n = new Date();
    const totalM = (n.getFullYear() - h.getFullYear()) * 12 + (n.getMonth() - h.getMonth());
    if (totalM < 1) return { text: 'New hire', alert: false };
    if (totalM < 12) return { text: `${totalM}mo`, alert: false };
    const yrs = Math.floor(totalM / 12); const mo = totalM % 12;
    const ann = new Date(n.getFullYear(), h.getMonth(), h.getDate());
    if (ann < n) ann.setFullYear(n.getFullYear() + 1);
    const daysToAnn = Math.ceil((ann - n) / 86400000);
    return { text: `${yrs}yr${mo > 0 ? ' ' + mo + 'mo' : ''}`, alert: daysToAnn <= 14 };
  };

  const filtered = employees.filter(emp => {
    if (emp.employment_status === 'inactive') return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return ['full_name', 'position', 'department', 'branch'].some(k => (emp[k] || '').toLowerCase().includes(q));
  });

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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h3 className="font-semibold text-gray-800">Employee Directory ({employees.filter(e => e.employment_status !== 'inactive').length} active)</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text" placeholder="🔍 Search name, position, dept, branch…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ padding: '6px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.85rem', outline: 'none', minWidth: 240 }}
          />
          <Button size="sm" onClick={() => { setShowAddModal(true); setError(''); }}>
            <Plus size={14} className="mr-1" /> Add Employee
          </Button>
        </div>
      </div>

      <Card>
        <Table
          columns={[
            { header: 'Name', render: r => {
              const t = getTenure(r.hire_date);
              return (
                <div>
                  <button onClick={() => openProfile(r)} style={{ fontWeight: 700, color: '#1e3a5f', fontSize: '0.88rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', textDecoration: 'underline dotted' }}>
                    {r.full_name}
                  </button>
                  {t && (
                    <span style={{ marginLeft: 6, fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: t.alert ? '#fef3c7' : '#f1f5f9', color: t.alert ? '#b45309' : '#6b7280' }}>
                      {t.text}{t.alert ? ' 🎂' : ''}
                    </span>
                  )}
                </div>
              );
            }},
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
            { header: 'Actions', render: r => (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <Button size="sm" variant="secondary" onClick={() => openProfile(r)}>👁 Profile</Button>
                {r.employment_status !== 'inactive' && (
                  <Button size="sm" variant="danger" onClick={() => { setRemoveTarget(r); setRemoveReason(''); setError(''); }}>Remove</Button>
                )}
              </div>
            )},
          ]}
          data={filtered}
          emptyMessage={search ? 'No employees match your search' : 'No employees found'}
        />
      </Card>

      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-gray-800">Pending Approval</h3>
              <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">{pending.length}</span>
            </div>
          </CardHeader>
          <Table
            columns={[
              { header: 'Type', render: r => {
                if (r.request_type === 'profile_update') return <Badge variant="info">👤 Profile Update</Badge>;
                return <Badge variant={r.request_type === 'add' ? 'success' : 'danger'}>{r.request_type === 'add' ? '+ Add' : '− Remove'}</Badge>;
              }},
              { header: 'Staff', render: r => (
                <div>
                  <p className="font-semibold text-sm text-gray-800">{r.full_name}</p>
                  {r.request_type === 'profile_update'
                    ? <p className="text-xs text-gray-400">{Object.keys(r.profile_changes || {}).map(k => k.replace(/_/g,' ')).join(', ')}</p>
                    : <p className="text-xs text-gray-400">{r.position}{r.branch ? ` · ${r.branch}` : ''}</p>}
                </div>
              )},
              { header: 'Details', render: r => {
                if (r.request_type === 'profile_update') {
                  const changes = r.profile_changes || {};
                  return (
                    <div className="text-xs text-gray-600 space-y-0.5">
                      {Object.entries(changes).map(([k, v]) => (
                        <div key={k}><span className="font-semibold capitalize">{k.replace(/_/g,' ')}:</span> {k === 'bank_account_no' ? '••••' + String(v).slice(-4) : v}</div>
                      ))}
                    </div>
                  );
                }
                return <span className="text-xs text-gray-600">{r.reason || '—'}</span>;
              }},
              { header: 'Requested', render: r => formatDate(r.requested_at) },
              { header: 'Approver', render: r => (
                <Badge variant="warning">{r.request_type === 'profile_update' ? 'HR Approval' : 'Awaiting GM'}</Badge>
              )},
              { header: 'Action', render: r => r.request_type === 'profile_update' ? (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  <Button size="sm" variant="success" onClick={async () => {
                    try { await api.hr.staffChangeRequests.review(r.id, 'approved', ''); loadData(); setSuccess('Profile update applied.'); setTimeout(() => setSuccess(''), 5000); }
                    catch (e) { setError(e.message || 'Failed'); }
                  }}>✓ Apply</Button>
                  <Button size="sm" variant="danger" onClick={async () => {
                    try { await api.hr.staffChangeRequests.review(r.id, 'rejected', ''); loadData(); }
                    catch (e) { setError(e.message || 'Failed'); }
                  }}>✕ Reject</Button>
                </div>
              ) : <span className="text-xs text-gray-400">GM only</span>,
              },
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
              { header: 'Type', render: r => {
                if (r.request_type === 'profile_update') return <Badge variant="info">👤 Profile</Badge>;
                return <Badge variant={r.request_type === 'add' ? 'success' : 'danger'}>{r.request_type === 'add' ? '+ Add' : '− Remove'}</Badge>;
              }},
              { header: 'Staff', key: 'full_name' },
              { header: 'Status', render: r => <Badge variant={r.status === 'approved' ? 'success' : 'danger'}>{r.status}</Badge> },
              { header: 'Note', render: r => <span className="text-xs text-gray-500">{r.gm_note || '—'}</span> },
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

      <Modal open={!!removeTarget} title={removeTarget ? `Request Removal: ${removeTarget.full_name}` : ''} onClose={() => setRemoveTarget(null)}>
          <div className="p-6 space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <p className="text-sm font-semibold text-red-800">You are requesting to deactivate this employee.</p>
              <p className="text-sm text-red-700 mt-1">
                <strong>{removeTarget?.full_name}</strong> · {removeTarget?.position} · {removeTarget?.branch || '—'}
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

      {profileEmp && (
        <Modal open={!!profileEmp} title={`👤 ${profileEmp.full_name}`} onClose={() => setProfileEmp(null)}>
          <div style={{ padding: '0 24px 24px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid #f1f5f9' }}>
              {[
                { label: 'Position', value: profileEmp.position || '—' },
                { label: 'Department', value: profileEmp.department || '—' },
                { label: 'Branch', value: profileEmp.branch || '—' },
                { label: 'Phone', value: profileEmp.phone || '—' },
                { label: 'Tenure', value: (() => { const t = getTenure(profileEmp.hire_date); return t ? t.text : '—'; })() },
                { label: 'Joined', value: profileEmp.hire_date ? formatDate(profileEmp.hire_date) : '—' },
              ].map(item => (
                <div key={item.label} style={{ minWidth: 110 }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.05em' }}>{item.label}</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1f2937' }}>{item.value}</div>
                </div>
              ))}
            </div>
            {profileLoading ? <LoadingSpinner /> : (
              <div className="space-y-5">
                <div>
                  <p style={{ fontWeight: 700, fontSize: '0.83rem', color: '#374151', marginBottom: 6 }}>📅 Leave History ({profileData.leaves.length})</p>
                  {profileData.leaves.length === 0 ? <p style={{ fontSize: '0.82rem', color: '#9ca3af' }}>No leave records</p> : (
                    <div style={{ maxHeight: 130, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {profileData.leaves.map((l, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', padding: '4px 8px', background: '#f9fafb', borderRadius: 6 }}>
                          <span><Badge variant={LEAVE_TYPE_COLORS[l.leave_type] || 'info'}>{l.leave_type}</Badge> {formatDate(l.start_date)} → {formatDate(l.end_date)} ({l.working_days ?? '?'}d)</span>
                          <Badge variant={l.status === 'approved' ? 'success' : l.status === 'rejected' ? 'danger' : 'warning'}>{l.status}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: '0.83rem', color: '#374151', marginBottom: 6 }}>⚠️ Warnings ({profileData.warnings.length})</p>
                  {profileData.warnings.length === 0 ? <p style={{ fontSize: '0.82rem', color: '#9ca3af' }}>No warnings on record</p> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {profileData.warnings.map((w, i) => (
                        <div key={i} style={{ fontSize: '0.8rem', padding: '5px 8px', background: '#fef2f2', borderRadius: 6, color: '#991b1b' }}>
                          <strong>{w.subtype || 'Warning'}</strong> — {formatDate(w.date || w.created_at)}: {w.reason || w.notes || '—'}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: '0.83rem', color: '#374151', marginBottom: 6 }}>⭐ Performance Reviews ({profileData.reviews.length})</p>
                  {profileData.reviews.length === 0 ? <p style={{ fontSize: '0.82rem', color: '#9ca3af' }}>No reviews yet</p> : (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {profileData.reviews.map((rev, i) => (
                        <div key={i} style={{ background: '#fefce8', border: '1px solid #fde047', borderRadius: 8, padding: '6px 12px', textAlign: 'center', minWidth: 56 }}>
                          <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#ca8a04' }}>{rev.rating}</div>
                          <div style={{ fontSize: '0.68rem', color: '#a16207' }}>{formatDate(rev.created_at)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: '0.83rem', color: '#374151', marginBottom: 6 }}>🕐 Recent Attendance ({profileData.attendance.length} records)</p>
                  {profileData.attendance.length === 0 ? <p style={{ fontSize: '0.82rem', color: '#9ca3af' }}>No attendance records</p> : (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {profileData.attendance.slice(-20).map((a, i) => {
                        const isLate = (a.subtype || a.status) === 'Late';
                        return (
                          <div key={i} title={`${a.date}: in ${a.clock_in || '?'} out ${a.clock_out || '?'}`}
                            style={{ width: 30, height: 30, borderRadius: 6, background: isLate ? '#fef3c7' : '#dcfce7', border: `1.5px solid ${isLate ? '#fde68a' : '#86efac'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: isLate ? '#b45309' : '#15803d', cursor: 'default' }}>
                            {isLate ? '⚠' : '✓'}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
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

function isUuid(s) {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}
function resolveDisplayName(leave) {
  const name = leave.employee_name;
  if (name && !isUuid(name) && name.trim().length > 0) return name;
  return leave.staffName || leave.staff_name || leave.full_name || leave.username || '—';
}

function LeaveCard({ leave, onApprove, onRejectClick }) {
  const displayName = resolveDisplayName(leave);
  const empNum = leave.emp_number || (!isUuid(leave.employee_id) ? leave.employee_id : null) || '—';
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
            <span className="text-lg font-bold text-gray-900">{displayName}</span>
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
  const [leaveView, setLeaveView] = useState('list');
  const [leaveMonth, setLeaveMonth] = useState(new Date().toISOString().slice(0, 7));

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
      setSuccess('Leave request approved.');
      setTimeout(() => setSuccess(''), 3000);
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

  const LEAVE_ENTITLEMENTS = { Annual: 24, Sick: 10, Personal: 3, Maternity: 84, Paternity: 5 };
  const currentYear = new Date().getFullYear().toString();

  const leaveBalances = employees.reduce((acc, emp) => {
    const used = {};
    leaves.filter(l => l.status === 'approved' && l.employee_name === emp.full_name && (l.start_date || '').startsWith(currentYear))
      .forEach(l => { used[l.leave_type] = (used[l.leave_type] || 0) + (l.working_days || 0); });
    acc[emp.full_name] = used;
    return acc;
  }, {});

  const checkConflict = (empName, startDate, endDate) => {
    if (!empName || !startDate || !endDate) return '';
    const emp = employees.find(e => e.full_name === empName);
    const branch = emp?.branch;
    if (!branch) return '';
    const overlap = leaves.filter(l =>
      l.status !== 'rejected' && l.employee_name !== empName &&
      (employees.find(e2 => e2.full_name === l.employee_name)?.branch === branch) &&
      !(l.end_date < startDate || l.start_date > endDate)
    );
    if (!overlap.length) return '';
    return `⚠️ ${overlap.length} staff member(s) at ${branch} also have leave during this period: ${overlap.map(l => l.employee_name).slice(0, 3).join(', ')}`;
  };

  const formConflict = checkConflict(form.employee_name, form.start_date, form.end_date);

  const pending = leaves.filter(l => l.status === 'pending');
  const history = leaves.filter(l => l.status !== 'pending');

  const calDays = (() => {
    const [y, m] = leaveMonth.split('-').map(Number);
    const first = new Date(y, m - 1, 1).getDay();
    const total = new Date(y, m, 0).getDate();
    return { first, total, y, m };
  })();
  const approvedLeaves = leaves.filter(l => l.status === 'approved');

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h3 className="font-bold text-gray-800">New Leave Request</h3>
            <div style={{ display: 'flex', gap: 6 }}>
              {['list','calendar','balances'].map(v => (
                <button key={v} onClick={() => setLeaveView(v)} style={{ padding: '5px 14px', fontSize: '0.78rem', fontWeight: 700, borderRadius: 20, border: '1.5px solid', borderColor: leaveView === v ? '#1e3a5f' : '#e2e8f0', background: leaveView === v ? '#1e3a5f' : '#fff', color: leaveView === v ? '#fff' : '#6b7280', cursor: 'pointer', transition: 'all 0.15s' }}>
                  {v === 'list' ? '📋 List' : v === 'calendar' ? '📅 Calendar' : '⚖️ Balances'}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
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
            {formConflict && (
              <div className="md:col-span-2">
                <div style={{ background: '#fef3c7', border: '1.5px solid #f59e0b', borderRadius: 8, padding: '8px 12px', fontSize: '0.83rem', color: '#92400e' }}>{formConflict}</div>
              </div>
            )}
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

      {leaveView === 'calendar' && (
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="font-bold text-gray-800">Leave Calendar</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => { const [y,m] = leaveMonth.split('-').map(Number); setLeaveMonth(new Date(y, m-2, 1).toISOString().slice(0,7)); }} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: '0.9rem' }}>‹</button>
                <span style={{ fontWeight: 700, color: '#1f2937', fontSize: '0.88rem' }}>{new Date(leaveMonth + '-15').toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                <button onClick={() => { const [y,m] = leaveMonth.split('-').map(Number); setLeaveMonth(new Date(y, m, 1).toISOString().slice(0,7)); }} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: '0.9rem' }}>›</button>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
              {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, color: '#9ca3af', padding: '4px 0' }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {Array.from({ length: calDays.first }, (_, i) => <div key={'e'+i} />)}
              {Array.from({ length: calDays.total }, (_, i) => {
                const day = i + 1;
                const ds = `${calDays.y}-${String(calDays.m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                const onLeave = approvedLeaves.filter(l => l.start_date <= ds && l.end_date >= ds);
                const isToday = ds === new Date().toISOString().slice(0,10);
                return (
                  <div key={day} title={onLeave.map(l => `${l.employee_name} (${l.leave_type})`).join('\n')}
                    style={{ minHeight: 54, padding: '3px 4px', border: `1.5px solid ${isToday ? '#3b82f6' : '#f1f5f9'}`, borderRadius: 6, background: onLeave.length ? '#fffbeb' : (isToday ? '#eff6ff' : '#fff') }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: isToday ? '#3b82f6' : '#374151' }}>{day}</div>
                    {onLeave.slice(0,2).map((l, idx) => (
                      <div key={idx} style={{ fontSize: '0.62rem', background: '#f59e0b', color: '#fff', borderRadius: 3, padding: '0 3px', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.employee_name?.split(' ')[0]}
                      </div>
                    ))}
                    {onLeave.length > 2 && <div style={{ fontSize: '0.6rem', color: '#9ca3af' }}>+{onLeave.length - 2}</div>}
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: '0.73rem', color: '#9ca3af', marginTop: 8 }}>Hover over a day to see who is on leave. 🟡 = approved leave · 🔵 = today</p>
          </CardBody>
        </Card>
      )}

      {leaveView === 'balances' && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">⚖️ Leave Balances — {currentYear}</h3></CardHeader>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151', position: 'sticky', left: 0, background: '#f8fafc' }}>Employee</th>
                  {Object.keys(LEAVE_ENTITLEMENTS).map(t => (
                    <th key={t} style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: '#374151', minWidth: 90 }}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.filter(e => e.employment_status !== 'inactive').map(emp => (
                  <tr key={emp.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 12px', fontWeight: 600, color: '#1f2937', whiteSpace: 'nowrap' }}>{emp.full_name}</td>
                    {Object.entries(LEAVE_ENTITLEMENTS).map(([type, max]) => {
                      const used = leaveBalances[emp.full_name]?.[type] || 0;
                      const remaining = Math.max(0, max - used);
                      const pct = max > 0 ? Math.min(100, (used / max) * 100) : 0;
                      return (
                        <td key={type} style={{ padding: '7px 12px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: remaining === 0 ? '#dc2626' : remaining <= 3 ? '#b45309' : '#15803d' }}>{remaining}d left</div>
                          <div style={{ background: '#f1f5f9', borderRadius: 3, height: 5, margin: '2px auto', overflow: 'hidden', maxWidth: 60 }}>
                            <div style={{ width: `${pct}%`, background: pct >= 100 ? '#dc2626' : pct >= 75 ? '#f59e0b' : '#22c55e', height: '100%' }} />
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#9ca3af' }}>{used}/{max}d</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

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
                <p className="font-semibold text-gray-800 text-sm">{resolveDisplayName(r)}</p>
                {(r.emp_number || (!isUuid(r.employee_id) && r.employee_id)) && (
                  <p className="text-xs text-gray-400 font-mono">{r.emp_number || r.employee_id}</p>
                )}
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
        <Modal open={!!rejectTarget} title="Reject Leave Request" onClose={() => setRejectTarget(null)}>
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
              <p className="text-sm font-semibold text-gray-800">{resolveDisplayName(rejectTarget)}</p>
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

function StaffActionsTab() {
  const [sub, setSub] = useState('warnings');
  const subTabs = [
    { id: 'warnings', label: 'Warnings', icon: '⚠️' },
    { id: 'terminations', label: 'Terminations', icon: '🚫' },
    { id: 'transfers', label: 'Transfers', icon: '🔄' },
    { id: 'communication', label: 'Communication', icon: '💬' },
  ];
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '2px solid #f1f5f9', paddingBottom: 0 }}>
        {subTabs.map(t => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            style={{
              padding: '8px 20px',
              fontWeight: sub === t.id ? 700 : 500,
              fontSize: '0.85rem',
              color: sub === t.id ? '#dc2626' : '#64748b',
              background: 'none',
              border: 'none',
              borderBottom: sub === t.id ? '2px solid #dc2626' : '2px solid transparent',
              marginBottom: -2,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'color 0.15s',
            }}
          >
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>
      {sub === 'warnings' && <WarningsTab />}
      {sub === 'terminations' && <TerminationsTab />}
      {sub === 'transfers' && <TransferTab />}
      {sub === 'communication' && <CommunicationTab />}
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
            <div className="flex items-end gap-3 flex-wrap">
              <Button type="submit">Issue Warning</Button>
              {form.employee_name && form.reason && (
                <button
                  type="button"
                  onClick={() => generateWarningLetter({ ...form, subtype: form.warning_type })}
                  style={{ padding: '8px 16px', fontSize: '0.82rem', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                  title="Preview & print warning letter before submitting"
                >
                  🖨 Preview Letter
                </button>
              )}
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
            { header: 'Letter', render: r => (
              <button
                onClick={() => generateWarningLetter(r)}
                title="Generate printable warning letter (PDF)"
                style={{ padding: '4px 10px', fontSize: '0.75rem', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                🖨 PDF Letter
              </button>
            )},
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
            <div className="flex items-end gap-3 flex-wrap">
              <Button type="submit" variant="danger">Process Termination</Button>
              {form.employee_name && form.reason && form.effective_date && (
                <button
                  type="button"
                  onClick={() => generateTerminationLetter(form)}
                  style={{ padding: '8px 16px', fontSize: '0.82rem', background: '#7f1d1d', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                  title="Preview & print termination letter before submitting"
                >
                  🖨 Preview Letter
                </button>
              )}
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
            { header: 'Letter', render: r => (
              <button
                onClick={() => generateTerminationLetter(r)}
                title="Generate printable termination letter (PDF)"
                style={{ padding: '4px 10px', fontSize: '0.75rem', background: '#7f1d1d', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                🖨 PDF Letter
              </button>
            )},
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
  const [attView, setAttView] = useState('list');
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10);
  });
  const [editRecord, setEditRecord] = useState(null);
  const [editForm, setEditForm] = useState({ clock_in: '', clock_out: '' });
  const [editSubmitting, setEditSubmitting] = useState(false);

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

  const exportCSV = () => {
    const rows = filterDate ? records.filter(r => (r.date || '').startsWith(filterDate)) : records;
    if (!rows.length) return;
    const headers = ['Employee','Date','Clock In','Clock Out','Hours','Status'];
    const data = rows.map(r => {
      let hrs = '';
      if (r.clock_in && r.clock_out) {
        const [ih,im] = r.clock_in.split(':').map(Number);
        const [oh,om] = r.clock_out.split(':').map(Number);
        const mins = (oh*60+om) - (ih*60+im);
        if (mins > 0) hrs = `${Math.floor(mins/60)}h${mins%60}m`;
      }
      return [r.employee_name||'', r.date||'', r.clock_in||'', r.clock_out||'', hrs, r.subtype||r.status||''];
    });
    const csv = [headers,...data].map(row=>row.map(c=>`"${c}"`).join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})), download:`attendance_${filterDate||'all'}.csv` });
    a.click();
  };

  const handleEditSave = async () => {
    if (!editRecord) return;
    setEditSubmitting(true);
    try {
      await api.hr.updateRecord(editRecord.id, { clock_in: editForm.clock_in||undefined, clock_out: editForm.clock_out||undefined });
      setEditRecord(null); loadData();
    } catch(err) { alert(err.message||'Failed to update'); }
    finally { setEditSubmitting(false); }
  };

  const thirtyAgo = new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  const lateOffenders = Object.entries(
    records.filter(r => (r.subtype||r.status)==='Late' && r.date>=thirtyAgo)
      .reduce((acc,r)=>{ acc[r.employee_name]=(acc[r.employee_name]||0)+1; return acc; },{})
  ).filter(([,c])=>c>=2).sort((a,b)=>b[1]-a[1]);

  const weekDays = Array.from({length:7},(_,i)=>{ const d=new Date(weekStart); d.setDate(d.getDate()+i); return d.toISOString().slice(0,10); });
  const weekRecordsMap = {};
  records.filter(r=>weekDays.includes(r.date)).forEach(r=>{ weekRecordsMap[`${r.employee_name}__${r.date}`]=r; });
  const weekEmployees = [...new Set(records.filter(r=>weekDays.includes(r.date)).map(r=>r.employee_name))];

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

      <div style={{ background: 'linear-gradient(90deg,#eff6ff,#dbeafe)', border: '1.5px solid #93c5fd', borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: '1.2rem' }}>🤖</span>
        <div>
          <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1d4ed8', margin: 0 }}>Auto-Attendance Active</p>
          <p style={{ fontSize: '0.78rem', color: '#3b82f6', margin: 0 }}>Staff clock-in is recorded automatically on first login of the day. Clock-out updates on logout.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h3 className="font-bold text-gray-800">Attendance Records</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Filter by date:</span>
              <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
                style={{ padding: '4px 10px', border: '1.5px solid #d1d5db', borderRadius: 8, fontSize: '0.85rem', color: '#374151' }} />
              <button onClick={() => setFilterDate('')} style={{ fontSize: '0.78rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>All</button>
              <button onClick={exportCSV} style={{ fontSize: '0.78rem', fontWeight: 700, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: '#374151' }}>⬇ CSV</button>
              <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 8, padding: 2, gap: 2 }}>
                {[['list','📋 List'],['weekly','📅 Week']].map(([v,label]) => (
                  <button key={v} onClick={() => setAttView(v)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 700, background: attView===v ? '#1e3a5f' : 'transparent', color: attView===v ? '#fff' : '#6b7280', border: 'none', cursor: 'pointer', transition: 'all 0.15s' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>

        {attView === 'list' && (
          <Table
            columns={[
              { header: 'Employee', key: 'employee_name' },
              { header: 'Date', render: r => formatDate(r.date) },
              { header: 'Clock In', render: r => {
                if (!r.clock_in) return <span style={{ color: '#9ca3af' }}>—</span>;
                const s = r.subtype || r.status || '';
                const isLate = s === 'Late';
                return (
                  <span style={{ fontWeight: 700, fontSize: '0.88rem', color: isLate ? '#b45309' : '#15803d', background: isLate ? '#fef3c7' : '#dcfce7', padding: '2px 8px', borderRadius: 6, border: `1px solid ${isLate ? '#fde68a' : '#86efac'}` }}>
                    {isLate ? '⚠ ' : '✓ '}{r.clock_in}
                  </span>
                );
              }},
              { header: 'Clock Out', render: r => r.clock_out ? <span style={{ fontWeight: 600, color: '#374151' }}>{r.clock_out}</span> : <span style={{ color: '#9ca3af' }}>—</span> },
              { header: 'Hours', render: r => {
                if (!r.clock_in || !r.clock_out) return <span style={{ color: '#9ca3af' }}>—</span>;
                const [ih,im] = r.clock_in.split(':').map(Number), [oh,om] = r.clock_out.split(':').map(Number);
                const mins = (oh*60+om)-(ih*60+im);
                if (mins <= 0) return <span style={{ color: '#9ca3af' }}>—</span>;
                const under = mins < 8*60;
                return <span style={{ fontWeight: 700, color: under ? '#b45309' : '#15803d' }}>{Math.floor(mins/60)}h {mins%60}m{under ? ' ⚠' : ''}</span>;
              }},
              { header: 'Status', render: r => {
                const s = r.subtype || r.status || 'Present';
                return <Badge variant={s==='Late'?'warning':s==='Present'?'success':s==='Absent'?'danger':'info'}>{s}</Badge>;
              }},
              { header: 'Actions', render: r => (
                <button onClick={() => { setEditRecord(r); setEditForm({ clock_in: r.clock_in||'', clock_out: r.clock_out||'' }); }}
                  style={{ fontSize: '0.78rem', fontWeight: 700, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', color: '#374151' }}>
                  ✏️ Edit
                </button>
              )},
            ]}
            data={filterDate ? records.filter(r=>(r.date||'').startsWith(filterDate)) : records}
            emptyMessage="No attendance records"
          />
        )}

        {attView === 'weekly' && (
          <CardBody>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <button onClick={() => { const d=new Date(weekStart); d.setDate(d.getDate()-7); setWeekStart(d.toISOString().slice(0,10)); }}
                style={{ padding: '4px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: '0.9rem' }}>‹ Prev</button>
              <span style={{ fontWeight: 700, color: '#1f2937', fontSize: '0.88rem' }}>Week of {new Date(weekStart+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</span>
              <button onClick={() => { const d=new Date(weekStart); d.setDate(d.getDate()+7); setWeekStart(d.toISOString().slice(0,10)); }}
                style={{ padding: '4px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: '0.9rem' }}>Next ›</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#6b7280', borderBottom: '2px solid #e2e8f0', minWidth: 130 }}>Employee</th>
                    {weekDays.map(d => {
                      const dt = new Date(d+'T12:00:00');
                      const isToday = d === new Date().toISOString().slice(0,10);
                      return (
                        <th key={d} style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700, color: isToday ? '#3b82f6' : '#6b7280', borderBottom: '2px solid #e2e8f0', minWidth: 80, background: isToday ? '#eff6ff' : undefined }}>
                          <div>{dt.toLocaleDateString('en-GB',{weekday:'short'})}</div>
                          <div style={{ fontSize: '0.68rem' }}>{dt.toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {(weekEmployees.length ? weekEmployees : employees.slice(0,20).map(e=>e.full_name)).map(emp => (
                    <tr key={emp} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 10px', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{emp}</td>
                      {weekDays.map(d => {
                        const rec = weekRecordsMap[`${emp}__${d}`];
                        const dt = new Date(d+'T12:00:00');
                        const isWeekend = dt.getDay()===0 || dt.getDay()===6;
                        if (!rec) return <td key={d} style={{ padding: '5px 6px', textAlign: 'center', background: isWeekend ? '#f8fafc' : undefined }}><span style={{ fontSize: '0.72rem', color: '#d1d5db' }}>—</span></td>;
                        const s = rec.subtype||rec.status;
                        const [bg, col] = s==='Late' ? ['#fef3c7','#b45309'] : s==='Absent' ? ['#fef2f2','#dc2626'] : ['#dcfce7','#15803d'];
                        return (
                          <td key={d} style={{ padding: '4px 5px', textAlign: 'center' }}>
                            <div style={{ background: bg, borderRadius: 6, padding: '3px 4px' }}>
                              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: col }}>{s}</div>
                              {rec.clock_in && <div style={{ fontSize: '0.65rem', color: '#6b7280' }}>{rec.clock_in}</div>}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10, fontSize: '0.73rem' }}>
              {[['#dcfce7','#15803d','Present'],['#fef3c7','#b45309','Late'],['#fef2f2','#dc2626','Absent']].map(([bg,col,label]) => (
                <span key={label} style={{ background: bg, color: col, borderRadius: 4, padding: '1px 8px', fontWeight: 700 }}>{label}</span>
              ))}
            </div>
          </CardBody>
        )}
      </Card>

      {lateOffenders.length > 0 && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">⚠️ Late Arrival Report — Last 30 Days</h3></CardHeader>
          <CardBody>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: 10 }}>Staff with 2+ late arrivals in the past 30 days.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {lateOffenders.map(([name, count]) => (
                <div key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: count>=5 ? '#fef2f2' : '#fef3c7', border: `1px solid ${count>=5 ? '#fca5a5' : '#fde68a'}`, borderRadius: 8, padding: '7px 12px' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: count>=5 ? '#dc2626' : '#92400e' }}>{name}</span>
                  <span style={{ background: count>=5 ? '#dc2626' : '#f59e0b', color: '#fff', borderRadius: 4, fontSize: '0.73rem', fontWeight: 800, padding: '1px 6px' }}>{count}×</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {editRecord && (
        <Modal open={!!editRecord} title={`✏️ Override: ${editRecord.employee_name} — ${formatDate(editRecord.date)}`} onClose={() => setEditRecord(null)}>
          <div style={{ padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', fontSize: '0.83rem', color: '#374151' }}>
              Current: Clock In <strong>{editRecord.clock_in||'—'}</strong> · Clock Out <strong>{editRecord.clock_out||'—'}</strong> · Status <strong>{editRecord.subtype||editRecord.status}</strong>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Clock In</label>
                <input type="time" value={editForm.clock_in} onChange={e => setEditForm(f=>({...f,clock_in:e.target.value}))}
                  style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: '0.9rem' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Clock Out</label>
                <input type="time" value={editForm.clock_out} onChange={e => setEditForm(f=>({...f,clock_out:e.target.value}))}
                  style={{ width: '100%', padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: '0.9rem' }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button variant="secondary" onClick={() => setEditRecord(null)}>Cancel</Button>
              <Button onClick={handleEditSave} disabled={editSubmitting}>{editSubmitting ? 'Saving…' : 'Save Override'}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PerformanceTab() {
  const [employees, setEmployees] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ employee_name: '', rating: '3', strengths: '', improvements: '', goals: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [autoInfo, setAutoInfo] = useState(null);

  const loadData = () => {
    Promise.all([
      api.employees.list().then(d => Array.isArray(d) ? d : d.employees || []).catch(() => []),
      api.hr.records('performance').then(d => Array.isArray(d) ? d : d.records || []).catch(() => []),
      api.hr.records('attendance').then(d => Array.isArray(d) ? d : d.records || []).catch(() => []),
    ]).then(([emps, recs, att]) => {
      setEmployees(emps.filter(e => e.employment_status !== 'inactive'));
      setReviews(recs);
      setAttendance(att);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleAutoGenerate = () => {
    const empName = form.employee_name;
    if (!empName) { setError('Select an employee first'); return; }
    setError('');
    const now = new Date();
    const cutoff = new Date(now - 90 * 86400000);
    const empAtt = attendance.filter(a =>
      a.employee_name === empName && a.date && new Date(a.date) >= cutoff
    );
    const total = empAtt.length;
    const late = empAtt.filter(a => (a.status || '').toLowerCase() === 'late').length;
    const absent = empAtt.filter(a => (a.status || '').toLowerCase() === 'absent').length;
    const present = total - late - absent;
    const empPrior = reviews.filter(r => r.employee_name === empName);
    const avgPrior = empPrior.length
      ? empPrior.reduce((s, r) => s + Number(r.rating), 0) / empPrior.length
      : null;

    let score = 3;
    if (total > 0) {
      const presentRate = present / total;
      const lateRate = late / total;
      if (presentRate >= 0.9) score += 1;
      else if (presentRate < 0.7) score -= 1;
      if (lateRate >= 0.2) score -= 0.5;
    }
    if (avgPrior !== null) {
      if (avgPrior >= 4) score += 0.5;
      else if (avgPrior <= 2) score -= 0.5;
    }
    score = Math.round(Math.max(1, Math.min(5, score)));

    const strengths = [];
    if (total > 0 && present / total >= 0.9) strengths.push('Excellent attendance record in the past 90 days');
    if (late === 0 && total > 0) strengths.push('Perfect punctuality — no late arrivals recorded');
    if (avgPrior !== null && avgPrior >= 4) strengths.push('Consistently strong prior performance reviews');
    if (score === 5) strengths.push('Outstanding overall contribution to the team');
    if (strengths.length === 0) strengths.push('Meets role expectations and basic performance standards');

    const improvements = [];
    if (late > 0) improvements.push(`Punctuality: ${late} late arrival(s) recorded in past 90 days`);
    if (absent > 0) improvements.push(`Attendance: ${absent} unexcused absence(s) recorded`);
    if (score <= 2) improvements.push('Requires a structured performance improvement plan');
    if (improvements.length === 0) improvements.push('Continue maintaining current standards of performance');

    const goalMap = {
      5: 'Explore mentoring opportunities and leadership development to prepare for advancement.',
      4: 'Continue current trajectory; take on stretch assignments and cross-functional projects.',
      3: 'Focus on consistency, complete outstanding professional development goals this quarter.',
      2: 'Work closely with direct supervisor to identify and address specific performance gaps.',
      1: 'Engage immediately in a formal performance improvement plan with clear milestones.',
    };

    setForm(f => ({
      ...f,
      rating: String(score),
      strengths: strengths.join('. '),
      improvements: improvements.join('. '),
      goals: goalMap[score],
    }));
    setAutoInfo({ total, late, absent, present, avgPrior, score });
  };

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
      setAutoInfo(null);
      setTimeout(() => setSuccess(''), 3000);
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to save review');
    } finally {
      setSubmitting(false);
    }
  };

  const empTrends = reviews.reduce((acc, r) => {
    if (!acc[r.employee_name]) acc[r.employee_name] = [];
    acc[r.employee_name].push({ rating: Number(r.rating), date: r.created_at });
    return acc;
  }, {});
  Object.values(empTrends).forEach(arr => arr.sort((a, b) => new Date(a.date) - new Date(b.date)));

  const deptAverages = employees.reduce((acc, emp) => {
    const dept = emp.department || 'Unassigned';
    const empRevs = empTrends[emp.full_name] || [];
    if (empRevs.length > 0) {
      const avg = empRevs.reduce((s, r) => s + r.rating, 0) / empRevs.length;
      if (!acc[dept]) acc[dept] = { total: 0, count: 0 };
      acc[dept].total += avg; acc[dept].count += 1;
    }
    return acc;
  }, {});

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
          {autoInfo && (
            <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex gap-3 items-start">
              <span className="text-blue-500 text-lg mt-0.5">⚡</span>
              <div className="flex-1 text-sm text-blue-800">
                <p className="font-semibold mb-1">Auto-generated from data (last 90 days)</p>
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
                  <span>📋 <strong>{autoInfo.total}</strong> attendance records</span>
                  <span>✅ <strong>{autoInfo.present}</strong> present</span>
                  <span>⏰ <strong>{autoInfo.late}</strong> late</span>
                  <span>❌ <strong>{autoInfo.absent}</strong> absent</span>
                  {autoInfo.avgPrior !== null && (
                    <span>⭐ Prior avg: <strong>{autoInfo.avgPrior.toFixed(1)}</strong></span>
                  )}
                  <span>→ Suggested score: <strong>{autoInfo.score}/5</strong></span>
                </div>
                <p className="text-xs text-blue-600 mt-1">You can still edit any field before saving.</p>
              </div>
              <button onClick={() => setAutoInfo(null)} className="text-blue-400 hover:text-blue-600 text-lg leading-none">×</button>
            </div>
          )}
          <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Select
                  label="Employee"
                  value={form.employee_name}
                  onChange={e => { setForm(f => ({ ...f, employee_name: e.target.value })); setAutoInfo(null); }}
                  options={[
                    { value: '', label: 'Select Employee' },
                    ...employees.map(emp => ({ value: emp.full_name, label: emp.full_name })),
                  ]}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAutoGenerate}
                title="Auto-generate review from attendance & history"
                style={{ whiteSpace: 'nowrap', marginBottom: 1 }}
              >
                ⚡ Auto-Generate
              </Button>
            </div>
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
              <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save Review'}</Button>
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

      {Object.keys(empTrends).length > 0 && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">📈 Per-Employee Rating Trends</h3></CardHeader>
          <CardBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(empTrends).map(([name, arr]) => {
                const avg = (arr.reduce((s,r)=>s+r.rating,0)/arr.length).toFixed(1);
                const first = arr[0]?.rating, last = arr[arr.length-1]?.rating;
                const trend = arr.length > 1 ? (last > first ? '↑' : last < first ? '↓' : '→') : '→';
                const tColor = trend === '↑' ? '#15803d' : trend === '↓' ? '#dc2626' : '#6b7280';
                return (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ minWidth: 140, fontWeight: 600, fontSize: '0.85rem', color: '#374151' }}>{name}</div>
                    <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 32 }}>
                      {arr.map((r, i) => (
                        <div key={i} title={`${formatDate(r.date)}: ${r.rating}/5`}
                          style={{ width: 18, background: r.rating >= 4 ? '#22c55e' : r.rating >= 3 ? '#f59e0b' : '#ef4444', borderRadius: '3px 3px 0 0', height: `${(r.rating/5)*100}%`, minHeight: 6, transition: 'height 0.3s' }} />
                      ))}
                    </div>
                    <div style={{ minWidth: 36, fontWeight: 900, fontSize: '1rem', color: tColor }}>{trend}</div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1f2937' }}>avg {avg}</div>
                    <div style={{ display: 'flex' }}>{ratingStars(Math.round(parseFloat(avg)))}</div>
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: '0.73rem', color: '#9ca3af', marginTop: 10 }}>Each bar = one review. Height = rating (1–5). Trend arrow = first vs latest.</p>
          </CardBody>
        </Card>
      )}

      {Object.keys(deptAverages).length > 0 && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">🏢 Department Average Ratings</h3></CardHeader>
          <CardBody>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(deptAverages).sort((a,b)=>(b[1].total/b[1].count)-(a[1].total/a[1].count)).map(([dept, {total, count}]) => {
                const avg = total / count;
                const pct = (avg / 5) * 100;
                return (
                  <div key={dept} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ minWidth: 140, fontWeight: 700, fontSize: '0.85rem', color: '#374151' }}>{dept}</div>
                    <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 6, height: 14, overflow: 'hidden', maxWidth: 240 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: avg >= 4 ? '#22c55e' : avg >= 3 ? '#f59e0b' : '#ef4444', borderRadius: 6, transition: 'width 0.4s' }} />
                    </div>
                    <div style={{ fontWeight: 900, fontSize: '0.95rem', color: avg>=4 ? '#15803d' : avg>=3 ? '#b45309' : '#dc2626', minWidth: 32 }}>{avg.toFixed(1)}</div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{count} staff reviewed</div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function TransferTab() {
  const [employees, setEmployees] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const POSITIONS = [
    'Branch Manager', 'Assistant Branch Manager', 'Sales Consultant', 'Pharmacist Assistant',
    'Cashier', 'Stock Controller', 'Warehouse Staff', 'Driver', 'Cleaner', 'Security',
    'HR Officer', 'Accountant', 'Data Capturer', 'IT Support', 'Other',
  ];
  const emptyForm = {
    employee_name: '', current_branch: '', new_branch: '', current_position: '',
    new_position: '', transfer_type: 'permanent', effective_date: '', end_date: '',
    reason: '', issued_by: '',
  };
  const [form, setForm] = useState(emptyForm);
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const loadData = () => {
    Promise.all([
      api.employees.list().then(d => Array.isArray(d) ? d : d.employees || []).catch(() => []),
      api.hr.records('transfer').then(d => Array.isArray(d) ? d : d.records || []).catch(() => []),
    ]).then(([emps, recs]) => {
      setEmployees(emps);
      setTransfers(recs);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleEmpChange = (name) => {
    f('employee_name', name);
    const emp = employees.find(e => e.full_name === name);
    if (emp) {
      f('current_branch', emp.branch || '');
      f('current_position', emp.position || emp.role || '');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.employee_name || !form.new_branch || !form.effective_date) {
      setError('Employee, new branch, and effective date are required.');
      return;
    }
    if (form.transfer_type === 'temporary' && !form.end_date) {
      setError('End date is required for temporary transfers.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await api.hr.createRecord({
        type: 'transfer',
        employee_name: form.employee_name,
        reason: form.reason,
        date: form.effective_date,
        subtype: form.transfer_type,
        metadata: {
          current_branch:   form.current_branch,
          new_branch:       form.new_branch,
          current_position: form.current_position,
          new_position:     form.new_position || form.current_position,
          transfer_type:    form.transfer_type,
          effective_date:   form.effective_date,
          end_date:         form.end_date || null,
          issued_by:        form.issued_by,
        },
      });
      setSuccess('Transfer recorded successfully. Generate the PDF letter below.');
      setTransfers(prev => [{ ...form, id: Date.now(), created_at: new Date().toISOString() }, ...prev]);
      setTimeout(() => setSuccess(''), 5000);
      setForm(emptyForm);
      loadData();
    } catch (err) {
      setError(err.message || 'Failed to record transfer');
    } finally {
      setSubmitting(false);
    }
  };

  const getTransferMeta = (rec) => {
    try {
      return typeof rec.metadata === 'string' ? JSON.parse(rec.metadata || '{}') : (rec.metadata || {});
    } catch { return {}; }
  };

  const openLetter = (rec) => {
    const meta = getTransferMeta(rec);
    generateTransferLetter({
      employee_name:    rec.employee_name,
      current_branch:   meta.current_branch  || rec.current_branch  || '',
      new_branch:       meta.new_branch       || rec.new_branch      || '',
      current_position: meta.current_position || rec.current_position || '',
      new_position:     meta.new_position     || rec.new_position    || meta.current_position || '',
      effective_date:   meta.effective_date   || rec.date            || '',
      end_date:         meta.end_date         || rec.end_date        || null,
      transfer_type:    meta.transfer_type    || rec.subtype         || 'permanent',
      reason:           rec.reason            || '',
      issued_by:        meta.issued_by        || rec.issued_by       || '',
    });
  };

  if (loading) return <LoadingSpinner />;

  const branchOptions = [
    { value: '', label: 'Select Branch' },
    ...BRANCHES.map(b => ({ value: b, label: b })),
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Record Staff Transfer</h3></CardHeader>
        <CardBody>
          {error   && <Alert type="error"   className="mb-4">{error}</Alert>}
          {success && <Alert type="success" className="mb-4">{success}</Alert>}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Row 1 */}
            <div className="grid md:grid-cols-2 gap-4">
              <Select
                label="Employee *"
                value={form.employee_name}
                onChange={e => handleEmpChange(e.target.value)}
                options={[{ value: '', label: 'Select Employee' }, ...employees.map(e => ({ value: e.full_name, label: e.full_name }))]}
              />
              <Select
                label="Transfer Type *"
                value={form.transfer_type}
                onChange={e => f('transfer_type', e.target.value)}
                options={[
                  { value: 'permanent', label: 'Permanent Transfer' },
                  { value: 'temporary', label: 'Temporary Transfer / Secondment' },
                ]}
              />
            </div>

            {/* Row 2 — Branches */}
            <div className="grid md:grid-cols-2 gap-4">
              <Select label="From Branch (Current)" value={form.current_branch} onChange={e => f('current_branch', e.target.value)} options={branchOptions} />
              <Select label="To Branch (New) *"     value={form.new_branch}     onChange={e => f('new_branch', e.target.value)}     options={branchOptions} />
            </div>

            {/* Row 3 — Positions */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Current Position</label>
                <input
                  list="pos-current" value={form.current_position}
                  onChange={e => f('current_position', e.target.value)}
                  placeholder="e.g. Sales Consultant"
                  style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }}
                />
                <datalist id="pos-current">{POSITIONS.map(p => <option key={p} value={p} />)}</datalist>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>
                  New Position <span style={{ fontWeight: 400, color: '#94a3b8' }}>(leave blank to maintain current)</span>
                </label>
                <input
                  list="pos-new" value={form.new_position}
                  onChange={e => f('new_position', e.target.value)}
                  placeholder="Leave blank = no change"
                  style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }}
                />
                <datalist id="pos-new">{POSITIONS.map(p => <option key={p} value={p} />)}</datalist>
              </div>
            </div>

            {/* Row 4 — Dates */}
            <div className="grid md:grid-cols-2 gap-4">
              <Input label="Effective Date *" type="date" value={form.effective_date} onChange={e => f('effective_date', e.target.value)} required />
              {form.transfer_type === 'temporary' && (
                <Input label="End Date (Secondment) *" type="date" value={form.end_date} onChange={e => f('end_date', e.target.value)} />
              )}
            </div>

            {/* Row 5 — Reason + Issued By */}
            <Textarea label="Reason / Business Justification (optional)" value={form.reason} onChange={e => f('reason', e.target.value)} rows={2} />
            <Input label="Authorised By (HR Officer / Manager)" value={form.issued_by} onChange={e => f('issued_by', e.target.value)} placeholder="Full name of authorising manager" />

            {/* Buttons */}
            <div className="flex gap-3 flex-wrap items-center pt-1">
              <Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Record Transfer'}</Button>
              {form.employee_name && form.new_branch && (
                <button
                  type="button"
                  onClick={() => generateTransferLetter({ ...form, new_position: form.new_position || form.current_position })}
                  style={{ padding: '8px 16px', fontSize: '0.82rem', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                  title="Preview transfer letter before saving"
                >
                  🖨 Preview PDF Letter
                </button>
              )}
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Transfer History</h3></CardHeader>
        <Table
          columns={[
            { header: 'Employee', key: 'employee_name' },
            { header: 'Type', render: r => {
              const meta = getTransferMeta(r);
              const t = meta.transfer_type || r.subtype || 'permanent';
              return <Badge variant={t === 'permanent' ? 'primary' : 'info'}>{t === 'permanent' ? 'Permanent' : 'Temporary'}</Badge>;
            }},
            { header: 'From', render: r => { const m = getTransferMeta(r); return m.current_branch || '—'; }},
            { header: 'To', render: r => { const m = getTransferMeta(r); return m.new_branch || '—'; }},
            { header: 'Position Change', render: r => {
              const m = getTransferMeta(r);
              if (!m.new_position || m.new_position === m.current_position) return <span style={{ color: '#64748b', fontSize: '0.82rem' }}>Same</span>;
              return <span style={{ fontSize: '0.82rem' }}>{m.current_position} → {m.new_position}</span>;
            }},
            { header: 'Effective Date', render: r => { const m = getTransferMeta(r); return formatDate(m.effective_date || r.date); }},
            { header: 'Letter', render: r => (
              <button
                onClick={() => openLetter(r)}
                style={{ padding: '4px 10px', fontSize: '0.75rem', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}
                title="Generate printable transfer letter (PDF)"
              >
                🖨 PDF Letter
              </button>
            )},
          ]}
          data={transfers}
          emptyMessage="No transfers recorded yet"
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

// ═══════════════════════════════════════════════════════════
// ONBOARDING TAB
// ═══════════════════════════════════════════════════════════
const ONBOARDING_ITEMS = [
  { id: 'contract', label: 'Employment Contract Signed' },
  { id: 'id_docs', label: 'ID / Passport Copy Submitted' },
  { id: 'bank', label: 'Bank Account Details Captured' },
  { id: 'nhi', label: 'NHI Registration Number Obtained' },
  { id: 'tax', label: 'Income Tax Registration Submitted' },
  { id: 'medical', label: 'Medical Aid / Benefits Enrolled' },
  { id: 'it_access', label: 'System & IT Access Created' },
  { id: 'equipment', label: 'Equipment / Uniform Issued' },
  { id: 'orientation', label: 'Company Orientation Completed' },
  { id: 'checkin', label: 'First Week Manager Check-in Done' },
];

function OnboardingTab() {
  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const loadData = () => {
    Promise.all([
      api.employees.list().then(d => (Array.isArray(d) ? d : d.employees || []).filter(e => e.employment_status !== 'inactive')).catch(() => []),
      api.hr.records('onboarding').then(d => Array.isArray(d) ? d : d.records || []).catch(() => []),
    ]).then(([emps, recs]) => { setEmployees(emps); setRecords(recs); }).finally(() => setLoading(false));
  };
  useEffect(() => { loadData(); }, []);

  const parseItems = (rec) => {
    try { return JSON.parse(rec.notes || '{}').items || ONBOARDING_ITEMS.map(i => ({ ...i, done: false })); }
    catch { return ONBOARDING_ITEMS.map(i => ({ ...i, done: false })); }
  };

  const startOnboarding = async (emp) => {
    setSubmitting(true); setError('');
    try {
      await api.hr.createRecord({ type: 'onboarding', employee_name: emp.full_name, status: 'in_progress', notes: JSON.stringify({ items: ONBOARDING_ITEMS.map(i => ({ ...i, done: false })) }) });
      setSuccess(`Onboarding started for ${emp.full_name}`);
      setTimeout(() => setSuccess(''), 3000);
      loadData();
    } catch (err) { setError(err.message); } finally { setSubmitting(false); }
  };

  const toggleItem = async (rec, itemId) => {
    setError('');
    const items = parseItems(rec).map(i => i.id === itemId ? { ...i, done: !i.done } : i);
    const allDone = items.every(i => i.done);
    try {
      await api.hr.updateRecord(rec.id, { notes: JSON.stringify({ items }), status: allDone ? 'complete' : 'in_progress' });
      loadData();
      if (allDone) { setSuccess(`🎉 ${rec.employee_name} onboarding complete!`); setTimeout(() => setSuccess(''), 4000); }
    } catch (err) { setError(err.message); }
  };

  if (loading) return <LoadingSpinner />;
  const onboardedNames = new Set(records.map(r => r.employee_name));
  const needsOnboarding = employees.filter(e => !onboardedNames.has(e.full_name));
  const active = records.filter(r => r.status !== 'complete');
  const completed = records.filter(r => r.status === 'complete');

  return (
    <div className="space-y-6">
      {success && <Alert type="success" className="mb-2">{success}</Alert>}
      {error && <Alert type="error" className="mb-2">{error}</Alert>}
      {needsOnboarding.length > 0 && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800 flex items-center gap-2"><Plus size={16} className="text-primary" /> Not Yet Started ({needsOnboarding.length})</h3></CardHeader>
          <CardBody>
            <div className="divide-y divide-gray-100">
              {needsOnboarding.map(emp => (
                <div key={emp.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="font-semibold text-gray-800 text-sm">{emp.full_name}</p>
                    <p className="text-xs text-gray-500">{emp.position || '—'} · {emp.branch || '—'} · Joined {emp.hire_date ? new Date(emp.hire_date).toLocaleDateString() : '?'}</p>
                  </div>
                  <Button size="sm" onClick={() => startOnboarding(emp)} disabled={submitting}><Plus size={13} /> Start Onboarding</Button>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
      {active.length > 0 && (
        <div>
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Clock size={16} className="text-amber-500" /> In Progress ({active.length})</h3>
          <div className="space-y-4">
            {active.map(rec => {
              const items = parseItems(rec);
              const done = items.filter(i => i.done).length;
              const pct = items.length ? Math.round((done / items.length) * 100) : 0;
              return (
                <Card key={rec.id}>
                  <CardHeader>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1f2937', margin: 0 }}>{rec.employee_name}</p>
                        <p style={{ fontSize: '0.73rem', color: '#6b7280', margin: '2px 0 0' }}>Started {formatDate(rec.created_at)} · {done}/{items.length} tasks done</p>
                      </div>
                      <span style={{ fontWeight: 900, fontSize: '1.1rem', color: pct === 100 ? '#16a34a' : '#3b82f6' }}>{pct}%</span>
                    </div>
                    <div style={{ background: '#e5e7eb', borderRadius: 99, height: 6, overflow: 'hidden', marginTop: 8 }}>
                      <div style={{ width: `${pct}%`, background: pct === 100 ? '#16a34a' : '#3b82f6', height: '100%', borderRadius: 99, transition: 'width 0.4s' }} />
                    </div>
                  </CardHeader>
                  <CardBody>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                      {items.map(item => (
                        <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8, cursor: 'pointer', background: item.done ? '#f0fdf4' : 'transparent' }}>
                          <input type="checkbox" checked={!!item.done} onChange={() => toggleItem(rec, item.id)} style={{ width: 16, height: 16, accentColor: '#16a34a', cursor: 'pointer' }} />
                          <span style={{ fontSize: '0.83rem', color: item.done ? '#9ca3af' : '#374151', textDecoration: item.done ? 'line-through' : 'none' }}>{item.label}</span>
                          {item.done && <CheckCircle2 size={13} style={{ color: '#16a34a', marginLeft: 'auto', flexShrink: 0 }} />}
                        </label>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </div>
      )}
      {completed.length > 0 && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800 flex items-center gap-2"><CheckCircle2 size={16} className="text-green-500" /> Completed ({completed.length})</h3></CardHeader>
          <Table columns={[{ header: 'Employee', key: 'employee_name' }, { header: 'Started', render: r => formatDate(r.created_at) }, { header: 'Status', render: () => <Badge variant="success">Complete ✓</Badge> }]} data={completed} emptyMessage="" />
        </Card>
      )}
      {records.length === 0 && needsOnboarding.length === 0 && (
        <EmptyState icon={<CheckCircle2 size={40} className="text-green-400" />} title="All employees onboarded" description="Every active employee has completed onboarding." />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// OFFBOARDING TAB
// ═══════════════════════════════════════════════════════════
const OFFBOARDING_ITEMS = [
  { id: 'exit_interview', label: 'Exit Interview Conducted' },
  { id: 'handover', label: 'Job Handover / Knowledge Transfer Completed' },
  { id: 'equipment', label: 'Company Equipment Returned (laptop, phone, uniform)' },
  { id: 'access', label: 'System & IT Access Revoked' },
  { id: 'final_pay', label: 'Final Paycheck Processed' },
  { id: 'leave_payout', label: 'Outstanding Leave Balance Paid Out' },
  { id: 'reference', label: 'Reference / Certificate of Service Issued' },
  { id: 'id_card', label: 'Company ID Card Collected' },
];

function OffboardingTab() {
  const [employees, setEmployees] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ employee_name: '', reason: '', last_day: '' });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const REASONS = ['Resignation', 'Termination', 'Retirement', 'Contract End', 'Retrenchment', 'Other'];

  const loadData = () => {
    Promise.all([
      api.employees.list().then(d => Array.isArray(d) ? d : d.employees || []).catch(() => []),
      api.hr.records('offboarding').then(d => Array.isArray(d) ? d : d.records || []).catch(() => []),
    ]).then(([emps, recs]) => { setEmployees(emps); setRecords(recs); }).finally(() => setLoading(false));
  };
  useEffect(() => { loadData(); }, []);

  const parseOff = (rec) => {
    try { const p = JSON.parse(rec.notes || '{}'); return { items: p.items || OFFBOARDING_ITEMS.map(i => ({ ...i, done: false })), last_day: p.last_day || rec.effective_date || '', reason: p.reason || rec.subtype || '' }; }
    catch { return { items: OFFBOARDING_ITEMS.map(i => ({ ...i, done: false })), last_day: rec.effective_date || '', reason: rec.subtype || '' }; }
  };

  const startOffboarding = async (e) => {
    e.preventDefault();
    if (!form.employee_name || !form.reason || !form.last_day) { setError('All three fields are required'); return; }
    setError(''); setSubmitting(true);
    try {
      await api.hr.createRecord({ type: 'offboarding', employee_name: form.employee_name, subtype: form.reason, effective_date: form.last_day, status: 'in_progress', notes: JSON.stringify({ items: OFFBOARDING_ITEMS.map(i => ({ ...i, done: false })), last_day: form.last_day, reason: form.reason }) });
      setSuccess(`Offboarding started for ${form.employee_name}`);
      setForm({ employee_name: '', reason: '', last_day: '' });
      setTimeout(() => setSuccess(''), 3000);
      loadData();
    } catch (err) { setError(err.message); } finally { setSubmitting(false); }
  };

  const toggleItem = async (rec, itemId) => {
    const parsed = parseOff(rec);
    const items = parsed.items.map(i => i.id === itemId ? { ...i, done: !i.done } : i);
    const allDone = items.every(i => i.done);
    try {
      await api.hr.updateRecord(rec.id, { notes: JSON.stringify({ ...parsed, items }), status: allDone ? 'complete' : 'in_progress' });
      loadData();
      if (allDone) { setSuccess(`${rec.employee_name} offboarding fully complete`); setTimeout(() => setSuccess(''), 4000); }
    } catch (err) { setError(err.message); }
  };

  if (loading) return <LoadingSpinner />;
  const active = records.filter(r => r.status !== 'complete');
  const completed = records.filter(r => r.status === 'complete');

  return (
    <div className="space-y-6">
      {success && <Alert type="success" className="mb-2">{success}</Alert>}
      {error && <Alert type="error" className="mb-2">{error}</Alert>}
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800 flex items-center gap-2"><LogOut size={16} className="text-red-500" /> Start Offboarding</h3></CardHeader>
        <CardBody>
          <form onSubmit={startOffboarding} className="grid md:grid-cols-3 gap-4">
            <Select label="Employee" value={form.employee_name} onChange={e => setForm(f => ({ ...f, employee_name: e.target.value }))} options={[{ value: '', label: 'Select Employee' }, ...employees.map(e => ({ value: e.full_name, label: e.full_name }))]} />
            <Select label="Reason for Leaving" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} options={[{ value: '', label: 'Select Reason' }, ...REASONS.map(r => ({ value: r, label: r }))]} />
            <Input label="Last Working Day" type="date" value={form.last_day} onChange={e => setForm(f => ({ ...f, last_day: e.target.value }))} />
            <div className="md:col-span-3 flex justify-end">
              <Button type="submit" disabled={submitting}>{submitting ? 'Starting…' : '🚪 Start Offboarding'}</Button>
            </div>
          </form>
        </CardBody>
      </Card>
      {active.length > 0 && (
        <div>
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Clock size={16} className="text-amber-500" /> In Progress ({active.length})</h3>
          <div className="space-y-4">
            {active.map(rec => {
              const { items, last_day, reason } = parseOff(rec);
              const done = items.filter(i => i.done).length;
              const pct = items.length ? Math.round((done / items.length) * 100) : 0;
              return (
                <Card key={rec.id}>
                  <CardHeader>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <p style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1f2937', margin: 0 }}>{rec.employee_name}</p>
                        <p style={{ fontSize: '0.73rem', color: '#6b7280', margin: '2px 0 0' }}>{reason} · Last day: {last_day ? formatDate(last_day) : '—'} · {done}/{items.length} tasks</p>
                      </div>
                      <span style={{ fontWeight: 900, fontSize: '1.1rem', color: pct === 100 ? '#16a34a' : '#ef4444' }}>{pct}%</span>
                    </div>
                    <div style={{ background: '#e5e7eb', borderRadius: 99, height: 6, overflow: 'hidden', marginTop: 8 }}>
                      <div style={{ width: `${pct}%`, background: pct === 100 ? '#16a34a' : '#ef4444', height: '100%', borderRadius: 99, transition: 'width 0.4s' }} />
                    </div>
                  </CardHeader>
                  <CardBody>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                      {items.map(item => (
                        <label key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 8px', borderRadius: 8, cursor: 'pointer', background: item.done ? '#f0fdf4' : 'transparent' }}>
                          <input type="checkbox" checked={!!item.done} onChange={() => toggleItem(rec, item.id)} style={{ width: 16, height: 16, marginTop: 2, accentColor: '#16a34a', cursor: 'pointer', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.82rem', color: item.done ? '#9ca3af' : '#374151', textDecoration: item.done ? 'line-through' : 'none' }}>{item.label}</span>
                          {item.done && <CheckCircle2 size={13} style={{ color: '#16a34a', marginLeft: 'auto', flexShrink: 0, marginTop: 2 }} />}
                        </label>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </div>
      )}
      {completed.length > 0 && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Completed ({completed.length})</h3></CardHeader>
          <Table columns={[{ header: 'Employee', key: 'employee_name' }, { header: 'Reason', key: 'subtype' }, { header: 'Last Day', render: r => { try { return formatDate(JSON.parse(r.notes || '{}').last_day || r.effective_date); } catch { return formatDate(r.effective_date); } } }, { header: 'Status', render: () => <Badge variant="success">Complete ✓</Badge> }]} data={completed} emptyMessage="" />
        </Card>
      )}
      {records.length === 0 && <EmptyState icon={<LogOut size={40} className="text-red-300" />} title="No offboarding in progress" description="Start an offboarding process when an employee is leaving." />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DOCUMENT VAULT TAB
// ═══════════════════════════════════════════════════════════
const DOC_TYPES = ['Employment Contract', 'ID / Passport', 'NHI Certificate', 'Tax Certificate', 'Medical Aid', 'Qualification / Degree', 'Professional License', 'Bank Confirmation', 'Performance Review', 'Warning Letter', 'Other'];

function DocumentVaultTab() {
  const [employees, setEmployees] = useState([]);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filterEmp, setFilterEmp] = useState('');
  const [form, setForm] = useState({ employee_name: '', doc_type: '', description: '' });
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileKey, setFileKey] = useState(0);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const loadData = () => {
    Promise.all([
      api.employees.list().then(d => (Array.isArray(d) ? d : d.employees || []).filter(e => e.employment_status !== 'inactive')).catch(() => []),
      api.hr.records('document').then(d => Array.isArray(d) ? d : d.records || []).catch(() => []),
    ]).then(([emps, recs]) => { setEmployees(emps); setDocs(recs.filter(r => r.status !== 'deleted')); }).finally(() => setLoading(false));
  };
  useEffect(() => { loadData(); }, []);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!form.employee_name || !form.doc_type) { setError('Employee and document type are required'); return; }
    if (!selectedFile) { setError('Please select a file'); return; }
    setError(''); setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      const uploadRes = await api.upload(fd);
      const fileUrl = uploadRes?.url || uploadRes?.file_url || uploadRes?.path || uploadRes?.publicUrl || '';
      if (!fileUrl) throw new Error('Upload failed — server did not return a file URL');
      await api.hr.createRecord({ type: 'document', employee_name: form.employee_name, subtype: form.doc_type, reason: form.description, notes: fileUrl, metadata: { file_name: selectedFile.name, file_size: selectedFile.size, doc_type: form.doc_type } });
      setSuccess('Document uploaded successfully');
      setForm({ employee_name: '', doc_type: '', description: '' });
      setSelectedFile(null);
      setFileKey(k => k + 1);
      setTimeout(() => setSuccess(''), 3000);
      loadData();
    } catch (err) { setError(err.message || 'Upload failed'); } finally { setUploading(false); }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Delete this ${doc.subtype || 'document'} for ${doc.employee_name}?`)) return;
    try { await api.hr.updateRecord(doc.id, { status: 'deleted' }); setDocs(prev => prev.filter(d => d.id !== doc.id)); }
    catch (err) { setError(err.message); }
  };

  if (loading) return <LoadingSpinner />;
  const displayed = filterEmp ? docs.filter(d => d.employee_name === filterEmp) : docs;
  const getMeta = (rec) => { try { return typeof rec.metadata === 'object' && rec.metadata ? rec.metadata : JSON.parse(rec.metadata || '{}'); } catch { return {}; } };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800 flex items-center gap-2"><Upload size={16} className="text-primary" /> Upload Document</h3></CardHeader>
        <CardBody>
          {success && <Alert type="success" className="mb-4">{success}</Alert>}
          {error && <Alert type="error" className="mb-4">{error}</Alert>}
          <form onSubmit={handleUpload} className="grid md:grid-cols-2 gap-4">
            <Select label="Employee" value={form.employee_name} onChange={e => setForm(f => ({ ...f, employee_name: e.target.value }))} options={[{ value: '', label: 'Select Employee' }, ...employees.map(e => ({ value: e.full_name, label: e.full_name }))]} />
            <Select label="Document Type" value={form.doc_type} onChange={e => setForm(f => ({ ...f, doc_type: e.target.value }))} options={[{ value: '', label: 'Select Type' }, ...DOC_TYPES.map(t => ({ value: t, label: t }))]} />
            <div className="md:col-span-2">
              <Input label="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Signed contract dated March 2024" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">File</label>
              <input key={fileKey} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls" onChange={e => setSelectedFile(e.target.files?.[0] || null)} className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:opacity-90 cursor-pointer" />
              <p className="text-xs text-gray-400 mt-1">PDF, Word, Excel, or image files · {selectedFile ? `Selected: ${selectedFile.name}` : 'No file chosen'}</p>
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" disabled={uploading}>{uploading ? 'Uploading…' : '📤 Upload Document'}</Button>
            </div>
          </form>
        </CardBody>
      </Card>
      <Card>
        <CardHeader>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <h3 className="font-bold text-gray-800">Document Library <span style={{ fontWeight: 400, fontSize: '0.85rem', color: '#6b7280' }}>({displayed.length})</span></h3>
            <Select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} options={[{ value: '', label: 'All Employees' }, ...employees.map(e => ({ value: e.full_name, label: e.full_name }))]} />
          </div>
        </CardHeader>
        <CardBody style={{ padding: 0 }}>
          {displayed.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}><FileText size={36} style={{ margin: '0 auto 8px', opacity: 0.3 }} /><p style={{ fontSize: '0.85rem' }}>No documents found</p></div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead><tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                  {['Employee', 'Type', 'File', 'Description', 'Uploaded', ''].map(h => (
                    <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {displayed.map((doc, i) => {
                    const meta = getMeta(doc);
                    return (
                      <tr key={doc.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '8px 14px', fontWeight: 600, color: '#1f2937' }}>{doc.employee_name}</td>
                        <td style={{ padding: '8px 14px' }}><span style={{ background: '#eff6ff', color: '#1d4ed8', fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>{doc.subtype || '—'}</span></td>
                        <td style={{ padding: '8px 14px' }}>
                          {doc.notes ? (
                            <a href={doc.notes} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem' }}>
                              <FileText size={13} /> {meta.file_name || 'Open File'}
                            </a>
                          ) : <span style={{ color: '#9ca3af' }}>—</span>}
                        </td>
                        <td style={{ padding: '8px 14px', color: '#6b7280', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.reason || '—'}</td>
                        <td style={{ padding: '8px 14px', color: '#9ca3af', whiteSpace: 'nowrap' }}>{formatDate(doc.created_at)}</td>
                        <td style={{ padding: '8px 14px' }}><button onClick={() => handleDelete(doc)} style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 6, padding: '3px 10px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>Delete</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SKILLS & CERTIFICATIONS TAB
// ═══════════════════════════════════════════════════════════
function SkillsTab() {
  const CERT_TYPES = ['Pharmacy Assistant License', 'Dispensing License', 'First Aid Certificate', 'Fire Safety', 'Health & Safety', 'Pharmaceutical Compliance', 'Sales Certification', 'IT / System Training', 'Management Certificate', 'University Degree / Diploma', 'Other'];
  const [employees, setEmployees] = useState([]);
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ employee_name: '', cert_name: '', issuing_body: '', date_obtained: '', expiry_date: '', cert_number: '' });
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [filterEmp, setFilterEmp] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = () => {
    Promise.all([
      api.employees.list().then(d => (Array.isArray(d) ? d : d.employees || []).filter(e => e.employment_status !== 'inactive')).catch(() => []),
      api.hr.records('certification').then(d => (Array.isArray(d) ? d : d.records || []).filter(r => r.subtype !== 'birthday' && r.status !== 'deleted')).catch(() => []),
    ]).then(([emps, recs]) => { setEmployees(emps); setCerts(recs); }).finally(() => setLoading(false));
  };
  useEffect(() => { loadData(); }, []);

  const parseMeta = (rec) => { try { return JSON.parse(rec.notes || '{}'); } catch { return {}; } };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.employee_name || !form.cert_name) { setError('Employee and certification name required'); return; }
    setError(''); setSubmitting(true);
    try {
      await api.hr.createRecord({ type: 'certification', employee_name: form.employee_name, subtype: form.cert_name, notes: JSON.stringify({ issuing_body: form.issuing_body, cert_number: form.cert_number, expiry_date: form.expiry_date }), date: form.date_obtained || undefined, effective_date: form.expiry_date || undefined });
      setSuccess('Certification saved');
      setForm({ employee_name: '', cert_name: '', issuing_body: '', date_obtained: '', expiry_date: '', cert_number: '' });
      setTimeout(() => setSuccess(''), 3000);
      loadData();
    } catch (err) { setError(err.message); } finally { setSubmitting(false); }
  };

  const handleRemove = async (id) => {
    try { await api.hr.updateRecord(id, { status: 'deleted' }); loadData(); } catch (err) { setError(err.message); }
  };

  if (loading) return <LoadingSpinner />;
  const now = new Date();
  const displayed = filterEmp ? certs.filter(c => c.employee_name === filterEmp) : certs;
  const expired = displayed.filter(c => { const m = parseMeta(c); return m.expiry_date && new Date(m.expiry_date) < now; });
  const expiringSoon = displayed.filter(c => { const m = parseMeta(c); if (!m.expiry_date) return false; const d = new Date(m.expiry_date); return d >= now && (d - now) < 30 * 86400000; });

  return (
    <div className="space-y-6">
      {(expired.length > 0 || expiringSoon.length > 0) && (
        <div className="space-y-2">
          {expired.length > 0 && <div style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 10, padding: '10px 16px', display: 'flex', gap: 10, alignItems: 'center' }}><AlertTriangle size={18} style={{ color: '#dc2626', flexShrink: 0 }} /><div><p style={{ fontWeight: 700, color: '#991b1b', fontSize: '0.85rem', margin: 0 }}>{expired.length} certification{expired.length > 1 ? 's' : ''} expired</p><p style={{ fontSize: '0.78rem', color: '#b91c1c', margin: 0 }}>{expired.map(c => `${c.employee_name} — ${c.subtype}`).join('; ')}</p></div></div>}
          {expiringSoon.length > 0 && <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10, padding: '10px 16px', display: 'flex', gap: 10, alignItems: 'center' }}><Clock size={18} style={{ color: '#b45309', flexShrink: 0 }} /><div><p style={{ fontWeight: 700, color: '#92400e', fontSize: '0.85rem', margin: 0 }}>{expiringSoon.length} certification{expiringSoon.length > 1 ? 's' : ''} expiring within 30 days</p><p style={{ fontSize: '0.78rem', color: '#b45309', margin: 0 }}>{expiringSoon.map(c => `${c.employee_name} — ${c.subtype}`).join('; ')}</p></div></div>}
        </div>
      )}
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800 flex items-center gap-2"><Award size={16} className="text-primary" /> Add Certification / Skill</h3></CardHeader>
        <CardBody>
          {success && <Alert type="success" className="mb-4">{success}</Alert>}
          {error && <Alert type="error" className="mb-4">{error}</Alert>}
          <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
            <Select label="Employee" value={form.employee_name} onChange={e => setForm(f => ({ ...f, employee_name: e.target.value }))} options={[{ value: '', label: 'Select Employee' }, ...employees.map(e => ({ value: e.full_name, label: e.full_name }))]} />
            <Select label="Certification / Skill" value={form.cert_name} onChange={e => setForm(f => ({ ...f, cert_name: e.target.value }))} options={[{ value: '', label: 'Select Type' }, ...CERT_TYPES.map(t => ({ value: t, label: t }))]} />
            <Input label="Issuing Body" value={form.issuing_body} onChange={e => setForm(f => ({ ...f, issuing_body: e.target.value }))} placeholder="e.g. Pharmacy Council of Namibia" />
            <Input label="Certificate / License Number" value={form.cert_number} onChange={e => setForm(f => ({ ...f, cert_number: e.target.value }))} placeholder="Optional" />
            <Input label="Date Obtained" type="date" value={form.date_obtained} onChange={e => setForm(f => ({ ...f, date_obtained: e.target.value }))} />
            <Input label="Expiry Date (if applicable)" type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} />
            <div className="md:col-span-2 flex justify-end"><Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save Certification'}</Button></div>
          </form>
        </CardBody>
      </Card>
      <Card>
        <CardHeader>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <h3 className="font-bold text-gray-800">Certifications & Skills <span style={{ fontWeight: 400, fontSize: '0.85rem', color: '#6b7280' }}>({displayed.length})</span></h3>
            <Select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} options={[{ value: '', label: 'All Employees' }, ...employees.map(e => ({ value: e.full_name, label: e.full_name }))]} />
          </div>
        </CardHeader>
        <CardBody style={{ padding: 0 }}>
          {displayed.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>No certifications on record{filterEmp ? ' for this employee' : ''}.</div> : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead><tr style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
                {['Employee', 'Certification', 'Issuing Body', 'Cert #', 'Obtained', 'Expires', ''].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {displayed.map((cert, i) => {
                  const meta = parseMeta(cert);
                  const isExpired = meta.expiry_date && new Date(meta.expiry_date) < now;
                  const isSoon = meta.expiry_date && !isExpired && (new Date(meta.expiry_date) - now) < 30 * 86400000;
                  return (
                    <tr key={cert.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1f2937' }}>{cert.employee_name}</td>
                      <td style={{ padding: '8px 12px', color: '#374151' }}>{cert.subtype || '—'}</td>
                      <td style={{ padding: '8px 12px', color: '#6b7280' }}>{meta.issuing_body || '—'}</td>
                      <td style={{ padding: '8px 12px', color: '#6b7280', fontFamily: 'monospace', fontSize: '0.78rem' }}>{meta.cert_number || '—'}</td>
                      <td style={{ padding: '8px 12px', color: '#6b7280', whiteSpace: 'nowrap' }}>{cert.date ? formatDate(cert.date) : '—'}</td>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        {meta.expiry_date ? <span style={{ fontWeight: 700, color: isExpired ? '#dc2626' : isSoon ? '#b45309' : '#16a34a', background: isExpired ? '#fef2f2' : isSoon ? '#fffbeb' : '#f0fdf4', padding: '2px 8px', borderRadius: 99, fontSize: '0.73rem' }}>{isExpired ? '⚠ Expired' : isSoon ? '⏰ Expiring soon' : '✓'} {formatDate(meta.expiry_date)}</span> : <span style={{ color: '#9ca3af' }}>No expiry</span>}
                      </td>
                      <td style={{ padding: '8px 12px' }}><button onClick={() => handleRemove(cert.id)} style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 6, padding: '2px 8px', fontSize: '0.73rem', fontWeight: 600, cursor: 'pointer' }}>Remove</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DISCIPLINARY CASES TAB
// ═══════════════════════════════════════════════════════════
function DisciplinaryTab() {
  const SEVERITY_LEVELS = ['Verbal Warning', 'Written Warning', 'Final Written Warning', 'Suspension', 'Dismissal'];
  const SEVERITY_STYLE = { 'Verbal Warning': { bg: '#fef3c7', color: '#b45309' }, 'Written Warning': { bg: '#fee2e2', color: '#dc2626' }, 'Final Written Warning': { bg: '#fecdd3', color: '#be123c' }, 'Suspension': { bg: '#ede9fe', color: '#7c3aed' }, 'Dismissal': { bg: '#111827', color: '#f9fafb' } };
  const [employees, setEmployees] = useState([]);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ employee_name: '', severity: '', incident_date: '', incident_desc: '', hearing_date: '', outcome: '' });
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = () => {
    Promise.all([
      api.employees.list().then(d => (Array.isArray(d) ? d : d.employees || []).filter(e => e.employment_status !== 'inactive')).catch(() => []),
      api.hr.records('disciplinary').then(d => Array.isArray(d) ? d : d.records || []).catch(() => []),
    ]).then(([emps, recs]) => { setEmployees(emps); setCases(recs); }).finally(() => setLoading(false));
  };
  useEffect(() => { loadData(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.employee_name || !form.severity || !form.incident_date || !form.incident_desc) { setError('Employee, severity, incident date, and description are required'); return; }
    setError(''); setSubmitting(true);
    try {
      await api.hr.createRecord({ type: 'disciplinary', employee_name: form.employee_name, subtype: form.severity, date: form.incident_date, notes: form.incident_desc, reason: form.outcome || '', effective_date: form.hearing_date || undefined, status: 'open' });
      setSuccess('Disciplinary case logged');
      setForm({ employee_name: '', severity: '', incident_date: '', incident_desc: '', hearing_date: '', outcome: '' });
      setTimeout(() => setSuccess(''), 3000);
      loadData();
    } catch (err) { setError(err.message); } finally { setSubmitting(false); }
  };

  const closeCase = async (id) => {
    try { await api.hr.updateRecord(id, { status: 'closed' }); loadData(); } catch (err) { setError(err.message); }
  };

  if (loading) return <LoadingSpinner />;
  const openCases = cases.filter(c => c.status !== 'closed');
  const closedCases = cases.filter(c => c.status === 'closed');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800 flex items-center gap-2"><Shield size={16} className="text-red-500" /> Log Disciplinary Case</h3></CardHeader>
        <CardBody>
          {success && <Alert type="success" className="mb-4">{success}</Alert>}
          {error && <Alert type="error" className="mb-4">{error}</Alert>}
          <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
            <Select label="Employee" value={form.employee_name} onChange={e => setForm(f => ({ ...f, employee_name: e.target.value }))} options={[{ value: '', label: 'Select Employee' }, ...employees.map(e => ({ value: e.full_name, label: e.full_name }))]} />
            <Select label="Severity Level" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))} options={[{ value: '', label: 'Select Severity' }, ...SEVERITY_LEVELS.map(s => ({ value: s, label: s }))]} />
            <Input label="Incident Date" type="date" value={form.incident_date} onChange={e => setForm(f => ({ ...f, incident_date: e.target.value }))} />
            <Input label="Hearing Date (optional)" type="date" value={form.hearing_date} onChange={e => setForm(f => ({ ...f, hearing_date: e.target.value }))} />
            <div className="md:col-span-2"><Textarea label="Incident Description" value={form.incident_desc} onChange={e => setForm(f => ({ ...f, incident_desc: e.target.value }))} rows={3} placeholder="Describe the incident clearly and objectively…" /></div>
            <div className="md:col-span-2"><Textarea label="Outcome / Resolution (optional)" value={form.outcome} onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))} rows={2} placeholder="What action was taken or agreed upon…" /></div>
            <div className="md:col-span-2 flex justify-end"><Button type="submit" disabled={submitting}>{submitting ? 'Saving…' : '⚖️ Log Case'}</Button></div>
          </form>
        </CardBody>
      </Card>
      {openCases.length > 0 && (
        <div>
          <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><AlertCircle size={16} className="text-red-500" /> Open Cases ({openCases.length})</h3>
          <div className="space-y-3">
            {openCases.map(c => {
              const sc = SEVERITY_STYLE[c.subtype] || { bg: '#f3f4f6', color: '#374151' };
              return (
                <Card key={c.id}>
                  <CardBody>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.92rem', color: '#1f2937' }}>{c.employee_name}</span>
                          <span style={{ background: sc.bg, color: sc.color, fontWeight: 700, fontSize: '0.73rem', padding: '2px 10px', borderRadius: 99 }}>{c.subtype}</span>
                        </div>
                        <p style={{ fontSize: '0.83rem', color: '#374151', margin: '0 0 4px' }}>{c.notes}</p>
                        {c.reason && <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: 0 }}>Outcome: {c.reason}</p>}
                        <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: '0.73rem', color: '#9ca3af', flexWrap: 'wrap' }}>
                          <span>📅 Incident: {formatDate(c.date || c.created_at)}</span>
                          {c.effective_date && <span>⚖️ Hearing: {formatDate(c.effective_date)}</span>}
                        </div>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => closeCase(c.id)}>Mark Closed</Button>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </div>
      )}
      {closedCases.length > 0 && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Closed Cases ({closedCases.length})</h3></CardHeader>
          <Table columns={[{ header: 'Employee', key: 'employee_name' }, { header: 'Severity', render: r => { const sc = SEVERITY_STYLE[r.subtype] || { bg: '#f3f4f6', color: '#374151' }; return <span style={{ background: sc.bg, color: sc.color, fontWeight: 700, fontSize: '0.73rem', padding: '2px 8px', borderRadius: 99 }}>{r.subtype || '—'}</span>; } }, { header: 'Incident', render: r => formatDate(r.date || r.created_at) }, { header: 'Outcome', render: r => <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>{r.reason || '—'}</span> }, { header: 'Status', render: () => <Badge variant="success">Closed</Badge> }]} data={closedCases} emptyMessage="" />
        </Card>
      )}
      {cases.length === 0 && <EmptyState icon={<CheckCircle2 size={40} className="text-green-400" />} title="No disciplinary cases" description="No cases have been logged yet." />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TEAM CALENDAR TAB
// ═══════════════════════════════════════════════════════════
function TeamCalendarTab() {
  const [employees, setEmployees] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });

  useEffect(() => {
    Promise.all([
      api.employees.list().then(d => (Array.isArray(d) ? d : d.employees || []).filter(e => e.employment_status !== 'inactive')).catch(() => []),
      api.hr.leaves().then(d => (Array.isArray(d) ? d : d.leaves || []).filter(l => l.status === 'approved')).catch(() => []),
    ]).then(([emps, lvs]) => { setEmployees(emps); setLeaves(lvs); }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const year = month.getFullYear();
  const mon = month.getMonth();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const firstDay = (new Date(year, mon, 1).getDay() + 6) % 7;
  const monthStr = `${year}-${String(mon + 1).padStart(2, '0')}`;
  const todayStr = new Date().toISOString().slice(0, 10);

  const dayData = {};
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${year}-${String(mon + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    dayData[ds] = { onLeave: [], anniversaries: [] };
  }
  leaves.forEach(l => {
    const s = l.start_date?.slice(0, 10), e = l.end_date?.slice(0, 10);
    if (!s || !e) return;
    Object.keys(dayData).forEach(ds => { if (ds >= s && ds <= e) dayData[ds].onLeave.push(l.employee_name || '?'); });
  });
  employees.forEach(e => {
    if (!e.hire_date) return;
    const h = new Date(e.hire_date);
    const ds = `${year}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
    if (dayData[ds]) dayData[ds].anniversaries.push(e.full_name);
  });

  const thisMonthLeave = leaves.filter(l => {
    const s = l.start_date?.slice(0, 7), e = l.end_date?.slice(0, 7);
    return s === monthStr || e === monthStr || (s < monthStr && e > monthStr);
  });

  return (
    <div className="space-y-4">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h3 style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1f2937', margin: 0 }}>{month.toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
          <p style={{ fontSize: '0.73rem', color: '#9ca3af', margin: '2px 0 0' }}>{employees.length} active staff · {thisMonthLeave.length} on leave this month</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="sm" variant="secondary" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}><ChevronLeft size={14} /> Prev</Button>
          <Button size="sm" variant="secondary" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</Button>
          <Button size="sm" variant="secondary" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>Next <ChevronRight size={14} /></Button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {[{ color: '#3b82f6', label: 'On Approved Leave' }, { color: '#f59e0b', label: 'Work Anniversary' }].map(l => (
          <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: '#6b7280' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: l.color, display: 'inline-block' }} />{l.label}
          </span>
        ))}
      </div>
      <Card>
        <CardBody style={{ padding: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontWeight: 700, fontSize: '0.72rem', color: '#9ca3af', padding: '4px 0' }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {Array.from({ length: firstDay }, (_, i) => <div key={`e${i}`} />)}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const d = i + 1;
              const ds = `${year}-${String(mon + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const data = dayData[ds] || { onLeave: [], anniversaries: [] };
              const isToday = ds === todayStr;
              const isWeekend = (new Date(ds).getDay() + 6) % 7 >= 5;
              return (
                <div key={d} style={{ border: `1.5px solid ${isToday ? '#3b82f6' : '#e5e7eb'}`, borderRadius: 8, padding: '4px 5px', minHeight: 58, background: isToday ? '#eff6ff' : isWeekend ? '#fafafa' : '#fff' }}>
                  <span style={{ fontWeight: isToday ? 900 : 600, fontSize: '0.82rem', color: isToday ? '#1d4ed8' : isWeekend ? '#9ca3af' : '#374151' }}>{d}</span>
                  <div style={{ marginTop: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {data.onLeave.slice(0, 2).map((name, j) => (
                      <span key={j} style={{ background: '#3b82f6', color: '#fff', borderRadius: 3, fontSize: '0.58rem', padding: '1px 4px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name.split(' ')[0]}</span>
                    ))}
                    {data.onLeave.length > 2 && <span style={{ fontSize: '0.58rem', color: '#3b82f6', fontWeight: 700 }}>+{data.onLeave.length - 2}</span>}
                    {data.anniversaries.map((name, j) => (
                      <span key={`a${j}`} style={{ background: '#fef3c7', color: '#b45309', borderRadius: 3, fontSize: '0.58rem', padding: '1px 4px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${name} anniversary`}>🏆 {name.split(' ')[0]}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>
      {thisMonthLeave.length > 0 && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Leave This Month ({thisMonthLeave.length})</h3></CardHeader>
          <Table columns={[{ header: 'Employee', render: r => <span style={{ fontWeight: 600, color: '#1f2937' }}>{r.employee_name || r.full_name || '—'}</span> }, { header: 'Type', render: r => <Badge variant="info">{r.leave_type || '—'}</Badge> }, { header: 'From', render: r => formatDate(r.start_date) }, { header: 'To', render: r => formatDate(r.end_date) }, { header: 'Days', render: r => <span style={{ fontWeight: 700 }}>{r.working_days ?? '—'}</span> }]} data={thisMonthLeave} emptyMessage="" />
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CELEBRATIONS TAB
// ═══════════════════════════════════════════════════════════
function CelebrationsTab() {
  const [employees, setEmployees] = useState([]);
  const [bdayRecords, setBdayRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ employee_name: '', bday: '' });
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const loadData = () => {
    Promise.all([
      api.employees.list().then(d => (Array.isArray(d) ? d : d.employees || []).filter(e => e.employment_status !== 'inactive')).catch(() => []),
      api.hr.records('certification').then(d => (Array.isArray(d) ? d : d.records || []).filter(r => r.subtype === 'birthday')).catch(() => []),
    ]).then(([emps, recs]) => { setEmployees(emps); setBdayRecords(recs); }).finally(() => setLoading(false));
  };
  useEffect(() => { loadData(); }, []);

  const saveBirthday = async (e) => {
    e.preventDefault();
    if (!form.employee_name || !form.bday) { setError('Both fields required'); return; }
    setError('');
    try {
      await api.hr.createRecord({ type: 'certification', employee_name: form.employee_name, subtype: 'birthday', date: form.bday, notes: form.bday });
      setSuccess('Birthday saved!');
      setForm({ employee_name: '', bday: '' });
      setTimeout(() => setSuccess(''), 3000);
      loadData();
    } catch (err) { setError(err.message); }
  };

  if (loading) return <LoadingSpinner />;

  const now = new Date();
  const year = now.getFullYear();
  const bdayMap = {};
  bdayRecords.forEach(r => { if (r.employee_name) bdayMap[r.employee_name] = r.date || r.notes; });

  const upcoming = [];
  employees.forEach(emp => {
    if (emp.hire_date) {
      const h = new Date(emp.hire_date);
      let ann = new Date(year, h.getMonth(), h.getDate());
      if (ann < now) ann = new Date(year + 1, h.getMonth(), h.getDate());
      const days = Math.ceil((ann - now) / 86400000);
      if (days <= 30) upcoming.push({ type: 'anniversary', name: emp.full_name, position: emp.position || '—', days, label: `${ann.getFullYear() - h.getFullYear()} year anniversary` });
    }
    if (bdayMap[emp.full_name]) {
      const bd = new Date(bdayMap[emp.full_name]);
      let next = new Date(year, bd.getMonth(), bd.getDate());
      if (next < now) next = new Date(year + 1, bd.getMonth(), bd.getDate());
      const days = Math.ceil((next - now) / 86400000);
      if (days <= 30) upcoming.push({ type: 'birthday', name: emp.full_name, position: emp.position || '—', days, label: `Turns ${next.getFullYear() - bd.getFullYear()}` });
    }
  });
  upcoming.sort((a, b) => a.days - b.days);
  const todayCelebrations = upcoming.filter(e => e.days === 0);

  return (
    <div className="space-y-6">
      {todayCelebrations.length > 0 && (
        <div style={{ background: 'linear-gradient(135deg, #fef3c7, #fde68a)', border: '2px solid #f59e0b', borderRadius: 14, padding: '16px 20px' }}>
          <p style={{ fontWeight: 800, color: '#92400e', fontSize: '1rem', marginBottom: 8 }}>🎉 Celebrating Today!</p>
          {todayCelebrations.map((e, i) => <p key={i} style={{ fontWeight: 600, color: '#78350f', fontSize: '0.88rem', margin: '2px 0' }}>{e.type === 'birthday' ? '🎂' : '🏆'} {e.name} — {e.label}</p>)}
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">📅 Upcoming Events (30 Days)</h3></CardHeader>
          <CardBody>
            {upcoming.length === 0 ? <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>No upcoming events in the next 30 days.</p> : (
              <div className="space-y-2">
                {upcoming.map((ev, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 10px', borderRadius: 10, background: ev.days <= 3 ? '#fef3c7' : '#f8fafc', border: `1px solid ${ev.days <= 3 ? '#fde68a' : '#e5e7eb'}` }}>
                    <span style={{ fontSize: '1.3rem' }}>{ev.type === 'birthday' ? '🎂' : '🏆'}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontWeight: 700, fontSize: '0.83rem', color: '#1f2937', margin: 0 }}>{ev.name}</p>
                      <p style={{ fontSize: '0.73rem', color: '#6b7280', margin: 0 }}>{ev.label} · {ev.position}</p>
                    </div>
                    <span style={{ background: ev.days === 0 ? '#fef3c7' : '#eff6ff', color: ev.days === 0 ? '#b45309' : '#1d4ed8', fontWeight: 800, fontSize: '0.73rem', padding: '2px 8px', borderRadius: 8, whiteSpace: 'nowrap' }}>{ev.days === 0 ? '🎉 Today' : `in ${ev.days}d`}</span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">🎂 Register Employee Birthday</h3></CardHeader>
          <CardBody>
            {success && <Alert type="success" className="mb-3">{success}</Alert>}
            {error && <Alert type="error" className="mb-3">{error}</Alert>}
            <form onSubmit={saveBirthday} className="space-y-3">
              <Select label="Employee" value={form.employee_name} onChange={e => setForm(f => ({ ...f, employee_name: e.target.value }))} options={[{ value: '', label: 'Select Employee' }, ...employees.map(e => ({ value: e.full_name, label: e.full_name }))]} />
              <Input label="Date of Birth" type="date" value={form.bday} onChange={e => setForm(f => ({ ...f, bday: e.target.value }))} />
              <div className="flex justify-end"><Button type="submit" size="sm">Save Birthday</Button></div>
            </form>
            {Object.keys(bdayMap).length > 0 && (
              <div className="mt-4 space-y-1.5 border-t border-gray-100 pt-3">
                <p style={{ fontSize: '0.73rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Registered Birthdays</p>
                {Object.entries(bdayMap).map(([name, date]) => (
                  <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#374151' }}>
                    <span style={{ fontWeight: 600 }}>{name}</span>
                    <span style={{ color: '#6b7280' }}>{date ? new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HR ANALYTICS TAB
// ═══════════════════════════════════════════════════════════
function HRAnalyticsTab() {
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.employees.list().then(d => Array.isArray(d) ? d : d.employees || []).catch(() => []),
      api.hr.records('attendance').then(d => Array.isArray(d) ? d : d.records || []).catch(() => []),
      api.hr.leaves().then(d => Array.isArray(d) ? d : d.leaves || []).catch(() => []),
      api.hr.records('warning').then(d => Array.isArray(d) ? d : d.records || []).catch(() => []),
      api.hr.records('performance').then(d => Array.isArray(d) ? d : d.records || []).catch(() => []),
    ]).then(([emps, att, lvs, warns, revs]) => { setEmployees(emps); setAttendance(att); setLeaves(lvs); setWarnings(warns); setReviews(revs); }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const active = employees.filter(e => e.employment_status !== 'inactive');
  const byDept = {}, byBranch = {}, leaveTypes = {};
  active.forEach(e => {
    const d = e.department || 'Unassigned'; byDept[d] = (byDept[d] || 0) + 1;
    const b = e.branch || 'Unassigned'; byBranch[b] = (byBranch[b] || 0) + 1;
  });
  leaves.forEach(l => { const t = l.leave_type || 'Other'; leaveTypes[t] = (leaveTypes[t] || 0) + 1; });

  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const recent = attendance.filter(a => (a.date || '') >= cutoff);
  const lateAtt = recent.filter(a => (a.status || a.subtype || '').toLowerCase() === 'late').length;
  const lateMap = {};
  recent.filter(a => (a.status || a.subtype || '').toLowerCase() === 'late').forEach(a => { lateMap[a.employee_name] = (lateMap[a.employee_name] || 0) + 1; });
  const topLate = Object.entries(lateMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const deptPerf = {};
  reviews.forEach(r => {
    const emp = active.find(e => e.full_name === r.employee_name);
    const dept = emp?.department || 'Unassigned';
    if (!deptPerf[dept]) deptPerf[dept] = { sum: 0, count: 0 };
    deptPerf[dept].sum += Number(r.rating || 0);
    deptPerf[dept].count++;
  });

  const now2 = new Date();
  const monthlyHires = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now2.getFullYear(), now2.getMonth() - i, 1);
    monthlyHires[d.toISOString().slice(0, 7)] = 0;
  }
  active.forEach(e => { if (e.hire_date) { const k = e.hire_date.slice(0, 7); if (k in monthlyHires) monthlyHires[k]++; } });
  const maxHires = Math.max(...Object.values(monthlyHires), 1);

  const StatBar = ({ label, value, max, color }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
      <span style={{ minWidth: 150, fontSize: '0.8rem', color: '#374151', fontWeight: 500 }}>{label}</span>
      <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 12, overflow: 'hidden', maxWidth: 200 }}>
        <div style={{ width: `${(value / max) * 100}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s' }} />
      </div>
      <span style={{ minWidth: 28, fontSize: '0.8rem', fontWeight: 800, color }}>{value}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[{ label: 'Active Staff', value: active.length, color: '#3b82f6', bg: '#eff6ff' }, { label: 'Leave Requests', value: leaves.length, color: '#f59e0b', bg: '#fffbeb' }, { label: 'Attendance (30d)', value: recent.length, color: '#10b981', bg: '#f0fdf4' }, { label: 'Late (30d)', value: lateAtt, color: '#ef4444', bg: '#fef2f2' }, { label: 'Total Warnings', value: warnings.length, color: '#8b5cf6', bg: '#f5f3ff' }].map(s => (
          <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.69rem', color: s.color, fontWeight: 600, marginTop: 2, lineHeight: 1.2 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">👥 Headcount by Department</h3></CardHeader>
          <CardBody>{Object.entries(byDept).sort((a, b) => b[1] - a[1]).map(([dept, count]) => <StatBar key={dept} label={dept} value={count} max={Math.max(...Object.values(byDept), 1)} color="#3b82f6" />)}</CardBody>
        </Card>
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">🏢 Headcount by Branch</h3></CardHeader>
          <CardBody>{Object.entries(byBranch).sort((a, b) => b[1] - a[1]).map(([branch, count]) => <StatBar key={branch} label={branch} value={count} max={Math.max(...Object.values(byBranch), 1)} color="#10b981" />)}</CardBody>
        </Card>
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">🌴 Leave Requests by Type</h3></CardHeader>
          <CardBody>{Object.keys(leaveTypes).length === 0 ? <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>No leave data yet</p> : Object.entries(leaveTypes).sort((a, b) => b[1] - a[1]).map(([type, count]) => <StatBar key={type} label={type} value={count} max={Math.max(...Object.values(leaveTypes), 1)} color="#f59e0b" />)}</CardBody>
        </Card>
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">⏰ Top Late Arrivals (30 Days)</h3></CardHeader>
          <CardBody>{topLate.length === 0 ? <p style={{ fontSize: '0.85rem', color: '#9ca3af' }}>No late arrivals in the past 30 days</p> : topLate.map(([name, count]) => <StatBar key={name} label={name} value={count} max={topLate[0][1]} color="#ef4444" />)}</CardBody>
        </Card>
        {Object.keys(deptPerf).length > 0 && (
          <Card>
            <CardHeader><h3 className="font-bold text-gray-800">⭐ Avg Performance Rating by Dept</h3></CardHeader>
            <CardBody>
              {Object.entries(deptPerf).sort((a, b) => (b[1].sum / b[1].count) - (a[1].sum / a[1].count)).map(([dept, { sum, count }]) => {
                const avg = sum / count;
                return (
                  <div key={dept} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                    <span style={{ minWidth: 150, fontSize: '0.8rem', color: '#374151', fontWeight: 500 }}>{dept}</span>
                    <div style={{ flex: 1, background: '#f1f5f9', borderRadius: 4, height: 12, overflow: 'hidden', maxWidth: 200 }}>
                      <div style={{ width: `${(avg / 5) * 100}%`, height: '100%', background: avg >= 4 ? '#16a34a' : avg >= 3 ? '#f59e0b' : '#dc2626', borderRadius: 4 }} />
                    </div>
                    <span style={{ minWidth: 42, fontSize: '0.8rem', fontWeight: 800, color: avg >= 4 ? '#15803d' : avg >= 3 ? '#b45309' : '#dc2626' }}>{avg.toFixed(1)}/5</span>
                  </div>
                );
              })}
            </CardBody>
          </Card>
        )}
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">📈 Monthly Hires (12 Months)</h3></CardHeader>
          <CardBody>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
              {Object.entries(monthlyHires).map(([month, count]) => (
                <div key={month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#3b82f6' }}>{count > 0 ? count : ''}</span>
                  <div style={{ width: '100%', height: `${count > 0 ? Math.max((count / maxHires) * 64, 8) : 4}px`, background: count > 0 ? '#3b82f6' : '#e5e7eb', borderRadius: '3px 3px 0 0', transition: 'height 0.4s', cursor: 'default' }} title={`${month}: ${count} hire${count !== 1 ? 's' : ''}`} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              {Object.keys(monthlyHires).filter((_, i) => i % 3 === 0).map(m => <span key={m} style={{ fontSize: '0.63rem', color: '#9ca3af' }}>{m.slice(2)}</span>)}
            </div>
            <p style={{ fontSize: '0.73rem', color: '#9ca3af', marginTop: 6 }}>Based on hire dates of currently active employees</p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function DataTab() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [previewSearch, setPreviewSearch] = useState('');

  useEffect(() => {
    api.employees.list()
      .then(d => setEmployees(Array.isArray(d) ? d : d.employees || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const activeEmps = employees.filter(e => e.employment_status !== 'inactive');

  const exportCSV = () => {
    if (activeEmps.length === 0) return;
    const headers = ['Name', 'Position', 'Department', 'Branch', 'Phone', 'Email', 'Status', 'Hire Date'];
    const rows = activeEmps.map(e => [
      e.full_name || '', e.position || '', e.department || '', e.branch || '',
      e.phone || '', e.email || '', e.employment_status || 'active', e.hire_date || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
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
  activeEmps.forEach(e => {
    deptCounts[e.department || 'Unassigned'] = (deptCounts[e.department || 'Unassigned'] || 0) + 1;
    branchCounts[e.branch || 'Unassigned'] = (branchCounts[e.branch || 'Unassigned'] || 0) + 1;
  });

  const previewRows = previewSearch.trim()
    ? activeEmps.filter(e => {
        const q = previewSearch.toLowerCase();
        return ['full_name','position','department','branch','email'].some(k => (e[k]||'').toLowerCase().includes(q));
      })
    : activeEmps;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-800">Employee Data Summary</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => { setShowPreview(v => !v); setPreviewSearch(''); }}>
            {showPreview ? '🙈 Hide Preview' : '👁 Preview Data'}
          </Button>
          <Button size="sm" onClick={exportCSV}><Database size={14} /> Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-primary">{activeEmps.length}</p>
            <p className="text-xs text-gray-500">Active Employees</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-green-600">{activeEmps.filter(e => (e.employment_status || 'active') === 'active').length}</p>
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

      {showPreview && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-bold text-gray-800">Data Preview <span className="text-sm font-normal text-gray-500 ml-2">{previewRows.length} of {activeEmps.length} records</span></h3>
              <input
                type="text"
                placeholder="Filter preview…"
                value={previewSearch}
                onChange={e => setPreviewSearch(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-primary w-48"
              />
            </div>
          </CardHeader>
          <CardBody style={{ padding: 0 }}>
            <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                    {['#', 'Name', 'Position', 'Department', 'Branch', 'Phone', 'Email', 'Status', 'Hire Date'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.length === 0 ? (
                    <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>No records match your filter</td></tr>
                  ) : previewRows.map((e, i) => (
                    <tr key={e.id || i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '7px 12px', color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</td>
                      <td style={{ padding: '7px 12px', fontWeight: 600, color: '#1f2937', whiteSpace: 'nowrap' }}>{e.full_name || '—'}</td>
                      <td style={{ padding: '7px 12px', color: '#374151' }}>{e.position || '—'}</td>
                      <td style={{ padding: '7px 12px', color: '#374151' }}>{e.department || '—'}</td>
                      <td style={{ padding: '7px 12px', color: '#374151' }}>{e.branch || '—'}</td>
                      <td style={{ padding: '7px 12px', color: '#6b7280', fontVariantNumeric: 'tabular-nums' }}>{e.phone || '—'}</td>
                      <td style={{ padding: '7px 12px', color: '#6b7280' }}>{e.email || '—'}</td>
                      <td style={{ padding: '7px 12px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700, background: (e.employment_status||'active') === 'active' ? '#dcfce7' : '#fee2e2', color: (e.employment_status||'active') === 'active' ? '#15803d' : '#dc2626' }}>
                          {e.employment_status || 'active'}
                        </span>
                      </td>
                      <td style={{ padding: '7px 12px', color: '#6b7280', whiteSpace: 'nowrap' }}>{e.hire_date ? new Date(e.hire_date).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '8px 16px', background: '#f8fafc', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>This is the exact data that will be exported to CSV.</span>
              <Button size="sm" onClick={exportCSV}><Database size={12} /> Export CSV</Button>
            </div>
          </CardBody>
        </Card>
      )}

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


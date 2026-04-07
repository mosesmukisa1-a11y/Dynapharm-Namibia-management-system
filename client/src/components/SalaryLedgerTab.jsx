import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { formatCurrency } from '../lib/constants';
import { Card, CardBody, CardHeader, Button, Badge, LoadingSpinner, EmptyState, StatCard, Alert, Modal } from './ui';
import { Users, DollarSign, TrendingUp, FileText, Edit2, Trash2, Plus, CheckCircle } from 'lucide-react';

const CAN_EDIT_ROLES = new Set(['admin', 'finance', 'hr', 'gm']);

const BLANK_FORM = {
  name: '', basic_salary: '', has_overtime: false, overtime_amount: '', total_salary: '',
  ssc_deductions: '', other_deductions: '', designation: '', dpc_town: '',
  gender: '', id_no: '', contact_no: '', date_joined: '', notes: '', period: '2026-03',
};

const FIELDS = [
  { key: 'name',              label: 'Full Name *',               type: 'text'   },
  { key: 'designation',       label: 'Staff Designation',         type: 'text'   },
  { key: 'dpc_town',          label: 'DPC / Town',                type: 'text'   },
  { key: 'basic_salary',      label: 'Basic Salary (N$)',         type: 'number' },
  { key: 'overtime_amount',   label: 'Overtime Amount (N$)',      type: 'number' },
  { key: 'ssc_deductions',    label: 'SSC Deductions (N$)',       type: 'number' },
  { key: 'other_deductions',  label: 'Other Deductions (N$)',     type: 'number' },
  { key: 'total_salary',      label: 'Total Salary Paid (N$)',    type: 'number' },
  { key: 'gender',            label: 'Gender',                    type: 'text'   },
  { key: 'id_no',             label: 'ID Number',                 type: 'text'   },
  { key: 'contact_no',        label: 'Contact Number',            type: 'text'   },
  { key: 'date_joined',       label: 'Date Joined',               type: 'text'   },
  { key: 'period',            label: 'Period (YYYY-MM)',           type: 'text'   },
  { key: 'notes',             label: 'Notes / Remarks',           type: 'text'   },
];

export default function SalaryLedgerTab({ role = 'hr' }) {
  const [employees, setEmployees] = useState([]);
  const [totals, setTotals] = useState({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [editModal, setEditModal] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [addModal, setAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ ...BLANK_FORM });
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const canEdit = CAN_EDIT_ROLES.has(role);

  const load = () => {
    setLoading(true);
    api.hr.salaryLedger.list()
      .then(d => { setEmployees(d.employees || []); setTotals(d.totals || {}); })
      .catch(() => setMsg('Error: Failed to load salary ledger'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openEdit = (e) => {
    setEditForm({ ...e, has_overtime: !!e.has_overtime });
    setEditModal(e);
    setMsg('');
  };

  const submitEdit = async () => {
    if (!editModal) return;
    setSaving(true); setMsg('');
    try {
      const changes = {};
      const numKeys = ['basic_salary', 'overtime_amount', 'total_salary', 'ssc_deductions', 'other_deductions'];
      FIELDS.forEach(f => {
        const v = editForm[f.key];
        changes[f.key] = numKeys.includes(f.key) ? Number(v) || 0 : v;
      });
      changes.has_overtime = !!editForm.has_overtime;
      const result = await api.hr.salaryLedger.proposeEdit(editModal.id, changes);
      if (!result.success) throw new Error(result.error || 'Failed');
      setMsg('Edit submitted for GM approval.');
      setEditModal(null);
      load();
    } catch (e) { setMsg('Error: ' + e.message); }
    finally { setSaving(false); }
  };

  const submitAdd = async () => {
    if (!addForm.name.trim()) { setMsg('Error: Name is required'); return; }
    setSaving(true); setMsg('');
    try {
      const data = { ...addForm };
      ['basic_salary', 'overtime_amount', 'total_salary', 'ssc_deductions', 'other_deductions'].forEach(k => {
        data[k] = Number(data[k]) || 0;
      });
      data.has_overtime = !!data.has_overtime;
      const result = await api.hr.salaryLedger.add(data);
      if (!result.success) throw new Error(result.error || 'Failed');
      setMsg('Employee added to salary ledger.');
      setAddModal(false);
      setAddForm({ ...BLANK_FORM });
      load();
    } catch (e) { setMsg('Error: ' + e.message); }
    finally { setSaving(false); }
  };

  const submitRemove = async () => {
    if (!confirmRemove) return;
    setSaving(true); setMsg('');
    try {
      const result = await api.hr.salaryLedger.proposeRemove(confirmRemove.id);
      if (!result.success) throw new Error(result.error || 'Failed');
      setMsg('Removal request submitted for GM approval.');
      setConfirmRemove(null);
      load();
    } catch (e) { setMsg('Error: ' + e.message); }
    finally { setSaving(false); }
  };

  const active = employees.filter(e => e.status !== 'removed');
  const filtered = active.filter(e =>
    !search || e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.designation || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.dpc_town || '').toLowerCase().includes(search.toLowerCase())
  );
  const pendingCount = active.filter(e => e.pending_edit).length;

  const printLedger = () => {
    const win = window.open('', '_blank');
    const rows = filtered.map(e => `
      <tr>
        <td>${e.name}</td>
        <td>${e.designation || ''}</td>
        <td>${e.dpc_town || ''}</td>
        <td style="text-align:right">N$ ${Number(e.basic_salary||0).toFixed(2)}</td>
        <td style="text-align:right">N$ ${Number(e.overtime_amount||0).toFixed(2)}</td>
        <td style="text-align:right">N$ ${Number(e.ssc_deductions||0).toFixed(2)}</td>
        <td style="text-align:right">N$ ${Number(e.other_deductions||0).toFixed(2)}</td>
        <td style="text-align:right;font-weight:bold">N$ ${Number(e.total_salary||0).toFixed(2)}</td>
        <td>${e.notes || ''}</td>
      </tr>`).join('');
    win.document.write(`<html><head><title>Salary Ledger</title>
      <style>body{font-family:Arial;font-size:11px}table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #ccc;padding:4px 6px}th{background:#c41e3a;color:white}
      tfoot td{font-weight:bold;background:#f9f9f9}</style></head>
      <body>
        <h2 style="color:#c41e3a">DYNAPHARM INTERNATIONAL NAMIBIA</h2>
        <h3>EMPLOYEE SALARY LEDGER — ${new Date().toLocaleDateString('en-ZA', {year:'numeric',month:'long'})}</h3>
        <table><thead><tr>
          <th>Name</th><th>Designation</th><th>DPC/Town</th>
          <th>Basic Salary</th><th>Overtime</th><th>SSC</th><th>Other Ded.</th><th>Total Salary</th><th>Notes</th>
        </tr></thead><tbody>${rows}</tbody>
        <tfoot><tr>
          <td colspan="3">TOTAL (${filtered.length} employees)</td>
          <td style="text-align:right">N$ ${Number(totals.basic_salary||0).toFixed(2)}</td>
          <td style="text-align:right">N$ ${Number(totals.overtime_amount||0).toFixed(2)}</td>
          <td style="text-align:right">N$ ${Number(totals.ssc_deductions||0).toFixed(2)}</td>
          <td style="text-align:right">N$ ${Number(totals.other_deductions||0).toFixed(2)}</td>
          <td style="text-align:right">N$ ${Number(totals.total_salary||0).toFixed(2)}</td>
          <td></td>
        </tr></tfoot>
        </table>
      </body></html>`);
    win.print();
  };

  return (
    <div className="space-y-4">
      {msg && <Alert type={msg.startsWith('Error') ? 'error' : 'success'}>{msg}</Alert>}

      <Card className="bg-gradient-to-r from-slate-50 to-blue-50 border-slate-200">
        <CardBody>
          <div className="flex justify-between items-start flex-wrap gap-3">
            <div>
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <FileText size={16} /> Employee Salary Ledger — True Source
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                {canEdit
                  ? 'Finance, HR, and GM can edit. All edits require GM approval before taking effect.'
                  : 'Read-only view of the approved salary ledger.'}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="secondary" onClick={printLedger}><FileText size={14} /> Print Ledger</Button>
              {canEdit && <Button onClick={() => { setAddModal(true); setMsg(''); }}><Plus size={14} /> Add Employee</Button>}
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard title="Total Employees" value={totals.count || 0} color="blue" icon={<Users size={22} />} />
        <StatCard title="Total Salary" value={formatCurrency(totals.total_salary || 0)} color="red" icon={<DollarSign size={22} />} />
        <StatCard title="Total Basic" value={formatCurrency(totals.basic_salary || 0)} color="green" icon={<TrendingUp size={22} />} />
        <StatCard title="Total SSC" value={formatCurrency(totals.ssc_deductions || 0)} color="orange" icon={<DollarSign size={22} />} />
        <StatCard title="Pending Approval" value={pendingCount} color={pendingCount > 0 ? 'orange' : 'gray'} icon={<CheckCircle size={22} />} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex gap-3 items-center flex-wrap">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name, designation, or location…"
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 flex-1 min-w-[200px]" />
            <span className="text-xs text-gray-400">{filtered.length} employee{filtered.length !== 1 ? 's' : ''}</span>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          {loading ? <div className="p-8"><LoadingSpinner /></div> : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-800 text-white text-xs font-semibold">
                  <th className="p-2 text-left sticky left-0 bg-slate-800 z-10">Name</th>
                  <th className="p-2 text-left">Designation</th>
                  <th className="p-2 text-left">DPC / Town</th>
                  <th className="p-2 text-right">Basic (N$)</th>
                  <th className="p-2 text-center">OT?</th>
                  <th className="p-2 text-right">OT Amt (N$)</th>
                  <th className="p-2 text-right">SSC (N$)</th>
                  <th className="p-2 text-right">Other Ded.</th>
                  <th className="p-2 text-right">Total Salary</th>
                  <th className="p-2 text-left">Gender</th>
                  <th className="p-2 text-left">ID No.</th>
                  <th className="p-2 text-left">Contact</th>
                  <th className="p-2 text-left">Joined</th>
                  <th className="p-2 text-left">Notes</th>
                  <th className="p-2 text-center">Status</th>
                  {canEdit && <th className="p-2"></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, idx) => (
                  <tr key={e.id} className={`border-t border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${e.pending_edit ? 'bg-amber-50' : ''} ${e.total_salary === 0 ? 'opacity-60' : ''}`}>
                    <td className="p-2 font-semibold text-gray-900 sticky left-0 bg-inherit z-10 min-w-[180px]">{e.name}</td>
                    <td className="p-2 text-gray-600 min-w-[140px]">{e.designation || '—'}</td>
                    <td className="p-2 text-gray-500 whitespace-nowrap">{e.dpc_town || '—'}</td>
                    <td className="p-2 text-right font-mono">{formatCurrency(e.basic_salary || 0)}</td>
                    <td className="p-2 text-center">{e.has_overtime ? '✓' : '—'}</td>
                    <td className="p-2 text-right font-mono">{Number(e.overtime_amount) > 0 ? formatCurrency(e.overtime_amount) : '—'}</td>
                    <td className="p-2 text-right font-mono text-orange-700">{Number(e.ssc_deductions) > 0 ? formatCurrency(e.ssc_deductions) : '—'}</td>
                    <td className="p-2 text-right font-mono text-red-700">{Number(e.other_deductions) > 0 ? formatCurrency(e.other_deductions) : '—'}</td>
                    <td className="p-2 text-right font-bold text-primary">{formatCurrency(e.total_salary || 0)}</td>
                    <td className="p-2 text-gray-400 text-xs">{e.gender || '—'}</td>
                    <td className="p-2 font-mono text-gray-400 text-xs">{e.id_no || '—'}</td>
                    <td className="p-2 text-gray-500 text-xs whitespace-nowrap">{e.contact_no || '—'}</td>
                    <td className="p-2 text-gray-400 text-xs whitespace-nowrap">{e.date_joined || '—'}</td>
                    <td className="p-2 text-gray-500 text-xs max-w-[160px] truncate" title={e.notes}>{e.notes || '—'}</td>
                    <td className="p-2 text-center">
                      {e.pending_edit
                        ? <Badge variant="warning">Pending GM</Badge>
                        : e.total_salary === 0
                          ? <Badge variant="info">Maternity / Leave</Badge>
                          : <Badge variant="success">Active</Badge>}
                    </td>
                    {canEdit && (
                      <td className="p-2">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => openEdit(e)} disabled={!!e.pending_edit}
                            className="text-blue-600 hover:text-blue-800 disabled:opacity-30 cursor-pointer p-1" title="Edit">
                            <Edit2 size={12} />
                          </button>
                          <button onClick={() => { setConfirmRemove(e); setMsg(''); }} disabled={!!e.pending_edit}
                            className="text-red-500 hover:text-red-700 disabled:opacity-30 cursor-pointer p-1" title="Propose removal">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={canEdit ? 16 : 15} className="p-8 text-center text-gray-400">No employees found</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-800 text-white font-bold text-xs border-t-2 border-slate-600">
                  <td className="p-2" colSpan={3}>TOTALS — {totals.count || 0} Active Employees</td>
                  <td className="p-2 text-right">{formatCurrency(totals.basic_salary || 0)}</td>
                  <td className="p-2"></td>
                  <td className="p-2 text-right">{formatCurrency(totals.overtime_amount || 0)}</td>
                  <td className="p-2 text-right">{formatCurrency(totals.ssc_deductions || 0)}</td>
                  <td className="p-2 text-right">{formatCurrency(totals.other_deductions || 0)}</td>
                  <td className="p-2 text-right">{formatCurrency(totals.total_salary || 0)}</td>
                  <td colSpan={canEdit ? 7 : 6}></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </Card>

      {/* Edit Modal */}
      {editModal && (
        <Modal open={true} title={`Edit — ${editModal.name}`} onClose={() => setEditModal(null)}>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2">
            <Alert type="info">This edit will be sent to the GM for approval before it takes effect.</Alert>
            <div className="flex items-center gap-2 text-sm">
              <input type="checkbox" id="ot_chk" checked={!!editForm.has_overtime}
                onChange={e => setEditForm(p => ({ ...p, has_overtime: e.target.checked }))} />
              <label htmlFor="ot_chk" className="font-medium">Has Overtime</label>
            </div>
            {FIELDS.map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                <input type={f.type} value={editForm[f.key] ?? ''}
                  onChange={e => setEditForm(p => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            ))}
            <div className="flex gap-2 pt-2 sticky bottom-0 bg-white pb-1">
              <Button onClick={submitEdit} disabled={saving} variant="primary">
                {saving ? 'Submitting…' : 'Submit for GM Approval'}
              </Button>
              <Button variant="secondary" onClick={() => setEditModal(null)}>Cancel</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Modal */}
      {addModal && (
        <Modal open={true} title="Add New Employee to Salary Ledger" onClose={() => setAddModal(false)}>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2">
            <div className="flex items-center gap-2 text-sm">
              <input type="checkbox" id="add_ot_chk" checked={!!addForm.has_overtime}
                onChange={e => setAddForm(p => ({ ...p, has_overtime: e.target.checked }))} />
              <label htmlFor="add_ot_chk" className="font-medium">Has Overtime</label>
            </div>
            {FIELDS.map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                <input type={f.type} value={addForm[f.key] ?? ''}
                  onChange={e => setAddForm(p => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            ))}
            <div className="flex gap-2 pt-2 sticky bottom-0 bg-white pb-1">
              <Button onClick={submitAdd} disabled={saving} variant="primary">
                {saving ? 'Adding…' : 'Add Employee'}
              </Button>
              <Button variant="secondary" onClick={() => setAddModal(false)}>Cancel</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm Remove Modal */}
      {confirmRemove && (
        <Modal open={true} title="Propose Employee Removal" onClose={() => setConfirmRemove(null)}>
          <div className="space-y-4">
            <Alert type="warning">
              This will submit a request to <strong>remove {confirmRemove.name}</strong> from the salary ledger.
              The GM must approve before the record is removed.
            </Alert>
            <div className="flex gap-3">
              <Button onClick={submitRemove} disabled={saving} variant="danger">
                {saving ? 'Submitting…' : 'Submit Removal for GM Approval'}
              </Button>
              <Button variant="secondary" onClick={() => setConfirmRemove(null)}>Cancel</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

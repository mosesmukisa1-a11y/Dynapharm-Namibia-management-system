import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { Card, CardBody, CardHeader, Alert } from './ui';

const leaveTypeColor = (t) => ({ Annual: '#166534', Sick: '#9a3412', Emergency: '#7c2d12', Unpaid: '#374151', Maternity: '#7c3aed', Study: '#1e40af' }[t] || '#374151');

const statusStyle = (s) => {
  const map = {
    Pending: { bg: '#fffbeb', color: '#92400e', border: '#fcd34d' },
    pending: { bg: '#fffbeb', color: '#92400e', border: '#fcd34d' },
    Approved: { bg: '#f0fdf4', color: '#166534', border: '#86efac' },
    approved: { bg: '#f0fdf4', color: '#166534', border: '#86efac' },
    finance_reviewed: { bg: '#eff6ff', color: '#1e40af', border: '#93c5fd' },
    Rejected: { bg: '#fef2f2', color: '#991b1b', border: '#fca5a5' },
    rejected: { bg: '#fef2f2', color: '#991b1b', border: '#fca5a5' },
  };
  const c = map[s] || map.Pending;
  return <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.73rem', fontWeight: 700, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
    {s === 'finance_reviewed' ? '💼 Finance Reviewed' : (s || 'Pending')}
  </span>;
};

function LeaveModal({ open, onClose, onSubmit, submitting }) {
  const [form, setForm] = useState({ type: 'Annual', startDate: '', endDate: '', reason: '', urgent: false });
  if (!open) return null;
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 500, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 800 }}>📅 Submit Leave Request</span>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Leave Type *</label>
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: '0.9rem', outline: 'none' }}>
              {['Annual', 'Sick', 'Emergency', 'Unpaid', 'Maternity', 'Study'].map(t => <option key={t} value={t}>{t} Leave</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Start Date *</label>
              <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>End Date *</label>
              <input type="date" value={form.endDate} min={form.startDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Reason / Notes *</label>
            <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={3} placeholder="Please provide a reason…" style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: '0.87rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: '#dc2626' }}>
            <input type="checkbox" checked={form.urgent} onChange={e => setForm(f => ({ ...f, urgent: e.target.checked }))} />
            Mark as URGENT
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '11px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600 }}>Cancel</button>
            <button onClick={() => onSubmit(form)} disabled={submitting} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.65 : 1 }}>
              {submitting ? '⏳ Submitting…' : '📅 Submit Leave Request'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CashModal({ open, onClose, onSubmit, submitting }) {
  const [form, setForm] = useState({ amount: '', purpose: '', neededBy: '', urgent: false });
  if (!open) return null;
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ background: 'linear-gradient(135deg,#1e3a5f,#2980b9)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 800 }}>💵 Submit Cash Advance Request</span>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '8px 12px' }}>
            💡 <strong>CAS Flow:</strong> Your request goes to Finance for processing, then to the GM for final approval.
          </p>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Amount (N$) *</label>
            <input type="number" min="1" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="e.g. 500" style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Purpose / Reason *</label>
            <textarea value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} rows={3} placeholder="Explain what the cash advance is needed for…" style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: '0.87rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Needed By Date (optional)</label>
            <input type="date" value={form.neededBy} onChange={e => setForm(f => ({ ...f, neededBy: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: '#dc2626' }}>
            <input type="checkbox" checked={form.urgent} onChange={e => setForm(f => ({ ...f, urgent: e.target.checked }))} />
            Mark as URGENT
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '11px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600 }}>Cancel</button>
            <button onClick={() => onSubmit(form)} disabled={submitting} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#1e3a5f,#2980b9)', color: '#fff', fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.65 : 1 }}>
              {submitting ? '⏳ Submitting…' : '💵 Submit Cash Request'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inp = { width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box', background: '#fff' };
const lbl = { fontSize: '0.78rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.03em' };

function MyProfileTab({ accentColor }) {
  const [profile, setProfile] = useState(null);
  const [pendingSensitive, setPendingSensitive] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sensitiveSubmitting, setSensitiveSubmitting] = useState(false);

  const [contact, setContact] = useState({ phone: '', email: '', address: '', date_of_birth: '', gender: '', emergency_contact_name: '', emergency_contact_phone: '' });
  const [sensitive, setSensitive] = useState({ national_id: '', bank_name: '', bank_account_no: '' });
  const [showSensitive, setShowSensitive] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.staff.getProfile()
      .then(d => {
        if (d.profile) {
          setProfile(d.profile);
          setContact({
            phone: d.profile.phone || '',
            email: d.profile.email || '',
            address: d.profile.address || '',
            date_of_birth: d.profile.date_of_birth ? d.profile.date_of_birth.split('T')[0] : '',
            gender: d.profile.gender || '',
            emergency_contact_name: d.profile.emergency_contact_name || '',
            emergency_contact_phone: d.profile.emergency_contact_phone || '',
          });
          setSensitive({
            national_id: d.profile.national_id || '',
            bank_name: d.profile.bank_name || '',
            bank_account_no: d.profile.bank_account_no || '',
          });
        }
        setPendingSensitive(d.pendingSensitive || []);
      })
      .catch(() => setAlert({ type: 'error', message: 'Failed to load profile' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveContact = async () => {
    setSaving(true);
    setAlert(null);
    try {
      const d = await api.staff.updateContact(contact);
      if (d.profile) setProfile(d.profile);
      setAlert({ type: 'success', message: 'Contact information updated successfully.' });
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to save changes' });
    } finally { setSaving(false); }
  };

  const submitSensitive = async () => {
    const hasValues = Object.values(sensitive).some(v => v.trim());
    if (!hasValues) { setAlert({ type: 'error', message: 'Please fill in at least one field' }); return; }
    setSensitiveSubmitting(true);
    setAlert(null);
    try {
      await api.staff.requestSensitive(sensitive);
      setAlert({ type: 'success', message: 'Request submitted — HR will review and apply your update.' });
      setShowSensitive(false);
      setSensitive({ national_id: '', bank_name: '', bank_account_no: '' });
      load();
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to submit request' });
    } finally { setSensitiveSubmitting(false); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading profile…</div>;

  const row2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 };
  const fmtRole = (r) => (r || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {alert && (
        <div style={{ padding: '10px 16px', borderRadius: 10, fontSize: '0.87rem', fontWeight: 600,
          background: alert.type === 'success' ? '#f0fdf4' : '#fef2f2',
          color: alert.type === 'success' ? '#166534' : '#991b1b',
          border: `1px solid ${alert.type === 'success' ? '#86efac' : '#fca5a5'}` }}>
          {alert.message}
        </div>
      )}

      {/* Identity card */}
      {profile && (
        <div style={{ background: `linear-gradient(135deg,${accentColor}dd,${accentColor}99)`, borderRadius: 16, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', flexShrink: 0 }}>
            {(profile.full_name || 'U')[0].toUpperCase()}
          </div>
          <div>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem', lineHeight: 1.2 }}>{profile.full_name || profile.username}</div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', marginTop: 3 }}>{fmtRole(profile.role)}{profile.branch ? ` · ${profile.branch.replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase())}` : ''}</div>
            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.78rem', marginTop: 2 }}>@{profile.username}</div>
          </div>
        </div>
      )}

      {/* Contact & Personal Info */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.95rem' }}>📋 Contact & Personal Info</div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>Changes save immediately</div>
          </div>
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={row2}>
            <div>
              <label style={lbl}>Phone Number</label>
              <input style={inp} type="tel" value={contact.phone} onChange={e => setContact(c => ({ ...c, phone: e.target.value }))} placeholder="e.g. +264 81 123 4567" />
            </div>
            <div>
              <label style={lbl}>Email Address</label>
              <input style={inp} type="email" value={contact.email} onChange={e => setContact(c => ({ ...c, email: e.target.value }))} placeholder="your@email.com" />
            </div>
          </div>
          <div>
            <label style={lbl}>Home Address</label>
            <input style={inp} value={contact.address} onChange={e => setContact(c => ({ ...c, address: e.target.value }))} placeholder="Street, suburb, city" />
          </div>
          <div style={row2}>
            <div>
              <label style={lbl}>Date of Birth</label>
              <input style={inp} type="date" value={contact.date_of_birth} onChange={e => setContact(c => ({ ...c, date_of_birth: e.target.value }))} />
            </div>
            <div>
              <label style={lbl}>Gender</label>
              <select style={{ ...inp, cursor: 'pointer' }} value={contact.gender} onChange={e => setContact(c => ({ ...c, gender: e.target.value }))}>
                <option value="">— Select —</option>
                {['Male','Female','Non-binary','Prefer not to say'].map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>
          <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, color: '#374151', fontSize: '0.82rem', marginBottom: 10 }}>🚨 Emergency Contact</div>
            <div style={row2}>
              <div>
                <label style={lbl}>Contact Name</label>
                <input style={inp} value={contact.emergency_contact_name} onChange={e => setContact(c => ({ ...c, emergency_contact_name: e.target.value }))} placeholder="Full name" />
              </div>
              <div>
                <label style={lbl}>Contact Phone</label>
                <input style={inp} type="tel" value={contact.emergency_contact_phone} onChange={e => setContact(c => ({ ...c, emergency_contact_phone: e.target.value }))} placeholder="+264 81 …" />
              </div>
            </div>
          </div>
          <button onClick={saveContact} disabled={saving} style={{ alignSelf: 'flex-start', padding: '10px 28px', borderRadius: 10, border: 'none', background: accentColor, color: '#fff', fontWeight: 800, fontSize: '0.88rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.65 : 1 }}>
            {saving ? '⏳ Saving…' : '💾 Save Contact Info'}
          </button>
        </div>
      </div>

      {/* Sensitive / Payroll Info */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.95rem' }}>🔒 Sensitive Information</div>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>National ID & banking details · Changes require HR approval</div>
          </div>
          {pendingSensitive.length === 0 && (
            <button onClick={() => setShowSensitive(s => !s)} style={{ padding: '8px 18px', borderRadius: 20, border: `1.5px solid ${accentColor}`, background: showSensitive ? accentColor : '#fff', color: showSensitive ? '#fff' : accentColor, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
              {showSensitive ? '✕ Cancel' : '✏️ Request Update'}
            </button>
          )}
        </div>

        {/* Show current values (masked) */}
        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
          {[
            { label: 'National ID', value: profile?.national_id },
            { label: 'Bank Name', value: profile?.bank_name },
            { label: 'Account Number', value: profile?.bank_account_no },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
              <div style={{ fontWeight: 600, color: value ? '#1e293b' : '#cbd5e1', fontSize: '0.9rem' }}>
                {value ? (label === 'Account Number' ? '•••• ' + value.slice(-4) : value) : '— not set —'}
              </div>
            </div>
          ))}
        </div>

        {/* Pending requests banner */}
        {pendingSensitive.length > 0 && (
          <div style={{ margin: '0 20px 16px', padding: '12px 16px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: '1.1rem' }}>⏳</span>
            <div>
              <div style={{ fontWeight: 700, color: '#92400e', fontSize: '0.85rem' }}>Update request pending HR review</div>
              <div style={{ fontSize: '0.78rem', color: '#b45309', marginTop: 3 }}>
                Submitted {new Date(pendingSensitive[0].requested_at).toLocaleDateString('en-NA')} · Changes will be applied once HR approves
              </div>
            </div>
          </div>
        )}

        {/* Sensitive update form */}
        {showSensitive && pendingSensitive.length === 0 && (
          <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 9, fontSize: '0.8rem', color: '#1e40af' }}>
              ℹ️ These changes will be sent to HR for review before taking effect. Please only submit accurate information.
            </div>
            <div style={row2}>
              <div>
                <label style={lbl}>National ID Number</label>
                <input style={inp} value={sensitive.national_id} onChange={e => setSensitive(s => ({ ...s, national_id: e.target.value }))} placeholder="e.g. 00-123456-7-089-12" />
              </div>
              <div>
                <label style={lbl}>Bank Name</label>
                <input style={inp} value={sensitive.bank_name} onChange={e => setSensitive(s => ({ ...s, bank_name: e.target.value }))} placeholder="e.g. FNB Namibia" />
              </div>
            </div>
            <div>
              <label style={lbl}>Bank Account Number</label>
              <input style={inp} value={sensitive.bank_account_no} onChange={e => setSensitive(s => ({ ...s, bank_account_no: e.target.value }))} placeholder="Account number" />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowSensitive(false)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, cursor: 'pointer', fontSize: '0.87rem' }}>Cancel</button>
              <button onClick={submitSensitive} disabled={sensitiveSubmitting} style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none', background: '#1e3a5f', color: '#fff', fontWeight: 800, cursor: sensitiveSubmitting ? 'not-allowed' : 'pointer', opacity: sensitiveSubmitting ? 0.65 : 1, fontSize: '0.87rem' }}>
                {sensitiveSubmitting ? '⏳ Submitting…' : '📨 Submit for HR Approval'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function StaffServicesTab({ accentColor = '#c41e3a' }) {
  const [subTab, setSubTab] = useState('leave');
  const [alert, setAlert] = useState(null);

  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveLoading, setLeaveLoading] = useState(true);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);

  const [cashRequests, setCashRequests] = useState([]);
  const [cashLoading, setCashLoading] = useState(true);
  const [showCashForm, setShowCashForm] = useState(false);
  const [cashSubmitting, setCashSubmitting] = useState(false);

  useEffect(() => {
    api.get('/leave-requests').then(d => setLeaveRequests(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLeaveLoading(false));
    api.get('/cash-requests').then(d => setCashRequests(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setCashLoading(false));
  }, []);

  const refresh = () => {
    api.get('/leave-requests').then(d => setLeaveRequests(Array.isArray(d) ? d : [])).catch(() => {});
    api.get('/cash-requests').then(d => setCashRequests(Array.isArray(d) ? d : [])).catch(() => {});
  };

  const submitLeave = async (form) => {
    if (!form.startDate || !form.endDate || !form.reason.trim()) {
      setAlert({ type: 'error', message: 'Please fill in all required fields' }); return;
    }
    setLeaveSubmitting(true);
    try {
      await api.post('/leave-requests', form);
      setAlert({ type: 'success', message: 'Leave request submitted successfully' });
      setShowLeaveForm(false);
      api.get('/leave-requests').then(d => setLeaveRequests(Array.isArray(d) ? d : [])).catch(() => {});
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to submit leave request' });
    } finally { setLeaveSubmitting(false); }
  };

  const submitCash = async (form) => {
    if (!form.amount || Number(form.amount) <= 0 || !form.purpose.trim()) {
      setAlert({ type: 'error', message: 'Please enter a valid amount and purpose' }); return;
    }
    setCashSubmitting(true);
    try {
      await api.post('/cash-requests', form);
      setAlert({ type: 'success', message: 'Cash advance request submitted — awaiting Finance review then GM approval.' });
      setShowCashForm(false);
      api.get('/cash-requests').then(d => setCashRequests(Array.isArray(d) ? d : [])).catch(() => {});
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to submit cash request' });
    } finally { setCashSubmitting(false); }
  };

  const TABS = [
    { id: 'leave',   label: `📅 Leave (${leaveRequests.length})` },
    { id: 'cash',    label: `💵 Cash (${cashRequests.length})` },
    { id: 'profile', label: '👤 My Profile' },
  ];

  return (
    <div>
      <div className="rounded-xl p-5 mb-5 flex justify-between items-center flex-wrap gap-3" style={{ background: `linear-gradient(135deg,${accentColor},${accentColor}bb)`, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
        <div>
          <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1 m-0">Staff Services</p>
          <h3 className="text-white text-lg font-bold m-0">👤 Leave, CAS & My Profile</h3>
          <p className="text-white/70 text-sm mt-1 m-0">Manage your leave, cash advances and personal HR information</p>
        </div>
        {subTab === 'leave' && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { setShowLeaveForm(true); setAlert(null); }} className="px-4 py-2 rounded-full font-semibold text-sm cursor-pointer" style={{ background: '#fff', color: accentColor, border: 'none', fontWeight: 700 }}>📅 Request Leave</button>
            <button onClick={() => { setShowCashForm(true); setAlert(null); }} className="px-4 py-2 rounded-full font-semibold text-sm cursor-pointer text-white" style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.3)' }}>💵 Cash Advance</button>
          </div>
        )}
      </div>

      {alert && <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: alert.type === 'success' ? '#f0fdf4' : '#fef2f2', color: alert.type === 'success' ? '#166534' : '#991b1b', border: `1px solid ${alert.type === 'success' ? '#86efac' : '#fca5a5'}` }}>{alert.message}</div>}

      <div className="flex gap-2 mb-5" style={{ flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setSubTab(t.id); setAlert(null); }}
            style={{ padding: '8px 20px', borderRadius: 20, fontSize: '0.85rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: subTab === t.id ? accentColor : '#f1f5f9', color: subTab === t.id ? '#fff' : '#64748b', transition: 'all 0.2s' }}>
            {t.label}
          </button>
        ))}
        {subTab !== 'profile' && (
          <button onClick={refresh} style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: 20, fontSize: '0.8rem', fontWeight: 600, border: '1px solid #e2e8f0', cursor: 'pointer', background: '#fff', color: '#64748b' }}>🔄</button>
        )}
      </div>

      {subTab === 'leave' && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">My Leave Requests</h3></CardHeader>
          {leaveLoading ? <div className="p-8 text-center text-gray-400">Loading…</div> : leaveRequests.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <div className="text-4xl mb-3">📅</div>
              <p className="font-semibold text-gray-500">No leave requests yet</p>
              <p className="text-sm mt-1">Click "Request Leave" to submit your first request</p>
            </div>
          ) : (
            <div className="divide-y">
              {leaveRequests.map((r, i) => (
                <div key={r.id || i} style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 800, background: '#fff0f3', color: leaveTypeColor(r.type), border: '1px solid #fecaca' }}>{r.type || 'Annual'}</span>
                      {r.urgent && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}>URGENT</span>}
                      {statusStyle(r.status)}
                    </div>
                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem' }}>{r.startDate || r.start_date} → {r.endDate || r.end_date}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>{r.reason}</div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'right' }}>{r.submittedAt || r.created_at ? new Date(r.submittedAt || r.created_at).toLocaleDateString('en-NA') : '—'}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {subTab === 'cash' && (
        <Card>
          <CardHeader>
            <div>
              <h3 className="font-bold text-gray-800">My Cash Advance Requests</h3>
              <p className="text-xs text-gray-500 mt-0.5">Flow: You submit → Finance reviews → GM approves</p>
            </div>
          </CardHeader>
          {cashLoading ? <div className="p-8 text-center text-gray-400">Loading…</div> : cashRequests.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <div className="text-4xl mb-3">💵</div>
              <p className="font-semibold text-gray-500">No cash advance requests yet</p>
              <p className="text-sm mt-1">Click "Cash Advance" to submit a request</p>
            </div>
          ) : (
            <div className="divide-y">
              {cashRequests.map((r, i) => (
                <div key={r.id || i} style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, color: '#166534', fontSize: '0.95rem' }}>N$ {Number(r.amount || 0).toFixed(2)}</span>
                      {r.urgent && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}>URGENT</span>}
                      {statusStyle(r.status || r.Status)}
                    </div>
                    <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.88rem' }}>{r.purpose}</div>
                    {(r.neededBy || r.needed_by) && <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>Needed by: {r.neededBy || r.needed_by}</div>}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'right' }}>{r.submittedAt || r.created_at ? new Date(r.submittedAt || r.created_at).toLocaleDateString('en-NA') : '—'}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {subTab === 'profile' && <MyProfileTab accentColor={accentColor} />}

      <LeaveModal open={showLeaveForm} onClose={() => setShowLeaveForm(false)} onSubmit={submitLeave} submitting={leaveSubmitting} />
      <CashModal open={showCashForm} onClose={() => setShowCashForm(false)} onSubmit={submitCash} submitting={cashSubmitting} />
    </div>
  );
}

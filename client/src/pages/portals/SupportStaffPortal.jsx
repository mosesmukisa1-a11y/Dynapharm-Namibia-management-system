import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';
import StaffServicesTab from '../../components/StaffServicesTab';

const ACCENT = '#374151';

const statusStyle = (s) => {
  const map = {
    pending:  { bg: '#fffbeb', color: '#92400e', border: '#fcd34d', label: 'Pending' },
    approved: { bg: '#f0fdf4', color: '#166534', border: '#86efac', label: 'Approved' },
    rejected: { bg: '#fef2f2', color: '#991b1b', border: '#fca5a5', label: 'Rejected' },
  };
  const c = map[s] || map.pending;
  return (
    <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.73rem', fontWeight: 700,
      background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      {c.label}
    </span>
  );
};

function ExpenseModal({ open, onClose, onSubmit, submitting, department }) {
  const CATEGORIES = {
    Cleaning: ['Cleaning Supplies', 'Equipment Maintenance', 'Chemicals & Detergents', 'Protective Gear', 'Uniform', 'Other'],
    Security: ['Uniforms & Gear', 'Equipment Repair', 'Communication Tools', 'Transport', 'Training Materials', 'Other'],
    General: ['Supplies', 'Equipment', 'Transport', 'Meals', 'Stationery', 'Other'],
  };
  const cats = CATEGORIES[department] || CATEGORIES.General;
  const [form, setForm] = useState({ category: cats[0], amount: '', description: '', date: new Date().toISOString().slice(0, 10), receipt_ref: '' });
  useEffect(() => { setForm(f => ({ ...f, category: cats[0] })); }, [department]);

  if (!open) return null;
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 500, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ background: 'linear-gradient(135deg,#374151,#1f2937)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 800 }}>🧾 Record Department Expense</span>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Category *</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: '0.9rem', outline: 'none' }}>
                {cats.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Amount (N$) *</label>
              <input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="e.g. 250" style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Description *</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3}
              placeholder="Describe the expense (what was purchased/spent and why)…"
              style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: '0.87rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Date *</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Receipt / Ref No. (optional)</label>
              <input type="text" value={form.receipt_ref} onChange={e => setForm(f => ({ ...f, receipt_ref: e.target.value }))}
                placeholder="e.g. REC-0042"
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '11px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600 }}>Cancel</button>
            <button onClick={() => onSubmit(form)} disabled={submitting}
              style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#374151,#1f2937)', color: '#fff', fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.65 : 1 }}>
              {submitting ? '⏳ Submitting…' : '🧾 Submit Expense'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExpensesTab({ department }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);

  const load = () => {
    fetch('/api/dept-expenses', { credentials: 'include' })
      .then(r => r.json())
      .then(d => setExpenses(Array.isArray(d.expenses) ? d.expenses : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const submit = async (form) => {
    if (!form.amount || Number(form.amount) <= 0 || !form.description.trim()) {
      setAlert({ type: 'error', message: 'Please fill in all required fields with a valid amount.' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/dept-expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...form, department }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed');
      setAlert({ type: 'success', message: 'Expense submitted successfully — Finance will review shortly.' });
      setShowForm(false);
      load();
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to submit expense' });
    } finally {
      setSubmitting(false);
    }
  };

  const total = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const pending = expenses.filter(e => e.status === 'pending').reduce((s, e) => s + Number(e.amount || 0), 0);

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg,#374151,#1f2937)', borderRadius: 14, padding: '16px 20px', marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Department Expenses</p>
          <h3 style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 800, margin: '4px 0 0' }}>🧾 {department} Dept</h3>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.82rem', margin: '2px 0 0' }}>Total submitted: N$ {total.toLocaleString('en-NA', { minimumFractionDigits: 2 })} · Pending: N$ {pending.toLocaleString('en-NA', { minimumFractionDigits: 2 })}</p>
        </div>
        <button onClick={() => { setShowForm(true); setAlert(null); }}
          style={{ padding: '9px 18px', borderRadius: 30, fontWeight: 700, fontSize: '0.88rem', background: '#fff', color: '#374151', border: 'none', cursor: 'pointer' }}>
          + Record Expense
        </button>
      </div>

      {alert && <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 10, fontSize: '0.87rem',
        background: alert.type === 'success' ? '#f0fdf4' : '#fef2f2',
        color: alert.type === 'success' ? '#166534' : '#991b1b',
        border: `1px solid ${alert.type === 'success' ? '#86efac' : '#fca5a5'}` }}>{alert.message}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
      ) : expenses.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>🧾</div>
          <p style={{ fontWeight: 600, color: '#64748b' }}>No expenses recorded yet</p>
          <p style={{ fontSize: '0.85rem', marginTop: 4 }}>Click "Record Expense" to log a department expense</p>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {expenses.map((e, i) => (
            <div key={e.id || i} style={{ padding: '14px 18px', borderBottom: i < expenses.length - 1 ? '1px solid #f1f5f9' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ background: '#f1f5f9', color: '#374151', padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700 }}>{e.category}</span>
                  {statusStyle(e.status)}
                </div>
                <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem' }}>N$ {Number(e.amount).toLocaleString('en-NA', { minimumFractionDigits: 2 })}</div>
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 2 }}>{e.description}</div>
                {e.receipt_ref && <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>Ref: {e.receipt_ref}</div>}
                {e.notes && <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: 4, fontStyle: 'italic' }}>Note: {e.notes}</div>}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'right' }}>
                <div>{new Date(e.date).toLocaleDateString('en-NA')}</div>
                {e.reviewed_by && <div style={{ marginTop: 2 }}>by {e.reviewed_by}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <ExpenseModal open={showForm} onClose={() => setShowForm(false)} onSubmit={submit} submitting={submitting} department={department} />
    </div>
  );
}

const DEPT_BY_POSITION = {
  'cleaner': 'Cleaning',
  'cleaning supervisor': 'Cleaning',
  'security guard': 'Security',
  'security officer': 'Security',
  'security supervisor': 'Security',
};

export default function SupportStaffPortal() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('leave');

  const posKey = (user?.position || '').toLowerCase();
  const department = DEPT_BY_POSITION[posKey] || (posKey.includes('security') ? 'Security' : posKey.includes('clean') ? 'Cleaning' : 'General');

  const TABS = [
    { id: 'leave', label: '📅 Leave & Cash' },
    { id: 'expenses', label: '🧾 Dept Expenses' },
  ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px' }}>
      <div style={{ background: 'linear-gradient(135deg,#374151,#1f2937)', borderRadius: 20, padding: '20px 24px', marginBottom: 24 }}>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>Staff Portal</p>
        <h1 style={{ color: '#fff', fontSize: '1.4rem', fontWeight: 900, margin: '6px 0 4px' }}>
          Welcome, {user?.full_name || user?.username}
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.9rem', margin: 0 }}>
          {user?.position || 'Support Staff'} · {user?.branch || 'Dynapharm'}
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ padding: '9px 20px', borderRadius: 24, fontSize: '0.88rem', fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.2s',
              background: activeTab === t.id ? '#374151' : '#f1f5f9',
              color: activeTab === t.id ? '#fff' : '#64748b' }}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'leave' && <StaffServicesTab accentColor="#374151" />}
      {activeTab === 'expenses' && <ExpensesTab department={department} />}
    </div>
  );
}

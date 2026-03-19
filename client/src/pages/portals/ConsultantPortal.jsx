import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatDateTime, formatDate, BRANCHES, COMPANY_INFO } from '../../lib/constants';
import { PRICE_LIST } from '../../lib/pricing';
import { Button, Input, Badge, LoadingSpinner, Modal, Alert, Textarea } from '../../components/ui';
import { FileText, Plus, Trash2 } from 'lucide-react';

export default function ConsultantPortal() {
  const [activeSection, setActiveSection] = useState('checkups');
  const navItems = [
    { id: 'checkups', label: 'Checkup Forms' },
    { id: 'clients', label: 'Clients' },
    { id: 'reports', label: 'Reports' },
    { id: 'followups', label: 'Follow-ups' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'staff', label: 'Staff Services' },
  ];

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #c41e3a 0%, #a01830 100%)', borderRadius: '16px', padding: '28px 32px', marginBottom: '28px', color: '#fff', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
        <img src={COMPANY_INFO.logo} alt="Dynapharm" style={{ height: '52px', background: '#fff', borderRadius: '10px', padding: '6px' }} onError={e => { e.target.style.display = 'none'; }} />
        <div style={{ flex: 1, minWidth: '200px' }}>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Consultant Portal</h2>
          <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: '0.95rem' }}>Client management, checkup forms & reports</p>
        </div>
        <button style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '8px', padding: '8px 18px', fontSize: '0.9rem', cursor: 'pointer' }}>Refresh Data</button>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px', borderBottom: '2px solid #e5e7eb', paddingBottom: 0 }}>
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => setActiveSection(item.id)}
            style={{
              padding: '10px 20px',
              fontSize: '0.95rem',
              fontWeight: 600,
              border: 'none',
              background: 'none',
              color: activeSection === item.id ? '#c41e3a' : '#64748b',
              borderBottom: activeSection === item.id ? '3px solid #c41e3a' : '3px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div>
        {activeSection === 'checkups' && <CheckupsSection />}
        {activeSection === 'clients' && <ClientsSection />}
        {activeSection === 'reports' && <ReportsSection />}
        {activeSection === 'followups' && <FollowupsSection />}
        {activeSection === 'analytics' && <AnalyticsSection />}
        {activeSection === 'staff' && <StaffServicesSection />}
      </div>
    </div>
  );
}

function CheckupsSection() {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('upcoming');
  const [showReport, setShowReport] = useState(false);
  const [selectedCheckup, setSelectedCheckup] = useState(null);
  const [reportForm, setReportForm] = useState({ diagnosis: '', recommendations: '', follow_up_date: '', prescriptions: [] });
  const [prescriptionProduct, setPrescriptionProduct] = useState('');
  const [prescriptionQty, setPrescriptionQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const loadCheckups = () => {
    setLoading(true);
    api.appointments.list('type=Check')
      .then(data => setAppointments(Array.isArray(data) ? data : data.appointments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadCheckups(); }, []);

  const addPrescription = () => {
    if (!prescriptionProduct) return;
    setReportForm(f => ({
      ...f,
      prescriptions: [...f.prescriptions, { product: prescriptionProduct, quantity: prescriptionQty }],
    }));
    setPrescriptionProduct('');
    setPrescriptionQty(1);
  };

  const removePrescription = (idx) => {
    setReportForm(f => ({
      ...f,
      prescriptions: f.prescriptions.filter((_, i) => i !== idx),
    }));
  };

  const handleCreateReport = async (e) => {
    e.preventDefault();
    if (!reportForm.diagnosis) { setError('Diagnosis is required'); return; }
    setSubmitting(true);
    setError('');
    try {
      await api.reports.create({
        client_name: selectedCheckup.full_name,
        appointment_id: selectedCheckup.id,
        diagnosis: reportForm.diagnosis,
        prescriptions: reportForm.prescriptions,
        recommendations: reportForm.recommendations,
        follow_up_date: reportForm.follow_up_date,
      });
      setShowReport(false);
      setReportForm({ diagnosis: '', recommendations: '', follow_up_date: '', prescriptions: [] });
      setSelectedCheckup(null);
    } catch (err) {
      setError(err.message || 'Failed to create report');
    }
    setSubmitting(false);
  };

  const filtered = appointments.filter(a => filter === 'upcoming' ? a.status !== 'completed' : a.status === 'completed');

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b' }}>Checkup Forms</h3>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.85rem' }}>Forms submitted by clients to your branch</p>
        </div>
        <button onClick={loadCheckups} style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 16px', fontSize: '0.85rem', cursor: 'pointer' }}>Refresh</button>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
        <button
          onClick={() => setFilter('upcoming')}
          style={{ padding: '8px 20px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: filter === 'upcoming' ? '#c41e3a' : '#f1f5f9', color: filter === 'upcoming' ? '#fff' : '#64748b', transition: 'all 0.2s' }}
        >Upcoming</button>
        <button
          onClick={() => setFilter('completed')}
          style={{ padding: '8px 20px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: filter === 'completed' ? '#c41e3a' : '#f1f5f9', color: filter === 'completed' ? '#fff' : '#64748b', transition: 'all 0.2s' }}
        >Completed</button>
      </div>

      {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#94a3b8', padding: '24px 0' }}>No {filter} checkup forms found.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(apt => (
            <div key={apt.id} style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#1e293b', fontWeight: 600 }}>{apt.full_name}</h4>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748b' }}>{formatDateTime(apt.date || apt.created_at)}</p>
                {apt.branch && <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>{apt.branch}</p>}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Badge variant={apt.status === 'completed' ? 'success' : 'warning'}>{apt.status || 'Pending'}</Badge>
                <Button size="sm" onClick={() => { setSelectedCheckup(apt); setShowReport(true); }}>
                  <FileText size={14} /> Create Report
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showReport} onClose={() => setShowReport(false)} title={`Create Report - ${selectedCheckup?.full_name || ''}`} size="lg">
        <form onSubmit={handleCreateReport} className="p-6 space-y-4">
          {error && <Alert type="error">{error}</Alert>}
          <Textarea label="Diagnosis" value={reportForm.diagnosis} onChange={e => setReportForm(f => ({ ...f, diagnosis: e.target.value }))} required />
          <Textarea label="Recommendations" value={reportForm.recommendations} onChange={e => setReportForm(f => ({ ...f, recommendations: e.target.value }))} />
          <Input label="Follow-up Date" type="date" value={reportForm.follow_up_date} onChange={e => setReportForm(f => ({ ...f, follow_up_date: e.target.value }))} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Prescriptions</label>
            <div className="flex gap-2 mb-2">
              <select className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm" value={prescriptionProduct} onChange={e => setPrescriptionProduct(e.target.value)}>
                <option value="">Select product...</option>
                {PRICE_LIST.map((p, i) => <option key={i} value={p.description}>{p.description}</option>)}
              </select>
              <input type="number" min="1" value={prescriptionQty} onChange={e => setPrescriptionQty(Number(e.target.value))} className="w-20 px-3 py-2 rounded-lg border border-gray-300 text-sm" />
              <Button type="button" variant="secondary" onClick={addPrescription}><Plus size={14} /> Add</Button>
            </div>
            {reportForm.prescriptions.length > 0 && (
              <div className="space-y-1">
                {reportForm.prescriptions.map((p, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded text-sm">
                    <span>{p.product} x {p.quantity}</span>
                    <button type="button" onClick={() => removePrescription(i)} className="text-red-500 hover:text-red-700 cursor-pointer"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setShowReport(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create Report'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function ClientsSection() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');

  useEffect(() => {
    api.clients.list()
      .then(data => setClients(Array.isArray(data) ? data : data.clients || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const searchClients = () => {};
  const showAllClients = () => { setSearch(''); setBranchFilter(''); };

  const filtered = clients.filter(c => {
    if (search) {
      const q = search.toLowerCase();
      const match = (c.full_name || c.name || '').toLowerCase().includes(q)
        || (c.phone || '').includes(q)
        || (c.reference || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (branchFilter && (c.branch || '') !== branchFilter) return false;
    return true;
  });

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: '1.15rem', color: '#1e293b' }}>Client Search</h3>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <input
          type="text"
          placeholder="Search by name, phone, or reference..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: '200px', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem' }}
        />
        <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} style={{ padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem' }}>
          <option value="">All Branches</option>
          {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <button onClick={searchClients} style={{ background: '#c41e3a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer', fontWeight: 600 }}>Search</button>
        <button onClick={showAllClients} style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>Show All</button>
      </div>
      {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#94a3b8', padding: '24px 0' }}>No clients found.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <div key={c.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>{c.full_name || c.name}</span>
                {c.phone && <span style={{ color: '#64748b', fontSize: '0.85rem', marginLeft: '12px' }}>{c.phone}</span>}
              </div>
              {c.branch && <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{c.branch}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportsSection() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);

  const loadReports = () => {
    setLoading(true);
    api.reports.list()
      .then(data => setReports(Array.isArray(data) ? data : data.reports || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadReports(); }, []);

  const filtered = reports.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (r.client_name || '').toLowerCase().includes(q) || (r.id || '').toString().includes(q);
  });

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: '1.15rem', color: '#1e293b' }}>My Created Reports</h3>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <input
          type="text"
          placeholder="Search by client name or report ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: '200px', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem' }}
        />
        <button style={{ background: '#c41e3a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer', fontWeight: 600 }}>Search</button>
        <button onClick={() => setSearch('')} style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>Show All</button>
        <button onClick={loadReports} style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>Refresh</button>
      </div>
      {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#94a3b8', padding: '24px 0' }}>No reports found.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <div key={r.id} onClick={() => setSelectedReport(r)} style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 18px', cursor: 'pointer', transition: 'box-shadow 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between' }}>
                <div>
                  <h4 style={{ margin: 0, fontWeight: 600, color: '#1e293b', fontSize: '0.95rem' }}>{r.client_name || r.title || 'Report'}</h4>
                  <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748b' }}>{formatDateTime(r.created_at)}</p>
                  {r.diagnosis && <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: '#475569' }}>{r.diagnosis}</p>}
                </div>
                {r.follow_up_date && <Badge variant="info">Follow-up: {formatDate(r.follow_up_date)}</Badge>}
              </div>
              {r.prescriptions && Array.isArray(r.prescriptions) && r.prescriptions.length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {r.prescriptions.map((p, i) => (
                    <span key={i} style={{ display: 'inline-block', padding: '2px 10px', background: '#f1f5f9', borderRadius: '12px', fontSize: '0.8rem', color: '#475569' }}>
                      {typeof p === 'string' ? p : `${p.product} x${p.quantity}`}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={!!selectedReport} onClose={() => setSelectedReport(null)} title="Report Details" size="lg">
        {selectedReport && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-500">Client</label>
                <p className="text-sm font-semibold">{selectedReport.client_name || 'N/A'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Date</label>
                <p className="text-sm">{formatDateTime(selectedReport.created_at)}</p>
              </div>
            </div>
            {selectedReport.diagnosis && (
              <div>
                <label className="text-xs font-medium text-gray-500">Diagnosis</label>
                <p className="text-sm mt-1">{selectedReport.diagnosis}</p>
              </div>
            )}
            {selectedReport.recommendations && (
              <div>
                <label className="text-xs font-medium text-gray-500">Recommendations</label>
                <p className="text-sm mt-1">{selectedReport.recommendations}</p>
              </div>
            )}
            {selectedReport.prescriptions && Array.isArray(selectedReport.prescriptions) && selectedReport.prescriptions.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-500">Prescriptions</label>
                <div className="mt-1 space-y-1">
                  {selectedReport.prescriptions.map((p, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded text-sm">
                      <span>{typeof p === 'string' ? p : p.product}</span>
                      {typeof p === 'object' && <span className="text-gray-500">Qty: {p.quantity}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {selectedReport.follow_up_date && (
              <div>
                <label className="text-xs font-medium text-gray-500">Follow-up Date</label>
                <p className="text-sm mt-1">{formatDate(selectedReport.follow_up_date)}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function FollowupsSection() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('');

  const loadFollowups = () => {
    setLoading(true);
    api.reports.list()
      .then(data => {
        const all = Array.isArray(data) ? data : data.reports || [];
        setReports(all.filter(r => r.follow_up_date));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadFollowups(); }, []);

  const handleAction = (id, action) => {
    if (action === 'complete') {
      setReports(prev => prev.filter(r => r.id !== id));
    }
  };

  const filtered = dateFilter ? reports.filter(r => (r.follow_up_date || '').slice(0, 10) === dateFilter) : reports;

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: '1.15rem', color: '#1e293b' }}>Upcoming Follow-ups</h3>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem' }} />
        <button onClick={() => setDateFilter('')} style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>Show All</button>
        <button onClick={loadFollowups} style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>Refresh</button>
      </div>
      {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#94a3b8', padding: '24px 0' }}>No follow-ups found.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const today = new Date().toISOString().slice(0, 10);
            const isOverdue = r.follow_up_date < today;
            return (
              <div key={r.id} style={{ border: `1px solid ${isOverdue ? '#fecaca' : '#e5e7eb'}`, borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                  <h4 style={{ margin: 0, fontWeight: 600, color: '#1e293b', fontSize: '0.95rem' }}>{r.client_name || 'Patient'}</h4>
                  <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: isOverdue ? '#dc2626' : '#64748b' }}>
                    {isOverdue ? 'Was due: ' : 'Due: '}{formatDate(r.follow_up_date)}
                  </p>
                  {r.diagnosis && <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>{r.diagnosis}</p>}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button size="sm" variant="success" onClick={() => handleAction(r.id, 'complete')}>Complete</Button>
                  <Button size="sm" variant="secondary">Reschedule</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AnalyticsSection() {
  const [reports, setReports] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('month');

  const loadAnalytics = () => {
    setLoading(true);
    Promise.all([
      api.reports.list().then(d => Array.isArray(d) ? d : d.reports || []).catch(() => []),
      api.appointments.list().then(d => Array.isArray(d) ? d : d.appointments || []).catch(() => []),
    ]).then(([r, a]) => {
      setReports(r);
      setAppointments(a);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadAnalytics(); }, []);

  const totalConsultations = appointments.length;
  const completedConsultations = appointments.filter(a => a.status === 'completed').length;
  const totalReports = reports.length;
  const withFollowUp = reports.filter(r => r.follow_up_date).length;

  const diagnosisCounts = {};
  reports.forEach(r => {
    if (r.diagnosis) {
      const key = r.diagnosis.slice(0, 50);
      diagnosisCounts[key] = (diagnosisCounts[key] || 0) + 1;
    }
  });
  const topDiagnoses = Object.entries(diagnosisCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: '1.15rem', color: '#1e293b' }}>Performance Analytics</h3>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' }}>
        <select value={timeframe} onChange={e => setTimeframe(e.target.value)} style={{ padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem' }}>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="all">All Time</option>
        </select>
        <button onClick={loadAnalytics} style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>Refresh</button>
        <button style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>Print Report</button>
      </div>
      {loading ? <LoadingSpinner /> : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {[
              { label: 'Total Consultations', value: totalConsultations, color: '#c41e3a' },
              { label: 'Completed', value: completedConsultations, color: '#16a34a' },
              { label: 'Reports Created', value: totalReports, color: '#2563eb' },
              { label: 'Pending Follow-ups', value: withFollowUp, color: '#ea580c' },
            ].map((stat, i) => (
              <div key={i} style={{ textAlign: 'center', padding: '16px', border: '1px solid #e5e7eb', borderRadius: '10px' }}>
                <p style={{ fontSize: '1.8rem', fontWeight: 700, color: stat.color, margin: 0 }}>{stat.value}</p>
                <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '4px 0 0' }}>{stat.label}</p>
              </div>
            ))}
          </div>
          {topDiagnoses.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#1e293b' }}>Common Diagnoses</h4>
              <div className="space-y-2">
                {topDiagnoses.map(([diagnosis, count], i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f8fafc', borderRadius: '8px' }}>
                    <span style={{ fontSize: '0.9rem', color: '#374151' }}>{diagnosis}</span>
                    <Badge variant="primary">{count}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StaffServicesSection() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div style={{ width: '40px', height: '40px', background: '#f0fdf4', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>📅</div>
          <div>
            <h4 style={{ margin: 0, color: '#1e293b', fontSize: '1rem' }}>Leave Management</h4>
            <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: '0.8rem' }}>Book time off and check approval status</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer', fontWeight: 500 }}>Request Leave</button>
          <button style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>My Requests</button>
        </div>
      </div>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div style={{ width: '40px', height: '40px', background: '#eff6ff', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>💵</div>
          <div>
            <h4 style={{ margin: 0, color: '#1e293b', fontSize: '1rem' }}>Cash Support</h4>
            <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: '0.8rem' }}>Request petty cash or reimbursements</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer', fontWeight: 500 }}>Request Cash</button>
          <button style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>My Requests</button>
        </div>
      </div>
    </div>
  );
}

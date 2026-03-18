import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { formatDateTime, formatDate } from '../../lib/constants';
import { PRICE_LIST } from '../../lib/pricing';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, Table, Modal, Alert, Select, Textarea } from '../../components/ui';
import { Stethoscope, Users, FileText, Bell, BarChart3, ClipboardList, Plus, Trash2 } from 'lucide-react';

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
  const [showReport, setShowReport] = useState(false);
  const [selectedCheckup, setSelectedCheckup] = useState(null);
  const [reportForm, setReportForm] = useState({ diagnosis: '', recommendations: '', follow_up_date: '', prescriptions: [] });
  const [prescriptionProduct, setPrescriptionProduct] = useState('');
  const [prescriptionQty, setPrescriptionQty] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.appointments.list('type=checkup')
      .then(data => setAppointments(Array.isArray(data) ? data : data.appointments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
    if (!reportForm.diagnosis) {
      setError('Diagnosis is required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.reports.create({
        client_name: selectedCheckup.patient_name,
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
                  <div className="flex gap-2 items-center">
                    <Badge variant={apt.status === 'completed' ? 'success' : 'warning'}>{apt.status || 'Pending'}</Badge>
                    <Button size="sm" onClick={() => { setSelectedCheckup(apt); setShowReport(true); }}>
                      <FileText size={14} /> Create Report
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal open={showReport} onClose={() => setShowReport(false)} title={`Create Report - ${selectedCheckup?.patient_name || ''}`} size="lg">
        <form onSubmit={handleCreateReport} className="p-6 space-y-4">
          {error && <Alert type="error">{error}</Alert>}
          <Textarea label="Diagnosis" value={reportForm.diagnosis} onChange={e => setReportForm(f => ({ ...f, diagnosis: e.target.value }))} required />
          <Textarea label="Recommendations" value={reportForm.recommendations} onChange={e => setReportForm(f => ({ ...f, recommendations: e.target.value }))} />
          <Input label="Follow-up Date" type="date" value={reportForm.follow_up_date} onChange={e => setReportForm(f => ({ ...f, follow_up_date: e.target.value }))} />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Prescriptions</label>
            <div className="flex gap-2 mb-2">
              <select
                className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm"
                value={prescriptionProduct}
                onChange={e => setPrescriptionProduct(e.target.value)}
              >
                <option value="">Select product...</option>
                {PRICE_LIST.map((p, i) => (
                  <option key={i} value={p.description}>{p.description}</option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={prescriptionQty}
                onChange={e => setPrescriptionQty(Number(e.target.value))}
                className="w-20 px-3 py-2 rounded-lg border border-gray-300 text-sm"
              />
              <Button type="button" variant="secondary" onClick={addPrescription}><Plus size={14} /> Add</Button>
            </div>
            {reportForm.prescriptions.length > 0 && (
              <div className="space-y-1">
                {reportForm.prescriptions.map((p, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded text-sm">
                    <span>{p.product} x {p.quantity}</span>
                    <button type="button" onClick={() => removePrescription(i)} className="text-red-500 hover:text-red-700 cursor-pointer">
                      <Trash2 size={14} />
                    </button>
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
  const [selectedReport, setSelectedReport] = useState(null);

  useEffect(() => {
    api.reports.list()
      .then(data => setReports(Array.isArray(data) ? data : data.reports || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {reports.length === 0 ? (
        <EmptyState icon={<FileText size={48} />} title="No Reports" description="Create reports from checkup forms." />
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <Card key={r.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSelectedReport(r)}>
              <CardBody>
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-gray-800">{r.client_name || r.title || 'Report'}</h4>
                    <p className="text-xs text-gray-500 mt-1">{formatDateTime(r.created_at)}</p>
                    {r.diagnosis && <p className="text-sm text-gray-600 mt-2">{r.diagnosis}</p>}
                  </div>
                  {r.follow_up_date && (
                    <Badge variant="info">Follow-up: {formatDate(r.follow_up_date)}</Badge>
                  )}
                </div>
                {r.prescriptions && Array.isArray(r.prescriptions) && r.prescriptions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {r.prescriptions.map((p, i) => (
                      <Badge key={i} variant="default">{typeof p === 'string' ? p : `${p.product} x${p.quantity}`}</Badge>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
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

function FollowupsTab() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.reports.list()
      .then(data => {
        const all = Array.isArray(data) ? data : data.reports || [];
        setReports(all.filter(r => r.follow_up_date));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAction = (id, action) => {
    if (action === 'complete') {
      setReports(prev => prev.filter(r => r.id !== id));
    }
  };

  if (loading) return <LoadingSpinner />;

  if (reports.length === 0) {
    return <EmptyState icon={<Bell size={48} />} title="No Follow-ups" description="No upcoming follow-ups scheduled." />;
  }

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = reports.filter(r => r.follow_up_date >= today);
  const past = reports.filter(r => r.follow_up_date < today);

  return (
    <div className="space-y-6">
      {upcoming.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-800 mb-3">Upcoming Follow-ups</h3>
          <div className="space-y-2">
            {upcoming.map(r => (
              <Card key={r.id}>
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-gray-800">{r.client_name || 'Patient'}</h4>
                      <p className="text-xs text-gray-500">Due: {formatDate(r.follow_up_date)}</p>
                      {r.diagnosis && <p className="text-xs text-gray-400 mt-1">{r.diagnosis}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="success" onClick={() => handleAction(r.id, 'complete')}>Complete</Button>
                      <Button size="sm" variant="secondary">Reschedule</Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}
      {past.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-800 mb-3">Overdue Follow-ups</h3>
          <div className="space-y-2">
            {past.map(r => (
              <Card key={r.id} className="border-red-200">
                <CardBody>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-gray-800">{r.client_name || 'Patient'}</h4>
                      <p className="text-xs text-red-500">Was due: {formatDate(r.follow_up_date)}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="success" onClick={() => handleAction(r.id, 'complete')}>Complete</Button>
                      <Button size="sm" variant="secondary">Reschedule</Button>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AnalyticsTab() {
  const [reports, setReports] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.reports.list().then(d => Array.isArray(d) ? d : d.reports || []).catch(() => []),
      api.appointments.list().then(d => Array.isArray(d) ? d : d.appointments || []).catch(() => []),
    ]).then(([r, a]) => {
      setReports(r);
      setAppointments(a);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

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
  const topDiagnoses = Object.entries(diagnosisCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-primary">{totalConsultations}</p>
            <p className="text-xs text-gray-500">Total Consultations</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-green-600">{completedConsultations}</p>
            <p className="text-xs text-gray-500">Completed</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-blue-600">{totalReports}</p>
            <p className="text-xs text-gray-500">Reports Created</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="text-2xl font-bold text-orange-600">{withFollowUp}</p>
            <p className="text-xs text-gray-500">Pending Follow-ups</p>
          </CardBody>
        </Card>
      </div>

      {topDiagnoses.length > 0 && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Common Diagnoses</h3></CardHeader>
          <CardBody>
            <div className="space-y-2">
              {topDiagnoses.map(([diagnosis, count], i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{diagnosis}</span>
                  <Badge variant="primary">{count}</Badge>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function StaffTab() {
  const [form, setForm] = useState({ leave_type: 'Annual', start_date: '', end_date: '', reason: '' });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitted(true);
    setForm({ leave_type: 'Annual', start_date: '', end_date: '', reason: '' });
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <Card>
      <CardHeader><h3 className="font-bold text-gray-800">Leave Request</h3></CardHeader>
      <CardBody>
        {submitted && <Alert type="success" className="mb-4">Leave request submitted successfully!</Alert>}
        <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
          <Select
            label="Leave Type"
            value={form.leave_type}
            onChange={e => setForm(f => ({ ...f, leave_type: e.target.value }))}
            options={[
              { value: 'Annual', label: 'Annual Leave' },
              { value: 'Sick', label: 'Sick Leave' },
              { value: 'Personal', label: 'Personal Leave' },
            ]}
          />
          <div />
          <Input label="Start Date" type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} required />
          <Input label="End Date" type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} required />
          <div className="md:col-span-2">
            <Textarea label="Reason" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} required />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit">Submit Leave Request</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

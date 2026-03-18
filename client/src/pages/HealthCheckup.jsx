import { useState } from 'react';
import { api } from '../lib/api';
import { Card, CardHeader, CardBody, Button, Input, Alert, Modal } from '../components/ui';
import { Heart, User, Phone, Calendar, CheckCircle } from 'lucide-react';

const BODY_SYSTEMS = [
  { id: 'cardiovascular', label: 'Cardiovascular System', questions: ['Blood pressure issues', 'Heart palpitations', 'Chest pain', 'Shortness of breath'] },
  { id: 'respiratory', label: 'Respiratory System', questions: ['Chronic cough', 'Difficulty breathing', 'Asthma/allergies', 'Frequent colds'] },
  { id: 'digestive', label: 'Digestive System', questions: ['Stomach pain', 'Bloating/gas', 'Constipation/diarrhea', 'Poor appetite'] },
  { id: 'musculoskeletal', label: 'Musculoskeletal System', questions: ['Joint pain', 'Back pain', 'Muscle weakness', 'Limited mobility'] },
  { id: 'nervous', label: 'Nervous System', questions: ['Headaches/migraines', 'Dizziness', 'Numbness/tingling', 'Sleep problems'] },
  { id: 'endocrine', label: 'Endocrine System', questions: ['Diabetes', 'Thyroid issues', 'Weight changes', 'Fatigue'] },
  { id: 'immune', label: 'Immune System', questions: ['Frequent infections', 'Slow healing', 'Allergic reactions', 'Autoimmune conditions'] },
  { id: 'urinary', label: 'Urinary System', questions: ['Frequent urination', 'Pain during urination', 'Kidney problems', 'Incontinence'] },
];

export default function HealthCheckup() {
  const [form, setForm] = useState({
    fullName: '', phone: '', email: '', dob: '', gender: '', branch: 'Windhoek CBD',
    symptoms: {}, notes: '', declaration: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const updateField = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const toggleSymptom = (system, symptom) => {
    setForm(prev => {
      const current = prev.symptoms[system] || [];
      const updated = current.includes(symptom)
        ? current.filter(s => s !== symptom)
        : [...current, symptom];
      return { ...prev, symptoms: { ...prev.symptoms, [system]: updated } };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.declaration) { setError('Please accept the declaration'); return; }
    setError('');
    setLoading(true);
    try {
      const now = new Date();
      await api.appointments.create({
        type: 'checkup',
        full_name: form.fullName,
        phone: form.phone,
        email: form.email,
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().slice(0, 5),
        gender: form.gender,
        branch: form.branch,
        notes: form.notes,
        symptoms: form.symptoms,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Failed to submit');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto py-16 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle size={40} className="text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-3">Checkup Submitted!</h2>
        <p className="text-gray-500 mb-6">Your full body checkup form has been received. A consultant will review your submission shortly.</p>
        <Button onClick={() => { setSubmitted(false); setForm({ fullName: '', phone: '', email: '', dob: '', gender: '', branch: 'Windhoek CBD', symptoms: {}, notes: '', declaration: false }); }}>
          Submit Another
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-3">
          <Heart size={32} className="text-primary" />
          <h1 className="text-2xl font-bold text-gray-900">Full Body Check Up</h1>
        </div>
        <p className="text-gray-500">Complete this health assessment form. Your information is kept confidential.</p>
      </div>

      <form onSubmit={handleSubmit}>
        {error && <Alert type="error" className="mb-4">{error}</Alert>}

        <Card className="mb-6">
          <CardHeader><h3 className="font-bold text-gray-800 flex items-center gap-2"><User size={18} /> Personal Information</h3></CardHeader>
          <CardBody>
            <div className="grid md:grid-cols-2 gap-4">
              <Input label="Full Name" value={form.fullName} onChange={e => updateField('fullName', e.target.value)} required />
              <Input label="Phone Number" type="tel" value={form.phone} onChange={e => updateField('phone', e.target.value)} required />
              <Input label="Email" type="email" value={form.email} onChange={e => updateField('email', e.target.value)} />
              <Input label="Date of Birth" type="date" value={form.dob} onChange={e => updateField('dob', e.target.value)} required />
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Gender</label>
                <select value={form.gender} onChange={e => updateField('gender', e.target.value)} required className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Branch</label>
                <select value={form.branch} onChange={e => updateField('branch', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                  {['Windhoek CBD', 'Katutura', 'Oshakati', 'Ondangwa', 'Walvis Bay', 'Swakopmund'].map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card className="mb-6">
          <CardHeader><h3 className="font-bold text-gray-800 flex items-center gap-2"><Heart size={18} /> Health Assessment</h3></CardHeader>
          <CardBody>
            <div className="space-y-6">
              {BODY_SYSTEMS.map(system => (
                <div key={system.id}>
                  <h4 className="font-semibold text-gray-700 mb-2 text-sm">{system.label}</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {system.questions.map(q => (
                      <label key={q} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={(form.symptoms[system.id] || []).includes(q)}
                          onChange={() => toggleSymptom(system.id, q)}
                          className="rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        <span className="text-gray-600">{q}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card className="mb-6">
          <CardBody>
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Additional Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => updateField('notes', e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 min-h-[80px] resize-y"
                  placeholder="Any additional health concerns or information..."
                />
              </div>
              <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.declaration}
                  onChange={e => updateField('declaration', e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span className="text-sm text-gray-600">
                  I declare that all information provided is accurate and true. I consent to the processing of my health data for consultation purposes.
                </span>
              </label>
            </div>
          </CardBody>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="secondary" onClick={() => setPreviewOpen(true)}>Preview</Button>
          <Button type="submit" disabled={loading}>{loading ? 'Submitting...' : 'Submit Checkup'}</Button>
        </div>
      </form>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="Form Preview" size="lg">
        <div className="p-6 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><strong>Name:</strong> {form.fullName}</div>
            <div><strong>Phone:</strong> {form.phone}</div>
            <div><strong>Email:</strong> {form.email || '-'}</div>
            <div><strong>DOB:</strong> {form.dob}</div>
            <div><strong>Gender:</strong> {form.gender}</div>
            <div><strong>Branch:</strong> {form.branch}</div>
          </div>
          {Object.entries(form.symptoms).filter(([, v]) => v.length > 0).map(([system, symptoms]) => (
            <div key={system}>
              <strong className="capitalize">{system}:</strong> {symptoms.join(', ')}
            </div>
          ))}
          {form.notes && <div><strong>Notes:</strong> {form.notes}</div>}
        </div>
      </Modal>
    </div>
  );
}

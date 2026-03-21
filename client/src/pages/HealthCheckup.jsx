import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { BRANCHES, BRANCH_DETAILS, COMPANY_INFO } from '../lib/constants';
import { Card, CardHeader, CardBody, Button, Input, Alert, Modal } from '../components/ui';
import { Heart, User, Phone, Calendar, CheckCircle, Users, Search } from 'lucide-react';

const DEFAULT_REFERRAL_NAME = COMPANY_INFO.defaultReferralName;
const DEFAULT_REFERRAL_NB = COMPANY_INFO.defaultReferralNB;

const BODY_SYSTEMS = [
  { id: 'cardiovascular', label: 'Cardiovascular System', questions: ['Blood pressure issues', 'Heart palpitations', 'Chest pain', 'Shortness of breath', 'Swollen ankles', 'Numbness in extremities', 'Cold hands/feet'] },
  { id: 'respiratory', label: 'Respiratory System', questions: ['Chronic cough', 'Difficulty breathing', 'Asthma/allergies', 'Frequent colds', 'Wheezing', 'Sinus problems'] },
  { id: 'digestive', label: 'Digestive System', questions: ['Stomach pain', 'Bloating/gas', 'Constipation/diarrhea', 'Poor appetite', 'Acid reflux/heartburn', 'Nausea', 'Liver problems'] },
  { id: 'musculoskeletal', label: 'Musculoskeletal System', questions: ['Joint pain', 'Back pain', 'Muscle weakness', 'Limited mobility', 'Arthritis', 'Bone density concerns'] },
  { id: 'nervous', label: 'Nervous System', questions: ['Headaches/migraines', 'Dizziness', 'Numbness/tingling', 'Sleep problems', 'Memory issues', 'Stress/anxiety', 'Depression'] },
  { id: 'endocrine', label: 'Endocrine System', questions: ['Diabetes', 'Thyroid issues', 'Weight changes', 'Fatigue', 'Hormonal imbalance', 'Excessive thirst'] },
  { id: 'immune', label: 'Immune System', questions: ['Frequent infections', 'Slow healing', 'Allergic reactions', 'Autoimmune conditions', 'HIV/AIDS related', 'Low energy'] },
  { id: 'urinary', label: 'Urinary System', questions: ['Frequent urination', 'Pain during urination', 'Kidney problems', 'Incontinence', 'Prostate issues'] },
  { id: 'reproductive', label: 'Reproductive System', questions: ['Menstrual irregularities', 'Fertility concerns', 'Menopause symptoms', 'Sexual health issues'] },
  { id: 'skin', label: 'Skin & Hair', questions: ['Skin rashes', 'Acne', 'Eczema/psoriasis', 'Hair loss', 'Dry/oily skin', 'Wound healing issues'] },
];

export default function HealthCheckup() {
  const [customerType, setCustomerType] = useState(null);
  const [distributors, setDistributors] = useState([]);
  const [selectedDistributor, setSelectedDistributor] = useState(null);
  const [distributorSearch, setDistributorSearch] = useState('');
  const [referralName, setReferralName] = useState('');
  const [referralNB, setReferralNB] = useState('');

  const [form, setForm] = useState({
    fullName: '', phone: '', email: '', dob: '', gender: '', branch: 'Windhoek CBD',
    weight: '', height: '',
    symptoms: {}, notes: '', declaration: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    api.distributors.list()
      .then(data => setDistributors(Array.isArray(data) ? data : data.distributors || []))
      .catch(() => []);
  }, []);

  const isMember = customerType === 'member';

  const filteredDistributors = distributors.filter(d =>
    !distributorSearch ||
    (d.distributor_name || '').toLowerCase().includes(distributorSearch.toLowerCase()) ||
    (d.distributor_code || '').toLowerCase().includes(distributorSearch.toLowerCase())
  );

  const effectiveReferralName = isMember
    ? (selectedDistributor?.distributor_name || '')
    : (referralName.trim() || DEFAULT_REFERRAL_NAME);
  const effectiveReferralNB = isMember
    ? (selectedDistributor?.distributor_code || '')
    : (referralNB.trim() || DEFAULT_REFERRAL_NB);

  const updateField = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const calcBMI = () => {
    const h = parseFloat(form.height);
    const w = parseFloat(form.weight);
    if (!h || !w || h <= 0) return null;
    return (w / ((h / 100) ** 2)).toFixed(1);
  };
  const bmiValue = calcBMI();
  const bmiCategory = (bmi) => {
    if (!bmi) return '';
    const b = parseFloat(bmi);
    if (b < 18.5) return 'Underweight';
    if (b < 25) return 'Normal';
    if (b < 30) return 'Overweight';
    return 'Obese';
  };
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
    if (!customerType) { setError('Please select customer type'); return; }
    if (isMember && !selectedDistributor) { setError('Please select your NB number from the distributor list'); return; }
    if (!form.fullName) { setError('Please enter your full name'); return; }
    if (!form.phone) { setError('Please enter your phone number'); return; }
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
        branch: form.branch,
        notes: form.notes,
        client_reference: effectiveReferralNB,
        data: {
          customer_type: customerType,
          gender: form.gender,
          dob: form.dob,
          height: form.height,
          weight: form.weight,
          bmi: bmiValue,
          bmi_category: bmiCategory(bmiValue),
          symptoms: form.symptoms,
          referral_name: effectiveReferralName,
          referral_nb: effectiveReferralNB,
        },
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
        <Button onClick={() => { setSubmitted(false); setCustomerType(null); setSelectedDistributor(null); setForm({ fullName: '', phone: '', email: '', dob: '', gender: '', branch: 'Windhoek CBD', weight: '', height: '', symptoms: {}, notes: '', declaration: false }); }}>
          Submit Another
        </Button>
      </div>
    );
  }

  if (!customerType) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Heart size={32} className="text-primary" />
            <h1 className="text-3xl font-bold text-gray-900">Full Body Check Up</h1>
          </div>
          <p className="text-gray-500">Please select your customer type to continue</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button onClick={() => setCustomerType('member')}
            className="p-8 bg-white rounded-2xl border-2 border-gray-200 hover:border-primary hover:shadow-lg transition-all cursor-pointer text-left group">
            <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
              <Users size={28} className="text-primary" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Registered Member</h3>
            <p className="text-sm text-gray-500">I am a Dynapharm distributor with an NB number</p>
          </button>
          <button onClick={() => setCustomerType('non-member')}
            className="p-8 bg-white rounded-2xl border-2 border-gray-200 hover:border-primary hover:shadow-lg transition-all cursor-pointer text-left group">
            <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
              <User size={28} className="text-blue-600" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Non-Member</h3>
            <p className="text-sm text-gray-500">Walk-in or referred customer</p>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-6">
        <div className="flex items-center justify-center gap-3 mb-3">
          <Heart size={32} className="text-primary" />
          <h1 className="text-2xl font-bold text-gray-900">Full Body Check Up</h1>
        </div>
        <p className="text-gray-500">Complete this health assessment form. Your information is kept confidential.</p>
        <div className="flex justify-center gap-2 mt-3">
          <button onClick={() => { setCustomerType('member'); setSelectedDistributor(null); }}
            className={`px-4 py-1.5 text-sm rounded-full transition-all cursor-pointer ${isMember ? 'bg-primary text-white font-semibold' : 'bg-gray-100 text-gray-600'}`}>
            Member
          </button>
          <button onClick={() => { setCustomerType('non-member'); setSelectedDistributor(null); }}
            className={`px-4 py-1.5 text-sm rounded-full transition-all cursor-pointer ${!isMember ? 'bg-primary text-white font-semibold' : 'bg-gray-100 text-gray-600'}`}>
            Non-Member
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {error && <Alert type="error" className="mb-4">{error}</Alert>}

        {isMember && (
          <Card className="mb-6">
            <CardHeader><h3 className="font-bold text-gray-800 flex items-center gap-2"><Users size={18} /> Member Details — Select Your NB Number</h3></CardHeader>
            <CardBody>
              {selectedDistributor ? (
                <div className="flex items-center justify-between bg-primary/5 rounded-lg p-3 border border-primary/30">
                  <div>
                    <span className="font-bold text-primary">{selectedDistributor.distributor_code}</span>
                    <span className="text-gray-600 ml-2">{selectedDistributor.distributor_name}</span>
                    {selectedDistributor.branch && <span className="text-gray-400 ml-2 text-xs">({selectedDistributor.branch})</span>}
                  </div>
                  <button type="button" onClick={() => setSelectedDistributor(null)} className="text-xs text-primary underline cursor-pointer">Change</button>
                </div>
              ) : (
                <div>
                  <div className="relative mb-2">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={distributorSearch} onChange={e => setDistributorSearch(e.target.value)}
                      placeholder="Search by NB number or distributor name..."
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                  <div className="max-h-40 overflow-y-auto bg-white rounded-lg border border-gray-200">
                    {filteredDistributors.length === 0 ? (
                      <p className="p-3 text-sm text-gray-400 text-center">No distributors found</p>
                    ) : filteredDistributors.slice(0, 20).map(d => (
                      <button type="button" key={d.id} onClick={() => { setSelectedDistributor(d); setDistributorSearch(''); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-primary/5 border-b border-gray-100 last:border-0 cursor-pointer">
                        <span className="font-semibold text-primary">{d.distributor_code}</span>
                        <span className="text-gray-600 ml-2">{d.distributor_name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        )}

        {!isMember && (
          <Card className="mb-6">
            <CardHeader><h3 className="font-bold text-gray-800 flex items-center gap-2"><User size={18} /> Referral (Optional)</h3></CardHeader>
            <CardBody>
              <div className="grid md:grid-cols-2 gap-3">
                <Input label="Referral Name" value={referralName} onChange={e => setReferralName(e.target.value)}
                  placeholder={`Default: ${DEFAULT_REFERRAL_NAME}`} />
                <Input label="Referral NB Number" value={referralNB} onChange={e => setReferralNB(e.target.value)}
                  placeholder={`Default: ${DEFAULT_REFERRAL_NB}`} />
              </div>
              <p className="text-xs text-gray-400 mt-2">If no referral is entered, the default referral <strong>{DEFAULT_REFERRAL_NAME} ({DEFAULT_REFERRAL_NB})</strong> will be used.</p>
            </CardBody>
          </Card>
        )}

        <Card className="mb-6">
          <CardHeader><h3 className="font-bold text-gray-800 flex items-center gap-2"><User size={18} /> Personal Information</h3></CardHeader>
          <CardBody>
            <div className="grid md:grid-cols-2 gap-4">
              <Input label="Full Name *" value={form.fullName} onChange={e => updateField('fullName', e.target.value)} required />
              <Input label="Phone Number *" type="tel" value={form.phone} onChange={e => updateField('phone', e.target.value)} required />
              <Input label="Email" type="email" value={form.email} onChange={e => updateField('email', e.target.value)} />
              <Input label="Date of Birth *" type="date" value={form.dob} onChange={e => updateField('dob', e.target.value)} required />
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Gender *</label>
                <select value={form.gender} onChange={e => updateField('gender', e.target.value)} required className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Branch *</label>
                <select value={form.branch} onChange={e => updateField('branch', e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                  {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Height (cm)</label>
                <input
                  type="number"
                  min="50" max="250"
                  value={form.height}
                  onChange={e => updateField('height', e.target.value)}
                  placeholder="e.g. 165"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Weight (kg)</label>
                <input
                  type="number"
                  min="1" max="400"
                  value={form.weight}
                  onChange={e => updateField('weight', e.target.value)}
                  placeholder="e.g. 70"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                />
              </div>
              {bmiValue && (
                <div className="md:col-span-2">
                  <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 ${
                    parseFloat(bmiValue) < 18.5 ? 'border-blue-300 bg-blue-50' :
                    parseFloat(bmiValue) < 25 ? 'border-green-300 bg-green-50' :
                    parseFloat(bmiValue) < 30 ? 'border-yellow-300 bg-yellow-50' :
                    'border-red-300 bg-red-50'
                  }`}>
                    <div className="text-2xl font-black" style={{ color: parseFloat(bmiValue) < 18.5 ? '#2563eb' : parseFloat(bmiValue) < 25 ? '#16a34a' : parseFloat(bmiValue) < 30 ? '#d97706' : '#dc2626' }}>
                      {bmiValue}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">BMI</div>
                      <div className="font-bold text-sm" style={{ color: parseFloat(bmiValue) < 18.5 ? '#2563eb' : parseFloat(bmiValue) < 25 ? '#16a34a' : parseFloat(bmiValue) < 30 ? '#d97706' : '#dc2626' }}>
                        {bmiCategory(bmiValue)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div className="space-y-1 md:col-span-2">
                <label className="block text-sm font-medium text-gray-700">Customer Type</label>
                <input type="text" readOnly value={isMember ? `Member — ${effectiveReferralName} (${effectiveReferralNB})` : `Non-Member — Referral: ${effectiveReferralName} (${effectiveReferralNB})`}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-600" />
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
          <div className="bg-primary/5 rounded-lg p-3 mb-3">
            <strong>Customer Type:</strong> {isMember ? 'Registered Member' : 'Non-Member'}
            <br /><strong>Referral:</strong> {effectiveReferralName} ({effectiveReferralNB})
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><strong>Name:</strong> {form.fullName}</div>
            <div><strong>Phone:</strong> {form.phone}</div>
            <div><strong>Email:</strong> {form.email || '-'}</div>
            <div><strong>DOB:</strong> {form.dob}</div>
            <div><strong>Gender:</strong> {form.gender}</div>
            <div><strong>Branch:</strong> {form.branch}</div>
            <div><strong>Height:</strong> {form.height ? `${form.height} cm` : '-'}</div>
            <div><strong>Weight:</strong> {form.weight ? `${form.weight} kg` : '-'}</div>
            {bmiValue && (
              <div className="col-span-2">
                <strong>BMI:</strong> {bmiValue} — <span style={{ fontWeight: 700, color: parseFloat(bmiValue) < 18.5 ? '#2563eb' : parseFloat(bmiValue) < 25 ? '#16a34a' : parseFloat(bmiValue) < 30 ? '#d97706' : '#dc2626' }}>{bmiCategory(bmiValue)}</span>
              </div>
            )}
          </div>
          {Object.entries(form.symptoms).filter(([, v]) => v.length > 0).map(([system, symptoms]) => (
            <div key={system}>
              <strong className="capitalize">{system}:</strong> {symptoms.join(', ')}
            </div>
          ))}
          {form.notes && <div><strong>Notes:</strong> {form.notes}</div>}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => {
                const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                const logo = window.location.origin + '/assets/dynapharm-logo.png';
                const bmi = bmiValue ? `${bmiValue} (${bmiCategory(bmiValue)})` : 'N/A';
                const allSymptoms = Object.entries(form.symptoms).filter(([,v])=>v.length>0);
                const w = window.open('', '_blank', 'width=820,height=700');
                w.document.write(`<!DOCTYPE html><html><head><title>Full Body Checkup — ${esc(form.fullName)}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 30px; color: #222; }
  .header { display: flex; align-items: center; gap: 18px; border-bottom: 3px solid #c41e3a; padding-bottom: 14px; margin-bottom: 18px; }
  .logo { height: 60px; }
  .company-name { font-size: 1.3rem; font-weight: 900; color: #c41e3a; }
  .subtitle { font-size: 0.9rem; color: #555; }
  h3 { color: #c41e3a; border-bottom: 1.5px solid #e0b0b8; padding-bottom: 5px; margin: 18px 0 10px; font-size: 1rem; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
  .field { padding: 4px 0; font-size: 0.9rem; }
  .label { font-weight: bold; color: #444; }
  .bmi-box { display: inline-block; background: #f0fdf4; border: 1.5px solid #86efac; border-radius: 8px; padding: 6px 16px; font-weight: 800; font-size: 1rem; color: #15803d; margin-top: 6px; }
  .symptom-section { margin-bottom: 8px; }
  .symptom-label { font-weight: bold; color: #555; text-transform: capitalize; font-size: 0.88rem; }
  .symptom-list { color: #333; font-size: 0.87rem; }
  .declaration { background: #f9fafb; border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px 14px; font-size: 0.82rem; color: #666; margin-top: 18px; }
  .footer { margin-top: 28px; border-top: 1.5px solid #c41e3a; padding-top: 10px; font-size: 0.78rem; color: #888; display: flex; justify-content: space-between; }
  @media print { body { padding: 18px; } }
</style></head><body>
<div class="header">
  <img class="logo" src="${logo}" onerror="this.style.display='none'" />
  <div>
    <div class="company-name">DYNAPHARM INTERNATIONAL NAMIBIA</div>
    <div class="subtitle">Full Body Check Up Form — Client Copy</div>
  </div>
</div>
<h3>Referral & Customer Type</h3>
<div class="grid2">
  <div class="field"><span class="label">Type:</span> ${esc(isMember ? 'Registered Member' : 'Non-Member')}</div>
  <div class="field"><span class="label">Referral:</span> ${esc(effectiveReferralName)} (${esc(effectiveReferralNB)})</div>
</div>
<h3>Personal Information</h3>
<div class="grid2">
  <div class="field"><span class="label">Full Name:</span> ${esc(form.fullName)}</div>
  <div class="field"><span class="label">Phone:</span> ${esc(form.phone)}</div>
  <div class="field"><span class="label">Email:</span> ${esc(form.email || '-')}</div>
  <div class="field"><span class="label">Date of Birth:</span> ${esc(form.dob)}</div>
  <div class="field"><span class="label">Gender:</span> ${esc(form.gender)}</div>
  <div class="field"><span class="label">Branch:</span> ${esc(form.branch)}</div>
  <div class="field"><span class="label">Height:</span> ${esc(form.height ? form.height + ' cm' : 'Not provided')}</div>
  <div class="field"><span class="label">Weight:</span> ${esc(form.weight ? form.weight + ' kg' : 'Not provided')}</div>
</div>
${bmiValue ? `<div class="bmi-box">BMI: ${esc(bmi)}</div>` : ''}
${allSymptoms.length > 0 ? `<h3>Health Assessment — Reported Symptoms</h3>${allSymptoms.map(([sys, sxs]) => `<div class="symptom-section"><span class="symptom-label">${esc(sys)}:</span> <span class="symptom-list">${sxs.map(esc).join(', ')}</span></div>`).join('')}` : ''}
${form.notes ? `<h3>Additional Notes</h3><p style="font-size:0.9rem;color:#333">${esc(form.notes)}</p>` : ''}
<div class="declaration">I declare that all information provided is accurate and true. I consent to the processing of my health data for consultation purposes.</div>
<div class="footer">
  <span>Date submitted: ${new Date().toLocaleDateString('en-NA',{day:'2-digit',month:'long',year:'numeric'})}</span>
  <span>Dynapharm International Namibia — Confidential</span>
</div>
</body></html>`);
                w.document.close();
                w.print();
              }}
              style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 22px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}
            >
              🖨️ Print PDF
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

import { useState, useEffect, useCallback, useRef, Component } from 'react';
import { api } from '../../lib/api';
import { formatDateTime, formatDate, BRANCHES, COMPANY_INFO } from '../../lib/constants';
import { PRICE_LIST, PACKAGE_DATABASE, BODY_SYSTEMS_DATABASE, RECOMMENDATION_DATABASE, findProductPrice, getLiveProductList } from '../../lib/pricing';
import { Button, Input, Badge, LoadingSpinner, Modal, Alert, Textarea } from '../../components/ui';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '24px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', textAlign: 'center', color: '#991b1b' }}>
          <p style={{ fontWeight: 600, marginBottom: '10px' }}>Something went wrong loading this section.</p>
          <button onClick={() => this.setState({ hasError: false })} style={{ padding: '8px 18px', background: '#c41e3a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ConsultantPortal() {
  const [activeSection, setActiveSection] = useState('checkups');
  const [refreshKey, setRefreshKey] = useState(0);
  const navItems = [
    { id: 'checkups', label: 'Checkup Forms' },
    { id: 'clients', label: 'Clients' },
    { id: 'reports', label: 'Reports' },
    { id: 'followups', label: 'Follow-ups' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'staff', label: 'Staff Services' },
  ];

  const handleRefreshData = () => {
    setRefreshKey(k => k + 1);
  };

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #c41e3a 0%, #a01830 100%)', borderRadius: '16px', padding: '28px 32px', marginBottom: '28px', color: '#fff', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
        <img src={COMPANY_INFO.logo} alt="Dynapharm" style={{ height: '52px', background: '#fff', borderRadius: '10px', padding: '6px' }} onError={e => { e.target.style.display = 'none'; }} />
        <div style={{ flex: 1, minWidth: '200px' }}>
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Consultant Portal</h2>
          <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: '0.95rem' }}>Client management, checkup forms & reports</p>
        </div>
        <button onClick={handleRefreshData} style={{ background: 'rgba(255,255,255,0.18)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '8px', padding: '8px 18px', fontSize: '0.9rem', cursor: 'pointer' }}>Refresh Data</button>
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
        <ErrorBoundary key={`eb-${activeSection}-${refreshKey}`}>
          {activeSection === 'checkups' && <CheckupsSection key={`chk-${refreshKey}`} />}
          {activeSection === 'clients' && <ClientsSection key={`cli-${refreshKey}`} />}
          {activeSection === 'reports' && <ReportsSection key={`rep-${refreshKey}`} />}
          {activeSection === 'followups' && <FollowupsSection key={`fol-${refreshKey}`} />}
          {activeSection === 'analytics' && <AnalyticsSection key={`ana-${refreshKey}`} />}
          {activeSection === 'staff' && <StaffServicesSection key={`stf-${refreshKey}`} />}
        </ErrorBoundary>
      </div>
    </div>
  );
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* keyword map: symptom text fragment → RECOMMENDATION_DATABASE key */
const SYMPTOM_KEYWORD_MAP = [
  { keys: ['fatigue','tired','exhaustion','lethargy'], rec: 'fatigue' },
  { keys: ['headache','migraine','head pain'], rec: 'headache' },
  { keys: ['nausea','vomit','sick to stomach'], rec: 'nausea' },
  { keys: ['dizzy','dizziness','vertigo','lightheaded'], rec: 'dizziness' },
  { keys: ['breath','breathing','respiratory','breathless'], rec: 'shortness_breath' },
  { keys: ['vision','blurred','eye strain','eyesight'], rec: 'blurred_vision' },
  { keys: ['joint','arthritis','stiff'], rec: 'joint_pain' },
  { keys: ['cough','wheeze','wheezing'], rec: 'cough' },
  { keys: ['digest','bloat','constipat','diarrhea','indigestion','heartburn','stomach'], rec: 'digestive_issues' },
  { keys: ['appetite','hunger'], rec: 'loss_appetite' },
  { keys: ['fever','temperature','chills'], rec: 'fever' },
  { keys: ['throat','sore throat','tonsil'], rec: 'sore_throat' },
  { keys: ['skin','rash','acne','eczema','dermatitis','itch'], rec: 'skin_rash' },
  { keys: ['chest','palpitat','heart'], rec: 'chest_pain' },
  { keys: ['back pain','neck','spine','lumbar'], rec: 'lower_back' },
  { keys: ['weight','obesity','overweight','underweight'], rec: 'weight_changes' },
  { keys: ['sleep','insomnia','awake','restless'], rec: 'insomnia' },
  { keys: ['confusion','memory','focus','concentrate','brain fog','cognitive'], rec: 'confusion' },
  { keys: ['swelling','edema','swollen','puffy'], rec: 'swelling' },
  { keys: ['menstrual','menopause','fertility','sexual','libido','erectile','hormonal','reproductive'], rec: 'weight_changes' },
  { keys: ['urinary','frequent urinat','bladder','kidney'], rec: 'foot_edema' },
  { keys: ['muscle','cramp','spasm'], rec: 'joint_pain' },
  { keys: ['allerg','immune','infection','cold'], rec: 'fever' },
  { keys: ['anxiety','stress','depress','mood','mental'], rec: 'insomnia' },
];

/* map form system IDs → BODY_SYSTEMS_DATABASE keys */
const FORM_SYSTEM_TO_DB = {
  nervous: 'Nervous System',
  cardiovascular: 'Cardiovascular System',
  digestive: 'Digestive System',
  respiratory: 'Respiratory System',
  immune: 'Immune System',
  endocrine: 'Endocrine System',
  musculoskeletal: 'Musculoskeletal System',
  urinary: 'Urinary System',
  reproductive: 'Reproductive System',
  skin: 'Integumentary System (Skin, Hair, Nails)',
  integumentary: 'Integumentary System (Skin, Hair, Nails)',
  lymphatic: 'Lymphatic System',
  sensory: 'Sensory System (Eyes, Ears, Nose)',
};

/* keyword match symptom text → BODY_SYSTEMS_DATABASE symptom key */
const DB_SYMPTOM_KEYWORDS = {
  'Nervous System': {
    'Frequent headaches or migraines': ['headache','migraine','head pain'],
    'Difficulty concentrating or brain fog': ['focus','brain fog','concentrate','memory','confusion','cognitive'],
    'Tingling or numbness in limbs': ['numb','tingle','tingling'],
  },
  'Cardiovascular System': {
    'Palpitations or irregular heartbeat': ['palpitat','irregular heart','chest','heart rate'],
    'Shortness of breath': ['breath','breathless','short of breath'],
    'Cold hands and feet or fatigue': ['fatigue','tired','cold hands','cold feet','circulation'],
  },
  'Digestive System': {
    'Bloating and indigestion': ['bloat','indigestion','heartburn','gas'],
    'Constipation or diarrhea': ['constipat','diarrhea','bowel'],
    'Loss of appetite or heartburn': ['appetite','hunger','heartburn','stomach'],
  },
  'Respiratory System': {
    'Frequent cough or shortness of breath': ['cough','wheeze','breath','respiratory'],
    'Chest tightness': ['chest','tight'],
    'Low lung endurance': ['lung','endurance','asthma'],
  },
  'Immune System': {
    'Frequent colds or infections': ['cold','infection','flu','fever','allerg'],
    'Slow wound healing': ['wound','heal'],
    'Allergic reactions or fatigue': ['allerg','fatigue','tired'],
  },
  'Endocrine System': {
    'Weight fluctuations': ['weight','obesity','overweight','underweight'],
    'Mood swings or irritability': ['mood','irritab','anxiety','stress','depress'],
    'Irregular menstruation or libido changes': ['menstrual','menopause','libido','hormonal'],
  },
  'Musculoskeletal System': {
    'Muscle stiffness or pain': ['muscle','stiff','cramp','spasm'],
    'Joint aches': ['joint','arthritis','knees','aches'],
    'Back or neck discomfort': ['back','neck','spine','lumbar'],
  },
  'Urinary System': {
    'Frequent urination or urgency': ['urinat','bladder','frequent bathroom'],
    'Lower back pain': ['back pain','kidney','lumbar'],
    'Swelling in legs or feet': ['swelling','edema','swollen','puffy legs'],
  },
  'Reproductive System': {
    'Reduced sexual desire': ['libido','sexual desire','erectile'],
    'Irregular cycles or erectile issues': ['menstrual','irregular','erectile','cycle'],
    'Hormonal imbalances': ['hormonal','menopause','hormone'],
  },
  'Integumentary System (Skin, Hair, Nails)': {
    'Dry or dull skin': ['dry skin','dull skin','skin'],
    'Hair loss or brittleness': ['hair loss','hair','brittle'],
    'Acne or skin sensitivity': ['acne','rash','itch','eczema','skin sensitive'],
  },
  'Lymphatic System': {
    'Swollen lymph nodes': ['lymph','swollen gland'],
    'Puffy face or limbs': ['puffy','swelling','edema'],
    'Chronic fatigue': ['fatigue','tired','exhaustion','lethargy'],
  },
  'Sensory System (Eyes, Ears, Nose)': {
    'Eye fatigue or blurred vision': ['vision','eye','blurred','eyesight'],
    'Ringing in the ears (tinnitus)': ['ear','tinnitus','ringing'],
    'Sensitivity to light or sound': ['light','sound','sensitivity'],
  },
};

function autoPopulateBodyChecks(data) {
  const newSystems = {};
  const newChecks = {};
  const formSymptoms = data.symptoms && typeof data.symptoms === 'object' && !Array.isArray(data.symptoms)
    ? data.symptoms : {};

  /* 1. Map form system IDs → DB systems, then match symptom texts by keyword */
  Object.entries(formSymptoms).forEach(([formSysId, syms]) => {
    if (!Array.isArray(syms) || syms.length === 0) return;
    const dbSystemName = FORM_SYSTEM_TO_DB[formSysId.toLowerCase()] || null;
    syms.forEach(symptomText => {
      const lower = (symptomText || '').toLowerCase();
      /* Try exact DB system first, then all systems */
      const systemsToSearch = dbSystemName
        ? { [dbSystemName]: DB_SYMPTOM_KEYWORDS[dbSystemName] }
        : DB_SYMPTOM_KEYWORDS;
      Object.entries(systemsToSearch).forEach(([sysName, sympMap]) => {
        if (!sympMap) return;
        const sysId = sysName.replace(/[^a-zA-Z0-9]/g, '_');
        Object.entries(sympMap).forEach(([dbSymptom, kws]) => {
          if (kws.some(kw => lower.includes(kw))) {
            newSystems[sysId] = true;
            newChecks[`${sysId}__${dbSymptom}`] = true;
          }
        });
      });
    });
  });

  /* 2. Lifestyle auto-checks */
  if (data.sleepHours === '<5' || data.sleepHours === '5-6') {
    const sysId = 'Nervous_System';
    newSystems[sysId] = true;
    newChecks[`${sysId}__Difficulty concentrating or brain fog`] = true;
  }
  if (parseInt(data.stressLevel) >= 7) {
    const sysId = 'Endocrine_System';
    newSystems[sysId] = true;
    newChecks[`${sysId}__Mood swings or irritability`] = true;
  }
  if (data.exerciseFreq === 'never' || data.exerciseFreq === '1-2') {
    const sysId = 'Cardiovascular_System';
    newSystems[sysId] = true;
    newChecks[`${sysId}__Cold hands and feet or fatigue`] = true;
  }
  if (data.waterIntake === 'less1') {
    const sysId = 'Urinary_System';
    newSystems[sysId] = true;
    newChecks[`${sysId}__Lower back pain`] = true;
  }
  return { newSystems, newChecks };
}

function generateRecommendations(client) {
  const recommendations = new Set();
  const reasonsMap = new Map();
  const addRec = (med, reason) => {
    recommendations.add(med);
    if (!reasonsMap.has(med)) reasonsMap.set(med, []);
    reasonsMap.get(med).push(reason);
  };

  /* 1. Direct key matches (legacy snake_case keys) */
  if (client.symptoms && client.symptoms.length > 0) {
    client.symptoms.forEach(s => {
      if (s !== 'none' && RECOMMENDATION_DATABASE.symptoms[s]) {
        RECOMMENDATION_DATABASE.symptoms[s].forEach(m => addRec(m, `Symptom: ${s.replace(/_/g, ' ')}`));
      }
    });
  }

  /* 2. Keyword match from raw symptom strings (full text from form) */
  const rawStrings = client.rawSymptomStrings || [];
  rawStrings.forEach(symptomText => {
    const lower = (symptomText || '').toLowerCase();
    SYMPTOM_KEYWORD_MAP.forEach(({ keys, rec }) => {
      if (keys.some(k => lower.includes(k))) {
        const meds = RECOMMENDATION_DATABASE.symptoms[rec];
        if (meds) meds.forEach(m => addRec(m, symptomText));
      }
    });
  });

  /* 3. Medical history */
  if (client.medicalHistory && Array.isArray(client.medicalHistory)) {
    client.medicalHistory.forEach(c => {
      if (c !== 'na' && RECOMMENDATION_DATABASE.medicalHistory[c]) {
        RECOMMENDATION_DATABASE.medicalHistory[c].forEach(m => addRec(m, `Medical History: ${c.replace(/([A-Z])/g, ' $1').trim()}`));
      }
    });
  }

  /* 4. Gender */
  const gender = (client.gender || '').toLowerCase();
  if (gender && RECOMMENDATION_DATABASE.gender[gender]) {
    RECOMMENDATION_DATABASE.gender[gender].forEach(m => addRec(m, `Gender-specific (${gender})`));
  }

  /* 5. Lifestyle */
  if (client.sleepHours === '<5' || client.sleepHours === '5-6') {
    RECOMMENDATION_DATABASE.lifestyle.poorSleep.forEach(m => addRec(m, 'Poor sleep quality'));
  }
  if (parseInt(client.stressLevel) >= 7) {
    RECOMMENDATION_DATABASE.lifestyle.highStress.forEach(m => addRec(m, 'High stress level'));
  }
  if (client.exerciseFreq === 'never' || client.exerciseFreq === '1-2') {
    RECOMMENDATION_DATABASE.lifestyle.lowExercise.forEach(m => addRec(m, 'Low physical activity'));
  }
  if (client.waterIntake === 'less1') {
    RECOMMENDATION_DATABASE.lifestyle.poorWater.forEach(m => addRec(m, 'Low water intake'));
  }
  if (client.age && parseInt(client.age) >= 60) {
    RECOMMENDATION_DATABASE.age.elderly.forEach(m => addRec(m, 'Age 60+'));
  }
  if (recommendations.size === 0) {
    RECOMMENDATION_DATABASE.general.forEach(m => addRec(m, 'General wellness'));
  }
  return { recommendations, reasonsMap };
}

function CheckupsSection() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('upcoming');
  const [showReport, setShowReport] = useState(false);
  const [selectedCheckup, setSelectedCheckup] = useState(null);
  const [showDetail, setShowDetail] = useState(false);
  const [detailCheckup, setDetailCheckup] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [consultantNotes, setConsultantNotes] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [selectedMedicines, setSelectedMedicines] = useState(new Set());
  const [selectedSystems, setSelectedSystems] = useState({});
  const [selectedSymptomChecks, setSelectedSymptomChecks] = useState({});
  const [currentRecommendations, setCurrentRecommendations] = useState(null);
  const [reportRequired, setReportRequired] = useState(true);

  const loadCheckups = useCallback(() => {
    setLoading(true);
    api.appointments.list('type=Check')
      .then(data => setAppointments(Array.isArray(data) ? data : data.appointments || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadCheckups(); }, [loadCheckups]);

  const openReportModal = (apt) => {
    setSelectedCheckup(apt);
    setConsultantNotes('');
    setFollowUpNotes('');
    setSelectedMedicines(new Set());
    setSelectedSystems({});
    setSelectedSymptomChecks({});
    setReportRequired(true);
    setError('');
    const fd = new Date();
    fd.setDate(fd.getDate() + 14);
    setFollowUpDate(fd.toISOString().split('T')[0]);
    const data = (() => { try { return typeof apt.data === 'string' ? JSON.parse(apt.data) : (apt.data || {}); } catch { return {}; } })();
    const rawSymptoms = data.symptoms;
    const flatSymptoms = Array.isArray(rawSymptoms)
      ? rawSymptoms
      : (rawSymptoms && typeof rawSymptoms === 'object')
        ? Object.values(rawSymptoms).flat()
        : [];
    /* All symptom strings from the form (for keyword-based matching) */
    const rawSymptomStrings = Array.isArray(rawSymptoms)
      ? rawSymptoms
      : (rawSymptoms && typeof rawSymptoms === 'object')
        ? Object.values(rawSymptoms).flat()
        : [];
    const client = {
      symptoms: flatSymptoms,
      rawSymptomStrings,
      medicalHistory: data.medicalHistory || [],
      gender: data.gender || apt.gender || '',
      age: data.age || apt.age || '',
      sleepHours: data.sleepHours || '',
      stressLevel: data.stressLevel || '',
      exerciseFreq: data.exerciseFreq || '',
      waterIntake: data.waterIntake || '',
    };
    const recs = generateRecommendations(client);
    setCurrentRecommendations(recs);
    /* Auto-populate body system checkboxes from form symptom data */
    const { newSystems, newChecks } = autoPopulateBodyChecks(data);
    setSelectedSystems(newSystems);
    setSelectedSymptomChecks(newChecks);
    setShowReport(true);
  };

  const toggleMedicine = (name) => {
    setSelectedMedicines(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const applyAllRecommendations = () => {
    if (!currentRecommendations) return;
    setSelectedMedicines(prev => {
      const next = new Set(prev);
      currentRecommendations.recommendations.forEach(m => next.add(m));
      return next;
    });
  };

  const selectRecommendedMedicine = (name) => {
    setSelectedMedicines(prev => { const next = new Set(prev); next.add(name); return next; });
  };

  const toggleSystemSymptom = (systemId, symptom) => {
    setSelectedSymptomChecks(prev => {
      const key = `${systemId}__${symptom}`;
      const next = { ...prev };
      if (next[key]) delete next[key]; else next[key] = true;
      return next;
    });
  };

  const getLifestyleRecommendations = () => {
    const items = [];
    Object.entries(selectedSymptomChecks).forEach(([key]) => {
      const [sysId, symptom] = key.split('__');
      const systemName = Object.keys(BODY_SYSTEMS_DATABASE).find(n => n.replace(/[^a-zA-Z0-9]/g, '_') === sysId);
      if (systemName) {
        const rec = BODY_SYSTEMS_DATABASE[systemName].symptoms[symptom];
        if (rec) items.push({ system: systemName, symptom, recommendation: rec });
      }
    });
    return items;
  };

  const handleSaveReport = async () => {
    setSubmitting(true);
    setError('');
    const apt = selectedCheckup;
    if (!apt) { setError('No checkup selected'); setSubmitting(false); return; }
    const data = (() => { try { return typeof apt.data === 'string' ? JSON.parse(apt.data) : (apt.data || {}); } catch { return {}; } })();
    const selectedSymptoms = getLifestyleRecommendations();
    const medicines = Array.from(selectedMedicines).map(name => ({ name, dispensed: false }));
    const rawMemberType = data.membershipStatus || data.membership_status || data.customer_type || 'referred';
    const membershipStatus = rawMemberType === 'member' ? 'member' : 'referred';
    const isMember = membershipStatus === 'member';
    const consultationFee = isMember ? 150 : 200;
    const referralName = !isMember ? (data.referral_name || data.referralName || 'Dynapharm Namibia') : null;
    const referralNb = !isMember ? (data.referral_nb || data.referralNB || 'NB005676') : null;
    const referralDistributor = isMember ? null : `${referralName} ${referralNb}`;
    try {
      await api.reports.create({
        client_name: apt.full_name || data.fullName || '',
        appointment_id: apt.id,
        diagnosis: consultantNotes,
        prescriptions: medicines.map(m => ({ product: m.name, quantity: 1 })),
        medicines,
        recommendations: consultantNotes,
        follow_up_date: followUpDate,
        follow_up_notes: followUpNotes,
        symptoms: selectedSymptoms,
        consultant: user?.full_name || user?.username || 'Consultant',
        membership_status: membershipStatus,
        consultation_fee: consultationFee,
        consultant_credit: 150,
        referral_credit: isMember ? 0 : 50,
        referral_distributor: referralDistributor,
        referral_name: referralName,
        referral_nb: referralNb,
        nb_number: isMember ? (data.referral_nb || data.nb_number || null) : null,
        report_required: reportRequired,
      });
      setShowReport(false);
      setSelectedCheckup(null);
      setSelectedMedicines(new Set());
      setSelectedSystems({});
      setSelectedSymptomChecks({});
      setConsultantNotes('');
      setFollowUpDate('');
      setFollowUpNotes('');
      setCurrentRecommendations(null);
      setReportRequired(true);
      setError('');
      loadCheckups();
    } catch (err) {
      setError(err.message || 'Failed to save report');
    }
    setSubmitting(false);
  };

  const printReport = () => {
    const apt = selectedCheckup;
    if (!apt) return;
    const data = (() => { try { return typeof apt.data === 'string' ? JSON.parse(apt.data) : (apt.data || {}); } catch { return {}; } })();
    const meds = Array.from(selectedMedicines);
    const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const logo = window.location.origin + '/assets/dynapharm-logo.png';
    const heightVal = data.height || '';
    const weightVal = data.weight || '';
    let bmiDisplay = '';
    if (heightVal && weightVal) {
      const h = parseFloat(heightVal); const wkg = parseFloat(weightVal);
      if (h > 0 && wkg > 0) {
        const bmi = (wkg / ((h / 100) ** 2)).toFixed(1);
        const cat = parseFloat(bmi) < 18.5 ? 'Underweight' : parseFloat(bmi) < 25 ? 'Normal' : parseFloat(bmi) < 30 ? 'Overweight' : 'Obese';
        bmiDisplay = `${bmi} (${cat})`;
      }
    }
    const bmiStored = data.bmi ? `${data.bmi}${data.bmi_category ? ` (${data.bmi_category})` : ''}` : bmiDisplay;

    /* Presenting symptoms */
    const rawSym = data.symptoms;
    const flatSym = Array.isArray(rawSym) ? rawSym
      : (rawSym && typeof rawSym === 'object') ? Object.values(rawSym).flat() : [];
    const symptomsBySystem = (rawSym && typeof rawSym === 'object' && !Array.isArray(rawSym))
      ? rawSym : null;

    /* Lifestyle findings (body system checks the consultant confirmed) */
    const lifestyleRecs = getLifestyleRecommendations();

    /* AI product recommendations */
    const aiRecs = currentRecommendations
      ? Array.from(currentRecommendations.recommendations).map(med => ({
          med, reasons: [...new Set(currentRecommendations.reasonsMap.get(med) || [])],
        }))
      : [];

    /* Referral / membership */
    const rawMemberType = data.membershipStatus || data.membership_status || data.customer_type || 'referred';
    const isMember = rawMemberType === 'member';
    const referralName = data.referral_name || data.referralName || data.distributorName || '';
    const referralNB = data.referral_nb || data.referralNB || data.distributorNB || '';

    const w = window.open('', '_blank', 'width=900,height=750');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Health Report — ${esc(apt.full_name || '')}</title>
<style>
  *{box-sizing:border-box;}
  body{font-family:Arial,sans-serif;padding:20px;color:#222;font-size:12px;line-height:1.4;}
  .header{display:flex;align-items:center;gap:14px;border-bottom:3px solid #c41e3a;padding-bottom:10px;margin-bottom:14px;}
  .logo{height:54px;background:#fff;border-radius:8px;padding:3px;}
  .company{font-size:1.2rem;font-weight:900;color:#c41e3a;}
  .subtitle{font-size:0.82rem;color:#555;margin-top:2px;}
  .report-title{font-size:0.95rem;font-weight:800;color:#7b0000;letter-spacing:1px;margin-top:3px;}
  h3{color:#c41e3a;border-bottom:2px solid #fecaca;padding-bottom:4px;margin:12px 0 8px;font-size:0.88rem;text-transform:uppercase;letter-spacing:0.5px;}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;}
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px 14px;}
  .field{font-size:0.82rem;padding:2px 0;border-bottom:1px dotted #eee;}
  .section{margin:8px 0;padding:8px 12px;border:1px solid #e5e7eb;border-radius:7px;background:#fafafa;}
  .tag{padding:2px 8px;background:#e3f2fd;color:#1565c0;border-radius:20px;display:inline-block;margin:2px;font-size:0.76rem;font-weight:600;}
  .med{padding:4px 10px;background:#e8f5e9;border-radius:4px;display:inline-block;margin:3px 3px 3px 0;font-size:0.85rem;color:#166534;font-weight:700;border:1px solid #bbf7d0;}
  .lifestyle-item{margin-bottom:6px;padding:6px 10px;background:#e3f2fd;border-left:4px solid #2196f3;border-radius:5px;}
  .lifestyle-sym{font-weight:700;color:#1565c0;font-size:0.84rem;}
  .lifestyle-advice{font-size:0.8rem;color:#333;margin-top:2px;line-height:1.4;}
  .bmi-pill{display:inline-block;background:#f0fdf4;border:2px solid #86efac;border-radius:8px;padding:4px 14px;font-weight:800;font-size:0.95rem;color:#15803d;}
  .sig-row{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:6px;}
  .sig-box{border-top:2px solid #333;padding-top:5px;min-width:160px;}
  .sig-label{font-size:0.76rem;color:#666;}
  .sig-name{font-weight:700;font-size:0.9rem;color:#1e293b;margin-top:3px;}
  .footer{margin-top:18px;border-top:2px solid #c41e3a;padding-top:8px;font-size:0.72rem;color:#888;display:flex;justify-content:space-between;}
  .confidential{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:3px 10px;border-radius:20px;font-size:0.72rem;font-weight:700;}
  .section{page-break-inside:avoid;}
  @media print{body{padding:10px;} @page{size:A4;margin:10mm;}}
</style>
</head><body>

<div class="header">
  <img class="logo" src="${logo}" onerror="this.style.display='none'" />
  <div>
    <div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div>
    <div class="subtitle">Health, Wealth &amp; Freedom</div>
    <div class="report-title">SUMMARY ANALYSIS HEALTH REPORT CARD</div>
  </div>
  <div style="margin-left:auto;text-align:right;">
    <div style="font-size:0.85rem;color:#555;">Ref: <strong>${esc(String(apt.id || ''))}</strong></div>
    <div style="font-size:0.85rem;color:#555;">Date: <strong>${new Date().toLocaleDateString('en-NA',{day:'2-digit',month:'long',year:'numeric'})}</strong></div>
    <div style="margin-top:6px;display:inline-block;padding:4px 14px;border-radius:20px;font-size:0.8rem;font-weight:700;${reportRequired ? 'background:#fef2f2;color:#c41e3a;border:2px solid #fecaca;' : 'background:#f0fdf4;color:#166534;border:2px solid #bbf7d0;'}">
      ${reportRequired ? '⚠️ Report Required: YES' : '✓ Report Required: NO'}
    </div>
    <div style="margin-top:4px;"><span class="confidential">CONFIDENTIAL</span></div>
  </div>
</div>

<h3>Patient Details</h3>
<div class="section">
  <div class="grid3">
    <div class="field"><strong>Full Name:</strong> ${esc(apt.full_name || data.fullName || '')}</div>
    <div class="field"><strong>Gender:</strong> ${esc(data.gender || 'N/A')}</div>
    <div class="field"><strong>Date of Birth:</strong> ${esc(data.dob || 'N/A')}</div>
    <div class="field"><strong>Phone:</strong> ${esc(data.phone || apt.phone || 'N/A')}</div>
    <div class="field"><strong>Email:</strong> ${esc(data.email || apt.email || 'N/A')}</div>
    <div class="field"><strong>Branch:</strong> ${esc(data.branch || apt.branch || 'N/A')}</div>
    <div class="field"><strong>Height:</strong> ${heightVal ? esc(heightVal)+' cm' : 'N/A'}</div>
    <div class="field"><strong>Weight:</strong> ${weightVal ? esc(weightVal)+' kg' : 'N/A'}</div>
    <div class="field"><strong>Client Type:</strong> ${isMember ? '🏅 Registered Member' : '👤 Non-Member (Referred)'}</div>
  </div>
  ${bmiStored ? `<div style="margin-top:10px"><span class="bmi-pill">BMI: ${esc(bmiStored)}</span></div>` : ''}
  ${!isMember && referralName ? `<div style="margin-top:8px;font-size:0.88rem;color:#666;"><strong>Referred by:</strong> ${esc(referralName)}${referralNB ? ` (${esc(referralNB)})` : ''}</div>` : ''}
</div>

<h3>Lifestyle &amp; Health Profile</h3>
<div class="section">
  <div class="grid3">
    <div class="field"><strong>Primary Reason:</strong> ${esc(data.primaryReason || data.reason || 'N/A')}</div>
    <div class="field"><strong>Water Intake:</strong> ${esc(data.waterIntake || 'N/A')}</div>
    <div class="field"><strong>Exercise Frequency:</strong> ${esc(data.exerciseFreq || 'N/A')}</div>
    <div class="field"><strong>Sleep Hours:</strong> ${esc(data.sleepHours || 'N/A')}</div>
    <div class="field"><strong>Stress Level:</strong> ${esc(data.stressLevel || 'N/A')}/10</div>
    <div class="field"><strong>Medications:</strong> ${esc(data.currentMedications || 'None')}</div>
    <div class="field"><strong>Allergies:</strong> ${esc(data.allergies || 'None')}</div>
    <div class="field"><strong>Medical History:</strong> ${Array.isArray(data.medicalHistory) ? esc(data.medicalHistory.join(', ')) : esc(data.medicalHistory || 'None')}</div>
  </div>
</div>

${flatSym.length > 0 ? `
<h3>Reported Symptoms</h3>
<div class="section">
  ${symptomsBySystem
    ? Object.entries(symptomsBySystem).filter(([,v]) => Array.isArray(v) && v.length > 0).map(([sys, syms]) =>
        `<div style="margin-bottom:6px;"><strong style="color:#374151;text-transform:capitalize;">${esc(sys)}:</strong> ${syms.map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div>`
      ).join('')
    : flatSym.map(s => `<span class="tag">${esc(s)}</span>`).join('')
  }
</div>` : ''}

${lifestyleRecs.length > 0 ? `
<h3>🌿 Healthy Lifestyle Recommendations</h3>
<div class="section">
  ${lifestyleRecs.map(item => `
    <div class="lifestyle-item">
      <div class="lifestyle-sym">✓ ${esc(item.symptom)} <span style="font-weight:400;font-size:0.8rem;color:#555;">(${esc(item.system)})</span></div>
      <div class="lifestyle-advice">${esc(item.recommendation)}</div>
    </div>`).join('')}
</div>` : ''}

${meds.length > 0 ? `
<h3>💊 Prescription / Recommended Products</h3>
<div class="section">
  ${meds.map(m => `<span class="med">✓ ${esc(m)}</span>`).join('')}
</div>` : ''}

${consultantNotes ? `
<h3>📋 Consultant's Notes &amp; Diagnosis</h3>
<div class="section" style="background:#fffbeb;border-color:#fcd34d;">
  <p style="margin:0;white-space:pre-wrap;">${esc(consultantNotes)}</p>
</div>` : ''}

<h3>Consultant &amp; Follow-up</h3>
<div class="section">
  <div class="sig-row">
    <div>
      <div class="sig-box">
        <div class="sig-label">Consulting Health Practitioner</div>
        <div class="sig-name">${esc(user?.full_name || user?.username || '')}</div>
        <div style="font-size:0.8rem;color:#555;margin-top:3px;">Tel: ${esc(user?.phone || '061-300877')}</div>
        <div style="font-size:0.8rem;color:#555;">Email: ${esc(user?.email || 'info@dynapharm.com.na')}</div>
      </div>
    </div>
    <div>
      <div class="sig-box">
        <div class="sig-label">Recommended Follow-up Date</div>
        <div class="sig-name" style="color:#c41e3a;font-size:1.1rem;">${followUpDate ? new Date(followUpDate).toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'}) : '________________'}</div>
        ${followUpNotes ? `<div style="font-size:0.82rem;color:#555;margin-top:4px;">${esc(followUpNotes)}</div>` : ''}
      </div>
    </div>
  </div>
</div>

<div class="footer">
  <span>Generated: ${new Date().toLocaleString('en-NA')} &nbsp;|&nbsp; Dynapharm International Namibia</span>
  <span>This report is confidential and intended solely for the named patient.</span>
</div>

<script>window.onload = function(){ window.print(); }<\/script>
</body></html>`);
    w.document.close();
  };

  const updateStatus = async (apt, newStatus) => {
    try {
      await api.appointments.update(apt.id, { status: newStatus });
      loadCheckups();
    } catch (err) {
      alert('Failed to update status: ' + (err.message || 'Unknown error'));
    }
  };

  const viewDetail = (apt) => {
    setDetailCheckup(apt);
    setShowDetail(true);
  };

  const getStatusColor = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'completed') return '#22c55e';
    if (s === 'walk-in') return '#f59e0b';
    if (s === 'checked_in' || s === 'in_progress') return '#8b5cf6';
    return '#3b82f6';
  };

  const upcoming = appointments.filter(a => (a.status || '').toLowerCase() !== 'completed' && (a.status || '').toLowerCase() !== 'cancelled');
  const completed = appointments.filter(a => (a.status || '').toLowerCase() === 'completed');
  const filtered = filter === 'completed' ? completed : upcoming;

  const parseData = (apt) => {
    try {
      return typeof apt.data === 'string' ? JSON.parse(apt.data) : (apt.data || {});
    } catch { return {}; }
  };

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

      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>Loading checkup forms...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px', color: '#6b7280' }}>
          <p style={{ fontSize: '1.1rem' }}>{filter === 'completed' ? 'No completed forms yet.' : 'No upcoming checkup forms for your branch.'}</p>
        </div>
      ) : (
        <div>
          {filtered.map(apt => {
            const data = parseData(apt);
            const statusColor = getStatusColor(apt.status);
            const statusLabel = apt.status || 'pending';
            const sl = statusLabel.toLowerCase();
            const dateStr = apt.date ? new Date(apt.date).toLocaleDateString('en-GB') : '';
            const timeStr = apt.time ? apt.time.slice(0, 5) : '';

            return (
              <div key={apt.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderLeft: `4px solid ${statusColor}`, borderRadius: '10px', padding: '16px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1f2937', marginBottom: '4px' }}>{apt.full_name || 'Unknown'}</div>
                    <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>
                      {apt.phone || ''}{apt.email ? ` • ${apt.email}` : ''}
                    </div>
                    {data.concern && <div style={{ fontSize: '0.85rem', color: '#374151', marginTop: '4px' }}><strong>Concern:</strong> {data.concern}</div>}
                    {data.distributorName && <div style={{ fontSize: '0.85rem', color: '#374151' }}><strong>Referred by:</strong> {data.distributorName} ({data.distributorNB || ''})</div>}
                    {data.conditions && data.conditions !== 'None' && <div style={{ fontSize: '0.85rem', color: '#374151' }}><strong>Conditions:</strong> {data.conditions}</div>}
                    {data.acknowledgedBy && <div style={{ fontSize: '0.82rem', color: '#059669', marginTop: '4px' }}>Acknowledged by: <strong>{data.acknowledgedBy}</strong> ({data.acknowledgedInitials || ''}) on {data.acknowledgedDate || ''}</div>}
                  </div>
                  <div style={{ textAlign: 'right', minWidth: '120px' }}>
                    <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>{dateStr}{timeStr ? ` at ${timeStr}` : ''}</div>
                    <span style={{ display: 'inline-block', marginTop: '4px', padding: '3px 10px', background: `${statusColor}20`, color: statusColor, borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, textTransform: 'capitalize' }}>{statusLabel}</span>
                  </div>
                </div>
                {sl !== 'completed' && sl !== 'cancelled' && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap', borderTop: '1px solid #f3f4f6', paddingTop: '10px' }}>
                    <button onClick={() => viewDetail(apt)} style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>View Details</button>
                    <button onClick={() => openReportModal(apt)} style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#c41e3a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Create Report</button>
                    {(sl === 'pending' || sl === 'walk-in') && <button onClick={() => updateStatus(apt, 'checked_in')} style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#8b5cf6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Check In</button>}
                    {sl === 'checked_in' && <button onClick={() => updateStatus(apt, 'in_progress')} style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Start Checkup</button>}
                    <button onClick={() => updateStatus(apt, 'completed')} style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#22c55e', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Mark Complete</button>
                  </div>
                )}
                {sl === 'completed' && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap', borderTop: '1px solid #f3f4f6', paddingTop: '10px' }}>
                    <button onClick={() => viewDetail(apt)} style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#6b7280', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>View Details</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showDetail && detailCheckup && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowDetail(false); }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', zIndex: 999999, overflowY: 'auto', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ maxWidth: '700px', margin: '20px auto', background: 'white', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: 0, color: '#1f2937', fontSize: '1.1rem' }}>Checkup Form Details</h3>
              <button onClick={() => setShowDetail(false)} style={{ padding: '8px 16px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer' }}>Close</button>
            </div>
            <div style={{ padding: '24px' }}>
              <CheckupDetailContent apt={detailCheckup} />
            </div>
            {(detailCheckup.status || '').toLowerCase() !== 'completed' && (detailCheckup.status || '').toLowerCase() !== 'cancelled' && (
              <div style={{ padding: '16px 24px', borderTop: '2px solid #e5e7eb', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button onClick={() => { setShowDetail(false); openReportModal(detailCheckup); }} style={{ padding: '10px 20px', background: '#c41e3a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>Create Report & Prescription</button>
              </div>
            )}
          </div>
        </div>
      )}

      {showReport && selectedCheckup && (() => {
        const apt = selectedCheckup;
        const data = (() => { try { return typeof apt.data === 'string' ? JSON.parse(apt.data) : (apt.data || {}); } catch { return {}; } })();
        const rawSym = data.symptoms;
        const symptoms = (Array.isArray(rawSym) ? rawSym : (rawSym && typeof rawSym === 'object') ? Object.values(rawSym).flat() : []).filter(s => s !== 'none');
        const lifestyleRecs = getLifestyleRecommendations();
        return (
          <div onClick={e => { if (e.target === e.currentTarget) setShowReport(false); }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', zIndex: 999999, overflowY: 'auto', padding: '20px', boxSizing: 'border-box' }}>
            <div style={{ maxWidth: '1000px', margin: '20px auto', background: 'white', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowReport(false)} style={{ position: 'absolute', top: '10px', right: '15px', background: 'none', border: 'none', fontSize: '1.8rem', cursor: 'pointer', color: '#666', zIndex: 10 }}>&times;</button>
              </div>

              <div style={{ background: 'linear-gradient(135deg, #c41e3a 0%, #a01830 100%)', padding: '20px 30px', textAlign: 'center', color: 'white', borderRadius: '12px 12px 0 0' }}>
                <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>DYNAPHARM INTERNATIONAL NAMIBIA</h2>
                <p style={{ margin: '4px 0', opacity: 0.85, fontSize: '0.9rem' }}>Branch: {data.branch || user?.branch || ''}</p>
                <h3 style={{ margin: '8px 0 0', fontSize: '1.1rem' }}>Summary Analysis Report Card</h3>
              </div>

              <div style={{ padding: '24px 30px' }}>
                {error && <div style={{ background: '#fee', border: '1px solid #c00', color: '#c00', padding: '10px', borderRadius: '6px', marginBottom: '15px' }}>{error}</div>}

                <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                  <div><strong>Reference:</strong> {apt.id || 'N/A'}</div>
                  <div><strong>Name:</strong> {apt.full_name || data.fullName || ''}</div>
                  <div><strong>Age:</strong> {data.age || apt.age || 'N/A'}</div>
                  <div><strong>Gender:</strong> {data.gender || ''}</div>
                  <div><strong>Phone:</strong> {data.phone || apt.phone || ''}</div>
                  <div><strong>Date:</strong> {new Date().toLocaleDateString()}</div>
                  <div><strong>Consultant:</strong> {user?.full_name || user?.username || ''}</div>
                  <div><strong>Height:</strong> {data.height || 'N/A'}cm | <strong>Weight:</strong> {data.weight || 'N/A'}kg</div>
                </div>

                <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '15px', marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#2c3e50' }}>Presenting Symptoms</h3>
                  {symptoms.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {symptoms.map((s, i) => (
                        <span key={i} style={{ background: '#e3f2fd', color: '#1565c0', padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 500 }}>{(s || '').toUpperCase().replace(/_/g, ' ')}</span>
                      ))}
                    </div>
                  ) : <p style={{ color: '#7f8c8d', fontStyle: 'italic', margin: 0 }}>No specific symptoms reported</p>}
                </div>

                <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '15px', marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#2c3e50' }}>Health Assessment</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '10px' }}>
                    <div><strong>Primary Reason:</strong> {data.primaryReason || data.reason || 'N/A'}</div>
                    <div><strong>Water Intake:</strong> {data.waterIntake || 'Not specified'}</div>
                    <div><strong>Exercise:</strong> {data.exerciseFreq || 'Not specified'}</div>
                    <div><strong>Sleep:</strong> {data.sleepHours || 'Not specified'}</div>
                    <div><strong>Stress Level:</strong> {data.stressLevel || 'Not specified'}/10</div>
                    <div><strong>Medical History:</strong> {Array.isArray(data.medicalHistory) ? data.medicalHistory.join(', ') : 'None'}</div>
                  </div>
                </div>

                <div style={{ background: '#e3f2fd', borderLeft: '5px solid #2196f3', borderRadius: '8px', padding: '15px', marginBottom: '20px' }}>
                  <h3 style={{ color: '#2196f3', margin: '0 0 8px', fontSize: '1rem' }}>🩺 ABOUT THE PROBLEMS OF SUB-HEALTH TRENDS</h3>
                  <p style={{ marginBottom: '15px', color: '#666', fontSize: '0.9rem' }}>Select the body system(s) and symptoms affecting the patient to view lifestyle recommendations:</p>
                  <div style={{ display: 'grid', gap: '12px', marginBottom: '15px' }}>
                    {Object.entries(BODY_SYSTEMS_DATABASE).map(([systemName, system]) => {
                      const sysId = systemName.replace(/[^a-zA-Z0-9]/g, '_');
                      const isOpen = selectedSystems[sysId];
                      return (
                        <div key={sysId} style={{ background: 'white', border: '2px solid #e0e0e0', borderRadius: '8px', padding: '12px', transition: 'all 0.3s' }}>
                          <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => setSelectedSystems(p => ({ ...p, [sysId]: !p[sysId] }))}>
                            <input type="checkbox" checked={!!isOpen} readOnly style={{ width: '18px', height: '18px', marginRight: '10px', cursor: 'pointer' }} />
                            <h4 style={{ color: '#2196f3', margin: 0, flex: 1, fontSize: '1rem' }}>{systemName}</h4>
                            <span style={{ fontSize: '1.1rem', color: '#2196f3' }}>{isOpen ? '▲' : '▼'}</span>
                          </div>
                          {isOpen && (
                            <div style={{ marginTop: '10px', paddingLeft: '28px' }}>
                              <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '6px', fontWeight: 600 }}>Common Symptoms:</p>
                              {Object.keys(system.symptoms).map((symptom, si) => {
                                const key = `${sysId}__${symptom}`;
                                return (
                                  <label key={si} style={{ display: 'block', padding: '4px 0', cursor: 'pointer', fontSize: '0.9rem' }}>
                                    <input type="checkbox" checked={!!selectedSymptomChecks[key]} onChange={() => toggleSystemSymptom(sysId, symptom)} style={{ marginRight: '8px' }} />
                                    {symptom}
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {lifestyleRecs.length > 0 && (
                    <div style={{ background: 'white', padding: '15px', borderRadius: '8px', border: '2px solid #2196f3' }}>
                      <h4 style={{ color: '#2196f3', marginBottom: '15px', fontSize: '1.1rem' }}>📋 Healthy Lifestyle Recommendations</h4>
                      <div style={{ display: 'grid', gap: '10px' }}>
                        {lifestyleRecs.map((item, i) => (
                          <div key={i} style={{ background: '#e3f2fd', padding: '10px 14px', borderRadius: '8px', borderLeft: '4px solid #2196f3' }}>
                            <div style={{ display: 'flex', alignItems: 'start', gap: '8px' }}>
                              <span style={{ fontSize: '1.1rem', color: '#2196f3' }}>✓</span>
                              <div style={{ flex: 1 }}>
                                <strong style={{ color: '#1976d2', fontSize: '0.9rem' }}>{item.symptom}</strong>
                                <span style={{ color: '#666', fontSize: '0.8rem', marginLeft: '8px' }}>({item.system})</span>
                                <p style={{ margin: '4px 0 0', color: '#555', lineHeight: 1.5, fontSize: '0.85rem' }}>{item.recommendation}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {currentRecommendations && (
                  <div style={{ background: '#e8f5e9', borderLeft: '5px solid #27ae60', borderRadius: '8px', padding: '15px', marginBottom: '20px' }}>
                    <h3 style={{ color: '#27ae60', margin: '0 0 8px', fontSize: '1rem' }}>🎯 AI-Powered Product Recommendations</h3>
                    <p style={{ marginBottom: '12px', color: '#666', fontSize: '0.9rem' }}>Based on symptoms and health conditions, here are suggested products:</p>
                    <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '2px solid #27ae60' }}>
                      {Array.from(currentRecommendations.recommendations).map((medicine, i) => {
                        const reasons = currentRecommendations.reasonsMap.get(medicine) || [];
                        const uniqueReasons = [...new Set(reasons)];
                        return (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: i < currentRecommendations.recommendations.size - 1 ? '1px solid #e0e0e0' : 'none' }}>
                            <div style={{ flex: 1 }}>
                              <strong style={{ color: '#27ae60', fontSize: '1rem' }}>✓ {medicine}</strong>
                              <div style={{ marginTop: '4px', fontSize: '0.8rem', color: '#666' }}>
                                {uniqueReasons.map((r, ri) => (
                                  <span key={ri} style={{ background: '#fff', padding: '2px 8px', borderRadius: '10px', marginRight: '5px', display: 'inline-block', marginTop: '3px', border: '1px solid #ddd' }}>🎯 {r}</span>
                                ))}
                              </div>
                            </div>
                            <button onClick={() => selectRecommendedMedicine(medicine)} style={{ padding: '5px 15px', fontSize: '0.85rem', background: selectedMedicines.has(medicine) ? '#2ecc71' : '#27ae60', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', marginLeft: '10px' }}>
                              {selectedMedicines.has(medicine) ? '✓ Added' : 'Add'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <button onClick={applyAllRecommendations} style={{ marginTop: '12px', width: '100%', padding: '10px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem' }}>
                      ✅ Apply All Recommended Products
                    </button>
                  </div>
                )}

                <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '15px', marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#2c3e50' }}>Consultant's Notes & Diagnosis</h3>
                  <textarea value={consultantNotes} onChange={e => setConsultantNotes(e.target.value)} rows={5} style={{ width: '100%', padding: '10px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '0.95rem', resize: 'vertical', boxSizing: 'border-box' }} placeholder="Enter diagnosis and treatment notes..." />
                  {consultantNotes && (
                    <div style={{ marginTop: '8px', background: '#f8f9fa', padding: '10px', borderRadius: '6px' }}>
                      <h4 style={{ margin: '0 0 5px', fontSize: '0.9rem', color: '#2c3e50' }}>Diagnosis & Treatment Notes:</h4>
                      <div style={{ color: '#555', fontSize: '0.9rem' }}>{consultantNotes}</div>
                    </div>
                  )}
                </div>

                <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '15px', marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#2c3e50' }}>Follow-up Information</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'center' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem', fontWeight: 500 }}>Recommended Follow-up Date:</label>
                      <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} style={{ width: '100%', padding: '8px', border: '2px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.9rem', fontWeight: 500 }}>Follow-up Notes (Optional):</label>
                      <input type="text" value={followUpNotes} onChange={e => setFollowUpNotes(e.target.value)} placeholder="e.g., Review progress, adjust dosage..." style={{ width: '100%', padding: '8px', border: '2px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                </div>

                <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '15px', marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 10px', fontSize: '1rem', color: '#2c3e50' }}>Prescription & Medicine Selection</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '8px', maxHeight: '400px', overflowY: 'auto', marginBottom: '12px' }}>
                    {Object.entries(PACKAGE_DATABASE).map(([pkgName, pkgInfo], idx) => (
                      <div key={`pkg-${idx}`} style={{ background: '#e8f5e9', borderLeft: '4px solid #27ae60', padding: '10px', borderRadius: '6px', display: 'flex', alignItems: 'start', gap: '8px' }}>
                        <input type="checkbox" checked={selectedMedicines.has(pkgName)} onChange={() => toggleMedicine(pkgName)} style={{ marginTop: '3px', width: '16px', height: '16px', cursor: 'pointer' }} />
                        <label style={{ cursor: 'pointer', flex: 1 }} onClick={() => toggleMedicine(pkgName)}>
                          <span style={{ fontWeight: 'bold', color: '#27ae60' }}>📦 {pkgName}</span>
                          <br /><small style={{ color: '#666' }}>Package ({pkgInfo.products.length} products) - DP: N${pkgInfo.price.dp} | CP: N${pkgInfo.price.cp} | BV: {pkgInfo.price.bv}</small>
                          <br /><small style={{ fontSize: '0.75rem', color: '#888' }}>Contains: {pkgInfo.products.map(p => `${p.name} (Qty: ${p.quantity})`).join(', ')}</small>
                        </label>
                      </div>
                    ))}
                    {getLiveProductList().map((product, idx) => (
                      <div key={`prod-${idx}`} style={{ padding: '8px', borderRadius: '6px', display: 'flex', alignItems: 'start', gap: '8px', border: '1px solid #f0f0f0' }}>
                        <input type="checkbox" checked={selectedMedicines.has(product.description)} onChange={() => toggleMedicine(product.description)} style={{ marginTop: '3px', width: '16px', height: '16px', cursor: 'pointer' }} />
                        <label style={{ cursor: 'pointer', flex: 1 }} onClick={() => toggleMedicine(product.description)}>
                          {product.description}
                          <br /><small style={{ color: '#666', fontSize: '0.85rem' }}>DP: N${product.dp} | CP: N${product.cp} | BV: {product.bv}</small>
                        </label>
                      </div>
                    ))}
                  </div>
                  {selectedMedicines.size > 0 && (
                    <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px solid #86efac' }}>
                      <h4 style={{ margin: '0 0 8px', color: '#166534' }}>Prescribed Medicines:</h4>
                      <ul style={{ margin: 0, paddingLeft: '20px' }}>
                        {Array.from(selectedMedicines).map((med, i) => <li key={i} style={{ padding: '2px 0', color: '#166534' }}>{med}</li>)}
                      </ul>
                    </div>
                  )}
                </div>

                <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                      <div>
                        <h4 style={{ margin: '0 0 4px', color: '#2c3e50' }}>Consultant Signature</h4>
                        <div style={{ borderBottom: '2px solid #333', width: '200px', marginBottom: '4px' }}></div>
                        <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>{user?.full_name || user?.username || ''}</p>
                        <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px' }}>
                          <p style={{ margin: 0 }}>Tel: {user?.phone || '061-300877'}</p>
                          <p style={{ margin: 0 }}>Email: {user?.email || 'info@dynapharm.com.na'}</p>
                        </div>
                      </div>
                      <div>
                        <h4 style={{ margin: '0 0 4px', color: '#2c3e50' }}>Follow-up Date</h4>
                        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#c41e3a' }}>
                          {followUpDate ? new Date(followUpDate).toLocaleDateString('en-GB') : '________________'}
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#666' }}>Next appointment recommended</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ background: 'white', border: '2px solid #e0e0e0', borderRadius: '8px', padding: '15px', marginBottom: '20px' }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#2c3e50' }}>Report Required Flag</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontSize: '0.9rem', color: '#374151', fontWeight: 500 }}>Report Required:</span>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        type="button"
                        onClick={() => setReportRequired(true)}
                        style={{ padding: '7px 20px', borderRadius: '6px', border: '2px solid', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', background: reportRequired ? '#c41e3a' : '#fff', color: reportRequired ? '#fff' : '#c41e3a', borderColor: '#c41e3a', transition: 'all 0.2s' }}
                      >Yes</button>
                      <button
                        type="button"
                        onClick={() => setReportRequired(false)}
                        style={{ padding: '7px 20px', borderRadius: '6px', border: '2px solid', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', background: !reportRequired ? '#6b7280' : '#fff', color: !reportRequired ? '#fff' : '#6b7280', borderColor: '#6b7280', transition: 'all 0.2s' }}
                      >No</button>
                    </div>
                    <span style={{ fontSize: '0.82rem', color: reportRequired ? '#c41e3a' : '#6b7280', fontWeight: 600 }}>
                      {reportRequired ? '⚠️ Report required for dispensing' : '✓ No report required'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <div></div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={handleSaveReport} disabled={submitting} style={{ padding: '10px 20px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', opacity: submitting ? 0.6 : 1 }}>
                      {submitting ? '⏳ Saving...' : '💾 Save Report'}
                    </button>
                    <button onClick={handleSaveReport} disabled={submitting} style={{ padding: '10px 20px', background: '#3498db', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem', opacity: submitting ? 0.6 : 1 }}>
                      ✅ Finalize & E-Sign
                    </button>
                    <button onClick={printReport} style={{ padding: '10px 20px', background: '#f39c12', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
                      🖨️ Print
                    </button>
                    <button onClick={() => setShowReport(false)} style={{ padding: '10px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' }}>
                      📄 Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function CheckupDetailContent({ apt }) {
  const data = (() => { try { return typeof apt.data === 'string' ? JSON.parse(apt.data) : (apt.data || {}); } catch { return {}; } })();
  const visitType = (apt.status || '').toLowerCase() === 'walk-in' ? 'Walk-in' : 'Book Appointment';
  const dateStr = apt.date ? new Date(apt.date).toLocaleDateString('en-GB') : '';
  const timeStr = apt.time ? apt.time.slice(0, 5) : '';
  const rawType = data.membershipStatus || data.membership_status || data.customer_type || data.clientType || 'referred';
  const clientType = rawType === 'member' ? '🏅 Registered Member (Distributor)' : '👤 Non-Member (Referred)';

  const fieldStyle = { marginBottom: '8px', fontSize: '0.9rem', color: '#374151' };
  const labelStyle = { fontWeight: 600, color: '#1e293b' };
  const sectionStyle = { marginBottom: '20px' };
  const sectionTitleStyle = { fontSize: '1rem', fontWeight: 700, color: '#c41e3a', marginBottom: '12px', paddingBottom: '6px', borderBottom: '2px solid #fee2e2' };

  return (
    <div>
      <div style={sectionStyle}>
        <h4 style={sectionTitleStyle}>Visit Information</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div style={fieldStyle}><span style={labelStyle}>Visit Type:</span> {visitType}</div>
          <div style={fieldStyle}><span style={labelStyle}>Branch:</span> {apt.branch || 'N/A'}</div>
          <div style={fieldStyle}><span style={labelStyle}>Date:</span> {dateStr || 'N/A'}</div>
          <div style={fieldStyle}><span style={labelStyle}>Time:</span> {timeStr || 'N/A'}</div>
        </div>
      </div>
      <div style={sectionStyle}>
        <h4 style={sectionTitleStyle}>Personal Information</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div style={fieldStyle}><span style={labelStyle}>Full Name:</span> {apt.full_name || 'N/A'}</div>
          <div style={fieldStyle}><span style={labelStyle}>Phone:</span> {apt.phone || 'N/A'}</div>
          <div style={fieldStyle}><span style={labelStyle}>Email:</span> {apt.email || 'N/A'}</div>
          <div style={fieldStyle}><span style={labelStyle}>Gender:</span> {data.gender || 'N/A'}</div>
          <div style={fieldStyle}><span style={labelStyle}>Date of Birth:</span> {data.dob || 'N/A'}</div>
        </div>
      </div>
      <div style={sectionStyle}>
        <h4 style={sectionTitleStyle}>Client Type</h4>
        <div style={fieldStyle}><span style={labelStyle}>Type:</span> {clientType}</div>
        {rawType !== 'member' && (
          <div style={fieldStyle}><span style={labelStyle}>Referred By:</span> {data.referral_name || data.referralName || data.distributorName || 'Dynapharm Namibia'} ({data.referral_nb || data.referralNB || data.distributorNB || 'NB005676'})</div>
        )}
        {rawType === 'member' && (data.referral_nb || data.nb_number) && (
          <div style={fieldStyle}><span style={labelStyle}>NB Number:</span> {data.referral_nb || data.nb_number}</div>
        )}
      </div>
      <div style={sectionStyle}>
        <h4 style={sectionTitleStyle}>Health Information</h4>
        <div style={fieldStyle}><span style={labelStyle}>Health Concern:</span> {data.concern || 'N/A'}</div>
        <div style={fieldStyle}><span style={labelStyle}>Medical Conditions:</span> {data.conditions || 'None'}</div>
        <div style={fieldStyle}><span style={labelStyle}>Current Medications:</span> {data.medications || 'None'}</div>
        {data.additionalNotes && <div style={fieldStyle}><span style={labelStyle}>Additional Notes:</span> {data.additionalNotes}</div>}
      </div>
      {data.acknowledgedBy && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px', marginTop: '12px' }}>
          <div style={{ fontSize: '0.85rem', color: '#059669' }}>
            <strong>Acknowledged by:</strong> {data.acknowledgedBy} ({data.acknowledgedInitials || ''}) on {data.acknowledgedDate || ''}
          </div>
        </div>
      )}
    </div>
  );
}

function ClientsSection() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    api.clients.list()
      .then(data => setClients(Array.isArray(data) ? data : data.clients || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const showAllClients = () => { setSearch(''); setBranchFilter(''); };

  const filtered = clients.filter(c => {
    if (search) {
      const q = search.toLowerCase();
      const match = (c.full_name || c.fullName || c.name || '').toLowerCase().includes(q)
        || (c.phone || '').includes(q)
        || (c.reference || c.referenceNumber || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (branchFilter && (c.branch || '') !== branchFilter) return false;
    return true;
  }).sort((a, b) => new Date(b.timestamp || b.created_at || 0) - new Date(a.timestamp || a.created_at || 0));

  const openClientDetails = (client, edit = false) => {
    setSelectedClient(client);
    setEditMode(edit);
    if (edit) {
      setEditForm({ ...client });
    }
  };

  const handleSaveClient = async () => {
    try {
      await api.clients.update(selectedClient.id, editForm);
      setClients(prev => prev.map(c => c.id === selectedClient.id ? { ...c, ...editForm } : c));
      setEditMode(false);
      setSelectedClient({ ...selectedClient, ...editForm });
    } catch (err) {
      alert('Failed to save: ' + (err.message || 'Unknown error'));
    }
  };

  const printClientDetails = (client) => {
    const w = window.open('', '_blank', 'width=850,height=700');
    if (!w) return;
    const name = client.full_name || client.fullName || client.name || '';
    const memberStatus = client.membershipStatus || client.membership_status || 'referred';
    const symptoms = Array.isArray(client.symptoms) ? client.symptoms : [];
    const medHistory = Array.isArray(client.medicalHistory) ? client.medicalHistory.join(', ') : (client.medicalHistory || client.medical_history || 'None');
    const e = (v) => escHtml(String(v || ''));
    w.document.write(`<!DOCTYPE html><html><head><title>Client Form — ${e(name)}</title>
    <style>
      @media print { body{margin:0;} @page{size:A4;margin:14mm;} .no-print{display:none;} }
      * { box-sizing:border-box; }
      body { font-family:Arial,sans-serif; font-size:12px; color:#1e293b; margin:20px; line-height:1.5; }
      .header { display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #c41e3a; padding-bottom:12px; margin-bottom:18px; }
      .logo-area h2 { color:#c41e3a; font-size:18px; margin:0; }
      .logo-area p { color:#64748b; font-size:11px; margin:2px 0 0; }
      .ref-box { text-align:right; }
      .ref-box .ref-num { font-size:20px; font-weight:900; color:#1e293b; }
      .ref-box .ref-label { font-size:10px; color:#94a3b8; text-transform:uppercase; letter-spacing:.08em; }
      .section { margin-bottom:16px; border:1px solid #e2e8f0; border-radius:8px; overflow:hidden; }
      .section-title { background:#1e3a5f; color:white; padding:7px 14px; font-size:11px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; }
      .section-body { padding:12px 14px; }
      .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:6px 20px; }
      .grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px 20px; }
      .field { margin-bottom:5px; }
      .field-label { font-size:10px; color:#94a3b8; font-weight:600; text-transform:uppercase; letter-spacing:.04em; }
      .field-value { font-size:12px; color:#1e293b; font-weight:600; }
      .tag { display:inline-block; padding:2px 10px; background:#fee2e2; color:#c41e3a; border-radius:12px; font-size:11px; margin:2px 3px 2px 0; }
      .badge { display:inline-block; padding:3px 10px; border-radius:12px; font-size:11px; font-weight:700; }
      .badge-member { background:#dcfce7; color:#16a34a; }
      .badge-referred { background:#fef9c3; color:#b45309; }
      .sig-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:24px; margin-top:30px; }
      .sig-line { border-top:1px solid #aaa; padding-top:4px; font-size:10px; color:#666; text-align:center; }
      .print-btn { background:#1e3a5f; color:white; border:none; padding:9px 20px; border-radius:7px; font-size:12px; cursor:pointer; margin-bottom:14px; }
    </style></head><body>
    <button class="no-print print-btn" onclick="window.print()">🖨️ Print Form</button>
    <div class="header">
      <div class="logo-area">
        <h2>Dynapharm International Namibia</h2>
        <p>Health · Wealth · Freedom</p>
        ${client.branch ? `<p style="color:#c41e3a;font-weight:600;margin-top:4px;">${e(client.branch)} Branch</p>` : ''}
      </div>
      <div class="ref-box">
        <div class="ref-label">Client Reference</div>
        <div class="ref-num">${e(client.reference || client.referenceNumber || client.id || 'N/A')}</div>
        <div style="font-size:11px;color:#64748b;margin-top:4px;">Registered: ${client.timestamp ? new Date(client.timestamp).toLocaleDateString('en-GB') : (client.created_at ? new Date(client.created_at).toLocaleDateString('en-GB') : 'N/A')}</div>
        <div style="margin-top:6px;"><span class="badge ${memberStatus === 'member' ? 'badge-member' : 'badge-referred'}">${memberStatus === 'member' ? '🏅 Registered Member' : '🤝 Referred Client'}</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Personal Information</div>
      <div class="section-body">
        <div class="grid2">
          <div class="field"><div class="field-label">Full Name</div><div class="field-value">${e(name)}</div></div>
          <div class="field"><div class="field-label">Namibian ID (NB#)</div><div class="field-value">${e(client.nbNumber || client.nb_number || 'Not provided')}</div></div>
          <div class="field"><div class="field-label">Date of Birth</div><div class="field-value">${e(client.dob || 'Not provided')}</div></div>
          <div class="field"><div class="field-label">Age</div><div class="field-value">${e(client.age || 'Not provided')} ${client.age ? 'years' : ''}</div></div>
          <div class="field"><div class="field-label">Gender</div><div class="field-value">${e(client.gender || 'Not provided')}</div></div>
          <div class="field"><div class="field-label">Phone</div><div class="field-value">${e(client.phone || 'Not provided')}</div></div>
          <div class="field"><div class="field-label">Email</div><div class="field-value">${e(client.email || 'Not provided')}</div></div>
          <div class="field"><div class="field-label">Height</div><div class="field-value">${e(client.height || 'Not provided')} ${client.height ? 'cm' : ''}</div></div>
          <div class="field"><div class="field-label">Weight</div><div class="field-value">${e(client.weight || 'Not provided')} ${client.weight ? 'kg' : ''}</div></div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Member / Referral Information</div>
      <div class="section-body">
        <div class="grid2">
          ${memberStatus === 'member' ? `
          <div class="field"><div class="field-label">Member ID</div><div class="field-value">${e(client.memberId || client.member_id || 'Not provided')}</div></div>
          <div class="field"><div class="field-label">Member Since</div><div class="field-value">${e(client.memberSince || client.member_since || 'Not provided')}</div></div>
          ` : `
          <div class="field"><div class="field-label">Referred By</div><div class="field-value">${e(client.referralName || client.referral_name || 'Not provided')}</div></div>
          <div class="field"><div class="field-label">Referral NB#</div><div class="field-value">${e(client.referralNbNumber || client.referral_nb || 'Not provided')}</div></div>
          `}
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Health Assessment</div>
      <div class="section-body">
        <div class="grid3" style="margin-bottom:10px;">
          <div class="field"><div class="field-label">Primary Reason for Visit</div><div class="field-value">${e(client.primaryReason || client.primary_reason || 'Not provided')}</div></div>
          <div class="field"><div class="field-label">Water Intake</div><div class="field-value">${e(client.waterIntake || client.water_intake || 'Not specified')}</div></div>
          <div class="field"><div class="field-label">Exercise Frequency</div><div class="field-value">${e(client.exerciseFreq || client.exercise_freq || 'Not specified')}</div></div>
          <div class="field"><div class="field-label">Sleep (hours/night)</div><div class="field-value">${e(client.sleepHours || client.sleep_hours || 'Not specified')}</div></div>
          <div class="field"><div class="field-label">Stress Level (1–10)</div><div class="field-value">${e(client.stressLevel || client.stress_level || 'Not specified')}${(client.stressLevel || client.stress_level) ? '/10' : ''}</div></div>
          <div class="field"><div class="field-label">Current Medications</div><div class="field-value">${e(client.currentMedications || client.medications || 'None')}</div></div>
          <div class="field"><div class="field-label">Allergies</div><div class="field-value">${e(client.allergies || 'None')}</div></div>
        </div>
        <div class="field"><div class="field-label">Medical History</div><div class="field-value">${e(medHistory)}</div></div>
        ${symptoms.length > 0 ? `<div style="margin-top:10px;"><div class="field-label" style="margin-bottom:6px;">Symptoms / Complaints</div><div>${symptoms.map(s => `<span class="tag">${e(s)}</span>`).join('')}</div></div>` : ''}
      </div>
    </div>

    <div class="sig-grid">
      <div class="sig-line">Client Signature: ___________________</div>
      <div class="sig-line">Consultant: ___________________</div>
      <div class="sig-line">Date: ___________________</div>
    </div>

    </body></html>`);
    w.document.close();
  };

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
        <button onClick={() => {}} style={{ background: '#c41e3a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>Search</button>
        <button onClick={showAllClients} style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>Show All</button>
      </div>
      {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#7f8c8d' }}>
          <h3>📋 No clients found</h3>
          <p>{branchFilter ? 'No clients registered for the selected branch.' : 'Clients will appear here once they register through the client portal.'}</p>
        </div>
      ) : (
        <div>
          {filtered.map(c => {
            const name = c.full_name || c.fullName || c.name || 'Unknown';
            const ref = c.reference || c.referenceNumber || '';
            const memberStatus = c.membershipStatus || c.membership_status || 'referred';
            return (
              <div key={c.id} className="client-card" style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '16px', marginBottom: '12px', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '15px' }}>
                  <div>
                    <h4 style={{ color: '#c41e3a', marginBottom: '5px', margin: 0, fontSize: '1rem', fontWeight: 600 }}>{name}</h4>
                    <p style={{ color: '#7f8c8d', fontSize: '0.9rem', margin: '2px 0 0' }}>Reference: {ref}</p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ background: memberStatus === 'member' ? '#e8f5e9' : '#fff3cd', color: memberStatus === 'member' ? '#27ae60' : '#f39c12', padding: '4px 8px', borderRadius: '3px', fontSize: '0.8rem' }}>
                      {memberStatus === 'member' ? '👤 Member' : '🤝 Referred'}
                    </span>
                    {c.branch && <span style={{ background: '#e8f5e9', color: '#27ae60', padding: '4px 8px', borderRadius: '3px', fontSize: '0.8rem', marginLeft: '5px' }}>{c.branch}</span>}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '15px' }}>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#374151' }}><strong>📞 Phone:</strong> {c.phone || 'N/A'}</p>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#374151' }}><strong>🎂 DOB:</strong> {c.dob || 'Not provided'}</p>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#374151' }}><strong>⚧ Gender:</strong> {c.gender || 'Not provided'}</p>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#374151' }}><strong>📧 Email:</strong> {c.email || 'Not provided'}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={() => openClientDetails(c, false)} style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>👁️ View Details</button>
                  <button onClick={() => openClientDetails(c, true)} style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>✏️ Edit</button>
                  <button onClick={() => printClientDetails(c)} style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#6b7280', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>🖨️ Print</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedClient && (
        <div onClick={e => { if (e.target === e.currentTarget) { setSelectedClient(null); setEditMode(false); } }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999999, overflowY: 'auto', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ maxWidth: '900px', margin: '20px auto', background: 'white', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: 0, color: '#1f2937', fontSize: '1.1rem' }}>{editMode ? 'Edit Client Details' : 'Client Details'} - {selectedClient.reference || selectedClient.referenceNumber || ''}</h3>
              <button onClick={() => { setSelectedClient(null); setEditMode(false); }} style={{ padding: '8px 16px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: '24px' }}>
              {editMode ? (
                <ClientEditForm form={editForm} setForm={setEditForm} />
              ) : (
                <ClientViewDetails client={selectedClient} />
              )}
            </div>
            <div style={{ textAlign: 'center', padding: '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {editMode ? (
                <>
                  <button onClick={handleSaveClient} style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>💾 Save Changes</button>
                  <button onClick={() => setEditMode(false)} style={{ padding: '10px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>❌ Cancel</button>
                </>
              ) : (
                <>
                  <button onClick={() => { setEditForm({ ...selectedClient }); setEditMode(true); }} style={{ padding: '10px 20px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>✏️ Edit Details</button>
                  <button onClick={() => printClientDetails(selectedClient)} style={{ padding: '10px 20px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>🖨️ Print Details</button>
                  <button onClick={() => { setSelectedClient(null); setEditMode(false); }} style={{ padding: '10px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Close</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ClientViewDetails({ client }) {
  const name = client.full_name || client.fullName || client.name || '';
  const memberStatus = client.membershipStatus || client.membership_status || 'referred';
  const symptoms = Array.isArray(client.symptoms) ? client.symptoms : [];

  const sectionStyle = { marginBottom: '20px', background: '#f8f9fa', padding: '16px', borderRadius: '8px' };
  const sectionTitleStyle = { fontSize: '1rem', fontWeight: 600, color: '#2c3e50', marginBottom: '12px' };
  const gridStyle = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' };
  const fieldStyle = { fontSize: '0.9rem', color: '#374151', margin: 0 };

  return (
    <div>
      <div style={sectionStyle}>
        <h4 style={sectionTitleStyle}>Personal Information</h4>
        <div style={gridStyle}>
          <div style={fieldStyle}><strong>Full Name:</strong> {name}</div>
          <div style={fieldStyle}><strong>Namibian ID:</strong> {client.nbNumber || client.nb_number || 'Not provided'}</div>
          <div style={fieldStyle}><strong>Date of Birth:</strong> {client.dob || 'Not provided'}</div>
          <div style={fieldStyle}><strong>Age:</strong> {client.age || 'Not provided'} years</div>
          <div style={fieldStyle}><strong>Gender:</strong> {client.gender || 'Not provided'}</div>
          <div style={fieldStyle}><strong>Phone:</strong> {client.phone || 'Not provided'}</div>
          <div style={fieldStyle}><strong>Email:</strong> {client.email || 'Not provided'}</div>
          <div style={fieldStyle}><strong>Height:</strong> {client.height || 'Not provided'} cm</div>
          <div style={fieldStyle}><strong>Weight:</strong> {client.weight || 'Not provided'} kg</div>
        </div>
      </div>
      <div style={sectionStyle}>
        <h4 style={sectionTitleStyle}>Member/Referral Information</h4>
        <div style={gridStyle}>
          <div style={fieldStyle}><strong>Membership Status:</strong> {memberStatus === 'member' ? 'Registered Member' : 'Referred by Member'}</div>
          {memberStatus === 'member' ? (
            <>
              <div style={fieldStyle}><strong>Member ID:</strong> {client.memberId || client.member_id || 'Not provided'}</div>
              <div style={fieldStyle}><strong>Member Since:</strong> {client.memberSince || client.member_since || 'Not provided'}</div>
            </>
          ) : (
            <>
              <div style={fieldStyle}><strong>Referred by:</strong> {client.referralName || client.referral_name || 'Not provided'}</div>
              <div style={fieldStyle}><strong>Referral NB:</strong> {client.referralNbNumber || client.referral_nb || 'Not provided'}</div>
            </>
          )}
        </div>
      </div>
      <div style={sectionStyle}>
        <h4 style={sectionTitleStyle}>Health Assessment</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
          <div style={fieldStyle}><strong>Primary Reason:</strong> {client.primaryReason || client.primary_reason || 'Not provided'}</div>
          <div style={fieldStyle}><strong>Water Intake:</strong> {client.waterIntake || client.water_intake || 'Not specified'}</div>
          <div style={fieldStyle}><strong>Exercise:</strong> {client.exerciseFreq || client.exercise_freq || 'Not specified'}</div>
          <div style={fieldStyle}><strong>Sleep:</strong> {client.sleepHours || client.sleep_hours ? `${client.sleepHours || client.sleep_hours} hrs/night` : 'Not specified'}</div>
          <div style={fieldStyle}><strong>Stress Level:</strong> {client.stressLevel || client.stress_level ? `${client.stressLevel || client.stress_level}/10` : 'Not specified'}</div>
          <div style={fieldStyle}><strong>Current Medications:</strong> {client.currentMedications || client.medications || 'None'}</div>
          <div style={fieldStyle}><strong>Allergies:</strong> {client.allergies || 'None'}</div>
        </div>
        <div style={fieldStyle}><strong>Medical History:</strong> {Array.isArray(client.medicalHistory) ? client.medicalHistory.join(', ') : (client.medicalHistory || client.medical_history || 'None')}</div>
      </div>
      {symptoms.length > 0 && (
        <div style={sectionStyle}>
          <h4 style={sectionTitleStyle}>Symptoms</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {symptoms.map((s, i) => (
              <span key={i} style={{ display: 'inline-block', padding: '4px 12px', background: '#fee2e2', color: '#c41e3a', borderRadius: '16px', fontSize: '0.85rem' }}>{s}</span>
            ))}
          </div>
        </div>
      )}
      <div style={sectionStyle}>
        <h4 style={sectionTitleStyle}>Registration Details</h4>
        <div style={gridStyle}>
          <div style={fieldStyle}><strong>Registration Date:</strong> {client.timestamp ? new Date(client.timestamp).toLocaleDateString('en-GB') : (client.created_at ? new Date(client.created_at).toLocaleDateString('en-GB') : 'N/A')}</div>
          <div style={fieldStyle}><strong>Branch:</strong> {client.branch || 'N/A'}</div>
          <div style={fieldStyle}><strong>Signature:</strong> {client.signature || 'Not signed'}</div>
        </div>
      </div>
    </div>
  );
}

function ClientEditForm({ form, setForm }) {
  const update = (field, value) => setForm(f => ({ ...f, [field]: value }));
  const inputStyle = { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.9rem', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '4px' };
  const groupStyle = { marginBottom: '12px' };

  return (
    <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px' }}>
      <h4 style={{ color: '#2c3e50', marginBottom: '16px' }}>Personal Information</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
        <div style={groupStyle}>
          <label style={labelStyle}>Full Name *</label>
          <input style={inputStyle} value={form.full_name || form.fullName || form.name || ''} onChange={e => update('full_name', e.target.value)} />
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Namibian ID Number *</label>
          <input style={inputStyle} value={form.nbNumber || form.nb_number || ''} onChange={e => update('nbNumber', e.target.value)} />
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Date of Birth *</label>
          <input type="date" style={inputStyle} value={form.dob || ''} onChange={e => update('dob', e.target.value)} />
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Gender *</label>
          <select style={inputStyle} value={form.gender || ''} onChange={e => update('gender', e.target.value)}>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Phone *</label>
          <input style={inputStyle} value={form.phone || ''} onChange={e => update('phone', e.target.value)} />
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Email</label>
          <input style={inputStyle} value={form.email || ''} onChange={e => update('email', e.target.value)} />
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Height (cm)</label>
          <input style={inputStyle} value={form.height || ''} onChange={e => update('height', e.target.value)} />
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Weight (kg)</label>
          <input style={inputStyle} value={form.weight || ''} onChange={e => update('weight', e.target.value)} />
        </div>
      </div>
      <h4 style={{ color: '#2c3e50', marginBottom: '16px', borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>Health Assessment</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={groupStyle}>
          <label style={labelStyle}>Primary Reason for Visit</label>
          <input style={inputStyle} placeholder="e.g. Weight management, Joint pain..." value={form.primaryReason || form.primary_reason || ''} onChange={e => update('primaryReason', e.target.value)} />
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Water Intake</label>
          <select style={inputStyle} value={form.waterIntake || form.water_intake || ''} onChange={e => update('waterIntake', e.target.value)}>
            <option value="">— Select —</option>
            <option value="Less than 1L/day">Less than 1L/day</option>
            <option value="1–2L/day">1–2L/day</option>
            <option value="2–3L/day">2–3L/day</option>
            <option value="More than 3L/day">More than 3L/day</option>
          </select>
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Exercise Frequency</label>
          <select style={inputStyle} value={form.exerciseFreq || form.exercise_freq || ''} onChange={e => update('exerciseFreq', e.target.value)}>
            <option value="">— Select —</option>
            <option value="None">None</option>
            <option value="1–2x per week">1–2x per week</option>
            <option value="3–4x per week">3–4x per week</option>
            <option value="Daily">Daily</option>
          </select>
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Sleep (hours per night)</label>
          <select style={inputStyle} value={form.sleepHours || form.sleep_hours || ''} onChange={e => update('sleepHours', e.target.value)}>
            <option value="">— Select —</option>
            <option value="Less than 5">Less than 5 hours</option>
            <option value="5–6">5–6 hours</option>
            <option value="6–7">6–7 hours</option>
            <option value="7–8">7–8 hours</option>
            <option value="More than 8">More than 8 hours</option>
          </select>
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Stress Level (1 = Low, 10 = Very High)</label>
          <select style={inputStyle} value={form.stressLevel || form.stress_level || ''} onChange={e => update('stressLevel', e.target.value)}>
            <option value="">— Select —</option>
            {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n} — {n <= 3 ? 'Low' : n <= 6 ? 'Moderate' : n <= 8 ? 'High' : 'Very High'}</option>)}
          </select>
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Current Medications</label>
          <input style={inputStyle} placeholder="e.g. Metformin 500mg, Aspirin..." value={form.currentMedications || form.medications || ''} onChange={e => update('currentMedications', e.target.value)} />
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Allergies</label>
          <input style={inputStyle} placeholder="e.g. Penicillin, Peanuts..." value={form.allergies || ''} onChange={e => update('allergies', e.target.value)} />
        </div>
        <div style={groupStyle}>
          <label style={labelStyle}>Medical History</label>
          <input style={inputStyle} placeholder="e.g. Diabetes, Hypertension, Asthma..." value={Array.isArray(form.medicalHistory) ? form.medicalHistory.join(', ') : (form.medicalHistory || form.medical_history || '')} onChange={e => update('medicalHistory', e.target.value)} />
        </div>
      </div>
    </div>
  );
}

function ReportsSection() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedReport, setSelectedReport] = useState(null);

  const loadReports = useCallback(() => {
    setLoading(true);
    api.reports.list()
      .then(data => setReports(Array.isArray(data) ? data : data.reports || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

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
        <button onClick={() => {}} style={{ background: '#c41e3a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>Search</button>
        <button onClick={() => setSearch('')} style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>Show All</button>
        <button onClick={loadReports} style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>Refresh</button>
      </div>
      {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#7f8c8d' }}>
          <h3>🔍 No reports found</h3>
          <p>Try a different search term.</p>
        </div>
      ) : (
        <div>
          {filtered.map(r => (
            <div key={r.id} onClick={() => setSelectedReport(r)} style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 18px', cursor: 'pointer', transition: 'box-shadow 0.2s', marginBottom: '10px' }}
              onMouseOver={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'}
              onMouseOut={e => e.currentTarget.style.boxShadow = 'none'}
            >
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

  const loadFollowups = useCallback(() => {
    setLoading(true);
    api.reports.list()
      .then(data => {
        const all = Array.isArray(data) ? data : data.reports || [];
        setReports(all.filter(r => r.follow_up_date));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadFollowups(); }, [loadFollowups]);

  const handleAction = async (id, action) => {
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
        <div style={{ textAlign: 'center', padding: '40px', color: '#7f8c8d' }}>
          <h3>📅 No follow-ups found</h3>
          <p>Follow-ups from reports will appear here.</p>
        </div>
      ) : (
        <div>
          {filtered.map(r => {
            const today = new Date().toISOString().slice(0, 10);
            const isOverdue = r.follow_up_date < today;
            const isDueToday = (r.follow_up_date || '').slice(0, 10) === today;
            return (
              <div key={r.id} className="follow-up-card" style={{ border: `1px solid ${isOverdue ? '#fecaca' : isDueToday ? '#fde68a' : '#e5e7eb'}`, borderLeft: `4px solid ${isOverdue ? '#dc2626' : isDueToday ? '#f59e0b' : '#3b82f6'}`, borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '10px', background: isOverdue ? '#fef2f2' : isDueToday ? '#fffbeb' : '#fff' }}>
                <div className="follow-up-details">
                  <h4 style={{ margin: 0, fontWeight: 600, color: '#1e293b', fontSize: '0.95rem' }}>{r.client_name || 'Patient'}</h4>
                  <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: isOverdue ? '#dc2626' : '#64748b' }}>
                    {isOverdue ? '⚠️ Overdue: ' : isDueToday ? '📍 Due Today: ' : '📅 Due: '}{formatDate(r.follow_up_date)}
                  </p>
                  {r.diagnosis && <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>{r.diagnosis}</p>}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => handleAction(r.id, 'complete')} style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#22c55e', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>✅ Complete</button>
                  <button style={{ padding: '6px 14px', fontSize: '0.85rem', background: '#f1f5f9', color: '#374151', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}>🔄 Reschedule</button>
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
  const [clients, setClients] = useState([]);
  const [reports, setReports] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('month');

  const loadAnalytics = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.clients.list().then(d => Array.isArray(d) ? d : d.clients || []).catch(() => []),
      api.reports.list().then(d => Array.isArray(d) ? d : d.reports || []).catch(() => []),
      api.appointments.list().then(d => Array.isArray(d) ? d : d.appointments || []).catch(() => []),
    ]).then(([c, r, a]) => {
      setClients(c);
      setReports(r);
      setAppointments(a);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  const totalClients = clients.length;
  const totalReports = reports.length;
  const followUpsDue = reports.filter(r => r.follow_up_date && r.follow_up_date >= new Date().toISOString().slice(0, 10)).length;
  const memberClients = clients.filter(c => (c.membershipStatus || c.membership_status) === 'member').length;
  const referredClients = totalClients - memberClients;
  const conversionRate = totalClients > 0 ? Math.round((memberClients / totalClients) * 100) : 0;
  const memberPercentage = totalClients > 0 ? Math.round((memberClients / totalClients) * 100) : 0;
  const referredPercentage = totalClients > 0 ? Math.round((referredClients / totalClients) * 100) : 0;

  const completedFollowUps = reports.filter(r => r.follow_up_date && r.status === 'completed').length;
  const totalFollowUps = reports.filter(r => r.follow_up_date).length;
  const followUpCompleteRate = totalFollowUps > 0 ? Math.round((completedFollowUps / totalFollowUps) * 100) : 0;
  const pendingFollowUps = totalFollowUps - completedFollowUps;

  const printAnalytics = () => {
    const w = window.open('', '_blank', 'width=800,height=600');
    if (!w) return;
    w.document.write(`<html><head><title>Performance Analytics</title><style>body{font-family:Arial,sans-serif;padding:20px;} h2{color:#c41e3a;} .metric{display:inline-block;margin:10px;padding:20px;border:1px solid #ddd;border-radius:8px;text-align:center;min-width:150px;} .metric h3{margin:0;font-size:28px;} .metric p{margin:4px 0 0;color:#666;}</style></head><body>`);
    w.document.write(`<h2>Consultant Performance Analytics</h2><p>Timeframe: ${timeframe}</p>`);
    w.document.write(`<div class="metric"><h3 style="color:#3498db;">${totalClients}</h3><p>Total Clients</p></div>`);
    w.document.write(`<div class="metric"><h3 style="color:#27ae60;">${totalReports}</h3><p>Reports Created</p></div>`);
    w.document.write(`<div class="metric"><h3 style="color:#e74c3c;">${followUpsDue}</h3><p>Follow-ups Due</p></div>`);
    w.document.write(`<div class="metric"><h3 style="color:#f39c12;">${conversionRate}%</h3><p>Member Conversion</p></div>`);
    w.document.write(`</body></html>`);
    w.document.close();
    w.print();
  };

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
        <button onClick={printAnalytics} style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>Print Report</button>
      </div>
      {loading ? <LoadingSpinner /> : (
        <div style={{ background: '#f8f9fa', padding: '20px', borderRadius: '8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '20px' }}>
            <div style={{ background: 'white', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #3498db', textAlign: 'center' }}>
              <h3 style={{ color: '#3498db', fontSize: '28pt', marginBottom: '5px', margin: 0 }}>{totalClients}</h3>
              <p style={{ color: '#666', fontSize: '0.9rem', margin: '4px 0 0' }}>Total Clients</p>
            </div>
            <div style={{ background: 'white', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #27ae60', textAlign: 'center' }}>
              <h3 style={{ color: '#27ae60', fontSize: '28pt', marginBottom: '5px', margin: 0 }}>{totalReports}</h3>
              <p style={{ color: '#666', fontSize: '0.9rem', margin: '4px 0 0' }}>Reports Created</p>
            </div>
            <div style={{ background: 'white', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #e74c3c', textAlign: 'center' }}>
              <h3 style={{ color: '#e74c3c', fontSize: '28pt', marginBottom: '5px', margin: 0 }}>{followUpsDue}</h3>
              <p style={{ color: '#666', fontSize: '0.9rem', margin: '4px 0 0' }}>Follow-ups Due</p>
            </div>
            <div style={{ background: 'white', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #f39c12', textAlign: 'center' }}>
              <h3 style={{ color: '#f39c12', fontSize: '28pt', marginBottom: '5px', margin: 0 }}>{conversionRate}%</h3>
              <p style={{ color: '#666', fontSize: '0.9rem', margin: '4px 0 0' }}>Member Conversion</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            <div style={{ background: 'white', padding: '15px', borderRadius: '8px', border: '2px solid #ddd' }}>
              <h4 style={{ color: '#2c3e50', marginBottom: '15px', margin: '0 0 15px' }}>👥 Client Distribution</h4>
              <div style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span>Registered Members:</span>
                  <strong style={{ color: '#27ae60' }}>{memberClients}</strong>
                </div>
                <div style={{ background: '#e8f5e9', height: '10px', borderRadius: '5px' }}>
                  <div style={{ background: '#27ae60', height: '100%', width: `${memberPercentage}%`, borderRadius: '5px' }}></div>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span>Referred Clients:</span>
                  <strong style={{ color: '#f39c12' }}>{referredClients}</strong>
                </div>
                <div style={{ background: '#fff3cd', height: '10px', borderRadius: '5px' }}>
                  <div style={{ background: '#f39c12', height: '100%', width: `${referredPercentage}%`, borderRadius: '5px' }}></div>
                </div>
              </div>
            </div>

            <div style={{ background: 'white', padding: '15px', borderRadius: '8px', border: '2px solid #ddd' }}>
              <h4 style={{ color: '#2c3e50', marginBottom: '15px', margin: '0 0 15px' }}>📅 Follow-up Compliance</h4>
              <div style={{ marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span>Completed Follow-ups:</span>
                  <strong style={{ color: '#27ae60' }}>{completedFollowUps}</strong>
                </div>
                <div style={{ background: '#e8f5e9', height: '10px', borderRadius: '5px' }}>
                  <div style={{ background: '#27ae60', height: '100%', width: `${followUpCompleteRate}%`, borderRadius: '5px' }}></div>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                  <span>Pending Follow-ups:</span>
                  <strong style={{ color: '#e74c3c' }}>{pendingFollowUps}</strong>
                </div>
                <div style={{ background: '#fee2e2', height: '10px', borderRadius: '5px' }}>
                  <div style={{ background: '#e74c3c', height: '100%', width: `${totalFollowUps > 0 ? Math.round((pendingFollowUps / totalFollowUps) * 100) : 0}%`, borderRadius: '5px' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StaffServicesSection() {
  const [leaveModal, setLeaveModal] = useState(false);
  const [cashModal, setCashModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ type: '', startDate: '', endDate: '', reason: '', urgent: false });
  const [cashForm, setCashForm] = useState({ amount: '', purpose: '', urgent: false });
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [cashRequests, setCashRequests] = useState([]);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [cashLoading, setCashLoading] = useState(false);

  const loadLeaveRequests = useCallback(async () => {
    setLeaveLoading(true);
    try {
      const res = await fetch('/api/leave-requests', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setLeaveRequests(Array.isArray(data) ? data : []);
      }
    } catch {}
    setLeaveLoading(false);
  }, []);

  const loadCashRequests = useCallback(async () => {
    setCashLoading(true);
    try {
      const res = await fetch('/api/cash-requests', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCashRequests(Array.isArray(data) ? data : []);
      }
    } catch {}
    setCashLoading(false);
  }, []);

  useEffect(() => {
    loadLeaveRequests();
    loadCashRequests();
  }, [loadLeaveRequests, loadCashRequests]);

  const submitLeave = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/leave-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(leaveForm),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Server error');
      }
      setLeaveModal(false);
      setLeaveForm({ type: '', startDate: '', endDate: '', reason: '', urgent: false });
      alert('Leave request submitted successfully!');
      loadLeaveRequests();
    } catch (err) {
      alert('Failed to submit leave request: ' + (err.message || 'Unknown error'));
    }
  };

  const submitCash = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/cash-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(cashForm),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Server error');
      }
      setCashModal(false);
      setCashForm({ amount: '', purpose: '', urgent: false });
      alert('Cash request submitted successfully!');
      loadCashRequests();
    } catch (err) {
      alert('Failed to submit cash request: ' + (err.message || 'Unknown error'));
    }
  };

  const getStatusBadgeColor = (status) => {
    if (status === 'Approved') return '#27ae60';
    if (status === 'Rejected') return '#e74c3c';
    return '#f39c12';
  };

  return (
    <div>
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
            <button onClick={() => setLeaveModal(true)} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>Request Leave</button>
            <button onClick={loadLeaveRequests} style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>My Requests</button>
          </div>
          <div style={{ marginTop: '15px' }}>
            {leaveLoading ? <p style={{ color: '#64748b' }}>Loading leave requests...</p> : leaveRequests.length === 0 ? (
              <p style={{ color: '#666' }}>No leave requests yet.</p>
            ) : (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {leaveRequests.map((req, i) => {
                  const status = req.status || 'Pending';
                  const badge = getStatusBadgeColor(status);
                  return (
                    <div key={i} style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px 14px', marginBottom: '8px', border: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '0.9rem', color: '#1e293b' }}>{req.type || 'Leave'}</strong>
                        <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, background: `${badge}20`, color: badge }}>{status}</span>
                      </div>
                      <p style={{ margin: '2px 0', fontSize: '0.8rem', color: '#6b7280' }}>{req.startDate || ''} → {req.endDate || ''}</p>
                      {req.reason && <p style={{ margin: '2px 0', fontSize: '0.8rem', color: '#94a3b8' }}>{req.reason}</p>}
                    </div>
                  );
                })}
              </div>
            )}
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
            <button onClick={() => setCashModal(true)} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>Request Cash</button>
            <button onClick={loadCashRequests} style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 18px', cursor: 'pointer' }}>My Requests</button>
          </div>
          <div style={{ marginTop: '15px' }}>
            {cashLoading ? <p style={{ color: '#64748b' }}>Loading cash requests...</p> : cashRequests.length === 0 ? (
              <p style={{ color: '#666' }}>No cash requests yet.</p>
            ) : (
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {cashRequests.map((req, i) => {
                  const status = req.status || 'Pending';
                  const badge = getStatusBadgeColor(status);
                  return (
                    <div key={i} style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px 14px', marginBottom: '8px', border: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <strong style={{ fontSize: '0.9rem', color: '#1e293b' }}>N$ {req.amount || '0'}</strong>
                        <span style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600, background: `${badge}20`, color: badge }}>{status}</span>
                      </div>
                      {req.purpose && <p style={{ margin: '2px 0', fontSize: '0.8rem', color: '#6b7280' }}>{req.purpose}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {leaveModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setLeaveModal(false); }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '12px', maxWidth: '500px', width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#1f2937' }}>📅 Request Leave</h3>
              <button onClick={() => setLeaveModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#6b7280' }}>×</button>
            </div>
            <form onSubmit={submitLeave} style={{ padding: '24px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Leave Type</label>
                <select required value={leaveForm.type} onChange={e => setLeaveForm(f => ({ ...f, type: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem' }}>
                  <option value="">Select Leave Type</option>
                  <option value="vacation">Vacation</option>
                  <option value="sick">Sick Leave</option>
                  <option value="personal">Personal</option>
                  <option value="emergency">Emergency</option>
                </select>
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Start Date</label>
                <input type="date" required value={leaveForm.startDate} onChange={e => setLeaveForm(f => ({ ...f, startDate: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>End Date</label>
                <input type="date" required value={leaveForm.endDate} onChange={e => setLeaveForm(f => ({ ...f, endDate: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Reason</label>
                <textarea required value={leaveForm.reason} onChange={e => setLeaveForm(f => ({ ...f, reason: e.target.value }))} rows={3} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#374151', cursor: 'pointer' }}>
                  <input type="checkbox" checked={leaveForm.urgent} onChange={e => setLeaveForm(f => ({ ...f, urgent: e.target.checked }))} />
                  Mark as urgent
                </label>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>📅 Submit Request</button>
                <button type="button" onClick={() => setLeaveModal(false)} style={{ padding: '10px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {cashModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setCashModal(false); }} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '12px', maxWidth: '500px', width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#1f2937' }}>💵 Request Cash</h3>
              <button onClick={() => setCashModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: '#6b7280' }}>×</button>
            </div>
            <form onSubmit={submitCash} style={{ padding: '24px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Amount Needed (N$)</label>
                <input type="number" step="0.01" min="1" required value={cashForm.amount} onChange={e => setCashForm(f => ({ ...f, amount: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Purpose</label>
                <textarea required value={cashForm.purpose} onChange={e => setCashForm(f => ({ ...f, purpose: e.target.value }))} rows={3} style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#374151', cursor: 'pointer' }}>
                  <input type="checkbox" checked={cashForm.urgent} onChange={e => setCashForm(f => ({ ...f, urgent: e.target.checked }))} />
                  Mark as urgent
                </label>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Submit Request</button>
                <button type="button" onClick={() => setCashModal(false)} style={{ padding: '10px 20px', background: '#6b7280', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

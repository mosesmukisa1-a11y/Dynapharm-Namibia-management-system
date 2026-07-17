import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import { Card, CardBody, CardHeader } from './ui';

// ─── helpers ────────────────────────────────────────────────────────────────
const leaveTypeColor = (t) => ({ Annual: '#166534', Sick: '#9a3412', Emergency: '#7c2d12', Unpaid: '#374151', Maternity: '#7c3aed', Study: '#1e40af' }[t] || '#374151');

const statusStyle = (s) => {
  const map = {
    Pending:         { bg: '#fffbeb', color: '#92400e', border: '#fcd34d' },
    pending:         { bg: '#fffbeb', color: '#92400e', border: '#fcd34d' },
    Approved:        { bg: '#f0fdf4', color: '#166534', border: '#86efac' },
    approved:        { bg: '#f0fdf4', color: '#166534', border: '#86efac' },
    finance_reviewed:{ bg: '#eff6ff', color: '#1e40af', border: '#93c5fd' },
    Rejected:        { bg: '#fef2f2', color: '#991b1b', border: '#fca5a5' },
    rejected:        { bg: '#fef2f2', color: '#991b1b', border: '#fca5a5' },
  };
  const c = map[s] || map.Pending;
  return <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.73rem', fontWeight: 700, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
    {s === 'finance_reviewed' ? '💼 Finance Reviewed' : (s || 'Pending')}
  </span>;
};

const DOC_TYPES = [
  { value: 'national_id_copy',         label: '🪪 National ID / Passport Copy' },
  { value: 'academic_certificate',     label: '🎓 Academic Certificate / Transcript' },
  { value: 'professional_certificate', label: '📜 Professional Certificate' },
  { value: 'bank_statement',           label: '🏦 Bank Statement / Proof of Account' },
  { value: 'police_clearance',         label: '🛡️ Police Clearance Certificate' },
  { value: 'drivers_license',          label: '🚗 Driver\'s License' },
  { value: 'other',                    label: '📎 Other Document' },
];

const DOC_LABEL_MAP = Object.fromEntries(DOC_TYPES.map(d => [d.value, d.label]));

function fmtBytes(b) {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

const inp = { width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box', background: '#fff' };
const lbl = { fontSize: '0.75rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' };
const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 };
const sectionCard = { background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: 0 };
const sectionHead = { padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' };
const sectionBody = { padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 };

// ─── Document upload section ─────────────────────────────────────────────────
function DocumentsSection({ accentColor }) {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState('academic_certificate');
  const [docName, setDocName] = useState('');
  const [alert, setAlert] = useState(null);
  const fileRef = useRef(null);

  const load = useCallback(() => {
    setLoading(true);
    api.staff.documents.list().then(d => setDocs(d.documents || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setAlert({ type: 'error', msg: 'Please select a file first' }); return; }
    setUploading(true); setAlert(null);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('doc_type', docType);
    fd.append('doc_name', docName || file.name);
    try {
      const res = await api.staff.documents.upload(fd);
      if (!res.success) throw new Error(res.error || 'Upload failed');
      setAlert({ type: 'success', msg: 'Document uploaded successfully.' });
      setDocName(''); if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (err) { setAlert({ type: 'error', msg: err.message || 'Upload failed' }); }
    finally { setUploading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this document?')) return;
    try { await api.staff.documents.remove(id); load(); }
    catch (err) { setAlert({ type: 'error', msg: err.message || 'Delete failed' }); }
  };

  return (
    <div style={sectionCard}>
      <div style={sectionHead}>
        <div>
          <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.95rem' }}>📂 Documents & Certificates</div>
          <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>Upload ID copies, academic certificates, and other HR documents</div>
        </div>
      </div>
      <div style={sectionBody}>
        {alert && (
          <div style={{ padding: '9px 14px', borderRadius: 9, fontSize: '0.85rem', fontWeight: 600,
            background: alert.type === 'success' ? '#f0fdf4' : '#fef2f2',
            color: alert.type === 'success' ? '#166534' : '#991b1b',
            border: `1px solid ${alert.type === 'success' ? '#86efac' : '#fca5a5'}` }}>
            {alert.msg}
          </div>
        )}

        {/* Upload form */}
        <div style={{ background: '#f8fafc', borderRadius: 10, border: '1.5px dashed #cbd5e1', padding: '16px' }}>
          <div style={{ fontWeight: 700, color: '#374151', fontSize: '0.85rem', marginBottom: 12 }}>⬆️ Upload New Document</div>
          <div style={grid2}>
            <div>
              <label style={lbl}>Document Type *</label>
              <select style={{ ...inp, cursor: 'pointer' }} value={docType} onChange={e => setDocType(e.target.value)}>
                {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Document Label (optional)</label>
              <input style={inp} value={docName} onChange={e => setDocName(e.target.value)} placeholder="e.g. Bachelor of Pharmacy 2022" />
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={lbl}>Select File (PDF, JPG, PNG, DOCX — max 10 MB) *</label>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
              style={{ ...inp, padding: '8px 12px', cursor: 'pointer' }} />
          </div>
          <button onClick={handleUpload} disabled={uploading}
            style={{ marginTop: 12, padding: '10px 24px', borderRadius: 10, border: 'none', background: accentColor, color: '#fff', fontWeight: 800, fontSize: '0.87rem', cursor: uploading ? 'not-allowed' : 'pointer', opacity: uploading ? 0.65 : 1 }}>
            {uploading ? '⏳ Uploading…' : '📤 Upload Document'}
          </button>
        </div>

        {/* Document list */}
        {loading ? <div style={{ textAlign: 'center', color: '#94a3b8', padding: '16px' }}>Loading documents…</div>
          : docs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>📂</div>
              <div style={{ fontSize: '0.85rem' }}>No documents uploaded yet</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {docs.map(d => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.88rem' }}>{d.doc_name || DOC_LABEL_MAP[d.doc_type] || d.doc_type}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>
                      {DOC_LABEL_MAP[d.doc_type] || d.doc_type}
                      {d.file_size ? ` · ${fmtBytes(d.file_size)}` : ''}
                      {' · '}{new Date(d.uploaded_at).toLocaleDateString('en-NA')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a href={d.file_url} target="_blank" rel="noreferrer"
                      style={{ padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${accentColor}`, color: accentColor, fontWeight: 700, fontSize: '0.78rem', textDecoration: 'none', background: '#fff' }}>
                      👁 View
                    </a>
                    <button onClick={() => handleDelete(d.id)}
                      style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid #fca5a5', background: '#fff', color: '#dc2626', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
                      🗑
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

// ─── My Profile Tab — exported for reuse in BranchPortal ────────────────────
export function MyProfileTab({ accentColor = '#c41e3a' }) {
  const [profile, setProfile] = useState(null);
  const [pendingSensitive, setPendingSensitive] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sensitiveSubmitting, setSensitiveSubmitting] = useState(false);
  const [showSensitive, setShowSensitive] = useState(false);
  const [profileSection, setProfileSection] = useState('contact'); // contact | personal | qualifications | sensitive | documents

  const [contact, setContact] = useState({ phone: '', email: '', address: '', date_of_birth: '', gender: '', emergency_contact_name: '', emergency_contact_phone: '' });
  const [personal, setPersonal] = useState({ marital_status: '', nationality: '', home_language: '', next_of_kin_name: '', next_of_kin_relationship: '', next_of_kin_phone: '' });
  const [qualifications, setQualifications] = useState({ highest_qualification: '', institution_name: '', graduation_year: '', field_of_study: '', professional_certifications: '' });
  const [sensitive, setSensitive] = useState({ national_id: '', bank_name: '', bank_account_no: '' });

  const load = useCallback(() => {
    setLoading(true);
    api.staff.getProfile().then(d => {
      if (d.profile) {
        const p = d.profile;
        setProfile(p);
        setContact({ phone: p.phone || '', email: p.email || '', address: p.address || '', date_of_birth: p.date_of_birth ? p.date_of_birth.split('T')[0] : '', gender: p.gender || '', emergency_contact_name: p.emergency_contact_name || '', emergency_contact_phone: p.emergency_contact_phone || '' });
        setPersonal({ marital_status: p.marital_status || '', nationality: p.nationality || '', home_language: p.home_language || '', next_of_kin_name: p.next_of_kin_name || '', next_of_kin_relationship: p.next_of_kin_relationship || '', next_of_kin_phone: p.next_of_kin_phone || '' });
        setQualifications({ highest_qualification: p.highest_qualification || '', institution_name: p.institution_name || '', graduation_year: p.graduation_year || '', field_of_study: p.field_of_study || '', professional_certifications: p.professional_certifications || '' });
        setSensitive({ national_id: p.national_id || '', bank_name: p.bank_name || '', bank_account_no: p.bank_account_no || '' });
      }
      setPendingSensitive(d.pendingSensitive || []);
    }).catch(() => setAlert({ type: 'error', message: 'Failed to load profile' }))
    .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (actionData) => {
    setSaving(true); setAlert(null);
    try {
      const d = await api.staff.updateContact(actionData);
      if (d.profile) setProfile(d.profile);
      setAlert({ type: 'success', message: 'Saved successfully.' });
    } catch (err) { setAlert({ type: 'error', message: err.message || 'Failed to save' }); }
    finally { setSaving(false); }
  };

  const submitSensitive = async () => {
    const hasValues = Object.values(sensitive).some(v => v.trim());
    if (!hasValues) { setAlert({ type: 'error', message: 'Please fill in at least one field' }); return; }
    setSensitiveSubmitting(true); setAlert(null);
    try {
      await api.staff.requestSensitive(sensitive);
      setAlert({ type: 'success', message: 'Request submitted — HR will review and apply your update.' });
      setShowSensitive(false);
      setSensitive({ national_id: '', bank_name: '', bank_account_no: '' });
      load();
    } catch (err) { setAlert({ type: 'error', message: err.message || 'Failed to submit' }); }
    finally { setSensitiveSubmitting(false); }
  };

  const PROFILE_SECTIONS = [
    { id: 'contact',        label: '📞 Contact' },
    { id: 'personal',       label: '👤 Personal' },
    { id: 'qualifications', label: '🎓 Education' },
    { id: 'sensitive',      label: '🔒 Payroll' },
    { id: 'documents',      label: '📂 Documents' },
  ];

  const btnSave = (data) => (
    <button onClick={() => save(data)} disabled={saving}
      style={{ alignSelf: 'flex-start', padding: '10px 28px', borderRadius: 10, border: 'none', background: accentColor, color: '#fff', fontWeight: 800, fontSize: '0.88rem', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.65 : 1 }}>
      {saving ? '⏳ Saving…' : '💾 Save Changes'}
    </button>
  );

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Loading profile…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
          <div style={{ flex: 1 }}>
            <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.1rem' }}>{profile.full_name || profile.username}</div>
            <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', marginTop: 3 }}>
              {(profile.role || '').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
              {profile.branch ? ` · ${profile.branch.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}` : ''}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.78rem', marginTop: 2 }}>@{profile.username}</div>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Qualification', value: profile.highest_qualification },
              { label: 'Nationality', value: profile.nationality },
            ].map(({ label, value }) => value ? (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: '0.85rem', marginTop: 2 }}>{value}</div>
              </div>
            ) : null)}
          </div>
        </div>
      )}

      {/* Section pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PROFILE_SECTIONS.map(s => (
          <button key={s.id} onClick={() => { setProfileSection(s.id); setAlert(null); }}
            style={{ padding: '7px 16px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 600, border: 'none', cursor: 'pointer',
              background: profileSection === s.id ? accentColor : '#f1f5f9', color: profileSection === s.id ? '#fff' : '#64748b', transition: 'all 0.15s' }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Contact & Emergency ── */}
      {profileSection === 'contact' && (
        <div style={sectionCard}>
          <div style={sectionHead}>
            <div>
              <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.95rem' }}>📞 Contact Information</div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>Phone, email, address — saves immediately</div>
            </div>
          </div>
          <div style={sectionBody}>
            <div style={grid2}>
              <div><label style={lbl}>Phone Number</label><input style={inp} type="tel" value={contact.phone} onChange={e => setContact(c=>({...c,phone:e.target.value}))} placeholder="+264 81 123 4567" /></div>
              <div><label style={lbl}>Email Address</label><input style={inp} type="email" value={contact.email} onChange={e => setContact(c=>({...c,email:e.target.value}))} placeholder="you@example.com" /></div>
            </div>
            <div><label style={lbl}>Home / Residential Address</label><input style={inp} value={contact.address} onChange={e => setContact(c=>({...c,address:e.target.value}))} placeholder="Street, suburb, city" /></div>
            <div style={grid2}>
              <div><label style={lbl}>Date of Birth</label><input style={inp} type="date" value={contact.date_of_birth} onChange={e => setContact(c=>({...c,date_of_birth:e.target.value}))} /></div>
              <div>
                <label style={lbl}>Gender</label>
                <select style={{...inp,cursor:'pointer'}} value={contact.gender} onChange={e => setContact(c=>({...c,gender:e.target.value}))}>
                  <option value="">— Select —</option>
                  {['Male','Female','Non-binary','Prefer not to say'].map(g=><option key={g}>{g}</option>)}
                </select>
              </div>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', padding: '14px 16px' }}>
              <div style={{ fontWeight: 700, color: '#374151', fontSize: '0.82rem', marginBottom: 10 }}>🚨 Emergency Contact</div>
              <div style={grid2}>
                <div><label style={lbl}>Name</label><input style={inp} value={contact.emergency_contact_name} onChange={e => setContact(c=>({...c,emergency_contact_name:e.target.value}))} placeholder="Full name" /></div>
                <div><label style={lbl}>Phone</label><input style={inp} type="tel" value={contact.emergency_contact_phone} onChange={e => setContact(c=>({...c,emergency_contact_phone:e.target.value}))} placeholder="+264 81 …" /></div>
              </div>
            </div>
            {btnSave(contact)}
          </div>
        </div>
      )}

      {/* ── Personal Details ── */}
      {profileSection === 'personal' && (
        <div style={sectionCard}>
          <div style={sectionHead}>
            <div>
              <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.95rem' }}>👤 Personal Details</div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>Marital status, nationality, next of kin — saves immediately</div>
            </div>
          </div>
          <div style={sectionBody}>
            <div style={grid2}>
              <div>
                <label style={lbl}>Marital Status</label>
                <select style={{...inp,cursor:'pointer'}} value={personal.marital_status} onChange={e => setPersonal(p=>({...p,marital_status:e.target.value}))}>
                  <option value="">— Select —</option>
                  {['Single','Married','Divorced','Widowed','Separated'].map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Nationality</label><input style={inp} value={personal.nationality} onChange={e => setPersonal(p=>({...p,nationality:e.target.value}))} placeholder="e.g. Namibian" /></div>
            </div>
            <div>
              <label style={lbl}>Home Language</label>
              <select style={{...inp,cursor:'pointer'}} value={personal.home_language} onChange={e => setPersonal(p=>({...p,home_language:e.target.value}))}>
                <option value="">— Select —</option>
                {['English','Afrikaans','Oshiwambo','Otjiherero','Rukwangali','Silozi','Nama/Damara','Setswana','Mbukushu','Other'].map(l=><option key={l}>{l}</option>)}
              </select>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', padding: '14px 16px' }}>
              <div style={{ fontWeight: 700, color: '#374151', fontSize: '0.82rem', marginBottom: 10 }}>👨‍👩‍👧 Next of Kin</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div><label style={lbl}>Full Name</label><input style={inp} value={personal.next_of_kin_name} onChange={e => setPersonal(p=>({...p,next_of_kin_name:e.target.value}))} placeholder="Full name" /></div>
                <div><label style={lbl}>Relationship</label><input style={inp} value={personal.next_of_kin_relationship} onChange={e => setPersonal(p=>({...p,next_of_kin_relationship:e.target.value}))} placeholder="e.g. Mother, Spouse" /></div>
                <div><label style={lbl}>Phone</label><input style={inp} type="tel" value={personal.next_of_kin_phone} onChange={e => setPersonal(p=>({...p,next_of_kin_phone:e.target.value}))} placeholder="+264 81 …" /></div>
              </div>
            </div>
            {btnSave(personal)}
          </div>
        </div>
      )}

      {/* ── Qualifications ── */}
      {profileSection === 'qualifications' && (
        <div style={sectionCard}>
          <div style={sectionHead}>
            <div>
              <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.95rem' }}>🎓 Education & Qualifications</div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>Academic background and professional certifications — saves immediately</div>
            </div>
          </div>
          <div style={sectionBody}>
            <div style={{ padding: '10px 14px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 9, fontSize: '0.8rem', color: '#0369a1' }}>
              💡 Upload supporting certificates in the <strong>Documents</strong> tab after saving your details here.
            </div>
            <div style={grid2}>
              <div>
                <label style={lbl}>Highest Qualification</label>
                <select style={{...inp,cursor:'pointer'}} value={qualifications.highest_qualification} onChange={e => setQualifications(q=>({...q,highest_qualification:e.target.value}))}>
                  <option value="">— Select —</option>
                  {['IGCSE / Grade 12','AS / A-Level','Certificate','Diploma','Bachelor\'s Degree','Honours Degree','Postgraduate Diploma','Master\'s Degree','Doctoral Degree (PhD)','Other'].map(q=><option key={q}>{q}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Year of Completion</label><input style={inp} type="number" min="1970" max={new Date().getFullYear()} value={qualifications.graduation_year} onChange={e => setQualifications(q=>({...q,graduation_year:e.target.value}))} placeholder="e.g. 2019" /></div>
            </div>
            <div><label style={lbl}>Institution / School Name</label><input style={inp} value={qualifications.institution_name} onChange={e => setQualifications(q=>({...q,institution_name:e.target.value}))} placeholder="e.g. University of Namibia" /></div>
            <div><label style={lbl}>Field of Study / Major</label><input style={inp} value={qualifications.field_of_study} onChange={e => setQualifications(q=>({...q,field_of_study:e.target.value}))} placeholder="e.g. Pharmacy, Business Administration" /></div>
            <div>
              <label style={lbl}>Professional Certifications (list all, comma-separated)</label>
              <textarea rows={3} style={{...inp,resize:'none'}} value={qualifications.professional_certifications} onChange={e => setQualifications(q=>({...q,professional_certifications:e.target.value}))} placeholder="e.g. Pharmaceutical Council of Namibia licence, First Aid Level 3, Food Safety Certificate…" />
            </div>
            {btnSave(qualifications)}
          </div>
        </div>
      )}

      {/* ── Sensitive / Payroll ── */}
      {profileSection === 'sensitive' && (
        <div style={sectionCard}>
          <div style={sectionHead}>
            <div>
              <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.95rem' }}>🔒 Payroll & ID Details</div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>National ID & banking details · All changes require HR approval</div>
            </div>
            {pendingSensitive.length === 0 && (
              <button onClick={() => setShowSensitive(s=>!s)}
                style={{ padding: '8px 18px', borderRadius: 20, border: `1.5px solid ${accentColor}`, background: showSensitive ? accentColor : '#fff', color: showSensitive ? '#fff' : accentColor, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                {showSensitive ? '✕ Cancel' : '✏️ Request Update'}
              </button>
            )}
          </div>

          {/* Current values */}
          <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            {[
              { label: 'National ID', value: profile?.national_id },
              { label: 'Bank Name', value: profile?.bank_name },
              { label: 'Account Number', value: profile?.bank_account_no },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
                <div style={{ fontWeight: 600, color: value ? '#1e293b' : '#cbd5e1', fontSize: '0.9rem' }}>
                  {value ? (label === 'Account Number' ? '•••• ' + String(value).slice(-4) : value) : '— not set —'}
                </div>
              </div>
            ))}
          </div>

          {pendingSensitive.length > 0 && (
            <div style={{ margin: '0 20px 16px', padding: '12px 16px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, display: 'flex', gap: 10 }}>
              <span>⏳</span>
              <div>
                <div style={{ fontWeight: 700, color: '#92400e', fontSize: '0.85rem' }}>Update request pending HR review</div>
                <div style={{ fontSize: '0.78rem', color: '#b45309', marginTop: 3 }}>Submitted {new Date(pendingSensitive[0].requested_at).toLocaleDateString('en-NA')} · Applied once HR approves</div>
              </div>
            </div>
          )}

          {showSensitive && pendingSensitive.length === 0 && (
            <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: '10px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 9, fontSize: '0.8rem', color: '#1e40af' }}>
                ℹ️ These changes are sent to HR for review before taking effect. Please submit accurate information only.
              </div>
              <div style={grid2}>
                <div><label style={lbl}>National ID Number</label><input style={inp} value={sensitive.national_id} onChange={e=>setSensitive(s=>({...s,national_id:e.target.value}))} placeholder="e.g. 00-123456-7-089-12" /></div>
                <div><label style={lbl}>Bank Name</label><input style={inp} value={sensitive.bank_name} onChange={e=>setSensitive(s=>({...s,bank_name:e.target.value}))} placeholder="e.g. FNB Namibia" /></div>
              </div>
              <div><label style={lbl}>Bank Account Number</label><input style={inp} value={sensitive.bank_account_no} onChange={e=>setSensitive(s=>({...s,bank_account_no:e.target.value}))} placeholder="Account number" /></div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowSensitive(false)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, cursor: 'pointer', fontSize: '0.87rem' }}>Cancel</button>
                <button onClick={submitSensitive} disabled={sensitiveSubmitting}
                  style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none', background: '#1e3a5f', color: '#fff', fontWeight: 800, cursor: sensitiveSubmitting ? 'not-allowed' : 'pointer', opacity: sensitiveSubmitting ? 0.65 : 1, fontSize: '0.87rem' }}>
                  {sensitiveSubmitting ? '⏳ Submitting…' : '📨 Submit for HR Approval'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Documents ── */}
      {profileSection === 'documents' && <DocumentsSection accentColor={accentColor} />}
    </div>
  );
}

// ─── Leave request modal ─────────────────────────────────────────────────────
function LeaveModal({ open, onClose, onSubmit, submitting }) {
  const [form, setForm] = useState({ type: 'Annual', startDate: '', endDate: '', reason: '', urgent: false });
  if (!open) return null;
  return (
    <div onClick={e=>{if(e.target===e.currentTarget)onClose()}} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
      <div style={{ width:'100%',maxWidth:500,background:'#fff',borderRadius:20,overflow:'hidden',boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ background:'linear-gradient(135deg,#c41e3a,#8b0000)',padding:'16px 24px',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <span style={{ color:'#fff',fontSize:'1.05rem',fontWeight:800 }}>📅 Submit Leave Request</span>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',width:32,height:32,borderRadius:'50%',cursor:'pointer',fontSize:'1.1rem' }}>×</button>
        </div>
        <div style={{ padding:'20px 24px',display:'flex',flexDirection:'column',gap:14 }}>
          <div>
            <label style={lbl}>Leave Type *</label>
            <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} style={inp}>
              {['Annual','Sick','Emergency','Unpaid','Maternity','Study'].map(t=><option key={t}>{t} Leave</option>)}
            </select>
          </div>
          <div style={grid2}>
            <div><label style={lbl}>Start Date *</label><input type="date" value={form.startDate} onChange={e=>setForm(f=>({...f,startDate:e.target.value}))} style={inp} /></div>
            <div><label style={lbl}>End Date *</label><input type="date" value={form.endDate} min={form.startDate} onChange={e=>setForm(f=>({...f,endDate:e.target.value}))} style={inp} /></div>
          </div>
          <div><label style={lbl}>Reason / Notes *</label><textarea value={form.reason} onChange={e=>setForm(f=>({...f,reason:e.target.value}))} rows={3} placeholder="Please provide a reason…" style={{...inp,resize:'none'}} /></div>
          <label style={{ display:'flex',alignItems:'center',gap:10,cursor:'pointer',fontSize:'0.88rem',fontWeight:600,color:'#dc2626' }}>
            <input type="checkbox" checked={form.urgent} onChange={e=>setForm(f=>({...f,urgent:e.target.checked}))} />
            Mark as URGENT
          </label>
          <div style={{ display:'flex',gap:10 }}>
            <button onClick={onClose} style={{ flex:1,padding:'11px',border:'1.5px solid #e2e8f0',borderRadius:10,background:'#fff',cursor:'pointer',color:'#64748b',fontWeight:600 }}>Cancel</button>
            <button onClick={()=>onSubmit(form)} disabled={submitting} style={{ flex:2,padding:'11px',border:'none',borderRadius:10,background:'linear-gradient(135deg,#c41e3a,#8b0000)',color:'#fff',fontWeight:800,cursor:submitting?'not-allowed':'pointer',opacity:submitting?0.65:1 }}>
              {submitting?'⏳ Submitting…':'📅 Submit Leave Request'}
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
    <div onClick={e=>{if(e.target===e.currentTarget)onClose()}} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center',padding:16 }}>
      <div style={{ width:'100%',maxWidth:480,background:'#fff',borderRadius:20,overflow:'hidden',boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ background:'linear-gradient(135deg,#1e3a5f,#2980b9)',padding:'16px 24px',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <span style={{ color:'#fff',fontSize:'1.05rem',fontWeight:800 }}>💵 Submit Cash Advance Request</span>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)',border:'none',color:'#fff',width:32,height:32,borderRadius:'50%',cursor:'pointer',fontSize:'1.1rem' }}>×</button>
        </div>
        <div style={{ padding:'20px 24px',display:'flex',flexDirection:'column',gap:14 }}>
          <p style={{ margin:0,fontSize:'0.82rem',color:'#64748b',background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:8,padding:'8px 12px' }}>
            💡 <strong>CAS Flow:</strong> Your request goes to Finance for processing, then GM for final approval.
          </p>
          <div><label style={lbl}>Amount (N$) *</label><input type="number" min="1" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="e.g. 500" style={inp} /></div>
          <div><label style={lbl}>Purpose / Reason *</label><textarea value={form.purpose} onChange={e=>setForm(f=>({...f,purpose:e.target.value}))} rows={3} placeholder="What is the cash advance needed for?" style={{...inp,resize:'none'}} /></div>
          <div><label style={lbl}>Needed By (optional)</label><input type="date" value={form.neededBy} onChange={e=>setForm(f=>({...f,neededBy:e.target.value}))} style={inp} /></div>
          <label style={{ display:'flex',alignItems:'center',gap:10,cursor:'pointer',fontSize:'0.88rem',fontWeight:600,color:'#dc2626' }}>
            <input type="checkbox" checked={form.urgent} onChange={e=>setForm(f=>({...f,urgent:e.target.checked}))} />
            Mark as URGENT
          </label>
          <div style={{ display:'flex',gap:10 }}>
            <button onClick={onClose} style={{ flex:1,padding:'11px',border:'1.5px solid #e2e8f0',borderRadius:10,background:'#fff',cursor:'pointer',color:'#64748b',fontWeight:600 }}>Cancel</button>
            <button onClick={()=>onSubmit(form)} disabled={submitting} style={{ flex:2,padding:'11px',border:'none',borderRadius:10,background:'linear-gradient(135deg,#1e3a5f,#2980b9)',color:'#fff',fontWeight:800,cursor:submitting?'not-allowed':'pointer',opacity:submitting?0.65:1 }}>
              {submitting?'⏳ Submitting…':'💵 Submit Cash Request'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Default export — full Staff Services tab ────────────────────────────────
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
    api.get('/leave-requests').then(d => setLeaveRequests(Array.isArray(d)?d:[])).catch(()=>{}).finally(()=>setLeaveLoading(false));
    api.get('/cash-requests').then(d => setCashRequests(Array.isArray(d)?d:[])).catch(()=>{}).finally(()=>setCashLoading(false));
  }, []);

  const refresh = () => {
    api.get('/leave-requests').then(d => setLeaveRequests(Array.isArray(d)?d:[])).catch(()=>{});
    api.get('/cash-requests').then(d => setCashRequests(Array.isArray(d)?d:[])).catch(()=>{});
  };

  const submitLeave = async (form) => {
    if (!form.startDate || !form.endDate || !form.reason.trim()) { setAlert({ type:'error', message:'Please fill in all required fields' }); return; }
    setLeaveSubmitting(true);
    try {
      await api.post('/leave-requests', form);
      setAlert({ type:'success', message:'Leave request submitted successfully' });
      setShowLeaveForm(false);
      api.get('/leave-requests').then(d=>setLeaveRequests(Array.isArray(d)?d:[])).catch(()=>{});
    } catch (err) { setAlert({ type:'error', message:err.message||'Failed to submit leave request' }); }
    finally { setLeaveSubmitting(false); }
  };

  const submitCash = async (form) => {
    if (!form.amount || Number(form.amount)<=0 || !form.purpose.trim()) { setAlert({ type:'error', message:'Please enter a valid amount and purpose' }); return; }
    setCashSubmitting(true);
    try {
      await api.post('/cash-requests', form);
      setAlert({ type:'success', message:'Cash advance request submitted — awaiting Finance review then GM approval.' });
      setShowCashForm(false);
      api.get('/cash-requests').then(d=>setCashRequests(Array.isArray(d)?d:[])).catch(()=>{});
    } catch (err) { setAlert({ type:'error', message:err.message||'Failed to submit cash request' }); }
    finally { setCashSubmitting(false); }
  };

  const TABS = [
    { id:'leave',   label:`📅 Leave (${leaveRequests.length})` },
    { id:'cash',    label:`💵 Cash (${cashRequests.length})` },
    { id:'profile', label:'👤 My Profile' },
  ];

  return (
    <div>
      <div className="rounded-xl p-5 mb-5 flex justify-between items-center flex-wrap gap-3"
        style={{ background:`linear-gradient(135deg,${accentColor},${accentColor}bb)`, boxShadow:'0 4px 20px rgba(0,0,0,0.15)' }}>
        <div>
          <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1 m-0">Staff Services</p>
          <h3 className="text-white text-lg font-bold m-0">👤 Leave, CAS & My Profile</h3>
          <p className="text-white/70 text-sm mt-1 m-0">Manage your leave, cash advances and personal HR information</p>
        </div>
        {subTab==='leave' && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={()=>{setShowLeaveForm(true);setAlert(null)}} className="px-4 py-2 rounded-full font-semibold text-sm cursor-pointer" style={{ background:'#fff',color:accentColor,border:'none',fontWeight:700 }}>📅 Request Leave</button>
            <button onClick={()=>{setShowCashForm(true);setAlert(null)}} className="px-4 py-2 rounded-full font-semibold text-sm cursor-pointer text-white" style={{ background:'rgba(255,255,255,0.18)',border:'1px solid rgba(255,255,255,0.3)' }}>💵 Cash Advance</button>
          </div>
        )}
      </div>

      {alert && <div className="mb-4 p-3 rounded-lg text-sm" style={{ background:alert.type==='success'?'#f0fdf4':'#fef2f2', color:alert.type==='success'?'#166534':'#991b1b', border:`1px solid ${alert.type==='success'?'#86efac':'#fca5a5'}` }}>{alert.message}</div>}

      <div className="flex gap-2 mb-5" style={{ flexWrap:'wrap' }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>{setSubTab(t.id);setAlert(null)}}
            style={{ padding:'8px 20px',borderRadius:20,fontSize:'0.85rem',fontWeight:600,border:'none',cursor:'pointer', background:subTab===t.id?accentColor:'#f1f5f9', color:subTab===t.id?'#fff':'#64748b',transition:'all 0.2s' }}>
            {t.label}
          </button>
        ))}
        {subTab!=='profile' && <button onClick={refresh} style={{ marginLeft:'auto',padding:'8px 14px',borderRadius:20,fontSize:'0.8rem',fontWeight:600,border:'1px solid #e2e8f0',cursor:'pointer',background:'#fff',color:'#64748b' }}>🔄</button>}
      </div>

      {subTab==='leave' && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">My Leave Requests</h3></CardHeader>
          {leaveLoading ? <div className="p-8 text-center text-gray-400">Loading…</div>
            : leaveRequests.length===0 ? (
              <div className="p-10 text-center text-gray-400">
                <div className="text-4xl mb-3">📅</div>
                <p className="font-semibold text-gray-500">No leave requests yet</p>
                <p className="text-sm mt-1">Click "Request Leave" to submit your first request</p>
              </div>
            ) : (
              <div className="divide-y">
                {leaveRequests.map((r,i)=>(
                  <div key={r.id||i} style={{ padding:'14px 20px',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10 }}>
                    <div>
                      <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:4 }}>
                        <span style={{ padding:'2px 10px',borderRadius:20,fontSize:'0.72rem',fontWeight:800,background:'#fff0f3',color:leaveTypeColor(r.type),border:'1px solid #fecaca' }}>{r.type||'Annual'}</span>
                        {r.urgent && <span style={{ padding:'2px 8px',borderRadius:20,fontSize:'0.7rem',fontWeight:700,background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5' }}>URGENT</span>}
                        {statusStyle(r.status)}
                      </div>
                      <div style={{ fontWeight:700,color:'#1e293b',fontSize:'0.9rem' }}>{r.startDate||r.start_date} → {r.endDate||r.end_date}</div>
                      <div style={{ fontSize:'0.8rem',color:'#64748b',marginTop:2 }}>{r.reason}</div>
                    </div>
                    <div style={{ fontSize:'0.75rem',color:'#94a3b8' }}>{r.submittedAt||r.created_at?new Date(r.submittedAt||r.created_at).toLocaleDateString('en-NA'):'—'}</div>
                  </div>
                ))}
              </div>
            )}
        </Card>
      )}

      {subTab==='cash' && (
        <Card>
          <CardHeader>
            <div>
              <h3 className="font-bold text-gray-800">My Cash Advance Requests</h3>
              <p className="text-xs text-gray-500 mt-0.5">Flow: You submit → Finance reviews → GM approves</p>
            </div>
          </CardHeader>
          {cashLoading ? <div className="p-8 text-center text-gray-400">Loading…</div>
            : cashRequests.length===0 ? (
              <div className="p-10 text-center text-gray-400">
                <div className="text-4xl mb-3">💵</div>
                <p className="font-semibold text-gray-500">No cash advance requests yet</p>
              </div>
            ) : (
              <div className="divide-y">
                {cashRequests.map((r,i)=>(
                  <div key={r.id||i} style={{ padding:'14px 20px',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:10 }}>
                    <div>
                      <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:4 }}>
                        <span style={{ fontWeight:800,color:'#166534',fontSize:'0.95rem' }}>N$ {Number(r.amount||0).toFixed(2)}</span>
                        {r.urgent && <span style={{ padding:'2px 8px',borderRadius:20,fontSize:'0.7rem',fontWeight:700,background:'#fef2f2',color:'#dc2626',border:'1px solid #fca5a5' }}>URGENT</span>}
                        {statusStyle(r.status||r.Status)}
                      </div>
                      <div style={{ fontWeight:600,color:'#1e293b',fontSize:'0.88rem' }}>{r.purpose}</div>
                    </div>
                    <div style={{ fontSize:'0.75rem',color:'#94a3b8' }}>{r.submittedAt||r.created_at?new Date(r.submittedAt||r.created_at).toLocaleDateString('en-NA'):'—'}</div>
                  </div>
                ))}
              </div>
            )}
        </Card>
      )}

      {subTab==='profile' && <MyProfileTab accentColor={accentColor} />}

      <LeaveModal open={showLeaveForm} onClose={()=>setShowLeaveForm(false)} onSubmit={submitLeave} submitting={leaveSubmitting} />
      <CashModal open={showCashForm} onClose={()=>setShowCashForm(false)} onSubmit={submitCash} submitting={cashSubmitting} />
    </div>
  );
}

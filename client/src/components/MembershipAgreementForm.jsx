import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { BRANCHES, BRANCH_DETAILS, COMPANY_INFO } from '../lib/constants';
import { useAuth } from '../contexts/AuthContext';
import { Button, Alert, Modal, LoadingSpinner } from './ui';
import { Printer, Share2, Mail, Download, Search, CheckCircle, Clock } from 'lucide-react';

const MATERIALS_LIST = [
  'Bag',
  'Products (Specified)',
  'All in One Product Brochure',
  'Price List',
  'Compensation Plan',
  'Body Systems Guide',
  'Distributor Agreement Forms',
];

function DistributorSearch({ label, value, onChange, onSelect, placeholder }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setShowDropdown(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const doSearch = useCallback(async (term) => {
    if (!term || term.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const data = await api.get(`/distributors?search=${encodeURIComponent(term)}`);
      const list = Array.isArray(data) ? data : data.distributors || [];
      setResults(list.slice(0, 10));
    } catch { setResults([]); }
    setSearching(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-semibold text-[#8b0000] mb-0.5">{label}</label>
      <div className="flex gap-1">
        <input
          type="text"
          value={value}
          onChange={e => { onChange(e.target.value); setQuery(e.target.value); setShowDropdown(true); }}
          onFocus={() => { if (value) { setQuery(value); setShowDropdown(true); doSearch(value); } }}
          placeholder={placeholder}
          className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#c41e3a] focus:border-[#c41e3a]"
        />
        <button type="button" onClick={() => { setShowDropdown(true); doSearch(value || ''); }}
          className="px-2 py-1.5 bg-gray-100 border border-gray-300 rounded text-gray-500 hover:bg-gray-200 cursor-pointer">
          <Search size={14} />
        </button>
      </div>
      {showDropdown && (results.length > 0 || searching) && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {searching ? (
            <div className="p-3 text-center text-sm text-gray-500">Searching...</div>
          ) : results.map(d => (
            <button key={d.distributor_code || d.id} type="button"
              onClick={() => { onSelect(d); setShowDropdown(false); setQuery(''); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 cursor-pointer border-b border-gray-100 last:border-0">
              <span className="font-bold text-[#c41e3a]">{d.distributor_code}</span>
              <span className="text-gray-600 ml-2">{d.distributor_name}</span>
              {d.branch && <span className="text-xs text-gray-400 ml-1">({d.branch})</span>}
            </button>
          ))}
          {!searching && results.length === 0 && query.length >= 2 && (
            <div className="p-3 text-center text-sm text-red-500">No distributor found. Please verify the ID/name.</div>
          )}
        </div>
      )}
    </div>
  );
}

function FormInput({ label, value, onChange, type = 'text', placeholder, required, small, className = '' }) {
  return (
    <div className={className}>
      {label && <label className="block text-xs font-semibold text-[#8b0000] mb-0.5">{label}{required && ' *'}</label>}
      <input
        type={type}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className={`w-full px-2 ${small ? 'py-1 text-xs' : 'py-1.5 text-sm'} border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#c41e3a] focus:border-[#c41e3a]`}
      />
    </div>
  );
}

function generateAgreementHTML(form, agreement) {
  const nb = agreement?.nb_number || form.nb_number || 'PENDING';
  const branchInfo = BRANCH_DETAILS.find(b => b.name === (agreement?.processing_branch || form.processing_branch));
  const fullName = `${form.last_name || ''}, ${form.first_name || ''}${form.middle_initial ? ' ' + form.middle_initial + '.' : ''}`;
  const materialsArr = form.materials_received || [];
  const matOthers = form.materials_others || '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Distributor Agreement Form - ${nb}</title>
<style>
  @page { size: A4; margin: 15mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 11px; color: #333; background: white; }
  .page { max-width: 210mm; margin: 0 auto; padding: 15mm; }
  .header { display: flex; align-items: center; margin-bottom: 8px; }
  .header-logo { width: 60px; height: 60px; margin-right: 12px; }
  .header-text { flex: 1; }
  .header-text h2 { color: #c41e3a; font-size: 13px; margin-bottom: 2px; }
  .header-text p { font-size: 9px; color: #666; }
  .form-title { text-align: center; font-size: 18px; font-weight: bold; color: #c41e3a; margin: 10px 0; letter-spacing: 1px; }
  .instructions { background: #fff5f5; border: 1px solid #f0d0d0; padding: 8px 12px; margin-bottom: 12px; border-radius: 4px; }
  .instructions p { font-size: 9px; color: #555; margin-bottom: 2px; }
  .instructions strong { color: #c41e3a; }
  .section-header { background: #c41e3a; color: white; padding: 4px 10px; font-weight: bold; font-size: 11px; margin: 12px 0 6px 0; border-radius: 2px; display: inline-block; }
  .form-row { display: flex; gap: 8px; margin-bottom: 6px; align-items: flex-end; }
  .form-field { flex: 1; }
  .form-field label { display: block; font-size: 9px; color: #8b0000; font-weight: bold; margin-bottom: 2px; }
  .form-field .value { border-bottom: 1px solid #999; min-height: 18px; padding: 2px 4px; font-size: 11px; }
  .form-field .value.box { border: 1px solid #999; text-align: center; padding: 2px 6px; min-width: 30px; }
  .checkbox-grid { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0; }
  .checkbox-item { display: flex; align-items: center; gap: 4px; font-size: 10px; }
  .checkbox-item .box { width: 12px; height: 12px; border: 1px solid #999; display: inline-flex; align-items: center; justify-content: center; font-size: 9px; }
  .declaration { border: 1px solid #c41e3a; padding: 10px; margin: 12px 0; border-radius: 4px; }
  .declaration p { font-size: 9px; line-height: 1.5; }
  .signature-row { display: flex; justify-content: space-between; margin-top: 20px; gap: 40px; }
  .signature-field { flex: 1; text-align: center; }
  .signature-field .line { border-top: 1px solid #333; margin-top: 30px; padding-top: 4px; font-size: 10px; }
  .official-box { border: 2px solid #c41e3a; padding: 10px; margin-top: 12px; }
  .official-box h4 { background: #c41e3a; color: white; text-align: center; padding: 3px; font-size: 10px; margin: -10px -10px 8px -10px; }
  .official-row { display: flex; gap: 6px; margin-bottom: 4px; }
  .official-row label { font-size: 9px; font-weight: bold; white-space: nowrap; }
  .official-row .val { flex: 1; border-bottom: 1px solid #999; font-size: 10px; padding-left: 4px; }
  .nb-highlight { background: #fff5f5; border: 2px solid #c41e3a; padding: 6px 12px; text-align: center; border-radius: 4px; margin: 8px 0; }
  .nb-highlight span { font-size: 18px; font-weight: bold; color: #c41e3a; letter-spacing: 2px; }
  .footer { margin-top: 12px; font-size: 8px; color: #999; display: flex; justify-content: space-between; border-top: 1px solid #eee; padding-top: 6px; }
</style></head><body>
<div class="page">
  <div class="header">
    <img src="${COMPANY_INFO.logo}" class="header-logo" onerror="this.style.display='none'" />
    <div class="header-text">
      <h2>UGANAM DYNAPHARM NAMIBIA</h2>
      <p>${branchInfo ? branchInfo.address : 'Shop No.1 Continental Building Independence Avenue, Windhoek Namibia.'}</p>
      <p>${branchInfo ? branchInfo.phone : ''}</p>
    </div>
  </div>

  <div class="form-title">DISTRIBUTOR AGREEMENT FORM</div>

  <div class="instructions">
    <p><strong>PLEASE READ CAREFULLY</strong></p>
    <p>1. This is a legal agreement. <strong>FORMS WITH INCOMPLETE INFORMATION WILL NOT BE PROCESSED.</strong></p>
    <p>2. Please press firmly and print clearly.</p>
    <p>3. Detach and return white copy with registration fee to the mailing address shown.</p>
    <p>4. Husband and wife are considered as one Distributor only.</p>
    <p>5. Corporation may register, but needs to submit SEC/DTI. Authorized Representative will need duly appointed Power of Attorney or Board Resolution.</p>
  </div>

  <div class="nb-highlight">
    <p style="font-size:9px;color:#666;margin-bottom:2px">Assigned Distributor ID Number</p>
    <span>${nb}</span>
  </div>

  <div class="section-header">Distributor's Data</div>
  <div class="form-row">
    <div class="form-field" style="flex:2"><label>Name (Last name, First name, M.I.)</label><div class="value">${fullName}</div></div>
  </div>
  <div class="form-row">
    <div class="form-field"><label>Birthdate</label><div class="value">${form.birthdate || ''}</div></div>
    <div class="form-field" style="flex:0.5"><label>Age</label><div class="value box">${form.age || ''}</div></div>
    <div class="form-field" style="flex:0.5"><label>Sex</label><div class="value box">${form.sex || ''}</div></div>
    <div class="form-field"><label>Nationality</label><div class="value">${form.nationality || ''}</div></div>
  </div>
  <div class="form-row">
    <div class="form-field"><label>Mailing Address (House number, Street)</label><div class="value">${form.mailing_address_street || ''}</div></div>
  </div>
  <div class="form-row">
    <div class="form-field"><label>(Town, City)</label><div class="value">${form.mailing_address_town || ''}</div></div>
  </div>
  <div class="form-row">
    <div class="form-field"><label>Contact Nos. (Residence)</label><div class="value">${form.contact_residence || ''}</div></div>
    <div class="form-field"><label>(Office)</label><div class="value">${form.contact_office || ''}</div></div>
    <div class="form-field"><label>(Mobile)</label><div class="value">${form.contact_mobile || ''}</div></div>
  </div>
  <div class="form-row">
    <div class="form-field"><label>Zip Code</label><div class="value">${form.zip_code || ''}</div></div>
    <div class="form-field"><label>Tax Identification No.</label><div class="value">${form.tax_id || ''}</div></div>
    <div class="form-field"><label>SSS No.</label><div class="value">${form.sss_no || ''}</div></div>
  </div>
  <div class="form-row">
    <div class="form-field"><label>Beneficiary</label><div class="value">${form.beneficiary || ''}</div></div>
  </div>

  <div class="section-header">Direct Upline's Data</div>
  <div class="form-row">
    <div class="form-field"><label>Direct Upline's ID No.</label><div class="value">${form.upline_id || ''}</div></div>
  </div>
  <div class="form-row">
    <div class="form-field"><label>Name (Last name, First name, M.I.)</label><div class="value">${form.upline_name || ''}</div></div>
  </div>
  <div class="form-row">
    <div class="form-field"><label>Mailing Address</label><div class="value">${form.upline_address || ''}</div></div>
  </div>
  <div class="form-row">
    <div class="form-field"><label>(Town, City)</label><div class="value">${form.upline_town || ''}</div></div>
  </div>
  <div class="form-row">
    <div class="form-field"><label>Contact (Residence)</label><div class="value">${form.upline_contact_residence || ''}</div></div>
    <div class="form-field"><label>(Office)</label><div class="value">${form.upline_contact_office || ''}</div></div>
    <div class="form-field"><label>(Mobile)</label><div class="value">${form.upline_contact_mobile || ''}</div></div>
  </div>
  <div class="form-row">
    <div class="form-field"><label>Zip Code</label><div class="value">${form.upline_zip_code || ''}</div></div>
    <div class="form-field"><label>Tax Identification No.</label><div class="value">${form.upline_tax_id || ''}</div></div>
    <div class="form-field"><label>SSS No.</label><div class="value">${form.upline_sss_no || ''}</div></div>
  </div>

  <div class="section-header">Sponsor's Data</div>
  <div class="form-row">
    <div class="form-field"><label>Sponsor's ID No.</label><div class="value">${form.sponsor_id || ''}</div></div>
  </div>
  <div class="form-row">
    <div class="form-field"><label>Name (Last name, First name, M.I.)</label><div class="value">${form.sponsor_name || ''}</div></div>
  </div>

  <div style="display:flex;gap:20px;margin-top:12px">
    <div class="declaration" style="flex:1">
      <p><strong>Declaration</strong></p>
      <p>I, the undersigned, prior to becoming a distributor of Dynapharm, have read and understood the Dynapharm Compensation Plan and Distributor Agreement which are deemed to form part of this contract. I have read and am fully aware of the Terms and Conditions, and policies appearing on the reverse of this application form.</p>
    </div>
    <div style="flex:1">
      <p style="font-size:10px;font-weight:bold;text-align:center;margin-bottom:6px">Material Received</p>
      <div class="checkbox-grid">
        ${MATERIALS_LIST.map(m => `
          <div class="checkbox-item">
            <div class="box">${materialsArr.includes(m) ? '&#10003;' : ''}</div>
            <span>${m}</span>
          </div>
        `).join('')}
        <div class="checkbox-item">
          <div class="box">${matOthers ? '&#10003;' : ''}</div>
          <span>Others: ${matOthers || '___________'}</span>
        </div>
      </div>
      <p style="font-size:10px;margin-top:6px"><strong>Kit Type:</strong> ${(form.kit_type || 'supplements') === 'supplements' ? '&#9632; Supplements' : '&#9633; Supplements'} &nbsp; ${(form.kit_type || 'supplements') === 'fertilizers' ? '&#9632; Fertilizers' : '&#9633; Fertilizers'}</p>
    </div>
  </div>

  <div class="signature-row">
    <div class="signature-field"><div class="line">Date</div></div>
    <div class="signature-field"><div class="line">Applicant's Signature</div></div>
  </div>

  <div class="official-box">
    <h4>FOR OFFICIAL USE ONLY</h4>
    <div class="official-row"><label>Date Received:</label><div class="val">${agreement?.date_received || form.declaration_date || ''}</div></div>
    <div class="official-row"><label>Received by:</label><div class="val">${agreement?.received_by || ''}</div></div>
    <div class="official-row"><label>Processed by:</label><div class="val">${agreement?.processed_by || ''}</div></div>
    <div class="official-row"><label>Assigned Distributor ID No.:</label><div class="val" style="font-weight:bold;color:#c41e3a">${nb}</div></div>
  </div>

  <div class="footer">
    <span>White (Head Office)</span>
    <span>Yellow (Stockist / Sales Center)</span>
    <span>Blue (Distributor)</span>
  </div>
</div>
</body></html>`;
}

export function MembershipAgreementForm({ mode = 'standalone', userBranch, onComplete }) {
  const { user } = useAuth();
  const isBranchMode = mode === 'branch';

  const [form, setForm] = useState({
    last_name: '', first_name: '', middle_initial: '',
    birthdate: '', age: '', sex: '', nationality: 'Namibian',
    mailing_address_street: '', mailing_address_town: '',
    contact_residence: '', contact_office: '', contact_mobile: '',
    zip_code: '', tax_id: '', sss_no: '', beneficiary: '',
    upline_id: '', upline_name: '', upline_address: '', upline_town: '',
    upline_contact_residence: '', upline_contact_office: '', upline_contact_mobile: '',
    upline_zip_code: '', upline_tax_id: '', upline_sss_no: '',
    sponsor_id: '', sponsor_name: '',
    kit_type: 'supplements',
    materials_received: [],
    materials_others: '',
    processing_branch: userBranch || user?.branch || '',
    declaration_agreed: false,
    declaration_date: new Date().toISOString().slice(0, 10),
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));

  const handleBirthdateChange = (val) => {
    set('birthdate', val);
    if (val) {
      const birth = new Date(val);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
      set('age', String(age));
    }
  };

  const handleUplineSelect = (d) => {
    setForm(f => ({
      ...f,
      upline_id: d.distributor_code || '',
      upline_name: d.distributor_name || '',
      upline_address: d.location || '',
      upline_town: d.branch || '',
      upline_contact_mobile: d.mobile_no || '',
    }));
  };

  const handleSponsorSelect = (d) => {
    setForm(f => ({
      ...f,
      sponsor_id: d.distributor_code || '',
      sponsor_name: d.distributor_name || '',
    }));
  };

  const toggleMaterial = (m) => {
    setForm(f => ({
      ...f,
      materials_received: f.materials_received.includes(m)
        ? f.materials_received.filter(x => x !== m)
        : [...f.materials_received, m],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.last_name.trim() || !form.first_name.trim()) {
      setError('Last name and first name are required'); return;
    }
    if (!form.contact_mobile.trim()) {
      setError('Mobile contact number is required'); return;
    }
    if (!form.processing_branch) {
      setError('Please select the processing branch'); return;
    }
    if (!form.declaration_agreed) {
      setError('You must agree to the declaration to proceed'); return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/distributor-agreement', form);
      setResult(res);
      if (onComplete) onComplete(res);
    } catch (err) {
      setError(err.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrint = () => {
    const html = generateAgreementHTML(form, result?.agreement);
    const w = window.open('', '_blank', 'width=800,height=1100');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  };

  const handleShareWhatsApp = () => {
    const nb = result?.nb_number || 'PENDING';
    const name = `${form.first_name} ${form.last_name}`;
    const text = `Dynapharm Distributor Agreement\nNew Distributor: ${name}\nNB Number: ${nb}\nBranch: ${form.processing_branch}\nKit: ${form.kit_type}\nDate: ${form.declaration_date}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleShareEmail = () => {
    const nb = result?.nb_number || 'PENDING';
    const name = `${form.first_name} ${form.last_name}`;
    const subject = `Dynapharm Distributor Agreement - ${name} (${nb})`;
    const body = `Dear ${name},\n\nWelcome to Dynapharm!\n\nYour distributor agreement has been processed.\nNB Number: ${nb}\nProcessing Branch: ${form.processing_branch}\nKit Type: ${form.kit_type}\n\nPlease keep this for your records.\n\nBest regards,\nDynapharm Namibia`;
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_self');
  };

  if (result) {
    const isPending = result.status === 'pending_payment' || !result.nb_number;
    return (
      <div className="max-w-2xl mx-auto">
        {isPending ? (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-8 text-center">
            <Clock size={56} className="text-amber-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-amber-800 mb-2">Registration Submitted!</h2>
            <p className="text-gray-700 mb-4 text-sm leading-relaxed">
              The application has been submitted successfully. The new member must visit the
              selected branch with payment of <strong>N$ 1,200.00</strong> to receive their NB number.
            </p>
            <div className="bg-white rounded-lg p-4 border border-amber-200 mb-4 text-left space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Applicant</span>
                <span className="font-semibold text-gray-800">{form.first_name} {form.last_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Processing Branch</span>
                <span className="font-semibold text-gray-800">{form.processing_branch}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Kit Type</span>
                <span className="font-semibold text-gray-800 capitalize">{form.kit_type}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Reference ID</span>
                <span className="font-mono text-xs font-bold text-amber-700">{result.agreement_id}</span>
              </div>
            </div>
            <div className="bg-amber-100 border border-amber-300 rounded-lg p-3 mb-6 text-sm text-amber-800">
              <strong>Next steps:</strong> The branch will verify payment, issue the NB number, and deduct the starter kit from stock. The new member will then appear in the distributor system.
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={handlePrint}><Printer size={16} /> Print Agreement</Button>
              <Button variant="secondary" onClick={handleShareWhatsApp}><Share2 size={16} /> WhatsApp</Button>
              <Button variant="secondary" onClick={handleShareEmail}><Mail size={16} /> Email</Button>
              <Button variant="secondary" onClick={() => { setResult(null); setForm(f => ({ ...f, last_name: '', first_name: '', middle_initial: '', birthdate: '', age: '', sex: '', contact_mobile: '', contact_residence: '', contact_office: '', mailing_address_street: '', mailing_address_town: '', zip_code: '', tax_id: '', sss_no: '', beneficiary: '', upline_id: '', upline_name: '', upline_address: '', upline_town: '', upline_contact_residence: '', upline_contact_office: '', upline_contact_mobile: '', upline_zip_code: '', upline_tax_id: '', upline_sss_no: '', sponsor_id: '', sponsor_name: '', declaration_agreed: false, materials_received: [], materials_others: '' })); }}>
                Register Another
              </Button>
            </div>
          </div>
        ) : (
          <div className="bg-green-50 border-2 border-green-300 rounded-xl p-8 text-center">
            <CheckCircle size={56} className="text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-green-800 mb-2">Registration Approved!</h2>
            <p className="text-gray-600 mb-4">{result.message}</p>
            <div className="bg-white rounded-lg p-6 inline-block shadow-sm border border-green-200 mb-6">
              <p className="text-sm text-gray-500 mb-1">Assigned NB Number</p>
              <p className="text-3xl font-bold text-[#c41e3a] tracking-widest">{result.nb_number}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={handlePrint}><Printer size={16} /> Print Agreement</Button>
              <Button variant="secondary" onClick={handleShareWhatsApp}><Share2 size={16} /> WhatsApp</Button>
              <Button variant="secondary" onClick={handleShareEmail}><Mail size={16} /> Email</Button>
              <Button variant="secondary" onClick={() => { setResult(null); setForm(f => ({ ...f, last_name: '', first_name: '', middle_initial: '', birthdate: '', age: '', sex: '', contact_mobile: '', contact_residence: '', contact_office: '', mailing_address_street: '', mailing_address_town: '', zip_code: '', tax_id: '', sss_no: '', beneficiary: '', upline_id: '', upline_name: '', upline_address: '', upline_town: '', upline_contact_residence: '', upline_contact_office: '', upline_contact_mobile: '', upline_zip_code: '', upline_tax_id: '', upline_sss_no: '', sponsor_id: '', sponsor_name: '', declaration_agreed: false, materials_received: [], materials_others: '' })); }}>
                Register Another
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl mx-auto pb-24">
      {error && <Alert type="error" className="mb-4">{error}</Alert>}

      <div className="bg-white border-2 border-[#c41e3a]/30 rounded-xl overflow-hidden shadow-sm">
        <div className="bg-gradient-to-r from-[#c41e3a] to-[#8b0000] text-white p-4 flex items-center gap-4">
          <img src={COMPANY_INFO.logo} alt="Dynapharm" className="h-14 w-14 bg-white rounded-lg p-1" onError={e => { e.target.style.display = 'none'; }} />
          <div>
            <h2 className="text-lg font-bold">UGANAM DYNAPHARM NAMIBIA</h2>
            <p className="text-sm opacity-90">Shop No.1 Continental Building Independence Avenue, Windhoek Namibia.</p>
          </div>
        </div>

        <div className="text-center py-3 border-b border-[#c41e3a]/20">
          <h1 className="text-xl font-bold text-[#c41e3a] tracking-wide">DISTRIBUTOR AGREEMENT FORM</h1>
        </div>

        <div className="bg-red-50 border-b border-[#c41e3a]/20 px-4 py-2">
          <p className="text-xs font-bold text-[#c41e3a] mb-1">PLEASE READ CAREFULLY</p>
          <ol className="text-[10px] text-gray-600 space-y-0.5 list-decimal list-inside">
            <li>This is a legal agreement. <strong className="text-[#c41e3a]">FORMS WITH INCOMPLETE INFORMATION WILL NOT BE PROCESSED.</strong></li>
            <li>Please press firmly and print clearly, one letter to each square.</li>
            <li>Detach and return white copy with registration fee to the mailing address shown.</li>
            <li>Husband and wife are considered as one Distributor only.</li>
            <li>Corporation may register, but needs to submit SEC/DTI.</li>
          </ol>
        </div>

        <div className="p-4 space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-[#c41e3a] text-white text-xs font-bold px-3 py-1 rounded">Distributor's Data</span>
              <p className="text-[10px] text-gray-400">Please print clearly.</p>
            </div>
            <div className="grid grid-cols-12 gap-2">
              <FormInput label="Last Name" value={form.last_name} onChange={v => set('last_name', v)} required className="col-span-4" />
              <FormInput label="First Name" value={form.first_name} onChange={v => set('first_name', v)} required className="col-span-4" />
              <FormInput label="M.I." value={form.middle_initial} onChange={v => set('middle_initial', v)} className="col-span-1" />
              <div className="col-span-3" />
            </div>
            <div className="grid grid-cols-12 gap-2 mt-2">
              <div className="col-span-3">
                <label className="block text-xs font-semibold text-[#8b0000] mb-0.5">Birthdate</label>
                <input type="date" value={form.birthdate} onChange={e => handleBirthdateChange(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-[#c41e3a]" />
              </div>
              <FormInput label="Age" value={form.age} onChange={v => set('age', v)} className="col-span-1" small />
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-[#8b0000] mb-0.5">Sex</label>
                <div className="flex gap-2">
                  {['M', 'F'].map(s => (
                    <button key={s} type="button" onClick={() => set('sex', s)}
                      className={`flex-1 py-1.5 text-sm rounded border cursor-pointer transition-colors ${form.sex === s ? 'bg-[#c41e3a] text-white border-[#c41e3a]' : 'bg-white text-gray-600 border-gray-300 hover:border-[#c41e3a]'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <FormInput label="Nationality" value={form.nationality} onChange={v => set('nationality', v)} className="col-span-3" />
              <div className="col-span-3" />
            </div>
            <div className="grid grid-cols-12 gap-2 mt-2">
              <FormInput label="Mailing Address (House number, Street)" value={form.mailing_address_street} onChange={v => set('mailing_address_street', v)} className="col-span-12" />
            </div>
            <div className="grid grid-cols-12 gap-2 mt-2">
              <FormInput label="(Town, City)" value={form.mailing_address_town} onChange={v => set('mailing_address_town', v)} className="col-span-12" />
            </div>
            <div className="grid grid-cols-12 gap-2 mt-2">
              <FormInput label="Contact Nos. (Residence)" value={form.contact_residence} onChange={v => set('contact_residence', v)} className="col-span-4" />
              <FormInput label="(Office)" value={form.contact_office} onChange={v => set('contact_office', v)} className="col-span-4" />
              <FormInput label="(Mobile) *" value={form.contact_mobile} onChange={v => set('contact_mobile', v)} required className="col-span-4" />
            </div>
            <div className="grid grid-cols-12 gap-2 mt-2">
              <FormInput label="Zip Code" value={form.zip_code} onChange={v => set('zip_code', v)} className="col-span-3" />
              <FormInput label="Tax Identification No." value={form.tax_id} onChange={v => set('tax_id', v)} className="col-span-4" />
              <FormInput label="SSS No." value={form.sss_no} onChange={v => set('sss_no', v)} className="col-span-5" />
            </div>
            <div className="grid grid-cols-12 gap-2 mt-2">
              <FormInput label="Beneficiary" value={form.beneficiary} onChange={v => set('beneficiary', v)} className="col-span-12" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-[#c41e3a] text-white text-xs font-bold px-3 py-1 rounded">Direct Upline's Data</span>
            </div>
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-6">
                <DistributorSearch label="Direct Upline's ID No." value={form.upline_id} onChange={v => set('upline_id', v)}
                  onSelect={handleUplineSelect} placeholder="Search by NB number or name" />
              </div>
              <FormInput label="Name (auto-filled)" value={form.upline_name} onChange={v => set('upline_name', v)} className="col-span-6" />
            </div>
            <div className="grid grid-cols-12 gap-2 mt-2">
              <FormInput label="Mailing Address" value={form.upline_address} onChange={v => set('upline_address', v)} className="col-span-6" />
              <FormInput label="(Town, City)" value={form.upline_town} onChange={v => set('upline_town', v)} className="col-span-6" />
            </div>
            <div className="grid grid-cols-12 gap-2 mt-2">
              <FormInput label="Contact (Residence)" value={form.upline_contact_residence} onChange={v => set('upline_contact_residence', v)} className="col-span-4" />
              <FormInput label="(Office)" value={form.upline_contact_office} onChange={v => set('upline_contact_office', v)} className="col-span-4" />
              <FormInput label="(Mobile)" value={form.upline_contact_mobile} onChange={v => set('upline_contact_mobile', v)} className="col-span-4" />
            </div>
            <div className="grid grid-cols-12 gap-2 mt-2">
              <FormInput label="Zip Code" value={form.upline_zip_code} onChange={v => set('upline_zip_code', v)} className="col-span-3" />
              <FormInput label="Tax Identification No." value={form.upline_tax_id} onChange={v => set('upline_tax_id', v)} className="col-span-4" />
              <FormInput label="SSS No." value={form.upline_sss_no} onChange={v => set('upline_sss_no', v)} className="col-span-5" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-[#c41e3a] text-white text-xs font-bold px-3 py-1 rounded">Sponsor's Data</span>
            </div>
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-6">
                <DistributorSearch label="Sponsor's ID No." value={form.sponsor_id} onChange={v => set('sponsor_id', v)}
                  onSelect={handleSponsorSelect} placeholder="Search by NB number or name" />
              </div>
              <FormInput label="Name (auto-filled)" value={form.sponsor_name} onChange={v => set('sponsor_name', v)} className="col-span-6" />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-[#c41e3a] text-white text-xs font-bold px-3 py-1 rounded">Kit Selection</span>
            </div>
            <div className="flex gap-4">
              {[
                { value: 'supplements', label: 'Registration Kit with Alfalfa, Coffee & RI (Supplements)', price: 'N$ 1,200.00' },
                { value: 'fertilizers', label: 'Registration Kit with Fert, Coffee & RI (Fertilizers)', price: 'N$ 1,200.00' },
              ].map(k => (
                <button key={k.value} type="button" onClick={() => set('kit_type', k.value)}
                  className={`flex-1 p-4 rounded-lg border-2 text-left cursor-pointer transition-all ${form.kit_type === k.value ? 'border-[#c41e3a] bg-red-50 shadow-sm' : 'border-gray-200 hover:border-[#c41e3a]/50'}`}>
                  <p className={`text-sm font-bold ${form.kit_type === k.value ? 'text-[#c41e3a]' : 'text-gray-700'}`}>{k.value === 'supplements' ? 'Supplements Kit' : 'Fertilizers Kit'}</p>
                  <p className="text-xs text-gray-500 mt-1">{k.label}</p>
                  <p className="text-sm font-bold text-green-600 mt-2">{k.price} <span className="text-xs font-normal text-gray-400">(150 BV)</span></p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="bg-[#c41e3a] text-white text-xs font-bold px-3 py-1 rounded">Processing Branch</span>
            </div>
            {isBranchMode && userBranch ? (
              <div className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-700 flex items-center gap-2">
                <span style={{ color: '#c41e3a', fontWeight: 700 }}>🏪</span>
                <span className="font-semibold">{userBranch}</span>
                <span className="text-xs text-gray-400 ml-1">(your branch)</span>
              </div>
            ) : (
              <select value={form.processing_branch} onChange={e => set('processing_branch', e.target.value)} required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c41e3a] focus:border-[#c41e3a] bg-white">
                <option value="">Select processing branch…</option>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="border border-[#c41e3a]/30 rounded-lg p-4">
              <p className="text-xs font-bold text-[#8b0000] mb-2">Declaration</p>
              <p className="text-[10px] text-gray-600 leading-relaxed mb-3">
                I, the undersigned, prior to becoming a distributor of Dynapharm, have read and understood the Dynapharm
                Compensation Plan and Distributor Agreement which are deemed to form part of this contract. I have read
                and am fully aware of the Terms and Conditions, and policies appearing on the reverse of this application form.
              </p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.declaration_agreed} onChange={e => set('declaration_agreed', e.target.checked)}
                  className="w-4 h-4 accent-[#c41e3a]" />
                <span className="text-xs font-semibold text-gray-700">I agree to the terms and conditions</span>
              </label>
            </div>
            <div className="border border-[#c41e3a]/30 rounded-lg p-4">
              <p className="text-xs font-bold text-[#8b0000] mb-2">Material Received</p>
              <div className="grid grid-cols-2 gap-1">
                {MATERIALS_LIST.map(m => (
                  <label key={m} className="flex items-center gap-1.5 cursor-pointer text-[10px] text-gray-600">
                    <input type="checkbox" checked={form.materials_received.includes(m)} onChange={() => toggleMaterial(m)}
                      className="w-3 h-3 accent-[#c41e3a]" />
                    {m}
                  </label>
                ))}
              </div>
              <div className="mt-2">
                <FormInput label="Others" value={form.materials_others} onChange={v => set('materials_others', v)} small />
              </div>
            </div>
          </div>

        </div>
      </div>

      <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: '2px solid #f0e8ea', padding: '14px 0', zIndex: 20 }}>
        <div className="max-w-4xl mx-auto px-1">
          <Button type="submit" className="w-full py-3 text-base" disabled={submitting}>
            {submitting ? 'Submitting Registration...' : 'Submit Distributor Agreement (N$ 1,200.00)'}
          </Button>
          <p className="text-center text-xs text-gray-400 mt-2">The NB number will be issued by the selected branch after payment of N$ 1,200.00 is received and verified.</p>
        </div>
      </div>
    </form>
  );
}

export function AgreementPDFViewer({ agreement }) {
  if (!agreement) return null;

  const handlePrint = () => {
    const html = generateAgreementHTML(agreement, agreement);
    const w = window.open('', '_blank', 'width=800,height=1100');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-gray-800">Distributor Agreement</h3>
          <p className="text-sm text-gray-500">NB Number: <strong className="text-[#c41e3a]">{agreement.nb_number}</strong></p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={handlePrint}><Printer size={14} /> Print</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div><span className="text-gray-500">Name:</span> <strong>{agreement.first_name} {agreement.last_name}</strong></div>
        <div><span className="text-gray-500">Branch:</span> <strong>{agreement.processing_branch}</strong></div>
        <div><span className="text-gray-500">Kit Type:</span> <strong className="capitalize">{agreement.kit_type}</strong></div>
        <div><span className="text-gray-500">Status:</span> <strong className="capitalize">{agreement.status}</strong></div>
        <div><span className="text-gray-500">Date:</span> <strong>{agreement.declaration_date || agreement.created_at?.slice(0, 10)}</strong></div>
        <div><span className="text-gray-500">Mobile:</span> <strong>{agreement.contact_mobile}</strong></div>
      </div>
    </div>
  );
}

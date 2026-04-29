/**
 * Dynapharm International Namibia
 * Labour Letter Generator — Warning & Termination
 *
 * Auto-selects relevant Namibian Labour Act 11 of 2007 provisions
 * based on keyword analysis of the reason text.
 * Opens a print-ready window the user can Save as PDF.
 */

const COMPANY = {
  name: 'Uganam Dynapharm Namibia',
  street: 'Independence Avenue, Arno Henker Haus',
  erf: 'Erf 1654 No. 65-73',
  city: 'Windhoek, Namibia',
  phone: '+264 61 259 277',
  email: 'dynapharm02@gmail.com',
};

/* ─────────────────────────────────────────────────────────────────────────────
   NAMIBIAN LABOUR ACT 11 OF 2007 — PROVISION LIBRARY
   ───────────────────────────────────────────────────────────────────────────── */

const ACT_BASE = 'Labour Act 11 of 2007 (Namibia)';

const PROVISIONS = {
  general_misconduct: {
    label: 'Misconduct — Section 34(1)(a)',
    text: `Section 34(1)(a) of the ${ACT_BASE} provides that an employer may fairly dismiss an employee for misconduct. The Code of Good Practice on Dismissal (contained in the Act) requires that progressive disciplinary action be followed before dismissal, unless the misconduct is of a sufficiently serious nature to justify immediate dismissal. The employer is required to conduct a fair hearing before imposing any sanction.`,
  },
  theft_fraud: {
    label: 'Dishonesty / Theft — Section 34(1)(a), Serious Misconduct',
    text: `Section 34(1)(a) of the ${ACT_BASE} recognises dishonesty, theft, and fraud as grounds for dismissal. These constitute serious misconduct. Under the Code of Good Practice, acts of dishonesty that fundamentally breach the trust relationship between employer and employee may justify summary dismissal without prior warnings. The employer must still conduct a fair hearing and prove the misconduct on a balance of probabilities.`,
  },
  assault_violence: {
    label: 'Workplace Violence / Assault — Section 34(1)(a), Serious Misconduct',
    text: `Section 34(1)(a) of the ${ACT_BASE} recognises assault, violence, or the intimidation of fellow employees or management as serious misconduct. The employer has a duty under Section 4 of the Occupational Safety and Health Act 9 of 1981 (Namibia) to provide a safe working environment. Acts of violence may justify dismissal without prior warnings upon the conclusion of a fair disciplinary hearing.`,
  },
  absenteeism: {
    label: 'Absenteeism / Unauthorised Absence — Section 34(1)(a)',
    text: `Section 34(1)(a) of the ${ACT_BASE} provides that absenteeism without authorisation or a legitimate reason constitutes misconduct. Section 46 of the Act governs the employee's entitlement to annual leave and sick leave; absence beyond these entitlements without authorisation is a breach of contract. Habitual absenteeism, after fair warnings, may justify dismissal following a fair hearing.`,
  },
  lateness: {
    label: 'Habitual Lateness / Poor Timekeeping — Section 34(1)(a)',
    text: `Section 34(1)(a) of the ${ACT_BASE} recognises repeated failure to adhere to working hours as misconduct. The Code of Good Practice on Dismissal requires that the employee be made aware of the required standard, warned, and given a reasonable opportunity to improve before dismissal is considered. Continued lateness after warnings constitutes wilful non-compliance with a lawful instruction.`,
  },
  insubordination: {
    label: 'Insubordination / Refusal to Follow Instructions — Section 34(1)(a)',
    text: `Section 34(1)(a) of the ${ACT_BASE} recognises insubordination — the wilful refusal to obey a lawful and reasonable instruction of the employer — as a ground for dismissal. The instruction must be lawful, reasonable, and within the scope of the employee's duties. A single act of gross insubordination may justify dismissal; repeated insubordination after warnings will justify dismissal following a fair hearing.`,
  },
  substance_abuse: {
    label: 'Substance Abuse / Intoxication at Work — Section 34(1)(a)',
    text: `Section 34(1)(a) of the ${ACT_BASE} recognises reporting for duty whilst under the influence of alcohol or intoxicating substances as serious misconduct. This also constitutes a violation of the Occupational Safety and Health Act 9 of 1981 (Namibia), as intoxication poses a risk to the safety of the employee and co-workers. The employer's substance abuse policy supplements this legal obligation.`,
  },
  harassment: {
    label: 'Harassment / Discrimination — Section 34(1)(a); Affirmative Action (Employment) Act 29 of 1998',
    text: `Section 34(1)(a) of the ${ACT_BASE} recognises workplace harassment as misconduct. Additionally, the Affirmative Action (Employment) Act 29 of 1998 and the Namibian Constitution (Article 10) prohibit unfair discrimination. Sexual harassment constitutes a particularly serious form of misconduct that may justify summary dismissal upon the conclusion of a fair hearing. Every employee has the right to dignity and a harassment-free workplace.`,
  },
  poor_performance: {
    label: 'Poor Work Performance / Incapacity — Section 34(1)(b)',
    text: `Section 34(1)(b) of the ${ACT_BASE} provides that an employer may fairly dismiss an employee for incapacity due to poor work performance. The Code of Good Practice requires that before dismissal: (i) the employee must be made aware of the required performance standard; (ii) the employee must be given a fair opportunity and assistance to meet the standard; (iii) a formal incapacity inquiry must be conducted; and (iv) dismissal is a last resort after the employee has failed to improve despite support.`,
  },
  negligence: {
    label: 'Negligence / Gross Negligence — Section 34(1)(a)',
    text: `Section 34(1)(a) of the ${ACT_BASE} recognises negligence — the failure to exercise the standard of care reasonably expected in the employee's position — as misconduct. Gross negligence, which involves a serious failure of duty that causes or could cause harm to the employer, clients, or fellow employees, may justify dismissal at first instance following a fair hearing.`,
  },
  operational: {
    label: 'Operational Requirements / Retrenchment — Section 34(1)(c); Section 35',
    text: `Section 34(1)(c) of the ${ACT_BASE} permits termination based on the operational requirements of the employer. This includes economic, technological, structural, or similar needs of the enterprise. Section 35 of the Act requires that: (i) the employer consult with the employee or their representative; (ii) consider alternatives to termination; and (iii) select employees for retrenchment on a fair and objective basis. A minimum notice period as prescribed by Section 45 of the Act applies.`,
  },
};

const NOTICE_PERIODS = `
  <p>In terms of Section 45 of the ${ACT_BASE}, the following minimum notice periods apply:</p>
  <ul>
    <li>Less than 4 weeks' service: 1 day's notice</li>
    <li>4 weeks to 1 year's service: 1 week's notice</li>
    <li>1 year to 5 years' service: 2 weeks' notice</li>
    <li>More than 5 years' service: 1 month's notice</li>
  </ul>
`;

/* ─────────────────────────────────────────────────────────────────────────────
   KEYWORD → PROVISION MATCHER
   ───────────────────────────────────────────────────────────────────────────── */

export function detectProvisions(reason = '', type = '') {
  const r = (reason + ' ' + type).toLowerCase();

  const matched = [];

  if (/theft|steal|stolen|fraud|dishonest|forgery|forge/.test(r))       matched.push(PROVISIONS.theft_fraud);
  if (/assault|fight|violence|threaten|intimidat|physical/.test(r))     matched.push(PROVISIONS.assault_violence);
  if (/absent|absenteeism|unauthorised absence|no show/.test(r))        matched.push(PROVISIONS.absenteeism);
  if (/late|lateness|punctuality|tardy|time-keeping|timekeeping/.test(r)) matched.push(PROVISIONS.lateness);
  if (/insubordinat|disobey|refused|refuse|unlawful instruction|defy/.test(r)) matched.push(PROVISIONS.insubordination);
  if (/alcohol|drunk|intoxicat|substance|drug|narco/.test(r))           matched.push(PROVISIONS.substance_abuse);
  if (/harass|bully|discriminat|sexual|victimis/.test(r))               matched.push(PROVISIONS.harassment);
  if (/performance|incompeten|incapacity|poor work|unable to perform/.test(r)) matched.push(PROVISIONS.poor_performance);
  if (/negligen|careless|damage|reckless/.test(r))                      matched.push(PROVISIONS.negligence);
  if (/retrench|redundan|restructur|operational requirement|downsiz|reorgani/.test(r)) matched.push(PROVISIONS.operational);

  if (matched.length === 0) matched.push(PROVISIONS.general_misconduct);

  return matched;
}

/* ─────────────────────────────────────────────────────────────────────────────
   HTML TEMPLATE
   ───────────────────────────────────────────────────────────────────────────── */

function formatNamibianDate(dateStr) {
  if (!dateStr) return new Date().toLocaleDateString('en-NA', { day: 'numeric', month: 'long', year: 'numeric' });
  return new Date(dateStr).toLocaleDateString('en-NA', { day: 'numeric', month: 'long', year: 'numeric' });
}

function buildHTML({ type, employeeName, warningType, reason, date, effectiveDate, severance, refNo, acknowledgedAt }) {
  const isTermination = type === 'termination';
  const letterDate = formatNamibianDate(date || effectiveDate);
  const provisions = detectProvisions(reason, warningType || '');

  const warningTypeLabel = warningType
    ? `${warningType.toUpperCase()} WARNING`
    : 'WARNING';

  const subject = isTermination
    ? 'NOTICE OF TERMINATION OF EMPLOYMENT'
    : `${warningTypeLabel} NOTICE`;

  const subjectColor = isTermination ? '#7f1d1d' : warningType === 'Final' ? '#7c2d12' : warningType === 'Written' ? '#78350f' : '#1e3a5f';

  const warningConsequence = () => {
    if (warningType === 'Verbal') return `
      <p>This verbal warning is the first step in the Company's progressive disciplinary process. You are hereby advised that a recurrence of the above misconduct, or any other breach of Company policy or the applicable legislation, may result in a written warning, final warning, or dismissal, depending on the severity of the offence.</p>
      <p>You are expected to immediately desist from the conduct described above and to maintain the required standard of conduct and performance at all times.</p>
    `;
    if (warningType === 'Written') return `
      <p>This written warning forms part of the Company's progressive disciplinary process and will remain on your personnel file for a period of <strong>twelve (12) months</strong>. A recurrence of the above misconduct, or any similar conduct during this period, may result in a final warning or dismissal.</p>
      <p>You are required to immediately correct the behaviour described above. If you require any support or guidance to meet the Company's expectations, you are encouraged to approach your line manager or the HR Department.</p>
    `;
    if (warningType === 'Final') return `
      <p>This <strong>FINAL WARNING</strong> is the last step in the Company's progressive disciplinary process and will remain on your personnel file for a period of <strong>twelve (12) months</strong>. Should you commit any further act of misconduct during this period — whether of the same or a different nature — the Company will be entitled to proceed with dismissal following a fair disciplinary hearing.</p>
      <p>You are strongly advised to immediately and permanently correct the conduct described above. The Company has invested significant effort in addressing this matter through progressive discipline, and expects full compliance with all Company policies and Namibian labour law going forward.</p>
    `;
    return '';
  };

  const provisionsHTML = provisions.map(p => `
    <div class="provision">
      <div class="provision-label">${p.label}</div>
      <p>${p.text}</p>
    </div>
  `).join('');

  const terminationBody = isTermination ? `
    <p>After due consideration, and following a fair disciplinary / incapacity inquiry conducted in accordance with the ${ACT_BASE} and the Company's disciplinary policy, the Company has resolved to terminate your employment.</p>
    <p><strong>Effective Date of Termination:</strong> ${formatNamibianDate(effectiveDate)}</p>
    ${severance && Number(severance) > 0 ? `<p><strong>Severance / Final Payment:</strong> N$ ${Number(severance).toFixed(2)} (subject to applicable deductions and taxation in terms of the Income Tax Act 24 of 1981 (Namibia))</p>` : ''}
    <div class="section-title">Notice Period</div>
    ${NOTICE_PERIODS}
    <p>You are required to return all Company property, including but not limited to: keys, access cards, uniforms, equipment, and any confidential documents or data, on or before your effective date of termination. Failure to do so may result in the Company exercising its legal remedies.</p>
    <p>A certificate of service will be issued to you upon request in accordance with Section 47 of the ${ACT_BASE}.</p>
  ` : warningConsequence();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject} — ${employeeName}</title>
  <style>
    @page {
      size: A4;
      margin: 22mm 20mm 25mm 20mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 11.5pt;
      line-height: 1.6;
      color: #1a1a1a;
      background: #fff;
    }
    .letterhead {
      border-bottom: 3px double #c41e3a;
      padding-bottom: 14px;
      margin-bottom: 22px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .company-name {
      font-size: 15pt;
      font-weight: bold;
      color: #c41e3a;
      letter-spacing: 0.5px;
    }
    .company-sub {
      font-size: 9pt;
      color: #555;
      margin-top: 3px;
    }
    .doc-ref {
      text-align: right;
      font-size: 9pt;
      color: #555;
    }
    .confidential-banner {
      text-align: center;
      font-size: 9pt;
      font-weight: bold;
      letter-spacing: 2px;
      color: #7f1d1d;
      border: 1px solid #fca5a5;
      background: #fff1f2;
      padding: 4px 0;
      margin-bottom: 18px;
    }
    .date-line { margin-bottom: 14px; font-size: 11pt; }
    .to-block { margin-bottom: 18px; font-size: 11pt; }
    .to-block p { margin-bottom: 2px; }
    .subject-line {
      text-align: center;
      font-size: 13pt;
      font-weight: bold;
      color: ${subjectColor};
      text-decoration: underline;
      margin: 20px 0 18px 0;
      letter-spacing: 0.5px;
    }
    p { margin-bottom: 10px; }
    .section-title {
      font-size: 11pt;
      font-weight: bold;
      color: #1e3a5f;
      margin: 18px 0 8px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #dbeafe;
      padding-bottom: 3px;
    }
    .reason-box {
      background: #f8fafc;
      border-left: 4px solid ${subjectColor};
      padding: 12px 14px;
      margin: 10px 0 18px 0;
      font-size: 11pt;
      white-space: pre-wrap;
      border-radius: 0 4px 4px 0;
    }
    .provision {
      background: #f0f4ff;
      border-left: 4px solid #3b5bdb;
      padding: 10px 14px;
      margin-bottom: 12px;
      border-radius: 0 4px 4px 0;
      font-size: 10.5pt;
    }
    .provision-label {
      font-weight: bold;
      color: #1e3a5f;
      margin-bottom: 5px;
      font-size: 10.5pt;
    }
    ul { padding-left: 22px; margin-bottom: 10px; }
    ul li { margin-bottom: 4px; }
    .rights-box {
      background: #fefce8;
      border: 1px solid #fde68a;
      border-radius: 4px;
      padding: 10px 14px;
      margin: 14px 0;
      font-size: 10.5pt;
    }
    .signature-section {
      margin-top: 36px;
      page-break-inside: avoid;
    }
    .sig-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      margin-top: 16px;
    }
    .sig-block { font-size: 10.5pt; }
    .sig-line {
      border-bottom: 1px solid #1a1a1a;
      height: 38px;
      margin-bottom: 4px;
    }
    .sig-label { font-size: 9.5pt; color: #555; }
    .footer {
      margin-top: 28px;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
      font-size: 8.5pt;
      color: #94a3b8;
      text-align: center;
    }
    @media print {
      body { font-size: 11pt; }
      .no-print { display: none !important; }
      .page-break { page-break-before: always; }
    }
    .print-btn {
      position: fixed;
      top: 18px;
      right: 18px;
      padding: 10px 22px;
      background: #c41e3a;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: bold;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
      z-index: 1000;
      font-family: Arial, sans-serif;
    }
    .print-btn:hover { background: #991b1b; }
  </style>
</head>
<body>

  <button class="print-btn no-print" onclick="window.print()">🖨 Print / Save as PDF</button>

  <!-- LETTERHEAD -->
  <div class="letterhead">
    <div>
      <div class="company-name">${COMPANY.name}</div>
      <div class="company-sub">${COMPANY.street}</div>
      <div class="company-sub">${COMPANY.erf}</div>
      <div class="company-sub">${COMPANY.city}</div>
      <div class="company-sub" style="margin-top:3px;">Tel: ${COMPANY.phone} | Email: ${COMPANY.email}</div>
    </div>
    <div class="doc-ref">
      <div><strong>Ref:</strong> ${refNo}</div>
      <div><strong>Classification:</strong> CONFIDENTIAL</div>
      <div><strong>Date:</strong> ${letterDate}</div>
    </div>
  </div>

  <div class="confidential-banner">PRIVATE &amp; CONFIDENTIAL — ADDRESSEE ONLY</div>

  <!-- DATE + ADDRESSEE -->
  <div class="date-line">${letterDate}</div>

  <div class="to-block">
    <p><strong>${employeeName}</strong></p>
    <p>Employee</p>
    <p>${COMPANY.name}</p>
  </div>

  <div class="subject-line">RE: ${subject}</div>

  <!-- OPENING -->
  <p>Dear <strong>${employeeName}</strong>,</p>
  ${isTermination
    ? `<p>We write to formally notify you that your employment with ${COMPANY.name} has been terminated in accordance with the ${ACT_BASE} and the Company's internal disciplinary policy, effective <strong>${formatNamibianDate(effectiveDate)}</strong>.</p>`
    : `<p>This letter serves as formal notification of a <strong>${warningTypeLabel}</strong> issued to you in your capacity as an employee of ${COMPANY.name}. This letter must be read carefully and retained for your records.</p>`
  }

  <!-- NATURE OF CONDUCT -->
  <div class="section-title">Nature of the Conduct / Incident</div>
  <p>The following conduct / incident has been recorded and forms the basis of this ${isTermination ? 'notice of termination' : 'warning notice'}:</p>
  <div class="reason-box">${reason || '(Not specified)'}</div>
  ${date && !isTermination ? `<p><strong>Date of Incident / Warning:</strong> ${formatNamibianDate(date)}</p>` : ''}

  <!-- LEGAL BASIS -->
  <div class="section-title">Applicable Namibian Legislation</div>
  <p>The following provisions of Namibian labour law are applicable to the conduct described above:</p>
  ${provisionsHTML}

  <!-- EMPLOYEE RIGHTS -->
  <div class="rights-box">
    <strong>Employee Rights Notice (${ACT_BASE}):</strong><br/>
    You have the right to be heard before any sanction is imposed. You may be represented by a co-employee or a trade union representative at any disciplinary hearing. If you believe this ${isTermination ? 'termination' : 'warning'} is procedurally or substantively unfair, you have the right to refer the dispute to the Office of the Labour Commissioner (Namibia) within <strong>one (1) year</strong> of the alleged unfair act, in terms of Section 86 of the ${ACT_BASE}.
  </div>

  <!-- BODY (warning consequences / termination details) -->
  <div class="section-title">${isTermination ? 'Terms of Termination' : 'Expected Conduct Going Forward'}</div>
  ${terminationBody}

  <!-- SIGNATURE BLOCK -->
  <div class="signature-section">
    <div class="section-title">Acknowledgement of Receipt</div>
    <p>The employee acknowledges receipt of this letter and confirms that its contents have been explained and understood. Signing this letter does not constitute an admission of guilt; it is an acknowledgement of receipt only.</p>

    <div class="sig-grid">
      <div class="sig-block">
        <div class="sig-line"></div>
        <div><strong>HR Representative / Authorised Signatory</strong></div>
        <div class="sig-label">Name: ________________________________</div>
        <div class="sig-label">Designation: _________________________</div>
        <div class="sig-label">Date: ________________________________</div>
      </div>
      <div class="sig-block">
        ${acknowledgedAt
          ? `<div style="border:2px solid #166534;border-radius:6px;padding:10px;background:#f0fdf4;">
              <div style="color:#166534;font-weight:bold;font-size:10pt;">✔ Digitally Acknowledged</div>
              <div class="sig-label" style="margin-top:4px;">Name: <strong>${employeeName}</strong></div>
              <div class="sig-label">Acknowledged via staff portal on:</div>
              <div style="font-weight:700;color:#166534;margin-top:2px;">${acknowledgedAt}</div>
              <div class="sig-label" style="margin-top:4px;">Employee ID / NB No.: ________________</div>
             </div>`
          : `<div class="sig-line"></div>
             <div><strong>Employee Signature</strong></div>
             <div class="sig-label">Name: <strong>${employeeName}</strong></div>
             <div class="sig-label">Employee ID / NB No.: ________________</div>
             <div class="sig-label">Date: ________________________________</div>`
        }
      </div>
    </div>

    ${acknowledgedAt ? `
    <div style="margin-top:14px;padding:8px 14px;background:#f0fdf4;border:1px solid #86efac;border-radius:4px;font-size:9.5pt;color:#166534;">
      This letter was electronically acknowledged by <strong>${employeeName}</strong> on <strong>${acknowledgedAt}</strong> via the Dynapharm Staff Portal. Digital acknowledgement is legally equivalent to physical signature for record-keeping purposes.
    </div>` : `
    <div style="margin-top:18px; font-size:10pt;">
      <p><em>If the employee refuses to sign, the HR representative should note: "Employee declined to sign on [date]" and have a witness co-sign below.</em></p>
      <div style="margin-top:10px;">
        <div class="sig-line" style="width:50%"></div>
        <div class="sig-label">Witness Signature | Name: __________________ | Date: __________</div>
      </div>
    </div>`}
  </div>

  <div class="footer">
    This document was generated by the ${COMPANY.name} Human Resources Management System. &nbsp;|&nbsp; Generated: ${new Date().toLocaleString('en-NA')} &nbsp;|&nbsp; Ref: ${refNo}
  </div>

</body>
</html>`;
}

/* ─────────────────────────────────────────────────────────────────────────────
   PUBLIC API
   ───────────────────────────────────────────────────────────────────────────── */

function makeRef(type, name) {
  const ts = new Date();
  const yy = ts.getFullYear();
  const mm = String(ts.getMonth() + 1).padStart(2, '0');
  const dd = String(ts.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const prefix = type === 'termination' ? 'TERM' : 'WARN';
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
  return `DYN/${prefix}/${yy}${mm}${dd}/${initials}-${rand}`;
}

export function generateWarningLetter(record, acknowledgedAt) {
  const html = buildHTML({
    type: 'warning',
    employeeName: record.employee_name || record.employeeName || 'Unknown Employee',
    warningType: record.subtype || record.warning_type || 'Verbal',
    reason: record.reason || '',
    date: record.date || record.created_at,
    refNo: makeRef('warning', record.employee_name || 'EMP'),
    acknowledgedAt: acknowledgedAt || null,
  });
  openLetterWindow(html);
}

export function generateTerminationLetter(record, acknowledgedAt) {
  const html = buildHTML({
    type: 'termination',
    employeeName: record.employee_name || record.employeeName || 'Unknown Employee',
    reason: record.reason || '',
    effectiveDate: record.effective_date || record.effectiveDate,
    severance: record.severance,
    date: record.created_at,
    refNo: makeRef('termination', record.employee_name || 'EMP'),
    acknowledgedAt: acknowledgedAt || null,
  });
  openLetterWindow(html);
}

/**
 * Generate a letter from a staff inbox notification (StaffMessagesTab).
 * The notification metadata carries issued_by, subtype, date, reason, etc.
 */
export function generateStaffLetter(notification, acknowledgedAt) {
  let meta = {};
  try {
    meta = typeof notification.metadata === 'string'
      ? JSON.parse(notification.metadata || '{}')
      : (notification.metadata || {});
  } catch (e) {}

  const isTermination = notification.type === 'termination';
  const employeeName = meta.employee_name || notification.recipient_name || 'Employee';

  if (isTermination) {
    const html = buildHTML({
      type: 'termination',
      employeeName,
      reason: meta.reason || notification.message || '',
      effectiveDate: meta.effective_date || null,
      severance: meta.severance || null,
      date: meta.date || notification.created_at,
      refNo: meta.ref_no || makeRef('termination', employeeName),
      acknowledgedAt: acknowledgedAt || null,
    });
    openLetterWindow(html);
  } else {
    const html = buildHTML({
      type: 'warning',
      employeeName,
      warningType: meta.subtype || 'Verbal',
      reason: meta.reason || notification.message || '',
      date: meta.date || notification.created_at,
      refNo: meta.ref_no || makeRef('warning', employeeName),
      acknowledgedAt: acknowledgedAt || null,
    });
    openLetterWindow(html);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   TRANSFER LETTER — separate builder (no misconduct provisions needed)
   ───────────────────────────────────────────────────────────────────────────── */

function buildTransferHTML({ employeeName, currentBranch, newBranch, currentPosition, newPosition,
  effectiveDate, endDate, transferType, reason, issuedBy, refNo }) {

  const letterDate = formatNamibianDate(null);
  const effDate    = formatNamibianDate(effectiveDate);
  const endDateStr = endDate ? formatNamibianDate(endDate) : null;
  const isPermanent = !transferType || transferType === 'permanent';
  const positionChanged = newPosition && newPosition.trim() && newPosition.trim().toLowerCase() !== currentPosition.trim().toLowerCase();

  const subject = isPermanent
    ? 'NOTICE OF PERMANENT TRANSFER'
    : 'NOTICE OF TEMPORARY TRANSFER / SECONDMENT';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject} — ${employeeName}</title>
  <style>
    @page { size: A4; margin: 22mm 20mm 25mm 20mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Times New Roman', Times, serif; font-size: 11.5pt; line-height: 1.65; color: #1a1a1a; background: #fff; }
    .letterhead { border-bottom: 3px double #c41e3a; padding-bottom: 14px; margin-bottom: 22px; display: flex; justify-content: space-between; align-items: flex-start; }
    .company-name { font-size: 15pt; font-weight: bold; color: #c41e3a; letter-spacing: 0.5px; }
    .company-sub { font-size: 9pt; color: #555; margin-top: 3px; }
    .doc-ref { text-align: right; font-size: 9pt; color: #555; }
    .confidential-banner { text-align: center; font-size: 9pt; font-weight: bold; letter-spacing: 2px; color: #1e3a5f; border: 1px solid #bfdbfe; background: #eff6ff; padding: 4px 0; margin-bottom: 18px; }
    .date-line { margin-bottom: 14px; font-size: 11pt; }
    .to-block { margin-bottom: 18px; font-size: 11pt; }
    .to-block p { margin-bottom: 2px; }
    .subject-line { text-align: center; font-size: 13pt; font-weight: bold; color: #1e3a5f; text-decoration: underline; margin: 20px 0 18px 0; letter-spacing: 0.5px; }
    p { margin-bottom: 10px; }
    .section-title { font-size: 11pt; font-weight: bold; color: #1e3a5f; margin: 18px 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #dbeafe; padding-bottom: 3px; }
    .details-table { width: 100%; border-collapse: collapse; margin: 10px 0 18px 0; font-size: 11pt; }
    .details-table td { padding: 7px 10px; border: 1px solid #e2e8f0; vertical-align: top; }
    .details-table td:first-child { font-weight: bold; color: #1e3a5f; width: 38%; background: #f8fafc; }
    .provision { background: #f0f4ff; border-left: 4px solid #3b5bdb; padding: 10px 14px; margin-bottom: 12px; border-radius: 0 4px 4px 0; font-size: 10.5pt; }
    .provision-label { font-weight: bold; color: #1e3a5f; margin-bottom: 5px; font-size: 10.5pt; }
    .rights-box { background: #fefce8; border: 1px solid #fde68a; border-radius: 4px; padding: 10px 14px; margin: 14px 0; font-size: 10.5pt; }
    .signature-section { margin-top: 36px; page-break-inside: avoid; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 16px; }
    .sig-block { font-size: 10.5pt; }
    .sig-line { border-bottom: 1px solid #1a1a1a; height: 38px; margin-bottom: 4px; }
    .sig-label { font-size: 9.5pt; color: #555; }
    .footer { margin-top: 28px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 8.5pt; color: #94a3b8; text-align: center; }
    @media print { body { font-size: 11pt; } .no-print { display: none !important; } }
    .print-btn { position: fixed; top: 18px; right: 18px; padding: 10px 22px; background: #1e3a5f; color: #fff; border: none; border-radius: 6px; font-size: 13px; font-weight: bold; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.18); z-index: 1000; font-family: Arial, sans-serif; }
    .print-btn:hover { background: #1e40af; }
  </style>
</head>
<body>

  <button class="print-btn no-print" onclick="window.print()">🖨 Print / Save as PDF</button>

  <div class="letterhead">
    <div>
      <div class="company-name">${COMPANY.name}</div>
      <div class="company-sub">${COMPANY.street}</div>
      <div class="company-sub">${COMPANY.erf}</div>
      <div class="company-sub">${COMPANY.city}</div>
      <div class="company-sub" style="margin-top:3px;">Tel: ${COMPANY.phone} | Email: ${COMPANY.email}</div>
    </div>
    <div class="doc-ref">
      <div><strong>Ref:</strong> ${refNo}</div>
      <div><strong>Classification:</strong> CONFIDENTIAL</div>
      <div><strong>Date:</strong> ${letterDate}</div>
    </div>
  </div>

  <div class="confidential-banner">PRIVATE &amp; CONFIDENTIAL — ADDRESSEE ONLY</div>

  <div class="date-line">${letterDate}</div>

  <div class="to-block">
    <p><strong>${employeeName}</strong></p>
    <p>${currentPosition || 'Employee'}</p>
    <p>${currentBranch || COMPANY.name}</p>
    <p>${COMPANY.name}</p>
  </div>

  <div class="subject-line">RE: ${subject}</div>

  <p>Dear <strong>${employeeName}</strong>,</p>
  <p>
    We write to formally notify you of your ${isPermanent ? 'permanent transfer' : 'temporary transfer / secondment'} within
    <strong>${COMPANY.name}</strong>, effective <strong>${effDate}</strong>. This letter sets out the terms and conditions
    of your transfer and the applicable provisions of Namibian labour law.
  </p>

  <div class="section-title">Transfer Details</div>
  <table class="details-table">
    <tr><td>Employee Name</td><td>${employeeName}</td></tr>
    <tr><td>Transfer Type</td><td>${isPermanent ? 'Permanent Transfer' : 'Temporary Transfer / Secondment'}</td></tr>
    <tr><td>From Branch / Location</td><td>${currentBranch || '—'}</td></tr>
    <tr><td>To Branch / Location</td><td>${newBranch || '—'}</td></tr>
    <tr><td>Current Position / Role</td><td>${currentPosition || '—'}</td></tr>
    <tr><td>New Position / Role</td><td>${positionChanged ? newPosition : currentPosition + ' (unchanged)'}</td></tr>
    <tr><td>Effective Date</td><td>${effDate}</td></tr>
    ${!isPermanent && endDateStr ? `<tr><td>End Date (Secondment)</td><td>${endDateStr}</td></tr>` : ''}
    ${reason ? `<tr><td>Reason / Business Justification</td><td>${reason}</td></tr>` : ''}
    ${issuedBy ? `<tr><td>Authorised By</td><td>${issuedBy}</td></tr>` : ''}
  </table>

  <div class="section-title">Applicable Namibian Legislation</div>
  <p>This transfer is effected in accordance with the following provisions of Namibian law:</p>

  <div class="provision">
    <div class="provision-label">Employer's Management Prerogative — Labour Act 11 of 2007</div>
    <p>The employer retains the inherent common law right and the right under the <strong>Labour Act 11 of 2007 (Namibia)</strong> to direct, organise, and manage the enterprise. This includes the right to deploy employees across branches and locations to meet legitimate operational requirements. This right must be exercised reasonably, in good faith, and in a manner consistent with the Act.</p>
  </div>

  <div class="provision">
    <div class="provision-label">Changes to Conditions of Employment — Section 26, Labour Act 11 of 2007</div>
    <p>Section 26(1) of the <strong>Labour Act 11 of 2007</strong> provides that an employer may not unilaterally vary the terms and conditions of employment to the material detriment of the employee without either the employee's written consent or a fair and legitimate operational justification. A transfer within the same employer, maintaining equivalent terms, conditions, remuneration, and benefits, does not constitute an unlawful unilateral variation of contract.</p>
    <p>Where any condition of employment is materially altered as a result of this transfer, Section 26(2) requires prior consultation with the employee and reasonable notice in accordance with Section 45 of the Act.</p>
  </div>

  <div class="provision">
    <div class="provision-label">Employment Contract and Constructive Dismissal — Section 33 &amp; Section 49, Labour Act 11 of 2007</div>
    <p>Section 33 of the <strong>Labour Act 11 of 2007</strong> provides that a constructive dismissal occurs when an employer, by conduct, makes continued employment intolerable. The Company confirms that this transfer does not constitute a constructive dismissal. Your remuneration, leave entitlements, and continuity of service remain unaffected by this transfer unless expressly stated otherwise in writing.</p>
    <p>In the event of a temporary transfer / secondment, Section 49 of the Act protects the employee's continuity of service and existing terms during the secondment period.</p>
  </div>

  ${positionChanged ? `
  <div class="provision">
    <div class="provision-label">Change of Position — Employment Contract &amp; Section 26, Labour Act 11 of 2007</div>
    <p>Your position is changed from <strong>${currentPosition}</strong> to <strong>${newPosition}</strong> with effect from ${effDate}. This change is made in accordance with the Company's operational requirements. Your revised duties and responsibilities shall be communicated to you by your new line manager. Where applicable, your remuneration will be adjusted to reflect the new role in accordance with the Company's remuneration policy.</p>
  </div>` : ''}

  <div class="rights-box">
    <strong>Employee Rights Notice (Labour Act 11 of 2007):</strong><br/>
    You have the right to be consulted regarding this transfer. If you believe that this transfer materially and adversely alters your conditions of employment without justification, or amounts to a constructive dismissal, you have the right to refer a dispute to the <strong>Office of the Labour Commissioner (Namibia)</strong> within <strong>one (1) year</strong> of the alleged unfair act, in terms of Section 86 of the Labour Act 11 of 2007. You may be represented by a co-employee or a trade union representative in any such proceedings.
  </div>

  <div class="section-title">Terms &amp; Conditions During Transfer</div>
  <p>Unless otherwise specified in writing, the following terms apply during the transfer period:</p>
  <ul>
    <li>Your remuneration, benefits, and leave entitlements remain unchanged.</li>
    <li>Your continuity of service and accrued rights are fully preserved.</li>
    <li>You are required to report to the Branch Manager at <strong>${newBranch}</strong> on <strong>${effDate}</strong>.</li>
    <li>You remain subject to all Company policies, procedures, and the Namibian Labour Act 11 of 2007.</li>
    ${!isPermanent && endDateStr ? `<li>At the end of the secondment period (<strong>${endDateStr}</strong>), you shall revert to your original position and branch, unless otherwise agreed in writing.</li>` : ''}
  </ul>

  <div class="signature-section">
    <div class="section-title">Acknowledgement of Receipt</div>
    <p>The employee acknowledges receipt of this transfer notice and confirms that its contents have been explained and understood. Signing this notice does not waive any rights the employee may have under the Labour Act 11 of 2007. It is an acknowledgement of receipt only.</p>

    <div class="sig-grid">
      <div class="sig-block">
        <div class="sig-line"></div>
        <div><strong>HR Representative / Authorised Signatory</strong></div>
        <div class="sig-label">Name: ________________________________</div>
        <div class="sig-label">Designation: _________________________</div>
        <div class="sig-label">Date: ________________________________</div>
      </div>
      <div class="sig-block">
        <div class="sig-line"></div>
        <div><strong>Employee Signature</strong></div>
        <div class="sig-label">Name: <strong>${employeeName}</strong></div>
        <div class="sig-label">Employee ID / Staff No.: _____________</div>
        <div class="sig-label">Date: ________________________________</div>
      </div>
    </div>

    <div style="margin-top:18px; font-size:10pt;">
      <p><em>If the employee refuses to sign, the HR representative should note: "Employee declined to sign on [date]" and have a witness co-sign below.</em></p>
      <div style="margin-top:10px;">
        <div style="border-bottom:1px solid #1a1a1a;height:32px;width:55%;"></div>
        <div class="sig-label">Witness Signature | Name: __________________ | Date: __________</div>
      </div>
    </div>
  </div>

  <div class="footer">
    This document was generated by the ${COMPANY.name} Human Resources Management System. &nbsp;|&nbsp; Generated: ${new Date().toLocaleString('en-NA')} &nbsp;|&nbsp; Ref: ${refNo}
  </div>

</body>
</html>`;
}

export function generateTransferLetter(record) {
  const ts = new Date();
  const yy = ts.getFullYear();
  const mm = String(ts.getMonth() + 1).padStart(2, '0');
  const dd = String(ts.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const initials = (record.employee_name || 'EMP').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 3);
  const refNo = `DYN/TRAN/${yy}${mm}${dd}/${initials}-${rand}`;

  const html = buildTransferHTML({
    employeeName:    record.employee_name   || 'Unknown Employee',
    currentBranch:   record.current_branch  || '',
    newBranch:       record.new_branch      || '',
    currentPosition: record.current_position || '',
    newPosition:     record.new_position    || record.current_position || '',
    effectiveDate:   record.effective_date  || record.date || null,
    endDate:         record.end_date        || null,
    transferType:    record.transfer_type   || 'permanent',
    reason:          record.reason          || '',
    issuedBy:        record.issued_by       || '',
    refNo,
  });
  openLetterWindow(html);
}

function openLetterWindow(html) {
  const win = window.open('', '_blank', 'width=860,height=960,scrollbars=yes');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site to generate letters.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

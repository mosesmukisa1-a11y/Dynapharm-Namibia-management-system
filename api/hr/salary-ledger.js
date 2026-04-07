import { applyAuthCors } from '../_lib/auth.js';
import { query, getMany, getOne } from '../db.js';
import { randomUUID } from 'crypto';

const EDIT_ROLES = new Set(['admin', 'finance', 'hr', 'gm', 'director']);
const GM_ROLES   = new Set(['admin', 'gm', 'director']);
const VIEW_ROLES = new Set(['admin', 'finance', 'hr', 'gm', 'director']);

const INITIAL_EMPLOYEES = [
  { name: 'LOVISA NEEPO NDEUTHIGILWA',            total_salary: 3669.94, has_overtime: true, overtime_amount: 194.44, ssc_deductions: 31.50, other_deductions: 0,     basic_salary: 3507,  designation: 'SALES REPRESENTATIVE',              date_joined: '2019-09-14', gender: 'FEMALE', id_no: '95052900643',  dpc_town: 'SWAKOPMUND',          contact_no: '814050125', notes: '' },
  { name: 'REBBEKA KANIME',                        total_salary: 3669.94, has_overtime: true, overtime_amount: 194.44, ssc_deductions: 31.50, other_deductions: 0,     basic_salary: 3507,  designation: 'SALES REPRESENTATIVE',              date_joined: '2023-09-01', gender: 'FEMALE', id_no: '98070200081',  dpc_town: 'WALVIS BAY',          contact_no: '816105154', notes: '' },
  { name: 'ESTHA FESTUS',                          total_salary: 0,       has_overtime: false, overtime_amount: 0,      ssc_deductions: 0,     other_deductions: 0,     basic_salary: 3507,  designation: 'SALES REPRESENTATIVE',              date_joined: '1992-05-20', gender: 'FEMALE', id_no: '92052000569',  dpc_town: 'OUTAPI',              contact_no: '818235894', notes: 'ON MATERNITY LEAVE' },
  { name: 'NAEM NDINEALO HANGULA',                 total_salary: 5965.37, has_overtime: true, overtime_amount: 316.67, ssc_deductions: 51.30, other_deductions: 0,     basic_salary: 5700,  designation: 'SALES REPRESENTATIVE',              date_joined: '2017-09-27', gender: 'FEMALE', id_no: '86071300557',  dpc_town: 'HEAD OFFICE',         contact_no: '817499757', notes: '' },
  { name: 'UVATERA KAROKOHE',                      total_salary: 3669.94, has_overtime: true, overtime_amount: 194.44, ssc_deductions: 31.50, other_deductions: 0,     basic_salary: 3507,  designation: 'SALES REPRESENTATIVE',              date_joined: '2023-01-02', gender: 'FEMALE', id_no: '95071001071',  dpc_town: 'KHOMASDAL',           contact_no: '817947148', notes: '' },
  { name: 'RAUHA ETUNA AMUNYELA',                  total_salary: 3669.94, has_overtime: true, overtime_amount: 194.44, ssc_deductions: 31.50, other_deductions: 0,     basic_salary: 3507,  designation: 'SALES REPRESENTATIVE',              date_joined: '2023-12-11', gender: 'FEMALE', id_no: '78111510136',  dpc_town: 'OKAHAO',              contact_no: '812747981', notes: '' },
  { name: 'KAUSANA TJITAURA',                      total_salary: 3669.94, has_overtime: true, overtime_amount: 194.44, ssc_deductions: 31.50, other_deductions: 0,     basic_salary: 3507,  designation: 'SALES REPRESENTATIVE',              date_joined: '2023-09-02', gender: 'FEMALE', id_no: '00121500179',  dpc_town: 'GOBABIS',             contact_no: '817263282', notes: '' },
  { name: 'SELMA N SALOM',                         total_salary: 3669.94, has_overtime: true, overtime_amount: 194.44, ssc_deductions: 31.50, other_deductions: 0,     basic_salary: 3507,  designation: 'SALES REPRESENTATIVE',              date_joined: '2022-01-01', gender: 'FEMALE', id_no: '91080700657',  dpc_town: 'OSHAKATI',            contact_no: '817522198', notes: '' },
  { name: 'MARTHA KATIVA',                         total_salary: 0,       has_overtime: false, overtime_amount: 0,      ssc_deductions: 31.50, other_deductions: 0,    basic_salary: 3507,  designation: 'SALES REPRESENTATIVE',              date_joined: '2022-12-07', gender: 'FEMALE', id_no: '94121200257',  dpc_town: 'RUNDU',               contact_no: '818079461', notes: 'ON MATERNITY LEAVE' },
  { name: 'MATILDE SHIHEPO',                       total_salary: 3669.94, has_overtime: true, overtime_amount: 194.44, ssc_deductions: 31.50, other_deductions: 0,     basic_salary: 3507,  designation: 'SALES REPRESENTATIVE',              date_joined: '2023-11-13', gender: 'FEMALE', id_no: '81070910325',  dpc_town: 'OTJIWARONGO',         contact_no: '812124125', notes: '' },
  { name: 'VERONICA N KABAJANI',                   total_salary: 3669.94, has_overtime: true, overtime_amount: 194.44, ssc_deductions: 31.50, other_deductions: 0,     basic_salary: 3507,  designation: 'SALES REPRESENTATIVE',              date_joined: '2020-12-14', gender: 'FEMALE', id_no: '62259898066',  dpc_town: 'KATIMA',              contact_no: '817375818', notes: '' },
  { name: 'SONIA LYANGO',                          total_salary: 3669.94, has_overtime: true, overtime_amount: 194.44, ssc_deductions: 31.50, other_deductions: 0,     basic_salary: 3507,  designation: 'SALES REPRESENTATIVE',              date_joined: '',           gender: 'FEMALE', id_no: '',             dpc_town: 'TSUMEB',              contact_no: '814316337', notes: '' },
  { name: 'ROSALIA SHEKUNDJA',                     total_salary: 3669.94, has_overtime: true, overtime_amount: 194.44, ssc_deductions: 31.50, other_deductions: 0,     basic_salary: 3507,  designation: 'CLEANER',                           date_joined: '2024-07-19', gender: 'FEMALE', id_no: '',             dpc_town: 'HEAD OFFICE',         contact_no: '814804979', notes: '' },
  { name: 'PHIONA AGUME KIREMIRE',                 total_salary: 12942,   has_overtime: true, overtime_amount: 1050,   ssc_deductions: 108,   other_deductions: 0,     basic_salary: 12000, designation: 'FINANCE MANAGER',                   date_joined: '2017-10-01', gender: 'FEMALE', id_no: '31.12.1991',   dpc_town: 'HEAD OFFICE',         contact_no: '818634992', notes: '' },
  { name: 'WILHELMINE SHILIMELA',                  total_salary: 7325.89, has_overtime: true, overtime_amount: 388.89, ssc_deductions: 63,    other_deductions: 0,     basic_salary: 7000,  designation: 'MIS MANAGER',                       date_joined: '2019-10-07', gender: 'FEMALE', id_no: '90041600576',  dpc_town: 'HEAD OFFICE',         contact_no: '814769928', notes: '' },
  { name: 'ANNA IYALOO BOAS',                      total_salary: 6581.76, has_overtime: true, overtime_amount: 455.56, ssc_deductions: 73.80, other_deductions: 2000,  basic_salary: 8200,  designation: 'OFFICE ADMINISTRATION',             date_joined: '2024-01-15', gender: 'FEMALE', id_no: '97031800714',  dpc_town: 'HEAD OFFICE',         contact_no: '817479245', notes: 'Loan deduction N$2000/month (2 instalments from Feb)' },
  { name: 'TOINI MAGANO NDANGWEDHAPO TUSHISHI',    total_salary: 7325.89, has_overtime: true, overtime_amount: 388.89, ssc_deductions: 63,    other_deductions: 0,     basic_salary: 7000,  designation: 'STOCK CONTROL & LOGISTICS MANAGER', date_joined: '2015-03-03', gender: 'FEMALE', id_no: '91100800816',  dpc_town: 'HEAD OFFICE',         contact_no: '813668433', notes: '' },
  { name: 'JOHANNES SHUUVENI',                     total_salary: 4158.44, has_overtime: true, overtime_amount: 194.44, ssc_deductions: 36,    other_deductions: 0,     basic_salary: 4000,  designation: 'DRIVER',                            date_joined: '2022-11-01', gender: 'MALE',   id_no: '94070500952',  dpc_town: 'ONDANGWA',            contact_no: '817133221', notes: '' },
  { name: 'SYLVIA ETUWAT',                         total_salary: 5300,    has_overtime: true, overtime_amount: 300,    ssc_deductions: 0,     other_deductions: 10000, basic_salary: 15000, designation: 'FIELD COORDINATOR',                 date_joined: '2020-01-01', gender: 'FEMALE', id_no: '',             dpc_town: 'ONDANGWA',            contact_no: '814397064', notes: 'Deduction: missing stock from Ondangwa shop N$10,000' },
  { name: 'MOSES MUKISA',                          total_salary: 39335.29,has_overtime: true, overtime_amount: 2070.29,ssc_deductions: 0,     other_deductions: 0,     basic_salary: 37265, designation: 'GENERAL MANAGER',                   date_joined: '2019-01-01', gender: 'MALE',   id_no: '',             dpc_town: 'HEAD OFFICE',         contact_no: '817317160', notes: '' },
  { name: 'NICHOLAS NDEBESA',                      total_salary: 10000,   has_overtime: true, overtime_amount: 500,    ssc_deductions: 0,     other_deductions: 0,     basic_salary: 7000,  designation: 'SALES REPRESENTATIVE / STOCK',      date_joined: '2020-01-01', gender: 'MALE',   id_no: '',             dpc_town: 'ROBIN',               contact_no: '813207195', notes: '' },
  { name: 'JAMU MAXWELL',                          total_salary: 7388.89, has_overtime: true, overtime_amount: 388.89, ssc_deductions: 0,     other_deductions: 0,     basic_salary: 7000,  designation: 'FIELD OPERATOR',                    date_joined: '2020-01-01', gender: 'MALE',   id_no: '',             dpc_town: 'OUTAPI',              contact_no: '817631383', notes: '' },
  { name: 'IVAN KABARI',                           total_salary: 15605,   has_overtime: true, overtime_amount: 605,    ssc_deductions: 0,     other_deductions: 0,     basic_salary: 15000, designation: 'FIELD OPERATOR',                    date_joined: '',           gender: 'MALE',   id_no: '',             dpc_town: 'RUNDU',               contact_no: '814898913', notes: '' },
  { name: 'ANANIAS IIPUMBU',                       total_salary: 4758.60, has_overtime: true, overtime_amount: 200,    ssc_deductions: 41.40, other_deductions: 0,     basic_salary: 4600,  designation: 'SECURITY GUARD',                    date_joined: '',           gender: 'MALE',   id_no: '',             dpc_town: 'HEAD OFFICE',         contact_no: '',          notes: '' },
  { name: 'PENEHAFO TUYENIKELAO SIMEON',           total_salary: 3701.44, has_overtime: true, overtime_amount: 194.44, ssc_deductions: 0,     other_deductions: 0,     basic_salary: 3507,  designation: 'SALES REPRESENTATIVE',              date_joined: '',           gender: 'FEMALE', id_no: '',             dpc_town: 'ONDANGWA',            contact_no: '812903770', notes: '' },
  { name: 'HILDE MEGAMENO PETRUS',                 total_salary: 3701.44, has_overtime: true, overtime_amount: 194.44, ssc_deductions: 0,     other_deductions: 0,     basic_salary: 3507,  designation: 'SALES REPRESENTATIVE',              date_joined: '',           gender: 'FEMALE', id_no: '',             dpc_town: 'ONDANGWA',            contact_no: '814538674', notes: '' },
  { name: 'SESILIA PEYOMUNHU THOMAS',              total_salary: 3701.44, has_overtime: true, overtime_amount: 194.44, ssc_deductions: 0,     other_deductions: 0,     basic_salary: 3507,  designation: 'STOCK & LOGISTICS',                 date_joined: '',           gender: 'FEMALE', id_no: '',             dpc_town: 'ONDANGWA WAREHOUSE',  contact_no: '815479050', notes: '' },
  { name: 'AUGUST BEATA M',                        total_salary: 3701.44, has_overtime: true, overtime_amount: 194.44, ssc_deductions: 0,     other_deductions: 0,     basic_salary: 3507,  designation: 'STAND BY STAFF',                    date_joined: '',           gender: 'FEMALE', id_no: '',             dpc_town: 'HEAD OFFICE',         contact_no: '817682036', notes: '' },
  { name: 'CHARITY MUSHABATI MUTAU',               total_salary: 2500,    has_overtime: true, overtime_amount: 100,    ssc_deductions: 0,     other_deductions: 0,     basic_salary: 2500,  designation: 'NEW TRAINEE',                       date_joined: '',           gender: '',       id_no: '',             dpc_town: 'RUNDU',               contact_no: '',          notes: 'New trainee. Bank: FNB 64281010783' },
  { name: 'CAROLINE HENNELY GOSES',                total_salary: 2500,    has_overtime: true, overtime_amount: 100,    ssc_deductions: 0,     other_deductions: 0,     basic_salary: 2500,  designation: 'NEW TRAINEE',                       date_joined: '',           gender: '',       id_no: '',             dpc_town: 'WINDHOEK (TOWN SHOP)',contact_no: '',          notes: 'New trainee. Bank: Nedbank 11991064755' },
  { name: 'NDAHEPULUKA NDIPOPAWA',                 total_salary: 3701.44, has_overtime: true, overtime_amount: 194.44, ssc_deductions: 0,     other_deductions: 0,     basic_salary: 3507,  designation: 'SALES REPRESENTATIVE',              date_joined: '',           gender: 'FEMALE', id_no: '',             dpc_town: 'EENHANA',             contact_no: '814620796', notes: '' },
  { name: 'WASHALIMBA ACCOUNTING',                 total_salary: 17710,   has_overtime: false, overtime_amount: 0,      ssc_deductions: 0,     other_deductions: 0,     basic_salary: 15400, designation: 'ACCOUNTANT',                        date_joined: '2025-01-01', gender: 'N/A',    id_no: '',             dpc_town: '',                    contact_no: '',          notes: '' },
];

async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS salary_ledger (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      basic_salary NUMERIC(14,2) NOT NULL DEFAULT 0,
      has_overtime BOOLEAN NOT NULL DEFAULT FALSE,
      overtime_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      total_salary NUMERIC(14,2) NOT NULL DEFAULT 0,
      ssc_deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
      other_deductions NUMERIC(14,2) NOT NULL DEFAULT 0,
      designation TEXT NOT NULL DEFAULT '',
      dpc_town TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL DEFAULT '',
      id_no TEXT NOT NULL DEFAULT '',
      contact_no TEXT NOT NULL DEFAULT '',
      date_joined TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      period TEXT NOT NULL DEFAULT '2026-03',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS salary_edit_requests (
      id TEXT PRIMARY KEY,
      salary_id TEXT REFERENCES salary_ledger(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL DEFAULT 'edit',
      proposed_changes JSONB NOT NULL DEFAULT '{}',
      requested_by TEXT NOT NULL,
      requested_role TEXT NOT NULL DEFAULT '',
      requested_at TIMESTAMPTZ DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      review_notes TEXT
    )
  `);

  const existing = await getOne(`SELECT COUNT(*) AS cnt FROM salary_ledger`);
  if (Number(existing.cnt) === 0) {
    for (const e of INITIAL_EMPLOYEES) {
      await query(
        `INSERT INTO salary_ledger (id, name, basic_salary, has_overtime, overtime_amount, total_salary,
          ssc_deductions, other_deductions, designation, dpc_town, gender, id_no, contact_no, date_joined, notes, status, period)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'active','2026-03')`,
        [randomUUID(), e.name, e.basic_salary, e.has_overtime, e.overtime_amount, e.total_salary,
         e.ssc_deductions, e.other_deductions, e.designation, e.dpc_town, e.gender, e.id_no, e.contact_no, e.date_joined, e.notes]
      );
    }
  }
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });

  const role = req.user.role || '';
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.replace(/^\/api\/hr\/salary-ledger\/?/, '').split('/').filter(Boolean);

  try {
    await ensureTables();

    // GET /hr/salary-ledger  — list all employees
    if (req.method === 'GET' && parts.length === 0) {
      if (!VIEW_ROLES.has(role)) return res.status(403).json({ success: false, error: 'Access denied' });
      const employees = await getMany(`SELECT * FROM salary_ledger ORDER BY name`);
      const pending = await getMany(`SELECT * FROM salary_edit_requests WHERE status = 'pending'`);
      const pendingMap = {};
      for (const p of pending) {
        if (p.salary_id) pendingMap[p.salary_id] = p;
      }
      for (const e of employees) { e.pending_edit = pendingMap[e.id] || null; }
      const totals = employees.reduce((t, e) => {
        const active = e.status !== 'removed';
        if (active) {
          t.total_salary += Number(e.total_salary || 0);
          t.basic_salary += Number(e.basic_salary || 0);
          t.overtime_amount += Number(e.overtime_amount || 0);
          t.ssc_deductions += Number(e.ssc_deductions || 0);
          t.other_deductions += Number(e.other_deductions || 0);
          t.count += 1;
        }
        return t;
      }, { total_salary: 0, basic_salary: 0, overtime_amount: 0, ssc_deductions: 0, other_deductions: 0, count: 0 });
      return res.json({ success: true, employees, totals });
    }

    // GET /hr/salary-ledger/edit-requests  — list pending for GM
    if (req.method === 'GET' && parts[0] === 'edit-requests') {
      if (!GM_ROLES.has(role)) return res.status(403).json({ success: false, error: 'GM access required' });
      const status = url.searchParams.get('status') || 'pending';
      const requests = await getMany(
        `SELECT r.*, s.name, s.designation, s.dpc_town, s.basic_salary, s.total_salary
         FROM salary_edit_requests r
         LEFT JOIN salary_ledger s ON s.id = r.salary_id
         WHERE r.status = $1
         ORDER BY r.requested_at DESC`,
        [status]
      );
      return res.json({ success: true, requests });
    }

    // POST /hr/salary-ledger  — add a new employee
    if (req.method === 'POST' && parts.length === 0) {
      if (!EDIT_ROLES.has(role)) return res.status(403).json({ success: false, error: 'Not authorised' });
      const { name, basic_salary = 0, has_overtime = false, overtime_amount = 0, total_salary = 0,
              ssc_deductions = 0, other_deductions = 0, designation = '', dpc_town = '',
              gender = '', id_no = '', contact_no = '', date_joined = '', notes = '', period = '2026-03' } = req.body;
      if (!name) return res.status(400).json({ success: false, error: 'Name is required' });
      const id = randomUUID();
      await query(
        `INSERT INTO salary_ledger (id, name, basic_salary, has_overtime, overtime_amount, total_salary,
          ssc_deductions, other_deductions, designation, dpc_town, gender, id_no, contact_no, date_joined, notes, status, period)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'active',$16)`,
        [id, name.toUpperCase().trim(), Number(basic_salary), Boolean(has_overtime), Number(overtime_amount),
         Number(total_salary), Number(ssc_deductions), Number(other_deductions), designation, dpc_town,
         gender, id_no, contact_no, date_joined, notes, period]
      );
      return res.json({ success: true, id });
    }

    // PUT /hr/salary-ledger/:id  — propose edit, requires GM approval
    if (req.method === 'PUT' && parts[0] && parts[0] !== 'edit-requests') {
      if (!EDIT_ROLES.has(role)) return res.status(403).json({ success: false, error: 'Not authorised' });
      const rec = await getOne(`SELECT id FROM salary_ledger WHERE id = $1`, [parts[0]]);
      if (!rec) return res.status(404).json({ success: false, error: 'Employee not found' });
      await query(`UPDATE salary_edit_requests SET status = 'cancelled' WHERE salary_id = $1 AND status = 'pending'`, [parts[0]]);
      const reqId = randomUUID();
      await query(
        `INSERT INTO salary_edit_requests (id, salary_id, action_type, proposed_changes, requested_by, requested_role)
         VALUES ($1,$2,'edit',$3,$4,$5)`,
        [reqId, parts[0], JSON.stringify(req.body), req.user.username || req.user.id || role, role]
      );
      return res.json({ success: true, message: 'Edit request submitted for GM approval.', request_id: reqId });
    }

    // DELETE /hr/salary-ledger/:id  — propose removal, requires GM approval
    if (req.method === 'DELETE' && parts[0]) {
      if (!EDIT_ROLES.has(role)) return res.status(403).json({ success: false, error: 'Not authorised' });
      const rec = await getOne(`SELECT id, name FROM salary_ledger WHERE id = $1`, [parts[0]]);
      if (!rec) return res.status(404).json({ success: false, error: 'Employee not found' });
      await query(`UPDATE salary_edit_requests SET status = 'cancelled' WHERE salary_id = $1 AND status = 'pending'`, [parts[0]]);
      const reqId = randomUUID();
      await query(
        `INSERT INTO salary_edit_requests (id, salary_id, action_type, proposed_changes, requested_by, requested_role)
         VALUES ($1,$2,'remove','{}',$3,$4)`,
        [reqId, parts[0], req.user.username || req.user.id || role, role]
      );
      return res.json({ success: true, message: `Removal of ${rec.name} submitted for GM approval.`, request_id: reqId });
    }

    // PATCH /hr/salary-ledger/edit-requests/:id  — GM approve/reject
    if (req.method === 'PATCH' && parts[0] === 'edit-requests' && parts[1]) {
      if (!GM_ROLES.has(role)) return res.status(403).json({ success: false, error: 'GM access required' });
      const { action, review_notes = '' } = req.body;
      if (!['approve', 'reject'].includes(action)) return res.status(400).json({ success: false, error: 'action must be approve or reject' });
      const editReq = await getOne(`SELECT * FROM salary_edit_requests WHERE id = $1`, [parts[1]]);
      if (!editReq) return res.status(404).json({ success: false, error: 'Request not found' });
      const reviewer = req.user.username || req.user.id || role;
      if (action === 'approve') {
        if (editReq.action_type === 'remove') {
          await query(`UPDATE salary_ledger SET status = 'removed', updated_at = NOW() WHERE id = $1`, [editReq.salary_id]);
        } else {
          const ch = editReq.proposed_changes;
          const allowed = ['name','basic_salary','has_overtime','overtime_amount','total_salary',
                           'ssc_deductions','other_deductions','designation','dpc_town','gender','id_no','contact_no','date_joined','notes','status','period'];
          const sets = [];
          const vals = [];
          for (const key of allowed) {
            if (ch[key] !== undefined) {
              sets.push(`${key} = $${vals.length + 1}`);
              vals.push(ch[key]);
            }
          }
          sets.push(`updated_at = NOW()`);
          if (sets.length > 1) {
            vals.push(editReq.salary_id);
            await query(`UPDATE salary_ledger SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
          }
        }
        await query(`UPDATE salary_edit_requests SET status='approved', reviewed_by=$1, reviewed_at=NOW(), review_notes=$2 WHERE id=$3`,
          [reviewer, review_notes, parts[1]]);
        return res.json({ success: true, message: 'Approved and applied.' });
      } else {
        await query(`UPDATE salary_edit_requests SET status='rejected', reviewed_by=$1, reviewed_at=NOW(), review_notes=$2 WHERE id=$3`,
          [reviewer, review_notes, parts[1]]);
        return res.json({ success: true, message: 'Request rejected.' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[hr/salary-ledger]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

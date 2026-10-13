import { applyAuthCors } from '../_lib/auth.js';
import { query, getMany, getOne } from '../db.js';
import { randomUUID } from 'crypto';

const FINANCE_ROLES = new Set(['admin', 'finance']);
const GM_ROLES = new Set(['admin', 'gm', 'director']);

const INITIAL_RENTS = [
  { branch_name: 'EENHANA SHOP',                    lease_property_name: 'RT ENTERPRISES (RYMA CC)',            total_payable: 5000,     operational_expenses: 0, rent_amount: 5000,     outstanding_payments: '',       comment: '', account_number: '60003885673', bank_branch_name: 'STDB',                     code: '82272'   },
  { branch_name: 'GOBABIS SHOP',                    lease_property_name: 'NAMIBIA KALAHARI SAFARIS PTY LTD',    total_payable: 6197.47,  operational_expenses: 0, rent_amount: 6197.47,  outstanding_payments: '',       comment: '', account_number: '41843356',   bank_branch_name: 'STDB, AUSSPANPLATZZ',      code: '082672'  },
  { branch_name: 'TOWN SHOP',                       lease_property_name: 'CONTINENTAL PTY LTD',                 total_payable: 54969,    operational_expenses: 0, rent_amount: 54969,    outstanding_payments: '',       comment: '', account_number: '41455025',   bank_branch_name: 'STDB',                     code: '237200'  },
  { branch_name: 'KATIMA MULILO',                   lease_property_name: 'M.HARTMANN INVESTMENTS 87 CC',        total_payable: 11539.67, operational_expenses: 0, rent_amount: 11539.67, outstanding_payments: '',       comment: 'Ref: 94', account_number: '8001382404',  bank_branch_name: 'BANK WINDHOEK',            code: '481772'  },
  { branch_name: 'KHOMASDAL SHOP',                  lease_property_name: 'TULONGENI PROPERTY DEVELOPERS',       total_payable: 5068.62,  operational_expenses: 0, rent_amount: 5068.62,  outstanding_payments: '',       comment: '', account_number: '60006424626', bank_branch_name: 'STDB',                     code: '82672'   },
  { branch_name: 'OKAHAO SHOP',                     lease_property_name: 'TOIVO I TAAPOPI',                     total_payable: 3080,     operational_expenses: 0, rent_amount: 3080,     outstanding_payments: '',       comment: '', account_number: '8022101643',  bank_branch_name: 'BANK WINDHOEK',            code: ''        },
  { branch_name: 'ONDANGWA WAREHOUSE',              lease_property_name: 'VISION PROPERTIES',                   total_payable: 7849.49,  operational_expenses: 0, rent_amount: 7849.49,  outstanding_payments: '',       comment: 'REF 509', account_number: '12000522080', bank_branch_name: 'NEDBANK',                  code: '461038'  },
  { branch_name: 'ONDANGWA SHOP NO 3',              lease_property_name: 'BONSAI INVESTMENTS 91 PTY LTD',       total_payable: 0,        operational_expenses: 0, rent_amount: 0,        outstanding_payments: '',       comment: '', account_number: '41535464',   bank_branch_name: 'STDB, AUSSPANPLATZZ',      code: ''        },
  { branch_name: 'OSHAKATI SHOP',                   lease_property_name: 'FANTASY FOREVER PROPERTIES CC',       total_payable: 6679.20,  operational_expenses: 0, rent_amount: 6679.20,  outstanding_payments: '',       comment: '', account_number: '42452295',   bank_branch_name: 'STDB, OSHAKATI BRANCH',    code: ''        },
  { branch_name: 'OTJIWARONGO',                     lease_property_name: 'BASIE STRUWIG',                       total_payable: 7700,     operational_expenses: 0, rent_amount: 7700,     outstanding_payments: '',       comment: '', account_number: '8002784868',  bank_branch_name: 'BANK WHK',                 code: '481573'  },
  { branch_name: 'RUNDU SHOP',                      lease_property_name: 'OCEANO ATLANTICO PROPERTIES',         total_payable: 6050,     operational_expenses: 0, rent_amount: 6050,     outstanding_payments: '',       comment: '', account_number: '8007223150',  bank_branch_name: 'BANK WINDHOEK',            code: '483173'  },
  { branch_name: 'SWAKOPMUND',                      lease_property_name: 'CD MPAHLENI',                         total_payable: 4000,     operational_expenses: 0, rent_amount: 4000,     outstanding_payments: '',       comment: '', account_number: '62177317312', bank_branch_name: 'FNB MAIN BRANCH',          code: '280679'  },
  { branch_name: 'TSUMEB SHOP',                     lease_property_name: 'KARL HEINZ HOFFMANN',                 total_payable: 6981.55,  operational_expenses: 0, rent_amount: 6981.55,  outstanding_payments: '',       comment: '', account_number: '41524039',   bank_branch_name: 'STDB',                     code: '08267200'},
  { branch_name: 'WALVIS BAY SHOP',                 lease_property_name: 'COASTAL PROPERTIES CENTRE',           total_payable: 6655,     operational_expenses: 0, rent_amount: 6655,     outstanding_payments: '',       comment: '', account_number: '8000655783',  bank_branch_name: 'BANK WHK',                 code: '481872'  },
  { branch_name: 'WALVIS VIEW BODY CORPORATE',      lease_property_name: 'ROCKY VIEW',                          total_payable: 0,        operational_expenses: 0, rent_amount: 0,        outstanding_payments: '',       comment: '', account_number: '',            bank_branch_name: '',                         code: ''        },
  { branch_name: 'LA MEL APARTMENT BODY CORPORATE', lease_property_name: 'ERF 846 / 001030 VINETA',             total_payable: 0,        operational_expenses: 0, rent_amount: 0,        outstanding_payments: '',       comment: '', account_number: '',            bank_branch_name: '',                         code: ''        },
];

async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS branch_rent_payments (
      id TEXT PRIMARY KEY,
      branch_name TEXT NOT NULL,
      lease_property_name TEXT NOT NULL DEFAULT '',
      total_payable NUMERIC(14,2) NOT NULL DEFAULT 0,
      operational_expenses NUMERIC(14,2) NOT NULL DEFAULT 0,
      rent_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      outstanding_payments TEXT NOT NULL DEFAULT '',
      comment TEXT NOT NULL DEFAULT '',
      account_number TEXT NOT NULL DEFAULT '',
      bank_branch_name TEXT NOT NULL DEFAULT '',
      code TEXT NOT NULL DEFAULT '',
      effective_from TEXT NOT NULL DEFAULT '2026-04',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS rent_edit_requests (
      id TEXT PRIMARY KEY,
      rent_id TEXT NOT NULL REFERENCES branch_rent_payments(id) ON DELETE CASCADE,
      proposed_changes JSONB NOT NULL,
      requested_by TEXT NOT NULL,
      requested_at TIMESTAMPTZ DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'pending',
      reviewed_by TEXT,
      reviewed_at TIMESTAMPTZ,
      review_notes TEXT
    )
  `);

  const existing = await getOne(`SELECT COUNT(*) AS cnt FROM branch_rent_payments`);
  if (Number(existing.cnt) === 0) {
    for (const r of INITIAL_RENTS) {
      await query(
        `INSERT INTO branch_rent_payments (id, branch_name, lease_property_name, total_payable, operational_expenses, rent_amount, outstanding_payments, comment, account_number, bank_branch_name, code, effective_from)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [randomUUID(), r.branch_name, r.lease_property_name, r.total_payable, r.operational_expenses,
         r.rent_amount, r.outstanding_payments, r.comment, r.account_number, r.bank_branch_name, r.code, '2026-04']
      );
    }
  }
}

import { atomicStockRequest } from '../_lib/atomicStockRequest.js';
async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });

  const role = req.user.role || '';
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.replace(/^\/api\/finance\/rent-payments\/?/, '').split('/').filter(Boolean);

  try {
    await ensureTables();

    // GET /finance/rent-payments  — list all current rent records
    if (req.method === 'GET' && parts.length === 0) {
      const rents = await getMany(`SELECT * FROM branch_rent_payments ORDER BY branch_name`);
      // attach any pending edit requests per record
      const pending = await getMany(`SELECT * FROM rent_edit_requests WHERE status = 'pending'`);
      const pendingMap = {};
      for (const p of pending) { pendingMap[p.rent_id] = p; }
      for (const r of rents) { r.pending_edit = pendingMap[r.id] || null; }
      return res.json({ success: true, rents });
    }

    // GET /finance/rent-payments/edit-requests  — list pending edit requests (for GM)
    if (req.method === 'GET' && parts[0] === 'edit-requests') {
      if (!GM_ROLES.has(role)) return res.status(403).json({ success: false, error: 'GM access required' });
      const filter = url.searchParams.get('status') || 'pending';
      const requests = await getMany(
        `SELECT r.*, b.branch_name, b.lease_property_name, b.rent_amount, b.total_payable,
                b.account_number, b.bank_branch_name, b.code
         FROM rent_edit_requests r
         JOIN branch_rent_payments b ON b.id = r.rent_id
         WHERE r.status = $1
         ORDER BY r.requested_at DESC`,
        [filter]
      );
      return res.json({ success: true, requests });
    }

    // POST /finance/rent-payments  — add a new rent record (finance only)
    if (req.method === 'POST' && parts.length === 0) {
      if (!FINANCE_ROLES.has(role)) return res.status(403).json({ success: false, error: 'Finance access required' });
      const { branch_name, lease_property_name = '', total_payable = 0, operational_expenses = 0,
              rent_amount = 0, outstanding_payments = '', comment = '', account_number = '',
              bank_branch_name = '', code = '', effective_from = '2026-04' } = req.body;
      if (!branch_name) return res.status(400).json({ success: false, error: 'Branch name is required' });
      const id = randomUUID();
      await query(
        `INSERT INTO branch_rent_payments (id, branch_name, lease_property_name, total_payable, operational_expenses, rent_amount, outstanding_payments, comment, account_number, bank_branch_name, code, effective_from)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [id, branch_name.toUpperCase(), lease_property_name, Number(total_payable), Number(operational_expenses),
         Number(rent_amount), outstanding_payments, comment, account_number, bank_branch_name, code, effective_from]
      );
      return res.json({ success: true, id });
    }

    // PUT /finance/rent-payments/:id  — finance proposes an edit (creates edit request requiring GM approval)
    if (req.method === 'PUT' && parts[0]) {
      if (!FINANCE_ROLES.has(role)) return res.status(403).json({ success: false, error: 'Finance access required' });
      const rent = await getOne(`SELECT * FROM branch_rent_payments WHERE id = $1`, [parts[0]]);
      if (!rent) return res.status(404).json({ success: false, error: 'Rent record not found' });

      // Cancel any previous pending request for this record
      await query(`UPDATE rent_edit_requests SET status = 'cancelled' WHERE rent_id = $1 AND status = 'pending'`, [parts[0]]);

      const changes = req.body;
      const reqId = randomUUID();
      await query(
        `INSERT INTO rent_edit_requests (id, rent_id, proposed_changes, requested_by, status)
         VALUES ($1,$2,$3,$4,'pending')`,
        [reqId, parts[0], JSON.stringify(changes), req.user.fullName || req.user.username || req.user.id || 'finance']
      );
      return res.json({ success: true, message: 'Edit request submitted. Awaiting GM approval.', request_id: reqId });
    }

    // PATCH /finance/rent-payments/edit-requests/:id  — GM approves or rejects
    if (req.method === 'PATCH' && parts[0] === 'edit-requests' && parts[1]) {
      if (!GM_ROLES.has(role)) return res.status(403).json({ success: false, error: 'GM access required' });
      const { action, review_notes = '' } = req.body;
      if (!['approve', 'reject'].includes(action)) return res.status(400).json({ success: false, error: 'action must be approve or reject' });

      const editReq = await getOne(`SELECT * FROM rent_edit_requests WHERE id = $1 FOR UPDATE`, [parts[1]]);
      if (!editReq) return res.status(404).json({ success: false, error: 'Edit request not found' });
      const decision=action==='approve'?'approved':'rejected';
      if (editReq.status===decision) return res.json({success:true,message:'Request already '+decision});
      if (editReq.status!=='pending') return res.status(409).json({error:'Request is already reviewed'});

      const reviewer = req.user.sub || req.user.id || req.user.username;

      if (action === 'approve') {
        const changes = editReq.proposed_changes;
        const allowed = ['lease_property_name','total_payable','operational_expenses','rent_amount',
                         'outstanding_payments','comment','account_number','bank_branch_name','code','effective_from','branch_name'];
        const sets = [];
        const vals = [];
        for (const key of allowed) {
          if (changes[key] !== undefined) {
            sets.push(`${key} = $${vals.length + 1}`);
            vals.push(changes[key]);
          }
        }
        sets.push(`updated_at = NOW()`);
        if (sets.length > 1) {
          vals.push(editReq.rent_id);
          await query(`UPDATE branch_rent_payments SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
        }
        await query(
          `UPDATE rent_edit_requests SET status='approved', reviewed_by=$1, reviewed_at=NOW(), review_notes=$2 WHERE id=$3`,
          [reviewer, review_notes, parts[1]]
        );
        return res.json({ success: true, message: 'Edit approved and applied.' });
      } else {
        await query(
          `UPDATE rent_edit_requests SET status='rejected', reviewed_by=$1, reviewed_at=NOW(), review_notes=$2 WHERE id=$3`,
          [reviewer, review_notes, parts[1]]
        );
        return res.json({ success: true, message: 'Edit request rejected.' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[finance/rent-payments]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
export default atomicStockRequest(handler);

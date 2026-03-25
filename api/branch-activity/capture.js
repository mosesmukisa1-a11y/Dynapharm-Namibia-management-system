import { applyAuthCors } from '../_lib/auth.js';
import { postActivityRecord, generateBatId } from '../_lib/activityCapture.js';
import { getMany } from '../db.js';

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

const REQUIRED = ['branch_id', 'service_date', 'activity_type', 'workflow_source'];
const VALID_TYPES = ['consultation', 'full_body_checkup', 'walkin_sale', 'member_sale', 'non_member_sale', 'online_order', 'prescription_dispensing'];

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'POST') {
      const body = await parseBody(req);

      const missing = REQUIRED.filter(f => !body[f]);
      if (missing.length) return res.status(400).json({ success: false, error: `Missing required fields: ${missing.join(', ')}` });
      if (!body.client_name && !body.client_id) return res.status(400).json({ success: false, error: 'client_name or client_id required' });
      if (!body.captured_by) return res.status(400).json({ success: false, error: 'captured_by required' });

      const actType = body.activity_type;
      if (!VALID_TYPES.includes(actType)) {
        return res.status(400).json({ success: false, error: `Invalid activity_type. Must be one of: ${VALID_TYPES.join(', ')}` });
      }

      if (actType === 'member_sale' && !body.nb_number) {
        return res.status(400).json({ success: false, error: 'nb_number required for member_sale' });
      }
      if (['walkin_sale', 'member_sale', 'non_member_sale', 'prescription_dispensing', 'online_order'].includes(actType)) {
        if (Number(body.product_total_dp || 0) === 0 && Number(body.grand_total || 0) === 0 && actType !== 'online_order') {
          console.warn('[branch-activity/capture] product total is 0 for', actType);
        }
      }

      const id = body.id || generateBatId();
      await postActivityRecord({ ...body, id });

      return res.status(201).json({
        success: true,
        message: 'Branch activity captured and posted successfully',
        transaction_id: id,
        reporting_status: 'posted',
        activity_type: actType,
      });
    }

    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const branchId = url.searchParams.get('branch_id') || '';
      const date = url.searchParams.get('date') || '';
      const actType = url.searchParams.get('activity_type') || '';
      const limit = parseInt(url.searchParams.get('limit') || '100', 10);

      const conds = ['1=1'];
      const params = [];
      if (branchId) { conds.push(`branch_id = $${params.length + 1}`); params.push(branchId); }
      if (date) { conds.push(`service_date = $${params.length + 1}`); params.push(date); }
      if (actType) { conds.push(`activity_type = $${params.length + 1}`); params.push(actType); }
      params.push(limit);

      const rows = await getMany(
        `SELECT * FROM branch_activity_transactions WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT $${params.length}`,
        params
      );
      return res.status(200).json({ success: true, transactions: rows, total: rows.length });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('branch-activity/capture error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}

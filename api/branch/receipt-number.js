import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { query } from '../db.js';

const BRANCH_ABBR = {
  'townshop': 'TW',
  'hochland-park': 'RN',
  'khomasdal': 'KD',
  'swakopmund': 'SW',
  'walvisbay': 'WB',
  'katima_mulilo': 'KM',
  'rundu': 'RU',
  'gobabis': 'GO',
  'eenhana': 'EN',
  'ondangwa': 'ON',
  'outapi': 'OU',
  'otjiwarongo': 'OT',
  'okahao': 'OK',
  'oshakati_branch': 'OS',
  'tsumeb': 'TU',
  'okongo': 'OKG',
  'nkurenkuru': 'NK'
};

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { branch_id } = req.body || {};
  if (!branch_id) return res.status(400).json({ error: 'branch_id required' });

  const abbr = BRANCH_ABBR[branch_id] || branch_id.slice(0, 3).toUpperCase();
  const year = new Date().getFullYear();

  try {
    const { rows } = await __qd_executePlan(query, __qd_registeredPlan("api/branch/receipt-number.js:37:0"),





    [branch_id, year]);


    const seq = rows[0].last_seq;
    const receipt_number = `${abbr}-${year}-${String(seq).padStart(6, '0')}`;
    return res.status(200).json({ success: true, receipt_number });
  } catch (err) {
    console.error('[receipt-number]', err.message);
    return res.status(500).json({ error: err.message });
  }
}

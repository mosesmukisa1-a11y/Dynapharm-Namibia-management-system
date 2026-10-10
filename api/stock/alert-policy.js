import { applyAuthCors } from '../_lib/auth.js';
import { getStockAlertPolicy, saveStockAlertPolicy } from '../services/stockAlertPolicy.js';
import { STOCK_ALERT_EDIT_ROLES, validateStockAlertPolicy } from '../../shared/stockAlertPolicy.js';

const READ_ROLES = new Set([...STOCK_ALERT_EDIT_ROLES, 'finance', 'finance_manager', 'mis',
  'director', 'branch', 'branch_manager', 'branch_staff', 'branch_sales',
  'warehouse', 'warehouse_manager', 'warehouse_staff']);

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  const role = (req.user.role || '').toLowerCase();
  if (!READ_ROLES.has(role) || (req.method === 'PUT' && !STOCK_ALERT_EDIT_ROLES.includes(role))) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  if (!['GET', 'PUT'].includes(req.method)) return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (req.method === 'PUT') {
    try { validateStockAlertPolicy(req.body); }
    catch (error) { return res.status(422).json({ success: false, error: error.message }); }
  }
  try {
    const policy = req.method === 'GET' ? await getStockAlertPolicy() : await saveStockAlertPolicy(req.body);
    return res.json({ success: true, policy, canEdit: STOCK_ALERT_EDIT_ROLES.includes(role) });
  } catch (error) {
    console.error('[stock-alert-policy]', error.message);
    return res.status(500).json({ success: false, error: 'Unable to load or save stock alert policy' });
  }
}

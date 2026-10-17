import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { query, getOne } from '../db.js';
import { applyAuthCors } from '../_lib/auth.js';

const ALLOWED_KEYS = ['dispatch_shortfall_mode'];
const DEFAULT_VALUES = { dispatch_shortfall_mode: 'block' };

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.method === 'GET') {
    const key = req.query?.key || 'dispatch_shortfall_mode';
    if (!ALLOWED_KEYS.includes(key)) {
      return res.status(400).json({ error: `Unknown setting key: ${key}` });
    }
    try {
      const row = await __qd_executePlan(getOne, __qd_registeredPlan("api/admin/system-settings.js:21:0"), [key]);
      const value = row?.value ?? DEFAULT_VALUES[key] ?? null;
      return res.json({ key, value });
    } catch (err) {
      console.error('[system-settings GET]', err.message);
      return res.status(500).json({ error: 'Failed to load setting' });
    }
  }

  if (req.method === 'PUT') {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required to change system settings' });
    }
    try {
      const { key = 'dispatch_shortfall_mode', value } = req.body || {};
      if (!ALLOWED_KEYS.includes(key)) {
        return res.status(400).json({ error: `Unknown setting key: ${key}` });
      }
      if (key === 'dispatch_shortfall_mode' && !['block', 'warn'].includes(value)) {
        return res.status(400).json({ error: 'Invalid value. Must be "block" or "warn".' });
      }
      await __qd_executePlan(query, __qd_registeredPlan("api/admin/system-settings.js:42:1"),



      [key, value]);
      return res.json({ success: true, key, value });
    } catch (err) {
      console.error('[system-settings PUT]', err.message);
      return res.status(500).json({ error: 'Failed to save setting' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

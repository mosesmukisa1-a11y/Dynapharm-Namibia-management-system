import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors, clearAuthCookie } from '../_lib/auth.js';
import { getOne, query } from '../db.js';

async function autoClockOut(user) {
  const role = (user?.role || '').toLowerCase();
  if (!user || role === 'distributor' || role === 'guest') return;
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5);
  const fullName = user.fullName || user.full_name || user.username;
  try {
    const existing = await __qd_executePlan(getOne, __qd_registeredPlan("api/auth/logout.js:13:0"),

    [fullName, dateStr]);

    if (existing) {
      await __qd_executePlan(query, __qd_registeredPlan("api/auth/logout.js:18:1"),

      [timeStr, existing.id]);

    }
  } catch (e) {
    console.warn('[auto-attendance] clock-out failed:', e.message);
  }
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  autoClockOut(req.user).catch(() => {});

  clearAuthCookie(res);
  return res.status(200).json({ success: true });
}

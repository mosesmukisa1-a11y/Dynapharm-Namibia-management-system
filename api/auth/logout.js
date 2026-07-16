import { applyAuthCors, clearAuthCookie } from '../_lib/auth.js';
import { getOne, query } from '../db.js';

async function autoClockOut(user) {
  const role = (user?.role || '').toLowerCase();
  if (!user || role === 'distributor' || role === 'guest') return;
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5);
  const fullName = user.fullName || user.full_name || user.username;
  try {
    const existing = await getOne(
      `SELECT id FROM hr_records WHERE type='attendance' AND employee_name=$1 AND date=$2 ORDER BY created_at ASC LIMIT 1`,
      [fullName, dateStr]
    );
    if (existing) {
      await query(
        `UPDATE hr_records SET clock_out=$1, updated_at=NOW() WHERE id=$2`,
        [timeStr, existing.id]
      );
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

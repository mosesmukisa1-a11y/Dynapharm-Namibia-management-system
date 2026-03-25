import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const requests = await getMany(
      `SELECT * FROM stock_requests WHERE status IN ('approved','pending') ORDER BY created_at ASC`
    );

    const pending = requests.map(r => {
      let items = [];
      try { items = typeof r.items === 'string' ? JSON.parse(r.items || '[]') : (r.items || []); } catch {}
      return {
        requestId: r.id,
        branchId: r.requesting_branch || r.branch_id,
        branchName: (r.requesting_branch || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        status: r.status,
        priority: r.priority || 'normal',
        items,
        createdAt: r.created_at,
      };
    });

    res.status(200).json({ success: true, pending, total: pending.length });
  } catch (err) {
    console.error('Pending distribution error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}

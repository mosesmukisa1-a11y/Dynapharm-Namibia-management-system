import { applyAuthCors } from '../../_lib/auth.js';
import { getMany } from '../../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const status = url.searchParams.get('status') || '';

    const conditions = ['1=1'];
    const params = [];
    if (status) { conditions.push(`status = $${params.length + 1}`); params.push(status); }

    const requests = await getMany(
      `SELECT * FROM stock_requests WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT 200`,
      params
    );

    const formatted = requests.map(r => {
      let items = [];
      try { items = typeof r.items === 'string' ? JSON.parse(r.items || '[]') : (r.items || []); } catch {}
      return {
        requestId: r.id,
        branchId: r.requesting_branch || r.branch_id,
        branchName: (r.requesting_branch || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        status: r.status,
        priority: r.priority || 'normal',
        items,
        notes: r.notes,
        requestedBy: r.requested_by || r.created_by,
        createdAt: r.created_at,
      };
    });

    return res.status(200).json({ success: true, requests: formatted, total: formatted.length });
  } catch (err) {
    console.error('Distribution requests error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}

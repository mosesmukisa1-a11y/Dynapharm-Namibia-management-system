import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const branchParam = searchParams.get('branch');
    const startParam = searchParams.get('startDate');
    const endParam = searchParams.get('endDate');

    const params = [];
    const where = [];

    if (branchParam && branchParam !== 'all' && branchParam !== '') {
      params.push(branchParam);
      where.push(`branch_name = $${params.length}`);
    }

    const start = parseDate(startParam);
    const end = parseDate(endParam);

    if (start) {
      params.push(start.toISOString().slice(0, 10));
      where.push(`date >= $${params.length}`);
    }

    if (end) {
      params.push(end.toISOString().slice(0, 10));
      where.push(`date <= $${params.length}`);
    }

    let queryText = `SELECT * FROM mis_csi_entries`;
    if (where.length > 0) {
      queryText += ` WHERE ${where.join(' AND ')}`;
    }
    queryText += ` ORDER BY date DESC, id DESC LIMIT 5000`;

    const rows = await getMany(queryText, params);

    return res.status(200).json({
      success: true,
      entries: rows,
      total: rows.length,
    });
  } catch (error) {
    console.error('MIS csi-entries API error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error',
    });
  }
}

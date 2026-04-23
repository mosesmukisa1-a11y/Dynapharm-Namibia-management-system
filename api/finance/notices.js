import { applyAuthCors } from '../_lib/auth.js';
import { query, getMany } from '../db.js';

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

function generateId() {
  return `FIN-NOTICE-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });

  try {
    if (req.method === 'GET') {
      const rows = await getMany(
        `SELECT * FROM notifications WHERE recipient_type = 'finance_notice' ORDER BY created_at DESC LIMIT 100`
      );
      return res.json({
        success: true,
        notices: rows.map(r => ({
          id: r.id,
          title: r.title,
          message: r.message,
          priority: r.type || 'Normal',
          createdBy: r.recipient_id || '',
          createdAt: r.created_at,
        })),
      });
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const { title, message, priority } = body;
      if (!message || !message.trim()) {
        return res.status(400).json({ success: false, error: 'Message is required' });
      }
      const id = generateId();
      const broadcastId = `${id}-BROADCAST`;
      const sender = req.user.full_name || req.user.username || 'Finance';
      const noticeTitle = title || 'Finance Notice';
      const noticeMsg   = message.trim();
      const noticePriority = priority || 'Normal';

      await query(
        `INSERT INTO notifications (id, recipient_type, recipient_id, title, message, type, is_read, created_at)
         VALUES ($1, 'finance_notice', $2, $3, $4, $5, false, NOW())`,
        [id, sender, noticeTitle, noticeMsg, noticePriority]
      );

      await query(
        `INSERT INTO notifications (id, recipient_type, recipient_id, title, message, type, is_read, created_at)
         VALUES ($1, 'announcement', 'broadcast', $2, $3, $4, false, NOW())`,
        [broadcastId, noticeTitle, `[Finance] ${noticeMsg}`, noticePriority]
      );

      return res.status(201).json({
        success: true,
        notice: { id, title: noticeTitle, message: noticeMsg, priority: noticePriority, createdBy: sender, createdAt: new Date().toISOString() },
      });
    }

    if (req.method === 'DELETE') {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const id = url.searchParams.get('id');
      if (!id) return res.status(400).json({ success: false, error: 'id is required' });
      await query(`DELETE FROM notifications WHERE id = $1 AND recipient_type = 'finance_notice'`, [id]);
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[finance/notices]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

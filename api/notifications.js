import { query, getMany, getOne, insert, update, remove, publishRealtimeEvent } from './db.js';
import { applyAuthCors } from './_lib/auth.js';

async function ensureNotificationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient_type TEXT NOT NULL DEFAULT 'distributor',
      recipient_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      reference_id TEXT,
      is_read BOOLEAN DEFAULT FALSE,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications (recipient_id, is_read)');
}

let tableReady = false;

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (!tableReady) {
      await ensureNotificationsTable();
      tableReady = true;
    }

    const method = req.method;
    const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const id = searchParams.get('id');
    const recipientId = searchParams.get('recipient_id');
    const unreadOnly = searchParams.get('unread') === 'true';
    const since = searchParams.get('since');

    if (method === 'GET') {
      if (!req.user && !recipientId) {
        return res.status(400).json({ error: 'recipient_id is required' });
      }
      let queryText = 'SELECT * FROM notifications';
      const conditions = [];
      const params = [];

      if (recipientId) {
        params.push(recipientId.toUpperCase().trim());
        conditions.push(`UPPER(recipient_id) = $${params.length}`);
      }
      if (unreadOnly) {
        conditions.push('is_read = FALSE');
      }
      if (id) {
        params.push(id);
        conditions.push(`id = $${params.length}`);
      }
      if (since) {
        params.push(new Date(since).toISOString());
        conditions.push(`created_at > $${params.length}`);
      }

      if (conditions.length > 0) {
        queryText += ' WHERE ' + conditions.join(' AND ');
      }
      queryText += ' ORDER BY created_at DESC';

      const limit = searchParams.get('limit');
      if (limit) {
        params.push(parseInt(limit));
        queryText += ` LIMIT $${params.length}`;
      }

      const notifications = await getMany(queryText, params);
      return res.json(notifications);
    }

    if (method === 'PUT') {
      const body = req.body;
      if (body.markAllRead && body.recipient_id) {
        await query(
          'UPDATE notifications SET is_read = TRUE WHERE UPPER(recipient_id) = $1 AND is_read = FALSE',
          [body.recipient_id.toUpperCase().trim()]
        );
        return res.json({ success: true });
      }
      if (body.id && body.recipient_id) {
        const notif = await getOne('SELECT * FROM notifications WHERE id = $1', [body.id]);
        if (notif && notif.recipient_id.toUpperCase() === body.recipient_id.toUpperCase().trim()) {
          const notification = await update('notifications', body.id, { is_read: true }, 'id');
          return res.json(notification);
        }
        return res.status(403).json({ error: 'Not authorized to update this notification' });
      }
      return res.status(400).json({ error: 'Missing id/recipient_id or markAllRead' });
    }

    if (method === 'POST') {
      const body = req.body;
      const notificationData = {
        id: `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        recipient_type: body.recipient_type || 'distributor',
        recipient_id: body.recipient_id,
        title: body.title,
        message: body.message,
        type: body.type || 'info',
        reference_id: body.reference_id || null,
        metadata: body.metadata ? (typeof body.metadata === 'string' ? body.metadata : JSON.stringify(body.metadata)) : null
      };

      const notification = await insert('notifications', notificationData);
      await publishRealtimeEvent('notifications', 'create', notification);
      return res.json(notification);
    }

    if (method === 'DELETE') {
      if (id) {
        await remove('notifications', id, 'id');
        return res.json({ success: true });
      }
      return res.status(400).json({ error: 'Missing id' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Notifications API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createDistributorNotification({ distributorCode, title, message, type, referenceId, metadata }) {
  try {
    if (!tableReady) {
      await ensureNotificationsTable();
      tableReady = true;
    }
    const notificationData = {
      id: `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      recipient_type: 'distributor',
      recipient_id: (distributorCode || '').toUpperCase().trim(),
      title: title,
      message: message,
      type: type || 'referral',
      reference_id: referenceId || null,
      metadata: metadata ? JSON.stringify(metadata) : null
    };
    const notification = await insert('notifications', notificationData);
    await publishRealtimeEvent('notifications', 'create', notification);
    return notification;
  } catch (error) {
    console.error('Failed to create distributor notification:', error);
  }
}

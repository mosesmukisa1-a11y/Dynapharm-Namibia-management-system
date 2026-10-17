import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "./services/queryDescriptors.js";import { query, getMany, getOne, insert, update, remove, publishRealtimeEvent } from './db.js';
import { applyAuthCors } from './_lib/auth.js';

async function ensureNotificationsTable() {
  await __qd_executePlan(query, __qd_registeredPlan("api/notifications.js:5:0"), []);













  await __qd_executePlan(query, __qd_registeredPlan("api/notifications.js:19:1"), []);
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
      const recipientType = searchParams.get('recipient_type');

      // Must be authenticated to read notifications
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const isAdmin = req.user.role === 'admin';
      const callerUsername = (req.user.username || '').toLowerCase().trim();

      // Non-admin users can only read their own notifications or company-wide broadcasts
      if (!isAdmin) {
        const requestedId = (recipientId || '').toLowerCase().trim();
        const isBroadcast = requestedId === 'all' && recipientType === 'company';
        if (!isBroadcast && requestedId !== callerUsername) {
          return res.status(403).json({ error: 'You are not authorised to view these notifications' });
        }
      }

      let queryText = __qd_registeredPlan("api/notifications.js:64:2");
      const conditions = [];
      const params = [];

      if (recipientId) {
        params.push(recipientId.toLowerCase().trim());
        conditions.push(__qd_registeredPlan("api/notifications.js:70:4", [params.length]));
      }
      if (recipientType) {
        params.push(recipientType);
        conditions.push(__qd_registeredPlan("api/notifications.js:74:5", [params.length]));
      }
      if (unreadOnly) {
        conditions.push(__qd_registeredPlan("api/notifications.js:77:6"));
      }
      if (id) {
        params.push(id);
        conditions.push(__qd_registeredPlan("api/notifications.js:81:7", [params.length]));
      }
      if (since) {
        params.push(new Date(since).toISOString());
        conditions.push(__qd_registeredPlan("api/notifications.js:85:8", [params.length]));
      }

      if (conditions.length > 0) {
        queryText = __qd_joinPlans([queryText, __qd_joinPlans([__qd_registeredPlan("api/notifications.js:89:3"), __qd_joinPlans(conditions, "and")], "empty")], "empty");
      }
      queryText = __qd_joinPlans([queryText, __qd_registeredPlan("api/notifications.js:91:9")], "empty");

      const limit = searchParams.get('limit');
      if (limit) {
        params.push(parseInt(limit));
        queryText = __qd_joinPlans([queryText, __qd_registeredPlan("api/notifications.js:96:10", [params.length])], "empty");
      }

      const notifications = await __qd_executePlan(getMany, queryText, params);
      return res.json(notifications);
    }

    if (method === 'PUT') {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const body = req.body;
      const isAdmin = req.user.role === 'admin';
      const callerUsername = (req.user.username || '').toLowerCase().trim();

      if (body.markAllRead && body.recipient_id) {
        // Enforce that non-admins can only mark their own notifications read
        if (!isAdmin && body.recipient_id.toLowerCase().trim() !== callerUsername) {
          return res.status(403).json({ error: 'You are not authorised to update these notifications' });
        }
        await __qd_executePlan(query, __qd_registeredPlan("api/notifications.js:118:11"),

        [body.recipient_id.toLowerCase().trim()]);

        return res.json({ success: true });
      }
      if (body.id && body.recipient_id) {
        const notif = await __qd_executePlan(getOne, __qd_registeredPlan("api/notifications.js:124:12"), [body.id]);
        if (!notif) {
          return res.status(404).json({ error: 'Notification not found' });
        }
        // Verify the notification belongs to this user (admins bypass)
        const notifOwner = (notif.recipient_id || '').toLowerCase().trim();
        if (!isAdmin && notifOwner !== callerUsername) {
          return res.status(403).json({ error: 'You are not authorised to update this notification' });
        }
        const notification = await update('notifications', body.id, { is_read: true }, 'id');
        return res.json(notification);
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
        metadata: body.metadata ? typeof body.metadata === 'string' ? body.metadata : JSON.stringify(body.metadata) : null
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

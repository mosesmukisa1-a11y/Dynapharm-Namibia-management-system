import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { query, getMany } from '../db.js';

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {raw += c;});
    req.on('end', () => {try {resolve(raw ? JSON.parse(raw) : {});} catch {reject(new Error('Invalid JSON'));}});
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
      const rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/finance/notices.js:26:0"), []);


      return res.json({
        success: true,
        notices: rows.map((r) => ({
          id: r.id,
          title: r.title,
          message: r.message,
          priority: r.type || 'Normal',
          createdBy: r.recipient_id || '',
          createdAt: r.created_at
        }))
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
      const noticeMsg = message.trim();
      const noticePriority = priority || 'Normal';

      await __qd_executePlan(query, __qd_registeredPlan("api/finance/notices.js:55:1"),


      [id, sender, noticeTitle, noticeMsg, noticePriority]);


      await __qd_executePlan(query, __qd_registeredPlan("api/finance/notices.js:61:2"),


      [broadcastId, noticeTitle, `[Finance] ${noticeMsg}`, noticePriority]);


      return res.status(201).json({
        success: true,
        notice: { id, title: noticeTitle, message: noticeMsg, priority: noticePriority, createdBy: sender, createdAt: new Date().toISOString() }
      });
    }

    if (req.method === 'DELETE') {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const id = url.searchParams.get('id');
      if (!id) return res.status(400).json({ success: false, error: 'id is required' });
      await __qd_executePlan(query, __qd_registeredPlan("api/finance/notices.js:76:3"), [id]);
      await __qd_executePlan(query, __qd_registeredPlan("api/finance/notices.js:77:4"), [`${id}-BROADCAST`]);
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[finance/notices]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

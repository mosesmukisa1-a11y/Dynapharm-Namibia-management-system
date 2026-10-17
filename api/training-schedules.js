import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./services/queryDescriptors.js";import { applyAuthCors } from './_lib/auth.js';
import { query } from './db.js';

async function ensureColumns() {
  const cols = [__qd_registeredPlan("api/training-schedules.js:6:0"), __qd_registeredPlan("api/training-schedules.js:7:1"), __qd_registeredPlan("api/training-schedules.js:8:2"), __qd_registeredPlan("api/training-schedules.js:9:3")];





  for (const sql of cols) {
    await __qd_executePlan(query, sql, []).catch(() => {});
  }
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await ensureColumns();

    if (req.method === 'GET') {
      const { rows } = await __qd_executePlan(query, __qd_registeredPlan("api/training-schedules.js:25:4"), []);






      return res.json(rows);
    }

    if (req.method === 'POST') {
      const { title, date, time, location, trainer, platform, meeting_link, target_audience, description } = req.body || {};
      if (!title || !date) {
        return res.status(400).json({ success: false, error: 'title and date are required' });
      }
      const { rows } = await __qd_executePlan(query, __qd_registeredPlan("api/training-schedules.js:40:5"),




      [
      title,
      date,
      time || null,
      location || null,
      trainer || null,
      platform || 'in_person',
      meeting_link || null,
      target_audience || 'all',
      description || null]);


      return res.status(201).json({ success: true, schedule: rows[0] });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const { id, title, date, time, location, trainer, platform, meeting_link, target_audience, description } = req.body || {};
      if (!id) return res.status(400).json({ success: false, error: 'id is required' });
      const { rows } = await __qd_executePlan(query, __qd_registeredPlan("api/training-schedules.js:63:6"),












      [title || null, date || null, time ?? null, location ?? null, trainer ?? null,
      platform || null, meeting_link ?? null, target_audience || null, description ?? null, id]);

      if (!rows.length) return res.status(404).json({ success: false, error: 'Schedule not found' });
      return res.json({ success: true, schedule: rows[0] });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, error: 'id is required' });
      await __qd_executePlan(query, __qd_registeredPlan("api/training-schedules.js:85:7"), [id]);
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[training-schedules]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

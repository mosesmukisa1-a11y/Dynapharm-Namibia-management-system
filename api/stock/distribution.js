import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const transfers = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/distribution.js:11:0"), []);



    const pending = transfers.filter((t) => ['pending', 'submitted', 'pending_approval'].includes(t.status));
    const inTransit = transfers.filter((t) => ['in_transit', 'dispatched'].includes(t.status));
    const completed = transfers.filter((t) => ['completed', 'received', 'delivered'].includes(t.status));

    res.status(200).json({
      success: true,
      summary: {
        pendingCount: pending.length,
        inTransitCount: inTransit.length,
        completedCount: completed.length
      },
      pending,
      inTransit
    });
  } catch (err) {
    console.error('Distribution error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}

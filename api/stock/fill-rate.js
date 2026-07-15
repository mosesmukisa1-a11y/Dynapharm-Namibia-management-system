/**
 * GET /api/stock/fill-rate
 * Warehouse fill-rate report (#13).
 * Computes what % of stock requests were fulfilled on time,
 * partially, or never. Grouped by branch and time period.
 * Accessible by: admin, gm, stock, director
 */
import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Auth required' });
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  const ALLOWED = new Set(['admin', 'gm', 'general_manager', 'director', 'stock', 'stock_manager']);
  if (!ALLOWED.has((req.user?.role || '').toLowerCase())) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  try {
    const url    = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const days   = Number(url.searchParams.get('days') || 90);
    const branch = url.searchParams.get('branch') || null;
    const since  = new Date(Date.now() - days * 86400 * 1000).toISOString();

    const conditions = [`sr.created_at >= $1::timestamptz`];
    const params     = [since];
    if (branch) {
      params.push(branch);
      conditions.push(`LOWER(REPLACE(sr.requesting_branch,' ','_')) = LOWER(REPLACE($${params.length},' ','_'))`);
    }

    const requests = await getMany(
      `SELECT
         sr.id,
         sr.requesting_branch,
         sr.status,
         sr.priority,
         sr.created_at,
         sr.updated_at,
         sr.items
       FROM stock_requests sr
       WHERE ${conditions.join(' AND ')}
       ORDER BY sr.created_at DESC`,
      params
    );

    // Classify each request
    const FULFILLED     = new Set(['received', 'delivered', 'completed']);
    const PARTIAL       = new Set(['partially_received']);
    const CANCELLED     = new Set(['cancelled', 'rejected']);
    const IN_PROGRESS   = new Set(['pending', 'approved', 'dispatched', 'in_transit']);

    const branchMap = new Map();

    for (const req of requests) {
      const br = (req.requesting_branch || 'unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      if (!branchMap.has(br)) {
        branchMap.set(br, {
          branch: br,
          branchId: req.requesting_branch,
          total:     0,
          fulfilled: 0,
          partial:   0,
          cancelled: 0,
          inProgress: 0,
          never:     0,
          avgFulfilmentHours: null,
          _fulfilmentHoursSum: 0,
          _fulfilmentCount: 0,
          highPriority: 0,
        });
      }
      const entry = branchMap.get(br);
      entry.total++;

      const status = (req.status || '').toLowerCase();
      if (FULFILLED.has(status)) {
        entry.fulfilled++;
        // Calculate fulfilment time
        if (req.updated_at && req.created_at) {
          const hrs = (new Date(req.updated_at) - new Date(req.created_at)) / 3600000;
          if (hrs > 0 && hrs < 8760) { // cap at 1 year to exclude stale outliers
            entry._fulfilmentHoursSum += hrs;
            entry._fulfilmentCount++;
          }
        }
      } else if (PARTIAL.has(status)) {
        entry.partial++;
      } else if (CANCELLED.has(status)) {
        entry.cancelled++;
      } else if (IN_PROGRESS.has(status)) {
        entry.inProgress++;
      } else {
        // Open request created long ago — effectively never filled
        const ageHrs = (Date.now() - new Date(req.created_at).getTime()) / 3600000;
        if (ageHrs > 72) entry.never++;
        else entry.inProgress++;
      }

      if ((req.priority || '').toLowerCase() === 'high') entry.highPriority++;
    }

    const rows = Array.from(branchMap.values()).map(e => {
      const fillRate    = e.total > 0 ? ((e.fulfilled / e.total) * 100).toFixed(1) : '0.0';
      const partialRate = e.total > 0 ? ((e.partial   / e.total) * 100).toFixed(1) : '0.0';
      const neverRate   = e.total > 0 ? ((e.never     / e.total) * 100).toFixed(1) : '0.0';
      const avgHrs      = e._fulfilmentCount > 0
        ? parseFloat((e._fulfilmentHoursSum / e._fulfilmentCount).toFixed(1))
        : null;
      return {
        branch:             e.branch,
        branchId:           e.branchId,
        totalRequests:      e.total,
        fulfilled:          e.fulfilled,
        partial:            e.partial,
        cancelled:          e.cancelled,
        inProgress:         e.inProgress,
        neverFilled:        e.never,
        fillRatePct:        parseFloat(fillRate),
        partialRatePct:     parseFloat(partialRate),
        neverFilledPct:     parseFloat(neverRate),
        avgFulfilmentHours: avgHrs,
        highPriorityCount:  e.highPriority,
      };
    }).sort((a, b) => a.fillRatePct - b.fillRatePct); // worst performers first

    // Company-wide totals
    const totals = rows.reduce((acc, r) => {
      acc.totalRequests  += r.totalRequests;
      acc.fulfilled      += r.fulfilled;
      acc.partial        += r.partial;
      acc.cancelled      += r.cancelled;
      acc.inProgress     += r.inProgress;
      acc.neverFilled    += r.neverFilled;
      return acc;
    }, { totalRequests: 0, fulfilled: 0, partial: 0, cancelled: 0, inProgress: 0, neverFilled: 0 });

    const companyFillRate = totals.totalRequests > 0
      ? parseFloat(((totals.fulfilled / totals.totalRequests) * 100).toFixed(1))
      : 0;

    return res.json({
      success: true,
      periodDays:       days,
      since,
      companyFillRate,
      totals,
      branches:         rows,
    });
  } catch (err) {
    console.error('[fill-rate]', err.message);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}

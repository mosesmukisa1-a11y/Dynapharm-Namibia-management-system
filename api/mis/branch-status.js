import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

function startOfDay(date) {
  const copy = new Date(date);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date) {
  const copy = new Date(date);
  copy.setUTCHours(23, 59, 59, 999);
  return copy;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatIso(date) {
  return date instanceof Date ? date.toISOString() : null;
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const dateParam = searchParams.get('date');
    const baseDate = parseDate(dateParam) || new Date();
    const rangeStart = startOfDay(baseDate).toISOString();
    const rangeEnd = endOfDay(baseDate).toISOString();

    const [lineStats, receiptStats] = await Promise.all([__qd_executePlan(
      getMany, __qd_registeredPlan("api/mis/branch-status.js:47:0"),












      [rangeStart, rangeEnd]), __qd_executePlan(

      getMany, __qd_registeredPlan("api/mis/branch-status.js:62:1"),










      [rangeStart, rangeEnd])]

    );

    const receiptMap = new Map();
    receiptStats.forEach((row) => {
      receiptMap.set(row.branch_id || 'unknown', {
        lastUpload: row.last_upload ? formatIso(row.last_upload) : null,
        receiptCount: Number(row.receipt_count || 0),
        totalAmount: Number(row.total_amount || 0)
      });
    });

    const pending = [];
    const encoded = [];
    const reconciliation = [];

    lineStats.forEach((row) => {
      const branch = row.branch_id || 'unknown';
      const pendingCount = Number(row.pending || 0);
      const verifiedCount = Number(row.verified || 0);
      const totalCount = Number(row.total || 0);
      const branchReceipts = receiptMap.get(branch) || {
        lastUpload: null,
        receiptCount: 0,
        totalAmount: 0
      };

      if (pendingCount > 0) {
        pending.push({
          branch,
          pending: pendingCount,
          lastUpload: branchReceipts.lastUpload
        });
      }

      encoded.push({
        branch,
        draft: totalCount,
        verified: verifiedCount,
        receiptCount: branchReceipts.receiptCount
      });

      const verifiedQuantity = Number(row.verified_quantity || 0);
      const totalQuantity = Number(row.total_quantity || 0);
      const diffAmount = Math.abs(branchReceipts.totalAmount - verifiedQuantity);

      reconciliation.push({
        branch,
        matched: diffAmount < 1 ? verifiedCount : Math.max(0, verifiedCount - 1),
        unmatched: diffAmount < 1 ? totalCount - verifiedCount : totalCount - (verifiedCount || 0),
        discrepancies:
        diffAmount < 1 ?
        'Aligned with receipts' :
        `Variance of ${diffAmount.toFixed(2)} between encoded and receipts`
      });
    });

    // Include branches that only have receipts but no drafts
    receiptMap.forEach((stats, branch) => {
      if (!lineStats.find((row) => (row.branch_id || 'unknown') === branch)) {
        pending.push({
          branch,
          pending: 0,
          lastUpload: stats.lastUpload
        });
        encoded.push({
          branch,
          draft: 0,
          verified: 0,
          receiptCount: stats.receiptCount
        });
        reconciliation.push({
          branch,
          matched: 0,
          unmatched: stats.receiptCount,
          discrepancies: 'No encoded lines found for receipts'
        });
      }
    });

    return res.status(200).json({
      success: true,
      date: baseDate.toISOString().slice(0, 10),
      pending: pending.sort((a, b) => a.branch.localeCompare(b.branch)),
      encoded: encoded.sort((a, b) => a.branch.localeCompare(b.branch)),
      reconciliation: reconciliation.sort((a, b) => a.branch.localeCompare(b.branch))
    });
  } catch (error) {
    console.error('MIS branch-status API error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error'
    });
  }
}

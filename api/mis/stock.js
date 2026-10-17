import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildRange({ startParam, endParam, yearParam, monthParam }) {
  const start = parseDate(startParam);
  const end = parseDate(endParam);

  if (start && end) {
    return { start: start.toISOString(), end: end.toISOString() };
  }

  if (yearParam && monthParam) {
    const year = Number(yearParam);
    const month = Number(monthParam);
    if (!Number.isNaN(year) && !Number.isNaN(month)) {
      const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
      const monthEnd = new Date(Date.UTC(year, month, 1, 0, 0, 0));
      return { start: monthStart.toISOString(), end: monthEnd.toISOString() };
    }
  }

  const defaultEnd = end || new Date();
  const defaultStart = start || new Date(defaultEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { start: defaultStart.toISOString(), end: defaultEnd.toISOString() };
}

function normalizeRow(row) {
  if (!row) return null;
  return {
    branch: row.branch_id || row.branch || 'unknown',
    productName: row.product_name || 'Unknown Product',
    quantity: Number(row.quantity || 0),
    amount: Number(row.amount || 0)
  };
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
    const scope = searchParams.get('scope') || 'range';
    const branchParam = searchParams.get('branch');
    const range = buildRange({
      startParam: searchParams.get('start'),
      endParam: searchParams.get('end'),
      yearParam: searchParams.get('year'),
      monthParam: searchParams.get('month')
    });

    const params = [range.start, range.end];
    let queryText = __qd_registeredPlan("api/mis/stock.js:67:0");






























    if (branchParam && branchParam !== 'all') {
      params.push(branchParam);
      queryText = __qd_joinPlans([queryText, __qd_registeredPlan("api/mis/stock.js:100:1", [params.length])], "empty");
    }

    queryText = __qd_joinPlans([queryText, __qd_registeredPlan("api/mis/stock.js:103:2")], "empty");





    const rows = await __qd_executePlan(getMany, queryText, params);
    const normalized = rows.map(normalizeRow).filter(Boolean);

    return res.status(200).json({
      success: true,
      rows: normalized,
      range,
      scope
    });
  } catch (error) {
    console.error('MIS stock API error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Internal server error'
    });
  }
}

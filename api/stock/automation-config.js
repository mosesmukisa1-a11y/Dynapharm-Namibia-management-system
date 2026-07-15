/**
 * Stock Automation Config API
 * GET  /api/stock/automation-config  — fetch config, reorder rules, recent logs
 * POST /api/stock/automation-config  — update config key or save a reorder rule, or trigger a job manually
 * DELETE /api/stock/automation-config — remove a reorder rule
 *
 * Accessible by: admin, gm, stock
 */

import { applyAuthCors } from '../_lib/auth.js';
import { getMany, query } from '../db.js';
import {
  runAutoWriteOff,
  runAutoStockRequest,
  runAutoReceiveDispatched,
} from '../services/stockAutomation.js';

const ALLOWED = new Set(['admin', 'gm', 'stock']);

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Auth required' });
  if (!ALLOWED.has(req.user.role)) return res.status(403).json({ success: false, error: 'Access denied' });

  try {
    // ── GET: return current config, rules and recent log ─────────────────────
    if (req.method === 'GET') {
      const [config, rules, logs] = await Promise.all([
        getMany('SELECT * FROM stock_automation_config ORDER BY key'),
        getMany('SELECT * FROM stock_reorder_rules ORDER BY branch_id, product_name'),
        getMany('SELECT * FROM stock_automation_log ORDER BY created_at DESC LIMIT 150'),
      ]);
      return res.json({ success: true, config, rules, logs });
    }

    // ── POST: update config / save rule / run job manually ───────────────────
    if (req.method === 'POST') {
      const { action, key, value, rule } = req.body || {};

      // Manual job triggers (admin/stock only)
      if (action === 'run_write_off') {
        await runAutoWriteOff();
        return res.json({ success: true, message: 'Write-off scan completed' });
      }
      if (action === 'run_stock_request') {
        await runAutoStockRequest();
        return res.json({ success: true, message: 'Stock-request scan completed' });
      }
      if (action === 'run_auto_receive') {
        await runAutoReceiveDispatched();
        return res.json({ success: true, message: 'Auto-receive scan completed' });
      }

      // Update a config key
      if (key !== undefined && value !== undefined) {
        await query(
          `INSERT INTO stock_automation_config (key, value, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [String(key), String(value)]
        );
        return res.json({ success: true, message: `Config '${key}' updated to '${value}'` });
      }

      // Add / update a per-product-branch reorder rule
      if (rule) {
        const { branch_id, product_name, min_qty, reorder_qty, preferred_warehouse, active } = rule;
        if (!branch_id || !product_name) {
          return res.status(400).json({ success: false, error: 'branch_id and product_name are required' });
        }
        const id = rule.id || `RR-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        await query(
          `INSERT INTO stock_reorder_rules
             (id, branch_id, product_name, min_qty, reorder_qty, preferred_warehouse, active, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
           ON CONFLICT (branch_id, product_name) DO UPDATE
             SET min_qty             = EXCLUDED.min_qty,
                 reorder_qty         = EXCLUDED.reorder_qty,
                 preferred_warehouse = EXCLUDED.preferred_warehouse,
                 active              = EXCLUDED.active,
                 updated_at          = NOW()`,
          [id, branch_id, product_name,
           Number(min_qty ?? 5), Number(reorder_qty ?? 20),
           preferred_warehouse || 'windhoek_warehouse',
           active !== false]
        );
        return res.json({ success: true, message: 'Reorder rule saved', id });
      }

      return res.status(400).json({ success: false, error: 'Invalid request — provide action, key+value, or rule' });
    }

    // ── DELETE: remove a reorder rule ────────────────────────────────────────
    if (req.method === 'DELETE') {
      const { ruleId } = req.body || {};
      if (!ruleId) return res.status(400).json({ success: false, error: 'ruleId required' });
      await query('DELETE FROM stock_reorder_rules WHERE id=$1', [ruleId]);
      return res.json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[automation-config]', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}

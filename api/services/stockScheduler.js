/**
 * Stock Reporting Scheduler
 * Runs automated daily/weekly/monthly stock summary jobs using setInterval-based
 * scheduling (no external cron dependency needed).
 *
 * Schedule:
 *  - Daily rebuild + stock summary: 00:05 each day (5 min after midnight)
 *  - Weekly summary (Monday): 00:10
 *  - Monthly summary (1st of month): 00:15
 *
 * Table design note:
 *   The unique constraint is enforced via the `id` primary key, which is
 *   composed as "<period_type>-<period_key>-<branch_id|all>". This avoids
 *   the PostgreSQL restriction that expression indexes (e.g. COALESCE) cannot
 *   be referenced in ON CONFLICT clauses without a matching explicit index.
 */
import { query, getMany, getOne } from '../db.js';
import {
  runAutoWriteOff,
  runAutoStockRequest,
  runAutoReceiveDispatched,
  runPendingApprovalEscalation,
  runStuckApprovalCleanup,
  runInventoryDriftRepair,
  runWarehouseReorderCheck,
  runInterBranchRedistribution,
  runNightlyStockHealthDigest,
} from './stockAutomation.js';

let schedulerStarted = false;
let schedulerInterval = null;

function pad(n) { return String(n).padStart(2, '0'); }

function localDateStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function makeSummaryId(periodType, periodKey, branchId) {
  const bPart = (branchId || 'all').replace(/[^a-zA-Z0-9_]/g, '_');
  return `${periodType}-${periodKey}-${bPart}`.replace(/[^a-zA-Z0-9_-]/g, '-');
}

// ── Ensure the pre-computed summaries table exists ──────────────────────────
export async function ensureStockSummaryTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS stock_report_summaries (
      id            TEXT PRIMARY KEY,
      period_type   TEXT NOT NULL,
      period_key    TEXT NOT NULL,
      branch_id     TEXT,
      report_data   JSONB NOT NULL,
      computed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(err => console.warn('[scheduler] Could not create stock_report_summaries:', err.message));

  await query(`
    CREATE INDEX IF NOT EXISTS idx_srs_type_key_branch
      ON stock_report_summaries (period_type, period_key, branch_id)
  `).catch(() => {});
}

// ── Upsert a summary row (conflict on the id PK) ────────────────────────────
async function upsertSummary(periodType, periodKey, branchId, reportData) {
  const id = makeSummaryId(periodType, periodKey, branchId);
  await query(
    `INSERT INTO stock_report_summaries (id, period_type, period_key, branch_id, report_data, computed_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (id)
     DO UPDATE SET report_data = EXCLUDED.report_data, computed_at = NOW()`,
    [id, periodType, periodKey, branchId || null, JSON.stringify(reportData)]
  );
}

// ── Compute and store daily stock summary (company-wide + per branch) ────────
export async function computeDailyStockSummary(dateStr) {
  try {
    const dayStart = `${dateStr}T00:00:00`;
    const dayEnd = `${dateStr}T23:59:59`;

    // Run the daily branch report rebuild for all branches
    try {
      const { default: rebuildHandler } = await import('../jobs/rebuild-daily-branch-report.js');
      const fakeReq = {
        method: 'POST',
        headers: { host: 'localhost' },
        body: { date: dateStr, dry_run: false },
        url: '/api/jobs/rebuild-daily-branch-report',
      };
      let rebuildResult = null;
      const fakeRes = {
        status: () => fakeRes,
        json: (d) => { rebuildResult = d; return fakeRes; },
        end: () => fakeRes,
        setHeader: () => fakeRes,
        getHeader: () => null,
        removeHeader: () => fakeRes,
        headersSent: false,
      };
      await rebuildHandler(fakeReq, fakeRes);
      console.log(`[scheduler] Daily rebuild for ${dateStr}:`, rebuildResult?.message || 'ok');
    } catch (rebuildErr) {
      console.warn('[scheduler] Daily rebuild error:', rebuildErr.message);
    }

    const OUTWARD_SALE = new Set(['walkin_sale','walkin_member_sale','walkin_non_member_sale','walk_in_member_sale','walk_in_non_member_sale','sale','online_order_fulfilment']);
    const OUTWARD_RX = new Set(['prescription_dispense']);
    const OUTWARD_WO = new Set(['write_off','field_use']);
    const INWARD = new Set(['supplier_import_receipt','warehouse_receipt','branch_receipt','transfer_in','received','return_in','positive_adjustment']);

    // Company-wide snapshot
    const [inventory, movements, sales] = await Promise.all([
      getMany(
        `SELECT location_type, location_id, SUM(closing_qty) as qty, SUM(stock_value_dp) as value
         FROM inventory_balances GROUP BY location_type, location_id`
      ),
      getMany(
        `SELECT movement_type,
                source_location AS branch_location,
                destination_location AS dest_location,
                SUM(quantity) as qty
         FROM stock_movements
         WHERE status IN ('posted','completed')
           AND created_at >= $1::timestamp AND created_at <= $2::timestamp
         GROUP BY movement_type, source_location, destination_location`,
        [dayStart, dayEnd]
      ),
      getMany(
        `SELECT branch_id, SUM(total) as revenue, COUNT(*) as count
         FROM branch_walkin_sales
         WHERE status = 'completed'
           AND sale_date >= $1::timestamp AND sale_date <= $2::timestamp
         GROUP BY branch_id`,
        [dayStart, dayEnd]
      ),
    ]);

    let warehouseQty = 0, branchQty = 0, inTransitQty = 0, totalValue = 0;
    for (const r of inventory) {
      const q = Number(r.qty || 0);
      const v = Number(r.value || 0);
      if (r.location_type === 'warehouse') { warehouseQty += q; totalValue += v; }
      else if (r.location_type === 'branch') { branchQty += q; totalValue += v; }
      else if (r.location_type === 'in_transit') inTransitQty += q;
    }

    // Company-wide movement aggregation
    let salesUnits = 0, rxUnits = 0, writeoffUnits = 0, receivedUnits = 0;
    for (const m of movements) {
      const q = Number(m.qty || 0);
      if (OUTWARD_SALE.has(m.movement_type)) salesUnits += q;
      else if (OUTWARD_RX.has(m.movement_type)) rxUnits += q;
      else if (OUTWARD_WO.has(m.movement_type)) writeoffUnits += q;
      else if (INWARD.has(m.movement_type)) receivedUnits += q;
    }

    const totalRevenue = sales.reduce((s, r) => s + Number(r.revenue || 0), 0);

    const companySummary = {
      date: dateStr,
      scope: 'company',
      inventory: { warehouseQty, branchQty, inTransitQty, totalValue: parseFloat(totalValue.toFixed(2)), totalQty: warehouseQty + branchQty + inTransitQty },
      movements: { salesUnits, rxUnits, writeoffUnits, receivedUnits },
      sales: { totalRevenue: parseFloat(totalRevenue.toFixed(2)), branchBreakdown: sales },
      computedAt: new Date().toISOString(),
    };

    await upsertSummary('daily', dateStr, null, companySummary);
    console.log(`[scheduler] Daily company stock summary stored for ${dateStr}`);

    // Per-branch summaries: derive branch IDs from inventory_balances (authoritative) and sales
    const branchesFromInv = inventory.filter(r => r.location_type === 'branch').map(r => r.location_id);
    const branchesFromSales = sales.filter(s => s.branch_id).map(s => s.branch_id);
    const branches = [...new Set([...branchesFromInv, ...branchesFromSales])];

    for (const branchId of branches) {
      // Movements for a branch: source or destination matches the branch location id
      const bMovements = movements.filter(m =>
        m.branch_location === branchId || m.dest_location === branchId
      );
      let bSales = 0, bRx = 0, bWriteoff = 0, bReceived = 0;
      for (const m of bMovements) {
        const q = Number(m.qty || 0);
        if (OUTWARD_SALE.has(m.movement_type)) bSales += q;
        else if (OUTWARD_RX.has(m.movement_type)) bRx += q;
        else if (OUTWARD_WO.has(m.movement_type)) bWriteoff += q;
        else if (INWARD.has(m.movement_type)) bReceived += q;
      }

      const bSaleRow = sales.find(s => s.branch_id === branchId);
      const bRevenue = bSaleRow ? Number(bSaleRow.revenue || 0) : 0;
      const bCount = bSaleRow ? Number(bSaleRow.count || 0) : 0;

      const branchInventoryRows = inventory.filter(r => r.location_type === 'branch' && r.location_id === branchId);
      const bQty = branchInventoryRows.reduce((s, r) => s + Number(r.qty || 0), 0);
      const bValue = branchInventoryRows.reduce((s, r) => s + Number(r.value || 0), 0);

      const branchSummary = {
        date: dateStr,
        scope: 'branch',
        branchId,
        inventory: { qty: bQty, value: parseFloat(bValue.toFixed(2)) },
        movements: { salesUnits: bSales, rxUnits: bRx, writeoffUnits: bWriteoff, receivedUnits: bReceived },
        sales: { totalRevenue: parseFloat(bRevenue.toFixed(2)), count: bCount },
        computedAt: new Date().toISOString(),
      };

      await upsertSummary('daily', dateStr, branchId, branchSummary);
    }

    if (branches.length > 0) {
      console.log(`[scheduler] Per-branch daily summaries stored for ${branches.length} branches on ${dateStr}`);
    }

    return companySummary;
  } catch (err) {
    console.error('[scheduler] computeDailyStockSummary error:', err.message);
    return null;
  }
}

// ── Compute weekly summary by aggregating daily summaries ───────────────────
export async function computeWeeklySummary(mondayDate) {
  try {
    const d = new Date(mondayDate);
    const weekNum = getISOWeekNumber(d);
    const year = d.getFullYear();
    const periodKey = `${year}-W${pad(weekNum)}`;

    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(d);
      day.setDate(d.getDate() + i);
      days.push(localDateStr(day));
    }

    const rows = await getMany(
      `SELECT period_key, branch_id, report_data FROM stock_report_summaries
       WHERE period_type = 'daily' AND period_key = ANY($1)`,
      [days]
    );

    // Company-wide weekly aggregate
    const companyRows = rows.filter(r => !r.branch_id);
    let salesUnits = 0, rxUnits = 0, writeoffUnits = 0, receivedUnits = 0, totalRevenue = 0;
    let lastInventory = null;
    for (const r of companyRows) {
      const dr = typeof r.report_data === 'string' ? JSON.parse(r.report_data) : r.report_data;
      salesUnits += dr.movements?.salesUnits || 0;
      rxUnits += dr.movements?.rxUnits || 0;
      writeoffUnits += dr.movements?.writeoffUnits || 0;
      receivedUnits += dr.movements?.receivedUnits || 0;
      totalRevenue += dr.sales?.totalRevenue || 0;
      lastInventory = dr.inventory;
    }

    const summaryData = {
      periodKey,
      weekStart: days[0],
      weekEnd: days[6],
      daysWithData: companyRows.length,
      inventory: lastInventory,
      movements: { salesUnits, rxUnits, writeoffUnits, receivedUnits },
      sales: { totalRevenue: parseFloat(totalRevenue.toFixed(2)) },
      computedAt: new Date().toISOString(),
    };

    await upsertSummary('weekly', periodKey, null, summaryData);

    // Per-branch weekly aggregates
    const branchIds = [...new Set(rows.filter(r => r.branch_id).map(r => r.branch_id))];
    for (const branchId of branchIds) {
      const bRows = rows.filter(r => r.branch_id === branchId);
      let bSales = 0, bRx = 0, bWriteoff = 0, bReceived = 0, bRevenue = 0;
      for (const r of bRows) {
        const dr = typeof r.report_data === 'string' ? JSON.parse(r.report_data) : r.report_data;
        bSales += dr.movements?.salesUnits || 0;
        bRx += dr.movements?.rxUnits || 0;
        bWriteoff += dr.movements?.writeoffUnits || 0;
        bReceived += dr.movements?.receivedUnits || 0;
        bRevenue += dr.sales?.totalRevenue || 0;
      }
      await upsertSummary('weekly', periodKey, branchId, {
        periodKey, weekStart: days[0], weekEnd: days[6], branchId,
        movements: { salesUnits: bSales, rxUnits: bRx, writeoffUnits: bWriteoff, receivedUnits: bReceived },
        sales: { totalRevenue: parseFloat(bRevenue.toFixed(2)) },
        computedAt: new Date().toISOString(),
      });
    }

    console.log(`[scheduler] Weekly stock summary stored for ${periodKey}`);
    return summaryData;
  } catch (err) {
    console.error('[scheduler] computeWeeklySummary error:', err.message);
    return null;
  }
}

// ── Compute monthly summary by aggregating daily summaries ──────────────────
export async function computeMonthlySummary(year, month) {
  try {
    const periodKey = `${year}-${pad(month)}`;
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);

    const days = [];
    const cur = new Date(monthStart);
    while (cur <= monthEnd) {
      days.push(localDateStr(cur));
      cur.setDate(cur.getDate() + 1);
    }

    const rows = await getMany(
      `SELECT period_key, branch_id, report_data FROM stock_report_summaries
       WHERE period_type = 'daily' AND period_key = ANY($1)`,
      [days]
    );

    const companyRows = rows.filter(r => !r.branch_id);
    let salesUnits = 0, rxUnits = 0, writeoffUnits = 0, receivedUnits = 0, totalRevenue = 0;
    let lastInventory = null;
    for (const r of companyRows) {
      const dr = typeof r.report_data === 'string' ? JSON.parse(r.report_data) : r.report_data;
      salesUnits += dr.movements?.salesUnits || 0;
      rxUnits += dr.movements?.rxUnits || 0;
      writeoffUnits += dr.movements?.writeoffUnits || 0;
      receivedUnits += dr.movements?.receivedUnits || 0;
      totalRevenue += dr.sales?.totalRevenue || 0;
      lastInventory = dr.inventory;
    }

    const openingRow = companyRows.find(r => r.period_key === days[0]);
    const openingData = openingRow ? (typeof openingRow.report_data === 'string' ? JSON.parse(openingRow.report_data) : openingRow.report_data) : null;

    const summaryData = {
      periodKey,
      month: periodKey,
      monthStart: localDateStr(monthStart),
      monthEnd: localDateStr(monthEnd),
      daysWithData: companyRows.length,
      inventory: lastInventory,
      movements: { salesUnits, rxUnits, writeoffUnits, receivedUnits },
      sales: { totalRevenue: parseFloat(totalRevenue.toFixed(2)) },
      misFormula: {
        opening: openingData?.inventory?.totalQty || 0,
        received: receivedUnits,
        sales: salesUnits,
        writeoffs: writeoffUnits,
        closing: lastInventory?.totalQty || 0,
      },
      computedAt: new Date().toISOString(),
    };

    await upsertSummary('monthly', periodKey, null, summaryData);

    // Per-branch monthly aggregates
    const branchIds = [...new Set(rows.filter(r => r.branch_id).map(r => r.branch_id))];
    for (const branchId of branchIds) {
      const bRows = rows.filter(r => r.branch_id === branchId);
      let bSales = 0, bRx = 0, bWriteoff = 0, bReceived = 0, bRevenue = 0;
      for (const r of bRows) {
        const dr = typeof r.report_data === 'string' ? JSON.parse(r.report_data) : r.report_data;
        bSales += dr.movements?.salesUnits || 0;
        bRx += dr.movements?.rxUnits || 0;
        bWriteoff += dr.movements?.writeoffUnits || 0;
        bReceived += dr.movements?.receivedUnits || 0;
        bRevenue += dr.sales?.totalRevenue || 0;
      }
      await upsertSummary('monthly', periodKey, branchId, {
        periodKey, month: periodKey, branchId,
        monthStart: localDateStr(monthStart), monthEnd: localDateStr(monthEnd),
        movements: { salesUnits: bSales, rxUnits: bRx, writeoffUnits: bWriteoff, receivedUnits: bReceived },
        sales: { totalRevenue: parseFloat(bRevenue.toFixed(2)) },
        computedAt: new Date().toISOString(),
      });
    }

    console.log(`[scheduler] Monthly stock summary stored for ${periodKey}`);
    return summaryData;
  } catch (err) {
    console.error('[scheduler] computeMonthlySummary error:', err.message);
    return null;
  }
}

// ── ISO week number helper ──────────────────────────────────────────────────
function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// ── Scheduler tick ──────────────────────────────────────────────────────────
async function tick() {
  const now = new Date();
  const hh = now.getHours();
  const mm = now.getMinutes();
  const day = now.getDate();
  const weekDay = now.getDay(); // 0=Sun, 1=Mon

  // Daily job at 00:05
  if (hh === 0 && mm === 5) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = localDateStr(yesterday);
    console.log('[scheduler] Running daily stock summary for:', dateStr);
    await computeDailyStockSummary(dateStr);
  }

  // Weekly job on Monday at 00:10
  if (hh === 0 && mm === 10 && weekDay === 1) {
    const lastMonday = new Date(now);
    lastMonday.setDate(lastMonday.getDate() - 7);
    console.log('[scheduler] Running weekly stock summary for week starting:', localDateStr(lastMonday));
    await computeWeeklySummary(localDateStr(lastMonday));
  }

  // Monthly job on 1st of month at 00:15
  if (hh === 0 && mm === 15 && day === 1) {
    const lastMonth = new Date(now);
    lastMonth.setDate(0);
    console.log('[scheduler] Running monthly stock summary for:', lastMonth.getFullYear(), lastMonth.getMonth() + 1);
    await computeMonthlySummary(lastMonth.getFullYear(), lastMonth.getMonth() + 1);
  }

  // ── Automation job 1: auto write-off expired batches (daily at 00:20) ──────
  if (hh === 0 && mm === 20) {
    console.log('[scheduler] Running auto write-off scan...');
    await runAutoWriteOff().catch(e => console.error('[scheduler] auto write-off error:', e.message));
  }

  // ── Automation job 2: auto stock request for low stock (daily at 00:25) ────
  if (hh === 0 && mm === 25) {
    console.log('[scheduler] Running auto stock-request scan...');
    await runAutoStockRequest().catch(e => console.error('[scheduler] auto stock-request error:', e.message));
  }

  // ── Automation job 3: auto-receive stale dispatches (every tick) ─────────
  await runAutoReceiveDispatched().catch(e => console.error('[scheduler] auto-receive error:', e.message));

  // ── Automation job 5: pending-approval escalation (every 4h during business hours) ──
  if (hh >= 8 && hh <= 20 && mm === 30 && (hh % 4 === 0)) {
    await runPendingApprovalEscalation().catch(e => console.error('[scheduler] escalation error:', e.message));
  }

  // ── Automation job 1: stuck-approval cleanup (every hour, 06:00–20:00) ────
  if (hh >= 6 && hh <= 20 && mm === 0) {
    await runStuckApprovalCleanup().catch(e => console.error('[scheduler] stuck-approval error:', e.message));
  }

  // ── Automation job 3b: inventory drift repair (nightly at 01:00) ──────────
  if (hh === 1 && mm === 0) {
    console.log('[scheduler] Running inventory drift repair...');
    await runInventoryDriftRepair().catch(e => console.error('[scheduler] drift-repair error:', e.message));
  }

  // ── Automation job 6: warehouse reorder check (daily at 00:30) ───────────
  if (hh === 0 && mm === 30) {
    await runWarehouseReorderCheck().catch(e => console.error('[scheduler] warehouse-reorder error:', e.message));
  }

  // ── Automation job 8: inter-branch redistribution (daily at 01:05) ───────
  if (hh === 1 && mm === 5) {
    await runInterBranchRedistribution().catch(e => console.error('[scheduler] inter-branch error:', e.message));
  }

  // ── Automation job 15: nightly stock health digest (daily at 06:00) ───────
  if (hh === 6 && mm === 0) {
    console.log('[scheduler] Sending morning stock health digest...');
    await runNightlyStockHealthDigest().catch(e => console.error('[scheduler] health-digest error:', e.message));
  }
}

// ── Startup backfill: compute any missing periods since last run ──────────────
async function backfillMissedRuns() {
  try {
    // Find the most recent daily summary stored
    const latest = await getOne(
      `SELECT period_key FROM stock_report_summaries WHERE period_type = 'daily' AND branch_id IS NULL ORDER BY period_key DESC LIMIT 1`
    ).catch(() => null);

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayStr = localDateStr(yesterday);

    if (!latest) {
      // No summaries at all — compute yesterday's as a baseline
      console.log('[scheduler] Backfill: computing first baseline for', yesterdayStr);
      await computeDailyStockSummary(yesterdayStr);
      return;
    }

    // Backfill any days between the latest stored summary and yesterday
    const latestDate = new Date(latest.period_key);
    const fillStart = new Date(latestDate);
    fillStart.setDate(fillStart.getDate() + 1); // day after latest stored

    const backfillDays = [];
    const cur = new Date(fillStart);
    while (localDateStr(cur) <= yesterdayStr) {
      backfillDays.push(localDateStr(cur));
      cur.setDate(cur.getDate() + 1);
    }

    if (backfillDays.length === 0) {
      console.log('[scheduler] No backfill needed (latest:', latest.period_key, ')');
      return;
    }

    // Cap at 7 days of backfill to avoid very long startup delays
    const daysToFill = backfillDays.slice(-7);
    console.log(`[scheduler] Backfilling ${daysToFill.length} missing day(s):`, daysToFill.join(', '));
    for (const d of daysToFill) {
      await computeDailyStockSummary(d);
    }
  } catch (err) {
    console.warn('[scheduler] Backfill error:', err.message);
  }
}

// ── Start the scheduler ─────────────────────────────────────────────────────
export function startStockScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  ensureStockSummaryTable()
    .then(() => backfillMissedRuns())
    .catch(err => console.warn('[scheduler] Startup error:', err.message));

  schedulerInterval = setInterval(tick, 60 * 1000);
  console.log('[scheduler] Stock reporting scheduler started');
}

export function stopStockScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    schedulerStarted = false;
    console.log('[scheduler] Stock reporting scheduler stopped');
  }
}

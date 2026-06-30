/**
 * Shared engine for GM, Finance, and MIS portals.
 * All values are DP only. All movements must be status='posted'.
 * Reads exclusively from stock_movements and inventory_balances (stock engine)
 * and branch_walkin_sales (sales engine). No independent calculations.
 */
import { query, getMany, getOne } from '../db.js';

const LOW_STOCK_THRESHOLD = 10;
const EXPIRY_WARN_DAYS = 90;

// Movement type classification (mirrors stockEngine.js OUTWARD_TYPES)
const SALE_TYPES = new Set([
  'walkin_sale', 'walkin_member_sale', 'walkin_non_member_sale',
  'walk_in_member_sale', 'walk_in_non_member_sale', 'sale', 'online_order_fulfilment',
  'campaign_sale',      // member campaign sales
  'campaign_free_item', // free items distributed via campaigns (stock out)
]);
const DISPENSE_TYPES = new Set(['prescription_dispense']);
const WRITEOFF_TYPES = new Set(['write_off', 'field_use']);
const RECEIVED_TYPES = new Set([
  'transfer_in', 'branch_receipt', 'received', 'return_in', 'positive_adjustment',
]);
const DISPATCH_TYPES = new Set(['warehouse_dispatch', 'transfer_out']);

export function getDateRange(query_params) {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = query_params.startDate
    ? query_params.startDate
    : firstOfMonth.toISOString().slice(0, 10);
  const end = query_params.endDate
    ? query_params.endDate
    : now.toISOString().slice(0, 10);
  return { start, end };
}

/**
 * All known locations from inventory_balances + branches table.
 * Returns [{locationId, locationName, locationType}]
 */
export async function getAllBranchLocations() {
  const [ibRows, branchRows] = await Promise.all([
    getMany(`SELECT DISTINCT location_id FROM inventory_balances WHERE location_type = 'branch'`),
    getMany(`SELECT id, name FROM branches WHERE status = 'active' ORDER BY name`),
  ]);

  const branchMap = new Map(branchRows.map(b => [b.id, b.name]));
  const seen = new Set();
  const result = [];

  // Filter out phantom/malformed location_ids (must be lowercase slug)
  const isValidLocationId = (id) => id && /^[a-z0-9_-]+$/.test(id);

  for (const r of ibRows) {
    if (!seen.has(r.location_id) && isValidLocationId(r.location_id)) {
      seen.add(r.location_id);
      const name = branchMap.get(r.location_id) || normalizeBranchName(r.location_id);
      result.push({ locationId: r.location_id, locationName: name, locationType: 'branch' });
    }
  }
  for (const b of branchRows) {
    if (!seen.has(b.id)) {
      seen.add(b.id);
      result.push({ locationId: b.id, locationName: b.name, locationType: 'branch' });
    }
  }
  return result;
}

export async function getAllWarehouseLocations() {
  const rows = await getMany(
    `SELECT DISTINCT location_id FROM inventory_balances WHERE location_type = 'warehouse'`
  );
  return rows.map(r => ({
    locationId: r.location_id,
    locationName: normalizeBranchName(r.location_id),
    locationType: 'warehouse',
  }));
}

const BRANCH_DISPLAY_MAP = {
  townshop: 'Windhoek CBD',
  windhoek_cbd: 'Windhoek CBD',
  oshakati_branch: 'Oshakati',
  oshakati: 'Oshakati',
  'hochland-park': 'Hochlandpark',
  hochland_park: 'Hochlandpark',
  hochlandpark: 'Hochlandpark',
  khomasdal: 'Khomasdal',
  tsumeb: 'Tsumeb',
  gobabis: 'Gobabis',
  swakopmund: 'Swakopmund',
  walvisbay: 'Walvis Bay',
  walvis_bay: 'Walvis Bay',
  outapi: 'Outapi',
  okahao: 'Okahao',
  otjiwarongo: 'Otjiwarongo',
  eenhana: 'Eenhana',
  ondangwa: 'Ondangwa',
  rundu: 'Rundu',
  okongo: 'Okongo',
  nkurenkuru: 'Nkurenkuru',
  katima: 'Katima Mulilo',
  katima_mulilo: 'Katima Mulilo',
  katima_branch: 'Katima Mulilo',
  windhoek_warehouse: 'Windhoek Warehouse',
  ondangwa_warehouse: 'Ondangwa Warehouse',
  country_stock: 'Country Stock',
};

function normalizeBranchName(id) {
  if (!id) return id;
  if (BRANCH_DISPLAY_MAP[id]) return BRANCH_DISPLAY_MAP[id];
  return id
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Stock summary for a location from inventory_balances.
 */
export async function getLocationStockSummary(locationType, locationId) {
  let rows;
  if (locationType === 'branch') {
    // branch_inventory_batches is the authoritative source for branch stock.
    // inventory_balances is a derived cache that can go stale / negative.
    rows = await getMany(
      `SELECT b.product_name,
              b.expiry_date,
              SUM(b.quantity)                                    AS closing_qty,
              SUM(b.quantity * COALESCE(p.dp, 0))               AS stock_value_dp
       FROM branch_inventory_batches b
       LEFT JOIN product_prices p
             ON LOWER(TRIM(p.description)) = LOWER(TRIM(b.product_name))
       WHERE b.branch_id = $1 AND b.quantity > 0
       GROUP BY b.product_name, b.expiry_date`,
      [locationId]
    );
  } else {
    rows = await getMany(
      `SELECT product_name, batch_no, expiry_date, closing_qty, stock_value_dp, inward_qty, outward_qty
       FROM inventory_balances
       WHERE location_type = $1 AND location_id = $2`,
      [locationType, locationId]
    );
  }

  let closingQty = 0;
  let stockValueDP = 0;
  let lowStockCount = 0;
  const productSet = new Set();

  for (const r of rows) {
    const qty = Number(r.closing_qty || 0);
    const val = Number(r.stock_value_dp || 0);
    closingQty += qty;
    stockValueDP += val;
    productSet.add(r.product_name);
    if (qty > 0 && qty < LOW_STOCK_THRESHOLD) lowStockCount++;
  }

  const now = new Date();
  const warnDate = new Date(now.getTime() + EXPIRY_WARN_DAYS * 86400 * 1000);
  const expiringRows = rows.filter(r => {
    if (!r.expiry_date || Number(r.closing_qty || 0) <= 0) return false;
    const exp = new Date(r.expiry_date);
    return exp <= warnDate;
  });

  return {
    productCount: productSet.size,
    closingStock: closingQty,
    stockValueDP,
    lowStockCount,
    expiringCount: expiringRows.length,
  };
}

/**
 * Movement totals for a location from stock_movements (posted only).
 */
export async function getLocationMovements(locationType, locationId, start, end) {
  const rows = await getMany(
    `SELECT movement_type, quantity, source_location, destination_location, unit_dp
     FROM stock_movements
     WHERE status = 'posted'
       AND created_at >= $1::date
       AND created_at <= ($2 || 'T23:59:59')::timestamp
       AND (
         (source_location = $3 AND (source_location_type = $4 OR source_location_type IS NULL))
         OR
         (destination_location = $3 AND (destination_location_type = $4 OR destination_location_type IS NULL))
       )`,
    [start, end, locationId, locationType]
  );

  let salesUnits = 0, dispensedUnits = 0, writeOffQty = 0, receivedQty = 0, dispatchQty = 0;
  let writeOffValueDP = 0;

  for (const m of rows) {
    const qty = Number(m.quantity || 0);
    const unitDP = Number(m.unit_dp || 0);
    const isOut = m.source_location === locationId;
    const isIn = m.destination_location === locationId;

    if (isOut && SALE_TYPES.has(m.movement_type)) salesUnits += qty;
    else if (isOut && DISPENSE_TYPES.has(m.movement_type)) dispensedUnits += qty;
    else if (isOut && WRITEOFF_TYPES.has(m.movement_type)) {
      writeOffQty += qty;
      writeOffValueDP += qty * unitDP;
    } else if (isIn && RECEIVED_TYPES.has(m.movement_type)) receivedQty += qty;
    else if (isOut && DISPATCH_TYPES.has(m.movement_type)) dispatchQty += qty;
  }

  return { salesUnits, dispensedUnits, writeOffQty, writeOffValueDP, receivedQty, dispatchQty };
}

/**
 * Sales revenue from branch_walkin_sales (completed sales only).
 */
export async function getBranchSalesRevenue(branchId, start, end) {
  const [rows, refundRows, rxRows, priceListRows] = await Promise.all([
    getMany(
      `SELECT customer_type, payment_method, total, subtotal, items
       FROM branch_walkin_sales
       WHERE branch_id = $1
         AND status = 'completed'
         AND sale_date >= $2::date
         AND sale_date <= ($3 || 'T23:59:59')::timestamp`,
      [branchId, start, end]
    ),
    getMany(
      `SELECT COALESCE(SUM(refund_amount), 0) AS refund_total
       FROM branch_refund_requests
       WHERE status = 'approved'
         AND LOWER(REPLACE(branch_id,' ','_')) = LOWER(REPLACE($1,' ','_'))
         AND processed_at::date >= $2::date
         AND processed_at::date <= $3::date`,
      [branchId, start, end]
    ),
    // Prescription dispensing DP revenue from BAT (authoritative, excludes drafts)
    getMany(
      `SELECT grand_total, product_total_dp, client_type
       FROM branch_activity_transactions
       WHERE branch_id = $1
         AND activity_type = 'prescription_dispensing'
         AND workflow_source != 'dispense_draft'
         AND payment_status = 'paid'
         AND service_date >= $2::date
         AND service_date <= $3::date`,
      [branchId, start, end]
    ),
    // GM price list — authoritative DP source
    getMany(`SELECT description, dp FROM product_prices`),
  ]);

  // Build price-map from GM price list
  const priceMapBSR = {};
  for (const p of priceListRows) {
    if (p.description) priceMapBSR[p.description.toLowerCase().trim()] = Number(p.dp || 0);
  }
  const lookupDpBSR = (name) => (name ? (priceMapBSR[name.toLowerCase().trim()] || 0) : 0);

  const refundTotal = Number(refundRows[0]?.refund_total || 0);
  let walkinSales = 0, memberSales = 0, nonMemberSales = 0, onlineSales = 0;
  let cashTotal = 0, swipeTotal = 0, eftTotal = 0;

  for (const r of rows) {
    const ct = (r.customer_type || '').toLowerCase();
    let amt;
    // Non-member walk-in: branch_walkin_sales.total = CP (consumer price).
    // Parse item-level DP to get the true distributor-price basis.
    if (ct.includes('non') || (!ct.includes('member') && !ct.includes('online'))) {
      let items = [];
      try { items = typeof r.items === 'string' ? JSON.parse(r.items) : (Array.isArray(r.items) ? r.items : []); } catch {}
      amt = items.reduce((s, i) => {
        const nm = (i.product_name || i.name || i.description || '').trim();
        const dp = lookupDpBSR(nm) || Number(i.dpPrice || i.dp || i.unit_price || 0);
        return s + dp * Number(i.quantity || i.qty || 1);
      }, 0);
    } else {
      // Member and online sales: total = DP (members pay at DP)
      amt = Number(r.total || r.subtotal || 0);
    }
    walkinSales += amt;
    if (ct.includes('member') && !ct.includes('non')) memberSales += amt;
    else if (ct.includes('online')) onlineSales += amt;
    else nonMemberSales += amt;

    const pm = (r.payment_method || '').toLowerCase();
    if (pm === 'cash') cashTotal += amt;
    else if (pm === 'swipe' || pm === 'card') swipeTotal += amt;
    else if (pm === 'eft') eftTotal += amt;
  }

  // Prescription dispensing DP — always use product_total_dp (DP from price list = company money).
  // grand_total for non-member Rx = CP (patient charge), excluded from company revenue.
  let prescriptionSales = 0;
  for (const r of rxRows) {
    prescriptionSales += Number(r.product_total_dp || r.grand_total || 0);
  }

  // Deduct approved refunds processed in this period
  walkinSales    = Math.max(0, walkinSales    - refundTotal);
  nonMemberSales = Math.max(0, nonMemberSales - refundTotal);
  const totalSales = walkinSales + prescriptionSales;

  return { totalSales, walkinSales, memberSales, nonMemberSales, onlineSales, prescriptionSales, cashTotal, swipeTotal, eftTotal };
}

/**
 * Company-wide stock summary aggregated from inventory_balances.
 */
export async function getCompanyStockSummary() {
  // inventory_balances tracks branch stock (updated by stock_movements).
  // stock_batches is the authoritative source for warehouse/country stock.
  // We read both and combine — avoiding double-counting by only using
  // inventory_balances for branches, and stock_batches for warehouses.
  const [ibRows, batchRows] = await Promise.all([
    // Branch stock: read directly from branch_inventory_batches (authoritative source).
    // inventory_balances is a derived cache that can become stale; branch_inventory_batches
    // is always kept current by the transactional sale/receive/dispense flows.
    getMany(
      `SELECT b.branch_id AS location_id, b.product_name, b.expiry_date,
              SUM(b.quantity)                                      AS closing_qty,
              SUM(b.quantity * COALESCE(p.dp, 0))                 AS stock_value_dp
       FROM branch_inventory_batches b
       LEFT JOIN product_prices p
             ON LOWER(TRIM(p.description)) = LOWER(TRIM(b.product_name))
       WHERE b.quantity > 0
       GROUP BY b.branch_id, b.product_name, b.expiry_date`
    ),
    getMany(
      `SELECT location, description as product_name, expiry_date,
              SUM(remaining_quantity) AS qty,
              SUM(remaining_quantity * COALESCE(dpc_unit_value, unit_price, 0)) AS val_dp
       FROM stock_batches
       WHERE location != 'country_stock'
         AND remaining_quantity > 0
         AND COALESCE(status,'') != 'expired'
       GROUP BY location, description, expiry_date`
    ),
  ]);

  let totalQty = 0, totalValueDP = 0;
  let warehouseQty = 0, branchQty = 0, inTransitQty = 0;
  let lowStockCount = 0;
  const now = new Date();
  const warnDate = new Date(now.getTime() + EXPIRY_WARN_DAYS * 86400 * 1000);
  let expiringCount = 0;

  const productLowStock = new Map();

  // Aggregate warehouse stock from stock_batches (country_stock excluded at query level)
  for (const r of batchRows) {
    const qty = Number(r.qty || 0);
    const val = Number(r.val_dp || 0);
    warehouseQty += qty;
    totalValueDP += val;
    if (r.expiry_date && qty > 0) {
      const exp = new Date(r.expiry_date);
      if (exp <= warnDate) expiringCount++;
    }
  }

  // Aggregate branch stock from inventory_balances
  for (const r of ibRows) {
    const qty = Number(r.closing_qty || 0);
    const val = Number(r.stock_value_dp || 0);
    branchQty += qty;
    totalValueDP += val;

    if (qty > 0 && qty < LOW_STOCK_THRESHOLD) {
      if (!productLowStock.has(r.product_name)) {
        productLowStock.set(r.product_name, true);
        lowStockCount++;
      }
    }
    if (r.expiry_date && qty > 0) {
      const exp = new Date(r.expiry_date);
      if (exp <= warnDate) expiringCount++;
    }
  }

  totalQty = warehouseQty + branchQty + inTransitQty;

  return {
    totalQty, totalValueDP, warehouseQty, branchQty, inTransitQty,
    countryQty: 0, lowStockCount, expiringCount,
  };
}

/**
 * All sales across the company (all branches).
 */
export async function getAllBranchesSalesRevenue(start, end) {
  const [rows, refundRow, rxRows] = await Promise.all([
    getMany(
      `SELECT branch_id, customer_type, payment_method, total
       FROM branch_walkin_sales
       WHERE status = 'completed'
         AND sale_date >= $1::date
         AND sale_date <= ($2 || 'T23:59:59')::timestamp`,
      [start, end]
    ),
    getOne(
      `SELECT COALESCE(SUM(refund_amount), 0) AS refund_total
       FROM branch_refund_requests
       WHERE status = 'approved'
         AND processed_at::date >= $1::date
         AND processed_at::date <= $2::date`,
      [start, end]
    ),
    // Prescription revenue from BAT — grand_total is what the patient was actually charged,
    // matching the receipt total visible in MIS reports.
    getMany(
      `SELECT grand_total, product_total_dp, client_type
       FROM branch_activity_transactions
       WHERE activity_type = 'prescription_dispensing'
         AND workflow_source != 'dispense_draft'
         AND payment_status = 'paid'
         AND service_date >= $1::date
         AND service_date <= $2::date`,
      [start, end]
    ),
  ]);

  const refundTotal = Number(refundRow?.refund_total || 0);
  let walkinSales = 0, memberSales = 0, nonMemberSales = 0, onlineSales = 0;

  for (const r of rows) {
    const ct = (r.customer_type || '').toLowerCase();
    // Use the stored receipt total for every sale type so Total Sales matches
    // what customers actually paid (= what MIS receipts report shows).
    const amt = Number(r.total || 0);
    const isMember = ct.includes('member') && !ct.includes('non');
    if (isMember) memberSales += amt;
    else if (ct.includes('online')) onlineSales += amt;
    else nonMemberSales += amt;
    walkinSales += amt;
  }

  // Deduct approved refunds processed in this period
  walkinSales    = Math.max(0, walkinSales    - refundTotal);
  nonMemberSales = Math.max(0, nonMemberSales - refundTotal);

  // Prescription revenue: grand_total = what the patient was charged (matches MIS receipts).
  let prescriptionSales = 0;
  for (const r of rxRows) {
    prescriptionSales += Number(r.grand_total || r.product_total_dp || 0);
  }

  const totalSales = walkinSales + prescriptionSales;
  return { walkinSales, memberSales, nonMemberSales, onlineSales, prescriptionSales, totalSales };
}

/**
 * Company stock value by DP.
 * Branch stock: from branch_inventory_batches (authoritative — never goes negative).
 * Warehouse stock: from inventory_balances (kept in sync by stock engine).
 */
export async function getCompanyStockValueDP() {
  const [warehouseRows, branchRow] = await Promise.all([
    getMany(
      `SELECT SUM(stock_value_dp) as total_value_dp
       FROM inventory_balances
       WHERE location_type = 'warehouse'`
    ),
    getMany(
      `SELECT SUM(b.quantity * COALESCE(p.dp, 0)) as total_value_dp
       FROM branch_inventory_batches b
       LEFT JOIN product_prices p
             ON LOWER(TRIM(p.description)) = LOWER(TRIM(b.product_name))
       WHERE b.quantity > 0`
    ),
  ]);

  const warehouseValueDP = Number(warehouseRows[0]?.total_value_dp || 0);
  const branchValueDP    = Number(branchRow[0]?.total_value_dp    || 0);
  const companyValueDP   = warehouseValueDP + branchValueDP;

  const writeOff = await getOne(
    `SELECT COALESCE(SUM(quantity * COALESCE(unit_dp, 0)), 0) as val
     FROM stock_movements WHERE status = 'posted' AND movement_type = 'write_off'`
  );
  const writeOffValueDP = Number(writeOff?.val || 0);

  return { companyValueDP, warehouseValueDP, branchValueDP, writeOffValueDP };
}

/**
 * Write-offs from stock_movements.
 */
export async function getWriteOffs(start, end, locationId = null) {
  const params = [start, end];
  let locFilter = '';
  if (locationId) { params.push(locationId); locFilter = `AND source_location = $${params.length}`; }

  const rows = await getMany(
    `SELECT product_name, batch_no, expiry_date, quantity, unit_dp,
            source_location, source_location_type, notes, movement_date, created_at
     FROM stock_movements
     WHERE status = 'posted'
       AND movement_type IN ('write_off', 'field_use')
       AND created_at >= $1::date
       AND created_at <= ($2 || 'T23:59:59')::timestamp
       ${locFilter}
     ORDER BY created_at DESC`,
    params
  );

  return rows.map(r => ({
    locationType: r.source_location_type || 'branch',
    locationName: normalizeBranchName(r.source_location),
    productName: r.product_name,
    batchNo: r.batch_no,
    qty: Number(r.quantity || 0),
    unitDP: Number(r.unit_dp || 0),
    valueDP: Number(r.quantity || 0) * Number(r.unit_dp || 0),
    reason: r.notes || null,
    writeOffDate: r.movement_date || r.created_at,
  }));
}

/**
 * Low stock and expiring stock alerts.
 */
export async function getStockAlerts(thresholdDays = 90) {
  const now = new Date();
  const warnDate = new Date(now.getTime() + thresholdDays * 86400 * 1000);

  const [lowStockRows, allRows] = await Promise.all([
    getMany(
      `SELECT location_type, location_id, product_name, batch_no, closing_qty, stock_value_dp
       FROM inventory_balances
       WHERE closing_qty > 0 AND closing_qty < $1
       ORDER BY closing_qty ASC`,
      [LOW_STOCK_THRESHOLD]
    ),
    getMany(
      `SELECT location_type, location_id, product_name, batch_no, expiry_date, closing_qty, stock_value_dp
       FROM inventory_balances
       WHERE closing_qty > 0 AND expiry_date IS NOT NULL AND expiry_date <= $1
       ORDER BY expiry_date ASC`,
      [warnDate.toISOString().slice(0, 10)]
    ),
  ]);

  const lowStock = lowStockRows.map(r => ({
    locationId: r.location_id,
    locationName: normalizeBranchName(r.location_id),
    productName: r.product_name,
    batchNo: r.batch_no,
    closingQty: Number(r.closing_qty || 0),
    stockValueDP: Number(r.stock_value_dp || 0),
  }));

  const expiring = allRows.map(r => ({
    locationId: r.location_id,
    locationName: normalizeBranchName(r.location_id),
    productName: r.product_name,
    batchNo: r.batch_no,
    expiryDate: r.expiry_date,
    closingQty: Number(r.closing_qty || 0),
    stockValueDP: Number(r.stock_value_dp || 0),
    daysToExpiry: Math.round((new Date(r.expiry_date) - now) / 86400000),
  }));

  return { lowStock, expiring, writeOffRisk: expiring.filter(e => e.daysToExpiry <= 30) };
}

export { normalizeBranchName };

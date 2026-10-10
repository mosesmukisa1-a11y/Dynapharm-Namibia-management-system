/**
 * Shared engine for GM, Finance, and MIS portals.
 * All values are DP only. All movements must be status='posted'.
 * Reads exclusively from stock_movements and inventory_balances (stock engine)
 * and branch_walkin_sales (sales engine). No independent calculations.
 */
import { query, getMany, getOne } from '../db.js';
import { ALL_BRANCH_LOCATION_ALIASES, branchSearchTerms } from '../_lib/branchUtils.js';
import { getStockCostProjection } from './stockCostReporting.js';
import { inferLocationType } from './stockEngine.js';
import {getLegacyDPRevenue} from './stockFinancialReports.js';
import {businessDay,validateBusinessDates} from './businessDates.js';

import { getStockAlertPolicy } from './stockAlertPolicy.js';
import { validateExpiryWarningDays } from '../../shared/stockAlertPolicy.js';

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
  const today=businessDay();
  const start=query_params.startDate || `${today.slice(0,7)}-01`;
  const end=query_params.endDate || today;
  validateBusinessDates(start,end);
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
  const alertPolicy = await getStockAlertPolicy();
  const { lowStockThreshold: LOW_STOCK_THRESHOLD, expiryWarningDays: EXPIRY_WARN_DAYS } = alertPolicy;
  const layers=(await getStockCostProjection({locations:[locationId]})).filter(r=>r.location===locationId);
  const rows=layers.map(r=>({product_name:r.productName,expiry_date:r.expiryDate,
    closing_qty:r.qty,stock_value_dp:r.qty*(r.unitDPC ?? 0)}));

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
    alertPolicy,
    productCount: productSet.size,
    closingStock: closingQty,
    stockValueDP,
    lowStockCount,
    expiringCount: expiringRows.length,
    availableStock:layers.reduce((sum,r)=>sum+r.availableQty,0),
    reservedStock:layers.reduce((sum,r)=>sum+r.reservedQty,0),
    missingCostQuantity:layers.reduce((sum,r)=>sum+r.missingDPCQuantity,0),
    valuationComplete:layers.every(r=>!r.missingDPCQuantity),
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
       AND created_at >= ($1::date::timestamp AT TIME ZONE 'Africa/Windhoek')
       AND created_at < (($2::date+1)::timestamp AT TIME ZONE 'Africa/Windhoek')
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
  return getLegacyDPRevenue(branchSearchTerms(branchId),start,end);
}

/**
 * Company-wide stock summary aggregated from inventory_balances.
 */
export async function getCompanyStockSummary() {
  const alertPolicy = await getStockAlertPolicy();
  const { lowStockThreshold: LOW_STOCK_THRESHOLD, expiryWarningDays: EXPIRY_WARN_DAYS } = alertPolicy;
  const layers=await getStockCostProjection();
  const ibRows=layers.filter(r=>r.locationType==='branch').map(r=>({
    product_name:r.productName,expiry_date:r.expiryDate,closing_qty:r.qty,stock_value_dp:r.qty*(r.unitDPC ?? 0)}));
  const batchRows=layers.filter(r=>r.locationType==='warehouse').map(r=>({
    product_name:r.productName,expiry_date:r.expiryDate,qty:r.qty,val_dp:r.qty*(r.unitDPC ?? 0)}));

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

  inTransitQty=layers.reduce((sum,r)=>sum+r.inTransitQty,0);
  const countryQty=layers.filter(r=>r.location==='country_stock').reduce((sum,r)=>sum+r.qty,0);
  totalQty = warehouseQty + branchQty + inTransitQty + countryQty;
  totalValueDP=layers.reduce((sum,r)=>sum+r.qty*(r.unitDPC ?? 0),0);

  return {
    alertPolicy,
    totalQty, totalValueDP, warehouseQty, branchQty, inTransitQty,
    countryQty, lowStockCount, expiringCount,
    availableQty:layers.reduce((sum,r)=>sum+r.availableQty,0),reservedQty:layers.reduce((sum,r)=>sum+r.reservedQty,0),
    missingCostQuantity:layers.reduce((sum,r)=>sum+r.missingDPCQuantity,0),
    valuationComplete:layers.every(r=>!r.missingDPCQuantity),
  };
}

/**
 * All sales across the company (all branches).
 */
export async function getAllBranchesSalesRevenue(start, end) {
  return getLegacyDPRevenue(null,start,end);
}

/**
 * Company stock value by DP.
 * Branch stock: from branch_inventory_batches (authoritative — never goes negative).
 * Warehouse stock: from inventory_balances (kept in sync by stock engine).
 */
export async function getCompanyStockValueDP() {
  const layers=await getStockCostProjection();
  const value=type=>layers.filter(r=>inferLocationType(r.location)===type).reduce((sum,r)=>sum+r.qty*(r.unitDPC ?? 0),0);
  const warehouseValueDP=value('warehouse'),branchValueDP=value('branch');
  const companyValueDP=layers.reduce((sum,r)=>sum+r.qty*(r.unitDPC ?? 0),0);

  const writeOff = await getOne(
    `SELECT COALESCE(SUM(quantity * COALESCE(original_unit_dp,unit_dp, 0)), 0) as val
     FROM stock_movements WHERE status = 'posted' AND movement_type = 'write_off'`
  );
  const writeOffValueDP = Number(writeOff?.val || 0);

  return { companyValueDP, warehouseValueDP, branchValueDP, writeOffValueDP,
    missingCostQuantity:layers.reduce((sum,r)=>sum+r.missingDPCQuantity,0),valuationComplete:layers.every(r=>!r.missingDPCQuantity) };
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
        AND created_at >= ($1::date::timestamp AT TIME ZONE 'Africa/Windhoek')
        AND created_at < (($2::date+1)::timestamp AT TIME ZONE 'Africa/Windhoek')
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
export async function getStockAlerts(thresholdDays) {
  const alertPolicy = await getStockAlertPolicy();
  const LOW_STOCK_THRESHOLD = alertPolicy.lowStockThreshold;
  thresholdDays = thresholdDays === undefined ? alertPolicy.expiryWarningDays : validateExpiryWarningDays(thresholdDays);
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

  return { alertPolicy, thresholdDays, lowStock, expiring, writeOffRisk: expiring.filter(e => e.daysToExpiry <= 30) };
}

export { normalizeBranchName };

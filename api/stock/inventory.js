import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';
import { normalizeBranchSlug } from '../_lib/branchUtils.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const locationType = url.searchParams.get('locationType') || '';
    const locationId = url.searchParams.get('locationId') || '';
    const search = url.searchParams.get('search') || '';
    const batchNoFilter = url.searchParams.get('batchNo') || '';

    // ── Warehouse / country stock ─────────────────────────────────────────────
    // Source: stock_batches.remaining_quantity (live, per-movement updated).
    // Unit price: prefer current product_prices.dp so a price-list update is
    // immediately reflected here, fall back to the batch's stored dpc_unit_value.
    const batches = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/inventory.js:22:0"), []);













    // ── Branch stock ──────────────────────────────────────────────────────────
    // Source: branch_inventory_batches (authoritative physical quantities per batch).
    // Unit price: prefer current product_prices.dp for the same live-price reason.
    const bibRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/inventory.js:39:1"), []);

















    // ── Country stock ─────────────────────────────────────────────────────────
    const countryRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/inventory.js:58:2"), []);












    let items = [
    // Warehouse batches
    ...batches.map((b) => {
      const qty = Number(b.remaining_quantity || b.quantity || 0);
      const dpc = Number(b.live_dpc || 0);
      const cif = Number(b.live_cif || 0);
      return {
        locationType: 'warehouse',
        locationId: b.location,
        locationName: (b.location || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        productId: b.id,
        productName: b.description,
        batchNo: b.batch_no || b.barcode,
        expiryDate: b.expiry_date,
        openingQty: 0,
        inwardQty: 0,
        outwardQty: 0,
        closingQty: qty,
        unitDPC: dpc,
        unitCIF: cif,
        stockValueDPC: qty * dpc,
        lastMovementAt: b.import_date
      };
    }),
    // Branch batches — authoritative per-batch quantities from branch_inventory_batches
    ...bibRows.map((b) => {
      const canonId = normalizeBranchSlug(b.location_id) || b.location_id;
      const locName = b.location_name || (canonId || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const qty = Number(b.quantity || 0);
      const unitDPC = Number(b.live_dpc || 0);
      return {
        locationType: 'branch',
        locationId: canonId,
        locationName: locName,
        productId: null,
        productName: b.product_name,
        batchNo: b.batch_no,
        expiryDate: b.expiry_date,
        openingQty: 0,
        inwardQty: 0,
        outwardQty: 0,
        closingQty: qty,
        unitDPC,
        unitCIF: 0,
        stockValueDPC: qty * unitDPC,
        lastMovementAt: b.last_movement_at
      };
    }),
    // Country stock
    ...countryRows.map((b) => {
      const qty = Number(b.quantity || 0);
      const dpc = Number(b.live_dpc || 0);
      return {
        locationType: 'country',
        locationId: 'country_stock',
        locationName: 'Country Stock',
        productId: null,
        productName: b.product_name,
        batchNo: b.batch_no,
        expiryDate: b.expiry_date,
        openingQty: 0,
        inwardQty: 0,
        outwardQty: 0,
        closingQty: qty,
        unitDPC: dpc,
        unitCIF: 0,
        stockValueDPC: qty * dpc,
        lastMovementAt: b.updated_at
      };
    })];


    if (locationType) items = items.filter((i) => i.locationType === locationType);
    if (locationId) items = items.filter((i) => {
      const canonFilter = normalizeBranchSlug(locationId) || locationId;
      return i.locationId === canonFilter ||
      i.locationId === locationId ||
      (i.locationId || '').includes(locationId);
    });
    if (search) items = items.filter((i) => (i.productName || '').toLowerCase().includes(search.toLowerCase()));
    if (batchNoFilter) items = items.filter((i) => (i.batchNo || '').toLowerCase().includes(batchNoFilter.toLowerCase()));

    const totalQty = items.reduce((s, i) => s + i.closingQty, 0);
    const totalValueDPC = items.reduce((s, i) => s + i.stockValueDPC, 0);

    res.status(200).json({
      success: true,
      totals: {
        totalQty,
        totalValueDPC: parseFloat(totalValueDPC.toFixed(2)),
        lineCount: items.length
      },
      items
    });
  } catch (err) {
    console.error('[stock/inventory]', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}

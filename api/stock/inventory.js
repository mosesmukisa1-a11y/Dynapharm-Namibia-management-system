import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';
import { normalizeBranchSlug } from '../_lib/branchUtils.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const locationType = url.searchParams.get('locationType') || '';
    const locationId   = url.searchParams.get('locationId')   || '';
    const search       = url.searchParams.get('search')       || '';
    const batchNoFilter = url.searchParams.get('batchNo')     || '';

    // ── Warehouse / country stock ─────────────────────────────────────────────
    // Source: stock_batches.remaining_quantity (live, per-movement updated).
    // Unit price: prefer current product_prices.dp so a price-list update is
    // immediately reflected here, fall back to the batch's stored dpc_unit_value.
    const batches = await getMany(
      `SELECT sb.id, sb.description, sb.batch_no, sb.barcode, sb.location,
              sb.remaining_quantity, sb.quantity, sb.expiry_date, sb.import_date,
              COALESCE(NULLIF(pp.dp,  0), NULLIF(sb.dpc_unit_value, 0), NULLIF(sb.unit_price, 0), 0) AS live_dpc,
              COALESCE(NULLIF(pp.cif, 0), NULLIF(sb.cif_unit_cost,  0), NULLIF(sb.unit_price, 0), 0) AS live_cif
       FROM stock_batches sb
       LEFT JOIN live_product_prices pp
         ON LOWER(TRIM(sb.description)) = LOWER(TRIM(pp.description))
       WHERE sb.location != 'country_stock'
         AND sb.remaining_quantity > 0
         AND COALESCE(sb.status,'') != 'expired'
       ORDER BY sb.location, sb.description`
    );

    // ── Branch stock ──────────────────────────────────────────────────────────
    // Source: branch_inventory_batches (authoritative physical quantities per batch).
    // Unit price: prefer current product_prices.dp for the same live-price reason.
    const bibRows = await getMany(
      `SELECT bib.branch_id AS location_id,
              bib.product_name,
              bib.batch_no,
              bib.expiry_date,
              bib.quantity,
              COALESCE(NULLIF(pp.dp, 0), NULLIF(bib.unit_price, 0), 0) AS live_dpc,
              bib.source_warehouse,
              bib.created_at AS last_movement_at,
              b.name AS location_name
       FROM branch_inventory_batches bib
       LEFT JOIN live_product_prices pp
         ON LOWER(TRIM(bib.product_name)) = LOWER(TRIM(pp.description))
       LEFT JOIN branches b ON LOWER(b.id) = LOWER(bib.branch_id)
       WHERE bib.quantity > 0
       ORDER BY bib.branch_id, bib.product_name, bib.expiry_date ASC NULLS LAST`
    );

    // ── Country stock ─────────────────────────────────────────────────────────
    const countryRows = await getMany(
      `SELECT ib.product_name, ib.batch_no, ib.expiry_date,
              GREATEST(ib.closing_qty, 0) AS quantity,
              COALESCE(NULLIF(pp.dp, 0), NULLIF(ib.unit_dp, 0), 0) AS live_dpc,
              ib.updated_at
       FROM inventory_balances ib
       LEFT JOIN live_product_prices pp
         ON LOWER(TRIM(ib.product_name)) = LOWER(TRIM(pp.description))
       WHERE ib.location_type = 'country'
         AND ib.closing_qty > 0
       ORDER BY ib.product_name`
    );

    let items = [
      // Warehouse batches
      ...batches.map(b => {
        const qty    = Number(b.remaining_quantity || b.quantity || 0);
        const dpc    = Number(b.live_dpc || 0);
        const cif    = Number(b.live_cif || 0);
        return {
          locationType:   'warehouse',
          locationId:     b.location,
          locationName:   (b.location || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          productId:      b.id,
          productName:    b.description,
          batchNo:        b.batch_no || b.barcode,
          expiryDate:     b.expiry_date,
          openingQty:     0,
          inwardQty:      0,
          outwardQty:     0,
          closingQty:     qty,
          unitDPC:        dpc,
          unitCIF:        cif,
          stockValueDPC:  qty * dpc,
          lastMovementAt: b.import_date,
        };
      }),
      // Branch batches — authoritative per-batch quantities from branch_inventory_batches
      ...bibRows.map(b => {
        const canonId = normalizeBranchSlug(b.location_id) || b.location_id;
        const locName = b.location_name || (canonId || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const qty    = Number(b.quantity || 0);
        const unitDPC = Number(b.live_dpc || 0);
        return {
          locationType:   'branch',
          locationId:     canonId,
          locationName:   locName,
          productId:      null,
          productName:    b.product_name,
          batchNo:        b.batch_no,
          expiryDate:     b.expiry_date,
          openingQty:     0,
          inwardQty:      0,
          outwardQty:     0,
          closingQty:     qty,
          unitDPC,
          unitCIF:        0,
          stockValueDPC:  qty * unitDPC,
          lastMovementAt: b.last_movement_at,
        };
      }),
      // Country stock
      ...countryRows.map(b => {
        const qty = Number(b.quantity || 0);
        const dpc = Number(b.live_dpc || 0);
        return {
          locationType:   'country',
          locationId:     'country_stock',
          locationName:   'Country Stock',
          productId:      null,
          productName:    b.product_name,
          batchNo:        b.batch_no,
          expiryDate:     b.expiry_date,
          openingQty:     0,
          inwardQty:      0,
          outwardQty:     0,
          closingQty:     qty,
          unitDPC:        dpc,
          unitCIF:        0,
          stockValueDPC:  qty * dpc,
          lastMovementAt: b.updated_at,
        };
      }),
    ];

    if (locationType) items = items.filter(i => i.locationType === locationType);
    if (locationId)   items = items.filter(i => {
      const canonFilter = normalizeBranchSlug(locationId) || locationId;
      return i.locationId === canonFilter ||
             i.locationId === locationId  ||
             (i.locationId || '').includes(locationId);
    });
    if (search)       items = items.filter(i => (i.productName || '').toLowerCase().includes(search.toLowerCase()));
    if (batchNoFilter) items = items.filter(i => (i.batchNo || '').toLowerCase().includes(batchNoFilter.toLowerCase()));

    const totalQty      = items.reduce((s, i) => s + i.closingQty,    0);
    const totalValueDPC = items.reduce((s, i) => s + i.stockValueDPC, 0);

    res.status(200).json({
      success: true,
      totals: {
        totalQty,
        totalValueDPC: parseFloat(totalValueDPC.toFixed(2)),
        lineCount: items.length,
      },
      items,
    });
  } catch (err) {
    console.error('[stock/inventory]', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}

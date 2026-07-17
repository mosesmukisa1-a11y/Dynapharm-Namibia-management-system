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
    // Source: stock_batches.remaining_quantity (live, per-movement updated)
    const batches = await getMany(
      `SELECT id, description, batch_no, barcode, location, remaining_quantity, quantity,
              cif_unit_cost, dpc_unit_value, unit_price, expiry_date, import_date
       FROM stock_batches
       WHERE location != 'country_stock'
         AND remaining_quantity > 0
         AND COALESCE(status,'') != 'expired'
       ORDER BY location, description`
    );

    // ── Branch stock ──────────────────────────────────────────────────────────
    // Source: branch_inventory_batches (authoritative physical quantities per batch).
    // This is the same source used by current-overview.js and branch/inventory.js
    // to ensure all portals show consistent numbers.
    const bibRows = await getMany(
      `SELECT bib.branch_id AS location_id,
              bib.product_name,
              bib.batch_no,
              bib.expiry_date,
              bib.quantity,
              bib.unit_price,
              bib.source_warehouse,
              bib.created_at AS last_movement_at,
              b.name AS location_name
       FROM branch_inventory_batches bib
       LEFT JOIN branches b ON LOWER(b.id) = LOWER(bib.branch_id)
       WHERE bib.quantity > 0
       ORDER BY bib.branch_id, bib.product_name, bib.expiry_date ASC NULLS LAST`
    );

    // ── Country stock ─────────────────────────────────────────────────────────
    const countryRows = await getMany(
      `SELECT product_name, batch_no, expiry_date,
              GREATEST(closing_qty, 0) AS quantity, unit_dp, updated_at
       FROM inventory_balances
       WHERE location_type = 'country'
         AND closing_qty > 0
       ORDER BY product_name`
    );

    let items = [
      // Warehouse batches
      ...batches.map(b => ({
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
        closingQty:     Number(b.remaining_quantity || b.quantity || 0),
        unitDPC:        Number(b.dpc_unit_value || b.unit_price || 0),
        unitCIF:        Number(b.cif_unit_cost  || b.unit_price || 0),
        stockValueDPC:  Number(b.remaining_quantity || b.quantity || 0) * Number(b.dpc_unit_value || b.unit_price || 0),
        lastMovementAt: b.import_date,
      })),
      // Branch batches — authoritative per-batch quantities from branch_inventory_batches
      ...bibRows.map(b => {
        const canonId = normalizeBranchSlug(b.location_id) || b.location_id;
        const locName = b.location_name || (canonId || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const qty = Number(b.quantity || 0);
        const unitDPC = Number(b.unit_price || 0);
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
      ...countryRows.map(b => ({
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
        closingQty:     Number(b.quantity || 0),
        unitDPC:        Number(b.unit_dp || 0),
        unitCIF:        0,
        stockValueDPC:  Number(b.quantity || 0) * Number(b.unit_dp || 0),
        lastMovementAt: b.updated_at,
      })),
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

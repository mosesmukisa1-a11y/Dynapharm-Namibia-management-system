import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';
import { normalizeBranchName } from '../services/gmFinanceMisEngine.js';
import { ALL_BRANCH_LOCATION_ALIASES } from '../_lib/branchUtils.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const [batches, branchInv] = await Promise.all([
      // Warehouse stock (stock_batches).
      // Prices are sourced from product_prices (GM Price List) — the single
      // authoritative price source. Batch-level price columns are only used as a
      // last-resort fallback for products not yet in the catalogue.
      getMany(`
        SELECT sb.description,
               sb.location,
               sb.remaining_quantity,
               sb.quantity,
               COALESCE(NULLIF(p.cif, 0), NULLIF(sb.cif_unit_cost,  0), NULLIF(sb.unit_price, 0), 0) AS cif_unit_cost,
               COALESCE(NULLIF(p.dp,  0), NULLIF(sb.dpc_unit_value, 0), NULLIF(sb.unit_price, 0), 0) AS dpc_unit_value
        FROM   stock_batches sb
        LEFT JOIN product_prices p
               ON LOWER(TRIM(p.description)) = LOWER(TRIM(sb.description))
        WHERE  sb.remaining_quantity > 0
          AND  COALESCE(sb.status, '') != 'expired'
          AND  sb.location != ALL($1::text[])
      `, [ALL_BRANCH_LOCATION_ALIASES]),
      // Branch stock: read directly from branch_inventory_batches (authoritative source).
      // Prices sourced from product_prices (GM Price List).
      getMany(`
        SELECT b.branch_id AS location_id,
               b.product_name,
               SUM(b.quantity)          AS closing_qty,
               MAX(COALESCE(p.dp,  0)) AS unit_dp,
               MAX(COALESCE(p.cif, 0)) AS unit_cif
        FROM   branch_inventory_batches b
        LEFT JOIN product_prices p
               ON LOWER(TRIM(p.description)) = LOWER(TRIM(b.product_name))
        WHERE  b.quantity > 0
        GROUP BY b.branch_id, b.product_name
      `),
    ]);

    const warehouseRows = batches.map(b => ({
      locationType: 'warehouse',
      locationName: normalizeBranchName(b.location) || 'Unknown',
      productName: b.description,
      qty:     Number(b.remaining_quantity || b.quantity || 0),
      unitCIF: Number(b.cif_unit_cost  || 0),
      unitDPC: Number(b.dpc_unit_value || 0),
    }));

    const branchRows = branchInv.map(b => ({
      locationType: 'branch',
      locationName: normalizeBranchName(b.location_id) || b.location_id || 'Unknown',
      productName: b.product_name,
      qty:     Number(b.closing_qty || 0),
      unitCIF: Number(b.unit_cif   || 0),
      unitDPC: Number(b.unit_dp    || 0),
    }));

    const allRows = [...warehouseRows, ...branchRows];

    const totalQty      = allRows.reduce((s, r) => s + r.qty, 0);
    const totalValueCIF = allRows.reduce((s, r) => s + r.qty * r.unitCIF, 0);
    const totalValueDPC = allRows.reduce((s, r) => s + r.qty * r.unitDPC, 0);

    const locationMap = {};
    allRows.forEach(r => {
      const key = `${r.locationType}::${r.locationName}`;
      if (!locationMap[key]) locationMap[key] = { locationType: r.locationType, locationName: r.locationName, totalQty: 0, totalValueCIF: 0, totalValueDPC: 0 };
      locationMap[key].totalQty      += r.qty;
      locationMap[key].totalValueCIF += r.qty * r.unitCIF;
      locationMap[key].totalValueDPC += r.qty * r.unitDPC;
    });

    const productMap = {};
    allRows.forEach(r => {
      const name = r.productName || 'Unknown';
      if (!productMap[name]) productMap[name] = { productName: name, totalQty: 0, totalValueCIF: 0, totalValueDPC: 0 };
      productMap[name].totalQty      += r.qty;
      productMap[name].totalValueCIF += r.qty * r.unitCIF;
      productMap[name].totalValueDPC += r.qty * r.unitDPC;
    });

    res.status(200).json({
      success: true,
      summary: {
        totalQty,
        totalValueCIF: parseFloat(totalValueCIF.toFixed(2)),
        totalValueDPC: parseFloat(totalValueDPC.toFixed(2)),
      },
      rows: allRows.map(r => ({
        locationType: r.locationType,
        locationId:   (r.locationName || '').toLowerCase().replace(/\s+/g, '_'),
        locationName: r.locationName,
        productName:  r.productName,
        qty:          r.qty,
        unitCIF:      parseFloat((r.unitCIF || 0).toFixed(2)),
        unitDPC:      parseFloat((r.unitDPC || 0).toFixed(2)),
      })),
      locations: Object.values(locationMap).map(l => ({
        ...l,
        totalValueCIF: parseFloat(l.totalValueCIF.toFixed(2)),
        totalValueDPC: parseFloat(l.totalValueDPC.toFixed(2)),
      })).sort((a, b) => b.totalValueDPC - a.totalValueDPC),
      products: Object.values(productMap).map(p => ({
        ...p,
        totalValueCIF: parseFloat(p.totalValueCIF.toFixed(2)),
        totalValueDPC: parseFloat(p.totalValueDPC.toFixed(2)),
      })).sort((a, b) => b.totalValueDPC - a.totalValueDPC),
    });
  } catch (err) {
    console.error('Valuation error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}

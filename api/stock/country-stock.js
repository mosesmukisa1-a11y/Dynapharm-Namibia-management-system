import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const [countryRows, allBalances] = await Promise.all([
      getMany(
        `SELECT product_name, batch_no, expiry_date,
                closing_qty, inward_qty, outward_qty,
                unit_dp, stock_value_dp, last_movement_date
         FROM inventory_balances
         WHERE location_type = 'country'
           AND location_id = 'country_stock'
           AND closing_qty > 0
         ORDER BY product_name ASC, expiry_date ASC NULLS LAST`
      ),
      getMany(
        `SELECT location_type, location_id, product_name, batch_no,
                closing_qty, unit_dp, stock_value_dp
         FROM inventory_balances
         WHERE location_type IN ('country', 'warehouse', 'branch')
           AND closing_qty > 0
         ORDER BY location_type, location_id, product_name`
      ),
    ]);

    const distinctProducts = new Set(countryRows.map(r => r.product_name)).size;
    const totalUnits = countryRows.reduce((s, r) => s + Number(r.closing_qty || 0), 0);
    const stockValueDP = countryRows.reduce((s, r) => s + Number(r.stock_value_dp || 0), 0);
    const lowStockItems = countryRows.filter(r => Number(r.closing_qty || 0) < 10).length;

    const items = countryRows.map(r => ({
      productName: r.product_name,
      batchNo: r.batch_no || '',
      expiryDate: r.expiry_date,
      closingQty: Number(r.closing_qty || 0),
      inwardQty: Number(r.inward_qty || 0),
      outwardQty: Number(r.outward_qty || 0),
      unitDP: Number(r.unit_dp || 0),
      stockValueDP: Number(r.stock_value_dp || 0),
      lastMovementDate: r.last_movement_date,
    }));

    const locationBreakdown = {};
    for (const row of allBalances) {
      const key = `${row.location_type}||${row.location_id}`;
      if (!locationBreakdown[key]) {
        locationBreakdown[key] = {
          locationType: row.location_type,
          locationId: row.location_id,
          products: [],
          totalUnits: 0,
        };
      }
      locationBreakdown[key].products.push({
        productName: row.product_name,
        batchNo: row.batch_no || '',
        closingQty: Number(row.closing_qty || 0),
        unitDP: Number(row.unit_dp || 0),
        stockValueDP: Number(row.stock_value_dp || 0),
      });
      locationBreakdown[key].totalUnits += Number(row.closing_qty || 0);
    }

    const locationBreakdownList = Object.values(locationBreakdown).sort((a, b) => {
      const order = { country: 0, warehouse: 1, branch: 2 };
      if (order[a.locationType] !== order[b.locationType]) return order[a.locationType] - order[b.locationType];
      return a.locationId.localeCompare(b.locationId);
    });

    res.status(200).json({
      success: true,
      summary: {
        distinctProducts,
        totalUnits,
        stockValueDP: parseFloat(stockValueDP.toFixed(2)),
        lowStockItems,
      },
      items,
      locationBreakdown: locationBreakdownList,
    });
  } catch (err) {
    console.error('Country stock error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}

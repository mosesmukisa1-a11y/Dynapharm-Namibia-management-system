import { applyAuthCors } from '../_lib/auth.js';
import { getMany } from '../db.js';

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

    const [batches, branchInv] = await Promise.all([
      getMany("SELECT id, description, batch_no, barcode, location, remaining_quantity, quantity, cif_unit_cost, dpc_unit_value, unit_price, expiry_date, import_date FROM stock_batches WHERE location != 'country_stock' AND remaining_quantity > 0 AND COALESCE(status,'') != 'expired' ORDER BY location, description"),
      getMany("SELECT location_id, product_name, batch_no, opening_qty, inward_qty, outward_qty, closing_qty, unit_dp, stock_value_dp, expiry_date, updated_at FROM inventory_balances WHERE location_type = 'branch' ORDER BY location_id, product_name"),
    ]);

    let items = [
      ...batches.map(b => ({
        locationType: 'warehouse',
        locationId: b.location,
        locationName: (b.location || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        productId: b.id,
        productName: b.description,
        batchNo: b.batch_no || b.barcode,
        expiryDate: b.expiry_date,
        openingQty: 0,
        inwardQty: 0,
        outwardQty: 0,
        closingQty: Number(b.remaining_quantity || b.quantity || 0),
        unitDPC: Number(b.dpc_unit_value || b.unit_price || 0),
        unitCIF: Number(b.cif_unit_cost || b.unit_price || 0),
        stockValueDPC: Number(b.remaining_quantity || b.quantity || 0) * Number(b.dpc_unit_value || b.unit_price || 0),
        lastMovementAt: b.import_date,
      })),
      ...branchInv.map(b => ({
        locationType: 'branch',
        locationId: b.location_id,
        locationName: (b.location_id || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        productId: null,
        productName: b.product_name,
        batchNo: b.batch_no,
        expiryDate: b.expiry_date,
        openingQty: Number(b.opening_qty || 0),
        inwardQty: Number(b.inward_qty || 0),
        outwardQty: Number(b.outward_qty || 0),
        closingQty: Number(b.closing_qty || 0),
        unitDPC: Number(b.unit_dp || 0),
        unitCIF: 0,
        stockValueDPC: Number(b.stock_value_dp || 0),
        lastMovementAt: b.updated_at,
      })),
    ];

    if (locationType) items = items.filter(i => i.locationType === locationType);
    if (locationId) items = items.filter(i => i.locationId === locationId || (i.locationId || '').includes(locationId));
    if (search) items = items.filter(i => (i.productName || '').toLowerCase().includes(search.toLowerCase()));
    if (batchNoFilter) items = items.filter(i => (i.batchNo || '').toLowerCase().includes(batchNoFilter.toLowerCase()));

    const totalQty = items.reduce((s, i) => s + i.closingQty, 0);
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
    console.error('Inventory error:', err);
    if (!res.headersSent) res.status(500).json({ success: false, error: err.message });
  }
}

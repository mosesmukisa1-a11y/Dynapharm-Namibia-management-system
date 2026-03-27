import { applyAuthCors } from './_lib/auth.js';
import { query, getMany, getOne, insert, update, remove } from './db.js';
import { postStockMovement } from './services/stockEngine.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const searchParams = url.searchParams;

    if (req.method === 'GET') {
      const id = searchParams.get('id');
      if (id) {
        const row = await getOne('SELECT * FROM supplier_imports WHERE id = $1', [id]);
        if (!row) return res.status(404).json({ error: 'Import not found' });
        return res.json(row);
      }
      const warehouse = searchParams.get('warehouse');
      const supplier = searchParams.get('supplier');
      const product = searchParams.get('product');
      const limit = Number(searchParams.get('limit')) || 500;

      let sql = 'SELECT * FROM supplier_imports';
      const conditions = [];
      const params = [];

      if (warehouse) {
        params.push(warehouse);
        conditions.push(`destination_warehouse = $${params.length}`);
      }
      if (supplier) {
        params.push(`%${supplier}%`);
        conditions.push(`supplier_name ILIKE $${params.length}`);
      }
      if (product) {
        params.push(`%${product}%`);
        conditions.push(`product_name ILIKE $${params.length}`);
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
      sql += ' ORDER BY created_at DESC';
      params.push(limit);
      sql += ` LIMIT $${params.length}`;

      const rows = await getMany(sql, params);
      return res.json(rows);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const id = `IMP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const qty = Number(body.quantity || 0);
      const cifUnit = Number(body.cif_unit_cost || body.cifUnitCost || 0);
      const dpcUnit = Number(body.dpc_unit_value || body.dpcUnitValue || 0);

      const importRecord = await query(
        `INSERT INTO supplier_imports
          (id, supplier_name, import_reference, grn_number, invoice_number, shipment_reference,
           product_name, product_description, product_id, quantity, batch_no, expiry_date,
           cif_unit_cost, cif_total_value, dpc_unit_value, dpc_total_value,
           date_received, destination_warehouse, origin_country, notes, status, created_by, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
         RETURNING *`,
        [
          id,
          body.supplier_name || body.supplierName || 'Unknown Supplier',
          body.import_reference || body.importReference || null,
          body.grn_number || body.grnNumber || null,
          body.invoice_number || body.invoiceNumber || null,
          body.shipment_reference || body.shipmentReference || null,
          body.product_name || body.productName || '',
          body.product_description || body.productDescription || null,
          body.product_id || body.productId || null,
          qty,
          body.batch_no || body.batchNo || null,
          body.expiry_date || body.expiryDate || null,
          cifUnit,
          cifUnit * qty,
          dpcUnit,
          dpcUnit * qty,
          body.date_received || body.dateReceived || new Date().toISOString(),
          'country_stock',
          body.origin_country || body.originCountry || 'Malaysia',
          body.notes || null,
          'received',
          body.created_by || body.createdBy || null,
          body.metadata ? JSON.stringify(body.metadata) : null,
        ]
      );

      const batchId = `BATCH-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const barcode = `BC-${body.batch_no || 'NB'}-${Date.now().toString(36).toUpperCase()}`;
      await query(
        `INSERT INTO stock_batches
          (id, barcode, description, batch_no, expiry_date, quantity, remaining_quantity,
           dispatched_quantity, import_date, location, status, product_id, warehouse_id,
           cif_unit_cost, cif_total_value, dpc_unit_value, dpc_total_value,
           supplier_name, import_reference, supplier_import_id, metadata, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9,'available',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),NOW())
         ON CONFLICT DO NOTHING`,
        [
          batchId, barcode,
          body.product_name || body.productName || '',
          body.batch_no || body.batchNo || null,
          body.expiry_date || body.expiryDate || null,
          qty, qty,
          body.date_received || body.dateReceived || new Date().toISOString(),
          'country_stock',
          body.product_id || body.productId || body.product_name || body.productName || '',
          null,
          cifUnit, cifUnit * qty, dpcUnit, dpcUnit * qty,
          body.supplier_name || body.supplierName || 'Unknown',
          body.import_reference || body.importReference || null,
          id,
          JSON.stringify({ supplier_import_id: id }),
        ]
      );

      const productName = body.product_name || body.productName || '';
      const batchNo = body.batch_no || body.batchNo || null;
      const expiryDate = body.expiry_date || body.expiryDate || null;
      const createdBy = body.created_by || body.createdBy || null;
      const supplierNote = `Supplier import from ${body.supplier_name || body.supplierName || 'Unknown'} — GRN: ${body.grn_number || body.grnNumber || 'N/A'}`;

      if (productName && qty > 0) {
        await postStockMovement({
          productName,
          batchNo,
          expiryDate,
          quantity: qty,
          movementType: 'supplier_import_receipt',
          sourceLocation: body.origin_country || 'Malaysia',
          sourceLocationType: 'supplier',
          destinationLocation: 'country_stock',
          destinationLocationType: 'country',
          referenceId: id,
          notes: supplierNote,
          unitDP: dpcUnit || null,
          createdBy,
        });
      }

      return res.status(201).json(importRecord.rows[0]);
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const id = body.id || searchParams.get('id');
      if (!id) return res.status(400).json({ error: 'id is required' });

      const updatePayload = { ...body };
      delete updatePayload.id;

      if (updatePayload.supplierName !== undefined) { updatePayload.supplier_name = updatePayload.supplierName; delete updatePayload.supplierName; }
      if (updatePayload.importReference !== undefined) { updatePayload.import_reference = updatePayload.importReference; delete updatePayload.importReference; }
      if (updatePayload.grnNumber !== undefined) { updatePayload.grn_number = updatePayload.grnNumber; delete updatePayload.grnNumber; }
      if (updatePayload.invoiceNumber !== undefined) { updatePayload.invoice_number = updatePayload.invoiceNumber; delete updatePayload.invoiceNumber; }
      if (updatePayload.productName !== undefined) { updatePayload.product_name = updatePayload.productName; delete updatePayload.productName; }
      if (updatePayload.productDescription !== undefined) { updatePayload.product_description = updatePayload.productDescription; delete updatePayload.productDescription; }
      if (updatePayload.batchNo !== undefined) { updatePayload.batch_no = updatePayload.batchNo; delete updatePayload.batchNo; }
      if (updatePayload.expiryDate !== undefined) { updatePayload.expiry_date = updatePayload.expiryDate; delete updatePayload.expiryDate; }
      if (updatePayload.cifUnitCost !== undefined) { updatePayload.cif_unit_cost = updatePayload.cifUnitCost; delete updatePayload.cifUnitCost; }
      if (updatePayload.dpcUnitValue !== undefined) { updatePayload.dpc_unit_value = updatePayload.dpcUnitValue; delete updatePayload.dpcUnitValue; }
      if (updatePayload.dateReceived !== undefined) { updatePayload.date_received = updatePayload.dateReceived; delete updatePayload.dateReceived; }
      if (updatePayload.destinationWarehouse !== undefined) { updatePayload.destination_warehouse = updatePayload.destinationWarehouse; delete updatePayload.destinationWarehouse; }
      if (updatePayload.metadata && typeof updatePayload.metadata === 'object') { updatePayload.metadata = JSON.stringify(updatePayload.metadata); }

      const result = await update('supplier_imports', id, updatePayload, 'id');
      return res.json(result);
    }

    if (req.method === 'DELETE') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const id = body.id || searchParams.get('id');
      if (!id) return res.status(400).json({ error: 'id is required' });
      await remove('supplier_imports', id, 'id');
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Supplier imports API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

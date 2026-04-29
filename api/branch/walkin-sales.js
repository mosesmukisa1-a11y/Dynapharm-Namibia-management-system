import { applyAuthCors, getBranchScope } from '../_lib/auth.js';
import { query, getMany, getOne, withTransaction } from '../db.js';
import { recomputeLocationBalances } from '../services/stockEngine.js';
import { postActivityRecord, generateBatId } from '../_lib/activityCapture.js';
import { getPackageComponents } from '../_lib/packageDefinitions.js';

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body;
  }

  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function generateSaleId(prefix = 'WALK') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function normalizeSaleRow(row) {
  if (!row) return null;

  const data = safeJsonParse(row.data, {});
  const items = safeJsonParse(row.items, data.products || []);
  const metadata = safeJsonParse(row.metadata, data.metadata || null);

  const saleDate = row.sale_date instanceof Date ? row.sale_date.toISOString() : row.sale_date || data.timestamp;
  const subtotal = Number(row.subtotal ?? data.subtotal ?? data.total ?? 0);
  const total = Number(row.total ?? data.total ?? data.totalAmount ?? subtotal);
  const totalBV = Number(row.total_bv ?? data.totalBV ?? 0);
  const tax = Number(row.tax ?? data.tax ?? 0);
  const discount = Number(row.discount ?? data.discount ?? 0);

  const createdAtVal = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at || data.createdAt || null;
  const timestampVal = saleDate ? new Date(saleDate).toISOString() : new Date().toISOString();
  const branchVal = row.branch_id || data.branch || data.branchId || null;

  const base = {
    id: row.id || data.id || generateSaleId(),
    saleNumber: row.sale_number || data.saleNumber || row.id || data.id,
    timestamp: timestampVal,
    branch: branchVal,
    branchId: branchVal,
    branch_id: branchVal,
    customerName: row.customer_name || data.customerName || '',
    customer_name: row.customer_name || data.customerName || '',
    phone: row.customer_phone || data.phone || data.customerPhone || '',
    email: row.customer_email || data.email || data.customerEmail || '',
    customerType: row.customer_type || data.customerType || 'customer',
    paymentMethod: row.payment_method || data.paymentMethod || 'cash',
    payment_method: row.payment_method || data.paymentMethod || 'cash',
    subtotal,
    discount,
    tax,
    total,
    totalAmount: total,
    totalBV,
    bv: totalBV,
    status: row.status || data.status || 'completed',
    products: Array.isArray(items) ? items : [],
    distributorReferral: data.distributorReferral || metadata?.distributorReferral || null,
    referral_nb: row.referral_nb || data.referral_nb || data.referralNB || data.distributorReferral?.nb_number || null,
    distributor_nb: row.distributor_nb || data.distributor_nb || data.distributorNB || null,
    clientId: data.clientId || data.client_id || null,
    clientReferenceNumber: data.clientReferenceNumber || data.client_reference_number || null,
    soldBy: data.soldBy || row.created_by || null,
    createdAt: createdAtVal,
    created_at: createdAtVal,
    updatedAt:
      row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at || data.updatedAt || null,
    metadata: metadata || null,
  };

  return {
    ...data,
    ...base,
    total,
    subtotal,
    tax,
    discount,
    totalBV,
    products: base.products,
    timestamp: base.timestamp,
  };
}

function buildSaleRecord(payload, existing = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Sale payload is required');
  }

  const id = payload.id || existing.id || generateSaleId();
  const branchId = payload.branch || payload.branchId || payload.branch_id || existing.branch_id || 'main';

  const saleDate =
    parseDate(payload.timestamp || payload.saleDate) ||
    existing.sale_date ||
    new Date().toISOString();

  const subtotal = Number(payload.subtotal ?? payload.total ?? existing.subtotal ?? 0);
  const total = Number(payload.total ?? payload.totalAmount ?? subtotal);
  const totalBV = Number(payload.totalBV ?? existing.total_bv ?? 0);
  const tax = Number(payload.tax ?? existing.tax ?? 0);
  const discount = Number(payload.discount ?? existing.discount ?? 0);
  const payment = payload.paymentMethod || existing.payment_method || 'cash';

  const products = Array.isArray(payload.products) ? payload.products : Array.isArray(payload.items) ? payload.items : [];

  return {
    id,
    branch_id: branchId,
    sale_number: payload.saleNumber || existing.sale_number || id,
    sale_date: saleDate,
    customer_name: payload.customerName || existing.customer_name || null,
    customer_phone: payload.phone || payload.customerPhone || existing.customer_phone || null,
    customer_email: payload.email || payload.customerEmail || existing.customer_email || null,
    customer_type: payload.customerType || payload.customer_type || existing.customer_type || 'customer',
    payment_method: payment,
    subtotal,
    discount,
    tax,
    total,
    total_bv: totalBV,
    status: payload.status || existing.status || 'completed',
    items: JSON.stringify(products),
    data: JSON.stringify({ ...payload, id }),
    referral_nb: (
      payload.referral_nb ||
      payload.referralNB ||
      payload.distributorReferral?.nb_number ||
      existing.referral_nb ||
      null
    ),
    distributor_nb: (
      payload.distributor_nb ||
      payload.distributorNB ||
      payload.distributor_nb_number ||
      existing.distributor_nb ||
      null
    ),
    metadata: JSON.stringify({
      distributorReferral: payload.distributorReferral || null,
      referralId:
        payload.distributorReferral?.id ||
        payload.referralId ||
        existing.metadata?.referralId ||
        null,
      referralName:
        payload.distributorReferral?.name ||
        payload.referralName ||
        existing.metadata?.referralName ||
        null,
      notes: payload.notes || existing.metadata?.notes || null,
    }),
    created_by: payload.soldBy || existing.created_by || null,
    updated_at: new Date().toISOString(),
    offline_id: payload.offline_id || existing.offline_id || null,
  };
}

function buildSelectQuery(searchParams, scopedBranches, enforced) {
  const conditions = [];
  const params = [];

  if (enforced) {
    params.push(scopedBranches);
    conditions.push(`branch_id = ANY($${params.length})`);
  } else {
    const branch = searchParams.get('branch');
    if (branch) {
      params.push(branch);
      conditions.push(`branch_id = $${params.length}`);
    }
  }

  const from = searchParams.get('from');
  if (from) {
    const fromDate = parseDate(from);
    if (fromDate) {
      params.push(fromDate);
      conditions.push(`sale_date >= $${params.length}`);
    }
  }

  const to = searchParams.get('to');
  if (to) {
    const toDate = parseDate(to);
    if (toDate) {
      params.push(toDate);
      conditions.push(`sale_date <= $${params.length}`);
    }
  }

  const search = searchParams.get('search');
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(`LOWER(customer_name) LIKE $${params.length}`);
  }

  const distributorNb = searchParams.get('distributor_nb') || searchParams.get('referral_nb');
  if (distributorNb) {
    const nbUpper = distributorNb.toUpperCase();
    params.push(nbUpper);
    conditions.push(`(UPPER(referral_nb) = $${params.length} OR UPPER(distributor_nb) = $${params.length})`);
  }

  const hasDateFilter = searchParams.get('from') || searchParams.get('to');
  const limitParam = parseInt(searchParams.get('limit') || '0', 10);
  const effectiveLimit = limitParam > 0 ? limitParam : hasDateFilter ? 5000 : 250;

  let queryText = 'SELECT * FROM branch_walkin_sales';
  if (conditions.length > 0) {
    queryText += ` WHERE ${conditions.join(' AND ')}`;
  }
  params.push(effectiveLimit);
  queryText += ` ORDER BY sale_date DESC, created_at DESC LIMIT $${params.length}`;

  return { queryText, params };
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const searchParams = url.searchParams;
  const id = searchParams.get('id');
  const branchScope = getBranchScope(req.user);

  try {
    if (req.method === 'GET') {
      if (id) {
        let row = await getOne('SELECT * FROM branch_walkin_sales WHERE id = $1', [id]);
        if (!row) {
          return res.status(404).json({ success: false, error: 'Sale not found' });
        }
        if (branchScope.enforced && !branchScope.branches.includes(row.branch_id)) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
        return res.status(200).json({ success: true, sale: normalizeSaleRow(row) });
      }

      const { queryText, params } = buildSelectQuery(searchParams, branchScope.branches, branchScope.enforced);
      const rows = await getMany(queryText, params);
      return res.status(200).json({
        success: true,
        sales: rows.map(normalizeSaleRow).filter(Boolean),
      });
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const salePayload = body.sale || body;

      if (salePayload.offline_id) {
        const dup = await getOne('SELECT id FROM branch_walkin_sales WHERE offline_id = $1', [salePayload.offline_id]);
        if (dup) {
          const existing = await getOne('SELECT * FROM branch_walkin_sales WHERE id = $1', [dup.id]);
          return res.status(200).json({ success: true, sale: normalizeSaleRow(existing), duplicate: true });
        }
      }

      const record = buildSaleRecord(salePayload);

      if (branchScope.enforced && !branchScope.branches.includes(record.branch_id)) {
        return res.status(403).json({ success: false, error: 'Access denied: cannot create sales for this branch' });
      }

      const saleItems = Array.isArray(salePayload.items) ? salePayload.items : Array.isArray(salePayload.products) ? salePayload.products : [];
      const branchId = record.branch_id;
      const customerType = record.customer_type || 'customer';
      const saleMovType = customerType === 'member' ? 'walk_in_member_sale' : customerType === 'non_member' ? 'walk_in_non_member_sale' : 'sale';

      const deductItems = [];
      const isMemberSale = (record.customer_type === 'member');

      const livePriceRows = await getMany(`SELECT description, dp, cp, bv, cif FROM product_prices`);
      const livePriceMap = {};
      for (const row of livePriceRows) {
        if (row.description) livePriceMap[row.description.toLowerCase()] = row;
      }

      for (const item of saleItems) {
        const qty = Number(item.quantity || item.qty || 0);
        const unitPrice = Number(item.unit_price || item.unitPrice || item.dpPrice || item.dp || 0);
        const itemName = item.product_name || item.name || item.description || '';
        const pkg = getPackageComponents(itemName);
        if (pkg) {
          for (const comp of pkg.products) {
            const livePrice = livePriceMap[comp.name.toLowerCase()];
            const dp = livePrice ? Number(livePrice.dp) || comp.dp : comp.dp;
            const cp = livePrice ? Number(livePrice.cp) || comp.cp : comp.cp;
            deductItems.push({
              name: comp.name,
              qty: Math.round(Number(comp.quantity || 1) * qty),
              unitPrice: isMemberSale ? dp : cp,
            });
          }
        } else if (Array.isArray(item.components) && item.components.length > 0) {
          for (const comp of item.components) {
            const compPrice = isMemberSale
              ? Number(comp.dp || comp.unit_price || 0)
              : Number(comp.cp || comp.unit_price || comp.dp || 0);
            deductItems.push({
              name: comp.name || comp.product_name || '',
              qty: Math.round(Number(comp.quantity || comp.qty || 1) * qty),
              unitPrice: compPrice,
            });
          }
        } else {
          deductItems.push({ name: itemName, qty, unitPrice });
        }
      }

      let insertedRow;
      try {
        insertedRow = await withTransaction(async (client) => {
          const columns = Object.keys(record);
          const values = Object.values(record);
          const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(', ');
          const columnNames = columns.map((col) => `"${col}"`).join(', ');

          const result = await client.query(
            `INSERT INTO branch_walkin_sales (${columnNames}) VALUES (${placeholders}) RETURNING *`,
            values,
          );
          const saleId = result.rows[0].id;

          const insufficientItems = [];
          for (const item of deductItems) {
            if (!item.name || item.qty <= 0 || !branchId) continue;
            let remaining = item.qty;
            const batches = (await client.query(
              `SELECT id, product_name, batch_no, expiry_date, quantity FROM branch_inventory_batches
               WHERE branch_id = $1 AND LOWER(TRIM(product_name)) = LOWER(TRIM($2)) AND quantity > 0
               ORDER BY expiry_date ASC NULLS LAST
               FOR UPDATE`,
              [branchId, item.name]
            )).rows;
            for (const batch of batches) {
              if (remaining <= 0) break;
              const take = Math.round(Math.min(remaining, Number(batch.quantity)));
              await client.query(
                `UPDATE branch_inventory_batches SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`,
                [take, batch.id]
              );
              const ts = Date.now();
              const bimId = 'BIM-' + ts + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
              await client.query(
                `INSERT INTO branch_inventory_movements (id, branch_id, type, product_name, batch_no, quantity, unit_price, reference, notes, created_by, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
                [bimId, branchId, saleMovType, batch.product_name, batch.batch_no || '', take, item.unitPrice || null, saleId, 'Walk-in ' + customerType + ' sale', record.created_by || '']
              );
              const smId = 'MOV-' + ts + '-' + Math.random().toString(36).slice(2, 6);
              await client.query(
                `INSERT INTO stock_movements
                   (id, product_name, batch_no, expiry_date, quantity, movement_type,
                    source_location, source_location_type, destination_location, destination_location_type,
                    reference_id, notes, status, unit_dp, movement_date, created_at, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,'branch','customer',NULL,$8,$9,'posted',$10,NOW(),NOW(),NOW())`,
                [smId, batch.product_name, batch.batch_no || '', batch.expiry_date || null,
                 take, saleMovType, branchId, saleId, 'Walk-in ' + customerType + ' sale', item.unitPrice || null]
              );
              remaining -= take;
            }
            if (remaining > 0) {
              insufficientItems.push({ product_name: item.name, requested: item.qty, available: item.qty - remaining, short: remaining });
            }
          }

          if (insufficientItems.length > 0) {
            throw new Error(`Insufficient stock for: ${insufficientItems.map(i => `${i.product_name} (need ${i.requested}, have ${i.available})`).join(', ')}`);
          }

          return result.rows[0];
        });
      } catch (txErr) {
        console.error('Walk-in sale transaction error:', txErr.message);
        if (txErr.message?.startsWith('Insufficient stock')) {
          return res.status(409).json({ success: false, error: txErr.message });
        }
        return res.status(500).json({ success: false, error: txErr.message || 'Failed to record sale' });
      }

      recomputeLocationBalances('branch', branchId).catch(e =>
        console.error('[stockEngine] walkin-sale recompute error:', e.message)
      );

      const actType = record.customer_type === 'member' ? 'member_sale'
        : record.customer_type === 'non_member' ? 'non_member_sale'
        : record.customer_type === 'prescription' ? 'prescription_dispensing'
        : record.customer_type === 'consultation' ? 'consultation'
        : 'non_member_sale'; // default non-tagged walk-in to non_member_sale so it shows in Walk-in column
      const totalQty = saleItems.reduce((s, i) => s + Number(i.quantity || i.qty || 0), 0);
      const dpSubtotal = saleItems.reduce((s, i) => s + (Number(i.dpPrice || i.dp || 0) * Number(i.quantity || i.qty || 0)), 0);
      postActivityRecord({
        id: generateBatId(),
        branch_id: record.branch_id,
        branch_name: record.branch_id,
        client_name: record.customer_name || 'Walk-in',
        client_phone: record.customer_phone || null,
        client_type: record.customer_type || 'walk_in',
        nb_number: JSON.parse(record.metadata || '{}').referralId || null,
        service_date: record.sale_date,
        service_time: record.sale_date ? new Date(record.sale_date).toTimeString().slice(0, 8) : null,
        activity_type: actType,
        workflow_source: 'branch_portal',
        form_reference_id: insertedRow.id,
        product_total_dp: dpSubtotal || record.total,
        product_total_cp: record.total,
        total_qty: totalQty,
        grand_total: record.total,
        payment_status: record.status === 'completed' ? 'paid' : 'pending',
        payment_method: record.payment_method || 'cash',
        stock_impact: true,
        stock_status: 'deducted',
        prescription_status: 'none',
        consultation_status: 'none',
        reporting_status: 'posted',
        captured_by: record.created_by || null,
      }).catch(e => console.error('[activityCapture] walkin-sale post error:', e.message));

      // Auto-record distributor profit for non-member sales
      if (record.customer_type !== 'member') {
        const meta = safeJsonParse(record.metadata, {});
        const referralNb = meta.referralId || record.referral_nb || 'NB005676';
        const referralName = meta.referralName || 'Dynapharm Namibia';
        const profitAmount = saleItems.reduce((s, i) => {
          const qty = Number(i.quantity || i.qty || 0);
          const itemName = (i.product_name || i.name || i.description || '').toLowerCase();
          const pkg = getPackageComponents(i.product_name || i.name || i.description || '');
          if (pkg) {
            const pkgProfit = pkg.products.reduce((ps, comp) => {
              const livePrice = livePriceMap[comp.name.toLowerCase()];
              const compDp = livePrice ? Number(livePrice.dp) || comp.dp : comp.dp;
              const compCp = livePrice ? Number(livePrice.cp) || comp.cp : comp.cp;
              const compQty = Math.round(Number(comp.quantity || 1) * qty);
              return ps + Math.max(0, (compCp - compDp) * compQty);
            }, 0);
            return s + pkgProfit;
          }
          let dp = Number(i.dpPrice || i.dp || 0);
          let cp = Number(i.cpPrice || i.cp || 0);
          if (!cp || !dp) {
            const livePrice = livePriceMap[itemName];
            if (livePrice) {
              if (!dp) dp = Number(livePrice.dp) || 0;
              if (!cp) cp = Number(livePrice.cp) || 0;
            }
          }
          return s + Math.max(0, (cp - dp) * qty);
        }, 0);
        if (profitAmount > 0) {
          const profitId = 'BDP-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
          query(
            `INSERT INTO branch_distributor_profit (id, branch_id, distributor_nb, distributor_name, sale_id, sale_receipt, sale_date, profit_amount, status, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',NOW(),NOW())`,
            [profitId, record.branch_id, referralNb, referralName, insertedRow.id, record.sale_number, record.sale_date, profitAmount]
          ).catch(e => console.error('[distributorProfit] insert error:', e.message));
        }
      }

      return res.status(201).json({
        success: true,
        sale: normalizeSaleRow(insertedRow),
      });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await parseJsonBody(req);
      const salePayload = body.sale || body;
      const targetId = salePayload.id || id;

      if (!targetId) {
        return res.status(400).json({ success: false, error: 'Sale id is required' });
      }

      const existing = await getOne('SELECT * FROM branch_walkin_sales WHERE id = $1', [targetId]);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Sale not found' });
      }

      if (branchScope.enforced && !branchScope.branches.includes(existing.branch_id)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const record = buildSaleRecord(salePayload, existing);
      if (branchScope.enforced) {
        record.branch_id = existing.branch_id;
      }
      const columns = Object.keys(record);
      const values = Object.values(record);
      const setClause = columns.map((col, idx) => `"${col}" = $${idx + 1}`).join(', ');

      const result = await query(
        `UPDATE branch_walkin_sales SET ${setClause} WHERE id = $${columns.length + 1} RETURNING *`,
        [...values, targetId],
      );

      return res.status(200).json({
        success: true,
        sale: normalizeSaleRow(result.rows[0]),
      });
    }

    if (req.method === 'DELETE') {
      const targetId = id;
      if (!targetId) {
        return res.status(400).json({ success: false, error: 'Sale id is required' });
      }

      if (branchScope.enforced) {
        const toDelete = await getOne('SELECT branch_id FROM branch_walkin_sales WHERE id = $1', [targetId]);
        if (toDelete && !branchScope.branches.includes(toDelete.branch_id)) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
      }

      const result = await query('DELETE FROM branch_walkin_sales WHERE id = $1 RETURNING *', [targetId]);
      if (result.rowCount === 0) {
        return res.status(404).json({ success: false, error: 'Sale not found' });
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Walk-in sales API error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

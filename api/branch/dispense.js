import { applyAuthCors } from '../_lib/auth.js';
import { query, getMany, getOne, withTransaction } from '../db.js';
import { recomputeLocationBalances } from '../services/stockEngine.js';
import { postActivityRecord, generateBatId } from '../_lib/activityCapture.js';
import { getPackageComponents } from '../_lib/packageDefinitions.js';

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const { reportId, branchId, items, createdBy, customerType, paymentMethod, patientName, consultationFee, consultMode, nbNumber, referralNb, dispenseType } = body;

      if (!reportId || !branchId || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'reportId, branchId, and items are required' });
      }

      const movType = 'prescription_dispense';
      const deductions = [];
      const insufficientItems = [];

      const livePriceRows = await getMany(`SELECT description, dp, cp, bv, cif FROM product_prices`);
      const livePriceMap = {};
      for (const row of livePriceRows) {
        if (row.description) livePriceMap[row.description.toLowerCase()] = row;
      }

      const resolvedItems = [];
      for (const item of items) {
        const productName = item.product_name || item.name || '';
        const qty = Number(item.quantity || 1);
        if (!productName || qty <= 0) continue;

        const pkg = getPackageComponents(productName);
        if (pkg) {
          const isMember = customerType === 'member';
          for (const comp of pkg.products) {
            const livePrice = livePriceMap[comp.name.toLowerCase()];
            const dp = livePrice ? Number(livePrice.dp) || comp.dp : comp.dp;
            const cp = livePrice ? Number(livePrice.cp) || comp.cp : comp.cp;
            const bv = livePrice ? Number(livePrice.bv) || 0 : 0;
            const cif = livePrice ? Number(livePrice.cif) || 0 : 0;
            resolvedItems.push({
              product_name: comp.name,
              quantity: Math.round(Number(comp.quantity || 1) * qty),
              unit_price: dp,                      // BIM stock valuation always uses DP (cost basis)
              charge_unit: isMember ? dp : cp,     // what the patient is actually charged
              bv_unit: bv,
              cif_unit: cif,
              from_package: productName,
            });
          }
        } else {
          const livePrice = livePriceMap[productName.toLowerCase()];
          const isMem = customerType === 'member';
          // DP = distributor / cost price; CP = consumer / selling price
          const dpPrice = livePrice ? Number(livePrice.dp) || 0 : 0;
          const cpPrice = livePrice ? Number(livePrice.cp) || 0 : 0;
          const passedDP = Number(item.dp || item.dp_price || 0);
          resolvedItems.push({
            product_name: productName,
            quantity: qty,
            unit_price: dpPrice || passedDP || null,           // BIM: stock valuation at DP
            charge_unit: isMem                                 // patient charge
              ? (dpPrice || passedDP || null)
              : (cpPrice || null),
            bv_unit: livePrice ? Number(livePrice.bv) || 0 : 0,
            cif_unit: livePrice ? Number(livePrice.cif) || 0 : 0,
            from_package: item.from_package || null,
          });
        }
      }

      await withTransaction(async (client) => {
        for (const item of resolvedItems) {
          const productName = item.product_name;
          const qty = item.quantity;
          const unitPrice = item.unit_price;   // DP (cost basis) — used in BIM / stock_movements
          const chargeUnit = item.charge_unit; // CP for non-members, DP for members — patient charge
          const fromPackage = item.from_package;
          if (!productName || qty <= 0) continue;

          const dispenseNote = fromPackage
            ? `Prescription dispense (individual from ${fromPackage})`
            : 'Prescription dispense';

          let remaining = qty;
          const batches = (await client.query(
            `SELECT id, product_name, batch_no, expiry_date, quantity FROM branch_inventory_batches
             WHERE branch_id = $1 AND LOWER(TRIM(product_name)) = LOWER(TRIM($2)) AND quantity > 0
             ORDER BY expiry_date ASC NULLS LAST
             FOR UPDATE`,
            [branchId, productName]
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
              [bimId, branchId, movType, batch.product_name, batch.batch_no || '', take, unitPrice, reportId, dispenseNote, createdBy || '']
            );

            const smId = 'MOV-' + ts + '-' + Math.random().toString(36).slice(2, 6);
            await client.query(
              `INSERT INTO stock_movements
                 (id, product_name, batch_no, expiry_date, quantity, movement_type,
                  source_location, source_location_type, destination_location, destination_location_type,
                  reference_id, notes, status, unit_dp, movement_date, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,'branch','patient',NULL,$8,$9,'posted',$10,NOW(),NOW(),NOW())`,
              [smId, batch.product_name, batch.batch_no || '', batch.expiry_date || null, take, movType, branchId, reportId, dispenseNote, unitPrice]
            );

            deductions.push({ product_name: batch.product_name, batch_no: batch.batch_no, quantity: take, unit_price: unitPrice, charge_unit: chargeUnit, bv_unit: item.bv_unit || 0, from_package: fromPackage });
            remaining -= take;
          }

          if (remaining > 0) {
            insufficientItems.push({ product_name: productName, requested: qty, available: qty - remaining, short: remaining });
          }
        }

        if (insufficientItems.length > 0) {
          throw new Error(`Insufficient stock for: ${insufficientItems.map(i => `${i.product_name} (need ${i.requested}, have ${i.available})`).join(', ')}`);
        }
      });

      recomputeLocationBalances('branch', branchId).catch(e =>
        console.error('[stockEngine] dispense recompute error:', e.message)
      );

      const totalDispensedQty = deductions.reduce((s, d) => s + Number(d.quantity || 0), 0);
      // DP total = stock cost basis (branch_inventory_movements.unit_price is always DP).
      const totalDispensedDP = parseFloat(deductions.reduce((s, d) => s + (Number(d.quantity || 0) * Number(d.unit_price || 0)), 0).toFixed(2));
      // Charge total = what the patient actually pays (CP for non-members, DP for members).
      const totalChargeToPatient = parseFloat(deductions.reduce((s, d) => s + (Number(d.quantity || 0) * Number(d.charge_unit != null ? d.charge_unit : (d.unit_price || 0))), 0).toFixed(2));
      const totalDispensedBV = deductions.reduce((s, d) => s + (Number(d.quantity || 0) * Number(d.bv_unit || 0)), 0);
      const now = new Date();
      const serviceDate = now.toISOString().slice(0, 10);
      const serviceTime = now.toTimeString().slice(0, 8);
      const pmNorm = (paymentMethod || 'cash').toLowerCase();

      try {
        await postActivityRecord({
          id: generateBatId(),
          branch_id: branchId,
          branch_name: branchId,
          client_name: patientName || 'Patient',
          client_type: customerType || 'patient',
          nb_number: customerType === 'member' ? (nbNumber || null) : null,
          referral_nb: customerType !== 'member' ? (referralNb || null) : null,
          service_date: serviceDate,
          service_time: serviceTime,
          activity_type: 'prescription_dispensing',
          workflow_source: 'branch_portal',
          form_reference_id: reportId,
          product_total_dp: totalDispensedDP,       // DP cost basis (stock valuation)
          product_total_cp: totalChargeToPatient,   // patient charge (CP for non-members, DP for members)
          total_qty: totalDispensedQty,
          total_bv: totalDispensedBV,
          grand_total: totalChargeToPatient,         // revenue received from patient
          payment_status: 'paid',
          payment_method: pmNorm,
          stock_impact: true,
          stock_status: 'deducted',
          // full_dispense = all prescribed medicines dispensed in this or a prior session.
          // partial_dispense = some medicines still pending after this session.
          // Falls back to 'dispensed' if caller did not supply dispenseType (older clients).
          prescription_status: dispenseType === 'full' ? 'full_dispense'
            : dispenseType === 'partial' ? 'partial_dispense'
            : 'dispensed',
          consultation_status: 'none',
          reporting_status: 'posted',
          captured_by: createdBy || null,
        });
      } catch (e) {
        console.error('[activityCapture] dispense post error:', e.message);
      }

      // ── Distributor profit: write to branch_distributor_profit for referred non-member Rx ──
      // The referring distributor earns CP - DP on each dispensed item.
      // Only written when there is an explicit referral NB number and the patient is not a member.
      const rxProfitAmount = parseFloat((totalChargeToPatient - totalDispensedDP).toFixed(2));
      if (customerType !== 'member' && referralNb && rxProfitAmount > 0) {
        try {
          const profitId = 'RXPROF-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
          await query(
            `INSERT INTO branch_distributor_profit
               (id, branch_id, distributor_nb, distributor_name, sale_id, sale_receipt, sale_date, profit_amount, status, created_at, updated_at)
             VALUES ($1, $2, $3, NULL, $4, $5, $6, $7, 'pending', NOW(), NOW())
             ON CONFLICT (id) DO NOTHING`,
            [profitId, branchId, referralNb, reportId, reportId, serviceDate, rxProfitAmount]
          );
        } catch (e) {
          console.error('[dispense] distributor profit insert error:', e.message);
        }
      }

      const feeAmount = Number(consultationFee || 0);
      if (feeAmount > 0) {
        try {
          await postActivityRecord({
            id: generateBatId(),
            branch_id: branchId,
            branch_name: branchId,
            client_name: patientName || 'Patient',
            client_type: customerType || 'patient',
            nb_number: customerType === 'member' ? (nbNumber || null) : null,
            referral_nb: customerType !== 'member' ? (referralNb || null) : null,
            service_date: serviceDate,
            service_time: serviceTime,
            activity_type: 'consultation',
            workflow_source: 'branch_portal',
            form_reference_id: reportId,
            consultation_fee: feeAmount,
            product_total_dp: 0,
            total_qty: 0,
            grand_total: feeAmount,
            payment_status: 'paid',
            payment_method: pmNorm,
            stock_impact: false,
            stock_status: 'none',
            prescription_status: 'dispensed',
            consultation_status: 'paid',
            reporting_status: 'posted',
            captured_by: createdBy || null,
          });
        } catch (e) {
          console.error('[activityCapture] consult fee post error:', e.message);
        }
      }

      return res.status(200).json({ success: true, deductions, message: `Dispensed ${deductions.length} batch(es) successfully` });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Dispense API error:', error);
    if (error.message?.startsWith('Insufficient stock')) {
      return res.status(409).json({ success: false, error: error.message });
    }
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
}

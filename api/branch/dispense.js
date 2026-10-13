import { recordBranchSaleAllocationTx } from '../services/stockSaleAllocations.js';
import { applyAuthCors } from '../_lib/auth.js';
import { authorizeBranchReturn } from '../services/linkedReversals.js';
import { atomicStockRequest } from '../_lib/atomicStockRequest.js';
import { assertActivePriceProducts } from '../services/priceImport.js';
import { query, getMany, getOne, withTransaction } from '../db.js';
import { branchSearchTerms, normalizeBranchSlug } from '../_lib/branchUtils.js';
import { recomputeLocationBalances } from '../services/stockEngine.js';
import { broadcastStockEvent } from '../services/stockEvents.js';
import { postActivityRecord, generateBatId } from '../_lib/activityCapture.js';
import { getPackageComponents } from '../_lib/packageDefinitions.js';
export const OFF_SYSTEM_ISSUE = Symbol('off-system-authorized-issue');

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const { reportId, branchId, items, createdBy, customerType, paymentMethod, patientName, consultationFee, consultMode, nbNumber, referralNb, dispenseType, campaignDiscounts } = body;
      // Normalise campaign discount map: productName (lower) → { pct }
      const campDiscMap = {};
      if (campaignDiscounts && typeof campaignDiscounts === 'object') {
        for (const [name, disc] of Object.entries(campaignDiscounts)) {
          const pct = Number(disc?.pct || 0);
          if (pct > 0) campDiscMap[name.toLowerCase()] = pct;
        }
      }

      if (!reportId || !branchId || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, error: 'reportId, branchId, and items are required' });
      }
      authorizeBranchReturn(req.user,branchId);
      await assertActivePriceProducts(items);

      const movType = 'prescription_dispense';
      const deductions = [];
      const insufficientItems = [];

      const livePriceRows = await getMany(`SELECT description, dp, cp, bv, cif FROM live_product_prices`);
      const livePriceMap = {};
      for (const row of livePriceRows) {
        if (row.description) livePriceMap[row.description.toLowerCase()] = row;
      }

      const resolvedItems = [];
      for (const item of items) {
        const productName = item.product_name || item.name || '';
        const qty = Number(item.quantity ?? 1);
        if (!productName || !Number.isSafeInteger(qty) || qty <= 0)
          throw Object.assign(new Error('Dispensing requires product names and positive whole base-unit quantities'),{statusCode:400});

        // Free items (buy-X-get-Y companion) bypass normal pricing and go out at zero charge.
        if (item.is_free || item.campaign_free) {
          const livePrice = livePriceMap[productName.toLowerCase()] || livePriceMap[productName.toLowerCase().trim()];
          resolvedItems.push({
            product_name: productName,
            quantity: qty,
            unit_price: livePrice ? Number(livePrice.dp) || 0 : 0,
            charge_unit: 0,
            bv_unit: 0,
            cif_unit: 0,
            from_package: null,
            is_free: true,
            campaign_bxgy: item.campaign_bxgy || null,
          });
          continue;
        }

        const pkg = getPackageComponents(productName);
        if (pkg) {
          const isMember = customerType === 'member';
          for (const comp of pkg.products) {
            const livePrice = livePriceMap[comp.name.toLowerCase()];
            const dp = livePrice ? Number(livePrice.dp) || comp.dp : comp.dp;
            const cp = livePrice ? Number(livePrice.cp) || comp.cp : comp.cp;
            const bv = livePrice ? Number(livePrice.bv) || 0 : 0;
            const cif = livePrice ? Number(livePrice.cif) || 0 : 0;
            const compDiscPct = campDiscMap[comp.name.toLowerCase()] || 0;
            const compDiscMult = compDiscPct > 0 ? (1 - compDiscPct / 100) : 1;
            const baseCharge = isMember ? dp : cp;
            resolvedItems.push({
              product_name: comp.name,
              quantity: Math.round(Number(comp.quantity || 1) * qty),
              unit_price: dp,                                                    // BIM stock valuation always uses DP (cost basis)
              charge_unit: Math.round(baseCharge * compDiscMult * 100) / 100,   // what the patient is actually charged (with discount)
              bv_unit: bv,
              cif_unit: cif,
              from_package: productName,
              is_free: false,
            });
          }
        } else {
          // Try exact name, then TRIM-normalised name (handles stray whitespace differences)
          const livePrice = livePriceMap[productName.toLowerCase()]
            || livePriceMap[productName.toLowerCase().trim()];
          const isMem = customerType === 'member';
          // DP = distributor / cost price; CP = consumer / selling price
          const dpPrice = livePrice ? Number(livePrice.dp) || 0 : 0;
          const cpPrice = livePrice ? Number(livePrice.cp) || 0 : 0;
          // Frontend now sends explicit dp/cp fields — use as fallback when live lookup fails
          const passedDP = Number(item.dp || item.dp_price || 0);
          const passedCP = Number(item.cp || item.cp_price || 0);
          const baseChargeUnit = isMem ? (dpPrice || passedDP || null) : (cpPrice || passedCP || null);
          const itemDiscPct = campDiscMap[productName.toLowerCase()] || 0;
          const itemDiscMult = itemDiscPct > 0 ? (1 - itemDiscPct / 100) : 1;
          resolvedItems.push({
            product_name: productName,
            quantity: qty,
            unit_price: dpPrice || passedDP || null,                                                   // BIM: stock valuation at DP
            charge_unit: baseChargeUnit != null ? Math.round(baseChargeUnit * itemDiscMult * 100) / 100 : null,  // patient charge with discount
            bv_unit: livePrice ? Number(livePrice.bv) || 0 : 0,
            cif_unit: livePrice ? Number(livePrice.cif) || 0 : 0,
            from_package: item.from_package || null,
            is_free: false,
          });
        }
      }

      // Resolve ALL alias forms once — covers hochland-park↔hochlandpark, etc.
      const dispenseBranchCandidates = branchSearchTerms(branchId);

      await withTransaction(async (client) => {
        const report=(await client.query('SELECT * FROM reports WHERE id=$1 FOR UPDATE',[reportId])).rows[0];
        if (!report) throw Object.assign(new Error('Prescription report not found'),{statusCode:404});
        const rptData=typeof report.data==='string'?JSON.parse(report.data):report.data || {};
        if(rptData.offSystemFulfilment && req[OFF_SYSTEM_ISSUE]!==true)
          throw Object.assign(new Error('Use assigned-branch pending fulfilment for this historical form'),{statusCode:409});
        const prescribed=new Map((rptData.medicines || []).map(m=>[String(m.name || m.product_name || '').toLowerCase().trim(),Number(m.quantity || 1)]));
        const prior=(await client.query(`SELECT a.product_name,SUM(a.quantity) AS quantity FROM stock_sale_allocations a
          JOIN stock_movements m ON m.id=a.movement_id
          WHERE a.sale_reference=$1 AND m.movement_type<>'campaign_free_item' GROUP BY a.product_name`,[reportId])).rows;
        const already=new Map(prior.map(row=>[row.product_name.toLowerCase().trim(),Number(row.quantity)]));
        const session=new Map();
        for (const item of resolvedItems) {
          if (item.is_free) continue;
          const key=item.product_name.toLowerCase().trim();
          session.set(key,(session.get(key)||0)+Number(item.quantity));
          // Original posted dispensing remains evidence even after a return.
          // Replacement dispensing requires a new prescription authorization.
          const prescribedName=String(item.from_package || item.product_name).toLowerCase().trim();
          const maximum=prescribed.get(key) ?? (item.from_package ? (getPackageComponents(item.from_package)?.products.find(p=>p.name.toLowerCase().trim()===key)?.quantity || 0)*(prescribed.get(prescribedName)||0) : null);
          if (maximum==null || (already.get(key)||0)+session.get(key)>maximum)
            throw Object.assign(new Error('Dispensing exceeds the unissued prescription quantity; posted issues cannot be replaced by editing the prescription'),{statusCode:409});
        }
        const freeClaims=new Map();
        for (const item of resolvedItems.filter(item=>item.is_free)) {
          const evidence=item.campaign_bxgy;
          const campaign=evidence?.campId ? (await client.query('SELECT * FROM campaigns WHERE id=$1 FOR SHARE',[evidence.campId])).rows[0] : null;
          const now=new Date();
          if (!campaign || campaign.campaign_type!=='buy_x_get_y' || campaign.is_active===false ||
            !['approved','active'].includes(campaign.status) ||
            now<new Date(campaign.start_date) || now>new Date(campaign.end_date))
            throw Object.assign(new Error('Free dispensing requires an active linked campaign and its paid items in the same issue'),{statusCode:409});
          const conditions=typeof campaign.conditions==='string'?JSON.parse(campaign.conditions):campaign.conditions || {};
          if (!['','nationwide','countrywide','all'].includes(String(campaign.scope || '').toLowerCase()) &&
            !(conditions.stock_assignments || []).some(assignment=>
              normalizeBranchSlug(assignment.branch)===normalizeBranchSlug(branchId)))
            throw Object.assign(new Error('The free-item campaign is not assigned to this branch'),{statusCode:403});
          const prize=typeof campaign.prize==='string'?JSON.parse(campaign.prize):campaign.prize || {};
          const paid=String(evidence.paidProduct || '').trim().toLowerCase();
          const eligible=(conditions.products_text || (Array.isArray(conditions.products)?conditions.products.join(','):''))
            .split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
          const freeProduct=String(prize.free_product || evidence.paidProduct || '').trim().toLowerCase();
          const buy=Number(conditions.buy_qty || 1),get=Number(conditions.get_qty || 1);
          const claimKey=`${campaign.id}:${paid}`;
          freeClaims.set(claimKey,(freeClaims.get(claimKey)||0)+Number(item.quantity));
          if ((eligible.length && !eligible.includes(paid)) || item.product_name.trim().toLowerCase()!==freeProduct ||
            !Number.isSafeInteger(buy) || buy<=0 || !Number.isSafeInteger(get) || get<=0 ||
            freeClaims.get(claimKey)>Math.floor((session.get(paid)||0)/buy)*get)
            throw Object.assign(new Error('Free dispensing exceeds this issue’s verified paid campaign entitlement'),{statusCode:409});
        }
        for (const item of resolvedItems) {
          const productName = item.product_name;
          const qty = item.quantity;
          const unitPrice = item.unit_price;   // DP (cost basis) — used in BIM / stock_movements
          const chargeUnit = item.charge_unit; // CP for non-members, DP for members — patient charge
          const fromPackage = item.from_package;
          const isFreeItem = !!item.is_free;
          if (!productName || qty <= 0) continue;

          // Free items use campaign_free_item movement type; regular dispense uses prescription_dispense.
          const itemMovType = isFreeItem ? 'campaign_free_item' : movType;
          const dispenseNote = isFreeItem
            ? 'Campaign free item (prescription dispensing)'
            : fromPackage
              ? `Prescription dispense (individual from ${fromPackage})`
              : 'Prescription dispense';

          let remaining = qty;
          const batches = (await client.query(
            `SELECT id, product_name, batch_no, expiry_date, quantity FROM branch_inventory_batches
             WHERE LOWER(REPLACE(branch_id, ' ', '_')) = ANY($1)
               AND LOWER(TRIM(product_name)) = LOWER(TRIM($2))
               AND quantity > 0
               AND COALESCE(status, 'in_stock') IN ('in_stock', 'available')
               AND (expiry_date IS NULL OR expiry_date >= (NOW() AT TIME ZONE 'Africa/Windhoek')::date)
             ORDER BY expiry_date ASC NULLS LAST
             FOR UPDATE`,
            [dispenseBranchCandidates, productName]
          )).rows;

          for (const batch of batches) {
            if (remaining <= 0) break;
            const take = Math.round(Math.min(remaining, Number(batch.quantity)));

            await client.query(
              `UPDATE branch_inventory_batches SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`,
              [take, batch.id]
            );
            // Remove zero-qty rows immediately so they cannot be resurrected as
            // ghost stock by a stale inventory_balances entry before recompute runs.
            // Retain zero-quantity batches for count cutoffs and return provenance.

            const ts = Date.now();
            const bimId = 'BIM-' + ts + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
            await client.query(
              `INSERT INTO branch_inventory_movements (id, branch_id, type, product_name, batch_no, quantity, unit_price, charge_unit, reference, notes, created_by, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
              [bimId, branchId, itemMovType, batch.product_name, batch.batch_no || '', take, unitPrice, chargeUnit, reportId, dispenseNote, createdBy || '']
            );

            const smId = 'MOV-' + ts + '-' + Math.random().toString(36).slice(2, 6);
            await client.query(
              `INSERT INTO stock_movements
                 (id, product_name, batch_no, expiry_date, quantity, movement_type,
                  source_location, source_location_type, destination_location, destination_location_type,
                  reference_id, notes, status, unit_dp, movement_date, created_at, updated_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,'branch','patient',NULL,$8,$9,'posted',$10,NOW(),NOW(),NOW())`,
              [smId, batch.product_name, batch.batch_no || '', batch.expiry_date || null, take, itemMovType, branchId, reportId, dispenseNote, unitPrice]
            );

            const actualCost=await recordBranchSaleAllocationTx(client,{movementId:smId,saleReference:reportId,batchId:batch.id,quantity:take,branchMovementId:bimId,revenueUnit:chargeUnit,bvUnit:customerType==='member'?item.bv_unit:0,financialDpUnit:unitPrice});
            deductions.push({ product_name: batch.product_name, batch_no: batch.batch_no, quantity: take, unit_price: actualCost.unit_dp, unit_cif:actualCost.unit_cost, missing_cost_quantity:actualCost.missing_cost_quantity, charge_unit: chargeUnit, bv_unit: item.bv_unit || 0, from_package: fromPackage, is_free: isFreeItem });
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

      // ── Update report medicines dispensed status ──────────────────────────
      // Build a map: product name (lower) → total qty dispensed in this session
      const dispensedQtyMap = {};
      for (const d of deductions) {
        if (d.is_free) continue;
        const k = (d.product_name || '').toLowerCase().trim();
        dispensedQtyMap[k] = (dispensedQtyMap[k] || 0) + Number(d.quantity || 0);
      }
      try {
        const rptRow = await query(`SELECT data FROM reports WHERE id = $1`, [reportId]);
        if (rptRow.rows.length > 0) {
          const rptData = (() => {
            try { return typeof rptRow.rows[0].data === 'string' ? JSON.parse(rptRow.rows[0].data) : (rptRow.rows[0].data || {}); } catch { return {}; }
          })();
          if (Array.isArray(rptData.medicines) && rptData.medicines.length > 0) {
            let changed = false;
            rptData.medicines = rptData.medicines.map(m => {
              const k = (m.name || '').toLowerCase().trim();
              const sessionQty = dispensedQtyMap[k];
              if (sessionQty === undefined) return m;
              const prevQty = Number(m.dispensed_qty || 0);
              const newQty = prevQty + sessionQty;
              const prescQty = Number(m.quantity || 1);
              changed = true;
              return { ...m, dispensed_qty: newQty, dispensed: newQty >= prescQty };
            });
            if (changed) {
              await query(
                `UPDATE reports SET data = $1::jsonb, updated_at = NOW() WHERE id = $2`,
                [JSON.stringify(rptData), reportId]
              );
            }
          }
        }
      } catch (e) {
        console.error('[dispense] report medicines update error:', e.message);
      }

      recomputeLocationBalances('branch', branchId).catch(e =>
        console.error('[stockEngine] dispense recompute error:', e.message)
      );

      // Push immediate SSE notification so every connected dashboard refreshes
      broadcastStockEvent('branch_dispense', { branchId });

      const totalDispensedQty = deductions.reduce((s, d) => s + Number(d.quantity || 0), 0);
      // DP total = stock cost basis (branch_inventory_movements.unit_price is always DP).
      const totalDispensedDP = parseFloat(deductions.reduce((s, d) => s + (Number(d.quantity || 0) * Number(d.unit_price || 0)), 0).toFixed(2));
      // Charge total = what the patient actually pays. Free campaign items are excluded (charge = 0).
      const totalChargeToPatient = parseFloat(deductions
        .filter(d => !d.is_free)
        .reduce((s, d) => s + (Number(d.quantity || 0) * Number(d.charge_unit != null ? d.charge_unit : (d.unit_price || 0))), 0).toFixed(2));
      const totalDispensedBV = deductions.filter(d => !d.is_free).reduce((s, d) => s + (Number(d.quantity || 0) * Number(d.bv_unit || 0)), 0);
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
          const distRow = await query(
            `SELECT distributor_name FROM distributors WHERE distributor_code = $1 LIMIT 1`,
            [referralNb]
          ).then(r => (r.rows || [])[0]).catch(() => null);
          const distName = distRow?.distributor_name || null;
          await query(
            `INSERT INTO branch_distributor_profit
               (id, branch_id, distributor_nb, distributor_name, sale_id, sale_receipt, sale_date, profit_amount, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW(), NOW())
             ON CONFLICT (id) DO NOTHING`,
            [profitId, branchId, referralNb, distName, reportId, reportId, serviceDate, rxProfitAmount]
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
    return res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Internal server error' });
  }
}
export default atomicStockRequest(handler);

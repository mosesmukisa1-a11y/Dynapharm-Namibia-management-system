import { recordBranchSaleAllocationTx } from '../services/stockSaleAllocations.js';
import { applyAuthCors, getBranchScope } from '../_lib/auth.js';
import { atomicStockRequest } from '../_lib/atomicStockRequest.js';
import { assertActivePriceProducts } from '../services/priceImport.js';
import { query, getOne, getMany, withTransaction } from '../db.js';
import { recomputeLocationBalances } from '../services/stockEngine.js';
import { postActivityRecord, generateBatId } from '../_lib/activityCapture.js';
import { authorizeBranchReturn } from '../services/linkedReversals.js';

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

function genId(prefix = 'CAMP') {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

// Normalise branch identifier the same way inventory.js does so that
// 'oshakati', 'oshakati_branch', 'Oshakati Branch', etc. all resolve
// to whichever value is actually stored in branch_inventory_batches.
async function resolveBranchId(raw) {
  if (!raw) return raw;
  const key = raw.toLowerCase().replace(/\s+/g, '_');
  const stripped = key.replace(/_branch$/, '');
  const candidates = [key];
  if (!key.endsWith('_branch')) candidates.push(key + '_branch');
  if (stripped !== key) candidates.push(stripped);
  if (key === 'katima_mulilo') candidates.push('katima');
  if (key === 'katima') candidates.push('katima_mulilo');

  // Exact match first
  const exact = await getOne(
    `SELECT branch_id FROM branch_inventory_batches WHERE branch_id = ANY($1) LIMIT 1`,
    [candidates]
  );
  if (exact) return exact.branch_id;

  // Case-insensitive / space-normalised fallback
  const ci = await getOne(
    `SELECT branch_id FROM branch_inventory_batches
     WHERE LOWER(REPLACE(branch_id, ' ', '_')) = ANY($1) LIMIT 1`,
    [candidates]
  );
  return ci ? ci.branch_id : key;
}

// Only locked physical batches are sellable. Cached balances cannot create stock.
export async function deductStock(client, branchId, productName, qty, movType, noteStr, saleId, unitPrice, createdBy, revenueUnit,bvUnit=0,financialDpUnit) {
  let remaining = qty;
  const deductions = [];

  // ── Primary path: branch_inventory_batches ──────────────────────────────
  const batches = (await client.query(
    `SELECT id, product_name, batch_no, expiry_date, quantity FROM branch_inventory_batches
     WHERE branch_id = $1 AND LOWER(TRIM(product_name)) = LOWER(TRIM($2)) AND quantity > 0
       AND COALESCE(status, 'in_stock') IN ('in_stock', 'available')
       AND (expiry_date IS NULL OR expiry_date >= (NOW() AT TIME ZONE 'Africa/Windhoek')::date)
     ORDER BY expiry_date ASC NULLS LAST
     FOR UPDATE`,
    [branchId, productName]
  )).rows;

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(batch.quantity));
    await client.query(
      `UPDATE branch_inventory_batches SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`,
      [take, batch.id]
    );
    // Keep depleted batch identity for open count cutoffs and inspected returns.
    const ts1  = Date.now();
    const bimId = 'BIM-' + ts1 + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    await client.query(
      `INSERT INTO branch_inventory_movements (id, branch_id, type, product_name, batch_no, quantity, unit_price, reference, notes, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      [bimId, branchId, movType, batch.product_name, batch.batch_no || '', take,
       unitPrice || null, saleId, noteStr, createdBy || '']
    );
    const smId1 = 'MOV-' + ts1 + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    await client.query(
      `INSERT INTO stock_movements
         (id, product_name, batch_no, expiry_date, quantity, movement_type,
          source_location, source_location_type, destination_location, destination_location_type,
          reference_id, notes, status, unit_dp, movement_date, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'branch','customer',NULL,$8,$9,'posted',$10,NOW(),NOW(),NOW())`,
      [smId1, batch.product_name, batch.batch_no || '', batch.expiry_date || null,
       take, movType, branchId, saleId, noteStr, unitPrice || null]
    );
    await recordBranchSaleAllocationTx(client,{movementId:smId1,saleReference:saleId,batchId:batch.id,quantity:take,branchMovementId:bimId,revenueUnit,bvUnit,financialDpUnit});
    deductions.push({ product_name: batch.product_name, batch_no: batch.batch_no, quantity: take, movement_type: movType });
    remaining -= take;
  }

  return { deductions, short: remaining };
}

async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });

  const branchScope = getBranchScope(req.user);

  try {
    if (req.method === 'POST') {
      const body = await parseJsonBody(req);

      const campaign_id    = body.campaign_id;
      const campaign_name  = body.campaign_name;
      const rawBranch      = body.branch || body.branch_id;
      const notes          = body.notes || '';
      const processed_by   = body.processed_by || body.created_by || '';

      // Customer identification — mirrors walk-in sales logic
      const customer_type  = body.customer_type || 'member';
      const isMember       = customer_type === 'member';
      const customer_name  = body.customer_name || body.distributor_name || '';
      const distributor_nb = isMember ? (body.nb_number || body.distributor_code || '') : null;
      const referral_nb    = !isMember ? (body.referral_nb || body.distributor_code || '') : null;

      if (!campaign_id || !rawBranch) {
        return res.status(400).json({ success: false, error: 'campaign_id and branch are required' });
      }

      if (isMember && !distributor_nb) {
        return res.status(400).json({ success: false, error: 'Member NB/DZ number is required for member campaign sales' });
      }

      if (branchScope.enforced && !branchScope.branches.includes(rawBranch)) {
        return res.status(403).json({ success: false, error: 'Access denied: cannot process sales for this branch' });
      }

      // Resolve branch ID to the exact value stored in branch_inventory_batches
      // (handles 'oshakati' vs 'oshakati_branch', capitalisation differences, etc.)
      const branch = await resolveBranchId(rawBranch);
      authorizeBranchReturn(req.user,branch);

      const campaign = await getOne(`SELECT * FROM campaigns WHERE id = $1`, [campaign_id]);
      if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
      const now = new Date();
      const isActive = campaign.status !== 'pending_approval' && campaign.status !== 'rejected'
        && now >= new Date(campaign.start_date) && now <= new Date(campaign.end_date);
      if (!isActive) {
        return res.status(400).json({ success: false, error: 'Campaign is not currently active' });
      }

      // Branch targeting enforcement
      const campScope = (campaign.scope || '').toLowerCase();
      const isGlobal = !campScope || campScope === 'nationwide' || campScope === 'countrywide' || campScope === 'all';
      if (!isGlobal) {
        const campCondRaw = typeof campaign.conditions === 'string'
          ? JSON.parse(campaign.conditions || '{}') : (campaign.conditions || {});
        const assignedBranches = Array.isArray(campCondRaw.stock_assignments)
          ? campCondRaw.stock_assignments.map(a => a.branch).filter(b => b && b !== 'all') : [];
        const targetBranches = Array.isArray(campaign.target_branches)
          ? campaign.target_branches.filter(b => b && b !== 'all')
          : (Array.isArray(campCondRaw.target_branches) ? campCondRaw.target_branches.filter(b => b && b !== 'all') : []);
        const allTargeted = [...new Set([...assignedBranches, ...targetBranches])];
        if (allTargeted.length > 0 && !allTargeted.includes(rawBranch) && !allTargeted.includes(branch)) {
          return res.status(403).json({ success: false, error: 'This campaign does not target the specified branch' });
        }
      }

      const saleId     = genId('CAMP');
      const saleNumber = saleId;
      const allDeductions = [];
      const insufficientItems = [];

      const campConditions = typeof campaign.conditions === 'string'
        ? JSON.parse(campaign.conditions || '{}') : (campaign.conditions || {});
      const campPrize = typeof campaign.prize === 'string'
        ? JSON.parse(campaign.prize || '{}') : (campaign.prize || {});

      let paid_product, paid_qty, free_product, free_qty;
      await assertActivePriceProducts(body.paid_items || (body.paid_product ? [{name:body.paid_product}] : []));

      if (body.paid_product) {
        paid_product = body.paid_product;
        paid_qty     = Number(body.paid_qty || 1);
        free_product = body.free_product || null;
      } else if (Array.isArray(body.paid_items)) {
        const first  = body.paid_items[0] || {};
        paid_product = first.product_name || first.name;
        paid_qty     = Number(first.quantity || first.qty || 1);
        const firstFree = (body.free_items || [])[0] || {};
        free_product = firstFree.product_name || firstFree.name || null;
      }

      if (!paid_product || !Number.isSafeInteger(paid_qty) || paid_qty <= 0) {
        return res.status(400).json({ success: false, error: 'paid_product and a positive paid_qty are required' });
      }

      if (campaign.campaign_type === 'buy_x_get_y') {
        const buyQty = Number(campConditions.buy_qty || 1);
        const getQty = Number(campConditions.get_qty || 1);
        if (!Number.isSafeInteger(buyQty) || buyQty<=0 || !Number.isSafeInteger(getQty) || getQty<=0)
          return res.status(400).json({success:false,error:'Campaign quantities must be positive whole base units'});
        const campaignFreeProduct = campPrize.free_product || free_product || '';

        // Normalise products
        let productsText = (campConditions.products_text || '').trim();
        if (!productsText && Array.isArray(campConditions.products) && campConditions.products.length > 0) {
          productsText = campConditions.products.join(', ');
        }

        if (productsText) {
          const eligibleProducts = productsText.split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
          const allPrices = await getMany(`SELECT LOWER(TRIM(description)) AS desc FROM live_product_prices`);
          const knownProductNames = new Set(allPrices.map(r => r.desc));
          const hasRealProducts = eligibleProducts.some(ep => knownProductNames.has(ep));
          if (hasRealProducts && !eligibleProducts.includes(paid_product.trim().toLowerCase())) {
            return res.status(400).json({
              success: false,
              error: `Paid product "${paid_product}" does not qualify for this campaign. Eligible: ${eligibleProducts.join(', ')}`
            });
          }
        }

        if (paid_qty < buyQty) {
          return res.status(400).json({
            success: false,
            error: `This campaign requires purchasing at least ${buyQty} unit(s) to qualify for free items`
          });
        }

        free_product = campaignFreeProduct || paid_product;
        free_qty     = Math.floor(paid_qty / buyQty) * getQty;
      } else {
        free_qty = free_product ? Number(body.free_qty || 1) : 0;
      }

      // ── Pricing: member = DP price + BV; non-member = CP price, no BV ────────
      const livePrices = await getMany(`SELECT description, dp, cp, bv FROM live_product_prices`);
      const matchPrice = (name) => livePrices.find(p =>
        p.description && name && p.description.trim().toLowerCase() === name.trim().toLowerCase()
      );

      const paidPrice  = matchPrice(paid_product);
      const paidDp     = Number(paidPrice?.dp || 0);
      const paidCp     = Number(paidPrice?.cp || paidPrice?.dp || 0);  // fallback to dp if no cp
      const paidBv     = Number(paidPrice?.bv || 0);

      // Resolve discount for discount-type campaigns
      // discount_percentage lives in the campaigns table column; discount_pct may also be in conditions JSON
      const isDiscountCampaign = campaign.campaign_type === 'discount';
      const discountPct = isDiscountCampaign
        ? Math.max(0, Math.min(100, Number(campaign.discount_percentage || campConditions.discount_pct || 0)))
        : 0;
      const discountMult = discountPct > 0 ? (1 - discountPct / 100) : 1;

      // Discounted DP — the discount applies to both DP and CP (branch books discounted cost)
      const paidDpDiscounted = Math.round(paidDp * discountMult * 100) / 100;

      // Member pays DP (with any campaign discount); non-member pays CP (with any campaign discount)
      const basePrice     = isMember ? paidDp : paidCp;
      const paidUnitPrice = Math.round(basePrice * discountMult * 100) / 100;
      const paidTotal     = Math.round(paidUnitPrice * paid_qty * 100) / 100;
      // BV credited only for member sales (on the discounted unit price)
      const paidBvTotal   = isMember ? Math.round(paidBv * paid_qty * 100) / 100 : 0;
      // Profit = discounted CP − discounted DP (both are discounted; consistent margin)
      const profitAmount  = !isMember ? Math.max(0, Math.round((paidUnitPrice - paidDpDiscounted) * paid_qty * 100) / 100) : 0;

      const itemsArray = [
        {
          product_name: paid_product,
          quantity:     paid_qty,
          // dp is the discounted DP — the discount reduces branch cost alongside the selling price
          dp:           paidDpDiscounted,
          // original_dp preserved for auditing (not used by receipt display)
          original_dp:  paidDp,
          cp:           paidCp,
          bv:           isMember ? paidBv : 0,
          unit_price:   paidUnitPrice,
          total_dp:     Math.round(paidDpDiscounted * paid_qty * 100) / 100,
          total_cp:     Math.round(paidCp * paid_qty * 100) / 100,
          total:        paidTotal,
          total_bv:     paidBvTotal,
          is_free:      false,
          is_member:    isMember,
          discount_pct: discountPct,
        },
        ...(free_product && free_qty > 0 ? [{
          product_name: free_product,
          quantity:     free_qty,
          dp:           0,
          cp:           0,
          bv:           0,
          unit_price:   0,
          total_dp:     0,
          total:        0,
          total_bv:     0,
          is_free:      true,
          campaign_free: true,
        }] : []),
      ];

      await withTransaction(async (client) => {
        // Deduct paid stock.
        // unit_price in BIM = paidUnitPrice for both member and non-member:
        //   Member campaign_sale   → paidUnitPrice = paidDp × discountMult
        //     (actual discounted DP the member paid; for bxgy discountMult=1 so equals paidDp).
        //   Non-member walk_in_non_member_sale → paidUnitPrice = paidCp × discountMult
        //     (discounted CP selling price; reflects actual cash received from the customer).
        //     The gross CP (pre-discount) is stored in branch_walkin_sales and BAT.
        //     BAT product_total_dp = paidDp × qty (full DP cost basis for GM/MIS reports).
        const paidResult = await deductStock(
          client, branch, paid_product, paid_qty,
          isMember ? 'campaign_sale' : 'walk_in_non_member_sale',
          `Campaign: ${campaign.name} — paid item`,
          saleId, paidUnitPrice || null, processed_by,paidUnitPrice,isMember?paidBv:0,paidDpDiscounted
        );
        allDeductions.push(...paidResult.deductions);
        if (paidResult.short > 0) insufficientItems.push({ product_name: paid_product, short: paidResult.short });

        // Deduct free stock (only if there IS a free product configured)
        if (free_product && free_qty > 0) {
          const freeResult = await deductStock(
            client, branch, free_product, free_qty,
            'campaign_free_item', `Campaign: ${campaign.name} — FREE item`,
            saleId, null, processed_by,0
          );
          allDeductions.push(...freeResult.deductions);
          if (freeResult.short > 0) insufficientItems.push({ product_name: free_product, short: freeResult.short });
        }

        if (insufficientItems.length > 0) {
          throw new Error(`Insufficient stock for: ${insufficientItems.map(i => `${i.product_name} (short by ${i.short})`).join(', ')}`);
        }

        // Discount amount saved in the discount column for reporting
        const discountAmount = isDiscountCampaign && discountPct > 0
          ? Math.round((basePrice - paidUnitPrice) * paid_qty * 100) / 100
          : 0;

        // Insert into branch_walkin_sales with correct member/non-member totals
        await client.query(
          `INSERT INTO branch_walkin_sales
             (id, branch_id, sale_number, sale_date, customer_name, customer_type,
              payment_method, subtotal, discount, tax, total, total_bv, status,
              items, data, metadata, created_by, distributor_nb, referral_nb, updated_at)
           VALUES ($1,$2,$3,NOW(),$4,$5,'cash',$6,$7,0,$8,$9,'completed',$10,$11,$12,$13,$14,$15,NOW())`,
          [
            saleId,
            branch,
            saleNumber,
            customer_name || (isMember ? distributor_nb : referral_nb) || 'Campaign Customer',
            customer_type,
            Math.round(basePrice * paid_qty * 100) / 100,  // subtotal = pre-discount
            discountAmount,
            paidTotal,
            paidBvTotal,
            JSON.stringify(itemsArray),
            JSON.stringify({
              campaign_id,
              campaign_name:  campaign.name,
              campaign_type:  campaign.campaign_type,
              sale_type:      'campaign_sale',
              customer_type,
              is_member:      isMember,
              nb_number:      distributor_nb || referral_nb || '',
              referralNB:     referral_nb || null,
              nbNumber:       distributor_nb || null,
              paid_product,
              paid_qty,
              paid_unit_price:  paidUnitPrice,
              paid_base_price:  basePrice,
              discount_pct:     discountPct,
              discount_amount:  discountAmount,
              paid_dp:          paidDp,
              paid_cp:          paidCp,
              paid_bv:          isMember ? paidBv : 0,
              total_amount:     paidTotal,
              total_bv:         paidBvTotal,
              profit_amount:    profitAmount,
              free_product:     free_product || null,
              free_qty:         free_qty || 0,
              notes,
            }),
            JSON.stringify({ campaign_id, campaign_name: campaign.name }),
            processed_by || null,
            distributor_nb || null,
            referral_nb || null,
          ]
        );
      });

      // ── Post-transaction: activity record (mirrors walk-in sales) ────────────
      const actType = isMember ? 'member_sale' : 'non_member_sale';
      const saleDate = new Date().toISOString();
      postActivityRecord({
        id:                 generateBatId(),
        branch_id:          branch,
        branch_name:        branch,
        client_name:        customer_name || (isMember ? distributor_nb : referral_nb) || 'Campaign Customer',
        client_type:        customer_type,
        nb_number:          isMember ? distributor_nb : (referral_nb || null),
        service_date:       saleDate,
        service_time:       new Date().toTimeString().slice(0, 8),
        activity_type:      actType,
        workflow_source:    'branch_portal',
        form_reference_id:  saleId,
        product_total_dp:   Math.round(paidDp * discountMult * paid_qty * 100) / 100,
        product_total_cp:   Math.round(paidCp * discountMult * paid_qty * 100) / 100,
        total_qty:          paid_qty,
        grand_total:        paidTotal,
        payment_status:     'paid',
        payment_method:     'cash',
        stock_impact:       true,
        stock_status:       'deducted',
        prescription_status: 'none',
        consultation_status: 'none',
        reporting_status:   'posted',
        captured_by:        processed_by || null,
      }).catch(e => console.error('[activityCapture] campaign-sale post error:', e.message));

      // ── Post-transaction: record distributor profit for non-member sales ──────
      // Mirrors walk-in sales exactly: profit = (CP - DP) × qty → referring distributor
      if (!isMember && profitAmount > 0) {
        const profitDistrib = referral_nb || 'NB005676';
        const profitName    = body.referral_name || body.campRefName || 'Dynapharm Namibia';
        const profitId      = 'BDP-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        query(
          `INSERT INTO branch_distributor_profit
             (id, branch_id, distributor_nb, distributor_name, sale_id, sale_receipt, sale_date, profit_amount, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',NOW(),NOW())`,
          [profitId, branch, profitDistrib, profitName, saleId, saleNumber, saleDate, profitAmount]
        ).catch(e => console.error('[campaignProfit] insert error:', e.message));
      }

      recomputeLocationBalances('branch', branch).catch(e =>
        console.error('[stockEngine] campaign-sale recompute error:', e.message)
      );

      return res.status(201).json({
        success: true,
        sale_id:      saleId,
        sale_number:  saleNumber,
        deductions:   allDeductions,
        receipt: {
          sale_number:    saleNumber,
          branch,
          sale_date:      new Date().toISOString(),
          customer_name:  customer_name || '',
          customer_type,
          is_member:      isMember,
          nb_number:      distributor_nb || referral_nb || '',
          campaign_name:  campaign.name,
          campaign_type:  campaign.campaign_type,
          items:          itemsArray,
          unit_price:     paidUnitPrice,
          base_price:     basePrice,
          discount_pct:   discountPct,
          dp:             paidDpDiscounted,
          original_dp:    paidDp,
          cp:             paidCp,
          bv_per_unit:    isMember ? paidBv : 0,
          total:          paidTotal,
          total_dp:       Math.round(paidDpDiscounted * paid_qty * 100) / 100,
          total_bv:       paidBvTotal,
          profit_amount:  profitAmount,
          referral_nb:    referral_nb || null,
          referral_name:  !isMember ? (body.referral_name || '') : null,
          cashier:        processed_by || null,
          notes,
        },
        message: `Campaign sale processed. ${allDeductions.length} stock deduction(s) recorded.`,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Campaign sale API error:', err);
    if (err.message?.startsWith('Insufficient stock')) {
      return res.status(409).json({ success: false, error: err.message });
    }
    return res.status(err.statusCode || 500).json({ success: false, error: err.message || 'Internal server error' });
  }
}
export default atomicStockRequest(handler);

import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { recordBranchSaleAllocationTx } from '../services/stockSaleAllocations.js';
import { applyAuthCors, getBranchScope } from '../_lib/auth.js';
import { atomicSaleRequest } from '../_lib/atomicSaleRequest.js';
import { assertActivePriceProducts } from '../services/priceImport.js';
import { query, getOne, getMany, withTransaction } from '../db.js';
import { recomputeLocationBalances } from '../services/stockEngine.js';
import { postActivityRecord, generateBatId } from '../_lib/activityCapture.js';
import { authorizeBranchReturn } from '../services/linkedReversals.js';
import { completeSaleEvidenceTx } from '../services/saleEvidence.js';
import { resolveCampaignPricing } from '../../shared/campaignPricing.js';
import { assertCampaignEligible } from '../services/campaignPricing.js';

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => raw += c);
    req.on('end', () => {try {resolve(raw ? JSON.parse(raw) : {});} catch {reject(new Error('Invalid JSON'));}});
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
  const exact = await __qd_executePlan(getOne, __qd_registeredPlan("api/branch/campaign-sale.js:42:0"),

  [candidates]);

  if (exact) return exact.branch_id;

  // Case-insensitive / space-normalised fallback
  const ci = await __qd_executePlan(getOne, __qd_registeredPlan("api/branch/campaign-sale.js:49:1"),


  [candidates]);

  return ci ? ci.branch_id : key;
}

// Only locked physical batches are sellable. Cached balances cannot create stock.
export async function deductStock(client, branchId, productName, qty, movType, noteStr, saleId, unitPrice, createdBy, revenueUnit, bvUnit = 0, financialDpUnit, campaignPricing) {
  let remaining = qty;
  const deductions = [];

  // ── Primary path: branch_inventory_batches ──────────────────────────────
  const batches = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/branch/campaign-sale.js:63:2"),






  [branchId, productName])).
  rows;

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(batch.quantity));
    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/branch/campaign-sale.js:76:3"),

    [take, batch.id]);

    // Keep depleted batch identity for open count cutoffs and inspected returns.
    const ts1 = Date.now();
    const bimId = 'BIM-' + ts1 + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/branch/campaign-sale.js:83:4"),


    [bimId, branchId, movType, batch.product_name, batch.batch_no || '', take,
    unitPrice ?? null, saleId, noteStr, createdBy || '']);

    const smId1 = 'MOV-' + ts1 + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/branch/campaign-sale.js:90:5"),





    [smId1, batch.product_name, batch.batch_no || '', batch.expiry_date || null,
    take, movType, branchId, saleId, noteStr, unitPrice ?? null]);

    await recordBranchSaleAllocationTx(client, { movementId: smId1, saleReference: saleId, batchId: batch.id, quantity: take, branchMovementId: bimId, revenueUnit, bvUnit, financialDpUnit, campaignPricing });
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

      const campaign_id = body.campaign_id;
      const campaign_name = body.campaign_name;
      const rawBranch = body.branch || body.branch_id;
      const notes = body.notes || '';
      const processed_by = req.user.fullName || req.user.username || req.user.id || req.user.sub;

      // Customer identification — mirrors walk-in sales logic
      const customer_type = body.customer_type || 'member';
      const isMember = customer_type === 'member';
      const customer_name = body.customer_name || body.distributor_name || '';
      const distributor_nb = isMember ? body.nb_number || body.distributor_code || '' : null;
      const referral_nb = !isMember ? body.referral_nb || body.distributor_code || '' : null;

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
      authorizeBranchReturn(req.user, branch);

      const campaign = await __qd_executePlan(getOne, __qd_registeredPlan("api/branch/campaign-sale.js:147:6"), [campaign_id]);
      if (!campaign) return res.status(404).json({ success: false, error: 'Campaign not found' });
      assertCampaignEligible(campaign, branch);
      const now = new Date();
      const isActive = campaign.status !== 'pending_approval' && campaign.status !== 'rejected' &&
      now >= new Date(campaign.start_date) && now <= new Date(campaign.end_date);
      if (!isActive) {
        return res.status(400).json({ success: false, error: 'Campaign is not currently active' });
      }

      // Branch targeting enforcement
      const campScope = (campaign.scope || '').toLowerCase();
      const isGlobal = !campScope || campScope === 'nationwide' || campScope === 'countrywide' || campScope === 'all';
      if (!isGlobal) {
        const campCondRaw = typeof campaign.conditions === 'string' ?
        JSON.parse(campaign.conditions || '{}') : campaign.conditions || {};
        const assignedBranches = Array.isArray(campCondRaw.stock_assignments) ?
        campCondRaw.stock_assignments.map((a) => a.branch).filter((b) => b && b !== 'all') : [];
        const targetBranches = Array.isArray(campaign.target_branches) ?
        campaign.target_branches.filter((b) => b && b !== 'all') :
        Array.isArray(campCondRaw.target_branches) ? campCondRaw.target_branches.filter((b) => b && b !== 'all') : [];
        const allTargeted = [...new Set([...assignedBranches, ...targetBranches])];
        if (allTargeted.length > 0 && !allTargeted.includes(rawBranch) && !allTargeted.includes(branch)) {
          return res.status(403).json({ success: false, error: 'This campaign does not target the specified branch' });
        }
      }

      const saleId = genId('CAMP');
      const saleNumber = saleId;
      const allDeductions = [];
      const insufficientItems = [];

      const campConditions = typeof campaign.conditions === 'string' ?
      JSON.parse(campaign.conditions || '{}') : campaign.conditions || {};
      const campPrize = typeof campaign.prize === 'string' ?
      JSON.parse(campaign.prize || '{}') : campaign.prize || {};

      let paid_product, paid_qty, free_product, free_qty;
      if ((body.paid_items?.length || 0) > 1)
        return res.status(400).json({ error: 'Campaign checkout supports one paid product per transaction' });
      await assertActivePriceProducts(body.paid_items || (body.paid_product ? [{ name: body.paid_product }] : []));

      if (body.paid_product) {
        paid_product = body.paid_product;
        paid_qty = Number(body.paid_qty || 1);
        free_product = body.free_product || null;
      } else if (Array.isArray(body.paid_items)) {
        const first = body.paid_items[0] || {};
        paid_product = first.product_name || first.name;
        paid_qty = Number(first.quantity || first.qty || 1);
        const firstFree = (body.free_items || [])[0] || {};
        free_product = firstFree.product_name || firstFree.name || null;
      }

      if (!paid_product || !Number.isFinite(paid_qty) || paid_qty <= 0) {
        return res.status(400).json({ success: false, error: 'paid_product and a positive paid_qty are required' });
      }

      if (campaign.campaign_type === 'buy_x_get_y') {
        const buyQty = Number(campConditions.buy_qty || 1);
        const getQty = Number(campConditions.get_qty || 1);
        if (!Number.isSafeInteger(buyQty) || buyQty <= 0 || !Number.isSafeInteger(getQty) || getQty <= 0)
        return res.status(400).json({ success: false, error: 'Campaign quantities must be positive whole base units' });
        const campaignFreeProduct = campPrize.free_product || free_product || '';

        // Normalise products
        let productsText = (campConditions.products_text || '').trim();
        if (!productsText && Array.isArray(campConditions.products) && campConditions.products.length > 0) {
          productsText = campConditions.products.join(', ');
        }

        if (productsText) {
          const eligibleProducts = productsText.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
          const allPrices = await __qd_executePlan(getMany, __qd_registeredPlan("api/branch/campaign-sale.js:217:7"), []);
          const knownProductNames = new Set(allPrices.map((r) => r.desc));
          const hasRealProducts = eligibleProducts.some((ep) => knownProductNames.has(ep));
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
        free_qty = Math.floor(paid_qty / buyQty) * getQty;
      } else {
        if (free_product || body.free_items?.length)
          return res.status(400).json({ error: 'Free items must be authorized by a buy-X-get-Y campaign' });
        free_qty = 0;
      }

      // ── Pricing: member = DP price + BV; non-member = CP price, no BV ────────
      const livePrices = await __qd_executePlan(getMany, __qd_registeredPlan("api/branch/campaign-sale.js:242:8"), []);
      const matchPrice = (name) => livePrices.find((p) =>
      p.description && name && p.description.trim().toLowerCase() === name.trim().toLowerCase()
      );

      if (livePrices.filter(p => p.description?.trim().toLowerCase() === paid_product.trim().toLowerCase()).length !== 1)
        return res.status(400).json({ error: 'Unknown or ambiguous paid product' });
      const paidPrice = matchPrice(paid_product);
      if (paidPrice?.dp == null || !isMember && paidPrice?.cp == null)
      return res.status(422).json({ success: false, error: 'Original campaign DP/charged price is required' });
      const paidDp = Number(paidPrice.dp);
      const paidCp = Number(paidPrice.cp ?? paidPrice.dp);
      const paidBv = Number(paidPrice?.bv || 0);

      // Resolve discount for discount-type campaigns
      // discount_percentage lives in the campaigns table column; discount_pct may also be in conditions JSON
      const isDiscountCampaign = campaign.campaign_type === 'discount';
      const pricing = isDiscountCampaign ? resolveCampaignPricing(campaign, paidPrice, { member: isMember, quantity: paid_qty }) : null;
      if (isDiscountCampaign && !pricing)
        return res.status(400).json({ error: 'Selected product or quantity is not eligible for this campaign' });
      const discountPct = pricing?.percentage ?? 0;

      // Discounted DP — the discount applies to both DP and CP (branch books discounted cost)
      const paidDpDiscounted = pricing?.effective_dp ?? paidDp;
      const effectiveCp = pricing?.effective_cp ?? paidCp;

      // Member pays DP (with any campaign discount); non-member pays CP (with any campaign discount)
      const basePrice = isMember ? paidDp : paidCp;
      const paidUnitPrice = pricing?.charged_unit ?? basePrice;
      const paidTotal = Math.round(paidUnitPrice * paid_qty * 100) / 100;
      // BV credited only for member sales (on the discounted unit price)
      const paidBvTotal = isMember ? Math.round(paidBv * paid_qty * 100) / 100 : 0;
      // Profit = discounted CP − discounted DP (both are discounted; consistent margin)
      const profitAmount = !isMember ? Math.max(0, Math.round((paidUnitPrice - paidDpDiscounted) * paid_qty * 100) / 100) : 0;

      const itemsArray = [
      {
        product_name: paid_product,
        quantity: paid_qty,
        // dp is the discounted DP — the discount reduces branch cost alongside the selling price
        dp: paidDpDiscounted,
        // original_dp preserved for auditing (not used by receipt display)
        original_dp: paidDp,
        original_cp: paidCp,
        effective_cp: effectiveCp,
        effective_dp: paidDpDiscounted,
        campaign_pricing: pricing,
        pricing_mode: pricing?.mode || 'list',
        cp: effectiveCp,
        bv: isMember ? paidBv : 0,
        unit_price: paidUnitPrice,
        total_dp: Math.round(paidDpDiscounted * paid_qty * 100) / 100,
        total_cp: Math.round(effectiveCp * paid_qty * 100) / 100,
        total: paidTotal,
        total_bv: paidBvTotal,
        is_free: false,
        is_member: isMember,
        discount_pct: discountPct
      },
      ...(free_product && free_qty > 0 ? [{
        product_name: free_product,
        quantity: free_qty,
        dp: 0,
        cp: 0,
        bv: 0,
        unit_price: 0,
        total_dp: 0,
        total: 0,
        total_bv: 0,
        is_free: true,
        campaign_free: true
      }] : [])];


      let completionEvidence;
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
          saleId, paidUnitPrice, processed_by, paidUnitPrice, isMember ? paidBv : 0, paidDpDiscounted, pricing
        );
        allDeductions.push(...paidResult.deductions);
        if (paidResult.short > 0) insufficientItems.push({ product_name: paid_product, short: paidResult.short });

        // Deduct free stock (only if there IS a free product configured)
        if (free_product && free_qty > 0) {
          const freeResult = await deductStock(
            client, branch, free_product, free_qty,
            'campaign_free_item', `Campaign: ${campaign.name} — FREE item`,
            saleId, 0, processed_by, 0, 0, 0
          );
          allDeductions.push(...freeResult.deductions);
          if (freeResult.short > 0) insufficientItems.push({ product_name: free_product, short: freeResult.short });
        }

        if (insufficientItems.length > 0) {
          throw new Error(`Insufficient stock for: ${insufficientItems.map((i) => `${i.product_name} (short by ${i.short})`).join(', ')}`);
        }

        // Discount amount saved in the discount column for reporting
        const discountAmount = isDiscountCampaign ?
        Math.round((basePrice - paidUnitPrice) * paid_qty * 100) / 100 :
        0;

        // Insert into branch_walkin_sales with correct member/non-member totals
        await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/branch/campaign-sale.js:349:9"),





        [
        saleId,
        branch,
        saleNumber,
        customer_name || (isMember ? distributor_nb : referral_nb) || 'Campaign Customer',
        customer_type,
        Math.round(basePrice * paid_qty * 100) / 100, // subtotal = pre-discount
        discountAmount,
        paidTotal,
        paidBvTotal,
        JSON.stringify(itemsArray),
        JSON.stringify({
          campaign_id,
          campaign_name: campaign.name,
          campaign_type: campaign.campaign_type,
          sale_type: 'campaign_sale',
          customer_type,
          is_member: isMember,
          nb_number: distributor_nb || referral_nb || '',
          referralNB: referral_nb || null,
          nbNumber: distributor_nb || null,
          paid_product,
          paid_qty,
          paid_unit_price: paidUnitPrice,
          paid_base_price: basePrice,
          discount_pct: discountPct,
          discount_amount: discountAmount,
          paid_dp: paidDp,
          paid_cp: paidCp,
          paid_bv: isMember ? paidBv : 0,
          total_amount: paidTotal,
          total_bv: paidBvTotal,
          profit_amount: profitAmount,
          free_product: free_product || null,
          free_qty: free_qty || 0,
          notes
        }),
        JSON.stringify({ campaign_id, campaign_name: campaign.name }),
        processed_by || null,
        distributor_nb || null,
        referral_nb || null]);


        completionEvidence = await completeSaleEvidenceTx(client, { sourceKey: `walkin:${saleId}`, reference: saleId,
          receipt: saleNumber, branch, user: req.user, customerType: customer_type, paymentMethod: 'cash', chargedTotal: paidTotal });
      });

      // ── Post-transaction: activity record (mirrors walk-in sales) ────────────
      const actType = isMember ? 'member_sale' : 'non_member_sale';
      const saleDate = completionEvidence.timestamp;
      await postActivityRecord({
        id: generateBatId(),
        created_at: saleDate,
        branch_id: branch,
        branch_name: branch,
        client_name: customer_name || (isMember ? distributor_nb : referral_nb) || 'Campaign Customer',
        client_type: customer_type,
        nb_number: isMember ? distributor_nb : referral_nb || null,
        service_date: saleDate,
        activity_type: actType,
        workflow_source: 'branch_portal',
        form_reference_id: saleId,
        product_total_dp: Math.round(paidDpDiscounted * paid_qty * 100) / 100,
        product_total_cp: Math.round(effectiveCp * paid_qty * 100) / 100,
        total_qty: paid_qty,
        grand_total: paidTotal,
        payment_status: 'paid',
        payment_method: 'cash',
        stock_impact: true,
        stock_status: 'deducted',
        prescription_status: 'none',
        consultation_status: 'none',
        reporting_status: 'posted',
        captured_by: processed_by || null
      });

      // ── Post-transaction: record distributor profit for non-member sales ──────
      // Mirrors walk-in sales exactly: profit = (CP - DP) × qty → referring distributor
      if (!isMember && profitAmount > 0) {
        const profitDistrib = referral_nb || 'NB005676';
        const profitName = body.referral_name || body.campRefName || 'Dynapharm Namibia';
        const profitId = 'BDP-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
        __qd_executePlan(query, __qd_registeredPlan("api/branch/campaign-sale.js:437:10"),



        [profitId, branch, profitDistrib, profitName, saleId, saleNumber, saleDate, profitAmount]).
        catch((e) => console.error('[campaignProfit] insert error:', e.message));
      }

      recomputeLocationBalances('branch', branch).catch((e) =>
      console.error('[stockEngine] campaign-sale recompute error:', e.message)
      );

      return res.status(201).json({
        success: true,
        sale_id: saleId,
        sale_number: saleNumber,
        deductions: allDeductions,
        receipt: {
          sale_number: saleNumber,
          branch,
          sale_date: completionEvidence.timestamp,
          customer_name: customer_name || '',
          customer_type,
          is_member: isMember,
          nb_number: distributor_nb || referral_nb || '',
          campaign_name: campaign.name,
          campaign_type: campaign.campaign_type,
          items: itemsArray,
          unit_price: paidUnitPrice,
          base_price: basePrice,
          discount_pct: discountPct,
          dp: paidDpDiscounted,
          original_dp: paidDp,
          cp: effectiveCp,
          original_cp: paidCp,
          bv_per_unit: isMember ? paidBv : 0,
          total: paidTotal,
          total_dp: Math.round(paidDpDiscounted * paid_qty * 100) / 100,
          total_bv: paidBvTotal,
          profit_amount: profitAmount,
          referral_nb: referral_nb || null,
          referral_name: !isMember ? body.referral_name || '' : null,
          cashier: processed_by || null,
          notes
        },
        message: `Campaign sale processed. ${allDeductions.length} stock deduction(s) recorded.`
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
export default atomicSaleRequest(handler);

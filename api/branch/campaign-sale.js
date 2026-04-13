import { applyAuthCors, getBranchScope } from '../_lib/auth.js';
import { getOne, getMany, withTransaction } from '../db.js';
import { recomputeLocationBalances } from '../services/stockEngine.js';

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

async function deductStock(client, branchId, productName, qty, movType, noteStr, saleId, unitPrice, createdBy) {
  let remaining = qty;
  const batches = (await client.query(
    `SELECT id, product_name, batch_no, expiry_date, quantity FROM branch_inventory_batches
     WHERE branch_id = $1 AND LOWER(TRIM(product_name)) = LOWER(TRIM($2)) AND quantity > 0
     ORDER BY expiry_date ASC NULLS LAST
     FOR UPDATE`,
    [branchId, productName]
  )).rows;

  const deductions = [];
  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(batch.quantity));
    await client.query(
      `UPDATE branch_inventory_batches SET quantity = quantity - $1, updated_at = NOW() WHERE id = $2`,
      [take, batch.id]
    );
    const bimId = 'BIM-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    await client.query(
      `INSERT INTO branch_inventory_movements (id, branch_id, type, product_name, batch_no, quantity, unit_price, reference, notes, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      [bimId, branchId, movType, batch.product_name, batch.batch_no || '', take,
       unitPrice || null, saleId, noteStr, createdBy || '']
    );
    deductions.push({ product_name: batch.product_name, batch_no: batch.batch_no, quantity: take, movement_type: movType });
    remaining -= take;
  }

  return { deductions, short: remaining };
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });

  const branchScope = getBranchScope(req.user);

  try {
    if (req.method === 'POST') {
      const body = await parseJsonBody(req);

      const campaign_id    = body.campaign_id;
      const campaign_name  = body.campaign_name;
      const branch         = body.branch || body.branch_id;
      const notes          = body.notes || '';
      const processed_by   = body.processed_by || body.created_by || '';

      // Customer identification — mirrors walk-in sales logic
      const customer_type  = body.customer_type || 'member';
      const isMember       = customer_type === 'member';
      const customer_name  = body.customer_name || body.distributor_name || '';
      const distributor_nb = isMember ? (body.nb_number || body.distributor_code || '') : null;
      const referral_nb    = !isMember ? (body.referral_nb || body.distributor_code || '') : null;

      if (!campaign_id || !branch) {
        return res.status(400).json({ success: false, error: 'campaign_id and branch are required' });
      }

      if (isMember && !distributor_nb) {
        return res.status(400).json({ success: false, error: 'Member NB/DZ number is required for member campaign sales' });
      }

      if (branchScope.enforced && !branchScope.branches.includes(branch)) {
        return res.status(403).json({ success: false, error: 'Access denied: cannot process sales for this branch' });
      }

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
        if (allTargeted.length > 0 && !allTargeted.includes(branch)) {
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

      if (!paid_product || paid_qty <= 0) {
        return res.status(400).json({ success: false, error: 'paid_product and a positive paid_qty are required' });
      }

      if (campaign.campaign_type === 'buy_x_get_y') {
        const buyQty = Number(campConditions.buy_qty || 1);
        const getQty = Number(campConditions.get_qty || 1);
        const campaignFreeProduct = campPrize.free_product || free_product || '';

        const productsText = (campConditions.products_text || '').trim();
        if (productsText) {
          const eligibleProducts = productsText.split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
          // Only enforce eligibility if at least one entry in products_text matches a real product in the price list.
          // This prevents blocking when products_text was accidentally set to a note/description rather than a product name.
          const allPrices = await getMany(`SELECT LOWER(TRIM(description)) AS desc FROM product_prices`);
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

        // If no free_product is configured in the prize, default to the same product as paid
        // (the most common "buy X get Y free" pattern — e.g. "Buy 2 DYNA-RH, get 1 DYNA-RH free")
        free_product = campaignFreeProduct || paid_product;
        free_qty     = Math.floor(paid_qty / buyQty) * getQty;
      } else {
        free_qty = free_product ? Number(body.free_qty || 1) : 0;
      }

      // Look up DP and BV from product_prices for the paid product
      const livePrices = await getMany(`SELECT description, dp, bv FROM product_prices`);
      const matchPrice = (name) => livePrices.find(p =>
        p.description && name && p.description.trim().toLowerCase() === name.trim().toLowerCase()
      );

      const paidPrice = matchPrice(paid_product);
      const paidDp    = Number(paidPrice?.dp || 0);
      const paidBv    = Number(paidPrice?.bv || 0);
      const paidTotal = Math.round(paidDp * paid_qty * 100) / 100;
      const paidBvTotal = Math.round(paidBv * paid_qty * 100) / 100;

      // Build items array with proper dp/bv; free items marked is_free:true, dp:0, bv:0
      const itemsArray = [
        {
          product_name: paid_product,
          quantity:     paid_qty,
          dp:           paidDp,
          bv:           paidBv,
          unit_price:   paidDp,
          total_dp:     paidTotal,
          total_bv:     paidBvTotal,
          is_free:      false,
        },
        ...(free_product && free_qty > 0 ? [{
          product_name: free_product,
          quantity:     free_qty,
          dp:           0,
          bv:           0,
          unit_price:   0,
          total_dp:     0,
          total_bv:     0,
          is_free:      true,
          campaign_free: true,
        }] : []),
      ];

      await withTransaction(async (client) => {
        // Deduct paid stock
        const paidResult = await deductStock(
          client, branch, paid_product, paid_qty,
          'campaign_sale', `Campaign: ${campaign.name} — paid item`,
          saleId, paidDp || null, processed_by
        );
        allDeductions.push(...paidResult.deductions);
        if (paidResult.short > 0) insufficientItems.push({ product_name: paid_product, short: paidResult.short });

        // Deduct free stock
        if (free_product && free_qty > 0) {
          const freeResult = await deductStock(
            client, branch, free_product, free_qty,
            'campaign_free_item', `Campaign: ${campaign.name} — FREE item`,
            saleId, null, processed_by
          );
          allDeductions.push(...freeResult.deductions);
          if (freeResult.short > 0) insufficientItems.push({ product_name: free_product, short: freeResult.short });
        }

        if (insufficientItems.length > 0) {
          throw new Error(`Insufficient stock for: ${insufficientItems.map(i => `${i.product_name} (short by ${i.short})`).join(', ')}`);
        }

        // Insert into branch_walkin_sales — matches walk-in structure for CSI + reports
        await client.query(
          `INSERT INTO branch_walkin_sales
             (id, branch_id, sale_number, sale_date, customer_name, customer_type,
              payment_method, subtotal, discount, tax, total, total_bv, status,
              items, data, metadata, created_by, distributor_nb, referral_nb, updated_at)
           VALUES ($1,$2,$3,NOW(),$4,$5,'cash',$6,0,0,$6,$7,'completed',$8,$9,$10,$11,$12,$13,NOW())`,
          [
            saleId,
            branch,
            saleNumber,
            customer_name || (isMember ? distributor_nb : referral_nb) || 'Campaign Customer',
            customer_type,
            paidTotal,
            paidBvTotal,
            JSON.stringify(itemsArray),
            JSON.stringify({
              campaign_id,
              campaign_name: campaign.name,
              campaign_type: campaign.campaign_type,
              sale_type:     'campaign_sale',
              customer_type,
              nb_number:     distributor_nb || referral_nb || '',
              referralNB:    referral_nb || null,
              nbNumber:      distributor_nb || null,
              paid_product,
              paid_qty,
              free_product:  free_product || null,
              free_qty:      free_qty || 0,
              notes,
            }),
            JSON.stringify({ campaign_id, campaign_name: campaign.name }),
            processed_by || null,
            distributor_nb || null,
            referral_nb || null,
          ]
        );
      });

      recomputeLocationBalances('branch', branch).catch(e =>
        console.error('[stockEngine] campaign-sale recompute error:', e.message)
      );

      return res.status(201).json({
        success: true,
        sale_id:      saleId,
        sale_number:  saleNumber,
        deductions:   allDeductions,
        receipt: {
          sale_number:   saleNumber,
          branch,
          sale_date:     new Date().toISOString(),
          customer_name: customer_name || '',
          customer_type,
          nb_number:     distributor_nb || referral_nb || '',
          campaign_name: campaign.name,
          campaign_type: campaign.campaign_type,
          items:         itemsArray,
          total_dp:      paidTotal,
          total_bv:      paidBvTotal,
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
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
}

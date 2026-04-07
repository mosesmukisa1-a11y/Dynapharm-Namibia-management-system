import { applyAuthCors, getBranchScope } from '../_lib/auth.js';
import { getOne, withTransaction } from '../db.js';
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

function genId(prefix = 'CSALE') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
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

      const campaign_id = body.campaign_id;
      const campaign_name = body.campaign_name;
      const branch = body.branch || body.branch_id;
      const distributor_code = body.distributor_code || '';
      const distributor_name = body.distributor_name || '';
      const notes = body.notes || '';
      const processed_by = body.processed_by || body.created_by || '';

      if (!campaign_id || !branch) {
        return res.status(400).json({ success: false, error: 'campaign_id and branch are required' });
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

      // Enforce branch targeting: campaign must apply to this branch
      const campScope = (campaign.scope || '').toLowerCase();
      // 'nationwide', 'countrywide', 'all', or empty = applies to all branches
      const isGlobal = !campScope || campScope === 'nationwide' || campScope === 'countrywide' || campScope === 'all';
      if (!isGlobal) {
        // Parse stock_assignments / target_branches from conditions to determine targeting
        const campCondRaw = typeof campaign.conditions === 'string'
          ? JSON.parse(campaign.conditions || '{}') : (campaign.conditions || {});
        const assignedBranches = Array.isArray(campCondRaw.stock_assignments)
          ? campCondRaw.stock_assignments.map(a => a.branch).filter(b => b && b !== 'all')
          : [];
        const targetBranches = Array.isArray(campaign.target_branches)
          ? campaign.target_branches.filter(b => b && b !== 'all')
          : (Array.isArray(campCondRaw.target_branches) ? campCondRaw.target_branches.filter(b => b && b !== 'all') : []);
        const allTargeted = [...new Set([...assignedBranches, ...targetBranches])];
        // If no specific branches are listed, treat as global (all branches)
        if (allTargeted.length > 0 && !allTargeted.includes(branch)) {
          return res.status(403).json({ success: false, error: 'This campaign does not target the specified branch' });
        }
      }

      const saleId = genId('CSALE');
      const allDeductions = [];
      const insufficientItems = [];

      // Parse campaign conditions and prize for server-side enforcement
      const campConditions = typeof campaign.conditions === 'string'
        ? JSON.parse(campaign.conditions || '{}') : (campaign.conditions || {});
      const campPrize = typeof campaign.prize === 'string'
        ? JSON.parse(campaign.prize || '{}') : (campaign.prize || {});

      let paid_product, paid_qty, free_product, free_qty;

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

      if (!paid_product || paid_qty <= 0) {
        return res.status(400).json({ success: false, error: 'paid_product and a positive paid_qty are required' });
      }

      // Server-side enforcement for buy_x_get_y: enforce qualifying product, buy_qty threshold, proportional free qty
      if (campaign.campaign_type === 'buy_x_get_y') {
        const buyQty = Number(campConditions.buy_qty || 1);
        const getQty = Number(campConditions.get_qty || 1);
        const campaignFreeProduct = campPrize.free_product || free_product || '';

        // Enforce qualifying paid product(s) from campaign conditions
        const productsText = (campConditions.products_text || '').trim();
        if (productsText) {
          const eligibleProducts = productsText.split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
          if (eligibleProducts.length > 0 && !eligibleProducts.includes(paid_product.toLowerCase())) {
            return res.status(400).json({
              success: false,
              error: `Paid product "${paid_product}" does not qualify for this campaign. Eligible: ${eligibleProducts.join(', ')}`
            });
          }
        }

        // Validate paid quantity meets buy_qty requirement
        if (paid_qty < buyQty) {
          return res.status(400).json({
            success: false,
            error: `This campaign requires purchasing at least ${buyQty} unit(s) to qualify for free items`
          });
        }

        if (!campaignFreeProduct) {
          return res.status(400).json({ success: false, error: 'buy_x_get_y campaign requires a free_product configured in campaign prize.' });
        }

        // Derive free item from campaign configuration; override client values
        free_product = campaignFreeProduct;
        // Proportional free quantity: floor(paid_qty / buy_qty) * get_qty
        free_qty = Math.floor(paid_qty / buyQty) * getQty;
      } else {
        // For non-buy_x_get_y campaigns, free item and qty are optional/client-provided
        free_qty = free_product ? Number(body.free_qty || 1) : 0;
      }

      await withTransaction(async (client) => {
        const paidResult = await deductStock(
          client, branch, paid_product, paid_qty,
          'campaign_sale', `Campaign sale: ${campaign.name}`,
          saleId, null, processed_by
        );
        allDeductions.push(...paidResult.deductions);
        if (paidResult.short > 0) {
          insufficientItems.push({ product_name: paid_product, short: paidResult.short });
        }

        if (free_product && free_qty > 0) {
          const freeResult = await deductStock(
            client, branch, free_product, free_qty,
            'campaign_free_item', `Campaign free item: ${campaign.name}`,
            saleId, null, processed_by
          );
          allDeductions.push(...freeResult.deductions);
          if (freeResult.short > 0) {
            insufficientItems.push({ product_name: free_product, short: freeResult.short });
          }
        }

        if (insufficientItems.length > 0) {
          throw new Error(`Insufficient stock for: ${insufficientItems.map(i => `${i.product_name} (short by ${i.short})`).join(', ')}`);
        }

        await client.query(
          `INSERT INTO branch_walkin_sales (id, branch_id, sale_number, sale_date, customer_name, customer_type, payment_method, subtotal, discount, tax, total, total_bv, status, items, data, metadata, created_by, updated_at)
           VALUES ($1, $2, $3, NOW(), $4, 'member', 'cash', 0, 0, 0, 0, 0, 'completed', $5, $6, $7, $8, NOW())`,
          [
            saleId, branch, saleId,
            distributor_name || distributor_code || 'Campaign Customer',
            JSON.stringify([{ product_name: paid_product, quantity: paid_qty }]),
            JSON.stringify({ campaign_id, campaign_name: campaign.name, distributor_code, distributor_name, notes, sale_type: 'campaign_sale', free_product, free_qty }),
            JSON.stringify({ campaign_id, campaign_name: campaign.name }),
            processed_by || null,
          ]
        );
      });

      recomputeLocationBalances('branch', branch).catch(e =>
        console.error('[stockEngine] campaign-sale recompute error:', e.message)
      );

      return res.status(201).json({
        success: true,
        sale_id: saleId,
        deductions: allDeductions,
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

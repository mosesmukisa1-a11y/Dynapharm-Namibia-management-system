import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { insertStatement, numericPage } from '../services/sqlShape.js';
import { applicationRecord } from '../services/sqlFieldPolicy.js';
import { recordBranchSaleAllocationTx, reconcileSaleFinancialsTx } from '../services/stockSaleAllocations.js';
import { applyAuthCors, getBranchScope } from '../_lib/auth.js';
import { query, getMany, getOne, withTransaction } from '../db.js';
import { atomicSaleRequest } from '../_lib/atomicSaleRequest.js';
import { assertActivePriceProducts } from '../services/priceImport.js';
import { branchSearchTerms } from '../_lib/branchUtils.js';
import { recomputeLocationBalances } from '../services/stockEngine.js';
import { broadcastStockEvent } from '../services/stockEvents.js';
import { postActivityRecord, generateBatId } from '../_lib/activityCapture.js';
import { getPackageComponents } from '../_lib/packageDefinitions.js';
import { completeSaleEvidenceTx } from '../services/saleEvidence.js';
import { businessDatePredicate } from '../services/businessDates.js';
import { withCapturedReceiptDP } from '../services/saleReceiptPricing.js';
import { resolveCampaignPricing, campaignMoney } from '../../shared/campaignPricing.js';
import { assertCampaignEligible } from '../services/campaignPricing.js';

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

async function normalizeSaleRows(rows) {
  const sales = rows.map(normalizeSaleRow).filter(Boolean);
  if (!sales.length) return sales;
  // Read the frozen sale DP, never today's price or caller-supplied dpPrice.
  // Do not select CIF/private original costs into the Branch response.
  const facts = await __qd_executePlan(getMany, __qd_registeredPlan("api/branch/walkin-sales.js:68:0"),






  [sales.map((s) => String(s.id))]);
  return withCapturedReceiptDP(sales, facts);
}

function normalizeSaleRow(row) {
  if (!row) return null;

  const data = safeJsonParse(row.data, {});
  const items = safeJsonParse(row.items, data.items || data.products || []);
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
    metadata: metadata || null
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
    timestamp: base.timestamp
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

  // Determine if any items are campaign-tagged — used to stamp sale_type in data JSON
  // so daily-products.js campaign_refs CTE can identify campaign walk-in sales.
  const campaignItems = products.filter((p) => p.isCampaignSale);
  const hasCampaignItems = campaignItems.length > 0;
  // Build per-item data enrichment: stamp sale_type + discount_pct on campaign items
  const enrichedProducts = products.map((p) => {
    if (p.isCampaignSale) {
      return { ...p, sale_type: 'campaign_sale', discount_pct: p.campaign_discount_pct };
    }
    return p;
  });

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
    items: JSON.stringify(enrichedProducts),
    // Stamp sale_type:'campaign_sale' + discount_pct on the top-level data JSON when applicable.
    // The report's campaign_refs CTE queries: data->>'sale_type' = 'campaign_sale'
    // and reads discount_pct from: (data->>'discount_pct')::numeric
    // For mixed receipts (some campaign, some regular) we still flag the whole record as campaign_sale
    // because the per-item isCampaignSale flag on each product row lets the report split them correctly.
    data: JSON.stringify({
      ...payload,
      id,
      items: enrichedProducts,
      ...(hasCampaignItems ? {
        sale_type: 'campaign_sale',
        // Use the highest discount_pct among campaign items for the top-level record
        // (per-item discount_pct on each enrichedProduct is the authoritative per-item figure)
        pricing_basis: 'per_item'
      } : {})
    }),
    referral_nb:
    payload.referral_nb ||
    payload.referralNB ||
    payload.distributorReferral?.nb_number ||
    existing.referral_nb ||
    null,

    distributor_nb:
    payload.distributor_nb ||
    payload.distributorNB ||
    payload.distributor_nb_number ||
    existing.distributor_nb ||
    null,

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
      notes: payload.notes || existing.metadata?.notes || null
    }),
    created_by: payload.soldBy || existing.created_by || null,
    updated_at: new Date().toISOString(),
    offline_id: payload.offline_id || existing.offline_id || null
  };
}

function buildSelectQuery(searchParams, scopedBranches, enforced) {
  const params = saleReadParameters(searchParams, scopedBranches, enforced);
  const queryText = `SELECT * FROM branch_walkin_sales WHERE
    ($1::text[] IS NULL OR branch_id=ANY($1))
    AND ($2::text IS NULL OR LOWER(REPLACE(branch_id,' ','_'))=LOWER(REPLACE($2,' ','_')))
    AND ($3::date IS NULL OR sale_date>=($3::date::timestamp AT TIME ZONE 'Africa/Windhoek'))
    AND ($4::date IS NULL OR sale_date<(($4::date+1)::timestamp AT TIME ZONE 'Africa/Windhoek'))
    AND ($5::text IS NULL OR LOWER(customer_name) LIKE $5)
    AND ($6::text IS NULL OR UPPER(referral_nb)=$6 OR UPPER(distributor_nb)=$6)
    ORDER BY sale_date DESC,created_at DESC LIMIT $7`;
  return { queryText: __qd_registeredPlan("api/branch/walkin-sales.js:257:2"), params };
}
function saleReadParameters(searchParams, branches, enforced) {
  const from = searchParams.get('from') || null,to = searchParams.get('to') || null;
  const search = searchParams.get('search'),nb = searchParams.get('distributor_nb') || searchParams.get('referral_nb');
  const requested = searchParams.get('limit'),fallback = from || to ? 5000 : 250;
  const limit = requested == null || requested === '' || requested === '0' ? fallback :
  numericPage(requested, { fallback, max: Number.MAX_SAFE_INTEGER });
  return [enforced ? Array.isArray(branches) ? branches : [] : null,
  enforced ? null : searchParams.get('branch') || searchParams.get('branch_id') || null,
  from, to, search ? `%${search.toLowerCase()}%` : null, nb ? nb.toUpperCase() : null, limit];
}

/**
 * Build a SELECT query against branch_activity_transactions for
 * prescription_dispensing entries, honouring the same branch/date/search
 * filters as the regular walkin-sales query.
 */
function buildRxQuery(searchParams, scopedBranches, enforced) {
  const params = saleReadParameters(searchParams, scopedBranches, enforced);
  const queryText = `SELECT * FROM branch_activity_transactions WHERE activity_type='prescription_dispensing'
    AND ($1::text[] IS NULL OR branch_id=ANY($1))
    AND ($2::text IS NULL OR LOWER(REPLACE(branch_id,' ','_'))=LOWER(REPLACE($2,' ','_')))
    AND ($3::date IS NULL OR service_date::date>=$3)
    AND ($4::date IS NULL OR service_date::date<=$4)
    AND ($5::text IS NULL OR LOWER(client_name) LIKE $5 OR LOWER(id) LIKE $5 OR LOWER(COALESCE(form_reference_id,'')) LIKE $5)
    AND ($6::text IS NULL OR UPPER(referral_nb)=$6 OR UPPER(nb_number)=$6)
    ORDER BY service_date DESC,created_at DESC LIMIT $7`;
  return { queryText: __qd_registeredPlan("api/branch/walkin-sales.js:285:3"), params };
}

/** Normalize a BAT prescription_dispensing row into the same shape as normalizeSaleRow. */
function normalizeRxRow(row) {
  if (!row) return null;
  const clientType = row.client_type || 'patient';
  const isMember = clientType === 'member';
  const serviceDate = row.service_date instanceof Date ?
  row.service_date.toISOString() :
  row.service_date ? new Date(row.service_date).toISOString() : null;
  const createdAt = row.created_at instanceof Date ?
  row.created_at.toISOString() :
  row.created_at || null;
  const total = Number(row.grand_total || 0);

  return {
    id: row.id,
    saleNumber: row.form_reference_id || row.id,
    saleType: 'prescription',
    timestamp: serviceDate || createdAt,
    branch: row.branch_id,
    branchId: row.branch_id,
    branch_id: row.branch_id,
    customerName: row.client_name || 'Patient',
    customer_name: row.client_name || 'Patient',
    customerType: isMember ? 'member' : 'non_member',
    customer_type: isMember ? 'member' : 'non_member',
    nb_number: row.nb_number || null,
    distributor_nb: row.nb_number || null,
    referral_nb: row.referral_nb || null,
    paymentMethod: row.payment_method || 'cash',
    payment_method: row.payment_method || 'cash',
    subtotal: Number(row.product_total_cp || total),
    total,
    totalAmount: total,
    totalBV: 0,
    products: [],
    reportId: row.form_reference_id || null,
    status: 'completed',
    soldBy: row.captured_by || null,
    created_at: createdAt,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at || null
  };
}

async function handler(req, res) {
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
        let row = await __qd_executePlan(getOne, __qd_registeredPlan("api/branch/walkin-sales.js:350:1"), [id]);
        if (!row) {
          return res.status(404).json({ success: false, error: 'Sale not found' });
        }
        if (branchScope.enforced && !branchScope.branches.includes(row.branch_id)) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
        return res.status(200).json({ success: true, sale: (await normalizeSaleRows([row]))[0] });
      }

      // Require an explicit branch filter for admin-level roles (admin/gm/director) —
      // returning all branches' sales without a filter causes phantom data to appear under
      // whichever branch label happens to be active in the UI.
      // Finance and other reporting roles may query without a branch for cross-branch views.
      if (branchScope.requiresBranchParam && !searchParams.get('branch') && !searchParams.get('branch_id') && !searchParams.get('distributor_nb') && !searchParams.get('referral_nb')) {
        return res.status(400).json({ success: false, error: 'branch parameter is required' });
      }

      const { queryText, params } = buildSelectQuery(searchParams, branchScope.branches, branchScope.enforced);
      const { queryText: rxQueryText, params: rxParams } = buildRxQuery(searchParams, branchScope.branches, branchScope.enforced);

      const [rows, rxRows] = await Promise.all([__qd_executePlan(
        getMany, queryText, params),
      __qd_executePlan(getMany, rxQueryText, rxParams).catch(() => [])]
      );

      const walkinSales = await normalizeSaleRows(rows);
      const rawRxSales = rxRows.map(normalizeRxRow).filter(Boolean);

      // Populate dispensed products from branch_inventory_movements for Rx entries
      // so the refund flow can show product items to select
      let rxSales = rawRxSales;
      if (rawRxSales.length > 0) {
        const refs = rawRxSales.map((s) => s.reportId).filter(Boolean);
        if (refs.length > 0) {
          const dispRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/branch/walkin-sales.js:386:4"),




          [refs]).
          catch(() => []);

          // Build a map: reportId → [products]
          const prodMap = {};
          for (const d of dispRows) {
            const key = d.reference;
            if (!prodMap[key]) prodMap[key] = [];
            prodMap[key].push({
              product_name: d.product_name,
              name: d.product_name,
              description: d.product_name,
              batch_no: d.batch_no || null,
              batchNo: d.batch_no || null,
              quantity: Number(d.quantity || 0),
              qty: Number(d.quantity || 0),
              unit_price: Number(d.unit_price || 0),
              dpPrice: Number(d.unit_price || 0),
              dp: Number(d.unit_price || 0)
            });
          }

          rxSales = rawRxSales.map((s) => ({
            ...s,
            products: prodMap[s.reportId] || []
          }));
        }
      }

      // Merge and sort descending by timestamp so the list shows a unified chronological view
      const allSales = [...walkinSales, ...rxSales].sort((a, b) => {
        const ta = new Date(a.timestamp || a.created_at || 0).getTime();
        const tb = new Date(b.timestamp || b.created_at || 0).getTime();
        return tb - ta;
      });

      return res.status(200).json({
        success: true,
        sales: allSales
      });
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const salePayload = body.sale || body;
      const retryIdentity = salePayload.offline_id || salePayload.id;
      if (retryIdentity) {
        await __qd_executePlan(query, __qd_registeredPlan("api/branch/walkin-sales.js:437:5"), [`walkin:${retryIdentity}`]);
        const existing = await __qd_executePlan(getOne, __qd_registeredPlan("api/branch/walkin-sales.js:438:6"), [retryIdentity]);
        if (existing) {
          if (branchScope.enforced && !branchScope.branches.includes(existing.branch_id)) return res.status(403).json({ success: false, error: 'Access denied' });
          return res.status(200).json({ success: true, sale: (await normalizeSaleRows([existing]))[0], duplicate: true });
        }
      }

      if (salePayload.offline_id) {
        const dup = await __qd_executePlan(getOne, __qd_registeredPlan("api/branch/walkin-sales.js:446:7"), [salePayload.offline_id]);
        if (dup) {
          const existing = await __qd_executePlan(getOne, __qd_registeredPlan("api/branch/walkin-sales.js:448:8"), [dup.id]);
          return res.status(200).json({ success: true, sale: (await normalizeSaleRows([existing]))[0], duplicate: true });
        }
      }

      let record = buildSaleRecord(salePayload);
      record.created_by = req.user.fullName || req.user.username || req.user.id || req.user.sub;
      record.sale_date = new Date().toISOString();
      record.created_at = record.sale_date;
      if (record.status !== 'completed') return res.status(400).json({ success: false, error: 'Only completed sales can deduct stock' });

      if (branchScope.enforced && !branchScope.branches.includes(record.branch_id)) {
        return res.status(403).json({ success: false, error: 'Access denied: cannot create sales for this branch' });
      }

      const saleItems = Array.isArray(salePayload.items) ? salePayload.items : Array.isArray(salePayload.products) ? salePayload.products : [];
      await assertActivePriceProducts(saleItems);
      const branchId = record.branch_id;
      const customerType = record.customer_type || 'customer';
      const saleMovType = customerType === 'member' ? 'walk_in_member_sale' : customerType === 'non_member' ? 'walk_in_non_member_sale' : 'sale';

      const deductItems = [];
      const isMemberSale = record.customer_type === 'member';

      const livePriceRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/branch/walkin-sales.js:472:9"), []);



      const livePriceMap = {};
      for (const row of livePriceRows) {
        if (row.description) livePriceMap[row.description.toLowerCase()] = row;
      }

      const hasCampaign = saleItems.some(i => i.isCampaignSale || i.campaign_id || i.campaign_pricing);
      for (const item of saleItems) {
        if (!(item.isCampaignSale || item.campaign_id || item.campaign_pricing)) {
          if (Number(item.campaign_discount_pct) > 0 || item.pricing_mode === 'custom')
            throw Object.assign(new Error('Price overrides require an approved campaign'), { statusCode: 400 });
          if (hasCampaign) {
            const name = item.product_name || item.name || item.description;
            const matches = livePriceRows.filter(p => p.description?.trim().toLowerCase() === name?.trim().toLowerCase());
            if (matches.length !== 1)
              throw Object.assign(new Error('Each mixed campaign receipt item must match one catalogue product'), { statusCode: 400 });
            const price = matches[0], cp = Number(price.cp), dp = Number(price.dp);
            const charge = isMemberSale ? dp : cp;
            if (!Number.isFinite(charge) || campaignMoney(Number(item.unit_price ?? item.unitPrice)) !== campaignMoney(charge))
              throw Object.assign(new Error('Non-campaign product price must retain its catalogue price'), { statusCode: 400 });
            Object.assign(item, { original_cp: cp, original_dp: dp, effective_cp: cp, effective_dp: dp,
              cpPrice: cp, dpPrice: dp, cp, dp, unit_price: charge });
          }
          continue;
        }
        if (!item.campaign_id) throw Object.assign(new Error('Campaign ID is required for campaign pricing'), { statusCode: 400 });
        const campaign = await __qd_executePlan(getOne, __qd_registeredPlan("api/branch/campaign-sale.js:147:6"), [item.campaign_id]);
        if (!campaign) throw Object.assign(new Error('Campaign not found'), { statusCode: 400 });
        assertCampaignEligible(campaign, branchId);
        const name = item.product_name || item.name || item.description;
        const matches = livePriceRows.filter(p => p.description?.trim().toLowerCase() === name?.trim().toLowerCase());
        if (matches.length !== 1 || getPackageComponents(name))
          throw Object.assign(new Error('Campaign product must match one catalogue stock product'), { statusCode: 400 });
        const pricing = resolveCampaignPricing(campaign, matches[0], { member: isMemberSale, quantity: Number(item.quantity ?? item.qty) });
        if (!pricing) throw Object.assign(new Error('Product or quantity is not eligible for this discount campaign'), { statusCode: 400 });
        const sent = Number(item.unit_price ?? item.unitPrice);
        if (!Number.isFinite(sent) || campaignMoney(sent) !== pricing.charged_unit)
          throw Object.assign(new Error('Campaign price changed or does not match approved terms; refresh the sale'), { statusCode: 409 });
        Object.assign(item, { isCampaignSale: true, pricing_mode: pricing.mode,
          campaign_pricing: pricing, original_cp: pricing.original_cp, original_dp: pricing.original_dp,
          effective_cp: pricing.effective_cp, effective_dp: pricing.effective_dp,
          cpPrice: pricing.effective_cp, dpPrice: pricing.effective_dp,
          cp: pricing.effective_cp, dp: pricing.effective_dp, unit_price: pricing.charged_unit,
          campaign_discount_pct: pricing.percentage, discount_pct: pricing.percentage,
          bv: isMemberSale ? Number(matches[0].bv || 0) : 0,
          line_total: campaignMoney(pricing.charged_unit * Number(item.quantity ?? item.qty)) });
      }
      if (hasCampaign) {
        const expected = campaignMoney(saleItems.reduce((sum, i) =>
          sum + Number(i.unit_price ?? i.unitPrice) * Number(i.quantity ?? i.qty), 0));
        if (!Number.isFinite(expected) || expected !== campaignMoney(record.total) || record.discount !== 0 || record.tax !== 0)
          throw Object.assign(new Error('Campaign receipt total must match approved per-item prices without additional discounts'), { statusCode: 400 });
        record = { ...record, ...buildSaleRecord({ ...salePayload, items: saleItems, products: saleItems }) };
        record.created_by = req.user.fullName || req.user.username || req.user.id || req.user.sub;
        record.sale_date = record.created_at = new Date().toISOString();
      }

      for (const item of saleItems) {
        const qty = Number(item.quantity || item.qty || 0);
        if (!Number.isFinite(qty) || qty <= 0) throw Object.assign(new Error('Sale quantities must be positive'), { statusCode: 400 });
        // Always resolve DP (cost basis) — never CP — for BIM.unit_price and
        // stock_movements.unit_dp.  Reports already join product_prices.dp, but
        // writing DP here keeps inventory_balances.stock_value_dp accurate and
        // matches the dispense.js pattern.
        const itemName = item.product_name || item.name || item.description || '';
        const itemLivePrice = livePriceMap[itemName.toLowerCase()];
        // Prefer: (1) live product_prices.dp, (2) frontend dpPrice/dp, (3) unit_price fallback
        const originalDP = item.campaign_pricing?.effective_dp ?? itemLivePrice?.dp;
        // CP is not evidence of distributor price. An unknown original DP
        // remains unknown; received CIF/source layers still determine COGS.
        const unitPrice = originalDP == null ? null : Number(originalDP);
        const pkg = getPackageComponents(itemName);
        if (pkg) {
          for (const comp of pkg.products) {
            const livePrice = livePriceMap[comp.name.toLowerCase()];
            // Always DP for cost basis (same as dispense.js)
            const dp = livePrice?.dp == null ? null : Number(livePrice.dp);
            deductItems.push({
              name: comp.name,
              qty: Number(comp.quantity || 1) * qty,
              unitPrice: dp,
              revenueUnit: isMemberSale ? dp : livePrice?.cp == null ? null : Number(livePrice.cp)
            });
          }
        } else if (Array.isArray(item.components) && item.components.length > 0) {
          for (const comp of item.components) {
            const compLive = livePriceMap[(comp.name || comp.product_name || '').toLowerCase()];
            // Always DP for cost basis
            const compDp = compLive?.dp == null ? null : Number(compLive.dp);
            deductItems.push({
              name: comp.name || comp.product_name || '',
              qty: Number(comp.quantity || comp.qty || 1) * qty,
              unitPrice: compDp,
              revenueUnit: isMemberSale ? compDp : compLive?.cp == null ? null : Number(compLive.cp)
            });
          }
        } else {
          const charged = item.campaign_pricing?.charged_unit ?? (isMemberSale ? itemLivePrice?.dp : itemLivePrice?.cp);
          deductItems.push({ name: itemName, qty, unitPrice, revenueUnit: charged == null ? null : Number(charged), bvUnit: isMemberSale ? Number(item.bv || item.bvPrice || 0) : 0, campaignPricing: item.campaign_pricing });
        }
      }

      let insertedRow, completedEvidence;
      try {
        insertedRow = await withTransaction(async (client) => {
          const statement = insertStatement('branch_walkin_sales', applicationRecord('branch_walkin_sales', record));
          const result = await __qd_executePlan(client.query.bind(client), statement, statement.params);
          const saleId = result.rows[0].id;

          const insufficientItems = [];
          // Resolve ALL alias forms once — covers hochland-park↔hochlandpark etc.
          const saleBranchCandidates = branchSearchTerms(branchId);
          for (const item of deductItems) {
            if (!item.name || item.qty <= 0 || !branchId) continue;
            let remaining = item.qty;
            const batches = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/branch/walkin-sales.js:540:10"),








            [saleBranchCandidates, item.name])).
            rows;
            for (const batch of batches) {
              if (remaining <= 0) break;
              const take = Math.min(remaining, Number(batch.quantity));
              await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/branch/walkin-sales.js:554:11"),

              [take, batch.id]);

              // Remove zero-qty rows immediately so they cannot be resurrected as
              // ghost stock by a stale inventory_balances entry before recompute runs.
              // Retain zero-quantity batches for count cutoffs and return provenance.
              const ts = Date.now();
              const bimId = 'BIM-' + ts + '-' + Math.random().toString(36).slice(2, 8).toUpperCase();
              await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/branch/walkin-sales.js:563:12"),


              [bimId, branchId, saleMovType, batch.product_name, batch.batch_no || '', take, item.unitPrice ?? null, saleId, 'Walk-in ' + customerType + ' sale', record.created_by || '']);

              const smId = 'MOV-' + ts + '-' + Math.random().toString(36).slice(2, 6);
              await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/branch/walkin-sales.js:569:13"),





              [smId, batch.product_name, batch.batch_no || '', batch.expiry_date || null,
              take, saleMovType, branchId, saleId, 'Walk-in ' + customerType + ' sale', item.unitPrice ?? null]);

              await recordBranchSaleAllocationTx(client, { movementId: smId, saleReference: saleId, batchId: batch.id, quantity: take, branchMovementId: bimId, revenueUnit: item.revenueUnit, bvUnit: item.bvUnit || 0, financialDpUnit: item.unitPrice, campaignPricing: item.campaignPricing });
              remaining -= take;
            }
            if (remaining > 0) {
              insufficientItems.push({ product_name: item.name, requested: item.qty, available: item.qty - remaining, short: remaining });
            }
          }

          if (insufficientItems.length > 0) {
            throw new Error(`Insufficient stock for: ${insufficientItems.map((i) => `${i.product_name} (need ${i.requested}, have ${i.available})`).join(', ')}`);
          }
          await reconcileSaleFinancialsTx(client, saleId, record.total, record.total_bv);
          completedEvidence = await completeSaleEvidenceTx(client, { sourceKey: `walkin:${saleId}`, reference: saleId,
            receipt: record.sale_number, branch: branchId, user: req.user, customerType,
            paymentMethod: record.payment_method, chargedTotal: record.total, timestamp: record.sale_date });

          return result.rows[0];
        });
      } catch (txErr) {
        console.error('Walk-in sale transaction error:', txErr.message);
        if (txErr.message?.startsWith('Insufficient stock')) {
          return res.status(409).json({ success: false, error: txErr.message });
        }
        return res.status(500).json({ success: false, error: txErr.message || 'Failed to record sale' });
      }

      recomputeLocationBalances('branch', branchId).catch((e) =>
      console.error('[stockEngine] walkin-sale recompute error:', e.message)
      );

      // Push immediate SSE notification so every connected dashboard refreshes
      broadcastStockEvent('branch_sale', { branchId, customerType: record.customer_type });

      const actType = record.customer_type === 'member' ? 'member_sale' :
      record.customer_type === 'non_member' ? 'non_member_sale' :
      record.customer_type === 'prescription' ? 'prescription_dispensing' :
      record.customer_type === 'consultation' ? 'consultation' :
      'non_member_sale'; // default non-tagged walk-in to non_member_sale so it shows in Walk-in column
      const totalQty = saleItems.reduce((s, i) => s + Number(i.quantity || i.qty || 0), 0);
      // BAT product_total_dp: use live product_prices.dp as authoritative source.
      // Falls back to frontend dpPrice/dp for items not in the price list (e.g. checkup fees).
      const dpSubtotal = saleItems.reduce((s, i) => {
        const nm = (i.product_name || i.name || i.description || '').toLowerCase();
        const liveRow = livePriceMap[nm];
        const dp = i.campaign_pricing?.effective_dp ?? (liveRow ? Number(liveRow.dp) || Number(i.dpPrice || i.dp || 0) : Number(i.dpPrice || i.dp || 0));
        return s + dp * Number(i.quantity || i.qty || 0);
      }, 0);
      await postActivityRecord({
        id: generateBatId(),
        branch_id: record.branch_id,
        branch_name: record.branch_id,
        client_name: record.customer_name || 'Walk-in',
        client_phone: record.customer_phone || null,
        client_type: record.customer_type || 'walk_in',
        nb_number: JSON.parse(record.metadata || '{}').referralId || null,
        service_date: record.sale_date,
        activity_type: actType,
        workflow_source: 'branch_portal',
        form_reference_id: insertedRow.id,
        created_at: record.sale_date,
        product_total_dp: completedEvidence?.dpTotal ?? null,
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
        captured_by: record.created_by || null
      });

      // Auto-record distributor profit for non-member sales
      if (record.customer_type !== 'member') {
        const meta = safeJsonParse(record.metadata, {});
        // Use referral NB number first — meta.referralId is the distributor's UUID (database id),
        // NOT their NB number.  Putting it first would store a UUID as distributor_nb, making
        // profits invisible in the distributor portal and the branch payout tab.
        const referralNb = record.referral_nb || meta.referralId || 'NB005676';
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
          let dp = Number(i.dpPrice ?? i.dp ?? 0);
          let cp = Number(i.cpPrice ?? i.cp ?? 0);
          if (!i.campaign_pricing && (!cp || !dp)) {
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
          __qd_executePlan(query, __qd_registeredPlan("api/branch/walkin-sales.js:687:14"),


          [profitId, record.branch_id, referralNb, referralName, insertedRow.id, record.sale_number, record.sale_date, profitAmount]).
          catch((e) => console.error('[distributorProfit] insert error:', e.message));
        }
      }

      return res.status(201).json({
        success: true,
        sale: (await normalizeSaleRows([insertedRow]))[0]
      });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await parseJsonBody(req);
      const salePayload = body.sale || body;
      const targetId = salePayload.id || id;

      if (!targetId) {
        return res.status(400).json({ success: false, error: 'Sale id is required' });
      }

      const existing = await __qd_executePlan(getOne, __qd_registeredPlan("api/branch/walkin-sales.js:709:15"), [targetId]);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Sale not found' });
      }

      if (branchScope.enforced && !branchScope.branches.includes(existing.branch_id)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }

      const record = buildSaleRecord(salePayload, existing);
      const nameOnlyEdit = Object.keys(salePayload).every((key) => ['id', 'customer_name', 'customerName'].includes(key));
      const immutableFields = ['branch_id', 'status', 'items', 'total_amount', 'total_dp', 'total_cp', 'payment_status',
      'subtotal', 'discount', 'tax', 'total', 'total_bv', 'customer_type', 'distributor_nb', 'referral_nb', 'sale_number', 'sale_date', 'payment_method', 'data', 'metadata'];
      for (const field of immutableFields) {
        if (nameOnlyEdit) continue;
        const canonical = (value) => {
          if (typeof value === 'string' && ['items', 'data', 'metadata'].includes(field)) {try {return JSON.parse(value);} catch {}}
          return value;
        };
        if (record[field] != null && JSON.stringify(canonical(record[field])) !== JSON.stringify(canonical(existing[field]))) {
          return res.status(409).json({ success: false, error: 'Posted sale quantities, totals, branch and status cannot be edited. Use a linked refund or controlled reversal.' });
        }
      }
      if (branchScope.enforced) {
        record.branch_id = existing.branch_id;
      }
      // An ordinary edit cannot rewrite price, BV, referral, or payment evidence.
      const result = await __qd_executePlan(query, __qd_registeredPlan("api/branch/walkin-sales.js:737:16"),

      [record.customer_name, record.updated_at, targetId]);


      return res.status(200).json({
        success: true,
        sale: (await normalizeSaleRows([result.rows[0]]))[0]
      });
    }

    if (req.method === 'DELETE') {
      return res.status(409).json({ success: false, error: 'Posted sales cannot be deleted because their stock and financial history must be preserved. Use a linked refund or controlled reversal.' });
      /* Historical destructive deletion is intentionally disabled.
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
      */



    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Walk-in sales API error:', error);
    return res.status(error.statusCode || 500).json({ success: false, error: error.statusCode ? error.message : 'Internal server error' });
  }
}
export default atomicSaleRequest(handler);

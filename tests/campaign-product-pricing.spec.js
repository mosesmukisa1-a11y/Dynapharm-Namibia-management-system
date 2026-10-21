// @vitest-environment node
import { beforeAll, afterAll, it, expect } from 'vitest';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { query } from './helpers/owned-raw-database.js';
import campaigns from '../api/campaigns.js';
import checkout from '../api/branch/campaign-sale.js';
import walkin from '../api/branch/walkin-sales.js';
import daily from '../api/reports/branch-sales/daily.js';
import monthly from '../api/reports/branch-sales/monthly.js';
import { businessDay } from '../api/services/businessDates.js';
import { getLegacyDPRevenue } from '../api/services/stockFinancialReports.js';
import { generateReceiptHTML } from '../client/src/lib/receipt.js';

const tag = 'CPR-' + randomUUID().slice(0, 8), branch = 'townshop';
const names = ['Alpha', 'Beta', 'Other'].map(n => tag + '-' + n);
let server, base, campaignId;
const http = async (path, body, method = body ? 'POST' : 'GET', role = 'admin') => {
  const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'x-fixture-role': role },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, body: await r.json() };
};
const conditions = () => ({ pricing_scope: 'products', product_pricing: [
  { product_name: names[0], mode: 'percentage', percentage: 17.5 },
  { product_name: names[1], mode: 'custom', cp: 82.34, dp: 0 },
] });
const campaignBody = () => ({ name: tag, campaign_type: 'discount', start_date: '2020-01-01', end_date: '2035-12-31',
  discount_percentage: 0, scope: 'countrywide', conditions: conditions() });
const sale = (name, extra = {}) => ({ requestId: randomUUID(), campaign_id: campaignId, branch,
  paid_product: name, paid_qty: 2, customer_type: 'non_member', customer_name: tag, ...extra });
beforeAll(async () => {
  for (const [i, name] of names.entries()) {
    await query(`INSERT INTO product_prices(description,product_code,dp,cp,cif,bv,updated_by)
      VALUES($1::text,$1::text,$2,$3,23,4,'isolated-fixture')`, [name, i ? 61.23 : 341, i ? 99.99 : 443]);
    await query(`INSERT INTO stock_batches(id,barcode,description,batch_no,expiry_date,quantity,remaining_quantity,
      location,status,cif_unit_cost,dpc_unit_value,original_unit_cif,original_unit_dp)
      VALUES($1::text,$1::text,$2,'LOT','2035-12-31',100,100,'windhoek_warehouse','available',23,37,23,37)`, [name, name]);
    await query(`INSERT INTO branch_inventory_batches(id,branch_id,product_name,batch_no,expiry_date,quantity,
      unit_price,status,source_batch_id) VALUES($1::text,$2,$1::text,'LOT','2035-12-31',100,37,'in_stock',$1::text)`, [name, branch]);
  }
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.user = { id: tag, username: tag, fullName: 'Synthetic operator',
    role: req.headers['x-fixture-role'] || 'admin', branch }; next(); });
  app.use('/api/campaigns', (req, res, next) => { req.url = '/api/campaigns' + req.url; campaigns(req, res).catch(next); });
  app.all('/checkout', checkout); app.all('/walkin', walkin);
  app.all('/daily', daily); app.all('/monthly', monthly);
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = 'http://127.0.0.1:' + server.address().port;
});
afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

it('creates/edits product rules, requires GM approval after stock edits, rejects invalid identities and numbers', async () => {
  let r = await http('/api/campaigns', campaignBody(), 'POST', 'stock');
  expect(r.status, JSON.stringify(r.body)).toBe(201); campaignId = r.body.campaign.id;
  expect(r.body.campaign.status).toBe('pending_approval');
  expect(r.body.campaign.conditions.product_pricing).toEqual(conditions().product_pricing);
  r = await http('/checkout', sale(names[0])); expect(r.status).toBe(400);
  r = await http('/api/campaigns/' + campaignId + '/review', { action: 'approve' }, 'PATCH');
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  r = await http('/api/campaigns/' + campaignId, { conditions: conditions() }, 'PUT', 'stock');
  expect(r.status).toBe(200); expect(r.body.campaign.status).toBe('pending_approval');
  r = await http('/api/campaigns/' + campaignId, { status: 'active' }, 'PUT', 'stock');
  expect(r.status).toBe(403);
  await http('/api/campaigns/' + campaignId + '/review', { action: 'approve' }, 'PATCH');
  r = await http('/api/campaigns/' + campaignId);
  expect(r.body.campaign.conditions.product_pricing).toEqual(conditions().product_pricing);
  for (const product_pricing of [
    [...conditions().product_pricing, conditions().product_pricing[0]],
    [{ product_name: 'Unknown', mode: 'custom', cp: 1 }],
    [{ product_name: names[0], mode: 'custom', cp: -1 }],
    [{ product_name: names[0], mode: 'custom', cp: null, dp: null }],
    [{ product_name: names[0], mode: 'percentage', percentage: 101 }],
  ]) {
    const bad = await http('/api/campaigns', { ...campaignBody(), conditions: { pricing_scope: 'products', product_pricing } });
    expect(bad.status, JSON.stringify(bad.body)).toBe(400);
  }
});

it('captures dedicated and POS member/non-member prices, commercial DP and received cost separately after catalogue changes', async () => {
  const receipts = [];
  for (const member of [false, true]) {
    for (const [index, name] of names.slice(0, 2).entries()) {
      const r = await http('/checkout', sale(name, { customer_type: member ? 'member' : 'non_member', nb_number: 'NB-FIXTURE' }));
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      const p = r.body.receipt.items[0], dp = index ? 0 : 281.33, cp = index ? 82.34 : 365.48;
      expect(p.dp).toBe(dp); expect(p.unit_price).toBe(member ? dp : cp);
      const a = (await query('SELECT snapshot FROM stock_sale_allocations WHERE sale_reference=$1', [r.body.sale_id])).rows[0].snapshot;
      expect(Number(a.financial_dp_unit)).toBe(dp); expect(Number(a.unit_cost)).toBe(23); expect(Number(a.unit_dp)).toBe(37);
      expect(a.campaign_pricing.effective_cp).toBe(cp);
      receipts.push({ id: r.body.sale_id, member, dp, cp });
    }
    const items = [
      { product_name: names[0], quantity: 1, unit_price: member ? 281.33 : 365.48, isCampaignSale: true, campaign_id: campaignId },
      { product_name: names[1], quantity: 1, unit_price: member ? 0 : 82.34, isCampaignSale: true, campaign_id: campaignId },
      { product_name: names[2], quantity: 1, unit_price: member ? 61.23 : 99.99 },
    ];
    const total = member ? 342.56 : 547.81;
    const r = await http('/walkin', { id: randomUUID(), branch, customerType: member ? 'member' : 'non_member',
      products: items, total, subtotal: total, totalBV: member ? 12 : 0 });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    const saved = r.body.sale.products;
    expect(saved[0].dp).toBe(281.33); expect(saved[1].dp).toBe(0);
    expect(saved[0].original_dp).toBe(341);
    receipts.push({ id: r.body.sale.id, member, dp: 281.33, cp: 365.48, mixed: true });
  }
  const before = await http('/monthly?branch_id=' + branch + '&month=' + businessDay().slice(0, 7));
  expect(before.status, JSON.stringify(before.body)).toBe(200);
  const gmBefore = await getLegacyDPRevenue([branch], businessDay(), businessDay());
  const render = async record => {
    const r = await http('/walkin?id=' + record.id);
    expect(r.status).toBe(200);
    const items = r.body.sale.products;
    expect(items[0].dp).toBe(record.dp);
    const html = generateReceiptHTML({ receiptNumber: record.id, items, totalAmount: r.body.sale.total,
      saleDate: r.body.sale.timestamp,
      customerType: record.member ? 'member' : 'non_member', branch, cashier: 'Fixture' });
    expect(html).toContain('N$ ' + (record.member ? record.dp : record.cp).toFixed(2));
    return html;
  };
  const receiptBytes = await Promise.all(receipts.map(render));
  await query('UPDATE product_prices SET dp=901,cp=999,cif=777 WHERE description=ANY($1)', [names]);
  expect(await Promise.all(receipts.map(render))).toEqual(receiptBytes);
  const after = await http('/monthly?branch_id=' + branch + '&month=' + businessDay().slice(0, 7));
  expect(after.status, JSON.stringify(after.body)).toBe(200);
  expect(after.body.summary).toEqual(before.body.summary);
  expect(after.body.campaign_sales).toEqual(before.body.campaign_sales);
  expect(after.body.campaign_sales.value).toBeCloseTo(1810.44, 2);
  expect(await getLegacyDPRevenue([branch], businessDay(), businessDay())).toEqual(gmBefore);
  const day = await http('/daily?branch_id=' + branch + '&date=' + businessDay());
  expect(day.status, JSON.stringify(day.body)).toBe(200);
  expect(day.body.campaign_sales.value).toBeCloseTo(1810.44, 2);
  const remaining = (await query('SELECT SUM(quantity) qty FROM branch_inventory_batches WHERE product_name=ANY($1)', [names])).rows[0].qty;
  expect(Number(remaining)).toBe(286);
});

it('rejects ineligible products, extra free claims and POS price tampering without deducting stock', async () => {
  expect((await http('/checkout', sale(names[2]))).status).toBe(400);
  expect((await http('/checkout', sale(names[0], { free_product: names[1], free_qty: 10 }))).status).toBe(400);
  const r = await http('/walkin', { id: randomUUID(), branch, customerType: 'member', total: 1, subtotal: 1,
    products: [{ product_name: names[0], quantity: 1, unit_price: 1, isCampaignSale: true, campaign_id: campaignId }] });
  expect(r.status).toBe(409);
  const left = (await query('SELECT SUM(quantity) qty FROM branch_inventory_batches WHERE product_name=ANY($1)', [names])).rows[0].qty;
  expect(Number(left)).toBe(286);
});

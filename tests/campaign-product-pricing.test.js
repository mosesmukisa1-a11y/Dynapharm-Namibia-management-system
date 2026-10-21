// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { normalizeCampaignConditions, resolveCampaignPricing, bestCampaignPricing } from '../shared/campaignPricing.js';
import { assertCampaignEligible } from '../api/services/campaignPricing.js';
import { calculateCartTotals } from '../client/src/lib/pricing.js';
const catalogue = [{ description: 'Alpha', cp: 443, dp: 341 }, { description: 'Beta', cp: 99.99, dp: 61.23 }];
const rules = [
  { product_name: 'Alpha', mode: 'percentage', percentage: 17.5 },
  { product_name: 'Beta', mode: 'custom', cp: 82.34, dp: 0 },
];
const campaign = (product_pricing = rules) => ({ id: 'mixed', campaign_type: 'discount', discount_percentage: 55,
  conditions: { pricing_scope: 'products', product_pricing } });
describe('product campaign commercial prices', () => {
  it('round trips normalized rules, scopes exactly and does not discount custom prices twice', () => {
    const c = campaign();
    c.conditions = JSON.stringify(normalizeCampaignConditions(c.conditions, catalogue));
    expect(resolveCampaignPricing(c, catalogue[0], { member: true })).toMatchObject({
      original_cp: 443, original_dp: 341, effective_cp: 365.48, effective_dp: 281.33, charged_unit: 281.33 });
    expect(resolveCampaignPricing(c, catalogue[1])).toMatchObject({ effective_cp: 82.34, effective_dp: 0, charged_unit: 82.34, percentage: null });
    expect(resolveCampaignPricing(c, { description: 'Other', cp: 100, dp: 50 })).toBeNull();
  });
  it.each([{ cp: 0, dp: null }, { cp: null, dp: 0 }])('blank keeps list, zero remains zero: %j', prices => {
    const c = campaign([{ product_name: 'Alpha', mode: 'custom', ...prices }]);
    const p = resolveCampaignPricing(c, catalogue[0], { member: true });
    expect(p.effective_cp).toBe(prices.cp ?? 443);
    expect(p.effective_dp).toBe(prices.dp ?? 341);
  });
  it.each([0, 100])('allows percentage boundary %s', percentage => {
    expect(resolveCampaignPricing(campaign([{ product_name: 'Alpha', mode: 'percentage', percentage }]), catalogue[0]).effective_cp)
      .toBe(percentage === 0 ? 443 : 0);
  });
  it.each([-1, 101, Infinity, NaN, '', null, true])('rejects invalid percentage %s', percentage => {
    expect(() => normalizeCampaignConditions(campaign([{ product_name: 'Alpha', mode: 'percentage', percentage }]).conditions, catalogue)).toThrow();
  });
  it.each([-1, Infinity, NaN, true, '  '])('rejects invalid custom price %s', cp => {
    expect(() => normalizeCampaignConditions(campaign([{ product_name: 'Alpha', mode: 'custom', cp }]).conditions, catalogue)).toThrow();
  });
  it('rejects duplicates, ambiguous/unknown identities, empty selections and empty custom rules', () => {
    for (const [conditions, products] of [
      [campaign([rules[0], rules[0]]).conditions, catalogue],
      [campaign().conditions, [...catalogue, catalogue[0]]],
      [campaign([{ product_name: 'Unknown', mode: 'custom', dp: 1 }]).conditions, catalogue],
      [campaign([]).conditions, catalogue],
      [campaign([{ product_name: 'Alpha', mode: 'custom' }]).conditions, catalogue],
    ]) expect(() => normalizeCampaignConditions(conditions, products)).toThrow();
  });
  it('keeps legacy all-product/selected-product discounts and lowest charged-price overlap selection', () => {
    const legacy = { id: 'legacy', campaign_type: 'discount', discount_percentage: 20, conditions: {} };
    expect(resolveCampaignPricing(legacy, catalogue[0]).effective_dp).toBe(272.8);
    expect(resolveCampaignPricing({ ...legacy, conditions: { products: ['Beta'] } }, catalogue[0])).toBeNull();
    expect(bestCampaignPricing([campaign(), legacy], catalogue[0]).campaignId).toBe('legacy');
    const custom = campaign([{ product_name: 'Alpha', mode: 'custom', cp: 400, dp: 10 }]);
    expect(bestCampaignPricing([legacy, custom], catalogue[0], { member: true }).campaignId).toBe('mixed');
    expect(bestCampaignPricing([legacy, custom], catalogue[0], { member: false }).campaignId).toBe('legacy');
    expect(resolveCampaignPricing({ ...legacy, campaign_type: 'buy_x_get_y' }, catalogue[0])).toBeNull();
  });
  it('respects quantity/purchase conditions and preserves zero in POS totals', () => {
    const c = campaign(); c.conditions.min_qty = 2;
    expect(resolveCampaignPricing(c, catalogue[0])).toBeNull();
    expect(resolveCampaignPricing(c, catalogue[0], { quantity: 2 })).not.toBeNull();
    expect(calculateCartTotals([{ dp: 0, cp: 0, price: 999, qty: 3, campaignDiscount: {} }], true).totalAmount).toBe(0);
    expect(calculateCartTotals([{ dp: 0, cp: 0, price: 999, qty: 3 }], false).totalAmount).toBe(0);
  });
  it('enforces branch, dates, status without rejecting legacy approved status', () => {
    const c = { status: 'approved', start_date: '2026-01-01', end_date: '2027-01-01', scope: 'branch',
      target_branches: ['townshop'] };
    expect(() => assertCampaignEligible(c, 'townshop', new Date('2026-06-01'))).not.toThrow();
    expect(() => assertCampaignEligible(c, 'rundu', new Date('2026-06-01'))).toThrow(/target/);
    expect(() => assertCampaignEligible({ ...c, status: 'pending_approval' }, 'townshop')).toThrow(/approved/);
  });
});

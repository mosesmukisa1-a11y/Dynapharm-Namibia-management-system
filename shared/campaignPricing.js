// Commercial campaign terms only. Received inventory costs and BV are separate.
export const campaignConditions = campaign => typeof campaign.conditions === 'string'
  ? JSON.parse(campaign.conditions || '{}') : campaign.conditions || {};
const key = value => String(value || '').trim().toLowerCase();
export const campaignMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const fail = message => { throw Object.assign(new Error(message), { statusCode: 400 }); };
export function campaignNumber(value, label, max = 999999999) {
  if (value == null || String(value).trim() === '' || typeof value === 'boolean' ||
      !['number', 'string'].includes(typeof value)) fail(`${label} is required`);
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) fail(`${label} must be between 0 and ${max}`);
  return n;
}
export function normalizeCampaignConditions(conditions, catalogue) {
  if (!conditions || typeof conditions !== 'object' || Array.isArray(conditions)) fail('Campaign conditions must be an object');
  if (conditions.product_pricing === undefined && conditions.pricing_scope !== 'products') return conditions;
  if (conditions.pricing_scope !== 'products' || !Array.isArray(conditions.product_pricing) || !conditions.product_pricing.length)
    fail('Product pricing requires selected-products scope and at least one product');
  const seen = new Set();
  const product_pricing = conditions.product_pricing.map(rule => {
    if (!rule || typeof rule !== 'object') fail('Invalid product pricing rule');
    const matches = catalogue.filter(p => key(p.description) === key(rule.product_name));
    if (matches.length !== 1) fail(`Unknown or ambiguous catalogue product: ${rule.product_name || '(blank)'}`);
    const product_name = matches[0].description;
    if (seen.has(key(product_name))) fail(`Duplicate product pricing: ${product_name}`);
    seen.add(key(product_name));
    if (rule.mode === 'percentage')
      return { product_name, mode: 'percentage', percentage: campaignNumber(rule.percentage, 'Product discount percentage', 100) };
    if (rule.mode !== 'custom') fail(`Invalid pricing mode for ${product_name}`);
    const price = (v, label) => v == null || v === '' ? null : campaignMoney(campaignNumber(v, label));
    const cp = price(rule.cp, 'Custom CP'), dp = price(rule.dp, 'Custom DP');
    if (cp === null && dp === null) fail(`Enter custom CP or DP for ${product_name}; a blank counterpart keeps its list price`);
    return { product_name, mode: 'custom', cp, dp };
  });
  return { ...conditions, pricing_scope: 'products', product_pricing };
}
export function resolveCampaignPricing(campaign, product, { member = false, quantity = 1 } = {}) {
  if (campaign.campaign_type !== 'discount') return null;
  const c = campaignConditions(campaign), name = key(product.description || product.product_name || product.name);
  let rule;
  if (c.pricing_scope === 'products' || c.product_pricing !== undefined) {
    const matches = (c.product_pricing || []).filter(r => key(r.product_name) === name);
    if (matches.length !== 1) return null;
    rule = matches[0];
  } else {
    const names = Array.isArray(c.products) && c.products.length ? c.products : String(c.products_text || '').split(',');
    const selected = names.map(key).filter(Boolean);
    if (selected.length && !selected.includes(name)) return null;
    rule = { mode: 'percentage', percentage: campaign.discount_percentage || c.discount_pct || 0 };
  }
  if (quantity < Number(c.min_qty || c.min_quantity || 0)) return null;
  const original_cp = campaignNumber(product.cp, 'List CP'), original_dp = campaignNumber(product.dp, 'List DP');
  const percentage = rule.mode === 'percentage' ? campaignNumber(rule.percentage, 'Product discount percentage', 100) : null;
  if (!['percentage', 'custom'].includes(rule.mode)) fail('Invalid saved campaign pricing mode');
  const effective_cp = campaignMoney(rule.mode === 'custom' ? rule.cp ?? original_cp : original_cp * (1 - percentage / 100));
  const effective_dp = campaignMoney(rule.mode === 'custom' ? rule.dp ?? original_dp : original_dp * (1 - percentage / 100));
  if (rule.mode === 'custom') {
    if (rule.cp == null && rule.dp == null) fail('Custom pricing requires CP or DP');
    if (rule.cp != null) campaignNumber(rule.cp, 'Custom CP');
    if (rule.dp != null) campaignNumber(rule.dp, 'Custom DP');
  }
  if (quantity * (member ? original_dp : original_cp) < Number(c.min_purchase || 0)) return null;
  return { original_cp, original_dp, effective_cp, effective_dp,
    charged_unit: member ? effective_dp : effective_cp, mode: rule.mode, percentage, rule: { ...rule } };
}
// Lowest applicable charged price wins; stable campaign order breaks ties (no stacking).
export function bestCampaignPricing(campaigns, product, options) {
  let best = null;
  for (const campaign of campaigns) {
    const pricing = resolveCampaignPricing(campaign, product, options);
    if (pricing && (!best || pricing.charged_unit < best.charged_unit))
      best = { ...pricing, campaignId: campaign.id, campaignName: campaign.name, pct: pricing.percentage ?? 0 };
  }
  return best;
}

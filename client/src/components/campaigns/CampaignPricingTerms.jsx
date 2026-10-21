import React from 'react';
import { resolveCampaignPricing } from '../../../../shared/campaignPricing.js';

const money = value => value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : `N$${Number(value).toFixed(2)}`;
const nameOf = product => product?.description || product?.name || product?.product_name || '';
const ruleDescription = rule => {
  if (rule?.mode === 'custom') {
    const cp = rule.cp === null || rule.cp === undefined || rule.cp === '' ? 'Catalogue CP' : money(rule.cp);
    const dp = rule.dp === null || rule.dp === undefined || rule.dp === '' ? 'Catalogue DP' : money(rule.dp);
    return `Custom pricing · CP ${cp} · DP ${dp}`;
  }
  return `${Number(rule?.percentage ?? 0)}% off catalogue CP and DP`;
};

export default function CampaignPricingTerms({ campaign, products = [], member = false, compact = false }) {
  if (!campaign || campaign.campaign_type !== 'discount') return null;
  let parsedConditions = campaign.conditions || {};
  if (typeof parsedConditions === 'string') {
    try { parsedConditions = JSON.parse(parsedConditions || '{}'); } catch { parsedConditions = {}; }
  }
  const rules = Array.isArray(campaign.product_pricing) && campaign.product_pricing.length
    ? campaign.product_pricing : (Array.isArray(parsedConditions.product_pricing) ? parsedConditions.product_pricing : []);
  const scope = campaign.pricing_scope || parsedConditions.pricing_scope || (rules.length ? 'products' : 'campaign');
  const pricingConditions = { ...parsedConditions, pricing_scope: scope };
  if (scope === 'products') pricingConditions.product_pricing = rules;
  else delete pricingConditions.product_pricing;
  const pricingCampaign = { ...campaign, conditions: pricingConditions };
  const legacyPercentage = campaign.discount_percentage ?? parsedConditions.discount_pct ?? 0;
  const legacyNames = Array.isArray(parsedConditions.products) ? parsedConditions.products
    : String(parsedConditions.products_text || '').split(',').map(value => value.trim()).filter(Boolean);
  const legacyProducts = products.filter(product => !legacyNames.length || legacyNames.some(value => value.toLowerCase() === nameOf(product).toLowerCase()));
  const shown = scope === 'products'
    ? rules.map(rule => ({ rule, product: products.find(p => nameOf(p) === rule.product_name) || null }))
    : legacyProducts.length
      ? legacyProducts.map(product => ({ rule: { mode: 'percentage', percentage: legacyPercentage }, product }))
      : [{ rule: { mode: 'percentage', percentage: legacyPercentage }, product: null }];
  if (!shown.length && scope === 'products') return <div className="text-xs text-slate-500">No product pricing rules are saved.</div>;
  return (
    <div className={`space-y-2 ${compact ? 'text-xs' : 'text-sm'}`}>
      {shown.map(({ rule, product }, i) => {
        let result = null;
        if (product && Number.isFinite(Number(product.cp)) && Number.isFinite(Number(product.dp))) {
          try { result = resolveCampaignPricing(pricingCampaign, product, { member, quantity: 1 }); } catch { result = null; }
        }
        const label = rule?.product_name || nameOf(product) || 'Campaign-wide';
        const key = `${label}-${i}`;
        return (
          <div key={key} className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <div className={`${compact ? 'font-semibold' : 'mb-1 font-semibold'} text-slate-800`}>{label}</div>
            {result ? (
              <>
                <div className="grid grid-cols-2 gap-2 text-slate-600">
                  <span>CP: {money(result.original_cp)} <span className="text-slate-400">→</span> <strong className="text-slate-900">{money(result.effective_cp)}</strong></span>
                  <span>DP: {money(result.original_dp)} <span className="text-slate-400">→</span> <strong className="text-slate-900">{money(result.effective_dp)}</strong></span>
                </div>
                <div className="mt-1 text-slate-500">
                  {ruleDescription(rule)} · {member ? 'Member price (DP)' : 'Customer price (CP)'} {money(result.charged_unit)}
                </div>
              </>
            ) : <div className="text-slate-600">{ruleDescription(rule)}</div>}
          </div>
        );
      })}
    </div>
  );
}

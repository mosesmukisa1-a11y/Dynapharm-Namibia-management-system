import React from 'react';
import { resolveCampaignPricing } from '../../../../shared/campaignPricing.js';

const productName = (product) => product?.description || product?.name || product?.product_name || '';
const priceText = (value) => value === null || value === undefined || value === '' ? 'Catalogue' : `N$${Number(value).toFixed(2)}`;

export function normalizeProductPricing(rules = []) {
  return (Array.isArray(rules) ? rules : []).map(rule => ({
    product_name: rule.product_name,
    mode: rule.mode,
    ...(rule.mode === 'percentage'
      ? { percentage: Number(rule.percentage) }
      : {
        cp: rule.cp === '' || rule.cp === undefined || rule.cp === null ? null : Number(rule.cp),
        dp: rule.dp === '' || rule.dp === undefined || rule.dp === null ? null : Number(rule.dp),
      }),
  }));
}

export function validateCampaignPricing(conditions = {}, campaignType = 'discount') {
  if (campaignType !== 'discount') return '';
  const scope = conditions.pricing_scope || 'products';
  if (scope !== 'products') {
    const percentage = Number(conditions.discount_pct ?? conditions.discount_percentage);
    return Number.isFinite(percentage) && percentage >= 0 && percentage <= 100
      ? '' : 'Enter a campaign-wide discount between 0 and 100%.';
  }
  const rules = Array.isArray(conditions.product_pricing) ? conditions.product_pricing : [];
  if (!rules.length || rules.some(rule => !rule.product_name)) return 'Select at least one product for this discount.';
  const names = rules.map(rule => String(rule.product_name).trim().toLowerCase());
  if (new Set(names).size !== names.length) return 'Each product can only have one pricing rule.';
  for (const rule of rules) {
    if (rule.mode === 'percentage') {
      if (rule.percentage === '' || !Number.isFinite(Number(rule.percentage)) || Number(rule.percentage) < 0 || Number(rule.percentage) > 100) {
        return `Enter a percentage from 0 to 100 for ${rule.product_name}.`;
      }
    } else if (rule.mode === 'custom') {
      const hasCp = rule.cp !== '' && rule.cp !== null && rule.cp !== undefined;
      const hasDp = rule.dp !== '' && rule.dp !== null && rule.dp !== undefined;
      if (!hasCp && !hasDp) return `Enter at least one custom price for ${rule.product_name}.`;
      if ([rule.cp, rule.dp].some(v => v !== '' && v !== null && v !== undefined && (!Number.isFinite(Number(v)) || Number(v) < 0))) {
        return `Custom prices for ${rule.product_name} must be zero or greater.`;
      }
    }
  }
  return '';
}

export default function CampaignPricingEditor({ conditions = {}, onChange, products = [] }) {
  const scope = conditions.pricing_scope || 'products';
  const rules = Array.isArray(conditions.product_pricing) ? conditions.product_pricing : [];
  const names = products.map(productName).filter(Boolean);
  const update = (patch) => onChange({ ...conditions, ...patch });
  const updateRule = (index, patch) => update({ product_pricing: rules.map((rule, i) => i === index ? { ...rule, ...patch } : rule) });
  const catalogueProduct = (name) => products.find(p => productName(p) === name) || {};

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white/80 p-3" aria-label="Campaign pricing">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-slate-800">Discount pricing</h4>
          <p className="mt-0.5 text-xs text-slate-500">Choose specific catalogue products or retain a campaign-wide legacy discount.</p>
        </div>
        <select aria-label="Pricing scope" value={scope}
          onChange={e => {
            if (e.target.value === 'products') update({ pricing_scope: 'products', product_pricing: rules });
            else {
              const next = { ...conditions, pricing_scope: 'campaign' };
              delete next.product_pricing;
              onChange(next);
            }
          }}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm">
          <option value="products">Selected products</option>
          <option value="campaign">Campaign-wide (legacy)</option>
        </select>
      </div>
      {scope !== 'products' ? (
        <label className="block text-xs font-semibold text-slate-600">
          Legacy campaign-wide discount (%)
          <input type="number" min="0" max="100" step="0.01" value={conditions.discount_pct ?? conditions.discount_percentage ?? ''}
            onChange={e => update({ discount_pct: e.target.value })}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </label>
      ) : (
        <div className="space-y-2">
          {!rules.length && <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">Add at least one product before submitting this discount.</div>}
          {rules.map((rule, index) => {
            const catalogue = catalogueProduct(rule.product_name);
            const cp = catalogue.cp === null || catalogue.cp === undefined || catalogue.cp === '' ? null : Number(catalogue.cp);
            const dp = catalogue.dp === null || catalogue.dp === undefined || catalogue.dp === '' ? null : Number(catalogue.dp);
            const hasCataloguePrices = Number.isFinite(cp) && Number.isFinite(dp);
            let preview = null;
            if (rule.product_name && hasCataloguePrices) {
              try {
                preview = resolveCampaignPricing({
                  campaign_type: 'discount',
                  conditions: { pricing_scope: 'products', product_pricing: [rule] },
                }, { ...catalogue, description: rule.product_name, cp, dp }, { member: false, quantity: 1 });
              } catch { preview = null; }
            }
            const effectiveCp = preview?.effective_cp ?? (rule.mode === 'custom' && rule.cp !== '' && rule.cp != null ? Number(rule.cp) : cp);
            const effectiveDp = preview?.effective_dp ?? (rule.mode === 'custom' && rule.dp !== '' && rule.dp != null ? Number(rule.dp) : dp);
            return (
              <div key={`${rule.product_name || 'row'}-${index}`} className="rounded-lg border border-slate-200 p-3">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_150px_auto]">
                  <label className="text-xs font-semibold text-slate-600">Product
                    <select value={rule.product_name || ''} onChange={e => updateRule(index, { product_name: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm">
                      <option value="">Select a catalogue product</option>
                      {names.map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Price rule
                    <select value={rule.mode || 'percentage'} onChange={e => updateRule(index, { mode: e.target.value })}
                      className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm">
                      <option value="percentage">Percentage</option><option value="custom">Custom CP / DP</option>
                    </select>
                  </label>
                  <button type="button" onClick={() => update({ product_pricing: rules.filter((_, i) => i !== index) })}
                    className="self-end rounded-md px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50" aria-label={`Remove ${rule.product_name || 'product'} pricing`}>Remove</button>
                </div>
                {rule.mode === 'custom' ? (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="text-xs font-semibold text-slate-600">Custom CP (blank keeps catalogue)
                      <input type="number" min="0" step="0.01" value={rule.cp ?? ''} onChange={e => updateRule(index, { cp: e.target.value === '' ? '' : Number(e.target.value) })}
                        className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm" />
                    </label>
                    <label className="text-xs font-semibold text-slate-600">Custom DP (blank keeps catalogue)
                      <input type="number" min="0" step="0.01" value={rule.dp ?? ''} onChange={e => updateRule(index, { dp: e.target.value === '' ? '' : Number(e.target.value) })}
                        className="mt-1 block w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm" />
                    </label>
                  </div>
                ) : (
                  <label className="mt-2 block text-xs font-semibold text-slate-600">Discount percentage
                    <div className="mt-1 flex max-w-xs items-center gap-2">
                      <input type="number" min="0" max="100" step="0.01" value={rule.percentage ?? ''} onChange={e => updateRule(index, { percentage: e.target.value === '' ? '' : Number(e.target.value) })}
                        className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm" /><span>%</span>
                    </div>
                  </label>
                )}
                <div className="mt-2 grid grid-cols-2 gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs">
                  <div><span className="text-slate-500">CP</span><div className="font-semibold text-slate-800">{priceText(cp)} <span className="font-normal text-slate-400">→</span> {priceText(effectiveCp)}</div></div>
                  <div><span className="text-slate-500">DP</span><div className="font-semibold text-slate-800">{priceText(dp)} <span className="font-normal text-slate-400">→</span> {priceText(effectiveDp)}</div></div>
                </div>
              </div>
            );
          })}
          <button type="button" onClick={() => update({ pricing_scope: 'products', product_pricing: [...rules, { product_name: '', mode: 'percentage', percentage: 0 }] })}
            className="rounded-md border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-500">Add product pricing</button>
        </div>
      )}
    </section>
  );
}

import { BRANCH_DETAILS } from './constants';

export const PUBLIC_DIRECTORY_SOURCE = 'https://dynapharmafrica.com/en/country-profiles/namibia/';
// The official public directory corroborates 15 entries. The other existing
// contacts are retained separately, not deleted or represented as verified.
export const ADDITIONAL_OUTLETS = BRANCH_DETAILS.filter(b => ['okongo', 'nkurenkuru'].includes(b.id))
  .map(b => ({ ...b, region: b.id === 'okongo' ? 'Ohangwena' : b.region }));
export const PUBLIC_OUTLETS = BRANCH_DETAILS.filter(b => !['okongo', 'nkurenkuru'].includes(b.id))
  .map(b => ({ ...b, town: ['townshop', 'hochland-park', 'khomasdal'].includes(b.id) ? 'Windhoek' : b.name }));
export const outletDirections = outlet => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${outlet.address}, ${outlet.name}, ${outlet.town || outlet.name}, Namibia`)}`;
export const filterPublicOutlets = (outlets, search) => outlets.filter(outlet =>
  `${outlet.name} ${outlet.town || ''}`.toLowerCase().includes(search.trim().toLowerCase()));

const key = value => String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
const PHOTOS = {
  NB1208: '/brand/arabica-coffee.webp',
  NB2802: '/brand/goats-milk.webp',
  NB2806: '/brand/spirulina.webp',
  NB7813: '/brand/tea-tree-lotion.webp',
};

export function getPackSize(product) {
  const recorded = product.pack_size || product.packSize;
  const text = recorded || String(product.name || '').match(
    /(\d+(?:\.\d+)?\s*(?:kg|mg|g|ml|litres?|liters?|l|capsules?|tablets?|tabs?|sachets?|pcs|'s|’s)(?:\s*[x×]\s*\d+(?:\.\d+)?\s*(?:kg|mg|g|ml|l|'s|’s))?)\s*\)?$/i
  )?.[1];
  if (!text) return 'Pack size not listed';
  return String(text).toLowerCase().replace(/\s*[x×]\s*/g, ' × ')
    .replace(/(\d)\s*(kg|mg|g|ml|litres?|liters?|l)\b/g, '$1 $2').trim();
}

export function getPublicCategories(products) {
  return [...new Set(products.map(p => p.category || 'General'))].sort();
}

export function buildPublicCatalog(prices, products) {
  if (!Array.isArray(prices) || !Array.isArray(products)) throw new Error('Invalid public catalogue response.');
  const byName = new Map();
  for (const p of products) {
    const name = key(p.name || p.description);
    byName.set(name, [...(byName.get(name) || []), p]);
  }
  const eligible = prices.filter(p => !p.is_package && p.catalogue_entry !== false
    && p.is_active !== false && !p.merged_into_id && (Number(p.dp) > 0 || Number(p.cp) > 0));
  const priceNameCounts = new Map();
  for (const p of eligible) priceNameCounts.set(key(p.description), (priceNameCounts.get(key(p.description)) || 0) + 1);
  return eligible.flatMap(price => {
    const matches = byName.get(key(price.description)) || [];
    const codeMatches = products.filter(p => price.product_code && [p.sku, p.product_code].includes(price.product_code));
    const db = codeMatches.length === 1 ? codeMatches[0] : matches.length === 1 ? matches[0] : null;
    if (db?.is_active === false) return [];
    const name = String(price.description || db?.name || '').trim().replace(/\s+/g, ' ');
    if (!name) return [];
    // Do not repeat the existing unverified "Health Supplements" classification.
    // Compact Powder stays visible and purchasable while its classification is reviewed.
    const category = /^COMPACT POWDER\b/i.test(name) ? 'Category under review' : db?.category || 'General';
    const photo = PHOTOS[price.product_code];
    return [{
      id: priceNameCounts.get(key(price.description)) === 1 && db ? db.id : String(price.id),
      priceEntryId: price.id,
      name, description: name, category,
      sku: db?.sku || price.product_code || '',
      product_code: price.product_code || '',
      pack_size: db?.pack_size || '',
      images: db?.images?.length ? db.images : photo ? [{ image_url: photo }] : [],
      dp: Number(price.dp) || 0, cp: Number(price.cp) || 0,
      cif: Number(price.cif) || 0, bv: Number(price.bv) || 0,
      hasPricing: true,
    }];
  });
}

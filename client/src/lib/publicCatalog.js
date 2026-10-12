import { api } from './api';
import { setLivePrices } from './pricing';
import { buildPublicCatalog } from './publicCatalogModel';
export * from './publicCatalogModel';

export async function loadPublicCatalog() {
  // Fail explicitly: a failed request must not masquerade as an empty catalogue.
  const [prices, products] = await Promise.all([api.prices.list(), api.products.list()]);
  const catalog = buildPublicCatalog(prices, products);
  setLivePrices(prices);
  return catalog;
}

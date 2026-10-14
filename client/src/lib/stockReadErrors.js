export const STOCK_READ_ERROR = 'dynapharm:stock-read-error';
export function reportStockReadError(endpoint, method, context, error) {
  if (method !== 'GET' || !context.startsWith('/stock') ||
      !/^\/(stock(?:\/|-)|supplier-imports|product-prices|products(?:\?|$)|prices(?:\/|\?|$)|branch\/(?:stock-summary|inventory|walkin-sales)|warehouse\/inventory)/.test(endpoint)) return;
  window.dispatchEvent(new CustomEvent(STOCK_READ_ERROR,{detail:{
    context,endpoint:endpoint.split('?')[0],status:error.status || null,message:error.message || 'Stock data could not be loaded',
  }}));
}

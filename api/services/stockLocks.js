export async function lockStockBatchTx(client, location, product, batchNo, expiryDate) {
  const expiry = expiryDate instanceof Date ? expiryDate.toISOString().slice(0, 10) : String(expiryDate || '').slice(0, 10);
  const key = JSON.stringify(['stock-batch',location,String(product).toLowerCase().trim(),batchNo || '',expiry]);
  // Lock the logical key even when there is no physical row to FOR UPDATE.
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
}

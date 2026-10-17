// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { withTransaction } from '../api/db.js';import { query } from "./helpers/owned-raw-database.js";
import { syncInventoryBalances, syncBranchProductBalance } from '../api/services/inventoryBalanceSync.js';
import { recomputeLocationBalances, recomputeInventoryBalanceTx } from '../api/services/stockEngine.js';

const prefix = `SYNC-${randomUUID()}`,branch = prefix.toLowerCase(),product = `${prefix}-product`;
const dates = [null, '2035-01-01', '2036-01-01'];
const rows = dates.map((expiry_date, i) => ({ branch_id: branch, product_name: product,
  batch_no: 'LOT', expiry_date, quantity: 999, unit_price: 999, id: `${prefix}-${i}` }));
async function cleanup() {
  for (const table of ['inventory_balances', 'stock_movements', 'branch_inventory_batches'])
  await query(`DELETE FROM ${table} WHERE product_name LIKE $1`, [`${prefix}%`]);
}
beforeAll(async () => {
  await cleanup();
  for (const [i, row] of rows.entries()) {
    const source = { id: `${prefix}-source-${i}`, cif_unit_cost: i + 2, dpc_unit_value: i + 7 };
    await query(`INSERT INTO branch_inventory_batches
      (id,branch_id,product_name,batch_no,expiry_date,quantity,unit_price,status,metadata)
      VALUES ($1,$2,$3,'LOT',$4::date,$5,999,'in_stock',$6::jsonb)`,
    [row.id, branch, product, row.expiry_date, i + 3, JSON.stringify({ cost_layers: [{ quantity: i + 3, source }] })]);
    await query(`INSERT INTO stock_movements
      (id,movement_type,product_name,batch_no,expiry_date,quantity,destination_location,destination_location_type,status)
      VALUES ($1,'branch_receipt',$2,'LOT',$3::date,100,$4,'branch','posted')`,
    [`${prefix}-move-${i}`, product, row.expiry_date, branch]);
  }
});
afterAll(cleanup);
async function balances() {
  return (await query(`SELECT * FROM inventory_balances WHERE location_id=$1 AND product_name=$2
    ORDER BY expiry_date NULLS FIRST`, [branch, product])).rows;
}
it('preserves unknown/separate expiries and received costs, ignoring stale payload prices and quantities', async () => {
  await syncInventoryBalances(rows);
  const found = await balances();
  expect(found).toHaveLength(3);
  expect(found.map((r) => Number(r.closing_qty))).toEqual([3, 4, 5]);
  expect(found.map((r) => Number(r.stock_value_cif))).toEqual([6, 12, 20]);
  expect(found.map((r) => Number(r.stock_value_dp))).toEqual([21, 32, 45]);
});
it('queues mixed legacy and central refreshes behind a real competing transaction', async () => {
  let release, locked;
  const gate = new Promise((resolve) => {release = resolve;});
  const acquired = new Promise((resolve) => {locked = resolve;});
  const holder = withTransaction(async (client) => {
    await recomputeInventoryBalanceTx(client, { locationType: 'branch', locationId: branch,
      productName: product, batchNo: 'LOT', expiryDate: null });
    locked();
    await gate;
  });
  await acquired;
  let completed = 0;
  const work = Promise.all([
  syncInventoryBalances(rows),
  recomputeLocationBalances('branch', branch),
  syncBranchProductBalance(branch, product)].
  map((p) => p.then(() => {completed++;})));
  try {
    // Observe actual PostgreSQL lock waits rather than assuming Promise.all overlaps.
    let waiting = 0;
    for (let i = 0; i < 100 && waiting < 2; i++) {
      waiting = Number((await query(`SELECT COUNT(*) n FROM pg_locks
        WHERE locktype='advisory' AND NOT granted
          AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`)).rows[0].n);
      if (waiting < 2) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(waiting).toBeGreaterThanOrEqual(2);
    expect(completed).toBe(0);
  } finally {release();}
  await holder;
  await work;
  expect(await balances()).toHaveLength(3);
  expect((await balances()).map((r) => Number(r.closing_qty))).toEqual([3, 4, 5]);
});
it('serializes case and whitespace variants before any normalized identity can commit twice', async () => {
  const variantProduct = `${prefix}-variant`;
  const key = { locationType: 'branch', locationId: branch, productName: variantProduct, batchNo: 'LOT', expiryDate: null };
  let release, locked;
  const gate = new Promise((resolve) => {release = resolve;});
  const acquired = new Promise((resolve) => {locked = resolve;});
  // No journal/physical evidence: this identity must remain zero owned stock.
  const holder = withTransaction(async (client) => {
    await recomputeInventoryBalanceTx(client, key);
    locked();
    await gate;
  });
  await acquired;
  const work = Promise.allSettled([branch, `${branch} `, ` ${branch.toUpperCase()}`].map((branch_id) =>
  syncInventoryBalances([{ branch_id, product_name: variantProduct, batch_no: 'LOT', expiry_date: null, quantity: 99 }])));
  try {
    let waiting = 0;
    for (let i = 0; i < 100 && waiting < 3; i++) {
      waiting = Number((await query(`SELECT COUNT(*) n FROM pg_locks
        WHERE locktype='advisory' AND NOT granted
        AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`)).rows[0].n);
      if (waiting < 3) await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(waiting).toBeGreaterThanOrEqual(3);
  } finally {release();}
  await holder;
  const outcomes = await work;
  expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
  const found = (await query(`SELECT * FROM inventory_balances
    WHERE LOWER(TRIM(location_id))=LOWER(TRIM($1)) AND product_name=$2`, [branch, variantProduct])).rows;
  expect(found).toHaveLength(1);
  expect(Number(found[0].closing_qty)).toBe(0);
  // Central writers must reuse rather than duplicate/relabel an existing key.
  await withTransaction((client) => recomputeInventoryBalanceTx(client, {
    ...key, locationId: `${branch} `
  }));
  const central = (await query(`SELECT location_id,closing_qty FROM inventory_balances
    WHERE LOWER(TRIM(location_id))=LOWER(TRIM($1)) AND product_name=$2`, [branch, variantProduct])).rows;
  expect(central).toHaveLength(1);
  expect(central[0].location_id).toBe(branch);
  expect(Number(central[0].closing_qty)).toBe(0);
});
it('refreshes vanished physical rows to zero without manufacturing stock from journal receipts', async () => {
  await query('DELETE FROM branch_inventory_batches WHERE id=$1', [rows[0].id]);
  await syncBranchProductBalance(branch, product, 'LOT');
  const found = await balances();
  expect(Number(found[0].inward_qty)).toBe(100);
  expect(Number(found[0].closing_qty)).toBe(0);
  expect(Number(found[1].closing_qty)).toBe(4);
});
it('refreshes a unique spelling variant using real physical stock and normalized movement evidence', async () => {
  const before = await balances();
  await syncInventoryBalances(rows.map((row) => ({ ...row, branch_id: ` ${branch.toUpperCase()} ` })));
  await syncBranchProductBalance(` ${branch.toUpperCase()} `, product);
  const after = await balances();
  expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
  expect(after.map((r) => Number(r.closing_qty))).toEqual([0, 4, 5]);
  expect(after.map((r) => Number(r.inward_qty))).toEqual([100, 100, 100]);
  expect(after.map((r) => Number(r.stock_value_dp))).toEqual([0, 32, 45]);
  expect(after.every((r) => r.last_movement_date && r.location_id === branch)).toBe(true);
});
it('refuses ambiguous historical identities without deleting or repricing them', async () => {
  await query(`INSERT INTO inventory_balances
    (id,location_type,location_id,product_name,batch_no,expiry_date,closing_qty,unit_dp)
    VALUES ($1,'branch',$2,$3,'LOT',NULL,123,456)`, [`${prefix}-duplicate`, branch, product]);
  const before = await balances();
  await expect(syncInventoryBalances([rows[0]])).rejects.toMatchObject({ code: 'STOCK_BALANCE_IDENTITY_REVIEW' });
  expect(await balances()).toEqual(before);
});

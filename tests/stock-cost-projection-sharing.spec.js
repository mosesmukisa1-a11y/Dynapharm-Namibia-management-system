// @vitest-environment node
import { it, expect, vi, beforeAll, afterAll, describe } from 'vitest';
import { randomUUID } from 'node:crypto';
import { recomputeInventoryBalanceTx, recomputeInventoryBalance, recomputeLocationBalances } from '../api/services/stockEngine.js';
import { withRequestTransaction, deferUntilCommit } from '../api/db.js';import { query } from "./helpers/owned-raw-database.js";

it('reuses explicitly transaction-owned layers without rereading physical stock', async () => {
  const client = { query: vi.fn(async () => ({ rows: [] })) };
  const layer = { locationType: 'warehouse', location: 'test-warehouse', productName: 'Shared', batchNo: 'B', expiryDate: '2030-01-01',
    qty: 3, unitCIF: 1.125, unitDPC: 4, availableQty: 3, onHandQty: 3 };
  await recomputeInventoryBalanceTx(client, { locationType: 'warehouse', locationId: layer.location,
    productName: layer.productName, batchNo: layer.batchNo, expiryDate: layer.expiryDate }, [layer]);
  expect(client.query.mock.calls.some(([sql]) => sql.includes('jsonb_agg'))).toBe(false);
  const insert = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO inventory_balances'));
  expect(insert[1][8]).toBe(3);expect(insert[1][12]).toBe(3.375);
  expect(layer.qty).toBe(3);expect(layer.unitCIF).toBe(1.125);
});

describe('typed balance ownership with a shared legacy location and lot', () => {
  const id = `test-typed-${randomUUID()}`,location = `${id}-warehouse`,product = `${id}-product`;
  const batch = 'SHARED-LOT',expiry = '2035-12-31';
  const key = (locationType) => ({ locationType, locationId: location, productName: product, batchNo: batch, expiryDate: expiry });
  beforeAll(async () => {
    // Physical and held quantities have distinct frozen costs for each owner.
    await query(`INSERT INTO stock_batches
      (id,barcode,description,batch_no,expiry_date,quantity,remaining_quantity,location,status,
       cif_unit_cost,dpc_unit_value,original_unit_cif,original_unit_dp)
      VALUES ($1,$1,$2,$3,$4,11,11,$5,'available',99,99,1.25,3)`,
    [id, product, batch, expiry, location]);
    await query(`INSERT INTO branch_inventory_batches
      (id,branch_id,product_name,batch_no,expiry_date,quantity,status,metadata)
      VALUES ($1,$2,$3,$4,$5,7,'in_stock',$6)`,
    [id, location, product, batch, expiry, JSON.stringify({ cost_layers: [
      { quantity: 7, source: { id: `${id}-received`, cif_unit_cost: 2.5, dpc_unit_value: 6 } }]
    })]);
    for (const [type, qty, cif, dp] of [['warehouse', 3, 4.5, 8], ['branch', 2, 7.25, 12]]) {
      await query(`INSERT INTO stock_segregated_batches
        (id,source_type,source_id,location,condition,quantity,snapshot,operation_id,line_id,purpose)
        VALUES ($1,$2,$3,$4,'damaged',$5,$6,$3,$3,'inspection')`,
      [`${id}-${type}`, type, id, location, qty, JSON.stringify({ product_name: product, batch_no: batch,
        expiry_date: expiry, source_batch_id: `${id}-${type}-source`, unit_cost: cif, unit_dp: dp })]);
      // Discovery evidence deliberately has unrelated journal costs.
      await query(`INSERT INTO stock_movements
        (id,product_name,batch_no,expiry_date,quantity,movement_type,destination_location,
         destination_location_type,status,unit_cif,unit_dp)
        VALUES ($1,$2,$3,$4,100,'positive_adjustment',$5,$6,'posted',99,99)`,
      [`${id}-${type}`, product, batch, expiry, location, type]);
    }
  });
  afterAll(async () => {
    await query('DELETE FROM inventory_balances WHERE product_name=$1', [product]);
    await query('DELETE FROM stock_movements WHERE product_name=$1', [product]);
    await query('DELETE FROM stock_segregated_batches WHERE operation_id=$1', [id]);
    await query('DELETE FROM branch_inventory_batches WHERE id=$1', [id]);
    await query('DELETE FROM stock_batches WHERE id=$1', [id]);
  });
  async function assertBalances() {
    const { rows } = await query(`SELECT * FROM inventory_balances WHERE location_id=$1
      AND product_name=$2 ORDER BY location_type`, [location, product]);
    expect(rows).toHaveLength(2);
    for (const [type, qty, available, held, cif, dp] of [
    ['branch', 9, 7, 2, 32, 66], ['warehouse', 14, 11, 3, 27.25, 57]])
    {
      const row = rows.find((r) => r.location_type === type);
      for (const [field, value] of Object.entries({ closing_qty: qty, on_hand_qty: qty, available_qty: available,
        quarantined_qty: held, reserved_qty: 0, in_transit_qty: 0, expired_qty: 0, missing_cost_qty: 0,
        missing_dp_qty: 0, stock_value_cif: cif, stock_value_dp: dp })) {
        expect(Number(row[field]), `${type}.${field}`).toBeCloseTo(value, 6);
      }
      expect(Number(row.unit_cif)).toBeCloseTo(cif / qty, 2);
      expect(Number(row.unit_dp)).toBeCloseTo(dp / qty, 2);
    }
  }
  it('single-key refresh reads only the requested physical and segregated owner', async () => {
    await query('DELETE FROM inventory_balances WHERE product_name=$1', [product]);
    await recomputeInventoryBalance(key('branch'));
    await recomputeInventoryBalance(key('warehouse'));
    await assertBalances();
  });
  it('whole-location refresh scopes shared layers before grouping, including repeated updates', async () => {
    await query('DELETE FROM inventory_balances WHERE product_name=$1', [product]);
    for (let repeat = 0; repeat < 2; repeat++) {
      await recomputeLocationBalances('warehouse', location);
      await recomputeLocationBalances('branch', location);
      await assertBalances();
    }
  });
});

it('coalesces repeated location work after commit without leaking keys across transactions', async () => {
  const run = vi.fn();
  for (let i = 0; i < 2; i++) await withRequestTransaction(async () => {
    expect(deferUntilCommit(run, 'same-location')).toBe(true);
    expect(deferUntilCommit(run, 'same-location')).toBe(true);
  });
  expect(run).toHaveBeenCalledTimes(2);
  const failed = vi.fn();
  await expect(withRequestTransaction(async () => {
    deferUntilCommit(failed, 'same-location');throw Error('rollback test');
  })).rejects.toThrow('rollback test');
  expect(failed).not.toHaveBeenCalled();
});

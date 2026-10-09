// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {recomputeInventoryBalanceTx} from '../api/services/stockEngine.js';
import {withRequestTransaction,deferUntilCommit} from '../api/db.js';

it('reuses explicitly transaction-owned layers without rereading physical stock',async()=>{
  const client={query:vi.fn(async()=>({rows:[]}))};
  const layer={location:'test-warehouse',productName:'Shared',batchNo:'B',expiryDate:'2030-01-01',
    qty:3,unitCIF:1.125,unitDPC:4,availableQty:3,onHandQty:3};
  await recomputeInventoryBalanceTx(client,{locationType:'warehouse',locationId:layer.location,
    productName:layer.productName,batchNo:layer.batchNo,expiryDate:layer.expiryDate},[layer]);
  expect(client.query.mock.calls.some(([sql])=>sql.includes('jsonb_agg'))).toBe(false);
  const insert=client.query.mock.calls.find(([sql])=>sql.includes('INSERT INTO inventory_balances'));
  expect(insert[1][8]).toBe(3);expect(insert[1][12]).toBe(3.375);
  expect(layer.qty).toBe(3);expect(layer.unitCIF).toBe(1.125);
});

it('coalesces repeated location work after commit without leaking keys across transactions',async()=>{
  const run=vi.fn();
  for(let i=0;i<2;i++)await withRequestTransaction(async()=>{
    expect(deferUntilCommit(run,'same-location')).toBe(true);
    expect(deferUntilCommit(run,'same-location')).toBe(true);
  });
  expect(run).toHaveBeenCalledTimes(2);
  const failed=vi.fn();
  await expect(withRequestTransaction(async()=>{
    deferUntilCommit(failed,'same-location');throw Error('rollback test');
  })).rejects.toThrow('rollback test');
  expect(failed).not.toHaveBeenCalled();
});

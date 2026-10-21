import {it,expect} from 'vitest';
import {ALL_BRANCH_IDS,branchSearchTerms,normalizeBranchSlug} from '../api/_lib/branchUtils.js';
import {buildStockReconciliation} from '../api/services/stockReadOnlyReconciliation.js';
it('normalizes every documented search alias to its canonical branch',()=>{
  for(const canonical of ALL_BRANCH_IDS)for(const alias of branchSearchTerms(canonical)){
    expect(normalizeBranchSlug(alias),`${alias} → ${canonical}`).toBe(canonical);
    expect(normalizeBranchSlug(` ${alias.toUpperCase()} `)).toBe(canonical);
  }
  expect(normalizeBranchSlug('windhoek_warehouse')).toBe('windhoek_warehouse');
});
it('keeps an explicitly warehouse-owned Windhoek hold separate from the Windhoek branch',async()=>{
  const source={id:'W',description:'NAMESPACE-ITEM',batch_no:'LOT',expiry_date:'2035-12-31',
    warehouse_id:'windhoek',location:'windhoek',remaining_quantity:5,cif_unit_cost:2,dpc_unit_value:7};
  const branch={id:'B',branch_id:'windhoek',product_name:source.description,batch_no:source.batch_no,
    expiry_date:source.expiry_date,quantity:3,unit_price:7,source_batch_id:'W',
    metadata:{cost_layers:[{quantity:3,source}]}};
  const report=await buildStockReconciliation({
    projection:{stock:[],branches:[branch],reservations:[],segregated:[
      {id:'H',location:'windhoek',source_type:'warehouse',quantity:5,condition:'damaged',
        snapshot:{product_name:source.description,batch_no:'LOT',expiry_date:source.expiry_date,
          source_batch_id:'W',unit_cost:2,unit_dp:7}}
    ]},
    balances:['warehouse','branch'].map(location_type=>({location_id:'windhoek',location_type,
      product_name:source.description,batch_no:'LOT',expiry_date:source.expiry_date,closing_qty:location_type==='warehouse'?5:3})),
    movements:[]
  });
  expect(report.rows).toHaveLength(2);
  expect(report.rows.find(r=>r.locationType==='warehouse')).toMatchObject({location:'windhoek',physicalQty:5,projectionMinusStored:0});
  expect(report.rows.find(r=>r.locationType==='branch')).toMatchObject({location:'townshop',physicalQty:3,projectionMinusStored:0});
});
it('counts a transfer between distinct namespaces even when the location spelling is identical',async()=>{
  const report=await buildStockReconciliation({
    projection:{stock:[],branches:[],reservations:[],segregated:[]},balances:[],
    movements:[{source_location:'ondangwa',destination_location:'ondangwa',
      source_location_type:'warehouse',destination_location_type:'branch',
      movement_type:'branch_receipt',quantity:4,product_name:'NAMESPACE-TRANSFER',batch_no:'LOT'}]
  });
  expect(report.rows.find(r=>r.locationType==='warehouse').movementNet).toBe(-4);
  expect(report.rows.find(r=>r.locationType==='branch').movementNet).toBe(4);
});

import {describe,it,expect} from 'vitest';
import {buildBranchPhysicalStockReport} from '../client/src/lib/branchPhysicalStockReport.js';

const layer=(quantity,available,quarantined,condition='saleable',unit=7)=>({
  product_name:'TEST-ITEM',batch_no:'TEST-LOT',expiry_date:'2035-12-31',
  quantity,available_qty:available,quarantined_qty:quarantined,reserved_qty:0,condition,
  unit_dp:unit,dp_value:unit==null?0:quantity*unit,
});
describe('branch physical report original source snapshot',()=>{
  it('includes the held unit without reducing owned stock or repricing original DP',()=>{
    const html=buildBranchPhysicalStockReport({closing_qty:23,available_qty:22,quarantined_qty:1,
      physical_inventory:[layer(20,20,0),layer(2,2,0),layer(1,0,1,'damaged')]});
    expect(html).toContain('Owned: 23 · Available: 22 · Reserved: 0 · Quarantined: 1');
    expect(html).toContain('damaged');expect(html).toMatch(/N\$ 161[,.]00/);
    expect(html).toMatch(/N\$ 7[,.]00/);
  });
  it('distinguishes valid zero DP from missing original DP',()=>{
    const html=buildBranchPhysicalStockReport({closing_qty:2,available_qty:2,quarantined_qty:0,
      physical_inventory:[layer(1,1,0,'saleable',0),layer(1,1,0,'saleable',null)]});
    expect(html).toContain('Incomplete original DP evidence: 1 units');
    expect(html).toContain('Unknown');expect(html).toMatch(/N\$ 0[,.]00/);
  });
  it('prints quarantined-only and reserved-only stock with zero available units',()=>{
    for(const reserved of [false,true]){
      const row={...layer(1,0,reserved?0:1,reserved?'saleable':'damaged'),reserved_qty:reserved?1:0};
      const html=buildBranchPhysicalStockReport({closing_qty:1,available_qty:0,quarantined_qty:reserved?0:1,physical_inventory:[row]});
      expect(html).toContain('Owned: 1 · Available: 0');
      expect(html).toMatch(/N\$ 7[,.]00/);
    }
  });
  it('fails explicitly for unavailable or inconsistent snapshots and escapes product names',()=>{
    expect(()=>buildBranchPhysicalStockReport(null)).toThrow('unavailable');
    expect(()=>buildBranchPhysicalStockReport({closing_qty:3,available_qty:2,quarantined_qty:0,
      physical_inventory:[layer(2,2,0)]})).toThrow('reconcile');
    const row={...layer(1,1,0),product_name:'<script>alert(1)</script>'};
    expect(buildBranchPhysicalStockReport({closing_qty:1,available_qty:1,quarantined_qty:0,physical_inventory:[row]})).toContain('&lt;script&gt;');
  });
});

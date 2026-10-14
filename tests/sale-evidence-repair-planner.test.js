// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  planSaleEvidenceRepair, readSaleRepairReadiness, applySaleRepairPlanTx,
} from '../api/services/saleEvidenceRepair.js';

function fixture({linked=false}={}) {
  return {
    sales:[{id:'sale-1',sale_number:'receipt-1',branch_id:'townshop',
      sale_date:'2026-10-09T11:05:53Z',total:810,
      items:[{product_name:'Original product',quantity:1,dpPrice:623}]}],
    movements:[{id:'movement-1',reference_id:'sale-1',source_location:'townshop',
      product_name:'Original product',batch_no:'original-batch',quantity:1,
      movement_type:'prescription_sale',metadata:null}],
    allocations:[{movement_id:'movement-1',sale_reference:'sale-1',branch_id:'townshop',
      product_name:'Original product',quantity:1,
      snapshot:{financial_dp_unit:623,revenue_total:810,...(linked?{branch_movement_id:'mirror-1'}:{})}}],
    audits:[],
    mirrors:linked?[{id:'mirror-1',reference:'sale-1',branch_id:'townshop',
      product_name:'Original product',batch_no:'original-batch',quantity:1,
      type:'prescription_sale',metadata:null}]:[],
  };
}

describe('exact historical sale evidence planning',()=>{
  it('leaves uncaptured mirror identities unresolved without proximity matching',()=>{
    const data=fixture();
    data.mirrors=fixture({linked:true}).mirrors;
    const plan=planSaleEvidenceRepair(data);
    expect(plan.eligible).toHaveLength(1);
    expect(plan.eligible[0].lines[0].mirrorId).toBeNull();
    expect(plan.review[0].reason).toMatch(/identity was not captured/);
  });
  it('plans independent mirror-only repairs when the central evidence is complete',()=>{
    const data=fixture({linked:true});
    const initial=planSaleEvidenceRepair(data);
    data.movements[0].metadata={sale_evidence:initial.eligible[0].lines[0].patch};
    data.audits=[{record_id:'sale-1',event_type:'sale_created'}];
    const plan=planSaleEvidenceRepair(data);
    expect(plan.eligible).toHaveLength(1);
    expect(plan.eligible[0].lines[0].patch).toEqual({});
    expect(plan.eligible[0].lines[0].mirrorPatch.dp_value).toBe(623);
  });
  it.each(['branch_id','reference','product_name','batch_no','type','quantity'])(
    'rejects a captured mirror with conflicting %s',field=>{
      const data=fixture({linked:true});
      data.mirrors[0][field]=field==='quantity'?2:'different-original';
      const plan=planSaleEvidenceRepair(data);
      expect(plan.eligible).toHaveLength(0);
      expect(plan.review.some(r=>r.reason.includes('mirror identity conflicts'))).toBe(true);
    });
  it('does not replace conflicting nonblank mirror evidence, including zero',()=>{
    const data=fixture({linked:true});
    data.mirrors[0].metadata={sale_evidence:{dp_value:0}};
    const plan=planSaleEvidenceRepair(data);
    expect(plan.eligible).toHaveLength(0);
    expect(plan.review.some(r=>r.reason.includes('mirror evidence conflicts'))).toBe(true);
  });
  it('rejects receipt identity conflicts on the central movement',()=>{
    const data=fixture();
    data.movements[0].metadata={sale_evidence:{receipt_no:'another-receipt'}};
    expect(planSaleEvidenceRepair(data).eligible).toHaveLength(0);
  });
  it('checks original quantities even when the allocation already captured DP',()=>{
    const data=fixture();
    data.sales[0].items[0].quantity=2;
    const plan=planSaleEvidenceRepair(data);
    expect(plan.eligible).toHaveLength(0);
    expect(plan.review[0].reason).toMatch(/quantities do not match/);
  });
  it('includes allocation-only repairs after DP is recovered from exact original items',()=>{
    const data=fixture({linked:true});
    const line=planSaleEvidenceRepair(data).eligible[0].lines[0];
    data.movements[0].metadata={sale_evidence:line.patch};
    data.mirrors[0].metadata={sale_evidence:line.mirrorPatch};
    data.allocations[0].snapshot.financial_dp_unit=null;
    data.audits=[{record_id:'sale-1',event_type:'sale_created'}];
    expect(planSaleEvidenceRepair(data).eligible[0].lines[0].allocationPatch).toEqual({financial_dp_unit:623});
  });
  it('fingerprints original mirror evidence as well as the central movement',()=>{
    const data=fixture({linked:true});
    const before=planSaleEvidenceRepair(data);
    data.mirrors[0].metadata={sale_evidence:{dp_value:623}};
    expect(planSaleEvidenceRepair(data).fingerprint).not.toBe(before.fingerprint);
  });
  it('never makes a legacy prescription movement eligible without its original completion source',()=>{
    const data=fixture();
    data.sales=[];
    const plan=planSaleEvidenceRepair(data);
    expect(plan.eligible).toEqual([]);
    expect(plan.review[0].reason).toMatch(/prescription\/legacy evidence/);
  });
});

describe('repair readiness gates',()=>{
  const ready={database_name:'isolated',database_oid:'123',server_address:'127.0.0.1',
    server_port:5432,has_source_key:true,has_source_key_unique:true};
  function client(row=ready){
    return {queries:[],async query(sql){this.queries.push(sql);return {rows:[row]};}};
  }
  it('reports missing column/index without attempting schema changes',async()=>{
    const db=client({...ready,has_source_key:false,has_source_key_unique:false});
    const result=await readSaleRepairReadiness(db);
    expect(result.schemaReady).toBe(false);
    expect(result.blockers).toHaveLength(2);
    expect(db.queries.every(sql=>sql.trim().startsWith('SELECT'))).toBe(true);
  });
  it('blocks apply before the first write if the audit index is unavailable',async()=>{
    const db=client({...ready,has_source_key_unique:false});
    await expect(applySaleRepairPlanTx(db,{eligible:[]})).rejects.toThrow(/Repair blocked/);
    expect(db.queries).toHaveLength(1);
  });
  it('rejects another database even when its sale rows could be identical',async()=>{
    const db=client();
    await expect(applySaleRepairPlanTx(db,{eligible:[],readiness:{databaseFingerprint:'another-database'}}))
      .rejects.toThrow(/target differs/);
    expect(db.queries).toHaveLength(1);
  });
});

describe('repair command validation before database access',()=>{
  it.each([
    [['--reference'],/Missing value/],
    [['--reference','--apply'],/Missing value/],
    [['--reference','one','--reference','two'],/Duplicate argument/],
    [['--surprise'],/Unknown argument/],
    [['--reference','one','--apply'],/backup-verified/],
  ])('rejects unsafe arguments %j',(args,message)=>{
    const child=spawnSync(process.execPath,['scripts/repair-sale-evidence.mjs',...args],{encoding:'utf8'});
    expect(child.status).toBe(1);
    expect(child.stderr).toMatch(message);
  });
});

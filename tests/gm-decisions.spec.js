// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import {query,getOne} from '../api/db.js';
import cash from '../api/branch/cash-movements.js';
import leave from '../api/hr/leaves.js';
import field from '../api/field_program_requests.js';
import petty from '../api/finance/petty-cash.js';
import rent from '../api/finance/rent-payments.js';
import salary from '../api/hr/salary-ledger.js';
import campaign from '../api/campaigns.js';
import staff from '../api/hr/staff-change-requests.js';
import bonus from '../api/finance/distributor-bonuses.js';
const gm={sub:'GM-SYNTH',id:'GM-SYNTH',username:'synthetic-gm',fullName:'Synthetic GM',role:'gm'};
const forbidden={sub:'GM-BRANCH',role:'branch_manager',branch:'townshop'};
async function call(h,url,body,method='PUT',user=gm) {
 const out={status:200};
 const res={setHeader(){},getHeader(){},status(s){out.status=s;return this;},json(b){out.body=b;return this;},end(){return this;}};
 await h({method,url,body,user,headers:{host:'isolated.test'}},res);
 return out;
}
async function seed(table,values) {
 const columns=(await query(`SELECT column_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`,[table])).rows;
 if(!columns.length)throw Error('Repository schema missing authoritative table: '+table);
 const keys=Object.keys(values).filter(k=>columns.some(c=>c.column_name===k));
 const required=columns.filter(c=>c.is_nullable==='NO' && !c.column_default && !keys.includes(c.column_name));
 if(required.length)throw Error('Fixture needs '+table+': '+required.map(c=>c.column_name).join(','));
 await query(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,keys.map(k=>values[k]));
}
const cases=[
 {name:'cash movement',h:cash,table:'branch_cash_movements',url:id=>'/api/branch/cash-movements/'+id,
  values:{branch_id:'townshop',type:'expense',amount:10,metadata:'{"status":"pending"}'},status:r=>r.metadata.status},
 {name:'HR leave',h:leave,table:'hr_leave_requests',url:id=>'/api/hr/leaves?id='+id,
  values:{employee_name:'Synthetic employee',start_date:'2099-01-01',end_date:'2099-01-02',leave_type:'annual',status:'pending'}},
 {name:'field stock',h:field,table:'field_program_requests',url:()=>'/api/field_program_requests',
  values:{activity_type:'Synthetic outreach',location:'Synthetic location',branch:'townshop',date:'2099-01-01',status:'pending',requires_approval:true,products:'[]'}},
 {name:'rent edit',h:rent,table:'rent_edit_requests',url:id=>'/api/finance/rent-payments/edit-requests/'+id,method:'PATCH',
  values:{rent_id:'GM-RENT',proposed_changes:'{"rent_amount":25}',requested_by:'synthetic-finance',status:'pending'},action:true},
 {name:'salary edit',h:salary,table:'salary_edit_requests',url:id=>'/api/hr/salary-ledger/edit-requests/'+id,method:'PATCH',
  values:{salary_id:'GM-SALARY',action_type:'edit',proposed_changes:'{"basic_salary":125}',requested_by:'synthetic-finance',status:'pending'},action:true},
 {name:'campaign review',h:campaign,table:'campaigns',url:id=>'/api/campaigns/'+id+'/review',method:'PATCH',
  values:{name:'Synthetic campaign',campaign_name:'Synthetic campaign',discount_type:'percentage',discount_value:1,type:'discount',status:'pending_approval',start_date:'2099-01-01',end_date:'2099-01-02'},action:true,
  target:s=>s==='approved'?'upcoming':s},
];
beforeAll(async()=>{
 await call(rent,'/api/finance/rent-payments',{},'GET');await call(salary,'/api/hr/salary-ledger',{},'GET');await call(bonus,'/api/finance/distributor-bonuses/delete-requests',{},'GET');
 await seed('branch_rent_payments',{id:'GM-RENT',branch_name:'Synthetic branch',rent_amount:10});
 await seed('salary_ledger',{id:'GM-SALARY',name:'Synthetic employee',basic_salary:100});
});
for(const [i,c] of cases.entries())it(c.name+' approves/rejects with safe retries, concurrency and forbidden-role denial',async()=>{
 for(const status of ['approved','rejected']) {
  const id=c.name==='HR leave'?(status==='approved'?900011:900012):'GM-TEST-'+i+'-'+status;
  await seed(c.table,{...c.values,id});
  const body=c.action?{action:status==='approved'?'approve':'reject',review_notes:'Synthetic decision'}:{id,status,notes:'Synthetic decision',approved_by:'forged'};
  expect((await call(c.h,c.url(id),body,c.method,forbidden)).status).toBe(403);
  const result=await Promise.all([call(c.h,c.url(id),body,c.method),call(c.h,c.url(id),body,c.method)]);
  expect(result.map(r=>r.status),JSON.stringify(result)).toEqual([200,200]);
  const row=await getOne(`SELECT * FROM ${c.table} WHERE id=$1`,[id]);
  expect(c.status?c.status(row):row.status).toBe(c.target?c.target(status):status);
  if(c.name==='HR leave'||c.name==='field stock')expect(row.approved_by).toBe(gm.sub);
  const reverse=c.action?{action:status==='approved'?'reject':'approve'}:{id,status:status==='approved'?'rejected':'approved'};
  expect((await call(c.h,c.url(id),reverse,c.method)).status).toBe(409);
 }
});
it('petty cash approves only the GM stage and never issues money on approval',async()=>{
 await seed('petty_cash_requests',{id:'GM-PC',branch_id:'townshop',location:'townshop',amount:10,purpose:'Synthetic',requested_by:'synthetic',status:'pending_gm'});
 const url='/api/finance/petty-cash/requests/GM-PC/approve';
 expect((await call(petty,url,{},'PUT',forbidden)).status).toBe(403);
 expect((await call(petty,url,{})).status).toBe(200);expect((await call(petty,url,{})).status).toBe(200);
 expect((await getOne("SELECT status FROM petty_cash_requests WHERE id='GM-PC'")).status).toBe('pending_director');
 expect((await call(petty,'/api/finance/petty-cash/requests/GM-PC/reject',{})).status).toBe(403);
 await seed('petty_cash_requests',{id:'GM-PC-R',branch_id:'townshop',location:'townshop',amount:10,purpose:'Synthetic',requested_by:'synthetic',status:'pending_gm'});
 expect((await call(petty,'/api/finance/petty-cash/requests/GM-PC-R/reject',{})).status).toBe(200);
});
it('staff and bonus rejection routes work without applying requested changes',async()=>{
 await seed('hr_staff_change_requests',{id:900021,request_type:'add',full_name:'Synthetic employee',employee_name:'Synthetic employee',requested_by:'synthetic',status:'pending',data:'{}',proposed_data:'{}'});
 expect((await call(staff,'/api/hr/staff-change-requests',{id:900021,status:'rejected'},'PUT')).status).toBe(200);
 await seed('bonus_period_delete_requests',{id:'GM-BONUS-R',period:'2099-01',requested_by:'synthetic',status:'pending_gm'});
 const r=await call(bonus,'/api/finance/distributor-bonuses/delete-request/GM-BONUS-R',{action:'reject'},'PUT');
 expect(r.status,JSON.stringify(r.body)).toBe(200);
});
it('staff addition approval is atomic and cannot create the employee twice',async()=>{
 await seed('hr_staff_change_requests',{id:900022,request_type:'add',full_name:'GM Synthetic New',position:'Synthetic',department:'Synthetic',branch:'townshop',requested_by:'synthetic',status:'pending'});
 const r=await call(staff,'/api/hr/staff-change-requests',{id:900022,status:'approved'},'PUT');
 expect(r.status,JSON.stringify(r.body)).toBe(200);
 expect((await getOne("SELECT COUNT(*) n FROM employees WHERE full_name='GM Synthetic New'")).n).toBe('1');
 expect((await call(staff,'/api/hr/staff-change-requests',{id:900022,status:'approved'},'PUT')).status).toBe(409);
 expect((await getOne("SELECT COUNT(*) n FROM employees WHERE full_name='GM Synthetic New'")).n).toBe('1');
});
it('bonus deletion approval rolls back its decision if deletion fails and can be retried',async()=>{
 await seed('distributor_bonuses',{id:'GM-BONUS-ROW',nb_number:'SYNTHETIC-NB',full_name:'Synthetic member',distributor_name:'Synthetic member',period:'2099-02',earned_amount:10,total_earned:10});
 await seed('bonus_period_delete_requests',{id:'GM-BONUS-A',period:'2099-02',requested_by:'synthetic',status:'pending_gm'});
 const url='/api/finance/distributor-bonuses/delete-request/GM-BONUS-A';
 expect((await call(bonus,url,{action:'approve'},'PUT',forbidden)).status).toBe(403);
 await query(`CREATE FUNCTION gm_bonus_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic bonus deletion failure'; END $$;
 CREATE TRIGGER gm_bonus_failure BEFORE DELETE ON distributor_bonuses FOR EACH ROW EXECUTE FUNCTION gm_bonus_failure()`);
 try{
  expect((await call(bonus,url,{action:'approve'},'PUT')).status).toBe(500);
  expect((await getOne("SELECT status FROM bonus_period_delete_requests WHERE id='GM-BONUS-A'")).status).toBe('pending_gm');
  expect((await getOne("SELECT COUNT(*) n FROM distributor_bonuses WHERE id='GM-BONUS-ROW'")).n).toBe('1');
 }finally{await query('DROP TRIGGER gm_bonus_failure ON distributor_bonuses; DROP FUNCTION gm_bonus_failure()');}
 expect((await call(bonus,url,{action:'approve'},'PUT')).status).toBe(200);
 expect((await getOne("SELECT COUNT(*) n FROM distributor_bonuses WHERE id='GM-BONUS-ROW'")).n).toBe('0');
});
it('salary multi-write failure rolls back decision and target change together',async()=>{
 await seed('salary_edit_requests',{id:'GM-ROLLBACK',salary_id:'GM-SALARY',action_type:'edit',proposed_changes:'{"basic_salary":777}',requested_by:'synthetic',status:'pending'});
 const before=await getOne("SELECT basic_salary FROM salary_ledger WHERE id='GM-SALARY'");
 await query(`CREATE FUNCTION gm_decision_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='GM-ROLLBACK' AND NEW.status='approved' THEN RAISE EXCEPTION 'Synthetic review failure'; END IF; RETURN NEW; END $$;
 CREATE TRIGGER gm_decision_failure BEFORE UPDATE ON salary_edit_requests FOR EACH ROW EXECUTE FUNCTION gm_decision_failure()`);
 try {
  expect((await call(salary,'/api/hr/salary-ledger/edit-requests/GM-ROLLBACK',{action:'approve'},'PATCH')).status).toBe(500);
  expect((await getOne("SELECT basic_salary FROM salary_ledger WHERE id='GM-SALARY'"))).toEqual(before);
  expect((await getOne("SELECT status FROM salary_edit_requests WHERE id='GM-ROLLBACK'")).status).toBe('pending');
 }finally{await query('DROP TRIGGER gm_decision_failure ON salary_edit_requests; DROP FUNCTION gm_decision_failure()');}
 expect((await call(salary,'/api/hr/salary-ledger/edit-requests/GM-ROLLBACK',{action:'approve'},'PATCH')).status).toBe(200);
});

import fs from 'node:fs/promises';
import pg from 'pg';
const m=JSON.parse(await fs.readFile('generated-artifacts/client-history/environment.json','utf8'));
if(!m.disposable||!/^stock_audit_[a-f0-9]{32}$/.test(m.isolatedDatabase))throw Error('Disposable environment required');
const u=new URL(process.env.DATABASE_URL);
if(u.pathname==='/'+m.isolatedDatabase)throw Error('Fixture database must differ from application database');
u.pathname='/'+m.isolatedDatabase;u.search='';
const pool=new pg.Pool({connectionString:u.toString()});
async function seed(table,values){
 const columns=(await pool.query("SELECT column_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",[table])).rows;
 const keys=Object.keys(values).filter(k=>columns.some(c=>c.column_name===k));
 const missing=columns.filter(c=>c.is_nullable==='NO'&&!c.column_default&&!keys.includes(c.column_name));
 if(missing.length)throw Error('Missing fixture fields '+table+': '+missing.map(c=>c.column_name).join(','));
 await pool.query(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,keys.map(k=>values[k]));
}
try{
 await pool.query('BEGIN');
 for(const [s,n] of [['A',1],['R',2]]){
  await seed('branch_cash_movements',{id:'GMUI-CASH-'+s,branch_id:'townshop',type:'expense',amount:10,description:'Synthetic GM cash '+s,metadata:'{"status":"pending"}'});
  await seed('hr_leave_requests',{id:910000+n,employee_name:'GM Synthetic Leave '+s,leave_type:'annual',start_date:'2099-01-01',end_date:'2099-01-02',reason:'Synthetic review',status:'pending',created_by:'UI-GM'});
  await seed('finance_cash_requests',{id:'GMUI-FIN-'+s,request_number:'GMUI-FIN-'+s,branch:'townshop',amount:10,purpose:'Synthetic GM finance '+s,requested_by:'ui_branch_a',status:'finance_reviewed',data:'{}'});
  await seed('stock_requests',{id:'GMUI-STOCK-'+s,request_number:'GMUI-STOCK-'+s,request_type:'branch_request',requesting_branch:'townshop',branch_id:'townshop',branch:'townshop',destination_branch_id:'townshop',requested_by:'UI-BRANCH-A',status:'pending',items:'[]',data:'{}'});
  await seed('field_program_requests',{id:'GMUI-FIELD-'+s,activity_type:'Synthetic outreach '+s,location:'Synthetic location',branch:'townshop',date:'2099-01-01',status:'pending',requires_approval:true,products:'[]'});
 }
 await seed('stock_batches',{id:'GMUI-BATCH',product_name:'TEST-ITEM',batch_no:'GMUI-BATCH',location:'windhoek_warehouse',quantity:10,received_quantity:10,remaining_quantity:10,unit_price:2,expiry_date:'2035-01-01',status:'in_stock'});
 for(const s of ['A','B','R'])await seed('stock_adjustments',{id:'GMUI-ADJ-'+s,adj_number:'GMUI-ADJ-'+s,target_type:'warehouse',target_id:'GMUI-BATCH',product_name:'TEST-ITEM',location:'windhoek_warehouse',field_to_adjust:'expiry_date',old_value:'2035-01-01',new_value:'2036-01-01',reason:'Synthetic GM metadata review '+s,requested_by:'UI-STOCK',status:'pending'});
 await pool.query('COMMIT');
 await fs.mkdir('generated-artifacts/gm-approvals',{recursive:true});
 await fs.writeFile('generated-artifacts/gm-approvals/fixtures.json',JSON.stringify({disposable:true,cash:['GMUI-CASH-A','GMUI-CASH-R'],leave:[910001,910002],finance:['GMUI-FIN-A','GMUI-FIN-R'],stock:['GMUI-STOCK-A','GMUI-STOCK-R'],field:['GMUI-FIELD-A','GMUI-FIELD-R'],adjustments:['GMUI-ADJ-A','GMUI-ADJ-B','GMUI-ADJ-R'],baseline:{warehouse:10,movements:0,payments:0,orders:0}},null,2));
 console.log('Seeded isolated GM approval fixtures only.');
}catch(error){await pool.query('ROLLBACK');throw error;}finally{await pool.end();}

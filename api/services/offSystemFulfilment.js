import {getMany,getOne} from '../db.js';
import {getBranchScope} from '../_lib/auth.js';
import {branchSearchTerms} from '../_lib/branchUtils.js';
import {getPackageComponents} from '../_lib/packageDefinitions.js';
import {deny} from './clientHistoryAccess.js';

export function authorizePending(user,branch){
  if(!user)deny('Authentication required',401);
  if(!['admin','branch_manager','dispenser'].includes(user.role))deny('Branch dispensing access required');
  if(!branch)deny('Select a branch',400);
  if(user.role==='admin')return;
  const scope=getBranchScope(user);
  if(!scope.branches?.some(b=>branchSearchTerms(b).includes(branch)))deny('Form is outside your assigned branch');
}
export async function historyQuantities(e){
  const evidence=await getMany("SELECT items FROM client_dispense_evidence WHERE encounter_id=$1 AND mode='live'",[e.id]);
  const issued=new Map();
  for(const row of evidence)for(const i of row.items)issued.set(i.name,(issued.get(i.name)||0)+Number(i.quantity));
  return (e.data.medicines||[]).map(m=>({...m,liveDispensed:issued.get(m.name)||0,
    dispensed:Number(m.alreadyDispensed||0)+(issued.get(m.name)||0),
    outstanding:Math.max(0,Number(m.quantity)-Number(m.alreadyDispensed||0)-(issued.get(m.name)||0))}));
}
export async function pendingForm(e){
  const client=await getOne('SELECT id,full_name,data FROM clients WHERE id=$1',[e.client_id]);
  // A captured NB is not itself approval: require a current active membership
  // and approved agreement before the saved client's NB can receive DP prices.
  const code=String(client?.data?.nbNumber||'').trim().toUpperCase();
  const member=code?await getOne(`SELECT d.distributor_code FROM distributors d
    WHERE UPPER(TRIM(d.distributor_code))=$1 AND d.status='active'
    AND EXISTS(SELECT 1 FROM distributor_agreements a WHERE UPPER(TRIM(a.nb_number))=$1 AND a.status='approved') LIMIT 1`,[code]):null;
  const customerType=member?'member':'non-member';
  const prices=await getMany('SELECT description,dp,cp,is_package FROM live_product_prices');
  const map=new Map(prices.map(p=>[p.description.toLowerCase().trim(),p]));
  const quantities=await historyQuantities(e);
  for(const item of quantities){
    const pkg=getPackageComponents(item.name);
    const products=pkg?pkg.products:[{name:item.name,quantity:1}];
    let total=0,error='';
    if(item.unit!=='unit')error='Non-base units require source clarification before dispensing';
    if(!map.has(item.name.toLowerCase().trim()))error='Medicine is not in the active catalogue';
    for(const comp of products){
      const price=Number(map.get(comp.name.toLowerCase().trim())?.[member?'dp':'cp']);
      if(!Number.isFinite(price)||price<=0)error='Current selling price is missing; resolve before dispensing';
      total+=Math.round(price*100)/100*Number(comp.quantity||1);
    }
    item.unitPrice=error?null:Math.round(total*100)/100;item.issueError=error||null;
  }
  return {...e,client_name:client?.full_name,quantities,customerType,nbNumber:member?.distributor_code||null,
    pricingLabel:member?'Approved member — DP':'Non-member — CP'};
}

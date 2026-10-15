import {query,withTransaction,publishRealtimeEvent} from '../db.js';
import {businessToday} from '../../shared/price-list-import.js';

const fields=['dp','cp','cif','bv'];
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
const date=value=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
const prices=row=>Object.fromEntries(fields.map(k=>[k,Number(row[k])]));
const same=(a,b)=>fields.every(k=>Number(a[k])===Number(b[k]));
export function authorizePriceOperator(user){
  if(!user)throw fail('Authentication required',401);
  if(!['gm','admin','superadmin','super_admin'].includes(String(user.role).toLowerCase()))
    throw fail('General Manager permission required',403);
  const id=user.id || user.sub;
  if(!id)throw fail('A stable staff session is required',403);
  return {id:String(id),name:user.fullName || user.username || String(id)};
}
function validateInput(input){
  if(input?.scope!=='global'||input.branch_id||input.branchId)
    throw fail('Only the existing global pricebook is supported. Branch-specific pricing requires separate policy and implementation.',422);
  if(input.confirmApproval!==true)throw fail('Explicit GM price approval is required',422);
  if(typeof input.approvalReference!=='string' || !/^[A-Za-z0-9][A-Za-z0-9 ._:/-]{2,119}$/.test(input.approvalReference))
    throw fail('Enter a 3–120 character approval reference; no personal or clinical data.',422);
}
function validateId(id){
  if(!/^[1-9]\d{0,9}$/.test(String(id))||Number(id)>2147483647)throw fail('A numeric existing-product schedule ID is required; staged additions need separate review.',422);
}
function replay(audit,actor,input){
  if(audit.actor_id!==actor.id||audit.approval_reference!==input.approvalReference)
    throw fail('Already processed under a different actor or approval reference. Review the audit.',409);
  return {success:true,replayed:true,audit};
}
async function live(client,id){
  return (await client.query('SELECT *,updated_at::text AS version FROM product_prices WHERE id=$1 FOR UPDATE',[id])).rows[0];
}
async function update(client,row,p,actor){
  await client.query(`UPDATE product_prices SET dp=$1,cp=$2,cif=$3,bv=$4,updated_by=$5,updated_at=NOW() WHERE id=$6`,
    [...fields.map(k=>p[k]),actor.name,row.id]);
  return live(client,row.id);
}
async function audit(client,historyId,action,reverses,row,updated,actor,input){
  return (await client.query(`INSERT INTO manual_price_actions(history_id,action,reverses_history_id,
    scope,actor_id,actor_name,approval_reference,before_prices,after_prices,live_version)
    VALUES($1,$2,$3,'global',$4,$5,$6,$7,$8,$9) RETURNING *`,
    [historyId,action,reverses,actor.id,actor.name,input.approvalReference,JSON.stringify(prices(row)),JSON.stringify(prices(updated)),updated.version])).rows[0];
}
export async function listManualPrices(user){
  authorizePriceOperator(user);
  const pending=(await query(`SELECT h.*,p.product_code,p.dp AS live_dp,p.cp AS live_cp,p.cif AS live_cif,p.bv AS live_bv,
    'global' AS scope FROM product_price_history h JOIN product_prices p ON p.id=h.product_id
    WHERE h.status='pending' AND p.merged_into_id IS NULL ORDER BY h.effective_from,h.id`)).rows;
  const actions=(await query(`SELECT a.*,h.product_id,h.description FROM manual_price_actions a
    JOIN product_price_history h ON h.id=a.history_id ORDER BY a.id DESC LIMIT 100`)).rows;
  return {success:true,today:businessToday(),timezone:'Africa/Windhoek',pending,actions,
    limitations:'Existing global products only. Staged additions and branch-specific prices require manual policy review. Automatic activation remains disabled.'};
}
export async function activateManualPrice(id,input,user){
  const actor=authorizePriceOperator(user);validateId(id);validateInput(input);
  const result=await withTransaction(async client=>{
    // Same transaction lock as imports, direct edits and the legacy activator.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('price-import-catalogue'))");
    const done=(await client.query("SELECT * FROM manual_price_actions WHERE history_id=$1 AND action='activation'",[id])).rows[0];
    if(done)return replay(done,actor,input);
    const h=(await client.query('SELECT * FROM product_price_history WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!h)throw fail('Schedule not found',404);
    if(h.status!=='pending')throw fail('Schedule is not pending');
    if(date(h.effective_from)>businessToday())throw fail('Not yet effective in Africa/Windhoek');
    const row=await live(client,h.product_id);
    if(!row || row.merged_into_id)throw fail('Product is missing or archived');
    const overlaps=await client.query(`SELECT id FROM product_price_history WHERE product_id=$1
      AND status='pending' AND effective_from<=$2 AND id<>$3`,[row.id,h.effective_from,h.id]);
    if(overlaps.rowCount)throw fail('Overlapping or earlier pending schedules require review; nothing activated');
    const before=Object.fromEntries(fields.map(k=>[k,h['old_'+k]]));
    const after=Object.fromEntries(fields.map(k=>[k,Number(h['new_'+k])]));
    if(fields.some(k=>before[k]===null||before[k]===undefined)||!same(row,before))
      throw fail('Live prices differ from the scheduled prior prices; review rather than overwrite');
    if(fields.some(k=>!Number.isFinite(after[k])||after[k]<0)||after.dp<=0||after.cp<=0)
      throw fail('Scheduled prices are invalid',422);
    const updated=await update(client,row,after,actor);
    await client.query("UPDATE product_price_history SET status='applied' WHERE id=$1",[h.id]);
    const action=await audit(client,h.id,'activation',null,row,updated,actor,input);
    return {success:true,replayed:false,audit:action};
  });
  if(!result.replayed)await publishRealtimeEvent('prices','updated',{historyId:Number(id),action:'manual-activation'});
  return result;
}
export async function compensateManualPrice(id,input,user){
  const actor=authorizePriceOperator(user);validateId(id);validateInput(input);
  const result=await withTransaction(async client=>{
    await client.query("SELECT pg_advisory_xact_lock(hashtext('price-import-catalogue'))");
    const done=(await client.query('SELECT * FROM manual_price_actions WHERE reverses_history_id=$1',[id])).rows[0];
    if(done)return replay(done,actor,input);
    const original=(await client.query(`SELECT a.*,h.product_id FROM manual_price_actions a JOIN product_price_history h
      ON h.id=a.history_id WHERE a.history_id=$1 AND a.action='activation'`,[id])).rows[0];
    if(!original)throw fail('Manual activation not found',404);
    const row=await live(client,original.product_id);
    if(!row||row.merged_into_id||!same(row,original.after_prices)||row.version!==original.live_version)
      throw fail('Another price update occurred. Compensation requires review; nothing overwritten');
    const changed=(await client.query(`INSERT INTO product_price_history(product_id,description,
      old_dp,old_cp,old_cif,old_bv,new_dp,new_cp,new_cif,new_bv,changed_by,effective_from,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'applied') RETURNING id`,
      [row.id,row.description,...fields.map(k=>row[k]),...fields.map(k=>original.before_prices[k]),actor.name,businessToday()])).rows[0];
    const updated=await update(client,row,original.before_prices,actor);
    const action=await audit(client,changed.id,'compensation',Number(id),row,updated,actor,input);
    return {success:true,replayed:false,audit:action};
  });
  if(!result.replayed)await publishRealtimeEvent('prices','updated',{historyId:Number(id),action:'manual-compensation'});
  return result;
}

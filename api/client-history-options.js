import {getMany} from './db.js';
import {historyAccess} from './services/clientHistoryAccess.js';
export default async function handler(req,res){
 try{
  const branch=new URL(req.url,'http://local').searchParams.get('branch');
  historyAccess(req.user,branch);
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  const all=await getMany("SELECT id,full_name,role,branch,branches FROM users WHERE role='consultant' AND is_active=true");
  const consultants=all.filter(u=>{try{historyAccess(u,branch);return true;}catch{return false;}})
    .map(({id,full_name})=>({id,name:full_name}));
  const products=await getMany('SELECT id,description AS name FROM live_product_prices ORDER BY description');
  return res.json({consultants,products});
 }catch(e){return res.status(e.statusCode||500).json({error:e.statusCode?e.message:'Options unavailable'});}
}

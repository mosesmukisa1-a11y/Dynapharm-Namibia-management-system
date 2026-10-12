import {applyAuthCors} from '../_lib/auth.js';
import {getDailySales,businessToday,COMPANY_REPORT_ROLES} from '../services/dailySales.js';

export default async function handler(req,res){
  applyAuthCors(req,res);
  if(req.method==='OPTIONS')return res.status(200).end();
  if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
  if(!req.user)return res.status(401).json({error:'Authentication required'});
  if(!COMPANY_REPORT_ROLES.has(String(req.user.role).toLowerCase()))
    return res.status(403).json({error:'Company reporting access required'});
  try{
    const params=new URL(req.url,`http://${req.headers.host || 'localhost'}`).searchParams;
    return res.json(await getDailySales(params.get('date') || businessToday()));
  }catch(error){return res.status(error.statusCode || 500).json({success:false,error:error.message});}
}

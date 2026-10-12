import {applyAuthCors} from '../../_lib/auth.js';
import {distributionCatalog} from '../../services/countryDistribution.js';

export default async function handler(req,res) {
  applyAuthCors(req,res);
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  try {
    const {products,warehouses}=await distributionCatalog(req.user);
    return res.json({success:true,products,warehouses});
  } catch(error) {
    return res.status(error.statusCode || 500).json({success:false,error:error.message});
  }
}

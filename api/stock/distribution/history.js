import {applyAuthCors} from '../../_lib/auth.js';
import {authorizeCountryDistribution,distributionError} from '../../services/countryDistribution.js';
import {listTransfers} from '../transfers.js';

export default async function handler(req,res) {
  applyAuthCors(req,res);
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});
  try {
    authorizeCountryDistribution(req.user);
    const raw=new URL(req.url,'http://localhost').searchParams;
    const page=Math.max(1,Math.min(1000000,Number(raw.get('page')) || 1));
    const pageSize=Math.max(1,Math.min(100,Number(raw.get('pageSize')) || 20));
    if(!Number.isInteger(page) || !Number.isInteger(pageSize)) throw distributionError('Invalid page');
    const params=new URLSearchParams({fromWarehouse:'country_stock',limit:String(pageSize),offset:String((page-1)*pageSize)});
    for(const field of ['search','status','dateFrom','dateTo']) if(raw.get(field)) params.set(field,raw.get(field));
    if(raw.get('destination')) params.set('branch',raw.get('destination'));
    for(const field of ['dateFrom','dateTo']) {
      const value=params.get(field);
      if(value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))
        || new Date(value).toISOString().slice(0,10)!==value)) throw distributionError('Use valid ISO dates');
    }
    return res.json({success:true,...await listTransfers(params,true),page,pageSize});
  } catch(error) {
    return res.status(error.statusCode || 500).json({success:false,error:error.message});
  }
}

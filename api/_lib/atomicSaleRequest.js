import { createHash } from 'node:crypto';
import { atomicStockRequest } from './atomicStockRequest.js';
import { query, getOne } from '../db.js';

export const saleRetrySchema = `CREATE TABLE IF NOT EXISTS sale_completion_retries(
  request_key TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, response JSONB NOT NULL,
  response_status INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;

// A retry has the same explicit request identity. Identical baskets without a
// key can be legitimate separate purchases and must not be merged by proximity.
export function atomicSaleRequest(handler) {
  return atomicStockRequest(async(req,res)=>{
    const body=req.body?.sale || req.body || {};
    const key=req.headers?.['idempotency-key'] || body.requestId || body.offline_id || body.id;
    if(req.method!=='POST' || !key || !req.user)return handler(req,res);
    const requestKey=JSON.stringify([req.user.id || req.user.sub,req.url.split('?')[0],String(key)]);
    const hash=createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
    await query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[requestKey]);
    const prior=await getOne('SELECT * FROM sale_completion_retries WHERE request_key=$1',[requestKey]);
    if(prior){
      if(prior.payload_hash!==hash)return res.status(409).json({success:false,error:'This sale request identity was already used with different details'});
      return res.status(200).json({...prior.response,duplicate:true});
    }
    let status=200,payload;
    const capture={...res,
      status(code){status=code;res.status(code);return this;},
      json(value){payload=value;res.json(value);return this;}};
    await handler(req,capture);
    if(status<400 && payload?.success)await query(`INSERT INTO sale_completion_retries
      (request_key,payload_hash,response,response_status) VALUES($1,$2,$3,$4)`,
    [requestKey,hash,JSON.stringify(payload),status]);
  });
}

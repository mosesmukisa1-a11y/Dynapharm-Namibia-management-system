// Compatibility adapter: all country distribution entry points share validation,
// transaction locking, catalogue identity checks and pending-stock commitments.
import transfers from '../transfers.js';
import {applyAuthCors} from '../../_lib/auth.js';

export default async function handler(req,res) {
  applyAuthCors(req,res);
  if(req.method==='OPTIONS') return res.status(200).end();
  if(req.method!=='POST') return res.status(405).json({success:false,error:'Method not allowed'});
  const body=req.body || {};
  let status=200;
  const response={
    setHeader:(...args)=>res.setHeader(...args),
    getHeader:(...args)=>res.getHeader?.(...args),
    status(code){status=code;return this;},
    json(payload){
      const transfer=payload.transfer;
      if(status>=400 || !transfer) return res.status(status).json(payload);
      return res.status(status).json({...payload,transferId:transfer.id,
        referenceId:transfer.dispatchReference || transfer.id,
        warehouseId:body.warehouseId,status:transfer.status,
        itemCount:transfer.items?.length || 0,
        message:'Submitted for GM approval. Approval reserves stock; warehouse acceptance confirms receipt.'});
    },
    end:(...args)=>res.status(status).end(...args),
  };
  return transfers({method:'POST',url:'/api/stock/transfers',headers:req.headers,
    user:req.user,body:{from_location:'country_stock',to_location:body.warehouseId,
      items:body.items,status:'pending_approval',dispatchNotes:body.notes,
      operation_key:body.operation_key || req.headers?.['idempotency-key']}},
  response);
}

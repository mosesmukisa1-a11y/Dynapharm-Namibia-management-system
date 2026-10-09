import { applyAuthCors } from '../_lib/auth.js';
import { getMany, withTransaction } from '../db.js';
import { atomicStockRequest } from '../_lib/atomicStockRequest.js';
import { authorizeStockReturn, approveLinkedRefundTx } from '../services/linkedReversals.js';
import { fail } from '../services/stockCostLayers.js';

async function handler(req,res) {
  applyAuthCors(req,res);
  if (req.method==='OPTIONS') return res.status(200).end();
  try {
    authorizeStockReturn(req.user);
    if (req.method==='GET') {
      const url=new URL(req.url,`http://${req.headers.host || 'localhost'}`);
      const requests=await getMany(`SELECT * FROM branch_refund_requests
        WHERE ($1::text IS NULL OR status=$1) AND ($2::text IS NULL OR branch_id=$2)
        ORDER BY created_at DESC LIMIT 500`,[url.searchParams.get('status') || null,url.searchParams.get('branch_id') || null]);
      return res.json({success:true,requests});
    }
    if (req.method==='PATCH') {
      const body=req.body || {};
      const result=await withTransaction(async client=>{
        const refund=(await client.query('SELECT * FROM branch_refund_requests WHERE id=$1 FOR UPDATE',[body.id])).rows[0];
        if (!refund) fail('Refund request not found',404);
        if (refund.status!=='pending') fail('Refund request has already been processed',409);
        if (body.action==='approve') return approveLinkedRefundTx(client,refund,body,req.user);
        if (body.action!=='reject' || !body.rejection_reason?.trim()) fail('A rejection reason is required',400);
        await client.query(`UPDATE branch_refund_requests SET status='rejected',approved_by=$1,rejection_reason=$2,processed_at=NOW() WHERE id=$3`,
          [req.user.fullName || req.user.id,body.rejection_reason.trim(),refund.id]);
        return {success:true,message:'Refund request rejected'};
      });
      return res.json(result);
    }
    return res.status(405).json({success:false,error:'Method not allowed'});
  } catch(err) {return res.status(err.statusCode || 500).json({success:false,error:err.message});}
}
export default atomicStockRequest(handler,['PATCH']);

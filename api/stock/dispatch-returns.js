import { applyAuthCors } from '../_lib/auth.js';
import { withTransaction } from '../db.js';
import { atomicStockRequest } from '../_lib/atomicStockRequest.js';
import { authorizeStockReturn, dispatchReturnAllocationsTx, returnDispatchTx } from '../services/linkedReversals.js';
import { fail } from '../services/stockCostLayers.js';

async function handler(req,res) {
  applyAuthCors(req,res);
  if (req.method==='OPTIONS') return res.status(200).end();
  try {
    authorizeStockReturn(req.user);
    if (req.method==='POST' && req.body?.action==='cancel_reservation') {
      if (!req.body.reason?.trim()) fail('A cancellation reason is required',400);
      const transfer=(await withTransaction(async client=>{
        const row=(await client.query('SELECT * FROM stock_transfers WHERE id=$1 FOR UPDATE',[req.body.transfer_id])).rows[0];
        if (!row) fail('Transfer not found',404);
        if (row.status!=='approved') fail('Only approved reservations can be cancelled here. Dispatched goods require a physical return',409);
        return row;
      }));
      const {default:cancel}=await import('./transfers.js');
      return cancel({...req,method:'PATCH',body:{id:transfer.id,status:'cancelled',
        dispatch_notes:[transfer.dispatch_notes,`Reservation cancelled: ${req.body.reason.trim()}`].filter(Boolean).join('\n')}},res);
    }
    if (req.method==='POST') return res.json(await withTransaction(client=>returnDispatchTx(client,req.body || {},req.user)));
    if (req.method==='GET') {
      const url=new URL(req.url,`http://${req.headers.host || 'localhost'}`);
      const result=await withTransaction(async client=>{
        const transfer=(await client.query('SELECT * FROM stock_transfers WHERE id=$1 FOR UPDATE',[url.searchParams.get('transfer_id')])).rows[0];
        if (!transfer) fail('Transfer not found',404);
        return {success:true,transfer,...await dispatchReturnAllocationsTx(client,transfer)};
      });
      return res.json(result);
    }
    return res.status(405).json({success:false,error:'Method not allowed'});
  } catch(err) {return res.status(err.statusCode || 500).json({success:false,error:err.message});}
}
export default atomicStockRequest(handler,['POST']);

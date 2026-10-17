import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../../services/queryDescriptors.js";import { applyAuthCors } from '../../_lib/auth.js';
import { normalizeBranchSlug } from '../../_lib/branchUtils.js';
import { atomicStockRequest } from '../../_lib/atomicStockRequest.js';
import { getOne, query, withTransaction, publishRealtimeEvent } from '../../db.js';
import { receiveTransferTx } from '../../services/transferReceipt.js';
import { recomputeLocationBalances } from '../../services/stockEngine.js';
import { broadcastStockEvent } from '../../services/stockEvents.js';

async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const body = req.body || {};
  const dispatchNoteId = body.dispatchNoteId || body.dispatch_note_id || body.transferId;
  if (!dispatchNoteId || !Array.isArray(body.items) || !body.items.length) {
    return res.status(400).json({ success: false, error: 'Dispatch reference and received items are required.' });
  }
  try {
    const resolved = await __qd_executePlan(getOne, __qd_registeredPlan("api/stock/dispatch/confirm-receipt.js:21:0"),



    [dispatchNoteId]);

    if (!resolved) return res.status(404).json({ success: false, error: 'Dispatch not found.' });
    if (body.branchId && (normalizeBranchSlug(body.branchId) || body.branchId) !== (normalizeBranchSlug(resolved.to_branch) || resolved.to_branch)) {
      return res.status(403).json({ success: false, error: 'Receipt destination does not match the dispatch.' });
    }
    const result = await withTransaction((client) => receiveTransferTx(client, {
      transferId: resolved.id, items: body.items, user: req.user, mode: 'increment',
      receiptId: body.receiptId || req.headers['idempotency-key']
    }));
    if (result.status === 'partially_received') {
      await __qd_executePlan(query, __qd_registeredPlan("api/stock/dispatch/confirm-receipt.js:36:1"),


      [`NOTIF-RCPT-${Date.now()}-${resolved.id}`, `Transfer ${resolved.id} was partially received at ${result.branchId}. Review remaining quantities and delivery discrepancies.`]);

    }
    await publishRealtimeEvent('stock_transfers', 'update', result.transfer);
    broadcastStockEvent('transfer_received', { transferId: resolved.id, branchId: result.branchId });
    recomputeLocationBalances('branch', result.branchId).catch((error) => console.error('[receipt-balance]', error.message));
    recomputeLocationBalances('in_transit', `in_transit:${resolved.id}`).catch((error) => console.error('[receipt-transit]', error.message));
    return res.json({
      success: true, transferId: resolved.id, dispatchNoteId, branchId: result.branchId,
      status: result.status, receivedQuantity: result.receivedQuantity,
      itemsReceived: body.items.length, received: body.items,
      message: 'Actual received quantities recorded. Unreceived stock remains in transit.'
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
}
export default atomicStockRequest(handler, ['POST']);

import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { getMany, withTransaction } from '../db.js';
import { atomicStockRequest } from '../_lib/atomicStockRequest.js';
import { authorizeStockReturn, approveLinkedRefundTx } from '../services/linkedReversals.js';
import { fail } from '../services/stockCostLayers.js';
import { historicalRefundCandidatesTx } from '../services/stockSaleAllocations.js';
import { proposeHistoricalRefundTx, reviewHistoricalRefundTx } from '../services/historicalRefundEvidence.js';

async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    authorizeStockReturn(req.user);
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (url.searchParams.get('evidence_for')) {
        const result = await withTransaction(async (client) => {
          const refund = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock/refund-requests.js:18:0"), [url.searchParams.get('evidence_for')])).rows[0];
          if (!refund) fail('Refund request not found', 404);
          if (refund.status !== 'pending' || refund.allocation_id) fail('Only pending unlinked historical requests need evidence review', 409);
          const candidates = await historicalRefundCandidatesTx(client, refund, url.searchParams.get('sale_reference'));
          return { success: true, candidates, ambiguous: candidates.length !== 1 };
        });
        return res.json(result);
      }
      const requests = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/refund-requests.js:26:1"),

      [url.searchParams.get('status') || null, url.searchParams.get('branch_id') || null]);
      const history = await __qd_executePlan(getMany, __qd_registeredPlan("api/stock/refund-requests.js:29:2"),



      [url.searchParams.get('branch_id') || null]);
      return res.json({ success: true, requests, evidenceHistory: history });
    }
    if (req.method === 'PATCH') {
      const body = req.body || {};
      const result = await withTransaction(async (client) => {
        const refund = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock/refund-requests.js:39:3"), [body.id])).rows[0];
        if (!refund) fail('Refund request not found', 404);
        if (refund.status !== 'pending') fail('Refund request has already been processed', 409);
        if (body.action === 'propose_evidence') return proposeHistoricalRefundTx(client, refund, body, req.user);
        if (['approve_evidence', 'reject_evidence'].includes(body.action)) return reviewHistoricalRefundTx(client, refund, body, req.user);
        if (body.action === 'approve') return approveLinkedRefundTx(client, refund, body, req.user);
        if (body.action !== 'reject' || !body.rejection_reason?.trim()) fail('A rejection reason is required', 400);
        await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/stock/refund-requests.js:46:4"),
        [req.user.fullName || req.user.id, body.rejection_reason.trim(), refund.id]);
        return { success: true, message: 'Refund request rejected' };
      });
      return res.json(result);
    }
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {return res.status(err.statusCode || 500).json({ success: false, error: err.message });}
}
export default atomicStockRequest(handler, ['PATCH']);

import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { randomUUID } from 'node:crypto';
import { applyAuthCors, getBranchScope } from '../_lib/auth.js';
import { getMany, withTransaction } from '../db.js';
import { atomicStockRequest } from '../_lib/atomicStockRequest.js';
import { authorizeBranchReturn, returnEvidence, saleReturnRemainingTx } from '../services/linkedReversals.js';
import { branchSearchTerms } from '../_lib/branchUtils.js';
import { fail } from '../services/stockCostLayers.js';

async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({ success: false, error: 'Authentication required' });
  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const scope = getBranchScope(req.user);
      const branch = url.searchParams.get('branch_id') || scope.primaryBranch;
      if (!branch) fail('Select a branch', 400);
      authorizeBranchReturn(req.user, branch);
      const requests = await __qd_executePlan(getMany, __qd_registeredPlan("api/branch/refund-requests.js:20:0"),

      [branchSearchTerms(branch), url.searchParams.get('status') || null]);
      return res.json({ success: true, requests });
    }
    if (req.method === 'POST') {
      const body = req.body || {};
      const qty = returnEvidence(body);
      if (!body.allocation_id) fail('Select an original sale allocation. Unlinked refunds require reviewed evidence', 400);
      if (!body.operation_key || String(body.operation_key).length > 200) fail('A stable operation key is required', 400);
      const result = await withTransaction(async (client) => {
        const allocation = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/branch/refund-requests.js:31:1"), [body.allocation_id])).rows[0];
        if (!allocation) fail('Original sale allocation not found', 404);
        authorizeBranchReturn(req.user, allocation.branch_id);
        await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/branch/refund-requests.js:34:2"), [`refund-sale:${allocation.sale_reference}`]);
        const prior = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/branch/refund-requests.js:35:3"), [body.operation_key])).rows[0];
        if (prior) {
          if (prior.allocation_id !== body.allocation_id || Number(prior.quantity) !== qty || prior.reason !== body.reason.trim())
          fail('Operation key already used for a different refund', 409);
          return { success: true, id: prior.id, refund_amount: prior.refund_amount };
        }
        if (qty > (await saleReturnRemainingTx(client, allocation, null, true))) fail('Quantity exceeds unrefunded original allocation (including pending requests)', 409);
        const price = allocation.snapshot.revenue_unit;
        if (price == null || !Number.isFinite(Number(price)) || Number(price) < 0) fail('Original selling price is missing; reviewed evidence is required', 409);
        const amount = Math.round(qty * Number(price) * 100) / 100;
        const id = `REF-${randomUUID()}`;
        await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/branch/refund-requests.js:46:4"),



        [id, allocation.branch_id, allocation.sale_reference, allocation.product_name, allocation.batch_no, qty, price, amount,
        body.reason.trim(), req.user.fullName || req.user.id, allocation.movement_id, JSON.stringify(allocation.snapshot), body.operation_key]);
        return { success: true, id, refund_amount: amount };
      });
      return res.json(result);
    }
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (err) {return res.status(err.statusCode || 500).json({ success: false, error: err.message });}
}
export default atomicStockRequest(handler, ['POST']);

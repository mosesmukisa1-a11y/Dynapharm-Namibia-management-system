import { applyAuthCors } from '../_lib/auth.js';
import { atomicStockRequest } from '../_lib/atomicStockRequest.js';
import { createOperation, updateOperation, listOperations } from '../services/controlledStock.js';

async function handler(req, res) {
  applyAuthCors(req,res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({error:'Authentication required'});
  try {
    if (req.method === 'GET') return res.json(await listOperations(req.user));
    if (req.method === 'POST') return res.status(201).json({operation:await createOperation(req.user,req.body || {})});
    if (req.method === 'PATCH') return res.json({operation:await updateOperation(req.user,req.body || {})});
    return res.status(405).json({error:'Method not allowed'});
  } catch (error) {
    if (!error.statusCode) throw error;
    return res.status(error.statusCode).json({error:error.message});
  }
}
export default atomicStockRequest(handler);

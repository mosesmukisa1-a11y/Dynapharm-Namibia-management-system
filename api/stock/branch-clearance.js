import { applyAuthCors } from '../_lib/auth.js';
import { atomicStockRequest } from '../_lib/atomicStockRequest.js';
import { clearanceOptions, previewClearance, executeClearance, readClearance } from '../services/branchStockClearance.js';

async function handler(req, res) {
  applyAuthCors(req,res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    if (req.method === 'GET') return res.json(req.query?.id
      ? await readClearance(req.user,req.query.id) : await clearanceOptions(req.user));
    if (req.method === 'POST' && req.body?.action === 'preview')
      return res.json(await previewClearance(req.user,req.body));
    if (req.method === 'POST' && req.body?.action === 'execute')
      return res.json(await executeClearance(req.user,req.body));
    return res.status(400).json({error:'Use preview or execute'});
  } catch (error) {
    if (!error.statusCode) throw error;
    return res.status(error.statusCode).json({error:error.message});
  }
}
export default atomicStockRequest(handler);

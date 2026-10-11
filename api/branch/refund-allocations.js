import { applyAuthCors, getBranchScope } from '../_lib/auth.js';
import { withTransaction } from '../db.js';
import { authorizeBranchReturn, saleReturnRemainingTx } from '../services/linkedReversals.js';
import { branchSearchTerms } from '../_lib/branchUtils.js';

export default async function handler(req,res) {
  applyAuthCors(req,res);
  if (req.method==='OPTIONS') return res.status(200).end();
  if (!req.user) return res.status(401).json({success:false,error:'Authentication required'});
  if (req.method!=='GET') return res.status(405).json({success:false,error:'Method not allowed'});
  try {
    const url=new URL(req.url,`http://${req.headers.host || 'localhost'}`);
    const scope=getBranchScope(req.user);
    const branch=url.searchParams.get('branch_id') || scope.primaryBranch;
    if (!branch) return res.status(400).json({success:false,error:'Select a branch'});
    authorizeBranchReturn(req.user,branch);
    const allocations=await withTransaction(async client=>{
      const reference=url.searchParams.get('sale_reference') || null;
      if(reference) {
        const matches=(await client.query(`SELECT id FROM branch_walkin_sales
          WHERE LOWER(REPLACE(branch_id,' ','_'))=ANY($1)
            AND (id=$2 OR sale_number=$2) AND status='completed'`,
        [branchSearchTerms(branch),reference])).rows;
        if(matches.length>1) {
          const error=new Error('This receipt number matches multiple sales; select the original internal sale reference for review');
          error.statusCode=409;
          throw error;
        }
      }
      const rows=(await client.query(`SELECT a.* FROM stock_sale_allocations a JOIN stock_movements sm ON sm.id=a.movement_id
        WHERE LOWER(REPLACE(a.branch_id,' ','_'))=ANY($1)
        AND ($2::text IS NULL OR a.sale_reference=$2 OR a.sale_reference IN (
          SELECT s.id FROM branch_walkin_sales s
          WHERE LOWER(REPLACE(s.branch_id,' ','_'))=ANY($1)
            AND s.sale_number=$2 AND s.status='completed'
        ))
        AND sm.status IN ('posted','approved') ORDER BY a.created_at DESC LIMIT 200`,
        [branchSearchTerms(branch),reference])).rows;
      const result=[];
      for (const a of rows) result.push({...a,remaining_quantity:await saleReturnRemainingTx(client,a,null,true)});
      return result;
    });
    return res.json({success:true,allocations});
  } catch (err) {return res.status(err.statusCode || 500).json({success:false,error:err.message});}
}

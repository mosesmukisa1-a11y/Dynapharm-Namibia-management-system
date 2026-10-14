import { applyAuthCors, getBranchScope } from '../_lib/auth.js';
import { getMany, getOne } from '../db.js';
import { branchSearchTerms, normalizeBranchSlug } from '../_lib/branchUtils.js';
import { traceDocumentEvents } from '../services/stockTracePresentation.js';

const readers=['admin','super_admin','superadmin','gm','general_manager','director','finance','finance_manager','mis',
  'stock','stock_manager','warehouse','warehouse_manager','branch','branch_manager','branch_staff'];
export default async function handler(req,res) {
  applyAuthCors(req,res);
  if(req.method==='OPTIONS')return res.status(200).end();
  if(!req.user)return res.status(401).json({success:false,error:'Authentication required'});
  if(req.method!=='GET')return res.status(405).json({success:false,error:'Read-only endpoint'});
  if(!readers.includes(String(req.user.role || '').toLowerCase()))return res.status(403).json({success:false,error:'Staff stock evidence access required'});
  const url=new URL(req.url,'http://local');
  const search=(url.searchParams.get('search') || '').trim(), branch=url.searchParams.get('branch');
  if(search.length<3 || search.length>160)return res.status(400).json({success:false,error:'Enter 3–160 characters to trace'});
  const scope=getBranchScope(req.user);
  if(scope.enforced && branch && !scope.branches.some(item=>normalizeBranchSlug(item)===normalizeBranchSlug(branch)))
    return res.status(403).json({success:false,error:'Access denied'});
  const owners=(branch ? [branch] : scope.enforced ? scope.branches : null)?.flatMap(branchSearchTerms) || null;
  const term=`%${search.replace(/[\\%_]/g,'\\$&')}%`;
  try {
    const events=[],gaps=[];
    // All table names below are static allowlisted application tables.
    for(const [kind,table] of [['supplier_import','supplier_imports'],['transfer','stock_transfers']]) {
      if(kind==='supplier_import' && owners) {gaps.push('Warehouse/import documents excluded from branch-scoped trace; no expanded authority is inferred.');continue;}
      if(!(await getOne('SELECT to_regclass($1) AS name',[`public.${table}`]))?.name) {gaps.push(`${kind} source table unavailable`);continue;}
      let itemSearch='';
      if(kind==='transfer') {
        if((await getOne("SELECT to_regclass('public.stock_transfer_items') AS name"))?.name) {
          itemSearch=" OR EXISTS (SELECT 1 FROM stock_transfer_items item WHERE item.transfer_id=t.id AND to_jsonb(item)::text ILIKE $1 ESCAPE '\\')";
        } else gaps.push('Transfer child items unavailable; transfer search is limited to recorded header evidence');
      }
      const records=await getMany(`SELECT to_jsonb(t) AS record FROM ${table} t
        WHERE (to_jsonb(t)::text ILIKE $1 ESCAPE '\\'${itemSearch})
        AND ($2::text[] IS NULL OR LOWER(COALESCE(to_jsonb(t)->>'to_branch',to_jsonb(t)->>'to_location',''))=ANY($2)
          OR LOWER(COALESCE(to_jsonb(t)->>'from_branch',to_jsonb(t)->>'from_location',''))=ANY($2))
        ORDER BY t.created_at DESC LIMIT 201`,[term,owners]);
      if(records.length>200)gaps.push(`${kind} matches truncated at 200 records; narrow the search`);
      for(const {record} of records.slice(0,200))events.push(...traceDocumentEvents(kind,record));
    }
    // MIS sale-created identity is authoritative captured sale evidence, not a new posting.
    if((await getOne("SELECT to_regclass('public.mis_sales_audit') AS name"))?.name) {
      const sales=await getMany(`SELECT id,record_id,user_name,created_at,details,
        COALESCE(details->>'branch',details->>'branchId',details->>'branch_id') AS branch_id FROM mis_sales_audit
        WHERE event_type='sale_created' AND (record_id ILIKE $1 ESCAPE '\\' OR details::text ILIKE $1 ESCAPE '\\')
        AND ($2::text[] IS NULL OR LOWER(COALESCE(details->>'branch',details->>'branchId',details->>'branch_id'))=ANY($2))
        ORDER BY created_at DESC LIMIT 201`,[term,owners]);
      if(sales.length>200)gaps.push('Sale audit matches truncated at 200 events');
      for(const row of sales.slice(0,200))events.push({id:`audit:${row.id}`,source:'sale_audit',recordId:row.record_id,
        type:'sale created',reference:row.details?.reference || row.record_id,receipt:row.details?.receiptNumber || null,
        timestamp:row.created_at,businessDate:row.details?.businessDate || null,location:row.branch_id,
        dpValue:row.details?.dpTotal ?? null,chargedValue:row.details?.chargedTotal ?? null,
        branchProfit:row.details?.branchProfitTotal ?? null,actor:row.details?.staff || row.user_name || 'Not recorded',status:'Captured audit'});
    } else gaps.push('Sale audit source unavailable');
    events.sort((a,b)=>new Date(a.timestamp || 0)-new Date(b.timestamp || 0));
    if(owners)gaps.push('Branch-scope document matching requires an explicit destination or branch-source identity. Ambiguous legacy warehouse/branch names are not merged.');
    return res.json({success:true,events,gaps,timezone:'Africa/Windhoek',readOnly:true,
      coverage:'Only recorded documents and timestamps. No missing events or stock quantities are reconstructed.'});
  } catch(error) {
    console.error('[stock-trace] Read failed:',error.message);
    return res.status(500).json({success:false,error:'Stock document evidence could not be loaded'});
  }
}

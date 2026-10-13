import { getBranchScope } from '../_lib/auth.js';
import { normalizeBranchSlug, branchSearchTerms } from '../_lib/branchUtils.js';

const operationStatuses = ['draft','submitted','partially_reviewed','approved','partially_dispatched','rejected','dispatched','credited','cancelled'];
const batchStatuses = ['saleable','expired','damaged','quarantine','out_of_stock'];
const branchTerms = location => [...new Set([normalizeBranchSlug(location),
  ...branchSearchTerms(location)].filter(term => term && normalizeBranchSlug(term) === normalizeBranchSlug(location)))];
const sqlLocation = expression => `LOWER(BTRIM(${expression}))`;
const escapedSearch = value => `%${value.replace(/[\\%_]/g, '\\$&')}%`;

function paging(input, prefix, defaultSize, fail) {
  const parse = (key, fallback, maximum) => {
    if (input[key] == null || input[key] === '') return fallback;
    const value = Number(input[key]);
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail(`Invalid ${key}`);
    return value;
  };
  const page = parse(`${prefix}_page`, 1, 1000000);
  const page_size = parse(`${prefix}_page_size`, defaultSize, 100);
  return { page, page_size, offset: (page - 1) * page_size };
}
const pageInfo = (page, total) => ({
  page: page.page, page_size: page.page_size, total: Number(total),
  total_pages: Math.ceil(Number(total) / page.page_size),
});

// All visibility predicates run before counts, search, ordering and pagination.
// No ids from another branch are hydrated or returned, including detail requests.
export async function readControlledStockRegister(client, user, input, { fail, physicalBatchSnapshot }) {
  const scope = getBranchScope(user);
  const branchRole = ['branch','branch_manager'].includes(String(user.role || '').toLowerCase());
  const restricted = scope.enforced || branchRole;
  const allowed = restricted ? [...new Set((scope.branches || []).flatMap(branchTerms))] : [];
  const view = input.view || 'all';
  if (!['all','batches','operations'].includes(view)) fail('Unknown register view');
  const location = String(input.location || '').trim();
  const locationTerms = location ? [...new Set([location.toLowerCase(), ...branchTerms(location)])] : [];
  const values = [restricted, allowed, locationTerms];
  const operationScope = `NOT $1::boolean OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(o.lines) l WHERE NOT COALESCE(
      COALESCE(l->'snapshot'->>'source_type',l->'snapshot'->>'batch_type')='branch'
      AND ${sqlLocation("l->'snapshot'->>'location'")}=ANY($2::text[]),false))`;

  if (input.operation_id) {
    const operation = (await client.query(`SELECT o.* FROM stock_control_operations o
      WHERE o.id=$3 AND (${operationScope})`, [...values.slice(0,2), String(input.operation_id)])).rows[0];
    if (!operation || operation.kind==='branch_clearance') fail('Operation not found; use the dedicated GM clearance view', 404);
    const credits = (await client.query('SELECT * FROM supplier_return_credits WHERE operation_id=$1 ORDER BY supplier_import_id', [operation.id])).rows;
    const financial_entries = (await client.query('SELECT * FROM stock_control_financial_entries WHERE operation_id=$1 ORDER BY created_at,id', [operation.id])).rows;
    return { operation, credits, financial_entries };
  }

  const result = {};
  if (view !== 'operations') {
    const page = paging(input, 'batch', 30, fail);
    const search = String(input.batch_search || '').trim().slice(0, 200);
    const status = String(input.batch_status || '');
    if (status && !batchStatuses.includes(status)) fail('Unknown batch status');
    const type = String(input.batch_type || '');
    if (type && !['branch','warehouse','segregated'].includes(type)) fail('Unknown batch type');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Windhoek', year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date());
    const physical = `WITH physical AS (
      SELECT 'branch'::text AS batch_type,b.id::text AS id,b.branch_id AS location,
        b.product_name,b.batch_no,b.expiry_date,b.quantity,b.status,
        COALESCE(b.metadata->>'return_condition',b.metadata->>'condition',
          CASE WHEN b.status IN ('damaged','expired','quarantine') THEN b.status ELSE 'saleable' END) AS condition
      FROM branch_inventory_batches b WHERE NOT $1::boolean OR ${sqlLocation('b.branch_id')}=ANY($2::text[])
      UNION ALL
      SELECT 'warehouse',b.id::text,COALESCE(NULLIF(b.warehouse_id,''),b.location),b.description,b.batch_no,b.expiry_date,
        b.remaining_quantity,b.status,
        COALESCE(b.metadata->>'return_condition',b.metadata->>'condition',
          CASE WHEN b.status IN ('damaged','expired','quarantine') THEN b.status ELSE 'saleable' END)
      FROM stock_batches b WHERE NOT $1::boolean AND COALESCE(b.warehouse_id,b.location,'') LIKE '%warehouse%'
      UNION ALL
      SELECT 'segregated',s.id,s.location,s.snapshot->>'product_name',s.snapshot->>'batch_no',
        NULLIF(s.snapshot->>'expiry_date','')::date,s.quantity,NULL::text,s.condition
      FROM stock_segregated_batches s WHERE s.quantity>0 AND s.purpose<>'supplier_return'
        AND (NOT $1::boolean OR (s.source_type='branch' AND ${sqlLocation('s.location')}=ANY($2::text[])))
    ), filtered AS (SELECT * FROM physical WHERE
      (cardinality($3::text[])=0 OR ${sqlLocation('location')}=ANY($3::text[]))
      AND ($4='' OR CONCAT_WS(' ',product_name,batch_no,id,location) ILIKE $5)
      AND ($6='' OR CASE $6
        WHEN 'expired' THEN condition='expired' OR expiry_date<$7::date
        WHEN 'out_of_stock' THEN quantity=0
        WHEN 'saleable' THEN condition='saleable' AND (expiry_date IS NULL OR expiry_date>=$7::date)
          AND (status IS NULL OR status IN ('in_stock','available','active'))
        ELSE condition=$6 END)
      AND ($8='' OR batch_type=$8))`;
    const params = [...values,search,escapedSearch(search),status,today,type];
    const total = (await client.query(`${physical} SELECT COUNT(*) AS total FROM filtered`,params)).rows[0].total;
    // Hydrate physical and original source rows only after the page boundary.
    // One set-based join replaces a read for every selected branch batch.
    const rows = (await client.query(`${physical}, page_rows AS (
      SELECT * FROM filtered ORDER BY LOWER(product_name) NULLS LAST,batch_type,id LIMIT $9 OFFSET $10)
      SELECT p.batch_type,
        CASE p.batch_type WHEN 'branch' THEN to_jsonb(b) WHEN 'warehouse' THEN to_jsonb(w) ELSE to_jsonb(s) END AS raw,
        to_jsonb(source) AS original_source
      FROM page_rows p
      LEFT JOIN branch_inventory_batches b ON p.batch_type='branch' AND b.id=p.id
      LEFT JOIN stock_batches w ON p.batch_type='warehouse' AND w.id=p.id
      LEFT JOIN stock_segregated_batches s ON p.batch_type='segregated' AND s.id=p.id
      LEFT JOIN stock_batches source ON p.batch_type='branch' AND source.id=b.source_batch_id
      ORDER BY LOWER(p.product_name) NULLS LAST,p.batch_type,p.id`,[...params,page.page_size,page.offset])).rows;
    const batches = [], segregated = [];
    for (const {batch_type,raw,original_source} of rows) {
      if (batch_type==='segregated') segregated.push({...raw.snapshot,...raw,batch_type,quantity:Number(raw.quantity)});
      else batches.push(physicalBatchSnapshot(raw,batch_type,batch_type==='warehouse' ? raw : original_source));
    }
    result.batches=batches;
    result.segregated=segregated;
    result.batch_pagination=pageInfo(page,total);
    // Location choices must remain stable when the current search has no matches.
    result.locations=(await client.query(`${physical.split(', filtered AS')[0]}
      SELECT DISTINCT location FROM physical ORDER BY location`,params.slice(0,2))).rows.map(r=>r.location).filter(Boolean);
  }
  if (view !== 'batches') {
    const page = paging(input,'operation',20,fail);
    const search = String(input.operation_search || '').trim().slice(0,200);
    const status = String(input.operation_status || '');
    if (status && !operationStatuses.includes(status)) fail('Unknown operation status');
    const where = `(${operationScope}) AND o.kind<>'branch_clearance'
      AND (cardinality($3::text[])=0 OR EXISTS (SELECT 1 FROM jsonb_array_elements(o.lines) l
        WHERE ${sqlLocation("l->'snapshot'->>'location'")}=ANY($3::text[])))
      AND ($4='' OR o.status=$4)
      AND ($5='' OR CONCAT_WS(' ',o.id,o.reason,o.kind,o.created_by) ILIKE $6 OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(o.lines) l WHERE CONCAT_WS(' ',
          l->'snapshot'->>'product_name',l->'snapshot'->>'batch_no',l->'snapshot'->>'location',
          l->'snapshot'->>'supplier_name') ILIKE $6))`;
    const params=[...values,status,search,escapedSearch(search)];
    const total=(await client.query(`SELECT COUNT(*) AS total FROM stock_control_operations o WHERE ${where}`,params)).rows[0].total;
    result.operations=(await client.query(`SELECT o.id,o.kind,o.status,o.reason,o.created_by,o.created_at,o.updated_at,
      jsonb_array_length(o.lines) AS line_count FROM stock_control_operations o WHERE ${where}
      ORDER BY o.created_at DESC,o.id DESC LIMIT $7 OFFSET $8`,[...params,page.page_size,page.offset])).rows;
    result.operation_pagination=pageInfo(page,total);
  }
  return result;
}

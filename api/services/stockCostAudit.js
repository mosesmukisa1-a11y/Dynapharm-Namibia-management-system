import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./queryDescriptors.js";import { getMany } from '../db.js';
import { salesEvidenceSql } from './stockCostReporting.js';

const MAX_LAYERS = 10000;
// Only frozen sale/source evidence is used: never join current products, prices,
// imports or surviving physical batches to reconstruct a historical cost.
const auditSql = `${salesEvidenceSql},
 layers AS (
   SELECT e.*,l.value AS layer,l.ordinality AS layer_index,
     l.value->'source' AS source,(l.value->>'quantity')::numeric AS layer_quantity
   FROM evidence e CROSS JOIN LATERAL jsonb_array_elements(
     CASE WHEN jsonb_typeof(snapshot->'cost_layers')='array' AND jsonb_array_length(snapshot->'cost_layers')>0
       THEN snapshot->'cost_layers' ELSE jsonb_build_array(jsonb_build_object('quantity',quantity,
         'source',jsonb_build_object('cif_unit_cost',snapshot->'unit_cost','dpc_unit_value',snapshot->'unit_dp'))) END
   ) WITH ORDINALITY l(value,ordinality)
 ), origins AS (
   SELECT l.*,COALESCE(NULLIF(source->'received_source','null'::jsonb),source) AS origin FROM layers l
 ), amounts AS (
   SELECT l.*,
     (source->>'cif_unit_cost')::numeric AS sale_unit_cif,
     COALESCE(source->>'received_unit_cif_exact',source->>'original_unit_cif',source->>'cif_unit_cost')::numeric AS received_unit_cif,
     (origin->'metadata'->>'allocated_expense')::numeric AS receipt_expense,
     (origin->>'quantity')::numeric AS receipt_quantity,
     COALESCE((snapshot->>'revenue_total')::numeric,
       (snapshot->>'revenue_unit')::numeric*quantity) AS actual_revenue
   FROM origins l
 ), sale_totals AS (
   SELECT movement_id,COALESCE(SUM(sale_unit_cif*layer_quantity),0) AS known_cost,
     COALESCE(SUM(CASE WHEN sale_unit_cif IS NULL THEN layer_quantity ELSE 0 END),0) AS missing_cost,
     SUM(layer_quantity) AS represented_quantity,
     BOOL_OR(NULLIF(TRIM(origin->>'id'),'') IS NULL OR NULLIF(TRIM(origin->>'supplier_import_id'),'') IS NULL
       OR NULLIF(TRIM(origin->>'expiry_date'),'') IS NULL OR receipt_expense IS NULL OR receipt_quantity IS NULL
       OR receipt_quantity<=0) AS source_evidence_incomplete
   FROM amounts GROUP BY movement_id
 ) SELECT
   a.movement_id,a.sale_reference,a.branch_id,a.product_name,a.created_at::text AS sale_recorded_at,
   snapshot->>'id' AS sold_branch_batch_id,snapshot->>'quantity' AS frozen_sale_base_quantity,
   a.batch_no AS sale_batch,a.expiry_date::text AS sale_expiry,
   a.quantity::text AS sale_base_quantity,a.layer_index::integer,
   a.layer_quantity::text AS layer_base_quantity,
   origin->>'id' AS source_batch_id,source->>'id' AS consumed_source_batch_id,
   origin->>'supplier_import_id' AS supplier_import_id,
   COALESCE(origin->>'reference_id',origin->>'import_reference') AS import_reference,origin->>'batch_no' AS source_batch,
   origin->>'expiry_date' AS source_expiry,origin->>'location' AS received_location,
   origin->'metadata'->>'receipt_key' AS receipt_key,
   origin->'metadata'->>'base_unit' AS base_unit,
   origin->'metadata'->>'entered_quantity' AS received_entered_quantity,
   origin->'metadata'->>'entered_unit' AS received_entered_unit,
   origin->'metadata'->>'conversion_factor' AS conversion_factor,
   receipt_quantity::text AS receipt_base_quantity,
   origin->'metadata'->>'purchase_value' AS receipt_purchase_value,
   receipt_expense::text AS receipt_allocated_expenses_nonadditive,
   origin->'metadata'->>'expense_allocation_basis' AS expense_allocation_basis,
   origin->'metadata'->>'landed_value' AS receipt_landed_value_nonadditive,
   received_unit_cif::text AS exact_received_unit_cif,
   sale_unit_cif::text AS frozen_sale_unit_cif,
   (received_unit_cif*layer_quantity)::text AS exact_received_layer_cost,
   (sale_unit_cif*layer_quantity)::text AS frozen_sale_layer_cost,
   CASE WHEN receipt_quantity>0 THEN (receipt_expense/receipt_quantity*layer_quantity)::text END
     AS landed_expenses_for_sold_layer,
   CASE WHEN layer_index=1 THEN actual_revenue::text END AS actual_sale_revenue_first_layer,
   CASE WHEN layer_index=1 THEN totals.known_cost::text END AS sale_known_cost_subtotal_first_layer,
   CASE WHEN layer_index=1 AND totals.missing_cost=0 AND actual_revenue IS NOT NULL
       AND represented_quantity=a.quantity THEN (actual_revenue-totals.known_cost)::text END
     AS matched_sale_profit_first_layer,
   CASE WHEN layer_index=1 AND totals.missing_cost=0 AND actual_revenue IS NOT NULL
       AND represented_quantity=a.quantity AND NOT source_evidence_incomplete
     THEN (actual_revenue-totals.known_cost)::text END AS complete_audit_profit_first_layer,
   SUM(CASE WHEN layer_index=1 THEN totals.known_cost ELSE 0 END) OVER()::text AS scope_known_cost_subtotal_nonadditive,
   SUM(CASE WHEN layer_index=1 THEN COALESCE(actual_revenue,0) ELSE 0 END) OVER()::text AS scope_known_revenue_subtotal_nonadditive,
   CASE WHEN NOT BOOL_OR(totals.missing_cost>0 OR actual_revenue IS NULL
       OR represented_quantity IS DISTINCT FROM a.quantity OR source_evidence_incomplete) OVER()
     THEN SUM(CASE WHEN layer_index=1 THEN actual_revenue-totals.known_cost ELSE 0 END) OVER()::text
     END AS scope_complete_audit_profit_nonadditive,
   (NULLIF(TRIM(origin->>'id'),'') IS NULL) AS missing_source_batch,
   (NULLIF(TRIM(origin->>'supplier_import_id'),'') IS NULL) AS missing_import_reference,
   (NULLIF(TRIM(origin->>'expiry_date'),'') IS NULL) AS missing_source_expiry,
   (sale_unit_cif IS NULL) AS missing_cost,
   (receipt_expense IS NULL OR receipt_quantity IS NULL OR receipt_quantity<=0) AS missing_expense_evidence,
   (actual_revenue IS NULL) AS missing_revenue,
   (represented_quantity IS DISTINCT FROM a.quantity) AS layer_quantity_mismatch
 FROM amounts a JOIN sale_totals totals USING(movement_id)
 ORDER BY a.created_at,a.movement_id,layer_index LIMIT $5`;

export function csvCell(value) {
  let text = value == null ? '' : String(value);
  // Neutralize spreadsheet formulas, including hidden whitespace prefixes.
  if (/^[\s]*[=+\-@]/.test(text) && !/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(text))
  text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export async function getStockCostAudit({ aliases, from, to, productName } = {}, read = getMany) {
  const rows = await __qd_executePlan(read, __qd_registeredPlan("api/services/stockCostAudit.js:94:0"), [aliases || null, from || null, to || null, productName || null, MAX_LAYERS + 1]);
  if (rows.length > MAX_LAYERS) {
    const error = new Error('Audit export exceeds 10,000 source layers. Narrow the branch, date or product filters.');
    error.statusCode = 413;throw error;
  }
  const firsts = rows.filter((r) => r.layer_index === 1);
  // Preserve all decimal fields as database strings in both CSV and JSON.
  const fields = [
  'movement_id', 'sale_reference', 'branch_id', 'product_name', 'sale_recorded_at', 'sold_branch_batch_id',
  'frozen_sale_base_quantity', 'sale_batch', 'sale_expiry', 'sale_base_quantity', 'layer_index', 'layer_base_quantity',
  'source_batch_id', 'consumed_source_batch_id', 'supplier_import_id', 'import_reference', 'source_batch', 'source_expiry', 'received_location',
  'receipt_key', 'base_unit', 'received_entered_quantity', 'received_entered_unit', 'conversion_factor',
  'receipt_base_quantity', 'receipt_purchase_value', 'receipt_allocated_expenses_nonadditive', 'expense_allocation_basis',
  'receipt_landed_value_nonadditive', 'exact_received_unit_cif', 'frozen_sale_unit_cif', 'exact_received_layer_cost',
  'frozen_sale_layer_cost', 'landed_expenses_for_sold_layer', 'actual_sale_revenue_first_layer',
  'sale_known_cost_subtotal_first_layer', 'matched_sale_profit_first_layer', 'complete_audit_profit_first_layer',
  'scope_known_cost_subtotal_nonadditive', 'scope_known_revenue_subtotal_nonadditive', 'scope_complete_audit_profit_nonadditive',
  'missing_source_batch', 'missing_import_reference', 'missing_source_expiry', 'missing_cost', 'missing_expense_evidence',
  'missing_revenue', 'layer_quantity_mismatch'];

  const warnings = {
    missingSource: rows.some((r) => r.missing_source_batch), missingCost: rows.some((r) => r.missing_cost),
    missingRevenue: rows.some((r) => r.missing_revenue), missingExpenseEvidence: rows.some((r) => r.missing_expense_evidence),
    missingImportReference: rows.some((r) => r.missing_import_reference),
    missingExpiry: rows.some((r) => r.missing_source_expiry), quantityMismatch: rows.some((r) => r.layer_quantity_mismatch)
  };
  const generatedAt = new Date().toISOString();
  const scope = { aliases: aliases || null, from: from || null, to: to || null, productName: productName || null };
  const csvRows = rows.map((row) => ({ export_generated_at: generatedAt, filter_branch_scope: JSON.stringify(scope.aliases),
    filter_from: scope.from, filter_to: scope.to, filter_product: scope.productName, ...row }));
  const csvFields = ['export_generated_at', 'filter_branch_scope', 'filter_from', 'filter_to', 'filter_product', ...fields];
  return { schemaVersion: 1, generatedAt, scope,
    saleCount: new Set(firsts.map((row) => row.sale_reference || row.movement_id)).size,
    saleLineCount: firsts.length, sourceLayerCount: rows.length, warnings,
    notes: [
    'All matching sales, not only the displayed detail page. Sources are frozen sale snapshots, not current catalogue values.',
    'Decimal amounts are strings to retain precision. Import CSV decimal columns as text; JSON retains exact decimal strings.',
    'Actual revenue, known-cost subtotal and profit appear on the first layer of each movement only. Scope totals repeat and are nonadditive.',
    'Receipt-level expense and landed-value totals repeat for traceability and must not be summed across sale layers.',
    'Matched profit requires revenue, known costs and matching base quantity. Complete audit profit additionally requires source/import, expiry and allocated-expense evidence on every layer.'],
    summary: { knownCostSubtotal: rows[0]?.scope_known_cost_subtotal_nonadditive ?? '0',
      knownRevenueSubtotal: rows[0]?.scope_known_revenue_subtotal_nonadditive ?? '0',
      completeAuditProfit: rows.length ? rows[0].scope_complete_audit_profit_nonadditive : '0' },
    records: rows,
    csv: [csvFields.map(csvCell).join(','), ...csvRows.map((row) => csvFields.map((field) => csvCell(row[field])).join(','))].join('\r\n') + '\r\n' };
}

import {readFile,writeFile} from 'node:fs/promises';
import {buildStockReconciliation} from '../api/services/stockReadOnlyReconciliation.js';
import {normalizeBranchSlug} from '../api/_lib/branchUtils.js';
import {csvCell} from '../api/services/stockCostAudit.js';

// Offline analysis of fingerprint-matched READ-ONLY production extracts.
// This script never opens a database connection or changes business records.
const base='generated-artifacts/stock-audit';
const manifest=JSON.parse(await readFile(`${base}/refresh-manifest.json`,'utf8'));
const load=async path=>{
  const part=JSON.parse(await readFile(path,'utf8'));
  if(part.snapshot_hash!==manifest.snapshot_hash)throw Error('Mismatched production snapshot; register rejected');
  return part.piece;
};
const [projection,balances]=await Promise.all(manifest.files.map(load));
const movementTuples=(await Promise.all(manifest.movementFiles.map(load))).flat();
if(balances.length!==manifest.counts.balances || movementTuples.length!==manifest.counts.movements)
  throw Error('Truncated snapshot; register rejected');
const snapshot={projection,balances,movementTuples};
const report=await buildStockReconciliation(snapshot,{environment:'production'});
const different=v=>v!=null && Math.abs(v)>0.000001;
const reviewed=report.rows.filter(r=>different(r.projectionMinusStored)||different(r.projectionMinusMovements)||
  r.missingSourceQty||r.missingCostQty||r.unknownMovementTypes.length);
const rows=reviewed.map(r=>{
  const projectionPresent=r.states.length>0;
  const causes=[],evidence=[],documents=[];
  if(!projectionPresent){
    causes.push('No active source-layer projection; legacy/opening/sold-out history requires review. Absence is not proof of zero goods.');
    documents.push('Signed physical count and certified opening balance for this location/product/lot');
  }
  if(r.missingSourceQty || r.missingCostQty){
    causes.push('Recorded stock lacks complete original source/cost evidence; do not infer current-price cost');
    documents.push('Supplier invoice, import receipt, allocated expenses and received-source transfer chain');
  }
  if(different(r.projectionMinusStored)){
    causes.push(r.legacyCache?'Legacy cached balance differs from source-layer comparison':'Stored balance differs from recorded layers; cache timing or unmatched historical postings need review');
    documents.push('Opening balance and dated receipt/dispatch/adjustment documents');
  }
  if(different(r.projectionMinusMovements)){
    causes.push('Central net does not establish complete opening or legacy movement coverage');
    documents.push('Opening stock, receipt/transfer acknowledgements, sales/return and write-off documents');
  }
  if(r.unknownMovementTypes.length){
    causes.push(`Unclassified movement types: ${r.unknownMovementTypes.join(', ')}; potentially overlapping legacy events must not be counted or collapsed without linked references`);
    documents.push('Original movement references, matched receipt/dispatch documents and lot/expiry history');
  }
  evidence.push(`Namespace=${r.locationType}; batch=${r.batch||'(missing)'}; expiry=${r.expiry||'(missing)'}`);
  evidence.push(`Recorded layers=${r.states.length}; movement postings=${r.movementCount}; missing references=${r.missingMovementReferences}`);
  if(r.quarantinedQty || r.expiredQty)evidence.push('Expired and quarantine status quantities may overlap; neither is added again to ownership');
  if(r.missingMovementReferences)documents.push('Original reference documents for unlinked central postings');
  documents.push('Signed physical count for this location/product/lot before any historical quantity correction');
  return {
    priority:r.missingSourceQty||r.missingCostQty?'P1':projectionPresent?'P2':'P2-EVIDENCE',
    category:'HISTORICAL_EVIDENCE_OR_RECONCILIATION_REVIEW',
    location:r.location,locationType:r.locationType,product:r.product,batch:r.batch,expiry:r.expiry,
    projectionPresent,recordedLayerQuantity:projectionPresent?r.physicalQty:null,
    storedBalanceQuantity:r.storedBalanceQty,centralHistoryNet:r.movementNet,
    candidateProjectionMinusStored:r.projectionMinusStored,
    candidateProjectionMinusHistory:r.projectionMinusMovements,
    available:r.availableQty,reserved:r.reservedQty,quarantined:r.quarantinedQty,expired:r.expiredQty,inTransit:r.inTransitQty,
    missingSourceUnits:r.missingSourceQty,missingCostUnits:r.missingCostQty,
    likelyCause:causes.join(' | '),supportingEvidence:evidence.join(' | '),
    confidence:'High confidence in extracted comparison; LOW confidence in cause or physical quantity until documents/counts are verified',
    requiredEvidence:[...new Set(documents)].join(' | '),
    proposedCorrection:'None applied. Reconcile documents/count first; submit any quantity/cost/history correction for separate approval.'
  };
}).sort((a,b)=>a.priority.localeCompare(b.priority) ||
  b.missingCostUnits-a.missingCostUnits ||
  Math.abs(b.candidateProjectionMinusHistory)-Math.abs(a.candidateProjectionMinusHistory));
const overlaps={
  storedAndHistory:report.rows.filter(r=>different(r.projectionMinusStored)&&different(r.projectionMinusMovements)).length,
  storedOnly:report.rows.filter(r=>different(r.projectionMinusStored)&&!different(r.projectionMinusMovements)).length,
  historyOnly:report.rows.filter(r=>!different(r.projectionMinusStored)&&different(r.projectionMinusMovements)).length,
  flaggedWithoutActiveProjection:rows.filter(r=>!r.projectionPresent).length,
  missingCostGroups:report.rows.filter(r=>r.missingCostQty>0).length
};
const changedAliasRows=projection.branches.filter(r=>normalizeBranchSlug(r.branch_id)!==String(r.branch_id).trim().toLowerCase());
const register={
  status:'PARTIALLY VERIFIED',capturedAt:manifest.capturedAt,snapshotHash:manifest.snapshot_hash,
  readOnly:true,businessRecordsChanged:false,summary:report.summary,overlaps,
  confirmedSoftwareDefects:[
    {defect:'Search aliases and canonical branch grouping disagreed',developmentFix:'All documented branch search aliases now normalize consistently; Katima, Hochland Park and Walvis Bay held-layer regressions pass',productionAliasRows:changedAliasRows.length,productionFixPublished:false},
    {defect:'Available-only inventory guard prevented printing fully held stock',developmentFix:'Both print actions use physical snapshot availability, not saleable inventory',productionFixPublished:false},
    {defect:'Reconciliation could infer a branch from an explicitly warehouse-typed shared name',developmentFix:'Projection locationType is retained when grouping; warehouse Windhoek and branch Townshop stay separate',productionFixPublished:false}
  ],
  limitations:[
    'Candidate differences compare database representations, not certified physical stock.',
    'A missing active projection is UNKNOWN for physical counting, not proof of zero.',
    'Stored/history counts overlap as shown; missing-cost units are a unit count, not another difference-row count.',
    'Source IDs do not certify supplier documents; no opening quantities or costs were invented.',
    'No historical repair, backfill, deletion or repricing was performed.'
  ],
  rows
};
const columns=Object.keys(rows[0] || {});
await writeFile(`${base}/production-discrepancy-register.json`,JSON.stringify(register,null,2));
await writeFile(`${base}/production-discrepancy-register.csv`,columns.map(csvCell).join(',')+'\r\n'+
  rows.map(r=>columns.map(c=>csvCell(r[c])).join(',')).join('\r\n'));
await writeFile(`${base}/production-stock-reconciliation-refreshed.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({status:register.status,capturedAt:register.capturedAt,...report.summary,overlaps,registerRows:rows.length}));

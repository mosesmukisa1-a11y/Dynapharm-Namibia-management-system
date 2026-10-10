import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {withTransaction} from '../api/db.js';
import {getStockReconciliation,buildStockReconciliation,stockReconciliationSnapshotSql} from '../api/services/stockReadOnlyReconciliation.js';
import {csvCell} from '../api/services/stockCostAudit.js';

const inputIndex=process.argv.indexOf('--input');
const partsIndex=process.argv.indexOf('--parts');
const environment=inputIndex>=0 || partsIndex>=0?'production':'development';
const base='generated-artifacts/stock-audit';
await mkdir(base,{recursive:true});
if(process.argv.includes('--sql')){
  await writeFile(`${base}/reconciliation-snapshot.sql`,await stockReconciliationSnapshotSql({compact:true}));
  console.log('Wrote read-only snapshot query.');process.exit(0);
}
let assembled;
if(partsIndex>=0){
  const manifest=JSON.parse(await readFile(process.argv[partsIndex+1],'utf8'));
  const parts=await Promise.all(manifest.files.map(async path=>JSON.parse(await readFile(path,'utf8'))));
  if(parts.some(p=>p.snapshot_hash!==parts[0].snapshot_hash))
    throw Error('Production data changed between query parts; inconsistent snapshot was not reconciled');
  assembled={...parts[0].piece,movementTuples:parts.slice(1).flatMap(p=>p.piece)};
  if(manifest.balanceTypes){
    const typed=JSON.parse(await readFile(manifest.balanceTypes,'utf8'));
    if(typed.snapshot_hash!==parts[0].snapshot_hash)throw Error('Production balances changed before location-type evidence was captured');
    delete assembled.balanceTuples;assembled.balances=typed.balances;
  }
  await writeFile(`${base}/production-snapshot.json`,JSON.stringify(assembled));
}
const report=assembled?await buildStockReconciliation(assembled,{environment}):inputIndex>=0?await buildStockReconciliation(JSON.parse(await readFile(process.argv[inputIndex+1],'utf8')),{environment}):
  await withTransaction(async client=>{
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    await client.query("SET LOCAL statement_timeout='15s'");
    return getStockReconciliation(async(sql,params)=>(await client.query(sql,params)).rows,{environment});
  });
const columns=['location','locationType','product','batch','expiry','physicalQty','availableQty','reservedQty','quarantinedQty',
  'expiredQty','inTransitQty','storedBalanceQty','movementNet','projectionMinusStored','projectionMinusMovements',
  'missingSourceQty','missingCostQty','historyCompleteness'];
await writeFile(`${base}/${environment}-stock-reconciliation.json`,JSON.stringify(report,null,2));
await writeFile(`${base}/${environment}-stock-reconciliation.csv`,columns.map(csvCell).join(',')+'\r\n'+
  report.rows.map(row=>columns.map(column=>csvCell(row[column])).join(',')).join('\r\n'));
console.log(JSON.stringify({environment,status:report.reconciliationStatus,...report.summary}));
process.exit(0);

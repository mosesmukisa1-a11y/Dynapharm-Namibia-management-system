import {fixture,capture} from './final-release-fixture-probe.mjs';
import {releaseEvidenceRoot as root} from './release-evidence-paths.mjs';
import {readFile,writeFile,access} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {m,db}=await fixture();
const command=await readFile(`/proc/${m.harnessPid}/cmdline`,'utf8');
assert(command.includes('scripts/run-isolated-stock-ui.mjs')&&command.includes('--final-release'));
const report={at:new Date().toISOString(),status:'SNAPSHOT_SAVED',method:'Exact owned disposable fixture only; no business/production data repairs',state:await capture(db)};
report.manualActions=(await db.query('SELECT action,history_id,reverses_history_id,actor_id,approval_reference FROM manual_price_actions ORDER BY id')).rows;
assert.equal(report.manualActions.length,2);
const changed=(await db.query("SELECT metadata->'sale_evidence' AS evidence FROM stock_movements WHERE reference_id='OPERATIONAL-NEW-PRICE'")).rows;
assert.equal(changed.length,1);assert.equal(Number(changed[0].evidence.dp_unit_price),351);
assert.equal(Number(changed[0].evidence.original_received_dpc),341);
await writeFile(root+'/final-state.json',JSON.stringify(report,null,2));
await db.end();process.kill(m.harnessPid,'SIGTERM');
await new Promise(r=>setTimeout(r,3000));
const cleanup={at:new Date().toISOString(),harnessStopped:false,privateAuthRemoved:false,databaseDropped:false};
try{process.kill(m.harnessPid,0);}catch(e){cleanup.harnessStopped=e.code==='ESRCH';}
try{await access(m.authFile);}catch(e){cleanup.privateAuthRemoved=e.code==='ENOENT';}
try{const unexpected=await fixture();await unexpected.db.end();}catch(e){cleanup.databaseDropped=e.code==='3D000';cleanup.databaseConnectionErrorCode=e.code;}
cleanup.status=cleanup.harnessStopped&&cleanup.privateAuthRemoved&&cleanup.databaseDropped?'PASS':'NOT VERIFIED';
await writeFile(root+'/cleanup.json',JSON.stringify(cleanup,null,2));
console.log(JSON.stringify(cleanup));if(cleanup.status!=='PASS')process.exitCode=1;

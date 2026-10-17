import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {reviewSqlLocations} from './lib/sql-caller-proof.mjs';
const out='generated-artifacts/security-release-gate-final';
const base=JSON.parse(await fs.readFile('generated-artifacts/security-remediation-final/sql-caller-inventory.json','utf8'));
const unresolved=base.inventory.filter(x=>x.classification==='UNRESOLVED');
if(unresolved.length!==182)throw Error('Expected retained 182-location review baseline; do not silently change scope');
const rows=[];
for(const file of new Set(unresolved.map(x=>x.file))){
  const source=await fs.readFile(file,'utf8');
  for(const row of reviewSqlLocations(source,unresolved.filter(x=>x.file===file)))
    rows.push({...row,sourceSha256:createHash('sha256').update(source).digest('hex')});
}
const counts={};for(const row of rows)counts[row.classification]=(counts[row.classification]||0)+1;
await fs.mkdir(out,{recursive:true});
await fs.writeFile(out+'/sql-caller-review.json',JSON.stringify({baselineCount:182,reviewedCount:rows.length,
  counts,sourceSnippetsSaved:false,scanRulesSuppressed:false,genericExecutorResolved:false,
  hostileEndpointFamilyTestsComplete:false,remainingBlockers:rows.filter(x=>x.classification==='unresolved blocker').length,
  limitations:['Conservative syntax proof only','No proof of alias behavior outside the local source scope',
    'No permission/semantic SQL correctness claim','Unresolved paths remain release blockers'],
  locations:rows},null,2));
console.log(JSON.stringify({reviewed:rows.length,counts}));

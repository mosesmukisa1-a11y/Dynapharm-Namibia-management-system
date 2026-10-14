import { mkdir, writeFile, stat } from 'node:fs/promises';
import { withTransaction, closePool } from '../api/db.js';
import { readSaleRepairPlan, applySaleRepairPlanTx } from '../api/services/saleEvidenceRepair.js';
import { validateBusinessDates } from '../api/services/businessDates.js';

const args=process.argv.slice(2),get=flag=>args[args.indexOf(flag)+1];
const options={reference:args.includes('--reference')?get('--reference'):null,
  branch:args.includes('--branch')?get('--branch'):null,
  from:args.includes('--from')?get('--from'):null,to:args.includes('--to')?get('--to'):null};
try{
  validateBusinessDates(options.from,options.to);
  if(!options.reference && !(options.branch && options.from && options.to))
    throw Error('Supply --reference, or --branch with --from and --to (maximum 31 days)');
  if(!options.reference && (Date.parse(options.to)-Date.parse(options.from))/86400000>30)
    throw Error('Repair date range must not exceed 31 days');
  const apply=args.includes('--apply');
  if(apply){
    if(!args.includes('--approve') || !args.includes('--fingerprint') || !args.includes('--backup'))
      throw Error('Apply requires reviewed --approve PLAN_HASH --fingerprint FINGERPRINT --backup FILE');
    const backup=await stat(get('--backup'));
    if(!backup.isFile() || backup.size===0)throw Error('Backup must be a nonempty existing file');
  }
  const result=await withTransaction(async client=>{
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    if(!apply)await client.query('SET TRANSACTION READ ONLY');
    const plan=await readSaleRepairPlan(client,options);
    if(apply){
      if(plan.planHash!==get('--approve') || plan.fingerprint!==get('--fingerprint'))throw Error('Evidence changed since dry run; review a new dry run');
      const checks=await applySaleRepairPlanTx(client,plan);
      const after=await readSaleRepairPlan(client,options);
      return {mode:'apply',before:plan,after,checks};
    }
    return {mode:'dry-run',...plan};
  });
  await mkdir('generated-artifacts/sale-repair',{recursive:true});
  const path=`generated-artifacts/sale-repair/${Date.now()}-${result.mode}.json`;
  await writeFile(path,JSON.stringify(result,null,2),{mode:0o600});
  console.log(`Metadata-only ${result.mode} report: ${path}`);
  if(!apply)console.log(`Eligible: ${result.eligible.length}; review: ${result.review.length}; plan hash: ${result.planHash}; fingerprint: ${result.fingerprint}`);
}catch(error){console.error(error.message);process.exitCode=1;}
finally{await closePool();}

import { mkdir, writeFile, stat } from 'node:fs/promises';
import { withTransaction, closePool } from '../api/db.js';
import { readSaleRepairPlan, applySaleRepairPlanTx } from '../api/services/saleEvidenceRepair.js';
import { validateBusinessDates } from '../api/services/businessDates.js';

const args=process.argv.slice(2),values=new Map();
const valueFlags=new Set(['--reference','--branch','--from','--to','--approve','--fingerprint','--database-fingerprint','--backup']);
const switches=new Set(['--apply','--backup-verified']);
const get=flag=>values.get(flag);
try{
  for(let i=0;i<args.length;i++){
    const flag=args[i];
    if(values.has(flag))throw Error(`Duplicate argument: ${flag}`);
    if(switches.has(flag)){values.set(flag,true);continue;}
    if(!valueFlags.has(flag))throw Error(`Unknown argument: ${flag}`);
    const value=args[++i];
    if(!value || value.startsWith('--'))throw Error(`Missing value for ${flag}`);
    values.set(flag,value);
  }
  const options={reference:get('--reference') || null,branch:get('--branch') || null,
    from:get('--from') || null,to:get('--to') || null};
  validateBusinessDates(options.from,options.to);
  if(!options.reference && !(options.branch && options.from && options.to))
    throw Error('Supply --reference, or --branch with --from and --to (maximum 31 days)');
  if(!options.reference && (Date.parse(options.to)-Date.parse(options.from))/86400000>30)
    throw Error('Repair date range must not exceed 31 days');
  const apply=values.has('--apply');
  if(apply){
    if(!get('--approve') || !get('--fingerprint') || !get('--database-fingerprint') || !get('--backup') || !get('--backup-verified'))
      throw Error('Apply requires reviewed --approve PLAN_HASH --fingerprint FINGERPRINT --database-fingerprint DATABASE_FINGERPRINT --backup FILE --backup-verified (operator attests that the correct database backup was verified restorable)');
    if(['--approve','--fingerprint','--database-fingerprint'].some(flag=>!/^[a-f0-9]{64}$/.test(get(flag))))
      throw Error('Approval hash and fingerprint must be full SHA-256 values from the reviewed dry run');
    const backup=await stat(get('--backup'));
    if(!backup.isFile() || backup.size===0)throw Error('Backup must be a nonempty existing file');
  }
  const result=await withTransaction(async client=>{
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    if(!apply)await client.query('SET TRANSACTION READ ONLY');
    const plan=await readSaleRepairPlan(client,options);
    if(apply){
      if(!plan.readiness.isPrimary)
        throw Error('Repair blocked: confirm the primary database and review a fresh CLI dry run; replica plans are not approval values');
      if(plan.readiness.databaseFingerprint!==get('--database-fingerprint'))
        throw Error('Database differs from the explicitly approved target; review a new dry run');
      if(!plan.readiness.schemaReady)
        throw Error(`Repair blocked: ${plan.readiness.blockers.join('; ')}. Resolve schema readiness through the supported deployment process.`);
      if(plan.planHash!==get('--approve') || plan.fingerprint!==get('--fingerprint'))throw Error('Evidence changed since dry run; review a new dry run');
      const checks=await applySaleRepairPlanTx(client,plan);
      const after=await readSaleRepairPlan(client,options);
      return {mode:'apply',before:plan,after,checks,
        approval:{planHash:get('--approve'),fingerprint:get('--fingerprint'),
          databaseFingerprint:get('--database-fingerprint'),backupVerifiedByOperator:true}};
    }
    return {mode:'dry-run',...plan};
  });
  await mkdir('generated-artifacts/sale-repair',{recursive:true});
  const path=`generated-artifacts/sale-repair/${Date.now()}-${result.mode}.json`;
  await writeFile(path,JSON.stringify(result,null,2),{mode:0o600});
  console.log(`Metadata-only ${result.mode} report: ${path}`);
  if(!apply)console.log(`Eligible: ${result.eligible.length}; review: ${result.review.length}; plan hash: ${result.planHash}; fingerprint: ${result.fingerprint}`);
  if(!apply)console.log(`Database fingerprint: ${result.readiness.databaseFingerprint}; primary: ${result.readiness.isPrimary}; schema ready: ${result.readiness.schemaReady}${result.readiness.blockers.length?`; blockers: ${result.readiness.blockers.join('; ')}`:''}`);
}catch(error){console.error(error.message);process.exitCode=1;}
finally{await closePool();}

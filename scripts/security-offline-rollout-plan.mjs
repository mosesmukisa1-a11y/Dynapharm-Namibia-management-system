// Read retained evidence and repository SQL as bytes only. Never import a DB.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {schemaDigest} from './lib/consolidated-contract.mjs';
import {assessOfflinePreflight} from './lib/offline-rollout-preflight.mjs';
const base='generated-artifacts/sql-security-final-closure';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const files=[
  'migrations/036_canonical_branches.sql',
  'migrations/037_canonical_branch_distributor_profit.sql',
  'migrations/038_canonical_users_additional_roles.sql',
  'migrations/039_canonical_branch_activity_transactions.sql',
  'migrations/040_canonical_consolidated_schema.sql',
  'migrations/041_branch_client_visits.sql',
];
try{
  const prior=await read('generated-artifacts/final-security-release-gate/candidate-manifest.json');
  const sourceHashes=Object.create(null);
  for(const file of files){
    const digest=createHash('sha256').update(await fs.readFile(file)).digest('hex');
    if(prior.files[file]!==digest)throw Error('Reviewed migration bytes changed');
    sourceHashes[file]=digest;
  }
  const canonical=await read('tests/fixtures/canonical-schema-contract.json');
  const support=await read('tests/fixtures/consolidated-schema-contract.json');
  const visits=await read('tests/fixtures/branch-client-visits-schema-contract.json');
  const schemaFingerprints=Object.create(null);
  for(const object of canonical.objects){
    const scope=object.table==='users'?'users.additional_roles':object.table;
    schemaFingerprints['canonical.public.'+scope]=schemaDigest(object);
  }
  for(const [name,digest]of Object.entries(support.tables))schemaFingerprints['full.public.'+name]=digest;
  for(const [name,digest]of Object.entries(support.functions))schemaFingerprints['full.function.'+name]=digest;
  schemaFingerprints['full.public.branch_client_visits']=schemaDigest(visits.table);
  const migrations=files.map((file,index)=>({
    file,sha256:sourceHashes[file],
    classification:index===2||index===4?'compatibility-sensitive; reviewed additive setup only':'additive-if-absent; existing structure must match',
    review:[
      'Create branches and reviewed indexes only; existing-table drift must block.',
      'Create distributor-profit table and reviewed indexes only; no revenue/cost repair.',
      'ADD COLUMN IF NOT EXISTS does not validate an existing default/type/nullability. Require the exact captured additional_roles contract; other users columns are outside authority.',
      'Create activity transaction table/indexes only; no historical sale or payment posting.',
      'Existing trigger-function replacement, sequence ownership, FK/index and conditional trigger setup require exact captured contracts before any future execution. No backfill.',
      'Create visits and reviewed indexes only; preserve exact native types/defaults/PK; no inferred FK, trigger or sequence.',
    ][index],
  }));
  const plan={
    status:'NON-EXECUTING REVIEW; DO NOT PUBLISH',recordedAt:new Date().toISOString(),
    sourceHashes,schemaFingerprints,migrations,
    fingerprintProtocol:'Exact canonical touched-object projections for the first four objects; complete normalized metadata for consolidated support objects/function and visits. Normalize only captured installation-generated RI trigger OID digits.',
    scopeLimits:['Only users.additional_roles is captured; no full users-schema claim.','Captured evidence is historical, not fresh target verification or execution authority.'],
    requiredFutureControls:['Fresh separately authorized target identity and read-only schema observation','Exact key sets and SHA-256 fingerprint equality; no missing, extra or changed object','Reviewed recoverable backup and recovery validation','Review compatible rollout separately; prohibit destructive alteration, backfill and row repair','No migration, deployment or service action is implemented by this plan'],
    productionAccess:false,productionWrites:false,migrationExecuted:false,
  };
  plan.retainedContractSelfCheck=assessOfflinePreflight(plan,{sourceHashes,schemaFingerprints});
  await fs.mkdir(base,{recursive:true});
  await fs.writeFile(base+'/rollout-preflight.json',JSON.stringify(plan,null,2)+'\n');
  console.log('Offline migration plan saved; no database access or execution.');
}catch{
  process.stderr.write('Offline migration review failed closed; no database operation attempted.\n');
  process.exitCode=1;
}

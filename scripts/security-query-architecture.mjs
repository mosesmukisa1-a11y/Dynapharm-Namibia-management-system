import fs from 'node:fs/promises';
import {compileSqlDescriptors} from './lib/sql-descriptor-compiler.mjs';
const out='generated-artifacts/sql-architecture-final';
await fs.mkdir(out,{recursive:true});
const compiled=await compileSqlDescriptors(process.cwd());
await fs.writeFile(out+'/compiler-coverage.json',JSON.stringify({
  status:compiled.issues.length?'BLOCKED - DO NOT PUBLISH':'COMPILER COVERAGE ONLY — NOT RELEASE CLEARANCE',
  modules:compiled.modules.size,registeredPlans:Object.keys(compiled.catalog).length,
  locations:compiled.locations,issues:compiled.issues,productionAccess:false,
},null,2));
console.log(JSON.stringify({modules:compiled.modules.size,plans:Object.keys(compiled.catalog).length,
  unresolved:compiled.issues.length}));

// Static source inventory only. Never connects to a database or executes a job.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {parse} from '@babel/parser';
import {TASKS} from '../worker/tasks.mjs';
const results=[];
for(const task of TASKS){
 const [file,name]=task.source.split('#'),source=await readFile(file,'utf8');
 const ast=parse(source,{sourceType:'module',plugins:['jsx']});
 const functions=ast.program.body.flatMap(node=>node.declaration?[node.declaration]:[node]);
 const found=functions.find(n=>n.type==='FunctionDeclaration'&&n.id?.name===name);
 const text=found?source.slice(found.start,found.end):'';
 const reads=[...text.matchAll(/\b(?:FROM|JOIN)\s+([a-z_][a-z_0-9]*)/gi)].map(m=>m[1].toLowerCase());
 const writes=[...text.matchAll(/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-z_][a-z_0-9]*)/gi)].map(m=>m[1].toLowerCase());
 results.push({...task,found:!!found,line:found?.loc.start.line,
  directStaticReads:[...new Set(reads)].sort(),directStaticWrites:[...new Set(writes)].sort(),
  limitations:'Literal source scan, includes possible prose/CTE tokens; transitive helper SQL and interpolation not resolved. Not authority to execute.'});
}
await mkdir('generated-artifacts/stock-worker/test-evidence',{recursive:true});
await writeFile('generated-artifacts/stock-worker/test-evidence/source-inventory.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(({id,found,line})=>({id,found,line}))));

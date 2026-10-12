import fs from 'node:fs/promises';
const dir='generated-artifacts/stock-navigation-audit';
const matrix=JSON.parse(await fs.readFile(`${dir}/initial-matrix.json`,'utf8'));
const browser=JSON.parse(await fs.readFile(`${dir}/browser-stages.json`,'utf8'));
for(const row of matrix){
 const observed=browser.stages.find(s=>s.view===row.id);
 row.tests=observed?`Authenticated synthetic stock session: ${observed.result}; heading ${observed.heading}; active item ${observed.active}. Relevant stock-changing workflow, full role matrix, filters and exports NOT VERIFIED.`:row.tests;
 if(row.id==='writeOffs')row.tests+=' Isolated disposal/authorization regressions PASS; original stock-safety suite PASS. Combined 14 database tests; not browser disposal transactions.';
 row.blocker='Full per-tab workflow fixtures and browser transaction/export/failure cases have not been executed. Production record identity and historical truth were not investigated in this pass.';
}
const keys=Object.keys(matrix[0]);
await fs.writeFile(`${dir}/final-matrix.csv`,[keys.join(','),...matrix.map(row=>keys.map(k=>`"${String(row[k]).replaceAll('"','""')}"`).join(','))].join('\n'));
await fs.writeFile(`${dir}/final-matrix.md`,'# Stock portal audit matrix\n\n**PARTIALLY VERIFIED.** Source inventory of all 27 destinations. Rendering is not proof of workflow correctness. See report.md for confirmed bugs, tests and limitations.\n\n'+matrix.map(row=>`## ${row.label}\n`+Object.entries(row).map(([k,v])=>`- **${k}:** ${v}`).join('\n')).join('\n\n'));
console.log('Final matrix saved; all unexecuted workflow checks remain NOT VERIFIED.');

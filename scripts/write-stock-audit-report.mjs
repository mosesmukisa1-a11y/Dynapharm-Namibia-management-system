import {readFile,writeFile} from 'node:fs/promises';
const base='generated-artifacts/stock-audit';
const results=JSON.parse(await readFile(`${base}/test-results.json`,'utf8'));
const lifecycle=JSON.parse(await readFile(`${base}/lifecycle-results.json`,'utf8'));
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const values=value=>Object.entries(value).map(([key,number])=>`${key}: ${number}`).join(', ');
const stages=lifecycle.steps.map(step=>`<tr><th scope="row">${escape(step.name)}</th><td>${escape(values(step.expected))}</td><td>${escape(values(step.actual))}</td><td>${step.pass?'PASS':'FAIL'}</td></tr>`).join('');
const suites=results.testResults.map(file=>`<details><summary>${escape(file.name.split('/tests/')[1] || file.name)} (${file.assertionResults.length} checks)</summary><ul>${file.assertionResults.map(check=>`<li>${escape(check.title)} — ${escape(check.status)}</li>`).join('')}</ul></details>`).join('');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stock lifecycle audit — 10 October 2026</title>
<style>body{font:16px/1.6 system-ui,sans-serif;color:#172c3d;background:#f4f6f8;margin:0}main{max-width:1100px;margin:auto;background:white;padding:32px}h1,h2{line-height:1.25}h1{font-size:32px}.status{border-left:5px solid #a56808;background:#fff6df;padding:16px}.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid #ccd7df;padding:12px}thead{background:#e9eff4}code,pre{background:#edf1f5}pre{padding:16px;overflow:auto}details{border-bottom:1px solid #ccd7df;padding:12px 0}summary{cursor:pointer;font-weight:600}@media(max-width:600px){main{padding:18px}h1{font-size:26px}}@media print{body,main{background:white}details{break-inside:avoid}}</style>
<main><h1>Stock lifecycle audit</h1><p>10 October 2026 · Dynapharm Namibia · Business timezone: Africa/Windhoek</p>
<p class="status"><strong>Overall status: PARTIALLY VERIFIED.</strong> The selected automated API/service workflows pass; this is not certification of every staff screen, historical business balance or alert setting.</p>
<p><strong>${results.numPassedTests}/${results.numTotalTests} checks passed across ${results.testResults.length} test files.</strong> Production frontend build passes. The running development app starts and its public landing page renders.</p>
<h2>What was tested safely</h2><p>All stock-changing tests ran in a separate temporary PostgreSQL database created from schema only. No business rows were copied. Only synthetic fixtures were used; the temporary database was removed after each run, including failures. No live payment services were used. These figures are synthetic test results, not production stock balances.</p>
<p>Fixture: TEST-ITEM; barcode 0001234567895; 1 carton = 10 units; a warehouse, two branches, batch TEST-LOT, expiry 2035-12-31. Import receipt first enters country stock, followed by approved warehouse receipt.</p>
<h2>Problems reproduced and fixed</h2><ul>
<li>New transit receipts and linked customer refunds were omitted from branch movement totals. Their movement types now contribute correctly.</li>
<li>Quarantined write-offs were omitted by branch-only location filters. Quarantine history is mapped to its owning branch, and damage segregation does not itself count as a physical loss.</li>
<li>Closing physical stock excluded owned reservations and segregated stock. It now reads the same physical/status projection used by the stock-cost and GM summaries.</li>
<li>A branch-level central-ledger guard could hide unmatched legacy branch receipts. Mirrors are now matched by reference/product/batch rather than suppressing an entire branch history.</li>
<li>GM sales/movement/write-off queries stopped at 23:59:59 and excluded the final fractional second. They now use an exclusive next-day boundary.</li>
</ul>
<h2>Expected versus actual</h2><div class="scroll"><table><thead><tr><th>Check</th><th>Expected</th><th>Actual</th><th>Result</th></tr></thead><tbody>${stages}</tbody></table></div>
<p>Final TEST-ITEM stock: warehouse 50; Branch A 23; Branch B 20; transit 0; company physical stock 93. Gross sold 8, saleable returned 2, net sold 6, written off 1. Test CIF valuation 186 and gross sale profit 56 use received cost 2/unit and actual sale revenue 9/unit; these are test currency amounts, not live financial results.</p>
<h2>Safety coverage</h2><p>Passing suites cover receipt retries and partial receipts; original source costs and carton conversion; real transfer dispatch/cancel/reject row-lock races; sale oversell protection and FEFO/expired exclusion; return entitlements and damaged/expired segregation; supplier approval/dispatch/credit stages; atomic count differences and branch/GM authorization; and source-cost reporting.</p>
<h2>Current setup</h2><p>React/Vite frontend, Node/Express API and PostgreSQL. Products/prices and string barcodes are separate from explicit pack configurations. Stock batches, warehouse mirrors and branch batches retain lot/expiry/source evidence. Transfers persist line allocations and transit; sales and linked returns preserve original cost evidence. Controlled stock operations hold count and inspection approvals and segregated stock. Reports combine physical/status projections with central and branch histories.</p>
<h2>Limits and remaining gaps</h2><ul>
<li>No authenticated browser run was performed for the complete staff workflow. The public page was visually checked; API tests invoke real handlers and transactions with synthetic actors, not the login/cookie middleware.</li>
<li>GM low-stock and expiry counts still use fixed 10-unit and 90-day constants. Configurable alert thresholds and their UI behavior are not fully verified.</li>
<li>Slow-moving-stock alerts, purchase-order-only behavior and every older report/date-filter path were not independently exercised in this pass.</li>
<li>The fractional-second boundary is verified, but no comprehensive cross-timezone/offline/backdated transaction matrix was run.</li>
<li>Net sold quantity is verified; cross-screen net refund revenue/profit parity, including legacy DP-based dashboards, is not certified by the gross-cost checks.</li>
<li>No production-data reconciliation or physical-count verification was performed. Historical corrections remain separately approved; no automatic stock backfill was enabled.</li>
</ul>
<h2>Rerun without touching business records</h2><pre>node scripts/run-isolated-stock-audit.mjs
node scripts/write-stock-audit-report.mjs

# Focus only on the new lifecycle checks:
node scripts/run-isolated-stock-audit.mjs tests/stock-lifecycle-end-to-end.spec.js</pre>
<p>Run in the development workspace with its existing database configuration and PostgreSQL tools. The new lifecycle suite refuses to run against a shared database. Older suites must be run through the isolation command above, not directly against the business database. The runner needs permission to create/drop its temporary database. Credentials are never included in the report.</p>
<h2>Individual checks</h2>${suites}</main></html>`;
if(Buffer.byteLength(html,'utf8')>5*1024*1024)throw Error('Audit report is too large');
await writeFile(`${base}/stock-lifecycle-audit.html`,html);
console.log(`Wrote audit report: ${results.numPassedTests}/${results.numTotalTests} checks; overall PARTIALLY VERIFIED.`);

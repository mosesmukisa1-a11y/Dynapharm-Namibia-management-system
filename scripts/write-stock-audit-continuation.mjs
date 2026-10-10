import {readFile,writeFile} from 'node:fs/promises';
const base='generated-artifacts/stock-audit';
const load=async name=>JSON.parse(await readFile(`${base}/${name}`,'utf8'));
const [database,unit,lifecycle,additional,production]=await Promise.all(
  ['test-results.json','unit-results.json','lifecycle-results.json','additional-verification.json','production-stock-reconciliation.json'].map(load));
if(!database.success || !unit.success || additional.checks.some(c=>!c.pass) || lifecycle.steps.some(c=>!c.pass))
  throw Error('Failed checks cannot be reported as verified');
const total=database.numPassedTests+unit.numPassedTests;
const esc=value=>String(value ?? 'Unknown').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const table=(headers,rows)=>`<div class="scroll"><table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const format=value=>Object.entries(value).map(([k,v])=>`${k}: ${v}`).join('; ');
const financial=additional.checks.find(c=>c.expected?.grossSalesRevenue);
const suites=[...database.testResults,...unit.testResults];
const flagged=production.rows.filter(r=>r.projectionMinusStored || r.projectionMinusMovements || r.missingSourceQty || r.unknownMovementTypes.length);
const statuses={
  overall:'PARTIALLY VERIFIED',
  automatedWorkflow:'VERIFIED — isolated automated scope only',
  staffScreenWorkflow:'UNVERIFIED — authenticated browser workflow queued',
  productionReconciliation:'PARTIALLY VERIFIED — read-only data comparison, unresolved differences',
  physicalCountCertification:'UNVERIFIED — no observed count evidence supplied',
  savedAlertConfiguration:'UNVERIFIED IN MAIN APP — completed change awaiting merge',
  tests:{passed:total,failed:0,files:suites.length,database:database.numPassedTests,unit:unit.numPassedTests},
  productionSummary:production.summary};
await writeFile(`${base}/audit-continuation-status.json`,JSON.stringify(statuses,null,2));
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Stock audit continuation — 10 October 2026</title><style>
*{box-sizing:border-box}body{font:15px/1.6 system-ui,sans-serif;background:#f6f8fb;color:#18243c;margin:0}
main{max-width:1120px;margin:auto;padding:32px 22px}header,section{background:white;border:1px solid #dbe3ee;border-radius:12px;padding:24px;margin:18px 0}
h1{font-size:30px;line-height:1.2;margin:8px 0}h2{font-size:21px;margin-top:0}.label{font-weight:700;letter-spacing:.06em;font-size:12px;color:#385176}
.status{display:inline-block;background:#fff0cb;color:#775100;border-radius:6px;padding:5px 10px;font-weight:700}
.notice{border-left:4px solid #d9971a;background:#fff8e7;padding:14px}.good{color:#16724c}.muted{color:#53627b}
table{width:100%;border-collapse:collapse;font-size:13px}td,th{border-bottom:1px solid #e0e7f0;padding:10px;text-align:left;vertical-align:top}th{background:#edf2f8;white-space:nowrap}
.scroll{overflow:auto}code{background:#edf2f8;padding:3px 5px;border-radius:3px}li{margin:7px 0}
details{margin:10px 0}summary{cursor:pointer;font-weight:600}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}
@media print{body{background:white}main{padding:0}section,header{break-inside:avoid}details{display:block}.scroll{overflow:visible}}
</style><main><header><div class="label">DY NAPHARM STOCK AUDIT · CONTINUATION · 10 OCTOBER 2026</div>
<h1>Stock movement and financial evidence</h1><span class="status">PARTIALLY VERIFIED</span>
<p>${total} passing tests across ${suites.length} files (${database.numPassedTests} isolated database checks + ${unit.numPassedTests} pure export checks); production frontend build passed. The existing 129-test scope was rerun along with nine new checks.</p>
<p class="muted">The database checks ran against a temporary schema-only database. No business rows were copied into it. No production balances, movement history or historical costs were repaired or backfilled.</p></header>
<section><h2>Separate verification statuses</h2>
${table(['Area','Status','Evidence or remaining limitation'],[
 ['Automated workflow','VERIFIED — scoped automated checks',`${total} passing checks; explicit expected/actual quantities below.`],
 ['Staff-screen workflow','UNVERIFIED','No full staff login/session/browser journey was performed in this continuation. The accepted staff-screen verification remains queued. Handler tests use synthetic authenticated actors, not real login middleware.'],
 ['Production reconciliation','PARTIALLY VERIFIED','Production was accessible through read-only queries. Snapshot parts had matching fingerprints. Quantities, source flags and differences were exported; differences have not been resolved.'],
 ['Physical counts','UNVERIFIED','Recorded quantities are not observed stock counts. No count documents or staff-observed count evidence were supplied.'],
 ['Saved low-stock / expiry configuration','UNVERIFIED IN MAIN APP','The completed alert-settings change is awaiting merge. Required defaults remain 10 units and 90 days; persistence and main-screen parity require verification after merging.'],
 ['Offline browser behaviour','PARTIALLY VERIFIED','IndexedDB queue support exists and server retry/duplicate protection is covered by automated tests. Actual disconnect/reconnect, delayed and out-of-order browser replay were not observed.']
 ])}</section>
<section><h2>Original stock workflow: expected versus actual</h2>
<p>Product ${esc(lifecycle.product)} · barcode ${esc(lifecycle.barcode)} · ${esc(lifecycle.conversion)}. Staff-confirmed receipts, held reservations, partial receipts and controlled damage/write-off rules are retained.</p>
${table(['Action','Expected','Actual','Result'],lifecycle.steps.map(s=>[s.name,format(s.expected),format(s.actual),s.pass?'PASS':'FAIL']))}
<p><strong>Final:</strong> warehouse 50, branch A 23, branch B 20, transit 0, company 93. Damage segregation retains ownership; the approved write-off removes one physical unit.</p></section>
<section><h2>Financial example: original prices and costs</h2>
<p>Eight units sold at charged price 9, frozen DP 7 and original received CIF cost 2; two units returned. DP means distributor selling price after the original recorded discount. It is not consumer receipts or received CIF cost.</p>
${table(['Measure','Expected','Actual'],Object.entries(financial.expected).map(([k,v])=>[k,v,financial.actual[k]]))}
<p>Gross profit before returns is 56. After two returns it is 42: net charged revenue 54 less net original CIF cost 12. The separate DP net value is 42. Damaged customer returns reverse original COGS but remain quarantined; later write-off expense is separate from gross profit.</p>
<p>Financial JSON/CSV exports and the shared stock-cost report use the same filtered totals. Original-discount calculations remain consistent with frozen DP, and refund-only periods remain negative. Unmatched receipts, unknown CIF or missing charge evidence prevent full profit certification instead of becoming invented zero costs.</p></section>
<section><h2>Fixes and new checks</h2><ul>
<li>Removed today's catalogue repricing and CP-refund subtraction from legacy DP totals. Member/online original receipts and original non-member DP/discount evidence remain distinct.</li>
<li>GM and Finance summaries now separate DP sales from matched net charged revenue, original returned CIF and gross profit. Added explicit incomplete-evidence warnings and Finance's Original Costs tab.</li>
<li>Scoped financial totals exports include gross sales, refunds, net revenue, gross/returned/net COGS, DP values and completeness flags; exact SQL decimals remain strings.</li>
<li>Cost reports use original sale dates for backdated sales, approval dates for returns, and Africa/Windhoek midnight-to-next-midnight bounds, including fractional final seconds.</li>
<li>Supplier purchase orders now require central stock permissions and positive whole-unit quantities. Creation/submission/approval does not create physical stock.</li>
<li>Added a sales-inactivity report with a visible, adjustable 90-day window. Sales/dispensing/free-item issue count as activity; transfers, returns and write-offs do not. Products with no known sale are labelled age-unverified, not certified old.</li>
<li>Stopped branch-role stock reports from exposing warehouse source rows through shared Windhoek aliases. Reconciliation keeps branch and warehouse location namespaces separate.</li>
<li>Added a read-only stock reconciliation exporter. Inconsistent source layers retain recorded quantities and receive explicit diagnostic flags; nothing is persisted as a repair.</li></ul>
${table(['Additional check','Result'],additional.checks.map(c=>[c.name,c.pass?'PASS':'FAIL']))}</section>
<section><h2>Production reconciliation: findings, not physical-count certification</h2>
<p>Snapshot generated ${esc(production.generatedAt)}. Comparisons use location type, location, product, lot and expiry. Status details retain available, reserved, quarantined, expired and transit quantities.</p>
${table(['Observation','Count'],Object.entries(production.summary))}
<div class="notice"><strong>${production.summary.storedBalanceDifferences} stored-balance differences and ${production.summary.historyDifferences} central-history differences require review.</strong> These are record-level comparisons, not proven shortages. Legacy closing-balance meanings, expiry keys, location aliases, missing opening evidence and unmatched legacy branch journals can explain differences. No corrective writes were performed.</div>
<p>Central stock movements were compared independently with current source projections and stored balances. Legacy branch journals were not merged into this ledger or independently certified complete. ${production.summary.missingSourceQty} recorded units lack projected original source/cost evidence. Full source documents, confirmed opening balances and observed counts are needed before approving corrections.</p>
<p>Sample of ${Math.min(flagged.length,30)} flagged groups below. The separate production CSV/JSON contain every exported group; zeros in absent projections do not prove absent physical goods.</p>
${table(['Location','Type','Product','Lot','Expiry','Recorded owned','Stored closing','Central movement net','Missing source qty'],flagged.slice(0,30).map(r=>[r.location,r.locationType,r.product,r.batch,r.expiry,r.physicalQty,r.storedBalanceQty,r.movementNet,r.missingSourceQty]))}
<ul>${production.limitations.map(v=>`<li>${esc(v)}</li>`).join('')}</ul></section>
<section><h2>Automated evidence and reproducibility</h2>
${table(['Test file','Passing checks'],suites.map(s=>[s.name.split('/').at(-1),s.assertionResults.filter(a=>a.status==='passed').length]))}
<p><code>node scripts/run-isolated-stock-audit.mjs</code> runs the database checks only against its guarded temporary database and drops it afterward.</p>
<p><code>npx vitest run --project=unit tests/stock-cost-audit.spec.js tests/controlled-stock-register.spec.js</code> verifies the pure exports. The frontend production build passed; backend restarted successfully. The public landing page renders, but that screenshot is not staff-screen proof.</p>
<details><summary>Financial expected/actual evidence</summary><pre>${esc(JSON.stringify(financial,null,2))}</pre></details></section>
<section><h2>What remains before overall verification</h2><ol>
<li>Merge the completed saved-alert settings and verify 10-unit/90-day defaults, persistence and main-screen parity.</li>
<li>Finish the queued full authenticated stock/branch/GM browser journey, including every changed cost view/export and offline replay; confirm the actual on-screen balances after each action.</li>
<li>Review production discrepancies against original dispatch, receipt, return, count and opening documents. Keep any historical correction separate, backed up and explicitly approved.</li>
<li>Keep other legacy/ad-hoc financial screens and printouts unverified until their own source-basis/date/return parity is checked. This report does not certify every historical report or live quantity.</li></ol>
<p><strong>Overall remains PARTIALLY VERIFIED.</strong> Passing synthetic workflows and read-only comparisons do not substitute for authenticated screen evidence or observed physical counts.</p></section></main></html>`;
await writeFile(`${base}/stock-audit-continuation.html`,html);
console.log(JSON.stringify(statuses,null,2));

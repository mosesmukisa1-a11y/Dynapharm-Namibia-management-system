// Run only against the disposable UI harness. Never mutates the business DB.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import pg from 'pg';

const manifest = JSON.parse(await fs.readFile('generated-artifacts/client-history/environment.json', 'utf8'));
const source = new URL(process.env.DATABASE_URL);
assert(manifest.disposable && /^stock_audit_[a-f0-9]{32}$/.test(manifest.isolatedDatabase));
assert.notEqual(source.pathname, '/' + manifest.isolatedDatabase);
process.kill(manifest.harnessPid, 0);
source.pathname = '/' + manifest.isolatedDatabase; source.search = '';
const pool = new pg.Pool({ connectionString: source.toString() });
const base = `http://127.0.0.1:${manifest.backendPort}/api`;
const evidence = [];
async function login(username) {
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'DisposableStockUi-2026!' }),
  });
  assert.equal(response.status, 200, 'Synthetic staff login');
  return response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
}
async function decision(cookie, ids, action = 'approve') {
  const response = await fetch(`${base}/stock-adjustments/bulk-decision`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ action, ids, approved_by: 'FORGED-ACTOR' }),
  });
  const body = await response.json();
  evidence.push({ endpoint: '/api/stock-adjustments/bulk-decision', action, ids, status: response.status, body });
  return { status: response.status, body };
}
async function seed(table, values) {
  const columns = (await pool.query(
    "SELECT column_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [table],
  )).rows;
  const keys = Object.keys(values).filter(k => columns.some(c => c.column_name === k));
  assert.equal(columns.filter(c => c.is_nullable === 'NO' && !c.column_default && !keys.includes(c.column_name)).length, 0);
  await pool.query(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map((_, i) => '$' + (i + 1)).join(',')})`, keys.map(k => values[k]));
}
async function batch(id, quantity) {
  await seed('stock_batches', { id, product_name: 'TEST-ITEM', description: 'TEST-ITEM',
    batch_no: id, location: 'windhoek_warehouse', quantity, received_quantity: quantity,
    remaining_quantity: quantity, unit_price: 2, expiry_date: '2035-01-01', status: 'in_stock' });
}
async function edit(id, target, quantity) {
  await seed('stock_adjustments', { id, adj_number: id, target_type: 'warehouse', target_id: target,
    product_name: 'TEST-ITEM', location: 'windhoek_warehouse', field_to_adjust: 'quantity',
    old_value: '10', new_value: String(quantity), reason: 'Disposable bulk approval regression',
    requested_by: 'UI-STOCK', status: 'pending' });
}
async function readChecks() {
  const stock = (await pool.query("SELECT id,remaining_quantity FROM stock_batches WHERE id LIKE 'BULK-%' ORDER BY id")).rows;
  const requests = (await pool.query("SELECT id,status,approved_by,approved_at FROM stock_adjustments WHERE id LIKE 'BULK-%' ORDER BY id")).rows;
  const movements = (await pool.query("SELECT reference_id,quantity FROM stock_movements WHERE reference_id LIKE 'BULK-%' ORDER BY reference_id")).rows;
  return { stock, requests, movements };
}
try {
  if (process.argv.includes('--after-browser')) {
    const after = await readChecks();
    const ui = after.requests.filter(r => r.id.startsWith('BULK-UI-'));
    assert.equal(ui.length, 16); assert(ui.every(r => r.status === 'approved'));
    assert(after.stock.filter(r => r.id.startsWith('BULK-UI-')).every(r => Number(r.remaining_quantity) === 0));
    assert.equal(after.movements.filter(r => r.reference_id.startsWith('BULK-UI-')).length, 14);
    const gm = await login('ui_gm');
    const retry = await decision(gm, ui.map(r => r.id)); assert.equal(retry.status, 200);
    assert.deepEqual(await readChecks(), after, 'Retry must preserve stock, movement and audit timestamps');
    await fs.writeFile('generated-artifacts/gm-stock-bulk/after-browser.json', JSON.stringify({ pass: true, after, retry: evidence }, null, 2));
    console.log('PASS: all 16 browser-approved requests, zero stock, 14 real corrections, no duplicate retry.');
  } else {
    assert.equal(Number((await pool.query('SELECT count(*) AS count FROM stock_adjustments')).rows[0].count), 0);
    await batch('BULK-CONTROL', 10);
    await edit('BULK-CHECK-A', 'BULK-CONTROL', 5);
    await edit('BULK-CHECK-Z', 'BULK-MISSING', 0);
    const baseline = await readChecks();
    const gm = await login('ui_gm'), branch = await login('ui_branch_a');
    assert.equal((await decision('', ['BULK-CHECK-A'])).status, 401);
    assert.equal((await decision(branch, ['BULK-CHECK-A'])).status, 403);
    assert.equal((await decision(gm, [])).status, 400);
    const failure = await decision(gm, ['BULK-CHECK-Z', 'BULK-CHECK-A']);
    assert.equal(failure.status, 404); assert.equal(failure.body.failed_id, 'BULK-CHECK-Z');
    assert.deepEqual(await readChecks(), baseline, 'Later item failure must roll back first quantity deduction and review');
    await batch('BULK-ZERO', 0);
    await pool.query("UPDATE stock_adjustments SET target_id='BULK-ZERO' WHERE id='BULK-CHECK-Z'");
    const retries = await Promise.all([
      decision(gm, ['BULK-CHECK-Z', 'BULK-CHECK-A', 'BULK-CHECK-A']),
      decision(gm, ['BULK-CHECK-A', 'BULK-CHECK-Z']),
    ]);
    assert(retries.every(r => r.status === 200 && r.body.applied === 2));
    const corrected = await readChecks();
    assert.equal(Number(corrected.stock.find(r => r.id === 'BULK-CONTROL').remaining_quantity), 5);
    assert.equal(corrected.movements.length, 1);
    assert(corrected.requests.every(r => r.status === 'approved' && r.approved_by === 'UI-GM'));
    await edit('BULK-REJECT-A', 'BULK-CONTROL', 0);
    await edit('BULK-REJECT-B', 'BULK-CONTROL', 0);
    assert.equal((await decision(gm, ['BULK-REJECT-A', 'BULK-REJECT-B'], 'reject')).status, 200);
    const rejected = await readChecks();
    assert.equal((await decision(gm, ['BULK-REJECT-B', 'BULK-REJECT-A'], 'reject')).status, 200);
    assert.deepEqual(await readChecks(), rejected);
    assert.equal((await decision(gm, ['BULK-REJECT-A'])).status, 409);
    assert.deepEqual(await readChecks(), rejected);
    // Leave exactly 16 pending quantity-to-zero edits for the actual GM UI.
    for (let i = 0; i < 16; i++) {
      const id = `BULK-UI-${String(i).padStart(2, '0')}`;
      await batch(id, i < 2 ? 0 : 10); await edit(id, id, 0);
    }
    await fs.mkdir('generated-artifacts/gm-stock-bulk', { recursive: true });
    await fs.writeFile('generated-artifacts/gm-stock-bulk/api.json', JSON.stringify({
      pass: true, baseline, corrected, rejected, actions: evidence,
      uiBaseline: { pending: 16, stock: 140, zeroQuantityTargets: 2 },
    }, null, 2));
    console.log('PASS: staff permissions, validation, atomic rollback, corrected concurrent retry, actor attribution, reject/retry/conflict. Ready: 16 pending UI edits.');
  }
} finally { await pool.end(); }

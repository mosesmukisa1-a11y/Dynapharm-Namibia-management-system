import { ownedStatement as __ownedStatement } from "./helpers/owned-statement.js";import { query as __owned_app_query } from "../api/db.js"; // @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { parsePriceListText, resolveProduct, nameKey, businessToday } from '../shared/price-list-import.js';
import { withTransaction, withRequestTransaction } from '../api/db.js';import { query } from "./helpers/owned-raw-database.js";
import { ensurePriceImportSchema, previewImport, importPrices, activateDuePrices, reviewDuplicates, reconcileDuplicates, validateDate, assertActivePriceProducts } from '../api/services/priceImport.js';
import productsHandler from '../api/products.js';

const prefix = 'TEST_PRICELIST_REPAIR';
const actor = 'test-price-import';
const today = businessToday(),future = '2099-10-10',later = '2099-10-11';
const prices = { dp: 200.45, cp: 260.50, cif: 142.75, bv: 31.25 };
const product = (name, extra = {}) => ({ description: `${prefix} ${name}`, ...prices, ...extra });
async function cleanup() {
  await query("DELETE FROM price_reconciliation_backups WHERE created_by=$1", [actor]);
  await query('DELETE FROM product_price_history WHERE description LIKE $1 OR product_id IN(SELECT id FROM product_prices WHERE description LIKE $1 OR description LIKE $2)', [`${prefix}%`, `TST99% ${prefix}%`]);
  await query('DELETE FROM price_import_additions WHERE description LIKE $1', [`${prefix}%`]);
  await query('UPDATE product_prices SET merged_into_id=NULL WHERE description LIKE $1', [`${prefix}%`]);
  await query('DELETE FROM product_prices WHERE description LIKE $1 OR description LIKE $2', [`${prefix}%`, `TST99% ${prefix}%`]);
  await query("DELETE FROM products WHERE id='TEST_PRICELIST_REPAIR-physical'");
}
async function preview(products, date = today) {return withTransaction((client) => previewImport(client, products, date));}
async function create(name, code = null, extra = {}) {
  return (await query(`INSERT INTO product_prices(description,product_code,dp,cp,cif,bv,updated_by,is_package)
    VALUES($1,$2,100,130,70,10,$3,$4) RETURNING *`, [`${prefix} ${name}`, code, actor, extra.is_package || false])).rows[0];
}
describe('price list extraction and conservative identity', () => {
  it('keeps codes and does not incorporate CIF into a single-space product name', () => {
    const parsed = parsePriceListText("PRODUCT CODE DESCRIPTION CIF DP CP BVs\nNB3816N GREEN TEA CAPSULE 30's 142,75 200,45 260,50 31,25");
    expect(parsed.errors).toEqual([]);
    expect(parsed.products[0]).toMatchObject({ product_code: 'NB3816N', description: "GREEN TEA CAPSULE 30'S", ...prices });
  });
  it('handles quoted CSV comma decimals and BV/BVs headers', () => {
    expect(parsePriceListText('Code,Description,CIF,DP,CP,BVs\nNB1201,"TEA, CAPSULE","142,75","200,45","260,50","31,25"').products[0]).
    toMatchObject({ product_code: 'NB1201', description: 'TEA, CAPSULE', ...prices });
  });
  it('requires a layout for ambiguous three-column text', () => {
    expect(parsePriceListText('TEA 200 260 31').errors).toHaveLength(1);
    expect(parsePriceListText('TEA 200 260 31', { layout: 'dp-cp-bv' }).products[0]).toMatchObject({ dp: 200, cp: 260, bv: 31 });
    expect(parsePriceListText('DESCRIPTION CIF DP CP\nTEA 142 200 260').products[0]).toMatchObject({ cif: 142, dp: 200, cp: 260 });
  });
  it('does not silently drop repeated/conflicting or malformed coded rows', () => {
    const parsed = parsePriceListText('CIF DP CP BV\nNB1201 TEA 70 200 260 31\nNB1201 TEA 70 210 260 31\nNB1202 BAD 70 XX 260 31');
    expect(parsed.products).toHaveLength(2);expect(parsed.duplicates).toHaveLength(1);expect(parsed.errors).toHaveLength(1);
  });
  it('normalizes safe formatting but preserves pack sizes and distinct codes', () => {
    expect(nameKey("NB1201 Tea (30’sx25g)")).toBe(nameKey("TEA 30'S X 25G"));
    const catalogue = [{ id: 1, description: "TEA (30'S)", product_code: 'NB1201' }, { id: 2, description: "TEA (60'S)", product_code: 'NB1202' }];
    expect(resolveProduct({ description: "TEA 30'S" }, catalogue).existing.id).toBe(1);
    expect(resolveProduct({ description: "TEA 30'S", product_code: 'NB1202' }, catalogue).conflict).toBeTruthy();
    expect(resolveProduct({ description: "TEA 30'S", product_code: 'NB9999' }, catalogue).conflict).toBeTruthy();
  });
  it('uses the Windhoek midnight boundary and rejects impossible/past dates', () => {
    expect(businessToday(new Date('2026-10-09T22:01:00Z'))).toBe('2026-10-10');
    expect(() => validateDate('2026-02-30', '2026-02-01')).toThrow();
    expect(() => validateDate('2026-01-01', '2026-02-01')).toThrow();
  });
});
describe.sequential('atomic price imports, staging and evidence-preserving reconciliation', () => {
  beforeAll(async () => {await ensurePriceImportSchema();await cleanup();});
  afterAll(cleanup);
  it('updates original ID/code/package flags by code and repeats without redundant history', async () => {
    const row = await create("CODED 30'S", 'TST990001', { is_package: true });
    const input = product("CODED (30'S)", { product_code: 'TST990001' });
    expect((await preview([input])).rows[0].existing.id).toBe(row.id);
    expect((await importPrices([input], today, actor)).updated).toBe(1);
    expect((await importPrices([input], today, actor)).unchanged).toBe(1);
    const actual = (await query('SELECT * FROM product_prices WHERE id=$1', [row.id])).rows[0];
    expect(actual.product_code).toBe('TST990001');expect(actual.is_package).toBe(true);
    expect(Number(actual.cif)).toBe(142.75);expect(Number(actual.bv)).toBe(31.25);
    expect((await query('SELECT id FROM product_price_history WHERE product_id=$1', [row.id])).rowCount).toBe(1);
  });
  it('shares preview resolution for normalized names without renaming canonical products', async () => {
    const row = await create("NAME (100'S)", 'TST990002');
    const input = product("name 100’s");
    expect((await preview([input])).rows[0].existing.id).toBe(row.id);
    expect((await importPrices([input], today, actor)).updated).toBe(1);
    expect((await query('SELECT description FROM product_prices WHERE id=$1', [row.id])).rows[0].description).toBe(row.description);
  });
  it('distinguishes harmless repeats, conflicts and genuine new products', async () => {
    const a = product('NEW REPEAT');
    const p = await preview([a, a]);expect(p.counts).toMatchObject({ created: 1, duplicates: 1, conflicts: 0 });
    expect((await importPrices([a, a], today, actor)).created).toBe(1);
    const conflict = await preview([a, { ...a, dp: 999 }]);expect(conflict.canImport).toBe(false);
    await expect(importPrices([a, { ...a, dp: 999 }], today, actor)).rejects.toThrow(/conflict/i);
  });
  it('blocks ambiguous catalogue matches, different codes and malformed values', async () => {
    await create("AMBIGUOUS (30'S)", 'TST990003');
    await create("AMBIGUOUS 30'S", 'TST990004');
    expect((await preview([product("AMBIGUOUS 30'S")])).canImport).toBe(false);
    expect((await preview([product("AMBIGUOUS 30'S", { product_code: 'TST991111' })])).canImport).toBe(false);
    await expect(importPrices([product('BAD', { bv: 'broken' })], today, actor)).rejects.toThrow(/BV/);
    expect((await preview([product('CODE COLLISION', { product_code: 'TST990011' }), product('CODE COLLISION', { product_code: 'TST990012' })])).canImport).toBe(false);
  });
  it('serializes concurrent imports, creating one identity and one applied history', async () => {
    const p = product('CONCURRENT', { product_code: 'TST990005' });
    const results = await Promise.all([importPrices([p], today, actor), importPrices([p], today, actor), importPrices([p], today, actor)]);
    expect(results.reduce((s, r) => s + r.created, 0)).toBe(1);
    expect((await query('SELECT id FROM product_prices WHERE description=$1', [p.description])).rowCount).toBe(1);
    expect((await query('SELECT id FROM product_price_history WHERE description=$1', [p.description])).rowCount).toBe(1);
  });
  it('rolls back the whole import when a later write fails', async () => {
    const first = product('ROLLBACK FIRST'),bad = product('ROLLBACK SECOND');
    await expect(withRequestTransaction(async () => {
      await importPrices([first, bad], today, actor);
      await __owned_app_query(__ownedStatement("owned-tests/tests/price-list-import.spec.js:105:20", []));
    })).rejects.toThrow();
    expect((await query('SELECT id FROM product_prices WHERE description=ANY($1::text[])', [[first.description, bad.description]])).rowCount).toBe(0);
  });
  it('keeps existing prices live and future additions absent from every product consumer', async () => {
    const existing = await create('FUTURE EXISTING', 'TST990006');
    const inputs = [product('FUTURE EXISTING', { product_code: 'TST990006' }), product('FUTURE NEW', { product_code: 'TST990007' })];
    expect((await importPrices(inputs, future, actor)).scheduled).toBe(2);
    expect((await importPrices(inputs, future, actor)).unchanged).toBe(2);
    expect((await preview([{ ...inputs[1], dp: 999 }], future)).canImport).toBe(false);
    expect((await preview([inputs[1]], later)).canImport).toBe(false);
    expect((await preview([{ ...inputs[0], dp: 999 }], future)).canImport).toBe(false);
    await expect(assertActivePriceProducts([{ name: inputs[1].description, dpPrice: 200.45 }])).rejects.toThrow(/not active/);
    await expect(assertActivePriceProducts([{ name: inputs[0].description }])).resolves.toBeUndefined();
    expect(Number((await query('SELECT dp FROM product_prices WHERE id=$1', [existing.id])).rows[0].dp)).toBe(100);
    expect((await query('SELECT id FROM live_product_prices WHERE description=$1', [inputs[1].description])).rowCount).toBe(0);
    let response;
    await productsHandler({ method: 'GET', headers: { host: 'test' }, url: '/api/products' }, {
      setHeader() {}, status() {return this;}, json(value) {response = value;return this;}
    });
    expect(Array.isArray(response)).toBe(true);
    expect(response.some((p) => p.name === inputs[1].description)).toBe(false);
    // Simulate a future day inside an outer rollback, never activate real future
    // business prices persistently or publish test events for other products.
    await expect(withRequestTransaction(async () => {
      await activateDuePrices(future);
      expect(Number((await __owned_app_query(__ownedStatement("owned-tests/tests/price-list-import.spec.js:131:21", [existing.id]))).rows[0].dp)).toBe(200.45);
      expect((await __owned_app_query(__ownedStatement("owned-tests/tests/price-list-import.spec.js:132:22", [inputs[1].description]))).rowCount).toBe(1);
      expect(await activateDuePrices(future)).toBe(0);
      throw new Error('TEST_ROLLBACK_FUTURE');
    })).rejects.toThrow('TEST_ROLLBACK_FUTURE');
    expect((await query('SELECT id FROM live_product_prices WHERE description=$1', [inputs[1].description])).rowCount).toBe(0);
  });
  it('can schedule a return to current prices after an earlier pending change', async () => {
    const row = await create('RESTORE LATER', 'TST990008');
    await importPrices([product('RESTORE LATER', { product_code: 'TST990008' })], future, actor);
    expect((await importPrices([product('RESTORE LATER', { product_code: 'TST990008', dp: 100, cp: 130, cif: 70, bv: 10 })], later, actor)).scheduled).toBe(1);
    expect((await query("SELECT id FROM product_price_history WHERE product_id=$1 AND status='pending'", [row.id])).rowCount).toBe(2);
  });
  it('requires fresh GM confirmation, archives rather than deleting, and preserves all history/schedules', async () => {
    const canonical = await create("DUP (30'S)", 'TST990009');
    const duplicate = await create("DUP 30'S");
    await query(`INSERT INTO product_price_history(product_id,description,new_dp,new_cp,new_cif,new_bv,effective_from,status,changed_by)
      VALUES($1,$2,201,261,143,32,$3,'pending',$4)`, [duplicate.id, duplicate.description, future, actor]);
    const group = (await reviewDuplicates()).groups.find((g) => g.key === nameKey(duplicate.description));
    expect(group.proven).toBe(true);expect(group.references.some((r) => r.table === 'product_price_history')).toBe(true);
    await expect(reconcileDuplicates({ ...group, confirm: false }, actor)).rejects.toThrow(/confirmation/);
    await expect(reconcileDuplicates({ ...group, confirm: true, reviewToken: 'stale' }, actor)).rejects.toThrow(/stale/);
    const result = await reconcileDuplicates({ ...group, confirm: true }, actor);
    expect(result.canonicalId).toBe(canonical.id);
    expect((await query('SELECT id FROM product_prices WHERE id=$1', [duplicate.id])).rowCount).toBe(1);
    expect((await query('SELECT id FROM live_product_prices WHERE id=$1', [duplicate.id])).rowCount).toBe(0);
    const alias = (await query('SELECT * FROM live_product_prices WHERE description=$1', [duplicate.description])).rows;
    expect(alias).toHaveLength(1);expect(alias[0].id).toBe(canonical.id);expect(Number(alias[0].dp)).toBe(100);
    expect((await query('SELECT id FROM live_product_prices WHERE id=$1 AND catalogue_entry', [canonical.id])).rowCount).toBe(1);
    const history = (await query('SELECT * FROM product_price_history WHERE original_product_id=$1', [duplicate.id])).rows[0];
    expect(history.product_id).toBe(canonical.id);expect(history.status).toBe('pending');
    expect((await query('SELECT id FROM price_reconciliation_backups WHERE id=$1', [result.backupId])).rowCount).toBe(1);
    await expect(reconcileDuplicates({ ...group, confirm: true }, actor)).rejects.toThrow(/stale/);
  });
  it('leaves distinct-code and numeric-suffix uncertain groups unchanged', async () => {
    await create('NUMERIC');await create('NUMERIC 70');
    const review = await reviewDuplicates();
    expect(review.uncertain.some((g) => g.key.startsWith('numeric:') && g.rows.some((r) => r.description === `${prefix} NUMERIC 70`))).toBe(true);
    expect(review.uncertain.some((g) => g.rows.some((r) => r.description.includes(`${prefix} AMBIGUOUS`)))).toBe(true);
  });
  it('prices original physical stock names even when the stable canonical description retains a code prefix', async () => {
    const plain = `${prefix} PREFIX 30'S`,code = 'TST990099';
    const row = await create("PREFIX 30'S", code);
    await query('UPDATE product_prices SET description=$1 WHERE id=$2', [`${code} ${plain}`, row.id]);
    await importPrices([{ description: plain, product_code: code, ...prices }], today, actor);
    const lookup = (await query('SELECT * FROM live_product_prices WHERE description=$1', [plain])).rows;
    expect(lookup).toHaveLength(1);expect(lookup[0].id).toBe(row.id);expect(Number(lookup[0].dp)).toBe(200.45);
    expect((await query('SELECT id FROM live_product_prices WHERE product_code=$1 AND catalogue_entry', [code])).rowCount).toBe(1);
    await query("INSERT INTO products(id,name,is_active) VALUES('TEST_PRICELIST_REPAIR-physical',$1,TRUE)", [plain]);
    let response;
    await productsHandler({ method: 'GET', headers: { host: 'test' }, url: '/api/products' }, {
      setHeader() {}, status() {return this;}, json(value) {response = value;return this;}
    });
    const stock = response.filter((p) => nameKey(p.name) === nameKey(plain));
    expect(stock).toHaveLength(1);expect(stock[0].id).toBe('TEST_PRICELIST_REPAIR-physical');
    expect(stock[0].name).toBe(plain);expect(Number(stock[0].dp)).toBe(200.45);
  });
});

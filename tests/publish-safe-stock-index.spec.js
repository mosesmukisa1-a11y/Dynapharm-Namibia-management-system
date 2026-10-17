import { ownedStatement as __ownedStatement } from "./helpers/owned-statement.js"; // @vitest-environment node
import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { withTransaction } from '../api/db.js';
import { getStockCostProjection } from '../api/services/stockCostReporting.js';

it('publish-safe stock index keys preserve explicit location and null/empty warehouse fallback', async () => {
  const prefix = `TEST-PUBLISH-LOC-${randomUUID().slice(0, 8)}`;
  // Always roll back fixture writes, including when an assertion fails.
  const rollback = Symbol('fixture rollback');
  try {
    await withTransaction(async (client) => {
      const definitions = [
      ['null', null, 'windhoek_warehouse'],
      ['empty', '', 'windhoek_warehouse'],
      ['override', 'test_override_warehouse', 'windhoek_warehouse'],
      ['normalized', ' WINDHOEK_WAREHOUSE ', 'windhoek_warehouse']];

      for (const [label, location, warehouse] of definitions)
      await client.query(__ownedStatement("owned-tests/tests/publish-safe-stock-index.spec.js:21:30",


      [`${prefix}-${label}`, prefix, location, warehouse]));
      const read = async (sql, params) => (await client.query(sql, params)).rows;
      const selected = await getStockCostProjection({ locations: ['windhoek_warehouse'], productName: prefix }, read);
      expect(selected.map((row) => row.id).sort()).toEqual(
        ['empty', 'normalized', 'null'].map((label) => `${prefix}-${label}`).sort());
      const override = await getStockCostProjection({ locations: ['test_override_warehouse'], productName: prefix }, read);
      expect(override.map((row) => row.id)).toEqual([`${prefix}-override`]);
      expect(await getStockCostProjection({ locations: ['no_such_warehouse'], productName: prefix }, read)).toEqual([]);
      expect(await getStockCostProjection({ productName: prefix }, read)).toHaveLength(4);
      const indexes = (await client.query(__ownedStatement("owned-tests/tests/publish-safe-stock-index.spec.js:33:31", [])

      )).rows;
      expect(indexes).toHaveLength(2);
      expect(indexes.every((row) => !/\b(COALESCE|NULLIF|CASE)\b/i.test(row.definition))).toBe(true);
      const migration = await readFile(new URL('../migrations/030_publish_safe_stock_location_index.sql', import.meta.url), 'utf8');
      expect(migration).not.toMatch(/(?:DELETE FROM|UPDATE|TRUNCATE)\s+stock_batches/i);
      throw rollback;
    });
  } catch (error) {if (error !== rollback) throw error;}
});

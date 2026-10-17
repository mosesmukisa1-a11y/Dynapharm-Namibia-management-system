// @vitest-environment node
import {it,expect} from 'vitest';
import {splitPostgresStatements,repositoryDdlStatements} from '../scripts/lib/repository-ddl.mjs';
it('splits DDL separately from seed rows without changing statements',()=>{
  expect(repositoryDdlStatements('-- table\nCREATE TABLE x(id text); INSERT INTO x VALUES(1); CREATE INDEX y ON x(id);')).toHaveLength(2);
});
it('retains quoted semicolons and function bodies',()=>{
  expect(splitPostgresStatements("CREATE FUNCTION x() RETURNS text AS $body$ BEGIN RETURN 'a;b'; END $body$ LANGUAGE plpgsql;SELECT 1;")).toHaveLength(2);
  expect(splitPostgresStatements('SELECT "a;b", \'a\'\'b;c\'; -- trailing\n')).toHaveLength(2);
});
it('understands nested block comments and rejects incomplete quoting',()=>{
  expect(splitPostgresStatements('/* outer /* inner; */ end */ SELECT 1;SELECT 2;')).toHaveLength(2);
  expect(()=>splitPostgresStatements("SELECT 'unterminated")).toThrow();
  expect(()=>splitPostgresStatements('SELECT $x$unterminated')).toThrow();
});

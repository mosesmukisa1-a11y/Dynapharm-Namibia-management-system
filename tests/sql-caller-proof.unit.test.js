// @vitest-environment node
import {it,expect} from 'vitest';
import {reviewSqlLocations} from '../scripts/lib/sql-caller-proof.mjs';
it('allows fixed reassignment but rejects request-controlled replacement',()=>{
  expect(check("let sql='SELECT 1'; if(req.flag) sql='SELECT 2';db.query(sql);",false)).toBe('fixed internal constant');
  expect(check("let sql='SELECT 1'; sql=req.body.sql;db.query(sql);",false)).toBe('unresolved blocker');
});
it('allows native numeric placeholder counters and fixed trim only',()=>{
  expect(check("let i=1; i++;db.query(`SELECT $${i++}`,[req.body.x]);")).toBe('static SQL with bound values');
  expect(check("let i=1;i=req.body.i;db.query(`SELECT $${i}`,[1]);")).toBe('unresolved blocker');
  expect(check("db.query('SELECT 1'.trim());",false)).toBe('fixed internal constant');
  expect(check("db.query(req.body.sql.trim());",false)).toBe('unresolved blocker');
});
it('proves push return positions but not the pushed request text',()=>{
  expect(check("const params=[];db.query(`SELECT $${params.push(req.body.x)}`,params);")).toBe('static SQL with bound values');
  expect(check("const params=[];params.push=req.body.fn;db.query(`SELECT $${params.push(req.body.x)}`,params);")).toBe('unresolved blocker');
  expect(check("db.query(`SELECT $${req.body.push(1)}`,[]);")).toBe('unresolved blocker');
});
function check(body,hasValueArguments=true){
  const source='function handler(req,db){'+body+'}';
  const index=source.lastIndexOf('db.query');
  return reviewSqlLocations(source,[{line:1,column:index+1,hasValueArguments}])[0].classification;
}
it('labels a fixed internal query with no value arguments accurately',()=>{
  expect(check("const sql='SELECT 1';db.query(sql);",false)).toBe('fixed internal constant');
});
it('proves fixed SQL with independently bound hostile values',()=>{
  expect(check("const sql='SELECT 1 WHERE name=$1';db.query(sql,[req.body.name]);")).toBe('static SQL with bound values');
});
it('proves fixed conditional fragments and native numeric placeholders',()=>{
  expect(check("const params=[];const parts=[];parts.push(`name=$${params.length+1}`);db.query(`SELECT 1 WHERE ${parts.join(' AND ')}`,params);")).toBe('static SQL with bound values');
});
it.each([
 "db.query(req.body.sql);",
 "const sql=`SELECT ${req.query.column}`;db.query(sql);",
 "const parts=[];parts.push(req.body.fragment);db.query(parts.join(' '));",
 "let sql='SELECT 1';sql+=req.body.fragment;db.query(sql);",
 "const parts=[];const escaped=parts;escaped.push(req.query.raw);db.query(parts.join(' '));",
 "const parts=[];mutate(parts);db.query(parts.join(' '));",
 "const params=req.body;db.query(`SELECT $${params.length}`);"
])('keeps hostile/unknown input as a blocker: %s',body=>{
  expect(check(body)).toBe('unresolved blocker');
});

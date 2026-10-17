// @vitest-environment node
import {it,expect} from 'vitest';
import {reviewSqlLocations} from '../scripts/lib/sql-caller-proof.mjs';
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

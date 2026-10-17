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
it('bounds numeric conversion SQL structure without accepting a shadowed converter',()=>{
  expect(check("db.query(`SELECT 1 LIMIT ${Number(req.query.limit)||200}`,[]);")).toBe('static SQL with bound values');
  expect(check("db.query(`SELECT 1 LIMIT ${Math.min(parseInt(req.query.limit),1000)}`,[]);")).toBe('static SQL with bound values');
  expect(check("const Number=x=>x;db.query(`SELECT ${Number(req.body.sql)}`,[]);")).toBe('unresolved blocker');
  expect(check("const Math={min:x=>x};db.query(`SELECT ${Math.min(req.body.sql)}`,[]);")).toBe('unresolved blocker');
});
it('proves fixed object-key maps but not payload keys, computed writes or aliases',()=>{
  expect(check("const o={status:req.body.status};const cols=Object.keys(o).map((k,i)=>`${k}=$${i+1}`);db.query(`UPDATE t SET ${cols.join(', ')}`,[req.body.status]);")).toBe('static SQL with bound values');
  expect(check("const o={};o.status=req.body.status;const cols=Object.keys(o).map((k,i)=>`${k}=$${i+1}`);db.query(`UPDATE t SET ${cols.join(', ')}`,[req.body.status]);")).toBe('static SQL with bound values');
  for(const setup of ['const o=req.body;','const o={};o[req.body.key]=1;','const o={};const alias=o;alias[req.body.key]=1;','const o={...req.body};'])
    expect(check(setup+"const cols=Object.keys(o).map(k=>k);db.query(`SELECT ${cols.join(', ')}`,[]);")).toBe('unresolved blocker');
});
it('rejects a replaced map output and shadowed Object.keys',()=>{
  expect(check("const o={id:1};const cols=Object.keys(o).map(k=>req.body.sql);db.query(`SELECT ${cols.join(', ')}`,[]);")).toBe('unresolved blocker');
  expect(check("const Object={keys:()=>[req.body.sql]};const cols=Object.keys({id:1}).map(k=>k);db.query(`SELECT ${cols.join(', ')}`,[]);")).toBe('unresolved blocker');
  for(const mutation of ['keys.push(req.body.key);','keys[0]=req.body.key;','const alias=keys;alias[0]=req.body.key;','keys.map=req.body.fn;'])
    expect(check("const o={id:1};const keys=Object.keys(o);"+mutation+"const cols=keys.map(k=>k);db.query(`SELECT ${cols.join(', ')}`,[]);")).toBe('unresolved blocker');
  expect(check("const a=[];a.map=req.body.fn;const x=a.map((v,i)=>`$${i+1}`);db.query(x.join(', '),[]);")).toBe('unresolved blocker');
});
it('proves unescaped fixed for-of fragments but rejects mutation and aliases',()=>{
  expect(check("for(const sql of ['SELECT 1','SELECT 2']){db.query(sql);}",false)).toBe('fixed internal constant');
  expect(check("const a=['SELECT 1'];for(const sql of a){db.query(sql);}",false)).toBe('fixed internal constant');
  expect(check("const a=['SELECT 1'];a.push(req.body.sql);for(const sql of a){db.query(sql);}",false)).toBe('unresolved blocker');
  expect(check("const a=['SELECT 1'];const b=a;b.push(req.body.sql);for(const sql of a){db.query(sql);}",false)).toBe('unresolved blocker');
});
it('rejects mutable for-of bindings and request iterables',()=>{
  expect(check("for(let sql of ['SELECT 1']){sql=req.body.sql;db.query(sql);}",false)).toBe('unresolved blocker');
  expect(check("for(const sql of req.body.sql){db.query(sql);}",false)).toBe('unresolved blocker');
});
it('proves only a fixed repository migration file read',()=>{
  const review=body=>{
    const source="import fs from 'node:fs/promises';async function handler(req,db){"+body+"}";
    return reviewSqlLocations(source,[{line:1,column:source.lastIndexOf('db.query')+1,hasValueArguments:false}])[0].classification;
  };
  expect(review("const sql=await fs.readFile(new URL('../../migrations/027_price_import_identity.sql',import.meta.url),'utf8');db.query(sql);")).toBe('fixed internal constant');
  expect(review("const sql=await fs.readFile(new URL(req.body.path,import.meta.url),'utf8');db.query(sql);")).toBe('unresolved blocker');
  expect(review("fs.readFile=req.body.fn;const sql=await fs.readFile(new URL('../../migrations/027_price_import_identity.sql',import.meta.url),'utf8');db.query(sql);")).toBe('unresolved blocker');
});
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

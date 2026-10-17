// @vitest-environment node
import {it,expect} from 'vitest';
import {identifier,insertStatement,findAllStatement,orderByClause} from '../api/services/sqlShape.js';
it('hostile values cannot change insert or condition SQL shape',()=>{
  const hostile="needle'); DROP TABLE sql_sentinel; --";
  const good=insertStatement('clients',{full_name:'normal'});
  const bad=insertStatement('clients',{full_name:hostile});
  expect(bad.text).toBe(good.text);expect(bad.params).toEqual([hostile]);
  expect(bad.text).not.toContain(hostile);
  expect(findAllStatement('clients',{full_name:hostile}).text)
    .toBe(findAllStatement('clients',{full_name:'normal'}).text);
});
it('rejects hostile table/column identifiers and does not echo input',()=>{
  for(const value of ['users;DROP TABLE users','x" OR TRUE--','a.b','x NULLS FIRST','x/* */']){
    expect(()=>identifier(value)).toThrow('Invalid SQL identifier');
    expect(()=>insertStatement(value,{value:1})).toThrow();
    expect(()=>insertStatement('sql_sentinel',{[value]:1})).toThrow();
    expect(()=>findAllStatement('sql_sentinel',{[value]:1})).toThrow();
  }
});
it('ordering accepts identifiers/directions only, not expressions or clauses',()=>{
  expect(orderByClause('created_at DESC, id asc')).toBe('"created_at" DESC, "id" ASC');
  for(const value of ['id; DROP TABLE users','id DESC NULLS LAST','random()','id LIMIT 1',
    'id --','id) UNION SELECT 1','',null])
    expect(()=>orderByClause(value)).toThrow('Invalid SQL ordering');
});

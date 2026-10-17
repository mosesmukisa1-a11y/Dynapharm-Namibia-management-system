// @vitest-environment node
import {describe,it,expect} from 'vitest';
import express from 'express';
import http from 'node:http';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {applicationColumns,applicationTable,applicationFields} from '../api/services/sqlFieldPolicy.js';
import {insertStatement,updateStatement,numericPage,finiteIdentifier} from '../api/services/sqlShape.js';
import {errorOutputBoundary} from '../api/services/errorOutputBoundary.js';
const attacks=["id; SELECT 1;--","x' OR true --",'id UNION SELECT password FROM users','id DESC NULLS LAST',
  'id/*comment*/','constructor','__proto__','../../server.js','id=1 OR 1=1'];
describe('finite application SQL structure',()=>{
  it.each(attacks)('rejects hostile table/field/order structure %#',value=>{
    expect(()=>applicationTable(value)).toThrow();
    expect(()=>applicationColumns('clients',{[value]:'data'})).toThrow();
    expect(()=>finiteIdentifier(value,{id:'id'})).toThrow();
  });
  it('rejects prototypes, getters, spreads and mutation before producing SQL',()=>{
    expect(()=>applicationColumns('clients',Object.create({id:'alias'}))).toThrow();
    const data={};Object.defineProperty(data,'full_name',{enumerable:true,get(){throw Error('getter invoked');}});
    expect(()=>applicationColumns('clients',data)).toThrow('Invalid update fields');
    const alias={full_name:'legitimate'};alias['name; DROP TABLE users;--']='hostile';
    expect(()=>applicationColumns('clients',{...alias})).toThrow();
    expect(Object.isFrozen(applicationFields.clients)).toBe(true);
    expect(()=>applicationFields.clients.push('password')).toThrow();
  });
  it('allows existing fields, keeps values bound, and freezes update output',()=>{
    const value="x'); DROP TABLE clients;--",data={full_name:value,branch:'townshop'};
    applicationColumns('clients',data);
    const insert=insertStatement('clients',data),update=updateStatement('clients','SYNTHETIC',data,applicationFields.clients);
    expect(insert.text.includes(value)||update.text.includes(value)).toBe(false);
    expect(insert.params[0]===value&&update.params[0]===value).toBe(true);
    expect(Object.isFrozen(update)&&Object.isFrozen(update.params)).toBe(true);
  });
  it.each([NaN,Infinity,-1,1.5,{},[],true,'1;SELECT 1','1 UNION SELECT 1','1e3'])('rejects malformed pagination %#',value=>{
    expect(()=>numericPage(value)).toThrow('Invalid pagination');
  });
  it('accepts legitimate pagination with explicit bounds',()=>{
    expect(numericPage('20')).toBe(20);expect(numericPage('10000')).toBe(1000);
    expect(numericPage(null)).toBe(200);expect(numericPage(0,{offset:true})).toBe(0);
  });
});
describe('application diagnostic boundary',()=>{
  it('contains JSON/text/stream/header and parser failures without changing successful data',async()=>{
    const secret='SYNTHETIC_PRIVATE_'+randomUUID(),app=express();
    app.use(errorOutputBoundary);app.use(express.json());
    app.get('/error/:kind',(req,res)=>{
      res.setHeader('X-Database-Debug',secret);res.setHeader('X-Frame-Options','DENY');
      res.status(500);
      if(req.params.kind==='json')return res.json({error:secret,sql:'SELECT password FROM users',path:'/private/test'});
      if(req.params.kind==='send')return res.send(secret);
      res.write(secret);res.end(secret);
    });
    app.post('/parse',(req,res)=>res.json({success:true}));
    app.get('/success',(req,res)=>res.json({success:true,error:null,quantity:93}));
    const server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));
    try{
      const base=`http://127.0.0.1:${server.address().port}`;
      for(const kind of ['json','send','stream']){
        const r=await fetch(base+'/error/'+kind),text=await r.text();
        expect(r.status).toBe(500);expect(text.includes(secret)||text.includes('SELECT')||text.includes('/private')).toBe(false);
        expect(r.headers.has('x-database-debug')).toBe(false);expect(r.headers.get('x-frame-options')).toBe('DENY');
      }
      const malformed=await fetch(base+'/parse',{method:'POST',headers:{'content-type':'application/json'},body:secret});
      expect(malformed.status).toBe(400);expect((await malformed.text()).includes(secret)).toBe(false);
      expect((await (await fetch(base+'/success')).json()).quantity).toBe(93);
    }finally{await new Promise(r=>server.close(r));}
  });
  it.each(['console','exception','rejection'])('does not serialize nested secrets or fatal stacks: %s',kind=>{
    const secret='SYNTHETIC_PRIVATE_'+randomUUID();
    const source=`await import('./api/services/runtimeDiagnostics.js');
      const secret=${JSON.stringify(secret)};
      ${kind==='console'?"console.log(secret);console.error(new Error(secret),{password:secret});":
      kind==='exception'?"throw new Error(secret);":"Promise.reject(new Error(secret));await new Promise(r=>setTimeout(r,10));"}`;
    const result=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',env:{PATH:process.env.PATH},timeout:10000});
    const text=(result.stdout||'')+(result.stderr||'');
    expect(text.includes(secret)||text.includes('file://')||text.includes('Error:')).toBe(false);
    expect(result.status).toBe(kind==='console'?0:1);
  });
});

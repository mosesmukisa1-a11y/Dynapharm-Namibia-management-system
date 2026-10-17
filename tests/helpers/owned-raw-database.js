// Deliberately separate from the application API. Only disposable-cluster test
// provisioning/assertions can import this raw executor; handlers still import
// the real, descriptor-only api/db.js.
import {readFileSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {afterAll} from 'vitest';
import {assertIsolatedTestDatabase,verifyIsolatedTestConnection} from '../../api/testDatabaseGuard.js';
import {executionArguments} from '../../api/services/queryDescriptors.js';
assertIsolatedTestDatabase();
const output=process.env.OWNED_AUDIT_OUTPUT;
if(!output||process.env.NODE_ENV!=='test'||process.env.REPLIT_DEPLOYMENT==='1')
  throw Error('Owned raw tools require an isolated test process');
const directory=path.dirname(path.resolve(output)),owner=JSON.parse(readFileSync(directory+'/fixture-ownership.json','utf8'));
const target=new URL(process.env.DATABASE_URL);
if(realpathSync(directory)!==directory||owner.runId!==path.basename(directory)||
  owner.disposable!==true||owner.production!==false||target.hostname!=='127.0.0.1'||
  createHash('sha256').update(target.hostname+':'+target.port).digest('hex')!==owner.hostFingerprint)
  throw Error('Owned raw tool target verification failed');
const pool=new pg.Pool({connectionString:target.toString(),max:3,
  onConnect:client=>verifyIsolatedTestConnection(client)});
afterAll(()=>pool.end());
export async function query(text,values=[]){
  assertIsolatedTestDatabase();
  // Descriptor-to-driver unboxing is separate from raw owned provisioning.
  // This does not brand strings or make raw input admissible to api/db.js.
  if(typeof text!=='string'){
    const admitted=executionArguments(text,values===text.values?values:undefined);
    text=admitted.text;values=admitted.values;
  }
  if(typeof text!=='string'||!Array.isArray(values))throw Error('Owned tool expects fixed test SQL and values');
  return pool.query(text,values);
}
export async function getOne(text,values){return (await query(text,values)).rows[0]??null;}
export async function getMany(text,values){return (await query(text,values)).rows;}

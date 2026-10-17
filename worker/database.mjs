// The coordinator alone owns connection lifecycle. Tasks receive only ctx.read /
// ctx.finding from runner.mjs, never these handles or the native pg objects.
import pg from 'pg';
import {executionArguments,withQueryContext} from '../api/services/queryDescriptors.js';
export function createWorkerDatabase(options){
  return workerDescriptorPool(new pg.Pool(options));
}
export function workerDescriptorPool(pool){
  function execute(driver,descriptor,values){
    return withQueryContext('worker',()=>{
      const admitted=executionArguments(descriptor,values);
      return driver(admitted.text,admitted.values);
    });
  }
  return Object.freeze({
    query(descriptor,values){return execute(pool.query.bind(pool),descriptor,values);},
    on(event,listener){pool.on(event,listener);},
    end(){return pool.end();},
    async connect(){
      const client=await pool.connect();let active=true;
      return Object.freeze({
        query(descriptor,values){
          if(!active)throw Object.assign(Error('Worker connection is closed'),{code:'TRANSACTION_CLOSED'});
          return execute(client.query.bind(client),descriptor,values);
        },
        release(error){if(active){active=false;client.release(error);}},
      });
    },
  });
}

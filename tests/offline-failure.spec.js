// @vitest-environment node
import {it,expect} from 'vitest';
import sync from '../api/sync/batch.js';
it('does not acknowledge a rejected offline operation as successfully saved',async()=>{
 let response;
 const res={setHeader(){},status(){return this},json(b){response=b;return this},end(){}};
 await sync({method:'POST',headers:{host:'test'},user:{id:'audit-a',role:'branch_manager',branch:'townshop'},
 body:{operations:[{offlineId:'AUDIT-REJECTED-OFFLINE',type:'walkin_sale',method:'POST',url:'/api/branch/walkin-sales',body:{branch:'swakopmund',products:[]}}]}},res);
 expect(response.results[0].success).toBe(false);
 expect(response.results[0].status).toBeGreaterThanOrEqual(400);
});

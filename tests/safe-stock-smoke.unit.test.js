// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {SAFE_STOCK_GETS,safeGet,runSafeStockSmoke} from '../scripts/safe-stock-smoke.mjs';
it('retains the exact approved thirty-request set, not the broader static inventory',()=>{
 // Frozen from the separately reviewed thirty-GET artifact; independent of ignored
 // generated outputs so a clean source export can run this contract.
 const approvedHash='d4bbd0492df1c1b66b9d2f48080ced9e43f8d43c657dc3547d1647833f5f704d';
 expect(SAFE_STOCK_GETS).toHaveLength(30);
 expect(createHash('sha256').update(JSON.stringify([...SAFE_STOCK_GETS].sort())).digest('hex')).toBe(approvedHash);
 expect(SAFE_STOCK_GETS).not.toContain('/api/auth/me');
});
it('all requests are GET/manual-redirect and logs exclude credentials/body',async()=>{
 const calls=[],logs=[],fetcher=async(url,options)=>{calls.push({url,options});return new Response('{}',{status:200});};
 const result=await runSafeStockSmoke({origin:'http://127.0.0.1:9999',cookie:'synthetic-cookie',fetcher,log:r=>logs.push(r)});
 expect(result.results).toHaveLength(30);
 expect(calls.every(c=>c.options.method==='GET'&&c.options.redirect==='manual')).toBe(true);
 expect(JSON.stringify(logs)).not.toContain('synthetic-cookie');
 expect(logs.every(l=>Number.isFinite(l.durationMs))).toBe(true);
});
it('rejects redirects, non-200, unknown routes and credential-bearing URLs',async()=>{
 await expect(safeGet({origin:'http://localhost',path:'/api/auth/me',fetcher:vi.fn()})).rejects.toThrow(/allowlist/);
 await expect(safeGet({origin:'http://localhost',path:'/api/health',fetcher:async()=>new Response('',{status:302,headers:{Location:'/api/auth/me'}})})).rejects.toThrow(/redirect/);
 await expect(safeGet({origin:'http://localhost',path:'/api/health',fetcher:async()=>new Response('',{status:503})})).rejects.toThrow(/503/);
 await expect(safeGet({origin:'http://unused:unused@localhost',path:'/api/health'})).rejects.toThrow(/origin/);
});

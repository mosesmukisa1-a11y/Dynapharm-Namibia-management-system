import React from 'react';
import {render,act,cleanup} from '@testing-library/react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const store=vi.hoisted(()=>({pending:[],failed:vi.fn(),removed:vi.fn()}));
vi.mock('../client/src/lib/offlineQueue.js',()=>({
 getPendingOnly:async()=>store.pending,getCount:async()=>store.pending.length,getFailedCount:async()=>0,
 clearFailed:async()=>{},markFailed:async id=>{store.failed(id);store.pending=[];},
 remove:async id=>{store.removed(id);store.pending=[];}
}));
import {OfflineProvider,useOffline} from '../client/src/lib/OfflineProvider.jsx';
let state;
function Probe(){state=useOffline();return null;}
beforeEach(()=>{
 vi.useFakeTimers();store.pending=[{localId:1,offlineId:'OFF1',type:'walkin_sale',body:{}}];
 store.failed.mockClear();store.removed.mockClear();
 vi.spyOn(navigator,'onLine','get').mockReturnValue(true);
});
afterEach(()=>{cleanup();vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
const success=()=>({ok:true,status:200,json:async()=>({results:[{offlineId:'OFF1',success:true,duplicate:true}]})});
it('keeps an uncertain network result pending and replays on reconnect without permanent failure',async()=>{
 const fetch=vi.fn().mockRejectedValueOnce(new TypeError('network lost')).mockResolvedValue(success());
 vi.stubGlobal('fetch',fetch);
 await act(async()=>{render(<OfflineProvider><Probe/></OfflineProvider>);});
 await act(async()=>{await state.syncNow();});
 expect(store.failed).not.toHaveBeenCalled();expect(store.pending).toHaveLength(1);
 expect(state.lastSyncResult.networkUncertain).toBe(true);
 vi.clearAllTimers();
 await act(async()=>{window.dispatchEvent(new Event('online'));await vi.advanceTimersByTimeAsync(2100);});
 expect(fetch).toHaveBeenCalledTimes(2);expect(store.removed).toHaveBeenCalledOnce();
 expect(store.pending).toHaveLength(0);
});
it('does not lose a requested reconnect while the previous sync is still in flight',async()=>{
 let resolve;const first=new Promise(r=>{resolve=r;});
 const fetch=vi.fn().mockReturnValueOnce(first).mockResolvedValue(success());vi.stubGlobal('fetch',fetch);
 await act(async()=>{render(<OfflineProvider><Probe/></OfflineProvider>);});
 let running;await act(async()=>{running=state.syncNow();await Promise.resolve();});
 await act(async()=>{await state.syncNow();});
 await act(async()=>{resolve({ok:false,status:503});await running;await vi.advanceTimersByTimeAsync(1);});
 expect(fetch).toHaveBeenCalledTimes(2);expect(store.failed).not.toHaveBeenCalled();
 expect(store.pending).toHaveLength(0);
});

import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { formatCurrency } from '../../lib/constants';
import StockMovementLedger from './StockMovementLedger';

export default function StockTrace({branch}) {
  const [search,setSearch]=useState(()=>new URLSearchParams(window.location.search).get('search') || '');
  const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[attempt,retry]=useState(0);
  useEffect(()=>{
    let cancelled=false; setData(null);setError('');
    if(search.trim().length<3){setLoading(false);return;}
    setLoading(true);
    const params=new URLSearchParams({search:search.trim()});
    if(branch && branch!=='all')params.set('branch',branch);
    api.get(`/stock/trace?${params}`).then(result=>{if(!cancelled)setData(result);})
      .catch(err=>{if(!cancelled)setError(err.message);}).finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[search,branch,attempt]);
  return <div>
    <section className="sp-panel sp-panel-content">
      <h2 className="font-bold">Trace Stock — recorded document timeline</h2>
      <p>Read-only. Search receipt, sale/movement/batch, transfer/import reference, product or branch. Africa/Windhoek dates; missing documents are not invented.</p>
      <label>Document search<input className="sp-input" aria-label="Trace document search" value={search} onChange={e=>setSearch(e.target.value)} /></label>
      {search.trim().length<3 && <p>Enter at least three characters.</p>}
      {loading && <p role="status">Loading recorded documents…</p>}
      {error && <p role="alert">{error} <button onClick={()=>retry(n=>n+1)}>Retry documents</button></p>}
      {data && <><p>{data.coverage}</p>{data.gaps?.map(gap=><p className="text-amber-700" key={gap}>{gap}</p>)}
        <ol>{data.events.map(event=><li key={event.id} className="p-3 border-b">
          <strong>{event.type}</strong> · {event.businessDate || 'Date not recorded'} · {event.reference} {event.receipt && `· ${event.receipt}`}
          <div>Source {event.source} / {event.recordId} · {event.location || 'Location not recorded'} · {event.status} · Staff {event.actor}</div>
          {event.source==='sale_audit' && <div>DP value {event.dpValue==null?'Missing':formatCurrency(event.dpValue)}
            {' · '}Customer charged {event.chargedValue==null?'Missing':formatCurrency(event.chargedValue)}
            {' · '}Branch profit {event.branchProfit==null?'Missing':formatCurrency(event.branchProfit)}</div>}
        </li>)}</ol>{!data.events.length && <p>No matching document events. Inspect the movement ledger below; absence is not proof that no stock moved.</p>}</>}
    </section>
    <StockMovementLedger key={search} branch={branch} trace initialSearch={search} />
  </div>;
}

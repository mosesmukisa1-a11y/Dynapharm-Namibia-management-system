import React,{useEffect,useState} from 'react';

export default function ManualPriceControl({onChanged}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [reference,setReference]=useState(''),[approved,setApproved]=useState(false);
  async function load(){
    try{
      const response=await fetch('/api/prices/manual-schedules',{credentials:'include'});
      const body=await response.json();
      if(!response.ok)throw Error(body.error||'Manual price review unavailable');
      setData(body);setError('');
    }catch(e){setError(e.message);}
  }
  useEffect(()=>{load();},[]);
  async function act(id,action){
    setBusy(true);setError('');
    try{
      const response=await fetch(`/api/prices/manual-schedules/${id}/${action}`,{
        method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({scope:'global',confirmApproval:approved,approvalReference:reference.trim()})
      });
      const body=await response.json();
      if(!response.ok)throw Error(body.error||'Price action failed');
      setApproved(false);setReference('');
      await load();onChanged?.();
    }catch(e){setError(e.message);}
    finally{setBusy(false);}
  }
  const enabled=!busy&&approved&&/^[A-Za-z0-9][A-Za-z0-9 ._:/-]{2,119}$/.test(reference.trim());
  const reversed=new Set((data?.actions||[]).map(a=>a.reverses_history_id).filter(Boolean));
  return <section className="border border-red-200 bg-white rounded-xl p-4 my-4" aria-label="Manual scheduled price control">
    <h3 className="font-bold text-red-800">Manual scheduled price control</h3>
    <p className="text-sm my-2">Global pricebook only · Africa/Windhoek · {data?.today||'Date unavailable'}.
      Automatic activation stays disabled. Branch-specific prices and staged new products require separate review.</p>
    {error&&<p role="alert" className="text-red-700 my-2">{error}</p>}
    <button type="button" onClick={load} disabled={busy} className="border rounded px-3 py-1">Refresh manual review</button>
    <label className="block my-2">Approval reference (no personal or clinical data)
      <input aria-label="Price approval reference" value={reference} maxLength={120} onChange={e=>setReference(e.target.value)}
        className="border rounded ml-2 px-2 py-1" placeholder="GM-PRICE-2026-001"/>
    </label>
    <label className="block text-sm my-2"><input type="checkbox" checked={approved} onChange={e=>setApproved(e.target.checked)}/>
      {' '}I approve this product, global scope, effective date and displayed prices. Compensation restores prior prices only if no intervening change occurred.</label>
    {(data?.pending||[]).map(p=><div key={p.id} className="border-t py-3">
      <strong>{p.description}</strong> · Product {p.product_id} · Schedule {p.id} · Global<br/>
      Effective {String(p.effective_from).slice(0,10)} Africa/Windhoek · DP {p.live_dp} → {p.new_dp} · CP {p.live_cp} → {p.new_cp}
      {' '}· CIF {p.live_cif??'Missing'} → {p.new_cif??'Missing'} · BV {p.live_bv??'Missing'} → {p.new_bv??'Missing'}
      <button type="button" className="ml-3 bg-red-700 text-white rounded px-3 py-1"
        disabled={!enabled||String(p.effective_from).slice(0,10)>data.today} onClick={()=>act(p.id,'activate')}>
        Activate schedule {p.id}
      </button>
    </div>)}
    {data&&data.pending.length===0&&<p className="text-sm my-2">No pending existing-product schedules.</p>}
    <h4 className="font-semibold mt-3">Recent audited actions</h4>
    {(data?.actions||[]).map(a=><div key={a.id} className="border-t py-2 text-sm">
      {a.description} · {a.action} · History {a.history_id} · {a.actor_name} · {a.approval_reference} · {a.created_at}
      <span className="block">DP {a.before_prices.dp} → {a.after_prices.dp} · CP {a.before_prices.cp} → {a.after_prices.cp}
        {' '}· CIF {a.before_prices.cif} → {a.after_prices.cif} · BV {a.before_prices.bv} → {a.after_prices.bv}</span>
      {a.action==='activation'&&!reversed.has(a.history_id)&&<button type="button" disabled={!enabled}
        className="ml-2 border border-red-600 rounded px-2 py-1" onClick={()=>act(a.history_id,'compensate')}>
        Compensate activation {a.history_id}
      </button>}
    </div>)}
  </section>;
}

import {useEffect,useState} from 'react';
import {api} from '../lib/api';

const unknown=value=>value==null||value===''?'Unknown':String(value);
function FrozenEvidence({allocation}){
  const snapshot=allocation?.snapshot || {};
  return <div className="space-y-2 text-sm">
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div>Allocation: <strong>{unknown(allocation?.movement_id)}</strong></div>
      <div>Sale: <strong>{unknown(allocation?.sale_reference)}</strong></div>
      <div>Branch / product: <strong>{unknown(allocation?.branch_id)} / {unknown(allocation?.product_name)}</strong></div>
      <div>Original sold base units: <strong>{unknown(allocation?.quantity)}</strong></div>
      <div>Lot / expiry: <strong>{unknown(allocation?.batch_no)} / {unknown(allocation?.expiry_date)?.slice(0,10)}</strong></div>
      <div>Frozen charged unit price: <strong>{unknown(snapshot.revenue_unit)}</strong></div>
    </dl>
    {(snapshot.cost_layers || []).map((layer,index)=>{
      const source=layer.source;
      return <div key={index} className="p-2 bg-slate-50 rounded border">
        Source layer {index+1}: {unknown(layer.quantity)} units · batch {unknown(source?.id)} ·
        supplier/import {unknown(source?.supplier_name)} / {unknown(source?.supplier_import_id)} ·
        received CF {unknown(source?.received_unit_cif_exact ?? source?.original_unit_cif ?? source?.cif_unit_cost)}
      </div>;
    })}
    <p className="text-slate-600">Unknown receipt fields stay unknown. Linking does not confirm custody, restore stock, approve a refund or reopen prescription entitlement.</p>
  </div>;
}

export function HistoricalRefundLinkForm({refund,onChange,proposal}){
  const [reference,setReference]=useState(refund.sale_reference || '');
  const [candidate,setCandidate]=useState(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [evidence,setEvidence]=useState(''),[reason,setReason]=useState('');
  const lookup=async()=>{
    setBusy(true);setCandidate(null);setMessage('');
    try{
      const data=await api.stock.listRefundRequests({evidence_for:refund.id,sale_reference:reference});
      if(data.ambiguous)throw new Error(data.candidates.length?'Ambiguous original sale allocations: no source may be inferred.':'No frozen original sale allocation was found.');
      setCandidate(data.candidates[0]);
    }catch(error){setMessage(error.message);}
    finally{setBusy(false);}
  };
  const propose=async()=>{
    setBusy(true);setMessage('');
    try{
      await api.stock.proposeRefundEvidence(refund.id,{sale_reference:reference,allocation_id:candidate.movement_id,
        evidence_reference:evidence,proposal_reason:reason});
      setMessage('Evidence proposed for GM review. The refund remains pending; no stock was changed.');
      onChange?.();
    }catch(error){setMessage(error.message);}
    finally{setBusy(false);}
  };
  if(proposal)return <section className="p-3 border rounded space-y-2" aria-label="Historical refund evidence">
    <h4 className="font-bold">Evidence awaiting separate GM review</h4>
    <p>Archived reference: {proposal.evidence_reference} · proposed by {proposal.proposed_by}</p>
    <p>{proposal.proposal_reason}</p>
    <FrozenEvidence allocation={proposal.allocation_snapshot}/>
  </section>;
  return <section className="p-3 border border-amber-200 rounded bg-amber-50 space-y-3" aria-label="Historical refund evidence">
    <h4 className="font-bold">Historical request: GM-approved evidence link required</h4>
    <label className="block">Original sale reference
      <input className="input w-full" value={reference} readOnly={Boolean(refund.sale_reference)}
        onChange={e=>{setReference(e.target.value);setCandidate(null);}} />
    </label>
    <button className="btn btn-secondary" disabled={busy||!reference.trim()} onClick={lookup}>Find frozen sale evidence</button>
    {candidate && <>
      <FrozenEvidence allocation={candidate}/>
      <label className="block">Archived document / receipt reference
        <input className="input w-full" value={evidence} onChange={e=>setEvidence(e.target.value)} maxLength={1000}/>
      </label>
      <label className="block">Why this evidence belongs to this request
        <textarea className="input w-full" value={reason} onChange={e=>setReason(e.target.value)} maxLength={2000}/>
      </label>
      <button className="btn btn-primary" disabled={busy||!evidence.trim()||!reason.trim()} onClick={propose}>Submit evidence to GM</button>
    </>}
    {message && <p role="status">{message}</p>}
  </section>;
}

export default function HistoricalRefundReview(){
  const [data,setData]=useState(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [notes,setNotes]=useState({}),[showHistory,setShowHistory]=useState(false);
  const load=async()=>{
    try{setData(await api.stock.listRefundRequests());}
    catch(error){setMessage(error.message);}
  };
  useEffect(()=>{load();},[]);
  const review=async(proposal,approve)=>{
    setBusy(true);setMessage('');
    try{
      const response=await api.stock.reviewRefundEvidence(proposal.refund_id,{proposal_id:proposal.id,
        review_reason:notes[proposal.id]},approve);
      setMessage(response.message);await load();
    }catch(error){setMessage(error.message);}
    finally{setBusy(false);}
  };
  const history=data?.evidenceHistory || [];
  const pending=history.filter(p=>p.status==='proposed'&&(p.refund_status==='pending'||
    data.requests.some(r=>String(r.id)===p.refund_id&&r.status==='pending')));
  return <section className="space-y-4">
    <h2 className="text-xl font-bold">Historical Refund Evidence Review</h2>
    <p>Review Stock's archived evidence separately from physical refund approval. Ambiguous matches and over-cap claims cannot be linked. Original quantities are never corrected here.</p>
    <button className="btn btn-secondary" onClick={load} disabled={busy}>Refresh evidence</button>
    {message && <p role="status" className="p-3 border rounded">{message}</p>}
    {!data && !message && <p>Loading evidence…</p>}
    {data && !pending.length && <p>No historical evidence proposals await GM review.</p>}
    {pending.map(proposal=><article key={proposal.id} className="card p-4 space-y-3">
      <h3 className="font-bold">Request {proposal.refund_id} · {proposal.request_snapshot.quantity} base units</h3>
      <p>Original request reason: {proposal.request_snapshot.reason}</p>
      <p>Proposed by: {proposal.proposed_by} on {new Date(proposal.proposed_at).toLocaleString()}</p>
      <p>Archived evidence reference: <strong>{proposal.evidence_reference}</strong></p>
      <p>Linking justification: {proposal.proposal_reason}</p>
      <FrozenEvidence allocation={proposal.allocation_snapshot}/>
      <label className="block">GM review notes
        <textarea className="input w-full" maxLength={2000} value={notes[proposal.id] || ''}
          onChange={e=>setNotes(n=>({...n,[proposal.id]:e.target.value}))}/>
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" disabled={busy||!notes[proposal.id]?.trim()} onClick={()=>review(proposal,true)}>Approve evidence link only</button>
        <button className="btn btn-secondary" disabled={busy||!notes[proposal.id]?.trim()} onClick={()=>review(proposal,false)}>Reject evidence link</button>
      </div>
    </article>)}
    <button className="btn btn-secondary" onClick={()=>setShowHistory(v=>!v)}> {showHistory?'Hide':'Show'} immutable review history</button>
    {showHistory && history.filter(p=>p.status!=='proposed').map(p=><article key={p.id} className="card p-3 space-y-2">
      <p>Request {p.refund_id}: {p.status} · proposer {p.proposed_by} · reviewer {p.reviewed_by}</p>
      <p>Evidence: {p.evidence_reference} · proposal: {p.proposal_reason} · review: {p.review_reason}</p>
      <FrozenEvidence allocation={p.allocation_snapshot}/>
    </article>)}
  </section>;
}

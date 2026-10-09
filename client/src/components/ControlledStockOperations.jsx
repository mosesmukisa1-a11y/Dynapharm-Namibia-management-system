import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ControlledStockFilters, ControlledStockPager } from './ControlledStockFilters';
import { api } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { AlertTriangle, Archive, Check, ChevronDown, ClipboardCheck, Clock3, PackageSearch, Plus, RefreshCw, ShieldCheck, Truck, X } from 'lucide-react';

const palette = {
  stock: { ink: '#713f12', accent: '#b7791f', soft: '#fff8e8', line: '#f1dfbc' },
  gm: { ink: '#4c1d95', accent: '#7c3aed', soft: '#f5f0ff', line: '#e4d8fb' },
  branch: { ink: '#8b1e32', accent: '#b4233d', soft: '#fff3f4', line: '#f3d4d8' },
  finance: { ink: '#145a50', accent: '#148477', soft: '#effaf7', line: '#cde9e2' },
};
const statusColors = {
  draft: ['#fff7e6', '#9a5b00'], submitted: ['#edf4ff', '#2457a6'], partially_reviewed: ['#f4edff', '#6941a5'],
  approved: ['#e9f7ef', '#26734d'], partially_dispatched: ['#e9f5f7', '#276976'], rejected: ['#fff0f0', '#a33a3a'], dispatched: ['#e9f5f7', '#276976'], credited: ['#e9f7ef', '#26734d'],
};
const statusName = (s) => (s || 'pending').replaceAll('_', ' ');
const batchKey = (b) => `${b.batch_type}:${b.id}`;
const batchTitle = (b) => `${b.product_name || 'Unnamed product'} · ${b.batch_no || 'Batch not recorded'}`;
const windhoekToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Windhoek', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const expiryDateOnly = (d) => {
  if (!d) return '';
  const text = String(d);
  const datePart = /^\d{4}-\d{2}-\d{2}/.exec(text);
  if (datePart) return datePart[0];
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? '' : new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Windhoek', year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed);
};
const isExpiredInWindhoek = (d) => {
  const expiry = expiryDateOnly(d);
  return Boolean(expiry && expiry < windhoekToday());
};
const dateLabel = (d) => {
  if (!d) return 'No expiry recorded';
  const value = expiryDateOnly(d);
  if (!value) return 'Expiry unavailable';
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};
const integerValue = (v) => Number.isInteger(Number(v)) && Number(v) >= 0;
const amount = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

export default function ControlledStockOperations({ mode = 'stock' }) {
  const { user } = useAuth();
  const theme = palette[mode] || palette.stock;
  const roles = [user?.role, ...(Array.isArray(user?.additional_roles) ? user.additional_roles : [])];
  const isGM = mode === 'gm' || roles.includes('gm') || roles.includes('admin');
  const canCreate = mode === 'stock' || mode === 'branch';
  const canDispatch = mode !== 'finance' && (mode !== 'gm' || isGM);
  const canCredit = mode === 'finance' || isGM;
  const [data, setData] = useState({ operations: [], batches: [], segregated: [], credits: [], financial_entries: [], locations: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [kind, setKind] = useState('count');
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState([]);
  const [formLines, setFormLines] = useState({});
  const [expanded, setExpanded] = useState({});
  const [reviewNotes, setReviewNotes] = useState({});
  const [dispatchFields, setDispatchFields] = useState({});
  const [creditFields, setCreditFields] = useState({});
  const [batchFilters,setBatchFilters] = useState({search:'',location:'',status:'',page:1});
  const [operationFilters,setOperationFilters] = useState({search:'',location:'',status:'',page:1});
  const [selectedBatches,setSelectedBatches] = useState({});
  const [details,setDetails] = useState({});
  const [detailLoading,setDetailLoading] = useState({});
  const [detailErrors,setDetailErrors] = useState({});
  const requestVersion = useRef(0);
  const detailVersion = useRef({});
  const detailSequence = useRef(0);
  const visibleOperationIds = useRef(new Set());
  const creatorIdentity = [user?.id, user?.username, user?.full_name, user?.fullName, user?.name].filter(v => v != null).map(String);

  const refresh = useCallback(async (quiet = false) => {
    const version=++requestVersion.current;
    if (quiet) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const params=new URLSearchParams({
        batch_search:batchFilters.search,location:batchFilters.location,batch_status:batchFilters.status,
        batch_page:String(batchFilters.page),
      });
      // The two lists have independent location filters and page controls.
      const [batchResponse,operationResponse]=await Promise.all([
        api.get(`/stock/controlled-operations?view=batches&${params}`),
        api.get(`/stock/controlled-operations?view=operations&${new URLSearchParams({
          operation_search:operationFilters.search,operation_status:operationFilters.status,
          operation_page:String(operationFilters.page),location:operationFilters.location,
        })}`),
      ]);
      if (version!==requestVersion.current) return;
      const response={...batchResponse,...operationResponse};
      setData({
        operations: Array.isArray(response?.operations) ? response.operations : [],
        batches: Array.isArray(response?.batches) ? response.batches : [],
        segregated: Array.isArray(response?.segregated) ? response.segregated : [],
        credits: Array.isArray(response?.credits) ? response.credits : [],
        financial_entries: Array.isArray(response?.financial_entries) ? response.financial_entries : [],
        locations: Array.isArray(response?.locations) ? response.locations : [],
        batch_pagination:response?.batch_pagination,
        operation_pagination:response?.operation_pagination,
      });
      const visible=new Set((response.operations || []).map(op=>op.id));
      visibleOperationIds.current=visible;
      detailVersion.current={};
      setDetails({});
      setExpanded({});
    } catch (e) {
      if (version===requestVersion.current) setError(e.message || 'Controlled stock data could not be loaded.');
    } finally {
      if (version===requestVersion.current) {setLoading(false);setRefreshing(false);}
    }
  }, [batchFilters,operationFilters]);
  useEffect(() => { refresh(true); return ()=>{requestVersion.current++;}; }, [refresh]);
  const loadDetail = async id => {
    const version=++detailSequence.current;
    detailVersion.current[id]=version;
    setDetailLoading(current=>({...current,[id]:true}));
    setDetailErrors(current=>({...current,[id]:''}));
    try {
      const detail=await api.get(`/stock/controlled-operations?operation_id=${encodeURIComponent(id)}`);
      if (detailVersion.current[id]===version && visibleOperationIds.current.has(id)) setDetails(current=>({...current,[id]:detail}));
    } catch(e) {
      if (detailVersion.current[id]===version) setDetailErrors(current=>({...current,[id]:e.message || 'Operation detail could not be loaded.'}));
    } finally {
      if (detailVersion.current[id]===version) setDetailLoading(current=>({...current,[id]:false}));
    }
  };

  const allBatches = useMemo(() => [...data.batches, ...data.segregated], [data.batches, data.segregated]);
  const eligibleBatches = useMemo(() => data.batches.filter(batch => batch.purpose !== 'supplier_return'), [data.batches]);
  const eligibleSegregated = useMemo(() => data.segregated.filter(batch => batch.purpose !== 'supplier_return'), [data.segregated]);
  const batchMap = useMemo(() => new Map(allBatches.map(b => [batchKey(b), b])), [allBatches]);
  const chosenBatches = selected.map(key => selectedBatches[key]).filter(Boolean);
  const openedDetails = Object.entries(details).filter(([id])=>expanded[id]).map(([,detail])=>detail);
  const visibleCredits = openedDetails.flatMap(detail=>detail.credits || []);
  const visibleEntries = openedDetails.flatMap(detail=>detail.financial_entries || []);
  const mutate = async (request) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request();
      if (result?.operation) setNotice(`Operation ${result.operation.id} updated.`);
      await refresh(true);
      if (result?.operation && expanded[result.operation.id] && visibleOperationIds.current.has(result.operation.id)) {
        setExpanded(current=>({...current,[result.operation.id]:true}));
        await loadDetail(result.operation.id);
      }
      return result?.operation || null;
    } catch (e) {
      setError(e.message || 'The operation could not be saved.');
      return null;
    } finally { setBusy(false); }
  };
  const resetComposer = () => { setSelected([]); setSelectedBatches({}); setFormLines({}); setReason(''); };
  const toggleBatch = (b) => {
    const key = batchKey(b);
    setSelectedBatches(current=>{
      const next={...current};
      if (selected.includes(key)) delete next[key]; else next[key]=b;
      return next;
    });
    setSelected(current => current.includes(key) ? current.filter(k => k !== key) : [...current, key]);
    setFormLines(current => ({
      ...current,
      [key]: current[key] || { quantity: '', counted_quantity: '', condition: b.batch_type === 'segregated' ? (b.condition || 'quarantine') : 'saleable', disposition: b.batch_type === 'segregated' ? 'quarantine' : 'quarantine', reason: '' },
    }));
  };
  const setLineField = (key, field, value) => setFormLines(curr => ({ ...curr, [key]: { ...curr[key], [field]: value } }));
  const createOperation = async (event) => {
    event.preventDefault();
    if (!selected.length || !reason.trim()) return setError('Choose at least one batch and enter an operation reason.');
    if (kind === 'count') {
      const result = await mutate(() => api.post('/stock/controlled-operations', {
        kind, reason: reason.trim(), lines: chosenBatches.map(b => ({ batch_type: b.batch_type, batch_id: b.id })),
      }));
      if (result) resetComposer();
      return;
    }
    const lines = chosenBatches.map(b => {
      const f = formLines[batchKey(b)] || {};
      return { batch_type: b.batch_type, batch_id: b.id, quantity: Number(f.quantity), condition: f.condition, disposition: f.disposition, reason: (f.reason || '').trim() };
    });
    const invalid = lines.find((line, i) => !String(formLines[batchKey(chosenBatches[i])]?.quantity ?? '').trim() || !integerValue(line.quantity) || Number(line.quantity) < 1 || Number(line.quantity) > Number(chosenBatches[i]?.quantity || 0) || !line.reason);
    if (invalid) return setError('Each selected line needs a whole-number quantity within available stock and a specific reason.');
    const noProvenance = kind === 'supplier_return' && chosenBatches.find(b => {
      const linkedSource = b.supplier_import_id || b.source_batch_id || (b.batch_type === 'segregated' && b.source_type && b.source_id);
      return !linkedSource || b.unit_cost == null || !b.supplier_name;
    });
    if (noProvenance) return setError(`${batchTitle(noProvenance)} has no linked supplier and cost provenance. It cannot be returned; no price has been inferred.`);
    if (kind === 'inspection' && chosenBatches.some((b, i) => {
      const expiryPassed = isExpiredInWindhoek(b.expiry_date);
      return b.batch_type !== 'segregated' && lines[i].disposition !== 'quarantine'
        || b.batch_type === 'segregated' && lines[i].disposition === 'release' && (lines[i].condition !== 'saleable' || ['damaged', 'expired'].includes(String(b.condition || '').toLowerCase()) || expiryPassed);
    })) return setError('Available stock must be quarantined for inspection. Segregated stock can only be released after a saleable inspection and before expiry.');
    const result = await mutate(() => api.post('/stock/controlled-operations', { kind, reason: reason.trim(), lines }));
    if (result) resetComposer();
  };
  const submitDraft = async (op) => {
    const draftInputs = (op.lines || []).map(line => {
      const f = formLines[`draft:${line.id}`] || {};
      return { id: line.id, counted_quantity: f.counted_quantity, reason: (f.reason || '').trim() };
    });
    if (draftInputs.some(line => line.counted_quantity == null || !String(line.counted_quantity).trim() || !integerValue(line.counted_quantity) || !line.reason)) return setError('Enter a whole-number count and a reason for every draft line.');
    const lines = draftInputs.map(line => ({ ...line, counted_quantity: Number(line.counted_quantity) }));
    const result = await mutate(() => api.patch('/stock/controlled-operations', { id: op.id, action: 'submit', lines }));
    if (result) setFormLines(curr => {
      const next = { ...curr }; (op.lines || []).forEach(line => delete next[`draft:${line.id}`]); return next;
    });
  };
  const reviewLine = (op, line, decision) => {
    const max = Number(line.quantity ?? line.expected_quantity ?? 0);
    const fieldKey = `review:${op.id}:${line.id}`;
    const quantity = op.kind === 'count' ? max : Number(formLines[fieldKey]?.quantity ?? max);
    if (!integerValue(quantity) || quantity < 0 || quantity > max) return setError('Review quantity must be a whole number within the submitted quantity.');
    return mutate(() => api.patch('/stock/controlled-operations', {
      id: op.id, action: 'review', notes: (reviewNotes[op.id] || '').trim(),
      decisions: [{ line_id: line.id, decision, quantity }],
    }));
  };
  const cancelDraft = (op) => mutate(() => api.patch('/stock/controlled-operations', { id: op.id, action: 'cancel' }));
  const dispatchOperation = async (op) => {
    const fields = dispatchFields[op.id] || {};
    const candidates = (op.lines || []).filter(line => line.status === 'approved' && Number(line.approved_quantity || 0) > Number(line.dispatched_quantity || 0)).map(line => ({
      line_id: line.id,
      quantity: Number(fields[line.id] ?? (Number(line.approved_quantity) - Number(line.dispatched_quantity || 0))),
      maximum: Number(line.approved_quantity) - Number(line.dispatched_quantity || 0),
    }));
    if (!fields.reference?.trim()) return setError('Enter the dispatch reference.');
    if (candidates.some(line => !integerValue(line.quantity) || line.quantity < 0 || line.quantity > line.maximum)) return setError('Dispatch quantities must be whole numbers between zero and the remaining approved quantity.');
    const lines = candidates.filter(line => line.quantity > 0).map(({ line_id, quantity }) => ({ line_id, quantity }));
    if (!lines.length) return setError('Select at least one line to dispatch by entering a quantity greater than zero.');
    const result = await mutate(() => api.patch('/stock/controlled-operations', { id: op.id, action: 'dispatch', lines, reference: fields.reference.trim() }));
    if (result) setDispatchFields(curr => {
      const next = { ...curr }; delete next[op.id]; return next;
    });
    return result;
  };
  const creditOperation = (op) => {
    const f = creditFields[op.id] || {};
    const creditRow = (details[op.id]?.credits || []).find(credit => String(credit.supplier_import_id) === String(f.supplier_import_id) && credit.status === 'awaiting_credit');
    if (!creditRow || !f.credit_reference?.trim() || f.credited_amount == null || !String(f.credited_amount).trim() || !Number.isFinite(Number(f.credited_amount)) || Number(f.credited_amount) < 0) return setError('Choose a pending supplier import and enter its credit reference and credited amount.');
    return mutate(() => api.patch('/stock/controlled-operations', { id: op.id, action: 'credit', supplier_import_id: creditRow.supplier_import_id, credit_reference: f.credit_reference.trim(), credited_amount: Number(f.credited_amount) }));
  };

  const styles = {
    shell: { color: '#26352f', fontFamily: 'inherit' },
    hero: { background: `linear-gradient(112deg, ${theme.soft}, #fff 72%)`, border: `1px solid ${theme.line}`, borderRadius: 16, padding: '22px 24px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 18 },
    eyebrow: { color: theme.ink, fontSize: 11, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' },
    title: { fontSize: 23, lineHeight: 1.1, color: '#24352f', fontWeight: 850, margin: '6px 0 7px' },
    copy: { color: '#65736d', fontSize: 13, lineHeight: 1.5, maxWidth: 700, margin: 0 },
    button: { background: theme.accent, border: 0, borderRadius: 9, padding: '10px 14px', color: '#fff', fontSize: 13, fontWeight: 750, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 },
    secondary: { background: '#fff', border: '1px solid #dce3df', borderRadius: 8, padding: '8px 11px', color: '#40544b', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
    panel: { background: '#fff', border: '1px solid #e5e9e6', borderRadius: 14, padding: 18, boxShadow: '0 3px 12px rgba(29,48,39,.035)' },
    input: { width: '100%', boxSizing: 'border-box', border: '1px solid #d9e1dc', borderRadius: 8, padding: '9px 10px', background: '#fff', color: '#293b33', fontSize: 13 },
    label: { display: 'block', fontSize: 11, fontWeight: 750, color: '#586961', marginBottom: 5 },
    subdued: { color: '#75827c', fontSize: 12 },
  };
  const titleByKind = { count: 'Controlled count', supplier_return: 'Supplier return', inspection: 'Stock inspection' };
  const actionButton = (label, onClick, color = theme.accent, disabled = false) => (
    <button type="button" onClick={onClick} disabled={disabled || busy} style={{ ...styles.button, background: color, opacity: disabled || busy ? .55 : 1, cursor: disabled || busy ? 'not-allowed' : 'pointer' }}>{label}</button>
  );
  const renderBatchCard = (batch, bucket) => {
    const key = batchKey(batch); const isChosen = selected.includes(key);
    const canSelect = canCreate && (kind === 'count'
      ? batch.batch_type !== 'segregated'
      : Number(batch.quantity) > 0 && batch.purpose !== 'supplier_return');
    const line = formLines[key] || {};
    const releaseUnavailable = ['damaged', 'expired'].includes(String(batch.condition || '').toLowerCase()) || isExpiredInWindhoek(batch.expiry_date);
    return <div key={key} style={{ border: `1px solid ${isChosen ? theme.accent : '#e7ece8'}`, borderRadius: 11, padding: 12, background: isChosen ? theme.soft : '#fff', transition: 'border-color .15s ease, background .15s ease' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <input type="checkbox" aria-label={`Select ${batchTitle(batch)}`} checked={isChosen} disabled={!canSelect} onChange={() => toggleBatch(batch)} style={{ marginTop: 4, accentColor: theme.accent }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13, color: '#293b33' }}>{batch.product_name || 'Unnamed product'}</strong>
            <span style={{ color: '#3b5146', fontSize: 12, fontWeight: 800 }}>{Number(batch.quantity || 0).toLocaleString()} units</span>
          </div>
          <div style={{ marginTop: 5, color: '#728078', fontSize: 11 }}>{batch.batch_no || 'Batch not recorded'} · {batch.location || 'Location not recorded'} · Expires {dateLabel(batch.expiry_date)}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            <span style={tagStyle(bucket === 'segregated' ? '#fff3e8' : '#edf7f1', bucket === 'segregated' ? '#9c561d' : '#347250')}>{bucket === 'segregated' ? `Segregated · ${statusName(batch.condition)}` : `Available: ${Number(batch.available_quantity || 0)} base units`}</span>
            {bucket !== 'segregated' && (isExpiredInWindhoek(batch.expiry_date) || batch.condition !== 'saleable') && <span style={tagStyle('#fff3e8','#9c561d')}>{isExpiredInWindhoek(batch.expiry_date) ? 'Expired — not saleable' : statusName(batch.condition)}</span>}
            <span style={tagStyle('#f2f4f3', '#68756e')}>{batch.batch_type === 'warehouse' ? 'Warehouse' : batch.batch_type === 'branch' ? 'Branch' : 'Segregated'}</span>
            {batch.supplier_name && <span style={tagStyle('#f3f1ec', '#665c48')}>Supplier: {batch.supplier_name}</span>}
            {batch.supplier_import_id && <span style={tagStyle('#f3f1ec', '#665c48')}>Import: {batch.supplier_import_id}</span>}
            {(batch.source_type || batch.source_id || batch.source_batch_id) && <span style={tagStyle('#f3f1ec', '#665c48')}>Source: {[batch.source_type, batch.source_id || batch.source_batch_id].filter(Boolean).join(' · ')}</span>}
            {batch.unit_cost != null && <span style={tagStyle('#f3f1ec', '#665c48')}>Unit cost: {amount(batch.unit_cost)}</span>}
          </div>
        </div>
      </div>
      {isChosen && kind !== 'count' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8, margin: '12px 0 0 25px' }}>
        <label><span style={styles.label}>Quantity (base units)</span><input style={styles.input} type="number" min="1" max={batch.quantity} step="1" value={line.quantity ?? ''} onChange={e => setLineField(key, 'quantity', e.target.value)} /></label>
        <label><span style={styles.label}>Condition</span><select style={styles.input} value={line.condition || 'saleable'} onChange={e => setLineField(key, 'condition', e.target.value)}>{['saleable', 'damaged', 'expired', 'quarantine'].map(v => <option key={v} value={v}>{statusName(v)}</option>)}</select></label>
        <label><span style={styles.label}>Disposition</span><select style={styles.input} value={line.disposition || 'quarantine'} onChange={e => setLineField(key, 'disposition', e.target.value)}>{(batch.batch_type === 'segregated' ? ['release', 'write_off', 'quarantine'] : ['quarantine']).map(v => <option key={v} value={v} disabled={v === 'release' && releaseUnavailable}>{statusName(v)}{v === 'release' && releaseUnavailable ? ' — unavailable' : ''}</option>)}</select></label>
        <label style={{ gridColumn: '1 / -1' }}><span style={styles.label}>Line reason</span><input style={styles.input} value={line.reason || ''} onChange={e => setLineField(key, 'reason', e.target.value)} placeholder="Describe this batch's condition or return reason" /></label>
      </div>}
    </div>;
  };
  const renderOperationCard = (summary) => {
    const detail=details[summary.id];
    const operation=detail?.operation || summary;
    const isOpen = Boolean(expanded[operation.id]);
    const lines = operation.lines || [];
    const pendingLines = lines.filter(line => line.status === 'pending');
    const isCreator = creatorIdentity.includes(String(operation.created_by));
    const canReview = isGM && operation.status !== 'draft' && pendingLines.length > 0 && !['approved', 'rejected', 'dispatched', 'credited'].includes(operation.status);
    const dispatchableStatus = ['approved', 'partially_reviewed', 'partially_dispatched'].includes(operation.status);
    const canDispatchThis = canDispatch && dispatchableStatus && operation.kind === 'supplier_return' && lines.some(line => line.status === 'approved' && Number(line.approved_quantity || 0) > Number(line.dispatched_quantity || 0));
    const approvedLines = lines.filter(line => line.status === 'approved');
    const isFullyDispatched = approvedLines.length > 0 && operation.status === 'dispatched';
    const creditChoices = (detail?.credits || []).filter(credit => credit.status === 'awaiting_credit');
    const canCreditThis = canCredit && operation.kind === 'supplier_return' && (isFullyDispatched || operation.status === 'credited') && creditChoices.length > 0;
    return <article key={operation.id} style={{ ...styles.panel, padding: 0, overflow: 'hidden' }}>
      <button type="button" aria-expanded={isOpen} onClick={() => {
        setExpanded(curr => ({ ...curr, [operation.id]: !isOpen }));
        if (!isOpen) loadDetail(operation.id);
      }} style={{ width: '100%', textAlign: 'left', padding: '16px 18px', border: 0, background: '#fff', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 9, alignItems: 'center' }}>
          <strong style={{ color: '#293b33', fontSize: 14 }}>{titleByKind[operation.kind] || statusName(operation.kind)} <span style={{ color: '#8a9790', fontWeight: 600 }}>#{operation.id}</span></strong>
          <span style={tagStyle(...(statusColors[operation.status] || ['#f0f2f1', '#59675f']))}>{statusName(operation.status)}</span>
          <span style={{ color: '#718078', fontSize: 11 }}>{summary.line_count ?? lines.length} lines · {operation.created_by || 'Staff'} · {operation.created_at ? new Date(operation.created_at).toLocaleString() : 'Date unavailable'}</span>
        </span><ChevronDown size={17} color="#738179" style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform .15s ease' }} />
      </button>
      {isOpen && detailLoading[operation.id] && <p style={{padding:16}}>Loading operation evidence…</p>}
      {isOpen && detailErrors[operation.id] && <div role="alert" style={{padding:16}}>{detailErrors[operation.id]} <button type="button" style={styles.secondary} onClick={()=>loadDetail(operation.id)}>Retry operation detail</button></div>}
      {isOpen && detail?.operation && !detailLoading[operation.id] && !detailErrors[operation.id] && <div style={{ borderTop: '1px solid #edf0ee', padding: 16 }}>
        <div style={{ color: '#53635b', fontSize: 13, marginBottom: 12 }}>{operation.reason || 'No operation reason recorded'}</div>
        {operation.kind === 'count' && <div style={{ padding: '10px 12px', background: '#f7f8f5', borderRadius: 9, color: '#59685f', fontSize: 12, marginBottom: 12 }}>
          Count against the saved cutoff quantities below. Approval applies the recorded delta to the current balance, preserving stock movements made after this snapshot.
        </div>}
        <div style={{ display: 'grid', gap: 9 }}>
          {lines.map(line => {
            const snap = line.snapshot || batchMap.get(`${line.batch_type}:${line.batch_id}`) || {};
            const fieldKey = `draft:${line.id}`;
            const draftLine = formLines[fieldKey] || {};
            const reviewKey = `review:${operation.id}:${line.id}`;
            const available = Math.max(0, Number(line.approved_quantity || line.quantity || line.expected_quantity || 0) - Number(line.dispatched_quantity || 0));
            return <div key={line.id} style={{ border: '1px solid #e8ece9', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div><strong style={{ fontSize: 12, color: '#2e4037' }}>{snap.product_name || 'Product unavailable'} · {snap.batch_no || 'Batch not recorded'}</strong><div style={{ color: '#78857e', fontSize: 11, marginTop: 4 }}>{snap.location || 'Location unavailable'} · Expiry {dateLabel(snap.expiry_date)}{snap.supplier_name ? ` · ${snap.supplier_name}` : ''}{snap.unit_cost != null ? ` · Cost ${amount(snap.unit_cost)}` : ''}</div></div>
                <span style={tagStyle(...(statusColors[line.status] || ['#f0f2f1', '#59675f']))}>{statusName(line.status)}</span>
              </div>
              {operation.kind === 'count' ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(125px,1fr))', gap: 9, marginTop: 10 }}>
                <div><div style={styles.label}>Cutoff expected</div><strong>{Number(line.expected_quantity || 0).toLocaleString()} units</strong></div>
                {operation.status === 'draft' ? <>
                  {isCreator ? <>
                    <label><span style={styles.label}>Counted base units</span><input type="number" min="0" step="1" style={styles.input} value={draftLine.counted_quantity ?? ''} onChange={e => setFormLines(curr => ({ ...curr, [fieldKey]: { ...curr[fieldKey], counted_quantity: e.target.value } }))} /></label>
                    <label><span style={styles.label}>Count reason</span><input style={styles.input} value={draftLine.reason || ''} onChange={e => setFormLines(curr => ({ ...curr, [fieldKey]: { ...curr[fieldKey], reason: e.target.value } }))} placeholder="Required for each line" /></label>
                  </> : <div style={{ ...styles.subdued, alignSelf: 'center' }}>Draft editable only by {operation.created_by || 'its creator'}.</div>}
                </> : <div><div style={styles.label}>Counted</div><strong>{line.counted_quantity == null ? 'Not recorded' : `${Number(line.counted_quantity).toLocaleString()} units`}</strong></div>}
                {line.applied_delta != null && <div><div style={styles.label}>Approved delta</div><strong style={{ color: Number(line.applied_delta) < 0 ? '#a33a3a' : '#26734d' }}>{Number(line.applied_delta) > 0 ? '+' : ''}{Number(line.applied_delta).toLocaleString()} units</strong><div style={styles.subdued}>Current at approval: {Number(line.current_at_approval || 0).toLocaleString()}</div></div>}
              </div> : <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', color: '#69776f', fontSize: 11, marginTop: 9 }}>
                <span>Requested: <b>{Number(line.quantity || 0).toLocaleString()} units</b></span>{line.approved_quantity != null && <span>Approved: <b>{Number(line.approved_quantity).toLocaleString()}</b></span>}
                {line.dispatched_quantity != null && <span>Dispatched: <b>{Number(line.dispatched_quantity).toLocaleString()}</b></span>}
                {line.condition && <span>Condition: <b>{statusName(line.condition)}</b></span>}{line.disposition && <span>Disposition: <b>{statusName(line.disposition)}</b></span>}
                {line.reason && <span>Reason: {line.reason}</span>}
              </div>}
              {canReview && line.status === 'pending' && <div style={{ display: 'flex', alignItems: 'end', flexWrap: 'wrap', gap: 8, marginTop: 11 }}>
                {operation.kind !== 'count' && <label style={{ width: 145 }}><span style={styles.label}>Approve quantity</span><input style={styles.input} type="number" min="0" max={line.quantity} step="1" value={formLines[reviewKey]?.quantity ?? line.quantity ?? ''} onChange={e => setFormLines(curr => ({ ...curr, [reviewKey]: { quantity: e.target.value } }))} /></label>}
                <button type="button" disabled={busy} onClick={() => reviewLine(operation, line, 'approve')} style={{ ...styles.secondary, color: '#26734d', borderColor: '#b8ddc8', display: 'inline-flex', gap: 5, alignItems: 'center' }}><Check size={14} /> Approve line</button>
                <button type="button" disabled={busy} onClick={() => reviewLine(operation, line, 'reject')} style={{ ...styles.secondary, color: '#a33a3a', borderColor: '#edc5c5', display: 'inline-flex', gap: 5, alignItems: 'center' }}><X size={14} /> Reject line</button>
              </div>}
              {operation.kind === 'supplier_return' && line.status === 'approved' && canDispatchThis && <label style={{ display: 'inline-block', width: 160, marginTop: 10 }}><span style={styles.label}>Dispatch (0 to skip, max {available})</span><input type="number" min="0" max={available} step="1" style={styles.input} value={dispatchFields[operation.id]?.[line.id] ?? available} onChange={e => setDispatchFields(curr => ({ ...curr, [operation.id]: { ...curr[operation.id], [line.id]: e.target.value } }))} /></label>}
              {line.hold_id && <div style={{ ...styles.subdued, marginTop: 7 }}>Hold reference: {line.hold_id}</div>}
            </div>;
          })}
        </div>
        {operation.status === 'draft' && isCreator && <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }}>
          <span style={styles.subdued}>Saved draft captures the cutoff snapshot when created.</span>
          {actionButton(<><ClipboardCheck size={15} /> Submit complete count</>, () => submitDraft(operation), theme.accent, busy)}
          <button type="button" disabled={busy} onClick={() => cancelDraft(operation)} style={{ ...styles.secondary, color: '#9a4141' }}>Cancel draft</button>
        </div>}
        {operation.status === 'draft' && !isCreator && <div style={{ marginTop: 14, ...styles.subdued }}>This cutoff draft is read-only for your account.</div>}
        {canReview && <div style={{ display: 'flex', alignItems: 'end', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <label style={{ flex: '1 1 260px' }}><span style={styles.label}>Review note (optional)</span><input style={styles.input} value={reviewNotes[operation.id] || ''} onChange={e => setReviewNotes(curr => ({ ...curr, [operation.id]: e.target.value }))} placeholder="Reason for this review" /></label>
          <span style={styles.subdued}>Unselected lines remain pending.</span>
        </div>}
        {canDispatchThis && <div style={{ display: 'flex', alignItems: 'end', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <label style={{ flex: '1 1 220px' }}><span style={styles.label}>Dispatch reference</span><input style={styles.input} value={dispatchFields[operation.id]?.reference || ''} onChange={e => setDispatchFields(curr => ({ ...curr, [operation.id]: { ...curr[operation.id], reference: e.target.value } }))} placeholder="Supplier return / shipment reference" /></label>
          {actionButton(<><Truck size={15} /> Dispatch selected quantities</>, () => dispatchOperation(operation), theme.accent)}
        </div>}
        {canCreditThis && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', alignItems: 'end', gap: 9, marginTop: 12 }}>
          <label><span style={styles.label}>Supplier import to credit</span><select style={styles.input} value={creditFields[operation.id]?.supplier_import_id || ''} onChange={e => setCreditFields(curr => ({ ...curr, [operation.id]: { ...curr[operation.id], supplier_import_id: e.target.value } }))}><option value="">Choose pending supplier import</option>{creditChoices.map((credit, index) => <option key={`${credit.supplier_import_id}-${index}`} value={credit.supplier_import_id}>{credit.supplier_name || 'Supplier'} · Import {credit.supplier_import_id} · Expected {amount(credit.expected_amount)}</option>)}</select></label>
          <label><span style={styles.label}>Credit reference</span><input style={styles.input} value={creditFields[operation.id]?.credit_reference || ''} onChange={e => setCreditFields(curr => ({ ...curr, [operation.id]: { ...curr[operation.id], credit_reference: e.target.value } }))} /></label>
          <label><span style={styles.label}>Credited amount</span><input style={styles.input} type="number" min="0" step="0.01" value={creditFields[operation.id]?.credited_amount ?? ''} onChange={e => setCreditFields(curr => ({ ...curr, [operation.id]: { ...curr[operation.id], credited_amount: e.target.value } }))} /></label>
          {creditChoices.length > 0 ? actionButton(<><Check size={15} /> Record supplier credit</>, () => creditOperation(operation), theme.accent) : <div style={styles.subdued}>No pending supplier-import credits are available for this operation.</div>}
        </div>}
      </div>}
    </article>;
  };

  if (loading) return <div style={{ ...styles.shell, padding: 20 }}><div style={{ ...styles.panel, border: `1px solid ${theme.line}` }}><div style={{ height: 20, width: 230, borderRadius: 6, background: theme.soft, marginBottom: 15 }} /><div style={{ height: 12, width: '72%', borderRadius: 6, background: '#f0f2f1', marginBottom: 9 }} /><div style={{ height: 12, width: '51%', borderRadius: 6, background: '#f0f2f1' }} /></div></div>;

  return <div style={styles.shell}>
    <div style={styles.hero}>
      <div><div style={styles.eyebrow}>Dynapharm · controlled stock</div><h2 style={styles.title}>Counts & supplier returns</h2><p style={styles.copy}>A traceable workflow for count cutoffs, stock quarantine, source-linked supplier returns and credits. Every quantity is recorded in integer base units.</p></div>
      <button type="button" style={{ ...styles.secondary, display: 'inline-flex', alignItems: 'center', gap: 7 }} onClick={() => refresh(true)} disabled={refreshing}><RefreshCw size={14} /> {refreshing ? 'Refreshing' : 'Refresh'}</button>
    </div>
    {error && <div role="alert" style={{ margin: '0 0 14px', padding: '11px 13px', border: '1px solid #edc3bd', borderRadius: 9, background: '#fff5f3', color: '#8f352d', fontSize: 13, display: 'flex', gap: 9, alignItems: 'flex-start' }}><AlertTriangle size={17} /> <span style={{ flex: 1 }}>{error}</span><button type="button" onClick={() => setError('')} aria-label="Dismiss error" style={{ border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer' }}><X size={15} /></button></div>}
    {notice && <div role="status" style={{ margin: '0 0 14px', padding: '10px 13px', border: '1px solid #c4e2d0', borderRadius: 9, background: '#f0faf4', color: '#286747', fontSize: 13 }}>{notice}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(135px,1fr))', gap: 9, marginBottom: 16 }}>
      {[['Available on this page', eligibleBatches.length, PackageSearch], ['Segregated on this page', eligibleSegregated.length, Archive], ['Matching operations', data.operation_pagination?.total ?? data.operations.length, Clock3], ['Credits in opened operations', visibleCredits.length, ShieldCheck]].map(([label, value, Icon]) => <div key={label} style={{ background: '#fff', border: '1px solid #e6ebe7', borderRadius: 11, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ color: theme.accent, background: theme.soft, borderRadius: 9, padding: 8 }}><Icon size={16} /></span><span><span style={{ display: 'block', fontSize: 17, fontWeight: 850, color: '#2d4136' }}>{value}</span><span style={{ color: '#78867e', fontSize: 11 }}>{label}</span></span></div>)}
    </div>
    {canCreate && <form onSubmit={createOperation} style={{ ...styles.panel, marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 13 }}>
        <div><h3 style={{ margin: 0, fontSize: 16, color: '#2a3d33' }}>Start a stock session</h3><p style={{ ...styles.subdued, margin: '4px 0 0' }}>Select batches to create a complete multi-line operation.</p></div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{[['count', 'Controlled count'], ['supplier_return', 'Supplier return'], ['inspection', 'Inspect stock']].map(([value, label]) => <button type="button" key={value} onClick={() => { setKind(value); resetComposer(); setError(''); }} style={{ ...styles.secondary, borderColor: kind === value ? theme.accent : '#dce3df', color: kind === value ? theme.ink : '#53635b', background: kind === value ? theme.soft : '#fff' }}>{label}</button>)}</div>
      </div>
      {kind === 'count' && <div style={{ padding: '10px 12px', background: '#f8f8f3', borderLeft: `3px solid ${theme.accent}`, borderRadius: 6, fontSize: 12, color: '#59685f', marginBottom: 12 }}><b>Cutoff rule:</b> creation saves the batch quantities now. Record the physical count against that snapshot; approved deltas preserve sales and receipts posted after the cutoff.</div>}
      {kind === 'supplier_return' && <div style={{ padding: '10px 12px', background: '#fff9ef', borderLeft: '3px solid #d39a36', borderRadius: 6, fontSize: 12, color: '#765520', marginBottom: 12 }}>Only source-linked batches with supplier provenance and recorded unit cost qualify. Missing provenance is shown as an error; prices are never estimated.</div>}
      {kind === 'inspection' && <div style={{ padding: '10px 12px', background: '#f7f5fb', borderLeft: `3px solid ${theme.accent}`, borderRadius: 6, fontSize: 12, color: '#5f566b', marginBottom: 12 }}>Available stock enters quarantine for inspection. Segregated stock can be released only when marked saleable and not expired; damaged or expired stock must not be released.</div>}
      <label style={{ display: 'block', maxWidth: 650, marginBottom: 12 }}><span style={styles.label}>Session reason</span><input style={styles.input} value={reason} onChange={e => setReason(e.target.value)} placeholder="For example: monthly controlled-drug count" /></label>
      {chosenBatches.length>0 && <section aria-label="Selected session lines" style={{marginBottom:16}}>
        <h4>Selected session lines · {chosenBatches.length}</h4>
        <p style={styles.subdued}>These lines stay selected across searches, locations and pages. Remove a line here to exclude it from this session.</p>
        <div style={{display:'grid',gap:8}}>{chosenBatches.map(batch=>renderBatchCard(batch,batch.batch_type==='segregated' ? 'segregated' : 'available'))}</div>
      </section>}
      <ControlledStockFilters label="Batch" filters={batchFilters} onApply={setBatchFilters} locations={data.locations} styles={styles} />
      <ControlledStockPager label="Batches" pagination={data.batch_pagination} onPage={page=>setBatchFilters(current=>({...current,page}))} disabled={refreshing} styles={styles} />
      {eligibleBatches.length + eligibleSegregated.length === 0 ? <div style={{ padding: 20, textAlign: 'center', background: '#f8faf8', borderRadius: 10, color: '#75827b', fontSize: 13 }}>No eligible batches are available in your server-scoped stock view.</div> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,360px),1fr))', gap: 14 }}>
        <div><div style={{ fontSize: 12, fontWeight: 800, color: '#42604f', marginBottom: 8 }}>Available stock · {eligibleBatches.length}</div><div style={{ display: 'grid', gap: 8, maxHeight: 420, overflowY: 'auto', paddingRight: 3 }}>{eligibleBatches.filter(batch=>!selected.includes(batchKey(batch))).map(batch => renderBatchCard(batch, 'available'))}</div></div>
        <div><div style={{ fontSize: 12, fontWeight: 800, color: '#8c592c', marginBottom: 8 }}>Segregated · {eligibleSegregated.length}</div><div style={{ display: 'grid', gap: 8, maxHeight: 420, overflowY: 'auto', paddingRight: 3 }}>{eligibleSegregated.filter(batch=>!selected.includes(batchKey(batch))).map(batch => renderBatchCard(batch, 'segregated'))}</div></div>
      </div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderTop: '1px solid #edf0ee', marginTop: 14, paddingTop: 12 }}>
        <span style={styles.subdued}>{selected.length} batch{selected.length === 1 ? '' : 'es'} selected</span>
        <div style={{ display: 'flex', gap: 8 }}>{selected.length > 0 && <button type="button" style={styles.secondary} onClick={resetComposer}>Clear selection</button>}<button type="submit" disabled={busy || selected.length === 0 || !reason.trim()} style={{ ...styles.button, opacity: busy || selected.length === 0 || !reason.trim() ? .55 : 1, cursor: busy || selected.length === 0 || !reason.trim() ? 'not-allowed' : 'pointer' }}><Plus size={15} /> {kind === 'count' ? 'Save count cutoff draft' : `Submit ${titleByKind[kind].toLowerCase()}`}</button></div>
      </div>
    </form>}
    <section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}><h3 style={{ fontSize: 16, color: '#2b3e34', margin: 0 }}>Operation register</h3><span style={styles.subdued}>Server-scoped activity · newest first</span></div>
      <ControlledStockFilters label="Operation" filters={operationFilters} onApply={setOperationFilters} locations={data.locations} styles={styles} operations />
      <ControlledStockPager label="Operations" pagination={data.operation_pagination} onPage={page=>setOperationFilters(current=>({...current,page}))} disabled={refreshing} styles={styles} />
      {data.operations.length === 0 ? <div style={{ ...styles.panel, textAlign: 'center', padding: 32 }}><ClipboardCheck size={25} color={theme.accent} style={{ margin: '0 auto 8px' }} /><strong style={{ display: 'block', color: '#405249', fontSize: 14 }}>No controlled operations yet</strong><span style={styles.subdued}>New count sessions and supplier workflows will appear here.</span></div> : <div style={{ display: 'grid', gap: 10 }}>{[...data.operations].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).map(op => renderOperationCard(op))}</div>}
    </section>
    <section style={{ marginTop: 18, ...styles.panel }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><ShieldCheck size={17} color={theme.accent} /><h3 style={{ margin: 0, color: '#2b3e34', fontSize: 14 }}>Supplier credit ledger</h3></div>
      <p style={styles.subdued}>Evidence for opened operations only. Open a register card to load its credits.</p>
      {visibleCredits.length === 0 ? <span style={styles.subdued}>No supplier credits loaded.</span> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720, fontSize: 12 }}><thead><tr>{['Supplier', 'Import', 'Return operation', 'Expected', 'Credited', 'Reference', 'Status'].map(h => <th key={h} style={{ textAlign: 'left', color: '#748178', borderBottom: '1px solid #e8ece9', padding: '8px 7px', fontWeight: 750 }}>{h}</th>)}</tr></thead><tbody>{visibleCredits.map((credit, i) => <tr key={`${credit.operation_id}-${credit.supplier_import_id || i}`}>{[credit.supplier_name || '—', credit.supplier_import_id || '—', `#${credit.operation_id}`, amount(credit.expected_amount), amount(credit.credited_amount), credit.credit_reference || '—', statusName(credit.status)].map((value, j) => <td key={j} style={{ borderBottom: '1px solid #eff2ef', padding: '9px 7px', color: '#45564d' }}>{value}</td>)}</tr>)}</tbody></table></div>}
    </section>
    <section style={{ marginTop: 12, ...styles.panel }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}><Archive size={17} color={theme.accent} /><h3 style={{ margin: 0, color: '#2b3e34', fontSize: 14 }}>Supplier return financial entries</h3></div>
      <p style={styles.subdued}>Journal evidence for opened operations only.</p>
      {visibleEntries.length === 0 ? <span style={styles.subdued}>No financial entries loaded.</span> : <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720, fontSize: 12 }}><thead><tr>{['Entry', 'Event', 'Debit account', 'Credit account', 'Amount', 'Reference'].map(h => <th key={h} style={{ textAlign: 'left', color: '#748178', borderBottom: '1px solid #e8ece9', padding: '8px 7px', fontWeight: 750 }}>{h}</th>)}</tr></thead><tbody>{visibleEntries.map((entry, i) => <tr key={entry.id ?? `${entry.reference || 'entry'}-${i}`}>{[entry.id || '—', entry.event || '—', entry.debit_account || '—', entry.credit_account || '—', amount(entry.amount), entry.reference || '—'].map((value, j) => <td key={j} style={{ borderBottom: '1px solid #eff2ef', padding: '9px 7px', color: '#45564d' }}>{value}</td>)}</tr>)}</tbody></table></div>}
    </section>
  </div>;
}

function tagStyle(background, color) {
  return { display: 'inline-flex', alignItems: 'center', borderRadius: 30, padding: '3px 8px', background, color, fontSize: 10, fontWeight: 750, textTransform: 'capitalize' };
}

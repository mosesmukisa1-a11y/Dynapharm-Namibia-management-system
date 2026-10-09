import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, PackageCheck, RefreshCw, RotateCcw } from 'lucide-react';
import { api } from '../lib/api';

const panel = { border: '1px solid #eadadd', borderRadius: 14, background: '#fffdfd', padding: 18 };
const field = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1px solid #dfcdd1', borderRadius: 8, color: '#30282a', background: '#fff', font: 'inherit' };
const label = { display: 'block', marginBottom: 6, fontSize: '.74rem', fontWeight: 800, color: '#68565a', letterSpacing: '.04em', textTransform: 'uppercase' };
const button = { border: 0, borderRadius: 8, padding: '10px 15px', fontWeight: 800, cursor: 'pointer' };
const money = value => `N$ ${Number(value || 0).toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const displayMoney = value => value == null || value === '' ? 'Not recorded' : money(value);
const listOf = data => Array.isArray(data) ? data : data?.requests || [];

export function LinkedCustomerReturns({ branchId = '', userRole = '' }) {
  const canSubmitReturn = ['branch', 'branch_manager', 'branch_staff', 'branch_admin', 'frontdesk', 'front_desk', 'dispenser',
    'stock','stock_manager','admin','superadmin','super_admin','gm','general_manager'].includes(String(userRole).trim().toLowerCase());
  const [saleReference, setSaleReference] = useState('');
  const [allocations, setAllocations] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [physicalConfirmed, setPhysicalConfirmed] = useState(false);
  const [operationKey, setOperationKey] = useState('');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingCaps, setLoadingCaps] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = branchId ? { branch_id: branchId } : {};
      const qs = new URLSearchParams(params).toString();
      setRequests(listOf(await api.get(`/branch/refund-requests${qs ? `?${qs}` : ''}`)));
      setError('');
    } catch (e) {
      setError(e.message || 'Unable to load refund request history.');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  useEffect(() => {
    setAllocations([]);
    setSelectedId('');
    setQuantity('');
    setReason('');
    setPhysicalConfirmed(false);
    setOperationKey('');
    setError('');
    setNotice('');
  }, [branchId]);

  const loadAllocations = async (event) => {
    event?.preventDefault();
    setLoadingCaps(true);
    setError('');
    setNotice('');
    setSelectedId('');
    setQuantity('');
    setAllocations([]);
    try {
      const params = {};
      if (branchId) params.branch_id = branchId;
      if (saleReference.trim()) params.sale_reference = saleReference.trim();
      const qs = new URLSearchParams(params).toString();
      const data = await api.get(`/branch/refund-allocations${qs ? `?${qs}` : ''}`);
      setAllocations(data.allocations || []);
      if (!(data.allocations || []).length) setNotice('No refundable sale allocations were found for that reference.');
    } catch (e) {
      setError(e.message || 'Unable to find sale allocations.');
    } finally {
      setLoadingCaps(false);
    }
  };

  const selected = allocations.find(item => String(item.movement_id) === String(selectedId));
  const maxQuantity = Number(selected?.remaining_quantity || 0);

  const submitRequest = async (event) => {
    event.preventDefault();
    const qty = Number(quantity);
    if (!selected || !Number.isFinite(qty) || qty <= 0 || qty > maxQuantity || !reason.trim() || !physicalConfirmed) return;
    const stableOperationKey = operationKey || globalThis.crypto?.randomUUID?.() || `customer-return-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setOperationKey(stableOperationKey);
    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      await api.post('/branch/refund-requests', {
        allocation_id: selected.movement_id,
        quantity: qty,
        reason: reason.trim(),
        physical_return_confirmed: true,
        operation_key: stableOperationKey,
      });
      setNotice('Linked return submitted. The sale allocation cap and request history have been refreshed.');
      setReason('');
      setQuantity('');
      setPhysicalConfirmed(false);
      setOperationKey('');
      await Promise.all([loadAllocations(), loadHistory()]);
    } catch (e) {
      setError(e.message || 'Unable to submit refund request.');
    } finally {
      setSubmitting(false);
    }
  };

  const refreshCaps = async () => {
    const params = {};
    if (branchId) params.branch_id = branchId;
    if (saleReference.trim()) params.sale_reference = saleReference.trim();
    setLoadingCaps(true);
    try {
      const qs = new URLSearchParams(params).toString();
      const data = await api.get(`/branch/refund-allocations${qs ? `?${qs}` : ''}`);
      setAllocations(data.allocations || []);
      if (selectedId && !(data.allocations || []).some(item => String(item.movement_id) === String(selectedId))) {
        setSelectedId('');
        setQuantity('');
      }
    } catch (e) {
      setError(e.message || 'Unable to refresh allocation limits.');
    } finally { setLoadingCaps(false); }
  };

  return (
    <section style={{ display: 'grid', gap: 16 }}>
      <header style={{ background: 'linear-gradient(120deg,#8b102b,#bd2947)', color: '#fff', borderRadius: 14, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <RotateCcw size={20} />
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900 }}>Linked customer returns</h2>
        </div>
        <p style={{ margin: '7px 0 0', opacity: .86, fontSize: '.84rem', lineHeight: 1.5 }}>
          Select an original sale allocation. Refund value is derived from its saved sale snapshot; quantities cannot exceed the unreturned balance.
        </p>
      </header>
      {error && <div role="alert" style={{ padding: 12, borderRadius: 9, color: '#92233a', background: '#fff0f2', border: '1px solid #f2c3cc' }}>{error}</div>}
      {notice && <div role="status" style={{ padding: 12, borderRadius: 9, color: '#235e49', background: '#edf8f1', border: '1px solid #c2e6d2' }}>{notice}</div>}
      <div style={panel}>
        <form onSubmit={loadAllocations} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) auto', alignItems: 'end', gap: 10 }}>
          <div>
            <label style={label} htmlFor="linked-sale-ref">Original sale reference</label>
            <input id="linked-sale-ref" style={field} value={saleReference} onChange={e => {
              setSaleReference(e.target.value);
              setAllocations([]);
              setSelectedId('');
              setQuantity('');
              setReason('');
              setPhysicalConfirmed(false);
              setOperationKey('');
              setNotice('');
              setError('');
            }} placeholder="Receipt or sale reference" disabled={!!operationKey || loadingCaps} />
          </div>
          <button disabled={loadingCaps || !!operationKey} type="submit" style={{ ...button, background: '#8b102b', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 8, opacity: loadingCaps ? .65 : 1 }}>
            <RefreshCw size={15} /> {loadingCaps ? 'Finding sale…' : 'Find sale'}
          </button>
        </form>
        {allocations.length > 0 && canSubmitReturn && (
          <form onSubmit={submitRequest} style={{ marginTop: 18, display: 'grid', gap: 14 }}>
            <div>
              <label style={label} htmlFor="refund-allocation">Sale line / batch allocation</label>
              <select id="refund-allocation" style={field} value={selectedId} onChange={e => { setSelectedId(e.target.value); setQuantity(''); }} required disabled={!!operationKey}>
                <option value="">Choose the exact sale allocation</option>
                {allocations.map(a => <option key={a.movement_id} value={a.movement_id}>
                  {a.product_name} · batch {a.batch_no || 'not recorded'} · expiry {a.expiry_date || '—'} · remaining {a.remaining_quantity}
                </option>)}
              </select>
            </div>
            {selected && (
              <div style={{ padding: 14, borderRadius: 10, background: '#fbf5f6', border: '1px solid #eadadd' }}>
                <div style={{ fontWeight: 850, color: '#38272c' }}>{selected.product_name}</div>
                <div style={{ marginTop: 4, fontSize: '.8rem', color: '#706267' }}>Receipt {selected.sale_reference} · Batch {selected.batch_no || '—'} · Expiry {selected.expiry_date || '—'}</div>
                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8 }}>
                  {[['Sale revenue / unit', selected.snapshot?.revenue_unit], ['Cost / unit', selected.snapshot?.unit_cost], ['DP / unit', selected.snapshot?.unit_dp]].map(([caption, value]) =>
                    <div key={caption} style={{ padding: '9px 10px', background: '#fff', borderRadius: 8, border: '1px solid #eee2e4' }}>
                      <div style={{ fontSize: '.67rem', color: '#88777b', textTransform: 'uppercase', fontWeight: 800 }}>{caption}</div>
                      <div style={{ marginTop: 3, fontWeight: 850, color: '#8b102b' }}>{displayMoney(value)}</div>
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 10, fontSize: '.78rem', color: '#745e64' }}>Available to request: <strong>{selected.remaining_quantity}</strong> of {selected.quantity}</div>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,180px) 1fr', gap: 12 }}>
              <div>
                <label style={label} htmlFor="return-quantity">Return quantity</label>
                <input id="return-quantity" style={field} type="number" min="1" max={maxQuantity} step="1" value={quantity} onChange={e => setQuantity(e.target.value)} required disabled={!selected || !!operationKey} />
                {selected && <small style={{ color: '#786a6d' }}>Cap: {maxQuantity}</small>}
              </div>
              <div>
                <label style={label} htmlFor="return-reason">Reason for return</label>
                <textarea id="return-reason" style={{ ...field, resize: 'vertical' }} rows="2" value={reason} onChange={e => setReason(e.target.value)} required placeholder="Describe why the customer is returning the item" disabled={!!operationKey} />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: '.83rem', color: '#4c3d41', lineHeight: 1.45 }}>
              <input type="checkbox" checked={physicalConfirmed} onChange={e => setPhysicalConfirmed(e.target.checked)} disabled={!!operationKey} />
              I confirm the returned goods are physically in branch custody and match this sale allocation.
            </label>
            <button type="submit" disabled={submitting || !selected || !physicalConfirmed || !reason.trim() || Number(quantity) <= 0 || Number(quantity) > maxQuantity}
              style={{ ...button, background: '#8b102b', color: '#fff', justifySelf: 'start', opacity: submitting ? .65 : 1 }}>
              {submitting ? 'Submitting…' : operationKey ? 'Retry same linked return' : 'Submit linked return'}
            </button>
            {operationKey && !submitting && <button type="button" onClick={() => { setOperationKey(''); setSelectedId(''); setQuantity(''); setReason(''); setPhysicalConfirmed(false); setNotice('Starting a new return operation. Refreshing available sale quantities.'); refreshCaps(); }} style={{ ...button, background: '#f7edef', color: '#8b102b', justifySelf: 'start' }}>Start a new operation</button>}
          </form>
        )}
        {allocations.length > 0 && !canSubmitReturn && <div style={{ marginTop: 16, padding: 12, borderRadius: 9, background: '#f7edef', color: '#72575e', fontSize: '.82rem' }}>Your account can view the sale allocations but is not in the authorized branch-return role group.</div>}
      </div>
      <div style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: '.96rem', color: '#38272c' }}>Request history</h3>
          <button type="button" onClick={loadHistory} disabled={loading} style={{ ...button, background: '#f7edef', color: '#8b102b', padding: '8px 11px' }}>{loading ? 'Refreshing…' : 'Refresh history'}</button>
        </div>
        {loading && requests.length === 0 ? <div style={{ marginTop: 16, color: '#85777a' }}>Loading refund history…</div> :
          requests.length === 0 ? <div style={{ marginTop: 16, padding: 18, textAlign: 'center', background: '#fbf5f6', color: '#7e7073', borderRadius: 10 }}>No customer return requests have been recorded.</div> :
          <div style={{ marginTop: 12, display: 'grid', gap: 9 }}>
            {requests.map((request, index) => {
              const originalAllocation = request.allocation_id || request.movement_id || request.sale_allocation_id;
              const saleUnitPrice = request.unit_price ?? request.revenue_unit ?? request.snapshot?.revenue_unit ?? request.sale_snapshot?.revenue_unit;
              return <div key={request.id || index} style={{ padding: 12, borderRadius: 9, border: '1px solid #eee2e4', display: 'grid', gridTemplateColumns: 'minmax(170px,1fr) auto', gap: 8 }}>
              <div><strong>{request.product_name || 'Product'}</strong><div style={{ color: '#796b6e', fontSize: '.78rem', marginTop: 3 }}>Sale {request.sale_reference || 'legacy / unlinked'} · Allocation {originalAllocation || 'not linked'} · Batch {request.batch_no || '—'} · Qty {request.quantity}</div>
                {saleUnitPrice != null && <div style={{ color: '#796b6e', fontSize: '.78rem', marginTop: 3 }}>Original selling price / unit: <strong>{money(saleUnitPrice)}</strong></div>}
                <div style={{ color: '#796b6e', fontSize: '.78rem', marginTop: 3 }}>{request.reason || '—'}</div></div>
              <span style={{ alignSelf: 'start', padding: '4px 9px', borderRadius: 30, background: request.status === 'approved' ? '#eaf7ee' : request.status === 'rejected' ? '#fff0f1' : '#fff5df', color: request.status === 'approved' ? '#26734a' : request.status === 'rejected' ? '#a12d3f' : '#916411', fontSize: '.72rem', fontWeight: 850 }}>{request.status || 'pending'}</span>
            </div>;
            })}
          </div>}
      </div>
    </section>
  );
}

export function CustomerReturnInspection({ condition, onConditionChange, inspectionReason, onInspectionReasonChange, confirmed, onConfirmedChange }) {
  return <div style={{ display: 'grid', gap: 9, marginTop: 8 }}>
    <label style={label}>Physical receipt &amp; inspection</label>
    <select aria-label="Returned item condition" style={field} value={condition} onChange={e => onConditionChange(e.target.value)}>
      <option value="saleable">Saleable</option><option value="damaged">Damaged</option><option value="expired">Expired</option><option value="quarantine">Quarantine — pending inspection</option>
    </select>
    <textarea aria-label="Inspection reason" style={{ ...field, resize: 'vertical' }} rows="2" value={inspectionReason} onChange={e => onInspectionReasonChange(e.target.value)} placeholder="Inspection notes are required before approval" />
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '.77rem', color: '#504549', lineHeight: 1.4 }}>
      <input type="checkbox" checked={confirmed} onChange={e => onConfirmedChange(e.target.checked)} />
      I physically received and inspected these goods in stock custody.
    </label>
  </div>;
}

export function DispatchReturnsTab() {
  const [transferId, setTransferId] = useState('');
  const [transferOptions, setTransferOptions] = useState([]);
  const [transferListLoading, setTransferListLoading] = useState(true);
  const [transferListError, setTransferListError] = useState('');
  const [data, setData] = useState(null);
  const [allocationId, setAllocationId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [reservationReason, setReservationReason] = useState('');
  const [condition, setCondition] = useState('saleable');
  const [confirmed, setConfirmed] = useState(false);
  const [operationKey, setOperationKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const resetLoadedTransfer = () => {
    setData(null);
    setAllocationId('');
    setQuantity('');
    setReason('');
    setReservationReason('');
    setConfirmed(false);
    setOperationKey('');
    setError('');
    setSuccess('');
  };

  const handleTransferChange = value => {
    resetLoadedTransfer();
    setTransferId(value);
  };

  const loadTransfers = async () => {
    setTransferListLoading(true);
    setTransferListError('');
    try {
      const response = await api.stock.transfers();
      const rows = Array.isArray(response) ? response : response?.transfers || response?.data?.transfers || response?.data || [];
      setTransferOptions(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setTransferListError(e.message || 'Could not load the dispatch lookup list.');
    } finally { setTransferListLoading(false); }
  };

  useEffect(() => { loadTransfers(); }, []);

  const load = async (event, { preserveSuccess = false } = {}) => {
    event?.preventDefault();
    if (!transferId.trim()) return;
    setLoading(true); setError('');
    if (!preserveSuccess) setSuccess('');
    try {
      const response = await api.get(`/stock/dispatch-returns?transfer_id=${encodeURIComponent(transferId.trim())}`);
      setData(response);
      setAllocationId('');
      setQuantity('');
    } catch (e) { setError(e.message || 'Could not load dispatch return allocations.'); }
    finally { setLoading(false); }
  };

  const allocation = data?.allocations?.find(a => String(a.id) === String(allocationId));
  const maxQuantity = Number(allocation?.remaining_quantity || 0);
  const transferStatus = String(data?.transfer?.status || '').toLowerCase();
  const isApprovedReservation = transferStatus === 'approved';
  const isCancelledReservation = ['cancelled', 'canceled'].includes(transferStatus);

  const cancelReservation = async event => {
    event.preventDefault();
    if (!reservationReason.trim() || !data?.transfer || submitting) return;
    setSubmitting(true); setError(''); setSuccess('');
    try {
      await api.post('/stock/dispatch-returns', {
        action: 'cancel_reservation',
        transfer_id: data.transfer.id || transferId.trim(),
        reason: reservationReason.trim(),
      });
      setSuccess('Approved reservation cancelled. Its reservation was released; no physical stock return was recorded.');
      setReservationReason('');
      setData(previous => previous ? { ...previous, transfer: { ...previous.transfer, status: 'cancelled' }, allocations: [] } : previous);
      await load(undefined, { preserveSuccess: true });
    } catch (e) {
      setError(e.message || 'Could not cancel the approved reservation.');
    } finally { setSubmitting(false); }
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!allocation || !reason.trim() || !confirmed || Number(quantity) <= 0 || Number(quantity) > maxQuantity) return;
    const key = operationKey || (globalThis.crypto?.randomUUID?.() || `dispatch-return-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    setOperationKey(key);
    setSubmitting(true); setError(''); setSuccess('');
    try {
      await api.post('/stock/dispatch-returns', {
        transfer_id: transferId.trim(), allocation_id: allocation.id, quantity: Number(quantity),
        reason: reason.trim(), return_condition: condition, physical_return_confirmed: true, operation_key: key,
      });
      setSuccess('Transit return recorded. Returned quantity caps and history were refreshed.');
      setOperationKey('');
      setQuantity(''); setReason(''); setConfirmed(false);
      await load(undefined, { preserveSuccess: true });
    } catch (e) { setError(e.message || 'Could not record transit return. Retry will reuse the same operation key.'); }
    finally { setSubmitting(false); }
  };

  return <section style={{ display: 'grid', gap: 14 }}>
    <header style={{ background: 'linear-gradient(120deg,#263b47,#455f67)', color: '#fff', borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><PackageCheck size={20} /><h2 style={{ margin: 0, fontSize: '1.05rem' }}>Dispatch returns to source</h2></div>
      <p style={{ margin: '7px 0 0', opacity: .85, fontSize: '.83rem' }}>Record only goods physically returned while still in transit. The return cap excludes quantities already received by a branch.</p>
    </header>
    <div style={{ padding: 13, borderRadius: 10, background: '#fff7e8', border: '1px solid #f0d49d', color: '#735313', fontSize: '.8rem', lineHeight: 1.55 }}>
      <strong style={{ display: 'flex', gap: 7, alignItems: 'center' }}><AlertTriangle size={16} /> Custody rules</strong>
      <div>Goods still with a customer or branch cannot be restored through transit cancellation.</div>
      <div>Goods already received need a separately approved branch-to-source transfer.</div>
      <div>Unknown legacy allocations require reviewed correction; do not guess an allocation.</div>
    </div>
    {error && <div role="alert" style={{ padding: 11, borderRadius: 8, background: '#fff0f2', color: '#92233a' }}>{error}</div>}
    {success && <div role="status" style={{ padding: 11, borderRadius: 8, background: '#edf8f1', color: '#235e49' }}>{success}</div>}
    <div style={panel}>
      <form onSubmit={load} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) auto', alignItems: 'end', gap: 10 }}>
        <div>
          <label style={label} htmlFor="dispatch-transfer-choice">Find a dispatch</label>
          <select id="dispatch-transfer-choice" style={field} value={transferId} onChange={e => handleTransferChange(e.target.value)} disabled={!!data || loading}>
            <option value="">{transferListLoading ? 'Loading transfers…' : 'Choose a transfer'}</option>
            {transferOptions.map((transfer, index) => {
              const id = transfer.id ?? transfer.transfer_id ?? transfer.reference ?? transfer.transfer_number;
              if (id == null) return null;
              const ref = transfer.transfer_number || transfer.transfer_no || transfer.reference || id;
              const from = transfer.source_location || transfer.from_location || transfer.source_branch || transfer.from_branch || '';
              const to = transfer.destination_location || transfer.to_location || transfer.destination_branch || transfer.to_branch || '';
              return <option key={id || index} value={id}>{ref}{from || to ? ` · ${from || 'Source'} → ${to || 'Destination'}` : ''} · ${transfer.status || 'status unknown'}</option>;
            })}
          </select>
          {!transferListLoading && !transferListError && transferOptions.length === 0 && <div style={{ marginTop: 6, color: '#786a6d', fontSize: '.76rem' }}>No transfer records returned. You can enter a transfer reference or ID below.</div>}
          {transferListError && <div role="alert" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 7, color: '#92233a', fontSize: '.76rem' }}>{transferListError}<button type="button" onClick={loadTransfers} style={{ ...button, padding: '5px 9px', background: '#fff0f2', color: '#92233a' }}>Retry list</button></div>}
        </div>
        <button type="submit" style={{ ...button, background: '#314b55', color: '#fff' }} disabled={loading || !!data || !!operationKey}>{loading ? 'Loading…' : 'Load transfer'}</button>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={label} htmlFor="dispatch-transfer-id">Or enter transfer reference / ID</label>
          <input id="dispatch-transfer-id" style={field} value={transferId} onChange={e => handleTransferChange(e.target.value)} required placeholder="Search by visible reference or enter transfer ID" disabled={!!data || loading} />
        </div>
        {data && <button type="button" onClick={() => { resetLoadedTransfer(); setTransferId(''); }} disabled={submitting || !!operationKey} style={{ ...button, gridColumn: '1 / -1', justifySelf: 'start', background: '#f1eeee', color: '#5f5054' }}>Change transfer</button>}
      </form>
      {data && <div style={{ marginTop: 15 }}>
        <div style={{ paddingBottom: 12, borderBottom: '1px solid #eee2e4', marginBottom: 12, color: '#58484c', fontSize: '.83rem' }}>
          Transfer <strong>{data.transfer?.id || transferId}</strong> · {data.transfer?.status || 'Status not provided'} · {data.transfer?.source_location || data.transfer?.from_location || 'Source not specified'}
        </div>
        {isApprovedReservation ? <div style={{ padding: 14, background: '#f1f6f7', border: '1px solid #cfdee1', borderRadius: 10 }}>
          <strong style={{ display: 'block', color: '#314b55', marginBottom: 5 }}>Approved reservation — goods have not left stock custody</strong>
          <p style={{ margin: '0 0 12px', color: '#5d6b6e', fontSize: '.81rem', lineHeight: 1.5 }}>Cancel this reservation to release reserved quantities. This action does not record a physical return and does not require a physical-custody confirmation.</p>
          <form onSubmit={cancelReservation} style={{ display: 'grid', gap: 10 }}>
            <div><label style={label} htmlFor="reservation-cancel-reason">Cancellation reason</label><textarea id="reservation-cancel-reason" style={{ ...field, resize: 'vertical' }} rows="2" value={reservationReason} onChange={e => setReservationReason(e.target.value)} required placeholder="Explain why this approved dispatch reservation should be released" /></div>
            <button type="submit" disabled={submitting || !reservationReason.trim()} style={{ ...button, justifySelf: 'start', background: '#314b55', color: '#fff', opacity: submitting ? .65 : 1 }}>{submitting ? 'Cancelling reservation…' : 'Cancel approved reservation'}</button>
          </form>
        </div> : isCancelledReservation ? <div style={{ color: '#776a6d', padding: 12 }}>This reservation is cancelled. No transit goods are available to return.</div> : (data.allocations || []).length === 0 ? <div style={{ color: '#776a6d', padding: 12 }}>No returnable transit allocations. Received quantities are not eligible here.</div> :
          <form onSubmit={submit} style={{ display: 'grid', gap: 13 }}>
            <div><label style={label} htmlFor="dispatch-allocation">Transit allocation</label><select id="dispatch-allocation" style={field} value={allocationId} onChange={e => { setAllocationId(e.target.value); setQuantity(''); }} required disabled={!!operationKey}>
              <option value="">Select product and batch</option>{(data.allocations || []).map(a => <option key={a.id} value={a.id}>{a.product_name} · {a.batch_no || 'batch unknown'} · expiry {a.expiry_date || '—'} · remaining in transit {a.remaining_quantity}</option>)}
            </select></div>
            {allocation && <div style={{ padding: 12, background: '#f7f5f3', borderRadius: 9, fontSize: '.8rem', color: '#5f5553' }}>Source {allocation.source_type || '—'} / {allocation.source_id || '—'} · {allocation.quantity} dispatched · {allocation.remaining_quantity} eligible for return</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px,180px) minmax(160px,1fr)', gap: 12 }}>
              <div><label style={label} htmlFor="dispatch-return-qty">Actual quantity returned</label><input id="dispatch-return-qty" style={field} type="number" min="1" max={maxQuantity} step="1" value={quantity} onChange={e => setQuantity(e.target.value)} required disabled={!allocation || !!operationKey} /></div>
              <div><label style={label} htmlFor="dispatch-condition">Return condition</label><select id="dispatch-condition" style={field} value={condition} onChange={e => setCondition(e.target.value)} disabled={!!operationKey}><option value="saleable">Saleable</option><option value="damaged">Damaged</option><option value="expired">Expired</option><option value="quarantine">Quarantine</option></select></div>
            </div>
            <div><label style={label} htmlFor="dispatch-return-reason">Reason</label><textarea id="dispatch-return-reason" style={{ ...field, resize: 'vertical' }} rows="2" value={reason} onChange={e => setReason(e.target.value)} required placeholder="Explain why the physical goods returned to source" disabled={!!operationKey} /></div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '.8rem', color: '#504549' }}><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={!!operationKey} />I confirm these quantities physically returned to the source location from this transfer.</label>
            <button type="submit" disabled={submitting || !confirmed || !allocation || !reason.trim() || Number(quantity) <= 0 || Number(quantity) > maxQuantity} style={{ ...button, justifySelf: 'start', background: '#314b55', color: '#fff', opacity: submitting ? .65 : 1 }}>{submitting ? 'Recording…' : 'Record goods returned'}</button>
            {operationKey && !submitting && <button type="button" onClick={() => { setOperationKey(''); setAllocationId(''); setQuantity(''); setReason(''); setConfirmed(false); setSuccess('Refreshing caps before beginning a new operation.'); load(); }} style={{ ...button, justifySelf: 'start', background: '#f5eeee', color: '#6f2939' }}>Start a new operation</button>}
          </form>}
        <h3 style={{ margin: '18px 0 8px', fontSize: '.9rem', color: '#38272c' }}>Recorded transit returns</h3>
        {(data.returns || []).length ? (data.returns || []).map((item, i) => <div key={item.id || i} style={{ padding: '9px 0', borderTop: '1px solid #eee2e4', fontSize: '.8rem' }}>{item.product_name || 'Returned goods'} · qty {item.quantity} · {item.return_condition || 'condition not recorded'} · {item.reason || '—'}</div>) : <div style={{ color: '#827578', fontSize: '.8rem' }}>No returns recorded for this dispatch.</div>}
      </div>}
    </div>
  </section>;
}

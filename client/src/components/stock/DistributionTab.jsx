import { useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Package, Plus, Search, ShoppingCart, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';
import DispatchNote from '../DispatchNote';
import useDistributionData from './useDistributionData';
import DistributionHistory from './DistributionHistory';
import { Overlay, Pagination, Skeleton } from './DistributionPrimitives';
import { availableOf, validateDraft } from './distributionModel';
import './stock-portal.css';

/**
 * AdjustmentModal is the existing RequestAdjustmentModal, injected by StockPortal.
 * Its original GM-gated correction workflow is preserved, not recreated.
 */
export default function DistributionTab({ AdjustmentModal, onRequestAdjustment }) {
  const { user } = useAuth();
  const data = useDistributionData();
  const [destination, setDestination] = useState('');
  const [cart, setCart] = useState([]);
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [quantities, setQuantities] = useState({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [submitError, setSubmitError] = useState('');
  const [adjustment, setAdjustment] = useState(null);
  const [dispatchNote, setDispatchNote] = useState(null);
  const [historyRevision, setHistoryRevision] = useState(0);
  const submitLock = useRef(false);
  const operation = useRef(null);
  const productsById = useMemo(() => new Map(data.products.map(product => [String(product.id), product])), [data.products]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.products.filter(product => [product.name, product.sku, product.catalogueCode, product.barcode, product.id].some(value => String(value ?? '').toLowerCase().includes(query)));
  }, [data.products, search]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 12)));
  const visible = filtered.slice((currentPage - 1) * 12, currentPage * 12);
  const totalUnits = cart.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const selectedWarehouse = data.warehouses.find(warehouse => String(warehouse.id) === String(destination));
  const validation = validateDraft(destination, data.warehouses, cart, data.products);
  const blocked = submitting || data.catalogLoading || !!data.catalogError;
  const adjustQuantity = (id, value) => {
    setMessage(null);
    setCart(previous => previous.map(line => String(line.productId) === String(id) ? { ...line, quantity: value } : line));
  };
  const addProduct = (product, quantity) => {
    setCart(previous => {
      const existing = previous.find(line => String(line.productId) === String(product.id));
      const next = Number(existing?.quantity ?? 0) + Number(quantity);
      if (!Number.isSafeInteger(next) || next <= 0 || next > availableOf(product)) return previous;
      return existing ? previous.map(line => String(line.productId) === String(product.id) ? { ...line, quantity: next } : line) : [...previous, { productId: product.id, productName: product.name, sku: product.sku, quantity: Number(quantity) }];
    });
    setMessage(null);
    setQuantities(previous => ({ ...previous, [String(product.id)]: '1' }));
  };
  const clearDraft = () => {
    if (submitLock.current) return;
    if (cart.length && !window.confirm('Clear all selected products and the transfer note?')) return;
    setCart([]); setNote(''); setDestination(''); setQuantities({}); operation.current = null; setMessage(null); setSubmitError('');
  };
  const openReview = () => {
    setMessage(null);
    if (validation) { setMessage({ type: 'error', text: validation }); return; }
    setSubmitError('');
    setReviewOpen(true);
  };
  const submit = async () => {
    // Ref is acquired synchronously, before React state updates can permit another click.
    if (submitLock.current) return;
    submitLock.current = true;
    const error = validateDraft(destination, data.warehouses, cart, data.products);
    if (error || data.catalogError || data.catalogLoading) {
      setSubmitError(error || 'Refresh the catalog before submitting.');
      submitLock.current = false;
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const payload = {
        from_location: 'country_stock', to_location: destination, status: 'pending_approval',
        items: cart.map(line => ({ productId: line.productId, productName: productsById.get(String(line.productId))?.name || line.productName, quantity: Number(line.quantity) })),
        dispatchNotes: note.trim(),
        created_by: user?.fullName || user?.full_name || user?.username,
        preparedByRole: user?.role || null,
      };
      const signature = JSON.stringify(payload);
      if (!operation.current || operation.current.signature !== signature) {
        if (!window.crypto?.randomUUID) throw new Error('Secure operation keys are unavailable. Open the portal over HTTPS and retry.');
        operation.current = { signature, key: window.crypto.randomUUID() };
      }
      await api.stock.createTransfer({ ...payload, operation_key: operation.current.key });
      setReviewOpen(false);
      setMessage({ type: 'success', text: `Transfer submitted to ${selectedWarehouse?.name}. Awaiting GM approval; warehouse receipt follows approval.` });
      setCart([]); setDestination(''); setNote(''); setQuantities({});
      operation.current = null;
      data.refresh();
      setHistoryRevision(previous => previous + 1);
    } catch (error) {
      // Same payload retains the same key after timeout/network/server errors.
      setSubmitError(error.message || 'Transfer could not be submitted. Retry with the same draft.');
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };
  const requestAdjustment = onRequestAdjustment || (AdjustmentModal ? record => setAdjustment(record) : undefined);
  return <div className="distribution-page">
    <a className="sp-mobile-summary-link sp-btn" href="#distribution-summary">Transfer summary · {cart.length} products · {totalUnits} units</a>
    <div className="sp-workflow" aria-label="Transfer workflow">
      <div className="sp-workflow-step"><span className="sp-step-number">1</span>Create · GM approval</div><ArrowRight size={14} aria-hidden="true" />
      <div className="sp-workflow-step"><span className="sp-step-number">2</span>Awaiting warehouse receipt</div><ArrowRight size={14} aria-hidden="true" />
      <div className="sp-workflow-step"><span className="sp-step-number">3</span>Received</div>
    </div>
    <p className="sp-help"><strong>GM approval required.</strong> This request starts in pending approval. Stock is reserved only when the GM approves; warehouse receipt consumes those saved allocations, not a second country-stock deduction. After receipt, warehouse-to-branch dispatch is a separate process with its own approval and branch receipt.</p>
    {message && <div role={message.type === 'error' ? 'alert' : 'status'} className={`sp-alert sp-alert-${message.type}`}>{message.text}</div>}
    <div className="sp-columns">
      <section className="sp-panel" aria-labelledby="distribution-catalog-heading">
        <div className="sp-panel-head"><div><h2 id="distribution-catalog-heading">Choose products</h2><p>Source: Country Stock · National inventory</p></div><span className="sp-code">{data.catalogLoading ? 'Loading catalog' : `${data.products.length} catalog products`}</span></div>
        <div className="sp-panel-content sp-field-stack">
          <label className="sp-label" htmlFor="distribution-destination">Destination warehouse<select id="distribution-destination" className="sp-input" value={destination} disabled={blocked} required onChange={event => { setDestination(event.target.value); setMessage(null); }}><option value="">Select a warehouse</option>{data.warehouses.map(warehouse => <option value={warehouse.id} key={warehouse.id}>{warehouse.name}</option>)}</select></label>
          <label className="sp-label" htmlFor="distribution-search">Search the full catalog<div className="sp-search"><Search size={16} /><input id="distribution-search" type="search" className="sp-input" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Product name, SKU or barcode" /></div></label>
          {data.catalogError && <div role="alert" className="sp-alert sp-alert-error">{data.catalogError}<button type="button" className="sp-btn" onClick={data.refreshCatalog}>Retry catalog</button></div>}
        </div>
        {data.catalogLoading ? <Skeleton label="Loading product catalog" /> : !data.catalogError && (visible.length ? <>
          <div className="sp-table-wrap"><table className="sp-table"><caption className="sr-only">All catalog products, quantities available from country stock</caption><thead><tr>{['Product', 'SKU', 'Available', 'Unit', 'Quantity', 'Add'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{visible.map(product => {
            const id = String(product.id);
            const selected = cart.find(line => String(line.productId) === id);
            const selectedQuantity = Number(selected?.quantity ?? 0);
            const remaining = Math.max(0, availableOf(product) - (Number.isFinite(selectedQuantity) ? selectedQuantity : 0));
            const quantity = quantities[id] ?? '1';
            const validQuantity = Number.isSafeInteger(Number(quantity)) && Number(quantity) > 0 && Number(quantity) <= remaining;
            const reason = product.unavailableReason || (!product.id ? 'Product ID missing' : availableOf(product) <= 0 ? 'No country stock available' : remaining <= 0 ? 'All available units selected' : '');
            return <tr key={id}>
              <td className="sp-product">{product.name}<small>{selected && <span>{selected.quantity || 0} selected · </span>}{reason || `ID: ${id}`}</small></td><td className="sp-code">{product.sku || 'Not recorded'}{product.catalogueCode && product.catalogueCode !== product.sku && <small style={{ display: 'block' }}>{product.catalogueCode}</small>}</td>
              <td>{availableOf(product).toLocaleString()}</td><td>{product.unit || 'units'}</td>
              <td><input type="number" className="sp-input sp-quantity" min="1" max={remaining} step="1" inputMode="numeric" aria-label={`Quantity to add for ${product.name}, SKU ${product.sku || id}`} aria-invalid={!reason && !validQuantity} value={quantity} disabled={blocked || !!reason} onChange={event => setQuantities(previous => ({ ...previous, [id]: event.target.value }))} />{!reason && !validQuantity && <span className="sp-validation">1–{remaining} whole units</span>}</td>
              <td><button type="button" className="sp-btn" disabled={blocked || !!reason || !validQuantity} title={reason || 'Add selected quantity'} aria-label={`Add ${product.name}, SKU ${product.sku || id}`} onClick={() => addProduct(product, quantity)}><Plus size={14} />Add</button></td>
            </tr>;
          })}</tbody></table></div>
          <Pagination page={currentPage} pageSize={12} total={filtered.length} onChange={setPage} label="products" />
        </> : <div className="sp-empty"><Package size={32} /><strong>{search ? 'No matching products' : 'The catalog is empty'}</strong><p>{search ? 'Search another name, SKU or barcode. No products are hidden by a 100-item limit.' : 'Refresh the catalog or ask an administrator to check product configuration.'}</p><button type="button" className="sp-btn" style={{ marginTop: 14 }} onClick={search ? () => { setSearch(''); setPage(1); } : data.refreshCatalog}>{search ? 'Clear search' : 'Refresh catalog'}</button></div>)}
      </section>
      <aside id="distribution-summary" className="sp-panel sp-summary" aria-labelledby="distribution-summary-heading">
        <div className="sp-panel-head"><div><h2 id="distribution-summary-heading">Transfer summary</h2><p>{selectedWarehouse ? selectedWarehouse.name : 'Choose a destination to begin'}</p></div><ShoppingCart size={19} /></div>
        <div className="sp-panel-content">
          {!cart.length ? <div className="sp-empty" style={{ padding: '20px 0 26px' }}><Package size={30} /><strong>No products selected</strong><p>Add products from the catalog. Your quantities and note will appear here.</p></div> : cart.map(line => {
            const product = productsById.get(String(line.productId));
            const invalid = !product || !Number.isSafeInteger(Number(line.quantity)) || Number(line.quantity) <= 0 || Number(line.quantity) > availableOf(product) || !!product.unavailableReason;
            return <div className="sp-cart-line" key={line.productId}><div className="sp-cart-top"><div className="sp-product">{product?.name || line.productName}<small>SKU {product?.sku || line.sku || 'not recorded'} · ID {line.productId}</small></div><button type="button" className="sp-btn sp-btn-icon sp-btn-danger" disabled={submitting} aria-label={`Remove ${line.productName}`} title="Remove product" onClick={() => { setCart(previous => previous.filter(item => String(item.productId) !== String(line.productId))); setMessage(null); }}><Trash2 size={14} /></button></div>
              <div className="sp-cart-controls"><label className="sp-label">Quantity<input className="sp-input sp-quantity" type="number" min="1" max={availableOf(product)} step="1" value={line.quantity} disabled={submitting} aria-label={`Selected quantity for ${line.productName}, ID ${line.productId}`} aria-invalid={invalid} onChange={event => adjustQuantity(line.productId, event.target.value)} /></label><small>{availableOf(product)} available</small></div>
              {invalid && <span className="sp-validation">{product?.unavailableReason || `Enter 1–${availableOf(product)} whole units.`}</span>}
            </div>;
          })}
          <div className="sp-totals"><span><strong>{cart.length}</strong> product lines</span><span><strong>{totalUnits.toLocaleString()}</strong> total units</span></div>
          <label className="sp-label" htmlFor="distribution-note">Transfer note <span style={{ fontWeight: 400 }}>Optional · visible to the GM and warehouse</span><textarea id="distribution-note" className="sp-input" rows={3} maxLength={4000} placeholder="Delivery instructions or reason for transfer" value={note} disabled={submitting} onChange={event => { setNote(event.target.value); setMessage(null); }} /></label>
          <button type="button" className="sp-btn sp-btn-primary sp-btn-block" style={{ marginTop: 18 }} onClick={openReview} disabled={blocked || !!validation}>Review transfer<ArrowRight size={16} /></button>
          {cart.length > 0 && validation && <p className="sp-validation" role="status">{validation}</p>}
          <p className="sp-help" style={{ textAlign: 'center', marginBottom: 10 }}>No stock moves before GM approval.</p>
          <button type="button" className="sp-btn sp-btn-block" disabled={submitting || (!cart.length && !note && !destination)} onClick={clearDraft}>Clear draft</button>
        </div>
      </aside>
    </div>
    <DistributionHistory warehouses={data.warehouses} revision={historyRevision} onPrint={setDispatchNote} onRequestAdjustment={requestAdjustment} />
    {reviewOpen && <Overlay title="Review transfer" onClose={() => setReviewOpen(false)} busy={submitting} footer={<><button type="button" className="sp-btn" disabled={submitting} onClick={() => setReviewOpen(false)}>Back to draft</button><button type="button" className="sp-btn sp-btn-primary" disabled={blocked || !!validation} onClick={submit}><Check size={16} />{submitting ? 'Submitting request…' : 'Submit for GM approval'}</button></>}>
      <div className="sp-panel-content">
        <div className="sp-review-route"><div><small>Source</small><strong>Country Stock</strong></div><ArrowRight size={18} /><div><small>Destination</small><strong>{selectedWarehouse?.name}</strong></div></div>
        <div className="sp-alert">GM approval is required. Approval reserves country stock; the destination warehouse must then confirm receipt. This submission does not mark stock as received.</div>
        {submitError && <div role="alert" className="sp-alert sp-alert-error">{submitError}<p style={{ marginBottom: 0 }}>Retry retains the operation key for this unchanged draft.</p></div>}
        {validation && <div role="alert" className="sp-alert sp-alert-error">{validation}</div>}
        <div className="sp-table-wrap"><table className="sp-table"><thead><tr><th scope="col">Product / SKU</th><th scope="col">Quantity</th></tr></thead><tbody>{cart.map(line => <tr key={line.productId}><td className="sp-product">{line.productName}<small>{line.sku || 'SKU not recorded'} · ID {line.productId}</small></td><td>{line.quantity}</td></tr>)}</tbody></table></div>
        <div className="sp-totals"><span>{cart.length} product lines</span><strong>{totalUnits.toLocaleString()} units</strong></div>
        <h3 className="sp-product">Transfer note</h3><p className="sp-note">{note.trim() || 'No note provided.'}</p>
        <p className="sp-help" style={{ marginBottom: 0 }}>Prepared by {user?.fullName || user?.full_name || user?.username || 'signed-in staff'}. Availability is checked again on the server.</p>
      </div>
    </Overlay>}
    {dispatchNote && <DispatchNote transfer={dispatchNote} onClose={() => setDispatchNote(null)} />}
    {AdjustmentModal && <AdjustmentModal open={!!adjustment} onClose={() => setAdjustment(null)} record={adjustment} targetType="distribution" location={adjustment?.from_location || adjustment?.fromWarehouse || 'country_stock'} />}
  </div>;
}

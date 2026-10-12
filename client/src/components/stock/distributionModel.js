export const locationLabel = value => String(value || 'Not recorded').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
export const destinationOf = transfer => transfer.toBranch || transfer.to_location || '';
export const sourceOf = transfer => transfer.fromWarehouse || transfer.from_location || '';
export const createdOf = transfer => transfer.createdAt || transfer.created_at;
export const creatorOf = transfer => transfer.createdBy || transfer.created_by || 'Not recorded';
export const referenceOf = transfer => transfer.transfer_number || transfer.transferNumber || transfer.reference || transfer.id || 'Not recorded';
export const noteOf = transfer => transfer.dispatchNotes ?? transfer.dispatch_notes ?? '';
export const quantityOf = item => Number(item.remaining_quantity ?? item.quantity ?? 0);
export function linesOf(transfer) {
  if (Array.isArray(transfer.items) && transfer.items.length) return transfer.items;
  // Retain legacy single-product records without inventing lines for blank records.
  if (transfer.product_name || transfer.productName) return [{
    productId: transfer.product_id ?? transfer.productId,
    productName: transfer.product_name || transfer.productName,
    sku: transfer.sku, quantity: transfer.remaining_quantity ?? transfer.quantity ?? 0,
  }];
  return [];
}
export const totalOf = transfer => linesOf(transfer).reduce((sum, item) => sum + quantityOf(item), 0);
export const productCountOf = transfer => new Set(linesOf(transfer).map(item=>item.productId || item.product_id || item.productName || item.product_name)).size;
export const needsReview = transfer => transfer.status === 'received' && (!linesOf(transfer).length || totalOf(transfer) <= 0);
export function statusDisplay(status) {
  const labels = {
    pending_approval: ['Awaiting GM approval', ''],
    approved: ['Approved', 'info'],
    pending: ['Pending', ''], requested: ['Requested', ''],
    submitted: ['Submitted', 'info'], dispatched: ['Dispatched', 'info'],
    in_transit: ['In transit', 'info'], awaiting_receipt: ['Awaiting receipt', 'info'],
    received: ['Received', 'success'], rejected: ['Rejected', 'danger'],
    cancelled: ['Cancelled', 'danger'],
  };
  const [label, tone] = labels[status] || [status ? locationLabel(status) : 'Not recorded', ''];
  return { label, tone };
}
export function recordedEvents(transfer) {
  // Only actual stored timestamps/actors. Never infer an event from current status.
  return [
    ['Created', transfer.createdAt ?? transfer.created_at, transfer.createdBy ?? transfer.created_by],
    ['GM approved', transfer.approvedAt ?? transfer.approved_at, transfer.approvedBy ?? transfer.approved_by],
    ['Dispatched', transfer.dispatchedAt ?? transfer.dispatched_at, transfer.dispatchedBy ?? transfer.dispatched_by],
    ['Received', transfer.receivedAt ?? transfer.received_at, transfer.receivedBy ?? transfer.received_by],
    ['Rejected', transfer.rejectedAt ?? transfer.rejected_at ?? transfer.metadata?.warehouse_rejection?.at,
      transfer.rejectedBy ?? transfer.rejected_by ?? transfer.metadata?.warehouse_rejection?.actor],
    ['Cancelled', transfer.cancelledAt ?? transfer.cancelled_at, transfer.cancelledBy ?? transfer.cancelled_by],
  ].filter(([, date]) => date).sort((a, b) => new Date(a[1]) - new Date(b[1]));
}
export function dateLabel(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'Not recorded';
  return new Date(value).toLocaleString('en-NA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export const availableOf = product => Number(product?.available ?? 0);
export function validateDraft(destination, warehouses, cart, products) {
  if (!warehouses.some(w => String(w.id) === String(destination))) return 'Select a valid destination warehouse.';
  if (!cart.length) return 'Add at least one product.';
  for (const line of cart) {
    const product = products.find(p => String(p.id) === String(line.productId));
    if (!product || !product.id) return 'A selected product is no longer in the catalog. Remove it and refresh.';
    if (!Number.isSafeInteger(Number(line.quantity)) || Number(line.quantity) <= 0) return `Enter a positive whole-number quantity for ${product.name}.`;
    if (product.unavailableReason || Number(line.quantity) > availableOf(product)) return `${product.name}: ${product.unavailableReason || `only ${availableOf(product)} units currently available`}.`;
  }
  return '';
}

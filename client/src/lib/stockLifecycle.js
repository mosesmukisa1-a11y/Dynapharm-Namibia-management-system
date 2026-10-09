export function buildReceiptPayload({ receiptKey, form, items, productRecords }) {
  const catalog = Array.isArray(productRecords) ? productRecords : [];
  const productFor = name => catalog.find(p =>
    (p.name || p.description || '').trim().toLowerCase() === String(name || '').trim().toLowerCase()
  );
  const lines = (items || []).filter(item => item.product_name && Number(item.quantity) > 0);
  const notes = [
    form.notes,
    `Supplier: ${form.supplier}`,
    `Shipping reference: ${form.shipping_ref || '—'}`,
    `GRN: ${form.grn_number || '—'}`,
    `Invoice: ${form.invoice_number || '—'}`,
    `Arrival date: ${form.arrival_date || '—'}`,
    ...lines.map(item => `Carton ${item.carton_no || '—'} / batch ${item.batch_number || '—'} / expiry ${item.expiry_date || '—'}`),
  ].filter(Boolean).join(' | ');
  return {
    receiptKey,
    supplierId: String(form.supplier_id || '').trim() || String(form.supplier || '').trim(),
    notes,
    grnNumber: form.grn_number || null,
    invoiceNumber: form.invoice_number || null,
    shipmentReference: form.shipping_ref || null,
    originCountry: 'Malaysia',
    arrivalDate: form.arrival_date || null,
    destinationWarehouse: form.destination_warehouse || 'country_stock',
    expenses: {
      freight: form.freight === '' ? null : Number(form.freight),
      duty: form.duty === '' ? null : Number(form.duty),
      other: form.other === '' ? null : Number(form.other),
    },
    items: lines.map(item => {
      const product = productFor(item.product_name);
      return {
        productName: item.product_name,
        productId: product?.id ?? product?.product_id ?? product?.productId ?? null,
        batchNo: item.batch_number || null,
        expiryDate: item.expiry_date || null,
        cartonNo: item.carton_no || null,
        metadata: { cartonNo: item.carton_no || null },
        quantity: Number(item.quantity),
        enteredUnit: item.entered_unit,
        unitCIF: item.cif_price === '' ? null : Number(item.cif_price),
        unitDP: item.dpc_price === '' ? null : Number(item.dpc_price),
      };
    }),
  };
}

export function receiptMoney(value) {
  return `N$ ${Number(value ?? 0).toLocaleString('en-NA',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
}

export function readReceiptDraft(storage, key) {
  try {
    const value = storage?.getItem(key);
    if (!value) return null;
    const draft = JSON.parse(value);
    return draft && typeof draft === 'object' ? draft : null;
  } catch {
    return null;
  }
}

export function writeReceiptDraft(storage, key, draft) {
  try {
    storage?.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearReceiptDraft(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

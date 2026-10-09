import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { buildReceiptPayload, readReceiptDraft, writeReceiptDraft,receiptMoney } from './stockLifecycle';

describe('stock carton lifecycle API contract', () => {
  it('does not hide expense cents in receiving summaries',()=>{
    expect(receiptMoney(.01)).toBe('N$ 0.01');
    expect(receiptMoney(20.01)).toBe('N$ 20.01');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uses product-pack GET and PUT contracts', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, rows: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);
    await api.stock.productPacks();
    const body = { productName: 'Vita C', baseUnit: 'tablet', packs: [{ unit: 'carton', factor: 24, barcode: '8901' }] };
    await api.stock.saveProductPacks(body);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/stock/product-packs');
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
    expect(fetchMock.mock.calls[1][0]).toBe('/api/stock/product-packs');
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(body);
  });

  it('posts a single atomic receipt with nullable entered-unit costs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, referenceId: 'GRN-1', items: [], expenseTotal: 10 }) });
    vi.stubGlobal('fetch', fetchMock);
    const body = {
      receiptKey: 'stable-draft-key',
      supplierId: 'supplier-7',
      notes: 'Carton CTN-4 · Invoice INV-8',
      expenses: { freight: 10, duty: null, other: null },
      items: [{ productName: 'Vita C', productId: 'p-1', batchNo: 'B-2', expiryDate: '2027-06-30', quantity: 2, enteredUnit: 'carton', unitCIF: null, unitDP: 8.45 }],
    };
    await api.stock.receiveImport(body);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/stock/import/receive');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(body);
  });

  it('queries the branch cost report with its contract parameter names', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ stock: [], sales: [], summary: {} }) });
    vi.stubGlobal('fetch', fetchMock);
    await api.stock.costReport({ branchId: 'windhoek_cbd', from: '2026-04-01', to: '2026-04-30' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/stock/cost-report?branchId=windhoek_cbd&from=2026-04-01&to=2026-04-30');
  });

  it('retains structured receipt metadata, line cartons, null costs, and supplier name fallback', () => {
    const payload = buildReceiptPayload({
      receiptKey: 'draft-42',
      form: {
        supplier: 'Makwena Medical Supplies',
        supplier_id: '',
        shipping_ref: 'BL-08',
        grn_number: 'GRN-31',
        invoice_number: 'INV-55',
        arrival_date: '2026-05-03',
        destination_warehouse: 'country_stock',
        notes: 'Seal intact',
        freight: '',
        duty: '0',
        other: '',
      },
      items: [{
        product_name: 'Vitamin C',
        quantity: '3',
        entered_unit: 'carton',
        cif_price: '',
        dpc_price: '4.125',
        carton_no: 'CTN-17',
        expiry_date: '2028-01-31',
        batch_number: 'B-9',
      }],
      productRecords: [{ id: 'product-1', name: 'Vitamin C' }],
    });
    expect(payload).toMatchObject({
      receiptKey: 'draft-42',
      supplierId: 'Makwena Medical Supplies',
      grnNumber: 'GRN-31',
      invoiceNumber: 'INV-55',
      shipmentReference: 'BL-08',
      originCountry: 'Malaysia',
      arrivalDate: '2026-05-03',
      expenses: { freight: null, duty: 0, other: null },
      items: [{
        productId: 'product-1',
        cartonNo: 'CTN-17',
        metadata: { cartonNo: 'CTN-17' },
        unitCIF: null,
        unitDP: 4.125,
      }],
    });
  });

  it('persists an unchanged receipt key and retry payload in session storage', () => {
    const values = new Map();
    const storage = {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
    const draft = { receiptKey: 'stable-key', form: { grn_number: 'GRN-9' }, items: [{ carton_no: 'CTN-9' }], retryPayload: { receiptKey: 'stable-key', items: [{ cartonNo: 'CTN-9' }] } };
    expect(writeReceiptDraft(storage, 'receipt', draft)).toBe(true);
    expect(readReceiptDraft(storage, 'receipt')).toEqual(draft);
  });
});

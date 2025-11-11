const STORAGE_KEY = 'dyna_barcode_stock';
const IMPORTS_KEY = 'dyna_country_imports';
const INVENTORY_KEY = 'dyna_barcode_inventory';
const LAST_EVENT_KEY = 'dyna_last_stock_event';
const LAST_UPDATED_KEY = 'dyna_barcode_stock_lastUpdated';

function nowIso() {
    return new Date().toISOString();
}

function ensureLocalStorage() {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
        throw new Error('localStorage is not available in this environment');
    }
    return window.localStorage;
}

function readJson(key, fallback) {
    try {
        const raw = ensureLocalStorage().getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw);
    } catch (_) {
        return fallback;
    }
}

function writeJson(key, value) {
    const storage = ensureLocalStorage();
    storage.setItem(key, JSON.stringify(value));
}

function touchTimestamp(key) {
    try {
        ensureLocalStorage().setItem(key, String(Date.now()));
    } catch (_) {
        /* ignore */
    }
}

function broadcastStockUpdate(detail = {}) {
    try {
        const storage = ensureLocalStorage();
        storage.setItem(LAST_EVENT_KEY, String(Date.now()));
    } catch (_) {
        /* ignore */
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('stock-updated', { detail }));
        try {
            window.dispatchEvent(new CustomEvent('cloud-sync:updated', { detail }));
        } catch (_) {
            /* ignore */
        }
    }
}

function makeBarcodeSeed(description, batchNo) {
    const base = [description || 'ITEM', batchNo || 'BATCH', Date.now().toString(36)].join('-');
    return base.replace(/[^A-Z0-9]+/gi, '').toUpperCase();
}

function generateBarcode(description, batchNo) {
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `BC-${makeBarcodeSeed(description, batchNo)}-${random}`;
}

function normalizeExpiry(expiry) {
    if (!expiry) return null;
    const trimmed = String(expiry).trim();
    if (/^\d{4}-\d{2}$/.test(trimmed)) {
        return trimmed;
    }
    if (/^\d{4}\/\d{2}$/.test(trimmed)) {
        return trimmed.replace('/', '-');
    }
    if (/^(\d{2})[-\/]\d{4}$/.test(trimmed)) {
        const [month, year] = trimmed.split(/[-\/]/);
        return `${year}-${month}`;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
        const year = parsed.getFullYear();
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    }
    const isoFragment = trimmed.match(/(\d{4})[-/](\d{2})/);
    if (isoFragment) {
        return `${isoFragment[1]}-${isoFragment[2]}`;
    }
    return null;
}

function ensureNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return NaN;
    return num;
}

function toExpiryTimestamp(expiry) {
    try {
        if (!expiry) return null;
        const date = new Date(`${expiry}-01T00:00:00`);
        return Number.isNaN(date.getTime()) ? null : date.getTime();
    } catch (_) {
        return null;
    }
}

function buildPriceLookup() {
    const map = new Map();
    try {
        const storedProducts = readJson('dyna_products', []);
        if (Array.isArray(storedProducts)) {
            storedProducts.forEach(prod => {
                if (!prod) return;
                const key = (prod.description || prod.name || prod.id || '').toString().toLowerCase();
                if (!key) return;
                const cp = Number(prod.cp || prod.costPrice || prod.cost_price);
                const dp = Number(prod.dp || prod.price || prod.retailPrice || prod.retail_price);
                map.set(key, { cp: Number.isFinite(cp) ? cp : 0, dp: Number.isFinite(dp) ? dp : 0 });
            });
        }
    } catch (_) {
        /* ignore */
    }
    if (typeof window !== 'undefined' && Array.isArray(window.PRICE_LIST)) {
        window.PRICE_LIST.forEach(item => {
            if (!item) return;
            const key = (item.description || item.name || item.id || '').toString().toLowerCase();
            if (!key) return;
            const cp = Number(item.cp);
            const dp = Number(item.dp);
            if (!map.has(key)) {
                map.set(key, { cp: Number.isFinite(cp) ? cp : 0, dp: Number.isFinite(dp) ? dp : 0 });
            }
        });
    }
    return map;
}

function persistInventoryAggregate(batches) {
    const aggregateMap = new Map();
    batches.forEach(batch => {
        const name = (batch.description || batch.productId || 'unknown').toString();
        const key = name.toLowerCase();
        if (!aggregateMap.has(key)) {
            aggregateMap.set(key, {
                product: name,
                totalQuantity: 0,
                availableQuantity: 0,
                locations: new Set(),
                earliestExpiry: null
            });
        }
        const entry = aggregateMap.get(key);
        entry.totalQuantity += Number(batch.quantity || 0);
        entry.availableQuantity += Number(batch.remainingQuantity || batch.quantity || 0);
        if (batch.location) entry.locations.add(batch.location);
        if (batch.expiryTimestamp) {
            if (entry.earliestExpiry === null || batch.expiryTimestamp < entry.earliestExpiry) {
                entry.earliestExpiry = batch.expiryTimestamp;
            }
        }
    });

    const aggregate = Array.from(aggregateMap.values()).map(entry => ({
        product: entry.product,
        totalQuantity: entry.totalQuantity,
        availableQuantity: entry.availableQuantity,
        locations: Array.from(entry.locations),
        earliestExpiry: entry.earliestExpiry
    }));

    writeJson(INVENTORY_KEY, aggregate);
    return aggregate;
}

function saveBatches(batches) {
    writeJson(STORAGE_KEY, batches);
    touchTimestamp(LAST_UPDATED_KEY);
    persistInventoryAggregate(batches);
    broadcastStockUpdate({ scope: 'barcode-stock' });
}

function appendImportHistory(entry) {
    const history = readJson(IMPORTS_KEY, []);
    history.unshift(entry);
    if (history.length > 500) history.length = 500;
    writeJson(IMPORTS_KEY, history);
}

function validateImportPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        return { ok: false, message: 'Invalid payload' };
    }
    const required = ['description', 'batchNo', 'expiryDate', 'quantity'];
    for (const field of required) {
        if (payload[field] === undefined || payload[field] === null || String(payload[field]).trim() === '') {
            return { ok: false, message: `Missing ${field}` };
        }
    }
    const normalizedExpiry = normalizeExpiry(payload.expiryDate);
    if (!normalizedExpiry) {
        return { ok: false, message: 'Invalid expiry format' };
    }
    const quantity = ensureNumber(payload.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
        return { ok: false, message: 'Invalid quantity' };
    }
    const totalCtns = payload.totalCtns !== undefined ? ensureNumber(payload.totalCtns) : quantity;
    if (payload.totalCtns !== undefined && (!Number.isFinite(totalCtns) || totalCtns <= 0)) {
        return { ok: false, message: 'Invalid total cartons' };
    }
    return {
        ok: true,
        data: {
            cartonNo: payload.cartonNo && String(payload.cartonNo).trim(),
            description: String(payload.description).trim(),
            batchNo: String(payload.batchNo).trim(),
            expiryDate: normalizedExpiry,
            quantity: Math.round(quantity),
            totalCtns: Math.round(Number.isFinite(totalCtns) && totalCtns > 0 ? totalCtns : quantity),
            location: payload.location || payload.sourceWarehouseId || 'country_stock',
            metadata: payload.metadata || null
        }
    };
}

function loadBatches() {
    return readJson(STORAGE_KEY, []);
}

export function getAllBarcodeStock() {
    const batches = loadBatches();
    return { success: true, data: batches };
}

export function getStockByBarcode(barcode) {
    const batches = loadBatches();
    const found = batches.find(batch => batch.barcode === barcode || batch.id === barcode);
    if (!found) {
        return { success: false, error: 'NOT_FOUND' };
    }
    return { success: true, data: found };
}

export function getFEFOStock(description, quantityHint) {
    const batches = loadBatches();
    const needle = (description || '').toString().toLowerCase();
    const filtered = batches.filter(batch => (batch.description || '').toString().toLowerCase() === needle && batch.remainingQuantity > 0);
    filtered.sort((a, b) => (a.expiryTimestamp || 0) - (b.expiryTimestamp || 0));
    let remaining = Number.isFinite(quantityHint) ? quantityHint : null;
    const selection = [];
    filtered.forEach(batch => {
        if (remaining === null) {
            selection.push(batch);
            return;
        }
        if (remaining <= 0) return;
        const take = Math.min(batch.remainingQuantity, remaining);
        selection.push({ ...batch, suggestedQuantity: take });
        remaining -= take;
    });
    return { success: true, data: selection };
}

async function saveBatchToCloud(payload) {
    try {
        const response = await fetch('/api/stock-batches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            return null;
        }
        const body = await response.json();
        if (body?.success && body?.batch) {
            return body.batch;
        }
        if (body?.success && Array.isArray(body?.batches) && body.batches.length > 0) {
            return body.batches[0];
        }
        return null;
    } catch (_) {
        return null;
    }
}

async function updateBatchInCloud(identifier, updates = {}) {
    const payload = { ...updates };
    if (identifier && typeof identifier === 'object') {
        if (identifier.id) payload.id = identifier.id;
        if (identifier.barcode) payload.barcode = identifier.barcode;
    } else if (typeof identifier === 'string') {
        if (identifier.startsWith('BC-')) {
            payload.barcode = identifier;
        } else {
            payload.id = identifier;
        }
    }

    if (!payload.id && !payload.barcode) {
        return null;
    }

    try {
        const response = await fetch('/api/stock-batches', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            return null;
        }
        const body = await response.json().catch(() => null);
        if (body?.success && body?.batch) {
            return body.batch;
        }
        if (body?.batch) {
            return body.batch;
        }
        return null;
    } catch (error) {
        console.warn('Failed to update stock batch in cloud', error);
        return null;
    }
}

async function deleteBatchInCloud(identifier) {
    const params = new URLSearchParams();
    if (identifier && typeof identifier === 'object') {
        if (identifier.id) params.set('id', identifier.id);
        if (identifier.barcode) params.set('barcode', identifier.barcode);
    } else if (typeof identifier === 'string') {
        if (identifier.startsWith('BC-')) {
            params.set('barcode', identifier);
        } else {
            params.set('id', identifier);
        }
    }
    if (!params.toString()) {
        return false;
    }
    try {
        const response = await fetch(`/api/stock-batches?${params.toString()}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        return response.ok;
    } catch (error) {
        console.warn('Failed to delete stock batch in cloud', error);
        return false;
    }
}

function adaptCloudBatch(cloud) {
    if (!cloud) return null;
    return {
        id: cloud.id || `BATCH-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        cartonNo: cloud.cartonNo || cloud.carton_no || null,
        description: cloud.description || '',
        batchNo: cloud.batchNo || cloud.batch_no || null,
        expiryDate: cloud.expiryDate || cloud.expiry_date || null,
        expiryTimestamp: toExpiryTimestamp(cloud.expiryDate || cloud.expiry_date),
        quantity: Number(cloud.quantity || cloud.totalQuantity || 0),
        remainingQuantity: Number(
            cloud.remainingQuantity !== undefined
                ? cloud.remainingQuantity
                : cloud.remaining_quantity !== undefined
                    ? cloud.remaining_quantity
                    : cloud.quantity || 0
        ),
        totalCtns: Number(cloud.totalCtns || cloud.total_ctns || cloud.quantity || 0),
        location: cloud.location || cloud.warehouseId || cloud.warehouse_id || 'country_stock',
        status: cloud.status || 'available',
        barcode: cloud.barcode || generateBarcode(cloud.description, cloud.batchNo),
        createdAt: cloud.importDate || cloud.import_date || cloud.createdAt || nowIso(),
        updatedAt: cloud.updatedAt || cloud.updated_at || cloud.importDate || nowIso(),
        metadata: cloud.metadata || {}
    };
}

export async function importStockWithBarcode(payload) {
    try {
        const validation = validateImportPayload(payload);
        if (!validation.ok) {
            return { success: false, error: validation.message };
        }

        const normalized = validation.data;
        let cloudBatch = await saveBatchToCloud({
            cartonNo: normalized.cartonNo || null,
            description: normalized.description,
            batchNo: normalized.batchNo,
            expiryDate: normalized.expiryDate,
            quantity: normalized.quantity,
            totalCtns: normalized.totalCtns,
            location: normalized.location,
            metadata: normalized.metadata || {}
        });

        let entry = adaptCloudBatch(cloudBatch);
        if (!entry) {
            const barcode = generateBarcode(normalized.description, normalized.batchNo);
            const now = nowIso();
            entry = {
                id: `BATCH-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                cartonNo: normalized.cartonNo || null,
                description: normalized.description,
                batchNo: normalized.batchNo,
                expiryDate: normalized.expiryDate,
                expiryTimestamp: toExpiryTimestamp(normalized.expiryDate),
                quantity: normalized.quantity,
                remainingQuantity: normalized.quantity,
                totalCtns: normalized.totalCtns,
                location: normalized.location,
                status: 'available',
                barcode,
                createdAt: now,
                updatedAt: now,
                metadata: normalized.metadata || {}
            };
        }

        const batches = loadBatches();
        batches.push(entry);
        batches.sort((a, b) => (a.expiryTimestamp || Infinity) - (b.expiryTimestamp || Infinity));
        saveBatches(batches);

        appendImportHistory({
            id: entry.id,
            description: entry.description,
            batchNumber: entry.batchNo,
            expiryDate: entry.expiryDate,
            quantity: entry.quantity,
            totalCtns: entry.totalCtns,
            location: entry.location,
            barcode: entry.barcode,
            createdAt: entry.createdAt
        });

        return { success: true, data: entry, cloudSynced: Boolean(cloudBatch) };
    } catch (error) {
        return { success: false, error: error.message || 'IMPORT_FAILED' };
    }
}

export function dispatchStockByBarcode(barcode, quantity, destination, meta = {}) {
    const qty = Math.max(0, Math.floor(Number(quantity) || 0));
    if (!barcode || qty <= 0) {
        return { success: false, error: 'INVALID_PARAMETERS' };
    }
    const batches = loadBatches();
    const idx = batches.findIndex(batch => batch.barcode === barcode || batch.id === barcode);
    if (idx === -1) {
        return { success: false, error: 'NOT_FOUND' };
    }
    const batch = batches[idx];
    if (batch.remainingQuantity < qty) {
        return { success: false, error: 'INSUFFICIENT_STOCK' };
    }

    batch.remainingQuantity -= qty;
    batch.updatedAt = nowIso();
    batch.dispatchedQuantity = Number(batch.dispatchedQuantity || 0) + qty;
    batch.dispatches = batch.dispatches || [];
    batch.dispatches.push({
        quantity: qty,
        toBranch: destination || null,
        dispatchDate: batch.updatedAt,
        metadata: meta
    });
    if (batch.remainingQuantity === 0) {
        batch.status = 'exhausted';
    }
    batch.metadata = batch.metadata || {};
    batch.metadata.lastDispatchAt = batch.updatedAt;
    batch.metadata.lastDispatchMeta = meta;
    saveBatches(batches);

    updateBatchInCloud({ barcode: batch.barcode || barcode }, {
        barcode: batch.barcode || barcode,
        remainingQuantity: batch.remainingQuantity,
        dispatchedQuantity: batch.dispatchedQuantity,
        status: batch.status,
        location: batch.location,
        metadata: batch.metadata
    }).then((cloudBatch) => {
        const refreshed = adaptCloudBatch(cloudBatch);
        if (refreshed) {
            batches[idx] = refreshed;
            saveBatches(batches);
        }
    }).catch((error) => console.warn('dispatchStockByBarcode cloud sync failed', error));

    return { success: true, data: batch };
}

export function receiveStockByBarcode(barcode, quantity, location, meta = {}) {
    const qty = Math.max(0, Math.floor(Number(quantity) || 0));
    if (!barcode || qty <= 0) {
        return { success: false, error: 'INVALID_PARAMETERS' };
    }
    const batches = loadBatches();
    const idx = batches.findIndex(batch => batch.barcode === barcode || batch.id === barcode);
    if (idx === -1) {
        return { success: false, error: 'NOT_FOUND' };
    }
    const batch = batches[idx];
    batch.remainingQuantity += qty;
    batch.quantity += qty;
    batch.location = location || batch.location;
    batch.status = 'available';
    batch.updatedAt = nowIso();
    batch.metadata = batch.metadata || {};
    batch.metadata.lastReceiptAt = batch.updatedAt;
    batch.metadata.lastReceiptMeta = meta;
    batch.receipts = batch.receipts || [];
    batch.receipts.push({
        quantity: qty,
        location: batch.location,
        receivedAt: batch.updatedAt,
        metadata: meta
    });
    saveBatches(batches);

    updateBatchInCloud({ barcode: batch.barcode || barcode }, {
        barcode: batch.barcode || barcode,
        remainingQuantity: batch.remainingQuantity,
        quantity: batch.quantity,
        status: batch.status,
        location: batch.location,
        metadata: batch.metadata
    }).then((cloudBatch) => {
        const refreshed = adaptCloudBatch(cloudBatch);
        if (refreshed) {
            batches[idx] = refreshed;
            saveBatches(batches);
        }
    }).catch((error) => console.warn('receiveStockByBarcode cloud sync failed', error));

    return { success: true, data: batch };
}

export function removeStockBatch(barcodeOrId) {
    const batches = loadBatches();
    const idx = batches.findIndex(batch => batch.barcode === barcodeOrId || batch.id === barcodeOrId);
    if (idx === -1) {
        return { success: false, error: 'NOT_FOUND' };
    }
    const [removed] = batches.splice(idx, 1);
    saveBatches(batches);
    deleteBatchInCloud(removed.barcode || removed.id || barcodeOrId).catch((error) => {
        console.warn('removeStockBatch cloud sync failed', error);
    });
    return { success: true, data: removed };
}

export function resetBarcodeStock() {
    writeJson(STORAGE_KEY, []);
    touchTimestamp(LAST_UPDATED_KEY);
    writeJson(INVENTORY_KEY, []);
    broadcastStockUpdate({ scope: 'barcode-stock', op: 'reset' });
    return { success: true };
}

export function getBarcodeStockStatistics() {
    const batches = loadBatches();
    const priceMap = buildPriceLookup();
    const now = Date.now();
    const sixtyDays = 1000 * 60 * 60 * 24 * 60;

    let totalValue = 0;
    let totalQuantity = 0;
    let expiringSoon = 0;
    let expired = 0;
    const lowStock = new Set();

    batches.forEach(batch => {
        const key = (batch.description || '').toString().toLowerCase();
        const price = priceMap.get(key) || { cp: 0, dp: 0 };
        const qty = Number(batch.remainingQuantity || batch.quantity || 0);
        totalQuantity += qty;
        const cost = price.cp || price.dp || 0;
        totalValue += qty * cost;
        if (batch.expiryTimestamp) {
            const diff = batch.expiryTimestamp - now;
            if (diff <= 0) expired += 1;
            else if (diff <= sixtyDays) expiringSoon += 1;
        }
        if (qty <= 20) {
            lowStock.add(batch.description || batch.productId || batch.barcode);
        }
    });

    return {
        success: true,
        data: {
            totalBatches: batches.length,
            totalQuantity,
            totalStockValue: Number(totalValue.toFixed(2)),
            expiringSoon,
            expired,
            lowStockProducts: lowStock.size
        }
    };
}

export default {
    importStockWithBarcode,
    getBarcodeStockStatistics,
    getAllBarcodeStock,
    getStockByBarcode,
    getFEFOStock,
    dispatchStockByBarcode,
    receiveStockByBarcode,
    removeStockBatch,
    resetBarcodeStock
};

const REQUESTS_KEY = 'dyna_stock_requests';
const TRANSFERS_KEY = 'dyna_stock_transfers';
const WAREHOUSE_KEY = 'dyna_warehouse_stock';
const BRANCH_STOCK_KEY = 'dyna_branch_stock';
const DISPATCH_NOTES_KEY = 'dyna_dispatch_notes';
const LAST_EVENT_KEY = 'dyna_last_stock_event';

function ensureLocalStorage() {
    if (typeof window === 'undefined' || !window.localStorage) {
        throw new Error('localStorage is not available');
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
    ensureLocalStorage().setItem(key, JSON.stringify(value));
}

function nowIso() {
    return new Date().toISOString();
}

function broadcast(change = {}) {
    try {
        const storage = ensureLocalStorage();
        storage.setItem(LAST_EVENT_KEY, String(Date.now()));
    } catch (_) {
        /* ignore */
    }
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('stock-updated', { detail: change }));
        try { window.dispatchEvent(new CustomEvent('cloud-sync:updated', { detail: change })); } catch (_) {}
    }
}

function loadDispatchNotes() {
    const notes = readJson(DISPATCH_NOTES_KEY, []);
    return Array.isArray(notes) ? notes : [];
}

function saveDispatchNotes(notes) {
    writeJson(DISPATCH_NOTES_KEY, notes);
    broadcast({ scope: 'dispatch-notes' });
}

function generateDispatchBarcode(transfer) {
    const base = `${transfer.requestNumber || transfer.id || 'TRF'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    return `DN-${base}`.toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

function recordDispatchNote(transfer, meta = {}) {
    if (!transfer) return null;
    const notes = loadDispatchNotes();
    const note = {
        id: meta.noteId || `NOTE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase(),
        transferId: transfer.id,
        requestId: transfer.requestId || null,
        requestNumber: transfer.requestNumber || null,
        barcode: generateDispatchBarcode(transfer),
        fromWarehouse: transfer.fromWarehouse || 'warehouse',
        toBranch: transfer.toBranch || 'branch',
        items: Array.isArray(transfer.items) ? transfer.items.map(item => ({
            productId: item.productId || item.description || 'Item',
            description: item.description || item.productId || 'Item',
            quantity: Number(item.quantity || 0),
            uom: item.uom || 'units'
        })) : [],
        status: 'in_transit',
        createdAt: new Date().toISOString(),
        dispatchedBy: meta.user || meta.actor || 'Warehouse Team',
        dispatchNotes: meta.dispatchNotes || transfer.dispatchNotes || '',
        batchIds: Array.isArray(meta.batchIds) ? meta.batchIds : [],
        expectedArrival: meta.expectedArrival || null
    };
    notes.unshift(note);
    saveDispatchNotes(notes);
    return note;
}

function updateDispatchNoteStatus(identifier, updates = {}, options = {}) {
    const by = options.by || 'id';
    const notes = loadDispatchNotes();
    const idx = notes.findIndex(note => {
        if (by === 'transferId') return note.transferId === identifier;
        return note.id === identifier;
    });
    if (idx === -1) {
        return { success: false, error: 'NOT_FOUND' };
    }
    const now = new Date().toISOString();
    const note = notes[idx];
    Object.assign(note, updates);
    if (updates.status === 'received') {
        note.receivedAt = updates.receivedAt || now;
    }
    if (updates.receivedBy) {
        note.receivedBy = updates.receivedBy;
    }
    notes[idx] = note;
    saveDispatchNotes(notes);
    return { success: true, data: note };
}

export function getDispatchNotes(filters = {}) {
    const notes = loadDispatchNotes();
    const branch = filters.toBranch && filters.toBranch !== 'all' ? String(filters.toBranch).toLowerCase() : null;
    const warehouse = filters.fromWarehouse && filters.fromWarehouse !== 'all' ? String(filters.fromWarehouse).toLowerCase() : null;
    const status = filters.status && filters.status !== 'all' ? String(filters.status).toLowerCase() : null;
    const transferId = filters.transferId || null;
    const requestNumber = filters.requestNumber || null;
    const data = notes.filter(note => {
        if (branch && String(note.toBranch || '').toLowerCase() !== branch) return false;
        if (warehouse && String(note.fromWarehouse || '').toLowerCase() !== warehouse) return false;
        if (status && String(note.status || '').toLowerCase() !== status) return false;
        if (transferId && note.transferId !== transferId) return false;
        if (requestNumber && note.requestNumber !== requestNumber) return false;
        return true;
    });
    return { success: true, data };
}

export { updateDispatchNoteStatus };

function loadRequests() {
    const data = readJson(REQUESTS_KEY, []);
    return Array.isArray(data) ? data : [];
}

function saveRequests(requests) {
    writeJson(REQUESTS_KEY, requests);
    broadcast({ scope: 'requests' });
}

function loadTransfers() {
    const data = readJson(TRANSFERS_KEY, []);
    return Array.isArray(data) ? data : [];
}

function saveTransfers(transfers) {
    writeJson(TRANSFERS_KEY, transfers);
    broadcast({ scope: 'transfers' });
}

function loadWarehouses() {
    const data = readJson(WAREHOUSE_KEY, {});
    return data && typeof data === 'object' ? data : {};
}

function saveWarehouses(warehouses) {
    writeJson(WAREHOUSE_KEY, warehouses);
    broadcast({ scope: 'warehouse' });
}

function loadBranchStock() {
    const data = readJson(BRANCH_STOCK_KEY, {});
    return data && typeof data === 'object' ? data : {};
}

function saveBranchStock(branchStock) {
    writeJson(BRANCH_STOCK_KEY, branchStock);
    broadcast({ scope: 'branch-stock' });
}

function normalizeItems(items) {
    if (!Array.isArray(items)) return [];
    return items
        .map(item => ({
            productId: item.productId || item.id || item.sku || item.description || 'UNKNOWN',
            description: item.description || item.productName || item.productId || 'Item',
            quantity: Number(item.quantity || item.qty || 0),
            uom: item.uom || item.unit || 'units'
        }))
        .filter(item => item.quantity > 0 && item.description);
}

function generateRequestNumber(branchId = 'ALL') {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `SRQ-${String(branchId || 'ALL').toUpperCase()}-${y}${m}${d}-${rand}`;
}

function initialStatusForRequest() {
    return 'pending_stock_review';
}

function nextStatus(currentStatus, req, role, approved) {
    if (approved === false) return 'rejected';
    switch (currentStatus) {
        case 'pending_stock_review':
            return 'pending_gm';
        case 'pending_gm':
            return 'pending_warehouse';
        case 'pending_warehouse':
            return 'approved';
        case 'pending':
            return 'pending_gm';
        default:
            return currentStatus;
    }
}

function updateRequestHistory(request, entry) {
    request.history = Array.isArray(request.history) ? request.history : [];
    request.history.unshift(entry);
    if (request.history.length > 50) request.history.length = 50;
}

function touchBranchStock(branchId, productId, delta) {
    if (!branchId || !productId || !Number.isFinite(delta)) return;
    const stock = loadBranchStock();
    if (!stock[branchId]) stock[branchId] = {};
    if (!stock[branchId][productId]) {
        stock[branchId][productId] = { quantity: 0, updatedAt: nowIso() };
    }
    stock[branchId][productId].quantity = Math.max(0, Number(stock[branchId][productId].quantity || 0) + delta);
    stock[branchId][productId].updatedAt = nowIso();
    saveBranchStock(stock);
}

function ensureWarehouseEntry(warehouses, warehouseId, productId) {
    if (!warehouses[warehouseId]) warehouses[warehouseId] = {};
    if (!warehouses[warehouseId][productId]) {
        warehouses[warehouseId][productId] = {
            productId,
            quantity: 0,
            reservedQuantity: 0,
            reorderLevel: 10,
            updatedAt: nowIso(),
            history: []
        };
    }
    return warehouses[warehouseId][productId];
}

export function createStockRequest(payload) {
    try {
        const requests = loadRequests();
        const branch = payload.branch || payload.requestingBranch || payload.requesting_branch;
        const items = normalizeItems(payload.items);
        const status = initialStatusForRequest(payload);
        const request = {
            id: payload.id || `REQ-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            requestNumber: payload.requestNumber || payload.request_number || generateRequestNumber(branch),
            requestingBranch: branch,
            type: payload.type || payload.requestType || 'sales_replenishment',
            priority: payload.priority || 'normal',
            status,
            items,
            notes: payload.notes || '',
            createdBy: payload.requestedBy || payload.createdBy || 'Requestor',
            createdByRole: payload.requestedByRole || 'branch_manager',
            createdAt: nowIso(),
            returnDate: payload.returnDate || payload.return_date || null,
            approvedBy: null,
            approvedAt: null,
            approvals: [],
            history: []
        };

        updateRequestHistory(request, {
            action: 'created',
            actor: request.createdBy,
            role: request.createdByRole,
            timestamp: request.createdAt,
            status
        });

        requests.unshift(request);
        saveRequests(requests);
        return { success: true, data: request };
    } catch (error) {
        return { success: false, error: error.message || 'CREATE_FAILED' };
    }
}

export function getStockRequests(filters = {}) {
    const requests = loadRequests();
    const branch = filters.branch && filters.branch !== 'all' ? String(filters.branch).toLowerCase() : null;
    const status = filters.status && filters.status !== 'all' ? String(filters.status).toLowerCase() : null;
    const data = requests.filter(req => {
        if (branch && String(req.requestingBranch || '').toLowerCase() !== branch) return false;
        if (status && String(req.status || '').toLowerCase() !== status) return false;
        return true;
    });
    return { success: true, data };
}

export function updateStockRequest(id, updates = {}) {
    try {
        const requests = loadRequests();
        const idx = requests.findIndex(req => req.id === id || req.requestNumber === id);
        if (idx === -1) {
            return { success: false, error: 'NOT_FOUND' };
        }
        const request = requests[idx];
        const now = nowIso();
        if (Array.isArray(updates.items)) {
            request.items = normalizeItems(updates.items);
        }
        if (updates.returnDate !== undefined) {
            request.returnDate = updates.returnDate;
        }
        if (updates.notes !== undefined) {
            request.notes = updates.notes;
        }
        if (updates.status) {
            request.status = updates.status;
        }
        if (updates.reviewedBy) {
            request.reviewedBy = updates.reviewedBy;
            request.reviewedAt = now;
        }
        request.history = Array.isArray(request.history) ? request.history : [];
        request.history.unshift({
            action: 'updated',
            actor: updates.reviewedBy || updates.actor || 'System',
            timestamp: now,
            notes: updates.notes || '',
            status: request.status
        });
        requests[idx] = request;
        saveRequests(requests);
        return { success: true, data: request };
    } catch (error) {
        return { success: false, error: error.message || 'UPDATE_FAILED' };
    }
}

export function forwardStockRequestToGM(id, meta = {}) {
    return updateStockRequest(id, {
        status: 'pending_gm',
        reviewedBy: meta.reviewedBy || meta.actor || 'Stock Manager',
        notes: meta.notes || ''
    });
}

export function approveStockRequest(id, options = {}) {
    try {
        const requests = loadRequests();
        const idx = requests.findIndex(req => req.id === id || req.requestNumber === id);
        if (idx === -1) {
            return { success: false, error: 'NOT_FOUND' };
        }
        const request = requests[idx];
        const approved = options.approved !== false;
        const role = options.approverRole || 'manager';
        const actor = options.approvedBy || 'Approver';
        const timestamp = nowIso();

        const status = nextStatus(request.status, request, request.type, approved);
        request.status = status;
        if (approved) {
            request.approvedBy = actor;
            request.approvedAt = timestamp;
        } else {
            request.rejectedBy = actor;
            request.rejectedAt = timestamp;
        }
        request.approvals = Array.isArray(request.approvals) ? request.approvals : [];
        request.approvals.unshift({
            role,
            approved,
            actor,
            timestamp,
            notes: options.notes || ''
        });

        updateRequestHistory(request, {
            action: approved ? 'approved' : 'rejected',
            actor,
            role,
            timestamp,
            status
        });

        requests[idx] = request;
        saveRequests(requests);

        return { success: true, data: request };
    } catch (error) {
        return { success: false, error: error.message || 'APPROVE_FAILED' };
    }
}

export function getStockTransfers(filters = {}) {
    const transfers = loadTransfers();
    const status = filters.status && filters.status !== 'all' ? String(filters.status).toLowerCase() : null;
    const toBranch = filters.toBranch && filters.toBranch !== 'all' ? String(filters.toBranch).toLowerCase() : null;
    const fromWarehouse = filters.fromWarehouse && filters.fromWarehouse !== 'all' ? String(filters.fromWarehouse).toLowerCase() : null;
    const data = transfers.filter(tr => {
        if (status && String(tr.status || '').toLowerCase() !== status) return false;
        if (toBranch && String(tr.toBranch || '').toLowerCase() !== toBranch) return false;
        if (fromWarehouse && String(tr.fromWarehouse || '').toLowerCase() !== fromWarehouse) return false;
        return true;
    });
    return { success: true, data };
}

export function createTransfer(payload) {
    try {
        const transfers = loadTransfers();
        const now = nowIso();
        const transfer = {
            id: payload.id || `TRF-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            requestId: payload.requestId || null,
            requestNumber: payload.requestNumber || null,
            fromWarehouse: payload.fromWarehouse || payload.sourceWarehouseId || 'warehouse-windhoek',
            toBranch: payload.toBranch || payload.branchId || 'unknown_branch',
            items: normalizeItems(payload.items),
            status: payload.status || 'pending',
            dispatchNotes: payload.dispatchNotes || '',
            createdBy: payload.createdBy || 'Warehouse',
            createdAt: now,
            dispatchedAt: payload.dispatchedAt || null,
            deliveredAt: payload.deliveredAt || null,
            receivedAt: payload.receivedAt || null,
            history: []
        };
        transfer.history.unshift({ action: 'created', actor: transfer.createdBy, timestamp: now, status: transfer.status });
        transfers.unshift(transfer);
        saveTransfers(transfers);
        return { success: true, data: transfer };
    } catch (error) {
        return { success: false, error: error.message || 'TRANSFER_CREATE_FAILED' };
    }
}

export function updateTransferStatus(id, status, meta = {}) {
    try {
        const transfers = loadTransfers();
        const idx = transfers.findIndex(tr => tr.id === id || tr.requestNumber === id);
        if (idx === -1) {
            return { success: false, error: 'NOT_FOUND' };
        }
        const transfer = transfers[idx];
        const now = nowIso();
        const actor = meta.user || meta.actor || 'System';
        transfer.status = status;

        let dispatchNote = null;
        if (status === 'dispatched') {
            transfer.dispatchedAt = now;
            transfer.dispatchNotes = meta.dispatchNotes || transfer.dispatchNotes;
            adjustWarehouseForTransfer(transfer, 'out');
            dispatchNote = recordDispatchNote(transfer, { user: actor, dispatchNotes: transfer.dispatchNotes });
        } else if (status === 'delivered') {
            transfer.deliveredAt = now;
        } else if (status === 'received') {
            transfer.receivedAt = now;
            adjustBranchForTransfer(transfer, 'in');
            updateDispatchNoteStatus(transfer.id, {
                status: 'received',
                receivedBy: actor,
                receivedAt: now
            }, { by: 'transferId' });
        }

        transfer.history = Array.isArray(transfer.history) ? transfer.history : [];
        transfer.history.unshift({ action: `status:${status}`, actor, timestamp: now });

        transfers[idx] = transfer;
        saveTransfers(transfers);
        return { success: true, data: transfer, note: dispatchNote };
    } catch (error) {
        return { success: false, error: error.message || 'TRANSFER_UPDATE_FAILED' };
    }
}

function adjustWarehouseForTransfer(transfer, direction = 'out') {
    if (!transfer || !Array.isArray(transfer.items)) return;
    const multiplier = direction === 'in' ? 1 : -1;
    transfer.items.forEach(item => {
        const qty = Number(item.quantity || 0);
        if (qty <= 0) return;
        updateWarehouseStock(transfer.fromWarehouse, item.productId, Math.abs(qty), direction === 'in' ? 'in' : 'out', {
            reference: transfer.requestNumber,
            note: `transfer-${direction}`
        });
    });
}

function adjustBranchForTransfer(transfer, direction = 'in') {
    if (!transfer || !Array.isArray(transfer.items)) return;
    const sign = direction === 'in' ? 1 : -1;
    transfer.items.forEach(item => {
        const qty = Number(item.quantity || 0);
        if (qty <= 0) return;
        touchBranchStock(transfer.toBranch, item.productId, qty * sign);
    });
}

export function getWarehouseStock(warehouseId) {
    const warehouses = loadWarehouses();
    if (warehouseId) {
        const data = warehouses[warehouseId] || {};
        const normalized = {};
        Object.keys(data).forEach(productId => {
            const entry = data[productId];
            normalized[productId] = {
                productId,
                quantity: Number(entry.quantity || 0),
                reservedQuantity: Number(entry.reservedQuantity || 0),
                reorderLevel: Number(entry.reorderLevel || 10),
                availableQuantity: Math.max(0, Number(entry.quantity || 0) - Number(entry.reservedQuantity || 0)),
                updatedAt: entry.updatedAt,
                history: entry.history || []
            };
        });
        return { success: true, data: normalized };
    }
    return { success: true, data: warehouses };
}

export function updateWarehouseStock(warehouseId, productId, quantity, action = 'in', meta = {}) {
    try {
        if (!warehouseId || !productId) {
            return { success: false, error: 'INVALID_PARAMETERS' };
        }
        const qty = Math.abs(Number(quantity || 0));
        if (!Number.isFinite(qty) || qty <= 0) {
            return { success: false, error: 'INVALID_QUANTITY' };
        }
        const warehouses = loadWarehouses();
        const entry = ensureWarehouseEntry(warehouses, warehouseId, productId);
        const now = nowIso();

        switch (action) {
            case 'in':
                entry.quantity += qty;
                break;
            case 'out':
                entry.quantity = Math.max(0, entry.quantity - qty);
                break;
            case 'reserve':
                entry.reservedQuantity += qty;
                break;
            case 'unreserve':
                entry.reservedQuantity = Math.max(0, entry.reservedQuantity - qty);
                break;
            default:
                break;
        }
        entry.availableQuantity = Math.max(0, entry.quantity - entry.reservedQuantity);
        entry.updatedAt = now;
        entry.history = Array.isArray(entry.history) ? entry.history : [];
        entry.history.unshift({
            action,
            quantity: qty,
            availableQuantity: entry.availableQuantity,
            timestamp: now,
            metadata: meta
        });
        if (entry.history.length > 100) entry.history.length = 100;

        warehouses[warehouseId][productId] = entry;
        saveWarehouses(warehouses);
        return { success: true, data: entry };
    } catch (error) {
        return { success: false, error: error.message || 'WAREHOUSE_UPDATE_FAILED' };
    }
}

export function getStockStatistics() {
    const transfers = loadTransfers();
    const warehouses = loadWarehouses();

    const pendingTransfers = transfers.filter(tr => ['pending', 'dispatched'].includes(tr.status)).length;

    let lowStockProducts = 0;
    Object.values(warehouses).forEach(products => {
        Object.values(products).forEach(entry => {
            const quantity = Number(entry.quantity || 0);
            const reserved = Number(entry.reservedQuantity || 0);
            const reorder = Number(entry.reorderLevel || 10);
            if (quantity - reserved <= reorder) {
                lowStockProducts += 1;
            }
        });
    });

    return {
        success: true,
        data: {
            pendingTransfers,
            lowStockProducts
        }
    };
}

export function seedDemoData() {
    const now = nowIso();
    if (loadRequests().length === 0) {
        createStockRequest({
            branch: 'windhoek_branch',
            type: 'sales_replenishment',
            priority: 'normal',
            items: [
                { productId: 'SPIRULINA', description: 'Spirulina 500mg', quantity: 120 },
                { productId: 'OMEGA3', description: 'Omega 3 Premium', quantity: 60 }
            ],
            notes: 'Auto-seeded request'
        });
    }
    if (loadTransfers().length === 0) {
        createTransfer({
            requestNumber: 'SRQ-WINDHOEK-1',
            fromWarehouse: 'warehouse-windhoek',
            toBranch: 'branch-windhoek',
            items: [
                { productId: 'SPIRULINA', description: 'Spirulina 500mg', quantity: 80 },
                { productId: 'OMEGA3', description: 'Omega 3 Premium', quantity: 40 }
            ]
        });
    }
    const warehouses = loadWarehouses();
    if (!warehouses['warehouse-windhoek']) {
        updateWarehouseStock('warehouse-windhoek', 'SPIRULINA', 500, 'in', { seed: true });
        updateWarehouseStock('warehouse-windhoek', 'OMEGA3', 250, 'in', { seed: true });
        updateWarehouseStock('warehouse-ondangwa', 'SPIRULINA', 200, 'in', { seed: true });
    }
    broadcast({ scope: 'seed' });
    return { success: true };
}

export default {
    createStockRequest,
    getStockRequests,
    updateStockRequest,
    forwardStockRequestToGM,
    approveStockRequest,
    getStockTransfers,
    createTransfer,
    updateTransferStatus,
    getWarehouseStock,
    updateWarehouseStock,
    getStockStatistics,
    getDispatchNotes,
    updateDispatchNoteStatus,
    seedDemoData
};

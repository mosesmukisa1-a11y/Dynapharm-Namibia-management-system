const cache = {
  warehouses: [],
  inventoryByWarehouse: new Map(),
  requests: [],
  transfers: [],
  dispatchNotes: [],
  stats: {
    pendingTransfers: 0,
    lowStockProducts: 0,
  },
};

function normalizeFetchError(error) {
  return {
    success: false,
    error: error?.message || 'Request failed',
  };
}

async function apiFetch(path, { method = 'GET', body, headers = {} } = {}) {
  const options = {
    method,
    credentials: 'include',
    headers: {
      ...headers,
    },
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
    options.headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, options);
  if (!response.ok) {
    const message = `HTTP ${response.status} ${response.statusText}`;
    throw new Error(message);
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await response.json();
  }
  return null;
}

function computeStats() {
  const pendingTransfers = cache.transfers.filter((tr) =>
    ['pending', 'dispatched'].includes((tr.status || '').toLowerCase())
  ).length;

  let lowStockProducts = 0;
  cache.inventoryByWarehouse.forEach((items) => {
    items.forEach((item) => {
      const available = Number(item.availableQuantity ?? item.quantity ?? 0);
      const reorder = Number(item.reorderLevel ?? 0);
      if (available <= reorder) {
        lowStockProducts += 1;
      }
    });
  });

  cache.stats = { pendingTransfers, lowStockProducts };
}

function mapInventoryResponse(inventory = []) {
  return inventory.map((item) => {
    const quantity = Number(item.quantity ?? 0);
    const reserved = Number(item.reservedQuantity ?? item.reserved_quantity ?? 0);
    return {
      id: item.id || null,
      warehouseId: item.warehouseId || item.warehouse_id,
      productId: item.productId || item.product_id || item.productName || 'UNKNOWN',
      productName: item.productName || item.product_name || item.productId || 'Item',
      batchNo: item.batchNo || item.batch_no || null,
      expiryDate: item.expiryDate || item.expiry_date || null,
      quantity,
      reservedQuantity: reserved,
      availableQuantity: Number.isFinite(quantity - reserved) ? quantity - reserved : quantity,
      reorderLevel: Number(item.reorderLevel ?? item.reorder_level ?? 0),
      unit: item.unit || 'units',
      status: item.status || 'available',
      metadata: item.metadata || null,
      updatedAt: item.updatedAt || item.updated_at || null,
    };
  });
}

export async function refreshStockData() {
  try {
    const [warehousesResp, requestsResp, transfersResp] = await Promise.all([
      apiFetch('/api/warehouses'),
      apiFetch('/api/stock-requests?status=all'),
      apiFetch('/api/stock/transfers?status=all'),
    ]);

    cache.warehouses = Array.isArray(warehousesResp?.warehouses) ? warehousesResp.warehouses : [];

    const inventoryEntries = await Promise.all(
      cache.warehouses.map(async (warehouse) => {
        try {
          const resp = await apiFetch(`/api/warehouse/inventory?warehouse=${encodeURIComponent(warehouse.id)}`);
          const inventory = mapInventoryResponse(resp?.inventory || []);
          return [warehouse.id, inventory];
        } catch (error) {
          console.warn('Failed to load warehouse inventory', warehouse.id, error);
          return [warehouse.id, []];
        }
      })
    );
    cache.inventoryByWarehouse = new Map(inventoryEntries);

    cache.requests = Array.isArray(requestsResp?.requests) ? requestsResp.requests : [];
    cache.transfers = Array.isArray(transfersResp?.transfers) ? transfersResp.transfers : [];
    cache.dispatchNotes = cache.transfers
      .map((tr) => tr.dispatchNote)
      .filter(Boolean);

    computeStats();

    return { success: true };
  } catch (error) {
    console.error('refreshStockData error:', error);
    return normalizeFetchError(error);
  }
}

export function getWarehouses() {
  return [...cache.warehouses];
}

export function getWarehouseStock(warehouseId) {
  const items = cache.inventoryByWarehouse.get(warehouseId) || [];
  const result = {};
  items.forEach((item) => {
    const key = item.productId || item.productName || 'UNKNOWN';
    result[key] = {
      productId: key,
      productName: item.productName,
      quantity: item.quantity,
      reservedQuantity: item.reservedQuantity,
      availableQuantity: item.availableQuantity,
      reorderLevel: item.reorderLevel,
      unit: item.unit,
      status: item.status,
      updatedAt: item.updatedAt,
      metadata: item.metadata,
    };
  });
  return { success: true, data: result };
}

export function getStockStatistics() {
  return { success: true, data: { ...cache.stats } };
}

export function getStockRequests(filters = {}) {
  const branch = filters.branch && filters.branch !== 'all'
    ? String(filters.branch).toLowerCase()
    : null;
  const status = filters.status && filters.status !== 'all'
    ? String(filters.status).toLowerCase()
    : null;

  const data = cache.requests.filter((req) => {
    if (branch && String(req.requestingBranch || '').toLowerCase() !== branch) {
      return false;
    }
    if (status && String(req.status || '').toLowerCase() !== status) {
      return false;
    }
    return true;
  });

  return { success: true, data };
}

export function getStockTransfers(filters = {}) {
  const status = filters.status && filters.status !== 'all'
    ? String(filters.status).toLowerCase()
    : null;
  const toBranch = filters.toBranch && filters.toBranch !== 'all'
    ? String(filters.toBranch).toLowerCase()
    : null;
  const fromWarehouse = filters.fromWarehouse && filters.fromWarehouse !== 'all'
    ? String(filters.fromWarehouse).toLowerCase()
    : null;

  const data = cache.transfers.filter((tr) => {
    if (status && String(tr.status || '').toLowerCase() !== status) {
      return false;
    }
    if (toBranch && String(tr.toBranch || '').toLowerCase() !== toBranch) {
      return false;
    }
    if (fromWarehouse && String(tr.fromWarehouse || '').toLowerCase() !== fromWarehouse) {
      return false;
    }
    return true;
  });

  return { success: true, data };
}

export function getDispatchNotes(filters = {}) {
  const toBranch = filters.toBranch && filters.toBranch !== 'all'
    ? String(filters.toBranch).toLowerCase()
    : null;
  const fromWarehouse = filters.fromWarehouse && filters.fromWarehouse !== 'all'
    ? String(filters.fromWarehouse).toLowerCase()
    : null;
  const status = filters.status && filters.status !== 'all'
    ? String(filters.status).toLowerCase()
    : null;
  const transferId = filters.transferId || null;
  const requestNumber = filters.requestNumber || null;

  const data = cache.dispatchNotes.filter((note) => {
    if (toBranch && String(note.toBranch || '').toLowerCase() !== toBranch) {
      return false;
    }
    if (fromWarehouse && String(note.fromWarehouse || '').toLowerCase() !== fromWarehouse) {
      return false;
    }
    if (status && String(note.status || '').toLowerCase() !== status) {
      return false;
    }
    if (transferId && note.transferId !== transferId) {
      return false;
    }
    if (requestNumber && note.requestNumber !== requestNumber) {
      return false;
    }
    return true;
  });

  return { success: true, data };
}

function normalizeRequestItems(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      productId: item.productId || item.id || item.sku || item.description || 'UNKNOWN',
      productName: item.productName || item.description || item.name || item.productId || 'Item',
      quantity: Number(item.quantity ?? item.qty ?? 0),
      unit: item.unit || item.uom || 'units',
      metadata: item.metadata || null,
    }))
    .filter((item) => Number.isFinite(item.quantity) && item.quantity > 0);
}

async function fetchRequestById(id) {
  const response = await apiFetch(`/api/stock-requests?id=${encodeURIComponent(id)}`);
  const list = Array.isArray(response?.requests) ? response.requests : [];
  return list[0] || null;
}

function findRequestInCache(id) {
  return cache.requests.find((req) => req.id === id || req.requestNumber === id) || null;
}

function nextStatus(currentStatus, approved = true) {
  const status = (currentStatus || '').toLowerCase();
  if (approved === false) {
    return 'rejected';
  }
  switch (status) {
    case 'pending_stock_review':
      return 'pending_gm';
    case 'pending_gm':
      return 'pending_warehouse';
    case 'pending_warehouse':
      return 'approved';
    case 'pending':
      return 'pending_gm';
    default:
      return status || 'pending';
  }
}

export async function createStockRequest(payload = {}) {
  try {
    const body = {
      branch: payload.branch || payload.requestingBranch,
      requestType: payload.type || payload.requestType || 'sales_replenishment',
      priority: payload.priority || 'normal',
      status: payload.status || 'pending',
      items: normalizeRequestItems(payload.items),
      notes: payload.notes || '',
      requestedBy: payload.requestedBy || payload.createdBy || null,
      data: payload.data || null,
      returnDate: payload.returnDate || null,
    };

    const response = await apiFetch('/api/stock-requests', { method: 'POST', body });
    return { success: true, data: response?.request || null };
  } catch (error) {
    console.error('createStockRequest failed:', error);
    return normalizeFetchError(error);
  }
}

export async function updateStockRequest(id, updates = {}) {
  try {
    const body = {
      id,
      ...updates,
    };
    if (updates.items) {
      body.items = normalizeRequestItems(updates.items);
    }
    if (updates.reviewedBy) {
      body.reviewed_by = updates.reviewedBy;
    }
    if (updates.notes !== undefined) {
      body.notes = updates.notes;
    }

    const response = await apiFetch('/api/stock-requests', { method: 'PUT', body });
    return { success: true, data: response?.request || null };
  } catch (error) {
    console.error('updateStockRequest failed:', error);
    return normalizeFetchError(error);
  }
}

export async function forwardStockRequestToGM(id, meta = {}) {
  return await updateStockRequest(id, {
    status: 'pending_gm',
    reviewedBy: meta.reviewedBy || meta.actor || null,
    notes: meta.notes || '',
  });
}

export async function approveStockRequest(id, options = {}) {
  try {
    const request = findRequestInCache(id) || (await fetchRequestById(id));
    if (!request) {
      return { success: false, error: 'NOT_FOUND' };
    }
    const approved = options.approved !== false;
    const status = nextStatus(request.status, approved);
    const body = {
      id: request.id,
      status,
      approval: {
        role: options.approverRole || 'manager',
        approved,
        actor: options.approvedBy || options.actor || null,
        notes: options.notes || '',
        metadata: options.metadata || null,
      },
      approved_by: approved ? (options.approvedBy || options.actor || null) : request.approvedBy || null,
      approved_at: approved ? new Date().toISOString() : request.approvedAt || null,
    };

    const response = await apiFetch('/api/stock-requests', { method: 'PUT', body });
    return { success: true, data: response?.request || null };
  } catch (error) {
    console.error('approveStockRequest failed:', error);
    return normalizeFetchError(error);
  }
}

export async function updateTransferStatus(id, status, meta = {}) {
  try {
    const actor =
      meta.user?.fullName ||
      meta.user?.name ||
      meta.user ||
      meta.actor ||
      null;

    const body = {
      id,
      status,
      dispatchNotes: meta.dispatchNotes || null,
      dispatchMeta: meta.dispatchMeta || {},
    };

    if (status === 'dispatched') {
      body.dispatchedBy = actor;
    } else if (status === 'delivered') {
      body.deliveredBy = actor;
    } else if (status === 'received') {
      body.receivedBy = actor;
    }

    if (meta.metadata) {
      body.metadata = meta.metadata;
    }
    if (meta.dispatchedAt) {
      body.dispatchedAt = meta.dispatchedAt;
    }
    if (meta.deliveredAt) {
      body.deliveredAt = meta.deliveredAt;
    }
    if (meta.receivedAt) {
      body.receivedAt = meta.receivedAt;
    }

    const response = await apiFetch('/api/stock/transfers', { method: 'PUT', body });
    return { success: true, data: response?.transfer || null };
  } catch (error) {
    console.error('updateTransferStatus failed:', error);
    return normalizeFetchError(error);
  }
}

export async function createStockTransfer(payload = {}) {
  try {
    const body = {
      requestId: payload.requestId || null,
      requestNumber: payload.requestNumber || null,
      fromWarehouse: payload.fromWarehouse || null,
      toBranch: payload.toBranch,
      status: payload.status || 'pending',
      items: normalizeRequestItems(payload.items || []),
      metadata: payload.metadata || null,
      dispatchNotes: payload.dispatchNotes || null,
    };
    if (payload.dispatchedBy) {
      body.dispatchedBy = payload.dispatchedBy;
    }
    if (payload.dispatchedAt) {
      body.dispatchedAt = payload.dispatchedAt;
    }
    if (payload.createdBy) {
      body.createdBy = payload.createdBy;
    }
    if (payload.dispatchMeta) {
      body.dispatchMeta = payload.dispatchMeta;
    }
    const response = await apiFetch('/api/stock/transfers', { method: 'POST', body });
    return { success: true, data: response?.transfer || null };
  } catch (error) {
    console.error('createStockTransfer failed:', error);
    return normalizeFetchError(error);
  }
}

export async function getTransferById(id) {
  if (!id) return { success: false, error: 'MISSING_ID' };
  const cached = cache.transfers.find((tr) => tr.id === id);
  if (cached) {
    return { success: true, data: cached };
  }
  try {
    const response = await apiFetch(`/api/stock/transfers?id=${encodeURIComponent(id)}`);
    const transfer = Array.isArray(response?.transfers) ? response.transfers[0] : null;
    if (transfer) {
      const existingIndex = cache.transfers.findIndex((tr) => tr.id === transfer.id);
      if (existingIndex >= 0) {
        cache.transfers.splice(existingIndex, 1, transfer);
      } else {
        cache.transfers.unshift(transfer);
      }
      computeStats();
    }
    return { success: true, data: transfer };
  } catch (error) {
    console.error('getTransferById failed:', error);
    return normalizeFetchError(error);
  }
}

export async function getInventoryMovements(filters = {}) {
  try {
    const params = new URLSearchParams();
    params.set('includeMovements', '1');

    if (filters.warehouse && filters.warehouse !== 'all') {
      params.set('warehouse', filters.warehouse);
    }
    if (filters.productId) {
      params.set('productId', filters.productId);
    } else if (filters.productName) {
      params.set('productName', filters.productName);
    }
    if (filters.type && filters.type !== 'all') {
      params.set('types', filters.type);
    }
    if (filters.from) {
      params.set('from', filters.from);
    }
    if (filters.to) {
      params.set('to', filters.to);
    }
    if (filters.limit) {
      params.set('limit', filters.limit);
    }

    const response = await apiFetch(`/api/warehouse/inventory?${params.toString()}`);
    const movements = Array.isArray(response?.movements) ? response.movements : [];
    return { success: true, data: movements };
  } catch (error) {
    console.error('getInventoryMovements failed:', error);
    return normalizeFetchError(error);
  }
}



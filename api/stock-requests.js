import { applyAuthCors } from './_lib/auth.js';
import { query, getMany, getOne, insert, update, remove, publishRealtimeEvent } from './db.js';

function safeParseJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }

  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const quantity = Number(raw.quantity ?? raw.qty ?? 0);
  return {
    productId: raw.productId || raw.id || raw.sku || raw.description || 'UNKNOWN',
    productName: raw.productName || raw.description || raw.name || raw.productId || 'Item',
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unit: raw.unit || raw.uom || 'units',
    metadata: raw.metadata || null,
  };
}

function parseItemsInput(items) {
  if (!items) return [];
  if (typeof items === 'string') {
    try {
      return parseItemsInput(JSON.parse(items));
    } catch (_) {
      return [];
    }
  }
  if (!Array.isArray(items)) return [];
  return items.map(normalizeItem).filter(Boolean).filter((item) => item.quantity > 0);
}

function parseHistory(history) {
  if (!history) return [];
  if (typeof history === 'string') {
    try {
      return parseHistory(JSON.parse(history));
    } catch (_) {
      return [];
    }
  }
  return Array.isArray(history) ? history : [];
}

async function replaceRequestItems(requestId, items) {
  await query('DELETE FROM stock_request_items WHERE request_id = $1', [requestId]);
  if (!Array.isArray(items) || items.length === 0) return;

  const rows = [];
  const params = [];
  items.forEach((item, index) => {
    const position = index * 6;
    rows.push(`($${position + 1}, $${position + 2}, $${position + 3}, $${position + 4}, $${position + 5}, $${position + 6})`);
    params.push(
      requestId,
      item.productId,
      item.productName || null,
      item.quantity,
      item.unit || 'units',
      item.metadata ? JSON.stringify(item.metadata) : null
    );
  });

  await query(
    `
      INSERT INTO stock_request_items
        (request_id, product_id, product_name, quantity, unit, metadata)
      VALUES ${rows.join(', ')}
    `,
    params
  );
}

async function appendApproval(requestId, approval) {
  if (!approval) return;
  await query(
    `
      INSERT INTO stock_request_approvals
        (request_id, role, approved, actor, notes, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [
      requestId,
      approval.role || 'manager',
      approval.approved !== false,
      approval.actor || null,
      approval.notes || null,
      approval.metadata ? JSON.stringify(approval.metadata) : null,
    ]
  );
}

async function loadItemsForRequests(requestIds) {
  if (!Array.isArray(requestIds) || requestIds.length === 0) return new Map();
  const rows = await getMany(
    `
      SELECT *
      FROM stock_request_items
      WHERE request_id = ANY($1::text[])
      ORDER BY created_at ASC
    `,
    [requestIds]
  );
  const map = new Map();
  rows.forEach((row) => {
    const item = {
      id: row.id,
      requestId: row.request_id,
      productId: row.product_id,
      productName: row.product_name,
      quantity: Number(row.quantity || 0),
      unit: row.unit || 'units',
      metadata: safeParseJson(row.metadata),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    };
    if (!map.has(row.request_id)) {
      map.set(row.request_id, []);
    }
    map.get(row.request_id).push(item);
  });
  return map;
}

async function loadApprovalsForRequests(requestIds) {
  if (!Array.isArray(requestIds) || requestIds.length === 0) return new Map();
  const rows = await getMany(
    `
      SELECT *
      FROM stock_request_approvals
      WHERE request_id = ANY($1::text[])
      ORDER BY created_at DESC
    `,
    [requestIds]
  );
  const map = new Map();
  rows.forEach((row) => {
    const approval = {
      id: row.id,
      role: row.role,
      approved: row.approved,
      actor: row.actor,
      notes: row.notes,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    metadata: safeParseJson(row.metadata),
    };
    if (!map.has(row.request_id)) {
      map.set(row.request_id, []);
    }
    map.get(row.request_id).push(approval);
  });
  return map;
}

function normalizeRequestRow(row, itemsMap, approvalsMap) {
  const parsedHistory = parseHistory(row.history || row.data?.history);
  const parsedItemsFromColumn = parseItemsInput(row.items);
  const items = itemsMap.get(row.id) || parsedItemsFromColumn;
  const approvals = approvalsMap.get(row.id) || [];

  return {
    id: row.id,
    requestNumber: row.request_number,
    requestingBranch: row.requesting_branch,
    requestType: row.request_type,
    priority: row.priority || 'normal',
    status: row.status,
    items,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at instanceof Date ? row.approved_at.toISOString() : row.approved_at,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at instanceof Date ? row.reviewed_at.toISOString() : row.reviewed_at,
    lastStatusChange: row.last_status_change instanceof Date ? row.last_status_change.toISOString() : row.last_status_change,
    history: parsedHistory,
    data: safeParseJson(row.data),
    approvals,
  };
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const method = req.method;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const branch = searchParams.get('branch');
  const status = searchParams.get('status');

  try {
    if (method === 'GET') {
      let queryText = 'SELECT * FROM stock_requests';
      const params = [];
      const conditions = [];
      
      if (id) {
        conditions.push('id = $' + (params.length + 1));
        params.push(id);
      }
      if (branch) {
        conditions.push('requesting_branch = $' + (params.length + 1));
        params.push(branch);
      }
      if (status) {
        conditions.push('status = $' + (params.length + 1));
        params.push(status);
      }
      
      if (conditions.length > 0) {
        queryText += ' WHERE ' + conditions.join(' AND ');
      }
      
      queryText += ' ORDER BY created_at DESC';
      
      const requests = await getMany(queryText, params);
      const ids = requests.map((row) => row.id);
      const [itemsMap, approvalsMap] = await Promise.all([
        loadItemsForRequests(ids),
        loadApprovalsForRequests(ids),
      ]);
      const normalized = requests.map((row) => normalizeRequestRow(row, itemsMap, approvalsMap));
      return res.json({ success: true, requests: normalized });
    }

    if (method === 'POST') {
      const body = await parseBody(req);
      
      if (Array.isArray(body)) {
        // Bulk insert
        const results = [];
        for (const req of body) {
          try {
            const items = parseItemsInput(req.items || req.itemsArray);
            const history = [
              {
                action: 'created',
                actor: req.created_by || req.createdBy || null,
                timestamp: new Date().toISOString(),
                status: req.status || 'pending',
                notes: req.notes || null,
              },
            ];

            const requestData = {
              id: req.id || `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              request_number: req.request_number || req.requestNumber,
              requesting_branch: req.requesting_branch || req.requestingBranch,
              request_type: req.request_type || req.requestType || null,
              status: req.status || 'pending',
              priority: req.priority || 'normal',
              items: JSON.stringify(items),
              notes: req.notes || null,
              created_by: req.created_by || req.createdBy || null,
              approved_by: req.approved_by || req.approvedBy || null,
              approved_at: req.approved_at || req.approvedAt || null,
              reviewed_by: req.reviewed_by || req.reviewedBy || null,
              reviewed_at: req.reviewed_at || req.reviewedAt || null,
              last_status_change: req.last_status_change || new Date().toISOString(),
              history: JSON.stringify(history),
              data: req.data ? (typeof req.data === 'string' ? req.data : JSON.stringify(req.data)) : null
            };
            
            Object.keys(requestData).forEach(key => {
              if (requestData[key] === undefined) delete requestData[key];
            });
            
            const result = await insert('stock_requests', requestData);
            await replaceRequestItems(result.id, items);
            results.push(result);
          } catch (error) {
            if (error.code !== '23505') {
              console.error('Error inserting stock request:', error);
            }
          }
        }
        
        if (results.length > 0) {
          await publishRealtimeEvent('stock_requests', 'create', results);
        }

        const ids = results.map((row) => row.id);
        const [itemsMap, approvalsMap] = await Promise.all([
          loadItemsForRequests(ids),
          loadApprovalsForRequests(ids),
        ]);
        const normalized = results.map((row) => normalizeRequestRow(row, itemsMap, approvalsMap));
        
        return res.json({ success: true, count: normalized.length, requests: normalized });
      } else {
        // Single insert
        const items = parseItemsInput(body.items || body.itemsArray);
        const historyEntry = {
          action: 'created',
          actor: body.created_by || body.createdBy || null,
          timestamp: new Date().toISOString(),
          status: body.status || 'pending',
          notes: body.notes || null,
        };

        const requestData = {
          id: body.id || `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          request_number: body.request_number || body.requestNumber,
          requesting_branch: body.requesting_branch || body.requestingBranch,
          request_type: body.request_type || body.requestType || null,
          status: body.status || 'pending',
          priority: body.priority || 'normal',
          items: JSON.stringify(items),
          notes: body.notes || null,
          created_by: body.created_by || body.createdBy || null,
          approved_by: body.approved_by || body.approvedBy || null,
          approved_at: body.approved_at || body.approvedAt || null,
          reviewed_by: body.reviewed_by || body.reviewedBy || null,
          reviewed_at: body.reviewed_at || body.reviewedAt || null,
          last_status_change: body.last_status_change || new Date().toISOString(),
          history: JSON.stringify([historyEntry]),
          data: body.data ? (typeof body.data === 'string' ? body.data : JSON.stringify(body.data)) : null
        };
        
        Object.keys(requestData).forEach(key => {
          if (requestData[key] === undefined) delete requestData[key];
        });
        
        const request = await insert('stock_requests', requestData);
        await replaceRequestItems(request.id, items);
        if (body.approval) {
          await appendApproval(request.id, body.approval);
        }
        await publishRealtimeEvent('stock_requests', 'create', request);
        const itemsMap = await loadItemsForRequests([request.id]);
        const approvalsMap = await loadApprovalsForRequests([request.id]);
        return res.json({ success: true, request: normalizeRequestRow(request, itemsMap, approvalsMap) });
      }
    }

    if (method === 'PUT') {
      const body = await parseBody(req);
      if (!body?.id) {
        return res.status(400).json({ error: 'id is required' });
      }

      const updatePayload = { ...body };
      delete updatePayload.items;
      delete updatePayload.itemsArray;
      delete updatePayload.approval;

      if (body.status) {
        updatePayload.last_status_change = new Date().toISOString();
      }

      const request = await update('stock_requests', body.id, updatePayload, 'id');

      if (body.items !== undefined || body.itemsArray !== undefined) {
        const normalizedItems = parseItemsInput(body.items || body.itemsArray);
        await replaceRequestItems(body.id, normalizedItems);
      }

      if (body.approval) {
        await appendApproval(body.id, body.approval);
      }

      await publishRealtimeEvent('stock_requests', 'update', request);
      const itemsMap = await loadItemsForRequests([body.id]);
      const approvalsMap = await loadApprovalsForRequests([body.id]);
      return res.json({ success: true, request: normalizeRequestRow(request, itemsMap, approvalsMap) });
    }

    if (method === 'DELETE') {
      await remove('stock_requests', id, 'id');
      await publishRealtimeEvent('stock_requests', 'delete', { id });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Stock Requests API error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      code: error.code || 'INTERNAL_ERROR'
    });
  }
}



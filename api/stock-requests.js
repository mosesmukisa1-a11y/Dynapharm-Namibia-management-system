import { applyAuthCors, getBranchScope } from './_lib/auth.js';
import { query, getMany, getOne, insert, update, remove, publishRealtimeEvent } from './db.js';
import { branchSearchTerms, branchSearchTermsForMany, normalizeBranchSlug } from './_lib/branchUtils.js';
import {atomicStockRequest} from './_lib/atomicStockRequest.js';

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
    productId: raw.productId || raw.product_id || raw.id || raw.sku || raw.description || 'UNKNOWN',
    productName: raw.productName || raw.product_name || raw.description || raw.name || raw.productId || raw.product_id || 'Item',
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unit: raw.unit || raw.uom || 'units',
    unitPrice: raw.unitPrice || raw.unit_price || raw.dp || null,
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
      SELECT sri.*,
             pp.dp AS dp_price,
             pp.cp AS cp_price,
             pp.description AS product_desc
      FROM stock_request_items sri
      LEFT JOIN live_product_prices pp
        ON LOWER(TRIM(pp.description)) = LOWER(TRIM(sri.product_name))
        OR LOWER(TRIM(pp.description)) = LOWER(TRIM(sri.product_id))
      WHERE sri.request_id = ANY($1::text[])
      ORDER BY sri.created_at ASC
    `,
    [requestIds]
  );
  const map = new Map();
  rows.forEach((row) => {
    const item = {
      id: row.id,
      requestId: row.request_id,
      productId: row.product_id,
      productName: row.product_name || row.product_desc,
      quantity: Number(row.quantity || 0),
      unit: row.unit || 'units',
      dp: row.dp_price != null ? Number(row.dp_price) : null,
      cp: row.cp_price != null ? Number(row.cp_price) : null,
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
    dispatchWarehouse: row.dispatch_warehouse || null,
    dispatchedBy: row.dispatched_by || null,
    dispatchedAt: row.dispatched_at instanceof Date ? row.dispatched_at.toISOString() : (row.dispatched_at || null),
    lastStatusChange: row.last_status_change instanceof Date ? row.last_status_change.toISOString() : row.last_status_change,
    history: parsedHistory,
    data: safeParseJson(row.data),
    approvals,
  };
}

async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const method = req.method;
  const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const id = searchParams.get('id');
  const requestedBranch = searchParams.get('branch');
  const status = searchParams.get('status');
  const branchScope = getBranchScope(req.user);

  try {
    if (method === 'GET') {
      let queryText = 'SELECT * FROM stock_requests';
      const params = [];
      const conditions = [];
      
      if (id) {
        conditions.push('id = $' + (params.length + 1));
        params.push(id);
      }
      if (branchScope.enforced) {
        const terms = branchSearchTermsForMany(branchScope.branches);
        params.push(terms);
        conditions.push(`LOWER(requesting_branch) = ANY($${params.length}::text[])`);
      } else if (requestedBranch) {
        const terms = branchSearchTerms(requestedBranch);
        params.push(terms.length > 0 ? terms : [requestedBranch.trim().toLowerCase()]);
        conditions.push(`LOWER(requesting_branch) = ANY($${params.length}::text[])`);
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
      const actor=req.user.id || req.user.sub || req.user.username;
      if(!actor || !['admin','gm','director','stock','warehouse','branch_manager','dispenser','superadmin','super_admin'].includes(String(req.user.role).toLowerCase()))
        return res.status(403).json({error:'Stock request creation access required'});
      for(const entry of Array.isArray(body)?body:[body]){
        if(!entry || (entry.status && entry.status!=='pending'))
          return res.status(409).json({error:'New requests must be pending; use the authorized review workflow'});
        const branch=normalizeBranchSlug(entry.requesting_branch || entry.requestingBranch || entry.branch || '') || entry.requesting_branch;
        if(!branch)return res.status(400).json({error:'Requesting branch is required'});
        if(branchScope.enforced && !branchSearchTerms(branch).some(t=>branchSearchTermsForMany(branchScope.branches).includes(t)))
          return res.status(403).json({error:'Access denied: cannot create stock requests for this branch'});
        for(const key of ['approved_by','approvedBy','approved_at','approvedAt','reviewed_by','reviewedBy','reviewed_at','reviewedAt','history','last_status_change'])delete entry[key];
        entry.created_by=actor;entry.createdBy=actor;entry.status='pending';entry.requesting_branch=branch;
      }
      
      if (Array.isArray(body)) {
        // Bulk insert — skip entries for branches outside user's scope
        const results = [];
        for (const req of body) {
          try {
            if (branchScope.enforced) {
              const reqBranch = (req.requesting_branch || req.requestingBranch || '').replace(/_/g, ' ').toLowerCase();
              const allowed = branchScope.branches.map(b => b.replace(/_/g, ' ').toLowerCase());
              if (!allowed.includes(reqBranch)) continue;
            }
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
            throw error; // The entire bulk request must roll back, not silently skip a failed row.
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
        const rawBranch = body.requesting_branch || body.requestingBranch || body.branch || 'stock_manager';
        // Normalize to canonical slug so all data lands under the same key regardless of input variant
        const singleBranch = normalizeBranchSlug(rawBranch) || rawBranch;
        if (branchScope.enforced) {
          const allowedTerms = new Set(branchSearchTermsForMany(branchScope.branches));
          const requestTerms = branchSearchTerms(singleBranch);
          const allowed = requestTerms.some(t => allowedTerms.has(t));
          if (!allowed) {
            return res.status(403).json({ success: false, error: 'Access denied: cannot create stock requests for this branch' });
          }
        }
        const historyEntry = {
          action: 'created',
          actor: req.user.id || req.user.sub || req.user.username,
          timestamp: new Date().toISOString(),
          status: body.status || 'pending',
          notes: body.notes || null,
        };

        const requestData = {
          id: body.id || `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          request_number: body.request_number || body.requestNumber,
          requesting_branch: singleBranch,
          request_type: body.request_type || body.requestType || null,
          status: body.status || 'pending',
          priority: body.priority || 'normal',
          items: JSON.stringify(items),
          notes: body.notes || null,
          created_by: req.user.id || req.user.sub || req.user.username,
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
      const role=String(req.user.role || '').toLowerCase();
      if(!['admin','gm','director','stock','warehouse','branch_manager','dispenser','superadmin','super_admin'].includes(role))
        return res.status(403).json({error:'Stock request update access required'});
      const managers=['admin','gm','director','superadmin','super_admin'];
      if(body.approval && (![...managers,'stock','warehouse'].includes(role) || !['approved','rejected','reviewed','dispatched'].includes(body.status)))
        return res.status(403).json({error:'Approval evidence requires an authorized review transition'});
      if(body.status && !['pending','approved','rejected','reviewed','dispatched','partially_dispatched','in_transit','received','cancelled'].includes(body.status))
        return res.status(422).json({error:'Unsupported request status'});
      if(['reviewed','dispatched','partially_dispatched','in_transit'].includes(body.status) && ![...managers,'stock','warehouse'].includes(role))
        return res.status(403).json({error:'Stock dispatch access required'});
      if((body.status==='approved' && !managers.includes(role)) ||
         (body.status==='rejected' && ![...managers,'stock','warehouse'].includes(role)))
        return res.status(403).json({error:'Management approval access required'});
      if (!body?.id) {
        return res.status(400).json({ error: 'id is required' });
      }
      const locked=await getOne('SELECT * FROM stock_requests WHERE id=$1 FOR UPDATE',[body.id]);
      if(!locked)return res.status(404).json({error:'Stock request not found'});
      if(locked.status!=='pending' && (body.items!==undefined || body.itemsArray!==undefined))
        return res.status(409).json({error:'Reviewed request items must be retained; create a new request'});
      if(['received','cancelled'].includes(locked.status) && body.status && body.status!==locked.status)
        return res.status(409).json({error:'Completed requests cannot be reopened through a status update'});

      if (branchScope.enforced) {
        const existing = await getOne('SELECT requesting_branch FROM stock_requests WHERE id = $1', [body.id]);
        if (existing) {
          const existingTerms = new Set(branchSearchTerms(existing.requesting_branch || ''));
          const allowedTerms = new Set(branchSearchTermsForMany(branchScope.branches));
          const isAllowed = [...existingTerms].some(t => allowedTerms.has(t));
          if (!isAllowed) {
            return res.status(403).json({ error: 'Access denied' });
          }
        }
      }

      // Idempotency guard: reject transition to 'received' if already received
      if (body.status === 'received') {
        const current = await getOne('SELECT status FROM stock_requests WHERE id = $1', [body.id]);
        if (current?.status === 'received') {
          return res.status(409).json({ error: 'This stock request has already been received.' });
        }
      }

      const editable=['status','notes','priority','rejection_reason','dispatch_warehouse','data'];
      const updatePayload = Object.fromEntries(editable.filter(key=>body[key]!==undefined).map(key=>[key,body[key]]));
      delete updatePayload.items;
      delete updatePayload.itemsArray;
      delete updatePayload.approval;
      // Never trust an actor or audit timestamp supplied by the browser.
      const actor = req.user.id || req.user.sub || req.user.username;
      if (!actor) return res.status(403).json({ error: 'Authenticated actor identity required' });
      updatePayload.updated_by = actor;
      delete updatePayload.last_status_change;
      delete updatePayload.rejected_by;
      delete updatePayload.rejected_at;

      if (body.status && body.status!==locked.status) {
        updatePayload.last_status_change = new Date().toISOString();
      }

      // Set rejected_at timestamp when status transitions to rejected
      if (body.status === 'rejected' && locked.status!=='rejected') {
        updatePayload.rejected_at = new Date().toISOString();
        updatePayload.rejected_by = actor;
      }
      if(body.status==='approved' && locked.status!=='approved'){
        updatePayload.approved_by=actor;
        updatePayload.approved_at=new Date().toISOString();
      }
      if(body.status==='dispatched' && locked.status!=='dispatched'){
        updatePayload.dispatched_by=actor;
        updatePayload.dispatched_at=new Date().toISOString();
      }
      if(body.approval) body.approval={...body.approval,actor,role,approved:body.status!=='rejected'};

      const request = await update('stock_requests', body.id, updatePayload, 'id');

      if (body.items !== undefined || body.itemsArray !== undefined) {
        const normalizedItems = parseItemsInput(body.items || body.itemsArray);
        await replaceRequestItems(body.id, normalizedItems);
      }

      if (body.approval && (!body.status || body.status!==locked.status)) {
        await appendApproval(body.id, body.approval);
      }

      await publishRealtimeEvent('stock_requests', 'update', request);
      const itemsMap = await loadItemsForRequests([body.id]);
      const approvalsMap = await loadApprovalsForRequests([body.id]);
      return res.json({ success: true, request: normalizeRequestRow(request, itemsMap, approvalsMap) });
    }

    if (method === 'DELETE') {
      const actor=req.user.id || req.user.sub || req.user.username;
      if(!actor || !['admin','gm','director','stock','warehouse','branch_manager','dispenser','superadmin','super_admin'].includes(String(req.user.role).toLowerCase()))
        return res.status(403).json({error:'Stock request cancellation access required'});
      if(!id)return res.status(400).json({error:'id is required'});
      const locked=await getOne('SELECT * FROM stock_requests WHERE id=$1 FOR UPDATE',[id]);
      if(!locked)return res.status(404).json({error:'Stock request not found'});
      if (branchScope.enforced && id) {
        const existing = await getOne('SELECT requesting_branch FROM stock_requests WHERE id = $1', [id]);
        if (existing) {
          const existingTerms = new Set(branchSearchTerms(existing.requesting_branch || ''));
          const allowedTerms = new Set(branchSearchTermsForMany(branchScope.branches));
          const isAllowed = [...existingTerms].some(t => allowedTerms.has(t));
          if (!isAllowed) {
            return res.status(403).json({ error: 'Access denied' });
          }
        }
      }
      if(!['pending','cancelled'].includes(locked.status))
        return res.status(409).json({error:'Reviewed requests must be retained with their audit history'});
      if(locked.status!=='cancelled'){
        await query("UPDATE stock_requests SET status='cancelled',updated_by=$2,last_status_change=NOW(),updated_at=NOW(),history=COALESCE(history,'[]'::jsonb) || $3::jsonb WHERE id=$1",
          [id,actor,JSON.stringify([{action:'cancelled',actor,timestamp:new Date().toISOString(),status:'cancelled'}])]);
        await publishRealtimeEvent('stock_requests','update',{id,status:'cancelled'});
      }
      return res.json({ success: true, retained:true, status:'cancelled' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Stock Requests API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default atomicStockRequest(handler);



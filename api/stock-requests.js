import { query, getMany, getOne, insert, update, remove, publishRealtimeEvent } from './db.js';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

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
      return res.json(requests);
    }

    if (method === 'POST') {
      const body = await req.json();
      
      if (Array.isArray(body)) {
        // Bulk insert
        const results = [];
        for (const req of body) {
          try {
            const requestData = {
              id: req.id || `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              request_number: req.request_number || req.requestNumber,
              requesting_branch: req.requesting_branch || req.requestingBranch,
              request_type: req.request_type || req.requestType || null,
              status: req.status || 'pending',
              items: req.items ? (typeof req.items === 'string' ? req.items : JSON.stringify(req.items)) : '[]',
              notes: req.notes || null,
              created_by: req.created_by || req.createdBy || null,
              approved_by: req.approved_by || req.approvedBy || null,
              approved_at: req.approved_at || req.approvedAt || null,
              data: req.data ? (typeof req.data === 'string' ? req.data : JSON.stringify(req.data)) : null
            };
            
            Object.keys(requestData).forEach(key => {
              if (requestData[key] === undefined) delete requestData[key];
            });
            
            const result = await insert('stock_requests', requestData);
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
        
        return res.json({ success: true, count: results.length, requests: results });
      } else {
        // Single insert
        const requestData = {
          id: body.id || `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          request_number: body.request_number || body.requestNumber,
          requesting_branch: body.requesting_branch || body.requestingBranch,
          request_type: body.request_type || body.requestType || null,
          status: body.status || 'pending',
          items: body.items ? (typeof body.items === 'string' ? body.items : JSON.stringify(body.items)) : '[]',
          notes: body.notes || null,
          created_by: body.created_by || body.createdBy || null,
          approved_by: body.approved_by || body.approvedBy || null,
          approved_at: body.approved_at || body.approvedAt || null,
          data: body.data ? (typeof body.data === 'string' ? body.data : JSON.stringify(body.data)) : null
        };
        
        Object.keys(requestData).forEach(key => {
          if (requestData[key] === undefined) delete requestData[key];
        });
        
        const request = await insert('stock_requests', requestData);
        await publishRealtimeEvent('stock_requests', 'create', request);
        return res.json(request);
      }
    }

    if (method === 'PUT') {
      const body = await req.json();
      const request = await update('stock_requests', body.id, body, 'id');
      await publishRealtimeEvent('stock_requests', 'update', request);
      return res.json(request);
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



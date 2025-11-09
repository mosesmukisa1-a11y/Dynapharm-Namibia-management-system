import { applyAuthCors } from './_lib/auth.js';
import { getMany, getOne, insert, update, remove, publishRealtimeEvent } from './db.js';

async function parseRequestBody(req) {
  if (req.body) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body || '{}');
      } catch (error) {
        throw new Error('Invalid JSON payload');
      }
    }
    return req.body;
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

function normalizeClient(row) {
  if (!row) return null;
  const payload =
    typeof row.data === 'string'
      ? (() => {
          try {
            return JSON.parse(row.data);
          } catch {
            return {};
          }
        })()
      : row.data || {};

  return {
    id: row.id || payload.id || row.reference_number || payload.referenceNumber || `CLT-${Date.now()}`,
    referenceNumber: row.reference_number || payload.referenceNumber || row.id,
    fullName: row.full_name || payload.fullName || '',
    phone: row.phone || payload.phone || '',
    email: row.email || payload.email || '',
    gender: row.gender || payload.gender || null,
    dateOfBirth: row.date_of_birth || payload.dateOfBirth || payload.date_of_birth || null,
    address: row.address || payload.address || '',
    city: row.city || payload.city || '',
    branch: row.branch || payload.branch || null,
    createdAt: row.created_at || payload.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || payload.updatedAt || null,
    data: payload
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
  const reference = searchParams.get('reference');
  const phone = searchParams.get('phone');
  const branch = searchParams.get('branch');
  const search = searchParams.get('search');

  try {
    if (method === 'GET') {
      if (id) {
        const client = await getOne('SELECT * FROM clients WHERE id = $1', [id]);
        if (!client) {
          return res.status(404).json({ error: 'Client not found' });
        }
        return res.json(normalizeClient(client));
      } else if (reference) {
        const client = await getOne('SELECT * FROM clients WHERE reference_number = $1', [reference]);
        if (!client) {
          return res.status(404).json({ error: 'Client not found' });
        }
        return res.json(normalizeClient(client));
      } else if (phone) {
        const clients = await getMany('SELECT * FROM clients WHERE phone = $1 ORDER BY created_at DESC', [phone]);
        return res.json(clients.map(normalizeClient).filter(Boolean));
      } else {
        let queryText = 'SELECT * FROM clients';
        const params = [];
        
        if (branch) {
          queryText += ' WHERE branch = $1';
          params.push(branch);
        }
        
        if (search) {
          queryText += branch ? ' AND' : ' WHERE';
          queryText += ' (full_name ILIKE $' + (params.length + 1) + ' OR phone ILIKE $' + (params.length + 1) + ' OR reference_number ILIKE $' + (params.length + 1) + ')';
          params.push(`%${search}%`);
        }
        
        queryText += ' ORDER BY created_at DESC';
        
        const clients = await getMany(queryText, params);
        return res.json(clients.map(normalizeClient).filter(Boolean));
      }
    }

    if (method === 'POST') {
      const body = await parseRequestBody(req);
      
      if (Array.isArray(body)) {
        // Bulk insert
        const results = [];
        for (const client of body) {
          try {
            const clientData = {
              id: client.id || client.reference_number || `CLT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              reference_number: client.reference_number || client.referenceNumber,
              full_name: client.full_name || client.fullName,
              phone: client.phone || null,
              email: client.email || null,
              gender: client.gender || null,
              date_of_birth: client.date_of_birth || client.dateOfBirth || null,
              address: client.address || null,
              city: client.city || null,
              branch: client.branch || null,
              data: client.data ? (typeof client.data === 'string' ? client.data : JSON.stringify(client.data)) : null
            };
            
            Object.keys(clientData).forEach(key => {
              if (clientData[key] === undefined) delete clientData[key];
            });
            
            const result = await insert('clients', clientData);
            results.push(normalizeClient(result));
          } catch (error) {
            if (error.code !== '23505') {
              console.error('Error inserting client:', error);
            }
          }
        }
        
        if (results.length > 0) {
          await publishRealtimeEvent('clients', 'create', results);
        }
        
        return res.json({ success: true, count: results.length, clients: results });
      } else {
        // Single insert
        const clientData = {
          id: body.id || body.reference_number || `CLT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          reference_number: body.reference_number || body.referenceNumber,
          full_name: body.full_name || body.fullName,
          phone: body.phone || null,
          email: body.email || null,
          gender: body.gender || null,
          date_of_birth: body.date_of_birth || body.dateOfBirth || null,
          address: body.address || null,
          city: body.city || null,
          branch: body.branch || null,
          data: body.data ? (typeof body.data === 'string' ? body.data : JSON.stringify(body.data)) : null
        };
        
        Object.keys(clientData).forEach(key => {
          if (clientData[key] === undefined) delete clientData[key];
        });
        
        const client = await insert('clients', clientData);
        const normalized = normalizeClient(client);
        await publishRealtimeEvent('clients', 'create', normalized);
        return res.status(201).json({ success: true, client: normalized });
      }
    }

    if (method === 'PUT') {
      const body = await parseRequestBody(req);
      if (!body?.id) {
        return res.status(400).json({ success: false, error: 'Client id is required' });
      }
      const client = await update('clients', body.id, body, 'id');
      const normalized = normalizeClient(client);
      await publishRealtimeEvent('clients', 'update', normalized);
      return res.json({ success: true, client: normalized });
    }

    if (method === 'DELETE') {
      await remove('clients', id, 'id');
      await publishRealtimeEvent('clients', 'delete', { id });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Clients API error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      code: error.code || 'INTERNAL_ERROR'
    });
  }
}



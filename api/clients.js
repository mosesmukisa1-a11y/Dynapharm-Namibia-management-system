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
        return res.json(client);
      } else if (reference) {
        const client = await getOne('SELECT * FROM clients WHERE reference_number = $1', [reference]);
        if (!client) {
          return res.status(404).json({ error: 'Client not found' });
        }
        return res.json(client);
      } else if (phone) {
        const clients = await getMany('SELECT * FROM clients WHERE phone = $1 ORDER BY created_at DESC', [phone]);
        return res.json(clients);
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
        return res.json(clients);
      }
    }

    if (method === 'POST') {
      const body = await req.json();
      
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
            results.push(result);
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
        await publishRealtimeEvent('clients', 'create', client);
        return res.json(client);
      }
    }

    if (method === 'PUT') {
      const body = await req.json();
      const client = await update('clients', body.id, body, 'id');
      await publishRealtimeEvent('clients', 'update', client);
      return res.json(client);
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



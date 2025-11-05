import { query, getMany, getOne, insert, update, remove, publishRealtimeEvent } from './db.js';

export default async function handler(req, res) {
  const method = req.method;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const code = searchParams.get('code');
  const search = searchParams.get('search');

  try {
    if (method === 'GET') {
      if (id) {
        // Get single distributor
        const distributor = await getOne('SELECT * FROM distributors WHERE id = $1', [id]);
        if (!distributor) {
          return res.status(404).json({ error: 'Distributor not found' });
        }
        return res.json(distributor);
      } else if (code) {
        // Get distributor by code
        const distributor = await getOne('SELECT * FROM distributors WHERE distributor_code = $1', [code]);
        if (!distributor) {
          return res.status(404).json({ error: 'Distributor not found' });
        }
        return res.json(distributor);
      } else {
        // Get all distributors
        let queryText = 'SELECT * FROM distributors';
        const params = [];
        
        if (search) {
          queryText += ' WHERE distributor_name ILIKE $1 OR distributor_code ILIKE $1';
          params.push(`%${search}%`);
        }
        
        queryText += ' ORDER BY distributor_name';
        
        const distributors = await getMany(queryText, params);
        return res.json(distributors);
      }
    }

    if (method === 'POST') {
      const body = await req.json();
      
      if (Array.isArray(body)) {
        // Bulk insert distributors
        const results = [];
        for (const dist of body) {
          try {
            const distributor = await insert('distributors', {
              id: dist.id || `DIST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              distributor_code: dist.distributor_code || dist.code,
              distributor_name: dist.distributor_name || dist.name,
              mobile_no: dist.mobile_no || dist.mobile || null,
              email: dist.email || null,
              commission_rate: dist.commission_rate || 0,
              status: dist.status || 'active',
              branch: dist.branch || null
            });
            results.push(distributor);
          } catch (error) {
            // Skip duplicates
            if (error.code !== '23505') { // Unique violation
              console.error('Error inserting distributor:', error);
            }
          }
        }
        
        if (results.length > 0) {
          await publishRealtimeEvent('distributors', 'create', results);
        }
        
        return res.json({ success: true, count: results.length, distributors: results });
      } else {
        // Create single distributor
        const distributor = await insert('distributors', {
          id: body.id || `DIST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          distributor_code: body.distributor_code || body.code,
          distributor_name: body.distributor_name || body.name,
          mobile_no: body.mobile_no || body.mobile || null,
          email: body.email || null,
          commission_rate: body.commission_rate || 0,
          status: body.status || 'active',
          branch: body.branch || null
        });
        
        await publishRealtimeEvent('distributors', 'create', distributor);
        return res.json(distributor);
      }
    }

    if (method === 'PUT') {
      const body = await req.json();
      const distributor = await update('distributors', body.id, body, 'id');
      await publishRealtimeEvent('distributors', 'update', distributor);
      return res.json(distributor);
    }

    if (method === 'DELETE') {
      await remove('distributors', id, 'id');
      await publishRealtimeEvent('distributors', 'delete', { id });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Distributors API error:', error);
    return res.status(500).json({ error: error.message });
  }
}


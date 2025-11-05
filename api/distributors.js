import { query, getMany, getOne, insert, update, remove, publishRealtimeEvent } from './db.js';

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

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
        // Create single distributor - only use valid table columns
        // Extract additional data (like _agreement_data) for potential future use
        const { _agreement_data, ...validFields } = body;
        
        const distributorData = {
          id: validFields.id || `DIST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          distributor_code: validFields.distributor_code || validFields.code,
          distributor_name: validFields.distributor_name || validFields.name,
          mobile_no: validFields.mobile_no || validFields.mobile || null,
          email: validFields.email || null,
          commission_rate: validFields.commission_rate || 0,
          status: validFields.status || 'active',
          branch: validFields.branch || null
        };
        
        // Remove any undefined values to avoid SQL errors
        Object.keys(distributorData).forEach(key => {
          if (distributorData[key] === undefined) {
            delete distributorData[key];
          }
        });
        
        const distributor = await insert('distributors', distributorData);
        
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
    // Return proper JSON error response
    const errorMessage = error.message || 'Internal server error';
    const errorCode = error.code || 'INTERNAL_ERROR';
    
    // Handle specific database errors
    if (error.code === '23505') {
      return res.status(409).json({ 
        error: 'Distributor code already exists',
        code: 'DUPLICATE_CODE',
        details: error.message 
      });
    }
    
    if (error.code === '23503') {
      return res.status(400).json({ 
        error: 'Invalid branch reference',
        code: 'FOREIGN_KEY_VIOLATION',
        details: error.message 
      });
    }
    
    return res.status(500).json({ 
      error: errorMessage,
      code: errorCode,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}


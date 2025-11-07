import { applyAuthCors } from './_lib/auth.js';
import { query, getMany, getOne, insert, update, remove, publishRealtimeEvent } from './db.js';

let distributorsTableChecked = false;

async function ensureDistributorsTable() {
  if (distributorsTableChecked) return;
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS distributors (
        id TEXT PRIMARY KEY,
        distributor_code TEXT UNIQUE,
        distributor_name TEXT NOT NULL,
        mobile_no TEXT,
        email TEXT,
        commission_rate NUMERIC DEFAULT 0,
        status TEXT DEFAULT 'active',
        branch TEXT,
        agreement_data JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await query('CREATE INDEX IF NOT EXISTS idx_distributors_name ON distributors (distributor_name)');
    await query('CREATE INDEX IF NOT EXISTS idx_distributors_status ON distributors (status)');
    distributorsTableChecked = true;
  } catch (error) {
    distributorsTableChecked = false;
    console.error('Failed to ensure distributors table', error);
  }
}

function normalizeAgreementData(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_) {
      return value;
    }
  }
  return value;
}

function prepareAgreementDataForInsert(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    // Ensure string contains valid JSON
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed);
    } catch (_) {
      return value;
    }
  }
  return JSON.stringify(value);
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const method = req.method;
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { searchParams } = requestUrl;
  const id = searchParams.get('id');
  const code = searchParams.get('code');
  const search = searchParams.get('search');
  const status = searchParams.get('status');
  const limit = searchParams.get('limit');

  try {
    await ensureDistributorsTable();

    if (method === 'GET') {
      if (id) {
        // Get single distributor
        const distributor = await getOne('SELECT * FROM distributors WHERE id = $1', [id]);
        if (!distributor) {
          return res.status(404).json({ error: 'Distributor not found' });
        }
        return res.json({ ...distributor, agreement_data: normalizeAgreementData(distributor.agreement_data) });
      } else if (code) {
        // Get distributor by code
        const distributor = await getOne('SELECT * FROM distributors WHERE distributor_code = $1', [code]);
        if (!distributor) {
          return res.status(404).json({ error: 'Distributor not found' });
        }
        return res.json({ ...distributor, agreement_data: normalizeAgreementData(distributor.agreement_data) });
      } else {
        // Get all distributors
        const params = [];
        const whereParts = [];

        if (search) {
          params.push(`%${search}%`);
          whereParts.push(`(distributor_name ILIKE $${params.length} OR distributor_code ILIKE $${params.length})`);
        }

        if (status) {
          params.push(status);
          whereParts.push(`status = $${params.length}`);
        }

        let queryText = 'SELECT * FROM distributors';
        if (whereParts.length > 0) {
          queryText += ` WHERE ${whereParts.join(' AND ')}`;
        }

        queryText += ' ORDER BY distributor_name';

        if (limit) {
          const parsedLimit = Number.parseInt(limit, 10);
          if (!Number.isNaN(parsedLimit) && parsedLimit > 0) {
            params.push(parsedLimit);
            queryText += ` LIMIT $${params.length}`;
          }
        }

        const distributors = await getMany(queryText, params);
        return res.json(distributors.map(d => ({
          ...d,
          agreement_data: normalizeAgreementData(d.agreement_data),
        })));
      }
    }

    if (method === 'POST') {
      const body = await req.json();
      
      if (Array.isArray(body)) {
        // Bulk insert distributors
        const results = [];
        for (const dist of body) {
          try {
            const distributorData = {
              id: dist.id || `DIST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              distributor_code: dist.distributor_code || dist.code,
              distributor_name: dist.distributor_name || dist.name,
              mobile_no: dist.mobile_no || dist.mobile || null,
              email: dist.email || null,
              commission_rate: dist.commission_rate || 0,
              status: dist.status || 'active',
              branch: dist.branch || null,
              // Store agreement data as JSON string (if provided)
              agreement_data: prepareAgreementDataForInsert(dist.agreement_data || dist.agreementData)
            };
            
            // Remove any undefined values to avoid SQL errors
            Object.keys(distributorData).forEach(key => {
              if (distributorData[key] === undefined) {
                delete distributorData[key];
              }
            });
            
            const distributor = await insert('distributors', distributorData);
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
        const distributorData = {
          id: body.id || `DIST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          distributor_code: body.distributor_code || body.code,
          distributor_name: body.distributor_name || body.name,
          mobile_no: body.mobile_no || body.mobile || null,
          email: body.email || null,
          commission_rate: body.commission_rate || 0,
          status: body.status || 'active',
          branch: body.branch || null,
          // Store agreement data as JSON string (if provided)
          agreement_data: prepareAgreementDataForInsert(body.agreement_data || body.agreementData)
        };
        
        // Remove any undefined values to avoid SQL errors
        Object.keys(distributorData).forEach(key => {
          if (distributorData[key] === undefined) {
            delete distributorData[key];
          }
        });
        
        const distributor = await insert('distributors', distributorData);
        
        await publishRealtimeEvent('distributors', 'create', distributor);
        return res.json({ ...distributor, agreement_data: normalizeAgreementData(distributor.agreement_data) });
      }
    }

    if (method === 'PUT') {
      const body = await req.json();
      const updatePayload = {
        ...body,
        agreement_data: prepareAgreementDataForInsert(body.agreement_data || body.agreementData || body.agreement_data_json),
        updated_at: new Date().toISOString(),
      };
      const distributor = await update('distributors', body.id, updatePayload, 'id');
      await publishRealtimeEvent('distributors', 'update', distributor);
      return res.json({ ...distributor, agreement_data: normalizeAgreementData(distributor.agreement_data) });
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


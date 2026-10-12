import { applyAuthCors, getBranchScope } from './_lib/auth.js';
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
    reference_number: row.reference_number || payload.referenceNumber || row.id,
    reference: row.reference_number || payload.referenceNumber || row.id,
    fullName: row.full_name || payload.fullName || '',
    full_name: row.full_name || payload.fullName || '',
    phone: row.phone || payload.phone || '',
    email: row.email || payload.email || '',
    gender: row.gender || payload.gender || null,
    dob: row.date_of_birth || payload.dob || payload.dateOfBirth || payload.date_of_birth || null,
    dateOfBirth: row.date_of_birth || payload.dateOfBirth || payload.date_of_birth || null,
    date_of_birth: row.date_of_birth || payload.dateOfBirth || payload.date_of_birth || null,
    address: row.address || payload.address || '',
    city: row.city || payload.city || '',
    branch: row.branch || payload.branch || null,
    height: row.height || payload.height || null,
    weight: row.weight || payload.weight || null,
    membershipStatus: payload.membershipStatus || payload.customer_type || null,
    membership_status: payload.membershipStatus || payload.customer_type || null,
    referralName: payload.referralName || payload.referral_name || null,
    referral_name: payload.referralName || payload.referral_name || null,
    referralNbNumber: payload.referralNbNumber || payload.referral_nb || null,
    referral_nb: payload.referralNbNumber || payload.referral_nb || null,
    primaryReason: row.primary_reason || payload.primaryReason || payload.primary_reason || null,
    primary_reason: row.primary_reason || payload.primaryReason || payload.primary_reason || null,
    waterIntake: row.water_intake || payload.waterIntake || payload.water_intake || null,
    water_intake: row.water_intake || payload.waterIntake || payload.water_intake || null,
    exerciseFreq: row.exercise_freq || payload.exerciseFreq || payload.exercise_freq || null,
    exercise_freq: row.exercise_freq || payload.exerciseFreq || payload.exercise_freq || null,
    sleepHours: row.sleep_hours || payload.sleepHours || payload.sleep_hours || null,
    sleep_hours: row.sleep_hours || payload.sleepHours || payload.sleep_hours || null,
    stressLevel: row.stress_level || payload.stressLevel || payload.stress_level || null,
    stress_level: row.stress_level || payload.stressLevel || payload.stress_level || null,
    currentMedications: row.current_medications || payload.currentMedications || payload.current_medications || null,
    medications: row.current_medications || payload.currentMedications || payload.medications || null,
    allergies: row.allergies || payload.allergies || null,
    medicalHistory: row.medical_history || payload.medicalHistory || payload.medical_history || null,
    medical_history: row.medical_history || payload.medicalHistory || payload.medical_history || null,
    symptoms: payload.symptoms || null,
    nbNumber: payload.nbNumber || payload.nb_number || null,
    nb_number: payload.nbNumber || payload.nb_number || null,
    createdAt: row.created_at || payload.createdAt || new Date().toISOString(),
    created_at: row.created_at || payload.createdAt || new Date().toISOString(),
    timestamp: row.created_at || payload.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || payload.updatedAt || null,
    data: payload
  };
}

export default async function handler(req, res) {
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
  const reference = searchParams.get('reference');
  const phone = searchParams.get('phone');
  const requestedBranch = searchParams.get('branch');
  const search = searchParams.get('search');
  const branchScope = getBranchScope(req.user);
  const actor=req.user.sub||req.user.id;
  const presentClient=normalizeClient;

  try {
    if (method === 'GET') {
      if (id) {
        const client = await getOne('SELECT * FROM clients WHERE id = $1', [id]);
        if (!client) {
          return res.status(404).json({ error: 'Client not found' });
        }
        if (branchScope.enforced && !branchScope.branches.includes(client.branch)) {
          return res.status(403).json({ error: 'Access denied' });
        }
        return res.json(presentClient(client));
      } else if (reference) {
        const client = await getOne('SELECT * FROM clients WHERE reference_number = $1', [reference]);
        if (!client) {
          return res.status(404).json({ error: 'Client not found' });
        }
        if (branchScope.enforced && !branchScope.branches.includes(client.branch)) {
          return res.status(403).json({ error: 'Access denied' });
        }
        return res.json(presentClient(client));
      } else if (phone) {
        let clients;
        if (branchScope.enforced) {
          clients = await getMany('SELECT * FROM clients WHERE phone = $1 AND branch = ANY($2) ORDER BY created_at DESC', [phone, branchScope.branches]);
        } else {
          clients = await getMany('SELECT * FROM clients WHERE phone = $1 ORDER BY created_at DESC', [phone]);
        }
        return res.json(clients.map(presentClient).filter(Boolean));
      } else {
        let queryText = 'SELECT * FROM clients';
        const params = [];
        
        if (branchScope.enforced) {
          queryText += ' WHERE branch = ANY($1)';
          params.push(branchScope.branches);
        } else if (requestedBranch) {
          queryText += ' WHERE branch = $1';
          params.push(requestedBranch);
        }
        
        if (search) {
          queryText += (params.length > 0) ? ' AND' : ' WHERE';
          queryText += ' (full_name ILIKE $' + (params.length + 1) + ' OR phone ILIKE $' + (params.length + 1) + ' OR reference_number ILIKE $' + (params.length + 1) + ')';
          params.push(`%${search}%`);
        }
        
        queryText += ' ORDER BY created_at DESC';
        
        const clients = await getMany(queryText, params);
        return res.json(clients.map(presentClient).filter(Boolean));
      }
    }

    if (method === 'POST') {
      const body = await parseRequestBody(req);
      
      if (Array.isArray(body)) {
        // Bulk insert
        const results = [];
        for (const client of body) {
          try {
            const clientBranch = client.branch || null;
            if (branchScope.enforced && !branchScope.branches.includes(clientBranch)) {
              continue;
            }
            const effectiveBranch = branchScope.enforced ? (branchScope.branches[0] || clientBranch) : clientBranch;
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
              branch: branchScope.enforced ? effectiveBranch : clientBranch,
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
        const requestedBranch = body.branch || null;
        if (branchScope.enforced && !branchScope.branches.includes(requestedBranch)) {
          return res.status(403).json({ success: false, error: 'Access denied: cannot create client for this branch' });
        }
        const effectiveBranch = branchScope.enforced ? (requestedBranch || branchScope.branches[0] || null) : requestedBranch;
        if(body.id){
          const existing=await getOne('SELECT * FROM clients WHERE id=$1',[body.id]);
          if(existing){
            if(branchScope.enforced&&!branchScope.branches.includes(existing.branch))return res.status(403).json({error:'Access denied'});
            if(existing.data?._registeredBy!==actor || existing.full_name!==(body.full_name||body.fullName) ||
              (existing.phone||'')!==(body.phone||'') || (existing.email||'')!==(body.email||'') || existing.branch!==effectiveBranch)
              return res.status(409).json({error:'This client ID already exists; open the existing profile'});
            return res.json({success:true,client:presentClient(existing)});
          }
        }
        const registrationData=typeof body.data==='string'?JSON.parse(body.data):body.data||{};
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
          branch: effectiveBranch,
          data: JSON.stringify({...registrationData,_registeredBy:actor})
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

      // Fetch existing record to merge data JSON
      const existing = await getOne('SELECT * FROM clients WHERE id = $1', [body.id]);

      if (branchScope.enforced && existing && !branchScope.branches.includes(existing.branch)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
      const existingData = existing
        ? (typeof existing.data === 'string' ? (() => { try { return JSON.parse(existing.data); } catch { return {}; } })() : existing.data || {})
        : {};

      // Build merged data JSON including health assessment fields
      const healthFields = ['primaryReason', 'waterIntake', 'exerciseFreq', 'sleepHours', 'stressLevel',
        'currentMedications', 'allergies', 'medicalHistory', 'primary_reason', 'water_intake',
        'exercise_freq', 'sleep_hours', 'stress_level', 'medical_history', 'current_medications',
        'membershipStatus', 'membership_status', 'referralName', 'referral_name',
        'referralNbNumber', 'referral_nb', 'nbNumber', 'nb_number', 'symptoms', 'height', 'weight',
        'dob', 'bmi', 'bmi_category', 'customer_type'];
      const mergedData = { ...existingData };
      healthFields.forEach(f => { if (body[f] !== undefined) mergedData[f] = body[f]; });
      if (body.data && typeof body.data === 'object') Object.assign(mergedData, body.data);
      if(existingData._registeredBy)mergedData._registeredBy=existingData._registeredBy;

      const clientPayload = {
        ...(body.referenceNumber !== undefined && { reference_number: body.referenceNumber }),
        ...(body.reference_number !== undefined && { reference_number: body.reference_number }),
        ...(body.fullName !== undefined && { full_name: body.fullName }),
        ...(body.full_name !== undefined && { full_name: body.full_name }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.gender !== undefined && { gender: body.gender }),
        ...(body.dob !== undefined && { date_of_birth: body.dob }),
        ...(body.dateOfBirth !== undefined && { date_of_birth: body.dateOfBirth }),
        ...(body.date_of_birth !== undefined && { date_of_birth: body.date_of_birth }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.city !== undefined && { city: body.city }),
        ...(body.branch !== undefined && !branchScope.enforced && { branch: body.branch }),
        data: JSON.stringify(mergedData),
        updated_at: new Date().toISOString(),
      };
      const client = await update('clients', body.id, clientPayload, 'id');
      const normalized = normalizeClient(client);
      await publishRealtimeEvent('clients', 'update', normalized);
      return res.json({ success: true, client: normalized });
    }

    if (method === 'DELETE') {
      if (branchScope.enforced && id) {
        const existing = await getOne('SELECT branch FROM clients WHERE id = $1', [id]);
        if (existing && !branchScope.branches.includes(existing.branch)) {
          return res.status(403).json({ success: false, error: 'Access denied' });
        }
      }
      await remove('clients', id, 'id');
      await publishRealtimeEvent('clients', 'delete', { id });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Clients API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      code: error.code || 'INTERNAL_ERROR'
    });
  }
}



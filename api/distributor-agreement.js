import { query, getOne, getMany, insert, withTransaction } from './db.js';
import { applyAuthCors } from './_lib/auth.js';

async function ensureAgreementsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS distributor_agreements (
      id TEXT PRIMARY KEY,
      nb_number TEXT UNIQUE NOT NULL,
      last_name TEXT NOT NULL,
      first_name TEXT NOT NULL,
      middle_initial TEXT,
      birthdate TEXT,
      age INTEGER,
      sex TEXT,
      nationality TEXT,
      mailing_address_street TEXT,
      mailing_address_town TEXT,
      contact_residence TEXT,
      contact_office TEXT,
      contact_mobile TEXT,
      zip_code TEXT,
      tax_id TEXT,
      sss_no TEXT,
      beneficiary TEXT,
      upline_id TEXT,
      upline_name TEXT,
      upline_address TEXT,
      upline_town TEXT,
      upline_contact_residence TEXT,
      upline_contact_office TEXT,
      upline_contact_mobile TEXT,
      upline_zip_code TEXT,
      upline_tax_id TEXT,
      upline_sss_no TEXT,
      sponsor_id TEXT,
      sponsor_name TEXT,
      kit_type TEXT NOT NULL DEFAULT 'supplements',
      materials_received JSONB,
      processing_branch TEXT NOT NULL,
      declaration_agreed BOOLEAN DEFAULT FALSE,
      declaration_date TEXT,
      status TEXT DEFAULT 'pending',
      processed_by TEXT,
      received_by TEXT,
      date_received TEXT,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

let tableReady = false;

async function generateNBNumber() {
  const result = await getOne(
    `SELECT nb_number FROM distributor_agreements 
     WHERE nb_number LIKE 'NB%' 
     ORDER BY nb_number DESC LIMIT 1`
  );

  let nextNum = 1;
  if (result && result.nb_number) {
    const numPart = result.nb_number.replace(/^NB0*/, '');
    nextNum = (parseInt(numPart, 10) || 0) + 1;
  }

  const existingMax = await getOne(
    `SELECT distributor_code FROM distributors 
     WHERE distributor_code LIKE 'NB%' 
     ORDER BY distributor_code DESC LIMIT 1`
  );
  if (existingMax && existingMax.distributor_code) {
    const numPart = existingMax.distributor_code.replace(/^NB0*/, '');
    const existingNum = parseInt(numPart, 10) || 0;
    if (existingNum >= nextNum) nextNum = existingNum + 1;
  }

  return `NB${String(nextNum).padStart(6, '0')}`;
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (!tableReady) {
      await ensureAgreementsTable();
      tableReady = true;
    }

    const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET') {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const id = searchParams.get('id');
      const nbNumber = searchParams.get('nb_number');
      const userRole = req.user.role || '';
      const isStaff = ['admin', 'branch_manager', 'stock_manager', 'director'].includes(userRole);

      if (id) {
        const agreement = await getOne('SELECT * FROM distributor_agreements WHERE id = $1', [id]);
        if (!agreement) return res.status(404).json({ error: 'Agreement not found' });
        if (!isStaff && agreement.nb_number !== req.user.username?.toUpperCase()) {
          return res.status(403).json({ error: 'Access denied' });
        }
        return res.json(agreement);
      }

      if (nbNumber) {
        const agreement = await getOne('SELECT * FROM distributor_agreements WHERE nb_number = $1', [nbNumber.toUpperCase()]);
        if (!agreement) return res.status(404).json({ error: 'Agreement not found' });
        if (!isStaff && agreement.nb_number !== req.user.username?.toUpperCase()) {
          return res.status(403).json({ error: 'Access denied' });
        }
        return res.json(agreement);
      }

      if (!isStaff) {
        return res.status(403).json({ error: 'Only staff can list all agreements' });
      }

      const status = searchParams.get('status');
      const branch = searchParams.get('branch');
      let sql = 'SELECT id, nb_number, first_name, last_name, processing_branch, kit_type, status, created_at FROM distributor_agreements';
      const conditions = [];
      const params = [];
      if (status) {
        params.push(status);
        conditions.push(`status = $${params.length}`);
      }
      if (branch) {
        params.push(branch);
        conditions.push(`processing_branch = $${params.length}`);
      }
      if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
      sql += ' ORDER BY created_at DESC';

      const agreements = await getMany(sql, params);
      return res.json({ agreements });
    }

    if (req.method === 'POST') {
      const body = req.body || {};

      if (!body.last_name || !body.first_name) {
        return res.status(400).json({ error: 'Last name and first name are required' });
      }
      if (!body.contact_mobile) {
        return res.status(400).json({ error: 'Mobile contact number is required' });
      }
      if (!body.processing_branch) {
        return res.status(400).json({ error: 'Processing branch is required' });
      }
      if (!body.kit_type || !['supplements', 'fertilizers'].includes(body.kit_type)) {
        return res.status(400).json({ error: 'Kit type must be supplements or fertilizers' });
      }

      if (body.upline_id) {
        const upline = await getOne(
          `SELECT distributor_code, distributor_name FROM distributors WHERE UPPER(distributor_code) = $1`,
          [body.upline_id.toUpperCase()]
        );
        if (!upline) {
          return res.status(400).json({ error: 'Direct Upline ID not found in the system' });
        }
      }

      if (body.sponsor_id) {
        const sponsor = await getOne(
          `SELECT distributor_code, distributor_name FROM distributors WHERE UPPER(distributor_code) = $1`,
          [body.sponsor_id.toUpperCase()]
        );
        if (!sponsor) {
          return res.status(400).json({ error: 'Sponsor ID not found in the system' });
        }
      }

      const agreementId = `AGR-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

      const result = await withTransaction(async (client) => {
        const nbResult = await client.query(
          `SELECT nb_number FROM distributor_agreements WHERE nb_number LIKE 'NB%' ORDER BY nb_number DESC LIMIT 1 FOR UPDATE`
        );
        let nextNum = 1;
        if (nbResult.rows.length > 0) {
          const numPart = nbResult.rows[0].nb_number.replace(/^NB0*/, '');
          nextNum = (parseInt(numPart, 10) || 0) + 1;
        }
        const distResult = await client.query(
          `SELECT distributor_code FROM distributors WHERE distributor_code LIKE 'NB%' ORDER BY distributor_code DESC LIMIT 1 FOR UPDATE`
        );
        if (distResult.rows.length > 0) {
          const numPart = distResult.rows[0].distributor_code.replace(/^NB0*/, '');
          const existingNum = parseInt(numPart, 10) || 0;
          if (existingNum >= nextNum) nextNum = existingNum + 1;
        }
        const nbNumber = `NB${String(nextNum).padStart(6, '0')}`;

        const agreementData = {
          id: agreementId,
          nb_number: nbNumber,
          last_name: body.last_name.trim(),
          first_name: body.first_name.trim(),
          middle_initial: (body.middle_initial || '').trim(),
          birthdate: body.birthdate || null,
          age: body.age ? parseInt(body.age) : null,
          sex: body.sex || null,
          nationality: body.nationality || null,
          mailing_address_street: body.mailing_address_street || null,
          mailing_address_town: body.mailing_address_town || null,
          contact_residence: body.contact_residence || null,
          contact_office: body.contact_office || null,
          contact_mobile: body.contact_mobile,
          zip_code: body.zip_code || null,
          tax_id: body.tax_id || null,
          sss_no: body.sss_no || null,
          beneficiary: body.beneficiary || null,
          upline_id: body.upline_id ? body.upline_id.toUpperCase() : null,
          upline_name: body.upline_name || null,
          upline_address: body.upline_address || null,
          upline_town: body.upline_town || null,
          upline_contact_residence: body.upline_contact_residence || null,
          upline_contact_office: body.upline_contact_office || null,
          upline_contact_mobile: body.upline_contact_mobile || null,
          upline_zip_code: body.upline_zip_code || null,
          upline_tax_id: body.upline_tax_id || null,
          upline_sss_no: body.upline_sss_no || null,
          sponsor_id: body.sponsor_id ? body.sponsor_id.toUpperCase() : null,
          sponsor_name: body.sponsor_name || null,
          kit_type: body.kit_type,
          materials_received: body.materials_received ? JSON.stringify(body.materials_received) : null,
          processing_branch: body.processing_branch,
          declaration_agreed: body.declaration_agreed || false,
          declaration_date: body.declaration_date || new Date().toISOString().slice(0, 10),
          status: 'pending',
          created_by: req.user?.username || body.created_by || 'system',
        };

        const agrCols = Object.keys(agreementData);
        const agrVals = Object.values(agreementData);
        const agrPlaceholders = agrCols.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(
          `INSERT INTO distributor_agreements (${agrCols.join(', ')}) VALUES (${agrPlaceholders})`,
          agrVals
        );

        const distributorName = `${body.first_name.trim()} ${body.last_name.trim()}`;
        const distId = `DIST-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        const distData = {
          id: distId,
          distributor_code: nbNumber,
          distributor_name: distributorName,
          mobile_no: body.contact_mobile,
          email: body.email || null,
          status: 'active',
          branch: body.processing_branch,
          location: body.mailing_address_town || body.mailing_address_street || null,
          entity_type: 'distributor',
          agreement_data: JSON.stringify({
            agreement_id: agreementId,
            kit_type: body.kit_type,
            sponsor_id: body.sponsor_id || null,
            upline_id: body.upline_id || null,
            registration_date: new Date().toISOString(),
          }),
        };
        const distCols = Object.keys(distData);
        const distVals = Object.values(distData);
        const distPlaceholders = distCols.map((_, i) => `$${i + 1}`).join(', ');
        await client.query(
          `INSERT INTO distributors (${distCols.join(', ')}) VALUES (${distPlaceholders})`,
          distVals
        );

        try {
          const kitProduct = body.kit_type === 'fertilizers'
            ? 'REGISTRATION KIT WITH FERT,COFFEE & RI(PERMANENT)'
            : 'REGISTRATION KIT WITH ALFALFA,COFFEE&RI(PERMANENT)';
          const wimId = `WIM-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
          await client.query(
            `INSERT INTO warehouse_inventory_movements (id, product_id, product_name, movement_type, quantity, reference, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [wimId, kitProduct, kitProduct, 'sale', -1, agreementId, `Registration kit (${body.kit_type}) for new distributor ${nbNumber} at ${body.processing_branch}`, req.user?.username || 'system']
          );
        } catch (stockErr) {
          console.error('Stock movement for registration kit (non-critical):', stockErr.message);
        }

        return { agreementData, nbNumber };
      });

      return res.status(201).json({
        success: true,
        agreement: { ...result.agreementData, id: agreementId },
        nb_number: result.nbNumber,
        message: `Distributor registered successfully with NB Number: ${result.nbNumber}`,
      });
    }

    if (req.method === 'PUT') {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const userRole = req.user.role || '';
      const isStaff = ['admin', 'branch_manager', 'stock_manager', 'director'].includes(userRole);
      if (!isStaff) {
        return res.status(403).json({ error: 'Only staff can update agreements' });
      }

      const body = req.body || {};
      const id = body.id || searchParams.get('id');
      if (!id) return res.status(400).json({ error: 'Agreement ID is required' });

      const existing = await getOne('SELECT * FROM distributor_agreements WHERE id = $1', [id]);
      if (!existing) return res.status(404).json({ error: 'Agreement not found' });

      const updates = {};
      if (body.status) updates.status = body.status;
      if (body.processed_by) updates.processed_by = body.processed_by;
      if (body.received_by) updates.received_by = body.received_by;
      if (body.date_received) updates.date_received = body.date_received;
      updates.updated_at = new Date().toISOString();

      const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`);
      const params = [id, ...Object.values(updates)];
      await query(`UPDATE distributor_agreements SET ${setClauses.join(', ')} WHERE id = $1`, params);

      return res.json({ success: true, message: 'Agreement updated' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Distributor agreement error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

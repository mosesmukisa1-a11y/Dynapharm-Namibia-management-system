import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan, columnPlans as __qd_columnPlans } from "./services/queryDescriptors.js";import { query, getOne, getMany, insert, withTransaction } from './db.js';
import { applyAuthCors } from './_lib/auth.js';

async function ensureAgreementsTable() {
  await __qd_executePlan(query, __qd_registeredPlan("api/distributor-agreement.js:5:0"), []);

















































  // Make nb_number nullable in case table existed with NOT NULL constraint
  await __qd_executePlan(query, __qd_registeredPlan("api/distributor-agreement.js:56:1"), []).catch(() => {});
  // Add new approval tracking columns if they don't exist
  await __qd_executePlan(query, __qd_registeredPlan("api/distributor-agreement.js:58:2"), []).catch(() => {});
  await __qd_executePlan(query, __qd_registeredPlan("api/distributor-agreement.js:59:3"), []).catch(() => {});
  await __qd_executePlan(query, __qd_registeredPlan("api/distributor-agreement.js:60:4"), []).catch(() => {});
  await __qd_executePlan(query, __qd_registeredPlan("api/distributor-agreement.js:61:5"), []).catch(() => {});
}

let tableReady = false;

async function issueNBToAgreement(agreementId, paymentMethod, paymentReference, approvedBy) {
  const existing = await __qd_executePlan(getOne, __qd_registeredPlan("api/distributor-agreement.js:67:6"), [agreementId]);
  if (!existing) throw new Error('Agreement not found');

  const result = await withTransaction(async (client) => {
    const nbNumber = await getNextNBNumber(client);

    const dupCheck = await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/distributor-agreement.js:73:7"), [nbNumber]);
    if (dupCheck.rows.length > 0) throw new Error(`NB number ${nbNumber} already exists. Please try again.`);

    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/distributor-agreement.js:77:8"),




    [nbNumber, approvedBy, paymentMethod, paymentReference, agreementId]);


    const distributorName = `${existing.first_name.trim()} ${existing.last_name.trim()}`;
    const distId = `DIST-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const today = new Date().toISOString().slice(0, 10);
    const distData = {
      id: distId,
      distributor_code: nbNumber,
      distributor_name: distributorName,
      mobile_no: existing.contact_mobile,
      email: existing.email || null,
      status: 'active',
      branch: existing.processing_branch,
      location: existing.mailing_address_town || existing.mailing_address_street || null,
      entity_type: 'distributor',
      position: 'Distributor',
      position_code: 'DI',
      date_joined: today,
      sponsor_code: existing.sponsor_id ? existing.sponsor_id.toUpperCase() : existing.upline_id ? existing.upline_id.toUpperCase() : null,
      sex: existing.sex || null,
      agreement_data: JSON.stringify({
        agreement_id: agreementId,
        kit_type: existing.kit_type,
        sponsor_id: existing.sponsor_id || null,
        upline_id: existing.upline_id || null,
        registration_date: new Date().toISOString(),
        approved_by: approvedBy,
        payment_method: paymentMethod
      })
    };
    const distCols = __qd_columnPlans("api/distributor-agreement.js:112:9", Object.keys(distData));
    const distVals = Object.values(distData);
    const distPlaceholders = __qd_joinPlans(distCols.map((_, i) => __qd_registeredPlan("api/distributor-agreement.js:114:10", [i + 1])), "comma");
    await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/distributor-agreement.js:116:11", [__qd_joinPlans(
      distCols, "comma"), distPlaceholders]),

    distVals);


    try {
      await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/distributor-agreement.js:122:12"), []);
      const kitProduct = existing.kit_type === 'fertilizers' ?
      'REGISTRATION KIT WITH FERT,COFFEE & RI(PERMANENT)' :
      'REGISTRATION KIT WITH ALFALFA,COFFEE&RI(PERMANENT)';
      const wimId = `WIM-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/distributor-agreement.js:128:13"),

      [wimId, kitProduct, kitProduct, 'sale', -1, agreementId,
      `Registration kit (${existing.kit_type}) issued to ${nbNumber} — ${distributorName} at ${existing.processing_branch}`,
      approvedBy]);

    } catch (stockErr) {
      await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/distributor-agreement.js:134:14"), []);
      console.error('Stock movement for registration kit (non-critical):', stockErr.message);
    }

    return { nbNumber, distributorName };
  });

  return result;
}

async function getNextNBNumber(client) {
  const qry = client ? client.query.bind(client) : async (sql, p) => {const r = await __qd_executePlan(query, sql, p);return r;};

  const agrResult = await __qd_executePlan(qry, __qd_registeredPlan("api/distributor-agreement.js:148:15"), []);




  let nextNum = 1;
  const agrRows = agrResult.rows || [agrResult].filter(Boolean);
  if (agrRows.length > 0 && agrRows[0]?.nb_number) {
    nextNum = parseInt(agrRows[0].nb_number.substring(2), 10) + 1;
  }

  const distResult = await __qd_executePlan(qry, __qd_registeredPlan("api/distributor-agreement.js:159:16"), []);




  const distRows = distResult.rows || [distResult].filter(Boolean);
  if (distRows.length > 0 && distRows[0]?.distributor_code) {
    const existingNum = parseInt(distRows[0].distributor_code.substring(2), 10);
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
      const isStaff = ['admin', 'branch_manager', 'stock_manager', 'director', 'gm', 'mis'].includes(userRole);

      if (id) {
        const agreement = await __qd_executePlan(getOne, __qd_registeredPlan("api/distributor-agreement.js:198:17"), [id]);
        if (!agreement) return res.status(404).json({ error: 'Agreement not found' });
        return res.json(agreement);
      }

      if (nbNumber) {
        const agreement = await __qd_executePlan(getOne, __qd_registeredPlan("api/distributor-agreement.js:204:18"), [nbNumber.toUpperCase()]);
        if (!agreement) return res.status(404).json({ error: 'Agreement not found' });
        return res.json(agreement);
      }

      if (!isStaff) {
        return res.status(403).json({ error: 'Only staff can list all agreements' });
      }

      const status = searchParams.get('status');
      const branch = searchParams.get('branch');
      let sql = __qd_registeredPlan("api/distributor-agreement.js:215:19");
      const conditions = [];
      const params = [];
      if (status) {
        params.push(status);
        conditions.push(__qd_registeredPlan("api/distributor-agreement.js:220:21", [params.length]));
      }
      if (branch) {
        params.push(branch);
        conditions.push(__qd_registeredPlan("api/distributor-agreement.js:224:22", [params.length]));
      }
      if (conditions.length > 0) sql = __qd_joinPlans([sql, __qd_joinPlans([__qd_registeredPlan("api/distributor-agreement.js:226:20"), __qd_joinPlans(conditions, "and")], "empty")], "empty");
      sql = __qd_joinPlans([sql, __qd_registeredPlan("api/distributor-agreement.js:227:23")], "empty");

      const agreements = await __qd_executePlan(getMany, sql, params);
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
        const upline = await __qd_executePlan(getOne, __qd_registeredPlan("api/distributor-agreement.js:251:24"),

        [body.upline_id.toUpperCase()]);

        if (!upline) {
          return res.status(400).json({ error: 'Direct Upline ID not found in the system' });
        }
      }

      if (body.sponsor_id) {
        const sponsor = await __qd_executePlan(getOne, __qd_registeredPlan("api/distributor-agreement.js:261:25"),

        [body.sponsor_id.toUpperCase()]);

        if (!sponsor) {
          return res.status(400).json({ error: 'Sponsor ID not found in the system' });
        }
      }

      const agreementId = `AGR-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

      const agreementData = {
        id: agreementId,
        nb_number: null,
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
        status: 'pending_payment',
        created_by: req.user?.username || body.created_by || 'system'
      };

      const agrCols = __qd_columnPlans("api/distributor-agreement.js:311:26", Object.keys(agreementData));
      const agrVals = Object.values(agreementData);
      const agrPlaceholders = __qd_joinPlans(agrCols.map((_, i) => __qd_registeredPlan("api/distributor-agreement.js:313:27", [i + 1])), "comma");
      await __qd_executePlan(query, __qd_registeredPlan("api/distributor-agreement.js:315:28", [__qd_joinPlans(
        agrCols, "comma"), agrPlaceholders]),
      agrVals);


      // ── Immediate NB issuance (branch-counter registration) ──────────────────
      const branchStaffRoles = ['admin', 'branch_manager', 'stock_manager', 'director', 'gm',
      'consultant', 'dispenser', 'frontdesk'];
      const canIssueImmediately = req.user && branchStaffRoles.includes(req.user.role || '');

      if (body.immediate_issue === true && canIssueImmediately) {
        const paymentMethod = body.payment_method || 'cash';
        const paymentReference = body.payment_reference || null;
        const approvedBy = req.user.username || req.user.full_name || 'branch';
        const result = await issueNBToAgreement(agreementId, paymentMethod, paymentReference, approvedBy);
        return res.status(201).json({
          success: true,
          agreement_id: agreementId,
          nb_number: result.nbNumber,
          distributor_name: result.distributorName,
          status: 'approved',
          message: `Registration complete. NB Number issued: ${result.nbNumber}`
        });
      }

      return res.status(201).json({
        success: true,
        agreement_id: agreementId,
        status: 'pending_payment',
        message: `Registration submitted successfully. Please proceed to the ${body.processing_branch} branch with payment of N$ 1,200.00 to receive your NB number. Reference: ${agreementId}`
      });
    }

    // PATCH — Branch approves pending registration, issues NB number
    if (req.method === 'PATCH') {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const userRole = req.user.role || '';
      const isStaff = ['admin', 'branch_manager', 'stock_manager', 'director', 'gm'].includes(userRole);
      if (!isStaff) {
        return res.status(403).json({ error: 'Only branch staff can approve registrations' });
      }

      const body = req.body || {};
      const id = body.id || searchParams.get('id');
      if (!id) return res.status(400).json({ error: 'Agreement ID is required' });

      const existing = await __qd_executePlan(getOne, __qd_registeredPlan("api/distributor-agreement.js:362:29"), [id]);
      if (!existing) return res.status(404).json({ error: 'Agreement not found' });
      if (existing.nb_number) {
        return res.status(400).json({ error: 'This registration has already been approved and issued NB: ' + existing.nb_number });
      }

      const paymentMethod = body.payment_method || 'cash';
      const paymentReference = body.payment_reference || null;
      const approvedBy = req.user.username || req.user.full_name || 'branch';

      const result = await issueNBToAgreement(id, paymentMethod, paymentReference, approvedBy);

      return res.json({
        success: true,
        nb_number: result.nbNumber,
        distributor_name: result.distributorName,
        message: `Registration approved. NB Number issued: ${result.nbNumber}`
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

      const existing = await __qd_executePlan(getOne, __qd_registeredPlan("api/distributor-agreement.js:396:30"), [id]);
      if (!existing) return res.status(404).json({ error: 'Agreement not found' });

      const updates = {};
      if (body.status) updates.status = body.status;
      if (body.processed_by) updates.processed_by = body.processed_by;
      if (body.received_by) updates.received_by = body.received_by;
      if (body.date_received) updates.date_received = body.date_received;
      updates.updated_at = new Date().toISOString();

      const setClauses = Object.keys(updates).map((k, i) => __qd_registeredPlan("api/distributor-agreement.js:406:31", [k, i + 2]));
      const params = [id, ...Object.values(updates)];
      await __qd_executePlan(query, __qd_registeredPlan("api/distributor-agreement.js:408:32", [__qd_joinPlans(setClauses, "comma")]), params);

      return res.json({ success: true, message: 'Agreement updated' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Distributor agreement error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}

import { applyAuthCors } from './_lib/auth.js';
import { query, getMany, getOne, insert, update, remove, publishRealtimeEvent } from './db.js';
import { postActivityRecord, generateBatId } from './_lib/activityCapture.js';
import { atomicStockRequest } from './_lib/atomicStockRequest.js';

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

function normalizeReportRow(row) {
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

  const createdAtVal = row.created_at || payload.createdAt || payload.timestamp || null;
  return {
    id: row.id || payload.id || `RPT-${Date.now()}`,
    clientId: row.client_id || payload.clientId || null,
    client_id: row.client_id || payload.clientId || null,
    consultant: row.consultant || payload.consultant || null,
    branch: row.branch || payload.branch || payload.consultantInfo?.branch || null,
    reportType: row.report_type || payload.reportType || payload.type || null,
    createdAt: createdAtVal,
    created_at: createdAtVal,
    updatedAt: row.updated_at || payload.updatedAt || payload.lastModified || null,
    ...payload,
    date: payload.date || (createdAtVal ? createdAtVal : null),
  };
}

function buildReportInsert(body) {
  const id = body.id || `RPT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    id,
    client_id: body.clientId || body.client_id || body.client?.id || null,
    consultant: body.consultant || body.consultantInfo?.fullName || null,
    branch: body.branch || body.consultantInfo?.branch || body.clientInfo?.branch || null,
    report_type: body.reportType || body.type || null,
    data
  };
}

async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const id = searchParams.get('id');
  const clientId = searchParams.get('clientId');
  const clientName = searchParams.get('client_name');
  const branch = searchParams.get('branch');
  const consultant = searchParams.get('consultant');
  const appointmentId = searchParams.get('appointment_id');

  try {
    if(req.method!=='GET'){
      const incoming=await parseRequestBody(req);
      const existing=(incoming?.id||id)?await getOne('SELECT data FROM reports WHERE id=$1',[incoming?.id||id]):null;
      if(existing?.data?.offSystemFulfilment||incoming?.data?.offSystemFulfilment||incoming?.offSystemFulfilment)
        return res.status(409).json({error:'Historical collection receipts are immutable; use the original return workflow for corrections'});
    }
    if (req.method === 'GET') {
      let queryText = 'SELECT * FROM reports';
      const params = [];
      const conditions = [];

      if (id) {
        conditions.push(`id = $${params.length + 1}`);
        params.push(id);
      }
      if (clientId) {
        conditions.push(`client_id = $${params.length + 1}`);
        params.push(clientId);
      }
      if (branch) {
        conditions.push(`branch = $${params.length + 1}`);
        params.push(branch);
      }
      if (consultant) {
        conditions.push(`consultant = $${params.length + 1}`);
        params.push(consultant);
      }
      if (clientName) {
        conditions.push(`LOWER(data->>'client_name') = LOWER($${params.length + 1})`);
        params.push(clientName);
      }
      if (appointmentId) {
        conditions.push(`data->>'appointment_id' = $${params.length + 1}`);
        params.push(appointmentId);
      }

      if (conditions.length > 0) {
        queryText += ` WHERE ${conditions.join(' AND ')}`;
      }

      queryText += ' ORDER BY created_at DESC';

      const rows = await getMany(queryText, params);
      return res.status(200).json(rows.map(normalizeReportRow).filter(Boolean));
    }

    if (req.method === 'POST') {
      const body = await parseRequestBody(req);
      const insertData = buildReportInsert(body);
      const result = await insert('reports', insertData);
      const report = normalizeReportRow(result);
      await publishRealtimeEvent('reports', 'create', report);

      if (body.appointment_id) {
        try {
          await update('appointments', body.appointment_id, { status: 'completed', updated_at: new Date().toISOString() }, 'id');
        } catch (e) {
          console.error('[reports POST] failed to auto-complete appointment:', e.message);
        }
      }

      const consultFee = Number(body.consultation_fee || 0);
      const pendingMedicines = Array.isArray(body.medicines)
        ? body.medicines.filter(m => !m.dispensed)
        : [];
      const isStandaloneConsultation = consultFee > 0 && pendingMedicines.length === 0;
      if (isStandaloneConsultation) {
        let branchId = body.branch_id || body.branch || null;
        if (!branchId && body.appointment_id) {
          try {
            const apt = await getOne('SELECT branch FROM appointments WHERE id = $1', [body.appointment_id]);
            if (apt && apt.branch) branchId = apt.branch;
          } catch (e) {
            console.error('[reports POST] failed to look up appointment branch:', e.message);
          }
        }
        if (branchId) {
          const now = new Date();
          try {
            await postActivityRecord({
              id: generateBatId(),
              branch_id: branchId,
              branch_name: branchId,
              client_name: body.client_name || 'Patient',
              client_type: body.membership_status === 'member' ? 'member' : 'patient',
              nb_number: body.nb_number || null,
              service_date: now.toISOString().slice(0, 10),
              service_time: now.toTimeString().slice(0, 8),
              activity_type: 'consultation',
              workflow_source: 'consultant_portal',
              form_reference_id: report.id,
              consultation_fee: consultFee,
              product_total_dp: 0,
              total_qty: 0,
              grand_total: consultFee,
              payment_status: 'paid',
              payment_method: body.payment_method || 'cash',
              stock_impact: false,
              stock_status: 'none',
              prescription_status: 'none',
              consultation_status: 'paid',
              reporting_status: 'posted',
              captured_by: body.consultant || null,
            });
          } catch (e) {
            console.error('[reports POST] consultation fee activity capture failed:', e.message);
          }
        } else {
          console.warn('[reports POST] consultation fee not captured — no branch_id found for report', report.id);
        }
      }

      return res.status(201).json({ success: true, report });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = await parseRequestBody(req);
      if (!body?.id) {
        return res.status(400).json({ success: false, error: 'Report id is required' });
      }

      const existing = await getOne('SELECT * FROM reports WHERE id = $1 FOR UPDATE', [body.id]);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Report not found' });
      }

      const updatePayload = {
        ...buildReportInsert({ ...normalizeReportRow(existing), ...body }),
        updated_at: new Date().toISOString()
      };
      const posted=(await query('SELECT 1 FROM stock_sale_allocations WHERE sale_reference=$1 LIMIT 1',[body.id])).rowCount>0;
      if (posted) {
        const oldData=typeof existing.data==='string'?JSON.parse(existing.data):existing.data || {};
        const newData=typeof updatePayload.data==='string'?JSON.parse(updatePayload.data):updatePayload.data || {};
        const stockFields=data=>(data.medicines || []).map(m=>({
          name:m.name || m.product_name,quantity:m.quantity,dispensed_qty:m.dispensed_qty,dispensed:m.dispensed,
          dp:m.dp,cp:m.cp,bv:m.bv,unit_price:m.unit_price,is_free:m.is_free,
        }));
        if (existing.branch!==updatePayload.branch || JSON.stringify(stockFields(oldData))!==JSON.stringify(stockFields(newData)))
          return res.status(409).json({success:false,error:'Posted dispensing quantities, products and prices cannot be edited. Use a linked return and a new prescription authorization.'});
      }

      const updated = await update('reports', body.id, updatePayload, 'id');
      const report = normalizeReportRow(updated);
      await publishRealtimeEvent('reports', 'update', report);
      return res.status(200).json({ success: true, report });
    }

    if (req.method === 'DELETE') {
      if (!id) {
        return res.status(400).json({ success: false, error: 'Report id is required' });
      }
      if ((await query('SELECT 1 FROM stock_sale_allocations WHERE sale_reference=$1 LIMIT 1',[id])).rowCount)
        return res.status(409).json({success:false,error:'Dispensed reports cannot be deleted. Preserve the history and use a linked return.'});
      await remove('reports', id, 'id');
      await publishRealtimeEvent('reports', 'delete', { id });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('Reports API error:', error);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
export default atomicStockRequest(handler,['PUT','PATCH','DELETE']);


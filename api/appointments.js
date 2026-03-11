import { query, getMany, getOne, insert, update, remove, publishRealtimeEvent } from './db.js';
import { applyAuthCors } from './_lib/auth.js';
import { createDistributorNotification } from './notifications.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const method = req.method;
  const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const id = searchParams.get('id');
  const branch = searchParams.get('branch');
  const date = searchParams.get('date');
  const status = searchParams.get('status');
  const type = searchParams.get('type');

  try {
    if (method === 'GET') {
      let queryText = 'SELECT * FROM appointments';
      const params = [];
      const conditions = [];

      const userRole = req.user ? (req.user.role || '').toLowerCase() : '';
      const userBranch = req.user ? (req.user.branch || '') : '';
      if (req.user && userRole !== 'admin' && userBranch && !branch) {
        conditions.push('branch = $' + (params.length + 1));
        params.push(userBranch);
      }
      
      if (id) {
        conditions.push('id = $' + (params.length + 1));
        params.push(id);
      }
      if (branch) {
        if (req.user && userRole !== 'admin' && userBranch && branch !== userBranch) {
          return res.status(403).json({ error: 'Access denied to this branch' });
        }
        conditions.push('branch = $' + (params.length + 1));
        params.push(branch);
      }
      if (date) {
        conditions.push('date = $' + (params.length + 1));
        params.push(date);
      }
      if (status) {
        conditions.push('status = $' + (params.length + 1));
        params.push(status);
      }
      if (type) {
        conditions.push('type = $' + (params.length + 1));
        params.push(type);
      }
      
      if (conditions.length > 0) {
        queryText += ' WHERE ' + conditions.join(' AND ');
      }
      
      queryText += ' ORDER BY date DESC, time DESC';
      
      const appointments = await getMany(queryText, params);
      return res.json(appointments);
    }

    if (method === 'POST') {
      const body = req.body;
      const isAuthenticated = !!(req.user && req.user.id);

      function sanitizeStr(val, maxLen) {
        if (!val || typeof val !== 'string') return null;
        return val.trim().slice(0, maxLen || 500);
      }

      function buildAppointmentData(apt, authenticated) {
        const fullName = sanitizeStr(apt.full_name || apt.fullName, 200);
        const phone = sanitizeStr(apt.phone, 30);
        const date = sanitizeStr(apt.date, 20);
        const time = sanitizeStr(apt.time, 10);
        if (!fullName || !phone || !date || !time) return null;

        const data = {
          id: `APT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          client_reference: sanitizeStr(apt.client_reference || apt.clientReference, 50),
          full_name: fullName,
          phone: phone,
          email: sanitizeStr(apt.email, 200),
          date: date,
          time: time,
          branch: sanitizeStr(apt.branch, 100),
          type: sanitizeStr(apt.type, 100),
          status: authenticated ? sanitizeStr(apt.status, 30) || 'pending' : 'pending',
          notes: sanitizeStr(apt.notes, 2000),
          data: apt.data ? (typeof apt.data === 'string' ? apt.data.slice(0, 5000) : JSON.stringify(apt.data).slice(0, 5000)) : null
        };

        Object.keys(data).forEach(key => {
          if (data[key] === undefined) delete data[key];
        });

        return data;
      }

      if (Array.isArray(body)) {
        if (!isAuthenticated) {
          return res.status(403).json({ error: 'Bulk insert requires authentication' });
        }
        const results = [];
        for (const apt of body.slice(0, 100)) {
          try {
            const appointmentData = buildAppointmentData(apt, true);
            if (!appointmentData) continue;
            const result = await insert('appointments', appointmentData);
            results.push(result);
          } catch (error) {
            console.error('Error inserting appointment:', error);
          }
        }
        
        if (results.length > 0) {
          await publishRealtimeEvent('appointments', 'create', results);
        }
        
        return res.json({ success: true, count: results.length, appointments: results });
      } else {
        const appointmentData = buildAppointmentData(body, isAuthenticated);
        if (!appointmentData) {
          return res.status(400).json({ error: 'Missing required fields: full_name, phone, date, time' });
        }
        
        const appointment = await insert('appointments', appointmentData);
        await publishRealtimeEvent('appointments', 'create', appointment);
        return res.json(appointment);
      }
    }

    if (method === 'PUT') {
      const body = req.body;
      if (!body.id) return res.status(400).json({ error: 'Missing appointment id' });
      const oldAppointment = await getOne('SELECT * FROM appointments WHERE id = $1', [body.id]);
      if (!oldAppointment) return res.status(404).json({ error: 'Appointment not found' });

      const putUserRole = req.user ? (req.user.role || '').toLowerCase() : '';
      const putUserBranch = req.user ? (req.user.branch || '') : '';
      if (req.user && putUserRole !== 'admin' && putUserBranch && oldAppointment.branch !== putUserBranch) {
        return res.status(403).json({ error: 'Access denied to this appointment' });
      }

      const allowedStatusValues = ['pending', 'walk-in', 'checked_in', 'in_progress', 'completed', 'cancelled', 'scheduled'];
      if (body.status && !allowedStatusValues.includes(body.status.toLowerCase())) {
        return res.status(400).json({ error: 'Invalid status value' });
      }

      const appointmentPayload = {
        ...(body.client_reference !== undefined && { client_reference: body.client_reference }),
        ...(body.clientReference !== undefined && { client_reference: body.clientReference }),
        ...(body.full_name !== undefined && { full_name: body.full_name }),
        ...(body.fullName !== undefined && { full_name: body.fullName }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.date !== undefined && { date: body.date }),
        ...(body.time !== undefined && { time: body.time }),
        ...(body.branch !== undefined && { branch: body.branch }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(body.data !== undefined && { data: typeof body.data === 'string' ? body.data : JSON.stringify(body.data) }),
        updated_at: new Date().toISOString(),
      };
      const appointment = await update('appointments', body.id, appointmentPayload, 'id');
      await publishRealtimeEvent('appointments', 'update', appointment);

      const newStatus = (body.status || '').toLowerCase();
      const wasNotCompleted = oldAppointment && (oldAppointment.status || '').toLowerCase() !== 'completed';
      const distributorRef = appointment.client_reference || (oldAppointment && oldAppointment.client_reference);
      if (newStatus === 'completed' && wasNotCompleted && distributorRef) {
        try {
          let apptData = {};
          try { apptData = typeof appointment.data === 'string' ? JSON.parse(appointment.data) : (appointment.data || {}); } catch(e) {}
          const clientName = appointment.full_name || body.full_name || 'A client';
          await createDistributorNotification({
            distributorCode: distributorRef,
            title: 'Referral Consultation Completed',
            message: clientName + ' (referred by you) has completed their Full Body Check-Up consultation at the ' + (appointment.branch || 'assigned') + ' branch.',
            type: 'referral_completed',
            referenceId: appointment.id,
            metadata: {
              clientName: clientName,
              appointmentId: appointment.id,
              branch: appointment.branch,
              completedAt: new Date().toISOString()
            }
          });
        } catch (notifErr) {
          console.error('Failed to notify distributor:', notifErr);
        }
      }

      return res.json(appointment);
    }

    if (method === 'DELETE') {
      await remove('appointments', id, 'id');
      await publishRealtimeEvent('appointments', 'delete', { id });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Appointments API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}



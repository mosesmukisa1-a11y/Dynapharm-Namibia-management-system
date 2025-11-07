import { query, getMany, getOne, insert, update, remove, publishRealtimeEvent } from './db.js';
import { applyAuthCors } from './_lib/auth.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const method = req.method;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const branch = searchParams.get('branch');
  const date = searchParams.get('date');
  const status = searchParams.get('status');

  try {
    if (method === 'GET') {
      let queryText = 'SELECT * FROM appointments';
      const params = [];
      const conditions = [];
      
      if (id) {
        conditions.push('id = $' + (params.length + 1));
        params.push(id);
      }
      if (branch) {
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
      
      if (conditions.length > 0) {
        queryText += ' WHERE ' + conditions.join(' AND ');
      }
      
      queryText += ' ORDER BY date DESC, time DESC';
      
      const appointments = await getMany(queryText, params);
      return res.json(appointments);
    }

    if (method === 'POST') {
      const body = await req.json();
      
      if (Array.isArray(body)) {
        // Bulk insert
        const results = [];
        for (const apt of body) {
          try {
            const appointmentData = {
              id: apt.id || `APT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              client_reference: apt.client_reference || apt.clientReference || null,
              full_name: apt.full_name || apt.fullName,
              phone: apt.phone || null,
              email: apt.email || null,
              date: apt.date,
              time: apt.time,
              branch: apt.branch || null,
              type: apt.type || null,
              status: apt.status || 'pending',
              notes: apt.notes || null,
              data: apt.data ? (typeof apt.data === 'string' ? apt.data : JSON.stringify(apt.data)) : null
            };
            
            Object.keys(appointmentData).forEach(key => {
              if (appointmentData[key] === undefined) delete appointmentData[key];
            });
            
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
        // Single insert
        const appointmentData = {
          id: body.id || `APT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          client_reference: body.client_reference || body.clientReference || null,
          full_name: body.full_name || body.fullName,
          phone: body.phone || null,
          email: body.email || null,
          date: body.date,
          time: body.time,
          branch: body.branch || null,
          type: body.type || null,
          status: body.status || 'pending',
          notes: body.notes || null,
          data: body.data ? (typeof body.data === 'string' ? body.data : JSON.stringify(body.data)) : null
        };
        
        Object.keys(appointmentData).forEach(key => {
          if (appointmentData[key] === undefined) delete appointmentData[key];
        });
        
        const appointment = await insert('appointments', appointmentData);
        await publishRealtimeEvent('appointments', 'create', appointment);
        return res.json(appointment);
      }
    }

    if (method === 'PUT') {
      const body = await req.json();
      const appointment = await update('appointments', body.id, body, 'id');
      await publishRealtimeEvent('appointments', 'update', appointment);
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
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      code: error.code || 'INTERNAL_ERROR'
    });
  }
}



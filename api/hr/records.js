import { applyAuthCors } from '../_lib/auth.js';
import { query, getOne, insert } from '../db.js';

const VALID_TYPES = ['warning', 'termination', 'attendance', 'performance', 'transfer'];

const NAMIBIAN_PUBLIC_HOLIDAYS = new Set([
  '2025-01-01',
  '2025-03-21',
  '2025-04-18',
  '2025-04-19',
  '2025-04-21',
  '2025-05-01',
  '2025-05-04',
  '2025-05-25',
  '2025-08-26',
  '2025-09-10',
  '2025-10-07',
  '2025-12-10',
  '2025-12-25',
  '2025-12-26',
  '2026-01-01',
  '2026-03-21',
  '2026-04-03',
  '2026-04-04',
  '2026-04-06',
  '2026-05-01',
  '2026-05-24',
  '2026-05-25',
  '2026-08-26',
  '2026-09-10',
  '2026-10-07',
  '2026-12-10',
  '2026-12-25',
  '2026-12-26',
]);

function isNamibianPublicHoliday(dateStr) {
  return NAMIBIAN_PUBLIC_HOLIDAYS.has(dateStr);
}

function getDayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getDay();
}

function isLateArrival(dateStr, clockInTime) {
  if (!clockInTime) return false;
  const dayOfWeek = getDayOfWeek(dateStr);
  const isHoliday = isNamibianPublicHoliday(dateStr);
  const isSaturday = dayOfWeek === 6;
  const isSunday = dayOfWeek === 0;

  if (isSunday) return false;

  let [hours, minutes] = clockInTime.split(':').map(Number);
  const clockInMinutes = hours * 60 + minutes;

  if (isHoliday || isSaturday) {
    return clockInMinutes > 8 * 60 + 10;
  }
  return clockInMinutes > 8 * 60 + 30;
}

async function isFirstClockInOfDay(employeeName, dateStr, excludeId) {
  let sql = `SELECT id FROM hr_records WHERE type = 'attendance' AND employee_name = $1 AND date = $2 AND clock_in IS NOT NULL`;
  const params = [employeeName, dateStr];
  if (excludeId) {
    params.push(excludeId);
    sql += ` AND id != $${params.length}`;
  }
  const result = await query(sql, params);
  return result.rows.length === 0;
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, `http://localhost`);
  const typeFilter = url.searchParams.get('type');

  try {
    if (req.method === 'GET') {
      let sql = `SELECT * FROM hr_records WHERE 1=1`;
      const params = [];
      if (typeFilter) { params.push(typeFilter); sql += ` AND type = $${params.length}`; }
      const empFilter = url.searchParams.get('employee_name');
      if (empFilter) { params.push(empFilter); sql += ` AND employee_name ILIKE $${params.length}`; }
      sql += ` ORDER BY created_at DESC LIMIT 500`;

      const result = await query(sql, params);
      return res.json({ success: true, records: result.rows });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const {
        type, employee_name, employee_id, subtype,
        notes, reason, effective_date, date,
        clock_in, clock_out, rating,
        strengths, improvements, goals,
        severance, status, metadata
      } = body;

      if (!type || !VALID_TYPES.includes(type)) {
        return res.status(400).json({ success: false, error: `type must be one of: ${VALID_TYPES.join(', ')}` });
      }
      if (!employee_name) {
        return res.status(400).json({ success: false, error: 'employee_name is required' });
      }

      let finalStatus = status || 'active';
      let finalSubtype = subtype || null;

      if (type === 'attendance' && clock_in) {
        const recordDate = date || new Date().toISOString().slice(0, 10);
        const firstClockIn = await isFirstClockInOfDay(employee_name, recordDate, null);
        if (firstClockIn && isLateArrival(recordDate, clock_in)) {
          finalSubtype = 'Late';
          finalStatus = 'Late';
        } else if (!finalSubtype) {
          finalSubtype = 'Present';
          finalStatus = 'Present';
        }
      }

      const result = await query(
        `INSERT INTO hr_records
           (type, employee_name, employee_id, subtype, notes, reason, effective_date, date,
            clock_in, clock_out, rating, strengths, improvements, goals,
            severance, status, metadata, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW(),NOW())
         RETURNING *`,
        [
          type,
          employee_name,
          employee_id || null,
          finalSubtype,
          notes || null,
          reason || null,
          effective_date || null,
          date || new Date().toISOString().slice(0, 10),
          clock_in || null,
          clock_out || null,
          rating ? Number(rating) : null,
          strengths || null,
          improvements || null,
          goals || null,
          severance ? Number(severance) : null,
          finalStatus,
          metadata ? JSON.stringify(metadata) : null,
          req.user?.full_name || req.user?.username || null,
        ]
      );

      // Auto-create a staff inbox notification for warnings, terminations, and transfers
      if (type === 'warning' || type === 'termination' || type === 'transfer') {
        try {
          const staffUser = await getOne(
            `SELECT username, full_name FROM users
             WHERE (LOWER(full_name) = LOWER($1) OR LOWER(username) = LOWER($1))
               AND role != 'distributor'
             ORDER BY (LOWER(full_name) = LOWER($1)) DESC
             LIMIT 1`,
            [employee_name]
          );
          const recipientId = staffUser?.username?.toLowerCase() || null;
          if (recipientId) {
            const isTermination = type === 'termination';
            const isTransfer    = type === 'transfer';
            const warnLabel     = finalSubtype ? `${finalSubtype} Warning` : 'Warning';

            // Parse transfer metadata if present
            let transferMeta = {};
            if (isTransfer && metadata) {
              try { transferMeta = typeof metadata === 'string' ? JSON.parse(metadata) : metadata; } catch {}
            }
            const transferType   = transferMeta.transfer_type || finalSubtype || 'permanent';
            const fromBranch     = transferMeta.current_branch || '';
            const toBranch       = transferMeta.new_branch || '';
            const newPosition    = transferMeta.new_position || '';
            const currPosition   = transferMeta.current_position || '';
            const effDate        = transferMeta.effective_date || effective_date || date || '';
            const endDate        = transferMeta.end_date || '';

            const notifTitle = isTermination
              ? 'Termination Notice'
              : isTransfer
                ? `Transfer Notice — ${transferType === 'permanent' ? 'Permanent' : 'Temporary'} Transfer`
                : `HR ${warnLabel}`;

            const notifMessage = isTermination
              ? `You have received a termination notice. Effective date: ${effective_date || 'TBD'}. Reason: ${reason || 'See HR for details.'}`
              : isTransfer
                ? `You are hereby notified of your ${transferType === 'permanent' ? 'permanent' : 'temporary'} transfer${fromBranch ? ` from ${fromBranch}` : ''}${toBranch ? ` to ${toBranch}` : ''}, effective ${effDate || 'TBD'}.${newPosition && newPosition !== currPosition ? ` Your new position is ${newPosition}.` : ''}${reason ? ` Reason: ${reason}` : ''}`
                : `You have received a ${warnLabel.toLowerCase()} from HR. Reason: ${reason || 'See HR for details.'}`;

            const refPrefix = isTermination ? 'TERM' : isTransfer ? 'TRAN' : 'WARN';
            const refNo = `DYN/${refPrefix}/${new Date().toISOString().slice(0,10).replace(/-/g,'')}/${employee_name.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,3)}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;

            await insert('notifications', {
              id: `STAFF-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
              recipient_type: 'staff',
              recipient_id: recipientId,
              title: notifTitle,
              message: notifMessage,
              type: isTermination ? 'termination' : isTransfer ? 'transfer' : 'warning',
              reference_id: String(result.rows[0]?.id || ''),
              metadata: JSON.stringify({
                issued_by:        req.user?.full_name || req.user?.username || 'HR',
                record_type:      type,
                subtype:          finalSubtype,
                date:             date || new Date().toISOString().slice(0, 10),
                reason:           reason || null,
                employee_name:    employee_name,
                effective_date:   effDate || null,
                severance:        severance ? Number(severance) : null,
                ref_no:           refNo,
                // Transfer-specific fields
                current_branch:   fromBranch   || null,
                new_branch:       toBranch     || null,
                current_position: currPosition || null,
                new_position:     newPosition  || null,
                transfer_type:    transferType || null,
                end_date:         endDate      || null,
              }),
            });
          }
        } catch (notifErr) {
          console.warn('[hr/records] Failed to create staff notification (non-critical):', notifErr.message);
        }
      }

      return res.status(201).json({ success: true, record: result.rows[0] });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const id = url.searchParams.get('id') || (req.body || {}).id;
      if (!id) return res.status(400).json({ success: false, error: 'id is required' });
      const body = req.body || {};
      const result = await query(
        `UPDATE hr_records SET status = COALESCE($1, status), notes = COALESCE($2, notes), updated_at = NOW()
         WHERE id = $3 RETURNING *`,
        [body.status || null, body.notes || null, id]
      );
      if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Record not found' });
      return res.json({ success: true, record: result.rows[0] });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[hr/records]', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

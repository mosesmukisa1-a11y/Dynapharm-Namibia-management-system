import {stockAsOfDate,expiryDays} from './expiryWindows.js';
export function disposalFeedback(result, requested) {
  const count = Number(result?.disposed);
  if (result?.success !== true || !Number.isInteger(count) || count < 1 || count > requested) {
    return { type: 'error', msg: 'No disposal was confirmed by the server. Refresh the records before retrying.' };
  }
  return { type: count === requested ? 'success' : 'warning',
    msg: `${count} of ${requested} selected record${requested === 1 ? '' : 's'} confirmed physically disposed.${count < requested ? ' Some records were unchanged; review the refreshed list.' : ''}` };
}

export function expiryReasonConflict(movement) {
  if (String(movement.write_off_reason || '').trim().toLowerCase() !== 'expired') return false;
  const expiry = String(movement.expiry_date || '').slice(0, 10);
  const raw = String(movement.created_at || '');
  const timestamp = new Date(raw);
  if(!Number.isFinite(timestamp.getTime()))return false;
  const written = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : stockAsOfDate(timestamp);
  const days=expiryDays(expiry,written);
  return days!==null && days>0;
}

export function stockView(params, ids) {
  const requested = params.get('view') || params.get('tab') || 'aiDashboard';
  return ids.includes(requested) ? requested : 'aiDashboard';
}

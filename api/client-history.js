import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./services/queryDescriptors.js";import { randomUUID } from 'node:crypto';
import { getOne, getMany, query, insert } from './db.js';
import { atomicStockRequest } from './_lib/atomicStockRequest.js';
import { historyAccess, historyRoles, canFileHistory, deny } from './services/clientHistoryAccess.js';
import { historyQuantities } from './services/offSystemFulfilment.js';
import { isDeepStrictEqual } from 'node:util';

function text(value, max = 10000) {return String(value || '').trim().slice(0, max);}
function date(value) {
  if (!value || !/(Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value)) || Date.parse(value) > Date.now() + 60000)
  deny('A valid past service date/time with timezone is required', 400);
  return new Date(value).toISOString();
}
async function cleanData(data, clientId) {
  if (!data || !text(data.originalAuthor) || !text(data.originalFormReference))
  deny('Recorded prescriber and original form reference are required', 400);
  const medicines = Array.isArray(data.medicines) ? data.medicines.map((m) => ({
    name: text(m.name, 255), unit: text(m.unit, 50) || 'unit', quantity: Number(m.quantity),
    directions: text(m.directions, 1000), alreadyDispensed: Number(m.alreadyDispensed || 0)
  })) : [];
  const names = new Set();
  if (!medicines.length) deny('Transcribe at least one prescribed item', 400);
  for (const m of medicines) {
    const key = m.name.toLowerCase();
    if (!m.name || names.has(key) || !Number.isSafeInteger(m.quantity) || m.quantity <= 0 ||
    !Number.isSafeInteger(m.alreadyDispensed) || m.alreadyDispensed < 0 || m.alreadyDispensed > m.quantity)
    deny('Items require unique names, positive whole quantities and dispensed quantities between zero and prescribed', 400);
    names.add(key);
  }
  const attachments = [];
  for (const item of Array.isArray(data.attachments) ? data.attachments : []) {
    const a = await __qd_executePlan(getOne, __qd_registeredPlan("api/client-history.js:32:0"), [item.id, clientId]);
    if (!a) deny('Attachment does not belong to this client', 400);
    attachments.push(a);
  }
  return { offSystemHistorical: true, location: text(data.location, 300), originalAuthor: text(data.originalAuthor, 200),
    originalFormReference: text(data.originalFormReference, 255), notes: text(data.notes), medicines, attachments };
}
async function audit(e, actor, action) {
  await insert('client_history_events', { id: randomUUID(), encounter_id: e.id, actor, action, snapshot: JSON.stringify(e) });
}
async function handler(req, res) {
  try {
    if (!req.user) deny('Authentication required', 401);
    const actor = String(req.user.sub || req.user.id || '');
    if (!actor) deny('Session actor is required', 401);
    const body = req.body || {},params = new URL(req.url, 'http://local').searchParams;
    const clientId = req.method === 'GET' ? params.get('clientId') : body.clientId;
    if (!historyRoles.includes(req.user.role)) deny('Client history access denied');
    const client = await __qd_executePlan(getOne, __qd_registeredPlan("api/client-history.js:50:1"), [clientId]);
    if (!client) deny('Client not found', 404);
    historyAccess(req.user, client.branch);
    if (req.method === 'GET') {
      const rows = await __qd_executePlan(getMany, __qd_registeredPlan("api/client-history.js:54:2"), [clientId]);
      const encounters = [];
      for (const e of rows) {
        historyAccess(req.user, e.branch);
        encounters.push({ ...e, quantities: await historyQuantities(e),
          evidence: await __qd_executePlan(getMany, __qd_registeredPlan("api/client-history.js:59:3"), [e.id]),
          history: await __qd_executePlan(getMany, __qd_registeredPlan("api/client-history.js:60:4"), [e.id]) });
      }
      return res.json({ client, encounters, appointments: [], reports: [] });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!canFileHistory(req.user)) deny('Only Front Desk or Admin may file or amend an off-system form');
    // Check before replay: old operation responses must never re-enable removed actions.
    if (!['create', 'amend'].includes(body.action)) deny('Only off-system form filing and amendments are supported', 400);
    if (!body.operationId || !/^[\w-]{8,100}$/.test(body.operationId)) deny('A stable operation ID is required', 400);
    await __qd_executePlan(query, __qd_registeredPlan("api/client-history.js:69:5"), [`history:${body.operationId}`]);
    const previous = await __qd_executePlan(getOne, __qd_registeredPlan("api/client-history.js:70:6"), [body.operationId]);
    if (previous) {
      const same = await __qd_executePlan(getOne, __qd_registeredPlan("api/client-history.js:72:7"), [body.operationId, JSON.stringify(body)]);
      if (previous.actor !== actor || !same.same) deny('Operation ID already used with different content', 409);
      return res.json(previous.response);
    }
    if (!['outreach', 'paper', 'outage'].includes(body.source)) deny('Select an off-system source', 400);
    const serviceAt = date(body.serviceAt),data = await cleanData(body.data, client.id);
    let e;
    if (body.action === 'create') {
      e = await insert('client_encounters', { id: randomUUID(), client_id: client.id, branch: client.branch,
        service_at: serviceAt, source: body.source, responsible_consultant: data.originalAuthor, captured_by: actor,
        status: 'draft', data: JSON.stringify(data) });
      await audit(e, actor, 'off-system form filed (not electronic approval)');
    } else {
      e = await __qd_executePlan(getOne, __qd_registeredPlan("api/client-history.js:85:8"), [body.encounterId, client.id]);
      if (!e) deny('Record not found', 404);
      historyAccess(req.user, e.branch);
      if (!e.data.offSystemHistorical || e.report_id) deny('Earlier evidence is read-only; it will not be rewritten', 409);
      if (body.version !== e.version) deny('Record changed; reload before retrying', 409);
      if (!text(body.reason)) deny('An amendment reason is required', 400);
      if (await __qd_executePlan(getOne, __qd_registeredPlan("api/client-history.js:91:9"), [e.id])) {
        if (!isDeepStrictEqual(data.medicines, e.data.medicines))
        deny('Medicines and historical dispensed quantities cannot change after a branch issue; amend notes only', 409);
      }
      await audit(e, actor, `original before amendment: ${text(body.reason, 1000)}`);
      e = await __qd_executePlan(getOne, __qd_registeredPlan("api/client-history.js:96:10"),
      [e.id, serviceAt, body.source, data.originalAuthor, JSON.stringify(data)]);
      await audit(e, actor, `off-system amendment: ${text(body.reason, 1000)}`);
    }
    const response = { success: true, encounter: e };
    await insert('client_history_operations', { id: body.operationId, actor, request: JSON.stringify(body), response: JSON.stringify(response) });
    return res.json(response);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success: false, error: error.statusCode ? error.message : 'Off-system form could not be saved; no changes were committed.' });
  }
}
export default atomicStockRequest(handler);

import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./services/queryDescriptors.js";import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { getOne, insert } from './db.js';
import { historyAccess, historyRoles, canFileHistory, deny } from './services/clientHistoryAccess.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ['application/pdf', 'image/png', 'image/jpeg'].includes(file.mimetype)) }).single('file');
export default async function handler(req, res) {
  try {
    if (!req.user) deny('Authentication required', 401);
    if (!historyRoles.includes(req.user.role)) deny('Client history access denied');
    const params = new URL(req.url, 'http://local').searchParams;
    const client = await __qd_executePlan(getOne, __qd_registeredPlan("api/client-history-attachment.js:13:0"), [params.get('clientId')]);
    if (!client) deny('Client not found', 404);
    historyAccess(req.user, client.branch);
    // Fail closed until private storage has passed an authenticated end-to-end
    // review. Manual transcription remains the release path by default.
    const available = process.env.CLIENT_HISTORY_PRIVATE_ATTACHMENTS_VERIFIED === 'true' &&
    !!process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID && process.env.STOCK_AUDIT_ISOLATED !== '1';
    if (req.method === 'GET' && params.get('capabilities') === 'true') return res.json({ available });
    if (req.method === 'POST' && !canFileHistory(req.user)) deny('Only Front Desk or Admin may attach a source form');
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
    if (!available) deny('Private attachments unavailable here; use manual transcription', 503);
    const { Client } = await import('@replit/object-storage');
    const storage = new Client({ bucketId: process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID });
    if (req.method === 'GET') {
      const a = await __qd_executePlan(getOne, __qd_registeredPlan("api/client-history-attachment.js:27:1"), [params.get('attachmentId'), client.id]);
      if (!a) deny('Attachment not found', 404);
      const stream = await storage.downloadAsStream(a.object_name);
      res.setHeader('Content-Type', a.mime_type);
      res.setHeader('Content-Disposition', `attachment; filename="${a.name.replace(/[^a-zA-Z0-9._-]/g, '_')}"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      stream.on('error', () => res.destroy());
      return stream.pipe(res);
    }
    await new Promise((resolve, reject) => upload(req, res, (e) => e ? reject(e) : resolve()));
    if (!req.file) deny('Attach a PDF, PNG or JPEG up to 5 MB', 400);
    const b = req.file.buffer,type = req.file.mimetype;
    const valid = type === 'application/pdf' ? b.subarray(0, 5).toString() === '%PDF-' :
    type === 'image/png' ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) :
    b[0] === 255 && b[1] === 216 && b[2] === 255;
    if (!valid) deny('The file content does not match its type', 400);
    const id = randomUUID(),objectName = `client-history-private/${id}`;
    const uploaded = await storage.uploadFromBytes(objectName, b, { contentType: type });
    if (uploaded?.ok === false) deny('Private upload failed; no attachment recorded', 503);
    try {
      const a = await insert('client_history_attachments', { id, client_id: client.id, name: req.file.originalname.slice(0, 255),
        object_name: objectName, mime_type: type, size: b.length, captured_by: req.user.sub || req.user.id });
      return res.status(201).json({ attachment: { id: a.id, name: a.name } });
    } catch (error) {await storage.delete(objectName).catch(() => {});throw error;}
  } catch (error) {return res.status(error.statusCode || (error.code === 'LIMIT_FILE_SIZE' ? 413 : 500)).json({
      error: error.statusCode ? error.message : 'Private attachment could not be processed; use manual transcription or retry.' });}
}

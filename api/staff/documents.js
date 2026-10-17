import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { query, getOne } from '../db.js';
import multer from 'multer';

const ALLOWED_TYPES = new Set([
'application/pdf',
'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
'application/msword',
'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
);

const DOC_LABELS = {
  national_id_copy: 'National ID / Passport Copy',
  academic_certificate: 'Academic Certificate / Transcript',
  professional_certificate: 'Professional Certificate',
  bank_statement: 'Bank Statement / Proof of Account',
  police_clearance: 'Police Clearance Certificate',
  drivers_license: 'Driver\'s License',
  other: 'Other Document'
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) cb(null, true);else
    cb(new Error('Only PDF, images (JPEG/PNG/WebP) and Word documents are allowed'));
  }
});

function runMulter(req, res) {
  return new Promise((resolve, reject) => {
    upload.single('file')(req, res, (err) => {
      if (err) reject(err);else resolve();
    });
  });
}

async function getStorageClient() {
  const { Client } = await import('@replit/object-storage');
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  return new Client(bucketId ? { bucketId } : undefined);
}

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const userId = req.user?.sub || req.user?.username || req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

  // GET — list own documents
  if (req.method === 'GET') {
    try {
      const result = await __qd_executePlan(query, __qd_registeredPlan("api/staff/documents.js:56:0"),


      [userId]);

      return res.json({ success: true, documents: result.rows });
    } catch (err) {
      console.error('[staff/documents GET]', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST — upload a document
  if (req.method === 'POST') {
    try {
      await runMulter(req, res);
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    const doc_type = req.body?.doc_type || 'other';
    if (!DOC_LABELS[doc_type])
    return res.status(400).json({ success: false, error: 'Invalid doc_type' });

    const ext = req.file.originalname.split('.').pop().toLowerCase();
    const safeUserId = String(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
    const objectName = `staff-documents/${safeUserId}/${Date.now()}-${doc_type}.${ext}`;
    const doc_name = req.body?.doc_name || req.file.originalname;

    try {
      const client = await getStorageClient();
      await client.uploadFromBytes(objectName, req.file.buffer, {
        contentType: req.file.mimetype
      });
      const fileUrl = `/api/obj/${objectName}`;

      const result = await __qd_executePlan(query, __qd_registeredPlan("api/staff/documents.js:93:1"),


      [userId, doc_type, doc_name, fileUrl, req.file.size, userId]);

      return res.status(201).json({ success: true, document: result.rows[0] });
    } catch (err) {
      console.error('[staff/documents POST upload]', err);
      return res.status(500).json({ success: false, error: 'File upload failed: ' + err.message });
    }
  }

  // DELETE — remove own document
  if (req.method === 'DELETE') {
    const sp = new URL(req.url, 'http://localhost').searchParams;
    const id = sp.get('id');
    if (!id) return res.status(400).json({ success: false, error: 'id is required' });

    try {
      const doc = await __qd_executePlan(getOne, __qd_registeredPlan("api/staff/documents.js:112:2"),
      [id, userId]);

      if (!doc) return res.status(404).json({ success: false, error: 'Document not found' });

      // Try to remove from object storage
      try {
        const client = await getStorageClient();
        const objKey = doc.file_url.replace(/^\/api\/obj\//, '');
        await client.delete(objKey);
      } catch (e) {/* storage delete failure is non-fatal */}

      await __qd_executePlan(query, __qd_registeredPlan("api/staff/documents.js:123:3"), [id]);
      return res.json({ success: true });
    } catch (err) {
      console.error('[staff/documents DELETE]', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

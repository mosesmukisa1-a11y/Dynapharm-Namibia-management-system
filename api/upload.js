import { applyAuthCors } from './_lib/auth.js';
import { getOne, insert, update, publishRealtimeEvent } from './db.js';
import multer from 'multer';
import path from 'path';
import { Readable } from 'stream';

// ── Replit Object Storage client ──────────────────────────────────────────────
// uploadFromStream resolves undefined on success and rejects on error
let objClient = null;
async function getObjClient() {
  if (objClient) return objClient;
  try {
    const { Client } = await import('@replit/object-storage');
    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    objClient = new Client(bucketId ? { bucketId } : undefined);
    return objClient;
  } catch (e) {
    console.warn('[upload] object storage unavailable, falling back to local disk:', e.message);
    return null;
  }
}

// Whether to use cloud object storage (requires env var set by Replit App Storage)
function hasObjectStorage() {
  return !!process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
}

// Upload buffer to Replit Object Storage under public/ prefix
async function uploadToObjectStorage(buffer, filename, mimeType) {
  const client = await getObjClient();
  if (!client) return null;
  const objectName = `public/uploads/${filename}`;
  const stream = Readable.from(buffer);
  // uploadFromStream resolves void on success, rejects on failure
  await client.uploadFromStream(objectName, stream, { contentType: mimeType });
  return objectName; // e.g. "public/uploads/upload_xxx.mp4"
}

// ── Multer — always memory storage so we can forward the buffer ───────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB
});

function runMulter(req, res) {
  return new Promise((resolve, reject) => {
    upload.single('file')(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// ── Local-disk fallback ───────────────────────────────────────────────────────
import fs from 'fs';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function saveLocalFallback(buffer, filename) {
  const filePath = path.join(UPLOADS_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  return `/uploads/${filename}`;
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.json({ success: true, message: 'Upload endpoint ready' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    await runMulter(req, res);

    const file = req.file;
    const uploadType = req.body?.type || req.body?.uploadType || 'generic';
    const entityId    = req.body?.entityId || null;
    const entityName  = req.body?.entityName || null;
    const isPrimary   = req.body?.isPrimary === 'true' || req.body?.isPrimary === true;

    if (!file) return res.status(400).json({ success: false, error: 'No file provided' });

    const mimeType = file.mimetype || 'application/octet-stream';
    const timestamp = Date.now();
    const random    = Math.random().toString(36).substring(2, 10);
    const ext       = path.extname(file.originalname || '').toLowerCase() || '.bin';
    const filename  = `upload_${timestamp}_${random}${ext}`;

    // Try cloud storage first; fall back to local disk
    let fileUrl;
    if (hasObjectStorage()) {
      try {
        const objectName = await uploadToObjectStorage(file.buffer, filename, mimeType);
        fileUrl = `/api/obj/${objectName}`; // served via server.js streaming route
      } catch (cloudErr) {
        console.warn('[upload] cloud upload failed, using local disk fallback:', cloudErr.message);
        fileUrl = saveLocalFallback(file.buffer, filename);
      }
    } else {
      fileUrl = saveLocalFallback(file.buffer, filename);
    }

    let result = null;

    if (uploadType === 'product') {
      let productId = entityId;
      if (!productId && entityName) {
        const product = await getOne(
          'SELECT id FROM products WHERE name = $1 OR description = $1 LIMIT 1',
          [entityName]
        ).catch(() => null);
        if (product) productId = product.id;
      }
      if (!productId) return res.status(400).json({ success: false, error: 'Product ID or name is required for product uploads' });

      result = await insert('product_images', {
        product_id:    productId,
        image_url:     fileUrl,
        thumbnail_url: fileUrl,
        filename,
        file_size:     file.size,
        mime_type:     mimeType,
        is_primary:    isPrimary || false,
        uploaded_at:   new Date().toISOString(),
      });
      await publishRealtimeEvent('product_images', 'create', result).catch(() => {});

    } else if (uploadType === 'distributor') {
      const distributorCode = entityId || entityName;
      if (distributorCode) {
        const distributor = await getOne(
          'SELECT id FROM distributors WHERE distributor_code = $1',
          [distributorCode]
        ).catch(() => null);
        if (distributor) {
          await update('distributors', distributor.id, {
            photo_url:        fileUrl,
            photo_filename:   filename,
            photo_updated_at: new Date().toISOString(),
          }, 'id').catch(() => {});
          result = { id: distributor.id, distributor_code: distributorCode, photo_url: fileUrl, filename };
        }
      }
      if (!result) {
        result = await safeInsertFileUpload({
          upload_type: 'distributor',
          entity_id:   distributorCode || null,
          filename,
          file_url:    fileUrl,
          file_size:   file.size,
          mime_type:   mimeType,
        });
      }
      await publishRealtimeEvent('distributors', 'update', result).catch(() => {});

    } else {
      const mediaType = req.body?.mediaType || null;
      let storedCategory = req.body?.category || null;
      if (!storedCategory && mediaType) storedCategory = mediaType;
      if (!storedCategory) {
        if (mimeType.startsWith('video/'))       storedCategory = 'video';
        else if (mimeType.startsWith('image/'))  storedCategory = 'photo';
        else if (mimeType.startsWith('application/') || mimeType === 'text/plain') storedCategory = 'document';
      }
      result = await safeInsertFileUpload({
        upload_type:  uploadType,
        entity_id:    entityId || null,
        entity_name:  entityName || null,
        filename,
        file_url:     fileUrl,
        file_size:    file.size,
        mime_type:    mimeType,
        uploaded_by:  req.user?.fullName || req.user?.username || req.user?.id || null,
        description:  req.body?.description || null,
        category:     storedCategory,
        media_type:   mediaType || storedCategory || null,
      });
    }

    return res.json({
      success: true,
      file: {
        id:       result?.id || null,
        filename,
        url:      fileUrl,
        size:     file.size,
        type:     mimeType,
      },
      message: 'File uploaded successfully',
    });

  } catch (error) {
    console.error('File upload error:', error);
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, error: 'File too large. Maximum size is 500 MB.', code: 'FILE_TOO_LARGE' });
    }
    return res.status(500).json({ success: false, error: error.message || 'Upload failed', code: error.code || 'UPLOAD_ERROR' });
  }
}

async function safeInsertFileUpload(data) {
  try {
    return await insert('file_uploads', { ...data, uploaded_at: new Date().toISOString() });
  } catch (_) {
    return { id: `upload_${Date.now()}`, ...data };
  }
}

import { applyAuthCors } from './_lib/auth.js';
import { getOne, insert, update, publishRealtimeEvent } from './db.js';
import multer from 'multer';

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
});

function runMulter(req, res) {
  return new Promise((resolve, reject) => {
    upload.single('file')(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.json({ success: true, message: 'Upload endpoint ready' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await runMulter(req, res);

    const file = req.file;
    const uploadType = req.body?.type || req.body?.uploadType || 'generic';
    const entityId = req.body?.entityId || null;
    const entityName = req.body?.entityName || null;
    const isPrimary = req.body?.isPrimary === 'true' || req.body?.isPrimary === true;

    if (!file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const base64 = file.buffer.toString('base64');
    const mimeType = file.mimetype || 'application/octet-stream';
    const dataUrl = `data:${mimeType};base64,${base64}`;

    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 10);
    const ext = (file.originalname || 'file').split('.').pop() || 'bin';
    const filename = `${uploadType}_${timestamp}_${randomStr}.${ext}`;

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

      if (!productId) {
        return res.status(400).json({ success: false, error: 'Product ID or name is required for product uploads' });
      }

      result = await insert('product_images', {
        product_id: productId,
        image_url: dataUrl,
        thumbnail_url: dataUrl,
        filename,
        file_size: file.size,
        mime_type: mimeType,
        is_primary: isPrimary || false,
        uploaded_at: new Date().toISOString(),
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
            photo_url: dataUrl,
            photo_filename: filename,
            photo_updated_at: new Date().toISOString(),
          }, 'id').catch(() => {});

          result = { id: distributor.id, distributor_code: distributorCode, photo_url: dataUrl, filename };
        }
      }

      if (!result) {
        result = await safeInsertFileUpload({
          upload_type: 'distributor',
          entity_id: distributorCode || null,
          filename,
          file_url: dataUrl,
          file_size: file.size,
          mime_type: mimeType,
        });
      }

      await publishRealtimeEvent('distributors', 'update', result).catch(() => {});

    } else {
      result = await safeInsertFileUpload({
        upload_type: uploadType,
        entity_id: entityId || null,
        entity_name: entityName || null,
        filename,
        file_url: dataUrl,
        file_size: file.size,
        mime_type: mimeType,
      });
    }

    return res.json({
      success: true,
      file: {
        id: result?.id || null,
        filename,
        url: dataUrl,
        size: file.size,
        type: mimeType,
      },
      message: 'File uploaded successfully',
    });

  } catch (error) {
    console.error('File upload error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Upload failed',
      code: error.code || 'UPLOAD_ERROR',
    });
  }
}

async function safeInsertFileUpload(data) {
  try {
    return await insert('file_uploads', { ...data, uploaded_at: new Date().toISOString() });
  } catch (_) {
    return { id: `upload_${Date.now()}`, ...data };
  }
}

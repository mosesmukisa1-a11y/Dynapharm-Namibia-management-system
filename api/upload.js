import { applyAuthCors } from './_lib/auth.js';
import { query, getMany, getOne, insert, update, remove, publishRealtimeEvent } from './db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get('file');
    const uploadType = formData.get('type'); // 'product', 'distributor', 'user', etc.
    const entityId = formData.get('entityId'); // product_id, distributor_code, etc.
    const entityName = formData.get('entityName'); // product name, distributor name, etc.
    const isPrimary = formData.get('isPrimary') === 'true';

    if (!file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    if (!uploadType) {
      return res.status(400).json({ error: 'Upload type is required (product, distributor, user, etc.)' });
    }

    // Convert file to base64 for storage
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${file.type};base64,${base64}`;

    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const fileExtension = file.name.split('.').pop() || 'jpg';
    const filename = `${uploadType}_${timestamp}_${randomStr}.${fileExtension}`;

    // Store file metadata in database
    let result;
    
    if (uploadType === 'product') {
      // Find product by ID or name
      let productId = entityId;
      if (!productId && entityName) {
        const product = await getOne(
          'SELECT id FROM products WHERE name = $1 OR description = $1 LIMIT 1',
          [entityName]
        );
        if (product) productId = product.id;
      }

      if (!productId) {
        return res.status(400).json({ error: 'Product ID or name is required for product uploads' });
      }

      // Create image variants (store full size for now, frontend can generate variants)
      result = await insert('product_images', {
        product_id: productId,
        image_url: dataUrl,
        thumbnail_url: dataUrl, // Can be optimized later
        filename: filename,
        file_size: file.size,
        mime_type: file.type,
        is_primary: isPrimary || false,
        uploaded_at: new Date().toISOString()
      });

      await publishRealtimeEvent('product_images', 'create', result);
    } else if (uploadType === 'distributor') {
      // Store distributor photo
      const distributorCode = entityId || entityName;
      if (!distributorCode) {
        return res.status(400).json({ error: 'Distributor code or name is required' });
      }

      // Update distributor record with photo
      const distributor = await getOne(
        'SELECT id FROM distributors WHERE distributor_code = $1',
        [distributorCode]
      );

      if (distributor) {
        // Update distributor with photo URL
        await update('distributors', distributor.id, {
          photo_url: dataUrl,
          photo_filename: filename,
          photo_updated_at: new Date().toISOString()
        }, 'id');
        
        result = {
          id: distributor.id,
          distributor_code: distributorCode,
          photo_url: dataUrl,
          filename: filename
        };
      } else {
        // Store in a file_uploads table for later association
        result = await insert('file_uploads', {
          upload_type: 'distributor',
          entity_id: distributorCode,
          filename: filename,
          file_url: dataUrl,
          file_size: file.size,
          mime_type: file.type,
          uploaded_at: new Date().toISOString()
        });
      }

      await publishRealtimeEvent('distributors', 'update', result);
    } else {
      // Generic file upload
      result = await insert('file_uploads', {
        upload_type: uploadType,
        entity_id: entityId || null,
        entity_name: entityName || null,
        filename: filename,
        file_url: dataUrl,
        file_size: file.size,
        mime_type: file.type,
        uploaded_at: new Date().toISOString()
      });
    }

    return res.json({
      success: true,
      file: {
        id: result.id,
        filename: filename,
        url: dataUrl,
        size: file.size,
        type: file.type
      },
      message: 'File uploaded successfully'
    });
  } catch (error) {
    console.error('File upload error:', error);
    return res.status(500).json({ 
      error: error.message || 'Internal server error',
      code: error.code || 'UPLOAD_ERROR'
    });
  }
}


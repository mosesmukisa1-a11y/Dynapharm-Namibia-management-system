import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./services/queryDescriptors.js";import { applyAuthCors } from './_lib/auth.js';
import { query, getMany, getOne, insert, update, remove, publishRealtimeEvent } from './db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const method = req.method;
  const { searchParams } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const id = searchParams.get('id');
  const product_id = searchParams.get('product_id');
  const product_name = searchParams.get('product_name');

  try {
    if (method === 'GET') {
      if (id) {
        // Get single image
        const image = await __qd_executePlan(getOne, __qd_registeredPlan("api/product_images.js:21:0"), [id]);
        if (!image) {
          return res.status(404).json({ error: 'Product image not found' });
        }
        return res.json(image);
      } else if (product_id) {
        // Get images for a product by ID
        const images = await __qd_executePlan(getMany, __qd_registeredPlan("api/product_images.js:29:1"),

        [product_id]);

        return res.json(images);
      } else if (product_name) {
        // Get images for a product by name (join with products table)
        const images = await __qd_executePlan(getMany, __qd_registeredPlan("api/product_images.js:36:2"),





        [`%${product_name}%`]);

        return res.json(images);
      } else {
        // Get all images with product names
        const images = await __qd_executePlan(getMany, __qd_registeredPlan("api/product_images.js:46:3"), []);





        return res.json(images);
      }
    }

    if (method === 'POST') {
      const body = req.body;

      if (Array.isArray(body)) {
        // Bulk insert images
        const results = [];
        for (const img of body) {
          try {
            // If product_name provided, find product_id
            let productId = img.product_id;
            if (!productId && img.product_name) {
              const product = await __qd_executePlan(getOne, __qd_registeredPlan("api/product_images.js:68:4"),

              [img.product_name]);

              if (product) productId = product.id;
            }

            if (!productId) {
              console.warn('Skipping image - product_id or product_name required');
              continue;
            }

            const image = await insert('product_images', {
              product_id: productId,
              image_url: img.image_url || img.url || img.src,
              thumbnail_url: img.thumbnail_url || img.thumbnail,
              variant_data: img.variant_data || null,
              is_primary: img.is_primary || false
            });
            results.push(image);
          } catch (error) {
            console.error('Error inserting product image:', error);
          }
        }

        if (results.length > 0) {
          await publishRealtimeEvent('product_images', 'create', results);
        }

        return res.json({ success: true, count: results.length, images: results });
      } else {
        // Create single image
        let productId = body.product_id;
        if (!productId && body.product_name) {
          const product = await __qd_executePlan(getOne, __qd_registeredPlan("api/product_images.js:102:5"),

          [body.product_name]);

          if (product) productId = product.id;
        }

        if (!productId) {
          return res.status(400).json({ error: 'product_id or product_name is required' });
        }

        const image = await insert('product_images', {
          product_id: productId,
          image_url: body.image_url || body.url || body.src,
          thumbnail_url: body.thumbnail_url || body.thumbnail || null,
          variant_data: body.variant_data || null,
          is_primary: body.is_primary || false
        });

        await publishRealtimeEvent('product_images', 'create', image);
        return res.json(image);
      }
    }

    if (method === 'PUT') {
      const body = req.body;
      if (!body.id) {
        return res.status(400).json({ error: 'id is required for update' });
      }
      const imagePayload = {
        ...(body.product_id !== undefined && { product_id: body.product_id }),
        ...(body.product_name !== undefined && { product_name: body.product_name }),
        ...(body.image_data !== undefined && { image_data: body.image_data }),
        ...(body.image_url !== undefined && { image_url: body.image_url }),
        ...(body.image_type !== undefined && { image_type: body.image_type }),
        ...(body.width !== undefined && { width: body.width }),
        ...(body.height !== undefined && { height: body.height }),
        ...(body.file_size !== undefined && { file_size: body.file_size }),
        ...(body.is_primary !== undefined && { is_primary: body.is_primary }),
        ...(body.display_order !== undefined && { display_order: body.display_order }),
        updated_at: new Date().toISOString()
      };
      const image = await update('product_images', body.id, imagePayload, 'id');
      if (image) {
        await publishRealtimeEvent('product_images', 'update', image);
        return res.json(image);
      } else {
        return res.status(404).json({ error: 'Product image not found' });
      }
    }

    if (method === 'DELETE') {
      if (!id) {
        return res.status(400).json({ error: 'id is required for delete' });
      }
      const deleted = await remove('product_images', id, 'id');
      if (deleted) {
        await publishRealtimeEvent('product_images', 'delete', { id });
        return res.json({ success: true });
      } else {
        return res.status(404).json({ error: 'Product image not found' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Product Images API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

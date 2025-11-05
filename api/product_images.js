import { query, getMany, getOne, insert, update, remove, publishRealtimeEvent } from './db.js';

export default async function handler(req, res) {
  const method = req.method;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const product_id = searchParams.get('product_id');
  const product_name = searchParams.get('product_name');

  try {
    if (method === 'GET') {
      if (id) {
        // Get single image
        const image = await getOne('SELECT * FROM product_images WHERE id = $1', [id]);
        if (!image) {
          return res.status(404).json({ error: 'Product image not found' });
        }
        return res.json(image);
      } else if (product_id) {
        // Get images for a product by ID
        const images = await getMany(
          'SELECT * FROM product_images WHERE product_id = $1 ORDER BY is_primary DESC, created_at ASC',
          [product_id]
        );
        return res.json(images);
      } else if (product_name) {
        // Get images for a product by name (join with products table)
        const images = await getMany(
          `SELECT pi.* FROM product_images pi 
           JOIN products p ON pi.product_id = p.id 
           WHERE p.name = $1 OR p.description = $1 
           ORDER BY pi.is_primary DESC, pi.created_at ASC`,
          [product_name]
        );
        return res.json(images);
      } else {
        // Get all images
        const images = await getMany('SELECT * FROM product_images ORDER BY created_at DESC');
        return res.json(images);
      }
    }

    if (method === 'POST') {
      const body = await req.json();
      
      if (Array.isArray(body)) {
        // Bulk insert images
        const results = [];
        for (const img of body) {
          try {
            // If product_name provided, find product_id
            let productId = img.product_id;
            if (!productId && img.product_name) {
              const product = await getOne(
                'SELECT id FROM products WHERE name = $1 OR description = $1 LIMIT 1',
                [img.product_name]
              );
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
          const product = await getOne(
            'SELECT id FROM products WHERE name = $1 OR description = $1 LIMIT 1',
            [body.product_name]
          );
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
      const body = await req.json();
      if (!body.id) {
        return res.status(400).json({ error: 'id is required for update' });
      }
      const image = await update('product_images', body.id, body, 'id');
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
    return res.status(500).json({ error: error.message });
  }
}


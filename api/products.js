import { query, getMany, getOne, insert, update, remove, publishRealtimeEvent } from './db.js';

export default async function handler(req, res) {
  try {
    const method = req.method;
    // Vercel provides req.url as a string, parse it correctly
    let searchParams;
    let id, productName;
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      searchParams = url.searchParams;
      id = searchParams.get('id');
      productName = searchParams.get('productName');
    } catch (urlError) {
      // Fallback: parse query string manually
      const urlParts = req.url.split('?');
      if (urlParts[1]) {
        const params = new URLSearchParams(urlParts[1]);
        id = params.get('id');
        productName = params.get('productName');
      }
    }

    if (method === 'GET') {
      if (id) {
        // Get single product
        const product = await getOne('SELECT * FROM products WHERE id = $1', [id]);
        if (!product) {
          return res.status(404).json({ error: 'Product not found' });
        }
        
        // Get product images
        const images = await getMany('SELECT * FROM product_images WHERE product_id = $1 ORDER BY display_order, created_at', [id]);
        product.images = images.map(img => ({
          id: img.id,
          image_data: img.image_data,
          image_url: img.image_url,
          image_type: img.image_type,
          is_primary: img.is_primary,
          display_order: img.display_order
        }));
        
        return res.json(product);
      } else if (productName) {
        // Get images for a specific product by name
        const images = await getMany(
          'SELECT * FROM product_images WHERE product_name = $1 ORDER BY display_order, created_at',
          [productName]
        );
        return res.json(images);
      } else {
        // Get all products
        const products = await getMany('SELECT * FROM products ORDER BY name');
        
        // Get images for all products
        for (const product of products) {
          const images = await getMany(
            'SELECT * FROM product_images WHERE product_id = $1 ORDER BY display_order, created_at',
            [product.id]
          );
          product.images = images.map(img => ({
            id: img.id,
            image_data: img.image_data,
            image_url: img.image_url,
            image_type: img.image_type,
            is_primary: img.is_primary,
            display_order: img.display_order
          }));
        }
        
        return res.json(products);
      }
    }

    if (method === 'POST') {
      const body = await req.json();
      
      if (body.action === 'uploadImage') {
        // Upload product image
        const { productId, productName, imageData, imageUrl, imageType, width, height, fileSize, isPrimary, displayOrder } = body;
        
        const imageId = `IMG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const image = await insert('product_images', {
          id: imageId,
          product_id: productId || null,
          product_name: productName,
          image_data: imageData,
          image_url: imageUrl || null,
          image_type: imageType || 'jpg',
          width: width || null,
          height: height || null,
          file_size: fileSize || null,
          is_primary: isPrimary || false,
          display_order: displayOrder || 0
        });
        
        await publishRealtimeEvent('product_images', 'create', image);
        return res.json({ success: true, image });
      } else {
        // Create new product
        const product = await insert('products', {
          id: body.id || `PROD-${Date.now()}`,
          sku: body.sku,
          name: body.name,
          description: body.description || null,
          category: body.category || null,
          unit: body.unit || null,
          dp: body.dp,
          cp: body.cp,
          bv: body.bv,
          tax_rate: body.tax_rate || 0,
          is_active: body.is_active !== undefined ? body.is_active : true,
          branch: body.branch || null,
          created_by: body.created_by || null
        });
        
        await publishRealtimeEvent('products', 'create', product);
        return res.json(product);
      }
    }

    if (method === 'PUT') {
      const body = await req.json();
      
      if (body.action === 'updateImage') {
        // Update product image
        const image = await update('product_images', body.id, body, 'id');
        await publishRealtimeEvent('product_images', 'update', image);
        return res.json({ success: true, image });
      } else {
        // Update product
        const product = await update('products', body.id, body, 'id');
        await publishRealtimeEvent('products', 'update', product);
        return res.json(product);
      }
    }

    if (method === 'DELETE') {
      if (id) {
        // Delete product or image
        const type = searchParams ? searchParams.get('type') : null;
        if (type === 'image') {
          await remove('product_images', id, 'id');
          await publishRealtimeEvent('product_images', 'delete', { id });
        } else {
          await remove('products', id, 'id');
          await publishRealtimeEvent('products', 'delete', { id });
        }
        return res.json({ success: true });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Products API error:', error);
    // Return a proper error response
    const errorMessage = error?.message || 'Internal server error';
    const errorStack = process.env.NODE_ENV === 'development' ? error?.stack : undefined;
    return res.status(500).json({ 
      error: errorMessage,
      ...(errorStack && { stack: errorStack })
    });
  }
}


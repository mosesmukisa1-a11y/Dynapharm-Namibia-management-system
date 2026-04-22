import { applyAuthCors } from './_lib/auth.js';
import { query, getMany, getOne, insert, update, remove, publishRealtimeEvent } from './db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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

        // Enrich with GM price-list values
        const pl = await getOne(
          'SELECT * FROM product_prices WHERE UPPER(TRIM(description)) = UPPER(TRIM($1))',
          [product.name || '']
        );
        if (pl) {
          product.dp = pl.dp;
          product.cp = pl.cp;
          product.cif = pl.cif;
          product.bv = pl.bv;
          product.hasPricing = true;
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
        // Get all products from the products table and price list together
        const [dbProducts, priceRows] = await Promise.all([
          getMany('SELECT * FROM products WHERE is_active = true ORDER BY name'),
          getMany('SELECT * FROM product_prices ORDER BY description'),
        ]);

        // Attach images to each db product
        for (const product of dbProducts) {
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

        // Build a lookup map from product_prices by normalised name
        const priceMap = new Map();
        for (const p of priceRows) {
          priceMap.set((p.description || '').toUpperCase().trim(), p);
        }

        // Override dp/cp/cif/bv on every dbProduct with GM price-list values when a match exists
        const enrichedDbProducts = dbProducts.map(prod => {
          const key = (prod.name || '').toUpperCase().trim();
          const pl = priceMap.get(key);
          if (pl) {
            return {
              ...prod,
              dp: pl.dp,
              cp: pl.cp,
              cif: pl.cif,
              bv: pl.bv,
              hasPricing: true,
            };
          }
          return prod;
        });

        // Add price-list entries that have NO matching row in the products table
        const dbNames = new Set(enrichedDbProducts.map(p => (p.name || '').toUpperCase().trim()));
        const priceOnlyProducts = priceRows
          .filter(p => !dbNames.has((p.description || '').toUpperCase().trim()))
          .map(p => ({
            id: `pl-${p.id}`,
            sku: null,
            name: p.description,
            description: p.description,
            category: null,
            unit: null,
            dp: p.dp,
            cp: p.cp,
            bv: p.bv,
            cif: p.cif,
            tax_rate: 0,
            is_active: true,
            branch: null,
            images: [],
            from_price_list: true,
            hasPricing: true,
          }));

        // Only include DB products that are on the current GM price list.
        // Products removed from the price list are excluded from the shop.
        const activeDbProducts = enrichedDbProducts.filter(p => p.hasPricing);

        return res.json([...activeDbProducts, ...priceOnlyProducts]);
      }
    }

    if (method === 'POST') {
      const body = req.body;
      
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
      const body = req.body;
      
      if (body.action === 'updateImage') {
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
          updated_at: new Date().toISOString(),
        };
        const image = await update('product_images', body.id, imagePayload, 'id');
        await publishRealtimeEvent('product_images', 'update', image);
        return res.json({ success: true, image });
      } else {
        const productPayload = {
          ...(body.sku !== undefined && { sku: body.sku }),
          ...(body.name !== undefined && { name: body.name }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.category !== undefined && { category: body.category }),
          ...(body.unit !== undefined && { unit: body.unit }),
          ...(body.dp !== undefined && { dp: body.dp }),
          ...(body.cp !== undefined && { cp: body.cp }),
          ...(body.bv !== undefined && { bv: body.bv }),
          ...(body.tax_rate !== undefined && { tax_rate: body.tax_rate }),
          ...(body.is_active !== undefined && { is_active: body.is_active }),
          ...(body.branch !== undefined && { branch: body.branch }),
          updated_at: new Date().toISOString(),
        };
        const product = await update('products', body.id, productPayload, 'id');
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
    return res.status(500).json({ error: 'Internal server error' });
  }
}


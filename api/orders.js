import { applyAuthCors, getBranchScope } from './_lib/auth.js';
import { getMany, getOne, insert, update, query } from './db.js';
import { publishRealtimeEvent } from './db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST' && !req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const branchScope = getBranchScope(req.user);

  try {
    if (req.method === 'GET') {
      const { id, order_number, status, customer_email, customer_phone, distributor_code } = req.query;

      if (id) {
        const order = await getOne('SELECT * FROM online_orders WHERE id = $1', [id]);
        if (!order) {
          return res.status(404).json({ error: 'Order not found' });
        }
        if (branchScope.enforced && !branchScope.branches.includes(order.branch_id || null)) {
          return res.status(403).json({ error: 'Access denied' });
        }
        return res.json(order);
      }

      if (order_number) {
        const order = await getOne('SELECT * FROM online_orders WHERE order_number = $1', [order_number]);
        if (!order) {
          return res.status(404).json({ error: 'Order not found' });
        }
        if (branchScope.enforced && !branchScope.branches.includes(order.branch_id || null)) {
          return res.status(403).json({ error: 'Access denied' });
        }
        return res.json(order);
      }

      let queryText = 'SELECT o.*, b.name as branch_name, t.name as town_name FROM online_orders o LEFT JOIN branches b ON o.branch_id = b.id LEFT JOIN towns t ON o.town_id = t.id WHERE 1=1';
      const params = [];
      let paramIndex = 1;

      if (branchScope.enforced) {
        queryText += ` AND o.branch_id = ANY($${paramIndex})`;
        params.push(branchScope.branches);
        paramIndex++;
      }

      if (status) {
        queryText += ` AND o.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      if (customer_email) {
        queryText += ` AND o.customer_email = $${paramIndex}`;
        params.push(customer_email);
        paramIndex++;
      }

      if (customer_phone) {
        queryText += ` AND o.customer_phone = $${paramIndex}`;
        params.push(customer_phone);
        paramIndex++;
      }

      if (distributor_code) {
        queryText += ` AND (o.distributor_code = $${paramIndex} OR o.notes ILIKE $${paramIndex + 1})`;
        params.push(distributor_code, `%${distributor_code}%`);
        paramIndex += 2;
      }

      queryText += ' ORDER BY o.created_at DESC';

      const orders = await getMany(queryText, params);
      return res.json(orders);
    }

    if (req.method === 'POST') {
      const {
        customer_name,
        customer_email,
        customer_phone,
        customer_type,
        delivery_method,
        branch_id,
        town_id,
        delivery_address,
        subtotal,
        items,
        notes,
        payment_method,
        distributor_code,
      } = req.body;

      // Validation — customer_name and items are truly required; delivery_method and subtotal have defaults
      if (!customer_name) {
        return res.status(400).json({ error: 'customer_name is required' });
      }
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items array is required and must not be empty' });
      }

      const effectiveDeliveryMethod = delivery_method || 'pickup';

      const serverSubtotal = items.reduce((sum, item) => sum + (parseFloat(item.unit_price || 0) * parseInt(item.quantity || 1, 10)), 0);
      const effectiveSubtotal = serverSubtotal || parseFloat(subtotal || 0);

      if (effectiveDeliveryMethod === 'delivery' && !town_id && !delivery_address) {
        return res.status(400).json({ error: 'delivery_address or town_id is required for delivery orders' });
      }

      // Calculate delivery fee
      let deliveryFee = 0;
      let deliveryFeePercentage = 0;
      let distanceKm = null;

      if (effectiveDeliveryMethod === 'delivery' && town_id) {
        // Get delivery distance from database
        try {
          let distance;
          if (branch_id) {
            distance = await getOne(
              'SELECT * FROM delivery_distances WHERE branch_id = $1 AND town_id = $2',
              [branch_id, town_id]
            );
          }
          
          if (!distance) {
            // Find nearest branch to the town
            distance = await getOne(
              'SELECT * FROM delivery_distances WHERE town_id = $1 ORDER BY distance_km ASC LIMIT 1',
              [town_id]
            );
          }
          
          if (distance) {
            distanceKm = parseFloat(distance.distance_km);
            deliveryFeePercentage = parseFloat(distance.delivery_fee_percentage);
            // Auto-calculate fee percentage based on distance if not set
            if (!deliveryFeePercentage || deliveryFeePercentage === 0) {
              deliveryFeePercentage = distanceKm >= 50 ? 20.00 : 15.00;
            }
          } else {
            // Default: assume far distance (20%)
            deliveryFeePercentage = 20.00;
            distanceKm = null;
          }
          
          deliveryFee = (parseFloat(effectiveSubtotal) * deliveryFeePercentage) / 100;
        } catch (error) {
          console.error('Error calculating delivery fee:', error);
          deliveryFeePercentage = 20.00;
          deliveryFee = (parseFloat(effectiveSubtotal) * 20.00) / 100;
        }
      }

      const totalAmount = parseFloat(effectiveSubtotal) + deliveryFee;

      // Generate order number
      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create order
      const order = await insert('online_orders', {
        id: orderId,
        order_number: orderNumber,
        customer_name,
        customer_email: customer_email || null,
        customer_phone: customer_phone || null,
        customer_type: customer_type || 'customer',
        delivery_method: effectiveDeliveryMethod,
        branch_id: branch_id || null,
        town_id: town_id || null,
        delivery_address: delivery_address || null,
        subtotal: parseFloat(effectiveSubtotal),
        delivery_fee: deliveryFee,
        delivery_fee_percentage: deliveryFeePercentage,
        total_amount: totalAmount,
        distance_km: distanceKm,
        status: 'pending',
        payment_status: 'pending',
        payment_method: payment_method || null,
        notes: notes || null,
        distributor_code: distributor_code || null,
        items: JSON.stringify(items),
      });

      // Publish realtime event (use 'orders' as resource name for WebSocket compatibility)
      await publishRealtimeEvent('orders', 'created', order);

      return res.status(201).json(order);
    }

    if (req.method === 'PUT') {
      const id = req.query.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Order ID is required' });
      }

      if (branchScope.enforced) {
        const existing = await getOne('SELECT branch_id FROM online_orders WHERE id = $1', [id]);
        if (existing && !branchScope.branches.includes(existing.branch_id || null)) {
          return res.status(403).json({ error: 'Access denied' });
        }
      }

      const {
        status,
        payment_status,
        payment_method,
        delivery_address,
        notes,
      } = req.body || {};

      const updates = {};
      if (status) updates.status = status;
      if (payment_status) updates.payment_status = payment_status;
      if (payment_method !== undefined) updates.payment_method = payment_method;
      if (delivery_address !== undefined) updates.delivery_address = delivery_address;
      if (notes !== undefined) updates.notes = notes;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      const order = await update('online_orders', id, updates);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Publish realtime event (use 'orders' as resource name for WebSocket compatibility)
      await publishRealtimeEvent('orders', 'updated', order);

      return res.json(order);
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'Order ID is required' });

      const existing = await getOne('SELECT * FROM online_orders WHERE id = $1', [id]);
      if (!existing) return res.status(404).json({ error: 'Order not found' });

      if (branchScope.enforced && !branchScope.branches.includes(existing.branch_id || null)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const userRole = (req.user?.role || '').toLowerCase();
      if (userRole === 'distributor') {
        const userNb = (req.user?.username || '').toUpperCase();
        if ((existing.distributor_code || '').toUpperCase() !== userNb) {
          return res.status(403).json({ error: 'You can only delete your own orders' });
        }
        if (!['pending', 'processing'].includes(existing.status || '')) {
          return res.status(400).json({ error: 'Only pending or processing orders can be deleted' });
        }
      }

      await query('DELETE FROM online_orders WHERE id = $1', [id]);
      await publishRealtimeEvent('orders', 'deleted', { id });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Orders API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}


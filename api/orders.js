import { registeredPlan as __qd_registeredPlan, joinPlans as __qd_joinPlans, executePlan as __qd_executePlan } from "./services/queryDescriptors.js";import { applyAuthCors, getBranchScope } from './_lib/auth.js';
import { getMany, getOne, insert, update, query, withTransaction, publishRealtimeEvent } from './db.js';
import { postActivityRecord, generateBatId } from './_lib/activityCapture.js';
import { recomputeLocationBalances } from './services/stockEngine.js';
import { requireMemberWrite } from './services/memberEligibility.js';

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
        const order = await __qd_executePlan(getOne, __qd_registeredPlan("api/orders.js:25:0"), [id]);
        if (!order) {
          return res.status(404).json({ error: 'Order not found' });
        }
        if (branchScope.enforced && !branchScope.branches.includes(order.branch_id || null)) {
          return res.status(403).json({ error: 'Access denied' });
        }
        return res.json(order);
      }

      if (order_number) {
        const order = await __qd_executePlan(getOne, __qd_registeredPlan("api/orders.js:36:1"), [order_number]);
        if (!order) {
          return res.status(404).json({ error: 'Order not found' });
        }
        if (branchScope.enforced && !branchScope.branches.includes(order.branch_id || null)) {
          return res.status(403).json({ error: 'Access denied' });
        }
        return res.json(order);
      }

      let queryText = __qd_registeredPlan("api/orders.js:46:2");
      const params = [];
      let paramIndex = 1;

      if (branchScope.enforced) {
        queryText = __qd_joinPlans([queryText, __qd_registeredPlan("api/orders.js:51:3", [paramIndex])], "empty");
        params.push(branchScope.branches);
        paramIndex++;
      }

      if (status) {
        queryText = __qd_joinPlans([queryText, __qd_registeredPlan("api/orders.js:57:4", [paramIndex])], "empty");
        params.push(status);
        paramIndex++;
      }

      if (customer_email) {
        queryText = __qd_joinPlans([queryText, __qd_registeredPlan("api/orders.js:63:5", [paramIndex])], "empty");
        params.push(customer_email);
        paramIndex++;
      }

      if (customer_phone) {
        queryText = __qd_joinPlans([queryText, __qd_registeredPlan("api/orders.js:69:6", [paramIndex])], "empty");
        params.push(customer_phone);
        paramIndex++;
      }

      if (distributor_code) {
        queryText = __qd_joinPlans([queryText, __qd_registeredPlan("api/orders.js:75:7", [paramIndex, paramIndex + 1])], "empty");
        params.push(distributor_code, `%${distributor_code}%`);
        paramIndex += 2;
      }

      queryText = __qd_joinPlans([queryText, __qd_registeredPlan("api/orders.js:80:8")], "empty");

      const orders = await __qd_executePlan(getMany, queryText, params);
      return res.json(orders);
    }

    if (req.method === 'POST') {
      if (['member', 'distributor'].includes(String(req.body?.customer_type || '').toLowerCase())) {
        try {await requireMemberWrite(req.user, req.body.distributor_code);}
        catch (error) {return res.status(error.statusCode || 503).json({ error: error.statusCode ? error.message : 'Membership verification unavailable' });}
      }
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
        distributor_code
      } = req.body;

      if (!customer_name) {
        return res.status(400).json({ error: 'customer_name is required' });
      }
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items array is required and must not be empty' });
      }

      const effectiveDeliveryMethod = delivery_method || 'pickup';

      const serverSubtotal = items.reduce((sum, item) => sum + parseFloat(item.unit_price || 0) * parseInt(item.quantity || 1, 10), 0);
      const effectiveSubtotal = serverSubtotal || parseFloat(subtotal || 0);

      if (effectiveDeliveryMethod === 'delivery' && !town_id && !delivery_address) {
        return res.status(400).json({ error: 'delivery_address or town_id is required for delivery orders' });
      }

      let deliveryFee = 0;
      let deliveryFeePercentage = 0;
      let distanceKm = null;

      if (effectiveDeliveryMethod === 'delivery' && town_id) {
        try {
          let distance;
          if (branch_id) {
            distance = await __qd_executePlan(getOne, __qd_registeredPlan("api/orders.js:132:9"),

            [branch_id, town_id]);

          }

          if (!distance) {
            distance = await __qd_executePlan(getOne, __qd_registeredPlan("api/orders.js:139:10"),

            [town_id]);

          }

          if (distance) {
            distanceKm = parseFloat(distance.distance_km);
            deliveryFeePercentage = parseFloat(distance.delivery_fee_percentage);
            if (!deliveryFeePercentage || deliveryFeePercentage === 0) {
              deliveryFeePercentage = distanceKm >= 50 ? 20.00 : 15.00;
            }
          } else {
            deliveryFeePercentage = 20.00;
            distanceKm = null;
          }

          deliveryFee = parseFloat(effectiveSubtotal) * deliveryFeePercentage / 100;
        } catch (error) {
          console.error('Error calculating delivery fee:', error);
          deliveryFeePercentage = 20.00;
          deliveryFee = parseFloat(effectiveSubtotal) * 20.00 / 100;
        }
      }

      const totalAmount = parseFloat(effectiveSubtotal) + deliveryFee;

      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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
        items: JSON.stringify(items)
      });

      await publishRealtimeEvent('orders', 'created', order);

      return res.status(201).json(order);
    }

    if (req.method === 'PUT') {
      const id = req.query.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Order ID is required' });
      }

      const existing = await __qd_executePlan(getOne, __qd_registeredPlan("api/orders.js:203:11"), [id]);
      if (!existing) {
        return res.status(404).json({ error: 'Order not found' });
      }

      if (branchScope.enforced && !branchScope.branches.includes(existing.branch_id || null)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const {
        status,
        payment_status,
        payment_method,
        delivery_address,
        notes
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

      // ─── Fulfillment trigger ───────────────────────────────────────────────
      // Fire when transitioning to 'delivered' and payment is paid (either
      // arriving in this request or already on the row) and not yet deducted.
      const newStatus = status || existing.status;
      const newPaymentStatus = payment_status || existing.payment_status;
      const shouldFulfil =
      newStatus === 'delivered' &&
      newPaymentStatus === 'paid' &&
      !existing.stock_deducted &&
      existing.branch_id;

      if (shouldFulfil) {
        const branchId = existing.branch_id;
        const orderItems = Array.isArray(existing.items) ?
        existing.items :
        typeof existing.items === 'string' ? JSON.parse(existing.items) : [];

        const customerType = existing.customer_type === 'member' ? 'member' : 'non_member';
        const movType = customerType === 'member' ? 'walk_in_member_sale' : 'walk_in_non_member_sale';

        const livePriceRows = await __qd_executePlan(getMany, __qd_registeredPlan("api/orders.js:251:12"), []);
        const livePriceMap = {};
        for (const row of livePriceRows) {
          if (row.description) livePriceMap[row.description.toLowerCase()] = row;
        }

        const deductItems = orderItems.map((item) => {
          const name = item.product_name || item.name || item.description || '';
          const qty = Number(item.quantity || 1);
          const liveRow = livePriceMap[name.toLowerCase()];
          const unitPrice = liveRow ?
          Number(liveRow.dp) || Number(item.unit_price || 0) :
          Number(item.unit_price || 0);
          return { name, qty, unitPrice };
        }).filter((i) => i.name && i.qty > 0);

        let stockDeductionOk = false;
        try {
          await withTransaction(async (client) => {
            for (const item of deductItems) {
              let remaining = item.qty;
              const batches = (await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/orders.js:273:13"),







              [branchId, item.name])).
              rows;

              for (const batch of batches) {
                if (remaining <= 0) break;
                const take = Math.min(remaining, Number(batch.quantity));
                await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/orders.js:287:14"),

                [take, batch.id]);

                const ts = Date.now();
                const bimId = `BIM-${ts}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
                await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/orders.js:293:15"),



                [bimId, branchId, movType, batch.product_name, batch.batch_no || '', take,
                item.unitPrice || null, existing.id,
                `Online order ${existing.order_number || existing.id}`,
                req.user?.username || '']);

                const smId = `MOV-${ts}-${Math.random().toString(36).slice(2, 6)}`;
                await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/orders.js:303:16"),





                [smId, batch.product_name, batch.batch_no || '', batch.expiry_date || null,
                take, movType, branchId, existing.id,
                `Online order ${existing.order_number || existing.id}`, item.unitPrice || null]);

                remaining -= take;
              }

              if (remaining > 0) {
                console.warn(`[orders] Low stock for "${item.name}" on order ${existing.id}: short by ${remaining}`);
              }
            }

            await __qd_executePlan(client.query.bind(client), __qd_registeredPlan("api/orders.js:321:17"),

            [id]);

          });

          stockDeductionOk = true;
          updates.stock_deducted = true;
          updates.fulfilled_at = new Date().toISOString();

          recomputeLocationBalances('branch', branchId).catch((e) =>
          console.error('[orders] recomputeLocationBalances error:', e.message)
          );

          const totalQty = deductItems.reduce((s, i) => s + i.qty, 0);
          const dpSubtotal = deductItems.reduce((s, i) => {
            const liveRow = livePriceMap[i.name.toLowerCase()];
            const dp = liveRow ? Number(liveRow.dp) || i.unitPrice : i.unitPrice;
            return s + dp * i.qty;
          }, 0);
          const cpTotal = Number(existing.subtotal || existing.total_amount || 0);

          postActivityRecord({
            id: generateBatId(),
            branch_id: branchId,
            branch_name: branchId,
            client_name: existing.customer_name || 'Online Customer',
            client_phone: existing.customer_phone || null,
            client_type: customerType,
            nb_number: existing.distributor_code || null,
            service_date: new Date().toISOString().slice(0, 10),
            service_time: new Date().toTimeString().slice(0, 8),
            activity_type: 'online_order_sale',
            workflow_source: 'online_order',
            form_reference_id: existing.id,
            product_total_dp: dpSubtotal || cpTotal,
            product_total_cp: cpTotal,
            total_qty: totalQty,
            grand_total: Number(existing.total_amount || existing.subtotal || 0),
            payment_status: 'paid',
            payment_method: payment_method || existing.payment_method || 'cash',
            stock_impact: true,
            stock_status: 'deducted',
            prescription_status: 'none',
            consultation_status: 'none',
            reporting_status: 'posted',
            captured_by: req.user?.username || null
          }).catch((e) => console.error('[orders] BAT post error:', e.message));

        } catch (fulfilErr) {
          console.error('[orders] fulfillment error:', fulfilErr.message);
          return res.status(409).json({
            error: `Order fulfillment failed: ${fulfilErr.message}`
          });
        }
      }
      // ─────────────────────────────────────────────────────────────────────

      const order = await update('online_orders', id, updates);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      await publishRealtimeEvent('orders', 'updated', order);

      return res.json(order);
    }

    if (req.method === 'DELETE') {
      const id = req.query?.id || req.body?.id;
      if (!id) return res.status(400).json({ error: 'Order ID is required' });

      const existing = await __qd_executePlan(getOne, __qd_registeredPlan("api/orders.js:392:18"), [id]);
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

      await __qd_executePlan(query, __qd_registeredPlan("api/orders.js:410:19"), [id]);
      await publishRealtimeEvent('orders', 'deleted', { id });
      return res.json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Orders API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

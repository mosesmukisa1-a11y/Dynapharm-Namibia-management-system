import { getMany, getOne, query } from './db.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const { town_id, branch_id, calculate_fee } = req.query;

      // Calculate delivery fee for a specific town and branch
      if (calculate_fee === 'true' && town_id && branch_id) {
        // Get distance from branch to town
        const distance = await getOne(
          'SELECT * FROM delivery_distances WHERE branch_id = $1 AND town_id = $2',
          [branch_id, town_id]
        );

        if (!distance) {
          // If no specific distance found, try to find nearest branch
          const allDistances = await getMany(
            'SELECT * FROM delivery_distances WHERE town_id = $1 ORDER BY distance_km ASC LIMIT 1',
            [town_id]
          );

          if (allDistances.length > 0) {
            const nearest = allDistances[0];
            return res.json({
              branch_id: nearest.branch_id,
              town_id: nearest.town_id,
              distance_km: nearest.distance_km,
              delivery_fee_percentage: nearest.delivery_fee_percentage,
              fee_type: nearest.distance_km >= 50 ? 'far' : 'near',
            });
          }

          // Default: assume far distance (20%)
          return res.json({
            branch_id,
            town_id,
            distance_km: null,
            delivery_fee_percentage: 20.00,
            fee_type: 'far',
            note: 'Distance not found, using default far distance fee',
          });
        }

        return res.json({
          branch_id: distance.branch_id,
          town_id: distance.town_id,
          distance_km: parseFloat(distance.distance_km),
          delivery_fee_percentage: parseFloat(distance.delivery_fee_percentage),
          fee_type: distance.distance_km >= 50 ? 'far' : 'near',
        });
      }

      // Get all delivery distances
      if (town_id) {
        const distances = await getMany(
          'SELECT dd.*, b.name as branch_name, t.name as town_name FROM delivery_distances dd JOIN branches b ON dd.branch_id = b.id JOIN towns t ON dd.town_id = t.id WHERE dd.town_id = $1 ORDER BY dd.distance_km ASC',
          [town_id]
        );
        return res.json(distances);
      }

      if (branch_id) {
        const distances = await getMany(
          'SELECT dd.*, b.name as branch_name, t.name as town_name FROM delivery_distances dd JOIN branches b ON dd.branch_id = b.id JOIN towns t ON dd.town_id = t.id WHERE dd.branch_id = $1 ORDER BY dd.distance_km ASC',
          [branch_id]
        );
        return res.json(distances);
      }

      // Get all delivery distances
      const distances = await getMany(
        'SELECT dd.*, b.name as branch_name, t.name as town_name FROM delivery_distances dd JOIN branches b ON dd.branch_id = b.id JOIN towns t ON dd.town_id = t.id ORDER BY b.name, t.name'
      );
      return res.json(distances);
    }

    if (req.method === 'POST') {
      // Calculate delivery fee for cart
      const { town_id, branch_id, subtotal } = req.body;

      if (!town_id || !subtotal) {
        return res.status(400).json({ error: 'Town ID and subtotal are required' });
      }

      // Find nearest branch if branch_id not provided
      let distance;
      if (branch_id) {
        distance = await getOne(
          'SELECT * FROM delivery_distances WHERE branch_id = $1 AND town_id = $2',
          [branch_id, town_id]
        );
      }

      if (!distance) {
        // Find nearest branch to the town
        const nearest = await getOne(
          'SELECT * FROM delivery_distances WHERE town_id = $1 ORDER BY distance_km ASC LIMIT 1',
          [town_id]
        );
        distance = nearest;
      }

      let deliveryFeePercentage = 20.00; // Default: far distance (20%)
      let distanceKm = null;

      if (distance) {
        distanceKm = parseFloat(distance.distance_km);
        deliveryFeePercentage = parseFloat(distance.delivery_fee_percentage);
      } else {
        // If no distance found, assume it's far (50km+)
        deliveryFeePercentage = 20.00;
      }

      const deliveryFee = (parseFloat(subtotal) * deliveryFeePercentage) / 100;
      const totalAmount = parseFloat(subtotal) + deliveryFee;

      return res.json({
        subtotal: parseFloat(subtotal),
        delivery_fee: deliveryFee,
        delivery_fee_percentage: deliveryFeePercentage,
        distance_km: distanceKm,
        total_amount: totalAmount,
        branch_id: distance?.branch_id || branch_id || null,
        town_id,
        fee_type: distanceKm !== null && distanceKm >= 50 ? 'far' : distanceKm !== null ? 'near' : 'unknown',
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Delivery API error:', error);
    return res.status(500).json({ error: error.message });
  }
}


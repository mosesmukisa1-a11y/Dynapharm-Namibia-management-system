import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./services/queryDescriptors.js";import { applyAuthCors } from './_lib/auth.js';
import { getMany, getOne, insert, update, remove, query } from './db.js';

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const { id, name } = req.query;

      if (id) {
        const town = await __qd_executePlan(getOne, __qd_registeredPlan("api/towns.js:16:0"), [id]);
        if (!town) {
          return res.status(404).json({ error: 'Town not found' });
        }
        return res.json(town);
      }

      if (name) {
        const town = await __qd_executePlan(getOne, __qd_registeredPlan("api/towns.js:24:1"), [`%${name}%`]);
        if (!town) {
          return res.status(404).json({ error: 'Town not found' });
        }
        return res.json(town);
      }

      // Get all towns
      const towns = await __qd_executePlan(getMany, __qd_registeredPlan("api/towns.js:32:2"), []);
      return res.json(towns);
    }

    if (req.method === 'POST') {
      const { name, region, latitude, longitude } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Town name is required' });
      }

      const id = `town_${name.toLowerCase().replace(/\s+/g, '_')}`;
      const town = await insert('towns', {
        id,
        name,
        region: region || null,
        latitude: latitude || null,
        longitude: longitude || null
      });

      return res.status(201).json(town);
    }

    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ error: 'Town ID is required' });
      }

      const { name, region, latitude, longitude } = req.body;
      const updates = {};
      if (name) updates.name = name;
      if (region !== undefined) updates.region = region;
      if (latitude !== undefined) updates.latitude = latitude;
      if (longitude !== undefined) updates.longitude = longitude;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      const town = await update('towns', id, updates);
      if (!town) {
        return res.status(404).json({ error: 'Town not found' });
      }

      return res.json(town);
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ error: 'Town ID is required' });
      }

      await remove('towns', id);
      return res.status(204).end();
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Towns API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

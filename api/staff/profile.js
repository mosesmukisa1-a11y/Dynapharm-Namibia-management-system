import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "../services/queryDescriptors.js";import { applyAuthCors } from '../_lib/auth.js';
import { query, getOne } from '../db.js';

const SAFE_FIELDS = [
'phone', 'email', 'address', 'emergency_contact_name', 'emergency_contact_phone',
'date_of_birth', 'gender', 'marital_status', 'nationality', 'home_language',
'next_of_kin_name', 'next_of_kin_relationship', 'next_of_kin_phone',
'highest_qualification', 'institution_name', 'graduation_year', 'field_of_study',
'professional_certifications'];

const SENSITIVE_FIELDS = ['national_id', 'bank_name', 'bank_account_no'];

const SELECT_COLS = `
  id, username, full_name, email, phone, role, branch,
  address, emergency_contact_name, emergency_contact_phone,
  date_of_birth, gender, marital_status, nationality, home_language,
  next_of_kin_name, next_of_kin_relationship, next_of_kin_phone,
  highest_qualification, institution_name, graduation_year, field_of_study,
  professional_certifications,
  national_id, bank_name, bank_account_no,
  created_at
`;

export default async function handler(req, res) {
  applyAuthCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const userId = req.user?.sub || req.user?.username || req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

  if (req.method === 'GET') {
    try {
      const user = await __qd_executePlan(getOne, __qd_registeredPlan("api/staff/profile.js:34:0"),

      [userId]);

      if (!user) return res.status(404).json({ success: false, error: 'User not found' });

      const pending = await __qd_executePlan(query, __qd_registeredPlan("api/staff/profile.js:40:1"),






      [userId, user.full_name || userId]);


      return res.json({ success: true, profile: user, pendingSensitive: pending.rows });
    } catch (err) {
      console.error('[staff/profile GET]', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (req.method === 'PUT') {
    const body = req.body || {};
    const { action } = body;

    if (action === 'update_contact') {
      const updates = {};
      for (const field of SAFE_FIELDS) {
        if (body[field] !== undefined) updates[field] = body[field] || null;
      }
      if (Object.keys(updates).length === 0)
      return res.status(400).json({ success: false, error: 'No fields to update' });
      try {
        const vals = [userId, JSON.stringify(updates)];
        const updated = await __qd_executePlan(getOne, __qd_registeredPlan("api/staff/profile.js:70:2"),












        vals);

        return res.json({ success: true, profile: updated });
      } catch (err) {
        console.error('[staff/profile PUT contact]', err);
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    if (action === 'request_sensitive') {
      const changes = {};
      for (const field of SENSITIVE_FIELDS) {
        if (body[field] !== undefined && body[field] !== '') changes[field] = body[field];
      }
      if (Object.keys(changes).length === 0)
      return res.status(400).json({ success: false, error: 'No sensitive fields provided' });
      try {
        const user = await __qd_executePlan(getOne, __qd_registeredPlan("api/staff/profile.js:100:3"),
        [userId]);

        const fullName = user?.full_name || userId;
        const existing = await __qd_executePlan(getOne, __qd_registeredPlan("api/staff/profile.js:104:4"),


        [userId]);

        if (existing)
        return res.status(409).json({ success: false, error: 'You already have a pending sensitive update request. Please wait for HR to process it.' });

        const changeLabels = Object.keys(changes).map((f) => f.replace(/_/g, ' ')).join(', ');
        const result = await __qd_executePlan(query, __qd_registeredPlan("api/staff/profile.js:113:5"),




        [fullName, userId, JSON.stringify(changes), `Staff self-update request for: ${changeLabels}`]);

        return res.status(201).json({ success: true, requestId: result.rows[0]?.id });
      } catch (err) {
        console.error('[staff/profile PUT sensitive]', err);
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    return res.status(400).json({ success: false, error: 'Invalid action.' });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

import { createHash } from 'node:crypto';
import { withTransaction } from '../db.js';
import { getBranchScope } from '../_lib/auth.js';
import { branchSearchTerms, branchSearchTermsForMany, normalizeBranchSlug } from '../_lib/branchUtils.js';

// Explicit POST synchronization, never a write hidden inside a GET. Original
// appointments and existing demographic/clinical fields are never overwritten.
export async function syncCheckupClients(user) {
  if (!['consultant', 'admin'].includes(user?.role)) {
    throw Object.assign(new Error('Consultant access required'), { statusCode: 403 });
  }
  const scope = getBranchScope(user);
  return withTransaction(async db => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext('checkup-client-sync'))");
    const { rows: appointments } = await db.query(
      `SELECT * FROM appointments WHERE type ILIKE '%Check%'
       ${scope.enforced ? 'AND LOWER(TRIM(branch)) = ANY($1::text[])' : ''}
       ORDER BY created_at, id`,
      scope.enforced ? [branchSearchTermsForMany(scope.branches)] : []
    );
    let created = 0, linked = 0, skipped = 0;
    for (const apt of appointments) {
      const branch = normalizeBranchSlug(apt.branch);
      if (!branch || !apt.full_name?.trim() || !apt.phone?.trim()) { skipped++; continue; }
      const id = `CLT-CHK-${createHash('sha256').update(apt.id).digest('hex').slice(0, 32)}`;
      const prior = await db.query(
        `SELECT id FROM clients WHERE id=$1 OR
         (LOWER(TRIM(branch))=ANY($3::text[]) AND data->'checkupAppointmentIds' ? $2)`,
        [id, apt.id, branchSearchTerms(branch)]
      );
      if (prior.rows.length) { linked++; continue; }
      const reference = apt.client_reference?.trim() || null;
      // A reference may be a referrer's NB code, not a patient identifier.
      // Require corroborating contact/name and branch; never match on name alone.
      if (reference) {
        const match = await db.query(
          `SELECT id FROM clients WHERE LOWER(TRIM(branch))=ANY($1::text[])
           AND (UPPER(TRIM(reference_number))=UPPER($2)
             OR UPPER(data->>'checkupClientReference')=UPPER($2))
           AND LOWER(TRIM(full_name))=LOWER(TRIM($3)) AND TRIM(phone)=TRIM($4)`,
          [branchSearchTerms(branch), reference, apt.full_name, apt.phone]
        );
        if (match.rows.length === 1) {
          // Keep an explicit source link so a later name/contact correction
          // cannot turn the same appointment into a duplicate client.
          await db.query(`UPDATE clients SET data=COALESCE(data,'{}'::jsonb) ||
            jsonb_build_object('checkupAppointmentIds',
              COALESCE(data->'checkupAppointmentIds','[]'::jsonb) || jsonb_build_array($2::text))
            WHERE id=$1`, [match.rows[0].id, apt.id]);
          linked++; continue;
        }
      }
      let source = apt.data || {};
      if (typeof source === 'string') { try { source = JSON.parse(source); } catch { source = {}; } }
      if (!source || typeof source !== 'object' || Array.isArray(source)) source = {};
      const data = {
        sourceAppointmentId: apt.id, checkupClientReference: reference,
        registrationSource: 'checkup', capturedBy: user.sub || user.id,
      };
      for (const key of ['gender', 'dob', 'dateOfBirth', 'address', 'city', 'height', 'weight',
        'primaryReason', 'waterIntake', 'exerciseFreq', 'sleepHours', 'stressLevel',
        'currentMedications', 'medications', 'allergies', 'medicalHistory', 'symptoms']) {
        if (source[key] !== undefined) data[key] = source[key];
      }
      await db.query(
        `INSERT INTO clients(id,reference_number,full_name,phone,email,branch,data)
         VALUES($1,$1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(id) DO NOTHING`,
        [id, apt.full_name, apt.phone, apt.email, branch, JSON.stringify(data)]
      );
      created++;
    }
    return { success: true, created, linked, skipped };
  });
}

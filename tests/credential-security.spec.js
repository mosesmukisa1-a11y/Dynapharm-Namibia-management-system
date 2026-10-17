import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { withRequestTransaction } from '../api/db.js';import { query, getOne } from "./helpers/owned-raw-database.js";
import { hashPassword, comparePassword, issuePasswordReset, completePasswordReset,
changeOwnPassword, revokeAccountSessions, resolveSession, validSession } from '../api/services/credentialSecurity.js';
import { sanitizeUser } from '../api/_lib/auth.js';
import login from '../api/auth/login.js';
import endpoint from '../api/auth/credential-security.js';
import forgot from '../api/distributors/forgot-password.js';

const a = 'SECURITY-SYNTHETIC-A',b = 'SECURITY-SYNTHETIC-B';
const operator = { sub: 'SECURITY-SYNTHETIC-OPERATOR', role: 'admin' };
const initial = randomBytes(24).toString('base64url');
const replacement = () => randomBytes(24).toString('base64url');
async function invoke(handler, body, user) {
  const result = { status: 200 };
  const res = { setHeader() {}, status(n) {result.status = n;return this;},
    json(value) {result.body = value;return this;}, end() {return this;} };
  await handler({ method: 'POST', headers: { host: 'isolated.test' }, body, user }, res);
  return result;
}
beforeAll(async () => {
  for (const id of [a, b])
  await query(`INSERT INTO users(id,username,password_hash,role,branch,is_active,metadata)
      VALUES($1,$2,$3,'consultant','townshop',true,'{"unrelatedEvidence":"retained"}')`,
  [id, id.toLowerCase(), await hashPassword(initial)]);
});
afterAll(async () => {
  await query('DELETE FROM hr_records WHERE employee_id=ANY($1)', [[a, b]]);
  await query('DELETE FROM users WHERE id=ANY($1)', [[a, b]]);
});
it('stores bcrypt only and refuses plaintext comparison without auto-migration', async () => {
  const row = await getOne('SELECT * FROM users WHERE id=$1', [a]);
  expect(row.password_hash).not.toBe(initial);
  expect(await comparePassword(initial, row.password_hash)).toBe(true);
  expect(await comparePassword(initial, initial)).toBe(false);
  await expect(hashPassword('x')).rejects.toThrow();
  await expect(hashPassword('😀'.repeat(30))).rejects.toThrow();
});
it('actual login accepts original hash and never returns hash or private metadata', async () => {
  const out = await invoke(login, { username: a.toLowerCase(), password: initial });
  expect(out.status).toBe(200);expect(out.body.user.id).toBe(a);
  expect(out.body.user).not.toHaveProperty('metadata');
  expect(out.body.user).not.toHaveProperty('password_hash');
});
it('forbids unauthenticated/branch operator resets and retirement of DOB reset', async () => {
  for (const actor of [undefined, { sub: a, role: 'consultant', branch: 'townshop' },
  { sub: a, role: 'branch_manager', branch: 'other' }]) {
    expect((await invoke(endpoint, { action: 'issue-reset', accountId: b }, actor)).status).toBe(actor ? 403 : 401);
  }
  expect((await invoke(forgot, {})).status).toBe(403);
});
it('dry-run lists only exact IDs with no mutation; unknown IDs roll back entire request', async () => {
  const before = await getOne('SELECT metadata FROM users WHERE id=$1', [a]);
  expect(await revokeAccountSessions(operator, [a], { dryRun: true })).toEqual({ dryRun: true, accountIds: [a] });
  expect((await getOne('SELECT metadata FROM users WHERE id=$1', [a])).metadata).toEqual(before.metadata);
  await expect(revokeAccountSessions(operator, [a, 'UNKNOWN-SYNTHETIC'],
  { dryRun: false, reason: 'Synthetic authorized rotation' })).rejects.toThrow('Account not found');
  expect((await getOne('SELECT metadata FROM users WHERE id=$1', [a])).metadata).toEqual(before.metadata);
});
it('targets only affected account and refreshes current role/branch, not stale JWT claims', async () => {
  await revokeAccountSessions(operator, [a], { dryRun: false, reason: 'Synthetic authorized rotation' });
  expect(await resolveSession({ sub: a, sv: 0 })).toBeNull();
  expect(await resolveSession({ sub: b, sv: 0 })).not.toBeNull();
  const current = await resolveSession({ sub: a, sv: 1, role: 'gm', branch: 'other' });
  expect(current.role).toBe('consultant');expect(current.branch).toBe('townshop');
});
let token, temporary;
it('issues short-lived hash-only reset and consumes once under concurrent attempts', async () => {
  const issued = await issuePasswordReset(operator, a);token = issued.token;
  const row = await getOne('SELECT * FROM users WHERE id=$1', [a]);
  expect(JSON.stringify(row)).not.toContain(token);
  expect(Date.parse(issued.expiresAt) - Date.now()).toBeLessThanOrEqual(15 * 60_000);
  expect(row.metadata.passwordReset.digest).toMatch(/^[a-f0-9]{64}$/);
  temporary = replacement();
  const results = await Promise.allSettled([completePasswordReset(a, token, temporary),
  completePasswordReset(a, token, temporary)]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  const changed = await getOne('SELECT * FROM users WHERE id=$1', [a]);
  expect(await comparePassword(initial, changed.password_hash)).toBe(false);
  expect(await comparePassword(temporary, changed.password_hash)).toBe(true);
  expect(changed.must_change_password).toBe(true);
  expect(changed.metadata.unrelatedEvidence).toBe('retained');
  expect(changed.metadata.passwordReset).toBeUndefined();
  expect(changed.metadata.credentialAudit.every((e) => e.actorId && e.reference && e.at)).toBe(true);
  expect(sanitizeUser(changed)).not.toHaveProperty('metadata');
});
it('temporary credentials cannot set the same password; permanent change revokes temporary session', async () => {
  expect((await invoke(login, { username: a.toLowerCase(), password: temporary })).status).toBe(200);
  expect((await invoke(login, { username: a.toLowerCase(), password: temporary })).status).toBe(401);
  const actor = await resolveSession({ sub: a, sv: 2 });
  expect(actor.mustChangePassword).toBe(true);
  await expect(changeOwnPassword(actor, temporary, temporary)).rejects.toThrow('different');
  const permanent = replacement();
  await changeOwnPassword(actor, temporary, permanent);
  const row = await getOne('SELECT * FROM users WHERE id=$1', [a]);
  expect(validSession(row, actor)).toBe(false);expect(row.must_change_password).toBe(false);
  expect(await comparePassword(temporary, row.password_hash)).toBe(false);
  expect(await comparePassword(permanent, row.password_hash)).toBe(true);
  expect((await invoke(login, { username: a.toLowerCase(), password: permanent })).status).toBe(200);
});
it('expired tokens and invalid tokens fail with no writes', async () => {
  const issued = await issuePasswordReset(operator, b);
  await query(`UPDATE users SET metadata=jsonb_set(metadata,'{passwordReset,expiresAt}',
    to_jsonb('2000-01-01T00:00:00Z'::text)) WHERE id=$1`, [b]);
  const before = await getOne('SELECT metadata,password_hash FROM users WHERE id=$1', [b]);
  await expect(completePasswordReset(b, issued.token, replacement())).rejects.toThrow('expired');
  await expect(completePasswordReset(b, 'invalid', replacement())).rejects.toThrow('expired');
  expect(await getOne('SELECT metadata,password_hash FROM users WHERE id=$1', [b])).toEqual(before);
});
it('outer rollback restores password/version/audit and leaves unrelated account untouched', async () => {
  const before = await getOne('SELECT metadata,password_hash FROM users WHERE id=$1', [b]);
  await expect(withRequestTransaction(async () => {
    await revokeAccountSessions(operator, [b], { dryRun: false, reason: 'Synthetic rollback check' });
    throw new Error('synthetic abort');
  })).rejects.toThrow('synthetic abort');
  expect(await getOne('SELECT metadata,password_hash FROM users WHERE id=$1', [b])).toEqual(before);
});

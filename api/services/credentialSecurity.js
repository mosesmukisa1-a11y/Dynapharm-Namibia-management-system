import { registeredPlan as __qd_registeredPlan, executePlan as __qd_executePlan } from "./queryDescriptors.js"; // Uses existing users.metadata; no schema mutation or automatic account migration.
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { getOne, query, withRequestTransaction } from '../db.js';

const fail = (message, status = 400) => {throw Object.assign(new Error(message), { status });};
export function metadataOf(user) {
  const metadata = typeof user?.metadata === 'string' ? JSON.parse(user.metadata) : user?.metadata;
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
}
export function sessionVersion(user) {
  const value = metadataOf(user).sessionVersion ?? 0;
  if (!Number.isSafeInteger(value) || value < 0) fail('Invalid credential security state', 401);
  return value;
}
export function validSession(user, decoded) {
  return !!user && user.is_active !== false &&
  Number(decoded?.sv ?? 0) === sessionVersion(user);
}
export async function resolveSession(decoded) {
  if (!decoded?.sub) return null;
  const user = await __qd_executePlan(getOne, __qd_registeredPlan("api/services/credentialSecurity.js:22:0"),
  [decoded.sub]);
  if (!validSession(user, decoded)) return null;
  // Always enforce current role/branch rather than stale JWT claims.
  return { ...decoded, sv: sessionVersion(user), sub: user.id, id: user.id, username: user.username,
    role: user.role, fullName: user.full_name, branch: user.branch, branches: user.branches,
    additional_roles: user.additional_roles, mustChangePassword: !!user.must_change_password };
}
export async function consumeTemporaryLogin(accountId, expectedHash) {
  return withRequestTransaction(async () => {
    const user = await lockedAccount(accountId),metadata = metadataOf(user);
    if (user.is_active === false || user.password_hash !== expectedHash) return false;
    if (!user.must_change_password) return true;
    if (metadata.temporaryLoginConsumed === true) return false;
    metadata.temporaryLoginConsumed = true;
    audit(metadata, { id: user.id }, 'temporary-login-consumed', sessionVersion(user));
    await save(user, metadata);
    return true;
  });
}
export function validateNewPassword(value) {
  if (typeof value !== 'string' || value.length < 12 || Buffer.byteLength(value, 'utf8') > 72)
  fail('Use a password of at least 12 characters and at most 72 UTF-8 bytes');
  return value;
}
export async function hashPassword(value) {
  return bcrypt.hash(validateNewPassword(value), 12);
}
export async function comparePassword(value, hash) {
  // Never silently accept or rehash plaintext or reversible legacy storage.
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 72 ||
  !/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash || '')) return false;
  return bcrypt.compare(value, hash);
}
function requireOperator(actor) {
  if (!actor?.sub && !actor?.id) fail('Authentication required', 401);
  if (!['admin', 'gm', 'super_admin'].includes(actor.role)) fail('Credential administration denied', 403);
}
export function assertProductionRotationAuthority(ids, env = process.env) {
  if (env.NODE_ENV !== 'production' && !['1', 'true'].includes(env.REPLIT_DEPLOYMENT)) return;
  const approved = new Set((env.CREDENTIAL_ROTATION_ACCOUNT_IDS || '').split(',').map((x) => x.trim()).filter(Boolean));
  if (env.PRODUCTION_CREDENTIAL_REMEDIATION_AUTHORIZED !== 'true' ||
  !env.CREDENTIAL_ROTATION_AUTHORIZATION_REF ||
  ids.some((id) => !approved.has(id)))
  fail('Explicit scoped production credential execution authorization required', 403);
}
async function lockedAccount(id) {
  if (typeof id !== 'string' || !id || id.length > 120) fail('Exact account ID required');
  const user = await __qd_executePlan(getOne, __qd_registeredPlan("api/services/credentialSecurity.js:70:1"), [id]);
  if (!user) fail('Account not found', 404);
  return user;
}
function audit(metadata, actor, action, version) {
  const entry = { reference: randomUUID(), actorId: String(actor.sub || actor.id),
    action, at: new Date().toISOString(), sessionVersion: version };
  metadata.credentialAudit = [...(Array.isArray(metadata.credentialAudit) ? metadata.credentialAudit : []), entry];
  return entry.reference;
}
async function save(user, metadata, extra = {}) {
  await __qd_executePlan(query, __qd_registeredPlan("api/services/credentialSecurity.js:81:2"),


  [user.id, JSON.stringify(metadata), extra.hash ?? null, extra.mustChange ?? null]);
}
export async function revokeAccountSessions(actor, ids, { dryRun = true, reason } = {}) {
  requireOperator(actor);
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 ||
  ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length)
  fail('Supply 1–100 distinct exact account IDs');
  if (!dryRun && (!reason || String(reason).trim().length < 8)) fail('Audit reason required');
  if (!dryRun) assertProductionRotationAuthority(ids);
  return withRequestTransaction(async () => {
    const users = [];
    // Sorted locks prevent deadlocks; missing ID aborts the entire operation.
    for (const id of [...ids].sort()) users.push(await lockedAccount(id));
    if (dryRun) return { dryRun: true, accountIds: users.map((u) => u.id) };
    const results = [];
    for (const user of users) {
      const metadata = metadataOf(user),version = sessionVersion(user) + 1;
      metadata.sessionVersion = version;
      delete metadata.passwordReset;
      const reference = audit(metadata, actor, 'sessions-revoked', version);
      metadata.credentialAudit.at(-1).reason = String(reason).slice(0, 500);
      await save(user, metadata);
      results.push({ accountId: user.id, reference });
    }
    return { dryRun: false, accounts: results };
  });
}
export async function issuePasswordReset(actor, accountId) {
  requireOperator(actor);
  assertProductionRotationAuthority([accountId]);
  return withRequestTransaction(async () => {
    const user = await lockedAccount(accountId);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const metadata = metadataOf(user);
    metadata.passwordReset = { digest: createHash('sha256').update(token).digest('hex'), expiresAt };
    const reference = audit(metadata, actor, 'reset-issued', sessionVersion(user));
    await save(user, metadata);
    // Authorized private response only; token is never stored raw or logged.
    return { accountId: user.id, token, expiresAt, reference };
  });
}
export async function completePasswordReset(accountId, token, password) {
  assertProductionRotationAuthority([accountId]);
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail('Invalid or expired reset', 403);
  validateNewPassword(password);
  return withRequestTransaction(async () => {
    const user = await lockedAccount(accountId),metadata = metadataOf(user);
    const reset = metadata.passwordReset;
    const digest = createHash('sha256').update(token).digest('hex');
    if (!reset || !/^[a-f0-9]{64}$/.test(reset.digest || '') ||
    !(Date.parse(reset.expiresAt) > Date.now()) ||
    !timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(reset.digest, 'hex')))
    fail('Invalid or expired reset', 403);
    if (await comparePassword(password, user.password_hash)) fail('Choose a different password');
    const hash = await hashPassword(password);
    delete metadata.passwordReset;
    delete metadata.temporaryLoginConsumed;
    metadata.sessionVersion = sessionVersion(user) + 1;
    const reference = audit(metadata, { id: user.id }, 'reset-consumed', metadata.sessionVersion);
    await save(user, metadata, { hash, mustChange: true });
    return { success: true, reference, mustChangePassword: true };
  });
}
export async function changeOwnPassword(actor, currentPassword, newPassword) {
  const id = actor?.sub || actor?.id;
  if (!id) fail('Authentication required', 401);
  validateNewPassword(newPassword);
  return withRequestTransaction(async () => {
    const user = await lockedAccount(id);
    if (!validSession(user, actor) || !(await comparePassword(currentPassword, user.password_hash)))
    fail('Current credentials invalid', 403);
    if (await comparePassword(newPassword, user.password_hash)) fail('Choose a different password');
    const metadata = metadataOf(user);
    metadata.sessionVersion = sessionVersion(user) + 1;
    delete metadata.passwordReset;
    delete metadata.temporaryLoginConsumed;
    const reference = audit(metadata, actor, 'password-changed', metadata.sessionVersion);
    await save(user, metadata, { hash: await hashPassword(newPassword), mustChange: false });
    return { success: true, reference, signInAgain: true };
  });
}

// Pure validation only. No filesystem, subprocess, database or provider imports.
import {createHash} from 'node:crypto';
import {BackupJobError} from './backup-job-errors.mjs';

export const WITH_OBJECTS = '--with-app-storage';
export const ACK_OBJECTS = '--acknowledge-authorized-object-manifest';
export const OBJECT_LIMITS = Object.freeze({
  manifestBytes: 65_536, count: 256, perObjectBytes: 268_435_456, totalBytes: 2_147_483_648,
});
export const UPLOAD_COLUMNS = Object.freeze({
  'file_uploads.file_url': 'public/uploads',
  'product_images.image_url': 'public/uploads',
  'product_images.thumbnail_url': 'public/uploads',
  'distributors.photo_url': 'public/uploads',
  'staff_documents.file_url': 'staff-documents',
  'client_history_attachments.object_name': 'client-history-private',
});
const HEX = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function hex(value) { return typeof value === 'string' && HEX.test(value); }
function uuid(value) { return typeof value === 'string' && UUID.test(value); }
function invalid() { throw new BackupJobError('MANIFEST_INVALID'); }
function digest(text) { return createHash('sha256').update(text).digest('hex'); }
function keys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',') !== [...expected].sort().join(',')) invalid();
}
function utc(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString() !== value) invalid();
  return Date.parse(value);
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
export function objectArtifactName(index) {
  if (!Number.isInteger(index) || index < 0 || index >= OBJECT_LIMITS.count) invalid();
  return `object-${String(index + 1).padStart(6, '0')}.bin`;
}
export function assertManifestFresh(manifest, now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) invalid();
  if (Date.parse(manifest.authorization.expiresAtUtc) <= now.getTime()) {
    throw new BackupJobError('MANIFEST_EXPIRED');
  }
}
export function assertObjectAcknowledgement(args, mode) {
  if (args.includes(WITH_OBJECTS) && mode === 'execute' && !args.includes(ACK_OBJECTS)) {
    throw new BackupJobError('MISSING_MANIFEST_ACKNOWLEDGEMENT');
  }
}
export function validateObjectManifest(text, env, now = new Date()) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > OBJECT_LIMITS.manifestBytes ||
      !hex(env.B2_BACKUP_OBJECT_MANIFEST_SHA256) ||
      digest(text) !== env.B2_BACKUP_OBJECT_MANIFEST_SHA256) invalid();
  let manifest;
  try {
    manifest = JSON.parse(text);
    // Exact compact representation rejects duplicate JSON properties and ambiguous escapes.
    if (JSON.stringify(manifest) !== text) invalid();
  } catch { invalid(); }
  keys(manifest, ['schemaVersion', 'backupSetId', 'authorization', 'source', 'objects']);
  if (manifest.schemaVersion !== 1 || !uuid(manifest.backupSetId)) invalid();
  keys(manifest.authorization, ['authorizationId', 'issuedAtUtc', 'expiresAtUtc', 'scope']);
  const auth = manifest.authorization;
  if (!uuid(auth.authorizationId) || auth.scope !== 'EXACT_OBJECT_READS_NO_LIST_NO_BUSINESS_ROWS') invalid();
  const issued = utc(auth.issuedAtUtc), expires = utc(auth.expiresAtUtc);
  if (expires <= issued || expires - issued > 86_400_000) invalid();
  keys(manifest.source, ['provider', 'bucketId', 'bucketIdentitySha256',
    'databaseIdentityFingerprint', 'referenceSnapshotSha256', 'capturedAtUtc', 'representation']);
  const source = manifest.source;
  if (source.provider !== 'replit_app_storage' || source.representation !== 'stored-bytes-no-decompression' ||
      typeof source.bucketId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(source.bucketId) ||
      !hex(source.bucketIdentitySha256) || !hex(source.databaseIdentityFingerprint) ||
      !hex(source.referenceSnapshotSha256) ||
      source.bucketIdentitySha256 !== digest(`replit_app_storage:${source.bucketId}`) ||
      source.bucketIdentitySha256 !== env.B2_BACKUP_APP_STORAGE_BUCKET_SHA256 ||
      source.databaseIdentityFingerprint !== env.B2_BACKUP_DATABASE_IDENTITY_FINGERPRINT) invalid();
  const captured = utc(source.capturedAtUtc);
  if (issued > captured || captured > now.getTime() || captured >= expires) invalid();
  assertManifestFresh(manifest, now);
  if (!Array.isArray(manifest.objects) || !manifest.objects.length || manifest.objects.length > OBJECT_LIMITS.count) invalid();
  let totalBytes = 0;
  const seen = new Set();
  for (const object of manifest.objects) {
    keys(object, ['key', 'bytes', 'sourceIdentity', 'references']);
    if (typeof object.key !== 'string' || object.key.length > 512 ||
        !/^[A-Za-z0-9_/-][A-Za-z0-9_./-]*$/.test(object.key) ||
        object.key.split('/').some(p => !/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(p)) ||
        seen.has(object.key)) invalid();
    seen.add(object.key);
    if (!Number.isSafeInteger(object.bytes) || object.bytes <= 0 || object.bytes > OBJECT_LIMITS.perObjectBytes) invalid();
    totalBytes += object.bytes;
    keys(object.sourceIdentity, ['scheme', 'sha256']);
    if (object.sourceIdentity.scheme !== 'content-sha256' || !hex(object.sourceIdentity.sha256)) invalid();
    if (!Array.isArray(object.references) || !object.references.length || object.references.length > 6 ||
        new Set(object.references).size !== object.references.length) invalid();
    for (const column of object.references) {
      if (typeof column !== 'string' || !Object.hasOwn(UPLOAD_COLUMNS, column) ||
          !object.key.startsWith(`${UPLOAD_COLUMNS[column]}/`)) invalid();
    }
  }
  if (totalBytes > OBJECT_LIMITS.totalBytes) invalid();
  return freeze({manifest, text, sha256: digest(text), objectCount: manifest.objects.length, totalBytes});
}

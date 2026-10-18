// Versioned AES-256-GCM envelope; source bytes never go to a filesystem sink.
// Keys live only in memory. Header contains only the KMS-wrapped key, IV and format.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto';
import path from 'node:path';
import {BackupJobError} from './backup-job-errors.mjs';
import {validatePrivateRoot} from './backup-local-validation.mjs';

const MAGIC = Buffer.from('B2GCM001');
const MAX = 5_000_000_000;
const ownership = new WeakMap();
export const ENCRYPTION = Object.freeze({format: 'B2GCM001', algorithm: 'AES-256-GCM',
  keyWrapping: 'AWS-KMS', plaintextStaged: false});
function fail() { throw new BackupJobError('CIPHERTEXT_INVALID'); }
function validName(name) {
  if (!/^(database\.dump|object-\d{6}\.bin|object-manifest\.json|manifest\.json|SHA256SUMS|COMPLETED\.json)$/.test(name)) fail();
}
export async function createCiphertextRun(root, runId) {
  await validatePrivateRoot(root);
  if (!/^[0-9]{8}T[0-9]{9}Z_[a-f0-9-]{36}$/.test(runId)) fail();
  const directory = path.join(root, runId);
  await fs.mkdir(directory, {mode: 0o700}); // exclusive; never adopt existing runs
  const stat = await fs.lstat(directory);
  const run = {directory};
  ownership.set(run, {root, ino: stat.ino, dev: stat.dev, files: new Map(), crypto: null});
  return run;
}
export function attachRunKey(run, key, wrappedKey) {
  const owned = ownership.get(run);
  if (!owned || owned.crypto || !Buffer.isBuffer(key) || key.length !== 32 ||
      typeof wrappedKey !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(wrappedKey) ||
      wrappedKey.length < 16 || wrappedKey.length > 16_384) fail();
  owned.crypto = {key, wrappedKey};
}
async function ownedDirectory(run) {
  const owned = ownership.get(run);
  if (!owned) fail();
  const stat = await fs.lstat(run.directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.ino !== owned.ino || stat.dev !== owned.dev ||
      stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o700 ||
      await fs.realpath(run.directory) !== run.directory) fail();
  return owned;
}
export async function encryptToOwnedFile(run, name, source, {expected, maximum = MAX} = {}) {
  validName(name);
  const owned = await ownedDirectory(run);
  if (!owned.crypto || owned.files.has(name)) fail();
  let file;
  const partial = `${name}.partial`;
  try {
    file = await fs.open(path.join(run.directory, partial), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const stat = await file.stat();
    owned.files.set(partial, {ino: stat.ino, dev: stat.dev});
    const iv = randomBytes(12);
    const header = Buffer.from(JSON.stringify({format: 'B2GCM001', wrappedKey: owned.crypto.wrappedKey, iv: iv.toString('base64')}));
    const length = Buffer.alloc(4); length.writeUInt32BE(header.length);
    const aad = Buffer.concat([MAGIC, length, header, Buffer.from(name)]);
    const cipher = createCipheriv('aes-256-gcm', owned.crypto.key, iv);
    cipher.setAAD(aad);
    const plainHash = createHash('sha256'), encryptedHash = createHash('sha256');
    let plaintextBytes = 0, bytes = 0;
    const write = async body => {
      encryptedHash.update(body); bytes += body.length;
      if (bytes > MAX) fail();
      // FileHandle.writeFile handles short writes; only ciphertext/header reaches here.
      await file.writeFile(body);
    };
    await write(Buffer.concat([MAGIC, length, header]));
    for await (const chunk of source) {
      const body = Buffer.from(chunk);
      plaintextBytes += body.length;
      if (plaintextBytes > maximum) fail();
      plainHash.update(body);
      await write(cipher.update(body));
    }
    const plaintextSha256 = plainHash.digest('hex');
    if (!plaintextBytes || (expected && (plaintextBytes !== expected.bytes || plaintextSha256 !== expected.sha256))) fail();
    await write(cipher.final());
    await write(cipher.getAuthTag());
    await file.sync(); await file.close(); file = null;
    await fs.rename(path.join(run.directory, partial), path.join(run.directory, name));
    owned.files.set(name, owned.files.get(partial)); owned.files.delete(partial);
    return {bytes, sha256: encryptedHash.digest('hex'), plaintextBytes, plaintextSha256, encrypted: true};
  } catch { throw new BackupJobError('CIPHERTEXT_INVALID'); }
  finally { await file?.close(); }
}
async function openOwned(run, name) {
  validName(name);
  const owned = await ownedDirectory(run), recorded = owned.files.get(name);
  if (!recorded || !owned.crypto) fail();
  const handle = await fs.open(path.join(run.directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
  const stat = await handle.stat();
  if (!stat.isFile() || stat.ino !== recorded.ino || stat.dev !== recorded.dev || stat.nlink !== 1 ||
      stat.size <= 28 || stat.size > MAX) { await handle.close(); fail(); }
  return {owned, handle, stat};
}
// Internal reader: callers must first authenticate a full pass before passing plaintext
// to pg_restore. AEAD authentication is checked at EOF; no plaintext is written to disk.
export async function* decryptOwnedFile(run, name) {
  let handle;
  try {
    const opened = await openOwned(run, name); handle = opened.handle;
    const prefix = Buffer.alloc(12);
    if ((await handle.read(prefix, 0, 12, 0)).bytesRead !== 12 || !prefix.subarray(0, 8).equals(MAGIC)) fail();
    const size = prefix.readUInt32BE(8);
    if (size < 20 || size > 20_000 || size + 28 >= opened.stat.size) fail();
    const header = Buffer.alloc(size);
    if ((await handle.read(header, 0, size, 12)).bytesRead !== size) fail();
    const parsed = JSON.parse(header.toString());
    if (parsed.format !== 'B2GCM001' || parsed.wrappedKey !== opened.owned.crypto.wrappedKey ||
        !/^[A-Za-z0-9+/]{16}$/.test(parsed.iv)) fail();
    const tag = Buffer.alloc(16);
    await handle.read(tag, 0, 16, opened.stat.size - 16);
    const decipher = createDecipheriv('aes-256-gcm', opened.owned.crypto.key, Buffer.from(parsed.iv, 'base64'));
    decipher.setAAD(Buffer.concat([prefix, header, Buffer.from(name)])); decipher.setAuthTag(tag);
    for await (const chunk of handle.createReadStream({start: 12 + size, end: opened.stat.size - 17, autoClose: false})) {
      yield decipher.update(chunk);
    }
    yield decipher.final();
    const after = await handle.stat();
    if (after.size !== opened.stat.size || after.mtimeMs !== opened.stat.mtimeMs || after.ctimeMs !== opened.stat.ctimeMs) fail();
  } catch { throw new BackupJobError('CIPHERTEXT_INVALID'); }
  finally { await handle?.close(); }
}
export async function verifyCiphertext(run, name, expected) {
  const hash = createHash('sha256'); let bytes = 0;
  for await (const body of decryptOwnedFile(run, name)) { bytes += body.length; hash.update(body); }
  if (!bytes || (expected && (bytes !== expected.bytes || hash.digest('hex') !== expected.sha256))) fail();
  return {plaintextBytes: bytes, authenticated: true};
}
export async function cleanupCiphertextRun(run) {
  const owned = ownership.get(run);
  if (!owned) fail();
  try {
    await ownedDirectory(run);
    // Never recursive delete, never enumerate/adopt unrelated files.
    for (const [name, recorded] of owned.files) {
      const filename = path.join(run.directory, name);
      const stat = await fs.lstat(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.ino !== recorded.ino ||
          stat.dev !== recorded.dev || stat.nlink !== 1) fail();
      await fs.unlink(filename);
      owned.files.delete(name);
    }
    await fs.rmdir(run.directory); // refuses unexpected entries
  } catch { throw new BackupJobError('CLEANUP_FAILED'); }
  finally { owned.crypto?.key.fill(0); ownership.delete(run); }
  return {status: 'PASS', ciphertextOnly: true};
}

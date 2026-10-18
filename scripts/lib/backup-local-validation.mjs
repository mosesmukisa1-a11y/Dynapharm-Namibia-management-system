// Local metadata/trust checks only: no database, network, provider or executable probes.
import fs from 'node:fs/promises';
import path from 'node:path';
import {X509Certificate} from 'node:crypto';
import {BackupJobError} from './backup-job-errors.mjs';

export const SYSTEM_CA = '/etc/ssl/certs/ca-certificates.crt';
export async function validateSystemCA(filename = SYSTEM_CA, localFS = fs) {
  try {
    if (filename !== SYSTEM_CA) throw new Error();
    const stat = await localFS.stat(filename);
    if (!stat.isFile() || stat.size < 100 || stat.size > 5_000_000 || (stat.mode & 0o022)) throw new Error();
    const text = await localFS.readFile(filename, 'utf8');
    const certificates = text.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
    if (!certificates?.length) throw new Error();
    for (const pem of certificates) if (!new X509Certificate(pem).ca) throw new Error();
    return {status: 'PASS', path: SYSTEM_CA};
  } catch { throw new BackupJobError('TLS_TRUST_INVALID'); }
}
export async function validatePrivateRoot(root, projectRoot = process.cwd()) {
  try {
    const project = await fs.realpath(projectRoot);
    const stat = await fs.lstat(root);
    // Restrict staging to a direct private /tmp child, outside the application tree.
    if (!/^\/tmp\/b2-ciphertext-[a-f0-9-]{36}$/.test(root) ||
        root === project || root.startsWith(`${project}/`) ||
        project.startsWith(`${root}/`) || !stat.isDirectory() || stat.isSymbolicLink() ||
        (stat.mode & 0o777) !== 0o700 || stat.uid !== process.getuid() ||
        await fs.realpath(root) !== root || path.dirname(root) !== '/tmp') throw new Error();
    return {status: 'PASS'};
  } catch { throw new BackupJobError('OUTPUT_UNSAFE'); }
}
export async function validateLocalConfiguration(env) {
  if (env.B2_BACKUP_SOURCE_CLASS === 'production') await validateSystemCA(env.B2_BACKUP_PG_ROOT_CERT || SYSTEM_CA);
  await validatePrivateRoot(env.B2_BACKUP_OUTPUT_DIR);
  return {trust: 'PASS', privateCiphertextStaging: 'PASS', filesystemEncryptionClaimed: false};
}

// Local sanitized review evidence only. Never an operational backup/storage adapter.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
export async function writeReviewJson(directory, name, value, {root = process.cwd()} = {}) {
  if (!/^generated-artifacts\/[a-z0-9-]+(?:\/[a-z0-9-]+)?$/.test(directory) ||
      !/^[a-z0-9-]+\.json$/.test(name)) throw Error('INVALID_REVIEW_OUTPUT');
  let text;
  try { text = JSON.stringify(value, null, 2) + '\n'; }
  catch { throw Error('INVALID_REVIEW_DATA'); }
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw Error('UNSAFE_REVIEW_ROOT');
  let parent = root;
  for (const segment of directory.split('/')) {
    parent = path.join(parent, segment);
    try {
      const stat = await fs.lstat(parent);
      if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid())
        throw Error('UNSAFE_REVIEW_DIRECTORY');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await fs.mkdir(parent, {mode: 0o700});
    }
  }
  const destination = path.join(parent, name);
  try {
    const stat = await fs.lstat(destination);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.uid !== process.getuid())
      throw Error('UNSAFE_REVIEW_DESTINATION');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = path.join(parent, `.review-${randomUUID()}.tmp`);
  let owned;
  try {
    const handle = await fs.open(temporary, 'wx', 0o600);
    try { owned = await handle.stat(); await handle.writeFile(text); }
    finally { await handle.close(); }
    await fs.rename(temporary, destination); // Never truncate a linked or external inode.
    owned = null;
  } finally {
    if (owned) {
      const stat = await fs.lstat(temporary).catch(() => null);
      if (stat && stat.isFile() && stat.ino === owned.ino && stat.dev === owned.dev && stat.nlink === 1)
        await fs.unlink(temporary);
    }
  }
}

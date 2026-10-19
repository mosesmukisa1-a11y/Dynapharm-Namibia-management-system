import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {writeReviewJson} from './lib/offline-review-files.mjs';
const dir = 'generated-artifacts/synthetic-review';
async function fixture(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'offline-review-owned-'));
  try { await fn(root); } finally { await fs.rm(root, {recursive: true}); }
}
test('atomic private evidence replacement leaves no temporary file', () => fixture(async root => {
  await writeReviewJson(dir, 'result.json', {synthetic: 1}, {root});
  const file = path.join(root, dir, 'result.json'), before = await fs.stat(file);
  await writeReviewJson(dir, 'result.json', {synthetic: 2}, {root});
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  assert.notEqual((await fs.stat(file)).ino, before.ino);
  assert.deepEqual(await fs.readdir(path.dirname(file)), ['result.json']);
}));
test('leaf symlink cannot write or replace unrelated evidence', () => fixture(async root => {
  await fs.mkdir(path.join(root, dir), {recursive:true});
  const outside = path.join(root, 'unrelated.txt');
  await fs.writeFile(outside, 'SYNTHETIC_UNCHANGED');
  await fs.symlink(outside, path.join(root, dir, 'result.json'));
  await assert.rejects(writeReviewJson(dir, 'result.json', {}, {root}), /UNSAFE_REVIEW_DESTINATION/);
  assert.equal(await fs.readFile(outside, 'utf8'), 'SYNTHETIC_UNCHANGED');
}));
test('parent symlink cannot redirect evidence', () => fixture(async root => {
  await fs.mkdir(path.join(root, 'other'));
  await fs.symlink(path.join(root, 'other'), path.join(root, 'generated-artifacts'));
  await assert.rejects(writeReviewJson(dir, 'result.json', {}, {root}), /UNSAFE_REVIEW_DIRECTORY/);
  assert.deepEqual(await fs.readdir(path.join(root, 'other')), []);
}));
test('hard-linked existing evidence cannot be truncated', () => fixture(async root => {
  await fs.mkdir(path.join(root, dir), {recursive:true});
  const outside = path.join(root, 'unrelated.txt');
  await fs.writeFile(outside, 'SYNTHETIC_UNCHANGED');
  await fs.link(outside, path.join(root, dir, 'result.json'));
  await assert.rejects(writeReviewJson(dir, 'result.json', {}, {root}), /UNSAFE_REVIEW_DESTINATION/);
  assert.equal(await fs.readFile(outside, 'utf8'), 'SYNTHETIC_UNCHANGED');
}));
test('invalid output references are rejected before filesystem work', async () => {
  await assert.rejects(writeReviewJson('../outside', 'result.json', {}), /INVALID_REVIEW_OUTPUT/);
  await assert.rejects(writeReviewJson(dir, '../outside.json', {}), /INVALID_REVIEW_OUTPUT/);
});
test('serialization failure produces no output', () => fixture(async root => {
  const circular = {}; circular.self = circular;
  await assert.rejects(writeReviewJson(dir, 'result.json', circular, {root}), /INVALID_REVIEW_DATA/);
  assert.deepEqual(await fs.readdir(root), []);
}));

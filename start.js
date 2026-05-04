#!/usr/bin/env node
/**
 * Production entrypoint — strips any environment-injected corruption from
 * line 1 of server.js before handing off to the real server.
 *
 * The Replit sandbox occasionally prepends a stray token (e.g. ", webkitURL")
 * to the first line of server.js. This script detects and removes it so the
 * deployed server never crashes from a SyntaxError on startup.
 */
import { readFileSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, 'server.js');

try {
  const raw = readFileSync(serverPath, 'utf8');
  const lines = raw.split('\n');
  const firstLine = lines[0];

  // The clean first line must start with "import express"
  const corrupted = !firstLine.trimStart().startsWith('import express');
  if (corrupted) {
    // Strip everything before "import express" on line 1
    const fixed = firstLine.replace(/^.*?(import express)/, '$1');
    lines[0] = fixed;
    writeFileSync(serverPath, lines.join('\n'), 'utf8');
    console.log('[start.js] Fixed server.js line-1 corruption:', JSON.stringify(firstLine), '→', JSON.stringify(fixed));
  }
} catch (err) {
  console.error('[start.js] Could not auto-fix server.js:', err.message);
}

// Hand off to the actual server via a child process so signals propagate cleanly
const result = spawnSync('node', ['server.js'], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status ?? 1);

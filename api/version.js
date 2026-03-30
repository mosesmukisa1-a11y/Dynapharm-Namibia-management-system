import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERSION_FILE = join(__dirname, '..', 'version.json');

function readVersion() {
  try {
    const raw = readFileSync(VERSION_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { version: 'unknown', deployedAt: null };
  }
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { version, deployedAt } = readVersion();
  return res.status(200).json({
    version,
    deployedAt,
    timestamp: Date.now(),
  });
}

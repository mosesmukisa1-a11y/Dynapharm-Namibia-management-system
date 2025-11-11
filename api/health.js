import { applyAuthCors } from './_lib/auth.js';
import { query } from './db.js';

function resolveCommitHash() {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT ||
    process.env.COMMIT_SHA ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    null
  );
}

function resolveEnvironment() {
  return process.env.NODE_ENV || process.env.APP_ENV || 'development';
}

export default async function handler(req, res) {
  applyAuthCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({
      status: 'error',
      ok: false,
      message: `Method ${req.method} not allowed`,
    });
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const started = Date.now();
  let dbConnected = false;
  let dbLatencyMs = null;
  let dbError = null;

  try {
    const dbStart = Date.now();
    await query('SELECT 1');
    dbLatencyMs = Date.now() - dbStart;
    dbConnected = true;
  } catch (error) {
    dbError = error.message;
  }

  const payload = {
    ok: dbConnected,
    status: dbConnected ? 'ok' : 'degraded',
    service: 'dynapharm-backend',
    version: resolveCommitHash(),
    environment: resolveEnvironment(),
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    requestId: req.headers['x-request-id'] || null,
    method: req.method,
    path: req.originalUrl || req.url,
    metrics: {
      responseTimeMs: Date.now() - started,
      dbLatencyMs,
    },
    db: {
      connected: dbConnected,
      latencyMs: dbLatencyMs,
      error: dbError,
    },
    realtimeGateway: process.env.REALTIME_GATEWAY_URL || null,
    nodeVersion: process.version,
  };

  const statusCode = dbConnected ? 200 : 503;

  if (req.method === 'HEAD') {
    return res.status(statusCode).end();
  }

  return res.status(statusCode).json(payload);
}


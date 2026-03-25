/**
 * GET /api/system/build-info
 * Returns app version and environment info for cross-device consistency checks.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const buildDate = new Date();
  const pad = n => String(n).padStart(2, '0');
  const ver = `${buildDate.getFullYear()}.${pad(buildDate.getMonth() + 1)}.${pad(buildDate.getDate())}.1`;
  return res.json({
    success: true,
    appVersion: ver,
    buildHash: process.env.REPL_SLUG || 'dynapharm-namibia',
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    frontendBundleVersion: 'web-main-001',
    apiLayer: 'shared',
    note: 'All devices (iOS, Windows, Android) must use this same API layer and version.',
  });
}

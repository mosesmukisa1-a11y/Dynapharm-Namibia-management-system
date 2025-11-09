export default async function handler(req, res) {
  const hasDbUrl = Boolean(process.env.DATABASE_URL);
  const hasAuthSecret = Boolean(process.env.AUTH_SECRET || process.env.JWT_SECRET);

  res.status(200).json({
    ok: true,
    nodeEnv: process.env.NODE_ENV || null,
    hasDatabaseUrl: hasDbUrl,
    hasAuthSecret,
  });
}


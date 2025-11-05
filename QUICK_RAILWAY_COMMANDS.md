# ⚡ Quick Railway Setup Commands

## After You Get Your Railway DATABASE_URL

Once you create PostgreSQL in Railway and copy the DATABASE_URL, run:

```bash
# 1. Set your Railway DATABASE_URL
export DATABASE_URL='your-railway-database-url-here'

# 2. Navigate to project
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3

# 3. Initialize database (all in one command)
psql "$DATABASE_URL" -f backend/db_schema.sql && \
psql "$DATABASE_URL" -f backend/db_enhancements.sql && \
echo "✅ Database initialized!" && \
psql "$DATABASE_URL" -c "SELECT COUNT(*) as table_count FROM information_schema.tables WHERE table_schema = 'public';"
```

## Test Connection

```bash
psql "$DATABASE_URL" -c "SELECT version();"
```

## Verify Tables

```bash
psql "$DATABASE_URL" -c "\dt"
```

## Check Realtime Triggers

```bash
psql "$DATABASE_URL" -c "SELECT tgname FROM pg_trigger WHERE tgname LIKE '%_notify';"
```

---

## What You Need from Railway

1. **DATABASE_URL** - From PostgreSQL service → Variables tab
2. **Realtime Gateway URL** - After deploying gateway service

**Share these URLs and I'll help configure everything!**

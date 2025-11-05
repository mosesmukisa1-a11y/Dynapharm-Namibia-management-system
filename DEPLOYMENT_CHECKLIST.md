# ✅ Railway + Vercel Deployment Checklist

Use this checklist to track your deployment progress.

## Pre-Deployment

- [ ] Code pushed to GitHub repository
- [ ] Railway account created (https://railway.app)
- [ ] Vercel account created (https://vercel.com)

## Step 1: Railway PostgreSQL

- [ ] Railway project created
- [ ] PostgreSQL database added
- [ ] DATABASE_URL copied from Variables tab
- [ ] Database schema initialized (db_schema.sql)
- [ ] Database enhancements applied (db_enhancements.sql)
- [ ] Verified tables exist (21 tables)

**Connection String:**
```
DATABASE_URL = _________________________________
```

## Step 2: Railway Realtime Gateway

- [ ] Realtime gateway server.js updated (PostgreSQL LISTEN added)
- [ ] pg dependency added to package.json
- [ ] Service deployed to Railway
- [ ] DATABASE_URL environment variable set in Railway
- [ ] Domain generated and URL copied
- [ ] Health endpoint tested: `/health` returns `{"status":"ok","db_connected":true}`

**Realtime Gateway URL:**
```
REALTIME_GATEWAY_URL = https://_________________________________
```

## Step 3: Vercel Deployment

- [ ] Repository connected to Vercel
- [ ] Environment variables added:
  - [ ] DATABASE_URL (from Railway PostgreSQL)
  - [ ] REALTIME_GATEWAY_URL (from Railway Realtime Gateway)
  - [ ] NODE_ENV = production
- [ ] Project deployed successfully
- [ ] Deployment URL noted

**Vercel Deployment URL:**
```
FRONTEND_URL = https://_________________________________
```

## Step 4: Frontend Configuration

- [ ] Realtime Gateway URL updated in HTML files
- [ ] API base URL updated (if needed)
- [ ] Changes committed and pushed
- [ ] Vercel auto-deployed new changes

## Step 5: Testing

- [ ] Database connection test passed
- [ ] Realtime Gateway health check passed
- [ ] Vercel API endpoint test passed
- [ ] Created test client via API
- [ ] Verified client appears in database
- [ ] Tested WebSocket connection
- [ ] Tested real-time updates (multiple browser tabs)

## Step 6: Production Config

- [ ] Custom domains configured (optional)
- [ ] Monitoring set up
- [ ] Backups enabled on Railway PostgreSQL
- [ ] Error tracking configured (optional)

## Verification Commands

**Test Database:**
```bash
railway run --service PostgreSQL psql $DATABASE_URL -c "SELECT COUNT(*) FROM clients;"
```

**Test Realtime Gateway:**
```bash
curl https://your-realtime-gateway.railway.app/health
```

**Test Vercel API:**
```bash
curl https://your-project.vercel.app/api/clients
```

**Create Test Client:**
```bash
curl -X POST https://your-project.vercel.app/api/clients \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Test Client","email":"test@example.com"}'
```

## Notes

Date Started: _______________
Date Completed: _______________

Issues Encountered:
_________________________________
_________________________________
_________________________________


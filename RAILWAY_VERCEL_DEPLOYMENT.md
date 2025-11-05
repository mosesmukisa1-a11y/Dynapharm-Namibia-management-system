# 🚀 Railway + Vercel Deployment Guide
## Step-by-Step Deployment for Global Real-Time System

This guide walks you through deploying your Dynapharm system using:
- **Railway**: PostgreSQL database + Realtime Gateway
- **Vercel**: Frontend + API endpoints

---

## Prerequisites

- GitHub account (for connecting Railway/Vercel)
- Railway account: https://railway.app
- Vercel account: https://vercel.com
- Your code pushed to a GitHub repository

---

## Step 1: Set Up PostgreSQL on Railway

### 1.1 Create Railway Project

1. Go to https://railway.app and sign in
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"** (or create empty project)
4. Name your project: `dynapharm-production`

### 1.2 Add PostgreSQL Database

1. In your Railway project, click **"+ New"**
2. Select **"Database"** → **"Add PostgreSQL"**
3. Wait for PostgreSQL to provision (takes ~30 seconds)

### 1.3 Get Database Connection String

1. Click on the **PostgreSQL** service
2. Go to the **"Variables"** tab
3. Copy the `DATABASE_URL` value
   - Format: `postgresql://postgres:password@host:port/railway`
   - **Save this - you'll need it for Vercel**

### 1.4 Initialize Database Schema

**Option A: Using Railway CLI (Recommended)**

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Link to your project
railway link

# Run schema (replace YOUR_PROJECT_ID with your Railway project)
railway run --service PostgreSQL psql $DATABASE_URL -f backend/db_schema.sql

# Run enhancements
railway run --service PostgreSQL psql $DATABASE_URL -f backend/db_enhancements.sql
```

**Option B: Using Local psql**

```bash
# Set DATABASE_URL from Railway (copy from Variables tab)
export DATABASE_URL='postgresql://postgres:password@host:port/railway'

# Run schema
psql "$DATABASE_URL" -f backend/db_schema.sql

# Run enhancements  
psql "$DATABASE_URL" -f backend/db_enhancements.sql
```

**Option C: Using Railway Web Interface**

1. Go to PostgreSQL service → **"Query"** tab
2. Copy contents of `backend/db_schema.sql`
3. Paste and click **"Run"**
4. Repeat for `backend/db_enhancements.sql`

### 1.5 Verify Database Setup

```bash
# Using Railway CLI
railway run --service PostgreSQL psql $DATABASE_URL -c "\dt"

# Should show all 21 tables
```

---

## Step 2: Deploy Realtime Gateway to Railway

### 2.1 Prepare Realtime Gateway

The `realtime-gateway` folder is already configured for Railway. Verify it has:

- ✅ `package.json` with dependencies
- ✅ `server.js` (WebSocket server)
- ✅ `railway.json` or `Procfile` for deployment

### 2.2 Enhance Realtime Gateway (Add PostgreSQL LISTEN)

Update `realtime-gateway/server.js` to listen for database changes:

```javascript
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { Pool } from 'pg';  // Add this

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

const server = app.listen(process.env.PORT || 8080, () => {
  console.log('Realtime gateway listening on', server.address().port);
});

const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(data) {
  const msg = typeof data === 'string' ? data : JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      try { client.send(msg); } catch (_) {}
    }
  });
}

// PostgreSQL connection for LISTEN/NOTIFY
let dbPool = null;
if (process.env.DATABASE_URL) {
  dbPool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  // Listen for database changes
  dbPool.query('LISTEN clients_changes');
  dbPool.query('LISTEN orders_changes');
  dbPool.query('LISTEN reports_changes');
  dbPool.query('LISTEN products_changes');
  
  // Handle notifications
  dbPool.on('notification', (msg) => {
    try {
      const payload = JSON.parse(msg.payload);
      broadcast({
        type: 'event',
        event: {
          resource: payload.table.replace('_changes', ''),
          action: payload.action.toLowerCase(),
          data: payload.data,
          timestamp: Date.now()
        }
      });
    } catch (error) {
      console.error('Error processing notification:', error);
    }
  });
  
  console.log('✅ PostgreSQL LISTEN configured');
}

wss.on('connection', (ws) => {
  try { ws.send(JSON.stringify({ type: 'hello', ts: Date.now() })); } catch(_) {}
});

app.get('/', (req, res) => res.json({ 
  service: 'dynapharm-realtime-gateway', 
  status: 'running', 
  endpoints: ['/health', '/publish', '/ws'],
  db_connected: !!dbPool
}));

app.get('/health', (req, res) => res.json({ status: 'ok', db_connected: !!dbPool }));

app.post('/publish', (req, res) => {
  try {
    const { event = {} } = req.body || {};
    broadcast({ type: 'event', ...event });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'publish failed' });
  }
});
```

### 2.3 Add pg Dependency

```bash
cd realtime-gateway
npm install pg
```

### 2.4 Deploy to Railway

**Option A: Deploy from GitHub**

1. In Railway project, click **"+ New"**
2. Select **"GitHub Repo"**
3. Choose your repository
4. Railway auto-detects Node.js
5. Set **Root Directory** to `realtime-gateway`
6. Add environment variable:
   - Key: `DATABASE_URL`
   - Value: (Copy from PostgreSQL service Variables tab)
7. Click **"Deploy"**

**Option B: Deploy via Railway CLI**

```bash
cd realtime-gateway

# Link to Railway
railway link

# Set environment variable
railway variables set DATABASE_URL="your-database-url-here"

# Deploy
railway up
```

### 2.5 Get Realtime Gateway URL

1. Once deployed, click on the **Realtime Gateway** service
2. Go to **"Settings"** → **"Generate Domain"**
3. Copy the domain (e.g., `realtime-gateway-production.up.railway.app`)
4. **Save this URL** - you'll need it for Vercel

---

## Step 3: Deploy to Vercel

### 3.1 Connect Repository to Vercel

1. Go to https://vercel.com and sign in
2. Click **"Add New"** → **"Project"**
3. Import your GitHub repository
4. Vercel will auto-detect settings

### 3.2 Configure Build Settings

Vercel should auto-detect, but verify:

- **Framework Preset**: Other
- **Root Directory**: `./` (root)
- **Build Command**: (leave empty or `npm install`)
- **Output Directory**: (leave empty)
- **Install Command**: `npm install`

### 3.3 Add Environment Variables

In Vercel project settings → **"Environment Variables"**, add:

#### Required Variables:

1. **DATABASE_URL**
   - Value: Copy from Railway PostgreSQL service → Variables tab
   - Environments: Production, Preview, Development

2. **REALTIME_GATEWAY_URL**
   - Value: `https://your-realtime-gateway.railway.app` (from Step 2.5)
   - Environments: Production, Preview, Development
   - Note: Remove trailing slash

3. **NODE_ENV**
   - Value: `production`
   - Environments: Production

#### Optional Variables:

- `UPSTASH_REDIS_REST_URL` (if using Upstash Redis)
- `UPSTASH_REDIS_REST_TOKEN` (if using Upstash Redis)

### 3.4 Deploy

1. Click **"Deploy"**
2. Wait for build to complete (~2-3 minutes)
3. Copy your deployment URL (e.g., `your-project.vercel.app`)

---

## Step 4: Update Frontend Configuration

### 4.1 Update Realtime Gateway URL in Frontend

In your main HTML file (`dynapharm-complete-system.html` or similar), update the WebSocket URL:

```javascript
// Find this line (or similar):
const REALTIME_GATEWAY_URL = 'http://localhost:8080';

// Replace with your Railway URL:
const REALTIME_GATEWAY_URL = 'https://your-realtime-gateway.railway.app';
```

### 4.2 Update API Base URL (if needed)

If your API endpoints use absolute URLs, update them:

```javascript
// Replace localhost with Vercel domain
const API_BASE = 'https://your-project.vercel.app';
```

### 4.3 Commit and Redeploy

```bash
git add .
git commit -m "Update configuration for production deployment"
git push
```

Vercel will auto-deploy on push.

---

## Step 5: Verify Deployment

### 5.1 Test Database Connection

```bash
# Test from local machine (replace with your Railway DATABASE_URL)
export DATABASE_URL='your-railway-database-url'
node test-database-connection.js
```

Or use Railway CLI:
```bash
railway run --service PostgreSQL psql $DATABASE_URL -c "SELECT COUNT(*) FROM clients;"
```

### 5.2 Test Realtime Gateway

```bash
# Test health endpoint
curl https://your-realtime-gateway.railway.app/health

# Should return: {"status":"ok","db_connected":true}
```

### 5.3 Test Vercel API

```bash
# Test clients API
curl https://your-project.vercel.app/api/clients

# Should return: [] (empty array initially)
```

### 5.4 Test End-to-End Flow

1. **Create a client via API:**
   ```bash
   curl -X POST https://your-project.vercel.app/api/clients \
     -H "Content-Type: application/json" \
     -d '{"full_name":"Test Client","email":"test@example.com"}'
   ```

2. **Verify in database:**
   ```bash
   railway run --service PostgreSQL psql $DATABASE_URL -c "SELECT * FROM clients;"
   ```

3. **Check WebSocket connection:**
   - Open browser console
   - Connect to: `wss://your-realtime-gateway.railway.app/ws`
   - Should see `{"type":"hello","ts":...}`

---

## Step 6: Production Configuration

### 6.1 Enable Custom Domains (Optional)

**Railway:**
1. Go to Realtime Gateway service → Settings
2. Add custom domain (e.g., `realtime.dynapharm.com`)
3. Update DNS records as shown

**Vercel:**
1. Go to Project Settings → Domains
2. Add custom domain
3. Update DNS as instructed

### 6.2 Set Up Monitoring

**Railway:**
- Built-in metrics in service dashboard
- Check logs tab for errors

**Vercel:**
- Analytics in project dashboard
- Set up error tracking (Sentry, etc.)

### 6.3 Enable Backups

**Railway PostgreSQL:**
1. Go to PostgreSQL service → Settings
2. Enable **"Automatic Backups"**
3. Set backup retention (7-30 days)

---

## Troubleshooting

### Database Connection Issues

**Error: "Connection refused"**
- Check Railway PostgreSQL is running (green status)
- Verify DATABASE_URL is correct
- Check SSL mode (should be enabled for Railway)

**Error: "Relation does not exist"**
- Run schema: `psql "$DATABASE_URL" -f backend/db_schema.sql`
- Run enhancements: `psql "$DATABASE_URL" -f backend/db_enhancements.sql`

### Realtime Gateway Issues

**Error: "Cannot connect to WebSocket"**
- Check Railway service is deployed (green status)
- Verify REALTIME_GATEWAY_URL in Vercel env vars
- Check Railway logs for errors

**No realtime updates:**
- Verify DATABASE_URL is set in Realtime Gateway service
- Check PostgreSQL triggers exist: `railway run --service PostgreSQL psql $DATABASE_URL -c "SELECT tgname FROM pg_trigger WHERE tgname LIKE '%_notify';"`

### Vercel API Issues

**Error: "Module not found: pg"**
- Ensure `pg` is in `package.json` dependencies
- Redeploy to Vercel

**Error: "DATABASE_URL not defined"**
- Check Environment Variables in Vercel project settings
- Ensure it's set for all environments (Production, Preview)

**API returns 500 errors:**
- Check Vercel Function Logs
- Verify database connection
- Check API endpoint code for errors

---

## Quick Reference

### Railway Services URLs

After deployment, you'll have:

- **PostgreSQL**: `postgresql://postgres:password@host:port/railway` (connection string)
- **Realtime Gateway**: `https://realtime-gateway-production.up.railway.app`

### Vercel URLs

- **Frontend**: `https://your-project.vercel.app`
- **API Endpoints**: `https://your-project.vercel.app/api/*`

### Environment Variables Summary

**Railway (Realtime Gateway service):**
- `DATABASE_URL` - From PostgreSQL service
- `PORT` - Auto-set by Railway

**Vercel:**
- `DATABASE_URL` - From Railway PostgreSQL
- `REALTIME_GATEWAY_URL` - From Railway Realtime Gateway
- `NODE_ENV` - `production`

---

## Next Steps After Deployment

1. ✅ Test all API endpoints
2. ✅ Verify real-time updates work across multiple browser tabs
3. ✅ Test offline functionality
4. ✅ Set up error monitoring
5. ✅ Configure backups
6. ✅ Document production URLs for your team

---

## Support

If you encounter issues:

1. Check Railway logs: Service → Deployments → View Logs
2. Check Vercel logs: Project → Deployments → Functions → View Logs
3. Test database connection locally with Railway DATABASE_URL
4. Verify all environment variables are set correctly

**You're all set! Your global real-time system is now live! 🎉**



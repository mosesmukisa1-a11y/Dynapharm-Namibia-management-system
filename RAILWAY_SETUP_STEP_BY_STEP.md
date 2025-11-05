# 🚂 Railway Setup - Step by Step Guide

## Prerequisites
- ✅ Railway account (create at https://railway.app if needed)
- ✅ GitHub account (for connecting your repository)

---

## Step 1: Create Railway Project

### 1.1 Sign In to Railway
1. Go to https://railway.app
2. Click **"Login"** → Sign in with GitHub

### 1.2 Create New Project
1. Click **"+ New Project"**
2. Choose one:
   - **"Deploy from GitHub repo"** - Connect your existing repo
   - **"Empty Project"** - Create empty project first

### 1.3 Name Your Project
- Project name: `dynapharm-production` (or your preferred name)

---

## Step 2: Add PostgreSQL Database

### 2.1 Add PostgreSQL Service
1. In your Railway project, click **"+ New"**
2. Select **"Database"**
3. Click **"Add PostgreSQL"**
4. Wait ~30 seconds for PostgreSQL to provision

### 2.2 Get Database Connection String
1. Click on the **PostgreSQL** service (in your project dashboard)
2. Go to the **"Variables"** tab
3. Find `DATABASE_URL` - it looks like:
   ```
   postgresql://postgres:xxxxxxxx@containers-us-west-xxx.railway.app:5432/railway
   ```
4. **Copy this entire URL** - you'll need it for next steps!

**Save this DATABASE_URL somewhere safe!**

---

## Step 3: Initialize Database Schema on Railway

### Option A: Using Railway Web Interface (EASIEST)

1. In Railway, click on your **PostgreSQL** service
2. Click the **"Query"** tab (top menu)
3. Open `backend/db_schema.sql` in your local text editor
4. Copy ALL contents (Ctrl+A, Ctrl+C / Cmd+A, Cmd+C)
5. Paste into Railway Query tab
6. Click **"Run"**
7. Wait for success messages

8. Open `backend/db_enhancements.sql` in your local text editor
9. Copy ALL contents
10. Paste into Railway Query tab
11. Click **"Run"**
12. Verify success

### Option B: Using Terminal (Local psql)

```bash
# Replace YOUR_RAILWAY_DATABASE_URL with your actual Railway DATABASE_URL
export DATABASE_URL='YOUR_RAILWAY_DATABASE_URL'

# Navigate to project
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3

# Run schema
psql "$DATABASE_URL" -f backend/db_schema.sql

# Run enhancements
psql "$DATABASE_URL" -f backend/db_enhancements.sql
```

### Option C: Using Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to your project
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3
railway link

# Select your project and PostgreSQL service
# Then run:
railway run psql $DATABASE_URL -f backend/db_schema.sql
railway run psql $DATABASE_URL -f backend/db_enhancements.sql
```

---

## Step 4: Verify Database Setup

In Railway Query tab, run:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

Should see **21 tables** including: branches, users, clients, orders, reports, sync_log, etc.

Or via terminal:
```bash
psql "$DATABASE_URL" -c "\dt"
```

---

## Step 5: Deploy Realtime Gateway to Railway

### 5.1 Add New Service for Realtime Gateway

1. In your Railway project, click **"+ New"**
2. Select **"GitHub Repo"** (or **"Empty Service"** if using CLI)
3. Choose your repository
4. Railway will auto-detect it's a Node.js project

### 5.2 Configure Service

1. Click on the new service
2. Go to **"Settings"** tab
3. Set **Root Directory**: `realtime-gateway`
4. Go to **"Variables"** tab
5. Add environment variable:
   - **Key:** `DATABASE_URL`
   - **Value:** (Copy the DATABASE_URL from PostgreSQL service Variables tab)
6. Click **"Add"**

### 5.3 Deploy

1. Railway will automatically start deploying
2. Wait for deployment to complete (green status)
3. Go to **"Settings"** tab
4. Under **"Networking"**, click **"Generate Domain"**
5. Copy the generated URL (e.g., `realtime-gateway-production.up.railway.app`)
6. **Save this URL** - you'll need it for Vercel!

### 5.4 Verify Realtime Gateway

```bash
# Test health endpoint
curl https://your-realtime-gateway-url.railway.app/health

# Should return: {"status":"ok","db_connected":true}
```

---

## Step 6: Summary - Save These Values

After completing Railway setup, you should have:

1. **Railway PostgreSQL DATABASE_URL:**
   ```
   postgresql://postgres:xxx@xxx.railway.app:5432/railway
   ```

2. **Realtime Gateway URL:**
   ```
   https://xxx.up.railway.app
   ```

**Save both of these for Vercel configuration!**

---

## Troubleshooting

### PostgreSQL Connection Issues

**Error: "Connection refused"**
- Check Railway PostgreSQL service is running (green status)
- Verify DATABASE_URL is correct
- Make sure you're using the full connection string

**Error: "Relation does not exist"**
- Schema not initialized - run db_schema.sql
- Check Railway Query tab for errors

### Realtime Gateway Issues

**Error: "Module not found: pg"**
- The package.json should have `pg` - verify it's there
- Redeploy the service

**Health check fails**
- Check Railway logs: Service → Deployments → View Logs
- Verify DATABASE_URL is set correctly in service Variables

---

## Next Steps After Railway

Once Railway is set up:
1. ✅ Deploy to Vercel (see `RAILWAY_VERCEL_DEPLOYMENT.md`)
2. ✅ Configure Vercel environment variables
3. ✅ Update frontend with Realtime Gateway URL
4. ✅ Test end-to-end

---

## Quick Reference Commands

**Get Railway DATABASE_URL:**
- Railway → PostgreSQL service → Variables tab

**Initialize schema (web):**
- Railway → PostgreSQL service → Query tab → Paste SQL

**Initialize schema (terminal):**
```bash
export DATABASE_URL='your-railway-url'
psql "$DATABASE_URL" -f backend/db_schema.sql
psql "$DATABASE_URL" -f backend/db_enhancements.sql
```

**Test Realtime Gateway:**
```bash
curl https://your-gateway-url.railway.app/health
```

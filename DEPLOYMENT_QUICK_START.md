# 🚀 Quick Start: Railway + Vercel Deployment

## Overview

Deploy your global real-time system in 5 steps:

1. **Railway**: PostgreSQL database
2. **Railway**: Realtime Gateway (WebSocket)
3. **Vercel**: Frontend + API endpoints
4. **Configure**: Environment variables
5. **Test**: Verify everything works

---

## Step 1: PostgreSQL on Railway (5 min)

1. Go to https://railway.app → New Project
2. Click **"+ New"** → **Database** → **PostgreSQL**
3. Copy `DATABASE_URL` from Variables tab
;2C;2C;2C;2Ccd /Users/moseswalker/Downloads/dynapharm-namibia-health-3 && cat > RAILWAY_DATABASE_SETUP.md << 'EOF'
# 🗄️ Railway Database Schema Setup Guide

## Method 1: Using Railway Web Interface (EASIEST - No command line needed)

### Step 1: Get Your Database URL

1. In Railway, click on your **PostgreSQL** service
2. Go to the **"Variables"** tab
3. Find `DATABASE_URL` - it looks like:
   ```
   postgresql://postgres:password@containers-us-west-xxx.railway.app:5432/railway
   ```
4. **Copy this entire URL** (you'll need it)

### Step 2: Use Railway Query Tab

1. Still in your PostgreSQL service, click on the **"Query"** tab (top menu)
2. This opens a SQL editor connected to your database

### Step 3: Run db_schema.sql

1. Open `backend/db_schema.sql` in your local text editor
2. **Copy ALL the contents** (Ctrl+A, Ctrl+C / Cmd+A, Cmd+C)
3. **Paste into the Railway Query tab**
4. Click **"Run"** button
5. Wait for success message (should see "CREATE TABLE" messages)

### Step 4: Run db_enhancements.sql

1. Open `backend/db_enhancements.sql` in your local text editor
2. **Copy ALL the contents**
3. **Paste into the Railway Query tab**
4. Click **"Run"** button
5. Wait for success message

### Step 5: Verify

In the Railway Query tab, run:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
```

You should see **21 tables** including: branches, users, clients, orders, reports, sync_log, etc.

---

## Method 2: Using Railway CLI (Recommended for repeated use)

### Step 1: Install Railway CLI

```bash
npm install -g @railway/cli
```

### Step 2: Login to Railway

```bash
railway login
```
This opens your browser to authenticate.

### Step 3: Link to Your Project

```bash
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3
railway link
```
- Select your Railway project from the list
- Select the PostgreSQL service

### Step 4: Run Schema

```bash
railway run psql $DATABASE_URL -f backend/db_schema.sql
```

### Step 5: Run Enhancements

```bash
railway run psql $DATABASE_URL -f backend/db_enhancements.sql
```

### Step 6: Verify

```bash
railway run psql $DATABASE_URL -c "\dt"
```

---

## Method 3: Using Local psql with Railway URL

### Step 1: Get Your Database URL

1. In Railway → PostgreSQL service → **Variables** tab
2. Copy the `DATABASE_URL`

### Step 2: Set Environment Variable (Terminal/Mac)

Open Terminal and run:

```bash
# Replace with YOUR actual Railway DATABASE_URL
export DATABASE_URL='postgresql://postgres:password@containers-us-west-xxx.railway.app:5432/railway'
```

### Step 3: Navigate to Project

```bash
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3
```

### Step 4: Run Schema Files

```bash
psql "$DATABASE_URL" -f backend/db_schema.sql
psql "$DATABASE_URL" -f backend/db_enhancements.sql
```

### Step 5: Verify

```bash
psql "$DATABASE_URL" -c "\dt"
```

---

## Method 4: One-Line Copy-Paste (Quick Method)

If you have Railway CLI installed and linked:

```bash
railway run psql $DATABASE_URL -f backend/db_schema.sql && railway run psql $DATABASE_URL -f backend/db_enhancements.sql
```

---

## Troubleshooting

### "psql: command not found"

**Install PostgreSQL client:**
```bash
# macOS
brew install postgresql

# Verify installation
psql --version
```

### "Connection refused" or "could not connect"

**Check:**
1. Your Railway PostgreSQL service is running (green status)
2. DATABASE_URL is correct (no extra spaces)
3. SSL might be required - try adding `?sslmode=require`:
   ```
   postgresql://postgres:password@host:port/railway?sslmode=require
   ```

### "relation already exists" errors

This is **OK** - it means tables already exist. The schema uses `CREATE TABLE IF NOT EXISTS`, so it won't fail.

### "permission denied"

Make sure you're using the correct DATABASE_URL from Railway Variables tab, not trying to connect with wrong credentials.

---

## Which Method Should You Use?

- **Method 1 (Web Interface)**: ✅ Easiest, no tools needed
- **Method 2 (Railway CLI)**: ✅ Best for automation, repeated deployments
- **Method 3 (Local psql)**: ✅ Good if you already have psql installed
- **Method 4 (One-liner)**: ✅ Fastest if CLI is set up

**Recommendation: Start with Method 1** - it's the simplest!

---

## Verification Commands

After setup, verify everything works:

```sql
-- Count tables (should be 21)
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public';

-- Check sync_log table exists (enhancements)
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'sync_log'
);

-- Check triggers exist
SELECT tgname FROM pg_trigger 
WHERE tgname LIKE '%_notify';
```

In Railway Query tab, just paste and run these queries!

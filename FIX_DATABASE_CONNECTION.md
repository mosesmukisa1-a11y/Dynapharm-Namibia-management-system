# Fix Database Connection Issue

## Problem
The gateway deployed successfully but can't connect to PostgreSQL:
```
Failed to listen clients_changes: Error: getaddrinfo ENOTFOUND postgres.railway.internal
```

## Solution

The DATABASE_URL is using `postgres.railway.internal` but your PostgreSQL service might have a different name.

### Option 1: Find Your PostgreSQL Service Name

1. Go to Railway Dashboard → Your project
2. Look for your **PostgreSQL service** (not the gateway service)
3. Check the service name (it might be "postgres", "database", "db", etc.)

### Option 2: Use the Connection String from PostgreSQL Service

1. Go to Railway Dashboard → Your project → **PostgreSQL service**
2. Go to **Variables** tab
3. Find `DATABASE_URL` or `POSTGRES_URL` or `CONNECTION_STRING`
4. Copy the **internal URL** (should have `.railway.internal` in it)

### Option 3: Update DATABASE_URL

Run this command (replace with your actual PostgreSQL service name):

```bash
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3/realtime-gateway

# If your PostgreSQL service is named "postgres":
railway variables set DATABASE_URL='postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@postgres.railway.internal:5432/railway'

# If your PostgreSQL service is named "database":
railway variables set DATABASE_URL='postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@database.railway.internal:5432/railway'

# If your PostgreSQL service is named "db":
railway variables set DATABASE_URL='postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@db.railway.internal:5432/railway'
```

### Option 4: Use External URL (If services are in different projects)

If your PostgreSQL and Gateway are in different Railway projects, use the external URL:

```bash
railway variables set DATABASE_URL='postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@shuttle.proxy.rlwy.net:23724/railway'
```

After updating, Railway will auto-redeploy. Wait 2-3 minutes and check logs again.

---

## Quick Check

Run this to see all your services:
```bash
railway status
```

Or check Railway Dashboard to see all services in your project.


# 🔧 Fix Gateway 502 Error

## Current Status
- **Gateway URL**: `https://web-production-40cac.up.railway.app`
- **Status**: 502 Bad Gateway
- **Issue**: Service not responding

## Quick Fix Steps

### Step 1: Verify DATABASE_URL in Railway

1. Go to **Railway Dashboard** → Your project → **Realtime Gateway service**
2. Click **Variables** tab
3. Check if `DATABASE_URL` exists
4. If missing, add it:
   - **Key**: `DATABASE_URL`
   - **Value**: `postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@postgres.railway.internal:5432/railway`
   - **Important**: Use the **internal URL** (postgres.railway.internal)

### Step 2: Check Railway Logs

1. Railway Dashboard → Your service → **Deployments**
2. Click on the latest deployment
3. Click **View Logs**
4. Look for:
   - ✅ `Realtime gateway listening on port...`
   - ✅ `PostgreSQL LISTEN configured`
   - ❌ Any error messages

### Step 3: Check Service Configuration

1. Railway Dashboard → Your service → **Settings**
2. Verify:
   - **Root Directory**: `realtime-gateway` (or blank if using start command)
   - **Start Command**: Should be `npm start` or `node server.js`
   - **Port**: Should be auto-detected (Railway sets `PORT` env var)

### Step 4: Redeploy if Needed

If DATABASE_URL was missing:
1. After adding the variable, Railway should auto-redeploy
2. Wait 2-3 minutes for deployment
3. Check logs again
4. Test: `curl https://web-production-40cac.up.railway.app/health`

---

## Manual Fix via Railway CLI

If web interface doesn't work:

```bash
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3/realtime-gateway

# Link to Railway project
railway link

# Set DATABASE_URL (internal URL for Railway services)
railway variables set DATABASE_URL='postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@postgres.railway.internal:5432/railway'

# Check variables
railway variables

# Redeploy
railway up
```

---

## Expected Logs (Success)

When working correctly, you should see:
```
✅ Realtime gateway listening on port 8080
✅ PostgreSQL LISTEN configured
```

If you see errors like:
- `❌ Failed to connect to PostgreSQL` → DATABASE_URL is wrong or missing
- `⚠️ DATABASE_URL not set` → Add the environment variable
- `Application failed to respond` → Service might be crashing, check logs

---

## Test After Fix

```bash
# Test health endpoint
curl https://web-production-40cac.up.railway.app/health

# Expected response:
# {"status":"ok","connectedClients":0,"db_connected":true,"timestamp":...}
```

---

## Next Steps After Gateway Works

1. ✅ Gateway health check passes
2. Configure Vercel environment variables
3. Deploy API endpoints to Vercel
4. Update frontend to use WebSocket


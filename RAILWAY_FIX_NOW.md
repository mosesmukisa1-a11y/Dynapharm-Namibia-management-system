# 🔧 Fix Railway Deployment - Step by Step

## Problem
Railway is trying to `cd realtime-gateway` but can't find the directory. This means Railway's Root Directory setting is incorrect.

## Solution: Fix Railway Service Settings

### Option 1: Set Root Directory (Recommended)

1. **Go to Railway Dashboard**:
   - https://railway.app
   - Click on your project
   - Click on the **Realtime Gateway service** (the one that's failing)

2. **Go to Settings**:
   - Click **Settings** tab
   - Scroll to **Service Settings**

3. **Set Root Directory**:
   - Find **"Root Directory"** field
   - Set it to: `realtime-gateway`
   - Click **Save**

4. **Verify Start Command**:
   - In the same Settings page
   - Find **"Start Command"** field
   - It should be: `node server.js` (or leave blank to use Procfile)
   - **DO NOT** include `cd realtime-gateway` in the start command
   - Click **Save**

5. **Redeploy**:
   - Railway should auto-redeploy after saving
   - Or click **"Redeploy"** button
   - Wait 2-3 minutes

### Option 2: Remove cd from Start Command

If Root Directory is already set to root (`/`):

1. **Go to Settings** → **Deploy**
2. **Start Command** should be:
   ```
   cd realtime-gateway && node server.js
   ```
   OR if Root Directory is blank/root:
   ```
   cd realtime-gateway && npm start
   ```

But **Option 1 is better** - set Root Directory to `realtime-gateway` and start command to just `node server.js`.

---

## Add DATABASE_URL Environment Variable

**Critical**: The gateway also needs DATABASE_URL to work.

1. **In Railway Dashboard** → Your service → **Variables** tab
2. **Add Variable**:
   - **Key**: `DATABASE_URL`
   - **Value**: `postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@postgres.railway.internal:5432/railway`
   - **Important**: Use the **internal URL** (postgres.railway.internal)
3. **Save** (Railway will auto-redeploy)

---

## Verify Correct Configuration

After fixing, your Railway service should have:

✅ **Root Directory**: `realtime-gateway`  
✅ **Start Command**: `node server.js` (or blank to use Procfile)  
✅ **Variable**: `DATABASE_URL` = `postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@postgres.railway.internal:5432/railway`

---

## Test After Fix

Wait 2-3 minutes for deployment, then:

```bash
curl https://web-production-40cac.up.railway.app/health
```

Expected response:
```json
{"status":"ok","connectedClients":0,"db_connected":true,"timestamp":...}
```

---

## Check Logs

If it still fails, check logs:

1. Railway Dashboard → Your service → **Deployments**
2. Click latest deployment → **View Logs**
3. Look for:
   - ✅ `Realtime gateway listening on port...`
   - ✅ `PostgreSQL LISTEN configured`
   - ❌ Any errors

---

## Quick Fix Checklist

- [ ] Set Root Directory to `realtime-gateway`
- [ ] Set Start Command to `node server.js` (no cd command)
- [ ] Add DATABASE_URL variable (internal URL)
- [ ] Wait for redeploy (2-3 minutes)
- [ ] Test health endpoint
- [ ] Check logs for errors

---

**The key issue**: Railway needs to know that `realtime-gateway` is the root directory, OR you need to include `cd realtime-gateway` in the start command if Root Directory is set to repository root.

**Recommended**: Set Root Directory to `realtime-gateway` and start command to `node server.js`.


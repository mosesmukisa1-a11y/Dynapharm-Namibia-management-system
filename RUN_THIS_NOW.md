# 🚀 Run These Commands Now

## Step-by-Step Railway Fix

Open your terminal and run these commands one by one:

### Step 1: Login to Railway
```bash
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3
railway login
```
This will open your browser. Complete the authentication.

### Step 2: Navigate to realtime-gateway
```bash
cd realtime-gateway
```

### Step 3: Link to Railway Project
```bash
railway link
```
Select your Railway project from the list.

### Step 4: Set DATABASE_URL
```bash
railway variables set DATABASE_URL='postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@postgres.railway.internal:5432/railway'
```

### Step 5: Verify Variables
```bash
railway variables
```
You should see DATABASE_URL in the list.

### Step 6: Set Root Directory in Railway Dashboard

**⚠️ IMPORTANT**: Railway CLI cannot set Root Directory. You must do this manually:

1. Go to https://railway.app
2. Click on your project
3. Click on the **Realtime Gateway service**
4. Go to **Settings** → **Service Settings**
5. Set **Root Directory** to: `realtime-gateway`
6. Set **Start Command** to: `node server.js`
7. Click **Save** (Railway will auto-redeploy)

### Step 7: Deploy
```bash
railway up
```

### Step 8: Wait and Test

Wait 2-3 minutes, then test:
```bash
curl https://web-production-40cac.up.railway.app/health
```

Expected response:
```json
{"status":"ok","connectedClients":0,"db_connected":true,"timestamp":...}
```

---

## Or Run the Script (After Login)

If you've already logged in, you can run:
```bash
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3
./fix-railway-gateway.sh
```

---

## Quick Copy-Paste (All at Once)

After you've logged in with `railway login`, run:

```bash
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3/realtime-gateway && \
railway link && \
railway variables set DATABASE_URL='postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@postgres.railway.internal:5432/railway' && \
railway variables && \
echo "✅ Now go to Railway Dashboard and set Root Directory to 'realtime-gateway'" && \
railway up
```

Then **don't forget** to set Root Directory in Railway Dashboard!


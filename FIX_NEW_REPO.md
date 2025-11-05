# Fix Railway with New Repository

## Current Situation
- **Local Repository**: Updated to point to `Dynapharm-Namibia-management-system`
- **Railway**: Still connected to old repository (or wrong repository)
- **Issue**: Railway can't find `realtime-gateway` directory

## Steps to Fix

### Step 1: Push realtime-gateway to New Repository

Run these commands:

```bash
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3

# Add realtime-gateway (if not already tracked)
git add realtime-gateway/

# Commit
git commit -m "Add realtime-gateway service for Railway"

# Push to new repository
git push origin main
```

### Step 2: Update Railway to Use New Repository

1. **Go to Railway Dashboard**:
   - https://railway.app
   - Project: "beautiful-vibrancy"
   - Service: "web"

2. **Update Repository Connection**:
   - Click **Settings** tab
   - Scroll to **"Repository"** or **"GitHub"** section
   - Click **"Disconnect"** or **"Change Repository"**
   - Click **"Connect Repository"** or **"Add Repository"**
   - Search for: `Dynapharm-Namibia-management-system`
   - Select: `mosesmukisa1-a11y/Dynapharm-Namibia-management-system`
   - Select branch: `main`

3. **Set Root Directory**:
   - After connecting, go to **Settings** → **Service Settings**
   - Set **Root Directory** to: `realtime-gateway`
   - Set **Start Command** to: `node server.js`
   - Click **Save**

4. **Wait for Redeploy**:
   - Railway will automatically redeploy
   - Wait 2-3 minutes

### Step 3: Verify

After redeploy, test:
```bash
curl https://web-production-40cac.up.railway.app/health
```

Expected:
```json
{
  "status": "ok",
  "connectedClients": 0,
  "db_connected": true,
  ...
}
```

---

## Quick Command Sequence

```bash
# 1. Make sure realtime-gateway is in git
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3
git add realtime-gateway/
git status  # Check what will be committed

# 2. Commit and push
git commit -m "Add realtime-gateway service"
git push origin main

# 3. Then update Railway Dashboard (see Step 2 above)
```

---

## After Railway is Updated

Once Railway is connected to the new repository:
- ✅ It will see the `realtime-gateway` directory
- ✅ Root Directory setting will work
- ✅ Service will deploy successfully

---

**Start with Step 1 (push to new repo), then Step 2 (update Railway)!**


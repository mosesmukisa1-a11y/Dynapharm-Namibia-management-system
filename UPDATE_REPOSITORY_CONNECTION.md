# Update Railway to Use New Repository

## New Repository
- **GitHub**: `mosesmukisa1-a11y/Dynapharm-Namibia-management-system`
- **Old Repository**: `mosesmukisa1-a11y/dynapharm-namibia-health`

## Steps to Fix

### Step 1: Update Local Git Remote

Your local repository remote has been updated to point to the new repository.

### Step 2: Push realtime-gateway to New Repository

Make sure `realtime-gateway` is pushed to the new repository:

```bash
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3
git add realtime-gateway/
git commit -m "Add realtime-gateway service"
git push origin main
```

### Step 3: Update Railway Connection

1. **Go to Railway Dashboard**:
   - https://railway.app
   - Your project "beautiful-vibrancy"
   - Click on "web" service

2. **Update Repository Connection**:
   - Go to **Settings** → **Service Settings**
   - Find **"Repository"** or **"GitHub Connection"** section
   - Click **"Disconnect"** or **"Change Repository"**
   - Click **"Connect Repository"** or **"Add Repository"**
   - Select: `mosesmukisa1-a11y/Dynapharm-Namibia-management-system`
   - Select branch: `main` (or `master`)

3. **Set Root Directory**:
   - After connecting, set **Root Directory** to: `realtime-gateway`
   - Set **Start Command** to: `node server.js`
   - Click **Save**

4. **Wait for Redeploy**:
   - Railway will automatically redeploy from the new repository
   - Wait 2-3 minutes

### Step 4: Verify

After redeploy, check logs:
- Should see: `Realtime gateway listening on port 8080`
- No more: `Could not find root directory` errors

Test:
```bash
curl https://web-production-40cac.up.railway.app/health
```

---

## Quick Commands

```bash
# 1. Update remote (already done)
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3
git remote set-url origin https://github.com/mosesmukisa1-a11y/Dynapharm-Namibia-management-system.git

# 2. Push realtime-gateway to new repo
git add realtime-gateway/
git commit -m "Add realtime-gateway for Railway deployment"
git push origin main

# 3. Then update Railway Dashboard to use new repository
```

---

## Important Notes

- Make sure `realtime-gateway/` directory exists in the new GitHub repository
- Railway must be connected to the correct repository
- After reconnecting, Railway will see the `realtime-gateway` directory
- Then you can set Root Directory to `realtime-gateway`

---

**After pushing and reconnecting in Railway, the Root Directory should work!**


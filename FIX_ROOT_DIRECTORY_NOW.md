# 🔧 Fix Root Directory - URGENT

## The Problem
Railway is trying to `cd realtime-gateway` but can't find it. This means the **Root Directory** is not set correctly in Railway Dashboard.

## Fix This Now (2 minutes)

### Step 1: Go to Railway Dashboard
1. Open https://railway.app
2. Click on your project **"beautiful-vibrancy"**
3. Click on the service **"web"** (the one that's failing)

### Step 2: Set Root Directory
1. Click **"Settings"** tab (top of the page)
2. Scroll down to **"Service Settings"** section
3. Find **"Root Directory"** field
4. **Set it to**: `realtime-gateway`
5. **DO NOT** include a leading slash, just: `realtime-gateway`

### Step 3: Set Start Command
1. In the same Settings page, find **"Start Command"** field
2. **Set it to**: `node server.js`
3. **Remove** any `cd realtime-gateway` commands if present

### Step 4: Save
1. Click **"Save"** or **"Update"** button
2. Railway will automatically redeploy

### Step 5: Wait
Wait 2-3 minutes for Railway to redeploy.

---

## Visual Guide

**Settings Page Should Look Like:**

```
Root Directory: [realtime-gateway]  ← Type this here
Start Command:  [node server.js]    ← Type this here
```

**DO NOT use:**
- ❌ `/realtime-gateway` (no leading slash)
- ❌ `./realtime-gateway` (no dot-slash)
- ❌ `cd realtime-gateway && node server.js` (no cd command needed)

**DO use:**
- ✅ `realtime-gateway` (just the folder name)
- ✅ `node server.js` (just the start command)

---

## After Saving

1. Wait 2-3 minutes
2. Check logs again - you should see:
   - ✅ `Realtime gateway listening on port 8080`
   - ✅ `PostgreSQL LISTEN configured`
   - ❌ No more `cd: realtime-gateway: No such file or directory` errors

3. Test:
   ```bash
   curl https://web-production-40cac.up.railway.app/health
   ```

---

## If You Can't Find Root Directory Setting

Some Railway UI versions might have it in a different place:

1. Try **Settings** → **Deploy** tab
2. Or **Settings** → **General** tab
3. Or look for **"Working Directory"** instead of "Root Directory"

If you still can't find it, the service might need to be recreated. But try the Settings first!

---

**Do this now and the deployment will work!** 🚀


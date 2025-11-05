# Fix "Could not find root directory: realtime-gateway"

## The Problem
Railway can't find `realtime-gateway` even though it exists in your repository. This can happen if:
1. Railway is looking at a cached version of your repo
2. The repository connection needs to be refreshed
3. Railway needs the directory path to be different

## Solution Options

### Option 1: Reconnect Repository in Railway (Recommended)

1. **Go to Railway Dashboard**:
   - https://railway.app
   - Your project → "web" service

2. **Disconnect and Reconnect**:
   - Go to **Settings** → **Service Settings**
   - Click **"Disconnect Repository"** (or find the GitHub connection section)
   - Then click **"Connect Repository"** again
   - Select your repository: `mosesmukisa1-a11y/dynapharm-namibia-health`
   - This forces Railway to re-scan the repository structure

3. **Then Set Root Directory**:
   - After reconnecting, set Root Directory to: `realtime-gateway`
   - Set Start Command to: `node server.js`
   - Save

### Option 2: Use Start Command Instead (Workaround)

If Root Directory doesn't work, use the Start Command to navigate:

1. **Leave Root Directory BLANK** (or set to `/`)
2. **Set Start Command to**:
   ```
   cd realtime-gateway && node server.js
   ```
3. **Save**

### Option 3: Create New Service from realtime-gateway

If the above doesn't work:

1. **Create a NEW service** in Railway:
   - In your project, click **"+ New"** → **"GitHub Repo"**
   - Select your repository
   - **Before deploying**, set Root Directory to: `realtime-gateway`
   - Then deploy

2. **Delete the old "web" service** if the new one works

### Option 4: Verify Repository Structure

Check what Railway sees:

1. In Railway Dashboard → Your service
2. Go to **Deployments** → Latest deployment → **View Build Logs**
3. Look for file structure - see if `realtime-gateway` appears

Or verify locally:
```bash
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3
git ls-tree -r HEAD --name-only | grep realtime-gateway
```

Should show:
```
realtime-gateway/Procfile
realtime-gateway/package.json
realtime-gateway/server.js
...
```

## Quick Fix Command (If Using Start Command)

If you want to use the start command workaround, you can set it via CLI:

```bash
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3/realtime-gateway
railway variables --set "RAILWAY_START_COMMAND=cd realtime-gateway && node server.js"
```

But this might not work if Railway can't find the directory at all.

## Recommended: Try Option 1 First

**Reconnect the repository** - this is the most reliable fix:

1. Railway Dashboard → web service → Settings
2. Disconnect Repository
3. Reconnect Repository
4. Set Root Directory: `realtime-gateway`
5. Save and wait for redeploy

---

## Alternative: Deploy Without Root Directory

If Railway absolutely can't find the directory, you might need to:

1. **Move files to root** (temporary solution):
   - Copy `server.js`, `package.json`, etc. to repository root
   - Or create a symlink

2. **Or use a different deployment method**:
   - Deploy via Railway CLI (not GitHub)
   - This will use local files directly

But first, try reconnecting the repository - that usually fixes it!


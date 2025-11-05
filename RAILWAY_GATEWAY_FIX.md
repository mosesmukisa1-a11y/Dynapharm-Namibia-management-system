# 🔧 Fix: Railway Can't Find realtime-gateway Directory

## ✅ Good News
Your `realtime-gateway` directory **IS** tracked in git and has all required files:
- ✅ `server.js`
- ✅ `package.json`
- ✅ `railway.json`
- ✅ `Procfile`
- ✅ `nixpacks.toml`

## The Issue
Railway might be looking at a cached version or needs the repository refreshed.

## Quick Fixes (Try in Order)

### Fix 1: Refresh Railway Connection (Easiest)

1. **In Railway Dashboard:**
   - Go to your project
   - Click on **Settings** → **Service Settings**
   - Click **"Disconnect Repository"** (or **"Reconnect"**)
   - Then click **"Connect Repository"** again
   - Select your GitHub repository
   - This will force Railway to re-scan for directories

2. **Try setting Root Directory again:**
   - Settings → Root Directory
   - Type: `realtime-gateway`
   - Save

### Fix 2: Force Push (If Fix 1 Doesn't Work)

Make a small change to trigger Railway:

```bash
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3/realtime-gateway
echo "" >> README.md  # Add a newline (or create README if missing)
git add .
git commit -m "Trigger Railway refresh"
git push
```

Wait 30 seconds, then try Railway again.

### Fix 3: Deploy Without Root Directory First

1. **In Railway:**
   - Don't set Root Directory (leave it blank)
   - Railway will deploy from repository root
   - Go to Settings → **Deploy**
   - Set Start Command to: `cd realtime-gateway && npm start`
   - Or: `cd realtime-gateway && node server.js`

2. **Add Environment Variable:**
   - Variables → Add
   - Key: `DATABASE_URL`
   - Value: `postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@postgres.railway.internal:5432/railway`

3. **Deploy**

### Fix 4: Use Railway CLI (Most Reliable)

Deploy directly from your local machine:

```bash
# Install Railway CLI (if needed)
npm install -g @railway/cli

# Login
railway login

# Navigate to realtime-gateway
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3/realtime-gateway

# Link to existing Railway project (or create new)
railway link

# Set DATABASE_URL
railway variables set DATABASE_URL='postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@postgres.railway.internal:5432/railway'

# Deploy
railway up
```

---

## Alternative: Create New Service in Railway

Instead of setting Root Directory:

1. **Create a NEW service** in Railway:
   - In your Railway project
   - Click **"+ New"** → **"GitHub Repo"**
   - Select the **same repository**
   - This time, Railway should detect the structure

2. **Configure:**
   - Root Directory: `realtime-gateway`
   - DATABASE_URL: `postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@postgres.railway.internal:5432/railway`

---

## Verify Repository Structure

Check what Railway sees:

```bash
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3
git ls-tree -r HEAD --name-only | grep realtime-gateway
```

You should see:
```
realtime-gateway/Procfile
realtime-gateway/nixpacks.toml
realtime-gateway/package.json
realtime-gateway/railway.json
realtime-gateway/server.js
```

---

## Recommended: Use Railway CLI (Option 4)

The CLI method is most reliable and bypasses the web interface issues.

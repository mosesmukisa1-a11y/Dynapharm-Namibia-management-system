# Terminal Commands for Railway Setup

## Important Note
**Railway CLI cannot set Root Directory** - it's a dashboard-only setting. However, we can work around this by deploying from the correct directory.

## Option 1: Deploy from realtime-gateway Directory (Recommended)

This ensures Railway uses `realtime-gateway` as the root:

```bash
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3/realtime-gateway
railway link
railway variables --set "DATABASE_URL=postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@shuttle.proxy.rlwy.net:23724/railway"
railway up
```

Or use the automated script:
```bash
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3
./deploy-from-gateway.sh
```

## Option 2: Update Start Command (If Root Directory Can't Be Set)

If Root Directory can't be set in dashboard, we can modify the start command to work from root:

```bash
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3/realtime-gateway
railway variables --set "RAILWAY_START_COMMAND=cd realtime-gateway && node server.js"
```

But this won't work if Railway is deploying from the repo root and `realtime-gateway` doesn't exist in the deployed context.

## Option 3: Use Railway API (Advanced)

Railway has a REST API, but it requires:
1. Getting an API token from Railway Dashboard
2. Making HTTP requests to Railway API
3. Finding the service ID and updating settings

This is more complex than using the dashboard.

## Recommended Solution

**Deploy from the realtime-gateway directory** - Railway will treat that directory as root when you run `railway up` from there:

```bash
# Navigate to realtime-gateway
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3/realtime-gateway

# Make sure you're linked to the service
railway link

# Deploy (Railway will use current directory as root)
railway up
```

However, **if your Railway service is connected to GitHub**, it will always deploy from the repo root, so you **must** set Root Directory in the dashboard.

## Check Current Settings

```bash
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3/realtime-gateway
railway status
railway variables
```

## The Bottom Line

**If your Railway service is connected to GitHub repo:**
- ✅ **Must set Root Directory in Dashboard** to `realtime-gateway`
- ❌ Cannot be done via CLI

**If deploying via CLI (not GitHub):**
- ✅ Deploy from `realtime-gateway` directory
- ✅ Railway will use that as root automatically

---

## Quick Command (All-in-One)

```bash
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3/realtime-gateway && \
railway link && \
railway variables --set "DATABASE_URL=postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@shuttle.proxy.rlwy.net:23724/railway" && \
railway up
```

**Then set Root Directory in Dashboard** to `realtime-gateway`.


# 🚀 Vercel Setup - Complete Guide

## Current Status

✅ **Railway Gateway**: Running at `https://web-production-40cac.up.railway.app`  
✅ **Database**: PostgreSQL on Railway  
⏳ **Vercel**: Ready to configure

---

## Step 1: Configure Vercel Environment Variables

### Option A: Via Vercel Dashboard (Recommended)

1. **Go to Vercel Dashboard**:
   - https://vercel.com
   - Sign in or create account
   - Click **"Add New"** → **"Project"**

2. **Import Repository**:
   - Select **GitHub** as source
   - Choose repository: `mosesmukisa1-a11y/Dynapharm-Namibia-management-system`
   - Click **"Import"**

3. **Configure Project**:
   - **Framework Preset**: Other (or leave as auto-detected)
   - **Root Directory**: `./` (leave as default)
   - **Build Command**: (leave empty or `npm install` if needed)
   - **Output Directory**: (leave empty)
   - Click **"Deploy"** (we'll add environment variables after)

4. **Add Environment Variables**:
   - After first deploy, go to **Settings** → **Environment Variables**
   - Click **"Add New"**

   **Variable 1: DATABASE_URL**
   - Key: `DATABASE_URL`
   - Value: `postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@shuttle.proxy.rlwy.net:23724/railway`
   - Environments: ✅ Production, ✅ Preview, ✅ Development
   - Click **"Save"**

   **Variable 2: REALTIME_GATEWAY_URL**
   - Key: `REALTIME_GATEWAY_URL`
   - Value: `https://web-production-40cac.up.railway.app`
   - Environments: ✅ Production, ✅ Preview, ✅ Development
   - Click **"Save"**

   **Variable 3: NODE_ENV (Optional)**
   - Key: `NODE_ENV`
   - Value: `production`
   - Environments: ✅ Production only
   - Click **"Save"**

5. **Redeploy**:
   - Go to **Deployments** tab
   - Click **"..."** on latest deployment → **"Redeploy"**
   - Or push a new commit to trigger redeploy

### Option B: Via Vercel CLI

```bash
# Install Vercel CLI (if not installed)
npm install -g vercel

# Login to Vercel
vercel login

# Navigate to project
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3

# Link to Vercel project
vercel link

# Set environment variables
vercel env add DATABASE_URL production
# Paste: postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@shuttle.proxy.rlwy.net:23724/railway

vercel env add REALTIME_GATEWAY_URL production
# Paste: https://web-production-40cac.up.railway.app

# Deploy
vercel --prod
```

---

## Step 2: Verify Deployment

After deployment, you'll get a URL like: `https://your-project.vercel.app`

### Test Frontend:
```bash
curl https://your-project.vercel.app
```

### Test API Endpoints (if they exist):
```bash
# Health check
curl https://your-project.vercel.app/api/health

# Test database connection
curl https://your-project.vercel.app/api/clients
```

---

## Step 3: Update Frontend for Realtime Gateway

If your frontend needs to connect to the realtime gateway, add this to your HTML files:

```html
<script>
  // Realtime Gateway Configuration
  const REALTIME_GATEWAY_WS = 'wss://web-production-40cac.up.railway.app/ws';
  
  // Connect to WebSocket
  let ws = null;
  
  function connectRealtime() {
    try {
      ws = new WebSocket(REALTIME_GATEWAY_WS);
      
      ws.onopen = () => {
        console.log('✅ Connected to realtime gateway');
        // Subscribe to channels
        ws.send(JSON.stringify({ 
          type: 'subscribe', 
          channels: ['clients', 'orders', 'reports', 'products'] 
        }));
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 Realtime update:', data);
          
          // Handle different event types
          if (data.type === 'event') {
            switch(data.resource) {
              case 'reports':
                if (typeof displayReports === 'function') displayReports();
                break;
              case 'clients':
                if (typeof displayClients === 'function') displayClients();
                break;
              case 'orders':
                if (typeof displayOrders === 'function') displayOrders();
                break;
            }
          }
        } catch (e) {
          console.error('Error parsing realtime message:', e);
        }
      };
      
      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
      };
      
      ws.onclose = () => {
        console.log('⚠️ WebSocket closed, reconnecting in 5s...');
        setTimeout(connectRealtime, 5000);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
    }
  }
  
  // Connect on page load
  if (typeof window !== 'undefined') {
    connectRealtime();
  }
</script>
```

---

## Configuration Summary

### Environment Variables:

| Variable | Value | Environments |
|----------|-------|--------------|
| `DATABASE_URL` | `postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@shuttle.proxy.rlwy.net:23724/railway` | All |
| `REALTIME_GATEWAY_URL` | `https://web-production-40cac.up.railway.app` | All |
| `NODE_ENV` | `production` | Production only |

### URLs:

- **Railway Gateway**: https://web-production-40cac.up.railway.app
- **Railway Gateway WS**: wss://web-production-40cac.up.railway.app/ws
- **Database**: PostgreSQL on Railway (external URL for Vercel)

---

## ✅ Checklist

- [ ] Vercel account created/logged in
- [ ] Repository imported to Vercel
- [ ] Environment variables added
- [ ] First deployment completed
- [ ] Redeployed with environment variables
- [ ] Frontend accessible
- [ ] Realtime gateway connected (if needed)

---

## Next Steps

1. **Configure Vercel** (see Step 1 above)
2. **Deploy** your application
3. **Test** the deployment
4. **Verify** realtime gateway connection (if using WebSocket)

---

**Ready to start? Go to https://vercel.com and follow Step 1!** 🚀


# 🚀 Vercel Setup - Ready to Configure

## Current Status

✅ **Railway PostgreSQL**: Initialized and ready  
✅ **Railway Realtime Gateway**: Deployed (needs DATABASE_URL fix)  
⏳ **Vercel**: Ready to configure

---

## Step 1: Configure Vercel Environment Variables

Go to your Vercel project → **Settings** → **Environment Variables**

### Add These Variables:

#### 1. DATABASE_URL
```
postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@shuttle.proxy.rlwy.net:23724/railway
```
- **Environments**: Production, Preview, Development
- **Note**: Use **external URL** for Vercel (shuttle.proxy.rlwy.net)

#### 2. REALTIME_GATEWAY_URL
```
https://web-production-40cac.up.railway.app
```
- **Environments**: Production, Preview, Development
- **Note**: This is your Railway gateway URL

#### 3. NODE_ENV (Optional)
```
production
```
- **Environments**: Production only

---

## Step 2: Deploy to Vercel

### Option A: Via Vercel Dashboard

1. Go to https://vercel.com
2. Click **"Add New"** → **"Project"**
3. Import your GitHub repository
4. Vercel will auto-detect settings
5. **Important**: Don't change the root directory (should be `/`)
6. Click **"Deploy"**

### Option B: Via Vercel CLI

```bash
# Install Vercel CLI (if not installed)
npm install -g vercel

# Login
vercel login

# Deploy (from project root)
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3
vercel

# For production
vercel --prod
```

---

## Step 3: Verify API Endpoints

After deployment, test these endpoints:

### Health Check
```
https://your-vercel-app.vercel.app/api/health
```

### Test Database Connection
```
https://your-vercel-app.vercel.app/api/clients
```

### Test Realtime Publishing
```bash
curl -X POST https://your-vercel-app.vercel.app/api/realtime_publish \
  -H "Content-Type: application/json" \
  -d '{"resource":"test","action":"create","data":{"test":true}}'
```

---

## Step 4: Update Frontend (If Needed)

If your frontend needs to connect to the realtime gateway, add this configuration:

### In your HTML files, add:

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
                // Refresh reports list
                if (typeof displayReports === 'function') displayReports();
                break;
              case 'clients':
                // Refresh clients list
                if (typeof displayClients === 'function') displayClients();
                break;
              case 'orders':
                // Refresh orders
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

## Step 5: Test End-to-End

### Test Flow:

1. **Create a client** via API:
   ```bash
   curl -X POST https://your-vercel-app.vercel.app/api/clients \
     -H "Content-Type: application/json" \
     -d '{"name":"Test Client","phone":"123456789"}'
   ```

2. **Check database** (should see the client):
   ```bash
   curl https://your-vercel-app.vercel.app/api/clients
   ```

3. **Check realtime** (should receive WebSocket notification):
   - Open browser console
   - Should see: `📨 Realtime update: {type: "event", resource: "clients", ...}`

---

## ✅ Complete Checklist

- [ ] Vercel environment variables configured
- [ ] DATABASE_URL set (external URL)
- [ ] REALTIME_GATEWAY_URL set
- [ ] Deployed to Vercel
- [ ] API endpoints responding
- [ ] Database connection working
- [ ] Frontend connected to WebSocket (if needed)
- [ ] End-to-end test passed

---

## 🔗 Important URLs

- **Railway Gateway**: `https://web-production-40cac.up.railway.app`
- **Railway Gateway WS**: `wss://web-production-40cac.up.railway.app/ws`
- **Database External**: `postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@shuttle.proxy.rlwy.net:23724/railway`
- **Database Internal**: `postgresql://postgres:GOlCvozdDRlnrBNvqDmbIlDapwYBbxdq@postgres.railway.internal:5432/railway`

---

## 🆘 Troubleshooting

### API returns 500 errors:
- Check Vercel function logs
- Verify DATABASE_URL is correct
- Check if database is accessible from Vercel

### Realtime not working:
- Verify REALTIME_GATEWAY_URL is set
- Check gateway health: `curl https://web-production-40cac.up.railway.app/health`
- Check WebSocket connection in browser console

### Database connection fails:
- Use **external URL** for Vercel
- Check if database allows external connections
- Verify credentials are correct


# Complete Deployment Guide - Step by Step

This guide walks you through all the steps needed to deploy the real-time global data architecture.

---

## Step 1: Set Up Production PostgreSQL Database

### Option A: Using Neon (Recommended - Free Tier Available)

1. **Sign up at [neon.tech](https://neon.tech)**
   - Create a free account
   - Create a new project

2. **Create Database**
   - Project name: `dynapharm-production`
   - Region: Choose closest to your users (e.g., `us-east-1` for US)
   - PostgreSQL version: 15 or 16

3. **Get Connection String**
   - Go to Dashboard → Connection Details
   - Copy the connection string (format: `postgresql://user:password@host/database?sslmode=require`)
   - Save this as `DATABASE_URL`

4. **Run Schema**
   ```bash
   # Install psql if needed
   brew install postgresql  # macOS
   # or
   sudo apt-get install postgresql-client  # Linux
   
   # Connect and run schema
   psql "YOUR_CONNECTION_STRING" -f backend/db_schema.sql
   ```

5. **Run Migrations**
   ```bash
   psql "YOUR_CONNECTION_STRING" -f backend/db_schema_migrations.sql
   ```

6. **Verify Tables**
   ```sql
   -- Connect to database
   psql "YOUR_CONNECTION_STRING"
   
   -- Check tables
   \dt
   
   -- Check a table
   SELECT * FROM clients LIMIT 1;
   ```

### Option B: Using Supabase (Alternative)

1. **Sign up at [supabase.com](https://supabase.com)**
   - Create a new project
   - Wait for database to be provisioned

2. **Get Connection String**
   - Go to Settings → Database
   - Copy the connection string under "Connection string" → "URI"

3. **Run Schema & Migrations**
   ```bash
   psql "YOUR_SUPABASE_CONNECTION_STRING" -f backend/db_schema.sql
   psql "YOUR_SUPABASE_CONNECTION_STRING" -f backend/db_schema_migrations.sql
   ```

### Option C: Using Railway

1. **Sign up at [railway.app](https://railway.app)**
   - Create a new project
   - Click "New" → "Database" → "Add PostgreSQL"

2. **Get Connection String**
   - Click on the PostgreSQL service
   - Go to "Variables" tab
   - Copy the `DATABASE_URL`

3. **Run Schema & Migrations**
   ```bash
   psql "YOUR_RAILWAY_CONNECTION_STRING" -f backend/db_schema.sql
   psql "YOUR_RAILWAY_CONNECTION_STRING" -f backend/db_schema_migrations.sql
   ```

---

## Step 2: Deploy Realtime Gateway

### Option A: Railway (Recommended)

1. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   railway login
   ```

2. **Deploy**
   ```bash
   cd realtime-gateway
   railway init
   railway up
   ```

3. **Set Environment Variables**
   - Go to Railway dashboard
   - Select your service
   - Go to "Variables" tab
   - Add: `PORT=8080` (optional, Railway auto-assigns)

4. **Get Deployment URL**
   - Railway will give you a URL like: `https://your-service.railway.app`
   - Note this URL for the frontend configuration

### Option B: Render

1. **Create Account at [render.com](https://render.com)**

2. **Create New Web Service**
   - Connect your GitHub repo
   - Root directory: `realtime-gateway`
   - Build command: `npm install`
   - Start command: `npm start`
   - Environment: Node
   - Plan: Free (or paid for better performance)

3. **Set Environment Variables**
   - Go to Environment tab
   - Add: `PORT=10000` (Render uses port 10000 by default)

4. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment to complete

5. **Get Deployment URL**
   - Render provides: `https://your-service.onrender.com`
   - Note this URL

---

## Step 3: Configure Environment Variables

### For Vercel/Serverless Functions

1. **Go to Vercel Dashboard**
   - Select your project
   - Go to Settings → Environment Variables

2. **Add Variables**
   ```
   DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require
   REALTIME_GATEWAY_URL=https://your-realtime-gateway-url
   NODE_ENV=production
   ```

3. **Apply to All Environments**
   - Production ✅
   - Preview ✅
   - Development ✅ (optional)

4. **Redeploy**
   - Go to Deployments
   - Click "..." → "Redeploy"
   - Or trigger a new deployment by pushing to GitHub

### Verify Configuration

Test your endpoints:
```bash
# Test database connection (should return clients)
curl https://your-vercel-url.vercel.app/api/clients

# Test realtime gateway
curl https://your-realtime-gateway-url/health
```

---

## Step 4: Update Frontend HTML Files

### Add Realtime Client and Offline Sync

Add these scripts to your HTML files (e.g., `dynapharm-complete-system.html`):

**Before closing `</body>` tag:**

```html
<!-- Realtime Client -->
<script type="module">
  // Import realtime client
  import RealtimeClient from '/web-modules/realtime-client.js';
  
  // Configure and create instance
  window.realtimeClient = new RealtimeClient({
    wsUrl: 'wss://your-realtime-gateway-url/ws' // Use wss:// for secure connections
  });
  
  // Connect on page load
  window.addEventListener('DOMContentLoaded', () => {
    window.realtimeClient.connect();
    
    // Subscribe to channels
    window.realtimeClient.subscribe(['clients', 'orders', 'reports', 'products', 'employees']);
    
    // Handle real-time updates
    window.realtimeClient.on('clients:created', (data) => {
      console.log('New client created:', data);
      // Refresh client list if open
      if (window.refreshClientList) window.refreshClientList();
    });
    
    window.realtimeClient.on('clients:updated', (data) => {
      console.log('Client updated:', data);
      if (window.refreshClientList) window.refreshClientList();
    });
    
    window.realtimeClient.on('orders:created', (data) => {
      console.log('New order created:', data);
      if (window.refreshOrderList) window.refreshOrderList();
    });
    
    window.realtimeClient.on('orders:updated', (data) => {
      console.log('Order updated:', data);
      if (window.refreshOrderList) window.refreshOrderList();
    });
    
    // Connection status callbacks
    window.realtimeClient.onConnect(() => {
      console.log('✅ Connected to realtime gateway');
      // Show connection indicator
      if (window.showConnectionStatus) {
        window.showConnectionStatus('connected');
      }
    });
    
    window.realtimeClient.onDisconnect(() => {
      console.log('❌ Disconnected from realtime gateway');
      if (window.showConnectionStatus) {
        window.showConnectionStatus('disconnected');
      }
    });
  });
</script>

<!-- Offline Sync Queue -->
<script type="module">
  import OfflineSyncQueue from '/web-modules/offline-sync.js';
  
  window.offlineSyncQueue = new OfflineSyncQueue({
    apiBaseUrl: '/api',
    onSyncCallback: (operation, result) => {
      console.log('✅ Operation synced:', operation);
      // Show success notification
      if (window.showNotification) {
        window.showNotification('Data synced successfully', 'success');
      }
    },
    onSyncErrorCallback: (operation, error) => {
      console.error('❌ Sync failed:', operation, error);
      if (window.showNotification) {
        window.showNotification('Failed to sync data. Will retry later.', 'error');
      }
    }
  });
  
  // Show offline status
  window.addEventListener('online', () => {
    console.log('🌐 Connection restored');
    window.offlineSyncQueue.syncAll();
    if (window.showNotification) {
      window.showNotification('Connection restored. Syncing data...', 'info');
    }
  });
  
  window.addEventListener('offline', () => {
    console.log('📴 Connection lost');
    if (window.showNotification) {
      window.showNotification('You are offline. Changes will be saved when connection is restored.', 'warning');
    }
  });
</script>
```

### Update API Calls to Use Offline Queue

Wrap your API calls with offline detection:

```javascript
async function createClient(clientData) {
  // Try direct API call if online
  if (navigator.onLine) {
    try {
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientData)
      });
      
      if (response.ok) {
        const result = await response.json();
        return result;
      }
    } catch (error) {
      console.error('API call failed, will queue:', error);
    }
  }
  
  // Queue for offline sync
  window.offlineSyncQueue.queueOperation({
    resource: 'clients',
    action: 'create',
    method: 'POST',
    data: clientData
  });
  
  // Show user feedback
  alert('Client will be saved when connection is restored');
  return { success: true, queued: true };
}
```

---

## Step 5: Test with Multiple Locations

### Test Setup

1. **Open Multiple Browser Windows/Tabs**
   - Window 1: Chrome - Branch 1
   - Window 2: Firefox - Branch 2
   - Window 3: Safari - Branch 3 (or use incognito/private)

2. **Test Real-Time Updates**

   **Test 1: Client Creation**
   ```
   Window 1: Create a new client
   → Should appear instantly in Window 2 and Window 3
   ```

   **Test 2: Client Update**
   ```
   Window 2: Update client name
   → Changes should appear in Window 1 and Window 3 immediately
   ```

   **Test 3: Order Creation**
   ```
   Window 3: Create a new order
   → Should appear in Window 1 and Window 2
   ```

3. **Test Offline Functionality**

   **Test 4: Offline Queue**
   ```
   1. Open DevTools → Network tab
   2. Set to "Offline" mode
   3. Create a client
   4. Check localStorage: offline_queue
   5. Set Network back to "Online"
   6. Operation should sync automatically
   ```

4. **Test Conflict Resolution**

   **Test 5: Concurrent Edits**
   ```
   1. Window 1: Open client for editing
   2. Window 2: Edit same client simultaneously
   3. Window 1: Save changes (should succeed)
   4. Window 2: Save changes (should get 409 conflict)
   5. Window 2: Should show conflict resolution UI
   ```

### Monitoring

**Check Realtime Gateway Stats:**
```bash
curl https://your-realtime-gateway-url/stats
```

**Check Database:**
```sql
-- Check recent syncs
SELECT * FROM sync_log ORDER BY changed_at DESC LIMIT 10;

-- Check connection count
SELECT count(*) FROM pg_stat_activity;
```

---

## Troubleshooting

### Database Connection Issues

**Error: "Connection refused"**
```bash
# Check if DATABASE_URL is set correctly
echo $DATABASE_URL

# Test connection
psql "$DATABASE_URL" -c "SELECT 1;"
```

**Error: "SSL required"**
- Add `?sslmode=require` to connection string
- Or use `?sslmode=no-verify` for testing (not recommended for production)

### Realtime Gateway Issues

**WebSocket connection fails**
- Check if gateway URL is correct (use `wss://` for HTTPS sites)
- Check CORS settings on gateway
- Check firewall/security group settings

**Connection drops frequently**
- Increase ping interval in realtime-client.js
- Check gateway server resources (CPU, memory)
- Check network latency

### Frontend Issues

**Realtime updates not working**
```javascript
// Check connection status
console.log(window.realtimeClient.isConnected);

// Check subscriptions
console.log(window.realtimeClient.subscriptions);

// Manually reconnect
window.realtimeClient.disconnect();
window.realtimeClient.connect();
```

**Offline queue not syncing**
```javascript
// Check queue
console.log(window.offlineSyncQueue.getQueue());

// Manually trigger sync
await window.offlineSyncQueue.syncAll();
```

---

**Last Updated:** 2024
**Status:** Ready for Production

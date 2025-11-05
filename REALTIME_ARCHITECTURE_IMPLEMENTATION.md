# Real-Time Global Data Architecture - Implementation Guide

## Overview

This document describes the implementation of the global real-time data architecture for the Dynapharm multi-location system. All data is now stored in PostgreSQL with real-time synchronization via WebSocket.

---

## Architecture Components

### 1. **Database Layer (PostgreSQL)**

**Primary Storage:** All data is stored in PostgreSQL database with ACID guarantees.

**Location:** `backend/db_schema.sql` (original schema)
**Migrations:** `backend/db_schema_migrations.sql` (timestamps, versioning, sync tracking)

**Key Features:**
- ✅ Timestamps (`created_at`, `updated_at`, `last_synced_at`)
- ✅ Version numbers for optimistic locking
- ✅ Sync log table for change tracking
- ✅ Automatic timestamp updates via triggers

**Setup:**
```bash
# Run migrations
psql -d dynapharm -f backend/db_schema_migrations.sql
```

---

### 2. **API Layer (Serverless Functions)**

**Location:** `api/*.js`

**Migrated Endpoints:**
- ✅ `api/clients.js` - PostgreSQL-based with real-time events
- ✅ `api/orders.js` - PostgreSQL-based with real-time events
- ✅ `api/reports.js` - PostgreSQL-based with real-time events

**Database Connection:** `api/db.js`
- Connection pooling for serverless environments
- Automatic connection management
- Query helpers (`getAll`, `getById`, `insert`, `update`, `delete`)

**Realtime Publishing:** `api/realtime_publish.js`
- Publishes events to WebSocket gateway after database writes
- Non-blocking (doesn't fail main operation if publish fails)

---

### 3. **Realtime Gateway (WebSocket Server)**

**Location:** `realtime-gateway/server.js`

**Features:**
- ✅ WebSocket server for real-time updates
- ✅ Channel-based subscriptions (clients, orders, reports, etc.)
- ✅ Automatic reconnection handling
- ✅ Connection statistics endpoint

**Endpoints:**
- `GET /` - Service info
- `GET /health` - Health check
- `GET /stats` - Connection statistics
- `POST /publish` - Publish events
- `WS /ws` - WebSocket connection

**Deployment:**
```bash
cd realtime-gateway
npm install
npm start
```

**Environment Variables:**
- `PORT` - Server port (default: 8080)
- `REALTIME_GATEWAY_URL` - URL for API calls (for publish endpoint)

---

### 4. **Frontend Client Libraries**

#### **Realtime Client** (`web-modules/realtime-client.js`)

**Usage:**
```javascript
// Connect to realtime gateway
realtimeClient.connect();

// Subscribe to channels
realtimeClient.subscribe(['clients', 'orders', 'reports']);

// Handle events
realtimeClient.on('clients:created', (data, event) => {
    console.log('New client created:', data);
    // Update UI
});

realtimeClient.on('orders:updated', (data, event) => {
    console.log('Order updated:', data);
    // Refresh order list
});

// Connection callbacks
realtimeClient.onConnect(() => {
    console.log('Connected to realtime gateway');
});

realtimeClient.onDisconnect(() => {
    console.log('Disconnected from realtime gateway');
});
```

#### **Offline Sync Queue** (`web-modules/offline-sync.js`)

**Usage:**
```javascript
// Queue an operation when offline
offlineSyncQueue.queueOperation({
    resource: 'clients',
    action: 'create',
    method: 'POST',
    data: {
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '123456789'
    }
});

// Sync all queued operations (called automatically on reconnect)
await offlineSyncQueue.syncAll();

// Get queue statistics
const stats = offlineSyncQueue.getStats();
console.log(`Pending operations: ${stats.total}`);
```

---

## Integration in HTML Files

### 1. **Include the Modules**

Add to your HTML file's `<head>` or before closing `</body>`:

```html
<!-- Realtime Client -->
<script type="module" src="/web-modules/realtime-client.js"></script>

<!-- Offline Sync Queue -->
<script type="module" src="/web-modules/offline-sync.js"></script>
```

### 2. **Initialize Realtime Client**

```javascript
// Configure WebSocket URL (if different from default)
window.realtimeClient = new RealtimeClient({
    wsUrl: 'ws://your-realtime-gateway-url:8080/ws'
});

// Connect and subscribe
realtimeClient.connect();
realtimeClient.subscribe(['clients', 'orders', 'reports']);

// Handle real-time updates
realtimeClient.on('clients:created', (clientData) => {
    // Add new client to UI
    addClientToList(clientData);
});

realtimeClient.on('clients:updated', (clientData) => {
    // Update client in UI
    updateClientInList(clientData);
});

realtimeClient.on('orders:created', (orderData) => {
    // Add new order to UI
    addOrderToList(orderData);
});
```

### 3. **Use Offline Queue for API Calls**

```javascript
async function createClient(clientData) {
    if (navigator.onLine) {
        // Try direct API call
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
            console.error('API call failed, queuing for later:', error);
        }
    }
    
    // Queue for offline sync
    offlineSyncQueue.queueOperation({
        resource: 'clients',
        action: 'create',
        method: 'POST',
        data: clientData
    });
    
    // Show notification
    showNotification('Client will be saved when connection is restored');
}
```

---

## Environment Variables

### **API Endpoints (Vercel/Serverless)**

```env
DATABASE_URL=postgresql://user:password@host:port/database
REALTIME_GATEWAY_URL=http://your-realtime-gateway:8080
NODE_ENV=production
```

### **Realtime Gateway**

```env
PORT=8080
REALTIME_GATEWAY_URL=http://localhost:8080
```

---

## Database Setup

### **1. Create Database**

```bash
createdb dynapharm
```

### **2. Run Schema**

```bash
psql -d dynapharm -f backend/db_schema.sql
```

### **3. Run Migrations**

```bash
psql -d dynapharm -f backend/db_schema_migrations.sql
```

### **4. Verify**

```sql
-- Check tables
\dt

-- Check sync_log table
SELECT * FROM sync_log ORDER BY changed_at DESC LIMIT 10;

-- Check version columns
SELECT id, version, updated_at FROM clients LIMIT 5;
```

---

## Testing the Implementation

### **1. Test Database Connection**

```bash
# Test from API
curl http://localhost:3000/api/clients
```

### **2. Test Realtime Gateway**

```bash
# Start gateway
cd realtime-gateway
npm start

# Check health
curl http://localhost:8080/health

# Check stats
curl http://localhost:8080/stats
```

### **3. Test WebSocket Connection**

Open browser console and run:
```javascript
realtimeClient.connect();
realtimeClient.subscribe(['clients']);
realtimeClient.on('clients:created', (data) => {
    console.log('New client:', data);
});
```

### **4. Test Offline Queue**

```javascript
// Go offline (disable network in DevTools)
navigator.onLine = false;

// Queue an operation
offlineSyncQueue.queueOperation({
    resource: 'clients',
    action: 'create',
    method: 'POST',
    data: { fullName: 'Test Client' }
});

// Check queue
console.log(offlineSyncQueue.getStats());

// Go online
navigator.onLine = true;

// Sync will happen automatically or call manually
await offlineSyncQueue.syncAll();
```

---

## Migration Checklist

### **Phase 1: Database Setup**
- [x] Create database schema
- [x] Add timestamps and versioning
- [x] Create sync_log table
- [ ] Run migrations on production database
- [ ] Verify database connection

### **Phase 2: API Migration**
- [x] Create database connection module (`api/db.js`)
- [x] Create realtime publish helper (`api/realtime_publish.js`)
- [x] Migrate `api/clients.js`
- [x] Migrate `api/orders.js`
- [x] Migrate `api/reports.js`
- [ ] Migrate remaining API endpoints
- [ ] Test all endpoints

### **Phase 3: Realtime Gateway**
- [x] Enhance WebSocket server
- [x] Add channel subscriptions
- [x] Add connection management
- [ ] Deploy gateway to production
- [ ] Test multi-location updates

### **Phase 4: Frontend Integration**
- [x] Create realtime client library
- [x] Create offline sync queue
- [ ] Integrate into all HTML files
- [ ] Test real-time updates
- [ ] Test offline functionality

### **Phase 5: Production Deployment**
- [ ] Set up production PostgreSQL database
- [ ] Configure environment variables
- [ ] Deploy API endpoints
- [ ] Deploy realtime gateway
- [ ] Monitor performance
- [ ] Set up backups

---

## Performance Considerations

### **Database Optimization**

```sql
-- Add indexes for common queries
CREATE INDEX idx_clients_branch ON clients(branch);
CREATE INDEX idx_orders_branch_status ON orders(branch, status);
CREATE INDEX idx_reports_date_branch ON reports(date, branch);

-- Analyze tables
ANALYZE clients;
ANALYZE orders;
ANALYZE reports;
```

### **Connection Pooling**

The `api/db.js` module uses connection pooling with:
- Max 2 connections per serverless function
- 30 second idle timeout
- 5 second connection timeout

### **Realtime Gateway Scaling**

For horizontal scaling:
1. Use Redis Pub/Sub between gateway instances
2. Load balance WebSocket connections
3. Use sticky sessions for WebSocket connections

---

## Troubleshooting

### **Database Connection Errors**

```javascript
// Check if DATABASE_URL is set
console.log(process.env.DATABASE_URL);

// Test connection
const { query } = require('./api/db');
query('SELECT NOW()').then(console.log);
```

### **WebSocket Connection Issues**

```javascript
// Check WebSocket URL
console.log(realtimeClient.wsUrl);

// Check connection status
console.log(realtimeClient.isConnected);

// Manually reconnect
realtimeClient.disconnect();
realtimeClient.connect();
```

### **Offline Queue Issues**

```javascript
// Check queue
console.log(offlineSyncQueue.getQueue());

// Check if online
console.log(navigator.onLine);

// Manually sync
await offlineSyncQueue.syncAll();
```

---

## Next Steps

1. **Complete API Migration**: Migrate remaining endpoints (products, employees, stock, etc.)
2. **Add Conflict Resolution UI**: Create UI for handling version conflicts
3. **Performance Monitoring**: Add logging and monitoring
4. **Backup Strategy**: Set up automated database backups
5. **Load Testing**: Test with multiple concurrent users
6. **Documentation**: Update user documentation

---

## Support

For issues or questions:
1. Check logs in browser console
2. Check server logs
3. Verify environment variables
4. Test database connection
5. Test WebSocket connection

---

**Last Updated:** 2024
**Version:** 1.0.0


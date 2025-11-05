# Implementation Examples
## Global Real-Time Data Access

## 1. Database Connection Module

Created: `api/db.js`

This module provides:
- PostgreSQL connection pooling for serverless functions
- CRUD operations (insert, update, delete, find)
- Realtime event publishing

## 2. Migrated API Endpoint Example

Example: `api/clients-db.js` (database-first version)

**Key Changes:**
- ✅ Uses PostgreSQL instead of localStorage/JSON
- ✅ Publishes realtime events after writes
- ✅ Proper error handling
- ✅ Transaction safety

## 3. Enhanced Realtime Gateway

Update `realtime-gateway/server.js` to handle database change notifications:

```javascript
// Add PostgreSQL LISTEN/NOTIFY support
import { Pool } from 'pg';

const dbPool = new Pool({ connectionString: process.env.DATABASE_URL });

// Listen for database changes
dbPool.query('LISTEN client_changes');
dbPool.query('LISTEN order_changes');
dbPool.query('LISTEN report_changes');

// Handle notifications
dbPool.on('notification', (msg) => {
  broadcast({
    type: 'database_change',
    channel: msg.channel,
    payload: JSON.parse(msg.payload)
  });
});
```

## 4. Frontend WebSocket Client

Add to your HTML file:

```javascript
class RealtimeClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.reconnectDelay = 1000;
    this.listeners = new Map();
    this.connect();
  }

  connect() {
    this.ws = new WebSocket(this.url + '/ws');
    
    this.ws.onopen = () => {
      console.log('✅ Connected to realtime gateway');
      this.reconnectDelay = 1000;
    };
    
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'event') {
        this.handleEvent(message.event);
      }
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    this.ws.onclose = () => {
      console.log('⚠️ Disconnected, reconnecting...');
      setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    };
  }

  handleEvent(event) {
    const { type, resource, action, data } = event;
    const handlerKey = `${resource}:${action}`;
    
    // Call registered listeners
    const listeners = this.listeners.get(handlerKey) || [];
    listeners.forEach(listener => listener(data, event));
    
    // Update localStorage cache
    this.updateCache(resource, action, data);
  }

  on(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType).push(callback);
  }

  updateCache(resource, action, data) {
    const key = `dyna_${resource}`;
    try {
      const cached = JSON.parse(localStorage.getItem(key) || '[]');
      
      if (action === 'created') {
        cached.push(data);
      } else if (action === 'updated') {
        const index = cached.findIndex(item => item.id === data.id);
        if (index >= 0) cached[index] = data;
        else cached.push(data);
      } else if (action === 'deleted') {
        const filtered = cached.filter(item => item.id !== data.id);
        cached.length = 0;
        cached.push(...filtered);
      }
      
      localStorage.setItem(key, JSON.stringify(cached));
    } catch (error) {
      console.error('Cache update failed:', error);
    }
  }
}

// Usage
const realtime = new RealtimeClient('https://your-realtime-gateway.railway.app');

// Listen for client updates
realtime.on('clients:created', (client) => {
  console.log('New client created:', client);
  // Update UI
  addClientToList(client);
});

realtime.on('clients:updated', (client) => {
  console.log('Client updated:', client);
  updateClientInList(client);
});

realtime.on('orders:created', (order) => {
  console.log('New order:', order);
  refreshOrdersList();
});
```

## 5. Offline Queue Implementation

```javascript
class OfflineQueue {
  constructor() {
    this.queue = this.loadQueue();
    this.setupOnlineListener();
  }

  loadQueue() {
    try {
      return JSON.parse(localStorage.getItem('offline_queue') || '[]');
    } catch {
      return [];
    }
  }

  saveQueue() {
    localStorage.setItem('offline_queue', JSON.stringify(this.queue));
  }

  add(resource, action, data) {
    const item = {
      id: Date.now() + Math.random(),
      resource,
      action,
      data,
      timestamp: Date.now(),
    };
    this.queue.push(item);
    this.saveQueue();
    return item.id;
  }

  async sync() {
    if (!navigator.onLine || this.queue.length === 0) {
      return;
    }

    const items = [...this.queue];
    this.queue = [];
    this.saveQueue();

    for (const item of items) {
      try {
        await fetch(`/api/${item.resource}`, {
          method: item.action === 'created' ? 'POST' : 
                  item.action === 'updated' ? 'PUT' : 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.data),
        });
        console.log(`✅ Synced ${item.resource}:${item.action}`);
      } catch (error) {
        console.error(`❌ Sync failed for ${item.resource}:${item.action}`, error);
        // Re-add to queue if it fails
        this.queue.push(item);
        this.saveQueue();
        break; // Stop on first failure
      }
    }
  }

  setupOnlineListener() {
    window.addEventListener('online', () => {
      console.log('🌐 Back online, syncing queue...');
      this.sync();
    });
  }
}

// Usage
const offlineQueue = new OfflineQueue();

// Wrap API calls
async function createClient(clientData) {
  if (!navigator.onLine) {
    offlineQueue.add('clients', 'created', clientData);
    showNotification('Offline: Changes will sync when connection is restored');
    return { success: true, offline: true };
  }

  try {
    const response = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clientData),
    });
    return await response.json();
  } catch (error) {
    // If request fails, add to queue
    offlineQueue.add('clients', 'created', clientData);
    throw error;
  }
}
```

## 6. Database Schema Updates

Add to `backend/db_schema.sql`:

```sql
-- Add version and sync tracking to existing tables
ALTER TABLE clients 
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE orders 
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE reports 
  ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create sync log table
CREATE TABLE IF NOT EXISTS sync_log (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(50) NOT NULL,
    record_id VARCHAR(50) NOT NULL,
    action VARCHAR(20) NOT NULL,
    changed_by VARCHAR(50),
    branch_id VARCHAR(50),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data JSONB
);

CREATE INDEX idx_sync_log_changed_at ON sync_log(changed_at);
CREATE INDEX idx_sync_log_table_record ON sync_log(table_name, record_id);

-- Create function to notify on changes (PostgreSQL NOTIFY)
CREATE OR REPLACE FUNCTION notify_change()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify(
    TG_TABLE_NAME || '_changes',
    json_build_object(
      'action', TG_OP,
      'id', NEW.id,
      'data', row_to_json(NEW)
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers to tables
CREATE TRIGGER clients_notify AFTER INSERT OR UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION notify_change();

CREATE TRIGGER orders_notify AFTER INSERT OR UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_change();

CREATE TRIGGER reports_notify AFTER INSERT OR UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION notify_change();
```

## 7. Migration Checklist

### Step 1: Database Setup
- [ ] Provision cloud PostgreSQL (Railway/Supabase/Neon)
- [ ] Set `DATABASE_URL` environment variable
- [ ] Run enhanced `db_schema.sql` with triggers
- [ ] Test connection from backend

### Step 2: API Migration
- [ ] Install `pg` package: `npm install pg`
- [ ] Create `api/db.js` (database helper)
- [ ] Migrate `api/clients.js` → use `api/db.js`
- [ ] Migrate `api/orders.js` → use `api/db.js`
- [ ] Migrate `api/reports.js` → use `api/db.js`
- [ ] Test all endpoints

### Step 3: Realtime Gateway
- [ ] Deploy `realtime-gateway` to Railway/Render
- [ ] Set `REALTIME_GATEWAY_URL` in API env
- [ ] Add PostgreSQL LISTEN support to gateway
- [ ] Test WebSocket connections

### Step 4: Frontend Integration
- [ ] Add RealtimeClient class to HTML
- [ ] Add OfflineQueue class to HTML
- [ ] Replace localStorage direct writes with API calls
- [ ] Add WebSocket connection on page load
- [ ] Test real-time updates

### Step 5: Testing
- [ ] Test from multiple browser tabs (simulate locations)
- [ ] Test offline → online sync
- [ ] Test conflict scenarios
- [ ] Load test with 10+ concurrent users

## Next Steps

1. Start with Step 1: Set up cloud PostgreSQL
2. Migrate one API endpoint as proof of concept
3. Test end-to-end data flow
4. Gradually migrate remaining endpoints
5. Deploy and monitor

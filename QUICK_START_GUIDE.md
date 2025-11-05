# Quick Start Guide: Global Real-Time Data Access

## Summary

Your system currently uses **localStorage** (browser-only) and **JSON files** (cloud sync) as primary storage. For a **global multi-location system**, you need:

✅ **PostgreSQL Database** as primary storage
✅ **Real-time synchronization** across all locations
✅ **Offline support** with automatic sync

---

## Step-by-Step Implementation

### Step 1: Set Up Cloud PostgreSQL (30 minutes)

Choose a provider:
- **Railway** (easiest): https://railway.app
- **Supabase** (free tier): https://supabase.com
- **Neon** (serverless): https://neon.tech

**After creating database:**
1. Copy the connection string (DATABASE_URL)
2. Add to environment variables:
   - Vercel: Project Settings → Environment Variables
   - Backend: `.env` file or Railway/env vars

**Initialize schema:**
```bash
psql $DATABASE_URL < backend/db_schema.sql
```

Or use the enhanced schema with triggers (see `IMPLEMENTATION_EXAMPLES.md`)

### Step 2: Install Dependencies (5 minutes)

**For API endpoints:**
```bash
cd /Users/moseswalker/Downloads/dynapharm-namibia-health-3
npm install pg
```

**For realtime gateway:**
```bash
cd realtime-gateway
npm install pg
```

### Step 3: Update Realtime Gateway (15 minutes)

The gateway (`realtime-gateway/server.js`) already exists. Add PostgreSQL LISTEN support:

```javascript
import { Pool } from 'pg';

const dbPool = new Pool({ connectionString: process.env.DATABASE_URL });

// Listen for database changes
dbPool.query('LISTEN clients_changes');
dbPool.query('LISTEN orders_changes');
dbPool.query('LISTEN reports_changes');

dbPool.on('notification', (msg) => {
  broadcast({
    type: 'event',
    event: JSON.parse(msg.payload)
  });
});
```

### Step 4: Migrate One API Endpoint (30 minutes)

**Test with `api/clients.js`:**

1. Backup current file: `cp api/clients.js api/clients-old.js`
2. Update to use `api/db.js`:

```javascript
import { findAll, findById, insert, update, remove, publishRealtimeEvent } from './db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { id } = req.query || {};
      if (id) {
        const client = await findById('clients', id);
        return res.status(200).json(client || { error: 'Not found' });
      }
      const clients = await findAll('clients');
      return res.status(200).json(clients);
    }

    if (req.method === 'POST') {
      const newClient = await insert('clients', req.body);
      await publishRealtimeEvent('clients', 'created', newClient);
      return res.status(201).json({ success: true, client: newClient });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
```

3. Test locally with `vercel dev`
4. Deploy and test

### Step 5: Add Frontend WebSocket Client (30 minutes)

Add to your main HTML file (before closing `</body>`):

```javascript
<script>
// Realtime Client
class RealtimeClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.listeners = new Map();
    this.connect();
  }

  connect() {
    const wsUrl = this.url.replace('http', 'ws') + '/ws';
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onopen = () => console.log('✅ Realtime connected');
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'event') this.handleEvent(msg.event);
    };
    this.ws.onclose = () => {
      setTimeout(() => this.connect(), 3000);
    };
  }

  handleEvent(event) {
    const { resource, action, data } = event;
    const key = `${resource}:${action}`;
    (this.listeners.get(key) || []).forEach(fn => fn(data));
    this.updateCache(resource, action, data);
  }

  on(eventType, callback) {
    if (!this.listeners.has(eventType)) this.listeners.set(eventType, []);
    this.listeners.get(eventType).push(callback);
  }

  updateCache(resource, action, data) {
    const key = `dyna_${resource}`;
    try {
      let cached = JSON.parse(localStorage.getItem(key) || '[]');
      if (action === 'created') cached.push(data);
      else if (action === 'updated') {
        const idx = cached.findIndex(i => i.id === data.id);
        if (idx >= 0) cached[idx] = data; else cached.push(data);
      } else if (action === 'deleted') {
        cached = cached.filter(i => i.id !== data.id);
      }
      localStorage.setItem(key, JSON.stringify(cached));
    } catch (e) {}
  }
}

// Initialize
const realtime = new RealtimeClient('https://your-realtime-gateway.railway.app');

// Listen for updates
realtime.on('clients:created', (client) => {
  console.log('New client:', client);
  // Update your UI here
  if (window.updateClientsList) window.updateClientsList();
});

realtime.on('clients:updated', (client) => {
  console.log('Client updated:', client);
  if (window.refreshClients) window.refreshClients();
});
</script>
```

### Step 6: Update Frontend API Calls (1 hour)

Replace direct localStorage writes with API calls:

**Before:**
```javascript
const clients = JSON.parse(localStorage.getItem('dyna_clients') || '[]');
clients.push(newClient);
localStorage.setItem('dyna_clients', JSON.stringify(clients));
```

**After:**
```javascript
const response = await fetch('/api/clients', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(newClient)
});
const result = await response.json();
// Realtime will update localStorage automatically via WebSocket
```

---

## Testing Checklist

- [ ] Database connection works
- [ ] Can create client via API
- [ ] Client appears in database
- [ ] Realtime gateway receives event
- [ ] Other browser tabs see update automatically
- [ ] localStorage cache updates
- [ ] Works from different devices/locations

---

## Troubleshooting

**Database connection fails:**
- Check DATABASE_URL format
- Verify SSL settings for production
- Check firewall/network access

**Realtime not working:**
- Check WebSocket URL (ws:// or wss://)
- Verify gateway is deployed and running
- Check browser console for errors

**Data not syncing:**
- Verify API calls succeed (check Network tab)
- Check realtime gateway logs
- Verify WebSocket connection is active

---

## Next Steps After Setup

1. Migrate remaining API endpoints (`orders`, `reports`, etc.)
2. Add offline queue support (see `IMPLEMENTATION_EXAMPLES.md`)
3. Implement conflict resolution
4. Add monitoring and logging
5. Load test with multiple locations

---

## Key Files Created

- `api/db.js` - Database helper module
- `IMPLEMENTATION_EXAMPLES.md` - Detailed code examples
- `GLOBAL_DATA_ARCHITECTURE.md` - Architecture overview
- `QUICK_START_GUIDE.md` - This file

---

## Support

See `IMPLEMENTATION_EXAMPLES.md` for:
- Complete code examples
- Offline queue implementation
- Conflict resolution strategies
- Database schema enhancements

# Global Real-Time Data Architecture
## Dynapharm Multi-Location System

## Executive Summary

For a **global multi-location system**, data must be:
- ✅ **Immediately accessible** to all locations
- ✅ **Safely stored** with ACID guarantees  
- ✅ **Real-time synchronized** across branches
- ✅ **Conflict-resolved** for concurrent edits
- ✅ **Offline-capable** with sync on reconnect

**PRIMARY STORAGE: PostgreSQL Database (Mandatory)**

---

## Current Problems

1. **localStorage** - Browser-only, no cross-location sharing
2. **JSON Files** - Race conditions, no transactions
3. **In-Memory APIs** - Data lost on restart
4. **Multiple Storage Layers** - Causes inconsistency

---

## Recommended Architecture

```
┌─────────────────────────────────────┐
│   POSTGRESQL DATABASE               │
│   (Single Source of Truth)          │
└──────────────┬──────────────────────┘
               │
    ┌──────────┼──────────┐
    │          │          │
┌───▼───┐ ┌───▼───┐ ┌───▼───┐
│Backend│ │Realtime│ │  API  │
│ (Py)  │ │Gateway │ │ Layer │
└───┬───┘ └───┬───┘ └───┬───┘
    │          │          │
    └──────────┴──────────┘
               │
    ┌──────────┼──────────┐
┌───▼───┐ ┌───▼───┐ ┌───▼───┐
│Branch1│ │Branch2│ │Branch3│
│Frontend│ │Frontend│ │Frontend│
└───────┘ └───────┘ └───────┘
```

---

## Core Principles

1. **Database-First**: All writes → PostgreSQL, all reads → PostgreSQL
2. **Real-Time**: WebSocket broadcasts changes instantly
3. **Offline Support**: localStorage queue syncs on reconnect
4. **Conflict Resolution**: Last-write-wins with timestamps

---

## Implementation Phases

### Phase 1: Database-First API (3-5 days)
- Update all API endpoints to use PostgreSQL
- Remove in-memory/JSON storage
- Test all endpoints

### Phase 2: Real-Time Updates (2-3 days)
- Enhance WebSocket gateway
- Publish events after DB writes
- Frontend WebSocket client

### Phase 3: Offline Support (3-4 days)
- Offline queue in localStorage
- Sync on reconnect
- Conflict resolution

---

## Key Implementation Details

### Database Connection (Serverless)
```javascript
import { Pool } from 'pg';
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2
});
```

### Real-Time Publishing
```javascript
// After DB write
await fetch(REALTIME_GATEWAY_URL + '/publish', {
  method: 'POST',
  body: JSON.stringify({ event: {...} })
});
```

### Frontend WebSocket
```javascript
const ws = new WebSocket(REALTIME_GATEWAY_URL + '/ws');
ws.onmessage = (event) => {
  updateUI(JSON.parse(event.data));
};
```

---

## Migration Checklist

- [ ] Provision cloud PostgreSQL (Railway/Supabase/Neon)
- [ ] Run db_schema.sql
- [ ] Add timestamps/versioning to tables
- [ ] Migrate backend APIs to PostgreSQL
- [ ] Migrate Vercel APIs to PostgreSQL  
- [ ] Enhance realtime gateway
- [ ] Add WebSocket client to frontend
- [ ] Implement offline queue
- [ ] Add conflict resolution
- [ ] Test multi-location scenarios

---

## Benefits

✅ Immediate access across locations
✅ ACID transactions guarantee safety
✅ Real-time updates (< 100ms)
✅ Offline capability
✅ Scalable to 100+ locations

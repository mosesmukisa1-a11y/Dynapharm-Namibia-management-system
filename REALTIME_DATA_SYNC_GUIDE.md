# Real-Time Data Sync Guide

This guide explains how all data is now saved to the backend database for real-time availability across all users and locations.

## Overview

All data inputs now follow a **backend-first** approach:
1. **PRIMARY**: Save to backend database (available to all users)
2. **FALLBACK**: Save to local storage (only if backend unavailable)
3. **CACHE**: Local storage is used as a cache for offline access

## Database Migrations

### Running Migrations

```bash
# Set your database URL
export DATABASE_URL="postgresql://user:password@host:port/database"

# Run migrations
node migrations/run-migrations.js
```

### Migration Files

1. **001_add_agreement_data.sql** - Adds `agreement_data` column to distributors table
2. **002_create_shared_tables.sql** - Creates tables for:
   - Clients
   - Appointments
   - Stock Requests
   - Visits
   - Campaigns
   - Finance Cash Requests
   - Leave Requests

## API Endpoints

### Distributors
- `GET /api/distributors` - Get all distributors
- `POST /api/distributors` - Create distributor(s) (bulk supported)
- `PUT /api/distributors` - Update distributor
- `DELETE /api/distributors?id=...` - Delete distributor

### Clients
- `GET /api/clients` - Get all clients
- `GET /api/clients?branch=...` - Get clients by branch
- `GET /api/clients?search=...` - Search clients
- `POST /api/clients` - Create client(s) (bulk supported)
- `PUT /api/clients` - Update client
- `DELETE /api/clients?id=...` - Delete client

### Appointments
- `GET /api/appointments` - Get all appointments
- `GET /api/appointments?branch=...` - Get appointments by branch
- `GET /api/appointments?date=...` - Get appointments by date
- `GET /api/appointments?status=...` - Get appointments by status
- `POST /api/appointments` - Create appointment(s) (bulk supported)
- `PUT /api/appointments` - Update appointment
- `DELETE /api/appointments?id=...` - Delete appointment

### Stock Requests
- `GET /api/stock-requests` - Get all stock requests
- `GET /api/stock-requests?branch=...` - Get requests by branch
- `GET /api/stock-requests?status=...` - Get requests by status
- `POST /api/stock-requests` - Create request(s) (bulk supported)
- `PUT /api/stock-requests` - Update request
- `DELETE /api/stock-requests?id=...` - Delete request

## Data Flow

### Saving Data

```javascript
// Example: Saving a client
try {
  // PRIMARY: Save to backend
  const response = await fetch('/api/clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(clientData)
  });
  
  if (response.ok) {
    // Success - data available to all users
    const saved = await response.json();
    
    // Update local cache
    updateLocalCache(saved);
  }
} catch (error) {
  // FALLBACK: Save locally if backend unavailable
  saveToLocalStorage(clientData);
  showWarning('Saved locally only - not visible to other users');
}
```

### Loading Data

```javascript
// Example: Loading clients
async function loadClients() {
  try {
    // PRIMARY: Load from backend
    const response = await fetch('/api/clients');
    if (response.ok) {
      const clients = await response.json();
      
      // Update local cache
      updateLocalCache(clients);
      
      return clients;
    }
  } catch (error) {
    // FALLBACK: Load from local cache
    return loadFromLocalStorage();
  }
}
```

## Real-Time Updates

All API endpoints publish real-time events when data changes:
- `clients:create` - New client created
- `clients:update` - Client updated
- `clients:delete` - Client deleted
- `appointments:create` - New appointment created
- `appointments:update` - Appointment updated
- `distributors:create` - New distributor created
- `stock_requests:create` - New stock request created

These events are broadcast to all connected users via the realtime gateway.

## Benefits

1. **Real-Time Sync**: All users see updates immediately
2. **Multi-Location**: Data available across all branches
3. **Offline Support**: Local cache for offline access
4. **Data Integrity**: Single source of truth in database
5. **Scalability**: Database handles large datasets efficiently

## Troubleshooting

### Data Not Syncing

1. Check database connection: `DATABASE_URL` environment variable
2. Verify migrations ran: Check `schema_migrations` table
3. Check API logs for errors
4. Verify CORS headers are set correctly

### Local Storage Full

If local storage quota is exceeded:
1. Clear old cached data
2. Increase backend reliability
3. Implement data cleanup policies

### Backend Unavailable

When backend is unavailable:
- Data saves to local storage as fallback
- Warning message shown to user
- Data will sync when backend is available
- Manual sync option available

## Next Steps

1. Run database migrations
2. Test API endpoints
3. Update frontend to use backend-first approach
4. Monitor real-time events
5. Set up database backups



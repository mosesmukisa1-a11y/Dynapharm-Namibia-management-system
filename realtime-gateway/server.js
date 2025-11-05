import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { Pool } from 'pg';

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));

const server = app.listen(process.env.PORT || 8080, () => {
  console.log('✅ Realtime gateway listening on port', server.address().port);
});

const wss = new WebSocketServer({ server, path: '/ws' });

// Track connected clients and their subscriptions
const clients = new Map();

// PostgreSQL connection for LISTEN/NOTIFY
let dbPool = null;
if (process.env.DATABASE_URL) {
  try {
    dbPool = new Pool({ connectionString: process.env.DATABASE_URL });
    
    // Listen for database changes
    dbPool.query('LISTEN clients_changes').catch(err => console.error('Failed to listen clients_changes:', err));
    dbPool.query('LISTEN orders_changes').catch(err => console.error('Failed to listen orders_changes:', err));
    dbPool.query('LISTEN reports_changes').catch(err => console.error('Failed to listen reports_changes:', err));
    dbPool.query('LISTEN products_changes').catch(err => console.error('Failed to listen products_changes:', err));
    
    // Handle notifications
    dbPool.on('notification', (msg) => {
      try {
        const payload = JSON.parse(msg.payload);
        const resource = payload.table.replace('_changes', '');
        const action = payload.action.toLowerCase();
        
        const eventData = {
          type: `${resource}:${action}`,
          resource,
          action,
          data: payload.data,
          timestamp: Date.now(),
        };
        
        // Broadcast to subscribed clients
        broadcast({ type: 'event', ...eventData }, resource);
      } catch (error) {
        console.error('Error processing notification:', error);
      }
    });
    
    dbPool.on('error', (err) => {
      console.error('Database pool error:', err);
    });
    
    console.log('✅ PostgreSQL LISTEN configured');
  } catch (error) {
    console.error('❌ Failed to connect to PostgreSQL:', error.message);
  }
} else {
  console.log('⚠️  DATABASE_URL not set, PostgreSQL LISTEN disabled');
}

// Broadcast to all connected clients
function broadcast(data, channel = null) {
  const msg = typeof data === 'string' ? data : JSON.stringify(data);
  let sentCount = 0;
  
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      // If channel specified, only send to clients subscribed to that channel
      if (channel) {
        const clientSubs = clients.get(client);
        if (clientSubs && clientSubs.has(channel)) {
          try { 
            client.send(msg);
            sentCount++;
          } catch (_) {}
        }
      } else {
        // Broadcast to all clients
        try { 
          client.send(msg);
          sentCount++;
        } catch (_) {}
      }
    }
  });
  
  if (channel) {
    console.log(`📡 Broadcasted to ${sentCount} clients on channel: ${channel}`);
  } else {
    console.log(`📡 Broadcasted to ${sentCount} clients`);
  }
}

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  const clientId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  clients.set(ws, new Set());
  
  console.log(`🔌 Client connected: ${clientId} (Total: ${wss.clients.size})`);
  
  // Send welcome message
  try {
    ws.send(JSON.stringify({ 
      type: 'hello', 
      clientId,
      timestamp: Date.now(),
      message: 'Connected to Dynapharm Realtime Gateway'
    }));
  } catch (_) {}
  
  // Handle incoming messages from client
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      // Handle subscription requests
      if (data.type === 'subscribe') {
        const channels = Array.isArray(data.channels) ? data.channels : [data.channels].filter(Boolean);
        const clientSubs = clients.get(ws);
        channels.forEach(channel => {
          if (channel) {
            clientSubs.add(channel);
            console.log(`📥 Client ${clientId} subscribed to: ${channel}`);
          }
        });
        
        ws.send(JSON.stringify({ 
          type: 'subscribed', 
          channels: Array.from(clientSubs),
          timestamp: Date.now()
        }));
      }
      
      // Handle unsubscribe requests
      if (data.type === 'unsubscribe') {
        const channels = Array.isArray(data.channels) ? data.channels : [data.channels].filter(Boolean);
        const clientSubs = clients.get(ws);
        channels.forEach(channel => {
          clientSubs.delete(channel);
          console.log(`📤 Client ${clientId} unsubscribed from: ${channel}`);
        });
        
        ws.send(JSON.stringify({ 
          type: 'unsubscribed', 
          channels: Array.from(clientSubs),
          timestamp: Date.now()
        }));
      }
      
      // Handle ping
      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
    } catch (error) {
      console.error('Error handling client message:', error);
    }
  });
  
  // Handle client disconnect
  ws.on('close', () => {
    clients.delete(ws);
    console.log(`🔌 Client disconnected: ${clientId} (Total: ${wss.clients.size})`);
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error(`❌ WebSocket error for client ${clientId}:`, error);
    clients.delete(ws);
  });
});

// Health check endpoint
app.get('/', (req, res) => res.json({ 
  service: 'dynapharm-realtime-gateway', 
  status: 'running',
  connectedClients: wss.clients.size,
  db_connected: !!dbPool,
  endpoints: ['/health', '/publish', '/ws'],
  timestamp: Date.now()
}));

app.get('/health', (req, res) => res.json({ 
  status: 'ok',
  connectedClients: wss.clients.size,
  db_connected: !!dbPool,
  timestamp: Date.now()
}));

// Publish event endpoint
app.post('/publish', (req, res) => {
  try {
    const { event = {}, events = [] } = req.body || {};
    
    // Handle single event
    if (event.type || event.resource) {
      const channel = event.resource || event.channel || 'global';
      const eventData = {
        type: event.type || `${event.resource}:${event.action}`,
        resource: event.resource,
        action: event.action,
        data: event.data,
        branchId: event.branchId,
        timestamp: event.timestamp || Date.now(),
      };
      
      broadcast({ type: 'event', ...eventData }, channel);
      return res.json({ success: true, channel, clients: wss.clients.size });
    }
    
    // Handle batch events
    if (events.length > 0) {
      events.forEach(eventItem => {
        const channel = eventItem.resource || eventItem.channel || 'global';
        const eventData = {
          type: eventItem.type || `${eventItem.resource}:${eventItem.action}`,
          resource: eventItem.resource,
          action: eventItem.action,
          data: eventItem.data,
          branchId: eventItem.branchId,
          timestamp: eventItem.timestamp || Date.now(),
        };
        broadcast({ type: 'event', ...eventData }, channel);
      });
      return res.json({ success: true, events: events.length, clients: wss.clients.size });
    }
    
    res.status(400).json({ error: 'No event data provided' });
  } catch (e) {
    console.error('Publish error:', e);
    res.status(500).json({ error: e.message || 'publish failed' });
  }
});

// Get connection stats
app.get('/stats', (req, res) => {
  const stats = {
    connectedClients: wss.clients.size,
    totalSubscriptions: Array.from(clients.values()).reduce((sum, subs) => sum + subs.size, 0),
    timestamp: Date.now()
  };
  res.json(stats);
});



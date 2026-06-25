/**
 * GET /api/stock/events
 * Server-Sent Events stream for real-time stock push notifications.
 *
 * The frontend's useStockRealtime hook connects here via EventSource.
 * Every stock-mutating endpoint (sale, dispense, transfer, write-off)
 * calls broadcastStockEvent() from api/services/stockEvents.js, which
 * writes to every connected client immediately.
 *
 * No external gateway or WebSocket service required.
 */
import { addSseClient, removeSseClient } from '../services/stockEvents.js';

export default function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).end();
  }
  if (req.method !== 'GET') return res.status(405).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  res.write('data: {"type":"connected"}\n\n');

  addSseClient(res);

  // Heartbeat every 20 s keeps the connection alive through Replit's proxy
  const hb = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(hb);
      removeSseClient(res);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(hb);
    removeSseClient(res);
  });
}

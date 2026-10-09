/**
 * In-process SSE client registry.
 * ESM modules are singletons per Node.js process, so this Set is shared
 * across every file that imports it — including the SSE endpoint handler
 * and every stock-mutating endpoint (walkin-sales, dispense, transfers).
 */
import { deferUntilCommit } from '../db.js';
const clients = new Set();

export function addSseClient(res) {
  clients.delete(res);
  clients.add(res);
}

export function removeSseClient(res) {
  clients.delete(res);
}

export function broadcastStockEvent(type = 'stock_change', payload = {}) {
  if (deferUntilCommit(() => broadcastStockEvent(type, payload))) return;
  if (clients.size === 0) return;
  const line = `data: ${JSON.stringify({ type, payload, timestamp: Date.now() })}\n\n`;
  const dead = [];
  for (const res of clients) {
    try {
      res.write(line);
    } catch {
      dead.push(res);
    }
  }
  dead.forEach(r => clients.delete(r));
}

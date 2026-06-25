/**
 * useStockRealtime — live stock push via SSE (/api/stock/events).
 *
 * The backend broadcasts an SSE event immediately after every stock mutation:
 * branch sale, dispense, transfer create/update/delete, warehouse receive,
 * country-stock release, write-off, etc.
 *
 * Falls back to WebSocket gateway if VITE_REALTIME_GATEWAY_URL is set.
 * Polls /api/stock/realtime once on mount and after every push event.
 *
 * Usage:
 *   const { connected } = useStockRealtime({ onUpdate });
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';

const GATEWAY_URL   = import.meta.env.VITE_REALTIME_GATEWAY_URL || null;
const RECONNECT_MS  = 3000;
const HEARTBEAT_MS  = 45000; // reconnect if no message for 45 s

export function useStockRealtime({ onUpdate, enabled = true } = {}) {
  const [connected, setConnected]     = useState(false);
  const [lastEvent, setLastEvent]     = useState(null);
  const [stockSummary, setStockSummary] = useState(null);
  const esRef            = useRef(null);
  const wsRef            = useRef(null);
  const mountedRef       = useRef(true);
  const debounceRef      = useRef(null);
  const heartbeatRef     = useRef(null);
  const reconnectRef     = useRef(null);

  const fetchSummary = useCallback(() => {
    if (!mountedRef.current) return;
    api.stock.realtime()
      .then(d => { if (mountedRef.current && d?.success) setStockSummary(d); })
      .catch(() => {});
  }, []);

  const debouncedUpdate = useCallback((evt) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      setLastEvent(evt);
      fetchSummary();
      if (typeof onUpdate === 'function') onUpdate(evt);
    }, 200);
  }, [fetchSummary, onUpdate]);

  // ── SSE (primary — no external service needed) ─────────────────────────────
  const connectSSE = useCallback(() => {
    if (!enabled || !mountedRef.current) return;
    if (esRef.current) { esRef.current.close(); esRef.current = null; }

    const url = '/api/stock/events';
    let es;
    try {
      es = new EventSource(url);
    } catch {
      return;
    }
    esRef.current = es;

    const resetHeartbeat = () => {
      if (heartbeatRef.current) clearTimeout(heartbeatRef.current);
      heartbeatRef.current = setTimeout(() => {
        // No message for too long — reconnect
        if (mountedRef.current) {
          es.close();
          reconnectRef.current = setTimeout(connectSSE, RECONNECT_MS);
        }
      }, HEARTBEAT_MS);
    };

    es.onopen = () => {
      if (!mountedRef.current) { es.close(); return; }
      setConnected(true);
      resetHeartbeat();
    };

    es.onmessage = (e) => {
      if (!mountedRef.current) return;
      resetHeartbeat();
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'connected') return;          // initial handshake
        debouncedUpdate(msg);
      } catch {}
    };

    es.onerror = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      es.close();
      esRef.current = null;
      if (heartbeatRef.current) clearTimeout(heartbeatRef.current);
      reconnectRef.current = setTimeout(connectSSE, RECONNECT_MS);
    };
  }, [enabled, debouncedUpdate]);

  // ── WebSocket fallback (only when external gateway is configured) ──────────
  const connectWS = useCallback(() => {
    if (!GATEWAY_URL || !enabled || !mountedRef.current) return;
    if (wsRef.current && wsRef.current.readyState <= 1) return;

    const wsUrl = (GATEWAY_URL.startsWith('https://')
      ? 'wss://' + GATEWAY_URL.slice(8)
      : 'ws://'  + GATEWAY_URL.replace(/^http:\/\//, '')) + '/ws';

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }
        ws.send(JSON.stringify({ type: 'subscribe', channels: ['stock', 'stock_movements', 'inventory_balances'] }));
      };
      ws.onmessage = (e) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'event') {
            const r = msg.resource || '';
            if (r === 'stock' || r === 'stock_movements' || r === 'inventory_balances' || msg.channel === 'stock') {
              debouncedUpdate(msg);
            }
          }
        } catch {}
      };
      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        setTimeout(connectWS, 5000);
      };
      ws.onerror = () => ws.close();
    } catch {}
  }, [enabled, debouncedUpdate]);

  useEffect(() => {
    mountedRef.current = true;
    fetchSummary();

    if (enabled) {
      // SSE is always available (no env var needed)
      connectSSE();
      // WebSocket is bonus layer if gateway is configured
      if (GATEWAY_URL) connectWS();
    }

    return () => {
      mountedRef.current = false;
      if (debounceRef.current)  clearTimeout(debounceRef.current);
      if (heartbeatRef.current) clearTimeout(heartbeatRef.current);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (esRef.current)  { esRef.current.close();  esRef.current  = null; }
      if (wsRef.current)  { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    };
  }, [enabled]);

  return { connected, lastEvent, stockSummary, refetch: fetchSummary };
}

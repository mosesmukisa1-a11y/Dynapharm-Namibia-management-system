/**
 * useStockRealtime - React hook for live stock data via WebSocket gateway.
 *
 * Connects to the realtime gateway, subscribes to the 'stock' channel,
 * and calls the provided `onUpdate` callback whenever a stock event arrives.
 * Also re-fetches summary data from /api/stock/realtime after each event.
 *
 * Usage:
 *   const { connected, lastEvent, stockSummary } = useStockRealtime({ onUpdate });
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';

const GATEWAY_URL = import.meta.env.VITE_REALTIME_GATEWAY_URL || null;
const RECONNECT_DELAY = 5000;
const MAX_RECONNECT_ATTEMPTS = 10;

export function useStockRealtime({ onUpdate, enabled = true } = {}) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const [stockSummary, setStockSummary] = useState(null);
  const wsRef = useRef(null);
  const attemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const debounceRef = useRef(null);

  const fetchSummary = useCallback(() => {
    if (!mountedRef.current) return;
    api.stock.realtime()
      .then(d => { if (mountedRef.current && d && d.success) setStockSummary(d); })
      .catch(() => {});
  }, []);

  const debouncedFetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchSummary, 800);
  }, [fetchSummary]);

  const connect = useCallback(() => {
    if (!GATEWAY_URL || !enabled || !mountedRef.current) return;
    if (wsRef.current && wsRef.current.readyState <= 1) return;

    const wsUrl = (GATEWAY_URL.startsWith('https://') ? 'wss://' + GATEWAY_URL.slice(8) : 'ws://' + GATEWAY_URL.replace(/^http:\/\//, '')) + '/ws';

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }
        attemptsRef.current = 0;
        setConnected(true);
        ws.send(JSON.stringify({ type: 'subscribe', channels: ['stock', 'stock_movements', 'inventory_balances'] }));
        console.log('[StockRealtime] Connected and subscribed to stock channels');
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'event') {
            const resource = msg.resource || '';
            const isStock = resource === 'stock' || resource === 'stock_movements' || resource === 'inventory_balances' || msg.channel === 'stock';
            if (isStock) {
              setLastEvent(msg);
              debouncedFetch();
              if (typeof onUpdate === 'function') onUpdate(msg);
            }
          }
        } catch {}
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        // Reconnect with backoff
        if (attemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          attemptsRef.current++;
          reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (err) {
      console.warn('[StockRealtime] WebSocket connection failed:', err.message);
    }
  }, [enabled, debouncedFetch, onUpdate]);

  useEffect(() => {
    mountedRef.current = true;
    fetchSummary();

    if (GATEWAY_URL && enabled) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [enabled]);

  return { connected, lastEvent, stockSummary, refetch: fetchSummary };
}

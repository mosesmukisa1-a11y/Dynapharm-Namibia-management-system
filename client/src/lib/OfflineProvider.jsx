import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { getAll, remove, markFailed, getCount } from './offlineQueue.js';

const OfflineContext = createContext({
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  syncNow: () => {},
  lastSyncAt: null,
  lastSyncResult: null,
});

export function useOffline() {
  return useContext(OfflineContext);
}

async function replayOperation(op) {
  const res = await fetch(op.url, {
    method: op.method || 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ...op.body, offline_id: op.offlineId }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (data.duplicate) return { ok: true, duplicate: true };
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function OfflineProvider({ children }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [lastSyncResult, setLastSyncResult] = useState(null);
  const syncingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    try {
      const count = await getCount();
      setPendingCount(count);
    } catch (_) {}
  }, []);

  const syncNow = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;
    setIsSyncing(true);

    let succeeded = 0;
    let failed = 0;
    let duplicates = 0;

    try {
      const pending = await getAll();

      for (const op of pending) {
        try {
          const result = await replayOperation(op);
          if (result.duplicate) {
            duplicates++;
          } else {
            succeeded++;
          }
          await remove(op.localId);
        } catch (err) {
          console.warn('[OfflineSync] Failed to replay operation:', op.label, err.message);
          await markFailed(op.localId);
          failed++;
        }
      }

      setLastSyncAt(Date.now());
      setLastSyncResult({ succeeded, failed, duplicates, total: pending.length });
    } catch (err) {
      console.error('[OfflineSync] Sync error:', err);
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
      await refreshCount();
    }
  }, [refreshCount]);

  useEffect(() => {
    // On mount: load pending count and auto-sync if already online with queued items
    (async () => {
      try {
        const count = await getCount();
        setPendingCount(count);
        if (navigator.onLine && count > 0) {
          // App was re-opened while online — the 'online' event won't fire, so sync now
          setTimeout(syncNow, 2000);
        }
      } catch (_) {}
    })();

    const handleOnline = () => {
      setIsOnline(true);
      setTimeout(syncNow, 1500);
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const interval = setInterval(refreshCount, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [syncNow, refreshCount]);

  return (
    <OfflineContext.Provider value={{ isOnline, isSyncing, pendingCount, syncNow, lastSyncAt, lastSyncResult }}>
      {children}
    </OfflineContext.Provider>
  );
}

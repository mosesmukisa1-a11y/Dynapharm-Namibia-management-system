import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { getPendingOnly, remove, markFailed, getCount, getFailedCount, clearFailed } from './offlineQueue.js';

const OfflineContext = createContext({
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  failedCount: 0,
  syncNow: () => {},
  clearFailed: () => {},
  lastSyncAt: null,
  lastSyncResult: null,
  authRequired: false,
});

export function useOffline() {
  return useContext(OfflineContext);
}

export function OfflineProvider({ children }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [lastSyncResult, setLastSyncResult] = useState(null);
  const [authRequired, setAuthRequired] = useState(false);
  const syncingRef = useRef(false);
  const syncAgainRef = useRef(false);

  const refreshCounts = useCallback(async () => {
    try {
      const [pending, failed] = await Promise.all([getCount(), getFailedCount()]);
      setPendingCount(pending);
      setFailedCount(failed);
    } catch (_) {}
  }, []);

  const handleClearFailed = useCallback(async () => {
    try {
      await clearFailed();
      await refreshCounts();
    } catch (_) {}
  }, [refreshCounts]);

  const syncNow = useCallback(async () => {
    if (!navigator.onLine) return;
    if (syncingRef.current) { syncAgainRef.current=true; return; }
    syncAgainRef.current=false;
    syncingRef.current = true;
    setIsSyncing(true);
    setAuthRequired(false);

    let succeeded = 0;
    let failed = 0;
    let duplicates = 0;

    try {
      const pending = await getPendingOnly();
      if (pending.length === 0) {
        setLastSyncAt(Date.now());
        setLastSyncResult({ succeeded: 0, failed: 0, duplicates: 0, total: 0 });
        return;
      }

      const operations = pending.map(op => ({
        type: op.type,
        url: op.url,
        method: op.method || 'POST',
        body: op.body,
        offlineId: op.offlineId,
        localId: op.localId,
      }));

      let batchResults = null;
      let retryableFailure = false;
      try {
        const res = await fetch('/api/sync/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ operations }),
        });

        if (res.status === 401) {
          setAuthRequired(true);
          console.warn('[OfflineSync] Session expired — cannot sync. Please log in again.');
          return;
        }

        if (res.ok) {
          const data = await res.json();
          batchResults = Array.isArray(data.results) ? data.results : null;
          retryableFailure=!batchResults;
        } else if(res.status>=500 || res.status===408 || res.status===429){
          retryableFailure=true;
        }
      } catch (networkErr) {
        retryableFailure=true;
        console.warn('[OfflineSync] Batch request failed (network):', networkErr.message);
      }

      if (batchResults) {
        const resultMap = new Map(batchResults.map(r => [r.offlineId, r]));
        for (const op of pending) {
          const result = resultMap.get(op.offlineId);
          if (!result) {
            await markFailed(op.localId);
            failed++;
            continue;
          }
          if (result.success || result.duplicate) {
            await remove(op.localId);
            if (result.duplicate) {
              duplicates++;
            } else {
              succeeded++;
            }
          } else {
            console.warn('[OfflineSync] Operation failed:', op.label, result.error);
            await markFailed(op.localId);
            failed++;
          }
        }
      } else if(!retryableFailure) {
        for (const op of pending) {
          await markFailed(op.localId);
          failed++;
        }
      }

      setLastSyncAt(Date.now());
      setLastSyncResult({ succeeded, failed, duplicates, total: pending.length,
        pending:retryableFailure?pending.length:0,networkUncertain:retryableFailure });
    } catch (err) {
      console.error('[OfflineSync] Sync error:', err);
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
      await refreshCounts();
      if(syncAgainRef.current && navigator.onLine){
        syncAgainRef.current=false;
        setTimeout(syncNow,0);
      }
    }
  }, [refreshCounts]);

  useEffect(() => {
    (async () => {
      try {
        const [pending, failed] = await Promise.all([getCount(), getFailedCount()]);
        setPendingCount(pending);
        setFailedCount(failed);
        if (navigator.onLine && pending > 0) {
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

    const interval = setInterval(refreshCounts, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [syncNow, refreshCounts]);

  return (
    <OfflineContext.Provider value={{
      isOnline,
      isSyncing,
      pendingCount,
      failedCount,
      syncNow,
      clearFailed: handleClearFailed,
      lastSyncAt,
      lastSyncResult,
      authRequired,
    }}>
      {children}
    </OfflineContext.Provider>
  );
}

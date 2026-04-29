import React, { useEffect, useState } from 'react';
import { useOffline } from '../lib/OfflineProvider.jsx';
import { WifiOff, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';

export function OfflineBanner() {
  const { isOnline, isSyncing, pendingCount, syncNow, lastSyncAt, lastSyncResult } = useOffline();
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (lastSyncResult && lastSyncResult.succeeded > 0 && isOnline) {
      setShowSuccess(true);
      const t = setTimeout(() => setShowSuccess(false), 5000);
      return () => clearTimeout(t);
    }
  }, [lastSyncResult, isOnline]);

  if (isOnline && pendingCount === 0 && !showSuccess) return null;

  if (isOnline && showSuccess && pendingCount === 0) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-green-600 shadow-md animate-fade-in">
        <CheckCircle size={16} />
        {lastSyncResult?.succeeded} transaction{lastSyncResult?.succeeded !== 1 ? 's' : ''} synced to server successfully
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-700 shadow-md">
        <div className="flex items-center gap-2">
          <WifiOff size={16} />
          <span>Offline — transactions are being saved locally and will sync when connection is restored</span>
        </div>
        {pendingCount > 0 && (
          <span className="ml-auto bg-red-900 rounded-full px-2 py-0.5 text-xs font-bold">
            {pendingCount} pending
          </span>
        )}
      </div>
    );
  }

  if (isOnline && pendingCount > 0) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-between gap-3 px-4 py-2 text-sm font-semibold text-white bg-amber-600 shadow-md">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} />
          <span>Connection restored — {pendingCount} offline transaction{pendingCount !== 1 ? 's' : ''} waiting to sync</span>
        </div>
        <button
          onClick={syncNow}
          disabled={isSyncing}
          className="flex items-center gap-1.5 bg-white text-amber-700 px-3 py-1 rounded-full text-xs font-bold hover:bg-amber-50 disabled:opacity-60 cursor-pointer border-none"
        >
          <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
          {isSyncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>
    );
  }

  return null;
}

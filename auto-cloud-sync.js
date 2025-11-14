(function(){
    // CLOUD SYNC DISABLED — using API/database only
    console.warn("CLOUD SYNC DISABLED — using API/database only");
    return;
    
    // Debounced auto-save to cloud when localStorage keys with prefix 'dyna_' change
    if (typeof window === 'undefined') return;

    const WATCH_PREFIX = 'dyna_';
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const originalRemoveItem = localStorage.removeItem.bind(localStorage);

    let pending = false;
    let timerId = null;

    function scheduleCloudSave(reason){
        try { if (!window.cloudAutoSaveAll) return; } catch(_) { return; }
        clearTimeout(timerId);
        pending = true;
        timerId = setTimeout(async () => {
            pending = false;
            try {
                // Silent auto-save; if no token set, this is a no-op
                await window.cloudAutoSaveAll(`Auto-save: ${reason || 'local update'}`);
            } catch(_) { /* ignore */ }
        }, 1200);
    }

    function shouldWatchKey(key){
        try { return typeof key === 'string' && key.startsWith(WATCH_PREFIX); } catch(_) { return false; }
    }

    // Patch setItem / removeItem to observe relevant changes
    try {
        localStorage.setItem = function(key, value){
            try { return originalSetItem(key, value); }
            finally { if (shouldWatchKey(key)) scheduleCloudSave(`set ${key}`); }
        };
        localStorage.removeItem = function(key){
            try { return originalRemoveItem(key); }
            finally { if (shouldWatchKey(key)) scheduleCloudSave(`remove ${key}`); }
        };
    } catch(_) { /* ignore */ }

    // Also listen for cross-tab updates
    window.addEventListener('storage', (e) => {
        if (e && shouldWatchKey(e.key)) scheduleCloudSave(`storage ${e.key}`);
    });

    // Expose manual trigger (useful for debugging)
    window.forceCloudAutoSave = function(msg){
        scheduleCloudSave(msg || 'manual');
    };
})();



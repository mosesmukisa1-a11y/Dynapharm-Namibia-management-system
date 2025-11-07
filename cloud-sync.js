// Cloud Sync for Dynapharm - GitHub-based storage
// This will sync data to a GitHub repository for permanent storage

class CloudStorage {
    constructor() {
        this.repo = 'mosesmukisa1-a11y/dynapharm-namibia-health';
        this.githubDataPath = 'cloud-data/data.json';
        this.githubApiBase = 'https://api.github.com';
        this.tokenStorageKey = 'dyna_github_token';
        this.lastCloudSyncKey = 'dyna_cloud_lastSync';
        this.pollIntervalMs = 20000; // 20s light polling for near real-time
        this.localOverrideWindowMs = 5 * 60 * 1000; // protect local edits for 5 minutes
    }

    _hasRecentLocalUpdate(key, windowMs = this.localOverrideWindowMs) {
        if (typeof localStorage === 'undefined') return false;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return false;
            const ts = Number(raw);
            if (!Number.isFinite(ts)) return false;
            return (Date.now() - ts) < windowMs;
        } catch (_) {
            return false;
        }
    }

    async loadFromCloud() {
        // Try same-origin static first, then GitHub fallback
        const candidates = [
            '/cloud-data/data.json',
            `https://raw.githubusercontent.com/${this.repo}/main/cloud-data/data.json`
        ];
        for (let i = 0; i < candidates.length; i++) {
            try {
                const response = await fetch(candidates[i], { cache: 'no-store' });
                if (response.ok) {
                    const data = await response.json();
                    console.log('✅ Loaded data from cloud storage');
                    return data;
                }
            } catch (_) {}
        }
        console.log('Cloud storage not available, using local data');
        return null;
    }

    async syncToLocal() {
        const cloudData = await this.loadFromCloud();
        if (cloudData) {
            const prev = (typeof localStorage !== 'undefined') ? (localStorage.getItem(this.lastCloudSyncKey) || '') : '';
            const incomingLastSync = cloudData.lastSync || '';
            const hasChange = !prev || (incomingLastSync && incomingLastSync !== prev);

            if (hasChange) {
                // Merge cloud data with local data, keeping newer versions
                if (cloudData.clients) {
                    localStorage.setItem('dyna_clients', JSON.stringify(cloudData.clients));
                }
                if (cloudData.reports) {
                    localStorage.setItem('dyna_reports', JSON.stringify(cloudData.reports));
                }
                if (cloudData.users) {
                    localStorage.setItem('dyna_users', JSON.stringify(cloudData.users));
                }
                if (cloudData.branches) {
                    localStorage.setItem('dyna_branches', JSON.stringify(cloudData.branches));
                }
                if (cloudData.barcodeStock) {
                    if (this._hasRecentLocalUpdate('dyna_barcode_stock_lastUpdated')) {
                        console.log('⏭️ Skipping barcode stock overwrite (recent local import detected)');
                    } else {
                        localStorage.setItem('dyna_barcode_stock', JSON.stringify(cloudData.barcodeStock));
                    }
                }
                if (cloudData.purchaseOrders) {
                    localStorage.setItem('dyna_purchase_orders', JSON.stringify(cloudData.purchaseOrders));
                }
                if (cloudData.walkInSales) {
                    localStorage.setItem('dyna_walkin_sales', JSON.stringify(cloudData.walkInSales));
                }
                if (cloudData.cashDrawer) {
                    localStorage.setItem('dyna_cash_drawer', JSON.stringify(cloudData.cashDrawer));
                }
                if (cloudData.onlineOrders) {
                    localStorage.setItem('dyna_online_orders', JSON.stringify(cloudData.onlineOrders));
                }
                if (cloudData.productPhotos) {
                    localStorage.setItem('dyna_product_photos', JSON.stringify(cloudData.productPhotos));
                }
                if (cloudData.branchStock) {
                    localStorage.setItem('dyna_branch_stock', JSON.stringify(cloudData.branchStock));
                }
                if (cloudData.scanAdjustments) {
                    localStorage.setItem('dyna_scan_adjustments', JSON.stringify(cloudData.scanAdjustments));
                }
                if (cloudData.appointments) {
                    localStorage.setItem('dyna_consult_appointments', JSON.stringify(cloudData.appointments));
                }
                if (incomingLastSync) {
                    try { localStorage.setItem(this.lastCloudSyncKey, incomingLastSync); } catch(_) {}
                }
                console.log('✅ Synced cloud data to local storage');
            } else {
                console.log('⏭️ Cloud data unchanged; keeping local stock state.');
            }

            try {
                if (hasChange && typeof window !== 'undefined') {
                    const evt = new CustomEvent('cloud-sync:updated', { detail: { lastSync: incomingLastSync } });
                    window.dispatchEvent(evt);
                }
            } catch(_) {}
        }

        // Additionally, load employees from dedicated file and sync
        try {
            const empCandidates = [
                '/cloud-data/employees_data.json',
                `https://raw.githubusercontent.com/${this.repo}/main/cloud-data/employees_data.json`
            ];
            for (let i = 0; i < empCandidates.length; i++) {
                try {
                    const r = await fetch(empCandidates[i], { cache: 'no-store' });
                    if (!r.ok) continue;
                    const list = await r.json();
                    
                    // Check if employee was just saved locally (guard for recent edits)
                    const justSaved = typeof window !== 'undefined' && window._employeeJustSaved && 
                                      (Date.now() - window._employeeJustSaved) < this.localOverrideWindowMs;
                    const recentLocalUpdate = this._hasRecentLocalUpdate('dyna_employees_lastUpdated');
                    
                    if (justSaved || recentLocalUpdate) {
                        let sourceTimestamp = Date.now();
                        if (justSaved) {
                            sourceTimestamp = window._employeeJustSaved;
                        } else {
                            try {
                                const storedTs = Number(localStorage.getItem('dyna_employees_lastUpdated'));
                                if (Number.isFinite(storedTs)) {
                                    sourceTimestamp = storedTs;
                                }
                            } catch(_) {}
                        }
                        const secondsAgo = Math.max(0, Math.round((Date.now() - sourceTimestamp) / 1000));
                        console.log(`🛡️ Skipping cloud-sync overwrite (local employee changes ${secondsAgo}s ago)`);
                        break;
                    }
                    
                    if (Array.isArray(list) && list.length > 0) {
                        // Only overwrite if we didn't just save locally, or if cloud has more employees
                        const existingHR = localStorage.getItem('hr_employees');
                        const existingDyna = localStorage.getItem('dyna_employees');
                        const existingCount = existingHR ? JSON.parse(existingHR).length : (existingDyna ? JSON.parse(existingDyna).length : 0);
                        
                        if (justSaved) {
                            console.log(`🛡️ Skipping cloud-sync overwrite (employee just saved ${Math.round((Date.now() - window._employeeJustSaved) / 1000)}s ago)`);
                            break;
                        }
                        
                        // Only overwrite if cloud has same or more employees, or if local is empty
                        if (list.length >= existingCount || existingCount === 0) {
                            localStorage.setItem('dyna_employees', JSON.stringify(list));
                            // Keep HR portal compatibility
                            try { localStorage.setItem('hr_employees', JSON.stringify(list)); } catch(_) {}
                            console.log(`✅ Synced ${list.length} employees from employees_data.json (had ${existingCount})`);
                        } else {
                            console.log(`⚠️ Skipping cloud-sync - local has ${existingCount} employees, cloud has ${list.length} (local is newer)`);
                        }
                    } else if (Array.isArray(list) && list.length === 0) {
                        // Don't overwrite localStorage with empty array - preserve existing data
                        const existing = localStorage.getItem('dyna_employees');
                        if (!existing || existing === '[]') {
                            console.log(`⚠️ No employees in cloud data, keeping existing localStorage data`);
                        } else {
                            try {
                                const existingCount = JSON.parse(existing).length;
                                console.log(`✅ Synced 0 employees from employees_data.json (preserving ${existingCount} existing)`);
                            } catch(_) {
                                console.log(`✅ Synced 0 employees from employees_data.json (preserving existing data)`);
                            }
                        }
                        try {
                            if (typeof window !== 'undefined') {
                                const evt = new CustomEvent('cloud-sync:employees', { detail: { count: 0, preserved: true } });
                                window.dispatchEvent(evt);
                            }
                        } catch(_) {}
                        break;
                    }
                } catch(_) {}
            }
        } catch (e) {
            console.warn('Employees sync skipped:', e && e.message ? e.message : e);
        }
    }

    async saveToCloud() {
        const data = {
            clients: JSON.parse(localStorage.getItem('dyna_clients') || '[]'),
            users: JSON.parse(localStorage.getItem('dyna_users') || '[]'),
            branches: JSON.parse(localStorage.getItem('dyna_branches') || '[]'),
            reports: JSON.parse(localStorage.getItem('dyna_reports') || '[]'),
            barcodeStock: JSON.parse(localStorage.getItem('dyna_barcode_stock') || '[]'),
            purchaseOrders: JSON.parse(localStorage.getItem('dyna_purchase_orders') || '[]'),
            walkInSales: JSON.parse(localStorage.getItem('dyna_walkin_sales') || '[]'),
            cashDrawer: JSON.parse(localStorage.getItem('dyna_cash_drawer') || '{}'),
            onlineOrders: JSON.parse(localStorage.getItem('dyna_online_orders') || '[]'),
            productPhotos: JSON.parse(localStorage.getItem('dyna_product_photos') || '{}'),
            branchStock: JSON.parse(localStorage.getItem('dyna_branch_stock') || '{}'),
            scanAdjustments: JSON.parse(localStorage.getItem('dyna_scan_adjustments') || '[]'),
            appointments: JSON.parse(localStorage.getItem('dyna_consult_appointments') || '[]'),
            lastSync: new Date().toISOString()
        };
        
        // Create a downloadable JSON file that can be committed to GitHub
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cloud-sync-backup.json';
        a.click();
        URL.revokeObjectURL(url);
        
        console.log('✅ Backup file ready for upload to GitHub');
        alert('Backup file downloaded! Please commit it to GitHub in cloud-data/data.json');
    }

    _aggregateData() {
        return {
            clients: JSON.parse(localStorage.getItem('dyna_clients') || '[]'),
            employees: JSON.parse(localStorage.getItem('dyna_employees') || '[]'),
            users: JSON.parse(localStorage.getItem('dyna_users') || '[]'),
            branches: JSON.parse(localStorage.getItem('dyna_branches') || '[]'),
            reports: JSON.parse(localStorage.getItem('dyna_reports') || '[]'),
            barcodeStock: JSON.parse(localStorage.getItem('dyna_barcode_stock') || '[]'),
            purchaseOrders: JSON.parse(localStorage.getItem('dyna_purchase_orders') || '[]'),
            walkInSales: JSON.parse(localStorage.getItem('dyna_walkin_sales') || '[]'),
            cashDrawer: JSON.parse(localStorage.getItem('dyna_cash_drawer') || '{}'),
            onlineOrders: JSON.parse(localStorage.getItem('dyna_online_orders') || '[]'),
            productPhotos: JSON.parse(localStorage.getItem('dyna_product_photos') || '{}'),
            branchStock: JSON.parse(localStorage.getItem('dyna_branch_stock') || '{}'),
            scanAdjustments: JSON.parse(localStorage.getItem('dyna_scan_adjustments') || '[]'),
            appointments: JSON.parse(localStorage.getItem('dyna_consult_appointments') || '[]'),
            lastSync: new Date().toISOString()
        };
    }

    async _getExistingFileSha(token) {
        const url = `${this.githubApiBase}/repos/${this.repo}/contents/${this.githubDataPath}`;
        const res = await fetch(url, {
            headers: {
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${token}`
            }
        });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`Failed to get existing file: ${res.status}`);
        const json = await res.json();
        return json.sha || null;
    }

    async saveToGitHub(token, commitMessage = 'Cloud sync: update data.json') {
        if (!token) throw new Error('GitHub token is required');
        const data = this._aggregateData();
        const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
        const sha = await this._getExistingFileSha(token);
        const url = `${this.githubApiBase}/repos/${this.repo}/contents/${this.githubDataPath}`;
        const body = {
            message: commitMessage,
            content,
            sha: sha || undefined
        };
        const res = await fetch(url, {
            method: 'PUT',
            headers: {
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`GitHub save failed: ${res.status} ${errText}`);
        }
        console.log('✅ Data saved to GitHub cloud-data/data.json');
        return true;
    }

    getStoredToken() {
        try { return localStorage.getItem(this.tokenStorageKey) || ''; } catch(_) { return ''; }
    }

    setStoredToken(token) {
        if (!token) return;
        localStorage.setItem(this.tokenStorageKey, token);
    }

    async tryAutoSaveToGitHub(commitMessage = 'Cloud sync: auto-save') {
        const token = this.getStoredToken();
        if (!token) return false;
        try {
            await this.saveToGitHub(token, commitMessage);
            return true;
        } catch(_) {
            return false;
        }
    }
}

// Initialize cloud storage
const cloudStorage = new CloudStorage();

// Auto-sync on page load
window.addEventListener('load', () => {
    cloudStorage.syncToLocal();
    // Lightweight polling for near real-time updates
    try {
        setInterval(() => { cloudStorage.syncToLocal(); }, cloudStorage.pollIntervalMs);
    } catch(_) {}
    try {
        if (!document.getElementById('cloud-save-btn')) {
            const btn = document.createElement('button');
            btn.id = 'cloud-save-btn';
            btn.textContent = '💾 Save to Cloud';
            btn.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:9999;background:#1769aa;color:#fff;border:none;border-radius:6px;padding:8px 12px;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.2)';
            btn.addEventListener('click', async () => {
                let token = cloudStorage.getStoredToken();
                if (!token) {
                    token = prompt('Enter GitHub Personal Access Token (repo scope) to save data.json:');
                    if (!token) return;
                    cloudStorage.setStoredToken(token);
                }
                btn.disabled = true; btn.textContent = 'Saving...';
                try {
                    await cloudStorage.saveToGitHub(token, 'Cloud sync: save from app');
                    alert('Saved to GitHub cloud-data/data.json');
                } catch (e) {
                    alert('Save failed: ' + e.message);
                } finally {
                    btn.disabled = false; btn.textContent = '💾 Save to Cloud';
                }
            });
            document.body.appendChild(btn);
        }
    } catch(_) { /* ignore */ }
});

// Add to window for manual access
window.cloudStorage = cloudStorage;
window.cloudSaveToGitHub = async function() {
    let token = cloudStorage.getStoredToken();
    if (!token) {
        token = prompt('Enter GitHub Personal Access Token (repo scope) to save data.json:');
        if (!token) return;
        cloudStorage.setStoredToken(token);
    }
    await cloudStorage.saveToGitHub(token, 'Cloud sync: manual save');
};
window.cloudSetGitHubToken = function() {
    const token = prompt('Enter GitHub Personal Access Token (repo scope) to store for auto-save:');
    if (!token) return false;
    cloudStorage.setStoredToken(token);
    alert('Token saved locally for auto-save.');
    return true;
};
window.cloudAutoSaveAll = async function(commitMessage = 'Cloud sync: auto-save') {
    return await cloudStorage.tryAutoSaveToGitHub(commitMessage);
};

const DB_NAME = 'dynapharm_offline_v1';
const STORE = 'queue';
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'localId' });
        store.createIndex('by_created', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

export function generateOfflineId() {
  return `ofl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function enqueue(op) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const record = {
      localId: generateOfflineId(),
      type: op.type,
      url: op.url,
      method: op.method || 'POST',
      body: op.body,
      offlineId: op.offlineId || generateOfflineId(),
      label: op.label || op.type,
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
    };
    const req = tx.objectStore(STORE).add(record);
    req.onsuccess = () => resolve(record);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function getAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = (e) => resolve(e.target.result || []);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function remove(localId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).delete(localId);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function markFailed(localId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getReq = store.get(localId);
    getReq.onsuccess = (e) => {
      const record = e.target.result;
      if (!record) { resolve(); return; }
      record.status = 'failed';
      record.retryCount = (record.retryCount || 0) + 1;
      const putReq = store.put(record);
      putReq.onsuccess = () => resolve();
      putReq.onerror = (err) => reject(err.target.error);
    };
    getReq.onerror = (e) => reject(e.target.error);
  });
}

export async function getCount() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).count();
    req.onsuccess = (e) => resolve(e.target.result || 0);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function clearAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

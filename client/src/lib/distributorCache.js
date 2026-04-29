const CACHE_KEY = 'dyna_dist_cache_v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_ENTRIES = 5000;

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { distributors: [], cachedAt: 0 };
    return JSON.parse(raw);
  } catch {
    return { distributors: [], cachedAt: 0 };
  }
}

function writeCache(distributors) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ distributors, cachedAt: Date.now() }));
  } catch { /* localStorage full — ignore */ }
}

function normalize(d) {
  return {
    id: d.distributorId || d.id || '',
    name: d.fullName || d.name || d.distributor_name || d.full_name || '',
    nb_number: d.nbNumber || d.nb_number || d.distributor_code || '',
    phone: d.phone || d.mobile_no || '',
    status: d.status || 'active',
  };
}

export function addToCache(distributors) {
  if (!Array.isArray(distributors) || distributors.length === 0) return;
  const { distributors: existing } = readCache();
  const byId = new Map(existing.map(d => [d.id || d.nb_number, d]));
  for (const d of distributors) {
    const n = normalize(d);
    if (n.id || n.nb_number) byId.set(n.id || n.nb_number, n);
  }
  const merged = [...byId.values()].slice(0, MAX_ENTRIES);
  writeCache(merged);
}

export function searchCache(query) {
  if (!query || query.length < 2) return [];
  const { distributors } = readCache();
  const q = query.toLowerCase().trim();
  return distributors
    .filter(d =>
      (d.name || '').toLowerCase().includes(q) ||
      (d.nb_number || '').toLowerCase().includes(q) ||
      (d.phone || '').includes(q)
    )
    .sort((a, b) => {
      const an = (a.nb_number || '').toLowerCase();
      const bn = (b.nb_number || '').toLowerCase();
      if (an.startsWith(q) && !bn.startsWith(q)) return -1;
      if (!an.startsWith(q) && bn.startsWith(q)) return 1;
      return (a.name || '').localeCompare(b.name || '');
    })
    .slice(0, 30);
}

export function getCacheStats() {
  const { distributors, cachedAt } = readCache();
  return { count: distributors.length, cachedAt, fresh: Date.now() - cachedAt < CACHE_TTL_MS };
}

export async function warmCache() {
  if (!navigator.onLine) return;
  const { cachedAt } = readCache();
  if (Date.now() - cachedAt < CACHE_TTL_MS) return; // still fresh
  try {
    const res = await fetch('/api/distributors?status=active&limit=5000', {
      credentials: 'include',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return;
    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.distributors || []);
    if (list.length > 0) {
      writeCache(list.map(normalize));
    }
  } catch { /* silently ignore — we are online but the fetch failed */ }
}

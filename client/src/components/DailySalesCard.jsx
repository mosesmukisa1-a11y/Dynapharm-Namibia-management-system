import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { formatCurrency, BRANCH_ID_TO_NAME } from '../lib/constants';
import { LoadingSpinner } from './ui';
import { TrendingUp, ChevronDown, ChevronUp, RefreshCw, MapPin, ShoppingCart } from 'lucide-react';

function branchLabel(id) {
  return BRANCH_ID_TO_NAME[id] || id || '—';
}

function MiniBar({ value, max, color = '#c41e3a' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ height: 4, background: '#f1f5f9', borderRadius: 2, flex: 1, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
    </div>
  );
}

export default function DailySalesCard({ className = '' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    const nbt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    return nbt.toISOString().slice(0, 10);
  });

  const load = useCallback(async (date, silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const result = await api.gm.dailySales(date ? { date } : {});
      if (result?.success) {
        setData(result);
        setLastRefresh(new Date());
      }
    } catch {
      // silently fail — data just won't update
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(selectedDate); }, [selectedDate]);

  const summary = data?.summary || {};
  const branches = data?.branches || [];
  const maxRevenue = branches.length > 0 ? branches[0].revenue : 0;
  const topBranch = branches[0];

  const today = (() => {
    const now = new Date();
    const nbt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    return nbt.toISOString().slice(0, 10);
  })();
  const isToday = selectedDate === today;

  return (
    <div className={className} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
      {/* Header — always visible, tappable to expand */}
      <button
        onClick={() => setExpanded(p => !p)}
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none', padding: 0, background: 'none',
        }}
      >
        <div style={{ background: 'linear-gradient(135deg, #c41e3a 0%, #8b0000 100%)', padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
              <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 10, padding: 10, display: 'flex', alignItems: 'center' }}>
                <TrendingUp size={20} color="#fff" />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.78rem', fontWeight: 600, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {isToday ? "Today's Sales" : `Sales — ${selectedDate}`}
                  </p>
                  {isToday && (
                    <span style={{ background: '#22c55e', color: '#fff', borderRadius: 99, padding: '1px 8px', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.05em' }}>
                      LIVE
                    </span>
                  )}
                </div>
                {loading ? (
                  <p style={{ color: '#fff', fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>—</p>
                ) : (
                  <p style={{ color: '#fff', fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>
                    {formatCurrency(summary.totalRevenue || 0)}
                  </p>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); load(selectedDate, true); }}
                  title="Refresh"
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <RefreshCw size={14} color="#fff" style={{ animation: refreshing ? 'spin 0.8s linear infinite' : 'none' }} />
                </button>
                <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 8, padding: 6 }}>
                  {expanded ? <ChevronUp size={16} color="#fff" /> : <ChevronDown size={16} color="#fff" />}
                </div>
              </div>
              {!loading && (
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.7rem', margin: 0 }}>Transactions</p>
                    <p style={{ color: '#fff', fontSize: '1rem', fontWeight: 800, margin: 0 }}>{(summary.totalTransactions || 0).toLocaleString()}</p>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.7rem', margin: 0 }}>Branches Active</p>
                    <p style={{ color: '#fff', fontSize: '1rem', fontWeight: 800, margin: 0 }}>{summary.activeBranchCount || 0}</p>
                  </div>
                  {topBranch && (
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.7rem', margin: 0 }}>Top Branch</p>
                      <p style={{ color: '#fff', fontSize: '0.85rem', fontWeight: 800, margin: 0 }}>{branchLabel(topBranch.branchId)}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </button>

      {/* Expanded branch detail panel */}
      {expanded && (
        <div style={{ padding: '16px 20px', background: '#fafafa' }}>
          {/* Date selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date</label>
            <input
              type="date"
              value={selectedDate}
              max={today}
              onChange={e => setSelectedDate(e.target.value)}
              onClick={e => e.stopPropagation()}
              style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.85rem', color: '#1e293b', background: '#fff', cursor: 'pointer' }}
            />
            {!isToday && (
              <button onClick={(e) => { e.stopPropagation(); setSelectedDate(today); }}
                style={{ fontSize: '0.75rem', color: '#c41e3a', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>
                Back to Today
              </button>
            )}
            {lastRefresh && (
              <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginLeft: 'auto' }}>
                Updated {lastRefresh.toLocaleTimeString('en-NA', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          {loading ? (
            <LoadingSpinner />
          ) : branches.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <ShoppingCart size={40} style={{ color: '#cbd5e1', marginBottom: 8 }} />
              <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: 0 }}>No sales recorded for {isToday ? 'today' : selectedDate} yet.</p>
            </div>
          ) : (
            <>
              {/* Country summary pills */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {[
                  { label: 'Member Sales', val: summary.memberRevenue, color: '#3b82f6' },
                  { label: 'Non-Member Sales', val: summary.nonMemberRevenue, color: '#8b5cf6' },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 14px' }}>
                    <p style={{ fontSize: '0.7rem', color: '#64748b', margin: 0 }}>{label}</p>
                    <p style={{ fontSize: '0.95rem', fontWeight: 800, color, margin: 0 }}>{formatCurrency(val || 0)}</p>
                  </div>
                ))}
              </div>

              {/* Per-branch rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {branches.map((b, idx) => (
                  <div key={b.branchId} style={{
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 16px',
                    boxShadow: idx === 0 ? '0 2px 8px rgba(196,30,58,0.08)' : 'none',
                    borderLeft: idx === 0 ? '4px solid #c41e3a' : '4px solid transparent',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <MapPin size={13} color={idx === 0 ? '#c41e3a' : '#94a3b8'} />
                      <span style={{ fontWeight: 700, fontSize: '0.92rem', color: '#1e293b', flex: 1 }}>
                        {branchLabel(b.branchId)}
                      </span>
                      {idx === 0 && (
                        <span style={{ background: '#fff1f2', color: '#c41e3a', borderRadius: 99, padding: '2px 8px', fontSize: '0.68rem', fontWeight: 800 }}>
                          #1 TODAY
                        </span>
                      )}
                      <span style={{ fontWeight: 800, fontSize: '1rem', color: '#15803d' }}>
                        {formatCurrency(b.revenue)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <MiniBar value={b.revenue} max={maxRevenue} color={idx === 0 ? '#c41e3a' : '#94a3b8'} />
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        🧾 {b.transactions} transaction{b.transactions !== 1 ? 's' : ''}
                      </span>
                      {b.memberRevenue > 0 && (
                        <span style={{ fontSize: '0.75rem', color: '#3b82f6' }}>
                          👤 Member: {formatCurrency(b.memberRevenue)}
                        </span>
                      )}
                      {b.nonMemberRevenue > 0 && (
                        <span style={{ fontSize: '0.75rem', color: '#8b5cf6' }}>
                          🧍 Non-member: {formatCurrency(b.nonMemberRevenue)}
                        </span>
                      )}
                      {b.cashRevenue > 0 && (
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          💵 Cash: {formatCurrency(b.cashRevenue)}
                        </span>
                      )}
                      {b.cardEftRevenue > 0 && (
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          💳 Card/EFT: {formatCurrency(b.cardEftRevenue)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

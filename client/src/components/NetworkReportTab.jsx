import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';

// ── rank colours ─────────────────────────────────────────────────────────────
const RANK_COLOR = {
  CDM: { bg: '#7c3aed', fg: '#fff' },
  RM:  { bg: '#1d4ed8', fg: '#fff' },
  PM:  { bg: '#0369a1', fg: '#fff' },
  SM:  { bg: '#0f766e', fg: '#fff' },
  M:   { bg: '#166534', fg: '#fff' },
  DI:  { bg: '#92400e', fg: '#fff' },
  '—': { bg: '#e5e7eb', fg: '#6b7280' },
};

function rankBadge(code) {
  const c = RANK_COLOR[code] || RANK_COLOR['DI'];
  return (
    <span style={{
      display: 'inline-block', padding: '1px 8px', borderRadius: 20,
      fontSize: '0.68rem', fontWeight: 800, letterSpacing: '.04em',
      background: c.bg, color: c.fg, whiteSpace: 'nowrap',
    }}>{code || '—'}</span>
  );
}

// ── Print ─────────────────────────────────────────────────────────────────────
function printGMReport(rows, bonusMonth, areaLabel) {
  const win = window.open('', '_blank');
  if (!win) return;
  const tableRows = rows.map((r, i) => `
    <tr style="background:${i % 2 === 0 ? '#CACACA' : '#fff'}">
      <td>${r.drn}</td>
      <td>${r.name}</td>
      <td>${r.directUpline}</td>
      <td>${r.orgSponsor}</td>
      <td>${r.currentRank}</td>
      <td>${r.adjustedRank}</td>
      <td>${r.activeRank}</td>
      <td style="text-align:right">${r.am}</td>
      <td style="text-align:right">${r.recruit}</td>
      <td style="text-align:right">${r.psbv.toFixed(2)}</td>
      <td style="text-align:right">${r.pgbv.toFixed(2)}</td>
      <td style="text-align:right;border-right:1px solid #000">${r.gbv.toFixed(2)}</td>
    </tr>`).join('');

  const totalPSBV = rows.reduce((s, r) => s + r.psbv, 0);
  const totalPGBV = rows.reduce((s, r) => s + r.pgbv, 0);
  const totalGBV  = rows.reduce((s, r) => s + r.gbv, 0);

  win.document.write(`<!DOCTYPE html><html><head>
  <meta charset="UTF-8"><title>Report GM – ${bonusMonth}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,sans-serif;font-size:11px;color:#000;padding:20px}
    .h1{font-weight:700;font-size:13px}
    .h2{font-weight:700;font-size:12px;margin:2px 0}
    .h3{font-size:11px;margin:2px 0}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th{font-weight:700;padding:5px 6px;text-align:left;border:1px solid #000;font-size:10px;background:#fff}
    th.r{text-align:right}
    td{padding:4px 6px;font-size:10px;border-left:1px solid #000;border-bottom:1px solid #eee}
    .total td{border-top:2px solid #000;font-weight:700;background:#f0f0f0!important}
    .print-btn{position:fixed;top:10px;right:10px;background:#c41e3a;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:700;cursor:pointer;font-size:12px}
    @media print{.print-btn{display:none}}
  </style></head><body>
  <button class="print-btn" onclick="window.print()">🖨️ Print</button>
  <div class="h1">DYNAPHARM INTERNATIONAL NAMIBIA</div>
  <div class="h2">DISTRIBUTOR MONTHLY ACTIVITY FOR BONUS MONTH ${bonusMonth}</div>
  <div class="h3">AREA: ${areaLabel}</div>
  <table>
    <thead>
      <tr>
        <th style="border-left:1px solid #000;border-top:1px solid #000">DRN</th>
        <th style="border-left:1px solid #000;border-top:1px solid #000">NAME</th>
        <th style="border-left:1px solid #000;border-top:1px solid #000">DIRECT UPLINE</th>
        <th style="border-left:1px solid #000;border-top:1px solid #000">ORG SPONSOR</th>
        <th style="border-left:1px solid #000;border-top:1px solid #000">CURRENT RANK</th>
        <th style="border-left:1px solid #000;border-top:1px solid #000">ADJUSTED RANK</th>
        <th style="border-left:1px solid #000;border-top:1px solid #000">ACTIVE RANK</th>
        <th class="r" style="border-left:1px solid #000;border-top:1px solid #000">AM</th>
        <th class="r" style="border-left:1px solid #000;border-top:1px solid #000">RECRUIT</th>
        <th class="r" style="border-left:1px solid #000;border-top:1px solid #000">PSBV</th>
        <th class="r" style="border-left:1px solid #000;border-top:1px solid #000">PGBV</th>
        <th class="r" style="border-left:1px solid #000;border-top:1px solid #000;border-right:1px solid #000">GBV</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
    <tfoot>
      <tr class="total">
        <td colspan="7"><strong>TOTALS — ${rows.length} Distributors</strong></td>
        <td style="text-align:right">${rows.reduce((s,r)=>s+r.am,0)}</td>
        <td style="text-align:right">${rows.reduce((s,r)=>s+r.recruit,0)}</td>
        <td style="text-align:right">${totalPSBV.toFixed(2)}</td>
        <td style="text-align:right">${totalPGBV.toFixed(2)}</td>
        <td style="text-align:right;border-right:1px solid #000">${totalGBV.toFixed(2)}</td>
      </tr>
    </tfoot>
  </table>
  <div style="margin-top:14px;font-size:9px;color:#555">Generated: ${new Date().toLocaleString('en-NA')} · Dynapharm Health Management System</div>
  </body></html>`);
  win.document.close();
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function NetworkReportTab({
  branchFilter = null,
  rootNb = null,
  areaLabel = null,
  title = '📊 Network Report (GM Format)',
}) {
  const [rows, setRows]         = useState([]);
  const [bonusMonth, setBonusMonth] = useState('');
  const [month, setMonth]       = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
  });
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [offset, setOffset]     = useState(0);
  const [expandedRow, setExpandedRow] = useState(null);
  const LIMIT = 300;

  const load = useCallback((off = 0) => {
    setLoading(true);
    const params = new URLSearchParams({ month, limit: LIMIT, offset: off });
    if (branchFilter) params.set('branch', branchFilter);
    if (rootNb)       params.set('root_nb', rootNb);
    if (search.trim()) params.set('search', search.trim());
    api.get(`/distributor-network?${params}`)
      .then(data => {
        if (data.success) {
          setRows(data.rows || []);
          setBonusMonth(data.bonusMonth || month);
          setTotalCount(data.totalCount || 0);
          setOffset(off);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [month, branchFilter, rootNb, search]);

  useEffect(() => { load(0); }, [load]);

  const searchTimer = useRef(null);
  const handleSearch = (v) => {
    setSearch(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(0), 400);
  };

  const label = areaLabel || branchFilter || (rootNb ? `Network of ${rootNb}` : 'All Areas');

  // Summary stats
  const totalPSBV = rows.reduce((s, r) => s + r.psbv, 0);
  const totalGBV  = rows.reduce((s, r) => s + r.gbv, 0);
  const totalRecruit = rows.reduce((s, r) => s + r.recruit, 0);
  const activeCount  = rows.filter(r => r.psbv > 0 || r.gbv > 0).length;

  return (
    <div>
      {/* Header */}
      <div className="rounded-xl p-5 mb-5 flex justify-between items-center flex-wrap gap-3"
        style={{ background: 'linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%)', boxShadow: '0 4px 20px rgba(79,70,229,0.28)' }}>
        <div>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 4 }}>
            Network Marketing
          </p>
          <h3 style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 800, margin: 0 }}>{title}</h3>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem', marginTop: 4 }}>
            Bonus Month: <strong>{bonusMonth || month}</strong> · Area: {label}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <input
            type="month"
            value={month}
            onChange={e => { setMonth(e.target.value); setOffset(0); }}
            style={{ padding: '7px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.15)', color: '#fff', fontWeight: 700, fontSize: '0.84rem', outline: 'none' }}
          />
          <button onClick={() => load(offset)}
            style={{ padding: '9px 18px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '99px', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer' }}>
            🔄 Refresh
          </button>
          <button onClick={() => printGMReport(rows, bonusMonth || month, label)}
            style={{ padding: '9px 18px', background: '#fff', color: '#4f46e5', border: 'none', borderRadius: '99px', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer' }}>
            🖨️ Print GM Report
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Distributors', value: totalCount.toLocaleString(), sub: `${rows.length} loaded`, color: '#4f46e5' },
          { label: 'Active This Period', value: activeCount, sub: 'with BV activity', color: '#0f766e' },
          { label: 'Total PSBV', value: totalPSBV.toFixed(1), sub: 'personal BV', color: '#c41e3a' },
          { label: 'Total GBV', value: totalGBV.toFixed(1), sub: 'group BV', color: '#1d4ed8' },
          { label: 'Total Recruits', value: totalRecruit.toLocaleString(), sub: 'across shown dists.', color: '#92400e' },
        ].map(c => (
          <div key={c.label} style={{ background: '#fff', border: '1.5px solid #e8e0f5', borderRadius: 14, padding: '12px 14px' }}>
            <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 2 }}>{c.label}</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 900, color: c.color, lineHeight: 1 }}>{c.value}</div>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Search bar */}
      <div style={{ background: '#fff', border: '1.5px solid #e8e0f5', borderRadius: 14, padding: '10px 14px', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#7c3aed', fontSize: '0.85rem' }}>🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search by name, NB code, or upline code…"
            style={{ width: '100%', padding: '7px 12px 7px 30px', border: '1.5px solid #e0d5f5', borderRadius: 9, fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
          />
          {search && (
            <button onClick={() => handleSearch('')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1rem' }}>×</button>
          )}
        </div>
        <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
          {loading ? '⏳ Loading…' : `${rows.length} of ${totalCount} distributors`}
          {totalCount > LIMIT && !search && (
            <span style={{ marginLeft: 8, color: '#7c3aed' }}>· Page {Math.floor(offset / LIMIT) + 1}</span>
          )}
        </div>
        {totalCount > LIMIT && !search && (
          <div className="flex gap-1">
            <button
              disabled={offset === 0}
              onClick={() => load(Math.max(0, offset - LIMIT))}
              style={{ padding: '5px 14px', background: offset === 0 ? '#f3f0fd' : '#4f46e5', color: offset === 0 ? '#a78bfa' : '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: offset === 0 ? 'default' : 'pointer', fontSize: '0.82rem' }}>
              ← Prev
            </button>
            <button
              disabled={offset + LIMIT >= totalCount}
              onClick={() => load(offset + LIMIT)}
              style={{ padding: '5px 14px', background: offset + LIMIT >= totalCount ? '#f3f0fd' : '#4f46e5', color: offset + LIMIT >= totalCount ? '#a78bfa' : '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: offset + LIMIT >= totalCount ? 'default' : 'pointer', fontSize: '0.82rem' }}>
              Next →
            </button>
          </div>
        )}
      </div>

      {/* GM Report Table */}
      <div style={{ background: '#fff', border: '1.5px solid #e8e0f5', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 12px rgba(79,70,229,0.06)' }}>
        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: '#7c3aed', fontWeight: 700 }}>⏳ Computing network data…</div>
        )}
        {!loading && rows.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No distributors found for the selected criteria.</div>
        )}
        {!loading && rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#f3f0fd' }}>
                  {[
                    { label: 'DRN', align: 'left', tip: 'Distributor Registration Number' },
                    { label: 'NAME', align: 'left', tip: 'Full Name' },
                    { label: 'DIRECT UPLINE', align: 'left', tip: 'Sponsor Code' },
                    { label: 'ORG SPONSOR', align: 'left', tip: 'Original Sponsor Code' },
                    { label: 'CURRENT RANK', align: 'left', tip: 'Current Position' },
                    { label: 'ADJUSTED RANK', align: 'left', tip: 'Adjusted Position' },
                    { label: 'ACTIVE RANK', align: 'left', tip: 'Active Position this period' },
                    { label: 'AM', align: 'right', tip: 'Active Members (recruits with sales this period)' },
                    { label: 'RECRUIT', align: 'right', tip: 'Total Direct Recruits' },
                    { label: 'PSBV', align: 'right', tip: 'Personal Sales BV' },
                    { label: 'PGBV', align: 'right', tip: 'Personal Group BV (own + direct downline)' },
                    { label: 'GBV', align: 'right', tip: 'Total Group BV (full downline)' },
                  ].map(h => (
                    <th key={h.label} title={h.tip}
                      style={{
                        padding: '9px 10px',
                        fontSize: '0.68rem', fontWeight: 800, color: '#4f46e5',
                        textTransform: 'uppercase', letterSpacing: '.07em',
                        textAlign: h.align,
                        borderBottom: '2px solid #e0d5f5',
                        whiteSpace: 'nowrap',
                        borderLeft: '1px solid #e0d5f5',
                        cursor: 'help',
                      }}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <>
                    <tr key={r.drn}
                      onClick={() => setExpandedRow(expandedRow === r.drn ? null : r.drn)}
                      style={{
                        background: i % 2 === 0 ? '#faf9ff' : '#fff',
                        cursor: 'pointer',
                        transition: 'background .15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f0ecfd'}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#faf9ff' : '#fff'}>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 700, color: '#4f46e5', borderLeft: '1px solid #e0d5f5', whiteSpace: 'nowrap' }}>
                        {r.drn}
                      </td>
                      <td style={{ padding: '7px 10px', fontWeight: 600, borderLeft: '1px solid #e0d5f5', whiteSpace: 'nowrap', maxWidth: 200 }}>
                        {r.name}
                      </td>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: '0.78rem', color: '#64748b', borderLeft: '1px solid #e0d5f5', whiteSpace: 'nowrap' }}>
                        {r.directUpline}
                      </td>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontSize: '0.78rem', color: '#64748b', borderLeft: '1px solid #e0d5f5', whiteSpace: 'nowrap' }}>
                        {r.orgSponsor}
                      </td>
                      <td style={{ padding: '7px 10px', borderLeft: '1px solid #e0d5f5' }}>{rankBadge(r.currentRank)}</td>
                      <td style={{ padding: '7px 10px', borderLeft: '1px solid #e0d5f5' }}>{rankBadge(r.adjustedRank)}</td>
                      <td style={{ padding: '7px 10px', borderLeft: '1px solid #e0d5f5' }}>{rankBadge(r.activeRank)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: r.am > 0 ? '#0f766e' : '#94a3b8', borderLeft: '1px solid #e0d5f5' }}>{r.am}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: r.recruit > 0 ? '#1d4ed8' : '#94a3b8', borderLeft: '1px solid #e0d5f5' }}>{r.recruit}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: r.psbv > 0 ? '#c41e3a' : '#94a3b8', borderLeft: '1px solid #e0d5f5' }}>
                        {r.psbv > 0 ? r.psbv.toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: r.pgbv > 0 ? '#0369a1' : '#94a3b8', borderLeft: '1px solid #e0d5f5' }}>
                        {r.pgbv > 0 ? r.pgbv.toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800, color: r.gbv > 0 ? '#4f46e5' : '#94a3b8', borderLeft: '1px solid #e0d5f5' }}>
                        {r.gbv > 0 ? r.gbv.toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                      </td>
                    </tr>
                    {expandedRow === r.drn && (
                      <tr key={`${r.drn}-expand`}>
                        <td colSpan={12} style={{ background: '#f5f3ff', borderLeft: '3px solid #7c3aed', padding: '10px 16px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 8, fontSize: '0.8rem' }}>
                            <div><span style={{ color: '#7c3aed', fontWeight: 700 }}>Full Name:</span> {r.name}</div>
                            <div><span style={{ color: '#7c3aed', fontWeight: 700 }}>DRN:</span> {r.drn}</div>
                            <div><span style={{ color: '#7c3aed', fontWeight: 700 }}>Direct Upline:</span> {r.directUpline} — {r.directUplineName}</div>
                            <div><span style={{ color: '#7c3aed', fontWeight: 700 }}>Branch:</span> {r.branch || '—'}</div>
                            <div><span style={{ color: '#7c3aed', fontWeight: 700 }}>Status:</span> {r.status}</div>
                            <div><span style={{ color: '#7c3aed', fontWeight: 700 }}>Position:</span> {r.position}</div>
                            <div><span style={{ color: '#7c3aed', fontWeight: 700 }}>Date Joined:</span> {r.dateJoined || '—'}</div>
                            <div><span style={{ color: '#7c3aed', fontWeight: 700 }}>Phone:</span> {r.phone || '—'}</div>
                            <div><span style={{ color: '#7c3aed', fontWeight: 700 }}>Level:</span> {r.level || '—'}</div>
                            <div><span style={{ color: '#7c3aed', fontWeight: 700 }}>PSBV:</span> {r.psbv.toFixed(2)}</div>
                            <div><span style={{ color: '#7c3aed', fontWeight: 700 }}>PGBV:</span> {r.pgbv.toFixed(2)}</div>
                            <div><span style={{ color: '#7c3aed', fontWeight: 700 }}>GBV:</span> {r.gbv.toFixed(2)}</div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
              {/* Totals row */}
              <tfoot>
                <tr style={{ background: '#f0ecfd', fontWeight: 800 }}>
                  <td colSpan={7} style={{ padding: '8px 10px', fontWeight: 800, color: '#4f46e5', borderLeft: '1px solid #e0d5f5' }}>
                    TOTALS — {rows.length} shown of {totalCount}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', borderLeft: '1px solid #e0d5f5' }}>
                    {rows.reduce((s,r)=>s+r.am,0)}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', borderLeft: '1px solid #e0d5f5' }}>
                    {rows.reduce((s,r)=>s+r.recruit,0).toLocaleString()}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: '#c41e3a', borderLeft: '1px solid #e0d5f5' }}>
                    {totalPSBV.toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: '#0369a1', borderLeft: '1px solid #e0d5f5' }}>
                    {rows.reduce((s,r)=>s+r.pgbv,0).toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', color: '#4f46e5', borderLeft: '1px solid #e0d5f5' }}>
                    {totalGBV.toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: 8, fontSize: '0.72rem', color: '#94a3b8', textAlign: 'right' }}>
        💡 PSBV = Personal Sales BV · PGBV = Personal Group BV (own + direct recruits) · GBV = Full Group BV (all downline) · Click a row to expand
      </div>
    </div>
  );
}

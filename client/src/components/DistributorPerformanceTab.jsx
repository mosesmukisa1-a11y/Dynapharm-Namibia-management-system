import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { formatCurrency, formatDate, BRANCHES } from '../lib/constants';
import { Card, CardHeader, CardBody, Badge, LoadingSpinner, Table, Input } from './ui';
import NetworkReportTab from './NetworkReportTab';

// ─── PDF helpers ─────────────────────────────────────────────────────────────
function dpDoc(title, body) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; padding: 28px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #c41e3a; padding-bottom: 12px; margin-bottom: 18px; }
    .company { color: #c41e3a; font-weight: 900; font-size: 16px; }
    .title { font-size: 14px; font-weight: 800; color: #8b0000; margin-top: 4px; }
    .meta { text-align: right; color: #64748b; font-size: 10px; line-height: 1.7; }
    .section { margin-bottom: 16px; }
    .section-title { font-size: 9px; font-weight: 800; color: #c41e3a; text-transform: uppercase; letter-spacing: .12em; margin-bottom: 8px; }
    .info-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; margin-bottom: 14px; }
    .info-box { background: #fdf7f8; border: 1px solid #f0e8ea; border-radius: 6px; padding: 8px 12px; }
    .info-label { font-size: 9px; color: #94a3b8; text-transform: uppercase; font-weight: 700; }
    .info-value { font-size: 13px; font-weight: 800; color: #1e293b; margin-top: 2px; }
    .info-value.red { color: #c41e3a; }
    .info-value.green { color: #166534; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th { background: #c41e3a; color: #fff; font-weight: 700; padding: 7px 8px; text-align: left; font-size: 10px; }
    td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; font-size: 10px; }
    tr:nth-child(even) td { background: #fdf7f8; }
    .total-row td { font-weight: 800; background: #fff0f3 !important; border-top: 2px solid #fecaca; }
    .badge { display:inline-block; padding:1px 7px; border-radius:20px; font-weight:700; font-size:9px; border:1px solid; }
    .badge-green { background:#f0fdf4; color:#166534; border-color:#bbf7d0; }
    .badge-red { background:#fef2f2; color:#c41e3a; border-color:#fecaca; }
    .badge-amber { background:#fffbeb; color:#92400e; border-color:#fcd34d; }
    .print-btn { position:fixed; top:12px; right:12px; background:#c41e3a; color:#fff; border:none; padding:8px 18px; border-radius:8px; font-weight:700; cursor:pointer; font-size:12px; }
    @media print { .print-btn { display:none; } body { padding:10px; } }
  </style></head><body>
  <button class="print-btn" onclick="window.print()">🖨️ Print</button>
  ${body}
  </body></html>`);
  win.document.close();
}

function headerHtml(title, subtitle = '') {
  return `<div class="header">
    <div><div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div><div class="title">${title}</div>${subtitle ? `<div style="color:#64748b;font-size:10px;margin-top:3px">${subtitle}</div>` : ''}</div>
    <div class="meta">Generated: ${new Date().toLocaleDateString('en-NA', { day: '2-digit', month: 'long', year: 'numeric' })}<br>Time: ${new Date().toLocaleTimeString('en-NA', { hour: '2-digit', minute: '2-digit' })}<br>Dynapharm Health Management System</div>
  </div>`;
}

export function printIndividualDistributorReport(dist, sales, branch) {
  const ds = sales.filter(s => {
    const ref = s.distributorReferral || s.metadata?.distributorReferral || null;
    return ref && (ref.distributorId === dist.id || ref.distributorCode === dist.distributor_code || ref.distributorName === dist.distributor_name);
  });
  const memberSales = sales.filter(s => (s.customerType || s.customer_type) === 'member' && (s.customerName || s.customer_name || '').toLowerCase().includes((dist.distributor_name || '').toLowerCase().split(' ')[0]));
  const totalBV = ds.reduce((sum, s) => sum + Number(s.totalBV || s.bv || s.total_bv || 0), 0);
  const totalRefSales = ds.reduce((sum, s) => sum + Number(s.total || s.totalAmount || 0), 0);
  const totalMemberSales = memberSales.reduce((sum, s) => sum + Number(s.total || s.totalAmount || 0), 0);
  const uniqueReferrals = new Set(ds.map(s => s.customerName || s.customer_name)).size;

  const refRows = ds.slice(0, 50).map(s => `<tr>
    <td>${s.saleNumber || s.id || '-'}</td>
    <td>${s.customerName || s.customer_name || 'Walk-in'}</td>
    <td>${s.paymentMethod || s.payment_method || '-'}</td>
    <td style="font-weight:700;color:#166534">N$ ${Number(s.total || 0).toFixed(2)}</td>
    <td style="font-weight:700;color:#1e40af">${Number(s.totalBV || s.bv || 0).toFixed(1)} BV</td>
    <td>${s.timestamp ? new Date(s.timestamp).toLocaleDateString('en-NA') : '-'}</td>
  </tr>`).join('');

  dpDoc(`Distributor Performance — ${dist.distributor_name}`, `
    ${headerHtml('👤 Distributor Performance Report', (branch || dist.branch || '') + ' Branch')}
    <div class="section">
      <div class="section-title">Distributor Profile</div>
      <div class="info-grid">
        <div class="info-box"><div class="info-label">Full Name</div><div class="info-value">${dist.distributor_name || '-'}</div></div>
        <div class="info-box"><div class="info-label">NB / Distributor Code</div><div class="info-value red">${dist.distributor_code || '-'}</div></div>
        <div class="info-box"><div class="info-label">Branch</div><div class="info-value">${dist.branch || '-'}</div></div>
        <div class="info-box"><div class="info-label">Phone</div><div class="info-value">${dist.mobile_no || dist.phone || '-'}</div></div>
        <div class="info-box"><div class="info-label">Email</div><div class="info-value">${dist.email || '-'}</div></div>
        <div class="info-box"><div class="info-label">Status</div><div class="info-value"><span class="badge badge-${dist.status === 'active' ? 'green' : 'amber'}">${(dist.status || 'active').toUpperCase()}</span></div></div>
        <div class="info-box"><div class="info-label">Joined</div><div class="info-value">${dist.created_at ? new Date(dist.created_at).toLocaleDateString('en-NA') : '-'}</div></div>
        <div class="info-box"><div class="info-label">Commission Rate</div><div class="info-value">${dist.commission_rate || 0}%</div></div>
        <div class="info-box"><div class="info-label">Membership Type</div><div class="info-value">${dist.membership_type || dist.entity_type || 'Individual'}</div></div>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Performance Summary</div>
      <div class="info-grid">
        <div class="info-box"><div class="info-label">Total BV Accumulated</div><div class="info-value red">${totalBV.toFixed(1)} BV</div></div>
        <div class="info-box"><div class="info-label">Referral Sales Count</div><div class="info-value">${ds.length}</div></div>
        <div class="info-box"><div class="info-label">Unique Referrals</div><div class="info-value green">${uniqueReferrals}</div></div>
        <div class="info-box"><div class="info-label">Referral Sales Total</div><div class="info-value green">N$ ${totalRefSales.toFixed(2)}</div></div>
        <div class="info-box"><div class="info-label">Member Consultations</div><div class="info-value">${memberSales.length}</div></div>
        <div class="info-box"><div class="info-label">Member Sales Total</div><div class="info-value green">N$ ${totalMemberSales.toFixed(2)}</div></div>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Referral Sales History (last 50)</div>
      <table><thead><tr><th>Receipt #</th><th>Customer</th><th>Payment</th><th>Sale Amount</th><th>BV</th><th>Date</th></tr></thead>
      <tbody>${refRows || '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:16px">No referral sales recorded</td></tr>'}</tbody>
      ${ds.length > 0 ? `<tfoot><tr class="total-row"><td colspan="3"><strong>TOTAL</strong></td><td><strong>N$ ${totalRefSales.toFixed(2)}</strong></td><td><strong>${totalBV.toFixed(1)} BV</strong></td><td></td></tr></tfoot>` : ''}
      </table>
    </div>
    <div style="margin-top:24px;display:grid;grid-template-columns:1fr 1fr;gap:24px;">
      <div style="border-top:2px solid #c41e3a;padding-top:6px"><div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase">Distributor Signature</div><div style="margin-top:28px;font-size:9px;color:#94a3b8">${dist.distributor_name || ''}</div></div>
      <div style="border-top:2px solid #c41e3a;padding-top:6px"><div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase">Branch Manager Signature</div><div style="margin-top:28px;font-size:9px;color:#94a3b8">Date: ___________________</div></div>
    </div>
  `);
}

export function printAllBranchDistributorsReport(distributors, sales, branch) {
  const rows = distributors.map(dist => {
    const ds = sales.filter(s => {
      const ref = s.distributorReferral || s.metadata?.distributorReferral || null;
      return ref && (ref.distributorId === dist.id || ref.distributorCode === dist.distributor_code || ref.distributorName === dist.distributor_name);
    });
    const totalBV = ds.reduce((sum, s) => sum + Number(s.totalBV || s.bv || s.total_bv || 0), 0);
    const totalSales = ds.reduce((sum, s) => sum + Number(s.total || s.totalAmount || 0), 0);
    const uniqueReferrals = new Set(ds.map(s => s.customerName || s.customer_name)).size;
    return { dist, ds, totalBV, totalSales, uniqueReferrals };
  }).sort((a, b) => b.totalBV - a.totalBV);

  const grandBV = rows.reduce((s, r) => s + r.totalBV, 0);
  const grandSales = rows.reduce((s, r) => s + r.totalSales, 0);
  const grandReferrals = rows.reduce((s, r) => s + r.uniqueReferrals, 0);

  const tableRows = rows.map((r, i) => `<tr>
    <td>${i + 1}</td>
    <td><strong>${r.dist.distributor_name || '-'}</strong></td>
    <td class="font-mono">${r.dist.distributor_code || '-'}</td>
    <td>${r.dist.branch || '-'}</td>
    <td><span class="badge badge-${r.dist.status === 'active' ? 'green' : 'amber'}">${(r.dist.status || 'active').toUpperCase()}</span></td>
    <td style="text-align:center;font-weight:700;color:#1e40af">${r.uniqueReferrals}</td>
    <td style="text-align:right;font-weight:700;color:#166534">N$ ${r.totalSales.toFixed(2)}</td>
    <td style="text-align:right;font-weight:700;color:#c41e3a">${r.totalBV.toFixed(1)}</td>
  </tr>`).join('');

  dpDoc(`Branch Distributors Performance — ${branch || 'All Branches'}`, `
    ${headerHtml('📊 Branch Distributors Performance Report', branch ? `${branch} Branch — ${distributors.length} Distributors` : `All Branches — ${distributors.length} Distributors`)}
    <div class="section">
      <div class="section-title">Summary</div>
      <div class="info-grid">
        <div class="info-box"><div class="info-label">Total Distributors</div><div class="info-value">${distributors.length}</div></div>
        <div class="info-box"><div class="info-label">Total BV Accumulated</div><div class="info-value red">${grandBV.toFixed(1)} BV</div></div>
        <div class="info-box"><div class="info-label">Total Referral Sales</div><div class="info-value green">N$ ${grandSales.toFixed(2)}</div></div>
        <div class="info-box"><div class="info-label">Total Unique Referrals</div><div class="info-value">${grandReferrals}</div></div>
        <div class="info-box"><div class="info-label">Active Distributors</div><div class="info-value green">${distributors.filter(d => d.status === 'active' || !d.status).length}</div></div>
        <div class="info-box"><div class="info-label">Report Period</div><div class="info-value">All Time</div></div>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Distributor Performance Rankings</div>
      <table><thead><tr><th>#</th><th>Distributor Name</th><th>Code</th><th>Branch</th><th>Status</th><th style="text-align:center">Referrals</th><th style="text-align:right">Sales Total</th><th style="text-align:right">BV</th></tr></thead>
      <tbody>${tableRows || '<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:16px">No distributors</td></tr>'}</tbody>
      <tfoot><tr class="total-row"><td colspan="5"><strong>TOTALS</strong></td><td style="text-align:center"><strong>${grandReferrals}</strong></td><td style="text-align:right"><strong>N$ ${grandSales.toFixed(2)}</strong></td><td style="text-align:right"><strong>${grandBV.toFixed(1)}</strong></td></tr></tfoot>
      </table>
    </div>
  `);
}

const INITIAL_LIMIT = 300;

// ─── Main Component ────────────────────────────────────────────────────────────
export default function DistributorPerformanceTab({ branchFilter = null, title = 'Distributor Performance' }) {
  const [viewMode, setViewMode] = useState('performance'); // 'performance' | 'gmreport'
  const [distributors, setDistributors] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const [branchSel, setBranchSel] = useState(branchFilter || '');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [sortBy, setSortBy] = useState('name');
  const [totalCount, setTotalCount] = useState(null);
  const [isServerSearch, setIsServerSearch] = useState(false);
  const searchTimer = useRef(null);

  const loadInitial = useCallback(() => {
    setLoading(true);
    setSearch('');
    setIsServerSearch(false);
    const branchParam = branchFilter ? `&branch=${encodeURIComponent(branchFilter)}` : '';
    Promise.all([
      api.get(`/distributors?limit=${INITIAL_LIMIT}${branchParam}`).catch(() => []),
      api.branch.walkinSales(branchFilter ? `branch=${encodeURIComponent(branchFilter)}` : '').catch(() => []),
      api.get('/distributors?limit=1').then(r => null).catch(() => null),
    ]).then(([d, s]) => {
      const distList = Array.isArray(d) ? d : d.distributors || [];
      setDistributors(distList);
      setSales(Array.isArray(s) ? s : s.sales || []);
    }).finally(() => setLoading(false));
  }, [branchFilter]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  // Server-side search when user types (debounced)
  useEffect(() => {
    if (!search.trim()) {
      if (isServerSearch) loadInitial();
      return;
    }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      if (search.length < 2) return;
      setSearching(true);
      setIsServerSearch(true);
      try {
        const branchParam = branchFilter ? `&branch=${encodeURIComponent(branchFilter)}` : '';
        const res = await api.get(`/distributors?search=${encodeURIComponent(search)}${branchParam}&limit=200`);
        const list = Array.isArray(res) ? res : res.distributors || [];
        setDistributors(list);
      } catch {
        // keep existing list
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search, branchFilter, isServerSearch, loadInitial]);

  const perf = useMemo(() => {
    return distributors.map(dist => {
      const refSales = sales.filter(s => {
        const ref = s.distributorReferral || (s.metadata && s.metadata.distributorReferral) || null;
        if (!ref) return false;
        return (ref.distributorId && ref.distributorId === dist.id) ||
          (ref.distributorCode && ref.distributorCode === dist.distributor_code) ||
          (ref.distributorName && ref.distributorName === dist.distributor_name);
      });
      const totalBV = refSales.reduce((s, r) => s + Number(r.totalBV || r.bv || r.total_bv || 0), 0);
      const totalSales = refSales.reduce((s, r) => s + Number(r.total || r.totalAmount || 0), 0);
      const referrals = new Set(refSales.map(s => s.customerName || s.customer_name || s.clientId).filter(Boolean)).size;
      const lastSale = refSales.reduce((latest, s) => {
        const d = new Date(s.timestamp || s.created_at || 0);
        return !latest || d > latest ? d : latest;
      }, null);
      return { ...dist, _refSales: refSales, _totalBV: totalBV, _totalSales: totalSales, _referrals: referrals, _lastSale: lastSale };
    });
  }, [distributors, sales]);

  const filtered = useMemo(() => {
    let list = perf;
    if (branchSel) list = list.filter(d => !d.branch || d.branch === branchSel);
    if (statusFilter) list = list.filter(d => (d.status || 'active') === statusFilter);
    const sortKey = sortBy === 'bv' ? '_totalBV' : sortBy === 'sales' ? '_totalSales' : sortBy === 'referrals' ? '_referrals' : 'distributor_name';
    if (sortBy === 'name') return [...list].sort((a, b) => (a.distributor_name || '').localeCompare(b.distributor_name || ''));
    return [...list].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));
  }, [perf, branchSel, statusFilter, sortBy]);

  const totalBV = filtered.reduce((s, d) => s + d._totalBV, 0);
  const totalSales = filtered.reduce((s, d) => s + d._totalSales, 0);
  const totalReferrals = filtered.reduce((s, d) => s + d._referrals, 0);
  const activeCount = filtered.filter(d => d.status === 'active' || !d.status).length;

  if (loading && viewMode === 'performance') return <LoadingSpinner />;

  // ── GM Report view ─────────────────────────────────────────────────────────
  if (viewMode === 'gmreport') {
    return (
      <div>
        <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
          <button
            onClick={() => setViewMode('performance')}
            style={{ padding: '7px 18px', background: '#fff', color: '#c41e3a', border: '1.5px solid #c41e3a', borderRadius: 99, fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer' }}>
            ← Back to Performance View
          </button>
        </div>
        <NetworkReportTab
          branchFilter={branchFilter}
          areaLabel={branchFilter || 'All Branches'}
          title="📊 Distributor Monthly Activity (GM Report)"
        />
      </div>
    );
  }

  const sL = (txt) => (
    <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '.12em', color: '#c41e3a', textTransform: 'uppercase', marginBottom: 8 }}>{txt}</div>
  );

  const statCard = (label, value, sub, color = '#c41e3a') => (
    <div style={{ background: '#fff', border: '1.5px solid #f0e8ea', borderRadius: 14, padding: '14px 16px', boxShadow: '0 2px 8px rgba(196,30,58,0.06)' }}>
      <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1.45rem', fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="rounded-xl p-5 mb-5 flex justify-between items-center flex-wrap gap-3"
        style={{ background: 'linear-gradient(135deg,#c41e3a 0%,#8b0000 100%)', boxShadow: '0 4px 20px rgba(196,30,58,0.28)' }}>
        <div>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.15em', marginBottom: 4 }}>Branch Operations</p>
          <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>👥 {title}</h3>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem', marginTop: 4, margin: 0 }}>BVs · Referrals · Sales · Commission Performance</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setViewMode('gmreport')}
            style={{ padding: '9px 18px', background: '#fff3', color: '#fff', border: '1px solid rgba(255,255,255,0.5)', borderRadius: '99px', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer' }}>
            📊 GM Report View
          </button>
          <button onClick={loadInitial}
            style={{ padding: '9px 18px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '99px', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer' }}>
            🔄 Refresh
          </button>
          <button onClick={() => printAllBranchDistributorsReport(filtered, sales, branchSel || branchFilter || '')}
            style={{ padding: '9px 18px', background: '#fff', color: '#c41e3a', border: 'none', borderRadius: '99px', fontWeight: 700, fontSize: '0.84rem', cursor: 'pointer' }}>
            📄 Print All Report
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10, marginBottom: 18 }}>
        {statCard('Distributors Loaded', filtered.length, isServerSearch ? 'from search results' : `of 12,429 total in DB`, '#1e293b')}
        {statCard('Active (Loaded)', activeCount, 'in current view', '#166534')}
        {statCard('Total BV', totalBV.toFixed(1), 'accumulated from referrals', '#c41e3a')}
        {statCard('Referral Sales', formatCurrency(totalSales), 'via distributor referrals', '#166534')}
        {statCard('Total Referrals', totalReferrals, 'unique customers referred', '#1e40af')}
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', border: '1.5px solid #f0e8ea', borderRadius: 14, padding: '14px 16px', marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: 220 }}>
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#c41e3a', fontSize: '0.87rem', pointerEvents: 'none' }}>{searching ? '⏳' : '🔍'}</span>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, NB code, phone or email…"
            style={{ width: '100%', padding: '8px 12px 8px 32px', border: `1.5px solid ${searching ? '#fcd34d' : '#e8d5d8'}`, borderRadius: 9, fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', transition: 'border-color .2s' }} />
          {search && (
            <button onClick={() => { setSearch(''); if (isServerSearch) loadInitial(); }}
              style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1rem', padding: 0 }}>×</button>
          )}
        </div>
        {!branchFilter && (
          <select value={branchSel} onChange={e => setBranchSel(e.target.value)}
            style={{ padding: '8px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.85rem', outline: 'none', background: '#fff', color: '#374151' }}>
            <option value="">All Branches</option>
            {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ padding: '8px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.85rem', outline: 'none', background: '#fff', color: '#374151' }}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ padding: '8px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.85rem', outline: 'none', background: '#fff', color: '#374151' }}>
          <option value="bv">Sort: Highest BV</option>
          <option value="sales">Sort: Highest Sales</option>
          <option value="referrals">Sort: Most Referrals</option>
          <option value="name">Sort: Name A-Z</option>
        </select>
      </div>

      {/* Main table */}
      <div style={{ background: '#fff', border: '1.5px solid #f0e8ea', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(196,30,58,0.05)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0e8ea', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.92rem' }}>
            Distributor Performance
            <span style={{ marginLeft: 8, fontWeight: 600, color: '#c41e3a' }}>({filtered.length} shown)</span>
            {!isServerSearch && !search && (
              <span style={{ marginLeft: 6, fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }}>— First {INITIAL_LIMIT} of 12,429 · Search to find more</span>
            )}
            {isServerSearch && search && (
              <span style={{ marginLeft: 6, fontSize: '0.72rem', color: '#1e40af', fontWeight: 600 }}>{searching ? '— Searching…' : `— Search results for "${search}"`}</span>
            )}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Click a row to view full profile</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fdf7f8' }}>
                {['#', 'Distributor', 'Code', 'Branch', 'Status', 'Referrals', 'Referral Sales', 'Total BV', 'Commission %', 'Last Sale', ''].map(h => (
                  <th key={h} style={{ padding: '9px 10px', fontSize: '0.7rem', fontWeight: 800, color: '#c41e3a', textTransform: 'uppercase', letterSpacing: '.08em', textAlign: h === 'Referral Sales' || h === 'Total BV' ? 'right' : 'left', borderBottom: '1.5px solid #f0e8ea', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={11} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '0.87rem' }}>No distributors match your search</td></tr>
              )}
              {filtered.map((d, i) => (
                <tr key={d.id} onClick={() => setSelected(selected?.id === d.id ? null : d)}
                  style={{ cursor: 'pointer', borderBottom: '1px solid #fdf7f8', background: selected?.id === d.id ? '#fff0f3' : i % 2 === 0 ? '#fff' : '#fdfbfb', transition: 'background .15s' }}>
                  <td style={{ padding: '9px 10px', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ padding: '9px 10px' }}>
                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.88rem' }}>{d.distributor_name || '-'}</div>
                    <div style={{ fontSize: '0.73rem', color: '#94a3b8', marginTop: 1 }}>{d.mobile_no || d.email || ''}</div>
                  </td>
                  <td style={{ padding: '9px 10px', fontFamily: 'monospace', fontSize: '0.82rem', color: '#c41e3a', fontWeight: 700 }}>{d.distributor_code || '-'}</td>
                  <td style={{ padding: '9px 10px', fontSize: '0.82rem', color: '#374151' }}>{d.branch || '-'}</td>
                  <td style={{ padding: '9px 10px' }}>
                    <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 20, fontWeight: 700, fontSize: '0.73rem', border: '1px solid', background: d.status === 'active' || !d.status ? '#f0fdf4' : '#fef2f2', color: d.status === 'active' || !d.status ? '#166534' : '#c41e3a', borderColor: d.status === 'active' || !d.status ? '#bbf7d0' : '#fecaca' }}>
                      {(d.status || 'active').toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 800, color: '#1e40af', fontSize: '0.9rem' }}>{d._referrals}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: '#166534', fontSize: '0.88rem' }}>{formatCurrency(d._totalSales)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                    <span style={{ fontWeight: 900, color: d._totalBV > 0 ? '#c41e3a' : '#94a3b8', fontSize: '0.92rem' }}>{d._totalBV.toFixed(1)}</span>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: 3 }}>BV</span>
                  </td>
                  <td style={{ padding: '9px 10px', textAlign: 'center', color: '#374151', fontSize: '0.82rem' }}>{d.commission_rate || 0}%</td>
                  <td style={{ padding: '9px 10px', fontSize: '0.78rem', color: '#64748b' }}>{d._lastSale ? d._lastSale.toLocaleDateString('en-NA') : '—'}</td>
                  <td style={{ padding: '9px 10px' }}>
                    <button onClick={e => { e.stopPropagation(); printIndividualDistributorReport(d, sales, d.branch || branchFilter || ''); }}
                      style={{ padding: '5px 10px', background: '#c41e3a', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      🖨️ PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr style={{ background: '#fff0f3', borderTop: '2px solid #fecaca' }}>
                  <td colSpan={5} style={{ padding: '9px 10px', fontWeight: 800, color: '#1e293b', fontSize: '0.82rem' }}>TOTALS ({filtered.length} distributors)</td>
                  <td style={{ padding: '9px 10px', textAlign: 'center', fontWeight: 900, color: '#1e40af' }}>{totalReferrals}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 900, color: '#166534' }}>{formatCurrency(totalSales)}</td>
                  <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 900, color: '#c41e3a' }}>{totalBV.toFixed(1)} BV</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Expanded distributor detail panel */}
      {selected && (
        <div style={{ background: '#fff', border: '2px solid #fecaca', borderRadius: 16, padding: '20px 24px', marginTop: 16, boxShadow: '0 6px 24px rgba(196,30,58,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ fontWeight: 900, color: '#c41e3a', fontSize: '1.1rem' }}>👤 {selected.distributor_name}</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>
                {selected.distributor_code && <span className="font-mono" style={{ color: '#c41e3a', fontWeight: 700, marginRight: 12 }}>NB#{selected.distributor_code}</span>}
                {selected.branch && <span style={{ marginRight: 12 }}>📍 {selected.branch}</span>}
                {selected.mobile_no && <span style={{ marginRight: 12 }}>📞 {selected.mobile_no}</span>}
                {selected.email && <span>✉️ {selected.email}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => printIndividualDistributorReport(selected, sales, selected.branch || branchFilter || '')}
                style={{ padding: '8px 16px', background: 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontWeight: 700, fontSize: '0.83rem' }}>
                🖨️ Print Individual PDF
              </button>
              <button onClick={() => setSelected(null)}
                style={{ padding: '8px 12px', background: '#fef2f2', color: '#c41e3a', border: '1px solid #fecaca', borderRadius: 9, cursor: 'pointer', fontWeight: 700, fontSize: '0.83rem' }}>
                ✕ Close
              </button>
            </div>
          </div>

          {/* Performance metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Total BV', value: `${selected._totalBV.toFixed(1)} BV`, color: '#c41e3a' },
              { label: 'Unique Referrals', value: selected._referrals, color: '#1e40af' },
              { label: 'Referral Sales', value: formatCurrency(selected._totalSales), color: '#166534' },
              { label: 'Sales Count', value: selected._refSales.length, color: '#374151' },
              { label: 'Commission Rate', value: `${selected.commission_rate || 0}%`, color: '#374151' },
              { label: 'Member Since', value: selected.created_at ? formatDate(selected.created_at) : '—', color: '#374151' },
            ].map(m => (
              <div key={m.label} style={{ background: '#fdf7f8', border: '1px solid #f0e8ea', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>{m.label}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: m.color }}>{m.value}</div>
              </div>
            ))}
          </div>

          {/* Recent referral sales */}
          {selected._refSales.length > 0 ? (
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#c41e3a', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 8 }}>Recent Referral Sales</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#c41e3a' }}>
                    {['Receipt #', 'Customer', 'Payment', 'Amount', 'BV', 'Date'].map(h => (
                      <th key={h} style={{ padding: '7px 9px', color: '#fff', fontWeight: 700, textAlign: 'left', fontSize: '0.72rem' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selected._refSales.slice(0, 10).map((s, i) => (
                    <tr key={s.id || i} style={{ borderBottom: '1px solid #fdf7f8', background: i % 2 === 0 ? '#fff' : '#fdfbfb' }}>
                      <td style={{ padding: '7px 9px', fontFamily: 'monospace', fontSize: '0.78rem', color: '#c41e3a' }}>{s.saleNumber || s.id || '-'}</td>
                      <td style={{ padding: '7px 9px' }}>{s.customerName || s.customer_name || 'Walk-in'}</td>
                      <td style={{ padding: '7px 9px', color: '#64748b' }}>{s.paymentMethod || s.payment_method || '-'}</td>
                      <td style={{ padding: '7px 9px', fontWeight: 700, color: '#166534' }}>{formatCurrency(s.total || s.totalAmount || 0)}</td>
                      <td style={{ padding: '7px 9px', fontWeight: 700, color: '#1e40af' }}>{Number(s.totalBV || s.bv || 0).toFixed(1)} BV</td>
                      <td style={{ padding: '7px 9px', color: '#64748b' }}>{s.timestamp ? new Date(s.timestamp).toLocaleDateString('en-NA') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {selected._refSales.length > 10 && <p style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', marginTop: 8 }}>Showing 10 of {selected._refSales.length} referral sales — print for full report</p>}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px', color: '#94a3b8', fontSize: '0.85rem' }}>No referral sales recorded for this distributor</div>
          )}
        </div>
      )}
    </div>
  );
}

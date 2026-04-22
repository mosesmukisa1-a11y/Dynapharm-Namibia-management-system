import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatCurrency, formatDate } from '../../lib/constants';
import { enrichProductsWithPricing, calculateCartTotals, setLivePrices } from '../../lib/pricing';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Modal, Alert } from '../../components/ui';
import { ShoppingCart, Heart, Newspaper, MessageSquare, Search, Plus, Minus, Package, Trash2, Send, User, BarChart3, ShoppingBag, Star, UserPlus, Printer, MapPin, ChevronDown, TrendingUp, Calendar, Gift, Tag, Zap, Award, Clock, Trophy, CheckCircle, AlertCircle, ChevronRight, Megaphone, Camera, Upload, QrCode, Share2, Download } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { MembershipAgreementForm } from '../../components/MembershipAgreementForm';
import NetworkReportTab from '../../components/NetworkReportTab';
import QRCodeLib from 'qrcode';

function parseItems(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function DistributorPortal() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'mybonus', label: 'My Bonus', icon: '💰' },
    { id: 'shop', label: 'Shop', icon: '🛒' },
    { id: 'register', label: 'New Member', icon: '📝' },
    { id: 'bv', label: 'BV & Profit', icon: '📈' },
    { id: 'network', label: 'My Network', icon: '🌐' },
    { id: 'statement', label: 'Statement', icon: '📄' },
    { id: 'communications', label: 'Communications', icon: '📩' },
    { id: 'checkup', label: 'Full Body Check Up', icon: '🏥' },
    { id: 'training', label: 'Training', icon: '🎓' },
    { id: 'campaigns', label: 'Campaigns', icon: '🎯' },
    { id: 'media', label: 'Media & News', icon: '📰' },
    { id: 'testimonials', label: 'Testimonials', icon: '💬' },
  ];

  return (
    <div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'mybonus' && <MyBonusTab />}
        {activeTab === 'shop' && <ShopTab />}
        {activeTab === 'register' && <NewMemberTab />}
        {activeTab === 'bv' && <BVProfitTab />}
        {activeTab === 'network' && <MyNetworkTab />}
        {activeTab === 'statement' && <StatementTab />}
        {activeTab === 'communications' && <CommunicationsTab />}
        {activeTab === 'checkup' && <CheckupTab />}
        {activeTab === 'training' && <TrainingTab />}
        {activeTab === 'campaigns' && <CampaignsTab />}
        {activeTab === 'media' && <MediaTab />}
        {activeTab === 'testimonials' && <TestimonialsTab />}
      </div>
    </div>
  );
}

function MyNetworkTab() {
  const { user } = useAuth();
  const nb = (user?.username || user?.distributor_code || user?.nb_number || '').toUpperCase();
  if (!nb) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
        Unable to determine your NB/DZ number. Please contact the branch.
      </div>
    );
  }
  return (
    <NetworkReportTab
      rootNb={nb}
      areaLabel={nb}
      title={`🌐 My Network — ${nb}`}
    />
  );
}

// ── Statement Tab ─────────────────────────────────────────────────────────
function printStatement(sectionText, nb, monthLabel) {
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Bonus Statement — ${nb} — ${monthLabel}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 10px; color: #000; background: #fff; padding: 20px; white-space: pre; }
    .print-btn { position:fixed; top:10px; right:10px; background:#c41e3a; color:#fff; border:none;
      padding:8px 18px; border-radius:8px; font-weight:700; cursor:pointer; font-size:12px;
      font-family: Arial, sans-serif; white-space: nowrap; }
    @media print { .print-btn { display:none; } body { padding: 10px; } }
  </style></head><body>
  <button class="print-btn" onclick="window.print()">🖨 Save as PDF</button>${escapeHtml(sectionText)}
  </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 500);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function StatementTab() {
  const { user } = useAuth();
  const nb = (user?.username || user?.distributor_code || user?.nb_number || '').toUpperCase();

  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [section, setSection] = useState(null);
  const [sectionMonth, setSectionMonth] = useState('');
  const [loading, setLoading] = useState(false);
  const [nbInput, setNbInput] = useState('');
  const [lookupNb, setLookupNb] = useState('');
  const [error, setError] = useState('');

  const activeNb = nb || lookupNb;

  useEffect(() => {
    api.statements.listMonths()
      .then(r => {
        const months = r.months || [];
        setAvailableMonths(months);
        if (months.length > 0 && !selectedMonth) setSelectedMonth(months[0].month);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeNb) return;
    setLoading(true);
    setError('');
    api.statements.get(activeNb, selectedMonth || undefined)
      .then(r => {
        setSection(r.section || null);
        setSectionMonth(r.label || r.month || selectedMonth || '');
      })
      .catch(() => setError('Could not load statement. Please try again.'))
      .finally(() => setLoading(false));
  }, [activeNb, selectedMonth]);

  const monthLabel = availableMonths.find(m => m.month === sectionMonth)?.label || sectionMonth;

  return (
    <div className="space-y-5">
      {!user && (
        <Card>
          <CardBody>
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Enter your NB or DZ number to view your statement</label>
                <input type="text" value={nbInput} onChange={e => setNbInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter' && nbInput.trim()) setLookupNb(nbInput.trim()); }}
                  placeholder="e.g. NB001234 or DZ001234"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <Button onClick={() => { if (nbInput.trim()) setLookupNb(nbInput.trim()); }}>Look Up</Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full">
            <h3 className="font-bold text-gray-800 flex items-center gap-2 flex-1">
              <span>📄</span> Bonus Statement
              {activeNb && <span className="text-sm font-normal text-gray-500">— {activeNb}</span>}
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              {availableMonths.length > 0 && (
                <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white">
                  {availableMonths.map(m => (
                    <option key={m.month} value={m.month}>{m.label || m.month}</option>
                  ))}
                </select>
              )}
              {section && (
                <button
                  onClick={() => printStatement(section, activeNb, monthLabel)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors shadow-sm">
                  <Printer size={12} /> Save as PDF
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {!activeNb && (
            <p className="text-center text-gray-400 py-8 text-sm">Enter your NB or DZ number above to view your statement.</p>
          )}
          {activeNb && loading && <LoadingSpinner />}
          {activeNb && !loading && error && (
            <p className="text-center text-red-500 py-6 text-sm">{error}</p>
          )}
          {activeNb && !loading && !error && availableMonths.length === 0 && (
            <div className="text-center py-10">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-gray-600 font-semibold">No Statements Available Yet</p>
              <p className="text-gray-400 text-sm mt-1">Statements are uploaded monthly by management. Check back after the month-end processing.</p>
            </div>
          )}
          {activeNb && !loading && !error && availableMonths.length > 0 && !section && (
            <div className="text-center py-10">
              <p className="text-4xl mb-3">📋</p>
              <p className="text-gray-600 font-semibold">No Statement Found for {monthLabel || selectedMonth}</p>
              <p className="text-gray-400 text-sm mt-1">Your NB/DZ code was not found in this period's statement. If you believe this is an error, please contact your branch.</p>
            </div>
          )}
          {activeNb && !loading && section && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full font-medium">
                  Period: {monthLabel}
                </span>
                <span className="text-xs text-gray-400">Scroll horizontally to see full statement</span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50">
                <pre className="p-4 text-xs leading-relaxed text-gray-800 font-mono whitespace-pre min-w-max">
                  {section}
                </pre>
              </div>
              <p className="mt-3 text-xs text-gray-400 text-center">
                Use "Save as PDF" to download an official copy of this statement.
              </p>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function periodToMonthKey(period) {
  if (!period) return '';
  const s = String(period).trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const months = { jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12' };
  const match = s.toLowerCase().match(/([a-z]+)[^0-9]*(\d{4})/);
  if (match) { const m = months[match[1].slice(0,3)]; if (m) return `${match[2]}-${m}`; }
  return s.slice(0, 7);
}

function printBonusHistory({ bonuses, filtered, publicNB, summary, dateFrom, dateTo, formatCurrency, formatDate }) {
  const range = (dateFrom || dateTo) ? ` (${dateFrom || ''}${dateFrom && dateTo ? ' – ' : ''}${dateTo || ''})` : '';
  const totalEarned = filtered.reduce((s, b) => s + Number(b.amount_earned || 0), 0);
  const totalPaid = filtered.reduce((s, b) => s + Number(b.amount_paid || 0), 0);
  const totalOutstanding = filtered.reduce((s, b) => s + Math.max(0, Number(b.amount_earned || 0) - Number(b.amount_paid || 0)), 0);

  const rows = filtered.map(b => {
    const out = Math.max(0, Number(b.amount_earned) - Number(b.amount_paid));
    const statusColor = b.status === 'paid' ? '#15803d' : b.status === 'partial' ? '#b45309' : '#dc2626';
    return `<tr>
      <td>${b.period || '—'}</td>
      <td style="text-align:right;color:#15803d;font-weight:700">${formatCurrency(b.amount_earned)}</td>
      <td style="text-align:right;color:#1d4ed8;font-weight:700">${formatCurrency(b.amount_paid)}</td>
      <td style="text-align:right;font-weight:700;color:${out > 0.01 ? '#ea580c' : '#15803d'}">${formatCurrency(out)}</td>
      <td style="color:${statusColor};font-weight:600;text-transform:uppercase;font-size:10px">${b.status || '—'}</td>
      <td>${b.paid_by_branch_id || '—'}</td>
      <td>${b.payment_date ? formatDate(b.payment_date) : '—'}</td>
    </tr>`;
  }).join('');

  const payRows = filtered.flatMap(b => (b.payments || []).map(p => `<tr>
    <td>${b.period || '—'}</td>
    <td style="text-align:right;color:#1d4ed8;font-weight:700">${formatCurrency(p.amount)}</td>
    <td>${p.branch_id || '—'}</td>
    <td>${formatDate(p.paid_at)}</td>
    <td>${p.notes || '—'}</td>
  </tr>`)).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Bonus History — ${publicNB}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; padding: 28px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #c41e3a; padding-bottom:14px; margin-bottom:18px; }
    .logo-block .company { color:#c41e3a; font-weight:900; font-size:17px; letter-spacing:1px; }
    .logo-block .sub { color:#64748b; font-size:10px; margin-top:2px; }
    .title-block { text-align:right; }
    .title-block h1 { font-size:15px; font-weight:800; color:#1e293b; }
    .title-block .nb { font-size:12px; color:#c41e3a; font-weight:700; margin-top:2px; }
    .title-block .range { font-size:10px; color:#64748b; margin-top:2px; }
    .kpi-row { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-bottom:18px; }
    .kpi { border-radius:10px; padding:10px 14px; color:#fff; }
    .kpi.green { background:linear-gradient(135deg,#16a34a,#15803d); }
    .kpi.blue { background:linear-gradient(135deg,#2563eb,#1d4ed8); }
    .kpi.orange { background:linear-gradient(135deg,#ea580c,#c2410c); }
    .kpi.gray { background:linear-gradient(135deg,#64748b,#475569); }
    .kpi .label { font-size:9px; text-transform:uppercase; letter-spacing:.5px; opacity:.85; }
    .kpi .value { font-size:18px; font-weight:900; margin-top:3px; }
    .section-title { font-size:12px; font-weight:800; color:#1e293b; margin-bottom:8px; padding-bottom:4px; border-bottom:1.5px solid #e2e8f0; margin-top:18px; }
    table { width:100%; border-collapse:collapse; font-size:10px; }
    th { background:#f8f9fa; padding:6px 8px; text-align:left; font-weight:700; font-size:9px; text-transform:uppercase; color:#64748b; border-bottom:1.5px solid #e2e8f0; }
    td { padding:6px 8px; border-bottom:1px solid #f1f5f9; }
    tr:last-child td { border-bottom:none; }
    .footer { margin-top:28px; border-top:1px solid #e2e8f0; padding-top:10px; text-align:center; color:#94a3b8; font-size:9px; }
    .print-btn { position:fixed; top:12px; right:12px; background:#c41e3a; color:#fff; border:none; padding:8px 18px; border-radius:8px; font-weight:700; cursor:pointer; font-size:12px; }
    @media print { .print-btn { display:none; } }
  </style></head><body>
  <button class="print-btn" onclick="window.print()">🖨 Print / Save PDF</button>
  <div class="header">
    <div class="logo-block">
      <div class="company">DYNAPHARM</div>
      <div class="sub">International Namibia</div>
    </div>
    <div class="title-block">
      <h1>Bonus History Statement</h1>
      <div class="nb">${publicNB}</div>
      <div class="range">${range ? 'Period: ' + range.trim() : 'All periods'} &nbsp;|&nbsp; Printed: ${new Date().toLocaleDateString('en-ZA', { year:'numeric', month:'short', day:'numeric' })}</div>
    </div>
  </div>
  <div class="kpi-row">
    <div class="kpi green"><div class="label">Total Earned</div><div class="value">${formatCurrency(totalEarned)}</div></div>
    <div class="kpi blue"><div class="label">Total Paid</div><div class="value">${formatCurrency(totalPaid)}</div></div>
    <div class="kpi ${totalOutstanding > 0 ? 'orange' : 'gray'}"><div class="label">Outstanding</div><div class="value">${formatCurrency(totalOutstanding)}</div></div>
  </div>
  <div class="section-title">Bonus Records (${filtered.length})</div>
  <table>
    <thead><tr>
      <th>Period</th><th style="text-align:right">Earned</th><th style="text-align:right">Paid</th>
      <th style="text-align:right">Outstanding</th><th>Status</th><th>Paid By</th><th>Payment Date</th>
    </tr></thead>
    <tbody>${rows || '<tr><td colspan="7" style="text-align:center;padding:14px;color:#94a3b8">No records in selected period</td></tr>'}</tbody>
  </table>
  ${payRows ? `<div class="section-title">Payment Breakdown</div>
  <table>
    <thead><tr><th>Period</th><th style="text-align:right">Amount Paid</th><th>Branch</th><th>Date</th><th>Notes</th></tr></thead>
    <tbody>${payRows}</tbody>
  </table>` : ''}
  <div class="footer">Dynapharm International Namibia &nbsp;|&nbsp; This is an official bonus statement &nbsp;|&nbsp; ${new Date().toLocaleString('en-ZA')}</div>
  </body></html>`;

  const w = window.open('', '_blank', 'width=820,height=680');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 500);
}

function MyBonusTab() {
  const { user } = useAuth();
  const [bonuses, setBonuses] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [publicNB, setPublicNB] = useState('');
  const [nbInput, setNBInput] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchBonuses = async (nb) => {
    setLoading(true);
    try {
      const result = await api.distributors.bonuses(nb || null);
      setBonuses(result.bonuses || []);
      setSummary(result.summary || null);
    } catch (err) {
      setBonuses([]); setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      const nb = user.username?.toUpperCase() || user.metadata?.nb_number || '';
      setPublicNB(nb);
      fetchBonuses(null);
    } else {
      setLoading(false);
    }
  }, [user]);

  const filtered = bonuses.filter(b => {
    const key = periodToMonthKey(b.period);
    if (dateFrom && key && key < dateFrom) return false;
    if (dateTo && key && key > dateTo) return false;
    return true;
  });

  const filteredSummary = {
    totalEarned: filtered.reduce((s, b) => s + Number(b.amount_earned || 0), 0),
    totalPaid: filtered.reduce((s, b) => s + Number(b.amount_paid || 0), 0),
    totalOutstanding: filtered.reduce((s, b) => s + Math.max(0, Number(b.amount_earned || 0) - Number(b.amount_paid || 0)), 0),
  };

  const hasOutstanding = filtered.some(b => (Number(b.amount_earned) - Number(b.amount_paid)) > 0.01);
  const isFiltered = dateFrom || dateTo;

  return (
    <div className="space-y-5">
      {!user && (
        <Card>
          <CardBody>
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Enter your NB or DZ number to view your bonus history</label>
                <input type="text" value={nbInput} onChange={e => setNBInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter' && nbInput.trim()) { setPublicNB(nbInput.trim()); fetchBonuses(nbInput.trim()); } }}
                  placeholder="e.g. NB001234 or DZ001234"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <Button onClick={() => { const nb = nbInput.trim(); if (nb) { setPublicNB(nb); fetchBonuses(nb); } }}>Look Up</Button>
            </div>
          </CardBody>
        </Card>
      )}

      {loading ? <LoadingSpinner /> : (
        <>
          {hasOutstanding && (
            <div className="p-4 bg-orange-50 border border-orange-300 rounded-xl flex items-start gap-3">
              <span className="text-2xl">🔔</span>
              <div>
                <p className="font-bold text-orange-800">You have an outstanding bonus!</p>
                <p className="text-sm text-orange-700 mt-0.5">One or more of your bonuses have not been fully paid yet. Please contact your branch to collect your bonus payment.</p>
              </div>
            </div>
          )}

          {bonuses.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl p-4 text-white bg-gradient-to-br from-green-500 to-green-700 text-center">
                <p className="text-xs opacity-80 uppercase tracking-wide">Total Earned</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(filteredSummary.totalEarned)}</p>
              </div>
              <div className="rounded-xl p-4 text-white bg-gradient-to-br from-blue-500 to-blue-700 text-center">
                <p className="text-xs opacity-80 uppercase tracking-wide">Total Paid</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(filteredSummary.totalPaid)}</p>
              </div>
              <div className={`rounded-xl p-4 text-white bg-gradient-to-br ${filteredSummary.totalOutstanding > 0 ? 'from-orange-500 to-orange-700' : 'from-gray-400 to-gray-600'} text-center`}>
                <p className="text-xs opacity-80 uppercase tracking-wide">Outstanding</p>
                <p className="text-2xl font-bold mt-1">{formatCurrency(filteredSummary.totalOutstanding)}</p>
              </div>
            </div>
          )}

          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full">
                <h3 className="font-bold text-gray-800 flex items-center gap-2 flex-1">
                  <span>💰</span> My Bonus History {publicNB && <span className="text-sm font-normal text-gray-500">— {publicNB}</span>}
                  {isFiltered && <span className="text-xs font-normal text-primary bg-primary/10 px-2 py-0.5 rounded-full">{filtered.length} of {bonuses.length}</span>}
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-gray-500 font-medium whitespace-nowrap">From</label>
                    <input type="month" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                      className="px-2 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-gray-500 font-medium whitespace-nowrap">To</label>
                    <input type="month" value={dateTo} onChange={e => setDateTo(e.target.value)}
                      className="px-2 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                  {isFiltered && (
                    <button onClick={() => { setDateFrom(''); setDateTo(''); }}
                      className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
                      Clear
                    </button>
                  )}
                  {bonuses.length > 0 && (
                    <button
                      onClick={() => printBonusHistory({ bonuses, filtered, publicNB, summary, dateFrom, dateTo, formatCurrency, formatDate })}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
                    >
                      <Printer size={12} /> Print PDF
                    </button>
                  )}
                </div>
              </div>
            </CardHeader>
            {filtered.length === 0 ? (
              <CardBody>
                <p className="text-center text-gray-400 py-6 text-sm">
                  {bonuses.length === 0 ? 'No bonus records found. Bonuses are uploaded by Finance each month.' : 'No records match the selected date range.'}
                </p>
              </CardBody>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Period</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Earned</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Paid</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Outstanding</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Paid By</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map(b => {
                      const outstanding = Number(b.amount_earned) - Number(b.amount_paid);
                      return (
                        <tr key={b.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-semibold">{b.period}</td>
                          <td className="px-4 py-3 text-right font-bold text-green-700">{formatCurrency(b.amount_earned)}</td>
                          <td className="px-4 py-3 text-right font-bold text-blue-700">{formatCurrency(b.amount_paid)}</td>
                          <td className="px-4 py-3 text-right font-bold">
                            <span className={outstanding > 0.01 ? 'text-orange-600' : 'text-green-600'}>{formatCurrency(outstanding)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={b.status === 'paid' ? 'success' : b.status === 'partial' ? 'warning' : 'danger'}>{b.status}</Badge>
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">{b.paid_by_branch_id || '—'}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{b.payment_date ? formatDate(b.payment_date) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {filtered.some(b => (b.payments || []).length > 0) && (
            <Card>
              <CardHeader><h3 className="font-bold text-gray-800">Payment Breakdown</h3></CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Period</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount Paid</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Branch</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.flatMap(b => (b.payments || []).map(p => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-semibold">{b.period}</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-700">{formatCurrency(p.amount)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{p.branch_id}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(p.paid_at)}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{p.notes || '—'}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function NewMemberTab() {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <UserPlus size={20} className="text-primary" />
        <h3 className="font-bold text-gray-800">Register a New Distributor</h3>
      </div>
      <p className="text-sm text-gray-500 mb-6">Fill in the Distributor Agreement Form below. The new member must indicate the branch where they will process their registration and payment.</p>
      <MembershipAgreementForm mode="standalone" />
    </div>
  );
}

function escHtml(str) {
  if (!str) return '-';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function printDistributorProfile(profile) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Distributor Profile - ${escHtml(profile.distributor_code)}</title>
<style>
  @page { size: A5 landscape; margin: 15mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; background: white; }
  .card { max-width: 600px; margin: 20px auto; border: 3px solid #c41e3a; border-radius: 12px; overflow: hidden; }
  .header { background: linear-gradient(135deg, #c41e3a, #8b0000); color: white; padding: 20px; display: flex; align-items: center; gap: 16px; }
  .header h1 { font-size: 16px; }
  .header p { font-size: 11px; opacity: 0.85; }
  .nb-box { background: #fff5f5; padding: 12px; text-align: center; border-bottom: 1px solid #f0d0d0; }
  .nb-box span { font-size: 28px; font-weight: bold; color: #c41e3a; letter-spacing: 3px; }
  .nb-box p { font-size: 10px; color: #999; }
  .body { padding: 20px; }
  .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; }
  .row:last-child { border-bottom: none; }
  .label { color: #888; }
  .value { font-weight: bold; color: #333; }
  .footer { background: #f8f8f8; padding: 10px; text-align: center; font-size: 9px; color: #999; }
</style></head><body>
<div class="card">
  <div class="header">
    <div>
      <h1>DYNAPHARM NAMIBIA</h1>
      <p>Distributor Profile Card</p>
    </div>
  </div>
  <div class="nb-box">
    <p>Distributor ID Number</p>
    <span>${escHtml(profile.distributor_code)}</span>
  </div>
  <div class="body">
    <div class="row"><span class="label">Full Name</span><span class="value">${escHtml(profile.distributor_name)}</span></div>
    <div class="row"><span class="label">Position</span><span class="value">${escHtml(profile.position || 'Distributor')}</span></div>
    <div class="row"><span class="label">Date Joined</span><span class="value">${escHtml(profile.date_joined)}</span></div>
    <div class="row"><span class="label">Sponsor</span><span class="value">${escHtml(profile.sponsor_code)}</span></div>
    <div class="row"><span class="label">Mobile</span><span class="value">${escHtml(profile.mobile_no)}</span></div>
    <div class="row"><span class="label">Location</span><span class="value">${escHtml(profile.location || profile.branch)}</span></div>
    <div class="row"><span class="label">Status</span><span class="value" style="color:${profile.status === 'active' ? '#27ae60' : '#e67e22'}">${escHtml((profile.status || 'active').toUpperCase())}</span></div>
  </div>
  <div class="footer">Dynapharm International Namibia &mdash; Printed ${new Date().toLocaleDateString()}</div>
</div>
</body></html>`;
  const w = window.open('', '_blank', 'width=700,height=500');
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

function DashboardTab() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [branchSales, setBranchSales] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [publicNBCode, setPublicNBCode] = useState('');
  const [nbInput, setNBInput] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [welcomeInfo, setWelcomeInfo] = useState({ isReturn: false, lastSeen: null, greeting: '' });
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrGenerating, setQrGenerating] = useState(false);
  const photoInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const qrCanvasRef = useRef(null);

  const getTimeGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const fetchByNB = async (nbCode) => {
    setLoading(true);
    try {
      const [orderData, distData, branchData] = await Promise.all([
        api.orders.list({ distributor_code: nbCode }).catch(() => []),
        api.get(`/distributors?code=${encodeURIComponent(nbCode)}`).catch(() => null),
        api.branch.walkinSalesByDistributor(nbCode).catch(() => ({ sales: [] })),
      ]);
      const all = Array.isArray(orderData) ? orderData : orderData.orders || [];
      setOrders(all);
      if (distData && distData.distributor_code) setProfile(distData);
      const sales = Array.isArray(branchData) ? branchData : branchData.sales || [];
      setBranchSales(sales);
    } catch {}
    setLoading(false);
  };

  const handlePhotoFile = async (file) => {
    if (!file || !publicNBCode) return;
    setPhotoUploading(true);
    setPhotoMenuOpen(false);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', 'distributor');
      formData.append('entityId', publicNBCode);
      const res = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: formData });
      const data = await res.json();
      if (data.photo_url || data.file_url) {
        const url = data.photo_url || data.file_url;
        setProfile(p => ({ ...(p || {}), photo_url: url }));
        localStorage.setItem(`dist_photo_${publicNBCode}`, url);
      }
    } catch {}
    setPhotoUploading(false);
  };

  useEffect(() => {
    if (user?.username) {
      const nbCode = user.username.toUpperCase();
      setPublicNBCode(nbCode);
      fetchByNB(nbCode);

      const key = `dist_last_visit_${nbCode}`;
      const last = localStorage.getItem(key);
      const now = Date.now();
      if (last) {
        const diffMs = now - Number(last);
        const diffMins = Math.floor(diffMs / 60000);
        const diffHrs = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        let lastSeen;
        if (diffMins < 1) lastSeen = 'just now';
        else if (diffMins < 60) lastSeen = `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
        else if (diffHrs < 24) lastSeen = `${diffHrs} hour${diffHrs !== 1 ? 's' : ''} ago`;
        else if (diffDays === 1) lastSeen = 'yesterday';
        else lastSeen = `${diffDays} days ago`;
        setWelcomeInfo({ isReturn: true, lastSeen, greeting: getTimeGreeting() });
      } else {
        setWelcomeInfo({ isReturn: false, lastSeen: null, greeting: getTimeGreeting() });
      }
      localStorage.setItem(key, String(now));
    } else {
      setLoading(false);
    }
  }, [user]);

  const _qrNbNumber = profile?.distributor_code || publicNBCode || '';
  const _qrFnRef = useRef(null);
  useEffect(() => {
    if (qrModalOpen && _qrNbNumber) {
      setTimeout(() => { _qrFnRef.current?.(); }, 80);
    }
  }, [qrModalOpen, _qrNbNumber, profile]);

  if (loading) return <LoadingSpinner />;

  const myOrders = orders;
  const onlineSpent = myOrders.reduce((sum, o) => sum + Number(o.total_amount || o.subtotal || 0), 0);
  const branchSpent = branchSales.reduce((sum, s) => sum + Number(s.total || s.totalAmount || 0), 0);
  const totalSpent = onlineSpent + branchSpent;
  const onlineBV = myOrders.reduce((sum, o) => {
    const items = parseItems(o.items);
    return sum + items.reduce((s, i) => s + Number(i.bv || 0) * Number(i.quantity || 1), 0);
  }, 0);
  const branchBV = branchSales.reduce((sum, s) => sum + Number(s.totalBV || s.total_bv || 0), 0);
  const totalBV = onlineBV + branchBV;

  const displayName = profile?.distributor_name || user?.full_name || publicNBCode || 'Distributor';
  const nbNumber = profile?.distributor_code || publicNBCode || '';
  const position = profile?.position || 'Distributor';
  const dateJoined = profile?.date_joined || (user?.created_at ? formatDate(user.created_at) : 'N/A');
  const initials = displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const generateQRCard = async () => {
    if (!qrCanvasRef.current || !nbNumber) return;
    setQrGenerating(true);
    try {
      const canvas = qrCanvasRef.current;
      const ctx = canvas.getContext('2d');
      const W = 400, H = 560;
      canvas.width = W;
      canvas.height = H;

      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#0b1020');
      grad.addColorStop(0.45, '#1c0b16');
      grad.addColorStop(1, '#0b1020');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = '#c41e3a';
      ctx.fillRect(0, 0, W, 5);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 21px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('DYNAPHARM', W / 2, 44);
      ctx.fillStyle = '#c41e3a';
      ctx.font = '10px Arial, sans-serif';
      ctx.fillText('INTERNATIONAL NAMIBIA', W / 2, 60);

      const photoR = 46;
      const photoCX = W / 2, photoCY = 118;

      ctx.save();
      ctx.beginPath();
      ctx.arc(photoCX, photoCY, photoR + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#c41e3a';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(photoCX, photoCY, photoR, 0, Math.PI * 2);
      ctx.clip();

      if (profile?.photo_url) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise(resolve => { img.onload = resolve; img.onerror = resolve; img.src = profile.photo_url; });
        ctx.drawImage(img, photoCX - photoR, photoCY - photoR, photoR * 2, photoR * 2);
      } else {
        const bgGrad = ctx.createLinearGradient(photoCX - photoR, photoCY - photoR, photoCX + photoR, photoCY + photoR);
        bgGrad.addColorStop(0, '#c41e3a');
        bgGrad.addColorStop(1, '#8b0000');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(photoCX - photoR, photoCY - photoR, photoR * 2, photoR * 2);
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.floor(photoR * 0.9)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(initials, photoCX, photoCY);
        ctx.textBaseline = 'alphabetic';
      }
      ctx.restore();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 17px Arial, sans-serif';
      ctx.textAlign = 'center';
      const nameLines = displayName.length > 28 ? [displayName.slice(0, 28), displayName.slice(28)] : [displayName];
      nameLines.forEach((line, i) => ctx.fillText(line, W / 2, 190 + i * 20));
      const nameBottom = 190 + nameLines.length * 20;

      ctx.fillStyle = '#c41e3a';
      ctx.font = '12px Arial, sans-serif';
      ctx.fillText(position, W / 2, nameBottom + 4);
      ctx.fillStyle = '#888888';
      ctx.font = '11px monospace';
      ctx.fillText(nbNumber, W / 2, nameBottom + 20);

      const refUrl = `${window.location.origin}/ref/${nbNumber}`;
      const qrDataUrl = await QRCodeLib.toDataURL(refUrl, {
        width: 210,
        margin: 1,
        color: { dark: '#0b1020', light: '#ffffff' },
        errorCorrectionLevel: 'H',
      });
      const qrImg = new Image();
      await new Promise(resolve => { qrImg.onload = resolve; qrImg.src = qrDataUrl; });

      const qrSize = 210;
      const qrX = W / 2 - qrSize / 2;
      const qrY = nameBottom + 32;

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12, 14);
      } else {
        ctx.rect(qrX - 6, qrY - 6, qrSize + 12, qrSize + 12);
      }
      ctx.fill();
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = '10px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Scan to shop • Book check-up • Join Dynapharm', W / 2, qrY + qrSize + 24);

      ctx.fillStyle = '#c41e3a';
      ctx.fillRect(0, H - 5, W, 5);
    } catch (e) {
      console.error('QR generation error', e);
    }
    setQrGenerating(false);
  };
  _qrFnRef.current = generateQRCard;

  const downloadQRCard = () => {
    if (!qrCanvasRef.current) return;
    const link = document.createElement('a');
    link.download = `dynapharm-qr-${nbNumber}.png`;
    link.href = qrCanvasRef.current.toDataURL('image/png');
    link.click();
  };

  const shareQRCard = async () => {
    const refUrl = `${window.location.origin}/ref/${nbNumber}`;
    if (navigator.share) {
      try {
        if (qrCanvasRef.current) {
          qrCanvasRef.current.toBlob(async (blob) => {
            const file = new File([blob], `dynapharm-qr-${nbNumber}.png`, { type: 'image/png' });
            await navigator.share({ title: `Shop with ${displayName} — Dynapharm`, text: `${displayName} invites you to Dynapharm. Scan or click to shop, book a check-up, or join!`, url: refUrl, files: navigator.canShare?.({ files: [file] }) ? [file] : undefined });
          });
        } else {
          await navigator.share({ title: `Shop with ${displayName} — Dynapharm`, url: refUrl });
        }
      } catch (_) {}
    } else {
      await navigator.clipboard.writeText(refUrl).catch(() => {});
      alert('Referral link copied to clipboard!');
    }
  };

  return (
    <div className="space-y-6">
      {!user && (
        <Card>
          <CardBody>
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Enter your NB Number to view your dashboard</label>
                <input
                  type="text"
                  value={nbInput}
                  onChange={e => setNBInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter' && nbInput.trim()) { setPublicNBCode(nbInput.trim()); fetchByNB(nbInput.trim()); } }}
                  placeholder="e.g. NB001234 or DZ001234"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                />
              </div>
              <Button onClick={() => { const nb = nbInput.trim(); if (nb) { setPublicNBCode(nb); fetchByNB(nb); } }}>Look Up</Button>
            </div>
            {publicNBCode && <p className="text-xs text-gray-500 mt-2">Showing dashboard for: <strong>{publicNBCode}</strong></p>}
          </CardBody>
        </Card>
      )}
      {/* ── Welcome Back Banner ── */}
      {user && (
        <div style={{ background: welcomeInfo.isReturn ? 'linear-gradient(135deg,#1e3a5f,#1d4ed8)' : 'linear-gradient(135deg,#166534,#15803d)', borderRadius: 14, padding: '14px 20px', color: '#fff', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 0 }}>
          <div style={{ fontSize: 32 }}>{welcomeInfo.isReturn ? '👋' : '🎉'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>
              {welcomeInfo.greeting}, {displayName}!
            </div>
            {welcomeInfo.isReturn ? (
              <div style={{ fontSize: '0.8rem', opacity: 0.85, marginTop: 2 }}>
                Welcome back — last visited <strong>{welcomeInfo.lastSeen}</strong>
              </div>
            ) : (
              <div style={{ fontSize: '0.8rem', opacity: 0.85, marginTop: 2 }}>
                Welcome to your Dynapharm distributor portal 🌟
              </div>
            )}
          </div>
          <div style={{ fontSize: '0.72rem', opacity: 0.6, textAlign: 'right', flexShrink: 0 }}>
            {new Date().toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        </div>
      )}

      <div className="bg-gradient-to-r from-primary to-primary-dark rounded-2xl p-6 text-white">
        {/* Hidden file inputs */}
        <input ref={photoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => { if (e.target.files[0]) handlePhotoFile(e.target.files[0]); e.target.value = ''; }} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="user" style={{ display: 'none' }}
          onChange={e => { if (e.target.files[0]) handlePhotoFile(e.target.files[0]); e.target.value = ''; }} />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            {/* ── Profile Photo Circle ── */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', border: '3px solid rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.2)', cursor: user ? 'pointer' : 'default', position: 'relative' }}
                onClick={() => user && setPhotoMenuOpen(o => !o)}>
                {photoUploading ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ width: 24, height: 24, border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  </div>
                ) : (profile?.photo_url) ? (
                  <img src={profile.photo_url} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <User size={32} color="white" />
                  </div>
                )}
                {/* Camera overlay badge */}
                {user && (
                  <div style={{ position: 'absolute', bottom: 2, right: 2, width: 22, height: 22, borderRadius: '50%', background: '#c41e3a', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Camera size={11} color="white" />
                  </div>
                )}
              </div>

              {/* Photo menu dropdown */}
              {photoMenuOpen && user && (
                <div style={{ position: 'absolute', top: 80, left: 0, background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', zIndex: 50, minWidth: 200, overflow: 'hidden' }}
                  onMouseLeave={() => setPhotoMenuOpen(false)}>
                  <div style={{ padding: '10px 14px', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', borderBottom: '1px solid #f1f5f9' }}>
                    Profile Photo
                  </div>
                  <button onClick={() => { setPhotoMenuOpen(false); cameraInputRef.current?.click(); }}
                    style={{ width: '100%', padding: '11px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: '0.88rem', fontWeight: 600, color: '#1e293b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Camera size={16} color="#c41e3a" /> Take Photo
                  </button>
                  <button onClick={() => { setPhotoMenuOpen(false); photoInputRef.current?.click(); }}
                    style={{ width: '100%', padding: '11px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: '0.88rem', fontWeight: 600, color: '#1e293b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid #f8fafc' }}>
                    <Upload size={16} color="#1d4ed8" /> Upload from Gallery
                  </button>
                  {profile?.photo_url && (
                    <button onClick={() => { setPhotoMenuOpen(false); setProfile(p => ({ ...p, photo_url: null })); }}
                      style={{ width: '100%', padding: '11px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: '0.88rem', fontWeight: 600, color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, borderTop: '1px solid #f8fafc' }}>
                      🗑 Remove Photo
                    </button>
                  )}
                </div>
              )}
            </div>

            <div>
              <h2 className="text-2xl font-bold">{displayName}</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className="bg-white/20 px-3 py-0.5 rounded-full text-xs font-semibold">{nbNumber}</span>
                <span className="bg-white/20 px-3 py-0.5 rounded-full text-xs font-semibold">{position}</span>
              </div>
              {user && <p style={{ fontSize: '0.72rem', opacity: 0.6, marginTop: 4 }}>Tap photo to update</p>}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {profile && (
              <button onClick={() => printDistributorProfile(profile)}
                className="flex items-center gap-1.5 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-semibold cursor-pointer transition-colors">
                <Printer size={14} /> Print Profile
              </button>
            )}
            {nbNumber && (
              <button onClick={() => setQrModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-semibold cursor-pointer transition-colors">
                <QrCode size={14} /> My QR Card
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className="bg-white/15 rounded-xl p-4 text-center">
            <p className="text-white/70 text-xs mb-1">Transactions</p>
            <p className="text-2xl font-bold">{myOrders.length + branchSales.length}</p>
          </div>
          <div className="bg-white/15 rounded-xl p-4 text-center">
            <p className="text-white/70 text-xs mb-1">Total Spent</p>
            <p className="text-2xl font-bold">{formatCurrency(totalSpent)}</p>
          </div>
          <div className="bg-white/15 rounded-xl p-4 text-center">
            <p className="text-white/70 text-xs mb-1">Total BV</p>
            <p className="text-2xl font-bold">{totalBV.toFixed(1)}</p>
          </div>
          <div className="bg-white/15 rounded-xl p-4 text-center">
            <p className="text-white/70 text-xs mb-1">Date Joined</p>
            <p className="text-lg font-bold">{dateJoined}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <h3 className="font-bold text-gray-800 flex items-center gap-2"><User size={18} /> Profile Details</h3>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500 text-sm">Full Name</span>
                <span className="font-medium text-sm">{displayName}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500 text-sm">NB Number</span>
                <span className="font-bold text-sm text-primary">{nbNumber}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500 text-sm">Position</span>
                <Badge variant="info">{position}</Badge>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500 text-sm">Date Joined</span>
                <span className="font-medium text-sm">{dateJoined}</span>
              </div>
              {profile?.sponsor_code && (
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-500 text-sm">Sponsor</span>
                  <span className="font-medium text-sm">{profile.sponsor_code}</span>
                </div>
              )}
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500 text-sm">Email</span>
                <span className="font-medium text-sm">{user?.email || profile?.email || '-'}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-500 text-sm">Status</span>
                <Badge variant={(profile?.status || 'active') === 'active' ? 'success' : 'warning'}>{profile?.status || 'active'}</Badge>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="font-bold text-gray-800 flex items-center gap-2"><ShoppingBag size={18} /> Recent Orders</h3>
          </CardHeader>
          <CardBody>
            {myOrders.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-6">No orders yet. Visit the Shop tab to place your first order.</p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {myOrders.slice(0, 10).map((order, idx) => {
                  const items = parseItems(order.items);
                  const orderBV = items.reduce((s, i) => s + Number(i.bv || 0) * Number(i.quantity || 1), 0);
                  return (
                    <div key={order.id || idx} className="border border-gray-100 rounded-lg overflow-hidden">
                      <div className="flex justify-between items-center p-3 bg-gray-50">
                        <div>
                          <p className="text-sm font-bold text-gray-800">{order.order_number || `Order #${idx + 1}`}</p>
                          <p className="text-xs text-gray-400">{formatDate(order.created_at)}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {items.length} product{items.length !== 1 ? 's' : ''} · BV: <span className="font-semibold text-blue-600">{orderBV.toFixed(1)}</span>
                            {order.delivery_method && <span className="ml-2">· {order.delivery_method}</span>}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-primary">{formatCurrency(order.total_amount || order.subtotal || 0)}</p>
                          <Badge variant={
                            order.status === 'delivered' ? 'success' :
                            order.status === 'shipped' ? 'info' :
                            order.status === 'processing' ? 'warning' : 'default'
                          }>{order.status || 'pending'}</Badge>
                          {order.payment_status === 'paid'
                            ? <p className="text-xs text-green-600 font-semibold mt-0.5">✓ Paid</p>
                            : <p className="text-xs text-orange-500 font-semibold mt-0.5">⏳ Pending</p>}
                        </div>
                      </div>
                      {items.length > 0 && (
                        <table className="w-full text-xs border-collapse">
                          <tbody>
                            {items.map((item, j) => {
                              const qty = Number(item.quantity || 1);
                              const price = Number(item.unit_price || item.dp || 0);
                              const bv = Number(item.bv || 0);
                              return (
                                <tr key={j} className={j % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                                  <td className="py-1 px-3 font-medium text-gray-800">{item.product_name || item.name || '-'}</td>
                                  <td className="py-1 px-2 text-center text-gray-600">×{qty}</td>
                                  <td className="py-1 px-2 text-right text-gray-600">{formatCurrency(price)}</td>
                                  <td className="py-1 px-2 text-right text-blue-600 text-xs">{(bv * qty).toFixed(1)} BV</td>
                                  <td className="py-1 px-3 text-right font-bold text-green-700">{formatCurrency(price * qty)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {branchSales.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="font-bold text-gray-800 flex items-center gap-2"><ShoppingBag size={18} /> Recent Branch Sales</h3>
          </CardHeader>
          <CardBody>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {branchSales.slice(0, 10).map((sale, idx) => {
                const items = Array.isArray(sale.products) ? sale.products : [];
                return (
                  <div key={sale.id || idx} className="border border-green-100 rounded-lg overflow-hidden">
                    <div className="flex justify-between items-center p-3 bg-green-50">
                      <div>
                        <p className="text-sm font-bold text-gray-800">{sale.saleNumber || sale.sale_number || `Sale #${idx + 1}`}</p>
                        <p className="text-xs text-gray-400">{formatDate(sale.sale_date || sale.timestamp || sale.created_at)}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {items.length} product{items.length !== 1 ? 's' : ''} · BV: <span className="font-semibold text-blue-600">{Number(sale.totalBV || sale.bv || 0).toFixed(1)}</span>
                          {sale.branch_id && <span className="ml-2">· {sale.branch_id}</span>}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-primary">{formatCurrency(sale.total || sale.totalAmount || 0)}</p>
                        <Badge variant="success">branch sale</Badge>
                        <p className="text-xs text-green-600 font-semibold mt-0.5">✓ Completed</p>
                      </div>
                    </div>
                    {items.length > 0 && (
                      <table className="w-full text-xs border-collapse">
                        <tbody>
                          {items.map((item, j) => {
                            const qty = Number(item.quantity || item.qty || 1);
                            const price = Number(item.unit_price || item.unitPrice || item.dpPrice || item.dp || 0);
                            const bv = Number(item.bv || 0);
                            return (
                              <tr key={j} className={j % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
                                <td className="py-1 px-3 font-medium text-gray-800">{item.product_name || item.name || '-'}</td>
                                <td className="py-1 px-2 text-center text-gray-600">×{qty}</td>
                                <td className="py-1 px-2 text-right text-gray-600">{formatCurrency(price)}</td>
                                <td className="py-1 px-2 text-right text-blue-600 text-xs">{(bv * qty).toFixed(1)} BV</td>
                                <td className="py-1 px-3 text-right font-bold text-green-700">{formatCurrency(price * qty)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h3 className="font-bold text-gray-800 flex items-center gap-2"><Star size={18} /> Quick Actions</h3>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button onClick={() => navigate('/shop')} className="p-4 bg-primary/5 rounded-xl text-center hover:bg-primary/10 transition-colors cursor-pointer">
              <ShoppingCart size={24} className="text-primary mx-auto mb-2" />
              <span className="text-sm font-medium text-gray-700">Shop Products</span>
            </button>
            <button onClick={() => navigate('/checkup')} className="p-4 bg-green-50 rounded-xl text-center hover:bg-green-100 transition-colors cursor-pointer">
              <Heart size={24} className="text-green-600 mx-auto mb-2" />
              <span className="text-sm font-medium text-gray-700">Health Check Up</span>
            </button>
            <button className="p-4 bg-blue-50 rounded-xl text-center hover:bg-blue-100 transition-colors cursor-pointer">
              <BarChart3 size={24} className="text-blue-600 mx-auto mb-2" />
              <span className="text-sm font-medium text-gray-700">BV Summary</span>
            </button>
            <button className="p-4 bg-purple-50 rounded-xl text-center hover:bg-purple-100 transition-colors cursor-pointer">
              <MessageSquare size={24} className="text-purple-600 mx-auto mb-2" />
              <span className="text-sm font-medium text-gray-700">Communications</span>
            </button>
          </div>
        </CardBody>
      </Card>

      <Modal open={qrModalOpen} onClose={() => setQrModalOpen(false)} title="My Dynapharm QR Card" size="md">
        <div className="flex flex-col items-center gap-4 py-2">
          <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' }}>
            <canvas
              ref={qrCanvasRef}
              style={{ borderRadius: 16, maxWidth: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.25)', display: 'block' }}
            />
            {qrGenerating && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.8)', borderRadius: 16 }}>
                <LoadingSpinner />
                <p className="text-sm text-gray-500 mt-2">Generating your QR card…</p>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 text-center max-w-xs">
            Share this card with clients — when they scan it, you'll be their referral for all purchases, check-ups and new registrations.
          </p>
          <div className="flex gap-3 w-full justify-center flex-wrap">
            <button
              onClick={downloadQRCard}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors shadow"
            >
              <Download size={15} /> Download PNG
            </button>
            <button
              onClick={shareQRCard}
              className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-800 rounded-xl text-sm font-semibold hover:bg-gray-200 transition-colors"
            >
              <Share2 size={15} /> Share Link
            </button>
          </div>
          <div className="w-full bg-gray-50 rounded-xl px-4 py-2.5 text-center">
            <p className="text-xs text-gray-400 mb-1">Your referral link</p>
            <p className="text-xs text-primary font-mono break-all select-all">{`${window.location.origin}/ref/${nbNumber}`}</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ShopTab() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderMode, setOrderMode] = useState('own');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('');

  const nb = (user?.username || '').toUpperCase();

  useEffect(() => {
    Promise.all([
      api.prices.list().catch(() => []),
      api.products.list().catch(() => []),
      api.branches.list().catch(() => []),
    ]).then(([priceData, prodData, branchData]) => {
      if (Array.isArray(priceData) && priceData.length > 0) setLivePrices(priceData);
      const raw = Array.isArray(prodData) ? prodData : prodData.products || [];
      setProducts(enrichProductsWithPricing(raw));
      const blist = Array.isArray(branchData) ? branchData : branchData.branches || [];
      setBranches(blist.filter(b => b.status === 'active' || !b.status));
    }).finally(() => setLoading(false));
  }, []);

  const selectedBranch = branches.find(b => b.id === selectedBranchId) || null;

  const filtered = products.filter(p => !search || (p.name || p.description || '').toLowerCase().includes(search.toLowerCase()));

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(c => (c.id || c.description) === (product.id || product.description));
      if (existing) return prev.map(c => (c.id || c.description) === (product.id || product.description) ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const updateQty = (productId, delta) => {
    setCart(prev => prev.map(c => {
      if ((c.id || c.description) === productId) {
        const newQty = c.qty + delta;
        return newQty > 0 ? { ...c, qty: newQty } : c;
      }
      return c;
    }).filter(c => c.qty > 0));
  };

  const removeFromCart = (productId) => {
    setCart(prev => prev.filter(c => (c.id || c.description) !== productId));
  };

  const cartTotals = calculateCartTotals(cart, true);

  const clientCartProfit = cart.reduce((sum, item) => {
    const product = products.find(p => (p.id || p.description) === (item.id || item.description));
    if (!product) return sum;
    return sum + ((product.cp || 0) - (product.dp || 0)) * item.qty;
  }, 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (!selectedBranchId) {
      setMessage('Error: Please select a branch where this order will be processed.');
      return;
    }
    if (orderMode === 'client' && !clientName.trim()) {
      setMessage('Error: Please enter the client name for a Client Stock order.');
      return;
    }
    setSubmitting(true);
    try {
      const branchNote = selectedBranch ? `Branch: ${selectedBranch.name}` : `Branch ID: ${selectedBranchId}`;
      if (orderMode === 'own') {
        await api.orders.create({
          customer_name: nb || 'Distributor Order',
          delivery_method: 'pickup',
          branch_id: selectedBranchId,
          subtotal: cartTotals.totalAmount,
          items: cartTotals.items.map(item => ({
            product_id: item.id,
            product_name: item.name || item.description,
            quantity: item.qty,
            unit_price: item.unitPrice,
            bv: item.bv || 0,
          })),
          customer_type: 'member',
          distributor_code: nb || undefined,
          payment_method: 'cash',
          notes: `Own Stock — Distributor purchase | ${branchNote} | Pricing: DP | Total BV: ${cartTotals.totalBV.toFixed(1)} | NB: ${nb}`,
        });
        setMessage(`Own stock order submitted to ${selectedBranch?.name || 'branch'}! They will process your order.`);
      } else {
        await api.orders.create({
          customer_name: clientName.trim(),
          customer_phone: clientPhone.trim() || undefined,
          delivery_method: 'pickup',
          branch_id: selectedBranchId,
          subtotal: cartTotals.totalAmount,
          items: cartTotals.items.map(item => ({
            product_id: item.id,
            product_name: item.name || item.description,
            quantity: item.qty,
            unit_price: item.unitPrice,
            bv: item.bv || 0,
          })),
          customer_type: 'non_member',
          distributor_code: nb || undefined,
          payment_method: 'cash',
          order_type: 'client_referral',
          notes: `Client Stock — Referred by ${nb} | ${branchNote} | Client: ${clientName.trim()}${clientPhone.trim() ? ' (' + clientPhone.trim() + ')' : ''} | Potential Profit: N$${clientCartProfit.toFixed(2)} | Total BV: ${cartTotals.totalBV.toFixed(1)} | Pricing: DP`,
        });
        setMessage(`Client order for ${clientName.trim()} submitted to ${selectedBranch?.name || 'branch'}! Your retail profit will appear in your BV & Profit tab after processing.`);
        setClientName('');
        setClientPhone('');
      }
      setCart([]);
      setShowCart(false);
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} className="mb-4">{message}</Alert>}

      {/* Branch selector — required */}
      <div className="mb-5 p-4 rounded-xl border-2 bg-gray-50" style={{ borderColor: selectedBranchId ? '#16a34a' : '#f59e0b' }}>
        <div className="flex items-center gap-2 mb-2">
          <MapPin size={18} style={{ color: selectedBranchId ? '#16a34a' : '#d97706' }} />
          <span className="font-bold text-sm text-gray-800">Processing Branch <span className="text-red-500">*</span></span>
          {selectedBranch && <span className="ml-auto text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">✓ {selectedBranch.name}</span>}
        </div>
        <p className="text-xs text-gray-500 mb-3">Select the Dynapharm branch where you will collect and pay for this order.</p>
        <div className="relative">
          <select
            value={selectedBranchId}
            onChange={e => setSelectedBranchId(e.target.value)}
            className="w-full text-sm border rounded-lg px-3 py-2.5 pr-8 appearance-none focus:outline-none focus:ring-2 focus:ring-green-400 bg-white"
            style={{ borderColor: selectedBranchId ? '#16a34a' : '#d1d5db' }}>
            <option value="">— Select a branch —</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}{b.location && b.location !== b.name ? ` (${b.location})` : ''}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Order mode selector */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <button onClick={() => { setOrderMode('own'); setCart([]); }}
          className="p-3 rounded-xl border-2 text-left cursor-pointer transition-all"
          style={{ borderColor: orderMode === 'own' ? '#c41e3a' : '#e2e8f0', background: orderMode === 'own' ? '#fff5f5' : '#fff' }}>
          <div className="flex items-center gap-2 mb-1">
            <ShoppingBag size={18} style={{ color: orderMode === 'own' ? '#c41e3a' : '#94a3b8' }} />
            <span className={`font-bold text-sm ${orderMode === 'own' ? 'text-[#c41e3a]' : 'text-gray-600'}`}>Own Stock</span>
            {orderMode === 'own' && <span className="ml-auto text-[#c41e3a] text-xs font-bold">✓</span>}
          </div>
          <p className="text-xs text-gray-500">Buy at Distributor Price (DP). BV credited to your account.</p>
        </button>
        <button onClick={() => { setOrderMode('client'); setCart([]); }}
          className="p-3 rounded-xl border-2 text-left cursor-pointer transition-all"
          style={{ borderColor: orderMode === 'client' ? '#1e40af' : '#e2e8f0', background: orderMode === 'client' ? '#eff6ff' : '#fff' }}>
          <div className="flex items-center gap-2 mb-1">
            <User size={18} style={{ color: orderMode === 'client' ? '#1e40af' : '#94a3b8' }} />
            <span className={`font-bold text-sm ${orderMode === 'client' ? 'text-blue-700' : 'text-gray-600'}`}>Client Order</span>
            {orderMode === 'client' && <span className="ml-auto text-blue-700 text-xs font-bold">✓</span>}
          </div>
          <p className="text-xs text-gray-500">Order for a client at DP. You earn the retail profit (CP − DP).</p>
        </button>
      </div>

      {/* Client details */}
      {orderMode === 'client' && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
          <p className="text-sm font-semibold text-blue-800">Client Details</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Client Full Name <span className="text-red-500">*</span></label>
              <input type="text" value={clientName} onChange={e => setClientName(e.target.value)}
                placeholder="e.g. John Nakamhela"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Client Phone (optional)</label>
              <input type="text" value={clientPhone} onChange={e => setClientPhone(e.target.value)}
                placeholder="e.g. 081 234 5678"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
          </div>
          <p className="text-xs text-blue-600">After the branch processes this order, your retail profit will appear in your BV & Profit tab.</p>
        </div>
      )}

      {/* Search + cart button */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20" />
        </div>
        <Button onClick={() => setShowCart(true)} className="relative">
          <ShoppingCart size={16} /> Cart
          {cart.length > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
              {cart.length}
            </span>
          )}
        </Button>
      </div>

      {/* Pricing mode label */}
      <div className={`mb-3 px-3 py-2 rounded-lg text-sm font-medium border ${orderMode === 'own' ? 'bg-primary/5 border-primary/20 text-primary' : 'bg-blue-50 border-blue-200 text-blue-700'}`}>
        {orderMode === 'own'
          ? 'Ordering at Distributor Price (DP) — BV earned on every product'
          : 'Ordering at DP cost for a client — you earn the CP − DP margin as retail profit'}
      </div>

      {/* Cart mini summary */}
      {cart.length > 0 && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex justify-between items-center">
            <div className="text-sm text-green-800 space-y-0.5">
              <div><strong>{cart.reduce((s, c) => s + c.qty, 0)}</strong> items &nbsp;|&nbsp; Total (DP): <strong>{formatCurrency(cartTotals.totalAmount)}</strong> &nbsp;|&nbsp; Total BV: <strong className="text-blue-700">{cartTotals.totalBV.toFixed(1)}</strong></div>
              {orderMode === 'client' && clientCartProfit > 0 && (
                <div className="text-green-700 font-semibold flex items-center gap-1"><TrendingUp size={13} /> Est. Retail Profit: {formatCurrency(clientCartProfit)}</div>
              )}
            </div>
            <Button size="sm" variant="success" onClick={() => setShowCart(true)}>View Cart</Button>
          </div>
        </div>
      )}

      {/* Product grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((product, idx) => {
          const imgSrc = (product.images && product.images.length > 0) ? (product.images[0].image_data || product.images[0].image_url || '') : '';
          const margin = (product.cp || 0) - (product.dp || 0);
          const inCart = cart.find(c => (c.id || c.description) === (product.id || product.description));
          return (
            <Card key={product.id || idx} className="hover:shadow-md transition-shadow overflow-hidden">
              {imgSrc ? (
                <img src={imgSrc} alt={product.name || product.description} className="w-full h-40 object-contain bg-gray-50" onError={e => { e.target.style.display = 'none'; }} />
              ) : (
                <div className="w-full h-40 bg-gray-50 flex items-center justify-center text-gray-300">
                  <Package size={40} />
                </div>
              )}
              <CardBody>
                <h3 className="font-semibold text-gray-900 text-sm mb-2 leading-snug">{product.name || product.description}</h3>

                {/* Price row */}
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <span className="text-base font-bold text-primary">{formatCurrency(product.dp)}</span>
                    <span className="text-xs text-gray-400 ml-1">DP</span>
                    {product.cp > product.dp && (
                      <span className="text-xs text-gray-400 ml-2">CP: {formatCurrency(product.cp)}</span>
                    )}
                  </div>
                </div>

                {/* BV + profit row */}
                <div className="flex items-center gap-2 mb-2">
                  {product.bv > 0 && (
                    <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{product.bv} BV</span>
                  )}
                  {orderMode === 'client' && margin > 0 && (
                    <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <TrendingUp size={10} /> +{formatCurrency(margin)} profit
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  {inCart ? (
                    <div className="flex items-center gap-2 flex-1">
                      <button onClick={() => updateQty(product.id || product.description, -1)}
                        className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center cursor-pointer hover:bg-gray-300">
                        <Minus size={13} />
                      </button>
                      <span className="text-sm font-bold w-5 text-center">{inCart.qty}</span>
                      <button onClick={() => updateQty(product.id || product.description, 1)}
                        className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center cursor-pointer hover:bg-gray-300">
                        <Plus size={13} />
                      </button>
                      <span className="text-xs text-gray-500 ml-1">{formatCurrency(product.dp * inCart.qty)}</span>
                    </div>
                  ) : (
                    <Button size="sm" onClick={() => addToCart(product)} className="flex-1">
                      <Plus size={14} /> Add to Cart
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {/* Cart modal */}
      <Modal open={showCart} onClose={() => setShowCart(false)}
        title={orderMode === 'own' ? 'Cart — Own Stock' : `Cart — Client Order${clientName ? ': ' + clientName : ''}`} size="lg">
        <div className="p-6">
          {cart.length === 0 ? (
            <EmptyState icon={<ShoppingCart size={48} />} title="Cart is Empty" description="Add products to your cart to place an order." />
          ) : (
            <div>
              {/* Branch & client info */}
              <div className="mb-4 space-y-2">
                {selectedBranch ? (
                  <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg border border-green-200 text-sm">
                    <MapPin size={15} className="text-green-600" />
                    <span className="font-semibold text-green-800">Processing at:</span>
                    <span className="text-green-700">{selectedBranch.name}</span>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-700 font-medium">
                    No branch selected — please select a branch before submitting.
                  </div>
                )}
                {orderMode === 'client' && (
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-sm">
                    <span className="font-semibold text-blue-800">Client:</span>{' '}
                    {clientName || <span className="text-red-500 italic">Not entered — go back and fill in client name</span>}
                    {clientPhone && <span className="text-gray-500 ml-2">({clientPhone})</span>}
                  </div>
                )}
              </div>

              {/* Line items */}
              <div className="space-y-2 mb-5">
                {cartTotals.items.map((item, idx) => {
                  const product = products.find(p => (p.id || p.description) === (item.id || item.description));
                  const profit = product ? ((product.cp || 0) - (product.dp || 0)) * item.qty : 0;
                  return (
                    <div key={idx} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 leading-snug">{item.name || item.description}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{formatCurrency(item.unitPrice)} × {item.qty} = <strong>{formatCurrency(item.lineTotal)}</strong></p>
                        <div className="flex gap-2 mt-1">
                          {item.lineBV > 0 && (
                            <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-1.5 py-0.5 rounded">{item.lineBV.toFixed(1)} BV</span>
                          )}
                          {orderMode === 'client' && profit > 0 && (
                            <span className="text-xs bg-green-100 text-green-700 font-semibold px-1.5 py-0.5 rounded">+{formatCurrency(profit)} profit</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => updateQty(item.id || item.description, -1)}
                          className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center cursor-pointer hover:bg-gray-300">
                          <Minus size={13} />
                        </button>
                        <span className="text-sm font-bold w-5 text-center">{item.qty}</span>
                        <button onClick={() => updateQty(item.id || item.description, 1)}
                          className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center cursor-pointer hover:bg-gray-300">
                          <Plus size={13} />
                        </button>
                        <button onClick={() => removeFromCart(item.id || item.description)}
                          className="ml-1 text-red-400 hover:text-red-600 cursor-pointer">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Order summary panel */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-2 mb-5">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Order Summary</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal (DP price)</span>
                  <span className="font-bold">{formatCurrency(cartTotals.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total Items</span>
                  <span className="font-semibold">{cart.reduce((s, c) => s + c.qty, 0)}</span>
                </div>
                <div className="flex justify-between text-sm border-t pt-2 mt-1">
                  <span className="text-blue-700 font-semibold flex items-center gap-1"><Star size={13} /> Total BV Earned</span>
                  <span className="font-bold text-blue-700">{cartTotals.totalBV.toFixed(1)} BV</span>
                </div>
                {orderMode === 'client' && clientCartProfit > 0 && (
                  <div className="flex justify-between text-sm border-t pt-2 mt-1">
                    <span className="text-green-700 font-semibold flex items-center gap-1"><TrendingUp size={13} /> Est. Retail Profit</span>
                    <span className="font-bold text-green-700">{formatCurrency(clientCartProfit)}</span>
                  </div>
                )}
                {orderMode === 'client' && clientCartProfit > 0 && (
                  <p className="text-xs text-gray-400 pt-1">Profit = Consumer Price (CP) − Distributor Price (DP) × quantity. Paid out by the branch after processing.</p>
                )}
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="secondary" onClick={() => setShowCart(false)}>Continue Shopping</Button>
                <Button variant="success" onClick={handleCheckout} disabled={submitting || !selectedBranchId}>
                  <Send size={14} /> {submitting ? 'Placing Order...' : orderMode === 'own' ? 'Place Own Stock Order' : 'Submit Client Order'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

function BVProfitTab() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [branchSales, setBranchSales] = useState([]);
  const [profitLedger, setProfitLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [publicNBCode, setPublicNBCode] = useState('');
  const [nbInput, setNBInput] = useState('');

  const fetchByNB = async (nbCode) => {
    setLoading(true);
    try {
      const [orderData, branchData, ledgerData] = await Promise.all([
        api.orders.list({ distributor_code: nbCode }).catch(() => []),
        api.branch.walkinSalesByDistributor(nbCode).catch(() => ({ sales: [] })),
        api.branch.distributorProfit({ distributor_nb: nbCode }).catch(() => ({ entries: [] })),
      ]);
      const all = Array.isArray(orderData) ? orderData : orderData.orders || [];
      setOrders(all);
      const sales = Array.isArray(branchData) ? branchData : branchData.sales || [];
      setBranchSales(sales);
      setProfitLedger(Array.isArray(ledgerData?.entries) ? ledgerData.entries : []);
    } catch {
      setOrders([]); setBranchSales([]); setProfitLedger([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.username) {
      const nb = user.username.toUpperCase();
      setPublicNBCode(nb);
      fetchByNB(nb);
    } else {
      setLoading(false);
    }
  }, [user]);

  if (loading) return <LoadingSpinner />;

  const monthlyData = {};
  orders.forEach(o => {
    const month = (o.created_at || '').slice(0, 7);
    if (!month) return;
    if (!monthlyData[month]) monthlyData[month] = { orders: 0, branchSales: 0, amount: 0, bv: 0 };
    monthlyData[month].orders += 1;
    monthlyData[month].amount += Number(o.total_amount || o.subtotal || 0);
    const items = parseItems(o.items);
    items.forEach(i => {
      monthlyData[month].bv += Number(i.bv || 0) * Number(i.quantity || 1);
    });
  });
  branchSales.forEach(s => {
    const date = s.sale_date || s.saleDate || s.created_at || s.timestamp || '';
    const month = date.slice(0, 7);
    if (!month) return;
    if (!monthlyData[month]) monthlyData[month] = { orders: 0, branchSales: 0, amount: 0, bv: 0 };
    monthlyData[month].branchSales += 1;
    monthlyData[month].amount += Number(s.total || s.totalAmount || 0);
    monthlyData[month].bv += Number(s.totalBV || s.bv || 0);
  });

  const months = Object.entries(monthlyData).sort((a, b) => b[0].localeCompare(a[0]));
  const totalBV = months.reduce((s, [, d]) => s + d.bv, 0);
  const totalTransactions = orders.length + branchSales.length;
  const pendingProfitTotal = profitLedger.filter(e => e.status === 'pending').reduce((s, e) => s + Number(e.profit_amount || 0), 0);
  const paidProfitTotal = profitLedger.filter(e => e.status === 'paid').reduce((s, e) => s + Number(e.profit_amount || 0), 0);

  return (
    <div className="space-y-6">
      {!user && (
        <Card>
          <CardBody>
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Enter your NB Number to view your BV & Profit</label>
                <input
                  type="text"
                  value={nbInput}
                  onChange={e => setNBInput(e.target.value.toUpperCase())}
                  onKeyDown={e => { if (e.key === 'Enter' && nbInput.trim()) { setPublicNBCode(nbInput.trim()); fetchByNB(nbInput.trim()); } }}
                  placeholder="e.g. NB001234 or DZ001234"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                />
              </div>
              <Button onClick={() => { const nb = nbInput.trim(); if (nb) { setPublicNBCode(nb); fetchByNB(nb); } }}>Look Up</Button>
            </div>
            {publicNBCode && <p className="text-xs text-gray-500 mt-2">Showing BV data for: <strong>{publicNBCode}</strong></p>}
          </CardBody>
        </Card>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total BV Earned" value={totalBV.toFixed(1)} color="blue" />
        <StatCard title="Retail Profit Collected" value={formatCurrency(paidProfitTotal)} color="green" />
        <StatCard title="Profit Pending" value={formatCurrency(pendingProfitTotal)} color="orange" />
        <StatCard title="Total Transactions" value={totalTransactions} color="purple" />
      </div>

      <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800 space-y-1">
        <p><strong>BV (Business Volume)</strong> — points accumulated from your own purchases on your NB number <em>plus</em> purchases made by non-member clients you referred to any branch.</p>
        <p><strong>Retail Profit</strong> — the difference between Consumer Price (CP) and Distributor Price (DP) on sales to non-member clients referred by you. Collected directly from the branch that processed the sale.</p>
      </div>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800 flex items-center gap-2"><BarChart3 size={18} /> Monthly BV Breakdown</h3></CardHeader>
        <CardBody>
          {months.length === 0 ? (
            <EmptyState icon={<BarChart3 size={48} />} title="No BV Recorded Yet" description="BV will appear here once branch sales or online orders are linked to your NB number — either from your own purchases or clients you referred." />
          ) : (
            <div className="space-y-3">
              {months.map(([month, data]) => (
                <div key={month} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-semibold text-gray-800">{new Date(month + '-01').toLocaleDateString('en-ZA', { year: 'numeric', month: 'long' })}</p>
                    <p className="text-xs text-gray-500">
                      {data.orders > 0 && `${data.orders} online order(s)`}
                      {data.orders > 0 && data.branchSales > 0 && ' · '}
                      {data.branchSales > 0 && `${data.branchSales} branch sale(s)`}
                      {' · '}Sales total: {formatCurrency(data.amount)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-blue-600">{data.bv.toFixed(1)} BV</p>
                    <p className="text-xs text-gray-400">{(data.orders + data.branchSales)} transaction(s)</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {(() => {
        const fmtBranch = id => {
          if (!id) return 'Unknown Branch';
          return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        };

        if (profitLedger.length === 0) {
          return (
            <Card>
              <CardHeader>
                <h3 className="font-bold text-gray-800 flex items-center gap-2">💰 Retail Profit Ledger — Referred Non-Member Sales</h3>
              </CardHeader>
              <CardBody>
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>💰</div>
                  <p style={{ fontWeight: 700, color: '#374151', margin: 0, fontSize: '1rem' }}>No profit entries recorded yet</p>
                  <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: 8, maxWidth: 400, margin: '8px auto 0' }}>
                    When a non-member client you referred makes a walk-in purchase at a branch, your retail profit (Consumer Price − Distributor Price) is recorded here. Each entry shows which branch processed the sale, the profit amount, and whether it has been collected or is still pending.
                  </p>
                </div>
              </CardBody>
            </Card>
          );
        }

        const pendingEntries = profitLedger.filter(e => e.status === 'pending');
        const paidEntries    = profitLedger.filter(e => e.status === 'paid');
        const pendingTotal   = pendingEntries.reduce((s, e) => s + Number(e.profit_amount || 0), 0);
        const paidTotal      = paidEntries.reduce((s, e) => s + Number(e.profit_amount || 0), 0);

        const byBranch = {};
        profitLedger.forEach(e => {
          const bid = e.branch_id || 'unknown';
          if (!byBranch[bid]) byBranch[bid] = { branch_id: bid, pending: 0, paid: 0, count: 0 };
          byBranch[bid].count += 1;
          if (e.status === 'pending') byBranch[bid].pending += Number(e.profit_amount || 0);
          else byBranch[bid].paid += Number(e.profit_amount || 0);
        });
        const branchList = Object.values(byBranch).sort((a, b) => b.pending - a.pending);

        return (
          <>
            {/* ── Profit Summary Cards ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
              <div style={{ background: 'linear-gradient(135deg,#c41e3a,#991b1b)', borderRadius: 12, padding: '16px 18px', color: '#fff', textAlign: 'center' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Pending Collection</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900 }}>{formatCurrency(pendingTotal)}</div>
                <div style={{ fontSize: '0.72rem', opacity: 0.8, marginTop: 2 }}>{pendingEntries.length} unpaid sale(s)</div>
              </div>
              <div style={{ background: 'linear-gradient(135deg,#166534,#15803d)', borderRadius: 12, padding: '16px 18px', color: '#fff', textAlign: 'center' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Total Paid Out</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900 }}>{formatCurrency(paidTotal)}</div>
                <div style={{ fontSize: '0.72rem', opacity: 0.8, marginTop: 2 }}>{paidEntries.length} paid sale(s)</div>
              </div>
              <div style={{ background: 'linear-gradient(135deg,#1e40af,#1d4ed8)', borderRadius: 12, padding: '16px 18px', color: '#fff', textAlign: 'center' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Total Earned</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 900 }}>{formatCurrency(pendingTotal + paidTotal)}</div>
                <div style={{ fontSize: '0.72rem', opacity: 0.8, marginTop: 2 }}>{profitLedger.length} sale(s) total</div>
              </div>
            </div>

            {/* ── By-Branch Breakdown ── */}
            <Card>
              <CardHeader>
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  🏢 Retail Profit by Branch — Collection Guide
                </h3>
                <p className="text-xs text-gray-500 mt-1">Each branch below processed a sale for a non-member client you referred. Visit or call the branch to collect your pending retail profit (CP − DP).</p>
              </CardHeader>
              <CardBody>
                {branchList.length === 0 ? (
                  <p className="text-sm text-gray-400">No branch data available.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {branchList.map(b => (
                      <div key={b.branch_id} style={{ borderRadius: 10, border: `2px solid ${b.pending > 0 ? '#fca5a5' : '#d1fae5'}`, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', flexWrap: 'wrap', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 18, background: b.pending > 0 ? '#fee2e2' : '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>
                              {b.pending > 0 ? '🏦' : '✅'}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.92rem' }}>{fmtBranch(b.branch_id)}</div>
                              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{b.count} sale(s) recorded · Branch ID: {b.branch_id}</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                            {b.pending > 0 && (
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#c41e3a', textTransform: 'uppercase' }}>To Collect</div>
                                <div style={{ fontWeight: 900, color: '#c41e3a', fontSize: '1.05rem' }}>{formatCurrency(b.pending)}</div>
                              </div>
                            )}
                            {b.paid > 0 && (
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>Paid</div>
                                <div style={{ fontWeight: 700, color: '#166534', fontSize: '1.05rem' }}>{formatCurrency(b.paid)}</div>
                              </div>
                            )}
                            {b.pending > 0 && (
                              <span style={{ padding: '4px 12px', borderRadius: 20, background: '#fef2f2', color: '#c41e3a', fontSize: '0.72rem', fontWeight: 700, border: '1.5px solid #fca5a5' }}>
                                ⏳ Pending
                              </span>
                            )}
                            {b.pending === 0 && (
                              <span style={{ padding: '4px 12px', borderRadius: 20, background: '#f0fdf4', color: '#166534', fontSize: '0.72rem', fontWeight: 700, border: '1.5px solid #86efac' }}>
                                ✅ Settled
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>

            {/* ── Detailed Ledger ── */}
            <Card>
              <CardHeader>
                <h3 className="font-bold text-gray-800 flex items-center gap-2">📋 Retail Profit Ledger — All Entries</h3>
              </CardHeader>
              <CardBody>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 700, color: '#374151' }}>Receipt</th>
                        <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 700, color: '#374151' }}>Date</th>
                        <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 700, color: '#374151' }}>Branch Source</th>
                        <th style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 700, color: '#374151' }}>Profit Amount</th>
                        <th style={{ textAlign: 'center', padding: '8px 10px', fontWeight: 700, color: '#374151' }}>Status</th>
                        <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 700, color: '#374151' }}>Paid Info</th>
                      </tr>
                    </thead>
                    <tbody>
                      {profitLedger.map((e, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: e.status === 'pending' ? '#fffbeb' : '#fff' }}>
                          <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#374151', fontSize: '0.75rem' }}>{e.sale_receipt || e.sale_id || '—'}</td>
                          <td style={{ padding: '8px 10px', color: '#64748b' }}>{e.sale_date ? new Date(e.sale_date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, background: '#eff6ff', color: '#1d4ed8', fontSize: '0.72rem', fontWeight: 600 }}>
                              🏢 {fmtBranch(e.branch_id)}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: e.status === 'paid' ? '#166534' : '#c41e3a' }}>{formatCurrency(Number(e.profit_amount))}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: e.status === 'paid' ? '#dcfce7' : '#fee2e2', color: e.status === 'paid' ? '#166534' : '#c41e3a' }}>
                              {e.status === 'paid' ? '✓ Paid' : '⏳ Pending'}
                            </span>
                          </td>
                          <td style={{ padding: '8px 10px', fontSize: '0.72rem', color: '#94a3b8' }}>
                            {e.status === 'paid' ? `${e.payment_method || ''} ${e.paid_at ? new Date(e.paid_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' }) : ''}`.trim() || '—' : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {pendingTotal > 0 && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: '0.78rem', color: '#92400e', marginTop: 14 }}>
                    ⚠️ You have <strong>{formatCurrency(pendingTotal)}</strong> pending across {branchList.filter(b => b.pending > 0).length} branch(es). Visit or call each branch above to collect your profit.
                  </div>
                )}
              </CardBody>
            </Card>
          </>
        );
      })()}

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">How BV & Profit Work</h3></CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="font-bold text-blue-800 mb-1">BV from Your Own Sales</p>
              <p className="text-blue-600">Every purchase made on your NB number — at a branch or online — earns you BV points as a member distributor.</p>
            </div>
            <div className="p-4 bg-indigo-50 rounded-lg">
              <p className="font-bold text-indigo-800 mb-1">BV from Referred Clients</p>
              <p className="text-indigo-600">When a non-member client you referred buys at a branch, those sales are also linked to your NB number and add to your total BV.</p>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="font-bold text-green-800 mb-1">Retail Profit</p>
              <p className="text-green-600">You earn the margin between Consumer Price (CP) and Distributor Price (DP) on every non-member sale made by a client you referred. Collect this from the branch that processed the sale.</p>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function CommunicationsTab() {
  const { user } = useAuth();
  const nb = (user?.username || user?.distributor_code || '').toUpperCase();

  const [activeSection, setActiveSection] = useState('overview');
  const [memberSales, setMemberSales] = useState([]);
  const [referralSales, setReferralSales] = useState([]);
  const [checkups, setCheckups] = useState([]);
  const [onlineOrders, setOnlineOrders] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-NA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const fmtCur = (n) => `N$ ${Number(n || 0).toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  useEffect(() => {
    if (!nb) { setLoading(false); return; }
    setLoading(true);
    setError('');
    Promise.all([
      // All branch sales linked to this NB (member + referral)
      api.branch.walkinSalesByDistributor(nb).then(d => Array.isArray(d) ? d : d.sales || []).catch(() => []),
      // Full body checkups booked under their NB as client_reference
      api.get(`/appointments?client_reference=${encodeURIComponent(nb)}`).then(d => Array.isArray(d) ? d : d.appointments || []).catch(() => []),
      // Online shop orders placed as this distributor
      api.orders.list({ distributor_code: nb }).then(d => Array.isArray(d) ? d : d.orders || []).catch(() => []),
      // Notifications/messages sent to this distributor (e.g. approval confirmation)
      api.get(`/notifications?recipient_type=distributor&recipient_id=${encodeURIComponent(nb)}`).then(d => Array.isArray(d) ? d : d.notifications || []).catch(() => []),
    ]).then(([allSales, apts, orders, notifs]) => {
      // Split sales: member purchases vs referral sales
      const memberBuys = allSales.filter(s => (s.distributor_nb || '').toUpperCase() === nb);
      const referrals = allSales.filter(s => (s.referral_nb || '').toUpperCase() === nb && (s.distributor_nb || '').toUpperCase() !== nb);
      setMemberSales(memberBuys);
      setReferralSales(referrals);
      setCheckups(apts);
      setOnlineOrders(orders);
      setMessages(notifs);
    }).catch(() => setError('Could not load your activity data. Please try again.'))
    .finally(() => setLoading(false));
  }, [nb]);

  if (!nb) return (
    <div className="py-12 text-center text-gray-400">
      <MessageSquare size={48} className="mx-auto mb-3 opacity-30" />
      <p>Please log in to see your activity.</p>
    </div>
  );

  if (loading) return <LoadingSpinner />;

  // Summary stats
  const totalMemberSpend = memberSales.reduce((s, r) => s + Number(r.total || 0), 0);
  const totalReferralValue = referralSales.reduce((s, r) => s + Number(r.total || 0), 0);
  const totalOnlineSpend = onlineOrders.reduce((s, o) => s + Number(o.total_amount || o.subtotal || 0), 0);
  const completedCheckups = checkups.filter(c => c.status === 'completed').length;

  const unreadMessages = messages.filter(m => !m.is_read).length;
  const sections = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'messages', label: `Messages${unreadMessages > 0 ? ` (${unreadMessages} new)` : messages.length > 0 ? ` (${messages.length})` : ''}`, icon: '📬' },
    { id: 'myPurchases', label: `My Purchases (${memberSales.length})`, icon: '🛍️' },
    { id: 'referrals', label: `Referred Clients (${referralSales.length})`, icon: '👥' },
    { id: 'checkups', label: `Checkups (${checkups.length})`, icon: '🏥' },
    { id: 'orders', label: `Online Orders (${onlineOrders.length})`, icon: '📦' },
  ];

  return (
    <div className="space-y-4">
      {error && <Alert type="error">{error}</Alert>}

      {/* Section nav */}
      <div className="flex gap-2 flex-wrap">
        {sections.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all border ${activeSection === s.id ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary'}`}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {activeSection === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard title="My Branch Purchases" value={fmtCur(totalMemberSpend)} icon={<ShoppingBag size={20} />} color="red" subtitle={`${memberSales.length} transaction${memberSales.length !== 1 ? 's' : ''}`} />
            <StatCard title="Referral Sales Value" value={fmtCur(totalReferralValue)} icon={<TrendingUp size={20} />} color="blue" subtitle={`${referralSales.length} client${referralSales.length !== 1 ? 's' : ''}`} />
            <StatCard title="Checkups Booked" value={checkups.length} icon={<Calendar size={20} />} color="green" subtitle={`${completedCheckups} completed`} />
            <StatCard title="Online Orders" value={onlineOrders.length} icon={<Package size={20} />} color="purple" subtitle={fmtCur(totalOnlineSpend)} />
          </div>

          {/* Quick activity feed — last 5 of each */}
          {referralSales.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-800 text-sm">Recent Referral Activity</h3>
                  <button onClick={() => setActiveSection('referrals')} className="text-xs text-primary font-medium cursor-pointer hover:underline">View all</button>
                </div>
              </CardHeader>
              <div className="divide-y">
                {referralSales.slice(0, 5).map((s, i) => (
                  <div key={s.id || i} className="px-4 py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{s.client_name || s.customerName || 'Walk-in Client'}</p>
                      <p className="text-xs text-gray-400">{fmtDate(s.created_at)} · {s.branch || '—'}</p>
                    </div>
                    <span className="text-sm font-bold text-green-700">{fmtCur(s.total)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {checkups.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-gray-800 text-sm">Recent Checkup Bookings</h3>
                  <button onClick={() => setActiveSection('checkups')} className="text-xs text-primary font-medium cursor-pointer hover:underline">View all</button>
                </div>
              </CardHeader>
              <div className="divide-y">
                {checkups.slice(0, 5).map((c, i) => (
                  <div key={c.id || i} className="px-4 py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{c.client_name || c.clientName || 'Client'}</p>
                      <p className="text-xs text-gray-400">{fmtDate(c.date)} · {c.branch || '—'}</p>
                    </div>
                    <Badge variant={c.status === 'completed' ? 'success' : c.status === 'cancelled' ? 'danger' : 'warning'}>
                      {c.status || 'Pending'}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {memberSales.length === 0 && referralSales.length === 0 && checkups.length === 0 && onlineOrders.length === 0 && messages.length === 0 && (
            <EmptyState icon={<BarChart3 size={48} />} title="No Activity Yet" description="Your purchases, referrals, and checkup bookings will all appear here." />
          )}
        </div>
      )}

      {/* ── MESSAGES / INBOX ── */}
      {activeSection === 'messages' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-gray-800">My Messages</h3>
              <p className="text-xs text-gray-500 mt-0.5">Notifications and messages from Dynapharm</p>
            </div>
            {unreadMessages > 0 && (
              <Badge variant="warning">{unreadMessages} unread</Badge>
            )}
          </div>
          {messages.length === 0 ? (
            <EmptyState icon={<MessageSquare size={40} />} title="No messages yet" description="Account approval confirmations and company messages will appear here." />
          ) : (
            messages.map((msg, idx) => {
              const isNew = !msg.is_read;
              const isApproval = msg.type === 'account_approved';
              return (
                <Card key={msg.id || idx} className={isNew ? 'border-l-4 border-primary' : ''}>
                  <CardBody>
                    <div className="flex items-start gap-3">
                      <span className="text-xl mt-0.5 shrink-0">
                        {isApproval ? '✅' : '📣'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h4 className="font-bold text-gray-800 text-sm">{msg.title || 'Message'}</h4>
                          {isNew && <Badge variant="warning">New</Badge>}
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed">{msg.message}</p>
                        <p className="text-xs text-gray-400 mt-2">
                          {msg.created_at ? new Date(msg.created_at).toLocaleDateString('en-NA', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                        </p>
                      </div>
                    </div>
                  </CardBody>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* ── MY BRANCH PURCHASES ── */}
      {activeSection === 'myPurchases' && (
        <Card>
          <CardHeader>
            <h3 className="font-bold text-gray-800">My Branch Purchases</h3>
            <p className="text-xs text-gray-500 mt-0.5">Sales recorded under your NB number at Dynapharm branches</p>
          </CardHeader>
          {memberSales.length === 0 ? (
            <CardBody><EmptyState icon={<ShoppingBag size={40} />} title="No branch purchases yet" description="Sales you make in person at any Dynapharm branch will appear here." /></CardBody>
          ) : (
            <div className="divide-y">
              {memberSales.map((s, i) => {
                const items = parseItems(s.items);
                return (
                  <div key={s.id || i} className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{s.receipt_number || s.id?.slice(0, 8) || 'Sale'}</p>
                        <p className="text-xs text-gray-400">{fmtDate(s.created_at)} · {s.branch || '—'}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-800">{fmtCur(s.total)}</p>
                        {s.total_bv > 0 && <p className="text-xs text-primary">{s.total_bv} BV</p>}
                      </div>
                    </div>
                    {items.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        {items.map(it => `${it.name || it.product_name || 'Item'} ×${it.quantity || 1}`).join(', ')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ── REFERRED CLIENTS ── */}
      {activeSection === 'referrals' && (
        <Card>
          <CardHeader>
            <h3 className="font-bold text-gray-800">Clients You Referred</h3>
            <p className="text-xs text-gray-500 mt-0.5">Walk-in customers who purchased at a branch using your NB as referral</p>
          </CardHeader>
          {referralSales.length === 0 ? (
            <CardBody><EmptyState icon={<User size={40} />} title="No referrals yet" description="When a client names you as their referral at any branch, their sales will appear here." /></CardBody>
          ) : (
            <div className="divide-y">
              {referralSales.map((s, i) => {
                const items = parseItems(s.items);
                return (
                  <div key={s.id || i} className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{s.client_name || s.customerName || 'Walk-in Client'}</p>
                        <p className="text-xs text-gray-400">{fmtDate(s.created_at)} · {s.branch || '—'}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-700">{fmtCur(s.total)}</p>
                        {s.total_bv > 0 && <p className="text-xs text-primary">{s.total_bv} BV</p>}
                      </div>
                    </div>
                    {items.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        {items.map(it => `${it.name || it.product_name || 'Item'} ×${it.quantity || 1}`).join(', ')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ── CHECKUPS ── */}
      {activeSection === 'checkups' && (
        <Card>
          <CardHeader>
            <h3 className="font-bold text-gray-800">Full Body Checkups</h3>
            <p className="text-xs text-gray-500 mt-0.5">Checkup appointments booked for clients you introduced to Dynapharm</p>
          </CardHeader>
          {checkups.length === 0 ? (
            <CardBody><EmptyState icon={<Calendar size={40} />} title="No checkups booked yet" description="Checkups that are linked to your NB number will appear here." /></CardBody>
          ) : (
            <div className="divide-y">
              {checkups.map((c, i) => (
                <div key={c.id || i} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{c.client_name || c.clientName || 'Client'}</p>
                    <p className="text-xs text-gray-500">{c.type || 'Full Body Checkup'}</p>
                    <p className="text-xs text-gray-400">{fmtDate(c.date)} {c.time ? `· ${c.time}` : ''} · {c.branch || '—'}</p>
                  </div>
                  <Badge variant={c.status === 'completed' ? 'success' : c.status === 'cancelled' ? 'danger' : c.status === 'confirmed' ? 'info' : 'warning'}>
                    {(c.status || 'Pending').charAt(0).toUpperCase() + (c.status || 'pending').slice(1)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
          {checkups.length > 0 && (
            <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 flex gap-4 border-t">
              <span>✅ Completed: <strong>{completedCheckups}</strong></span>
              <span>⏳ Pending: <strong>{checkups.filter(c => !['completed','cancelled'].includes(c.status)).length}</strong></span>
              <span>❌ Cancelled: <strong>{checkups.filter(c => c.status === 'cancelled').length}</strong></span>
            </div>
          )}
        </Card>
      )}

      {/* ── ONLINE ORDERS ── */}
      {activeSection === 'orders' && (
        <Card>
          <CardHeader>
            <h3 className="font-bold text-gray-800">My Online Orders</h3>
            <p className="text-xs text-gray-500 mt-0.5">Orders you placed through the Dynapharm online shop</p>
          </CardHeader>
          {onlineOrders.length === 0 ? (
            <CardBody><EmptyState icon={<Package size={40} />} title="No online orders yet" description="Orders you place in the Shop tab will appear here." /></CardBody>
          ) : (
            <div className="divide-y">
              {onlineOrders.map((o, i) => {
                const items = parseItems(o.items);
                const statusColor = { delivered: 'success', processing: 'info', pending: 'warning', cancelled: 'danger' }[o.status] || 'warning';
                return (
                  <div key={o.id || i} className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{o.order_number || o.id?.slice(0, 10) || 'Order'}</p>
                        <p className="text-xs text-gray-400">{fmtDate(o.created_at)} · {o.branch || o.delivery_branch || '—'}</p>
                      </div>
                      <div className="text-right flex flex-col items-end gap-1">
                        <p className="font-bold text-gray-800">{fmtCur(o.total_amount || o.subtotal)}</p>
                        <Badge variant={statusColor}>{o.status || 'Pending'}</Badge>
                      </div>
                    </div>
                    {items.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        {items.map(it => `${it.name || it.product_name || 'Item'} ×${it.quantity || 1}`).join(', ')}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function CheckupTab() {
  const { user } = useAuth();
  const referralNB = (user?.username || user?.distributor_code || user?.nb_number || '').toUpperCase();
  const referralName = user?.full_name || user?.name || '';

  const BRANCHES = ['Windhoek CBD', 'Hochlandpark', 'Khomasdal', 'Walvis Bay', 'Swakopmund', 'Oshakati', 'Ondangwa', 'Eenhana', 'Okahao', 'Outapi', 'Rundu', 'Katima Mulilo', 'Gobabis', 'Otjiwarongo', 'Tsumeb'];

  const toLocalDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const getTomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return toLocalDateStr(d); };
  const getTodayStr = () => toLocalDateStr(new Date());

  const [form, setForm] = useState({ full_name: '', phone: '', email: '', branch: BRANCHES[0], preferred_date: getTomorrowStr(), notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState(null);
  const [error, setError] = useState('');

  const handleBook = async () => {
    if (!form.full_name.trim() || !form.phone.trim()) { setError('Full name and phone number are required.'); return; }
    setSubmitting(true); setError('');
    try {
      const result = await api.appointments.create({
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        date: form.preferred_date || getTomorrowStr(),
        time: 'TBD',
        branch: form.branch,
        type: 'checkup',
        status: 'pending',
        notes: [form.notes.trim(), `Booked by distributor ${referralNB}${referralName ? ' (' + referralName + ')' : ''}. Client to complete full health form.`].filter(Boolean).join(' — '),
        data: JSON.stringify({ referral_nb: referralNB, referral_name: referralName, booking_source: 'distributor_portal' }),
      });
      setBooked(result);
    } catch (err) { console.error('Booking error:', err); setError(err.message || 'Booking failed. Please try again.'); }
    finally { setSubmitting(false); }
  };

  const appUrl = typeof window !== 'undefined' ? `${window.location.origin}/checkup` : '/checkup';
  const waMsg = booked ? encodeURIComponent(`Hi! I've booked you for a Full Body Health Check Up at Dynapharm ${booked.branch || form.branch}.\n\nPlease complete your health form here:\n${appUrl}\n\nYour appointment reference: ${booked.id}\n\nSee you soon! 💊`) : '';

  if (booked) {
    return (
      <div className="max-w-lg mx-auto space-y-4">
        <Card>
          <CardBody>
            <div className="text-center py-4">
              <div style={{ fontSize: '3rem', marginBottom: 8 }}>✅</div>
              <h3 className="text-xl font-bold text-gray-800 mb-1">Booking Confirmed!</h3>
              <p className="text-gray-500 text-sm mb-4">The client has been pre-booked. They need to complete their health form to finalize the appointment.</p>
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-left mb-4">
                <div className="text-xs text-gray-500 mb-1">Booking Reference</div>
                <div className="font-mono font-bold text-green-700 text-sm">{booked.id}</div>
                <div className="mt-2 text-sm text-gray-700"><strong>{booked.full_name}</strong> · {booked.phone}</div>
                <div className="text-sm text-gray-600">{booked.branch} · {booked.date}</div>
              </div>
              <p className="text-sm text-gray-600 mb-4 font-medium">Send the client their health form link via WhatsApp, email, or hand them the card at the branch:</p>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 text-xs font-mono text-gray-700 break-all">{appUrl}</div>
              <div className="flex flex-col gap-2">
                <a href={`https://wa.me/${booked.phone?.replace(/\D/g, '')}?text=${waMsg}`} target="_blank" rel="noreferrer"
                  className="block w-full py-3 rounded-xl font-bold text-white text-center" style={{ background: '#25D366', textDecoration: 'none' }}>
                  📱 Share via WhatsApp
                </a>
                <button onClick={() => { setBooked(null); setForm({ full_name: '', phone: '', email: '', branch: BRANCHES[0], preferred_date: getTomorrowStr(), notes: '' }); }}
                  className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold bg-white cursor-pointer">
                  + Book Another Client
                </button>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  const inp = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box', background: '#fff' };
  const lbl = { display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#374151', marginBottom: 4 };

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <CardBody>
          <div className="flex items-center gap-3 mb-5">
            <Heart size={32} className="text-primary flex-shrink-0" />
            <div>
              <h3 className="text-lg font-bold text-gray-800">Book a Full Body Check Up</h3>
              <p className="text-sm text-gray-500">Fill in the client's basic details. They will complete the full health form from the link you share with them.</p>
            </div>
          </div>

          {error && <div className="mb-4 p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">{error}</div>}

          <div className="space-y-4">
            <div>
              <label style={lbl}>Client Full Name *</label>
              <input style={inp} value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="e.g. Ndapandula Shikulo" />
            </div>
            <div>
              <label style={lbl}>WhatsApp / Phone Number *</label>
              <input style={inp} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+264 81 234 5678" />
            </div>
            <div>
              <label style={lbl}>Email Address (optional)</label>
              <input style={{ ...inp }} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="client@example.com" type="email" />
            </div>
            <div>
              <label style={lbl}>Preferred Branch</label>
              <select style={inp} value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Preferred Date</label>
              <input type="date" style={inp} value={form.preferred_date} min={getTodayStr()} onChange={e => setForm(f => ({ ...f, preferred_date: e.target.value }))} />
            </div>
            <div style={{ padding: 12, borderRadius: 10, background: '#f0fdf4', border: '1px solid #86efac' }}>
              <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 700, marginBottom: 2 }}>Your Referral Details (pre-filled)</div>
              <div style={{ fontSize: '0.85rem', color: '#15803d' }}>{referralNB}{referralName ? ` · ${referralName}` : ''}</div>
            </div>
            <div>
              <label style={lbl}>Additional Notes (optional)</label>
              <textarea style={{ ...inp, resize: 'none' }} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any relevant info about the client…" />
            </div>
            <Button onClick={handleBook} disabled={submitting} className="w-full">
              <Heart size={16} /> {submitting ? 'Booking…' : 'Book Health Check Up'}
            </Button>
            <p className="text-xs text-gray-400 text-center">After booking, you'll get a WhatsApp link to send to your client so they can fill in their full health history.</p>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function MediaTab() {
  const [campaigns, setCampaigns] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('all');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/campaigns?status=active').then(d => Array.isArray(d) ? d : d.campaigns || []).catch(() => []),
      api.get('/media?upload_type=training').then(d => Array.isArray(d) ? d : []).catch(() => []),
      api.get('/notifications?recipient_id=ALL&recipient_type=company').then(d => Array.isArray(d) ? d : d.notifications || []).catch(() => []),
    ]).then(([c, m, a]) => {
      setCampaigns(c);
      setMaterials(m);
      setAnnouncements(a);
    }).finally(() => setLoading(false));
  }, []);

  const isNew = (dateStr) => {
    if (!dateStr) return false;
    return (Date.now() - new Date(dateStr).getTime()) < 7 * 24 * 60 * 60 * 1000;
  };

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-NA', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  const campaignTypeLabel = (t) => ({
    buy_x_get_y: 'Buy X Get Y', discount: 'Discount', bundle: 'Bundle', points: 'Points', flash: 'Flash Sale',
  }[t] || t || 'Campaign');

  const sections = [
    { id: 'all', label: 'All' },
    { id: 'campaigns', label: `Campaigns (${campaigns.length})` },
    { id: 'training', label: `Training (${materials.length})` },
    { id: 'announcements', label: `Announcements (${announcements.length})` },
  ];

  if (loading) return <LoadingSpinner />;

  const totalItems = campaigns.length + materials.length + announcements.length;

  return (
    <div className="space-y-4">
      {/* Section filter pills */}
      <div className="flex gap-2 flex-wrap">
        {sections.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all border ${activeSection === s.id ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:border-primary'}`}>
            {s.label}
          </button>
        ))}
      </div>

      {totalItems === 0 && (
        <EmptyState icon={<Newspaper size={48} />} title="Nothing yet" description="Company news, campaigns, and training updates will appear here." />
      )}

      {/* Active Campaigns */}
      {(activeSection === 'all' || activeSection === 'campaigns') && campaigns.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wide flex items-center gap-2">
            <span>🎯</span> Active Campaigns
          </h3>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {campaigns.map(c => {
              let conditions = {};
              try { conditions = typeof c.conditions === 'string' ? JSON.parse(c.conditions || '{}') : (c.conditions || {}); } catch {}
              return (
                <Card key={c.id}>
                  <CardBody>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className="font-bold text-gray-800 text-sm leading-snug">{c.name}</h4>
                      <Badge variant="success" className="shrink-0">{campaignTypeLabel(c.campaign_type)}</Badge>
                    </div>
                    {c.description && <p className="text-xs text-gray-600 mb-2 line-clamp-2">{c.description}</p>}
                    {conditions.products_text && (
                      <p className="text-xs text-primary font-medium mb-1">Products: {conditions.products_text}</p>
                    )}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                      <span className="text-xs text-gray-400">
                        {c.branch ? `📍 ${c.branch}` : '🌍 All Branches'}
                      </span>
                      {c.end_date && (
                        <span className="text-xs font-medium text-amber-600">Ends {fmtDate(c.end_date)}</span>
                      )}
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Training Materials */}
      {(activeSection === 'all' || activeSection === 'training') && materials.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wide flex items-center gap-2">
            <span>🎓</span> Latest Training Materials
          </h3>
          <div className="space-y-2">
            {materials.map((m, i) => {
              const isVideo = (m.mime_type || '').startsWith('video/');
              const isImg = (m.mime_type || '').startsWith('image/');
              const icon = isVideo ? '🎬' : isImg ? '🖼️' : '📄';
              const newItem = isNew(m.created_at);
              return (
                <Card key={m.id || i}>
                  <CardBody>
                    <div className="flex items-center gap-3">
                      <span style={{ fontSize: 26 }}>{icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-800 text-sm">{m.entity_name || m.filename || 'Training Material'}</span>
                          {newItem && <Badge variant="success">NEW</Badge>}
                          {m.category && <Badge variant="info">{m.category}</Badge>}
                        </div>
                        {m.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{m.description}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">{fmtDate(m.created_at)}</p>
                      </div>
                      {m.file_url && (
                        <a href={m.file_url} target="_blank" rel="noreferrer"
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-white shrink-0"
                          style={{ background: '#c41e3a', textDecoration: 'none' }}>
                          {isVideo ? 'Watch' : 'Open'}
                        </a>
                      )}
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Company Announcements */}
      {(activeSection === 'all' || activeSection === 'announcements') && announcements.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-bold text-gray-700 text-sm uppercase tracking-wide flex items-center gap-2">
            <span>📢</span> Company Announcements
          </h3>
          {announcements.map((a, idx) => (
            <Card key={a.id || idx}>
              <CardBody>
                <div className="flex items-start gap-3">
                  <span className="text-xl mt-0.5">📣</span>
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-800 text-sm">{a.title || 'Announcement'}</h4>
                    <p className="text-sm text-gray-600 mt-1">{a.message || a.content}</p>
                    <p className="text-xs text-gray-400 mt-2">{fmtDate(a.created_at)}</p>
                  </div>
                  {isNew(a.created_at) && <Badge variant="success">NEW</Badge>}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Empty states for specific sections */}
      {activeSection === 'campaigns' && campaigns.length === 0 && (
        <EmptyState icon={<span style={{ fontSize: 48 }}>🎯</span>} title="No Active Campaigns" description="New promotions and offers will appear here when launched." />
      )}
      {activeSection === 'training' && materials.length === 0 && (
        <EmptyState icon={<span style={{ fontSize: 48 }}>🎓</span>} title="No Training Materials Yet" description="Training documents and videos will appear here when uploaded." />
      )}
      {activeSection === 'announcements' && announcements.length === 0 && (
        <EmptyState icon={<span style={{ fontSize: 48 }}>📢</span>} title="No Announcements" description="Company news and updates will appear here." />
      )}
    </div>
  );
}

function TestimonialsTab() {
  const [testimonials, setTestimonials] = useState([]);
  const [form, setForm] = useState({ name: '', message: '', product: '' });
  const [message, setMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name || !form.message) {
      setMessage('Error: Please fill in your name and testimonial.');
      return;
    }
    setTestimonials(prev => [...prev, { ...form, id: Date.now(), created_at: new Date().toISOString() }]);
    setMessage('Thank you for sharing your testimonial!');
    setForm({ name: '', message: '', product: '' });
  };

  return (
    <div className="space-y-6">
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'}>{message}</Alert>}

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Share Your Testimonial</h3></CardHeader>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
            <Input label="Your Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
            <Input label="Product (optional)" value={form.product} onChange={e => setForm({ ...form, product: e.target.value })} placeholder="Which product are you reviewing?" />
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Your Testimonial *</label>
              <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 min-h-[100px] resize-y"
                placeholder="Share your experience with Dynapharm products..." />
            </div>
            <Button type="submit">Submit Testimonial</Button>
          </form>
        </CardBody>
      </Card>

      {testimonials.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-bold text-gray-800">Recent Testimonials</h3>
          {testimonials.map(t => (
            <Card key={t.id}>
              <CardBody>
                <p className="text-sm text-gray-600 italic">"{t.message}"</p>
                <div className="flex justify-between items-center mt-3">
                  <p className="text-sm font-medium text-gray-800">— {t.name}</p>
                  {t.product && <Badge variant="info">{t.product}</Badge>}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignsTab() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState('active');
  const [purchaseCampaign, setPurchaseCampaign] = useState(null);
  const nb = (user?.username || '').toUpperCase();

  useEffect(() => {
    Promise.all([
      api.campaigns.list().catch(() => ({ campaigns: [] })),
      api.prices.list().catch(() => []),
      api.products.list().catch(() => []),
      api.branches.list().catch(() => []),
    ]).then(([campData, priceData, prodData, branchData]) => {
      const camps = Array.isArray(campData) ? campData : campData.campaigns || [];
      setCampaigns(camps);
      if (Array.isArray(priceData) && priceData.length > 0) setLivePrices(priceData);
      const raw = Array.isArray(prodData) ? prodData : prodData.products || [];
      setProducts(enrichProductsWithPricing(raw));
      const blist = Array.isArray(branchData) ? branchData : branchData.branches || [];
      setBranches(blist.filter(b => b.status === 'active' || !b.status));
    }).finally(() => setLoading(false));
  }, []);

  const safeJson = (val) => {
    if (!val) return {};
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch { return {}; }
  };

  const now = new Date();
  const activeCampaigns = campaigns.filter(c =>
    (c.status === 'active' || c.status === 'upcoming') &&
    c.status !== 'pending_approval' && c.status !== 'rejected'
  );
  const completedCampaigns = campaigns.filter(c => c.status === 'completed' || c.status === 'ended');

  const campaignTypeLabel = (type) => ({
    bv_achievement: { label: 'BV Achievement', color: 'bg-blue-100 text-blue-800', icon: <Trophy size={12} /> },
    elite_bingo: { label: 'Elite Bingo', color: 'bg-purple-100 text-purple-800', icon: <Zap size={12} /> },
    buy_x_get_y: { label: 'Buy & Get Free', color: 'bg-green-100 text-green-800', icon: <Gift size={12} /> },
    discount: { label: 'Discount Sale', color: 'bg-orange-100 text-orange-800', icon: <Tag size={12} /> },
    custom: { label: 'Special Campaign', color: 'bg-gray-100 text-gray-700', icon: <Megaphone size={12} /> },
  }[type] || { label: type || 'Campaign', color: 'bg-gray-100 text-gray-700', icon: <Megaphone size={12} /> });

  const isSaleCampaign = (c) => c.campaign_type === 'buy_x_get_y' || c.campaign_type === 'discount';

  const isActive = (c) => {
    const start = new Date(c.start_date);
    const end = new Date(c.end_date);
    return c.status !== 'pending_approval' && c.status !== 'rejected' && now >= start && now <= end;
  };

  const daysRemaining = (c) => {
    const end = new Date(c.end_date);
    const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    return diff;
  };

  if (loading) return <LoadingSpinner />;

  const displayed = subTab === 'active' ? activeCampaigns : completedCampaigns;

  return (
    <div>
      {/* Header */}
      <div className="mb-5 p-4 rounded-xl bg-gradient-to-r from-[#c41e3a] to-[#9b1a30] text-white">
        <div className="flex items-center gap-3 mb-1">
          <Megaphone size={22} />
          <h2 className="text-lg font-bold">Campaigns</h2>
        </div>
        <p className="text-white/80 text-sm">Participate in promotions, earn prizes, and place campaign orders directly.</p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-5">
        {[
          { id: 'active', label: 'Upcoming & Active', count: activeCampaigns.length },
          { id: 'completed', label: 'Completed', count: completedCampaigns.length },
        ].map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
              subTab === t.id
                ? 'bg-primary text-white border-primary shadow'
                : 'bg-white text-gray-600 border-gray-200 hover:border-primary/40'
            }`}>
            {t.label}
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${subTab === t.id ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Campaign list */}
      {displayed.length === 0 ? (
        <EmptyState
          icon={<Megaphone size={48} />}
          title={subTab === 'active' ? 'No Active Campaigns' : 'No Completed Campaigns'}
          description={subTab === 'active' ? 'Check back soon — new promotions will appear here.' : 'Completed campaigns will be shown here for reference.'}
        />
      ) : (
        <div className="space-y-4">
          {displayed.map(camp => {
            const type = campaignTypeLabel(camp.campaign_type);
            const conditions = safeJson(camp.conditions);
            const prize = safeJson(camp.prize);
            const active = isActive(camp);
            const days = daysRemaining(camp);
            const canOrder = isSaleCampaign(camp) && active;
            const isUpcoming = !active && camp.status === 'upcoming';

            return (
              <Card key={camp.id} className={`overflow-hidden border-2 transition-all ${active ? 'border-green-200' : isUpcoming ? 'border-amber-200' : 'border-gray-100'}`}>
                {/* Campaign header strip */}
                <div className={`px-4 py-3 flex items-center justify-between ${active ? 'bg-green-50' : isUpcoming ? 'bg-amber-50' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${type.color}`}>
                      {type.icon} {type.label}
                    </span>
                    {active && <span className="inline-flex items-center gap-1 text-xs font-bold bg-green-600 text-white px-2 py-0.5 rounded-full"><CheckCircle size={10} /> Active</span>}
                    {isUpcoming && <span className="inline-flex items-center gap-1 text-xs font-bold bg-amber-500 text-white px-2 py-0.5 rounded-full"><Clock size={10} /> Upcoming</span>}
                    {camp.status === 'completed' && <span className="inline-flex items-center gap-1 text-xs font-bold bg-gray-400 text-white px-2 py-0.5 rounded-full"><CheckCircle size={10} /> Completed</span>}
                    {camp.scope && camp.scope !== 'countrywide' && camp.scope !== 'nationwide' && (
                      <span className="text-xs text-gray-500 font-medium">{camp.scope}</span>
                    )}
                    {(camp.scope === 'countrywide' || camp.scope === 'nationwide') && (
                      <span className="text-xs text-blue-600 font-semibold">Countrywide</span>
                    )}
                  </div>
                  {active && days > 0 && (
                    <span className={`text-xs font-bold ${days <= 3 ? 'text-red-600' : 'text-green-700'}`}>
                      {days} day{days !== 1 ? 's' : ''} left
                    </span>
                  )}
                </div>

                <CardBody>
                  <h3 className="font-bold text-gray-900 text-base mb-1">{camp.name}</h3>
                  {camp.description && <p className="text-sm text-gray-500 mb-3">{camp.description}</p>}

                  {/* Dates */}
                  <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                    <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(camp.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    <ChevronRight size={12} />
                    <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(camp.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>

                  {/* Campaign-type specific details */}
                  {camp.campaign_type === 'buy_x_get_y' && (() => {
                    const productsDisplay = conditions.products_text
                      ? conditions.products_text
                      : Array.isArray(conditions.products) && conditions.products.length > 0
                        ? conditions.products.join(', ')
                        : '';
                    return (
                      <div className="mb-3 p-3 bg-green-50 rounded-lg border border-green-200 text-sm space-y-1">
                        <p className="font-bold text-green-800 flex items-center gap-1"><Gift size={14} /> Buy & Get Free Deal</p>
                        <p className="text-green-700">Buy <strong>{conditions.buy_qty || 1}</strong> unit{(conditions.buy_qty || 1) > 1 ? 's' : ''}, get <strong>{conditions.get_qty || 1}</strong> free</p>
                        {productsDisplay && (
                          <p className="text-xs text-gray-600">Eligible products: <strong>{productsDisplay}</strong></p>
                        )}
                        {prize.free_product && (
                          <p className="text-xs text-gray-600">Free item: <strong>{prize.free_product}</strong></p>
                        )}
                      </div>
                    );
                  })()}

                  {camp.campaign_type === 'discount' && (
                    <div className="mb-3 p-3 bg-orange-50 rounded-lg border border-orange-200 text-sm">
                      <p className="font-bold text-orange-800 flex items-center gap-1"><Tag size={14} /> Discount Offer</p>
                      <p className="text-2xl font-black text-orange-600">{camp.discount_percentage}% OFF</p>
                      <p className="text-xs text-gray-500 mt-1">On distributor price (DP) at participating branches</p>
                    </div>
                  )}

                  {camp.campaign_type === 'bv_achievement' && prize.tiers && (
                    <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200 text-sm space-y-2">
                      <p className="font-bold text-blue-800 flex items-center gap-1"><Trophy size={14} /> Prize Tiers</p>
                      {(Array.isArray(prize.tiers) ? prize.tiers : []).sort((a, b) => Number(a.bv_required) - Number(b.bv_required)).map((tier, i) => (
                        <div key={i} className="flex justify-between items-center py-1 border-b border-blue-100 last:border-0">
                          <span className="text-blue-700 font-medium">{tier.prize || tier.label}</span>
                          <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">{Number(tier.bv_required).toLocaleString()} BV</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {camp.campaign_type === 'elite_bingo' && (
                    <div className="mb-3 p-3 bg-purple-50 rounded-lg border border-purple-200 text-sm">
                      <p className="font-bold text-purple-800 flex items-center gap-1"><Zap size={14} /> Elite Bingo Requirements</p>
                      <div className="mt-2 space-y-1">
                        <p className="text-purple-700">Min BV: <strong>{Number(conditions.min_bv || 3000).toLocaleString()}</strong></p>
                        <p className="text-purple-700">Min Recruits: <strong>{conditions.min_recruits || 2}</strong></p>
                        {(prize.cash_reward || prize.description) && (
                          <p className="text-green-700 font-semibold">Reward: {prize.cash_reward || prize.description}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Action button */}
                  {canOrder ? (
                    <Button variant="success" onClick={() => setPurchaseCampaign(camp)} className="w-full mt-2">
                      <ShoppingCart size={15} /> Place Campaign Order
                    </Button>
                  ) : active && !isSaleCampaign(camp) ? (
                    <div className="mt-2 p-2 bg-blue-50 rounded-lg text-xs text-blue-700 text-center font-medium">
                      Accumulate BV through your regular sales to qualify for this campaign's prize.
                    </div>
                  ) : isUpcoming ? (
                    <div className="mt-2 p-2 bg-amber-50 rounded-lg text-xs text-amber-700 text-center font-medium flex items-center justify-center gap-1">
                      <Clock size={12} /> Starts {new Date(camp.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </div>
                  ) : null}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* Campaign Purchase Modal */}
      {purchaseCampaign && (
        <CampaignPurchaseModal
          campaign={purchaseCampaign}
          products={products}
          branches={branches}
          nb={nb}
          onClose={() => setPurchaseCampaign(null)}
        />
      )}
    </div>
  );
}

function CampaignPurchaseModal({ campaign, products, branches, nb, onClose }) {
  const safeJson = (val) => {
    if (!val) return {};
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch { return {}; }
  };

  const conditions = safeJson(campaign.conditions);
  const prize = safeJson(campaign.prize);
  const discountPct = Number(campaign.discount_percentage || 0);
  const isBuyXGetY = campaign.campaign_type === 'buy_x_get_y';
  const isDiscount = campaign.campaign_type === 'discount';

  const buyQty = Number(conditions.buy_qty || 1);
  const getQty = Number(conditions.get_qty || 1);
  const freeProductName = prize.free_product || '';

  // Normalize products_text — handles both array (conditions.products) and string (conditions.products_text)
  const getProductsText = (cond) => {
    if (cond.products_text && typeof cond.products_text === 'string' && cond.products_text.trim()) {
      return cond.products_text.trim();
    }
    if (Array.isArray(cond.products) && cond.products.length > 0) {
      return cond.products.join(', ');
    }
    return '';
  };
  const condProductsText = getProductsText(conditions);

  // Campaign-defined paid product name (from setup — does NOT require database match)
  const campaignPaidProductName = condProductsText.split(',')[0]?.trim() || '';

  // Match the campaign product in the price list for DP/BV lookup (best-effort, case-insensitive)
  const findProduct = (name) => {
    if (!name) return null;
    const lower = name.toLowerCase();
    return products.find(p => (p.name || p.description || '').toLowerCase() === lower)
      || products.find(p => (p.name || p.description || '').toLowerCase().includes(lower));
  };

  // For buy_x_get_y: products are locked to campaign setup — no dropdown needed
  // For discount/other: allow selection from all products
  const rawEligibleNames = condProductsText
    ? condProductsText.split(',').map(p => p.trim().toLowerCase()).filter(Boolean)
    : [];

  const eligibleProducts = isBuyXGetY && rawEligibleNames.length > 0
    ? products.filter(p => rawEligibleNames.some(n => (p.name || p.description || '').toLowerCase().includes(n)))
    : products;

  const allProducts = products;

  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [qty, setQty] = useState(isBuyXGetY ? buyQty : 1);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);

  const selectedBranch = branches.find(b => b.id === selectedBranchId) || null;
  const selectedProduct = isBuyXGetY
    ? (findProduct(campaignPaidProductName) || { name: campaignPaidProductName, description: campaignPaidProductName, dp: 0, bv: 0 })
    : (products.find(p => (p.id || p.description) === selectedProductId) || null);

  // Auto-select product for non-buy_x_get_y campaigns
  useEffect(() => {
    if (!isBuyXGetY) {
      const pool = allProducts;
      if (pool.length > 0 && !selectedProductId) {
        setSelectedProductId(pool[0].id || pool[0].description);
      }
    }
  }, [allProducts.length]);

  // Calculations
  const baseDp = selectedProduct?.dp || 0;
  const bvPerUnit = selectedProduct?.bv || 0;
  const unitPrice = isDiscount ? Math.round(baseDp * (1 - discountPct / 100) * 100) / 100 : baseDp;
  const totalCost = unitPrice * qty;
  const totalBV = bvPerUnit * qty;
  const freeItems = isBuyXGetY ? Math.floor(qty / buyQty) * getQty : 0;

  const handleSubmit = async () => {
    if (!selectedBranchId) { setMessage('Error: Please select a branch.'); return; }
    if (isBuyXGetY && !campaignPaidProductName) {
      setMessage('Error: This campaign has no product configured. Please contact the GM to update the campaign setup.');
      return;
    }
    if (!isBuyXGetY && !selectedProduct) { setMessage('Error: Please select a product.'); return; }
    if (qty <= 0) { setMessage('Error: Quantity must be at least 1.'); return; }
    if (isBuyXGetY && qty < buyQty) {
      setMessage(`Error: You must buy at least ${buyQty} unit(s) to qualify for this campaign.`);
      return;
    }

    setSubmitting(true);
    setMessage('');
    try {
      const productName = selectedProduct.name || selectedProduct.description;
      const branchName = selectedBranch?.name || selectedBranchId;
      const items = [
        {
          product_id: selectedProduct.id,
          product_name: productName,
          quantity: qty,
          unit_price: unitPrice,
          bv: bvPerUnit,
        },
      ];

      if (isBuyXGetY && freeItems > 0 && freeProductName) {
        const freeProd = products.find(p =>
          (p.name || p.description || '').toLowerCase().includes(freeProductName.toLowerCase())
        );
        items.push({
          product_id: freeProd?.id || null,
          product_name: freeProductName,
          quantity: freeItems,
          unit_price: 0,
          bv: 0,
          is_free: true,
        });
      }

      const campaignNote = isBuyXGetY
        ? `CAMPAIGN ORDER: ${campaign.name} | Buy ${qty} × ${productName}${freeItems > 0 ? `, get ${freeItems} × ${freeProductName} FREE` : ''} | BV: ${totalBV.toFixed(1)} | Branch: ${branchName} | NB: ${nb}`
        : `CAMPAIGN ORDER: ${campaign.name} | ${discountPct}% Discount | ${qty} × ${productName} | Cost: N$${totalCost.toFixed(2)} (DP: N$${baseDp.toFixed(2)}) | BV: ${totalBV.toFixed(1)} | Branch: ${branchName} | NB: ${nb}`;

      await api.orders.create({
        customer_name: nb || 'Distributor',
        delivery_method: 'pickup',
        branch_id: selectedBranchId,
        subtotal: totalCost,
        items,
        customer_type: 'member',
        distributor_code: nb || undefined,
        payment_method: 'cash',
        notes: campaignNote,
      });

      setDone(true);
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Campaign Order — ${campaign.name}`} size="lg">
      <div className="p-6">
        {done ? (
          <div className="text-center py-8 space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <CheckCircle size={36} className="text-green-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-800">Order Submitted!</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
              Your campaign order has been sent to <strong>{selectedBranch?.name}</strong>. Visit the branch to complete payment and collect your products.
            </p>
            {isBuyXGetY && freeItems > 0 && (
              <div className="p-3 bg-green-50 rounded-lg border border-green-200 text-sm text-green-700 font-semibold">
                Remember to claim your <strong>{freeItems} × {freeProductName}</strong> free item{freeItems > 1 ? 's' : ''} at the branch!
              </div>
            )}
            <Button onClick={onClose} className="mt-2">Done</Button>
          </div>
        ) : (
          <div className="space-y-5">
            {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'}>{message}</Alert>}

            {/* Campaign info pill */}
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm">
              {isBuyXGetY && (
                <p className="text-primary font-semibold flex items-center gap-1">
                  <Gift size={14} /> Buy {buyQty}, get {getQty} {freeProductName ? `× ${freeProductName}` : 'free'}
                </p>
              )}
              {isDiscount && (
                <p className="text-orange-700 font-semibold flex items-center gap-1">
                  <Tag size={14} /> {discountPct}% discount applied on all products
                </p>
              )}
            </div>

            {/* Branch selector */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Processing Branch <span className="text-red-500">*</span></label>
              <div className="relative">
                <select value={selectedBranchId} onChange={e => setSelectedBranchId(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 pr-8 appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                  <option value="">— Select a branch —</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Product section — locked for buy_x_get_y, dropdown for others */}
            {isBuyXGetY ? (
              /* Paid product locked to campaign setup */
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Campaign Paid Product</label>
                  <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <Package size={18} className="text-blue-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 truncate">
                        {campaignPaidProductName || <span className="text-red-500 italic">Not configured — contact GM</span>}
                      </p>
                      {selectedProduct && (selectedProduct.dp || selectedProduct.bv) ? (
                        <p className="text-xs text-gray-500">DP: {formatCurrency(selectedProduct.dp || 0)} &nbsp;|&nbsp; {selectedProduct.bv || 0} BV per unit</p>
                      ) : null}
                    </div>
                    <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full shrink-0">Auto-selected</span>
                  </div>
                </div>
                {freeProductName ? (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Free Bonus Item</label>
                    <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-300 rounded-lg">
                      <Gift size={18} className="text-green-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800 truncate">{freeProductName}</p>
                        <p className="text-xs text-gray-500">{freeItems} free unit(s) for buying {qty} × {campaignPaidProductName}</p>
                      </div>
                      <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full shrink-0">{freeItems} FREE</span>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Select Product <span className="text-red-500">*</span></label>
                <div className="relative">
                  <select value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 pr-8 appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                    <option value="">— Select a product —</option>
                    {allProducts.map(p => (
                      <option key={p.id || p.description} value={p.id || p.description}>
                        {p.name || p.description} — DP: N${(p.dp || 0).toFixed(2)} | {p.bv || 0} BV
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Quantity */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Quantity {isBuyXGetY ? <span className="font-normal text-gray-400">(min {buyQty})</span> : ''}
              </label>
              <div className="flex items-center gap-3">
                <button onClick={() => setQty(q => Math.max(isBuyXGetY ? buyQty : 1, q - 1))}
                  className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300 cursor-pointer">
                  <Minus size={15} />
                </button>
                <span className="text-xl font-bold w-10 text-center">{qty}</span>
                <button onClick={() => setQty(q => q + 1)}
                  className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300 cursor-pointer">
                  <Plus size={15} />
                </button>
              </div>
            </div>

            {/* Order summary */}
            {selectedProduct && (
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Order Summary</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">{selectedProduct.name || selectedProduct.description}</span>
                  <span className="font-semibold">{qty} unit{qty > 1 ? 's' : ''}</span>
                </div>
                {isDiscount && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Original DP</span>
                    <span className="line-through text-gray-400">{formatCurrency(baseDp)} × {qty}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Unit Price {isDiscount ? `(after ${discountPct}% off)` : '(DP)'}</span>
                  <span className="font-semibold text-primary">{formatCurrency(unitPrice)}</span>
                </div>
                <div className="flex justify-between text-sm border-t pt-2 mt-1">
                  <span className="font-bold text-gray-800">Total Cost</span>
                  <span className="font-bold text-primary text-lg">{formatCurrency(totalCost)}</span>
                </div>
                <div className="flex justify-between text-sm text-blue-700 font-semibold">
                  <span className="flex items-center gap-1"><Star size={12} /> BV Earned</span>
                  <span>{totalBV.toFixed(1)} BV</span>
                </div>
                {isBuyXGetY && freeItems > 0 && freeProductName && (
                  <div className="flex justify-between text-sm text-green-700 font-semibold bg-green-50 -mx-1 px-2 py-1.5 rounded-lg mt-1">
                    <span className="flex items-center gap-1"><Gift size={12} /> Free Items</span>
                    <span>{freeItems} × {freeProductName}</span>
                  </div>
                )}
                {isBuyXGetY && qty < buyQty && (
                  <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1.5 rounded-lg">
                    <AlertCircle size={12} /> Add {buyQty - qty} more to unlock free items
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
              <Button variant="success" onClick={handleSubmit} disabled={submitting || !selectedBranchId || !selectedProductId} className="flex-1">
                <Send size={14} /> {submitting ? 'Submitting...' : 'Submit Campaign Order'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function TrainingTab() {
  const [tab, setTab] = useState('materials');
  const [media, setMedia] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/media?upload_type=training').catch(() => []),
      api.get('/training-schedules').catch(() => []),
    ]).then(([m, s]) => {
      setMedia(Array.isArray(m) ? m : []);
      setSchedules(Array.isArray(s) ? s : (s?.schedules || []));
    }).finally(() => setLoading(false));
  }, []);

  const videos = media.filter(f => (f.mime_type || f.file_type || '').startsWith('video/'));
  const docs = media.filter(f => (f.mime_type || f.file_type || '').startsWith('application/') || (f.upload_type || '') === 'document');
  const photos = media.filter(f => (f.mime_type || f.file_type || '').startsWith('image/'));

  const subTabs = [
    { id: 'materials', label: 'Materials', count: docs.length },
    { id: 'videos', label: 'Videos', count: videos.length },
    { id: 'photos', label: 'Photos', count: photos.length },
    { id: 'schedule', label: 'Schedule', count: schedules.length },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {subTabs.map(st => (
              <button key={st.id} onClick={() => setTab(st.id)}
                style={{ padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.82rem',
                  background: tab === st.id ? '#c41e3a' : '#f1f5f9', color: tab === st.id ? '#fff' : '#475569' }}>
                {st.label} {st.count > 0 && <span style={{ marginLeft: 4, opacity: 0.75 }}>({st.count})</span>}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      {loading && <LoadingSpinner />}

      {!loading && tab === 'materials' && (
        docs.length === 0
          ? <EmptyState icon={<span style={{ fontSize: 40 }}>📄</span>} title="No materials yet" description="Training documents and guides will appear here when uploaded by your training team." />
          : <div className="space-y-3">
              {docs.map((d, i) => (
                <Card key={d.id || i}>
                  <CardBody>
                    <div className="flex items-center gap-3">
                      <span style={{ fontSize: 28 }}>📄</span>
                      <div style={{ flex: 1 }}>
                        <div className="font-semibold text-gray-800">{d.entity_name || d.filename || 'Document'}</div>
                        <div className="text-xs text-gray-400">{d.created_at ? new Date(d.created_at).toLocaleDateString() : ''}</div>
                      </div>
                      {d.file_url && (
                        <a href={d.file_url} target="_blank" rel="noreferrer" download
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: '#c41e3a', textDecoration: 'none' }}>
                          Download
                        </a>
                      )}
                    </div>
                  </CardBody>
                </Card>
              ))}
            </div>
      )}

      {!loading && tab === 'videos' && (
        videos.length === 0
          ? <EmptyState icon={<span style={{ fontSize: 40 }}>🎥</span>} title="No videos yet" description="Training videos will appear here when uploaded by your training team." />
          : <div className="grid grid-cols-1 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {videos.map((v, i) => (
                <Card key={v.id || i}>
                  <CardBody>
                    <div className="font-semibold text-gray-800 mb-2">{v.entity_name || v.filename || 'Video'}</div>
                    {v.file_url && (
                      <video controls style={{ width: '100%', borderRadius: 8, maxHeight: 200, background: '#000' }} src={v.file_url}>
                        Your browser does not support video playback.
                      </video>
                    )}
                    <div className="text-xs text-gray-400 mt-1">{v.created_at ? new Date(v.created_at).toLocaleDateString() : ''}</div>
                  </CardBody>
                </Card>
              ))}
            </div>
      )}

      {!loading && tab === 'photos' && (
        photos.length === 0
          ? <EmptyState icon={<span style={{ fontSize: 40 }}>🖼️</span>} title="No photos yet" description="Training photos will appear here when uploaded by your training team." />
          : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              {photos.map((p, i) => (
                <div key={p.id || i} style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
                  <img src={p.file_url} alt={p.entity_name || 'Photo'} style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }} />
                  <div style={{ padding: '6px 8px', fontSize: '0.72rem', color: '#64748b' }}>{p.entity_name || ''}</div>
                </div>
              ))}
            </div>
      )}

      {!loading && tab === 'schedule' && (() => {
        const DIST_PLATFORMS = [
          { id: 'zoom',       label: 'Zoom',         icon: '🎥', color: '#2D8CFF', bg: '#eff6ff' },
          { id: 'teams',      label: 'Teams',        icon: '💼', color: '#5b5ea6', bg: '#f5f3ff' },
          { id: 'meet',       label: 'Google Meet',  icon: '📹', color: '#0F9D58', bg: '#f0fdf4' },
          { id: 'webex',      label: 'Webex',        icon: '🌐', color: '#00A0D1', bg: '#ecfeff' },
          { id: 'skype',      label: 'Skype',        icon: '💬', color: '#00AFF0', bg: '#eff6ff' },
          { id: 'goto',       label: 'GoTo Meeting', icon: '🖥️', color: '#f97316', bg: '#fff7ed' },
          { id: 'whatsapp',   label: 'WhatsApp',     icon: '📱', color: '#25D366', bg: '#f0fdf4' },
          { id: 'in_person',  label: 'In-Person',    icon: '📍', color: '#64748b', bg: '#f8fafc' },
        ];
        const distGetPlatform = id => DIST_PLATFORMS.find(p => p.id === id) || DIST_PLATFORMS[DIST_PLATFORMS.length - 1];
        const DIST_AUDIENCES = ['all', 'distributors', 'all_staff'];
        const visible = schedules.filter(s => DIST_AUDIENCES.includes(s.target_audience || 'all'));
        return visible.length === 0
          ? <EmptyState icon={<span style={{ fontSize: 40 }}>📅</span>} title="No upcoming sessions" description="Scheduled training sessions will appear here. Check back soon!" />
          : <div className="space-y-3">
              {visible.map((s, i) => {
                const platform = distGetPlatform(s.platform || 'in_person');
                const isOnline = s.platform && s.platform !== 'in_person';
                const isPast = new Date(s.date) < new Date(new Date().toDateString());
                return (
                  <div key={s.id || i} style={{ borderRadius: 12, border: `2px solid ${isOnline ? platform.color + '44' : '#e2e8f0'}`, overflow: 'hidden', opacity: isPast ? 0.65 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', background: platform.bg, color: platform.color, fontSize: '0.78rem', fontWeight: 700 }}>
                      <span style={{ fontSize: '1rem' }}>{platform.icon}</span>
                      <span>{platform.label}</span>
                      {s.target_audience === 'all' && <span style={{ marginLeft: 'auto' }}>🌍 Open to Everyone</span>}
                      {s.target_audience === 'distributors' && <span style={{ marginLeft: 'auto' }}>🏪 Distributors</span>}
                    </div>
                    <div style={{ padding: '14px', background: '#fff', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 52, textAlign: 'center', background: platform.bg, borderRadius: 10, padding: '6px 4px', border: `1.5px solid ${platform.color}33` }}>
                        <div style={{ fontSize: '0.68rem', color: platform.color, fontWeight: 800, textTransform: 'uppercase' }}>{s.date ? new Date(s.date).toLocaleDateString('en-NA', { month: 'short' }) : '—'}</div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#1f2937', lineHeight: 1 }}>{s.date ? new Date(s.date).getDate() : '—'}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="font-bold text-gray-800">{s.title}</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 14px', marginTop: 3 }}>
                          {s.time && <span style={{ fontSize: '0.8rem', color: '#64748b' }}>🕐 {s.time}</span>}
                          {s.location && <span style={{ fontSize: '0.8rem', color: '#64748b' }}>📍 {s.location}</span>}
                          {s.trainer && <span style={{ fontSize: '0.8rem', color: '#64748b' }}>👤 {s.trainer}</span>}
                        </div>
                        {s.description && <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: '#475569', lineHeight: 1.4 }}>{s.description}</p>}
                      </div>
                      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                        <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: isPast ? '#f1f5f9' : '#fef2f2', color: isPast ? '#64748b' : '#c41e3a' }}>
                          {isPast ? 'Past' : 'Upcoming'}
                        </span>
                        {isOnline && s.meeting_link && !isPast && (
                          <a href={s.meeting_link} target="_blank" rel="noreferrer"
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, background: platform.color, color: '#fff', fontWeight: 700, fontSize: '0.8rem', textDecoration: 'none' }}>
                            🔗 Join Meeting
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>;
      })()}
    </div>
  );
}

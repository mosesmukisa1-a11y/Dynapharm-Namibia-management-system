import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import DistributorPerformanceTab from '../../components/DistributorPerformanceTab';
import DispatchNote from '../../components/DispatchNote';
import DailySalesCard from '../../components/DailySalesCard';
import { api } from '../../lib/api';
import { PRICE_LIST, getCIFPrice, findProductPrice, getLiveProductList, setLivePrices } from '../../lib/pricing';
import { formatCurrency, formatDateTime, formatDate, BRANCHES, BRANCH_DETAILS } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Table, Modal, Alert } from '../../components/ui';
import { BarChart3, ClipboardList, CheckCircle, Megaphone, TrendingUp, Users, DollarSign, Package, XCircle, Download, Ship, AlertTriangle, Edit2, Clock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useStockRealtime } from '../../hooks/useStockRealtime';
import AccountsTab from '../../components/AccountsTab';
import CurrentStockTab from '../../components/CurrentStockTab';
import StaffMessagesTab from '../../components/StaffMessagesTab';

export default function GMPortal() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [pendingAdj, setPendingAdj] = useState(0);
  const [tabVisits, setTabVisits] = useState({ dashboard: 1 });

  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
    setTabVisits(prev => ({ ...prev, [tab]: (prev[tab] || 0) + 1 }));
  }, []);

  const refreshCurrentTab = useCallback(() => {
    setTabVisits(prev => ({ ...prev, [activeTab]: (prev[activeTab] || 0) + 1 }));
  }, [activeTab]);

  useEffect(() => {
    api.get('/stock-adjustments?status=pending')
      .then(d => setPendingAdj(Array.isArray(d) ? d.length : 0))
      .catch(() => {});
    api.prices.list().then(data => {
      if (Array.isArray(data) && data.length > 0) setLivePrices(data);
    }).catch(() => {});
  }, []);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'approvals', label: 'Approvals', icon: '✅' },
    { id: 'stockAdjustments', label: pendingAdj > 0 ? `Stock Edits (${pendingAdj})` : 'Stock Edits', icon: '✏️' },
    { id: 'priceList', label: 'Price List', icon: '💲' },
    { id: 'priceAdvisor', label: 'Price Advisor', icon: '💡' },
    { id: 'campaigns', label: 'Campaigns', icon: '📢' },
    { id: 'profitAnalysis', label: 'Profit Analysis', icon: '💰' },
    { id: 'currentStock', label: 'Current Stock', icon: '📦' },
    { id: 'accounts', label: 'Accounts', icon: '📒' },
    { id: 'bonus', label: 'Bonus History', icon: '🎁' },
    { id: 'statements', label: 'Statements', icon: '📄' },
    { id: 'communication', label: 'Communication', icon: '💬' },
    { id: 'staff', label: 'Staff Services', icon: '👤' },
    { id: 'messages', label: 'My Messages', icon: '📨' },
    { id: 'distributors', label: 'Distributor Performance', icon: '👥' },
    { id: 'discrepancies', label: 'Discrepancy Inbox', icon: '⚠️' },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">GM Portal</h1>
        <p className="text-sm text-gray-500">Country-wide oversight, approvals, and strategic management</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1"><Tabs tabs={tabs} active={activeTab} onChange={handleTabChange} /></div>
        <button onClick={refreshCurrentTab} title="Refresh tab data" className="ml-2 p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 hover:text-primary transition-colors shrink-0" style={{ marginBottom: '-2px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
        </button>
      </div>
      <div className="mt-6">
        {activeTab === 'dashboard' && <DashboardTab key={tabVisits.dashboard || 0} />}
        {activeTab === 'approvals' && <ApprovalsTab key={tabVisits.approvals || 0} />}
        {activeTab === 'stockAdjustments' && <StockAdjustmentsTab key={tabVisits.stockAdjustments || 0} onCountChange={setPendingAdj} />}
        {activeTab === 'priceList' && <PriceListTab key={tabVisits.priceList || 0} />}
        {activeTab === 'priceAdvisor' && <PriceAdvisorTab key={tabVisits.priceAdvisor || 0} />}
        {activeTab === 'campaigns' && <CampaignsTab key={tabVisits.campaigns || 0} />}
        {activeTab === 'profitAnalysis' && <ProfitAnalysisTab key={tabVisits.profitAnalysis || 0} />}
        {activeTab === 'currentStock' && <CurrentStockTab key={tabVisits.currentStock || 0} />}
        {activeTab === 'accounts' && <AccountsTab key={tabVisits.accounts || 0} role="gm" />}
        {activeTab === 'bonus' && <BonusHistoryTab key={tabVisits.bonus || 0} />}
        {activeTab === 'statements' && <StatementsUploadTab key={tabVisits.statements || 0} />}
        {activeTab === 'communication' && <CommunicationTab key={tabVisits.communication || 0} />}
        {activeTab === 'staff' && <StaffTab key={tabVisits.staff || 0} />}
        {activeTab === 'messages' && <StaffMessagesTab key={tabVisits.messages || 0} accentColor="#7c3aed" />}
        {activeTab === 'distributors' && <DistributorPerformanceTab key={tabVisits.distributors || 0} title="Distributor Performance — All Branches" />}
        {activeTab === 'discrepancies' && <DiscrepancyInboxTab key={tabVisits.discrepancies || 0} />}
      </div>
    </div>
  );
}

// ── #65 Discrepancy Inbox Tab ─────────────────────────────────────────────────
// Shows all stock transfers where discrepancy_flag = true so GM can review
// short-receipt incidents reported by branches.
function DiscrepancyInboxTab() {
  const [rows, setRows]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.stock.discrepancies({ limit: 100 })
      .then(d => setRows(Array.isArray(d) ? d : d.discrepancies || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const fmtDate = v => v ? new Date(v).toLocaleString('en-NA', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const fmtLoc  = v => (v || '—').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-lg text-gray-900">⚠️ Discrepancy Inbox</h3>
          <p className="text-sm text-gray-500 mt-0.5">Stock transfers where the branch reported a quantity difference on receipt</p>
        </div>
        <button onClick={load} className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50">↺ Refresh</button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading discrepancy records…</div>
      ) : rows.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <div className="text-3xl mb-2">✅</div>
          <div className="font-bold text-green-800">No discrepancies on record</div>
          <div className="text-sm text-green-600 mt-1">All received transfers matched their dispatched quantities.</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Transfer #</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">From</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Branch</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Received By</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Note</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Items</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.map(r => {
                const items = Array.isArray(r.discrepancy_items) ? r.discrepancy_items : [];
                const isOpen = expanded === r.id;
                return (
                  <>
                    <tr key={r.id} className="hover:bg-amber-50 cursor-pointer" onClick={() => setExpanded(isOpen ? null : r.id)}>
                      <td className="px-4 py-3 font-mono font-bold text-gray-800">{r.request_number || r.id}</td>
                      <td className="px-4 py-3 text-gray-600">{fmtLoc(r.from_warehouse)}</td>
                      <td className="px-4 py-3 font-semibold text-blue-700">{fmtLoc(r.to_branch)}</td>
                      <td className="px-4 py-3 text-gray-600">{r.received_by || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmtDate(r.updated_at)}</td>
                      <td className="px-4 py-3 text-amber-700 text-xs max-w-xs truncate">{r.discrepancy_note || '—'}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {items.length > 0 ? (
                          <span className="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
                            {items.length} item{items.length !== 1 ? 's' : ''} {isOpen ? '▲' : '▼'}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                    {isOpen && items.length > 0 && (
                      <tr key={`${r.id}-detail`}>
                        <td colSpan={7} className="px-6 py-3 bg-amber-50 border-t border-amber-100">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="text-gray-500 uppercase tracking-wide">
                                <th className="py-1.5 pr-4 text-left font-semibold">Product</th>
                                <th className="py-1.5 pr-4 text-center font-semibold">Dispatched</th>
                                <th className="py-1.5 pr-4 text-center font-semibold">Received</th>
                                <th className="py-1.5 pr-4 text-center font-semibold">Difference</th>
                                <th className="py-1.5 pr-4 text-left font-semibold">Batch</th>
                                <th className="py-1.5 text-left font-semibold">Note</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((it, i) => {
                                const disp = Number(it.quantityDispatched || 0);
                                const recv = Number(it.quantityReceived || 0);
                                const diff = recv - disp;
                                return (
                                  <tr key={i} className="border-t border-amber-100">
                                    <td className="py-1.5 pr-4 font-semibold text-gray-800">{it.productName || '—'}</td>
                                    <td className="py-1.5 pr-4 text-center text-gray-600">{disp}</td>
                                    <td className="py-1.5 pr-4 text-center font-bold" style={{ color: recv < disp ? '#dc2626' : recv > disp ? '#16a34a' : '#374151' }}>{recv}</td>
                                    <td className="py-1.5 pr-4 text-center font-bold" style={{ color: diff < 0 ? '#dc2626' : diff > 0 ? '#16a34a' : '#94a3b8' }}>
                                      {diff > 0 ? `+${diff}` : diff === 0 ? '—' : diff}
                                    </td>
                                    <td className="py-1.5 pr-4 font-mono text-gray-500">{it.batchNo || '—'}</td>
                                    <td className="py-1.5 text-amber-700">{it.discrepancyNote || '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-400">
            {rows.length} discrepancy record{rows.length !== 1 ? 's' : ''} — sorted by most recent
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stock Adjustments Approval Tab (GM only) ─────────────────────────────────
function StockAdjustmentsTab({ onCountChange }) {
  const [adjustments, setAdjustments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [actionModal, setActionModal] = useState(null);
  const [gmNotes, setGmNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState(null);

  const load = () => {
    setLoading(true);
    api.get('/stock-adjustments')
      .then(d => {
        const list = Array.isArray(d) ? d : [];
        setAdjustments(list);
        if (onCountChange) onCountChange(list.filter(a => a.status === 'pending').length);
      })
      .catch(() => setAdjustments([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = filter === 'all' ? adjustments : adjustments.filter(a => a.status === filter);
  const pendingCount = adjustments.filter(a => a.status === 'pending').length;

  const handleDecision = async (action) => {
    if (!actionModal) return;
    setProcessing(true);
    try {
      await api.patch(`/stock-adjustments/${actionModal.id}/${action}`, { gm_notes: gmNotes });
      setMessage({ type: 'success', text: `Adjustment ${action === 'approve' ? 'approved and applied to stock' : 'rejected'} successfully.` });
      setActionModal(null);
      setGmNotes('');
      load();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Action failed' });
    } finally {
      setProcessing(false);
    }
  };

  const handleBulkAction = async (action) => {
    const pending = adjustments.filter(a => a.status === 'pending');
    if (pending.length === 0) return;
    setBulkConfirm(null);
    setBulkProcessing(true);
    let done = 0; let failed = 0;
    for (const adj of pending) {
      try {
        await api.patch(`/stock-adjustments/${adj.id}/${action}`, { gm_notes: `Bulk ${action} by GM` });
        done++;
      } catch {
        failed++;
      }
    }
    setMessage({
      type: failed === 0 ? 'success' : 'error',
      text: `${action === 'approve' ? '✅ Approved' : '❌ Rejected'} ${done} request${done !== 1 ? 's' : ''}${failed > 0 ? ` — ${failed} failed, please review` : '.'}`,
    });
    setBulkProcessing(false);
    load();
  };

  const statusBadge = (s) => {
    if (s === 'pending') return <Badge variant="warning"><Clock size={11} className="inline mr-1" />Pending</Badge>;
    if (s === 'approved') return <Badge variant="success"><CheckCircle size={11} className="inline mr-1" />Approved</Badge>;
    if (s === 'rejected') return <Badge variant="danger"><XCircle size={11} className="inline mr-1" />Rejected</Badge>;
    return <Badge>{s}</Badge>;
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {message && <Alert type={message.type} className="mb-4">{message.text}</Alert>}

      <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', borderRadius: 14, padding: '16px 20px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ fontWeight: 800, fontSize: '1.1rem', margin: 0 }}>✏️ Stock Record Edit Requests</h3>
          <p style={{ fontSize: '0.82rem', opacity: 0.8, margin: '3px 0 0' }}>
            Stock/warehouse managers submit correction requests here. Review each change and approve or reject.
            Approved changes are immediately applied to the stock records.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {pendingCount > 0 && (
            <span style={{ background: '#fbbf24', color: '#78350f', borderRadius: 99, padding: '5px 14px', fontSize: '0.82rem', fontWeight: 800 }}>
              ⏳ {pendingCount} Awaiting Your Decision
            </span>
          )}
          {pendingCount > 0 && (
            <>
              <button
                onClick={() => setBulkConfirm('approve')}
                disabled={bulkProcessing}
                style={{ padding: '7px 16px', background: 'rgba(134,239,172,0.25)', color: '#dcfce7', border: '1px solid rgba(134,239,172,0.5)', borderRadius: 99, fontSize: '0.82rem', fontWeight: 700, cursor: bulkProcessing ? 'not-allowed' : 'pointer', opacity: bulkProcessing ? 0.6 : 1 }}>
                ✓ Approve All
              </button>
              <button
                onClick={() => setBulkConfirm('reject')}
                disabled={bulkProcessing}
                style={{ padding: '7px 16px', background: 'rgba(252,165,165,0.25)', color: '#fee2e2', border: '1px solid rgba(252,165,165,0.5)', borderRadius: 99, fontSize: '0.82rem', fontWeight: 700, cursor: bulkProcessing ? 'not-allowed' : 'pointer', opacity: bulkProcessing ? 0.6 : 1 }}>
                ✕ Reject All
              </button>
            </>
          )}
          <button onClick={load} style={{ padding: '7px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 99, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {bulkConfirm && (
        <div style={{ background: bulkConfirm === 'approve' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${bulkConfirm === 'approve' ? '#86efac' : '#fca5a5'}`, borderRadius: 10, padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 600, color: bulkConfirm === 'approve' ? '#166534' : '#991b1b' }}>
            {bulkConfirm === 'approve' ? '✓' : '✕'} {bulkConfirm === 'approve' ? 'Approve' : 'Reject'} all <strong>{pendingCount}</strong> pending request{pendingCount !== 1 ? 's' : ''}?
            {bulkConfirm === 'approve' && <span style={{ fontWeight: 400, color: '#166534', marginLeft: 8 }}>Changes will be applied to stock immediately.</span>}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setBulkConfirm(null)} style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>
              Cancel
            </button>
            <button
              onClick={() => handleBulkAction(bulkConfirm)}
              disabled={bulkProcessing}
              style={{ padding: '6px 18px', borderRadius: 8, border: 'none', background: bulkConfirm === 'approve' ? '#16a34a' : '#dc2626', color: '#fff', fontWeight: 700, fontSize: '0.82rem', cursor: bulkProcessing ? 'not-allowed' : 'pointer', opacity: bulkProcessing ? 0.65 : 1 }}>
              {bulkProcessing ? 'Processing…' : `Yes, ${bulkConfirm === 'approve' ? 'Approve' : 'Reject'} All`}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {['pending','approved','rejected','all'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ padding: '6px 18px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.83rem',
              background: filter === s ? '#c41e3a' : '#f1f5f9', color: filter === s ? '#fff' : '#475569' }}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
            {s === 'pending' && pendingCount > 0 && <span style={{ marginLeft: 6, background: 'rgba(255,255,255,0.25)', borderRadius: 99, padding: '1px 7px', fontSize: '0.75rem' }}>{pendingCount}</span>}
          </button>
        ))}
      </div>

      <Card>
        <Table
          columns={[
            { header: 'Ref #', render: r => <span className="font-mono text-xs font-bold text-primary">{r.adj_number}</span> },
            { header: 'Requested By', render: r => <span className="text-sm font-medium">{r.requested_by_name || r.requested_by || '—'}</span> },
            { header: 'Product', render: r => <span className="font-medium text-sm">{r.product_name || '—'}</span> },
            { header: 'Type', render: r => <Badge variant="info" className="text-xs">{r.target_type}</Badge> },
            { header: 'Field', render: r => <span className="text-xs font-semibold text-gray-700">{(r.field_to_adjust||'').replace(/_/g,' ')}</span> },
            { header: 'Proposed Change', render: r => (
              <span className="text-xs">
                <span className="line-through text-gray-400 mr-1">{r.old_value || '—'}</span>
                <span className="text-primary font-bold">→ {r.new_value}</span>
              </span>
            )},
            { header: 'Reason', render: r => <span className="text-xs text-gray-600 max-w-[180px] block" title={r.reason}>{r.reason}</span> },
            { header: 'Date', render: r => <span className="text-xs text-gray-500">{formatDate(r.created_at)}</span> },
            { header: 'Status', render: r => statusBadge(r.status) },
            { header: 'Actions', render: r => r.status !== 'pending' ? (
              <span className="text-xs text-gray-400 italic">{r.approved_by_name || '—'}</span>
            ) : (
              <div className="flex gap-1">
                <button onClick={() => setActionModal({ ...r, _action: 'approve' })}
                  style={{ padding: '4px 12px', background: '#dcfce7', color: '#166534', border: '1px solid #86efac', borderRadius: 6, cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700 }}>
                  ✓ Approve
                </button>
                <button onClick={() => setActionModal({ ...r, _action: 'reject' })}
                  style={{ padding: '4px 10px', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700 }}>
                  ✕ Reject
                </button>
              </div>
            )},
          ]}
          data={filtered}
          emptyMessage={`No ${filter === 'all' ? '' : filter + ' '}adjustment requests found.`}
        />
      </Card>

      <Modal open={!!actionModal} onClose={() => { setActionModal(null); setGmNotes(''); }}
        title={actionModal?._action === 'approve' ? '✓ Approve Stock Adjustment' : '✕ Reject Stock Adjustment'}>
        <div className="p-6 space-y-4">
          {actionModal && (
            <>
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px' }}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Request Details</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <div>
                    <p className="text-xs text-gray-500">Reference</p>
                    <p className="text-sm font-mono font-bold text-primary">{actionModal.adj_number || actionModal.id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Submitted</p>
                    <p className="text-sm font-medium text-gray-700">{actionModal.created_at ? new Date(actionModal.created_at).toLocaleString() : '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Requested By</p>
                    <p className="text-sm font-semibold text-gray-800">{actionModal.requested_by_name || actionModal.requested_by || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Target Type</p>
                    <p className="text-sm font-medium text-gray-700 capitalize">{(actionModal.target_type || '—').replace(/_/g, ' ')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Location</p>
                    <p className="text-sm font-medium text-gray-700 capitalize">{(actionModal.location || '—').replace(/_/g, ' ')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Record ID</p>
                    <p className="text-sm font-mono text-gray-500">{actionModal.target_id ? actionModal.target_id.slice(-10) : '—'}</p>
                  </div>
                </div>
              </div>
              <div style={{ background: actionModal._action === 'approve' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${actionModal._action === 'approve' ? '#86efac' : '#fca5a5'}`, borderRadius: 10, padding: '12px 16px' }}>
                <p className="text-sm font-bold text-gray-800 mb-1">📦 {actionModal.product_name || 'Unknown product'}</p>
                <p className="text-sm text-gray-700 mt-1">
                  Change <strong className="capitalize">{(actionModal.field_to_adjust||'').replace(/_/g,' ')}</strong>:{' '}
                  <span className="line-through text-gray-400 mr-1">{actionModal.old_value || '—'}</span>
                  <span className="font-bold text-gray-500 mr-1">→</span>
                  <span className="font-bold text-primary">{actionModal.new_value}</span>
                </p>
                <p className="text-xs text-gray-600 mt-2 bg-white/60 rounded p-2 italic">💬 {actionModal.reason}</p>
                {actionModal._action === 'approve' && (
                  <Alert type="warning" className="mt-2 text-xs">
                    Approving will immediately update the actual stock record and cannot be undone.
                  </Alert>
                )}
              </div>
            </>
          )}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">GM Notes (optional)</label>
            <textarea value={gmNotes} onChange={e => setGmNotes(e.target.value)} rows={3}
              placeholder="Add notes about your decision..."
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary resize-y" />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setActionModal(null); setGmNotes(''); }}>Cancel</Button>
            <Button variant={actionModal?._action === 'approve' ? 'success' : 'danger'}
              disabled={processing}
              onClick={() => handleDecision(actionModal._action)}>
              {processing ? 'Processing…' : actionModal?._action === 'approve' ? '✓ Approve & Apply' : '✕ Reject'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
// ── End StockAdjustmentsTab ───────────────────────────────────────────────────

function DashboardTab() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const firstOfMonth = localDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const today = localDate(now);

  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [appliedStart, setAppliedStart] = useState(firstOfMonth);
  const [appliedEnd, setAppliedEnd] = useState(today);
  const [data, setData] = useState({ orders: [], branches: [], products: [], sales: [], deposits: [], expenses: [] });
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [gmSummary, setGmSummary] = useState(null);

  const appliedRangeRef = useRef({ start: firstOfMonth, end: today });

  const refreshGmSummary = useCallback((start, end) => {
    setSummaryLoading(true);
    api.gm.summary({ startDate: start, endDate: end })
      .then(d => { if (d && d.success) setGmSummary(d); })
      .catch(() => {})
      .finally(() => setSummaryLoading(false));
  }, []);

  const { connected: wsConnected } = useStockRealtime({
    onUpdate: () => {
      const { start, end } = appliedRangeRef.current;
      refreshGmSummary(start, end);
    },
  });

  const loadData = useCallback((start, end) => {
    setLoading(true);
    Promise.all([
      api.orders.list().then(d => Array.isArray(d) ? d : d.orders || []).catch(() => []),
      api.branches.list().then(d => Array.isArray(d) ? d : d.branches || []).catch(() => []),
      api.products.list().then(d => Array.isArray(d) ? d : d.products || []).catch(() => []),
      api.branch.walkinSales(`from=${start}&to=${end}`).then(d => Array.isArray(d) ? d : d.sales || []).catch(() => []),
      api.branch.deposits(`from=${start}&to=${end}`).then(d => Array.isArray(d) ? d : d.deposits || []).catch(() => []),
    ]).then(([orders, branches, products, sales, deposits]) => {
      const filteredOrders = orders.filter(o => {
        const d = o.created_at || o.date || o.timestamp;
        if (!d) return true;
        const ds = d.slice(0, 10);
        return ds >= start && ds <= end;
      });
      setData({ orders: filteredOrders, branches, products, sales, deposits });
    }).finally(() => setLoading(false));
    refreshGmSummary(start, end);
  }, [refreshGmSummary]);

  useEffect(() => {
    loadData(appliedStart, appliedEnd);
  }, []);

  const handleApply = () => {
    if (!startDate || !endDate) return;
    const effectiveStart = startDate > endDate ? endDate : startDate;
    const effectiveEnd = startDate > endDate ? startDate : endDate;
    appliedRangeRef.current = { start: effectiveStart, end: effectiveEnd };
    setAppliedStart(effectiveStart);
    setAppliedEnd(effectiveEnd);
    setStartDate(effectiveStart);
    setEndDate(effectiveEnd);
    loadData(effectiveStart, effectiveEnd);
  };

  if (loading || summaryLoading) return <LoadingSpinner />;

  const totalRevenue = data.orders.reduce((sum, o) => sum + Number(o.total || 0), 0) +
    data.sales.reduce((sum, s) => sum + Number(s.total || s.amount || 0), 0);

  const totalDeposits = data.deposits.reduce((sum, d) => sum + Number(d.amount || 0), 0);

  const allSalesItems = [];
  const processItems = (items) => {
    (items || []).forEach(item => {
      const rawName = item.name || item.product_name || 'Unknown';
      const matched = findProductPrice(rawName);
      const qty = Number(item.quantity || item.qty || 1);
      const price = matched ? matched.dp : Number(item.price || item.unit_price || 0);
      const cif = matched ? matched.cif : 0;
      allSalesItems.push({ product_name: matched ? matched.description : rawName, quantity: qty, price, cif });
    });
  };
  data.orders.forEach(o => processItems(o.items));
  data.sales.forEach(s => processItems(s.items));

  const totalCIFCost = allSalesItems.reduce((sum, i) => sum + (i.cif * i.quantity), 0);
  const totalDPRevenue = allSalesItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  const grossProfit = totalDPRevenue - totalCIFCost;

  const remittanceDue = totalCIFCost - totalDeposits;

  const totalBV = data.sales.reduce((sum, s) => {
    const items = s.items || [];
    return sum + items.reduce((iSum, item) => iSum + Number(item.bv || item.bonus_volume || 0), 0);
  }, 0);

  const productCounts = {};
  data.sales.forEach(s => {
    const items = s.items || [];
    items.forEach(item => {
      const name = item.name || item.product_name || 'Unknown';
      productCounts[name] = (productCounts[name] || 0) + (item.qty || item.quantity || 1);
    });
  });
  const topProducts = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const branchRevenue = {};
  data.sales.forEach(s => {
    const branch = s.branch_id || s.branch || 'Unknown';
    branchRevenue[branch] = (branchRevenue[branch] || 0) + Number(s.total || s.amount || 0);
  });

  const beTotalSales = gmSummary?.sales?.totalSales || 0;
  const beCIFCost = gmSummary?.finance?.cifCostOfSales || 0;
  const beGrossProfit = gmSummary?.finance?.grossProfit || 0;
  const beRemittanceDue = gmSummary?.finance?.remittanceDue || 0;
  const beTotalTransactions = gmSummary?.sales?.totalTransactions || 0;
  const beTotalBV = gmSummary?.sales?.totalBV || 0;
  const beActiveBranches = gmSummary?.network?.activeBranches || data.branches.length;
  const beProductCount = gmSummary?.network?.productCount || data.products.length;

  const kpiCards = [
    { label: 'Total Sales', value: formatCurrency(beTotalSales), icon: '💰', gradient: 'linear-gradient(135deg, #43e97b, #38f9d7)' },
    { label: 'CIF Cost of Sales', value: formatCurrency(beCIFCost), icon: '🚢', gradient: 'linear-gradient(135deg, #f093fb, #f5576c)' },
    { label: 'Gross Profit', value: formatCurrency(beGrossProfit), icon: '📊', gradient: beGrossProfit >= 0 ? 'linear-gradient(135deg, #43e97b, #38f9d7)' : 'linear-gradient(135deg, #f5576c, #f093fb)' },
    { label: 'Remittance Due', value: formatCurrency(beRemittanceDue), icon: '📦', gradient: beRemittanceDue > 0 ? 'linear-gradient(135deg, #fa709a, #fee140)' : 'linear-gradient(135deg, #43e97b, #38f9d7)' },
  ];

  return (
    <div>
      <Card className="mb-6">
        <CardBody>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">From</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">To</label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
              />
            </div>
            <Button onClick={handleApply} disabled={!startDate || !endDate}>Apply</Button>
            <span className="text-xs text-gray-400 self-center">
              Showing: <strong>{appliedStart}</strong> → <strong>{appliedEnd}</strong>
            </span>
          </div>
        </CardBody>
      </Card>

      <DailySalesCard className="mb-6" />

      {gmSummary && (
        <Card className="mb-6 border-primary/30 bg-gradient-to-r from-red-50 to-rose-50">
          <CardBody>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 size={18} className="text-primary" /> Company Live Summary
                {wsConnected && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#dcfce7', color: '#166534', borderRadius: 99, padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />LIVE</span>}
              </h3>
              <span className="text-xs text-gray-400">Period: {gmSummary.period?.start} → {gmSummary.period?.end}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div className="bg-white/80 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Total Sales (All Branches)</p>
                <p className="text-lg font-bold text-green-700">{formatCurrency(gmSummary.sales?.totalSales || 0)}</p>
                <p className="text-xs text-gray-400">Walk-in: {formatCurrency(gmSummary.sales?.walkinSales || 0)}</p>
              </div>
              <div className="bg-white/80 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Member Sales</p>
                <p className="text-lg font-bold text-blue-700">{formatCurrency(gmSummary.sales?.memberSales || 0)}</p>
                <p className="text-xs text-gray-400">Non-member: {formatCurrency(gmSummary.sales?.nonMemberSales || 0)}</p>
              </div>
              <div className="bg-white/80 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Company Stock (DP Value)</p>
                <p className="text-lg font-bold text-purple-700">{formatCurrency(gmSummary.companyStock?.totalValueDP || 0)}</p>
                <p className="text-xs text-gray-400">{(gmSummary.companyStock?.totalQty || 0).toLocaleString()} units total</p>
              </div>
              <div className="bg-white/80 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Stock Alerts</p>
                <p className={`text-lg font-bold ${(gmSummary.companyStock?.lowStockCount || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {gmSummary.companyStock?.lowStockCount || 0} low stock
                </p>
                <p className="text-xs text-gray-400">{gmSummary.companyStock?.expiringCount || 0} expiring soon</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-gray-500">
              <span>Country Stock: {(gmSummary.companyStock?.countryQty || 0).toLocaleString()} units</span>
              <span>•</span>
              <span>Warehouse: {(gmSummary.companyStock?.warehouseQty || 0).toLocaleString()} units</span>
              <span>•</span>
              <span>Branches: {(gmSummary.companyStock?.branchQty || 0).toLocaleString()} units</span>
              <span>•</span>
              <span>In Transit: {(gmSummary.companyStock?.inTransitQty || 0).toLocaleString()} units</span>
              <span>•</span>
              <span>Prescription sales: {formatCurrency(gmSummary.sales?.prescriptionSales || 0)}</span>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpiCards.map((kpi) => (
          <div key={kpi.label} style={{ background: kpi.gradient }} className="rounded-xl p-5 shadow-lg text-white">
            <div className="flex items-start justify-between">
              <div>
                <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>{kpi.label}</p>
                <p style={{ fontSize: '2rem' }} className="font-bold mt-1">{kpi.value}</p>
              </div>
              <span style={{ fontSize: '2.5rem' }}>{kpi.icon}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Orders" value={beTotalTransactions.toLocaleString()} color="green" icon={<DollarSign size={24} />} />
        <StatCard title="Active Branches" value={beActiveBranches} color="purple" icon={<Users size={24} />} />
        <StatCard title="Products" value={beProductCount} color="orange" icon={<Package size={24} />} />
        <StatCard title="Total BV Points" value={beTotalBV.toLocaleString()} color="teal" icon={<TrendingUp size={24} />} />
      </div>

      <Card className="mb-6 bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200">
        <CardBody>
          <h3 className="font-bold text-emerald-900 mb-3">Profit & Loss Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/80 rounded-lg p-3">
              <p className="text-xs text-gray-500">Total Revenue (DP)</p>
              <p className="text-lg font-bold text-blue-700">{formatCurrency(beTotalSales)}</p>
            </div>
            <div className="bg-white/80 rounded-lg p-3">
              <p className="text-xs text-gray-500">Total CIF Cost</p>
              <p className="text-lg font-bold text-red-600">{formatCurrency(beCIFCost)}</p>
            </div>
            <div className="bg-white/80 rounded-lg p-3">
              <p className="text-xs text-gray-500">Gross Profit</p>
              <p className={`text-lg font-bold ${beGrossProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatCurrency(beGrossProfit)}</p>
            </div>
            <div className="bg-white/80 rounded-lg p-3">
              <p className="text-xs text-gray-500">Margin %</p>
              <p className="text-lg font-bold text-purple-700">{beTotalSales > 0 ? ((beGrossProfit / beTotalSales) * 100).toFixed(1) : '0'}%</p>
            </div>
          </div>
          <p className="text-xs text-emerald-600 mt-2 font-medium">
            Profit = DP Selling Price - CIF Cost (actual cost from Malaysia import)
          </p>
        </CardBody>
      </Card>

      {beRemittanceDue > 0 && (
        <Alert type="warning" className="mb-6">
          <strong>Remittance Due:</strong> {formatCurrency(beRemittanceDue)} — CIF cost of goods sold exceeds deposits received. Coordinate with Finance for remittance to supplier.
        </Alert>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Revenue by Branch</h3></CardHeader>
          <CardBody>
            {Object.keys(branchRevenue).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(branchRevenue).sort((a, b) => b[1] - a[1]).map(([branch, rev]) => (
                  <div key={branch} className="flex justify-between items-center">
                    <span className="text-sm text-gray-700">{branch}</span>
                    <span className="font-bold text-sm text-green-600">{formatCurrency(rev)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-4 text-center">Revenue data will appear when sales are recorded.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Top Products</h3></CardHeader>
          <CardBody>
            {topProducts.length > 0 ? (
              <div className="space-y-3">
                {topProducts.map(([name, count], i) => (
                  <div key={name} className="flex justify-between items-center">
                    <span className="text-sm text-gray-700">
                      <span className="font-bold text-primary mr-2">#{i + 1}</span>{name}
                    </span>
                    <Badge variant="info">{count} sold</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 py-4 text-center">Top products will appear when sales data is available.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function ApprovalsTab() {
  const { user } = useAuth();
  const [approvalTab, setApprovalTab] = useState('transfers');
  const [cashRequests, setCashRequests] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [stockRequests, setStockRequests] = useState([]);
  const [pendingTransfers, setPendingTransfers] = useState([]);
  const [fieldRequests, setFieldRequests] = useState([]);
  const [allFieldRequests, setAllFieldRequests] = useState([]);
  const [pettyCashRequests, setPettyCashRequests] = useState([]);
  const [rentEditRequests, setRentEditRequests] = useState([]);
  const [salaryEditRequests, setSalaryEditRequests] = useState([]);
  const [casRequests, setCasRequests] = useState([]);
  const [casModal, setCasModal] = useState(null);
  const [casNote, setCasNote] = useState('');
  const [adminLeaveRequests, setAdminLeaveRequests] = useState([]);
  const [allLeaveHistory, setAllLeaveHistory] = useState([]);
  const [leaveApprovalModal, setLeaveApprovalModal] = useState(null);
  const [leaveApprovalNote, setLeaveApprovalNote] = useState('');
  const [bonusDeleteRequests, setBonusDeleteRequests] = useState([]);
  const [bonusDeleteModal, setBonusDeleteModal] = useState(null);
  const [bonusDeleteNote, setBonusDeleteNote] = useState('');
  const [staffChangeRequests, setStaffChangeRequests] = useState([]);
  const [staffChangeModal, setStaffChangeModal] = useState(null);
  const [staffChangeNote, setStaffChangeNote] = useState('');
  const [pendingWriteOffs, setPendingWriteOffs] = useState([]);
  const [woRejectModal, setWoRejectModal] = useState(null);
  const [woRejectNote, setWoRejectNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [noteModal, setNoteModal] = useState(null);
  const [note, setNote] = useState('');
  const [viewDispatch, setViewDispatch] = useState(null);
  const [amendModal, setAmendModal] = useState(null);
  const [amendItems, setAmendItems] = useState([]);
  const [amendComment, setAmendComment] = useState('');
  const [amendShortfallWarning, setAmendShortfallWarning] = useState(false);
  const [amendShortfallAcknowledged, setAmendShortfallAcknowledged] = useState(false);
  const [amendCommentBeforeWarning, setAmendCommentBeforeWarning] = useState('');
  const [amendAvailability, setAmendAvailability] = useState({});
  const [processing, setProcessing] = useState(false);
  const [rentReviewModal, setRentReviewModal] = useState(null);
  const [rentReviewNote, setRentReviewNote] = useState('');
  const [salaryReviewModal, setSalaryReviewModal] = useState(null);
  const [salaryReviewNote, setSalaryReviewNote] = useState('');

  const fmtLoc = (loc) => {
    if (!loc) return '—';
    const map = { country_stock: 'Country Stock', windhoek_warehouse: 'Windhoek Warehouse', ondangwa_warehouse: 'Ondangwa Warehouse', windhoek_branch: 'Windhoek Branch', ondangwa_branch: 'Ondangwa Branch', oshakati_branch: 'Oshakati Branch', rundu_branch: 'Rundu Branch', tsumeb_branch: 'Tsumeb Branch', katima_branch: 'Katima Mulilo Branch', katima_mulilo_branch: 'Katima Mulilo Branch', katima: 'Katima Mulilo', katima_mulilo: 'Katima Mulilo', walvis_branch: 'Walvis Bay Branch', gobabis_branch: 'Gobabis Branch', otjiwarongo_branch: 'Otjiwarongo Branch', keetmanshoop_branch: 'Keetmanshoop Branch' };
    return map[loc.toLowerCase().replace(/\s+/g, '_')] || loc.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const fmtDate = (d) => { if (!d) return '—'; try { return new Date(d).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return d; } };

  const toArr = (v) => Array.isArray(v) ? v : [];

  const loadData = async () => {
    setLoading(true);
    try {
      const [cash, leaves, stock, transfers, fieldReqs, pcReqs, rentReqs, salaryReqs, casReqs, adminLeaves, bonusDelReqs, staffChangeReqs, writeOffs] = await Promise.all([
        api.branch.cashMovements().then(d => toArr(d?.movements ?? d)).catch(() => []),
        api.get('/hr/leaves?status=pending').then(d => toArr(d?.leaves ?? d)).catch(() => []),
        api.stock.requests().then(d => toArr(d?.requests ?? d)).catch(() => []),
        api.stock.transfers('status=pending_approval').then(d => toArr(d?.transfers ?? d)).catch(() => []),
        api.get('/field_program_requests').then(d => toArr(d?.requests ?? d)).catch(() => []),
        api.finance.pettyCash.requests().then(d => toArr(d?.requests)).catch(() => []),
        api.finance.rent.editRequests('pending').then(d => toArr(d?.requests)).catch(() => []),
        api.hr.salaryLedger.editRequests('pending').then(d => toArr(d?.requests)).catch(() => []),
        api.get('/cash-requests/admin?status=finance_reviewed').then(d => toArr(d)).catch(() => []),
        api.get('/leave-requests/admin').then(d => toArr(d)).catch(() => []),
        api.finance.getBonusPeriodDeleteRequests('pending_gm').then(d => toArr(d?.requests)).catch(() => []),
        api.hr.staffChangeRequests.list('pending').then(d => toArr(d?.requests)).catch(() => []),
        api.get('/stock-movements?type=write_off&status=pending_approval&limit=200').then(d => toArr(d?.movements)).catch(() => []),
      ]);
      setCashRequests(cash.filter(c => c.status === 'pending'));
      setLeaveRequests(leaves.filter(l => l.status === 'pending'));
      setStockRequests(stock.filter(s => s.status === 'pending'));
      setPendingTransfers(transfers);
      setFieldRequests(fieldReqs.filter(r => r.status === 'pending'));
      setAllFieldRequests(fieldReqs);
      setPettyCashRequests(pcReqs.filter(r => r.status === 'pending_gm'));
      setRentEditRequests(rentReqs);
      setSalaryEditRequests(salaryReqs);
      setCasRequests(casReqs);
      setAdminLeaveRequests(adminLeaves.filter(r => r.status?.toLowerCase() === 'pending'));
      setAllLeaveHistory(adminLeaves);
      setBonusDeleteRequests(bonusDelReqs);
      setStaffChangeRequests(staffChangeReqs);
      setPendingWriteOffs(writeOffs.filter(w => w.status === 'pending_approval'));
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleAction = async (type, id, action) => {
    setProcessing(true);
    try {
      if (type === 'cash') {
        await api.put(`/branch/cash-movements/${id}`, { status: action, notes: note });
        setCashRequests(prev => prev.filter(r => r.id !== id));
      } else if (type === 'leave') {
        await api.hr.updateLeave(id, { status: action, approved_by: user?.full_name || user?.username || 'GM' });
        setLeaveRequests(prev => prev.filter(r => r.id !== id));
      } else if (type === 'stock') {
        await api.put(`/stock-requests/${id}`, { status: action, notes: note });
        setStockRequests(prev => prev.filter(r => r.id !== id));
      } else if (type === 'fieldstock') {
        const gmName = user?.full_name || user?.username || 'GM';
        await api.put('/field_program_requests', {
          id, status: action,
          approved_by: action === 'approved' ? gmName : null,
          approved_at: action === 'approved' ? new Date().toISOString() : null,
          notes: note,
        });
        const refreshed = await api.get('/field_program_requests').then(d => Array.isArray(d) ? d : d.requests || []).catch(() => []);
        setFieldRequests(refreshed.filter(r => r.status === 'pending'));
        setAllFieldRequests(refreshed);
      } else if (type === 'petty_cash') {
        if (action === 'approved') {
          await api.finance.pettyCash.approve(id, note);
          setMessage('✅ Petty cash approved — forwarded to Director for issuance.');
        } else {
          await api.finance.pettyCash.reject(id, note);
          setMessage('❌ Petty cash request rejected.');
        }
        setPettyCashRequests(prev => prev.filter(r => r.id !== id));
      } else if (type === 'transfer') {
        const newStatus = action === 'approved' ? 'approved' : 'rejected';
        const gmName = user?.full_name || user?.username || 'GM';
        await api.stock.updateTransfer(id, {
          status: newStatus,
          approved_by: gmName,
          notes: note,
          gmAction: action === 'approved' ? 'approve' : 'reject',
          gmComment: note || null,
        });
        setPendingTransfers(prev => prev.filter(r => r.id !== id));
        setMessage(action === 'approved' ? '✅ Transfer approved — branch can now receive the stock.' : '❌ Transfer rejected.');
      }
      if (!['transfer', 'petty_cash'].includes(type)) setMessage(`Request ${action} successfully!`);
      setNoteModal(null);
      setNote('');
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleAmendApprove = async (commentOverride) => {
    if (!amendModal) return;
    setProcessing(true);
    try {
      const gmName = user?.full_name || user?.username || 'GM';
      const effectiveComment = commentOverride !== undefined ? commentOverride : amendComment;
      const originalItems = amendModal.items || [];
      const amendmentLog = amendItems.map((ai, i) => {
        // Prefer stable id-based match, then productName+batchNo, then index fallback
        const orig = (ai.id ? originalItems.find(o => o.id === ai.id) : null)
          || originalItems.find(o => o.productName === ai.productName && o.batchNo === ai.batchNo && o.id !== undefined ? !amendItems.slice(0, i).some(prev => prev.id === o.id) : true)
          || originalItems[i];
        if (orig && Number(ai.quantityApproved) !== Number(orig.quantity)) {
          return {
            product: ai.productName,
            batchNo: ai.batchNo || null,
            itemId: ai.id || null,
            originalQty: orig.quantity,
            approvedQty: ai.quantityApproved,
            removed: Number(ai.quantityApproved) === 0,
          };
        }
        return null;
      }).filter(Boolean);

      const updatedItems = amendItems.filter(it => Number(it.quantityApproved) > 0).map(it => ({
        ...it,
        quantity: Number(it.quantityApproved),
      }));

      await api.stock.updateTransfer(amendModal.id, {
        status: 'approved',
        approved_by: gmName,
        gmAction: 'amend_approve',
        gmComment: effectiveComment || 'Amended and approved',
        notes: effectiveComment || 'Amended and approved by GM',
        items: updatedItems,
        amendmentLog,
      });

      setPendingTransfers(prev => prev.filter(r => r.id !== amendModal.id));
      setMessage('✅ Transfer amended and approved. Author has been notified of changes.');
      setAmendModal(null);
      setAmendItems([]);
      setAmendComment('');
      setAmendShortfallWarning(false);
      setAmendShortfallAcknowledged(false);
      setAmendAvailability({});
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleReturnForCorrection = async (transferId) => {
    setProcessing(true);
    try {
      const gmName = user?.full_name || user?.username || 'GM';
      await api.stock.updateTransfer(transferId, {
        status: 'returned',
        gmAction: 'return',
        gmComment: note || 'Returned for correction',
        notes: note || 'Returned for correction by GM',
        approved_by: gmName,
      });
      setPendingTransfers(prev => prev.filter(r => r.id !== transferId));
      setMessage('↩️ Transfer returned for correction. Author has been notified.');
      setNoteModal(null);
      setNote('');
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const openAmendModal = async (t) => {
    const items = (t.items || []).map(it => ({
      ...it,
      quantityApproved: it.quantity,
    }));
    setAmendItems(items);
    setAmendComment('');
    setAmendShortfallWarning(false);
    setAmendShortfallAcknowledged(false);
    setAmendAvailability({});
    setAmendModal(t);

    const warehouseId = t.fromWarehouse || t.from_location || t.from_warehouse || null;
    if (warehouseId && items.length > 0) {
      const productNames = [...new Set(items.map(it => it.productName).filter(Boolean))];
      try {
        const result = await api.stock.batchAvailability(warehouseId, productNames);
        if (result.success && Array.isArray(result.availability)) {
          const avMap = {};
          result.availability.forEach(p => {
            avMap[(p.productName || '').toLowerCase().trim()] = p;
          });
          setAmendAvailability(avMap);
          setAmendItems(prev => prev.map(it => {
            const key = (it.productName || '').toLowerCase().trim();
            const avData = avMap[key];
            if (!avData) return it;
            const batchMatch = it.batchNo
              ? avData.batches.find(b => b.batchNo === it.batchNo)
              : null;
            const availableQty = batchMatch
              ? batchMatch.availableQty
              : (it.batchNo ? null : avData.totalAvailable);
            return { ...it, availableQty };
          }));
        }
      } catch (_) {}
    }
  };

  const handleWriteOffAction = async (ids, action, noteText) => {
    setProcessing(true);
    try {
      const gmName = user?.full_name || user?.username || 'GM';
      await api.put('/stock-movements', {
        action: ids.length === 1 ? action : (action === 'approve' ? 'approve_all' : 'reject_all'),
        id: ids.length === 1 ? ids[0] : undefined,
        ids: ids.length > 1 ? ids : undefined,
        approved_by: gmName,
        notes: noteText || null,
      });
      setPendingWriteOffs(prev => prev.filter(w => !ids.includes(w.id)));
      setMessage(action === 'approve'
        ? `✅ ${ids.length} write-off${ids.length > 1 ? 's' : ''} approved — stock has been deducted.`
        : `❌ ${ids.length} write-off${ids.length > 1 ? 's' : ''} rejected.`);
      setWoRejectModal(null);
      setWoRejectNote('');
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  const getFilteredItems = () => {
    const allItems = [
      ...cashRequests.map(r => ({ ...r, _type: 'cash' })),
      ...leaveRequests.map(r => ({ ...r, _type: 'leave' })),
      ...stockRequests.map(r => ({ ...r, _type: 'stock' })),
      ...pettyCashRequests.map(r => ({ ...r, _type: 'petty_cash' })),
    ];

    if (approvalTab === 'all') return allItems;
    if (approvalTab === 'cash') return allItems.filter(r => r._type === 'cash' || r.type === 'cash' || r.type === 'cash_request');
    if (approvalTab === 'leave') return allItems.filter(r => r._type === 'leave' || r.type === 'leave' || r.type === 'leave_request');
    if (approvalTab === 'stock') return allItems.filter(r => r._type === 'stock' || r.type === 'stock' || r.type === 'stock_movement');
    if (approvalTab === 'petty_cash') return allItems.filter(r => r._type === 'petty_cash');
    if (approvalTab === 'other') return allItems.filter(r => {
      const t = r._type || r.type || '';
      return !['cash', 'cash_request', 'leave', 'leave_request', 'stock', 'stock_movement', 'petty_cash'].includes(t);
    });
    return allItems;
  };

  const filteredItems = getFilteredItems();
  const totalCount = cashRequests.length + leaveRequests.length + stockRequests.length + pettyCashRequests.length;

  const handleRentReview = async (action) => {
    if (!rentReviewModal) return;
    setProcessing(true);
    try {
      const result = await api.finance.rent.reviewEdit(rentReviewModal.id, action, rentReviewNote);
      if (!result.success) throw new Error(result.error || 'Failed');
      setMessage(action === 'approve' ? '✅ Rent edit approved and applied.' : '❌ Rent edit request rejected.');
      setRentEditRequests(prev => prev.filter(r => r.id !== rentReviewModal.id));
      setRentReviewModal(null);
      setRentReviewNote('');
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleCasAction = async (action) => {
    if (!casModal) return;
    setProcessing(true);
    try {
      await api.patch(`/cash-requests/${casModal.id}`, { status: action, note: casNote });
      const msg = action === 'approved'
        ? `✅ Branch expense cash advance approved for ${casModal.branch || 'branch'} — N$ ${Math.round(Number(casModal.amount)).toLocaleString('en-ZA')} (${casModal.expense_category || 'General'}).`
        : `❌ Branch expense cash advance request rejected.`;
      setMessage(msg);
      setCasRequests(prev => prev.filter(r => r.id !== casModal.id));
      setCasModal(null);
      setCasNote('');
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleLeaveApproval = async (action) => {
    if (!leaveApprovalModal) return;
    setProcessing(true);
    try {
      await api.patch(`/leave-requests/${leaveApprovalModal.id}`, { status: action, note: leaveApprovalNote });
      const msg = action === 'approved'
        ? `✅ Leave request approved for ${leaveApprovalModal.staffName || leaveApprovalModal.staff}.`
        : `❌ Leave request rejected.`;
      setMessage(msg);
      const actorName = user?.full_name || user?.username || 'GM';
      setAdminLeaveRequests(prev => prev.filter(r => r.id !== leaveApprovalModal.id));
      setAllLeaveHistory(prev => prev.map(r => r.id !== leaveApprovalModal.id ? r : {
        ...r,
        status: action === 'approved' ? 'Approved' : 'Rejected',
        approvedBy: actorName,
        approvedAt: new Date().toISOString(),
        notes: leaveApprovalNote || r.notes,
      }));
      setLeaveApprovalModal(null);
      setLeaveApprovalNote('');
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleSalaryReview = async (action) => {
    if (!salaryReviewModal) return;
    setProcessing(true);
    try {
      const result = await api.hr.salaryLedger.reviewEdit(salaryReviewModal.id, action, salaryReviewNote);
      if (!result.success) throw new Error(result.error || 'Failed');
      setMessage(action === 'approve' ? '✅ Salary edit approved and applied.' : '❌ Salary edit request rejected.');
      setSalaryEditRequests(prev => prev.filter(r => r.id !== salaryReviewModal.id));
      setSalaryReviewModal(null);
      setSalaryReviewNote('');
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setProcessing(false);
    }
  };

  const subTabs = [
    { id: 'transfers', label: `🚚 Transfers${pendingTransfers.length > 0 ? ` (${pendingTransfers.length})` : ''}` },
    { id: 'writeoffs', label: `✏️ Write-Offs${pendingWriteOffs.length > 0 ? ` (${pendingWriteOffs.length})` : ''}` },
    { id: 'fieldstock', label: `🌿 Field Stock${fieldRequests.length > 0 ? ` (${fieldRequests.length})` : ''}` },
    { id: 'all', label: `All Requests${totalCount > 0 ? ` (${totalCount})` : ''}` },
    { id: 'petty_cash', label: `💵 Petty Cash${pettyCashRequests.length > 0 ? ` (${pettyCashRequests.length})` : ''}` },
    { id: 'rent_edits', label: `🏘️ Rent Edits${rentEditRequests.length > 0 ? ` (${rentEditRequests.length})` : ''}` },
    { id: 'salary_edits', label: `💼 Salary Edits${salaryEditRequests.length > 0 ? ` (${salaryEditRequests.length})` : ''}` },
    { id: 'cas_approvals', label: `🏢 CAS Approvals${casRequests.length > 0 ? ` (${casRequests.length})` : ''}` },
    { id: 'leave_approvals', label: `📅 Leave Approvals${adminLeaveRequests.length > 0 ? ` (${adminLeaveRequests.length})` : ''}` },
    { id: 'bonus_delete', label: `🗑️ Bonus Deletions${bonusDeleteRequests.length > 0 ? ` (${bonusDeleteRequests.length})` : ''}` },
    { id: 'hr_staff_changes', label: `👥 HR Staff Changes${staffChangeRequests.length > 0 ? ` (${staffChangeRequests.length})` : ''}` },
    { id: 'cash', label: 'Cash' },
    { id: 'leave', label: 'Leave' },
    { id: 'stock', label: 'Stock Movements' },
    { id: 'other', label: 'Other' },
  ];

  const renderStockItems = (r) => {
    let items = [];
    try { items = typeof r.items === 'string' ? JSON.parse(r.items) : (Array.isArray(r.items) ? r.items : []); } catch {}
    if (!items.length) return <span className="text-xs text-gray-400 italic">No item detail</span>;
    const totalVal = items.reduce((s, i) => s + Number(i.quantity || i.qty || 0) * Number(i.unit_price || i.dp || i.cif || 0), 0);
    return (
      <div>
        <table className="w-full text-xs border-collapse mt-1">
          <thead>
            <tr className="bg-gray-100">
              <th className="text-left py-1 px-2 border-b text-gray-500">Product</th>
              <th className="text-center py-1 px-2 border-b text-gray-500">Qty</th>
              <th className="text-right py-1 px-2 border-b text-gray-500">Unit</th>
              <th className="text-right py-1 px-2 border-b text-gray-500">DP Price</th>
              <th className="text-right py-1 px-2 border-b text-gray-500">Line Value</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const qty = Number(item.quantity || item.qty || 0);
              const dp = Number(item.unit_price || item.dp || 0);
              return (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="py-1 px-2 border-b font-medium">{item.productName || item.product_name || item.name || item.description || '-'}</td>
                  <td className="py-1 px-2 border-b text-center font-bold">{qty}</td>
                  <td className="py-1 px-2 border-b text-right text-gray-500">{item.unit || 'pcs'}</td>
                  <td className="py-1 px-2 border-b text-right">{dp > 0 ? formatCurrency(dp) : '—'}</td>
                  <td className="py-1 px-2 border-b text-right font-bold text-green-700">{dp > 0 ? formatCurrency(dp * qty) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
          {totalVal > 0 && (
            <tfoot>
              <tr className="bg-red-50">
                <td colSpan={4} className="py-1 px-2 text-right font-bold text-gray-700 border-t">Total Value:</td>
                <td className="py-1 px-2 text-right font-bold text-red-700 border-t">{formatCurrency(totalVal)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  };

  const renderRequests = () => {
    if (filteredItems.length === 0) {
      return <EmptyState icon={<CheckCircle size={48} />} title="No Pending Approvals" description={`No pending ${approvalTab === 'all' ? '' : approvalTab + ' '}requests require your approval.`} />;
    }

    return (
      <div className="space-y-3">
        {filteredItems.map(r => (
          <div key={r.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant={r._type === 'cash' ? 'warning' : r._type === 'leave' ? 'info' : r._type === 'petty_cash' ? 'primary' : 'success'}>
                      {r._type === 'cash' ? '💵 Cash' : r._type === 'leave' ? '📅 Leave' : r._type === 'petty_cash' ? '💵 Petty Cash' : '📦 Stock'}
                    </Badge>
                    <span className="font-bold text-gray-800">{r.requestNumber || r.request_number || r.id}</span>
                    <span className="text-xs text-gray-500">{formatDateTime(r.createdAt || r.created_at)}</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-700">
                    {r.staff_name || r.staffName || r.createdBy || r.employee_name || r.user || '—'}
                    {(r.staff_branch || r.requestingBranch || r.branch || r.requesting_branch) && (
                      <span className="ml-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full">
                        📍 {r.staff_branch || r.requestingBranch || r.branch || r.requesting_branch}
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {r.purpose || r.reason || r.description || r.notes || r.product_name || ''}
                  </p>
                  {r._type === 'petty_cash' && (
                    <div className="mt-1 flex items-center gap-3">
                      <span className="text-base font-bold text-green-700">{formatCurrency(r.amount)}</span>
                      {r.location && <span className="text-xs text-gray-400">📍 {r.location === 'head_office' ? 'Head Office' : r.location}</span>}
                    </div>
                  )}
                  {r.amount && r._type !== 'petty_cash' && (
                    <p className="text-base font-bold text-red-700 mt-1">{formatCurrency(r.amount)}</p>
                  )}
                  {(r.reviewed_by || r.finance_note || r.gm_approved_by) && (
                    <div className="flex flex-wrap gap-3 mt-2">
                      {r.reviewed_by && <span className="text-xs text-gray-500">🏦 Finance reviewed by <span className="font-semibold text-gray-700">{r.reviewed_by}</span></span>}
                      {r.gm_approved_by && <span className="text-xs text-gray-500">✅ GM approved by <span className="font-semibold text-gray-700">{r.gm_approved_by}</span></span>}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 ml-2">
                  <button onClick={() => setNoteModal({ type: r._type, id: r.id, action: 'approved' })}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 cursor-pointer">
                    ✓ Approve
                  </button>
                  <button onClick={() => setNoteModal({ type: r._type, id: r.id, action: 'rejected' })}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 cursor-pointer">
                    ✕ Reject
                  </button>
                </div>
              </div>

              {r._type === 'stock' && r.items && (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Product Line Items {(r.requestingBranch || r.requesting_branch) && `· From: ${r.requestingBranch || r.requesting_branch}`} {(r.requestType || r.request_type) && `· Type: ${r.requestType || r.request_type}`}
                  </p>
                  {renderStockItems(r)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div>
      {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} className="mb-4" onClose={() => setMessage('')}>{message}</Alert>}
      <div className="flex gap-2 mb-4 flex-wrap">
        {subTabs.map(t => (
          <button key={t.id} onClick={() => setApprovalTab(t.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all border-none ${approvalTab === t.id ? 'bg-primary text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {t.label}
          </button>
        ))}
        <button onClick={loadData} className="px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer border border-gray-200 bg-white text-gray-500">↺ Refresh</button>
      </div>

      {/* Transfer Approvals sub-tab */}
      {approvalTab === 'transfers' && (
        <div className="space-y-4">
          {pendingTransfers.length === 0 ? (
            <EmptyState icon={<CheckCircle size={48} />} title="No Pending Transfer Approvals" description="All stock transfer requests have been reviewed. New requests from warehouse managers will appear here." />
          ) : (
            <>
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                <strong>{pendingTransfers.length}</strong> dispatch note{pendingTransfers.length !== 1 ? 's' : ''} awaiting your approval. Review each document carefully before approving, amending, or rejecting.
              </div>
              <div className="space-y-4">
                {pendingTransfers.map(t => {
                  const items = Array.isArray(t.items) ? t.items : [];
                  const fromLoc = fmtLoc(t.fromWarehouse || t.from_location);
                  const toLoc = fmtLoc(t.toBranch || t.to_location);
                  const totalQty = items.length > 0 ? items.reduce((s, i) => s + Number(i.quantity || 0), 0) : (t.quantity || 0);
                  return (
                    <div key={t.id} style={{ background: '#fff', border: '2px solid #fcd34d', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                      <div style={{ background: 'linear-gradient(90deg,#fffbeb,#fef9e6)', padding: '12px 18px', borderBottom: '1px solid #fcd34d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span className="font-bold text-gray-800 text-sm">📄 Dispatch Note</span>
                          <span className="ml-2 font-mono text-xs text-gray-500">{t.dispatchReference || t.id}</span>
                        </div>
                        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 border border-yellow-200">⏳ Pending GM Approval</span>
                      </div>
                      <div className="p-4">
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div className="px-3 py-2 rounded-lg bg-gray-50 border">
                            <div className="text-xs text-gray-500 font-semibold uppercase">Source Warehouse</div>
                            <div className="font-bold text-gray-800 text-sm">{fromLoc}</div>
                          </div>
                          <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-100">
                            <div className="text-xs text-red-500 font-semibold uppercase">Destination Branch</div>
                            <div className="font-bold text-red-800 text-sm">{toLoc}</div>
                          </div>
                          <div className="px-3 py-2 rounded-lg bg-blue-50 border border-blue-100">
                            <div className="text-xs text-blue-600 font-semibold uppercase">Prepared By</div>
                            <div className="font-bold text-gray-800 text-sm">{t.createdBy || t.dispatchedBy || '—'}</div>
                            {t.preparedByRole && <div className="text-xs text-blue-600 capitalize mt-0.5">{t.preparedByRole.replace(/_/g, ' ')}</div>}
                          </div>
                          <div className="px-3 py-2 rounded-lg bg-gray-50 border">
                            <div className="text-xs text-gray-500 font-semibold uppercase">Date Prepared</div>
                            <div className="font-bold text-gray-800 text-sm">{fmtDate(t.createdAt || t.created_at)}</div>
                          </div>
                        </div>

                        {Array.isArray(t.destinationBranchStaff) && t.destinationBranchStaff.filter(s => (s.role || '').toLowerCase() === 'dispenser').length > 0 && (
                          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                            <div className="text-xs font-semibold text-green-700 uppercase mb-2">👥 Destination Branch Dispensers ({toLoc})</div>
                            <div className="grid grid-cols-1 gap-1">
                              {t.destinationBranchStaff.filter(s => (s.role || '').toLowerCase() === 'dispenser').map((s, si) => (
                                <div key={si} className="flex items-center gap-2 text-xs text-gray-700">
                                  <span className="font-semibold">{s.name}</span>
                                  <span className="text-gray-400">·</span>
                                  <span className="capitalize text-green-700 font-medium">{(s.role || '').replace(/_/g, ' ')}</span>
                                  {s.phone && <><span className="text-gray-400">·</span><span className="text-gray-500">{s.phone}</span></>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <table className="w-full text-xs border-collapse mb-3">
                          <thead>
                            <tr>
                              <th className="text-left py-1.5 px-2 border-b-2 border-red-200 text-gray-600 bg-red-50">Product</th>
                              <th className="text-left py-1.5 px-2 border-b-2 border-red-200 text-gray-600 bg-red-50">Batch</th>
                              <th className="text-left py-1.5 px-2 border-b-2 border-red-200 text-gray-600 bg-red-50">Expiry</th>
                              <th className="text-right py-1.5 px-2 border-b-2 border-red-200 text-gray-600 bg-red-50">Qty</th>
                              <th className="text-left py-1.5 px-2 border-b-2 border-red-200 text-gray-600 bg-red-50">Unit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.length > 0 ? (() => {
                              // #56 Group by product name → show batch split sub-rows for FEFO-split products
                              const groups = [];
                              const seen = new Map();
                              items.forEach(it => {
                                const key = (it.productName || it.productId || '').toLowerCase().trim();
                                if (!seen.has(key)) { seen.set(key, groups.length); groups.push({ name: it.productName || it.productId, batches: [], unit: it.unit || 'units' }); }
                                groups[seen.get(key)].batches.push(it);
                              });
                              return groups.flatMap((g, gi) => {
                                const isMulti = g.batches.length > 1;
                                const totalQtyG = g.batches.reduce((s, b) => s + Number(b.quantity || 0), 0);
                                const headerRow = (
                                  <tr key={`hdr-${gi}`} className={gi % 2 === 0 ? '' : 'bg-gray-50'}>
                                    <td className="py-1.5 px-2 border-b font-semibold">{g.name}</td>
                                    {isMulti ? (
                                      <td colSpan={2} className="py-1.5 px-2 border-b text-blue-600 font-semibold" style={{ fontSize: 10 }}>
                                        {g.batches.length} batch splits — see below
                                      </td>
                                    ) : (
                                      <>
                                        <td className="py-1.5 px-2 border-b text-gray-600 font-mono text-xs">{g.batches[0].batchNo || '—'}</td>
                                        <td className="py-1.5 px-2 border-b" style={{ color: g.batches[0].expiryDate && new Date(g.batches[0].expiryDate) < new Date(Date.now() + 90*86400000) ? '#dc2626' : g.batches[0].expiryDate ? '#666' : '#9ca3af' }}>
                                          {g.batches[0].expiryDate ? fmtDate(g.batches[0].expiryDate) : (g.batches[0].batchNo ? 'N/A' : '—')}
                                        </td>
                                      </>
                                    )}
                                    <td className="py-1.5 px-2 border-b text-right font-bold">{totalQtyG}</td>
                                    <td className="py-1.5 px-2 border-b text-gray-600">{g.unit}</td>
                                  </tr>
                                );
                                if (!isMulti) return [headerRow];
                                const subRows = g.batches.map((b, bi) => {
                                  const expSoon = b.expiryDate && new Date(b.expiryDate) < new Date(Date.now() + 90*86400000);
                                  return (
                                    <tr key={`sub-${gi}-${bi}`} style={{ background: '#eff6ff', borderLeft: '3px solid #93c5fd' }}>
                                      <td className="py-1 px-2 border-b text-xs text-gray-400 italic pl-5">↳ Split {bi+1}/{g.batches.length}</td>
                                      <td className="py-1 px-2 border-b font-mono text-xs text-gray-700">{b.batchNo || '—'}</td>
                                      <td className="py-1 px-2 border-b text-xs" style={{ color: expSoon ? '#dc2626' : b.expiryDate ? '#555' : '#9ca3af', fontWeight: expSoon ? 700 : 400 }}>
                                        {b.expiryDate ? fmtDate(b.expiryDate) : 'N/A'}
                                        {expSoon && <span className="ml-1 text-xs px-1 rounded" style={{ background: '#fee2e2', color: '#dc2626' }}>soon</span>}
                                      </td>
                                      <td className="py-1 px-2 border-b text-right font-bold text-xs">{b.quantity}</td>
                                      <td className="py-1 px-2 border-b text-gray-400 text-xs">{g.unit}</td>
                                    </tr>
                                  );
                                });
                                return [headerRow, ...subRows];
                              });
                            })() : (
                              <tr>
                                <td className="py-1.5 px-2 border-b font-medium">{t.product_name || '—'}</td>
                                <td className="py-1.5 px-2 border-b text-gray-500">—</td>
                                <td className="py-1.5 px-2 border-b text-gray-500">—</td>
                                <td className="py-1.5 px-2 border-b text-right font-bold">{t.quantity || 0}</td>
                                <td className="py-1.5 px-2 border-b text-gray-500">units</td>
                              </tr>
                            )}
                            <tr className="bg-gray-100 font-bold">
                              <td colSpan={3} className="py-1.5 px-2 border-t-2 border-gray-300">Total</td>
                              <td className="py-1.5 px-2 border-t-2 border-gray-300 text-right">{totalQty}</td>
                              <td className="py-1.5 px-2 border-t-2 border-gray-300">units</td>
                            </tr>
                          </tbody>
                        </table>

                        {t.dispatchNotes && <p className="text-xs text-gray-500 italic mb-3">Notes: {t.dispatchNotes}</p>}
                        {t.dispatchNote?.barcode && <p className="text-xs text-gray-400 mb-3">Barcode: <span className="font-mono">{t.dispatchNote.barcode}</span></p>}

                        {/* #59 Shortfall warning — shown when dispatcher acknowledged a stock shortfall */}
                        {(t.metadata?.shortfall_acknowledged || t.metadata?.shortfallAcknowledged) && (
                          <div style={{ background: '#fffbeb', border: '1.5px solid #f59e0b', borderRadius: 8, padding: '9px 13px', marginBottom: 12 }}>
                            <div style={{ fontWeight: 700, color: '#b45309', fontSize: 12 }}>⚠️ Partial Dispatch — Shortfall Acknowledged</div>
                            <div style={{ fontSize: 11, color: '#92400e', marginTop: 2 }}>
                              The dispatcher acknowledged insufficient stock at dispatch time. Some quantities may be below what was requested.
                              Consider amending this note to reflect what can actually be fulfilled.
                            </div>
                          </div>
                        )}

                        <div className="flex gap-2 flex-wrap">
                          <button onClick={() => setViewDispatch(t)}
                            className="px-3 py-2 rounded-lg text-xs font-bold cursor-pointer border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
                            📄 View Full Document
                          </button>
                          <button onClick={() => setNoteModal({ type: 'transfer', id: t.id, action: 'approved', label: `${fromLoc} → ${toLoc}` })}
                            className="flex-1 py-2 rounded-lg text-xs font-bold cursor-pointer border-none" style={{ background: '#166534', color: '#fff' }}>
                            ✓ Approve
                          </button>
                          <button onClick={() => openAmendModal(t)}
                            className="px-3 py-2 rounded-lg text-xs font-bold cursor-pointer border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100">
                            ✏️ Amend & Approve
                          </button>
                          <button onClick={() => setNoteModal({ type: 'transfer', id: t.id, action: 'rejected', label: `${fromLoc} → ${toLoc}` })}
                            className="px-3 py-2 rounded-lg text-xs font-bold cursor-pointer border border-red-200 bg-red-50 text-red-700 hover:bg-red-100">
                            ✕ Reject
                          </button>
                          <button onClick={() => setNoteModal({ type: 'return', id: t.id, action: 'returned', label: `${fromLoc} → ${toLoc}` })}
                            className="px-3 py-2 rounded-lg text-xs font-bold cursor-pointer border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100">
                            ↩ Return for Correction
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Write-Off Approvals sub-tab */}
      {approvalTab === 'writeoffs' && (
        <div className="space-y-4">
          {pendingWriteOffs.length === 0 ? (
            <EmptyState icon={<CheckCircle size={48} />} title="No Pending Write-Off Requests" description="Write-off requests submitted by branches will appear here for your approval." />
          ) : (
            <>
              <div style={{ background: '#fef9e6', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 16px', fontSize: '0.85rem', color: '#92400e', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <span><strong>{pendingWriteOffs.length}</strong> write-off request{pendingWriteOffs.length !== 1 ? 's' : ''} awaiting your review. Stock will only be deducted once you approve.</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    disabled={processing}
                    onClick={() => handleWriteOffAction(pendingWriteOffs.map(w => w.id), 'approve', null)}
                    style={{ padding: '7px 16px', background: '#166534', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.8rem', cursor: processing ? 'not-allowed' : 'pointer', opacity: processing ? 0.65 : 1 }}>
                    ✓ Approve All ({pendingWriteOffs.length})
                  </button>
                  <button
                    disabled={processing}
                    onClick={() => setWoRejectModal({ ids: pendingWriteOffs.map(w => w.id), label: `all ${pendingWriteOffs.length} write-offs` })}
                    style={{ padding: '7px 16px', background: '#991b1b', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.8rem', cursor: processing ? 'not-allowed' : 'pointer', opacity: processing ? 0.65 : 1 }}>
                    ✕ Reject All
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                {pendingWriteOffs.map((wo, idx) => {
                  const srcLabel = fmtLoc(wo.source_location || wo.sourceLocation || '');
                  const notesText = wo.notes || '';
                  const reasonMatch = notesText.match(/Write-off:\s*([^.]+)/i);
                  const reason = reasonMatch ? reasonMatch[1].trim() : (notesText || '—');
                  const batchNo = wo.batch_no || wo.batchNo || '—';
                  const expiry = wo.expiry_date || wo.expiryDate;
                  const fmtExp = expiry ? fmtDate(expiry) : '—';
                  const qty = Number(wo.quantity || 0);
                  const submittedBy = wo.created_by || wo.createdBy || '—';
                  const submittedAt = fmtDate(wo.created_at || wo.createdAt);
                  return (
                    <div key={wo.id || idx} style={{ background: '#fff', border: '1.5px solid #fde68a', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                      <div style={{ background: 'linear-gradient(90deg,#fffbeb,#fef9e6)', padding: '10px 16px', borderBottom: '1px solid #fde68a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ background: '#fef3c7', color: '#92400e', fontWeight: 700, fontSize: '0.72rem', padding: '2px 8px', borderRadius: 20, border: '1px solid #fcd34d' }}>⏳ Pending GM Approval</span>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#6b7280' }}>{wo.reference_id || wo.referenceId || wo.id}</span>
                          {(() => {
                            const expRaw = wo.expiry_date || wo.expiryDate;
                            const isExpiredBatch = (expRaw && new Date(expRaw) < new Date()) || (wo.write_off_reason || '').toLowerCase() === 'expired';
                            return isExpiredBatch
                              ? <span style={{ background: '#fef2f2', color: '#991b1b', fontWeight: 700, fontSize: '0.68rem', padding: '2px 8px', borderRadius: 20, border: '1px solid #fecaca' }}>🗑️ Approval → Dispose Off</span>
                              : <span style={{ background: '#f0fdf4', color: '#166534', fontWeight: 700, fontSize: '0.68rem', padding: '2px 8px', borderRadius: 20, border: '1px solid #bbf7d0' }}>↩ Approval → Return to Warehouse</span>;
                          })()}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#92400e' }}>Submitted {submittedAt} by <strong>{submittedBy}</strong></span>
                      </div>
                      <div style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 14 }}>
                          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 12px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>Branch</div>
                            <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.85rem' }}>{srcLabel || '—'}</div>
                          </div>
                          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 12px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>Product</div>
                            <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.85rem' }}>{wo.product_name || wo.productName || '—'}</div>
                          </div>
                          <div style={{ background: '#fef2f2', borderRadius: 8, padding: '8px 12px', border: '1px solid #fecaca' }}>
                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9b1c1c', textTransform: 'uppercase', marginBottom: 2 }}>Qty to Write Off</div>
                            <div style={{ fontWeight: 900, color: '#dc2626', fontSize: '1rem' }}>{qty.toLocaleString()} units</div>
                          </div>
                          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 12px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>Batch No.</div>
                            <div style={{ fontWeight: 600, color: '#6366f1', fontFamily: 'monospace', fontSize: '0.82rem' }}>{batchNo}</div>
                          </div>
                          <div style={{ background: batchNo !== '—' && expiry && new Date(expiry) < new Date() ? '#fef2f2' : '#f8fafc', borderRadius: 8, padding: '8px 12px', border: `1px solid ${batchNo !== '—' && expiry && new Date(expiry) < new Date() ? '#fecaca' : '#e2e8f0'}` }}>
                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>Expiry Date</div>
                            <div style={{ fontWeight: 600, color: expiry && new Date(expiry) < new Date() ? '#dc2626' : '#374151', fontSize: '0.82rem' }}>
                              {fmtExp}{expiry && new Date(expiry) < new Date() ? ' ⚠️ EXPIRED' : ''}
                            </div>
                          </div>
                          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 12px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 }}>Reason</div>
                            <div style={{ fontWeight: 600, color: '#374151', fontSize: '0.82rem', textTransform: 'capitalize' }}>{reason}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button
                            disabled={processing}
                            onClick={() => handleWriteOffAction([wo.id], 'approve', null)}
                            style={{ padding: '8px 18px', background: '#166534', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.82rem', cursor: processing ? 'not-allowed' : 'pointer', opacity: processing ? 0.65 : 1 }}>
                            ✓ Approve
                          </button>
                          <button
                            disabled={processing}
                            onClick={() => setWoRejectModal({ ids: [wo.id], label: `${wo.product_name || 'this item'} (${qty} units)` })}
                            style={{ padding: '8px 18px', background: '#fff', color: '#991b1b', border: '1.5px solid #fca5a5', borderRadius: 8, fontWeight: 700, fontSize: '0.82rem', cursor: processing ? 'not-allowed' : 'pointer' }}>
                            ✕ Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Field Stock Requests sub-tab */}
      {approvalTab === 'fieldstock' && (
        <div className="space-y-4">
          {/* Pending requests needing action */}
          {fieldRequests.length === 0 ? (
            <EmptyState icon={<CheckCircle size={48} />} title="No Pending Field Stock Requests" description="Branch field program requests awaiting your approval will appear here." />
          ) : (
            <>
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                <strong>{fieldRequests.length}</strong> field stock request{fieldRequests.length !== 1 ? 's' : ''} from branches awaiting your approval.
              </div>
              <div className="space-y-4">
                {fieldRequests.map(r => {
                  const products = Array.isArray(r.products) ? r.products : [];
                  return (
                    <div key={r.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100" style={{ background: '#f0fdf4' }}>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm font-bold text-green-800">🌿 {r.id}</span>
                          <Badge variant="warning">Pending Approval</Badge>
                          {r.branch && <Badge variant="info">{r.branch}</Badge>}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setNoteModal({ type: 'fieldstock', id: r.id, action: 'approved' })}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 cursor-pointer">
                            ✓ Approve
                          </button>
                          <button onClick={() => setNoteModal({ type: 'fieldstock', id: r.id, action: 'rejected' })}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 cursor-pointer">
                            ✕ Reject
                          </button>
                        </div>
                      </div>
                      <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm mb-2">
                        <div><span className="text-gray-500">Distributor:</span> <span className="font-semibold">{r.distributor_name || '—'}</span> {r.distributor_code && <span className="text-xs text-gray-400">({r.distributor_code})</span>}</div>
                        <div><span className="text-gray-500">Date:</span> <span className="font-semibold">{fmtDate(r.date)}</span></div>
                        <div><span className="text-gray-500">Branch:</span> <span className="font-semibold">{r.branch || '—'}</span></div>
                        <div><span className="text-gray-500">Submitted by:</span> <span className="font-semibold">{r.created_by || '—'}</span></div>
                        {r.notes && <div className="col-span-2"><span className="text-gray-500">Notes:</span> <span className="text-gray-700">{r.notes}</span></div>}
                      </div>
                      {products.length > 0 && (
                        <div className="px-4 pb-4">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Requested Products ({products.length} item{products.length !== 1 ? 's' : ''})</p>
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="bg-gray-100">
                                <th className="text-left py-1.5 px-2 border-b text-gray-500">#</th>
                                <th className="text-left py-1.5 px-2 border-b text-gray-500">Product</th>
                                <th className="text-center py-1.5 px-2 border-b text-gray-500">Qty</th>
                                <th className="text-left py-1.5 px-2 border-b text-gray-500">Unit</th>
                              </tr>
                            </thead>
                            <tbody>
                              {products.map((p, i) => (
                                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                  <td className="py-1 px-2 border-b text-gray-400">{i + 1}</td>
                                  <td className="py-1 px-2 border-b font-medium">{p.product_name || p.name || p.product || '—'}</td>
                                  <td className="py-1 px-2 border-b text-center font-bold text-green-700">{p.quantity}</td>
                                  <td className="py-1 px-2 border-b text-gray-500">{p.unit || 'pcs'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* History — all processed records */}
          {allFieldRequests.filter(r => r.status !== 'pending').length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">📋 Field Stock History</p>
              <div className="space-y-3">
                {allFieldRequests.filter(r => r.status !== 'pending').map(r => {
                  const products = Array.isArray(r.products) ? r.products : [];
                  const isApproved = r.status === 'approved';
                  return (
                    <div key={r.id} className="bg-white border rounded-xl overflow-hidden shadow-sm" style={{ borderColor: isApproved ? '#d1fae5' : '#fee2e2' }}>
                      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ background: isApproved ? '#f0fdf4' : '#fff1f2', borderColor: isApproved ? '#d1fae5' : '#fecaca' }}>
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm font-bold" style={{ color: isApproved ? '#166534' : '#991b1b' }}>🌿 {r.id}</span>
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: isApproved ? '#dcfce7' : '#fee2e2', color: isApproved ? '#166534' : '#991b1b' }}>
                            {isApproved ? '✓ Approved' : '✕ Rejected'}
                          </span>
                          {r.branch && <Badge variant="info">{r.branch}</Badge>}
                        </div>
                        <span className="text-xs text-gray-400">{fmtDate(r.approved_at || r.updated_at || r.created_at)}</span>
                      </div>
                      <div className="p-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                        <div><span className="text-gray-500">Distributor:</span> <span className="font-semibold">{r.distributor_name || '—'}</span> {r.distributor_code && <span className="text-gray-400">({r.distributor_code})</span>}</div>
                        <div><span className="text-gray-500">Date:</span> <span className="font-semibold">{fmtDate(r.date)}</span></div>
                        <div><span className="text-gray-500">Branch:</span> <span className="font-semibold">{r.branch || '—'}</span></div>
                        <div><span className="text-gray-500">Submitted by:</span> <span className="font-semibold">{r.created_by || '—'}</span></div>
                        {r.approved_by && <div><span className="text-gray-500">{isApproved ? 'Approved' : 'Rejected'} by:</span> <span className="font-semibold">{r.approved_by}</span></div>}
                        {r.notes && <div className="col-span-2"><span className="text-gray-500">Notes:</span> <span className="text-gray-600">{r.notes}</span></div>}
                        {products.length > 0 && <div className="col-span-2 mt-1 text-gray-400">{products.length} product(s): {products.map(p => p.product_name || p.name || p.product).join(', ')}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rent Edit Requests sub-tab */}
      {approvalTab === 'rent_edits' && (
        <div className="space-y-4">
          {rentEditRequests.length === 0 ? (
            <EmptyState icon={<CheckCircle size={48} />} title="No Pending Rent Edit Requests" description="Finance-submitted rent/lease edits awaiting your approval will appear here." />
          ) : (
            <>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                <strong>{rentEditRequests.length}</strong> rent/lease edit{rentEditRequests.length !== 1 ? 's' : ''} from Finance awaiting your approval.
              </div>
              <div className="space-y-3">
                {rentEditRequests.map(r => {
                  const changes = typeof r.proposed_changes === 'string' ? JSON.parse(r.proposed_changes) : (r.proposed_changes || {});
                  const changedFields = Object.keys(changes).filter(k => changes[k] !== null && changes[k] !== undefined);
                  return (
                    <div key={r.id} className="bg-white border border-blue-200 rounded-xl overflow-hidden shadow-sm">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-blue-100 bg-blue-50">
                        <div>
                          <span className="font-bold text-blue-900">🏘️ {r.branch_name}</span>
                          <span className="ml-3 text-xs text-blue-600">Requested by: {r.requested_by}</span>
                          <span className="ml-3 text-xs text-gray-400">{fmtDate(r.requested_at)}</span>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setRentReviewModal(r); setRentReviewNote(''); }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 cursor-pointer">
                            Review
                          </button>
                        </div>
                      </div>
                      <div className="p-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Current → Proposed Changes</p>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {changedFields.map(k => (
                            <div key={k} className="bg-amber-50 border border-amber-200 rounded p-2">
                              <span className="font-semibold text-gray-600">{k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}:</span>
                              <span className="ml-1 text-amber-900 font-bold">{String(changes[k])}</span>
                              <span className="ml-1 text-gray-400">(was: {String(r[k] ?? '—')})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {/* Rent Review Modal */}
          {rentReviewModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 500, boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
                <div style={{ padding: '16px 24px', borderBottom: '2px solid #3b82f6', background: '#eff6ff' }}>
                  <h2 style={{ margin: 0, fontSize: 18, color: '#1e3a8a' }}>🏘️ Review Rent Edit — {rentReviewModal.branch_name}</h2>
                </div>
                <div style={{ padding: 24 }}>
                  {(() => {
                    const ch = typeof rentReviewModal.proposed_changes === 'string' ? JSON.parse(rentReviewModal.proposed_changes) : (rentReviewModal.proposed_changes || {});
                    return (
                      <div className="space-y-2 mb-4">
                        {Object.entries(ch).map(([k, v]) => (
                          <div key={k} className="flex justify-between text-sm border-b pb-1">
                            <span className="text-gray-500">{k.replace(/_/g, ' ')}</span>
                            <span className="font-bold text-blue-900">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  <label className="block text-sm font-medium text-gray-700 mb-1">Review Notes (optional)</label>
                  <textarea value={rentReviewNote} onChange={e => setRentReviewNote(e.target.value)} rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 focus:outline-none" placeholder="Add notes…" />
                  <div className="flex gap-3">
                    <button onClick={() => handleRentReview('approve')} disabled={processing}
                      className="flex-1 py-2 rounded-lg bg-green-600 text-white font-bold text-sm hover:bg-green-700 disabled:opacity-50 cursor-pointer">
                      ✓ Approve &amp; Apply
                    </button>
                    <button onClick={() => handleRentReview('reject')} disabled={processing}
                      className="flex-1 py-2 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700 disabled:opacity-50 cursor-pointer">
                      ✕ Reject
                    </button>
                    <button onClick={() => setRentReviewModal(null)}
                      className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-100 cursor-pointer">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {approvalTab === 'salary_edits' && (
        <div className="space-y-4">
          {salaryEditRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 text-gray-400">
              <CheckCircle size={48} className="mb-2 opacity-30" />
              <p className="font-semibold text-gray-500">No Pending Salary Edit Requests</p>
              <p className="text-sm text-gray-400 mt-1">Salary edits from HR and Finance will appear here for your approval.</p>
            </div>
          ) : (
            <>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
                <strong>{salaryEditRequests.length}</strong> salary ledger edit{salaryEditRequests.length !== 1 ? 's' : ''} awaiting your approval.
              </div>
              <div className="space-y-3">
                {salaryEditRequests.map(r => {
                  const changes = typeof r.proposed_changes === 'string' ? JSON.parse(r.proposed_changes) : (r.proposed_changes || {});
                  const isRemoval = r.action_type === 'remove';
                  const changedFields = Object.keys(changes).filter(k => changes[k] !== undefined && changes[k] !== null);
                  const numFmt = (v) => isNaN(v) ? v : `N$ ${Math.round(Number(v)).toLocaleString('en-ZA')}`;
                  const numKeys = ['basic_salary','overtime_amount','total_salary','ssc_deductions','other_deductions'];
                  return (
                    <div key={r.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                        <div>
                          <span className="font-bold text-slate-800">💼 {r.name || 'Employee'}</span>
                          {isRemoval && <span className="ml-2 text-xs font-bold bg-red-100 text-red-700 rounded px-1">REMOVAL REQUEST</span>}
                          {!isRemoval && <span className="ml-2 text-xs font-bold bg-blue-100 text-blue-700 rounded px-1">EDIT REQUEST</span>}
                          <span className="ml-3 text-xs text-slate-500">By: {r.requested_by} ({r.requested_role}) · {fmtDate(r.requested_at)}</span>
                        </div>
                        <button onClick={() => { setSalaryReviewModal(r); setSalaryReviewNote(''); }}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 cursor-pointer">
                          Review
                        </button>
                      </div>
                      <div className="p-4">
                        {isRemoval ? (
                          <p className="text-sm text-red-600 font-medium">Propose removing <strong>{r.name}</strong> from the salary ledger.
                            Current total salary: <strong>{numFmt(r.total_salary)}</strong></p>
                        ) : (
                          <>
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Proposed Changes</p>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                              {changedFields.map(k => (
                                <div key={k} className="bg-amber-50 border border-amber-200 rounded p-2">
                                  <div className="font-semibold text-slate-600">{k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</div>
                                  <div className="text-amber-900 font-bold">{numKeys.includes(k) ? numFmt(changes[k]) : String(changes[k])}</div>
                                  {r[k] !== undefined && <div className="text-slate-400 text-xs">was: {numKeys.includes(k) ? numFmt(r[k]) : String(r[k] ?? '—')}</div>}
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {salaryReviewModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 520, boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
                <div style={{ padding: '16px 24px', borderBottom: '2px solid #334155', background: '#f8fafc' }}>
                  <h2 style={{ margin: 0, fontSize: 18, color: '#1e293b' }}>
                    💼 {salaryReviewModal.action_type === 'remove' ? 'Review Salary Removal' : 'Review Salary Edit'} — {salaryReviewModal.name}
                  </h2>
                </div>
                <div style={{ padding: 24 }}>
                  {salaryReviewModal.action_type === 'remove' ? (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4">
                      This will permanently remove <strong>{salaryReviewModal.name}</strong> from the salary ledger.
                    </div>
                  ) : (
                    <div className="space-y-2 mb-4">
                      {(() => {
                        const ch = typeof salaryReviewModal.proposed_changes === 'string' ? JSON.parse(salaryReviewModal.proposed_changes) : (salaryReviewModal.proposed_changes || {});
                        const numKeys = ['basic_salary','overtime_amount','total_salary','ssc_deductions','other_deductions'];
                        return Object.entries(ch).map(([k, v]) => (
                          <div key={k} className="flex justify-between text-sm border-b pb-1">
                            <span className="text-gray-500">{k.replace(/_/g, ' ')}</span>
                            <span className="font-bold text-slate-800">{numKeys.includes(k) ? `N$ ${Math.round(Number(v)).toLocaleString('en-ZA')}` : String(v)}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                  <label className="block text-sm font-medium text-gray-700 mb-1">Review Notes (optional)</label>
                  <textarea value={salaryReviewNote} onChange={e => setSalaryReviewNote(e.target.value)} rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-3 focus:outline-none" placeholder="Add notes…" />
                  <div className="flex gap-3">
                    <button onClick={() => handleSalaryReview('approve')} disabled={processing}
                      className="flex-1 py-2 rounded-lg bg-green-600 text-white font-bold text-sm hover:bg-green-700 disabled:opacity-50 cursor-pointer">
                      ✓ Approve &amp; Apply
                    </button>
                    <button onClick={() => handleSalaryReview('reject')} disabled={processing}
                      className="flex-1 py-2 rounded-lg bg-red-600 text-white font-bold text-sm hover:bg-red-700 disabled:opacity-50 cursor-pointer">
                      ✕ Reject
                    </button>
                    <button onClick={() => setSalaryReviewModal(null)}
                      className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-100 cursor-pointer">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {approvalTab === 'cas_approvals' && (
        <div className="space-y-4">
          {casRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 text-gray-400">
              <CheckCircle size={48} className="mb-2 opacity-30" />
              <p className="font-semibold text-gray-500">No Pending CAS Approvals</p>
              <p className="text-sm text-gray-400 mt-1">Cash advance requests reviewed by Finance will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                <strong>{casRequests.length}</strong> branch expense cash advance request{casRequests.length !== 1 ? 's' : ''} reviewed by Finance awaiting your final approval.
              </div>
              {casRequests.map(r => (
                <div key={r.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-bold text-gray-800">{r.request_number}</span>
                      <span className="font-bold text-lg text-green-700">N$ {Math.round(Number(r.amount || 0)).toLocaleString('en-ZA')}</span>
                      {r.urgent && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}>URGENT</span>}
                      <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: '#eff6ff', color: '#1e40af', border: '1px solid #93c5fd' }}>💼 Finance Reviewed</span>
                    </div>
                    <button onClick={() => { setCasModal(r); setCasNote(''); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90 cursor-pointer">
                      Review &amp; Approve
                    </button>
                  </div>
                  <div className="p-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mb-1">
                      <span className="text-sm font-bold text-gray-800">📍 {r.branch || 'Unknown Branch'}</span>
                      {r.expense_category && <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 8px', borderRadius: 20, background: '#eff6ff', color: '#1e40af', border: '1px solid #93c5fd' }}>{r.expense_category}</span>}
                      {(r.submitted_by_name || r.requested_by) && <span className="text-xs text-gray-400">by {r.submitted_by_name || r.requested_by}</span>}
                    </div>
                    <div className="text-sm text-gray-700 mb-1"><span className="font-semibold">Expense:</span> {r.purpose}</div>
                    {r.needed_by && <div className="text-xs text-gray-500">Needed by: {r.needed_by}</div>}
                    {r.finance_note && <div className="text-xs mt-2 p-2 rounded bg-blue-50 border border-blue-100 text-blue-800">Finance Note: {r.finance_note}</div>}
                    <div className="text-xs text-gray-400 mt-2">Submitted: {r.created_at ? new Date(r.created_at).toLocaleString('en-NA') : '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {casModal && (
        <div onClick={e => { if (e.target === e.currentTarget) { setCasModal(null); setCasNote(''); } }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 500, boxShadow: '0 25px 50px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', background: 'linear-gradient(135deg,#166534,#15803d)' }}>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '1rem', fontWeight: 800 }}>💵 Final CAS Approval — Branch Expense</h3>
              <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem' }}>{casModal.request_number} · {casModal.branch || 'Branch'}{casModal.expense_category ? ` · ${casModal.expense_category}` : ''}</p>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginBottom: 2, fontWeight: 700, textTransform: 'uppercase' }}>Branch</span>
                    <span style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.95rem' }}>📍 {casModal.branch || '—'}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginBottom: 2, fontWeight: 700, textTransform: 'uppercase' }}>Amount</span>
                    <span style={{ fontWeight: 800, color: '#166534', fontSize: '1.1rem' }}>N$ {Math.round(Number(casModal.amount || 0)).toLocaleString('en-ZA')}</span>
                  </div>
                </div>
                {casModal.expense_category && <div style={{ marginBottom: 8 }}><span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: '#eff6ff', color: '#1e40af', border: '1px solid #93c5fd' }}>{casModal.expense_category}</span></div>}
                <div style={{ fontSize: '0.87rem', color: '#374151' }}>{casModal.purpose}</div>
                {casModal.needed_by && <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>Needed by: {casModal.needed_by}</div>}
                {(casModal.submitted_by_name || casModal.requested_by) && <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 4 }}>Submitted by: {casModal.submitted_by_name || casModal.requested_by}</div>}
                {casModal.finance_note && <div style={{ marginTop: 8, fontSize: '0.8rem', padding: '6px 10px', background: '#eff6ff', borderRadius: 6, color: '#1e40af' }}>Finance Note: {casModal.finance_note}</div>}
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>GM Note (optional)</label>
                <textarea value={casNote} onChange={e => setCasNote(e.target.value)} rows={2} placeholder="Add a note…" style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: '0.87rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setCasModal(null); setCasNote(''); }} style={{ flex: 1, padding: '10px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600 }}>Cancel</button>
                <button onClick={() => handleCasAction('rejected')} disabled={processing} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 10, background: '#fef2f2', color: '#dc2626', fontWeight: 700, cursor: processing ? 'not-allowed' : 'pointer', opacity: processing ? 0.65 : 1 }}>❌ Reject</button>
                <button onClick={() => handleCasAction('approved')} disabled={processing} style={{ flex: 2, padding: '10px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#166534,#15803d)', color: '#fff', fontWeight: 800, cursor: processing ? 'not-allowed' : 'pointer', opacity: processing ? 0.65 : 1 }}>
                  {processing ? '⏳ Processing…' : '✅ Approve Cash Advance'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leave Approvals sub-tab */}
      {approvalTab === 'leave_approvals' && (
        <div className="space-y-4">
          {adminLeaveRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-16 text-gray-400">
              <CheckCircle size={48} className="mb-2 opacity-30" />
              <p className="font-semibold text-gray-500">No Pending Leave Requests</p>
              <p className="text-sm text-gray-400 mt-1">Leave requests from staff will appear here for your approval.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <strong>{adminLeaveRequests.length}</strong> leave request{adminLeaveRequests.length !== 1 ? 's' : ''} pending your approval.
              </div>
              {adminLeaveRequests.map(r => (
                <div key={r.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-bold text-gray-800">{r.staffName || r.staff}</span>
                      {r.branch && <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">📍 {r.branch}</span>}
                      <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: '#fff0f3', color: '#c41e3a', border: '1px solid #fecaca' }}>{r.type || 'Annual'} Leave</span>
                      {r.urgent && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}>URGENT</span>}
                    </div>
                    <button onClick={() => { setLeaveApprovalModal(r); setLeaveApprovalNote(''); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90 cursor-pointer">
                      Review &amp; Approve
                    </button>
                  </div>
                  <div className="p-4">
                    <div className="text-sm text-gray-700 mb-1"><span className="font-semibold">Period:</span> {fmtDate(r.startDate || r.start_date)} → {fmtDate(r.endDate || r.end_date)}</div>
                    <div className="text-sm text-gray-600 mb-1"><span className="font-semibold">Reason:</span> {r.reason}</div>
                    <div className="text-xs text-gray-400 mt-1">Submitted: {r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-NA') : '—'}</div>
                  </div>
                </div>
              ))}

              {/* Leave History */}
              {(() => {
                const history = allLeaveHistory.filter(r => r.status?.toLowerCase() !== 'pending');
                if (history.length === 0) return null;
                return (
                  <div className="mt-6">
                    <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">Leave Records — History</h4>
                    <div className="space-y-2">
                      {history.map(r => (
                        <div key={r.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-gray-800">{r.staffName || r.staff}</span>
                              {r.branch && <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">📍 {r.branch}</span>}
                              <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: '#fff0f3', color: '#c41e3a', border: '1px solid #fecaca' }}>{r.type || 'Annual'} Leave</span>
                            </div>
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${r.status?.toLowerCase() === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {r.status}
                            </span>
                          </div>
                          <div className="p-4">
                            <div className="text-sm text-gray-700 mb-1"><span className="font-semibold">Period:</span> {fmtDate(r.startDate || r.start_date)} → {fmtDate(r.endDate || r.end_date)}</div>
                            <div className="text-sm text-gray-600 mb-1"><span className="font-semibold">Reason:</span> {r.reason}</div>
                            <div className="flex flex-wrap gap-4 mt-2">
                              {r.approvedBy && <div className="text-xs text-gray-500">✅ {r.status} by <span className="font-semibold text-gray-700">{r.approvedBy}</span></div>}
                              {r.approvedAt && <div className="text-xs text-gray-400">{new Date(r.approvedAt).toLocaleString('en-NA')}</div>}
                            </div>
                            {r.notes && <div className="text-xs text-gray-500 mt-1 italic">Note: {r.notes}</div>}
                            <div className="text-xs text-gray-400 mt-1">Submitted: {r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-NA') : '—'}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {leaveApprovalModal && (
        <div onClick={e => { if (e.target === e.currentTarget) { setLeaveApprovalModal(null); setLeaveApprovalNote(''); } }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 25px 50px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', background: 'linear-gradient(135deg,#c41e3a,#8b0000)' }}>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '1rem', fontWeight: 800 }}>📅 Leave Request Approval</h3>
              <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem' }}>{leaveApprovalModal.staffName || leaveApprovalModal.staff} · {leaveApprovalModal.type} Leave</p>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.82rem', color: '#64748b' }}>Staff</span>
                  <span style={{ fontWeight: 700, color: '#1e293b' }}>{leaveApprovalModal.staffName || leaveApprovalModal.staff}</span>
                </div>
                {leaveApprovalModal.branch && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: '0.82rem', color: '#64748b' }}>Branch</span>
                    <span style={{ fontWeight: 700, color: '#1e40af' }}>📍 {leaveApprovalModal.branch}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.82rem', color: '#64748b' }}>Period</span>
                  <span style={{ fontWeight: 700, color: '#1e293b' }}>{fmtDate(leaveApprovalModal.startDate || leaveApprovalModal.start_date)} → {fmtDate(leaveApprovalModal.endDate || leaveApprovalModal.end_date)}</span>
                </div>
                <div style={{ fontSize: '0.87rem', color: '#374151', marginTop: 4 }}>{leaveApprovalModal.reason}</div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>GM Note (optional)</label>
                <textarea value={leaveApprovalNote} onChange={e => setLeaveApprovalNote(e.target.value)} rows={2} placeholder="Add a note…" style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: '0.87rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => { setLeaveApprovalModal(null); setLeaveApprovalNote(''); }} style={{ flex: 1, padding: '10px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600 }}>Cancel</button>
                <button onClick={() => handleLeaveApproval('rejected')} disabled={processing} style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 10, background: '#fef2f2', color: '#dc2626', fontWeight: 700, cursor: processing ? 'not-allowed' : 'pointer', opacity: processing ? 0.65 : 1 }}>❌ Reject</button>
                <button onClick={() => handleLeaveApproval('approved')} disabled={processing} style={{ flex: 2, padding: '10px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', fontWeight: 800, cursor: processing ? 'not-allowed' : 'pointer', opacity: processing ? 0.65 : 1 }}>
                  {processing ? '⏳ Processing…' : '✅ Approve Leave'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bonus Period Delete Approvals */}
      {approvalTab === 'bonus_delete' && (
        <div className="space-y-4">
          {bonusDeleteModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 25px 50px rgba(0,0,0,0.25)', padding: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: bonusDeleteModal.action === 'approve' ? '#fef2f2' : '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 22 }}>{bonusDeleteModal.action === 'approve' ? '🗑️' : '↩️'}</span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17, color: '#111827' }}>
                      {bonusDeleteModal.action === 'approve' ? 'Approve Period Deletion' : 'Reject Period Deletion'}
                    </div>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>Period: {bonusDeleteModal.req.period}</div>
                  </div>
                </div>
                {bonusDeleteModal.action === 'approve' && (
                  <div style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, color: '#991b1b', fontSize: 13 }}>⚠️ This will permanently delete {bonusDeleteModal.req.record_count} bonus records for {bonusDeleteModal.req.period}.</div>
                    <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 4 }}>Total value: N$ {Number(bonusDeleteModal.req.total_earned || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })} — This action cannot be undone.</div>
                  </div>
                )}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 5 }}>Requested by: <span style={{ fontWeight: 400 }}>{bonusDeleteModal.req.requested_by}</span></div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>Reason: <span style={{ fontWeight: 400 }}>{bonusDeleteModal.req.reason || '—'}</span></div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>GM Note (optional)</label>
                  <textarea value={bonusDeleteNote} onChange={e => setBonusDeleteNote(e.target.value)} rows={2} placeholder="Add a note…" style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: '0.87rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setBonusDeleteModal(null); setBonusDeleteNote(''); }} style={{ flex: 1, padding: '10px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600 }}>Cancel</button>
                  <button
                    disabled={processing}
                    onClick={async () => {
                      setProcessing(true);
                      try {
                        const result = await api.finance.actionBonusPeriodDeleteRequest(bonusDeleteModal.req.id, {
                          action: bonusDeleteModal.action,
                          gm_notes: bonusDeleteNote || null,
                        });
                        setMessage(bonusDeleteModal.action === 'approve'
                          ? `✅ ${result.message}`
                          : `↩️ Deletion request for ${bonusDeleteModal.req.period} rejected.`);
                        setBonusDeleteRequests(prev => prev.filter(r => r.id !== bonusDeleteModal.req.id));
                        setBonusDeleteModal(null);
                        setBonusDeleteNote('');
                      } catch (err) {
                        setMessage('Error: ' + err.message);
                      } finally {
                        setProcessing(false);
                      }
                    }}
                    style={{
                      flex: 2, padding: '10px', border: 'none', borderRadius: 10, fontWeight: 800, cursor: processing ? 'not-allowed' : 'pointer', opacity: processing ? 0.65 : 1,
                      background: bonusDeleteModal.action === 'approve' ? 'linear-gradient(135deg,#dc2626,#991b1b)' : 'linear-gradient(135deg,#16a34a,#15803d)',
                      color: '#fff',
                    }}>
                    {processing ? '⏳ Processing…' : bonusDeleteModal.action === 'approve' ? '🗑️ Confirm Delete' : '↩️ Confirm Reject'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {bonusDeleteRequests.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div style={{ fontSize: 48, marginBottom: 12 }}>🗑️</div>
              <div className="font-semibold text-gray-500 text-lg">No Pending Bonus Deletion Requests</div>
              <div className="text-sm text-gray-400 mt-1">Finance team can request period deletions from the Bonus Committed tab.</div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm font-semibold text-gray-600 px-1">{bonusDeleteRequests.length} request{bonusDeleteRequests.length !== 1 ? 's' : ''} pending your review.</div>
              {bonusDeleteRequests.map(r => (
                <div key={r.id} style={{ background: 'white', borderRadius: 14, border: '2px solid #fca5a5', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '18px 22px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 800, fontSize: 17, color: '#111827', marginBottom: 4 }}>Period: {r.period}</div>
                      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 2 }}>
                        <span style={{ fontWeight: 600, color: '#374151' }}>{r.record_count}</span> bonus records ·{' '}
                        Total Earned: <span style={{ fontWeight: 600, color: '#dc2626' }}>N$ {Number(r.total_earned || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>
                        Requested by <span style={{ fontWeight: 600, color: '#374151' }}>{r.requested_by}</span>{' '}
                        · {r.requested_at ? new Date(r.requested_at).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                      </div>
                      {r.reason && (
                        <div style={{ fontSize: 12, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', color: '#374151' }}>
                          <span style={{ fontWeight: 700 }}>Reason:</span> {r.reason}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button
                        onClick={() => setBonusDeleteModal({ req: r, action: 'reject' })}
                        style={{ padding: '8px 16px', border: '1.5px solid #d1d5db', borderRadius: 9, background: '#f9fafb', color: '#374151', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        ↩️ Reject
                      </button>
                      <button
                        onClick={() => setBonusDeleteModal({ req: r, action: 'approve' })}
                        style={{ padding: '8px 16px', border: 'none', borderRadius: 9, background: 'linear-gradient(135deg,#dc2626,#991b1b)', color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        🗑️ Approve Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* HR Staff Change Requests sub-tab */}
      {approvalTab === 'hr_staff_changes' && (
        <div className="space-y-4">
          {staffChangeModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div style={{ background: 'white', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 25px 50px rgba(0,0,0,0.25)', padding: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: staffChangeModal.action === 'approved' ? '#f0fdf4' : '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 22 }}>
                    {staffChangeModal.req.request_type === 'add' ? '👤' : '🚫'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 17, color: '#111827' }}>
                      {staffChangeModal.action === 'approved' ? 'Approve' : 'Reject'} {staffChangeModal.req.request_type === 'add' ? 'New Employee' : 'Employee Removal'}
                    </div>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>{staffChangeModal.req.full_name}</div>
                  </div>
                </div>
                <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontSize: 13 }}>
                  <div><strong>Position:</strong> {staffChangeModal.req.position || '—'}</div>
                  <div><strong>Department:</strong> {staffChangeModal.req.department || '—'}</div>
                  <div><strong>Branch:</strong> {staffChangeModal.req.branch || '—'}</div>
                  {staffChangeModal.req.hire_date && <div><strong>Hire Date:</strong> {new Date(staffChangeModal.req.hire_date).toLocaleDateString('en-ZA')}</div>}
                  {staffChangeModal.req.reason && <div style={{ marginTop: 6 }}><strong>HR Reason:</strong> {staffChangeModal.req.reason}</div>}
                  <div style={{ marginTop: 4, color: '#9ca3af' }}>Requested by <strong>{staffChangeModal.req.requested_by}</strong></div>
                </div>
                {staffChangeModal.action === 'approved' && staffChangeModal.req.request_type === 'add' && (
                  <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 10, padding: '8px 14px', marginBottom: 14, fontSize: 12, color: '#166534' }}>
                    ✅ Approving will immediately add <strong>{staffChangeModal.req.full_name}</strong> to the employee directory.
                  </div>
                )}
                {staffChangeModal.action === 'approved' && staffChangeModal.req.request_type === 'remove' && (
                  <div style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 10, padding: '8px 14px', marginBottom: 14, fontSize: 12, color: '#991b1b' }}>
                    ⚠️ Approving will deactivate <strong>{staffChangeModal.req.full_name}</strong> in the employee directory.
                  </div>
                )}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>GM Note (optional)</label>
                  <textarea value={staffChangeNote} onChange={e => setStaffChangeNote(e.target.value)} rows={2} placeholder="Add a note for HR…" style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: '0.87rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setStaffChangeModal(null); setStaffChangeNote(''); }} style={{ flex: 1, padding: '10px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600 }}>Cancel</button>
                  <button
                    disabled={processing}
                    onClick={async () => {
                      setProcessing(true);
                      try {
                        await api.hr.staffChangeRequests.review(staffChangeModal.req.id, staffChangeModal.action, staffChangeNote);
                        setMessage(staffChangeModal.action === 'approved'
                          ? `✅ ${staffChangeModal.req.request_type === 'add' ? `${staffChangeModal.req.full_name} has been added to the employee directory.` : `${staffChangeModal.req.full_name} has been deactivated.`}`
                          : `❌ Request for ${staffChangeModal.req.full_name} rejected.`);
                        setStaffChangeRequests(prev => prev.filter(r => r.id !== staffChangeModal.req.id));
                        setStaffChangeModal(null);
                        setStaffChangeNote('');
                      } catch (err) {
                        setMessage('Error: ' + err.message);
                      } finally {
                        setProcessing(false);
                      }
                    }}
                    style={{ flex: 2, padding: '10px', border: 'none', borderRadius: 10, fontWeight: 800, cursor: processing ? 'not-allowed' : 'pointer', opacity: processing ? 0.65 : 1,
                      background: staffChangeModal.action === 'approved' ? 'linear-gradient(135deg,#16a34a,#15803d)' : 'linear-gradient(135deg,#dc2626,#991b1b)', color: '#fff' }}>
                    {processing ? '⏳ Processing…' : staffChangeModal.action === 'approved' ? '✅ Confirm Approval' : '❌ Confirm Rejection'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {staffChangeRequests.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
              <div className="font-semibold text-gray-500 text-lg">No Pending HR Staff Change Requests</div>
              <div className="text-sm text-gray-400 mt-1">HR can submit add/remove requests from the Employees tab.</div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm font-semibold text-gray-600 px-1">{staffChangeRequests.length} request{staffChangeRequests.length !== 1 ? 's' : ''} pending your review.</div>
              {staffChangeRequests.map(r => (
                <div key={r.id} style={{ background: 'white', borderRadius: 14, border: `2px solid ${r.request_type === 'add' ? '#86efac' : '#fca5a5'}`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', padding: '18px 22px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ padding: '3px 12px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700,
                          background: r.request_type === 'add' ? '#f0fdf4' : '#fef2f2',
                          color: r.request_type === 'add' ? '#166534' : '#991b1b',
                          border: `1px solid ${r.request_type === 'add' ? '#86efac' : '#fca5a5'}` }}>
                          {r.request_type === 'add' ? '+ ADD EMPLOYEE' : '− REMOVE EMPLOYEE'}
                        </span>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: 17, color: '#111827', marginBottom: 4 }}>{r.full_name}</div>
                      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 2 }}>
                        {[r.position, r.department, r.branch].filter(Boolean).join(' · ')}
                      </div>
                      {r.hire_date && <div style={{ fontSize: 12, color: '#9ca3af' }}>Proposed start: {new Date(r.hire_date).toLocaleDateString('en-ZA')}</div>}
                      {r.reason && (
                        <div style={{ marginTop: 8, fontSize: 12, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 10px', color: '#374151' }}>
                          <span style={{ fontWeight: 700 }}>HR Reason:</span> {r.reason}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>
                        Requested by <strong>{r.requested_by}</strong> · {r.requested_at ? new Date(r.requested_at).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' }) : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button onClick={() => { setStaffChangeModal({ req: r, action: 'rejected' }); setStaffChangeNote(''); }}
                        style={{ padding: '8px 16px', border: '1.5px solid #d1d5db', borderRadius: 9, background: '#f9fafb', color: '#374151', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        ❌ Reject
                      </button>
                      <button onClick={() => { setStaffChangeModal({ req: r, action: 'approved' }); setStaffChangeNote(''); }}
                        style={{ padding: '8px 16px', border: 'none', borderRadius: 9, background: r.request_type === 'add' ? 'linear-gradient(135deg,#16a34a,#15803d)' : 'linear-gradient(135deg,#dc2626,#991b1b)', color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        {r.request_type === 'add' ? '✅ Approve Add' : '✅ Approve Removal'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Other approval sub-tabs */}
      {approvalTab !== 'transfers' && approvalTab !== 'writeoffs' && approvalTab !== 'fieldstock' && approvalTab !== 'rent_edits' && approvalTab !== 'salary_edits' && approvalTab !== 'cas_approvals' && approvalTab !== 'leave_approvals' && approvalTab !== 'bonus_delete' && approvalTab !== 'hr_staff_changes' && renderRequests()}

      {viewDispatch && <DispatchNote transfer={viewDispatch} onClose={() => setViewDispatch(null)} />}

      {/* Write-off reject confirmation modal */}
      {woRejectModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #fecaca', background: '#fff1f2', borderRadius: '12px 12px 0 0' }}>
              <h2 style={{ margin: 0, fontSize: 17, color: '#991b1b' }}>✕ Confirm Rejection</h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#b91c1c' }}>Rejecting: {woRejectModal.label}</p>
            </div>
            <div style={{ padding: 24 }}>
              <label style={{ fontSize: '0.83rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>Rejection reason (optional):</label>
              <textarea
                value={woRejectNote}
                onChange={e => setWoRejectNote(e.target.value)}
                placeholder="e.g. Insufficient justification, please resubmit with proper documentation..."
                rows={3}
                style={{ width: '100%', padding: 10, border: '1.5px solid #fca5a5', borderRadius: 8, fontSize: '0.85rem', resize: 'vertical', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                <button onClick={() => { setWoRejectModal(null); setWoRejectNote(''); }}
                  style={{ padding: '9px 18px', border: '1.5px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600, fontSize: '0.85rem' }}>
                  Cancel
                </button>
                <button onClick={() => handleWriteOffAction(woRejectModal.ids, 'reject', woRejectNote)} disabled={processing}
                  style={{ padding: '9px 20px', background: '#991b1b', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.85rem', cursor: processing ? 'not-allowed' : 'pointer', opacity: processing ? 0.65 : 1 }}>
                  {processing ? 'Processing...' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {amendModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 700, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '16px 24px', borderBottom: '2px solid #f59e0b', background: '#fffbeb' }}>
              <h2 style={{ margin: 0, fontSize: 18, color: '#92400e' }}>✏️ Amend Dispatch Note</h2>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: '#a16207' }}>
                {fmtLoc(amendModal.fromWarehouse || amendModal.from_location)} → {fmtLoc(amendModal.toBranch || amendModal.to_location)} · {amendModal.id}
              </p>
            </div>
            <div style={{ padding: 24 }}>
              <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
                Each row is an individual batch split. Adjust the approved quantity per batch, or click <strong>✕ Remove</strong> to exclude a specific batch entirely. Removed batches and reduced quantities return to the warehouse.
              </p>
              {amendItems.some(it => Number(it.quantityApproved) === 0) && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#dc2626' }}>
                  ⚠️ {amendItems.filter(it => Number(it.quantityApproved) === 0).length} batch row{amendItems.filter(it => Number(it.quantityApproved) === 0).length > 1 ? 's' : ''} will be removed on save.
                </div>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 12, color: '#6b7280' }}>Product</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 12, color: '#6b7280' }}>Batch</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 12, color: '#6b7280' }}>Expiry</th>
                    <th style={{ textAlign: 'center', padding: '8px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 12, color: '#6b7280' }}>Requested</th>
                    <th style={{ textAlign: 'center', padding: '8px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 12, color: '#059669' }}>In Warehouse</th>
                    <th style={{ textAlign: 'center', padding: '8px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 12, color: '#6b7280' }}>Approve Qty</th>
                    <th style={{ textAlign: 'center', padding: '8px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 12, color: '#6b7280' }}>Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {amendItems.map((it, i) => {
                    const isRemoved = Number(it.quantityApproved) === 0;
                    const isExpiringSoon = it.expiryDate && new Date(it.expiryDate) < new Date(Date.now() + 90 * 86400000);
                    const rowBg = isRemoved ? '#fef2f2' : i % 2 === 0 ? 'white' : '#f9fafb';
                    const available = it.availableQty;
                    const hasAvailability = available != null;
                    const maxApprovable = hasAvailability
                      ? Math.max(it.quantity, available)
                      : it.quantity;
                    const isShortfall = hasAvailability && available < it.quantity && !isRemoved;
                    return (
                      <tr key={i} style={{ background: rowBg, opacity: isRemoved ? 0.6 : 1 }}>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', fontSize: 13, fontWeight: 500, textDecoration: isRemoved ? 'line-through' : 'none', color: isRemoved ? '#9ca3af' : 'inherit' }}>{it.productName || it.productId}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', fontSize: 12, fontFamily: 'monospace', color: isRemoved ? '#9ca3af' : '#4b5563' }}>{it.batchNo || '—'}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', fontSize: 13, color: isRemoved ? '#9ca3af' : isExpiringSoon ? '#dc2626' : it.expiryDate ? '#374151' : '#9ca3af', fontWeight: isExpiringSoon && !isRemoved ? 600 : 'normal' }}>
                          {it.expiryDate ? fmtDate(it.expiryDate) : (it.batchNo ? 'N/A' : '—')}
                          {isExpiringSoon && !isRemoved && <span style={{ marginLeft: 4, fontSize: 10, background: '#fee2e2', color: '#dc2626', borderRadius: 3, padding: '1px 4px' }}>soon</span>}
                        </td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', fontSize: 13, textAlign: 'center', color: '#9ca3af' }}>{it.quantity}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
                          {hasAvailability ? (
                            <span style={{
                              fontSize: 13, fontWeight: 700,
                              color: isRemoved ? '#9ca3af' : available === 0 ? '#dc2626' : isShortfall ? '#d97706' : '#059669',
                            }}>
                              {available}
                              {isShortfall && <span style={{ marginLeft: 4, fontSize: 10, background: '#fef3c7', color: '#92400e', borderRadius: 3, padding: '1px 4px' }}>low</span>}
                              {available === 0 && !isRemoved && <span style={{ marginLeft: 4, fontSize: 10, background: '#fee2e2', color: '#dc2626', borderRadius: 3, padding: '1px 4px' }}>none</span>}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: '#d1d5db' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
                          {isRemoved ? (
                            <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>Removed</span>
                          ) : (
                            <input type="number" min="0" max={maxApprovable} value={it.quantityApproved}
                              onChange={e => {
                                const val = Math.max(0, Math.min(Number(e.target.value) || 0, maxApprovable));
                                setAmendItems(prev => prev.map((p, j) => j === i ? { ...p, quantityApproved: val } : p));
                                setAmendShortfallAcknowledged(false);
                              }}
                              style={{ width: 70, padding: '4px 8px', border: `1px solid ${isShortfall ? '#fcd34d' : '#d1d5db'}`, borderRadius: 6, textAlign: 'center', fontSize: 13, fontWeight: 600 }} />
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
                          {isRemoved ? (
                            <button onClick={() => { setAmendItems(prev => prev.map((p, j) => j === i ? { ...p, quantityApproved: p.quantity } : p)); setAmendShortfallAcknowledged(false); }}
                              style={{ fontSize: 11, padding: '3px 8px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}>
                              Restore
                            </button>
                          ) : (
                            <button onClick={() => { setAmendItems(prev => prev.map((p, j) => j === i ? { ...p, quantityApproved: 0 } : p)); setAmendShortfallAcknowledged(false); }}
                              style={{ fontSize: 11, padding: '3px 8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 5, cursor: 'pointer', fontWeight: 600 }}>
                              ✕ Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {(() => {
                const totalOriginal = amendItems.reduce((s, it) => s + Number(it.quantity), 0);
                const activeBatches = amendItems.filter(it => Number(it.quantityApproved) > 0);
                const removedCount = amendItems.length - activeBatches.length;
                const totalApproved = activeBatches.reduce((s, it) => s + Number(it.quantityApproved), 0);
                return (
                  <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400e', fontWeight: 600 }}>
                    Approving <strong>{totalApproved}</strong> of <strong>{totalOriginal}</strong> total units across <strong>{activeBatches.length}</strong> batch{activeBatches.length !== 1 ? 'es' : ''}{' '}
                    <span style={{ color: removedCount > 0 ? '#dc2626' : '#a16207', fontWeight: removedCount > 0 ? 700 : 600 }}>
                      ({removedCount} removed)
                    </span>
                  </div>
                );
              })()}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Amendment Comment / Reason</label>
                <textarea value={amendComment} onChange={e => setAmendComment(e.target.value)}
                  placeholder="Explain what was changed and why..."
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, minHeight: 80, resize: 'vertical' }} />
              </div>
              {amendShortfallWarning && (() => {
                const totalOriginal = amendItems.reduce((s, it) => s + Number(it.quantity), 0);
                const totalApproved = amendItems.filter(it => Number(it.quantityApproved) > 0).reduce((s, it) => s + Number(it.quantityApproved), 0);
                const pct = totalOriginal > 0 ? Math.round((totalApproved / totalOriginal) * 100) : 0;
                return (
                  <div style={{ background: '#fef2f2', border: '2px solid #f87171', borderRadius: 10, padding: '16px 18px', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <span style={{ fontSize: 22, flexShrink: 0 }}>⚠️</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#991b1b', marginBottom: 4 }}>Significant Shortfall — Are you sure?</div>
                        <div style={{ fontSize: 13, color: '#7f1d1d', marginBottom: 12 }}>
                          You are approving only <strong>{totalApproved}</strong> of <strong>{totalOriginal}</strong> units (<strong>{pct}%</strong> of the original request). This is below 50% of what was requested.
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => { setAmendShortfallWarning(false); setAmendComment(amendCommentBeforeWarning); }} disabled={processing}
                            style={{ padding: '7px 14px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: processing ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, color: '#374151', opacity: processing ? 0.5 : 1 }}>
                            ← Go Back
                          </button>
                          <button onClick={() => {
                              setAmendShortfallAcknowledged(true);
                              setAmendShortfallWarning(false);
                            }} disabled={processing}
                            style={{ padding: '7px 14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, cursor: processing ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, opacity: processing ? 0.65 : 1 }}>
                            {processing ? 'Processing...' : 'Proceed Anyway'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setAmendModal(null); setAmendItems([]); setAmendComment(''); setAmendShortfallWarning(false); setAmendShortfallAcknowledged(false); setAmendCommentBeforeWarning(''); setAmendAvailability({}); }} disabled={processing}
                  style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: processing ? 'not-allowed' : 'pointer', fontSize: 13, opacity: processing ? 0.5 : 1 }}>
                  Cancel
                </button>
                <button onClick={() => {
                    if (amendShortfallAcknowledged) {
                      handleAmendApprove();
                      return;
                    }
                    const totalOriginal = amendItems.reduce((s, it) => s + Number(it.quantity), 0);
                    const totalApproved = amendItems.filter(it => Number(it.quantityApproved) > 0).reduce((s, it) => s + Number(it.quantityApproved), 0);
                    if (totalOriginal > 0 && totalApproved < totalOriginal * 0.5) {
                      const pct = Math.round((totalApproved / totalOriginal) * 100);
                      const shortfallNote = `Shortfall acknowledged: approved ${totalApproved} of ${totalOriginal} units (${pct}%)`;
                      const baseComment = amendShortfallWarning ? amendCommentBeforeWarning : amendComment;
                      setAmendCommentBeforeWarning(baseComment);
                      setAmendComment(baseComment ? `${baseComment}\n${shortfallNote}` : shortfallNote);
                      setAmendShortfallWarning(true);
                    } else {
                      if (amendShortfallWarning) {
                        setAmendComment(amendCommentBeforeWarning);
                        setAmendShortfallWarning(false);
                        handleAmendApprove(amendCommentBeforeWarning);
                      } else {
                        handleAmendApprove();
                      }
                    }
                  }} disabled={processing}
                  style={{ padding: '8px 20px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: processing ? 0.6 : 1 }}>
                  {processing ? 'Processing...' : '✏️ Amend & Approve'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal open={!!noteModal} onClose={() => { setNoteModal(null); setNote(''); }}
        title={noteModal?.action === 'approved' ? 'Approve Transfer' : noteModal?.action === 'returned' ? 'Return for Correction' : 'Reject Transfer'}>
        <div className="p-6 space-y-4">
          {noteModal?.label && <p className="text-sm text-gray-600">Transfer: <strong>{noteModal.label}</strong></p>}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">
              {noteModal?.action === 'returned' ? 'Correction Notes (required)' : 'Notes (optional)'}
            </label>
            <textarea value={note} onChange={e => setNote(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 min-h-[80px] resize-y"
              placeholder={noteModal?.action === 'returned' ? 'Explain what needs to be corrected...' : 'Add notes for this decision...'} />
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => { setNoteModal(null); setNote(''); }} disabled={processing}>Cancel</Button>
            {noteModal?.action === 'returned' ? (
              <Button variant="warning" onClick={() => handleReturnForCorrection(noteModal.id)} disabled={processing || !note.trim()}>
                {processing ? 'Processing...' : '↩ Return for Correction'}
              </Button>
            ) : (
              <Button variant={noteModal?.action === 'approved' ? 'success' : 'danger'}
                onClick={() => handleAction(noteModal.type, noteModal.id, noteModal.action)}
                disabled={processing}>
                {processing ? 'Processing...' : (noteModal?.action === 'approved' ? 'Approve' : 'Reject')}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

const CAMPAIGN_TYPES = [
  { value: 'discount', label: '🏷️ Discount Campaign', desc: 'Percentage off on selected products for a set period' },
  { value: 'buy_x_get_y', label: '🎁 Buy X Get Y', desc: 'Purchase N products and get M products free' },
  { value: 'bv_achievement', label: '🏆 BV Achievement', desc: 'Earn prizes by accumulating Business Volume (BV) points' },
  { value: 'elite_bingo', label: '🎯 Elite Bingo', desc: 'Recruit new distributors AND maintain BV target to earn cash' },
  { value: 'custom', label: '⚙️ Custom', desc: 'Define your own rules and prizes' },
];

const TYPE_COLORS = {
  discount: { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8', badge: 'info' },
  buy_x_get_y: { bg: '#f0fdf4', border: '#86efac', text: '#166534', badge: 'success' },
  bv_achievement: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', badge: 'warning' },
  elite_bingo: { bg: '#fdf4ff', border: '#d8b4fe', text: '#6b21a8', badge: 'default' },
  custom: { bg: '#f8fafc', border: '#cbd5e1', text: '#475569', badge: 'default' },
};

function campaignStatus(c) {
  if (c.status === 'completed') return 'completed';
  const now = new Date();
  const end = new Date(c.end_date);
  const start = new Date(c.start_date);
  if (now > end) return 'ended';
  if (now < start) return 'upcoming';
  return 'active';
}

/* ── Multi-select: Products (searchable) ───────────────────────────────────── */
function MultiProductSelect({ label, value = [], onChange, products = [], single = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = products.filter(p => {
    const name = typeof p === 'string' ? p : (p.description || p.name || '');
    return name.toLowerCase().includes(search.toLowerCase());
  }).slice(0, 60);

  const getName = p => typeof p === 'string' ? p : (p.description || p.name || '');

  const toggle = (name) => {
    if (single) { onChange([name]); setOpen(false); setSearch(''); return; }
    const next = value.includes(name) ? value.filter(v => v !== name) : [...value, name];
    onChange(next);
  };

  const remove = (name) => onChange(value.filter(v => v !== name));

  return (
    <div ref={ref} className="relative">
      {label && <div className="text-sm font-medium text-gray-700 mb-1">{label}</div>}
      <div className="min-h-[40px] border border-gray-300 rounded-lg px-2 py-1.5 bg-white cursor-pointer flex flex-wrap gap-1 items-center"
        onClick={() => setOpen(o => !o)}>
        {value.length === 0
          ? <span className="text-gray-400 text-sm px-1">{single ? 'Select a product...' : 'Select products (leave blank = all)...'}</span>
          : value.map(v => (
            <span key={v} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded-full">
              {v}
              <button type="button" onClick={e => { e.stopPropagation(); remove(v); }} className="text-blue-500 hover:text-blue-700 font-bold leading-none">×</button>
            </span>
          ))
        }
        <span className="ml-auto text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-300"
              placeholder="Search products..." />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0
              ? <div className="text-xs text-gray-400 text-center py-3">No products found</div>
              : filtered.map(p => {
                const name = getName(p);
                const checked = value.includes(name);
                return (
                  <div key={name} onClick={() => toggle(name)}
                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm hover:bg-blue-50 ${checked ? 'bg-blue-50' : ''}`}>
                    {!single && <input type="checkbox" readOnly checked={checked} className="accent-blue-600 pointer-events-none" />}
                    <span className={checked ? 'font-semibold text-blue-800' : ''}>{name}</span>
                  </div>
                );
              })
            }
          </div>
          {!single && value.length > 0 && (
            <div className="px-3 py-2 border-t border-gray-100 flex justify-between items-center">
              <span className="text-xs text-gray-500">{value.length} selected</span>
              <button type="button" onClick={() => onChange([])} className="text-xs text-red-500 hover:underline">Clear all</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Multi-select: Branches (checkboxes) ───────────────────────────────────── */
function MultiBranchSelect({ label, value = [], onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (name) => {
    const next = value.includes(name) ? value.filter(v => v !== name) : [...value, name];
    onChange(next);
  };
  const remove = (name) => onChange(value.filter(v => v !== name));
  const allSelected = BRANCH_DETAILS.length === value.length;

  return (
    <div ref={ref} className="relative">
      {label && <div className="text-sm font-medium text-gray-700 mb-1">{label}</div>}
      <div className="min-h-[40px] border border-gray-300 rounded-lg px-2 py-1.5 bg-white cursor-pointer flex flex-wrap gap-1 items-center"
        onClick={() => setOpen(o => !o)}>
        {value.length === 0
          ? <span className="text-gray-400 text-sm px-1">Select branches...</span>
          : value.map(v => (
            <span key={v} className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-xs font-medium px-2 py-0.5 rounded-full">
              {v}
              <button type="button" onClick={e => { e.stopPropagation(); remove(v); }} className="text-green-600 hover:text-green-800 font-bold leading-none">×</button>
            </span>
          ))
        }
        <span className="ml-auto text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex justify-between items-center">
            <span className="text-xs font-semibold text-gray-600">Select branches</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => onChange(BRANCH_DETAILS.map(b => b.name))} className="text-xs text-blue-600 hover:underline">All</button>
              <button type="button" onClick={() => onChange([])} className="text-xs text-red-500 hover:underline">None</button>
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {BRANCH_DETAILS.map(b => {
              const checked = value.includes(b.name);
              return (
                <div key={b.id} onClick={() => toggle(b.name)}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm hover:bg-green-50 ${checked ? 'bg-green-50' : ''}`}>
                  <input type="checkbox" readOnly checked={checked} className="accent-green-600 pointer-events-none" />
                  <span className={checked ? 'font-semibold text-green-800' : ''}>{b.name}</span>
                  <span className="text-xs text-gray-400 ml-auto">{b.region}</span>
                </div>
              );
            })}
          </div>
          {value.length > 0 && (
            <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-500">{value.length} of {BRANCH_DETAILS.length} selected</div>
          )}
        </div>
      )}
    </div>
  );
}

function CampaignTypeConditionsForm({ type, conditions, onChange, products = [] }) {
  const set = (key, val) => onChange({ ...conditions, [key]: val });
  const getArr = (key) => Array.isArray(conditions[key]) ? conditions[key] : (conditions[key] ? String(conditions[key]).split(',').map(s => s.trim()).filter(Boolean) : []);

  if (type === 'discount') return (
    <div className="space-y-3">
      <Input label="Discount %" type="number" min="1" max="100" value={conditions.discount_pct || ''} onChange={e => set('discount_pct', e.target.value)} placeholder="e.g. 15" />
      <MultiProductSelect label="Applicable Products (leave blank = all products)" value={getArr('products')} onChange={v => set('products', v)} products={products} />
      <Input label="Minimum Purchase Amount (N$)" type="number" value={conditions.min_purchase || ''} onChange={e => set('min_purchase', e.target.value)} placeholder="0 = no minimum" />
    </div>
  );
  if (type === 'buy_x_get_y') return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Input label="Buy quantity (X)" type="number" min="1" value={conditions.buy_qty || ''} onChange={e => set('buy_qty', e.target.value)} placeholder="e.g. 1 or 2" />
        <Input label="Get quantity free (Y)" type="number" min="1" value={conditions.get_qty || ''} onChange={e => set('get_qty', e.target.value)} placeholder="e.g. 1" />
      </div>
      <MultiProductSelect label="Qualifying Products" value={getArr('products')} onChange={v => set('products', v)} products={products} />
      <Input label="Distributor Code Conditions (e.g. code ending in O)" value={conditions.code_condition || ''} onChange={e => set('code_condition', e.target.value)} placeholder="Optional: e.g. ends_with_O" />
      <Input label="Specific Distributor Codes (comma-separated)" value={conditions.distributor_codes || ''} onChange={e => set('distributor_codes', e.target.value)} placeholder="e.g. NB78370, DZ001234" />
    </div>
  );
  if (type === 'bv_achievement') return (
    <div className="space-y-3">
      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">BV must be accumulated within 1 month (start to end). No carryover to next month.</div>
      <Input label="Maximum Winners (0 = unlimited)" type="number" min="0" value={conditions.max_winners || ''} onChange={e => set('max_winners', e.target.value)} placeholder="0" />
      <Input label="Accumulation Period" value={conditions.accumulation_period || 'monthly'} onChange={e => set('accumulation_period', e.target.value)} placeholder="monthly" />
    </div>
  );
  if (type === 'elite_bingo') return (
    <div className="space-y-3">
      <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-800">Participants must recruit new distributors AND maintain PSBV target within 1 month.</div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Min BV Required (PSBV)" type="number" value={conditions.min_bv || '3000'} onChange={e => set('min_bv', e.target.value)} placeholder="3000" />
        <Input label="Min New Recruits" type="number" value={conditions.min_recruits || '2'} onChange={e => set('min_recruits', e.target.value)} placeholder="2" />
      </div>
      <div className="p-2 bg-gray-50 rounded text-xs text-gray-600">Participants may enrol in another active promotion simultaneously.</div>
    </div>
  );
  return (
    <div className="space-y-3">
      <Input label="Minimum BV" type="number" value={conditions.min_bv || ''} onChange={e => set('min_bv', e.target.value)} placeholder="Optional" />
      <Input label="Max Winners" type="number" value={conditions.max_winners || ''} onChange={e => set('max_winners', e.target.value)} placeholder="0 = unlimited" />
      <Input label="Other Rules" value={conditions.rules || ''} onChange={e => set('rules', e.target.value)} placeholder="Describe additional conditions..." />
    </div>
  );
}

function CampaignPrizeForm({ type, prize, onChange, products = [] }) {
  const set = (key, val) => onChange({ ...prize, [key]: val });
  if (type === 'discount') return (
    <Input label="Discount Description" value={prize.description || ''} onChange={e => set('description', e.target.value)} placeholder="e.g. Up to 15% off on selected items" />
  );
  if (type === 'buy_x_get_y') return (
    <div className="space-y-3">
      <MultiProductSelect label="Free Product" value={prize.free_product ? [prize.free_product] : []} onChange={v => set('free_product', v[0] || '')} products={products} single />
      <Input label="Prize Description" value={prize.description || ''} onChange={e => set('description', e.target.value)} placeholder="e.g. Buy 2 get 1 free" />
    </div>
  );
  if (type === 'bv_achievement') return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-gray-700 mb-1">Prize Tiers (ranked by BV required)</div>
      {(prize.tiers || [{ bv_required: '', label: '', prize: '' }]).map((tier, i) => (
        <div key={i} className="p-3 border border-gray-200 rounded-lg space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-gray-500">TIER {i + 1}</span>
            {i > 0 && <button type="button" onClick={() => { const t = [...(prize.tiers || [])]; t.splice(i, 1); set('tiers', t); }} className="text-xs text-red-500 hover:underline">Remove</button>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input label="Min BV" type="number" value={tier.bv_required || ''} onChange={e => { const t = [...(prize.tiers || [])]; t[i] = { ...t[i], bv_required: e.target.value }; set('tiers', t); }} placeholder="e.g. 3000" />
            <Input label="Tier Label" value={tier.label || ''} onChange={e => { const t = [...(prize.tiers || [])]; t[i] = { ...t[i], label: e.target.value }; set('tiers', t); }} placeholder="e.g. Gold" />
            <Input label="Prize" value={tier.prize || ''} onChange={e => { const t = [...(prize.tiers || [])]; t[i] = { ...t[i], prize: e.target.value }; set('tiers', t); }} placeholder="e.g. Extra Large Hamper" />
          </div>
        </div>
      ))}
      <button type="button" onClick={() => set('tiers', [...(prize.tiers || []), { bv_required: '', label: '', prize: '' }])}
        className="text-sm text-blue-600 hover:underline">+ Add Tier</button>
    </div>
  );
  if (type === 'elite_bingo') return (
    <div className="space-y-3">
      <Input label="Cash Reward (N$)" type="number" value={prize.cash_reward || ''} onChange={e => set('cash_reward', e.target.value)} placeholder="e.g. 1400" />
      <Input label="Prize Description" value={prize.description || ''} onChange={e => set('description', e.target.value)} placeholder="e.g. N$1400 cash earnings" />
    </div>
  );
  return (
    <div className="space-y-3">
      <Input label="Prize Description" value={prize.description || ''} onChange={e => set('description', e.target.value)} placeholder="e.g. Trophy, cash, voucher..." />
      <Input label="Prize Value (N$)" type="number" value={prize.value || ''} onChange={e => set('value', e.target.value)} placeholder="Optional monetary value" />
    </div>
  );
}

// ── Campaign Analytics View ───────────────────────────────────────────────────
function CampaignAnalyticsView({ data, loading, onRefresh }) {
  const fmt  = (n) => Number(n || 0).toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtN = (n) => Number(n || 0).toLocaleString();
  const [expandedCamp, setExpandedCamp] = useState(null);

  const TYPE_LABELS = { bv_achievement: '🏆 BV Achievement', elite_bingo: '🎯 Elite Bingo', buy_x_get_y: '🛒 Buy X Get Y', discount: '🏷️ Discount', custom: '\u2699\uFE0F Custom' };
  const TYPE_BG   = { bv_achievement: '#fef3c7', elite_bingo: '#ede9fe', buy_x_get_y: '#d1fae5', discount: '#fee2e2', custom: '#f0f9ff' };
  const TYPE_TEXT = { bv_achievement: '#92400e', elite_bingo: '#5b21b6', buy_x_get_y: '#065f46', discount: '#991b1b', custom: '#0c4a6e' };

  const statusBadge = (s) => {
    const cfg = { active: { bg: '#d1fae5', color: '#065f46' }, completed: { bg: '#ede9fe', color: '#5b21b6' }, upcoming: { bg: '#fef9c3', color: '#92400e' }, pending: { bg: '#fef3c7', color: '#92400e' }, verified: { bg: '#d1fae5', color: '#065f46' }, rejected: { bg: '#fee2e2', color: '#991b1b' } };
    const c = cfg[s] || { bg: '#f1f5f9', color: '#475569' };
    return <span style={{ background: c.bg, color: c.color, borderRadius: 99, padding: '2px 9px', fontSize: '0.72rem', fontWeight: 700 }}>{s}</span>;
  };

  const thStyle = { padding: '7px 10px', textAlign: 'left', fontWeight: 700, color: '#475569', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap', fontSize: '0.75rem' };

  const printReport = () => {
    if (!data) return;
    const ov = data.overview || {};
    const ws = data.winnerStats || {};
    const cd = data.campaignDetails || [];
    const dl = data.distributorLeaderboard || [];
    const br = data.branchBvRanking || [];
    const now = new Date().toLocaleDateString('en-NA', { day: '2-digit', month: 'long', year: 'numeric' });
    const fN = (n) => Number(n || 0).toLocaleString();
    const fC = (n) => Number(n || 0).toLocaleString('en-NA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Campaign Analytics</title>'
      + '<style>body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#1e293b;font-size:12px}'
      + 'h1{color:#1e3a5f;font-size:20px;margin:0 0 4px}.sub{color:#64748b;font-size:11px;margin-bottom:20px}'
      + '.kpi-row{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap}'
      + '.kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 16px;text-align:center;min-width:100px}'
      + '.kpi .val{font-size:20px;font-weight:900;color:#1e3a5f}.kpi .lbl{font-size:10px;color:#64748b;margin-top:2px}'
      + 'h2{font-size:13px;color:#1e3a5f;border-bottom:2px solid #e2e8f0;padding-bottom:4px;margin:18px 0 8px}'
      + 'h3{font-size:12px;color:#374151;margin:12px 0 4px;padding:6px 10px;background:#f8fafc;border-radius:4px}'
      + 'table{width:100%;border-collapse:collapse;margin-bottom:12px}'
      + 'th{background:#1e3a5f;color:#fff;padding:5px 8px;text-align:left;font-size:10px}'
      + 'td{padding:4px 8px;border-bottom:1px solid #f1f5f9;font-size:10px}'
      + 'tr:nth-child(even) td{background:#f8fafc}'
      + '.footer{margin-top:24px;border-top:1px solid #e2e8f0;padding-top:10px;color:#94a3b8;font-size:10px;text-align:center}'
      + '@media print{body{padding:10px}}</style></head><body>'
      + '<h1>Campaign Analytics Report</h1><div class="sub">Dynapharm Namibia | Generated: ' + now + '</div>'
      + '<div class="kpi-row">'
      + '<div class="kpi"><div class="val">' + fN(ov.total) + '</div><div class="lbl">Total Campaigns</div></div>'
      + '<div class="kpi"><div class="val">' + fN(ov.active) + '</div><div class="lbl">Active</div></div>'
      + '<div class="kpi"><div class="val">' + fN(ov.completed) + '</div><div class="lbl">Completed</div></div>'
      + '<div class="kpi"><div class="val">' + fN(ws.total) + '</div><div class="lbl">Total Winners</div></div>'
      + '<div class="kpi"><div class="val">' + fN(ws.unique_winners) + '</div><div class="lbl">Unique Winners</div></div>'
      + '</div>'
      + '<h2>Campaign Detail</h2>'
      + cd.map(c => {
          const parts = Array.isArray(c.participants) ? c.participants : [];
          const wins  = Array.isArray(c.winners)      ? c.winners      : [];
          const discPct = Number(c.discount_percentage || 0);
          const discBadge = (c.campaign_type === 'discount' && discPct > 0)
            ? ' <span style="background:#fee2e2;color:#991b1b;border-radius:4px;padding:1px 7px;font-size:9px;font-weight:700">' + discPct + '% OFF</span>'
            : '';
          return '<h3>' + c.name + discBadge + ' <span style="color:#94a3b8;font-weight:400;font-size:10px">(' + c.status + ')</span></h3>'
            + '<table><thead><tr><th>#</th><th>Distributor</th><th>NB Code</th><th>Branch</th><th>BV</th><th>Recruits</th></tr></thead><tbody>'
            + (parts.length ? parts.map((p,i) => '<tr><td>' + (i+1) + '</td><td>' + (p.name||p.code) + '</td><td>' + p.code + '</td><td>' + (p.branch||'-') + '</td><td>' + fN(p.bv) + '</td><td>' + (p.recruits||0) + '</td></tr>').join('') : '<tr><td colspan="6" style="color:#94a3b8">No participants</td></tr>')
            + '</tbody></table>'
            + (wins.length ? '<table><thead><tr><th>Rank</th><th>Winner</th><th>NB Code</th><th>Branch</th><th>Prize</th><th>Status</th></tr></thead><tbody>'
              + wins.map(w => '<tr><td>#' + w.prize_rank + '</td><td>' + (w.name||w.code) + '</td><td>' + w.code + '</td><td>' + (w.branch||'-') + '</td><td>' + w.prize_tier + '</td><td>' + w.status + '</td></tr>').join('')
              + '</tbody></table>' : '');
        }).join('')
      + '<h2>Distributor Leaderboard</h2>'
      + '<table><thead><tr><th>#</th><th>Distributor</th><th>NB Code</th><th>Branches</th><th>Campaigns</th><th>Total BV</th><th>Recruits</th></tr></thead><tbody>'
      + (dl.length ? dl.map((d,i) => '<tr><td>' + (i+1) + '</td><td>' + (d.distributor_name||d.distributor_code) + '</td><td>' + d.distributor_code + '</td><td>' + (d.branches||'-') + '</td><td>' + d.campaigns + '</td><td>' + fN(d.total_bv) + '</td><td>' + (d.total_recruits||0) + '</td></tr>').join('') : '<tr><td colspan="7" style="color:#94a3b8">No data</td></tr>')
      + '</tbody></table>'
      + '<h2>Branch BV Ranking</h2>'
      + '<table><thead><tr><th>#</th><th>Branch</th><th>Participants</th><th>Campaigns</th><th>Total BV</th></tr></thead><tbody>'
      + (br.length ? br.map((b,i) => '<tr><td>' + (i+1) + '</td><td>' + b.branch + '</td><td>' + b.participants + '</td><td>' + b.campaigns + '</td><td>' + fN(b.total_bv) + '</td></tr>').join('') : '<tr><td colspan="5" style="color:#94a3b8">No data</td></tr>')
      + '</tbody></table>'
      + (() => {
          const cp2 = data.campaignProducts || [];
          if (!cp2.length) return '';
          return '<h2>Products Sold via Campaign Sales</h2>'
            + '<table><thead><tr><th>#</th><th>Product</th><th>Units Sold</th><th>DP Value (N$)</th><th>Discount %</th></tr></thead><tbody>'
            + cp2.map((p, i) => '<tr><td>' + (i+1) + '</td><td>' + (p.product_name || '—') + '</td><td style="text-align:right;font-weight:700;color:#1d4ed8">' + fN(p.total_qty) + '</td><td style="text-align:right;font-weight:700;color:#15803d">' + fC(p.dp_value) + '</td><td style="text-align:center;font-weight:700;color:' + (Number(p.discount_percentage) > 0 ? '#dc2626' : '#94a3b8') + '">' + (Number(p.discount_percentage) > 0 ? Number(p.discount_percentage) + '%' : '—') + '</td></tr>').join('')
            + '</tbody></table>';
        })()
      + '<div class="footer">Dynapharm Namibia Health Management System | Campaigns Analytics | ' + now + '</div></body></html>';
    const win = window.open('', '_blank'); win.document.write(html); win.document.close(); setTimeout(() => win.print(), 400);
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
      <div style={{ textAlign: 'center' }}><div style={{ fontSize: 32, marginBottom: 8 }}>📊</div><div style={{ color: '#64748b', fontWeight: 600 }}>Loading analytics…</div></div>
    </div>
  );

  if (!data) return (
    <div style={{ textAlign: 'center', padding: 60 }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
      <div style={{ color: '#64748b', marginBottom: 16 }}>Click the button below to load campaign analytics</div>
      <button onClick={onRefresh} style={{ background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 700, cursor: 'pointer' }}>Load Analytics</button>
    </div>
  );

  const ov = data.overview            || {};
  const ws = data.winnerStats         || {};
  const cs = data.campaignSales       || {};
  const cd = data.campaignDetails     || [];
  const dl = data.distributorLeaderboard || [];
  const br = data.branchBvRanking     || [];
  const rw = data.recentWinners       || [];
  const tb = data.typeBreakdown       || [];
  const cp = data.campaignProducts    || [];

  const kpis = [
    { label: 'Total Campaigns',  val: fmtN(ov.total),          bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
    { label: 'Active Now',       val: fmtN(ov.active),         bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' },
    { label: 'Completed',        val: fmtN(ov.completed),      bg: '#f5f3ff', border: '#ddd6fe', text: '#6d28d9' },
    { label: 'Total Winners',    val: fmtN(ws.total),          bg: '#fefce8', border: '#fde68a', text: '#b45309' },
    { label: 'Unique Winners',   val: fmtN(ws.unique_winners), bg: '#fff7ed', border: '#fed7aa', text: '#c2410c' },
    { label: 'Awaiting Verify',  val: fmtN(ws.pending),        bg: '#fef2f2', border: '#fecaca', text: '#dc2626' },
  ];

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onRefresh} style={{ background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 8, padding: '7px 16px', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer' }}>🔄 Refresh</button>
        <button onClick={printReport} style={{ background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>🖨️ Print PDF Report</button>
      </div>

      {/* KPI Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: k.bg, border: `1px solid ${k.border}`, borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: k.text }}>{k.val}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Type Breakdown */}
      {tb.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#374151', marginBottom: 10 }}>📊 Campaign Type Distribution</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {tb.map(t => (
              <div key={t.campaign_type} style={{ background: TYPE_BG[t.campaign_type] || '#f8fafc', border: `1px solid ${TYPE_TEXT[t.campaign_type] || '#94a3b8'}30`, borderRadius: 10, padding: '10px 16px', textAlign: 'center', minWidth: 110 }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 900, color: TYPE_TEXT[t.campaign_type] || '#374151' }}>{fmtN(t.cnt)}</div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>{TYPE_LABELS[t.campaign_type] || t.campaign_type}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-Campaign Detail */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#374151', marginBottom: 12 }}>📢 Campaigns — Participant & Winner Breakdown</div>
        {cd.length === 0 ? (
          <div style={{ color: '#94a3b8', textAlign: 'center', padding: '20px 0' }}>No campaigns yet</div>
        ) : cd.map(c => {
          const parts = Array.isArray(c.participants) ? c.participants : [];
          const wins  = Array.isArray(c.winners)      ? c.winners      : [];
          const isOpen = expandedCamp === c.id;
          const totalBv = Number(c.total_bv || 0);
          return (
            <div key={c.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
              <div onClick={() => setExpandedCamp(isOpen ? null : c.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: isOpen ? '#f0f7ff' : '#f8fafc', cursor: 'pointer', userSelect: 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#1e293b' }}>{c.name}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
                    <span style={{ background: TYPE_BG[c.campaign_type] || '#f8fafc', color: TYPE_TEXT[c.campaign_type] || '#374151', borderRadius: 99, padding: '1px 8px', fontSize: '0.7rem', fontWeight: 700 }}>{TYPE_LABELS[c.campaign_type] || c.campaign_type}</span>
                    {c.campaign_type === 'discount' && Number(c.discount_percentage || 0) > 0 && (
                      <span style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 99, padding: '1px 8px', fontSize: '0.7rem', fontWeight: 700 }}>{Number(c.discount_percentage)}% OFF</span>
                    )}
                    {statusBadge(c.status)}
                    {c.start_date && <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{new Date(c.start_date).toLocaleDateString('en-NA')} – {c.end_date ? new Date(c.end_date).toLocaleDateString('en-NA') : 'ongoing'}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 900, color: '#1d4ed8', fontSize: '1.1rem' }}>{fmtN(c.participant_count)}</div>
                    <div style={{ fontSize: '0.67rem', color: '#64748b' }}>Participants</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 900, color: '#059669', fontSize: '1.1rem' }}>{fmtN(totalBv)}</div>
                    <div style={{ fontSize: '0.67rem', color: '#64748b' }}>Total BV</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 900, color: '#d97706', fontSize: '1.1rem' }}>{fmtN(c.winner_count)}</div>
                    <div style={{ fontSize: '0.67rem', color: '#64748b' }}>Winners</div>
                  </div>
                </div>
                <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginLeft: 4 }}>{isOpen ? '\u25B2' : '\u25BC'}</div>
              </div>

              {isOpen && (
                <div style={{ padding: '12px 14px', borderTop: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#374151', marginBottom: 6 }}>👥 Participants ({parts.length})</div>
                  {parts.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: 12 }}>No participants enrolled</div>
                  ) : (
                    <div style={{ overflowX: 'auto', marginBottom: 14 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                        <thead>
                          <tr style={{ background: '#f0f7ff' }}>
                            {['#', 'Distributor', 'NB Code', 'Branch', 'BV Accumulated', 'Recruits', 'Status'].map(h => (
                              <th key={h} style={thStyle}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {parts.map((p, i) => (
                            <tr key={p.id || i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                              <td style={{ padding: '6px 10px', color: '#94a3b8', fontWeight: 700 }}>{i + 1}</td>
                              <td style={{ padding: '6px 10px', fontWeight: 700, color: '#1e293b' }}>{p.name || p.code}</td>
                              <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#6d28d9' }}>{p.code}</td>
                              <td style={{ padding: '6px 10px', color: '#374151' }}>{p.branch || '—'}</td>
                              <td style={{ padding: '6px 10px', fontWeight: 900, color: '#059669' }}>{Number(p.bv || 0).toLocaleString()}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'center', color: '#374151' }}>{p.recruits || 0}</td>
                              <td style={{ padding: '6px 10px' }}>{statusBadge(p.status)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {wins.length > 0 && (
                    <>
                      <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#374151', marginBottom: 6 }}>🏅 Winners ({wins.length})</div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                          <thead>
                            <tr style={{ background: '#fffbeb' }}>
                              {['Rank', 'Winner', 'NB Code', 'Branch', 'Prize Tier', 'Prize Detail', 'Status', 'Date'].map(h => (
                                <th key={h} style={thStyle}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {wins.map((w, i) => (
                              <tr key={w.id || i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fffef5' }}>
                                <td style={{ padding: '6px 10px', fontWeight: 900, color: '#d97706', textAlign: 'center' }}>#{w.prize_rank}</td>
                                <td style={{ padding: '6px 10px', fontWeight: 700, color: '#1e293b' }}>{w.name || w.code}</td>
                                <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#6d28d9' }}>{w.code}</td>
                                <td style={{ padding: '6px 10px', color: '#374151' }}>{w.branch || '—'}</td>
                                <td style={{ padding: '6px 10px', fontWeight: 700, color: '#b45309' }}>{w.prize_tier}</td>
                                <td style={{ padding: '6px 10px', color: '#6b7280', fontSize: '0.73rem' }}>{w.prize_description || '—'}</td>
                                <td style={{ padding: '6px 10px' }}>{statusBadge(w.status)}</td>
                                <td style={{ padding: '6px 10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{w.won_at ? new Date(w.won_at).toLocaleDateString('en-NA') : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Distributor Leaderboard */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#374151', marginBottom: 10 }}>🏆 Distributor Leaderboard — Total BV (All Campaigns)</div>
        {dl.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: '0.82rem' }}>No participant data yet</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['#', 'Distributor', 'NB Code', 'Branch(es)', 'Campaigns', 'Total BV', 'Recruits'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dl.map((d, i) => (
                  <tr key={d.distributor_code} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 800, color: i === 0 ? '#d97706' : '#94a3b8' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</td>
                    <td style={{ padding: '6px 10px', fontWeight: 700, color: '#1e293b' }}>{d.distributor_name || d.distributor_code}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#6d28d9' }}>{d.distributor_code}</td>
                    <td style={{ padding: '6px 10px', color: '#374151', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.branches || '—'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', color: '#374151' }}>{d.campaigns}</td>
                    <td style={{ padding: '6px 10px', fontWeight: 900, color: '#059669' }}>{Number(d.total_bv || 0).toLocaleString()}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', color: '#374151' }}>{d.total_recruits || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Branch BV Ranking */}
      {br.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#374151', marginBottom: 10 }}>🏢 Branch BV Ranking</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {br.map((b, i) => (
              <div key={b.branch} style={{ background: i === 0 ? '#f0fdf4' : '#f8fafc', border: `1px solid ${i === 0 ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: 10, padding: '10px 16px', textAlign: 'center', minWidth: 120 }}>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>#{i + 1}</div>
                <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#1e293b' }}>{b.branch}</div>
                <div style={{ fontSize: '1rem', fontWeight: 900, color: i === 0 ? '#059669' : '#374151', marginTop: 2 }}>{Number(b.total_bv || 0).toLocaleString()}</div>
                <div style={{ fontSize: '0.67rem', color: '#64748b' }}>BV · {fmtN(b.participants)} participants</div>
                <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{fmtN(b.campaigns)} campaign{Number(b.campaigns) !== 1 ? 's' : ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Product Sales via Campaigns */}
      {cp.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
          <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#374151', marginBottom: 10 }}>🛒 Products Sold via Campaign Sales</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['#', 'Product', 'Units Sold', 'DP Value (N$)', 'Discount %'].map(h => <th key={h} style={thStyle}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {cp.map((p, i) => (
                  <tr key={p.product_name + '_' + (p.discount_percentage || 0)} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '6px 10px', color: '#94a3b8', fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ padding: '6px 10px', fontWeight: 600, color: '#1e293b' }}>{p.product_name}</td>
                    <td style={{ padding: '6px 10px', fontWeight: 900, color: '#1d4ed8' }}>{fmtN(p.total_qty)}</td>
                    <td style={{ padding: '6px 10px', fontWeight: 700, color: '#15803d' }}>{fmt(p.dp_value)}</td>
                    <td style={{ padding: '6px 10px', fontWeight: 700, color: Number(p.discount_percentage) > 0 ? '#dc2626' : '#94a3b8', textAlign: 'center' }}>
                      {Number(p.discount_percentage) > 0 ? `${Number(p.discount_percentage)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All Winners */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
        <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#374151', marginBottom: 10 }}>
          🏅 All Winners
          <span style={{ marginLeft: 8, background: '#f1f5f9', color: '#475569', borderRadius: 99, padding: '2px 9px', fontSize: '0.72rem', fontWeight: 700 }}>{rw.length}</span>
        </div>
        {rw.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: '0.82rem', textAlign: 'center', padding: '20px 0' }}>No winners generated yet</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Campaign', 'Winner', 'NB Code', 'Branch', 'Prize', 'Rank', 'Status', 'Date'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rw.map((w, i) => (
                  <tr key={w.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '6px 10px', fontWeight: 600, color: '#1e293b', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><span title={w.campaign_name}>{w.campaign_name}</span></td>
                    <td style={{ padding: '6px 10px', color: '#374151' }}>{w.distributor_name || w.distributor_code}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#6d28d9', fontSize: '0.73rem' }}>{w.distributor_code}</td>
                    <td style={{ padding: '6px 10px', color: '#64748b' }}>{w.branch || '—'}</td>
                    <td style={{ padding: '6px 10px', color: '#374151' }}>{w.prize_tier}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700 }}>#{w.prize_rank}</td>
                    <td style={{ padding: '6px 10px' }}>{statusBadge(w.status)}</td>
                    <td style={{ padding: '6px 10px', color: '#64748b', whiteSpace: 'nowrap' }}>{w.won_at ? new Date(w.won_at).toLocaleDateString('en-NA') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CampaignsTab() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [alert, setAlert] = useState(null);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [activeSection, setActiveSection] = useState('all');
  const [campaignDetail, setCampaignDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [viewMode, setViewMode] = useState('manage');
  const [analyticsData, setAnalyticsData] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [generatingWinners, setGeneratingWinners] = useState(false);
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [participantForm, setParticipantForm] = useState({ distributor_code: '', distributor_name: '', branch: '' });
  const [editingParticipant, setEditingParticipant] = useState(null);
  const [editBv, setEditBv] = useState('');
  const [editRecruits, setEditRecruits] = useState('');

  const defaultForm = {
    name: '', description: '', campaign_type: 'bv_achievement',
    start_date: '', end_date: '', scope: 'countrywide',
    target_branches: [],
    conditions: {}, prize: {},
  };
  const [form, setForm] = useState(defaultForm);

  const loadCampaigns = () => {
    setLoading(true);
    api.get('/campaigns').then(d => {
      setCampaigns(Array.isArray(d) ? d : d.campaigns || []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  const loadAnalytics = () => {
    setAnalyticsLoading(true);
    api.get('/campaigns/analytics')
      .then(d => setAnalyticsData(d))
      .catch(() => {})
      .finally(() => setAnalyticsLoading(false));
  };

  useEffect(() => {
    loadCampaigns();
    // Load product list for dropdowns
    api.get('/prices').then(d => {
      const list = Array.isArray(d) ? d : (d.prices || d.products || []);
      setProducts(list.filter(p => !p.is_package));
    }).catch(() => {
      const live = getLiveProductList();
      if (live.length > 0) setProducts(live);
    });
  }, []);

  const loadDetail = (id) => {
    setDetailLoading(true);
    api.get(`/campaigns/${id}`).then(d => {
      setCampaignDetail(d);
    }).catch(() => {}).finally(() => setDetailLoading(false));
  };

  const handleSelectCampaign = (c) => {
    setSelectedCampaign(c);
    loadDetail(c.id);
    setShowForm(false);
  };

  const [reviewModal, setReviewModal] = useState(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [editCampaignModal, setEditCampaignModal] = useState(null);
  const [editCampaignForm, setEditCampaignForm] = useState({});
  const [editCampaignSubmitting, setEditCampaignSubmitting] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const safeJsonGm = (val) => {
    if (!val) return {};
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch { return {}; }
  };

  const openEditCampaign = (c) => {
    const cond = safeJsonGm(c.conditions);
    const prize = safeJsonGm(c.prize);
    setEditCampaignForm({
      name: c.name || '',
      description: c.description || '',
      campaign_type: c.campaign_type || 'bv_achievement',
      start_date: c.start_date ? c.start_date.slice(0, 10) : '',
      end_date: c.end_date ? c.end_date.slice(0, 10) : '',
      scope: c.scope || 'countrywide',
      target_branches: Array.isArray(c.target_branches) ? c.target_branches : [],
      status: c.status || 'upcoming',
      conditions: { ...cond, stock_assignments: undefined },
      prize,
      discount_percentage: Number(c.discount_percentage || 0),
    });
    setEditCampaignModal(c);
  };

  const handleEditCampaign = async (e) => {
    e.preventDefault();
    if (!editCampaignForm.name || !editCampaignForm.start_date || !editCampaignForm.end_date) {
      setAlert({ type: 'error', msg: 'Campaign name, start date and end date are required.' });
      return;
    }
    setEditCampaignSubmitting(true);
    try {
      await api.put(`/campaigns/${editCampaignModal.id}`, {
        name: editCampaignForm.name,
        description: editCampaignForm.description,
        campaign_type: editCampaignForm.campaign_type,
        start_date: editCampaignForm.start_date,
        end_date: editCampaignForm.end_date,
        scope: editCampaignForm.scope,
        target_branches: editCampaignForm.target_branches,
        status: editCampaignForm.status,
        conditions: normalizeConditions(editCampaignForm.conditions),
        prize: editCampaignForm.prize,
        discount_percentage: editCampaignForm.campaign_type === 'discount'
          ? Number(editCampaignForm.conditions?.discount_pct || editCampaignForm.discount_percentage || 0)
          : 0,
      });
      setAlert({ type: 'success', msg: `Campaign "${editCampaignForm.name}" updated successfully.` });
      setEditCampaignModal(null);
      loadCampaigns();
      if (selectedCampaign?.id === editCampaignModal.id) {
        loadDetail(editCampaignModal.id);
      }
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally {
      setEditCampaignSubmitting(false);
    }
  };

  // Normalize conditions: ensure products array is also reflected in products_text
  const normalizeConditions = (cond) => {
    if (!cond) return {};
    const normalized = { ...cond };
    if (Array.isArray(normalized.products) && normalized.products.length > 0) {
      normalized.products_text = normalized.products.join(', ');
    } else if (normalized.products_text && !Array.isArray(normalized.products)) {
      normalized.products = (normalized.products_text || '').split(',').map(s => s.trim()).filter(Boolean);
    }
    return normalized;
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name || !form.start_date || !form.end_date) {
      setAlert({ type: 'error', msg: 'Campaign name, start date and end date are required.' });
      return;
    }
    try {
      await api.post('/campaigns', {
        ...form,
        conditions: normalizeConditions(form.conditions),
        discount_percentage: form.campaign_type === 'discount' ? Number(form.conditions?.discount_pct || 0) : 0,
      });
      setAlert({ type: 'success', msg: 'Campaign created!' });
      setForm(defaultForm);
      setShowForm(false);
      loadCampaigns();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    }
  };

  const handleReview = async (action) => {
    if (!reviewModal) return;
    if (action === 'reject' && !reviewNote.trim()) {
      setAlert({ type: 'error', msg: 'A rejection note is required.' });
      return;
    }
    setReviewing(true);
    try {
      await api.patch(`/campaigns/${reviewModal.id}/review`, { action, rejection_note: reviewNote });
      setAlert({ type: 'success', msg: `Campaign ${action === 'approve' ? 'approved and set as upcoming' : 'rejected'} successfully.` });
      setReviewModal(null);
      setReviewNote('');
      loadCampaigns();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally {
      setReviewing(false);
    }
  };

  const handleDeleteCampaign = async (id) => {
    if (!window.confirm('Delete this campaign and all its participant records?')) return;
    try {
      await api.delete(`/campaigns/${id}`);
      setSelectedCampaign(null);
      setCampaignDetail(null);
      loadCampaigns();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    }
  };

  const handleRerun = (c) => {
    const cond = typeof c.conditions === 'object' ? c.conditions : {};
    const prize = typeof c.prize === 'object' ? c.prize : {};
    setForm({
      name: `${c.name} (Re-run)`,
      description: c.description || '',
      campaign_type: c.campaign_type || 'bv_achievement',
      start_date: '',
      end_date: '',
      scope: c.scope || 'countrywide',
      target_branches: Array.isArray(c.target_branches) ? c.target_branches : [],
      conditions: { ...cond, stock_assignments: undefined },
      prize: { ...prize },
    });
    setShowForm(true);
    setSelectedCampaign(null);
    setCampaignDetail(null);
  };

  const handleAddParticipant = async () => {
    if (!participantForm.distributor_code.trim()) return;
    try {
      await api.post(`/campaigns/${selectedCampaign.id}/participants`, participantForm);
      setParticipantForm({ distributor_code: '', distributor_name: '', branch: '' });
      setShowAddParticipant(false);
      loadDetail(selectedCampaign.id);
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    }
  };

  const handleUpdateParticipant = async (pid) => {
    try {
      await api.patch(`/campaigns/${selectedCampaign.id}/participants/${pid}`, {
        current_bv: Number(editBv) || 0,
        current_recruits: Number(editRecruits) || 0,
      });
      setEditingParticipant(null);
      loadDetail(selectedCampaign.id);
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    }
  };

  const handleRemoveParticipant = async (pid) => {
    if (!window.confirm('Remove this participant?')) return;
    try {
      await api.delete(`/campaigns/${selectedCampaign.id}/participants/${pid}`);
      loadDetail(selectedCampaign.id);
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    }
  };

  const handleGenerateWinners = async () => {
    if (!window.confirm('Auto-generate winners based on current participant data? Existing winners will be replaced.')) return;
    setGeneratingWinners(true);
    try {
      const result = await api.post(`/campaigns/${selectedCampaign.id}/generate-winners`, {});
      setAlert({ type: 'success', msg: `${result.winners_generated} winner(s) generated!` });
      loadDetail(selectedCampaign.id);
      loadCampaigns();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally { setGeneratingWinners(false); }
  };

  const handleWinnerStatus = async (wid, status) => {
    try {
      await api.patch(`/campaigns/${selectedCampaign.id}/winners/${wid}`, { status, verified_by: 'GM' });
      loadDetail(selectedCampaign.id);
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    }
  };

  const typeConfig = TYPE_COLORS[form.campaign_type] || TYPE_COLORS.custom;
  const cs = selectedCampaign ? (TYPE_COLORS[selectedCampaign.campaign_type] || TYPE_COLORS.custom) : null;

  return (
    <div className="space-y-5">
      {alert && <Alert type={alert.type} className="mb-2">{alert.msg}</Alert>}

      {/* Header */}
      <div className="rounded-xl p-5" style={{ background: 'linear-gradient(135deg,#1e3a5f,#2980b9)' }}>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-white text-lg font-bold m-0">📢 Campaign Management</h3>
            <p className="text-white/70 text-sm mt-1 m-0">Create, track, and analyse promotions</p>
          </div>
          {/* Sub-nav */}
          <div className="flex gap-2">
            {[
              { key: 'manage', label: '📋 Manage' },
              { key: 'analytics', label: '📊 Analytics' },
            ].map(tab => (
              <button key={tab.key} onClick={() => {
                setViewMode(tab.key);
                if (tab.key === 'analytics' && !analyticsData) loadAnalytics();
              }}
                style={{
                  padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem',
                  background: viewMode === tab.key ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)',
                  color: viewMode === tab.key ? '#fff' : 'rgba(255,255,255,0.6)',
                  borderBottom: viewMode === tab.key ? '2px solid #fff' : '2px solid transparent',
                }}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3 mt-3">
          {[
            { label: 'Total', val: campaigns.length, color: '#93c5fd' },
            { label: 'Active', val: campaigns.filter(c => campaignStatus(c) === 'active').length, color: '#86efac' },
            { label: 'Upcoming', val: campaigns.filter(c => campaignStatus(c) === 'upcoming').length, color: '#fcd34d' },
            { label: 'Completed', val: campaigns.filter(c => campaignStatus(c) === 'completed').length, color: '#d8b4fe' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-xl font-black" style={{ color: s.color }}>{s.val}</div>
              <div className="text-xs text-white/60">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Analytics View ── */}
      {viewMode === 'analytics' && (
        <CampaignAnalyticsView
          data={analyticsData}
          loading={analyticsLoading}
          onRefresh={loadAnalytics}
          campaigns={campaigns}
        />
      )}
      {/* ── Manage View ── */}
      {viewMode === 'manage' && (<>

      {/* Pending Approval Queue */}
      {campaigns.filter(c => c.status === 'pending_approval').length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock size={18} className="text-amber-600" />
              <h3 className="font-bold text-gray-800">Pending Approval Queue</h3>
              <span style={{ background: '#fbbf24', color: '#78350f', borderRadius: 99, padding: '2px 10px', fontSize: '0.78rem', fontWeight: 800 }}>
                {campaigns.filter(c => c.status === 'pending_approval').length} awaiting review
              </span>
            </div>
          </CardHeader>
          <CardBody>
            <div className="space-y-3">
              {campaigns.filter(c => c.status === 'pending_approval').map(c => {
                const tc2 = TYPE_COLORS[c.campaign_type] || TYPE_COLORS.custom;
                return (
                  <div key={c.id} className="p-4 rounded-xl border-2 border-amber-200 bg-amber-50">
                    <div className="flex flex-wrap justify-between items-start gap-3">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-bold text-gray-800">{c.name}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: tc2.bg, color: tc2.text, border: `1px solid ${tc2.border}` }}>
                            {CAMPAIGN_TYPES.find(t => t.value === c.campaign_type)?.label || c.campaign_type}
                          </span>
                          <Badge variant="warning"><Clock size={10} className="inline mr-1" />Pending Approval</Badge>
                        </div>
                        <div className="text-xs text-gray-500">{formatDate(c.start_date)} → {formatDate(c.end_date)}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {c.submitted_by && <span>Submitted by: <strong>{c.submitted_by}</strong></span>}
                          {c.submitted_by && c.created_at && <span className="mx-1">·</span>}
                          {c.created_at && <span>{new Date(c.created_at).toLocaleString()}</span>}
                        </div>
                        {c.description && <div className="text-sm text-gray-600 mt-1">{c.description}</div>}
                        {/* Show conditions summary */}
                        {(() => {
                          const cond = typeof c.conditions === 'string' ? JSON.parse(c.conditions || '{}') : (c.conditions || {});
                          const entries = Object.entries(cond).filter(([k, v]) => v !== '' && v !== null && k !== 'stock_assignments');
                          if (entries.length === 0) return null;
                          const safeStr = (v) => Array.isArray(v) ? v.map(i => (i && typeof i === 'object') ? (i.name || i.product || i.branch || '') : String(i)).filter(Boolean).join(', ') : (v !== null && v !== undefined && typeof v === 'object') ? '' : String(v);
                          return (
                            <div className="mt-2 text-xs text-gray-600">
                              <strong>Conditions:</strong> {entries.map(([k, v]) => `${k.replace(/_/g,' ')}: ${safeStr(v)}`).filter(s => !s.endsWith(': ')).join(' · ')}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => setReviewModal({ ...c, _action: 'approve' })}
                          style={{ padding: '6px 16px', background: '#dcfce7', color: '#166534', border: '1px solid #86efac', borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 }}>
                          ✓ Approve
                        </button>
                        <button onClick={() => setReviewModal({ ...c, _action: 'reject' })}
                          style={{ padding: '6px 14px', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 }}>
                          ✕ Reject
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-500">{campaigns.length} campaign(s) on record</div>
        <Button onClick={() => { setShowForm(true); setSelectedCampaign(null); setCampaignDetail(null); }}>+ New Campaign</Button>
      </div>

      {/* Create Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-gray-800">Create Campaign</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-lg font-bold">✕</button>
            </div>
          </CardHeader>
          <CardBody>
            <form onSubmit={handleCreate} className="space-y-5">
              {/* Type Selector */}
              <div>
                <div className="text-sm font-semibold text-gray-700 mb-2">Campaign Type</div>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                  {CAMPAIGN_TYPES.map(t => (
                    <button key={t.value} type="button" onClick={() => setForm(f => ({ ...f, campaign_type: t.value, conditions: {}, prize: {} }))}
                      className="p-3 rounded-lg border-2 text-left transition-all"
                      style={form.campaign_type === t.value ? { background: TYPE_COLORS[t.value].bg, borderColor: TYPE_COLORS[t.value].border } : { background: '#f8fafc', borderColor: '#e2e8f0' }}>
                      <div className="font-semibold text-sm" style={{ color: form.campaign_type === t.value ? TYPE_COLORS[t.value].text : '#374151' }}>{t.label}</div>
                      <div className="text-xs text-gray-500 mt-1">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <Input label="Campaign Title *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Independence Celebration, Elite Bingo Q2..." />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 min-h-[60px]"
                  placeholder="Brief summary visible to staff..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Start Date *" type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                <Input label="End Date *" type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
                  <select value={form.scope} onChange={e => setForm(f => ({ ...f, scope: e.target.value, target_branches: [] }))}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none">
                    <option value="countrywide">Countrywide (All Branches)</option>
                    <option value="specific">Specific Branches</option>
                  </select>
                </div>
                {form.scope === 'specific' && (
                  <MultiBranchSelect
                    label="Target Branches"
                    value={Array.isArray(form.target_branches) ? form.target_branches : []}
                    onChange={v => setForm(f => ({ ...f, target_branches: v }))}
                  />
                )}
              </div>

              {/* Type-specific Conditions */}
              <div className="p-4 rounded-xl border-2" style={{ background: typeConfig.bg, borderColor: typeConfig.border }}>
                <div className="font-semibold text-sm mb-3" style={{ color: typeConfig.text }}>📋 Conditions (How to Qualify)</div>
                <CampaignTypeConditionsForm type={form.campaign_type} conditions={form.conditions} onChange={c => setForm(f => ({ ...f, conditions: c }))} products={products} />
              </div>

              {/* Prize */}
              <div className="p-4 rounded-xl border-2 border-amber-200 bg-amber-50">
                <div className="font-semibold text-sm text-amber-800 mb-3">🏆 Prize / Reward</div>
                <CampaignPrizeForm type={form.campaign_type} prize={form.prize} onChange={p => setForm(f => ({ ...f, prize: p }))} products={products} />
              </div>

              <div className="sticky bottom-0 bg-white border-t border-gray-100 pt-4 flex gap-3">
                <Button type="submit" className="flex-1">Create Campaign</Button>
                <Button variant="ghost" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* Campaign List */}
      {!showForm && (() => {
        const isCompleted = (c) => { const st = campaignStatus(c); return st === 'completed' || st === 'ended'; };
        const activeCampaigns = campaigns.filter(c => !isCompleted(c));
        const completedCampaigns = campaigns.filter(c => isCompleted(c));
        const renderCard = (c, completed = false) => {
          const st = campaignStatus(c);
          const tc = TYPE_COLORS[c.campaign_type] || TYPE_COLORS.custom;
          const isSelected = selectedCampaign?.id === c.id;
          return (
              <div key={c.id} className="rounded-xl border-2 overflow-hidden cursor-pointer transition-all"
                style={{ borderColor: isSelected ? tc.border : '#e2e8f0', background: isSelected ? tc.bg : '#fff' }}
                onClick={() => isSelected ? (setSelectedCampaign(null), setCampaignDetail(null)) : handleSelectCampaign(c)}>
                <div className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-gray-800">{c.name}</span>
                        <Badge variant={st === 'active' ? 'success' : st === 'upcoming' ? 'info' : st === 'completed' ? 'default' : 'default'}>{st}</Badge>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: tc.bg, color: tc.text, border: `1px solid ${tc.border}` }}>
                          {CAMPAIGN_TYPES.find(t => t.value === c.campaign_type)?.label || c.campaign_type}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">{formatDate(c.start_date)} → {formatDate(c.end_date)} · {c.scope || 'Countrywide'}</div>
                      {c.description && <div className="text-sm text-gray-600 mt-1">{c.description}</div>}
                    </div>
                    <div className="text-xl ml-3">{isSelected ? '▲' : '▼'}</div>
                  </div>
                </div>

                {/* Expanded detail */}
                {isSelected && (
                  <div className="border-t border-gray-200 p-4 space-y-4 bg-white" onClick={e => e.stopPropagation()}>
                    {detailLoading ? <LoadingSpinner /> : campaignDetail && (
                      <>
                        {/* Stats row */}
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { label: 'Participants', val: campaignDetail.participants?.length || 0 },
                            { label: 'Winners Generated', val: campaignDetail.winners?.length || 0 },
                            { label: 'Status', val: st.toUpperCase() },
                          ].map(s => (
                            <div key={s.label} className="text-center rounded-lg p-3" style={{ background: tc.bg }}>
                              <div className="text-xl font-black" style={{ color: tc.text }}>{s.val}</div>
                              <div className="text-xs text-gray-500">{s.label}</div>
                            </div>
                          ))}
                        </div>

                        {/* Conditions & Prize summary */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                            <div className="text-xs font-bold text-gray-500 uppercase mb-2">Conditions</div>
                            {(() => {
                              const cond = typeof c.conditions === 'string' ? JSON.parse(c.conditions || '{}') : (c.conditions || {});
                              const entries = Object.entries(cond).filter(([k]) => k !== 'stock_assignments');
                              if (entries.length === 0) return <span className="text-xs text-gray-400">None set</span>;
                              return entries.map(([k, v]) => {
                                const isObjArray = Array.isArray(v) && v.length > 0 && v[0] !== null && typeof v[0] === 'object';
                                if (isObjArray) return null;
                                return (
                                  <div key={k} className="text-xs mb-1">
                                    <span className="font-semibold capitalize">{k.replace(/_/g, ' ')}:</span>{' '}
                                    {Array.isArray(v)
                                      ? v.length === 0 ? <span className="text-gray-400">All</span>
                                        : <span className="inline-flex flex-wrap gap-1 ml-1">{v.map((item, idx) => <span key={idx} className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs">{String(item)}</span>)}</span>
                                      : (v !== null && typeof v === 'object') ? null : String(v)}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                            <div className="text-xs font-bold text-amber-800 uppercase mb-2">Prize</div>
                            {(() => {
                              const pr = typeof c.prize === 'string' ? JSON.parse(c.prize || '{}') : (c.prize || {});
                              if (pr.tiers) return pr.tiers.map((t, i) => (
                                <div key={i} className="text-xs"><span className="font-semibold">{t.bv_required} BV</span> → {t.prize} ({t.label})</div>
                              ));
                              return Object.entries(pr).length === 0 ? <span className="text-xs text-gray-400">None set</span> :
                                Object.entries(pr).map(([k, v]) => (
                                  <div key={k} className="text-xs"><span className="font-semibold">{k.replace(/_/g, ' ')}:</span> {String(v)}</div>
                                ));
                            })()}
                          </div>
                        </div>

                        {/* Participants */}
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <div className="font-semibold text-sm text-gray-700">👥 Participants ({campaignDetail.participants?.length || 0})</div>
                            <Button size="sm" onClick={() => setShowAddParticipant(true)}>+ Add Participant</Button>
                          </div>
                          {showAddParticipant && (
                            <div className="p-3 border border-blue-200 rounded-lg bg-blue-50 space-y-2 mb-3">
                              <div className="grid grid-cols-3 gap-2">
                                <Input label="NB/DZ Code *" value={participantForm.distributor_code} onChange={e => setParticipantForm(f => ({ ...f, distributor_code: e.target.value }))} placeholder="e.g. NB78370 or DZ001234" />
                                <Input label="Name" value={participantForm.distributor_name} onChange={e => setParticipantForm(f => ({ ...f, distributor_name: e.target.value }))} placeholder="Full name" />
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                                  <select value={participantForm.branch} onChange={e => setParticipantForm(f => ({ ...f, branch: e.target.value }))}
                                    className="w-full px-2 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300">
                                    <option value="">— Select branch —</option>
                                    {BRANCH_DETAILS.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                                  </select>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" onClick={handleAddParticipant}>Add</Button>
                                <Button size="sm" variant="ghost" onClick={() => setShowAddParticipant(false)}>Cancel</Button>
                              </div>
                            </div>
                          )}
                          {campaignDetail.participants?.length === 0 ? (
                            <div className="text-sm text-gray-400 text-center py-3">No participants yet. Add them manually or they will appear when enrolled.</div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm border-collapse">
                                <thead>
                                  <tr className="bg-gray-50">
                                    <th className="text-left p-2 text-xs text-gray-500 font-semibold">NB Code</th>
                                    <th className="text-left p-2 text-xs text-gray-500 font-semibold">Name</th>
                                    <th className="text-left p-2 text-xs text-gray-500 font-semibold">Branch</th>
                                    <th className="text-center p-2 text-xs text-gray-500 font-semibold">BV</th>
                                    <th className="text-center p-2 text-xs text-gray-500 font-semibold">Recruits</th>
                                    <th className="text-center p-2 text-xs text-gray-500 font-semibold">Status</th>
                                    <th className="p-2"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {campaignDetail.participants.map(p => (
                                    <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50">
                                      <td className="p-2 font-mono text-xs font-bold text-blue-700">{p.distributor_code}</td>
                                      <td className="p-2 text-sm">{p.distributor_name || '-'}</td>
                                      <td className="p-2 text-xs text-gray-500">{p.branch || '-'}</td>
                                      <td className="p-2 text-center">
                                        {editingParticipant === p.id ? (
                                          <input type="number" value={editBv} onChange={e => setEditBv(e.target.value)} className="w-20 border border-gray-300 rounded px-1 text-center text-xs" />
                                        ) : <span className="font-bold text-blue-600">{Number(p.current_bv || 0).toLocaleString()}</span>}
                                      </td>
                                      <td className="p-2 text-center">
                                        {editingParticipant === p.id ? (
                                          <input type="number" value={editRecruits} onChange={e => setEditRecruits(e.target.value)} className="w-16 border border-gray-300 rounded px-1 text-center text-xs" />
                                        ) : <span className="font-bold text-green-600">{p.current_recruits || 0}</span>}
                                      </td>
                                      <td className="p-2 text-center">
                                        <Badge variant={p.status === 'active' ? 'success' : 'default'}>{p.status}</Badge>
                                      </td>
                                      <td className="p-2">
                                        <div className="flex gap-1 justify-end">
                                          {editingParticipant === p.id ? (
                                            <>
                                              <button onClick={() => handleUpdateParticipant(p.id)} className="text-xs text-green-600 hover:underline font-semibold">Save</button>
                                              <button onClick={() => setEditingParticipant(null)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                                            </>
                                          ) : (
                                            <>
                                              <button onClick={() => { setEditingParticipant(p.id); setEditBv(String(p.current_bv || 0)); setEditRecruits(String(p.current_recruits || 0)); }} className="text-xs text-blue-600 hover:underline">Edit</button>
                                              <button onClick={() => handleRemoveParticipant(p.id)} className="text-xs text-red-500 hover:underline">Remove</button>
                                            </>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        {/* Winners */}
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <div className="font-semibold text-sm text-gray-700">🏆 Winners ({campaignDetail.winners?.length || 0})</div>
                            <Button size="sm" variant="success" onClick={handleGenerateWinners} disabled={generatingWinners}>
                              {generatingWinners ? 'Generating...' : '⚡ Auto-Generate Winners'}
                            </Button>
                          </div>
                          {(campaignDetail.winners?.length || 0) === 0 ? (
                            <div className="text-sm text-gray-400 text-center py-3">No winners yet. Click "Auto-Generate" once participants have their BV/recruits updated.</div>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm border-collapse">
                                <thead>
                                  <tr className="bg-amber-50">
                                    <th className="text-center p-2 text-xs text-amber-800 font-semibold">Rank</th>
                                    <th className="text-left p-2 text-xs text-amber-800 font-semibold">NB Code</th>
                                    <th className="text-left p-2 text-xs text-amber-800 font-semibold">Name</th>
                                    <th className="text-left p-2 text-xs text-amber-800 font-semibold">Branch</th>
                                    <th className="text-left p-2 text-xs text-amber-800 font-semibold">Prize Tier</th>
                                    <th className="text-left p-2 text-xs text-amber-800 font-semibold">Prize</th>
                                    <th className="text-center p-2 text-xs text-amber-800 font-semibold">Status</th>
                                    <th className="p-2"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {campaignDetail.winners.map((w, i) => (
                                    <tr key={w.id} className="border-t border-amber-100 hover:bg-amber-50/50">
                                      <td className="p-2 text-center font-black text-lg" style={{ color: i === 0 ? '#d97706' : i === 1 ? '#6b7280' : '#92400e' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${w.prize_rank}`}</td>
                                      <td className="p-2 font-mono text-xs font-bold text-blue-700">{w.distributor_code}</td>
                                      <td className="p-2 text-sm font-semibold">{w.distributor_name || '-'}</td>
                                      <td className="p-2 text-xs text-gray-500">{w.branch || '-'}</td>
                                      <td className="p-2 text-xs font-semibold text-amber-700">{w.prize_tier}</td>
                                      <td className="p-2 text-xs text-gray-700">{w.prize_description}</td>
                                      <td className="p-2 text-center">
                                        <Badge variant={w.status === 'awarded' ? 'success' : w.status === 'verified' ? 'info' : 'warning'}>{w.status}</Badge>
                                      </td>
                                      <td className="p-2">
                                        <div className="flex gap-1 justify-end">
                                          {w.status === 'pending' && <button onClick={() => handleWinnerStatus(w.id, 'verified')} className="text-xs text-blue-600 hover:underline">Verify</button>}
                                          {w.status === 'verified' && <button onClick={() => handleWinnerStatus(w.id, 'awarded')} className="text-xs text-green-600 hover:underline">Mark Awarded</button>}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 pt-2 border-t border-gray-100 flex-wrap">
                          {completed && (
                            <button onClick={() => handleRerun(c)}
                              style={{ padding: '5px 12px', background: '#f0fdf4', color: '#166534', border: '1px solid #86efac', borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
                              🔄 Re-run Campaign
                            </button>
                          )}
                          <button onClick={() => openEditCampaign(c)}
                            style={{ padding: '5px 12px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #93c5fd', borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
                            ✏️ Edit Campaign
                          </button>
                          <button onClick={() => handleDeleteCampaign(c.id)} className="text-xs text-red-500 hover:underline ml-auto">🗑️ Delete Campaign</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
        };
        return (
          <>
            <div className="grid gap-3">
              {loading ? <LoadingSpinner /> : activeCampaigns.length === 0 && completedCampaigns.length === 0 ? (
                <div className="text-center py-10 text-gray-400">No campaigns yet. Click "+ New Campaign" to start.</div>
              ) : activeCampaigns.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-sm">No active or upcoming campaigns right now.</div>
              ) : activeCampaigns.map(c => renderCard(c, false))}
            </div>
            {!loading && completedCampaigns.length > 0 && (
              <div className="mt-2">
                <button onClick={() => setShowCompleted(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#f1f5f9', border: '1.5px solid #e2e8f0', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.87rem', color: '#475569', width: '100%' }}>
                  <span>{showCompleted ? '▲' : '▼'}</span>
                  <span>✅ Completed Campaigns</span>
                  <span style={{ background: '#d8b4fe', color: '#6b21a8', borderRadius: 99, padding: '1px 10px', fontSize: '0.75rem', fontWeight: 800 }}>{completedCampaigns.length}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 400 }}>Re-run or edit past campaigns</span>
                </button>
                {showCompleted && (
                  <div className="grid gap-3 mt-3">
                    {completedCampaigns.map(c => renderCard(c, true))}
                  </div>
                )}
              </div>
            )}
          </>
        );
      })()}

      {/* Edit Campaign Modal */}
      {editCampaignModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 28, maxWidth: 560, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', maxHeight: '93vh', overflowY: 'auto' }}>
            <div className="flex justify-between items-center mb-4">
              <div>
                <div className="font-bold text-lg text-gray-800">✏️ Edit Campaign</div>
                <div className="text-sm text-gray-500">{editCampaignModal.name}</div>
              </div>
              <button onClick={() => setEditCampaignModal(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
            </div>
            <form onSubmit={handleEditCampaign} className="space-y-4">
              <Input label="Campaign Title *" value={editCampaignForm.name || ''} onChange={e => setEditCampaignForm(f => ({ ...f, name: e.target.value }))} />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={editCampaignForm.description || ''} onChange={e => setEditCampaignForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 min-h-[60px]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Start Date *" type="date" value={editCampaignForm.start_date || ''} onChange={e => setEditCampaignForm(f => ({ ...f, start_date: e.target.value }))} />
                <Input label="End Date *" type="date" value={editCampaignForm.end_date || ''} onChange={e => setEditCampaignForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select value={editCampaignForm.status || 'upcoming'} onChange={e => setEditCampaignForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none">
                  <option value="upcoming">Upcoming</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="pending_approval">Pending Approval</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
                <select value={editCampaignForm.scope || 'countrywide'} onChange={e => setEditCampaignForm(f => ({ ...f, scope: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none">
                  <option value="countrywide">Countrywide (All Branches)</option>
                  <option value="specific">Specific Branches</option>
                </select>
              </div>
              {/* Conditions */}
              <div className="p-4 rounded-xl border-2 border-gray-200 bg-gray-50">
                <div className="font-semibold text-sm text-gray-700 mb-3">📋 Conditions</div>
                <CampaignTypeConditionsForm
                  type={editCampaignForm.campaign_type || 'custom'}
                  conditions={editCampaignForm.conditions || {}}
                  onChange={c => setEditCampaignForm(f => ({ ...f, conditions: c }))}
                  products={products}
                />
              </div>
              {/* Prize */}
              <div className="p-4 rounded-xl border-2 border-amber-200 bg-amber-50">
                <div className="font-semibold text-sm text-amber-800 mb-3">🏆 Prize / Reward</div>
                <CampaignPrizeForm
                  type={editCampaignForm.campaign_type || 'custom'}
                  prize={editCampaignForm.prize || {}}
                  onChange={p => setEditCampaignForm(f => ({ ...f, prize: p }))}
                  products={products}
                />
              </div>
              <div className="flex gap-3 pt-2 border-t border-gray-100">
                <button type="submit" disabled={editCampaignSubmitting}
                  style={{ flex: 1, padding: '10px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }}>
                  {editCampaignSubmitting ? 'Saving…' : '✓ Save Changes'}
                </button>
                <button type="button" onClick={() => setEditCampaignModal(null)}
                  style={{ padding: '10px 18px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div className="font-bold text-lg text-gray-800 mb-1">
              {reviewModal._action === 'approve' ? '✅ Approve Campaign' : '❌ Reject Campaign'}
            </div>
            <div className="text-sm text-gray-500 mb-4">{reviewModal.name}</div>
            {reviewModal._action === 'approve' ? (
              <div className="text-sm text-gray-700 mb-4 p-3 bg-green-50 rounded-lg border border-green-200">
                This campaign will be marked as <strong>upcoming</strong> and will automatically become active on its start date.
              </div>
            ) : (
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Rejection Reason <span className="text-red-500">*</span></label>
                <textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 min-h-[80px]"
                  placeholder="Explain why this campaign is being rejected..." />
              </div>
            )}
            <div className="flex gap-3">
              {reviewModal._action === 'approve' ? (
                <button onClick={() => handleReview('approve')} disabled={reviewing}
                  style={{ flex: 1, padding: '10px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }}>
                  {reviewing ? 'Approving…' : '✓ Confirm Approve'}
                </button>
              ) : (
                <button onClick={() => handleReview('reject')} disabled={reviewing}
                  style={{ flex: 1, padding: '10px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }}>
                  {reviewing ? 'Rejecting…' : '✕ Confirm Reject'}
                </button>
              )}
              <button onClick={() => { setReviewModal(null); setReviewNote(''); }}
                style={{ padding: '10px 18px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}

function BonusHistoryTab() {
  const [bonusData, setBonusData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterForm, setFilterForm] = useState({ start_date: '', end_date: '', period: '' });

  useEffect(() => {
    setLoading(true);
    api.get('/finance/bonus-periods')
      .then(d => setBonusData(Array.isArray(d) ? d : []))
      .catch(() => setBonusData([]))
      .finally(() => setLoading(false));
  }, []);

  const filteredData = bonusData.filter(b => {
    if (filterForm.period && !b.period?.toLowerCase().includes(filterForm.period.toLowerCase())) return false;
    return true;
  });

  const totalEarned = filteredData.reduce((sum, b) => sum + Number(b.total_earned || 0), 0);
  const totalPaid = filteredData.reduce((sum, b) => sum + Number(b.total_paid || 0), 0);
  const totalOutstanding = filteredData.reduce((sum, b) => sum + Number(b.outstanding || 0), 0);

  const handleCSVExport = () => {
    const headers = 'Period,Total Distributors,Unpaid Count,Total Earned,Total Paid,Outstanding\n';
    const rows = filteredData.map(b => `${b.period},${b.total},${b.unpaid_count},${b.total_earned},${b.total_paid},${b.outstanding}`).join('\n');
    const csv = headers + rows;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bonus_history.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div style={{ background: 'linear-gradient(135deg, #43e97b, #38f9d7)' }} className="rounded-xl p-5 shadow-lg text-white">
          <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>Total Earned</p>
          <p style={{ fontSize: '2rem' }} className="font-bold mt-1">{formatCurrency(totalEarned)}</p>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #4facfe, #00f2fe)' }} className="rounded-xl p-5 shadow-lg text-white">
          <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>Total Paid</p>
          <p style={{ fontSize: '2rem' }} className="font-bold mt-1">{formatCurrency(totalPaid)}</p>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #fa709a, #fee140)' }} className="rounded-xl p-5 shadow-lg text-white">
          <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>Outstanding</p>
          <p style={{ fontSize: '2rem' }} className="font-bold mt-1">{formatCurrency(totalOutstanding)}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">Bonus Periods</h3>
            <div className="flex items-center gap-2">
              <Input placeholder="Filter by period…" value={filterForm.period} onChange={e => setFilterForm({ ...filterForm, period: e.target.value })} />
              <Button size="sm" onClick={handleCSVExport}><Download size={16} /> Export CSV</Button>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {loading ? <LoadingSpinner /> : (
            <Table
              columns={[
                { header: 'Period', key: 'period' },
                { header: 'Distributors', key: 'total' },
                { header: 'Unpaid', key: 'unpaid_count' },
                { header: 'Total Earned', render: r => formatCurrency(r.total_earned) },
                { header: 'Total Paid', render: r => formatCurrency(r.total_paid) },
                { header: 'Outstanding', render: r => <span className={Number(r.outstanding) > 0 ? 'text-amber-600 font-semibold' : 'text-gray-500'}>{formatCurrency(r.outstanding)}</span> },
              ]}
              data={filteredData}
              emptyMessage="No bonus period records found"
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function CommunicationTab() {
  const [form, setForm] = useState({ message: '', priority: 'Normal', target: 'all_staff', branch: '' });
  const [submitMessage, setSubmitMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notices, setNotices] = useState([]);
  const [noticesLoading, setNoticesLoading] = useState(true);

  const loadNotices = useCallback(() => {
    setNoticesLoading(true);
    api.finance.notices()
      .then(d => setNotices(Array.isArray(d) ? d : d.notices || []))
      .catch(() => setNotices([]))
      .finally(() => setNoticesLoading(false));
  }, []);

  useEffect(() => { loadNotices(); }, [loadNotices]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.message.trim()) {
      setSubmitMessage('Error: Please enter a message.');
      return;
    }
    setSubmitting(true);
    setSubmitMessage('');
    try {
      await api.finance.createNotice({
        message: form.message,
        priority: form.priority,
        title: form.target === 'specific_branch' ? `To: ${form.branch}` : form.target === 'branch_managers' ? 'To: Branch Managers' : 'To: All Staff',
      });
      setForm({ message: '', priority: 'Normal', target: 'all_staff', branch: '' });
      setSubmitMessage('Message sent successfully!');
      loadNotices();
    } catch (err) {
      setSubmitMessage('Error: ' + (err.message || 'Failed to send message.'));
    } finally {
      setSubmitting(false);
    }
  };

  const priorityColors = { Normal: 'default', Urgent: 'danger', Info: 'info' };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Send Communication</h3></CardHeader>
        <CardBody>
          {submitMessage && <Alert type={submitMessage.startsWith('Error') ? 'error' : 'success'} className="mb-4">{submitMessage}</Alert>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Message</label>
              <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 min-h-[100px] resize-y"
                placeholder="Type your message to staff..." />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Priority</label>
                <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                  <option value="Normal">Normal</option>
                  <option value="Urgent">Urgent</option>
                  <option value="Info">Info</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Target</label>
                <select value={form.target} onChange={e => setForm({ ...form, target: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                  <option value="all_staff">All Staff</option>
                  <option value="branch_managers">Branch Managers</option>
                  <option value="specific_branch">Specific Branch</option>
                </select>
              </div>
              {form.target === 'specific_branch' && (
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">Branch</label>
                  <select value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                    <option value="">Select Branch</option>
                    {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}
            </div>
            <Button type="submit" disabled={submitting}>{submitting ? 'Sending…' : 'Send Message'}</Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-gray-800">Posted Notices</h3>
            {notices.length > 0 && <Badge variant="info">{notices.length}</Badge>}
          </div>
        </CardHeader>
        <CardBody>
          {noticesLoading ? <LoadingSpinner /> : notices.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">No notices posted yet.</p>
          ) : (
            <div className="space-y-3">
              {notices.map(n => (
                <div key={n.id} className="border border-gray-100 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant={priorityColors[n.priority] || 'default'}>{n.priority || 'Normal'}</Badge>
                    {n.title && <span className="font-semibold text-sm text-gray-900">{n.title}</span>}
                    <span className="text-xs text-gray-400">{formatDateTime(n.createdAt || n.created_at)}</span>
                    {(n.createdBy || n.created_by) && <span className="text-xs text-gray-400">by {n.createdBy || n.created_by}</span>}
                  </div>
                  <p className="text-sm text-gray-700">{n.message}</p>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

    </div>
  );
}

function StaffTab() {
  const [form, setForm] = useState({ request_type: 'leave', leave_type: 'Annual', start_date: '', end_date: '', reason: '', amount: '' });
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.reason) {
      setMessage('Error: Please provide a reason.');
      return;
    }
    setSubmitting(true);
    try {
      if (form.request_type === 'leave') {
        await api.post('/employees/leaves', { leave_type: form.leave_type, start_date: form.start_date, end_date: form.end_date, reason: form.reason, department: 'Executive' });
      } else {
        await api.branch.createCashMovement({ type: 'request', amount: Number(form.amount), reason: form.reason, department: 'Executive' });
      }
      setMessage('Request submitted successfully!');
      setForm({ request_type: 'leave', leave_type: 'Annual', start_date: '', end_date: '', reason: '', amount: '' });
    } catch (err) {
      setMessage('Error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader><h3 className="font-bold text-gray-800">Executive Request</h3></CardHeader>
      <CardBody>
        {message && <Alert type={message.startsWith('Error') ? 'error' : 'success'} className="mb-4">{message}</Alert>}
        <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Request Type</label>
            <select value={form.request_type} onChange={e => setForm({ ...form, request_type: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
              <option value="leave">Leave Request</option>
              <option value="cash">Cash Request</option>
            </select>
          </div>
          {form.request_type === 'leave' && (
            <>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Leave Type</label>
                <select value={form.leave_type} onChange={e => setForm({ ...form, leave_type: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                  <option>Annual</option>
                  <option>Sick</option>
                  <option>Personal</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Input label="Start Date" type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
                <Input label="End Date" type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
              </div>
            </>
          )}
          {form.request_type === 'cash' && (
            <Input label="Amount" type="number" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="Enter amount" />
          )}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Reason</label>
            <textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 min-h-[80px] resize-y"
              placeholder="Provide details..." />
          </div>
          <Button type="submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Request'}</Button>
        </form>
      </CardBody>
    </Card>
  );
}

function ProfitAnalysisTab() {
  const pad = n => String(n).padStart(2, '0');
  const localDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = new Date();
  const [startDate, setStartDate] = useState(localDate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [endDate, setEndDate] = useState(localDate(now));
  const [qtySoldMap, setQtySoldMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [campaignPrices, setCampaignPrices] = useState({});
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [campaignPrice, setCampaignPrice] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.director.profitAnalysis({ startDate, endDate }),
      api.prices.list(),
    ]).then(([res, prices]) => {
      if (Array.isArray(prices) && prices.length > 0) setLivePrices(prices);
      const map = {};
      (res?.products || []).forEach(p => {
        map[p.productName] = p.qtySold;
      });
      setQtySoldMap(map);
    })
    .catch(() => setQtySoldMap({}))
    .finally(() => setLoading(false));
  }, [startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const profitRows = getLiveProductList().map(p => {
    const qtySold = qtySoldMap[p.description] || 0;
    const campaign = campaignPrices[p.description];
    const sellingPrice = campaign || p.dp;
    const profit = sellingPrice - p.cif;
    const totalProfit = profit * qtySold;
    const margin = sellingPrice > 0 ? ((profit / sellingPrice) * 100) : 0;
    return {
      product_name: p.description, cif: p.cif, dp: p.dp, cp: p.cp,
      campaign_price: campaign || null, selling_price: sellingPrice,
      profit_per_unit: profit, margin: Math.round(margin * 10) / 10,
      qty_sold: qtySold, total_profit: totalProfit,
    };
  }).sort((a, b) => b.total_profit - a.total_profit);

  const totalCIF    = profitRows.reduce((s, r) => s + r.cif * r.qty_sold, 0);
  const totalRevenue = profitRows.reduce((s, r) => s + r.selling_price * r.qty_sold, 0);
  const grandProfit  = profitRows.reduce((s, r) => s + r.total_profit, 0);
  const avgMargin    = totalRevenue > 0 ? ((grandProfit / totalRevenue) * 100).toFixed(1) : '0';

  const saveCampaign = () => {
    if (editingCampaign && campaignPrice) setCampaignPrices(prev => ({ ...prev, [editingCampaign]: Number(campaignPrice) }));
    setEditingCampaign(null);
    setCampaignPrice('');
  };

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200">
        <CardBody>
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex items-start gap-4 flex-1">
              <TrendingUp size={32} className="text-emerald-600 mt-1" />
              <div>
                <h3 className="font-bold text-emerald-900">Profit Analysis — CIF vs DP</h3>
                <p className="text-sm text-emerald-700 mt-1">Stock imported at CIF price; sold at DP. Profit = DP − CIF per unit. Qty sold sourced from live stock movements.</p>
              </div>
            </div>
            <div className="flex gap-2 items-end">
              <div>
                <label className="block text-xs font-semibold text-emerald-800 mb-1">From</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="border border-emerald-300 rounded px-2 py-1 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-emerald-800 mb-1">To</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="border border-emerald-300 rounded px-2 py-1 text-sm" />
              </div>
              <Button size="sm" onClick={load} className="mb-0.5">Apply</Button>
            </div>
          </div>
        </CardBody>
      </Card>
      {loading ? <LoadingSpinner /> : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard title="Total CIF Cost" value={formatCurrency(totalCIF)} color="red" icon={<Ship size={24} />} />
            <StatCard title="Total Revenue (DP)" value={formatCurrency(totalRevenue)} color="blue" icon={<DollarSign size={24} />} />
            <StatCard title="Gross Profit" value={formatCurrency(grandProfit)} color="green" icon={<TrendingUp size={24} />} />
            <StatCard title="Avg Margin" value={`${avgMargin}%`} color="purple" icon={<BarChart3 size={24} />} />
          </div>
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-gray-800">Product Profit Breakdown</h3>
                <Badge variant="info">{profitRows.filter(r => r.qty_sold > 0).length} products with sales</Badge>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 font-semibold text-gray-600">Product</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">CIF</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">DP</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Campaign</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Profit/Unit</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Margin</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Qty Sold</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Total Profit</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {profitRows.map(r => (
                    <tr key={r.product_name} className={`border-b border-gray-100 hover:bg-gray-50 ${r.qty_sold > 0 ? '' : 'opacity-40'}`}>
                      <td className="px-4 py-2.5 text-gray-800 max-w-[250px] truncate" title={r.product_name}>{r.product_name}</td>
                      <td className="px-4 py-2.5 text-right text-red-600 font-medium">{formatCurrency(r.cif)}</td>
                      <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(r.dp)}</td>
                      <td className="px-4 py-2.5 text-right">{r.campaign_price ? <span className="text-orange-600 font-medium">{formatCurrency(r.campaign_price)}</span> : '-'}</td>
                      <td className="px-4 py-2.5 text-right text-green-700 font-bold">{formatCurrency(r.profit_per_unit)}</td>
                      <td className="px-4 py-2.5 text-right"><span className={`font-medium ${r.margin >= 50 ? 'text-green-600' : r.margin >= 30 ? 'text-blue-600' : 'text-orange-600'}`}>{r.margin}%</span></td>
                      <td className="px-4 py-2.5 text-right font-medium">{r.qty_sold > 0 ? r.qty_sold : '-'}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-green-700">{r.total_profit > 0 ? formatCurrency(r.total_profit) : '-'}</td>
                      <td className="px-4 py-2.5">
                        <button className="text-xs text-blue-600 hover:underline" onClick={() => { setEditingCampaign(r.product_name); setCampaignPrice(String(r.campaign_price || r.dp)); }}>Set Campaign</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
      <Modal open={!!editingCampaign} onClose={() => setEditingCampaign(null)} title={`Campaign Price: ${editingCampaign}`} size="sm">
        <div className="p-6 space-y-4">
          {editingCampaign && (() => { const prod = getLiveProductList().find(p => p.description === editingCampaign); return prod ? <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded"><p>CIF: {formatCurrency(prod.cif)} | DP: {formatCurrency(prod.dp)} | CP: {formatCurrency(prod.cp)}</p></div> : null; })()}
          <Input label="Campaign Selling Price (N$)" type="number" min="0" step="1" value={campaignPrice} onChange={e => setCampaignPrice(String(Math.round(Number(e.target.value)) || e.target.value))} />
          <div className="flex gap-3">
            <Button onClick={saveCampaign}>Apply Campaign Price</Button>
            <Button variant="secondary" onClick={() => { setCampaignPrices(prev => { const n = { ...prev }; delete n[editingCampaign]; return n; }); setEditingCampaign(null); }}>Reset to DP</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Price Advisor Tab ────────────────────────────────────────────────────────
function PriceAdvisorTab() {
  const [products, setProducts] = useState([]);
  const [priceList, setPriceList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [targetGP, setTargetGP] = useState(40);
  const [retailMkup, setRetailMkup] = useState(15);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.prices.analytics().catch(() => ({ products: [] })),
      api.prices.list().catch(() => []),
    ]).then(([analytics, prices]) => {
      setProducts(Array.isArray(analytics?.products) ? analytics.products : []);
      setPriceList(Array.isArray(prices) ? prices : []);
    }).finally(() => setLoading(false));
  }, []);

  const handleApply = async () => {
    if (!selected) return;
    const liveRow = priceList.find(r => r.id === selected.id) || {};
    const finalCif = Number(selected.original_cif)
      ? +(Number(selected.original_cif) + Number(selected.original_cif) * Number(selected.vat_pct || 15) / 100 + Number(selected.original_cif) * Number(selected.import_duty_pct || 0) / 100 + Number(selected.clearing_fee || 1)).toFixed(2)
      : Number(liveRow.cif) || 0;
    const suggestedDp = finalCif > 0 && targetGP < 100 ? Math.round(finalCif / (1 - targetGP / 100)) : null;
    const suggestedCp = suggestedDp ? Math.round(suggestedDp * (1 + retailMkup / 100)) : null;
    if (!suggestedDp) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await api.prices.update(selected.id, {
        dp: suggestedDp,
        cp: suggestedCp,
        ...(finalCif > 0 ? { cif: Math.round(finalCif) } : {}),
      });
      setPriceList(prev => prev.map(r => r.id === selected.id ? { ...r, dp: suggestedDp, cp: suggestedCp } : r));
      setSaveMsg({ ok: true, text: `✅ Prices applied for ${selected.description}` });
    } catch (e) {
      setSaveMsg({ ok: false, text: `⚠ ${e.message}` });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 4000);
    }
  };

  const filtered = products.filter(p =>
    !search ||
    (p.description || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.product_code || '').toLowerCase().includes(search.toLowerCase())
  );

  const liveRow = selected ? (priceList.find(r => r.id === selected.id) || {}) : {};
  const finalCif = selected
    ? (Number(selected.original_cif)
        ? +(Number(selected.original_cif) + Number(selected.original_cif) * Number(selected.vat_pct || 15) / 100 + Number(selected.original_cif) * Number(selected.import_duty_pct || 0) / 100 + Number(selected.clearing_fee || 1)).toFixed(2)
        : Number(liveRow.cif) || 0)
    : 0;
  const suggestedDp = finalCif > 0 && targetGP < 100 ? Math.round(finalCif / (1 - targetGP / 100)) : null;
  const suggestedCp = suggestedDp ? Math.round(suggestedDp * (1 + retailMkup / 100)) : null;
  const sold90 = selected ? Number(selected.units_sold_90d) || 0 : 0;
  const rev90 = selected ? Number(selected.revenue_dp_90d) || 0 : 0;
  const gp90 = selected ? Number(selected.gross_profit_90d) || 0 : 0;
  const liveGpPct = selected && Number(liveRow.dp) > 0 ? (((Number(liveRow.dp) - Number(liveRow.cif || 0)) / Number(liveRow.dp)) * 100).toFixed(1) : null;

  return (
    <div className="flex gap-0 rounded-xl overflow-hidden border shadow" style={{ minHeight: 560, background: '#fff' }}>
      {/* Left — Product List */}
      <div className="flex flex-col border-r" style={{ width: 280, minWidth: 220, background: '#f8fafc' }}>
        <div className="px-3 py-3 border-b" style={{ background: 'linear-gradient(135deg,#1e3a5f,#0f172a)' }}>
          <div className="text-sm font-bold text-white mb-0.5">💡 Price Advisor</div>
          <div className="text-xs text-blue-200">90-day sales velocity · select a product</div>
        </div>
        <div className="px-3 py-2 border-b">
          <input
            type="text"
            placeholder="Search products…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">⏳ Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-xs text-gray-400 mt-8">No products found</div>
          ) : (
            filtered.map(p => {
              const sold = Number(p.units_sold_90d) || 0;
              const rev = Number(p.revenue_dp_90d) || 0;
              return (
                <button
                  key={p.id}
                  onClick={() => { setSelected(p); setTargetGP(40); setRetailMkup(15); setSaveMsg(null); }}
                  className={`w-full text-left px-3 py-2 border-b hover:bg-blue-50 transition-colors ${selected?.id === p.id ? 'bg-blue-100 border-l-4 border-l-blue-600' : ''}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-medium text-gray-700 leading-tight">{p.description}</span>
                    {sold > 0 && <span className="text-xs font-bold text-green-600 whitespace-nowrap">{sold}</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {p.product_code && <span className="text-xs text-gray-400 font-mono">{p.product_code}</span>}
                    {sold === 0 && <span className="text-xs text-gray-400 italic">no sales 90d</span>}
                    {rev > 0 && <span className="text-xs text-gray-500">N${Math.round(rev).toLocaleString('en-ZA')}</span>}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right — Detail + Calculator */}
      <div className="flex-1 overflow-y-auto p-6">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm gap-3" style={{ minHeight: 300 }}>
            <span className="text-5xl">👈</span>
            <span>Select a product from the list to view sales data and calculate optimal pricing</span>
          </div>
        ) : (
          <div className="space-y-5 max-w-2xl">
            <div>
              <h3 className="text-lg font-bold text-gray-800">{selected.description}</h3>
              {selected.product_code && <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{selected.product_code}</span>}
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Units Sold (90d)', val: sold90.toLocaleString('en-ZA'), color: sold90 > 0 ? '#15803d' : '#9ca3af' },
                { label: '~Monthly Units', val: sold90 > 0 ? (sold90 / 3).toFixed(1) : '—', color: '#1d4ed8' },
                { label: 'Revenue DP (90d)', val: rev90 > 0 ? `N$${Math.round(rev90).toLocaleString('en-ZA')}` : '—', color: '#c41e3a' },
                { label: 'Gross Profit (90d)', val: gp90 > 0 ? `N$${Math.round(gp90).toLocaleString('en-ZA')}` : '—', color: '#15803d' },
              ].map(s => (
                <div key={s.label} className="rounded-lg border p-3" style={{ background: '#f8fafc' }}>
                  <div className="text-xs text-gray-400 mb-0.5">{s.label}</div>
                  <div className="text-base font-bold" style={{ color: s.color }}>{s.val}</div>
                </div>
              ))}
            </div>

            {/* Current Prices */}
            <div className="rounded-lg border p-4" style={{ background: '#f8fafc' }}>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Current Live Prices</div>
              <div className="flex flex-wrap gap-5 text-sm">
                <span>CIF: <strong className="text-purple-700">N${Number(liveRow.cif || 0).toLocaleString('en-ZA')}</strong></span>
                <span>DP: <strong className="text-red-700">N${Number(liveRow.dp || 0).toLocaleString('en-ZA')}</strong></span>
                <span>CP: <strong className="text-blue-700">N${Number(liveRow.cp || 0).toLocaleString('en-ZA')}</strong></span>
                <span>BV: <strong className="text-gray-700">{Number(liveRow.bv || 0)}</strong></span>
                {liveGpPct && <span>GP%: <strong className={Number(liveGpPct) >= 30 ? 'text-green-700' : 'text-orange-600'}>{liveGpPct}%</strong></span>}
              </div>
              {finalCif > 0 && Number(selected.original_cif) > 0 && (
                <div className="mt-2 text-xs text-gray-500 flex flex-wrap gap-3">
                  <span>Original CIF: <strong>N${Number(selected.original_cif)}</strong></span>
                  <span>VAT: <strong>{Number(selected.vat_pct || 15)}%</strong></span>
                  <span>Import Duty: <strong>{Number(selected.import_duty_pct || 0)}%</strong></span>
                  <span>Clearing: <strong>N${Number(selected.clearing_fee || 1)}</strong></span>
                  <span className="font-semibold text-purple-700">→ Landed CIF: N${finalCif}</span>
                </div>
              )}
            </div>

            {/* Pricing Calculator */}
            <div className="rounded-lg border p-5" style={{ background: 'linear-gradient(135deg,#f0f9ff,#fff)' }}>
              <div className="text-sm font-bold text-blue-800 mb-4">🧮 Pricing Calculator</div>
              <div className="flex flex-wrap gap-6 items-end mb-5">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-gray-600">Target GP Margin %</span>
                  <div className="flex items-center gap-2">
                    <input type="range" min="5" max="75" step="1" value={targetGP} onChange={e => setTargetGP(Number(e.target.value))} className="w-36" />
                    <span className="text-sm font-bold text-blue-700 w-12">{targetGP}%</span>
                  </div>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-gray-600">Retail Markup % (CP over DP)</span>
                  <div className="flex items-center gap-2">
                    <input type="range" min="0" max="50" step="1" value={retailMkup} onChange={e => setRetailMkup(Number(e.target.value))} className="w-36" />
                    <span className="text-sm font-bold text-amber-700 w-12">{retailMkup}%</span>
                  </div>
                </label>
              </div>
              {finalCif === 0 ? (
                <div className="text-sm text-orange-600 bg-orange-50 border border-orange-200 rounded p-3">
                  ⚠ No CIF data found for this product. Set the Original CIF in the Price List tab (📊 breakdown) first to enable the calculator.
                </div>
              ) : (
                <div className="flex flex-wrap gap-5 items-center">
                  <div className="text-center">
                    <div className="text-xs text-gray-400 mb-0.5">Landed CIF</div>
                    <div className="text-base font-bold text-purple-700">N${finalCif}</div>
                  </div>
                  <div className="text-gray-300 text-2xl">→</div>
                  <div className="text-center">
                    <div className="text-xs text-gray-400 mb-0.5">Suggested DP</div>
                    <div className="text-2xl font-bold text-red-700">{suggestedDp ? `N$${suggestedDp.toLocaleString('en-ZA')}` : '—'}</div>
                    <div className="text-xs text-gray-400">GP = {targetGP}%</div>
                  </div>
                  <div className="text-gray-300 text-2xl">→</div>
                  <div className="text-center">
                    <div className="text-xs text-gray-400 mb-0.5">Suggested CP</div>
                    <div className="text-2xl font-bold text-blue-700">{suggestedCp ? `N$${suggestedCp.toLocaleString('en-ZA')}` : '—'}</div>
                    <div className="text-xs text-gray-400">+{retailMkup}% over DP</div>
                  </div>
                  {suggestedDp && (
                    <button
                      onClick={handleApply}
                      disabled={saving}
                      className="ml-2 px-5 py-2.5 text-sm font-bold text-white rounded-lg shadow hover:opacity-90 disabled:opacity-60"
                      style={{ background: 'linear-gradient(135deg,#15803d,#166534)' }}
                    >
                      {saving ? '⏳ Saving…' : '✅ Apply These Prices'}
                    </button>
                  )}
                </div>
              )}
              {saveMsg && (
                <div className={`mt-3 text-sm font-semibold px-3 py-2 rounded ${saveMsg.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {saveMsg.text}
                </div>
              )}
            </div>

            {sold90 === 0 && (
              <div className="text-xs text-gray-400 italic text-center py-2">
                📦 No recorded branch sales in the last 90 days. Pricing is set independently of velocity.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Price List Management Tab ────────────────────────────────────────────────

// Extract all text from a PDF File using pdfjs-dist.
// Groups text items by Y-coordinate into lines, preserving column gaps as spaces.
const PDFJS_VERSION = '5.6.205';
async function extractPdfText(file) {
  // Load pdfjs directly from CDN at runtime — bypasses Vite bundling issues
  // entirely. The /* @vite-ignore */ comment tells Vite not to touch this import.
  const pdfjs = await import(
    /* @vite-ignore */
    `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`
  );

  const getDocument = pdfjs.getDocument ?? pdfjs.default?.getDocument;
  const GlobalWorkerOptions = pdfjs.GlobalWorkerOptions ?? pdfjs.default?.GlobalWorkerOptions;

  if (typeof getDocument !== 'function') {
    throw new Error('pdfjs-dist failed to load from CDN — getDocument is not a function');
  }

  // Worker must also come from CDN (same version, same origin-trust chain)
  GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;
  const allLines = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();

    // Group items by rounded Y position (PDF Y grows upward, so round to integer)
    const byY = {};
    for (const item of content.items) {
      if (!item.str) continue;
      const y = Math.round(item.transform[5]);
      if (!byY[y]) byY[y] = [];
      byY[y].push({ str: item.str, x: item.transform[4], w: item.width || 0 });
    }

    // Sort Y descending so top of page comes first
    const ys = Object.keys(byY).map(Number).sort((a, b) => b - a);

    for (const y of ys) {
      const items = byY[y].sort((a, b) => a.x - b.x);
      let line = '';
      let prevEnd = null;
      let prevStr = '';

      for (const item of items) {
        const isNum = /^\d+(?:\.\d+)?$/.test(item.str.trim());
        const prevIsNum = /^\d+(?:\.\d+)?$/.test(prevStr.trim());

        if (prevEnd !== null) {
          const gap = item.x - prevEnd;
          if (prevIsNum && isNum) {
            // Always separate adjacent numbers with spaces (handles "320390" → "320   390")
            line += '   ';
          } else if (gap >= 8) {
            // Large gap between non-number items → column separator
            line += '   ';
          } else if (gap > 1) {
            line += ' ';
          }
        }
        line += item.str;
        prevEnd = item.x + (item.w > 0 ? item.w : item.str.length * 5);
        prevStr = item.str;
      }

      if (line.trim()) allLines.push(line);
    }
  }

  // Post-process: merge lines that contain ONLY numbers/spaces into the previous line.
  // The Dynapharm PDF places description+CIF on one text row and DP+CP+BV (or CP+BV)
  // on the next (slightly different Y coordinate), so we need to rejoin them before parsing.
  const merged = [];
  for (const line of allLines) {
    if (/^\s*[\d.]+(?:\s+[\d.]+)*\s*$/.test(line) && merged.length > 0) {
      merged[merged.length - 1] += '   ' + line.trim();
    } else {
      merged.push(line);
    }
  }

  return merged.join('\n');
}

// Parse a raw price-list text block into [{description,cif,dp,cp,bv}]
// Supports both:
//   Official 4-column format:  DESCRIPTION   CIF   DP   CP   BV
//   Legacy 3-column format:    DESCRIPTION   DP    CP   BV
function parsePriceListText(text) {
  const results = [];
  const seen = new Set();
  const lines = text.split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Try 4-column format first (official Dynapharm: CIF DP CP BV).
    // The description is separated from the first number by 2+ spaces so we can
    // reliably split even when the description itself contains numbers (e.g. "30's").
    // Accepts decimal values (e.g. 11.5 BV).
    const m4 = line.match(/^(.+?)\s{2,}(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*$/);
    if (m4) {
      const description = m4[1].trim().toUpperCase().replace(/\s+/g, ' ');
      const cif = Math.round(Number(m4[2]));
      const dp  = Math.round(Number(m4[3]));
      const cp  = Math.round(Number(m4[4]));
      const bv  = parseFloat(Number(m4[5]).toFixed(2));
      if (!description || description === 'DESCRIPTION') continue;
      if (isNaN(dp) || isNaN(cp) || isNaN(bv)) continue;
      if (dp <= 0 || cp <= 0) continue;
      if (seen.has(description)) continue;
      seen.add(description);
      results.push({ description, cif, dp, cp, bv });
      continue;
    }

    // Fallback: legacy 3-column format (DP CP BV) — no CIF column.
    // Use GREEDY (.+) so regex takes the longest possible description,
    // then backtracks to find 3 numbers at the end.
    const m3 = line.match(/^(.+)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*$/);
    if (!m3) continue;
    const description = m3[1].trim().toUpperCase().replace(/\s+/g, ' ');
    const dp  = Math.round(Number(m3[2]));
    const cp  = Math.round(Number(m3[3]));
    const bv  = parseFloat(Number(m3[4]).toFixed(2));
    if (!description || description === 'DESCRIPTION') continue;
    if (isNaN(dp) || isNaN(cp) || isNaN(bv)) continue;
    if (dp <= 0 || cp <= 0) continue;
    if (seen.has(description)) continue;
    seen.add(description);
    results.push({ description, cif: 0, dp, cp, bv });
  }
  return results;
}

function PriceListTab() {
  const [rows, setRows] = useState([]);
  const [edits, setEdits] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [alert, setAlert] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newProd, setNewProd] = useState({ description: '', dp: '', cp: '', cif: '', bv: '' });
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importParsed, setImportParsed] = useState([]);
  const [importSaving, setImportSaving] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importTab, setImportTab] = useState('upload');
  const importFileRef = useRef(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState('');
  const [pendingChanges, setPendingChanges] = useState([]);
  const [cifRow, setCifRow] = useState(null);

  const todayStr = new Date().toISOString().slice(0, 10);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.prices.list(),
      api.prices.pending().catch(() => ({ pending: [] })),
    ])
      .then(([data, pData]) => {
        if (Array.isArray(data)) {
          // Deduplicate by normalised description (keep latest updated_at)
          const seen = new Map();
          for (const p of data) {
            const key = (p.description || '').trim().toUpperCase().replace(/\s+/g, ' ');
            const existing = seen.get(key);
            if (!existing || new Date(p.updated_at) > new Date(existing.updated_at)) seen.set(key, p);
          }
          const deduped = [...seen.values()].sort((a, b) => (a.description || '').localeCompare(b.description || ''));
          setRows(deduped);
          setLivePrices(deduped);
        }
        setPendingChanges(Array.isArray(pData?.pending) ? pData.pending : []);
      })
      .catch(() => setAlert({ type: 'error', msg: 'Failed to load prices.' }))
      .finally(() => setLoading(false));
  }, []);

  const openHistory = () => {
    setShowHistory(true);
    setHistoryLoading(true);
    api.prices.history()
      .then(d => setHistory(Array.isArray(d.history) ? d.history : []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  };


  // Compute a CIF final value from breakdown fields
  const computeFinalCif = (row, overrides = {}) => {
    const orig = Number(overrides.original_cif ?? edits[row?.id]?.original_cif ?? row?.original_cif ?? 0);
    const vat = Number(overrides.vat_pct ?? edits[row?.id]?.vat_pct ?? row?.vat_pct ?? 15);
    const duty = Number(overrides.import_duty_pct ?? edits[row?.id]?.import_duty_pct ?? row?.import_duty_pct ?? 0);
    const fee = Number(overrides.clearing_fee ?? edits[row?.id]?.clearing_fee ?? row?.clearing_fee ?? 1);
    if (!orig) return null;
    return +(orig + orig * vat / 100 + orig * duty / 100 + fee).toFixed(2);
  };

  useEffect(() => { load(); }, [load]);

  const setEdit = (id, field, val) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));
  };

  const hasEdits = Object.keys(edits).length > 0;

  const saveAll = async () => {
    setSaving(true);
    setAlert(null);
    const chosenDate = effectiveDate || todayStr;
    const isFuture = chosenDate > todayStr;
    try {
      const updates = Object.entries(edits).map(([id, fields]) => {
        const row = rows.find(r => String(r.id) === String(id)) || {};
        // If original_cif or its breakdown components are edited, recompute final CIF
        const hasCifBreakdown = fields.original_cif !== undefined || fields.vat_pct !== undefined || fields.import_duty_pct !== undefined || fields.clearing_fee !== undefined;
        const computedCif = hasCifBreakdown ? computeFinalCif(row) : null;
        return {
          id: Number(id),
          description: fields.description ?? row.description,
          dp:  Math.round(Number(fields.dp  ?? row.dp))  || 0,
          cp:  Math.round(Number(fields.cp  ?? row.cp))  || 0,
          cif: computedCif !== null ? Math.round(computedCif) : (Math.round(Number(fields.cif ?? row.cif)) || 0),
          bv:  Number((Number(fields.bv ?? row.bv) || 0).toFixed(2)),
          ...(fields.product_code !== undefined ? { product_code: fields.product_code } : {}),
          ...(fields.original_cif !== undefined ? { original_cif: Number(fields.original_cif) } : {}),
          ...(fields.vat_pct !== undefined ? { vat_pct: Number(fields.vat_pct) } : {}),
          ...(fields.import_duty_pct !== undefined ? { import_duty_pct: Number(fields.import_duty_pct) } : {}),
          ...(fields.clearing_fee !== undefined ? { clearing_fee: Number(fields.clearing_fee) } : {}),
        };
      });
      await api.prices.bulkUpdate(updates, chosenDate);
      setEdits({});
      setShowSaveModal(false);
      setEffectiveDate('');
      if (isFuture) {
        setAlert({ type: 'success', msg: `✅ ${updates.length} price change(s) scheduled for ${chosenDate}. Current prices are unchanged until that date.` });
      } else {
        setAlert({ type: 'success', msg: `✅ ${updates.length} product price(s) updated and active immediately.` });
      }
      load();
    } catch {
      setAlert({ type: 'error', msg: 'Failed to save prices. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const addProduct = async () => {
    if (!newProd.description.trim()) return setAlert({ type: 'error', msg: 'Product description is required.' });
    setSaving(true);
    setAlert(null);
    try {
      await api.prices.create({
        description: newProd.description.trim(),
        dp:  Math.round(Number(newProd.dp))  || 0,
        cp:  Math.round(Number(newProd.cp))  || 0,
        cif: Math.round(Number(newProd.cif)) || 0,
        bv:  Number((Number(newProd.bv) || 0).toFixed(2)),
      });
      setShowAdd(false);
      setNewProd({ description: '', dp: '', cp: '', cif: '', bv: '' });
      setAlert({ type: 'success', msg: 'Product added successfully.' });
      load();
    } catch {
      setAlert({ type: 'error', msg: 'Failed to add product.' });
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (id) => {
    if (!window.confirm('Remove this product from the price list?')) return;
    try {
      await api.prices.delete(id);
      setAlert({ type: 'success', msg: 'Product removed.' });
      load();
    } catch {
      setAlert({ type: 'error', msg: 'Failed to delete product.' });
    }
  };

  const handleImportTextChange = (text) => {
    setImportText(text);
    setImportParsed(parsePriceListText(text));
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (isPdf) {
      setImportText('');
      setImportParsed([]);
      setImportLoading(true);
      try {
        const formData = new FormData();
        formData.append('pdf', file);
        const resp = await fetch('/api/gm/extract-pdf', { method: 'POST', body: formData });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error || `Server error ${resp.status}`);
        }
        const { text } = await resp.json();
        handleImportTextChange(text);
      } catch (err) {
        setAlert({ type: 'error', msg: 'Could not read PDF: ' + (err.message || 'Unknown error') });
      } finally {
        setImportLoading(false);
      }
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => handleImportTextChange(ev.target.result || '');
    reader.readAsText(file);
  };

  const confirmImport = async () => {
    if (!importParsed.length) return;
    setImportSaving(true);
    setAlert(null);
    try {
      for (const p of importParsed) {
        await api.prices.create({ description: p.description, cif: p.cif || 0, dp: p.dp, cp: p.cp, bv: p.bv });
      }
      setAlert({ type: 'success', msg: `✅ ${importParsed.length} product price(s) imported successfully.` });
      setShowImport(false);
      setImportText('');
      setImportParsed([]);
      load();
    } catch {
      setAlert({ type: 'error', msg: 'Import failed. Please check the data and try again.' });
    } finally {
      setImportSaving(false);
    }
  };

  const filtered = rows.filter(r =>
    r.description?.toLowerCase().includes(search.toLowerCase())
  );

  const getVal = (row, field) => {
    if (edits[row.id]?.[field] !== undefined) return edits[row.id][field];
    const v = row[field];
    if (field === 'description' || v === null || v === undefined) return v;
    return field === 'bv' ? Number(Number(v).toFixed(2)) : Math.round(Number(v));
  };

  const fieldInput = (row, field, label) => {
    const isBV = field === 'bv';
    return (
      <input
        type="number"
        min="0"
        step={isBV ? '0.01' : '1'}
        value={getVal(row, field)}
        onChange={e => setEdit(row.id, field, e.target.value)}
        onBlur={e => {
          const raw = Number(e.target.value);
          const v = isBV ? Number(raw.toFixed(2)) : Math.round(raw);
          setEdit(row.id, field, isNaN(v) ? 0 : v);
        }}
        className={`w-24 text-right border rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-400 ${edits[row.id]?.[field] !== undefined ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white'}`}
        title={label}
      />
    );
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {alert && (
        <Alert variant={alert.type === 'success' ? 'success' : 'error'} className="mb-2">
          {alert.msg}
        </Alert>
      )}

      <Card>
        <div className="p-4 border-b" style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)' }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">🏦 GM Master Price List</h2>
              <p className="text-xs text-red-100">{rows.length} products &middot; Source of truth for all portals &middot; {hasEdits ? `${Object.keys(edits).length} unsaved change(s)` : 'All changes saved'}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={openHistory}
                className="px-3 py-1.5 text-sm font-semibold rounded shadow"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}
              >
                🕓 Change Log
              </button>
              <button
                onClick={() => { setShowImport(true); setImportText(''); setImportParsed([]); }}
                className="px-3 py-1.5 text-sm font-semibold rounded shadow"
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}
              >
                📋 Import Price List
              </button>
              <button
                onClick={() => setShowAdd(true)}
                className="px-3 py-1.5 bg-white text-red-700 text-sm font-semibold rounded shadow hover:bg-red-50"
              >
                + Add Product
              </button>
              {pendingChanges.length > 0 && (
                <span className="px-2 py-1 text-xs font-semibold rounded" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b' }}>
                  ⏳ {pendingChanges.length} scheduled
                </span>
              )}
              {hasEdits && (
                <button
                  onClick={() => { setEffectiveDate(todayStr); setShowSaveModal(true); }}
                  disabled={saving}
                  className="px-4 py-1.5 bg-amber-400 text-gray-900 text-sm font-bold rounded shadow hover:bg-amber-300 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : `Save ${Object.keys(edits).length} Change(s)…`}
                </button>
              )}
            </div>
          </div>
        </div>

        <CardBody>
          <div className="mb-3">
            <input
              type="text"
              placeholder="Search products…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-xs uppercase" style={{ background: '#f8fafc' }}>
                  <th className="text-left py-2 px-2 border-b text-gray-500" style={{ minWidth: 72 }} title="Product code from official price list">Code</th>
                  <th className="text-left py-2 px-3 border-b text-gray-600">Product Description</th>
                  <th className="text-right py-2 px-3 border-b" style={{ color: '#6b21a8' }} title="Final CIF = original import cost + VAT + import duty + clearing fee. Click 📊 to expand breakdown.">CIF (N$)</th>
                  <th className="text-right py-2 px-3 border-b" style={{ color: '#c41e3a' }} title="Distributor Price — what members &amp; distributors pay">DP (N$)</th>
                  <th className="text-right py-2 px-3 border-b" style={{ color: '#1d4ed8' }} title="Consumer Price — walk-in retail price">CP (N$)</th>
                  <th className="text-right py-2 px-3 border-b text-gray-500" title="Business Volume points">BV</th>
                  <th className="text-right py-2 px-3 border-b" style={{ color: '#15803d' }} title="Gross Profit = DP − CIF">GP (N$)</th>
                  <th className="text-right py-2 px-3 border-b" style={{ color: '#15803d' }} title="Gross Profit Margin % = (DP − CIF) / DP × 100">GP%</th>
                  <th className="text-right py-2 px-3 border-b" style={{ color: '#b45309' }} title="Retail Margin = CP − DP (branch/distributor earn)">Retail+</th>
                  <th className="text-center py-2 px-3 border-b text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={10} className="text-center py-8 text-gray-400">No products found.</td></tr>
                )}
                {filtered.map((row, i) => {
                  const changed = !!edits[row.id];
                  const computedCif = computeFinalCif(row);
                  const cifVal = computedCif !== null ? computedCif : (Number(edits[row.id]?.cif ?? row.cif) || 0);
                  const dpVal  = Number(edits[row.id]?.dp  ?? row.dp)  || 0;
                  const cpVal  = Number(edits[row.id]?.cp  ?? row.cp)  || 0;
                  const gp     = dpVal - cifVal;
                  const gpPct  = dpVal > 0 ? ((gp / dpVal) * 100).toFixed(1) : '—';
                  const retail = cpVal - dpVal;
                  const noCIF  = !row.is_package && cifVal === 0;
                  const pendingForRow = pendingChanges.filter(p => p.product_id === row.id);
                  const cifExpanded = cifRow === row.id;
                  const codeVal = edits[row.id]?.product_code !== undefined ? edits[row.id].product_code : (row.product_code || '');
                  return (
                    <Fragment key={row.id}>
                    <tr className={`border-b hover:bg-gray-50 ${changed ? 'bg-amber-50' : pendingForRow.length > 0 ? 'bg-yellow-50/40' : noCIF ? 'bg-orange-50/60' : row.is_package ? 'bg-blue-50/40' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={codeVal}
                          onChange={e => setEdit(row.id, 'product_code', e.target.value)}
                          placeholder="—"
                          maxLength={20}
                          className={`w-20 text-xs border rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-red-400 font-mono ${edits[row.id]?.product_code !== undefined ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white text-gray-500'}`}
                          title="Product code (e.g. NB1201)"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-800">{row.description}</span>
                          {row.is_package && <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: '#dbeafe', color: '#1d4ed8' }}>📦 Package</span>}
                          {noCIF && <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: '#ffedd5', color: '#c2410c' }} title="CIF is 0 — set the import cost for accurate profit and remittance calculations">⚠ No CIF</span>}
                          {changed && <span className="text-xs text-amber-600 font-semibold">&bull; unsaved</span>}
                          {pendingForRow.map(p => (
                            <span key={p.id} className="text-xs px-1.5 py-0.5 rounded font-semibold" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b' }} title={`New prices take effect ${p.effective_from}`}>
                              ⏳ from {p.effective_from}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {row.is_package ? (
                            <span className="text-xs text-gray-400 italic">bundle</span>
                          ) : (
                            <>
                              {fieldInput(row, 'cif', 'Final CIF — can also expand breakdown via 📊 to compute from original import cost + VAT + duty + clearing')}
                              <button
                                onClick={() => setCifRow(cifExpanded ? null : row.id)}
                                className="text-xs px-1 py-0.5 rounded hover:bg-purple-100"
                                style={{ color: '#6b21a8' }}
                                title="Expand CIF breakdown: original import cost, VAT%, import duty%, clearing fee"
                              >📊</button>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right">{fieldInput(row, 'dp', 'Distributor Price — what members & distributors pay')}</td>
                      <td className="py-2 px-2 text-right">{fieldInput(row, 'cp', 'Consumer Price — walk-in retail price')}</td>
                      <td className="py-2 px-2 text-right">{fieldInput(row, 'bv', 'Business Volume points (supports 2 decimal places)')}</td>
                      <td className="py-2 px-2 text-right">
                        {row.is_package ? <span className="text-xs text-gray-400 italic">—</span> : (
                          <span className={`text-xs font-semibold ${gp > 0 ? 'text-green-700' : 'text-red-600'}`}>
                            {gp > 0 ? '+' : ''}{gp.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {row.is_package ? <span className="text-xs text-gray-400 italic">—</span> : (
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${gp > 0 ? 'bg-green-100 text-green-700' : cifVal === 0 ? 'bg-orange-100 text-orange-600' : 'bg-red-100 text-red-600'}`}>
                            {cifVal === 0 ? '? %' : `${gpPct}%`}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <span className={`text-xs font-semibold ${retail > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                          {retail > 0 ? `+${retail.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : retail === 0 ? '—' : retail.toFixed(0)}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center">
                        {row.is_package ? (
                          <span className="text-xs text-blue-400 italic">auto-seeded</span>
                        ) : (
                          <button onClick={() => deleteRow(row.id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50">Remove</button>
                        )}
                      </td>
                    </tr>
                    {/* CIF Breakdown expanded row */}
                    {cifExpanded && !row.is_package && (
                      <tr style={{ background: '#faf5ff', borderBottom: '1px solid #e9d5ff' }}>
                        <td colSpan={10} className="px-4 py-3">
                          <div className="flex flex-wrap items-end gap-4">
                            <div className="text-xs font-bold" style={{ color: '#6b21a8' }}>📊 CIF Breakdown — {row.description}</div>
                            <div className="flex flex-wrap items-end gap-3">
                              <label className="flex flex-col gap-0.5">
                                <span className="text-xs text-gray-500">Original CIF (N$)</span>
                                <input
                                  type="number" min="0" step="0.01"
                                  value={edits[row.id]?.original_cif ?? (row.original_cif ?? '')}
                                  placeholder="e.g. 120"
                                  onChange={e => setEdit(row.id, 'original_cif', e.target.value)}
                                  className="w-28 text-sm border border-purple-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-400"
                                />
                              </label>
                              <label className="flex flex-col gap-0.5">
                                <span className="text-xs text-gray-500">VAT %</span>
                                <input
                                  type="number" min="0" max="100" step="0.5"
                                  value={edits[row.id]?.vat_pct ?? (row.vat_pct ?? 15)}
                                  onChange={e => setEdit(row.id, 'vat_pct', e.target.value)}
                                  className="w-20 text-sm border border-purple-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-400"
                                />
                              </label>
                              <label className="flex flex-col gap-0.5">
                                <span className="text-xs text-gray-500">Import Duty %</span>
                                <input
                                  type="number" min="0" max="100" step="0.5"
                                  value={edits[row.id]?.import_duty_pct ?? (row.import_duty_pct ?? 0)}
                                  onChange={e => setEdit(row.id, 'import_duty_pct', e.target.value)}
                                  className="w-20 text-sm border border-purple-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-400"
                                />
                              </label>
                              <label className="flex flex-col gap-0.5">
                                <span className="text-xs text-gray-500">Clearing Fee (N$)</span>
                                <input
                                  type="number" min="0" step="0.5"
                                  value={edits[row.id]?.clearing_fee ?? (row.clearing_fee ?? 1)}
                                  onChange={e => setEdit(row.id, 'clearing_fee', e.target.value)}
                                  className="w-24 text-sm border border-purple-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-400"
                                />
                              </label>
                            </div>
                            {computeFinalCif(row) !== null && (
                              <div className="flex items-center gap-2 ml-2">
                                <span className="text-xs text-gray-500">Computed Final CIF:</span>
                                <span className="text-sm font-bold px-2 py-0.5 rounded" style={{ background: '#ede9fe', color: '#6b21a8' }}>
                                  N${computeFinalCif(row)?.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                {computeFinalCif(row) !== cifVal && (
                                  <span className="text-xs text-amber-600 font-semibold">
                                    ↳ will update CIF from N${cifVal} on save
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="text-xs text-gray-400 italic ml-auto">
                              Formula: Original + (Original × VAT%) + (Original × Duty%) + Clearing Fee
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">
            <span><strong style={{ color: '#6b21a8' }}>CIF</strong> = Final landed cost (original import + VAT + duty + clearing). Click 📊 to edit breakdown.</span>
            <span><strong style={{ color: '#c41e3a' }}>DP</strong> = Distributor / Member Price</span>
            <span><strong style={{ color: '#1d4ed8' }}>CP</strong> = Consumer / Walk-in Price</span>
            <span><strong style={{ color: '#15803d' }}>GP%</strong> = Gross Profit Margin (DP−CIF)/DP</span>
            <span><strong style={{ color: '#b45309' }}>Retail+</strong> = Branch/Distributor Margin (CP−DP)</span>
            <span className="text-orange-600">⚠ No CIF = set import cost for accurate profit &amp; remittance</span>
          </div>
        </CardBody>
      </Card>

      <Modal open={showImport} title="Import Price List" onClose={() => { setShowImport(false); setImportText(''); setImportParsed([]); setImportTab('upload'); }}>
        <div style={{ width: '100%', maxWidth: 640, boxSizing: 'border-box', padding: '0 4px 4px' }}>

          {/* Tab switcher */}
          <div style={{ display: 'flex', borderBottom: '2px solid #f1f5f9', marginBottom: 20 }}>
            {[['upload', '📎', 'Upload File'], ['paste', '📝', 'Paste Text']].map(([key, icon, label]) => (
              <button
                key={key}
                onClick={() => setImportTab(key)}
                style={{
                  padding: '10px 20px', fontSize: '0.85rem', fontWeight: 700, border: 'none', background: 'none',
                  cursor: 'pointer', borderBottom: importTab === key ? '2px solid #c41e3a' : '2px solid transparent',
                  color: importTab === key ? '#c41e3a' : '#64748b', marginBottom: -2, transition: 'all 0.15s'
                }}
              >{icon} {label}</button>
            ))}
          </div>

          {/* Upload tab */}
          {importTab === 'upload' && (
            <label
              htmlFor="priceListImportFile"
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                minHeight: 160, borderRadius: 14, cursor: importLoading ? 'default' : 'pointer',
                background: importLoading ? '#f8fafc' : 'linear-gradient(135deg,#fff5f5,#fff)',
                border: '2px dashed ' + (importLoading ? '#cbd5e1' : '#fca5a5'),
                transition: 'all 0.2s', gap: 8, padding: 24
              }}
            >
              {importLoading ? (
                <>
                  <div style={{ fontSize: '2.4rem', lineHeight: 1 }}>⏳</div>
                  <div style={{ fontWeight: 700, color: '#374151', fontSize: '0.95rem' }}>Reading PDF…</div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Extracting product data, please wait</div>
                </>
              ) : (
                <>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem' }}>📄</div>
                  <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>Tap to select price list file</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['PDF', 'TXT', 'CSV'].map(ext => (
                      <span key={ext} style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: ext === 'PDF' ? '#fef2f2' : '#f1f5f9', color: ext === 'PDF' ? '#c41e3a' : '#475569', border: '1px solid ' + (ext === 'PDF' ? '#fecaca' : '#e2e8f0') }}>{ext}</span>
                    ))}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>Official Dynapharm format · DESCRIPTION · CIF · DP · CP · BV</div>
                </>
              )}
              <input id="priceListImportFile" ref={importFileRef} type="file" accept=".pdf,.txt,.csv" style={{ display: 'none' }} onChange={handleImportFile} disabled={importLoading} />
            </label>
          )}

          {/* Paste tab */}
          {importTab === 'paste' && (
            <div>
              <textarea
                value={importText}
                onChange={e => handleImportTextChange(e.target.value)}
                rows={9}
                placeholder={"GREEN TEA CAPSULE 30's  90  195 254 43\nBEE POLLEN CAPSULE (100's)  158  320 390 75\nSPIRULINA 30's  95  180 235 40\n..."}
                style={{ width: '100%', boxSizing: 'border-box', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', fontSize: '0.78rem', fontFamily: 'monospace', resize: 'vertical', outline: 'none', lineHeight: 1.7, color: '#1e293b', background: '#f8fafc' }}
                onFocus={e => { e.target.style.borderColor = '#c41e3a'; e.target.style.boxShadow = '0 0 0 3px rgba(196,30,58,0.08)'; }}
                onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.boxShadow = 'none'; }}
              />
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 6 }}>Each line: product name (2+ spaces) then CIF, DP, CP, BV — or just DP, CP, BV for legacy format</div>
            </div>
          )}

          {/* Results */}
          {importParsed.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ background: '#dcfce7', color: '#15803d', fontWeight: 700, fontSize: '0.8rem', padding: '4px 12px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 5 }}>
                  ✓ {importParsed.length} products detected
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  {importParsed.filter(p => rows.some(r => r.description?.toUpperCase() === p.description)).length} updates · {importParsed.filter(p => !rows.some(r => r.description?.toUpperCase() === p.description)).length} new
                </div>
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                      <th style={{ textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#374151' }}>Product</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#374151' }}>CIF</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#374151' }}>DP</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#374151' }}>CP</th>
                      <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #e2e8f0', fontWeight: 700, color: '#374151' }}>BV</th>
                      <th style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {importParsed.map((p, i) => {
                      const exists = rows.some(r => r.description?.toUpperCase() === p.description);
                      return (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td style={{ padding: '6px 12px', fontWeight: 500, color: '#1e293b', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: '#64748b' }}>{p.cif > 0 ? p.cif : '—'}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{p.dp}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{p.cp}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', color: '#374151' }}>{p.bv}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: exists ? '#fef9c3' : '#f0fdf4', color: exists ? '#854d0e' : '#15803d' }}>
                              {exists ? 'update' : 'new'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Parse error */}
          {importText.trim() && importParsed.length === 0 && !importLoading && (
            <div style={{ marginTop: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', fontSize: '0.82rem', color: '#b91c1c', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: '1.1rem', lineHeight: 1.3 }}>⚠️</span>
              <span>No products detected. Check that each line has the product name followed by three numbers (DP, CP, BV).</span>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
            <button
              onClick={confirmImport}
              disabled={importSaving || importParsed.length === 0}
              style={{
                flex: 1, padding: '11px 16px', borderRadius: 10, border: 'none', cursor: importParsed.length === 0 ? 'not-allowed' : 'pointer',
                background: importParsed.length === 0 ? '#e2e8f0' : 'linear-gradient(135deg,#c41e3a,#9b1730)',
                color: importParsed.length === 0 ? '#94a3b8' : '#fff', fontWeight: 700, fontSize: '0.88rem',
                transition: 'all 0.15s', boxShadow: importParsed.length === 0 ? 'none' : '0 2px 8px rgba(196,30,58,0.25)'
              }}
            >
              {importSaving ? `Importing…` : importParsed.length === 0 ? 'No products detected' : `Import ${importParsed.length} Product${importParsed.length !== 1 ? 's' : ''}`}
            </button>
            <button
              onClick={() => { setShowImport(false); setImportText(''); setImportParsed([]); setImportTab('upload'); }}
              style={{ padding: '11px 20px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}
            >Cancel</button>
          </div>
        </div>
      </Modal>

      <Modal open={showAdd} title="Add New Product" onClose={() => setShowAdd(false)}>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product Description *</label>
              <input
                type="text"
                value={newProd.description}
                onChange={e => setNewProd(p => ({ ...p, description: e.target.value }))}
                placeholder="Enter full product name"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[['cif','CIF (N$)'],['dp','DP (N$)'],['cp','CP (N$)'],['bv','BV']].map(([f, lbl]) => (
                <div key={f}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{lbl}</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={newProd[f]}
                    onChange={e => setNewProd(p => ({ ...p, [f]: e.target.value }))}
                    onBlur={e => { const v = Math.round(Number(e.target.value)); setNewProd(p => ({ ...p, [f]: isNaN(v) ? '' : v })); }}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                onClick={addProduct}
                disabled={saving}
                className="px-4 py-2 rounded text-sm font-semibold text-white"
                style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)' }}
              >
                {saving ? 'Adding…' : 'Add Product'}
              </button>
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded text-sm border border-gray-300 text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </Modal>

      {/* Save price changes modal — lets GM choose when new prices take effect */}
      <Modal open={showSaveModal} title="💾 Save Price Changes" onClose={() => { setShowSaveModal(false); setEffectiveDate(''); }}>
        <div style={{ minWidth: 340, padding: '4px 4px 8px' }}>
          <p className="text-sm text-gray-700 mb-4">
            You have <strong>{Object.keys(edits).length}</strong> price change(s) pending. Choose when the new prices should take effect across all portals and sales.
          </p>
          <div className="mb-4">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Effective From Date</label>
            <input
              type="date"
              value={effectiveDate || todayStr}
              min={todayStr}
              onChange={e => setEffectiveDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            />
            {effectiveDate && effectiveDate > todayStr ? (
              <p className="text-xs text-amber-700 mt-2 bg-amber-50 rounded px-3 py-2 border border-amber-200">
                ⏳ <strong>Scheduled:</strong> Current prices will remain active until <strong>{effectiveDate}</strong>. On that date the system will automatically apply the new prices.
              </p>
            ) : (
              <p className="text-xs text-green-700 mt-2 bg-green-50 rounded px-3 py-2 border border-green-200">
                ✅ <strong>Immediate:</strong> New prices will be applied right now and affect all future sales immediately.
              </p>
            )}
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => { setShowSaveModal(false); setEffectiveDate(''); }} className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200">Cancel</button>
            <button
              onClick={saveAll}
              disabled={saving}
              className="px-5 py-2 text-sm font-bold rounded shadow disabled:opacity-60"
              style={{ background: effectiveDate && effectiveDate > todayStr ? '#f59e0b' : '#c41e3a', color: '#fff' }}
            >
              {saving ? 'Saving…' : effectiveDate && effectiveDate > todayStr ? `⏳ Schedule for ${effectiveDate}` : '✅ Apply Now'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={showHistory} title="🕓 Price Change Log" onClose={() => setShowHistory(false)} size="xl">
        <div className="p-4 space-y-4" style={{ minWidth: 320 }}>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="text"
              placeholder="Search product…"
              value={historySearch}
              onChange={e => setHistorySearch(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-red-300"
              style={{ minWidth: 180 }}
            />
            <span className="text-xs text-gray-400">
              {historyLoading ? 'Loading…' : `${history.length} change${history.length !== 1 ? 's' : ''} recorded`}
            </span>
          </div>
          {historyLoading ? (
            <div className="text-center py-8 text-gray-400">Loading history…</div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <div className="text-3xl mb-2">🕓</div>
              <div className="font-semibold text-gray-500">No price changes recorded yet</div>
              <div className="text-xs text-gray-400 mt-1">Changes will appear here the next time a price is saved.</div>
            </div>
          ) : (
            <div className="overflow-x-auto" style={{ maxHeight: 480, overflowY: 'auto' }}>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
                    <th className="text-left py-2 px-3 border-b text-gray-600 font-semibold">Date & Time</th>
                    <th className="text-left py-2 px-3 border-b text-gray-600 font-semibold">Product</th>
                    <th className="text-left py-2 px-3 border-b text-gray-600 font-semibold">Changed By</th>
                    <th className="text-left py-2 px-2 border-b text-gray-600 font-semibold">Effective From</th>
                    <th className="text-left py-2 px-2 border-b text-gray-600 font-semibold">Status</th>
                    <th className="text-center py-2 px-2 border-b font-semibold" style={{ color: '#6b21a8' }}>CIF Before→After</th>
                    <th className="text-center py-2 px-2 border-b font-semibold" style={{ color: '#c41e3a' }}>DP Before→After</th>
                    <th className="text-center py-2 px-2 border-b font-semibold" style={{ color: '#1d4ed8' }}>CP Before→After</th>
                    <th className="text-center py-2 px-2 border-b font-semibold" style={{ color: '#374151' }}>BV Before→After</th>
                  </tr>
                </thead>
                <tbody>
                  {history
                    .filter(h => !historySearch || h.description?.toLowerCase().includes(historySearch.toLowerCase()))
                    .map((h, i) => {
                      const fmtN = v => v != null ? Number(v).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '—';
                      const diff = (a, b) => Number(a) !== Number(b);
                      const arrow = (old, nw, color) => (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ color: '#6b7280' }}>{fmtN(old)}</span>
                          <span style={{ color: '#9ca3af', fontSize: '0.65rem' }}>→</span>
                          <span style={{ color: diff(old, nw) ? color : '#6b7280', fontWeight: diff(old, nw) ? 700 : 400 }}>{fmtN(nw)}</span>
                          {diff(old, nw) && Number(nw) > Number(old) && <span style={{ fontSize: '0.6rem', color: '#15803d' }}>▲</span>}
                          {diff(old, nw) && Number(nw) < Number(old) && <span style={{ fontSize: '0.6rem', color: '#dc2626' }}>▼</span>}
                        </span>
                      );
                      const changed_at = h.changed_at ? new Date(h.changed_at) : null;
                      const dateStr = changed_at ? changed_at.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                      const timeStr = changed_at ? changed_at.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '';
                      return (
                        <tr key={h.id} className={`border-b ${h.status === 'pending' ? 'bg-amber-50/60' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-blue-50/30`}>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <div className="font-medium text-gray-700">{dateStr}</div>
                            <div className="text-gray-400">{timeStr}</div>
                          </td>
                          <td className="py-2 px-3 font-medium text-gray-800" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.description}</td>
                          <td className="py-2 px-3 text-gray-500">{h.changed_by || '—'}</td>
                          <td className="py-2 px-2 whitespace-nowrap">
                            <span className="text-gray-700">{h.effective_from ? String(h.effective_from).slice(0, 10) : '—'}</span>
                          </td>
                          <td className="py-2 px-2">
                            {h.status === 'pending' ? (
                              <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b' }}>⏳ Pending</span>
                            ) : (
                              <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}>✓ Applied</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center">{arrow(h.old_cif, h.new_cif, '#6b21a8')}</td>
                          <td className="py-2 px-2 text-center">{arrow(h.old_dp, h.new_dp, '#c41e3a')}</td>
                          <td className="py-2 px-2 text-center">{arrow(h.old_cp, h.new_cp, '#1d4ed8')}</td>
                          <td className="py-2 px-2 text-center">{arrow(h.old_bv, h.new_bv, '#374151')}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ── Statements Upload Tab ─────────────────────────────────────────────────
function StatementsUploadTab() {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [alert, setAlert] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [monthLabel, setMonthLabel] = useState('');
  const fileRef = useRef(null);

  const load = () => {
    setLoading(true);
    api.statements.listMonths()
      .then(r => setUploads(r.months || []))
      .catch(() => setAlert({ type: 'error', msg: 'Failed to load uploads.' }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const nameMonth = file.name.match(/(\d{4})[-_](\d{2})/);
    if (nameMonth) setMonthLabel(`${nameMonth[1]}-${nameMonth[2]}`);
    const reader = new FileReader();
    reader.onload = ev => setFileContent(ev.target.result || '');
    reader.readAsText(file, 'utf-8');
  };

  const handleUpload = async () => {
    if (!fileContent) return setAlert({ type: 'error', msg: 'Please select a statement text file first.' });
    if (!monthLabel || !/^\d{4}-\d{2}$/.test(monthLabel)) {
      return setAlert({ type: 'error', msg: 'Enter the month in YYYY-MM format (e.g. 2026-03).' });
    }
    setUploading(true);
    setAlert(null);
    try {
      const [yr, mo] = monthLabel.split('-').map(Number);
      const humanLabel = new Date(yr, mo - 1, 1).toLocaleString('en-NA', { month: 'long', year: 'numeric' });
      const result = await api.statements.upload(fileContent, monthLabel, humanLabel);
      setAlert({ type: 'success', msg: `Uploaded — ${result.count} distributor sections found for ${humanLabel}.` });
      setFileContent('');
      setFileName('');
      setMonthLabel('');
      if (fileRef.current) fileRef.current.value = '';
      load();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message || 'Upload failed.' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (month, label) => {
    if (!window.confirm(`Delete the ${label || month} statement? Distributors will no longer be able to view it.`)) return;
    try {
      await api.statements.delete(month);
      setAlert({ type: 'success', msg: `${label || month} statement deleted.` });
      load();
    } catch {
      setAlert({ type: 'error', msg: 'Failed to delete.' });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <span>📤</span> Upload Monthly Bonus Statement
          </h3>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-gray-500 mb-4">
            Upload the monthly Dynapharm bonus statement text file. Each distributor will automatically see only their own section.
            The file must be the standard <strong>DYNAPHARM INT&apos;L</strong> statement format (.txt).
          </p>
          {alert && (
            <div className={`mb-4 p-3 rounded-lg text-sm font-medium ${alert.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {alert.msg}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Statement File (.txt)</label>
              <input ref={fileRef} type="file" accept=".txt,text/plain" onChange={handleFile}
                className="block w-full text-sm text-gray-700 border border-gray-300 rounded-lg px-3 py-2 bg-white file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer" />
              {fileName && <p className="text-xs text-gray-400 mt-1">Selected: {fileName}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Month (YYYY-MM)</label>
              <input type="month" value={monthLabel} onChange={e => setMonthLabel(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
          </div>
          <button onClick={handleUpload} disabled={uploading || !fileContent}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm">
            {uploading ? '⏳ Processing…' : '📤 Upload Statement'}
          </button>
          {fileContent && !uploading && (
            <p className="mt-2 text-xs text-green-600 font-medium">✓ File loaded ({(fileContent.length / 1024).toFixed(1)} KB) — ready to upload</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <span>📋</span> Uploaded Statements
          </h3>
        </CardHeader>
        {loading ? <CardBody><LoadingSpinner /></CardBody> : (
          uploads.length === 0 ? (
            <CardBody>
              <p className="text-center text-gray-400 py-6 text-sm">No statements uploaded yet.</p>
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Period</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Distributors</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Uploaded By</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Uploaded At</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {uploads.map(u => (
                    <tr key={u.month} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-semibold">{u.label || u.month}</td>
                      <td className="px-4 py-3 text-gray-600">{u.total_sections?.toLocaleString() || '—'} distributors</td>
                      <td className="px-4 py-3 text-gray-600 capitalize">{u.uploaded_by || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{u.uploaded_at ? new Date(u.uploaded_at).toLocaleString('en-NA') : '—'}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleDelete(u.month, u.label)}
                          className="text-xs text-red-600 hover:text-red-800 font-semibold px-2 py-1 rounded hover:bg-red-50 transition-colors">
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </Card>

    </div>
  );
}


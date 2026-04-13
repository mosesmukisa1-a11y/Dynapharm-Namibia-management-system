import { useState, useEffect, useCallback, useRef } from 'react';
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
import StaffMessagesTab from '../../components/StaffMessagesTab';

export default function GMPortal() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [pendingAdj, setPendingAdj] = useState(0);

  useEffect(() => {
    api.get('/stock-adjustments?status=pending')
      .then(d => setPendingAdj(Array.isArray(d) ? d.length : 0))
      .catch(() => {});
  }, []);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'approvals', label: 'Approvals', icon: '✅' },
    { id: 'stockAdjustments', label: pendingAdj > 0 ? `Stock Edits (${pendingAdj})` : 'Stock Edits', icon: '✏️' },
    { id: 'priceList', label: 'Price List', icon: '💲' },
    { id: 'campaigns', label: 'Campaigns', icon: '📢' },
    { id: 'profitAnalysis', label: 'Profit Analysis', icon: '💰' },
    { id: 'accounts', label: 'Accounts', icon: '📒' },
    { id: 'bonus', label: 'Bonus History', icon: '🎁' },
    { id: 'communication', label: 'Communication', icon: '💬' },
    { id: 'staff', label: 'Staff Services', icon: '👤' },
    { id: 'messages', label: 'My Messages', icon: '📨' },
    { id: 'distributors', label: 'Distributor Performance', icon: '👥' },
  ];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">GM Portal</h1>
        <p className="text-sm text-gray-500">Country-wide oversight, approvals, and strategic management</p>
      </div>
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'approvals' && <ApprovalsTab />}
        {activeTab === 'stockAdjustments' && <StockAdjustmentsTab onCountChange={setPendingAdj} />}
        {activeTab === 'priceList' && <PriceListTab />}
        {activeTab === 'campaigns' && <CampaignsTab />}
        {activeTab === 'profitAnalysis' && <ProfitAnalysisTab />}
        {activeTab === 'accounts' && <AccountsTab role="gm" />}
        {activeTab === 'bonus' && <BonusHistoryTab />}
        {activeTab === 'communication' && <CommunicationTab />}
        {activeTab === 'staff' && <StaffTab />}
        {activeTab === 'messages' && <StaffMessagesTab accentColor="#7c3aed" />}
        {activeTab === 'distributors' && <DistributorPerformanceTab title="Distributor Performance — All Branches" />}
      </div>
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
          <button onClick={load} style={{ padding: '7px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 99, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>
            🔄 Refresh
          </button>
        </div>
      </div>

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
  const [gmSummary, setGmSummary] = useState(null);

  const appliedRangeRef = useRef({ start: firstOfMonth, end: today });

  const refreshGmSummary = useCallback((start, end) => {
    api.gm.summary({ startDate: start, endDate: end })
      .then(d => { if (d && d.success) setGmSummary(d); })
      .catch(() => {});
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

  if (loading) return <LoadingSpinner />;

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

  const kpiCards = [
    { label: 'Total Sales', value: formatCurrency(totalRevenue), icon: '💰', gradient: 'linear-gradient(135deg, #43e97b, #38f9d7)' },
    { label: 'CIF Cost of Sales', value: formatCurrency(totalCIFCost), icon: '🚢', gradient: 'linear-gradient(135deg, #f093fb, #f5576c)' },
    { label: 'Gross Profit', value: formatCurrency(grossProfit), icon: '📊', gradient: grossProfit >= 0 ? 'linear-gradient(135deg, #43e97b, #38f9d7)' : 'linear-gradient(135deg, #f5576c, #f093fb)' },
    { label: 'Remittance Due', value: formatCurrency(Math.max(0, remittanceDue)), icon: '📦', gradient: remittanceDue > 0 ? 'linear-gradient(135deg, #fa709a, #fee140)' : 'linear-gradient(135deg, #43e97b, #38f9d7)' },
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
            <div className="flex gap-4 text-xs text-gray-500">
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
        <StatCard title="Total Orders" value={data.orders.length} color="green" icon={<DollarSign size={24} />} />
        <StatCard title="Active Branches" value={data.branches.length} color="purple" icon={<Users size={24} />} />
        <StatCard title="Products" value={data.products.length} color="orange" icon={<Package size={24} />} />
        <StatCard title="Total BV Points" value={totalBV.toLocaleString()} color="teal" icon={<TrendingUp size={24} />} />
      </div>

      <Card className="mb-6 bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200">
        <CardBody>
          <h3 className="font-bold text-emerald-900 mb-3">Profit & Loss Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/80 rounded-lg p-3">
              <p className="text-xs text-gray-500">Total Revenue (DP)</p>
              <p className="text-lg font-bold text-blue-700">{formatCurrency(totalDPRevenue)}</p>
            </div>
            <div className="bg-white/80 rounded-lg p-3">
              <p className="text-xs text-gray-500">Total CIF Cost</p>
              <p className="text-lg font-bold text-red-600">{formatCurrency(totalCIFCost)}</p>
            </div>
            <div className="bg-white/80 rounded-lg p-3">
              <p className="text-xs text-gray-500">Gross Profit</p>
              <p className={`text-lg font-bold ${grossProfit >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatCurrency(grossProfit)}</p>
            </div>
            <div className="bg-white/80 rounded-lg p-3">
              <p className="text-xs text-gray-500">Margin %</p>
              <p className="text-lg font-bold text-purple-700">{totalDPRevenue > 0 ? ((grossProfit / totalDPRevenue) * 100).toFixed(1) : '0'}%</p>
            </div>
          </div>
          <p className="text-xs text-emerald-600 mt-2 font-medium">
            Profit = DP Selling Price - CIF Cost (actual cost from Malaysia import)
          </p>
        </CardBody>
      </Card>

      {remittanceDue > 0 && (
        <Alert type="warning" className="mb-6">
          <strong>Remittance Due:</strong> {formatCurrency(remittanceDue)} — CIF cost of goods sold exceeds deposits received. Coordinate with Finance for remittance to supplier.
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
  const [pettyCashRequests, setPettyCashRequests] = useState([]);
  const [rentEditRequests, setRentEditRequests] = useState([]);
  const [salaryEditRequests, setSalaryEditRequests] = useState([]);
  const [casRequests, setCasRequests] = useState([]);
  const [casModal, setCasModal] = useState(null);
  const [casNote, setCasNote] = useState('');
  const [adminLeaveRequests, setAdminLeaveRequests] = useState([]);
  const [leaveApprovalModal, setLeaveApprovalModal] = useState(null);
  const [leaveApprovalNote, setLeaveApprovalNote] = useState('');
  const [bonusDeleteRequests, setBonusDeleteRequests] = useState([]);
  const [bonusDeleteModal, setBonusDeleteModal] = useState(null);
  const [bonusDeleteNote, setBonusDeleteNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [noteModal, setNoteModal] = useState(null);
  const [note, setNote] = useState('');
  const [viewDispatch, setViewDispatch] = useState(null);
  const [amendModal, setAmendModal] = useState(null);
  const [amendItems, setAmendItems] = useState([]);
  const [amendComment, setAmendComment] = useState('');
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

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.branch.cashMovements().then(d => Array.isArray(d) ? d : d.movements || []).catch(() => []),
      api.get('/hr/leaves?status=pending').then(d => Array.isArray(d) ? d : d.leaves || []).catch(() => []),
      api.stock.requests().then(d => Array.isArray(d) ? d : d.requests || []).catch(() => []),
      api.stock.transfers('status=pending_approval').then(d => Array.isArray(d) ? d : d.transfers || []).catch(() => []),
      api.get('/field_program_requests').then(d => Array.isArray(d) ? d : d.requests || []).catch(() => []),
      api.finance.pettyCash.requests().then(d => d.requests || []).catch(() => []),
      api.finance.rent.editRequests('pending').then(d => d.requests || []).catch(() => []),
      api.hr.salaryLedger.editRequests('pending').then(d => d.requests || []).catch(() => []),
      api.get('/cash-requests/admin?status=finance_reviewed').then(d => Array.isArray(d) ? d : []).catch(() => []),
      api.get('/leave-requests/admin?status=pending').then(d => Array.isArray(d) ? d : []).catch(() => []),
      api.finance.getBonusPeriodDeleteRequests('pending_gm').then(d => d.requests || []).catch(() => []),
    ]).then(([cash, leaves, stock, transfers, fieldReqs, pcReqs, rentReqs, salaryReqs, casReqs, adminLeaves, bonusDelReqs]) => {
      setCashRequests(cash.filter(c => c.status === 'pending'));
      setLeaveRequests(leaves.filter(l => l.status === 'pending'));
      setStockRequests(stock.filter(s => s.status === 'pending'));
      setPendingTransfers(transfers);
      setFieldRequests(fieldReqs.filter(r => r.status === 'pending'));
      setPettyCashRequests(pcReqs.filter(r => r.status === 'pending_gm'));
      setRentEditRequests(rentReqs);
      setSalaryEditRequests(salaryReqs);
      setCasRequests(casReqs);
      setAdminLeaveRequests(adminLeaves);
      setBonusDeleteRequests(bonusDelReqs);
    }).finally(() => setLoading(false));
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
        setFieldRequests(prev => prev.filter(r => r.id !== id));
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

  const handleAmendApprove = async () => {
    if (!amendModal) return;
    setProcessing(true);
    try {
      const gmName = user?.full_name || user?.username || 'GM';
      const originalItems = amendModal.items || [];
      const amendmentLog = amendItems.map((ai, i) => {
        const orig = originalItems[i];
        if (orig && Number(ai.quantityApproved) !== Number(orig.quantity)) {
          return { product: ai.productName, originalQty: orig.quantity, approvedQty: ai.quantityApproved, removed: Number(ai.quantityApproved) === 0 };
        }
        return null;
      }).filter(Boolean);

      const updatedItems = amendItems.filter(it => Number(it.quantityApproved) > 0).map(it => ({
        ...it,
        quantity: it.quantity,
        quantityApproved: Number(it.quantityApproved),
      }));

      await api.stock.updateTransfer(amendModal.id, {
        status: 'approved',
        approved_by: gmName,
        gmAction: 'amend_approve',
        gmComment: amendComment || 'Amended and approved',
        notes: amendComment || 'Amended and approved by GM',
        items: updatedItems,
        amendmentLog,
      });

      setPendingTransfers(prev => prev.filter(r => r.id !== amendModal.id));
      setMessage('✅ Transfer amended and approved. Author has been notified of changes.');
      setAmendModal(null);
      setAmendItems([]);
      setAmendComment('');
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

  const openAmendModal = (t) => {
    const items = (t.items || []).map(it => ({
      ...it,
      quantityApproved: it.quantity,
    }));
    setAmendItems(items);
    setAmendComment('');
    setAmendModal(t);
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
        ? `✅ Cash advance approved for ${casModal.staff_name || casModal.requested_by} — N$ ${Number(casModal.amount).toFixed(2)}.`
        : `❌ Cash advance request rejected.`;
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
      setAdminLeaveRequests(prev => prev.filter(r => r.id !== leaveApprovalModal.id));
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
    { id: 'fieldstock', label: `🌿 Field Stock${fieldRequests.length > 0 ? ` (${fieldRequests.length})` : ''}` },
    { id: 'all', label: `All Requests${totalCount > 0 ? ` (${totalCount})` : ''}` },
    { id: 'petty_cash', label: `💵 Petty Cash${pettyCashRequests.length > 0 ? ` (${pettyCashRequests.length})` : ''}` },
    { id: 'rent_edits', label: `🏘️ Rent Edits${rentEditRequests.length > 0 ? ` (${rentEditRequests.length})` : ''}` },
    { id: 'salary_edits', label: `💼 Salary Edits${salaryEditRequests.length > 0 ? ` (${salaryEditRequests.length})` : ''}` },
    { id: 'cas_approvals', label: `💵 CAS Approvals${casRequests.length > 0 ? ` (${casRequests.length})` : ''}` },
    { id: 'leave_approvals', label: `📅 Leave Approvals${adminLeaveRequests.length > 0 ? ` (${adminLeaveRequests.length})` : ''}` },
    { id: 'bonus_delete', label: `🗑️ Bonus Deletions${bonusDeleteRequests.length > 0 ? ` (${bonusDeleteRequests.length})` : ''}` },
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
                    {r.createdBy || r.employee_name || r.requested_by || r.user || '—'}
                    {(r.requestingBranch || r.branch || r.requesting_branch) && <span className="ml-2 text-xs text-gray-400 font-normal">({r.requestingBranch || r.branch || r.requesting_branch})</span>}
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

                        {Array.isArray(t.destinationBranchStaff) && t.destinationBranchStaff.length > 0 && (
                          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
                            <div className="text-xs font-semibold text-green-700 uppercase mb-2">👥 Destination Branch Staff ({toLoc})</div>
                            <div className="grid grid-cols-1 gap-1">
                              {t.destinationBranchStaff.map((s, si) => (
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
                            {items.length > 0 ? items.map((it, i) => (
                              <tr key={i} className={i % 2 === 0 ? '' : 'bg-gray-50'}>
                                <td className="py-1.5 px-2 border-b font-medium">{it.productName || it.productId}</td>
                                <td className="py-1.5 px-2 border-b text-gray-600">{it.batchNo || '—'}</td>
                                <td className="py-1.5 px-2 border-b" style={{ color: it.expiryDate && new Date(it.expiryDate) < new Date(Date.now() + 90*86400000) ? '#dc2626' : it.expiryDate ? '#666' : '#9ca3af' }}>
                                  {it.expiryDate ? fmtDate(it.expiryDate) : (it.batchNo ? 'N/A' : '—')}
                                </td>
                                <td className="py-1.5 px-2 border-b text-right font-bold">{it.quantity}</td>
                                <td className="py-1.5 px-2 border-b text-gray-600">{it.unit || 'units'}</td>
                              </tr>
                            )) : (
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

      {/* Field Stock Requests sub-tab */}
      {approvalTab === 'fieldstock' && (
        <div className="space-y-4">
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
                  const numFmt = (v) => isNaN(v) ? v : `N$ ${Number(v).toFixed(2)}`;
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
                            <span className="font-bold text-slate-800">{numKeys.includes(k) ? `N$ ${Number(v).toFixed(2)}` : String(v)}</span>
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
                <strong>{casRequests.length}</strong> cash advance request{casRequests.length !== 1 ? 's' : ''} reviewed by Finance awaiting your final approval.
              </div>
              {casRequests.map(r => (
                <div key={r.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-bold text-gray-800">{r.request_number}</span>
                      <span className="font-bold text-lg text-green-700">N$ {Number(r.amount || 0).toFixed(2)}</span>
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
                      <span className="text-sm font-bold text-gray-800">{r.staff_name || r.requested_by}</span>
                      {r.staff_role && <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: '#e0e7ff', color: '#3730a3' }}>{r.staff_role.toUpperCase()}</span>}
                      {(r.staff_branch || r.branch) && <span className="text-xs text-gray-500">📍 {r.staff_branch || r.branch}</span>}
                      {r.staff_email && <span className="text-xs text-gray-400">✉ {r.staff_email}</span>}
                    </div>
                    <div className="text-sm text-gray-700 mb-1"><span className="font-semibold">Purpose:</span> {r.purpose}</div>
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
              <h3 style={{ margin: 0, color: '#fff', fontSize: '1rem', fontWeight: 800 }}>💵 Final CAS Approval</h3>
              <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem' }}>{casModal.request_number} · Finance Reviewed</p>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: 2 }}>Staff Member</span>
                  <span style={{ fontWeight: 700, color: '#1e293b' }}>{casModal.staff_name || casModal.requested_by}</span>
                  {casModal.staff_role && <span style={{ marginLeft: 8, fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: 20, background: '#e0e7ff', color: '#3730a3' }}>{casModal.staff_role.toUpperCase()}</span>}
                  {(casModal.staff_branch || casModal.branch) && <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>📍 {casModal.staff_branch || casModal.branch}</div>}
                  {casModal.staff_email && <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 1 }}>✉ {casModal.staff_email}</div>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
                  <span style={{ fontSize: '0.82rem', color: '#64748b' }}>Amount</span>
                  <span style={{ fontWeight: 800, color: '#166534', fontSize: '1.05rem' }}>N$ {Number(casModal.amount || 0).toFixed(2)}</span>
                </div>
                <div style={{ fontSize: '0.87rem', color: '#374151', marginTop: 4 }}>{casModal.purpose}</div>
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
                      <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: '#fff0f3', color: '#c41e3a', border: '1px solid #fecaca' }}>{r.type || 'Annual'} Leave</span>
                      {r.urgent && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}>URGENT</span>}
                    </div>
                    <button onClick={() => { setLeaveApprovalModal(r); setLeaveApprovalNote(''); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90 cursor-pointer">
                      Review &amp; Approve
                    </button>
                  </div>
                  <div className="p-4">
                    <div className="text-sm text-gray-700 mb-1"><span className="font-semibold">Period:</span> {r.startDate || r.start_date} → {r.endDate || r.end_date}</div>
                    <div className="text-sm text-gray-600 mb-1"><span className="font-semibold">Reason:</span> {r.reason}</div>
                    <div className="text-xs text-gray-400 mt-1">Submitted: {r.submittedAt ? new Date(r.submittedAt).toLocaleString('en-NA') : '—'}</div>
                  </div>
                </div>
              ))}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: '0.82rem', color: '#64748b' }}>Period</span>
                  <span style={{ fontWeight: 700, color: '#1e293b' }}>{leaveApprovalModal.startDate || leaveApprovalModal.start_date} → {leaveApprovalModal.endDate || leaveApprovalModal.end_date}</span>
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

      {/* Other approval sub-tabs */}
      {approvalTab !== 'transfers' && approvalTab !== 'fieldstock' && approvalTab !== 'rent_edits' && approvalTab !== 'salary_edits' && approvalTab !== 'cas_approvals' && approvalTab !== 'leave_approvals' && approvalTab !== 'bonus_delete' && renderRequests()}

      {viewDispatch && <DispatchNote transfer={viewDispatch} onClose={() => setViewDispatch(null)} />}

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
                Adjust quantities or remove items. Items with quantity 0 will be removed. Remaining stock will return to warehouse.
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 12, color: '#6b7280' }}>Product</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 12, color: '#6b7280' }}>Batch</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 12, color: '#6b7280' }}>Expiry</th>
                    <th style={{ textAlign: 'center', padding: '8px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 12, color: '#6b7280' }}>Original Qty</th>
                    <th style={{ textAlign: 'center', padding: '8px 10px', borderBottom: '2px solid #e5e7eb', fontSize: 12, color: '#6b7280' }}>Approved Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {amendItems.map((it, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', fontSize: 13, fontWeight: 500 }}>{it.productName || it.productId}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', fontSize: 13 }}>{it.batchNo || '—'}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', fontSize: 13, color: it.expiryDate ? 'inherit' : '#9ca3af' }}>{it.expiryDate ? fmtDate(it.expiryDate) : (it.batchNo ? 'N/A' : '—')}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', fontSize: 13, textAlign: 'center', color: '#9ca3af' }}>{it.quantity}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
                        <input type="number" min="0" max={it.quantity} value={it.quantityApproved}
                          onChange={e => {
                            const val = Math.max(0, Math.min(Number(e.target.value) || 0, it.quantity));
                            setAmendItems(prev => prev.map((p, j) => j === i ? { ...p, quantityApproved: val } : p));
                          }}
                          style={{ width: 70, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 6, textAlign: 'center', fontSize: 13, fontWeight: 600 }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Amendment Comment / Reason</label>
                <textarea value={amendComment} onChange={e => setAmendComment(e.target.value)}
                  placeholder="Explain what was changed and why..."
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, minHeight: 80, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setAmendModal(null); setAmendItems([]); setAmendComment(''); }} disabled={processing}
                  style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: processing ? 'not-allowed' : 'pointer', fontSize: 13, opacity: processing ? 0.5 : 1 }}>
                  Cancel
                </button>
                <button onClick={handleAmendApprove} disabled={processing}
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
      <Input label="Specific Distributor Codes (comma-separated)" value={conditions.distributor_codes || ''} onChange={e => set('distributor_codes', e.target.value)} placeholder="e.g. NB78370, NB68030" />
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

  useEffect(() => {
    loadCampaigns();
    // Load product list for dropdowns
    api.get('/prices').then(d => {
      const list = Array.isArray(d) ? d : (d.prices || d.products || []);
      setProducts(list.filter(p => !p.is_package));
    }).catch(() => {
      // fallback: use getLiveProductList
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

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name || !form.start_date || !form.end_date) {
      setAlert({ type: 'error', msg: 'Campaign name, start date and end date are required.' });
      return;
    }
    try {
      await api.post('/campaigns', {
        ...form,
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
        <h3 className="text-white text-lg font-bold m-0">📢 Campaign Management</h3>
        <p className="text-white/70 text-sm mt-1 m-0">Create, track, and auto-generate winners for promotions</p>
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
                          const entries = Object.entries(cond).filter(([, v]) => v !== '' && v !== null);
                          if (entries.length === 0) return null;
                          return (
                            <div className="mt-2 text-xs text-gray-600">
                              <strong>Conditions:</strong> {entries.map(([k, v]) => `${k.replace(/_/g,' ')}: ${v}`).join(' · ')}
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
      {!showForm && (
        <div className="grid gap-3">
          {loading ? <LoadingSpinner /> : campaigns.length === 0 ? (
            <div className="text-center py-10 text-gray-400">No campaigns yet. Click "+ New Campaign" to start.</div>
          ) : campaigns.map(c => {
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
                              const entries = Object.entries(cond);
                              if (entries.length === 0) return <span className="text-xs text-gray-400">None set</span>;
                              return entries.map(([k, v]) => (
                                <div key={k} className="text-xs mb-1">
                                  <span className="font-semibold capitalize">{k.replace(/_/g, ' ')}:</span>{' '}
                                  {Array.isArray(v)
                                    ? v.length === 0 ? <span className="text-gray-400">All</span>
                                      : <span className="inline-flex flex-wrap gap-1 ml-1">{v.map(item => <span key={item} className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-xs">{item}</span>)}</span>
                                    : String(v)}
                                </div>
                              ));
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
                                <Input label="NB Code *" value={participantForm.distributor_code} onChange={e => setParticipantForm(f => ({ ...f, distributor_code: e.target.value }))} placeholder="e.g. NB78370" />
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
                        <div className="flex gap-2 pt-2 border-t border-gray-100">
                          <button onClick={() => handleDeleteCampaign(c.id)} className="text-xs text-red-500 hover:underline ml-auto">🗑️ Delete Campaign</button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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
    </div>
  );
}

function BonusHistoryTab() {
  const [filterForm, setFilterForm] = useState({ start_date: '', end_date: '', branch: '' });
  const [bonusData] = useState([
    { id: 1, period: 'March 2026', branch: 'Windhoek CBD', total_amount: 45200, distributors_count: 23, status: 'Paid', date: '2026-03-15' },
    { id: 2, period: 'March 2026', branch: 'Oshakati', total_amount: 32100, distributors_count: 18, status: 'Paid', date: '2026-03-15' },
    { id: 3, period: 'February 2026', branch: 'Windhoek CBD', total_amount: 41800, distributors_count: 21, status: 'Paid', date: '2026-02-15' },
    { id: 4, period: 'February 2026', branch: 'Walvis Bay', total_amount: 28500, distributors_count: 15, status: 'Paid', date: '2026-02-15' },
    { id: 5, period: 'April 2026', branch: 'Katutura', total_amount: 38900, distributors_count: 20, status: 'Pending', date: '2026-04-15' },
    { id: 6, period: 'April 2026', branch: 'Rundu', total_amount: 19700, distributors_count: 12, status: 'Pending', date: '2026-04-15' },
  ]);

  const filteredData = bonusData.filter(b => {
    if (filterForm.branch && b.branch !== filterForm.branch) return false;
    if (filterForm.start_date && b.date < filterForm.start_date) return false;
    if (filterForm.end_date && b.date > filterForm.end_date) return false;
    return true;
  });

  const totalPaid = filteredData.filter(b => b.status === 'Paid').reduce((sum, b) => sum + b.total_amount, 0);
  const pendingAmount = filteredData.filter(b => b.status === 'Pending').reduce((sum, b) => sum + b.total_amount, 0);
  const lastPayout = filteredData.filter(b => b.status === 'Paid').sort((a, b) => b.date.localeCompare(a.date))[0]?.date || '-';

  const handleCSVExport = () => {
    const headers = 'Period,Branch,Total Amount,Distributors,Status,Date\n';
    const rows = filteredData.map(b => `${b.period},${b.branch},${b.total_amount},${b.distributors_count},${b.status},${b.date}`).join('\n');
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
          <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>Total Paid</p>
          <p style={{ fontSize: '2rem' }} className="font-bold mt-1">{formatCurrency(totalPaid)}</p>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #fa709a, #fee140)' }} className="rounded-xl p-5 shadow-lg text-white">
          <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>Pending Amount</p>
          <p style={{ fontSize: '2rem' }} className="font-bold mt-1">{formatCurrency(pendingAmount)}</p>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #4facfe, #00f2fe)' }} className="rounded-xl p-5 shadow-lg text-white">
          <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>Last Payout Date</p>
          <p style={{ fontSize: '2rem' }} className="font-bold mt-1">{formatDate(lastPayout)}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">Bonus History Filter</h3>
            <Button size="sm" onClick={handleCSVExport}><Download size={16} /> Export CSV</Button>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Input label="Start Date" type="date" value={filterForm.start_date} onChange={e => setFilterForm({ ...filterForm, start_date: e.target.value })} />
            <Input label="End Date" type="date" value={filterForm.end_date} onChange={e => setFilterForm({ ...filterForm, end_date: e.target.value })} />
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Branch</label>
              <select value={filterForm.branch} onChange={e => setFilterForm({ ...filterForm, branch: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
                <option value="">All Branches</option>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <Button size="sm" variant="secondary" onClick={() => setFilterForm({ start_date: '', end_date: '', branch: '' })}>Clear Filters</Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <Table
          columns={[
            { header: 'Period', key: 'period' },
            { header: 'Branch', key: 'branch' },
            { header: 'Total Amount', render: r => formatCurrency(r.total_amount) },
            { header: 'Distributors', key: 'distributors_count' },
            { header: 'Status', render: r => <Badge variant={r.status === 'Paid' ? 'success' : 'warning'}>{r.status}</Badge> },
            { header: 'Date', render: r => formatDate(r.date) },
          ]}
          data={filteredData}
          emptyMessage="No bonus records found"
        />
      </Card>
    </div>
  );
}

function CommunicationTab() {
  const [form, setForm] = useState({ message: '', priority: 'Normal', target: 'all_staff', branch: '' });
  const [messages, setMessages] = useState([
    { id: 1, message: 'Monthly targets have been updated for all branches. Please review your dashboard.', priority: 'Info', sender: 'GM Office', timestamp: '2026-03-10T09:00:00Z' },
    { id: 2, message: 'Urgent: Stock audit scheduled for next week. All branch managers must prepare inventory reports.', priority: 'Urgent', sender: 'GM Office', timestamp: '2026-03-08T14:30:00Z' },
    { id: 3, message: 'Congratulations to Windhoek CBD branch for exceeding March targets!', priority: 'Normal', sender: 'GM Office', timestamp: '2026-03-05T11:00:00Z' },
  ]);
  const [submitMessage, setSubmitMessage] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.message.trim()) {
      setSubmitMessage('Error: Please enter a message.');
      return;
    }
    const newMsg = {
      id: Date.now(),
      message: form.message,
      priority: form.priority,
      sender: 'GM Office',
      target: form.target === 'specific_branch' ? form.branch : form.target,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [newMsg, ...prev]);
    setForm({ message: '', priority: 'Normal', target: 'all_staff', branch: '' });
    setSubmitMessage('Message sent successfully!');
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
            <Button type="submit">Send Message</Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Message History</h3></CardHeader>
        <CardBody>
          {messages.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">No messages sent yet.</p>
          ) : (
            <div className="space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className="border border-gray-100 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-gray-400">{formatDateTime(msg.timestamp)}</span>
                    <Badge variant={priorityColors[msg.priority] || 'default'}>{msg.priority}</Badge>
                    <span className="text-xs font-medium text-gray-600">{msg.sender}</span>
                    {msg.target && <span className="text-xs text-gray-400">→ {msg.target}</span>}
                  </div>
                  <p className="text-sm text-gray-700">{msg.message}</p>
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
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [campaignPrices, setCampaignPrices] = useState({});
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [campaignPrice, setCampaignPrice] = useState('');

  useEffect(() => {
    Promise.all([
      api.orders.list().then(d => Array.isArray(d) ? d : d.orders || []).catch(() => []),
      api.branch.walkinSales().then(d => Array.isArray(d) ? d : d.sales || d.walkin_sales || []).catch(() => []),
    ]).then(([orders, walkinSales]) => {
      const allItems = [];
      const processItems = (items) => {
        (items || []).forEach(item => {
          const rawName = item.name || item.product_name || 'Unknown';
          const matched = findProductPrice(rawName);
          allItems.push({ product_name: matched ? matched.description : rawName, quantity: Number(item.quantity || item.qty || 1) });
        });
      };
      orders.forEach(o => processItems(o.items));
      walkinSales.forEach(s => processItems(s.items));
      setSalesData(allItems);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const byProduct = {};
  salesData.forEach(s => {
    if (!byProduct[s.product_name]) byProduct[s.product_name] = 0;
    byProduct[s.product_name] += s.quantity;
  });

  const profitRows = getLiveProductList().map(p => {
    const qtySold = byProduct[p.description] || 0;
    const campaign = campaignPrices[p.description];
    const sellingPrice = campaign || p.dp;
    const profit = sellingPrice - p.cif;
    const totalProfit = profit * qtySold;
    const margin = p.cif > 0 ? ((profit / sellingPrice) * 100) : 0;
    return { product_name: p.description, cif: p.cif, dp: p.dp, cp: p.cp, campaign_price: campaign || null, selling_price: sellingPrice, profit_per_unit: profit, margin: Math.round(margin * 10) / 10, qty_sold: qtySold, total_profit: totalProfit };
  }).sort((a, b) => b.total_profit - a.total_profit);

  const totalCIF = profitRows.reduce((s, r) => s + r.cif * r.qty_sold, 0);
  const totalRevenue = profitRows.reduce((s, r) => s + r.selling_price * r.qty_sold, 0);
  const grandProfit = profitRows.reduce((s, r) => s + r.total_profit, 0);
  const avgMargin = totalRevenue > 0 ? ((grandProfit / totalRevenue) * 100).toFixed(1) : '0';

  const saveCampaign = () => {
    if (editingCampaign && campaignPrice) setCampaignPrices(prev => ({ ...prev, [editingCampaign]: Number(campaignPrice) }));
    setEditingCampaign(null);
    setCampaignPrice('');
  };

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200">
        <CardBody>
          <div className="flex items-start gap-4">
            <TrendingUp size={32} className="text-emerald-600 mt-1" />
            <div>
              <h3 className="font-bold text-emerald-900">Profit Analysis — CIF vs DP</h3>
              <p className="text-sm text-emerald-700 mt-1">Stock is imported from Malaysia at CIF price. Sold at DP (Distributor Price). Profit = DP − CIF per unit.</p>
            </div>
          </div>
        </CardBody>
      </Card>
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
                <tr key={r.product_name} className={`border-b border-gray-100 hover:bg-gray-50 ${r.qty_sold > 0 ? '' : 'opacity-50'}`}>
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
      <Modal open={!!editingCampaign} onClose={() => setEditingCampaign(null)} title={`Campaign Price: ${editingCampaign}`} size="sm">
        <div className="p-6 space-y-4">
          {editingCampaign && (() => { const prod = getLiveProductList().find(p => p.description === editingCampaign); return prod ? <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded"><p>CIF: {formatCurrency(prod.cif)} | DP: {formatCurrency(prod.dp)} | CP: {formatCurrency(prod.cp)}</p></div> : null; })()}
          <Input label="Campaign Selling Price (N$)" type="number" min="0" step="0.01" value={campaignPrice} onChange={e => setCampaignPrice(e.target.value)} />
          <div className="flex gap-3">
            <Button onClick={saveCampaign}>Apply Campaign Price</Button>
            <Button variant="secondary" onClick={() => { setCampaignPrices(prev => { const n = { ...prev }; delete n[editingCampaign]; return n; }); setEditingCampaign(null); }}>Reset to DP</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── Price List Management Tab ────────────────────────────────────────────────
function PriceListTab() {
  const [rows, setRows] = useState([]);
  const [edits, setEdits] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [alert, setAlert] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newProd, setNewProd] = useState({ description: '', dp: '', cp: '', cif: '', bv: '' });

  const load = useCallback(() => {
    setLoading(true);
    api.prices.list()
      .then(data => {
        if (Array.isArray(data)) {
          setRows(data);
          setLivePrices(data);
        }
      })
      .catch(() => setAlert({ type: 'error', msg: 'Failed to load prices.' }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const setEdit = (id, field, val) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));
  };

  const hasEdits = Object.keys(edits).length > 0;

  const saveAll = async () => {
    setSaving(true);
    setAlert(null);
    try {
      const updates = Object.entries(edits).map(([id, fields]) => {
        const row = rows.find(r => String(r.id) === String(id)) || {};
        return {
          id: Number(id),
          description: fields.description ?? row.description,
          dp: Math.round(Number(fields.dp ?? row.dp)) || 0,
          cp: Math.round(Number(fields.cp ?? row.cp)) || 0,
          cif: Math.round(Number(fields.cif ?? row.cif)) || 0,
          bv: Math.round(Number(fields.bv ?? row.bv)) || 0,
        };
      });
      await api.prices.bulkUpdate(updates);
      setEdits({});
      setAlert({ type: 'success', msg: `${updates.length} product price(s) updated successfully.` });
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
        dp: Math.round(Number(newProd.dp)) || 0,
        cp: Math.round(Number(newProd.cp)) || 0,
        cif: Math.round(Number(newProd.cif)) || 0,
        bv: Math.round(Number(newProd.bv)) || 0,
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

  const filtered = rows.filter(r =>
    r.description?.toLowerCase().includes(search.toLowerCase())
  );

  const getVal = (row, field) => {
    if (edits[row.id]?.[field] !== undefined) return edits[row.id][field];
    const v = row[field];
    return (field !== 'description' && v !== null && v !== undefined) ? Math.round(Number(v)) : v;
  };

  const fieldInput = (row, field, label) => (
    <input
      type="number"
      min="0"
      step="1"
      value={getVal(row, field)}
      onChange={e => setEdit(row.id, field, e.target.value)}
      onBlur={e => { const v = Math.round(Number(e.target.value)); setEdit(row.id, field, isNaN(v) ? 0 : v); }}
      className={`w-24 text-right border rounded px-1 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-red-400 ${edits[row.id]?.[field] !== undefined ? 'border-amber-400 bg-amber-50' : 'border-gray-200 bg-white'}`}
      title={label}
    />
  );

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
              <h2 className="text-lg font-bold text-white">Product Price List</h2>
              <p className="text-xs text-red-100">{rows.length} products &middot; {hasEdits ? `${Object.keys(edits).length} unsaved change(s)` : 'No unsaved changes'}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setShowAdd(true)}
                className="px-3 py-1.5 bg-white text-red-700 text-sm font-semibold rounded shadow hover:bg-red-50"
              >
                + Add Product
              </button>
              {hasEdits && (
                <button
                  onClick={saveAll}
                  disabled={saving}
                  className="px-4 py-1.5 bg-amber-400 text-gray-900 text-sm font-bold rounded shadow hover:bg-amber-300 disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save All Changes'}
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
                <tr className="bg-gray-50 text-gray-600 text-xs uppercase">
                  <th className="text-left py-2 px-3 border-b">Product Description</th>
                  <th className="text-right py-2 px-3 border-b">CIF (N$)</th>
                  <th className="text-right py-2 px-3 border-b">DP (N$)</th>
                  <th className="text-right py-2 px-3 border-b">CP (N$)</th>
                  <th className="text-right py-2 px-3 border-b">BV</th>
                  <th className="text-center py-2 px-3 border-b">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400">No products found.</td></tr>
                )}
                {filtered.map((row, i) => {
                  const changed = !!edits[row.id];
                  return (
                    <tr key={row.id} className={`border-b hover:bg-gray-50 ${changed ? 'bg-amber-50' : row.is_package ? 'bg-blue-50/40' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-800">{row.description}</span>
                          {row.is_package && (
                            <span className="text-xs px-1.5 py-0.5 rounded font-bold" style={{ background: '#dbeafe', color: '#1d4ed8' }}>📦 Package</span>
                          )}
                          {changed && <span className="text-xs text-amber-600 font-semibold">&bull; unsaved</span>}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right">{row.is_package ? <span className="text-xs text-gray-400 italic">bundle</span> : fieldInput(row, 'cif', 'Cost Insurance Freight')}</td>
                      <td className="py-2 px-2 text-right">{fieldInput(row, 'dp', 'Distributor Price')}</td>
                      <td className="py-2 px-2 text-right">{fieldInput(row, 'cp', 'Consumer Price')}</td>
                      <td className="py-2 px-2 text-right">{fieldInput(row, 'bv', 'Business Volume')}</td>
                      <td className="py-2 px-2 text-center">
                        {row.is_package ? (
                          <span className="text-xs text-blue-400 italic">auto-seeded</span>
                        ) : (
                          <button
                            onClick={() => deleteRow(row.id)}
                            className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400 mt-3">
            CIF = Cost Insurance &amp; Freight &middot; DP = Distributor Price &middot; CP = Consumer Price &middot; BV = Business Volume.
            Click any field to edit, then click <strong>Save All Changes</strong>.
          </p>
        </CardBody>
      </Card>

      {showAdd && (
        <Modal title="Add New Product" onClose={() => setShowAdd(false)}>
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
      )}
    </div>
  );
}

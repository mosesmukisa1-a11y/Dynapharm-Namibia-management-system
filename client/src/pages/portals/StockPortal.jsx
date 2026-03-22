import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { PRICE_LIST, getCIFPrice, getProductProfit, findProductPrice, getLiveProductList } from '../../lib/pricing';
import { formatCurrency, formatDateTime, formatDate, BRANCHES } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Table, Modal, Alert, Select, Textarea } from '../../components/ui';
import { Package, Warehouse, Truck, ArrowLeftRight, Globe, BarChart3, ClipboardList, FileSpreadsheet, Zap, Share2, ShoppingCart, Plus, Download, Filter, Search, DollarSign, TrendingUp, Ship, Calendar, CheckCircle, Printer, Tag, Edit2, Clock, XCircle, Brain, AlertTriangle, TrendingDown, MapPin, Users, Activity, Shield, Bell, RefreshCw, Target, Cpu } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

// ── Stock AI Engine ────────────────────────────────────────────────────────────
const stockAI = {
  getDailyRate: (productName, movements, branchFilter = null) => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return movements
      .filter(m => {
        const isProduct = !productName || m.product_name === productName;
        const isRecent = m.created_at && new Date(m.created_at) >= thirtyDaysAgo;
        const isOut = ['out', 'sale', 'sold', 'dispensed', 'transfer_out'].some(t => (m.movement_type || '').toLowerCase().includes(t));
        const isBranch = !branchFilter || (m.source_location || m.location || '').toLowerCase().replace(/\s+/g, '_') === branchFilter;
        return isProduct && isRecent && isOut && isBranch;
      })
      .reduce((s, m) => s + Number(m.quantity || 0), 0) / 30;
  },

  getDaysOfStock: (currentQty, dailyRate) => {
    if (dailyRate <= 0) return 999;
    return Math.round(currentQty / dailyRate);
  },

  getPriority: (daysOfStock, qty = 1) => {
    if (qty <= 0 || daysOfStock <= 0) return { label: 'OUT OF STOCK', color: '#dc2626', bg: '#fef2f2', score: 100 };
    if (daysOfStock <= 7) return { label: 'CRITICAL', color: '#dc2626', bg: '#fef2f2', score: 90 };
    if (daysOfStock <= 14) return { label: 'URGENT', color: '#d97706', bg: '#fffbeb', score: 70 };
    if (daysOfStock <= 30) return { label: 'REORDER SOON', color: '#ca8a04', bg: '#fefce8', score: 40 };
    return { label: 'OK', color: '#16a34a', bg: '#f0fdf4', score: 0 };
  },

  getBranchHealth: (branchBatches) => {
    if (!branchBatches.length) return { score: 50, label: 'No Data', color: '#94a3b8' };
    const now = new Date();
    const thirtyFwd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const totalQty = branchBatches.reduce((s, b) => s + Number(b.quantity || 0), 0);
    const expiredQty = branchBatches.filter(b => b.expiry_date && new Date(b.expiry_date) < now).reduce((s, b) => s + Number(b.quantity || 0), 0);
    const expiringSoon = branchBatches.filter(b => b.expiry_date && new Date(b.expiry_date) > now && new Date(b.expiry_date) <= thirtyFwd).reduce((s, b) => s + Number(b.quantity || 0), 0);
    const productMap = {};
    branchBatches.forEach(b => { if (!productMap[b.product_name]) productMap[b.product_name] = 0; productMap[b.product_name] += Number(b.quantity || 0); });
    const criticalCount = Object.values(productMap).filter(q => q < 5).length;
    let score = 100;
    if (totalQty > 0) score -= (expiredQty / totalQty) * 40;
    if (totalQty > 0) score -= (expiringSoon / totalQty) * 15;
    score -= criticalCount * 6;
    score = Math.max(0, Math.min(100, Math.round(score)));
    return {
      score,
      label: score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Poor',
      color: score >= 80 ? '#16a34a' : score >= 60 ? '#ca8a04' : score >= 40 ? '#d97706' : '#dc2626',
    };
  },

  generateInsights: (batches, movements, transfers) => {
    const now = new Date();
    const thirtyFwd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const productMap = {};
    batches.forEach(b => {
      if (!productMap[b.product_name]) productMap[b.product_name] = { qty: 0, expiry: null, location: b.location };
      productMap[b.product_name].qty += Number(b.quantity || 0);
      if (b.expiry_date && (!productMap[b.product_name].expiry || new Date(b.expiry_date) < new Date(productMap[b.product_name].expiry))) {
        productMap[b.product_name].expiry = b.expiry_date;
      }
    });
    const insights = [];
    const criticalItems = Object.entries(productMap).filter(([, d]) => d.qty < 5 && d.qty > 0);
    const outItems = Object.entries(productMap).filter(([, d]) => d.qty <= 0);
    const expiringBatches = batches.filter(b => b.expiry_date && new Date(b.expiry_date) > now && new Date(b.expiry_date) <= thirtyFwd);
    const expiredBatches = batches.filter(b => b.expiry_date && new Date(b.expiry_date) < now && Number(b.quantity) > 0);
    const pendingTransfers = transfers.filter(t => t.status === 'pending' || t.status === 'requested');
    const overdueTransfers = transfers.filter(t => {
      const age = (Date.now() - new Date(t.created_at || 0)) / (1000 * 60 * 60 * 24);
      return (t.status === 'pending' || t.status === 'in_transit') && age > 3;
    });
    if (outItems.length > 0) insights.push({ type: 'critical', icon: '🚨', text: `${outItems.length} product${outItems.length > 1 ? 's are' : ' is'} completely OUT OF STOCK. Immediate sourcing required.` });
    if (criticalItems.length > 0) insights.push({ type: 'critical', icon: '⚠️', text: `${criticalItems.length} product${criticalItems.length > 1 ? 's are' : ' is'} critically low (under 5 units). ${criticalItems.slice(0,2).map(([n]) => n).join(', ')}${criticalItems.length > 2 ? '…' : ''}.` });
    if (expiredBatches.length > 0) insights.push({ type: 'danger', icon: '🗑️', text: `${expiredBatches.length} batch${expiredBatches.length > 1 ? 'es have' : ' has'} expired and still hold stock. These should be written off immediately.` });
    if (expiringBatches.length > 0) insights.push({ type: 'warning', icon: '📅', text: `${expiringBatches.length} batch${expiringBatches.length > 1 ? 'es expire' : ' expires'} within 30 days. Move to high-velocity branches.` });
    if (overdueTransfers.length > 0) insights.push({ type: 'warning', icon: '🚚', text: `${overdueTransfers.length} transfer${overdueTransfers.length > 1 ? 's are' : ' is'} overdue (pending > 3 days). Follow up with dispatch team.` });
    if (pendingTransfers.length > 3) insights.push({ type: 'info', icon: '🔄', text: `${pendingTransfers.length} transfers pending dispatch. Consider batching deliveries for efficiency.` });
    if (insights.length === 0) insights.push({ type: 'success', icon: '✅', text: 'All stock levels are healthy across all locations. Great job maintaining inventory!' });
    return insights;
  },

  getReorderRecommendations: (batches, movements, sales) => {
    const productMap = {};
    batches.forEach(b => {
      const key = `${b.product_name}||${b.location || 'unknown'}`;
      if (!productMap[key]) productMap[key] = { product_name: b.product_name, location: b.location || 'unknown', qty: 0, expiry: null };
      productMap[key].qty += Number(b.quantity || 0);
      if (b.expiry_date && (!productMap[key].expiry || new Date(b.expiry_date) < new Date(productMap[key].expiry))) productMap[key].expiry = b.expiry_date;
    });
    return Object.values(productMap).map(p => {
      const dailyRate = stockAI.getDailyRate(p.product_name, movements);
      const daysOfStock = stockAI.getDaysOfStock(p.qty, dailyRate);
      const priority = stockAI.getPriority(daysOfStock, p.qty);
      const suggestedOrder = dailyRate > 0 ? Math.ceil(dailyRate * 30) : (p.qty < 5 ? 50 : 0);
      return { ...p, dailyRate: dailyRate.toFixed(2), daysOfStock, priority, suggestedOrder };
    }).filter(r => r.priority.score > 0).sort((a, b) => b.priority.score - a.priority.score);
  },
};

// ── Location label helper ──────────────────────────────────────────────────────
const fmtLocation = (loc) => {
  if (!loc) return '—';
  if (loc === 'country_stock') return 'Country Stock';
  if (loc === 'windhoek_warehouse') return 'Windhoek Warehouse';
  if (loc === 'ondangwa_warehouse') return 'Ondangwa Warehouse';
  if (loc === 'windhoek_cbd') return 'Windhoek CBD';
  // General title case with acronym preservation
  return loc.replace(/_/g, ' ').replace(/\b\w+/g, word =>
    word.toUpperCase() === word && word.length > 1 ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );
};

function printDocument(title, bodyHtml, landscape = false) {
  const logoUrl = window.location.origin + '/assets/dynapharm-logo.png';
  const now = new Date().toLocaleString('en-NA');
  const w = window.open('', '_blank', 'width=960,height=720');
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
    @media print { @page { size: ${landscape ? 'landscape' : 'portrait'}; margin: 12mm; } }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 0; padding: 16px; }
    .doc-header { display: flex; align-items: center; gap: 14px; border-bottom: 2.5px solid #8b0000; padding-bottom: 10px; margin-bottom: 12px; }
    .doc-header img { height: 52px; width: auto; }
    .doc-header-text h2 { font-size: 16px; font-weight: bold; color: #8b0000; margin: 0 0 2px; }
    .doc-header-text .sub { font-size: 11px; color: #555; }
    .doc-title { font-size: 13px; font-weight: bold; color: #1e293b; margin: 0 0 2px; }
    .doc-meta { font-size: 10px; color: #777; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #8b0000; color: white; padding: 6px 8px; text-align: left; font-size: 11px; }
    td { padding: 5px 8px; border-bottom: 1px solid #eee; font-size: 11px; }
    tr:nth-child(even) td { background: #f9f9f9; }
    .footer { margin-top: 18px; font-size: 10px; color: #888; border-top: 1px solid #ddd; padding-top: 6px; display: flex; justify-content: space-between; }
    .label-grid { display: flex; flex-wrap: wrap; gap: 6px; }
    .label { border: 1px solid #333; padding: 8px; width: 160px; text-align: center; font-size: 10px; }
    .label .code { font-family: monospace; font-size: 13px; font-weight: bold; letter-spacing: 1px; }
    .label .bars { display: flex; gap: 1px; justify-content: center; margin: 4px 0; height: 40px; align-items: flex-end; }
    .label .bar { background: #000; }
    .label .product { font-size: 9px; margin-top: 4px; }
    .label .price { font-size: 11px; font-weight: bold; color: #8b0000; }
    @media print { .no-print { display: none !important; } }
  </style></head><body>
    <div class="doc-header">
      <img src="${logoUrl}" alt="Dynapharm Logo" onerror="this.style.display='none'" />
      <div class="doc-header-text">
        <h2>DYNAPHARM INTERNATIONAL NAMIBIA</h2>
        <div class="sub">Health &bull; Wealth &bull; Freedom &mdash; Namibia Operations</div>
      </div>
    </div>
    <div class="doc-title">${title}</div>
    <div class="doc-meta">Printed: ${now} &nbsp;&bull;&nbsp; Confidential — Internal Use Only</div>
    ${bodyHtml}
    <div class="footer">
      <span>Dynapharm International Namibia &mdash; Confidential</span>
      <span>${now}</span>
    </div>
    <div class="no-print" style="margin-top:16px;text-align:center">
      <button onclick="window.print()" style="padding:8px 24px;background:#8b0000;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px">🖨️ Print / Save PDF</button>
    </div>
  </body></html>`);
  w.document.close();
}

function barsForCode(code) {
  return code.split('').map((c, i) => {
    const w = ((c.charCodeAt(0) * 7 + i * 13) % 3) + 1;
    const h = 30 + ((c.charCodeAt(0) + i) % 10) * 2;
    return `<div class="bar" style="width:${w}px;height:${h}px"></div>`;
  }).join('') + Array.from({ length: 15 }, (_, i) => {
    const w = ((i * 7 + 3) % 3) + 1;
    return `<div class="bar" style="width:${w}px;height:${25 + (i % 8) * 2}px"></div>`;
  }).join('');
}

// ── Shared Stock Adjustment Request Modal ────────────────────────────────────
function RequestAdjustmentModal({ open, onClose, record, targetType, location, onSuccess }) {
  const [field, setField] = useState('quantity');
  const [newValue, setNewValue] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);

  const allFieldOptions = [
    { value: 'quantity', label: 'Quantity' },
    { value: 'expiry_date', label: 'Expiry Date' },
    { value: 'batch_number', label: 'Batch Number' },
    { value: 'unit_price', label: 'Unit Price (CIF)' },
    { value: 'notes', label: 'Notes' },
  ];
  // distribution transfers only support quantity + notes (stock_transfers has no other stock fields)
  const fieldOptions = targetType === 'distribution'
    ? allFieldOptions.filter(o => o.value === 'quantity' || o.value === 'notes')
    : allFieldOptions;

  const currentValue = record ? (
    field === 'quantity' ? (record.quantity ?? '—') :
    field === 'expiry_date' ? (record.expiry_date ? formatDate(record.expiry_date) : '—') :
    field === 'batch_number' ? (record.batchNo || record.batch_number || record.batch_no || '—') :
    field === 'unit_price' ? (record.unit_price ?? record.unitPrice ?? '—') :
    field === 'notes' ? (record.notes ?? record.dispatch_notes ?? '—') :
    '—'
  ) : '—';

  const handleClose = () => { onClose(); setAlert(null); setNewValue(''); setReason(''); setField('quantity'); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newValue.trim() || !reason.trim()) {
      setAlert({ type: 'error', msg: 'New value and reason are required' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/stock-adjustments', {
        target_type: targetType,
        target_id: record?.id || null,
        product_name: record?.product_name || record?.productName || record?.description || null,
        location: location || null,
        field_to_adjust: field,
        old_value: String(currentValue),
        new_value: newValue.trim(),
        reason: reason.trim(),
      });
      setAlert({ type: 'success', msg: `Request ${res.adj_number} submitted. Awaiting GM approval.` });
      setNewValue('');
      setReason('');
      if (onSuccess) onSuccess(res.adj_number);
    } catch (err) {
      setAlert({ type: 'error', msg: err.message || 'Failed to submit request' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Request Stock Record Edit (Requires GM Approval)" size="md">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <Alert type="info">
          This correction request will be sent to the GM for approval. The record will only be updated once approved.
        </Alert>
        {alert && <Alert type={alert.type}>{alert.msg}</Alert>}

        {record && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px' }}>
            <p className="text-xs text-gray-500 font-semibold mb-1">Record Being Edited</p>
            <p className="text-sm font-bold text-gray-800">{record.product_name || record.productName || record.description || 'Unknown product'}</p>
            <p className="text-xs text-gray-500">{targetType} · {location || record.location || ''} · Ref: {record.id?.slice(-8) || '—'}</p>
          </div>
        )}

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Field to Change <span className="text-red-500">*</span></label>
          <select value={field} onChange={e => { setField(e.target.value); setNewValue(''); }}
            className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
            {fieldOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-500">Current Value</label>
            <div style={{ padding: '8px 12px', background: '#f1f5f9', borderRadius: 8, fontSize: '0.85rem', color: '#374151', border: '1px solid #e2e8f0' }}>{String(currentValue)}</div>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">New Value <span className="text-red-500">*</span></label>
            {field === 'expiry_date' ? (
              <input type="date" value={newValue} onChange={e => setNewValue(e.target.value)} required
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary" />
            ) : (field === 'quantity' || field === 'unit_price') ? (
              <input type="number" min="0" step={field === 'unit_price' ? '0.01' : '1'} value={newValue} onChange={e => setNewValue(e.target.value)} required placeholder="Enter new value"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary" />
            ) : (
              <input type="text" value={newValue} onChange={e => setNewValue(e.target.value)} required placeholder="Enter new value"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary" />
            )}
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Reason for Change <span className="text-red-500">*</span></label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} required rows={3}
            placeholder="Explain why this record needs to be corrected (e.g. data entry error, physical recount difference)..."
            className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary resize-y" />
        </div>

        <div className="flex gap-3 pt-1">
          <Button type="submit" disabled={submitting}><Edit2 size={15} /> {submitting ? 'Submitting…' : 'Submit for GM Approval'}</Button>
          <Button variant="secondary" type="button" onClick={handleClose}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Adjustment Requests History Tab ───────────────────────────────────────────
function AdjustmentsTab() {
  const [adjustments, setAdjustments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const load = () => {
    setLoading(true);
    api.get('/stock-adjustments')
      .then(d => setAdjustments(Array.isArray(d) ? d : []))
      .catch(() => setAdjustments([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = filter === 'all' ? adjustments : adjustments.filter(a => a.status === filter);
  const pendingCount = adjustments.filter(a => a.status === 'pending').length;

  const statusBadge = (s) => {
    if (s === 'pending') return <Badge variant="warning"><Clock size={11} className="inline mr-1" />Pending GM</Badge>;
    if (s === 'approved') return <Badge variant="success"><CheckCircle size={11} className="inline mr-1" />Approved</Badge>;
    if (s === 'rejected') return <Badge variant="danger"><XCircle size={11} className="inline mr-1" />Rejected</Badge>;
    return <Badge>{s}</Badge>;
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', borderRadius: 14, padding: '14px 20px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontWeight: 800, fontSize: '1.05rem', margin: 0 }}>✏️ Stock Edit Requests</h3>
          <p style={{ fontSize: '0.8rem', opacity: 0.8, margin: '2px 0 0' }}>All correction requests submitted for GM approval. Use the Edit button on any stock record to create a new request.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {pendingCount > 0 && <span style={{ background: '#fbbf24', color: '#78350f', borderRadius: 99, padding: '4px 12px', fontSize: '0.78rem', fontWeight: 800 }}>⏳ {pendingCount} Awaiting GM</span>}
          <button onClick={load} style={{ padding: '7px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 99, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>🔄 Refresh</button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['all','pending','approved','rejected'].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ padding: '6px 16px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
              background: filter === s ? '#c41e3a' : '#f1f5f9', color: filter === s ? '#fff' : '#475569' }}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
            {s === 'pending' && pendingCount > 0 && ` (${pendingCount})`}
          </button>
        ))}
      </div>

      <Card>
        <Table
          columns={[
            { header: 'Ref #', render: r => <span className="font-mono text-xs font-bold text-primary">{r.adj_number}</span> },
            { header: 'Product', render: r => <span className="font-medium text-sm">{r.product_name || '—'}</span> },
            { header: 'Type', render: r => <Badge variant="info" className="text-xs">{r.target_type}</Badge> },
            { header: 'Field', render: r => <span className="text-xs font-semibold text-gray-600">{(r.field_to_adjust||'').replace(/_/g,' ')}</span> },
            { header: 'Change', render: r => (
              <span className="text-xs">
                <span className="line-through text-gray-400">{r.old_value}</span>
                <span className="mx-1 text-gray-400">→</span>
                <span className="font-bold text-green-700">{r.new_value}</span>
              </span>
            )},
            { header: 'Reason', render: r => <span className="text-xs text-gray-500 max-w-[160px] block truncate" title={r.reason}>{r.reason}</span> },
            { header: 'Status', render: r => statusBadge(r.status) },
            { header: 'GM Notes', render: r => r.gm_notes ? <span className="text-xs text-gray-600 italic">{r.gm_notes}</span> : <span className="text-gray-300 text-xs">—</span> },
            { header: 'Date', render: r => <span className="text-xs text-gray-500">{formatDate(r.created_at)}</span> },
          ]}
          data={filtered}
          emptyMessage="No adjustment requests found. Use the ✏️ Edit button on any stock record to request a correction."
        />
      </Card>
    </div>
  );
}

export default function StockPortal() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('aiDashboard');
  const [globalBranch, setGlobalBranch] = useState(user?.branch ? user.branch.toLowerCase().replace(/\s+/g, '_') : 'all');

  const tabs = [
    { id: 'aiDashboard', label: 'AI Command', icon: '🧠' },
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'branchStock', label: 'Branch Stock', icon: '🏪' },
    { id: 'stockReports', label: 'Stock Reports', icon: '📋' },
    { id: 'supplierImport', label: 'Supplier Import', icon: '🚢' },
    { id: 'countryStock', label: 'Country Stock', icon: '🌍' },
    { id: 'windhoek', label: 'Windhoek', icon: '🏢' },
    { id: 'ondangwa', label: 'Ondangwa', icon: '🏬' },
    { id: 'distribution', label: 'Distribution', icon: '🚚' },
    { id: 'transfers', label: 'Transfers', icon: '🔄' },
    { id: 'inventory', label: 'Inventory', icon: '📦' },
    { id: 'orders', label: 'Orders', icon: '🧾' },
    { id: 'monthlySales', label: 'Monthly Sales', icon: '📈' },
    { id: 'countryInventory', label: 'Country Inv.', icon: '🗂️' },
    { id: 'valuation', label: 'Valuation', icon: '💎' },
    { id: 'barcode', label: 'Barcode', icon: '🏷️' },
    { id: 'reorder', label: 'AI Reorder', icon: '🤖' },
    { id: 'batch', label: 'Batch', icon: '🔢' },
    { id: 'realtime', label: 'Realtime', icon: '⚡' },
    { id: 'adjustments', label: 'Edit Requests', icon: '✏️' },
  ];

  const branchOptions = [
    { value: 'all', label: '🌍 All Branches' },
    ...BRANCHES.map(b => ({ value: b.toLowerCase().replace(/\s+/g, '_'), label: `📍 ${b}` })),
    { value: 'windhoek_warehouse', label: '🏢 Windhoek Warehouse' },
    { value: 'ondangwa_warehouse', label: '🏬 Ondangwa Warehouse' },
    { value: 'country_stock', label: '📦 Country Stock' },
  ];

  const activeBranchLabel = branchOptions.find(o => o.value === globalBranch)?.label || 'All Branches';

  return (
    <div>
      {/* ── Header with Branch Selector ──────────────────────── */}
      <div className="mb-4 flex flex-wrap gap-4 items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Brain size={24} className="text-primary" /> AI Stock Management System
          </h1>
          <p className="text-sm text-gray-500">Intelligent inventory control · Branch-connected · Real-time AI insights</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <MapPin size={16} className="text-primary shrink-0" />
          <span className="text-sm font-semibold text-gray-600 whitespace-nowrap">Branch Filter:</span>
          <select value={globalBranch} onChange={e => setGlobalBranch(e.target.value)}
            style={{ padding: '7px 12px', border: '2px solid #c41e3a', borderRadius: 10, fontWeight: 700, fontSize: '0.85rem', color: '#8b0000', background: '#fff0f3', cursor: 'pointer', minWidth: 180 }}>
            {branchOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {globalBranch !== 'all' && (
            <button onClick={() => setGlobalBranch('all')}
              style={{ padding: '6px 10px', background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>× All</button>
          )}
          {user?.full_name && <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>👤 {user.full_name}</span>}
        </div>
      </div>

      {/* ── Active filter banner ──────────────────────────────── */}
      {globalBranch !== 'all' && (
        <div style={{ marginBottom: 12, padding: '8px 16px', background: 'linear-gradient(135deg,#fff0f3,#ffe4e8)', border: '1.5px solid #fecaca', borderRadius: 10, fontSize: '0.82rem', color: '#9b1c2e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <MapPin size={13} /> Showing data for: <strong>{activeBranchLabel}</strong> &nbsp;—&nbsp; All tabs filtered to this location
        </div>
      )}

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />
      <div className="mt-6">
        {activeTab === 'aiDashboard' && <AICommandCenter branch={globalBranch} />}
        {activeTab === 'overview' && <OverviewTab branch={globalBranch} />}
        {activeTab === 'branchStock' && <BranchStockTab branch={globalBranch} />}
        {activeTab === 'stockReports' && <StockReportsTab branch={globalBranch} />}
        {activeTab === 'supplierImport' && <SupplierImportTab />}
        {activeTab === 'countryStock' && <CountryStockTab />}
        {activeTab === 'windhoek' && <WarehouseTab name="Windhoek" />}
        {activeTab === 'ondangwa' && <WarehouseTab name="Ondangwa" />}
        {activeTab === 'distribution' && <DistributionTab branch={globalBranch} />}
        {activeTab === 'transfers' && <TransfersTab branch={globalBranch} />}
        {activeTab === 'inventory' && <InventoryTab branch={globalBranch} />}
        {activeTab === 'orders' && <OrdersTab branch={globalBranch} />}
        {activeTab === 'monthlySales' && <MonthlySalesTab branch={globalBranch} />}
        {activeTab === 'countryInventory' && <CountryInventoryTab />}
        {activeTab === 'valuation' && <ValuationTab branch={globalBranch} />}
        {activeTab === 'barcode' && <BarcodeTab />}
        {activeTab === 'reorder' && <SmartReorderTab branch={globalBranch} />}
        {activeTab === 'batch' && <BatchTab branch={globalBranch} />}
        {activeTab === 'realtime' && <RealtimeTab branch={globalBranch} />}
        {activeTab === 'adjustments' && <AdjustmentsTab />}
      </div>
    </div>
  );
}

// ── AI Command Center ─────────────────────────────────────────────────────────
function AICommandCenter({ branch }) {
  const [data, setData] = useState({ batches: [], movements: [], transfers: [], sales: [] });
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [alertFilter, setAlertFilter] = useState('all');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.stock.batches().then(d => Array.isArray(d) ? d : d.batches || []).catch(() => []),
      api.stock.movements().then(d => Array.isArray(d) ? d : d.movements || []).catch(() => []),
      api.stock.transfers().then(d => Array.isArray(d) ? d : d.transfers || []).catch(() => []),
      api.branch.walkinSales().then(d => Array.isArray(d) ? d : d.sales || d.walkin_sales || []).catch(() => []),
    ]).then(([batches, movements, transfers, sales]) => {
      setData({ batches, movements, transfers, sales });
      setLastRefresh(new Date());
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingSpinner />;

  const filterBatch = (b) => branch === 'all' || (b.location || '').toLowerCase().replace(/\s+/g, '_') === branch;
  const filteredBatches = data.batches.filter(filterBatch);

  // ── Core stats ──────────────────────────────────────────────
  const now = new Date();
  const thirtyFwd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const ninetyFwd = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const totalQty = filteredBatches.reduce((s, b) => s + Number(b.quantity || 0), 0);
  const totalValue = filteredBatches.reduce((s, b) => s + Number(b.quantity || 0) * Number(b.unit_price || 0), 0);
  const expiredBatches = filteredBatches.filter(b => b.expiry_date && new Date(b.expiry_date) < now && Number(b.quantity) > 0);
  const expiringBatches = filteredBatches.filter(b => b.expiry_date && new Date(b.expiry_date) > now && new Date(b.expiry_date) <= thirtyFwd);

  const productTotals = {};
  filteredBatches.forEach(b => {
    if (!productTotals[b.product_name]) productTotals[b.product_name] = { qty: 0, location: b.location };
    productTotals[b.product_name].qty += Number(b.quantity || 0);
  });
  const criticalProducts = Object.entries(productTotals).filter(([, d]) => d.qty > 0 && d.qty < 5);
  const outProducts = Object.entries(productTotals).filter(([, d]) => d.qty <= 0);

  const pendingTransfers = data.transfers.filter(t => {
    const isRelated = branch === 'all' || (t.from_location || '').toLowerCase().replace(/\s+/g, '_') === branch || (t.to_location || '').toLowerCase().replace(/\s+/g, '_') === branch;
    return isRelated && (t.status === 'pending' || t.status === 'requested');
  });
  const inTransitTransfers = data.transfers.filter(t => {
    const isRelated = branch === 'all' || (t.from_location || '').toLowerCase().replace(/\s+/g, '_') === branch || (t.to_location || '').toLowerCase().replace(/\s+/g, '_') === branch;
    return isRelated && (t.status === 'in_transit' || t.status === 'dispatched');
  });

  // ── AI Insights ─────────────────────────────────────────────
  const insights = stockAI.generateInsights(filteredBatches, data.movements, data.transfers);

  // ── AI Reorder Recommendations ──────────────────────────────
  const reorderRecs = stockAI.getReorderRecommendations(filteredBatches, data.movements, data.sales)
    .slice(0, 8);

  // ── Branch Health Scores ─────────────────────────────────────
  const branchHealthScores = BRANCHES.map(brName => {
    const key = brName.toLowerCase().replace(/\s+/g, '_');
    const brBatches = data.batches.filter(b => (b.location || '').toLowerCase().replace(/\s+/g, '_') === key);
    const health = stockAI.getBranchHealth(brBatches);
    const totalStk = brBatches.reduce((s, b) => s + Number(b.quantity || 0), 0);
    const pendingReqs = data.transfers.filter(t => ((t.to_location || '').toLowerCase().replace(/\s+/g, '_') === key) && (t.status === 'pending' || t.status === 'requested')).length;
    return { name: brName, key, health, totalStk, pendingReqs };
  });

  // ── Expiry Timeline ──────────────────────────────────────────
  const expiry30 = filteredBatches.filter(b => b.expiry_date && new Date(b.expiry_date) > now && new Date(b.expiry_date) <= thirtyFwd);
  const expiry60 = filteredBatches.filter(b => b.expiry_date && new Date(b.expiry_date) > thirtyFwd && new Date(b.expiry_date) <= ninetyFwd);

  const insightColors = { critical: '#dc2626', danger: '#dc2626', warning: '#d97706', info: '#2563eb', success: '#16a34a' };
  const insightBgs = { critical: '#fef2f2', danger: '#fef2f2', warning: '#fffbeb', info: '#eff6ff', success: '#f0fdf4' };

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', borderRadius: 16, padding: '18px 24px', color: '#fff' }}>
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Brain size={20} />
              <h2 style={{ fontWeight: 900, fontSize: '1.15rem', margin: 0 }}>🧠 AI Stock Command Center</h2>
            </div>
            <p style={{ fontSize: '0.82rem', opacity: 0.8, margin: 0 }}>
              Real-time intelligence · Predictive reorder alerts · Branch health monitoring
              {branch !== 'all' && ` · Filtered: ${fmtLocation(branch)}`}
            </p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 16px' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>{totalQty.toLocaleString()}</div>
              <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Total Units</div>
            </div>
            <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 16px' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>{formatCurrency(totalValue)}</div>
              <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Stock Value</div>
            </div>
            <div style={{ textAlign: 'center', background: outProducts.length > 0 ? 'rgba(220,38,38,0.3)' : 'rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 16px' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 900 }}>{criticalProducts.length + outProducts.length}</div>
              <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>Critical Alerts</div>
            </div>
            <button onClick={load} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 10, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 }}>
              <RefreshCw size={14} style={{ display: 'inline', marginRight: 4 }} />Refresh
            </button>
          </div>
        </div>
        <div style={{ marginTop: 8, fontSize: '0.72rem', opacity: 0.6 }}>Last updated: {formatDateTime(lastRefresh)}</div>
      </div>

      {/* ── AI Insights Panel ──────────────────────── */}
      <div>
        <h3 style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1e293b', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Cpu size={16} className="text-primary" /> AI Insights
        </h3>
        <div className="space-y-2">
          {insights.map((ins, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 10, background: insightBgs[ins.type] || '#f8fafc', border: `1.5px solid ${insightColors[ins.type] || '#94a3b8'}30` }}>
              <span style={{ fontSize: '1.1rem', lineHeight: 1.2 }}>{ins.icon}</span>
              <p style={{ margin: 0, fontSize: '0.85rem', color: insightColors[ins.type] || '#374151', fontWeight: 600, lineHeight: 1.4 }}>{ins.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Quick Stats ───────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div style={{ background: outProducts.length > 0 ? '#fef2f2' : '#f0fdf4', border: `1.5px solid ${outProducts.length > 0 ? '#fecaca' : '#bbf7d0'}`, borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: outProducts.length > 0 ? '#dc2626' : '#16a34a' }}>{outProducts.length}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Out of Stock</div>
        </div>
        <div style={{ background: criticalProducts.length > 0 ? '#fef2f2' : '#f0fdf4', border: `1.5px solid ${criticalProducts.length > 0 ? '#fecaca' : '#bbf7d0'}`, borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: criticalProducts.length > 0 ? '#dc2626' : '#16a34a' }}>{criticalProducts.length}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Critical (&lt;5)</div>
        </div>
        <div style={{ background: expiredBatches.length > 0 ? '#fef2f2' : '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: expiredBatches.length > 0 ? '#dc2626' : '#475569' }}>{expiredBatches.length}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Expired Batches</div>
        </div>
        <div style={{ background: expiry30.length > 0 ? '#fffbeb' : '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: expiry30.length > 0 ? '#d97706' : '#475569' }}>{expiry30.length}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Expiring &lt;30d</div>
        </div>
        <div style={{ background: pendingTransfers.length > 0 ? '#eff6ff' : '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: pendingTransfers.length > 0 ? '#2563eb' : '#475569' }}>{pendingTransfers.length}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Pending Transfers</div>
        </div>
        <div style={{ background: inTransitTransfers.length > 0 ? '#f0fdf4' : '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#7c3aed' }}>{inTransitTransfers.length}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>In Transit</div>
        </div>
      </div>

      {/* ── Branch Health Scores ────────────────────── */}
      {branch === 'all' && (
        <Card>
          <CardHeader>
            <h3 className="font-bold text-gray-800 flex items-center gap-2"><Shield size={16} className="text-primary" /> Branch Health Scores</h3>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {branchHealthScores.map(b => (
                <div key={b.key} style={{ border: `2px solid ${b.health.color}30`, borderRadius: 12, padding: '12px 14px', background: b.health.score >= 80 ? '#f0fdf4' : b.health.score >= 60 ? '#fefce8' : '#fef2f2' }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', marginBottom: 4 }}>📍 {b.name}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span style={{ fontSize: '1.8rem', fontWeight: 900, color: b.health.color }}>{b.health.score}</span>
                    <span style={{ fontSize: '0.75rem', color: b.health.color, fontWeight: 700 }}>/100</span>
                  </div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: b.health.color, marginBottom: 6 }}>{b.health.label}</div>
                  {/* Health bar */}
                  <div style={{ height: 5, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
                    <div style={{ height: '100%', width: `${b.health.score}%`, background: b.health.color, borderRadius: 99, transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{b.totalStk} units {b.pendingReqs > 0 && <span style={{ color: '#2563eb', fontWeight: 700 }}>· {b.pendingReqs} pending</span>}</div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* ── AI Reorder Recommendations ──────────────── */}
      {reorderRecs.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h3 className="font-bold text-gray-800 flex items-center gap-2"><Target size={16} className="text-primary" /> AI Reorder Recommendations</h3>
              <Button size="sm" variant="secondary" onClick={() => {
                const rows = reorderRecs.map(r => `<tr><td>${r.product_name}</td><td>${fmtLocation(r.location)}</td><td>${r.priority.label}</td><td>${r.qty}</td><td>${r.dailyRate}/day</td><td>${r.daysOfStock === 999 ? '—' : r.daysOfStock + ' days'}</td><td>${r.suggestedOrder}</td></tr>`).join('');
                printDocument('AI Reorder Recommendations', `<table><thead><tr><th>Product</th><th>Location</th><th>Priority</th><th>Current Qty</th><th>Daily Rate</th><th>Days Left</th><th>Suggested Order</th></tr></thead><tbody>${rows}</tbody></table>`);
              }}><Printer size={14} /> Print</Button>
            </div>
          </CardHeader>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Product', 'Location', 'Priority', 'Current Qty', 'Daily Rate', 'Days Left', 'Suggested Order'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.75rem', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reorderRecs.map((r, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb', borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: '#1e293b' }}>{r.product_name}</td>
                    <td style={{ padding: '8px 12px', color: '#64748b', fontSize: '0.78rem' }}>{fmtLocation(r.location)}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ background: r.priority.bg, color: r.priority.color, borderRadius: 99, padding: '3px 10px', fontWeight: 800, fontSize: '0.72rem', letterSpacing: '0.02em' }}>{r.priority.label}</span>
                    </td>
                    <td style={{ padding: '8px 12px', fontWeight: 800, color: r.qty < 5 ? '#dc2626' : '#374151' }}>{r.qty}</td>
                    <td style={{ padding: '8px 12px', color: '#64748b' }}>{r.dailyRate === '0.00' ? '—' : `${r.dailyRate}/day`}</td>
                    <td style={{ padding: '8px 12px', fontWeight: 700, color: r.daysOfStock <= 14 ? '#dc2626' : r.daysOfStock <= 30 ? '#d97706' : '#16a34a' }}>
                      {r.daysOfStock === 999 ? '—' : `${r.daysOfStock}d`}
                    </td>
                    <td style={{ padding: '8px 12px', fontWeight: 800, color: '#7c3aed' }}>{r.suggestedOrder > 0 ? r.suggestedOrder : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Expiry Risk ─────────────────────────────── */}
      {(expiry30.length > 0 || expiredBatches.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {expiredBatches.length > 0 && (
            <Card>
              <CardHeader><h3 className="font-bold text-red-700 flex items-center gap-2"><AlertTriangle size={16} /> Expired — Needs Write-off ({expiredBatches.length})</h3></CardHeader>
              <Table
                columns={[
                  { header: 'Product', render: r => <span className="font-semibold text-sm">{r.product_name}</span> },
                  { header: 'Qty', render: r => <span className="font-bold text-red-600">{r.quantity}</span> },
                  { header: 'Expired', render: r => <span className="text-xs text-red-500">{formatDate(r.expiry_date)}</span> },
                  { header: 'Location', render: r => <span className="text-xs text-gray-500">{fmtLocation(r.location)}</span> },
                ]}
                data={expiredBatches.slice(0, 8)}
                emptyMessage="None"
              />
            </Card>
          )}
          {expiry30.length > 0 && (
            <Card>
              <CardHeader><h3 className="font-bold text-amber-700 flex items-center gap-2"><Clock size={16} /> Expiring in 30 Days ({expiry30.length})</h3></CardHeader>
              <Table
                columns={[
                  { header: 'Product', render: r => <span className="font-semibold text-sm">{r.product_name}</span> },
                  { header: 'Qty', render: r => <span className="font-bold text-amber-600">{r.quantity}</span> },
                  { header: 'Expires', render: r => <span className="text-xs text-amber-600 font-semibold">{formatDate(r.expiry_date)}</span> },
                  { header: 'Location', render: r => <span className="text-xs text-gray-500">{fmtLocation(r.location)}</span> },
                ]}
                data={expiry30.slice(0, 8)}
                emptyMessage="None"
              />
            </Card>
          )}
        </div>
      )}

      {/* ── Pending Transfers ─────────────────────── */}
      {pendingTransfers.length > 0 && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800 flex items-center gap-2"><ArrowLeftRight size={16} /> Pending Transfers Requiring Action</h3></CardHeader>
          <Table
            columns={[
              { header: 'Product', render: r => <span className="font-semibold text-sm">{r.product_name}</span> },
              { header: 'From', render: r => <span className="text-xs">{fmtLocation(r.from_location)}</span> },
              { header: 'To', render: r => <span className="text-xs">{fmtLocation(r.to_location)}</span> },
              { header: 'Qty', render: r => <span className="font-bold">{r.quantity}</span> },
              { header: 'Status', render: r => <Badge variant="warning">{r.status}</Badge> },
              { header: 'Requested', render: r => <span className="text-xs text-gray-500">{formatDate(r.created_at)}</span> },
            ]}
            data={pendingTransfers.slice(0, 10)}
            emptyMessage="No pending transfers"
          />
        </Card>
      )}
    </div>
  );
}

// ── Overview Tab (branch-aware) ───────────────────────────────────────────────
function OverviewTab({ branch }) {
  const [data, setData] = useState({ batches: [], movements: [], transfers: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.stock.batches().then(d => Array.isArray(d) ? d : d.batches || []).catch(() => []),
      api.stock.movements().then(d => Array.isArray(d) ? d : d.movements || []).catch(() => []),
      api.stock.transfers().then(d => Array.isArray(d) ? d : d.transfers || []).catch(() => []),
    ]).then(([batches, movements, transfers]) => {
      setData({ batches, movements, transfers });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const filterBatch = (b) => branch === 'all' || (b.location || '').toLowerCase().replace(/\s+/g, '_') === branch;
  const filteredBatches = data.batches.filter(filterBatch);
  const filteredMovements = branch === 'all' ? data.movements : data.movements.filter(m =>
    (m.location || m.source_location || '').toLowerCase().replace(/\s+/g, '_') === branch
  );

  const totalItems = filteredBatches.reduce((sum, b) => sum + Number(b.quantity || 0), 0);
  const totalValue = filteredBatches.reduce((sum, b) => sum + Number(b.quantity || 0) * Number(b.unit_price || 0), 0);
  const pendingTransfers = data.transfers.filter(t => {
    const related = branch === 'all' || (t.from_location || '').toLowerCase().replace(/\s+/g, '_') === branch || (t.to_location || '').toLowerCase().replace(/\s+/g, '_') === branch;
    return related && t.status === 'pending';
  }).length;
  const inTransit = data.transfers.filter(t => {
    const related = branch === 'all' || (t.from_location || '').toLowerCase().replace(/\s+/g, '_') === branch || (t.to_location || '').toLowerCase().replace(/\s+/g, '_') === branch;
    return related && (t.status === 'in_transit' || t.status === 'dispatched');
  }).length;

  return (
    <div>
      {branch !== 'all' && (
        <div style={{ marginBottom: 16, padding: '8px 14px', background: '#fff0f3', border: '1.5px solid #fecaca', borderRadius: 10, fontSize: '0.82rem', color: '#9b1c2e', fontWeight: 600 }}>
          📍 Showing overview for: <strong>{fmtLocation(branch)}</strong>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Stock Units" value={totalItems.toLocaleString()} color="blue" icon={<Package size={24} />} />
        <StatCard title="Stock Value (CIF)" value={formatCurrency(totalValue)} color="green" icon={<BarChart3 size={24} />} />
        <StatCard title="Pending Transfers" value={pendingTransfers} color="orange" icon={<ArrowLeftRight size={24} />} />
        <StatCard title="In Transit" value={inTransit} color="purple" icon={<Truck size={24} />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h3 className="font-bold text-gray-800">Recent Stock Movements {branch !== 'all' && <span className="text-xs text-gray-400 font-normal">— {fmtLocation(branch)}</span>}</h3>
              <Button size="sm" variant="secondary" onClick={() => {
                const rows = filteredMovements.slice(0,15).map(r => `<tr><td>${formatDateTime(r.created_at)}</td><td>${r.product_name||''}</td><td>${r.movement_type||'Movement'}</td><td>${r.quantity||''}</td><td>${r.location||''}</td></tr>`).join('');
                printDocument('Recent Stock Movements', `<table><thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>Location</th></tr></thead><tbody>${rows}</tbody></table>`);
              }}><Printer size={14} /> Print</Button>
            </div>
          </CardHeader>
          <Table
            columns={[
              { header: 'Date', render: r => formatDateTime(r.created_at) },
              { header: 'Product', key: 'product_name' },
              { header: 'Type', render: r => <Badge variant={r.movement_type === 'in' ? 'success' : 'warning'}>{r.movement_type || 'Movement'}</Badge> },
              { header: 'Qty', key: 'quantity' },
              { header: 'Location', render: r => <span className="text-xs">{fmtLocation(r.location)}</span> },
            ]}
            data={filteredMovements.slice(0, 15)}
            emptyMessage="No recent movements"
          />
        </Card>

        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Stock by Location</h3></CardHeader>
          <CardBody>
            {(() => {
              const byLoc = {};
              filteredBatches.forEach(b => {
                const label = fmtLocation(b.location || 'unknown');
                if (!byLoc[label]) byLoc[label] = { qty: 0, value: 0 };
                const qty = Number(b.quantity || 0);
                byLoc[label].qty += qty;
                byLoc[label].value += qty * Number(b.unit_price || 0);
              });
              const entries = Object.entries(byLoc).sort((a, b) => b[1].value - a[1].value);
              return entries.length > 0 ? entries.map(([loc, d]) => (
                <div key={loc} className="flex justify-between items-center py-3 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="font-medium text-gray-800">{loc}</p>
                    <p className="text-xs text-gray-500">{d.qty.toLocaleString()} units</p>
                  </div>
                  <span className="font-bold text-gray-700">{formatCurrency(d.value)}</span>
                </div>
              )) : <p className="text-sm text-gray-400 text-center py-4">No stock data for this filter</p>;
            })()}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function SupplierImportTab() {
  const [showForm, setShowForm] = useState(false);
  const [imports, setImports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);
  const [adjRecord, setAdjRecord] = useState(null);
  const [items, setItems] = useState([{ product_name: '', quantity: '', cif_price: '', carton_no: '', expiry_date: '', batch_number: '' }]);
  const [form, setForm] = useState({ supplier: 'Dynapharm International (Malaysia)', shipping_ref: '', arrival_date: '', notes: '' });
  const [errors, setErrors] = useState({});
  const [productOptions, setProductOptions] = useState(PRICE_LIST.map(p => p.description).sort());

  useEffect(() => {
    const loadData = async () => {
      try {
        const [batchData, priceData, prodData] = await Promise.allSettled([
          api.stock.batches(),
          api.prices.list(),
          api.products.list(),
        ]);
        if (batchData.status === 'fulfilled') {
          const all = Array.isArray(batchData.value) ? batchData.value : batchData.value?.batches || [];
          setImports(all.filter(b => b.location === 'country_stock').sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
        }
        const namesSet = new Set(PRICE_LIST.map(p => p.description));
        if (priceData.status === 'fulfilled') {
          const prices = Array.isArray(priceData.value) ? priceData.value : [];
          prices.filter(p => !p.is_package && p.description).forEach(p => namesSet.add(p.description));
        }
        if (prodData.status === 'fulfilled') {
          const prods = Array.isArray(prodData.value) ? prodData.value : prodData.value?.products || [];
          prods.filter(p => p.name).forEach(p => namesSet.add(p.name));
        }
        setProductOptions([...namesSet].sort());
      } catch (_) {}
      finally { setLoading(false); }
    };
    loadData();
  }, []);

  const addItem = () => setItems(prev => [...prev, { product_name: '', quantity: '', cif_price: '', carton_no: '', expiry_date: '', batch_number: '' }]);
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = (idx, field, value) => {
    setItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      if (field === 'product_name') {
        const cif = getCIFPrice(value);
        if (cif > 0) updated[idx].cif_price = String(cif);
      }
      return updated;
    });
  };

  const validateItems = () => {
    const errs = {};
    items.forEach((item, idx) => {
      if (!item.product_name) errs[`${idx}_product`] = true;
      if (!item.quantity || Number(item.quantity) <= 0) errs[`${idx}_qty`] = true;
      if (!item.carton_no?.trim()) errs[`${idx}_carton`] = true;
      if (!item.expiry_date) errs[`${idx}_expiry`] = true;
      if (!item.batch_number?.trim()) errs[`${idx}_batch`] = true;
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateItems()) {
      setAlert({ type: 'error', msg: 'All mandatory fields required: Product, Carton No, Expiry Date, Quantity, Batch Number' });
      return;
    }
    const validItems = items.filter(i => i.product_name && Number(i.quantity) > 0);
    if (validItems.length === 0) {
      setAlert({ type: 'error', msg: 'Add at least one product with quantity' });
      return;
    }
    setSubmitting(true);
    try {
      for (const item of validItems) {
        await api.stock.createBatch({
          product_name: item.product_name,
          quantity: Number(item.quantity),
          batch_number: item.batch_number || form.shipping_ref || `IMP-${Date.now()}`,
          expiry_date: item.expiry_date || null,
          unit_price: Number(item.cif_price) || getCIFPrice(item.product_name),
          location: 'country_stock',
          notes: `Supplier: ${form.supplier} | Ref: ${form.shipping_ref} | Carton: ${item.carton_no} | ${form.notes}`,
          metadata: JSON.stringify({ carton_no: item.carton_no, shipping_ref: form.shipping_ref, arrival_date: form.arrival_date }),
        });
      }
      setAlert({ type: 'success', msg: `${validItems.length} product(s) imported to Country Stock successfully` });
      setItems([{ product_name: '', quantity: '', cif_price: '', carton_no: '', expiry_date: '', batch_number: '' }]);
      setForm({ supplier: 'Dynapharm International (Malaysia)', shipping_ref: '', arrival_date: '', notes: '' });
      setShowForm(false);
      const d = await api.stock.batches().catch(() => []);
      const all = Array.isArray(d) ? d : d.batches || [];
      setImports(all.filter(b => b.location === 'country_stock').sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const totalCIF = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.cif_price) || 0), 0);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} className="mb-4">{alert.msg}</Alert>}

      <Card className="bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200">
        <CardBody>
          <div className="flex items-start gap-4">
            <Ship size={32} className="text-blue-600 mt-1" />
            <div>
              <h3 className="font-bold text-blue-900">Supplier Import from Malaysia</h3>
              <p className="text-sm text-blue-700 mt-1">
                Record stock shipments from Dynapharm International Malaysia. CIF (Cost, Insurance, Freight) prices are auto-populated from the price list.
                Stock arrives at Country Stock level, then gets distributed to warehouses and branches.
              </p>
              <p className="text-xs text-blue-600 mt-1 font-semibold">
                Mandatory fields per item: Product/Description, Carton No, Expiry Date, Quantity, Batch Number
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">Supplier Import Shipments</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => {
                const rows = imports.slice(0, 50).map(r => `<tr><td>${formatDateTime(r.created_at)}</td><td>${r.product_name||''}</td><td>${r.batch_number||''}</td><td>${r.expiry_date?formatDate(r.expiry_date):'-'}</td><td>${r.quantity||''}</td><td>${formatCurrency(Number(r.unit_price||0))}</td><td>${formatCurrency(Number(r.quantity||0)*Number(r.unit_price||0))}</td></tr>`).join('');
                printDocument('Supplier Import Shipments', `<table><thead><tr><th>Date</th><th>Product</th><th>Batch #</th><th>Expiry</th><th>Qty</th><th>CIF Price</th><th>CIF Total</th></tr></thead><tbody>${rows}</tbody></table>`);
              }}><Printer size={14} /> Print</Button>
              <Button size="sm" onClick={() => setShowForm(true)}><Plus size={16} /> New Import Shipment</Button>
            </div>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Date', render: r => formatDateTime(r.created_at) },
            { header: 'Product', key: 'product_name' },
            { header: 'Batch #', key: 'batch_number' },
            { header: 'Expiry', render: r => r.expiry_date ? formatDate(r.expiry_date) : '-' },
            { header: 'Qty', key: 'quantity' },
            { header: 'CIF Price', render: r => formatCurrency(Number(r.unit_price || 0)) },
            { header: 'CIF Total', render: r => formatCurrency(Number(r.quantity || 0) * Number(r.unit_price || 0)) },
            { header: 'Edit', render: r => (
              <button onClick={() => setAdjRecord(r)} title="Request correction (requires GM approval)"
                style={{ padding: '4px 10px', background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 6, cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Edit2 size={12} /> Edit
              </button>
            )},
          ]}
          data={imports.slice(0, 50)}
          emptyMessage="No import shipments recorded"
        />
      </Card>

      <RequestAdjustmentModal
        open={!!adjRecord} onClose={() => setAdjRecord(null)}
        record={adjRecord} targetType="import" location="country_stock"
        onSuccess={() => setAlert({ type: 'success', msg: 'Edit request submitted — awaiting GM approval' })}
      />

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Record Import Shipment from Malaysia" size="lg">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Supplier" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} />
            <Input label="Shipping Reference / B/L No." value={form.shipping_ref} onChange={e => setForm(f => ({ ...f, shipping_ref: e.target.value }))} placeholder="e.g. BL-2026-0042" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Arrival Date" type="date" value={form.arrival_date} onChange={e => setForm(f => ({ ...f, arrival_date: e.target.value }))} />
            <Input label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Container no., remarks..." />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">Products in Shipment <span className="text-red-500">*</span></label>
              <Button type="button" size="sm" variant="secondary" onClick={addItem}><Plus size={14} /> Add Product</Button>
            </div>
            <div className="text-xs text-gray-500 mb-2 bg-yellow-50 border border-yellow-200 rounded p-2">
              All fields are mandatory: Product/Description, Carton No, Expiry Date, Quantity, Batch Number
            </div>
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-12 md:col-span-4">
                      <label className="text-xs text-gray-500 mb-1 block">Product/Description *</label>
                      <input
                        list={`prod-list-${idx}`}
                        className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 ${errors[`${idx}_product`] ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'}`}
                        value={item.product_name}
                        onChange={e => updateItem(idx, 'product_name', e.target.value)}
                        placeholder="Type to search products..."
                        autoComplete="off"
                      />
                      <datalist id={`prod-list-${idx}`}>
                        {productOptions.map(name => <option key={name} value={name} />)}
                      </datalist>
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className="text-xs text-gray-500 mb-1 block">Carton No *</label>
                      <input className={`w-full px-3 py-2 rounded-lg border text-sm ${errors[`${idx}_carton`] ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} placeholder="CTN-001" value={item.carton_no} onChange={e => updateItem(idx, 'carton_no', e.target.value)} />
                    </div>
                    <div className="col-span-4 md:col-span-2">
                      <label className="text-xs text-gray-500 mb-1 block">Expiry Date *</label>
                      <input type="date" className={`w-full px-3 py-2 rounded-lg border text-sm ${errors[`${idx}_expiry`] ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} value={item.expiry_date} onChange={e => updateItem(idx, 'expiry_date', e.target.value)} />
                    </div>
                    <div className="col-span-4 md:col-span-1">
                      <label className="text-xs text-gray-500 mb-1 block">Qty *</label>
                      <input type="number" min="1" className={`w-full px-3 py-2 rounded-lg border text-sm ${errors[`${idx}_qty`] ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} placeholder="0" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} />
                    </div>
                    <div className="col-span-6 md:col-span-2">
                      <label className="text-xs text-gray-500 mb-1 block">Batch # *</label>
                      <input className={`w-full px-3 py-2 rounded-lg border text-sm ${errors[`${idx}_batch`] ? 'border-red-400 bg-red-50' : 'border-gray-300'}`} placeholder="B001" value={item.batch_number} onChange={e => updateItem(idx, 'batch_number', e.target.value)} />
                    </div>
                    <div className="col-span-6 md:col-span-1 flex items-end gap-1">
                      {items.length > 1 && <Button type="button" size="sm" variant="danger" onClick={() => removeItem(idx)}>×</Button>}
                    </div>
                  </div>
                  <div className="grid grid-cols-12 gap-2 items-center mt-2">
                    <div className="col-span-4 md:col-span-2">
                      <label className="text-xs text-gray-500 mb-1 block">CIF Price (N$)</label>
                      <input type="number" min="0" step="0.01" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" placeholder="Auto" value={item.cif_price} onChange={e => updateItem(idx, 'cif_price', e.target.value)} />
                    </div>
                    <div className="col-span-4 md:col-span-2 text-sm font-medium text-gray-700 pt-5">
                      CIF Total: {formatCurrency((Number(item.quantity) || 0) * (Number(item.cif_price) || 0))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-right mt-3 font-bold text-gray-800">
              Total CIF Value: {formatCurrency(totalCIF)}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={submitting}><Ship size={16} /> {submitting ? 'Importing...' : 'Record Import'}</Button>
            <Button variant="secondary" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function CountryStockTab() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDetail, setShowDetail] = useState(false);
  const [adjRecord, setAdjRecord] = useState(null);

  const loadBatches = useCallback(() => {
    setLoading(true);
    api.stock.batches()
      .then(d => {
        const all = Array.isArray(d) ? d : d.batches || [];
        setBatches(all.filter(b => b.location === 'country_stock'));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadBatches(); }, [loadBatches]);

  if (loading) return <LoadingSpinner />;

  const totalQty = batches.reduce((s, b) => s + Number(b.quantity || 0), 0);
  const totalValue = batches.reduce((s, b) => s + Number(b.quantity || 0) * Number(b.unit_price || 0), 0);

  const byProduct = {};
  batches.forEach(b => {
    const name = b.product_name || 'Unknown';
    if (!byProduct[name]) byProduct[name] = { product_name: name, total_qty: 0, total_value: 0, batch_count: 0, earliest_expiry: null };
    byProduct[name].total_qty += Number(b.quantity || 0);
    byProduct[name].total_value += Number(b.quantity || 0) * Number(b.unit_price || 0);
    byProduct[name].batch_count += 1;
    if (b.expiry_date) {
      const d = b.expiry_date;
      if (!byProduct[name].earliest_expiry || d < byProduct[name].earliest_expiry) byProduct[name].earliest_expiry = d;
    }
  });
  const productRows = Object.values(byProduct).sort((a, b) => b.total_qty - a.total_qty);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Distinct Products" value={productRows.length} color="blue" icon={<Globe size={24} />} />
        <StatCard title="Total Units" value={totalQty.toLocaleString()} color="green" icon={<Package size={24} />} />
        <StatCard title="Total CIF Value" value={formatCurrency(totalValue)} color="purple" icon={<DollarSign size={24} />} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div>
              <h3 className="font-bold text-gray-800">Country Stock — Product Summary</h3>
              <p className="text-xs text-gray-500 mt-0.5">Inventory received via Supplier Import. Use the Supplier Import tab to add new shipments.</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setShowDetail(v => !v)}>
                {showDetail ? 'Show Summary' : 'Show Batch Detail'}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => {
                const rows = productRows.map(r => `<tr><td>${r.product_name||''}</td><td>${r.batch_count||0}</td><td>${r.total_qty||0}</td><td>${r.earliest_expiry?formatDate(r.earliest_expiry):'—'}</td><td>${formatCurrency(r.total_value||0)}</td></tr>`).join('');
                printDocument('Country Stock — Product Summary', `<table><thead><tr><th>Product</th><th>Batches</th><th>Total Qty</th><th>Earliest Expiry</th><th>CIF Value</th></tr></thead><tbody>${rows}</tbody></table>`);
              }}><Printer size={14} /> Print</Button>
            </div>
          </div>
        </CardHeader>
        {!showDetail ? (
          <Table
            columns={[
              { header: 'Product', render: r => <span className="font-medium text-gray-800">{r.product_name}</span> },
              { header: 'Batches', render: r => <span className="text-sm text-gray-500">{r.batch_count}</span> },
              { header: 'Total Qty', render: r => (
                <span className={r.total_qty < 10 ? 'text-red-600 font-bold' : r.total_qty < 50 ? 'text-amber-600 font-semibold' : 'text-green-700 font-semibold'}>
                  {r.total_qty.toLocaleString()}
                </span>
              )},
              { header: 'Earliest Expiry', render: r => r.earliest_expiry ? formatDate(r.earliest_expiry) : '—' },
              { header: 'CIF Value', render: r => formatCurrency(r.total_value) },
            ]}
            data={productRows}
            emptyMessage="No country stock yet — record a supplier import to populate this."
          />
        ) : (
          <Table
            columns={[
              { header: 'Product', key: 'product_name' },
              { header: 'Batch #', render: r => r.batch_number || '—' },
              { header: 'Quantity', render: r => <span className={Number(r.quantity) < 10 ? 'text-red-600 font-bold' : 'font-medium'}>{r.quantity}</span> },
              { header: 'Expiry', render: r => r.expiry_date ? formatDate(r.expiry_date) : '—' },
              { header: 'CIF/Unit', render: r => formatCurrency(Number(r.unit_price || 0)) },
              { header: 'Notes', render: r => <span className="text-xs text-gray-500 truncate max-w-xs block">{r.notes || '—'}</span> },
              { header: 'Edit', render: r => (
                <button onClick={() => setAdjRecord(r)} title="Request correction"
                  style={{ padding: '4px 10px', background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 6, cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Edit2 size={12} /> Edit
                </button>
              )},
            ]}
            data={batches}
            emptyMessage="No country stock batches found."
          />
        )}
      </Card>

      <RequestAdjustmentModal
        open={!!adjRecord} onClose={() => setAdjRecord(null)}
        record={adjRecord} targetType="country_stock" location="country_stock"
      />
    </div>
  );
}

function WarehouseTab({ name }) {
  const [batches, setBatches] = useState([]);
  const [incomingTransfers, setIncomingTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTransfer, setShowTransfer] = useState(false);
  const [form, setForm] = useState({ product_name: '', quantity: '' });
  const [submitting, setSubmitting] = useState(false);
  const [receivingId, setReceivingId] = useState(null);
  const [alert, setAlert] = useState(null);
  const [adjRecord, setAdjRecord] = useState(null);
  const location = name.toLowerCase() + '_warehouse';

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.stock.batches().then(d => (Array.isArray(d) ? d : d.batches || []).filter(b => b.location === location)),
      api.stock.transfers(`branch=${encodeURIComponent(location)}`).then(d => Array.isArray(d) ? d : d.transfers || []),
    ])
      .then(([batchData, transferData]) => {
        setBatches(batchData);
        setIncomingTransfers(transferData.filter(t => t.status !== 'cancelled'));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [location]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleMarkReceived = async (transfer) => {
    setReceivingId(transfer.id);
    try {
      await api.stock.createBatch({
        product_name: transfer.product_name,
        quantity: transfer.quantity,
        location,
        batch_number: `RCV-${transfer.id.slice(-6).toUpperCase()}`,
        notes: `Received from transfer ${transfer.id}`,
      });
      await api.stock.updateTransfer(transfer.id, { status: 'received' });
      setAlert({ type: 'success', msg: `${transfer.product_name} (qty ${transfer.quantity}) received into ${name} warehouse` });
      loadData();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message || 'Failed to receive transfer' });
    } finally {
      setReceivingId(null);
    }
  };

  const handleTransferIn = async (e) => {
    e.preventDefault();
    if (!form.product_name || !form.quantity || Number(form.quantity) <= 0) {
      setAlert({ type: 'error', msg: 'Product and quantity are required' });
      return;
    }
    setSubmitting(true);
    try {
      await api.stock.createTransfer({
        from_location: 'country_stock',
        to_location: location,
        product_name: form.product_name,
        quantity: Number(form.quantity),
      });
      setAlert({ type: 'success', msg: `Transfer to ${name} warehouse initiated` });
      setForm({ product_name: '', quantity: '' });
      setShowTransfer(false);
      loadData();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const statusColor = { pending: 'warning', dispatched: 'info', received: 'success', cancelled: 'default' };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} className="mb-2" onClose={() => setAlert(null)}>{alert.msg}</Alert>}

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">{name} Warehouse — Current Inventory</h3>
            <Button size="sm" onClick={() => setShowTransfer(true)}><Plus size={16} className="mr-1" /> Request Transfer In</Button>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Product', key: 'product_name' },
            { header: 'Batch Ref', key: 'batch_number' },
            { header: 'Quantity', render: r => <span className={Number(r.quantity) < 10 ? 'text-red-600 font-bold' : 'font-medium'}>{r.quantity}</span> },
            { header: 'Expiry', render: r => r.expiry_date ? formatDateTime(r.expiry_date) : '—' },
            { header: 'Edit', render: r => (
              <button onClick={() => setAdjRecord(r)} title="Request correction (requires GM approval)"
                style={{ padding: '4px 10px', background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 6, cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Edit2 size={12} /> Edit
              </button>
            )},
          ]}
          data={batches}
          emptyMessage={`No confirmed stock in ${name} warehouse yet`}
        />
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-bold text-gray-800">{name} Warehouse — Incoming Transfers</h3>
          <p className="text-xs text-gray-500 mt-0.5">Stock transferred to this warehouse. Click "Mark Received" to add it to inventory.</p>
        </CardHeader>
        <Table
          columns={[
            { header: 'Product', render: r => <span className="font-medium">{r.product_name}</span> },
            { header: 'Qty', render: r => <span className="font-semibold text-primary">{r.quantity}</span> },
            { header: 'From', render: r => <span className="text-xs text-gray-600">{(r.from_location || r.fromWarehouse || '—').replace(/_/g, ' ')}</span> },
            { header: 'Status', render: r => <Badge variant={statusColor[r.status] || 'default'}>{r.status}</Badge> },
            { header: 'Date', render: r => formatDate(r.created_at || r.createdAt) },
            {
              header: 'Action',
              render: r => r.status === 'received' ? (
                <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle size={14} /> Received</span>
              ) : (
                <Button
                  size="sm"
                  variant="success"
                  onClick={() => handleMarkReceived(r)}
                  disabled={receivingId === r.id}
                >
                  {receivingId === r.id ? 'Receiving...' : 'Mark Received'}
                </Button>
              ),
            },
          ]}
          data={incomingTransfers}
          emptyMessage={`No incoming transfers for ${name} warehouse`}
        />
      </Card>

      <Modal open={showTransfer} onClose={() => setShowTransfer(false)} title={`Request Stock Transfer to ${name} Warehouse`} size="md">
        <form onSubmit={handleTransferIn} className="p-6 space-y-4">
          <Alert type="info">This will create a transfer request from Country Stock to {name} Warehouse.</Alert>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Product</label>
            <select
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
              value={form.product_name}
              onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
              required
            >
              <option value="">Select a product...</option>
              {getLiveProductList().map(p => (
                <option key={p.description} value={p.description}>{p.description}</option>
              ))}
            </select>
          </div>
          <Input label="Quantity" type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} required />
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={submitting}>{submitting ? 'Requesting...' : 'Initiate Transfer'}</Button>
            <Button variant="secondary" type="button" onClick={() => setShowTransfer(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>

      <RequestAdjustmentModal
        open={!!adjRecord} onClose={() => setAdjRecord(null)}
        record={adjRecord} targetType="warehouse" location={location}
      />
    </div>
  );
}

function DistributionTab({ branch }) {
  const [form, setForm] = useState({ from_location: '', to_location: branch && branch !== 'all' ? branch : '', product_name: '', quantity: '' });
  const [adjRecord, setAdjRecord] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);
  const [recentTransfers, setRecentTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [barcodeInput, setBarcodeInput] = useState('');

  useEffect(() => {
    api.stock.transfers()
      .then(d => setRecentTransfers(Array.isArray(d) ? d : d.transfers || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const warehouses = [
    { value: '', label: 'Select source...' },
    { value: 'country_stock', label: 'Country Stock' },
    { value: 'windhoek_warehouse', label: 'Windhoek Warehouse' },
    { value: 'ondangwa_warehouse', label: 'Ondangwa Warehouse' },
  ];

  const destinations = [
    { value: '', label: 'Select destination...' },
    ...BRANCHES.map(b => ({ value: b.toLowerCase().replace(/\s+/g, '_'), label: b })),
    { value: 'windhoek_warehouse', label: 'Windhoek Warehouse' },
    { value: 'ondangwa_warehouse', label: 'Ondangwa Warehouse' },
  ];

  const handleBarcodeSearch = () => {
    if (!barcodeInput) return;
    const code = barcodeInput.toUpperCase().trim();
    const idx = code.startsWith('DYN-') ? parseInt(code.replace('DYN-', ''), 10) : -1;
    if (idx >= 0 && idx < PRICE_LIST.length) {
      setForm(f => ({ ...f, product_name: PRICE_LIST[idx].description }));
      setAlert({ type: 'success', msg: `Product found: ${PRICE_LIST[idx].description}` });
    } else {
      const found = getLiveProductList().find(p => p.description.toLowerCase().includes(barcodeInput.toLowerCase()));
      if (found) {
        setForm(f => ({ ...f, product_name: found.description }));
        setAlert({ type: 'success', msg: `Product found: ${found.description}` });
      } else {
        setAlert({ type: 'error', msg: 'Product not found for scanned barcode' });
      }
    }
    setBarcodeInput('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.from_location || !form.to_location || !form.product_name || !form.quantity) {
      setAlert({ type: 'error', msg: 'All fields are required' });
      return;
    }
    if (form.from_location === form.to_location) {
      setAlert({ type: 'error', msg: 'Source and destination must be different' });
      return;
    }
    setSubmitting(true);
    try {
      await api.stock.createTransfer({
        from_location: form.from_location,
        to_location: form.to_location,
        product_name: form.product_name,
        quantity: Number(form.quantity),
      });
      setAlert({ type: 'success', msg: 'Distribution transfer created successfully' });
      setForm({ from_location: '', to_location: '', product_name: '', quantity: '' });
      const d = await api.stock.transfers().catch(() => []);
      setRecentTransfers(Array.isArray(d) ? d : d.transfers || []);
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  // Only warehouse→branch transfers
  const WAREHOUSE_KEYS = ['country_stock', 'windhoek_warehouse', 'ondangwa_warehouse'];
  const distTransfers = recentTransfers.filter(t => {
    const from = (t.from_location || '').toLowerCase().replace(/\s+/g, '_');
    const to = (t.to_location || '').toLowerCase().replace(/\s+/g, '_');
    const fromIsWarehouse = WAREHOUSE_KEYS.includes(from);
    const toIsBranch = !WAREHOUSE_KEYS.includes(to);
    if (!fromIsWarehouse || !toIsBranch) return false;
    if (branch !== 'all') {
      return to === branch || from === branch;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} className="mb-4">{alert.msg}</Alert>}

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Create Distribution Transfer</h3></CardHeader>
        <CardBody>
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <label className="text-sm font-medium text-blue-800 block mb-1">Barcode Scan / Search</label>
            <div className="flex gap-2">
              <input
                className="flex-1 px-3 py-2 rounded-lg border border-blue-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                placeholder="Scan barcode or type product code (e.g. DYN-0001)..."
                value={barcodeInput}
                onChange={e => setBarcodeInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleBarcodeSearch(); } }}
              />
              <Button type="button" size="sm" onClick={handleBarcodeSearch}>Search</Button>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select label="Source Warehouse" options={warehouses} value={form.from_location} onChange={e => setForm(f => ({ ...f, from_location: e.target.value }))} />
              <Select label="Destination" options={destinations} value={form.to_location} onChange={e => setForm(f => ({ ...f, to_location: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Product (or use barcode scan above)</label>
                <select
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                  value={form.product_name}
                  onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
                  required
                >
                  <option value="">Select product...</option>
                  {getLiveProductList().map(p => (
                    <option key={p.description} value={p.description}>{p.description}</option>
                  ))}
                </select>
              </div>
              <Input label="Quantity" type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} required />
            </div>
            <Button type="submit" disabled={submitting}><Truck size={16} /> {submitting ? 'Creating...' : 'Create Distribution'}</Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">Recent Distribution Transfers <span className="text-xs font-normal text-gray-400">(Warehouse → Branch)</span></h3>
            <Button size="sm" variant="secondary" onClick={() => {
              const rows = distTransfers.map(r => `<tr><td>${formatDateTime(r.created_at)}</td><td>${fmtLocation(r.from_location)||''}</td><td>${fmtLocation(r.to_location)||''}</td><td>${r.product_name||''}</td><td>${r.quantity||''}</td><td>${r.status||'Pending'}</td></tr>`).join('');
              printDocument('Distribution Transfers', `<table><thead><tr><th>Date</th><th>From</th><th>To</th><th>Product</th><th>Qty</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`);
            }}><Printer size={14} /> Print Report</Button>
          </div>
        </CardHeader>
        {loading ? <LoadingSpinner /> : (
          <Table
            columns={[
              { header: 'Date', render: r => formatDateTime(r.created_at) },
              { header: 'From', render: r => <span className="text-xs font-medium">{fmtLocation(r.from_location)}</span> },
              { header: 'To', render: r => <span className="text-xs font-medium text-blue-700">{fmtLocation(r.to_location)}</span> },
              { header: 'Product', key: 'product_name' },
              { header: 'Qty', key: 'quantity' },
              { header: 'Status', render: r => <Badge variant={r.status === 'completed' || r.status === 'delivered' ? 'success' : r.status === 'in_transit' || r.status === 'dispatched' ? 'info' : 'warning'}>{r.status || 'Pending'}</Badge> },
              { header: '', render: r => (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => printDocument(`Dispatch Note — ${r.product_name}`, `<table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody><tr><td>Transfer ID</td><td>${r.id||''}</td></tr><tr><td>Date</td><td>${formatDateTime(r.created_at)}</td></tr><tr><td>From</td><td>${fmtLocation(r.from_location)||''}</td></tr><tr><td>To</td><td>${fmtLocation(r.to_location)||''}</td></tr><tr><td>Product</td><td>${r.product_name||''}</td></tr><tr><td>Quantity</td><td>${r.quantity||''}</td></tr><tr><td>Status</td><td>${r.status||'Pending'}</td></tr></tbody></table>`)}>
                    <Printer size={12} />
                  </Button>
                  <button onClick={() => setAdjRecord(r)} title="Request correction"
                    style={{ padding: '3px 8px', background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 6, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>
                    <Edit2 size={11} />
                  </button>
                </div>
              )},
            ]}
            data={distTransfers}
            emptyMessage={branch !== 'all' ? `No distribution transfers for ${fmtLocation(branch)}` : 'No distribution transfers'}
          />
        )}
      </Card>

      <RequestAdjustmentModal
        open={!!adjRecord} onClose={() => setAdjRecord(null)}
        record={adjRecord} targetType="distribution" location={adjRecord?.from_location || ''}
      />
    </div>
  );
}

// ── Reusable multi-product cart picker ─────────────────────────────────────────
function ProductMultiCart({ cart, onCartChange }) {
  const [search, setSearch] = useState('');
  const allProducts = getLiveProductList();
  const filtered = search.trim()
    ? allProducts.filter(p => p.description.toLowerCase().includes(search.toLowerCase()))
    : allProducts;

  const addItem = (p) => {
    const existing = cart.find(c => c.description === p.description);
    if (existing) {
      onCartChange(cart.map(c => c.description === p.description ? { ...c, qty: c.qty + 1 } : c));
    } else {
      onCartChange([...cart, { description: p.description, qty: 1, dp: p.dp, cif: p.cif }]);
    }
  };

  const setQty = (desc, qty) => {
    if (qty < 1) { onCartChange(cart.filter(c => c.description !== desc)); return; }
    onCartChange(cart.map(c => c.description === desc ? { ...c, qty } : c));
  };

  const removeItem = (desc) => onCartChange(cart.filter(c => c.description !== desc));

  return (
    <div style={{ display: 'flex', gap: 12, minHeight: 340 }}>
      {/* Left: product search list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', border: '1.5px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search products by name…"
              style={{ width: '100%', padding: '7px 10px 7px 30px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.84rem', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
          {filtered.slice(0, 100).map(p => {
            const inCart = cart.find(c => c.description === p.description);
            return (
              <div key={p.description} onClick={() => addItem(p)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 9px', borderRadius: 7, marginBottom: 3, cursor: 'pointer', background: inCart ? '#fff0f3' : '#fff', border: inCart ? '1.5px solid #fecdd3' : '1px solid #f1f5f9', transition: 'background 0.1s' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: inCart ? 700 : 500, color: inCart ? '#c41e3a' : '#1e293b', flex: 1, paddingRight: 8 }}>{p.description}</span>
                {inCart
                  ? <span style={{ background: '#c41e3a', color: '#fff', borderRadius: 99, padding: '2px 9px', fontSize: '0.75rem', fontWeight: 800 }}>{inCart.qty} ✓</span>
                  : <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>+ Add</span>}
              </div>
            );
          })}
          {filtered.length === 0 && <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem', paddingTop: 24 }}>No products found</p>}
        </div>
        <div style={{ padding: '6px 12px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: '0.75rem', color: '#94a3b8' }}>
          Showing {Math.min(filtered.length, 100)} of {filtered.length} products
        </div>
      </div>
      {/* Right: cart */}
      <div style={{ width: 230, flexShrink: 0, display: 'flex', flexDirection: 'column', border: '1.5px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: '0.83rem', color: '#374151' }}>📋 Selected ({cart.length})</p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
          {cart.length === 0
            ? <p style={{ color: '#94a3b8', fontSize: '0.8rem', textAlign: 'center', paddingTop: 20 }}>Click products to add them</p>
            : cart.map(item => (
              <div key={item.description} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ flex: 1, fontSize: '0.77rem', fontWeight: 600, color: '#1e293b', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.description}>{item.description}</span>
                <button onClick={() => setQty(item.description, item.qty - 1)} style={{ width: 20, height: 20, border: '1px solid #fecaca', borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#c41e3a', fontWeight: 700, fontSize: '0.8rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                <input type="number" min="1" value={item.qty} onChange={e => setQty(item.description, Number(e.target.value))}
                  style={{ width: 36, textAlign: 'center', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: '0.8rem', fontWeight: 700, padding: '1px 2px' }} />
                <button onClick={() => setQty(item.description, item.qty + 1)} style={{ width: 20, height: 20, border: '1px solid #fecaca', borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#c41e3a', fontWeight: 700, fontSize: '0.8rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                <button onClick={() => removeItem(item.description)} style={{ width: 18, height: 18, border: 'none', borderRadius: 4, background: '#fef2f2', cursor: 'pointer', color: '#ef4444', fontWeight: 800, fontSize: '0.75rem', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
// ── End ProductMultiCart ────────────────────────────────────────────────────────

function TransfersTab({ branch }) {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [cart, setCart] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);

  const loadTransfers = useCallback(() => {
    setLoading(true);
    api.stock.transfers()
      .then(d => setTransfers(Array.isArray(d) ? d : d.transfers || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadTransfers(); }, [loadTransfers]);

  const locations = [
    { value: '', label: 'Select location...' },
    { value: 'country_stock', label: 'Country Stock' },
    { value: 'windhoek_warehouse', label: 'Windhoek Warehouse' },
    { value: 'ondangwa_warehouse', label: 'Ondangwa Warehouse' },
    ...BRANCHES.map(b => ({ value: b.toLowerCase().replace(/\s+/g, '_'), label: b })),
  ];

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!fromLocation || !toLocation) {
      setAlert({ type: 'error', msg: 'From and To locations are required' });
      return;
    }
    if (cart.length === 0) {
      setAlert({ type: 'error', msg: 'Select at least one product' });
      return;
    }
    setSubmitting(true);
    try {
      for (const item of cart) {
        await api.stock.createTransfer({
          from_location: fromLocation,
          to_location: toLocation,
          product_name: item.description,
          quantity: Number(item.qty),
        });
      }
      setAlert({ type: 'success', msg: `${cart.length} transfer${cart.length !== 1 ? 's' : ''} created successfully` });
      setCart([]);
      setFromLocation('');
      setToLocation('');
      setShowNew(false);
      loadTransfers();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id, newStatus) => {
    try {
      await api.stock.updateTransfer(id, { status: newStatus });
      setAlert({ type: 'success', msg: `Transfer marked as ${newStatus}` });
      loadTransfers();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    }
  };

  if (loading) return <LoadingSpinner />;

  const filteredTransfers = branch === 'all' ? transfers : transfers.filter(t =>
    (t.from_location || '').toLowerCase().replace(/\s+/g, '_') === branch ||
    (t.to_location || '').toLowerCase().replace(/\s+/g, '_') === branch
  );

  return (
    <div>
      {alert && <Alert type={alert.type} className="mb-4">{alert.msg}</Alert>}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">
              Stock Transfers {branch !== 'all' && <span className="text-xs font-normal text-gray-400 ml-1">— {fmtLocation(branch)} ({filteredTransfers.length})</span>}
            </h3>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => {
                const rows = filteredTransfers.map(r => `<tr><td>${formatDateTime(r.created_at)}</td><td>${fmtLocation(r.from_location)}</td><td>${fmtLocation(r.to_location)}</td><td>${r.product_name||''}</td><td>${r.quantity||''}</td><td>${r.status||'Pending'}</td></tr>`).join('');
                printDocument('Stock Transfers Report', `<table><thead><tr><th>Date</th><th>From</th><th>To</th><th>Product</th><th>Qty</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`);
              }}><Printer size={14} /> Print Report</Button>
              <Button size="sm" onClick={() => setShowNew(true)}><Plus size={16} /> New Transfer</Button>
            </div>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Date', render: r => formatDateTime(r.created_at) },
            { header: 'From', render: r => <span className="text-xs">{fmtLocation(r.from_location)}</span> },
            { header: 'To', render: r => <span className="text-xs">{fmtLocation(r.to_location)}</span> },
            { header: 'Product', key: 'product_name' },
            { header: 'Qty', key: 'quantity' },
            { header: 'Status', render: r => <Badge variant={r.status === 'completed' || r.status === 'delivered' ? 'success' : r.status === 'in_transit' || r.status === 'dispatched' ? 'info' : 'warning'}>{r.status || 'Pending'}</Badge> },
            { header: 'Notes', render: r => {
              const note = r.notes || (r.metadata && r.metadata.notes) || (typeof r.metadata === 'string' ? (() => { try { return JSON.parse(r.metadata).notes; } catch { return ''; } })() : '');
              return note ? <span className="text-xs text-gray-500 truncate max-w-[120px] block" title={note}>{note}</span> : <span className="text-xs text-gray-300">—</span>;
            }},
            { header: 'Actions', render: r => (
              <div className="flex gap-1 flex-wrap">
                {(!r.status || r.status === 'pending') && (
                  <Button size="sm" variant="warning" onClick={() => updateStatus(r.id, 'dispatched')}>Dispatch</Button>
                )}
                {r.status === 'dispatched' && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus(r.id, 'in_transit')}>In Transit</Button>
                )}
                {(r.status === 'dispatched' || r.status === 'in_transit') && (
                  <Button size="sm" variant="success" onClick={() => updateStatus(r.id, 'delivered')}>Delivered</Button>
                )}
                <Button size="sm" variant="ghost" title="Print dispatch note" onClick={() => printDocument(`Dispatch Note — ${r.product_name}`, `<table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody><tr><td><b>Transfer ID</b></td><td>${r.id||''}</td></tr><tr><td><b>Date</b></td><td>${formatDateTime(r.created_at)}</td></tr><tr><td><b>From</b></td><td>${fmtLocation(r.from_location)}</td></tr><tr><td><b>To</b></td><td>${fmtLocation(r.to_location)}</td></tr><tr><td><b>Product</b></td><td>${r.product_name||''}</td></tr><tr><td><b>Quantity</b></td><td>${r.quantity||''}</td></tr><tr><td><b>Status</b></td><td>${r.status||'Pending'}</td></tr><tr><td><b>Notes</b></td><td>${r.notes||'-'}</td></tr></tbody></table>`)}><Printer size={12} /></Button>
              </div>
            )},
          ]}
          data={filteredTransfers}
          emptyMessage={branch !== 'all' ? `No transfers for ${fmtLocation(branch)}` : 'No transfers recorded'}
        />
      </Card>

      <Modal open={showNew} onClose={() => { setShowNew(false); setCart([]); }} title="New Stock Transfer" size="xl">
        <form onSubmit={handleCreate} className="p-6 space-y-4">
          {alert && <Alert type={alert.type}>{alert.msg}</Alert>}
          <div className="grid grid-cols-2 gap-4">
            <Select label="From Location" options={locations} value={fromLocation} onChange={e => setFromLocation(e.target.value)} />
            <Select label="To Location" options={locations} value={toLocation} onChange={e => setToLocation(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Select Products <span className="font-normal text-gray-400">(search and click to add)</span></label>
            <ProductMultiCart cart={cart} onCartChange={setCart} />
          </div>
          {cart.length > 0 && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '8px 14px', fontSize: '0.83rem', color: '#166534' }}>
              Ready to create <strong>{cart.length}</strong> transfer{cart.length !== 1 ? 's' : ''} from <strong>{fromLocation.replace(/_/g,' ')}</strong> → <strong>{toLocation.replace(/_/g,' ')}</strong>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={submitting || cart.length === 0}>{submitting ? `Creating ${cart.length} transfer${cart.length !== 1 ? 's' : ''}…` : `Create ${cart.length || ''} Transfer${cart.length !== 1 ? 's' : ''}`}</Button>
            <Button variant="secondary" type="button" onClick={() => { setShowNew(false); setCart([]); }}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function InventoryTab({ branch }) {
  const { user } = useAuth();
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);
  const [recordForm, setRecordForm] = useState({
    product_name: '',
    movement_type: 'in',
    quantity: '',
    location: branch && branch !== 'all' ? branch : 'country_stock',
    reference: '',
    notes: '',
  });

  const loadMovements = useCallback(() => {
    setLoading(true);
    api.stock.movements()
      .then(d => setMovements(Array.isArray(d) ? d : d.movements || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadMovements(); }, [loadMovements]);

  const filtered = movements.filter(m => {
    if (branch !== 'all' && (m.location || m.source_location || '').toLowerCase().replace(/\s+/g, '_') !== branch) return false;
    if (filterType && m.movement_type !== filterType) return false;
    if (filterLocation && m.location !== filterLocation) return false;
    if (searchTerm && !(m.product_name || '').toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const locations = [...new Set(movements.map(m => m.location).filter(Boolean))];
  const types = [...new Set(movements.map(m => m.movement_type).filter(Boolean))];

  const handleRecordMovement = async (e) => {
    e.preventDefault();
    if (!recordForm.product_name || !recordForm.quantity) {
      setAlert({ type: 'error', msg: 'Product and quantity are required' });
      return;
    }
    setSubmitting(true);
    try {
      await api.stock.createMovement({
        product_name: recordForm.product_name,
        movement_type: recordForm.movement_type,
        quantity: Number(recordForm.quantity),
        location: recordForm.location,
        reference: recordForm.reference,
        notes: recordForm.notes,
        recorded_by: user?.full_name || user?.username || 'Stock Manager',
      });
      setAlert({ type: 'success', msg: `Movement recorded: ${recordForm.movement_type} ${recordForm.quantity} × ${recordForm.product_name}` });
      setRecordForm({ product_name: '', movement_type: 'in', quantity: '', location: branch && branch !== 'all' ? branch : 'country_stock', reference: '', notes: '' });
      setShowRecordForm(false);
      loadMovements();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message || 'Failed to record movement' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} className="mb-2">{alert.msg}</Alert>}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">
              Stock Movements
              {branch !== 'all' && <span className="text-xs font-normal text-gray-400 ml-2">— {fmtLocation(branch)}</span>}
            </h3>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="secondary" onClick={() => {
                const rows = filtered.map(r => `<tr><td>${formatDateTime(r.created_at)}</td><td>${r.product_name||''}</td><td>${r.movement_type||'-'}</td><td>${r.quantity||''}</td><td>${fmtLocation(r.location)||''}</td><td>${r.reference||''}</td></tr>`).join('');
                printDocument('Stock Movements Report', `<table><thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>Location</th><th>Reference</th></tr></thead><tbody>${rows}</tbody></table>`);
              }}><Printer size={14} /> Print</Button>
              <div className="relative">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="pl-7 pr-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                  placeholder="Search product..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <select className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="">All Types</option>
                {types.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm" value={filterLocation} onChange={e => setFilterLocation(e.target.value)}>
                <option value="">All Locations</option>
                {locations.map(l => <option key={l} value={l}>{fmtLocation(l)}</option>)}
              </select>
              <Button size="sm" onClick={() => { setShowRecordForm(true); setAlert(null); }}>
                <Plus size={16} /> Record Movement
              </Button>
            </div>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Date', render: r => formatDateTime(r.created_at) },
            { header: 'Product', key: 'product_name' },
            { header: 'Type', render: r => <Badge variant={r.movement_type === 'in' || r.movement_type === 'received' ? 'success' : r.movement_type === 'out' || r.movement_type === 'dispatched' ? 'danger' : 'warning'}>{r.movement_type || '-'}</Badge> },
            { header: 'Quantity', render: r => <span className="font-semibold">{r.quantity}</span> },
            { header: 'Location', render: r => <span className="text-xs">{fmtLocation(r.location)}</span> },
            { header: 'Reference', render: r => <span className="text-xs text-gray-500">{r.reference || '—'}</span> },
          ]}
          data={filtered}
          emptyMessage={branch !== 'all' ? `No stock movements at ${fmtLocation(branch)}` : 'No stock movements found'}
        />
      </Card>

      <Modal open={showRecordForm} onClose={() => setShowRecordForm(false)} title="Record Stock Movement" size="md">
        <form onSubmit={handleRecordMovement} className="p-6 space-y-4">
          {alert && <Alert type={alert.type}>{alert.msg}</Alert>}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Product <span className="text-red-500">*</span></label>
            <select
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary"
              value={recordForm.product_name}
              onChange={e => setRecordForm(f => ({ ...f, product_name: e.target.value }))}
              required
            >
              <option value="">Select product...</option>
              {getLiveProductList().map(p => <option key={p.description} value={p.description}>{p.description}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Movement Type</label>
              <select
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary"
                value={recordForm.movement_type}
                onChange={e => setRecordForm(f => ({ ...f, movement_type: e.target.value }))}
              >
                <option value="in">In (Received)</option>
                <option value="out">Out (Dispatched)</option>
                <option value="adjustment">Adjustment</option>
                <option value="return">Return</option>
                <option value="write_off">Write-off</option>
              </select>
            </div>
            <Input label="Quantity" type="number" min="1" value={recordForm.quantity} onChange={e => setRecordForm(f => ({ ...f, quantity: e.target.value }))} required />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Location</label>
            <select
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary"
              value={recordForm.location}
              onChange={e => setRecordForm(f => ({ ...f, location: e.target.value }))}
            >
              <optgroup label="Warehouses">
                <option value="country_stock">Country Stock</option>
                <option value="windhoek_warehouse">Windhoek Warehouse</option>
                <option value="ondangwa_warehouse">Ondangwa Warehouse</option>
              </optgroup>
              <optgroup label="Branches">
                {BRANCHES.map(b => <option key={b} value={b.toLowerCase().replace(/\s+/g, '_')}>{b}</option>)}
              </optgroup>
            </select>
          </div>
          <Input label="Reference (optional)" placeholder="e.g. PO-001, Invoice #123, Transfer ID..." value={recordForm.reference} onChange={e => setRecordForm(f => ({ ...f, reference: e.target.value }))} />
          <Textarea label="Notes (optional)" value={recordForm.notes} onChange={e => setRecordForm(f => ({ ...f, notes: e.target.value }))} placeholder="Reason for movement, supplier info, etc..." />
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={submitting || !recordForm.product_name || !recordForm.quantity}>
              {submitting ? 'Saving...' : 'Record Movement'}
            </Button>
            <Button variant="secondary" type="button" onClick={() => setShowRecordForm(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function OrdersTab({ branch }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [cart, setCart] = useState([]);
  const [priority, setPriority] = useState('normal');
  const [requestBranch, setRequestBranch] = useState(branch && branch !== 'all' ? fmtLocation(branch) : '');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);

  const loadRequests = useCallback(() => {
    setLoading(true);
    api.stock.requests()
      .then(d => setRequests(Array.isArray(d) ? d : d.requests || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  // Update default branch when global filter changes
  useEffect(() => {
    if (branch && branch !== 'all') setRequestBranch(fmtLocation(branch));
  }, [branch]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (cart.length === 0) {
      setAlert({ type: 'error', msg: 'Select at least one product' });
      return;
    }
    if (!requestBranch) {
      setAlert({ type: 'error', msg: 'Requesting branch is required' });
      return;
    }
    setSubmitting(true);
    try {
      // Submit all items as one request with items array
      await api.stock.createRequest({
        requesting_branch: requestBranch,
        priority,
        notes,
        created_by: user?.full_name || user?.username || 'Stock Manager',
        items: cart.map(item => ({ productId: item.description, productName: item.description, quantity: Number(item.qty), unit: 'units' })),
      });
      setAlert({ type: 'success', msg: `Stock request submitted for ${requestBranch} (${cart.length} product${cart.length !== 1 ? 's' : ''})` });
      setCart([]);
      setPriority('normal');
      setNotes('');
      setShowForm(false);
      loadRequests();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  // Filter by branch
  const filteredRequests = branch === 'all' ? requests : requests.filter(r => {
    const rb = (r.requestingBranch || r.requesting_branch || '').toLowerCase().replace(/\s+/g, '_');
    return rb === branch;
  });

  return (
    <div>
      {alert && <Alert type={alert.type} className="mb-4">{alert.msg}</Alert>}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">
              Stock Orders / Requests
              {branch !== 'all' && <span className="text-xs font-normal text-gray-400 ml-2">— {fmtLocation(branch)} ({filteredRequests.length})</span>}
            </h3>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => {
                const rows = filteredRequests.map(r => {
                  const items = Array.isArray(r.items) ? r.items.map(i => `${i.productName||i.productId} ×${i.quantity}`).join('; ') : (r.product_name || '');
                  return `<tr><td>${formatDateTime(r.createdAt||r.created_at)}</td><td>${r.requestingBranch||r.requesting_branch||''}</td><td>${items}</td><td>${r.priority||'Normal'}</td><td>${r.status||'Pending'}</td><td>${r.notes||''}</td></tr>`;
                }).join('');
                printDocument('Stock Orders / Requests', `<table><thead><tr><th>Date</th><th>Branch</th><th>Items</th><th>Priority</th><th>Status</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>`);
              }}><Printer size={14} /> Print</Button>
              <Button size="sm" onClick={() => { setShowForm(true); setAlert(null); }}><Plus size={16} /> New Request</Button>
            </div>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Date', render: r => formatDateTime(r.createdAt || r.created_at) },
            { header: 'Branch', render: r => <span className="text-xs font-semibold">{r.requestingBranch || r.requesting_branch || '—'}</span> },
            { header: 'Items', render: r => {
              const items = Array.isArray(r.items) ? r.items : [];
              if (items.length === 0) return <span className="text-xs text-gray-400">—</span>;
              return <span className="text-xs">{items.map(i => `${i.productName||i.productId} ×${i.quantity}`).join(', ')}</span>;
            }},
            { header: 'Priority', render: r => <Badge variant={(r.priority||r.urgency) === 'urgent' ? 'danger' : (r.priority||r.urgency) === 'high' ? 'warning' : 'default'}>{r.priority || r.urgency || 'Normal'}</Badge> },
            { header: 'Status', render: r => <Badge variant={r.status === 'approved' || r.status === 'fulfilled' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}>{r.status || 'Pending'}</Badge> },
            { header: 'Notes', render: r => <span className="text-xs text-gray-500 truncate max-w-[140px] block">{r.notes || '—'}</span> },
          ]}
          data={filteredRequests}
          emptyMessage={branch !== 'all' ? `No requests for ${fmtLocation(branch)}` : 'No stock requests'}
        />
      </Card>

      <Modal open={showForm} onClose={() => { setShowForm(false); setCart([]); }} title="New Stock Request" size="xl">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {alert && <Alert type={alert.type}>{alert.msg}</Alert>}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Requesting Branch <span className="text-red-500">*</span></label>
              <select value={requestBranch} onChange={e => setRequestBranch(e.target.value)} required
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary">
                <option value="">Select branch...</option>
                {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <Select
              label="Priority"
              options={[
                { value: 'normal', label: 'Normal' },
                { value: 'high', label: 'High' },
                { value: 'urgent', label: 'Urgent' },
              ]}
              value={priority}
              onChange={e => setPriority(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Products to Request <span className="font-normal text-gray-400">(search and click to add)</span></label>
            <ProductMultiCart cart={cart} onCartChange={setCart} />
          </div>
          <Textarea label="Notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional details or reasons for this request..." />
          {cart.length > 0 && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '8px 14px', fontSize: '0.83rem', color: '#166534' }}>
              Ready to submit <strong>{cart.length}</strong> product request{cart.length !== 1 ? 's' : ''} for <strong>{requestBranch || '—'}</strong> — priority: <strong>{priority}</strong>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={submitting || cart.length === 0 || !requestBranch}>{submitting ? `Submitting…` : `Submit Request`}</Button>
            <Button variant="secondary" type="button" onClick={() => { setShowForm(false); setCart([]); }}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function MonthlySalesTab({ branch }) {
  const [salesData, setSalesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.orders.list().then(d => Array.isArray(d) ? d : d.orders || []).catch(() => []),
      api.branch.walkinSales().then(d => Array.isArray(d) ? d : d.sales || d.walkin_sales || []).catch(() => []),
    ]).then(([orders, walkinSales]) => {
      const allSales = [];

      orders.forEach(o => {
        const date = new Date(o.created_at || o.date);
        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const items = o.items || [];
        items.forEach(item => {
          const itemName = item.name || item.product_name || 'Unknown';
          const prod = findProductPrice(itemName);
          allSales.push({
            month,
            product_name: prod ? prod.description : itemName,
            quantity: Number(item.quantity || item.qty || 1),
            dp_price: prod ? prod.dp : Number(item.unit_price || item.price || 0),
            cif_price: prod ? prod.cif : 0,
            source: 'online',
            branch: o.branch || o.delivery_branch || '-',
          });
        });
      });

      walkinSales.forEach(s => {
        const date = new Date(s.created_at || s.sale_date);
        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const items = s.items || [];
        items.forEach(item => {
          const itemName = item.name || item.product_name || 'Unknown';
          const prod = findProductPrice(itemName);
          allSales.push({
            month,
            product_name: prod ? prod.description : itemName,
            quantity: Number(item.quantity || item.qty || 1),
            dp_price: prod ? prod.dp : Number(item.unit_price || item.price || 0),
            cif_price: prod ? prod.cif : 0,
            source: 'walkin',
            branch: s.branch || '-',
          });
        });
      });

      setSalesData(allSales);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const months = [...new Set(salesData.map(s => s.month))].sort().reverse();
  if (months.length > 0 && !months.includes(selectedMonth)) {
    // keep selected or fallback
  }

  const monthData = salesData.filter(s => {
    if (s.month !== selectedMonth) return false;
    if (branch !== 'all') {
      const b = (s.branch || '').toLowerCase().replace(/\s+/g, '_');
      if (b && b !== '-' && b !== branch) return false;
    }
    return true;
  });

  const byProduct = {};
  monthData.forEach(s => {
    if (!byProduct[s.product_name]) byProduct[s.product_name] = { product_name: s.product_name, total_qty: 0, total_revenue: 0 };
    byProduct[s.product_name].total_qty += s.quantity;
    byProduct[s.product_name].total_revenue += s.quantity * s.dp_price;
  });
  const productSummary = Object.values(byProduct).sort((a, b) => b.total_revenue - a.total_revenue);

  const totalRevenue = productSummary.reduce((s, p) => s + p.total_revenue, 0);
  const totalQty = productSummary.reduce((s, p) => s + p.total_qty, 0);

  const monthLabel = selectedMonth ? new Date(selectedMonth + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) : 'All';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar size={20} className="text-gray-500" />
          <select
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
          >
            {months.length > 0 ? months.map(m => (
              <option key={m} value={m}>{new Date(m + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' })}</option>
            )) : <option value={selectedMonth}>{monthLabel}</option>}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title={`Sales Revenue (${monthLabel})`} value={formatCurrency(totalRevenue)} color="green" icon={<DollarSign size={24} />} />
        <StatCard title="Units Sold" value={totalQty.toLocaleString()} color="blue" icon={<Package size={24} />} />
        <StatCard title="Products Sold" value={productSummary.length} color="purple" icon={<BarChart3 size={24} />} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">Sales by Product — {monthLabel}</h3>
            <Button size="sm" variant="secondary" onClick={() => {
              const rows = productSummary.map((r, i) => `<tr><td>${i+1}</td><td>${r.product_name||''}</td><td>${r.total_qty.toLocaleString()}</td><td>${formatCurrency(r.total_revenue)}</td><td>${totalRevenue > 0 ? ((r.total_revenue/totalRevenue)*100).toFixed(1)+'%' : '0%'}</td></tr>`).join('');
              printDocument(`Monthly Sales Report — ${monthLabel}`, `<table><thead><tr><th>#</th><th>Product</th><th>Qty Sold</th><th>DP Revenue</th><th>% of Total</th></tr></thead><tbody>${rows}<tr style="font-weight:bold;background:#f0fdf4"><td colspan="2">TOTAL</td><td>${totalQty.toLocaleString()}</td><td>${formatCurrency(totalRevenue)}</td><td>100%</td></tr></tbody></table>`);
            }}><Printer size={14} /> Print</Button>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: '#', render: (_, i) => i + 1 },
            { header: 'Product', key: 'product_name' },
            { header: 'Qty Sold', render: r => r.total_qty.toLocaleString() },
            { header: 'DP Revenue', render: r => formatCurrency(r.total_revenue) },
            { header: '% of Total', render: r => totalRevenue > 0 ? `${((r.total_revenue / totalRevenue) * 100).toFixed(1)}%` : '0%' },
          ]}
          data={productSummary}
          emptyMessage="No sales data for this month"
        />
      </Card>

      {monthData.length === 0 && (
        <Alert type="info">No sales recorded for {monthLabel}. Sales data comes from online orders and branch walk-in sales.</Alert>
      )}
    </div>
  );
}

function CountryInventoryTab() {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    api.stock.batches()
      .then(d => setBatches(Array.isArray(d) ? d : d.batches || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const aggregated = {};
  batches.forEach(b => {
    const key = `${b.product_name}__${b.location}`;
    if (!aggregated[key]) {
      aggregated[key] = { product_name: b.product_name, location: b.location || 'Unknown', total_quantity: 0, total_value: 0, batch_count: 0 };
    }
    aggregated[key].total_quantity += Number(b.quantity || 0);
    aggregated[key].total_value += Number(b.quantity || 0) * Number(b.unit_price || 0);
    aggregated[key].batch_count += 1;
  });

  let aggregatedList = Object.values(aggregated);
  if (searchTerm) {
    aggregatedList = aggregatedList.filter(a => (a.product_name || '').toLowerCase().includes(searchTerm.toLowerCase()));
  }

  const exportCSV = () => {
    const headers = ['Product', 'Location', 'Total Quantity', 'Total Value', 'Batches'];
    const rows = aggregatedList.map(a => [
      `"${a.product_name}"`,
      `"${a.location}"`,
      a.total_quantity,
      a.total_value.toFixed(2),
      a.batch_count,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `country-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <LoadingSpinner />;

  const totalQty = aggregatedList.reduce((s, a) => s + a.total_quantity, 0);
  const totalVal = aggregatedList.reduce((s, a) => s + a.total_value, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Total Products" value={aggregatedList.length} color="blue" icon={<Package size={24} />} />
        <StatCard title="Total Quantity" value={totalQty.toLocaleString()} color="green" icon={<ClipboardList size={24} />} />
        <StatCard title="Total Value" value={formatCurrency(totalVal)} color="purple" icon={<BarChart3 size={24} />} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">Country-Wide Inventory</h3>
            <div className="flex gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="pl-7 pr-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                  placeholder="Search product..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <Button size="sm" variant="secondary" onClick={exportCSV}><Download size={16} /> Export CSV</Button>
              <Button size="sm" variant="secondary" onClick={() => {
                const rows = aggregatedList.map(r => `<tr><td>${r.product_name||''}</td><td>${r.location||''}</td><td>${r.total_quantity||0}</td><td>${formatCurrency(r.total_value||0)}</td><td>${r.batch_count||0}</td></tr>`).join('');
                printDocument('Full Inventory Report', `<table><thead><tr><th>Product</th><th>Location</th><th>Total Qty</th><th>Value</th><th>Batches</th></tr></thead><tbody>${rows}</tbody></table>`, true);
              }}><Printer size={14} /> Print</Button>
            </div>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Product', key: 'product_name' },
            { header: 'Location', key: 'location' },
            { header: 'Total Qty', render: r => <span className={r.total_quantity < 10 ? 'text-red-600 font-bold' : 'font-medium'}>{r.total_quantity}</span> },
            { header: 'Value', render: r => formatCurrency(r.total_value) },
            { header: 'Batches', key: 'batch_count' },
          ]}
          data={aggregatedList}
          emptyMessage="No inventory data available"
        />
      </Card>
    </div>
  );
}

function ValuationTab({ branch }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.stock.batches()
      .then(d => setBatches(Array.isArray(d) ? d : d.batches || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const getDP = (productName) => {
    const prod = getLiveProductList().find(p => p.description === productName);
    return prod ? prod.dp : 0;
  };

  const filteredBatches = branch === 'all' ? batches : batches.filter(b => (b.location || '').toLowerCase().replace(/\s+/g, '_') === branch);

  const VALUATION_GROUPS = ['Windhoek', 'Ondangwa', 'Branches & Other'];
  const locationGroups = {};
  filteredBatches.forEach(b => {
    const l = (b.location || 'unknown').toLowerCase();
    const loc = l.includes('windhoek') ? 'Windhoek' : l.includes('ondangwa') ? 'Ondangwa' : 'Branches & Other';
    if (!locationGroups[loc]) locationGroups[loc] = { items: 0, value: 0 };
    const qty = Number(b.quantity || 0);
    const dp = getDP(b.product_name) || Number(b.unit_price || 0);
    locationGroups[loc].items += qty;
    locationGroups[loc].value += qty * dp;
  });

  const breakdown = filteredBatches.map(b => {
    const qty = Number(b.quantity || 0);
    const dp = getDP(b.product_name) || Number(b.unit_price || 0);
    return { product_name: b.product_name, location: b.location || 'Unknown', quantity: qty, unit_price: dp, total_value: qty * dp };
  });

  const grandTotal = breakdown.reduce((s, r) => s + r.total_value, 0);
  const grandItems = breakdown.reduce((s, r) => s + r.quantity, 0);

  const colors = { Windhoek: 'blue', Ondangwa: 'orange', 'Branches & Other': 'green' };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {VALUATION_GROUPS.map(loc => (
          <StatCard
            key={loc}
            title={`${loc} Stock`}
            value={formatCurrency((locationGroups[loc] || {}).value || 0)}
            subtitle={`${((locationGroups[loc] || {}).items || 0).toLocaleString()} items`}
            color={colors[loc]}
            icon={<Warehouse size={24} />}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">Stock Valuation Breakdown (DP Prices)</h3>
            <Button size="sm" variant="secondary" onClick={() => {
              const rows = breakdown.map(r => `<tr><td>${r.product_name||''}</td><td>${r.location||''}</td><td>${r.quantity||0}</td><td>${formatCurrency(r.unit_price||0)}</td><td>${formatCurrency(r.total_value||0)}</td></tr>`).join('');
              const total = `<tr style="font-weight:bold;background:#f0fdf4"><td colspan="4">Grand Total</td><td>${formatCurrency(grandTotal)}</td></tr>`;
              printDocument('Stock Valuation Report (DP Prices)', `<table><thead><tr><th>Product</th><th>Location</th><th>Qty</th><th>Unit Price (DP)</th><th>Total Value</th></tr></thead><tbody>${rows}${total}</tbody></table>`, true);
            }}><Printer size={14} /> Print Report</Button>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Product', key: 'product_name' },
            { header: 'Location', key: 'location' },
            { header: 'Quantity', key: 'quantity' },
            { header: 'Unit Price (DP)', render: r => formatCurrency(r.unit_price) },
            { header: 'Total Value', render: r => formatCurrency(r.total_value) },
          ]}
          data={breakdown}
          emptyMessage="No stock data for valuation"
        />
      </Card>

      <Card className="bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200">
        <CardBody>
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-emerald-600 font-medium">Grand Total Stock Value</p>
              <p className="text-3xl font-bold text-emerald-800">{formatCurrency(grandTotal)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-emerald-600">Total Items</p>
              <p className="text-2xl font-bold text-emerald-800">{grandItems.toLocaleString()}</p>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function BarcodeLabelDisplay({ code, name, dp }) {
  return (
    <div className="border border-gray-300 rounded p-3 text-center bg-white w-48 flex-shrink-0">
      <p className="text-[9px] font-bold text-primary uppercase tracking-wide mb-1">Dynapharm Namibia</p>
      <p className="text-[10px] font-semibold text-gray-800 leading-tight mb-2 h-8 overflow-hidden">{name}</p>
      <div className="flex gap-[1px] justify-center mb-1 h-10 items-end mx-auto w-36">
        {code.split('').map((c, i) => (
          <div key={i} className="bg-black" style={{ width: ((c.charCodeAt(0) * 7 + i * 13) % 3) + 1 + 'px', height: 25 + ((c.charCodeAt(0) + i) % 10) * 2 + 'px' }} />
        ))}
        {Array.from({ length: 12 }, (_, i) => (
          <div key={`p${i}`} className="bg-black" style={{ width: ((i * 7 + 3) % 3) + 1 + 'px', height: 22 + (i % 6) * 3 + 'px' }} />
        ))}
      </div>
      <p className="text-[11px] font-mono font-bold text-gray-700 tracking-wider">{code}</p>
      {dp > 0 && <p className="text-[11px] font-bold text-primary mt-1">NAD {formatCurrency(dp)}</p>}
    </div>
  );
}

function BarcodeTab() {
  const [subTab, setSubTab] = useState('lookup');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [batches, setBatches] = useState([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [assignSearch, setAssignSearch] = useState('');
  const [assigningId, setAssigningId] = useState(null);
  const [assignCode, setAssignCode] = useState('');
  const [assignAlert, setAssignAlert] = useState(null);
  const [printSelected, setPrintSelected] = useState({});
  const [printQty, setPrintQty] = useState({});

  const generateBarcode = (idx) => `DYN-${String(idx).padStart(4, '0')}`;

  const indexedProducts = PRICE_LIST.map((p, idx) => ({ ...p, idx, code: generateBarcode(idx) }));

  const lookupResults = searchTerm.length >= 2
    ? indexedProducts.filter(p => p.description.toLowerCase().includes(searchTerm.toLowerCase()) || p.code.toLowerCase().includes(searchTerm.toLowerCase()))
    : [];

  const loadBatches = () => {
    setBatchLoading(true);
    api.stock.batches()
      .then(d => setBatches(Array.isArray(d) ? d : d.batches || []))
      .catch(() => {})
      .finally(() => setBatchLoading(false));
  };

  const handleAssignCode = async (batchId) => {
    if (!assignCode.trim()) return;
    try {
      await api.stock.updateBatch(batchId, { barcode: assignCode.trim() });
      setAssignAlert({ type: 'success', msg: 'Barcode assigned successfully' });
      setAssigningId(null);
      setAssignCode('');
      loadBatches();
    } catch {
      setAssignAlert({ type: 'error', msg: 'Failed to assign barcode' });
    }
  };

  const printLabels = () => {
    const toPrint = indexedProducts.filter(p => printSelected[p.idx] && Number(printQty[p.idx] || 1) > 0);
    if (!toPrint.length) return;
    const labels = toPrint.flatMap(p => Array.from({ length: Number(printQty[p.idx] || 1) }, () => `
      <div class="label">
        <div class="product" style="font-weight:bold;font-size:9px;color:#8b0000">DYNAPHARM NAMIBIA</div>
        <div class="product" style="min-height:24px;overflow:hidden">${p.description}</div>
        <div class="bars">${barsForCode(p.code)}</div>
        <div class="code">${p.code}</div>
        <div class="price">NAD ${formatCurrency(p.dp)}</div>
      </div>`)).join('');
    printDocument('Barcode Labels', `<div class="label-grid">${labels}</div>`, false);
  };

  const filteredBatches = batches.filter(b =>
    !assignSearch || (b.product_name || '').toLowerCase().includes(assignSearch.toLowerCase()) || (b.barcode || '').toLowerCase().includes(assignSearch.toLowerCase())
  );

  const subTabs = [
    { id: 'lookup', label: 'Lookup & Print' },
    { id: 'assign', label: 'Assign Codes' },
    { id: 'printlabels', label: 'Print Labels' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-gray-200">
        {subTabs.map(t => (
          <button
            key={t.id}
            onClick={() => { setSubTab(t.id); if (t.id === 'assign') loadBatches(); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${subTab === t.id ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'lookup' && (
        <div className="space-y-4">
          <Card>
            <CardBody>
              <div className="relative max-w-lg">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                  placeholder="Search by product name or code (e.g. DYN-0001)..."
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); setSelectedProduct(null); }}
                />
              </div>
            </CardBody>
          </Card>

          {selectedProduct && (
            <Card className="border-primary/30">
              <CardBody>
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex-1 space-y-3">
                    <div className="flex justify-between items-start">
                      <h3 className="text-lg font-bold text-gray-800">{selectedProduct.description}</h3>
                      <Button size="sm" variant="secondary" onClick={() => {
                        printDocument(`Label — ${selectedProduct.description}`, `<div class="label-grid"><div class="label"><div class="product" style="font-weight:bold;font-size:9px;color:#8b0000">DYNAPHARM NAMIBIA</div><div class="product">${selectedProduct.description}</div><div class="bars">${barsForCode(selectedProduct.code)}</div><div class="code">${selectedProduct.code}</div><div class="price">NAD ${formatCurrency(selectedProduct.dp)}</div></div></div>`);
                      }}><Printer size={14} /> Print Label</Button>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-blue-50 p-3 rounded-lg text-center">
                        <p className="text-xs text-blue-600">DP Price</p>
                        <p className="text-lg font-bold text-blue-800">{formatCurrency(selectedProduct.dp)}</p>
                      </div>
                      <div className="bg-green-50 p-3 rounded-lg text-center">
                        <p className="text-xs text-green-600">CP Price</p>
                        <p className="text-lg font-bold text-green-800">{formatCurrency(selectedProduct.cp)}</p>
                      </div>
                      <div className="bg-purple-50 p-3 rounded-lg text-center">
                        <p className="text-xs text-purple-600">BV</p>
                        <p className="text-lg font-bold text-purple-800">{selectedProduct.bv}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-center justify-center">
                    <BarcodeLabelDisplay code={selectedProduct.code} name={selectedProduct.description} dp={selectedProduct.dp} />
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          {lookupResults.length > 0 && !selectedProduct && (
            <Card>
              <CardHeader><h3 className="font-bold text-gray-800">Results ({lookupResults.length})</h3></CardHeader>
              <Table
                columns={[
                  { header: 'Code', render: r => <span className="font-mono text-xs font-bold text-gray-700">{r.code}</span> },
                  { header: 'Product', key: 'description' },
                  { header: 'DP', render: r => formatCurrency(r.dp) },
                  { header: 'CP', render: r => formatCurrency(r.cp) },
                  { header: 'BV', key: 'bv' },
                  { header: 'Actions', render: r => (
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => setSelectedProduct(r)}>View</Button>
                      <Button size="sm" variant="secondary" onClick={() => {
                        printDocument(`Label — ${r.description}`, `<div class="label-grid"><div class="label"><div class="product" style="font-weight:bold;font-size:9px;color:#8b0000">DYNAPHARM NAMIBIA</div><div class="product">${r.description}</div><div class="bars">${barsForCode(r.code)}</div><div class="code">${r.code}</div><div class="price">NAD ${formatCurrency(r.dp)}</div></div></div>`);
                      }}><Printer size={12} /></Button>
                    </div>
                  )},
                ]}
                data={lookupResults}
                emptyMessage="No products found"
              />
            </Card>
          )}

          {searchTerm.length >= 2 && lookupResults.length === 0 && (
            <EmptyState icon={<Search size={48} />} title="No products found" description={`No products matching "${searchTerm}"`} />
          )}
          {searchTerm.length < 2 && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {indexedProducts.slice(0, 12).map(p => (
                <button key={p.idx} onClick={() => setSelectedProduct(p)} className="text-left hover:shadow-md transition-shadow">
                  <BarcodeLabelDisplay code={p.code} name={p.description} dp={p.dp} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === 'assign' && (
        <div className="space-y-4">
          {assignAlert && <Alert type={assignAlert.type} className="mb-2">{assignAlert.msg}</Alert>}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center flex-wrap gap-2">
                <h3 className="font-bold text-gray-800">Assign Barcodes to Batches</h3>
                <Button size="sm" variant="secondary" onClick={loadBatches}>{batchLoading ? 'Loading...' : 'Refresh'}</Button>
              </div>
            </CardHeader>
            <CardBody className="pb-2">
              <p className="text-sm text-gray-500 mb-3">Each batch record from stock imports can have a specific barcode assigned. You can override or assign a custom code below.</p>
              <div className="relative max-w-md mb-4">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20" placeholder="Filter by product or barcode..." value={assignSearch} onChange={e => setAssignSearch(e.target.value)} />
              </div>
            </CardBody>
            {batchLoading ? <LoadingSpinner /> : (
              <Table
                columns={[
                  { header: 'Batch #', render: r => <span className="font-mono text-xs">{r.batch_number || r.id || '-'}</span> },
                  { header: 'Product', key: 'product_name' },
                  { header: 'Location', key: 'location' },
                  { header: 'Qty', key: 'quantity' },
                  { header: 'Current Code', render: r => (
                    <span className={`font-mono text-xs ${r.barcode ? 'text-green-700 font-bold' : 'text-gray-400'}`}>{r.barcode || 'Not assigned'}</span>
                  )},
                  { header: 'Assign', render: r => assigningId === r.id ? (
                    <div className="flex gap-1 items-center">
                      <input
                        className="px-2 py-1 rounded border border-gray-300 text-xs w-28 focus:outline-none focus:ring-1 focus:border-primary"
                        value={assignCode}
                        onChange={e => setAssignCode(e.target.value)}
                        placeholder="e.g. DYN-0001"
                        autoFocus
                      />
                      <Button size="sm" variant="success" onClick={() => handleAssignCode(r.id)}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setAssigningId(null)}>✕</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => { setAssigningId(r.id); setAssignCode(r.barcode || generateBarcode(indexedProducts.findIndex(p => p.description === r.product_name))); }}><Tag size={12} /> {r.barcode ? 'Change' : 'Assign'}</Button>
                  )},
                ]}
                data={filteredBatches}
                emptyMessage={batchLoading ? '' : 'No batches found — import stock first'}
              />
            )}
          </Card>
        </div>
      )}

      {subTab === 'printlabels' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center flex-wrap gap-2">
                <h3 className="font-bold text-gray-800">Print Label Sheet</h3>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => {
                    const allSelected = {};
                    const allQty = {};
                    indexedProducts.forEach(p => { allSelected[p.idx] = true; allQty[p.idx] = 1; });
                    setPrintSelected(allSelected);
                    setPrintQty(allQty);
                  }}>Select All</Button>
                  <Button size="sm" variant="secondary" onClick={() => { setPrintSelected({}); setPrintQty({}); }}>Clear</Button>
                  <Button size="sm" onClick={printLabels} disabled={Object.keys(printSelected).filter(k => printSelected[k]).length === 0}>
                    <Printer size={14} /> Print {Object.keys(printSelected).filter(k => printSelected[k]).length > 0 ? `(${Object.keys(printSelected).filter(k => printSelected[k]).length})` : ''} Labels
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-gray-500 mb-4">Select products and set how many copies of each label to print.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {indexedProducts.map(p => (
                  <label key={p.idx} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${printSelected[p.idx] ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="checkbox" checked={!!printSelected[p.idx]} onChange={e => setPrintSelected(prev => ({ ...prev, [p.idx]: e.target.checked }))} className="accent-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{p.description}</p>
                      <p className="text-xs font-mono text-gray-500">{p.code}</p>
                    </div>
                    {printSelected[p.idx] && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-500">×</span>
                        <input
                          type="number"
                          min="1"
                          max="99"
                          value={printQty[p.idx] || 1}
                          onChange={e => setPrintQty(prev => ({ ...prev, [p.idx]: e.target.value }))}
                          onClick={e => e.preventDefault()}
                          className="w-12 px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:border-primary text-center"
                        />
                      </div>
                    )}
                  </label>
                ))}
              </div>
            </CardBody>
          </Card>

          {Object.keys(printSelected).some(k => printSelected[k]) && (
            <Card>
              <CardHeader><h3 className="font-bold text-gray-800">Preview</h3></CardHeader>
              <CardBody>
                <div className="flex flex-wrap gap-3">
                  {indexedProducts.filter(p => printSelected[p.idx]).map(p => (
                    <BarcodeLabelDisplay key={p.idx} code={p.code} name={p.description} dp={p.dp} />
                  ))}
                </div>
              </CardBody>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function SmartReorderTab({ branch }) {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [thresholds, setThresholds] = useState({});
  const [editProduct, setEditProduct] = useState(null);
  const [editThreshold, setEditThreshold] = useState('');
  const [viewMode, setViewMode] = useState('ai'); // 'ai' | 'classic'
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [orderModal, setOrderModal] = useState(null);
  const [orderQty, setOrderQty] = useState('');
  const [orderNote, setOrderNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [orderAlert, setOrderAlert] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.stock.batches().then(d => Array.isArray(d) ? d : d.batches || []).catch(() => []),
      api.stock.movements().then(d => Array.isArray(d) ? d : d.movements || []).catch(() => []),
    ]).then(([b, m]) => { setBatches(b); setMovements(m); }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingSpinner />;

  const filterBatch = (b) => branch === 'all' || (b.location || '').toLowerCase().replace(/\s+/g, '_') === branch;
  const filteredBatches = batches.filter(filterBatch);

  // ── Aggregate by product+location ─────────────────
  const productMap = {};
  filteredBatches.forEach(b => {
    const key = `${b.product_name}||${b.location || 'unknown'}`;
    if (!productMap[key]) productMap[key] = { product_name: b.product_name, location: b.location || 'unknown', qty: 0, expiry: null };
    productMap[key].qty += Number(b.quantity || 0);
    if (b.expiry_date && (!productMap[key].expiry || new Date(b.expiry_date) < new Date(productMap[key].expiry))) productMap[key].expiry = b.expiry_date;
  });

  const allItems = Object.values(productMap).map(p => {
    const dailyRate = stockAI.getDailyRate(p.product_name, movements, branch === 'all' ? null : branch);
    const daysOfStock = stockAI.getDaysOfStock(p.qty, dailyRate);
    const priority = stockAI.getPriority(daysOfStock, p.qty);
    const threshold = thresholds[p.product_name] || 10;
    const suggestedOrder = dailyRate > 0 ? Math.ceil(dailyRate * 30) : (p.qty < 5 ? 30 : 0);
    const classicStatus = p.qty < 5 ? 'Critical' : p.qty < threshold ? 'Low' : 'OK';
    return { ...p, dailyRate, daysOfStock, priority, threshold, suggestedOrder, classicStatus };
  }).sort((a, b) => b.priority.score - a.priority.score);

  const aiActionable = allItems.filter(i => i.priority.score > 0);
  const aiFiltered = priorityFilter === 'all' ? aiActionable :
    priorityFilter === 'critical' ? aiActionable.filter(i => i.priority.score >= 90) :
    priorityFilter === 'urgent' ? aiActionable.filter(i => i.priority.score >= 70 && i.priority.score < 90) :
    aiActionable.filter(i => i.priority.score >= 40 && i.priority.score < 70);

  const outCount = allItems.filter(i => i.qty <= 0).length;
  const critCount = allItems.filter(i => i.qty > 0 && i.qty < 5).length;
  const urgentCount = allItems.filter(i => i.daysOfStock > 0 && i.daysOfStock <= 14 && i.qty >= 5).length;

  const createOrderRequest = async () => {
    if (!orderModal || !orderQty) return;
    setSubmitting(true);
    try {
      await api.stock.createTransfer({
        from_location: 'country_stock',
        to_location: orderModal.location,
        product_name: orderModal.product_name,
        quantity: Number(orderQty),
        notes: orderNote || `AI Reorder — ${orderModal.priority.label}. Days left: ${orderModal.daysOfStock === 999 ? 'N/A' : orderModal.daysOfStock}`,
        requested_by: user?.id,
        requested_by_name: user?.full_name || user?.username,
      });
      setOrderAlert({ type: 'success', msg: `Transfer request created: ${Number(orderQty)} × ${orderModal.product_name} from Country Stock → ${fmtLocation(orderModal.location)}` });
      setOrderModal(null);
      setOrderQty('');
      setOrderNote('');
      load();
    } catch (err) {
      setOrderAlert({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', borderRadius: 14, padding: '14px 20px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontWeight: 900, fontSize: '1.05rem', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            🤖 AI-Powered Reorder Intelligence
          </h3>
          <p style={{ fontSize: '0.78rem', opacity: 0.85, margin: '3px 0 0' }}>
            Velocity-based demand forecasting · Predictive stock depletion · Auto-order suggestions
            {branch !== 'all' && ` · ${fmtLocation(branch)}`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setViewMode(viewMode === 'ai' ? 'classic' : 'ai')}
            style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 99, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
            {viewMode === 'ai' ? '📊 Classic View' : '🤖 AI View'}
          </button>
          <button onClick={load}
            style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 99, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {orderAlert && <Alert type={orderAlert.type} onClose={() => setOrderAlert(null)}>{orderAlert.msg}</Alert>}

      {/* ── AI Stats ───────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div onClick={() => setPriorityFilter('all')} style={{ cursor: 'pointer', borderRadius: 12, padding: '12px 14px', background: priorityFilter === 'all' ? '#fff0f3' : '#f8fafc', border: `2px solid ${priorityFilter === 'all' ? '#c41e3a' : '#e2e8f0'}`, textAlign: 'center' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#374151' }}>{aiActionable.length}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>Action Needed</div>
        </div>
        <div onClick={() => setPriorityFilter('critical')} style={{ cursor: 'pointer', borderRadius: 12, padding: '12px 14px', background: priorityFilter === 'critical' ? '#fef2f2' : '#f8fafc', border: `2px solid ${priorityFilter === 'critical' ? '#dc2626' : '#e2e8f0'}`, textAlign: 'center' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#dc2626' }}>{outCount + critCount}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>Critical / OOS</div>
        </div>
        <div onClick={() => setPriorityFilter('urgent')} style={{ cursor: 'pointer', borderRadius: 12, padding: '12px 14px', background: priorityFilter === 'urgent' ? '#fffbeb' : '#f8fafc', border: `2px solid ${priorityFilter === 'urgent' ? '#d97706' : '#e2e8f0'}`, textAlign: 'center' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#d97706' }}>{urgentCount}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>Urgent (&lt;14d)</div>
        </div>
        <div onClick={() => setPriorityFilter('soon')} style={{ cursor: 'pointer', borderRadius: 12, padding: '12px 14px', background: priorityFilter === 'soon' ? '#fefce8' : '#f8fafc', border: `2px solid ${priorityFilter === 'soon' ? '#ca8a04' : '#e2e8f0'}`, textAlign: 'center' }}>
          <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#ca8a04' }}>{aiActionable.length - outCount - critCount - urgentCount}</div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700 }}>Reorder Soon</div>
        </div>
      </div>

      {viewMode === 'ai' ? (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Brain size={16} className="text-primary" />
                AI Reorder Queue {priorityFilter !== 'all' && <Badge variant="warning">{priorityFilter} filter</Badge>}
                {branch !== 'all' && <span className="text-xs text-gray-400 font-normal">— {fmtLocation(branch)}</span>}
              </h3>
              <Button size="sm" variant="secondary" onClick={() => {
                const rows = (priorityFilter === 'all' ? aiActionable : aiFiltered).map(r =>
                  `<tr><td>${r.product_name}</td><td>${fmtLocation(r.location)}</td><td style="color:${r.priority.color};font-weight:800">${r.priority.label}</td><td>${r.qty}</td><td>${r.dailyRate > 0 ? r.dailyRate.toFixed(2) + '/day' : '—'}</td><td>${r.daysOfStock === 999 ? '—' : r.daysOfStock + ' days'}</td><td>${r.suggestedOrder || '—'}</td></tr>`
                ).join('');
                printDocument('AI Reorder Report', `<table><thead><tr><th>Product</th><th>Location</th><th>Priority</th><th>Qty</th><th>Daily Rate</th><th>Days Left</th><th>Suggested Order</th></tr></thead><tbody>${rows}</tbody></table>`);
              }}><Printer size={14} /> Print</Button>
            </div>
          </CardHeader>
          {aiFiltered.length === 0 ? (
            <CardBody>
              <EmptyState icon={<CheckCircle size={48} className="text-green-500" />} title="All Stock Levels Healthy" description={`No reorder action needed${branch !== 'all' ? ` for ${fmtLocation(branch)}` : ''}. The AI has analyzed all products.`} />
            </CardBody>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    {['Product', 'Location', 'AI Priority', 'Qty', 'Daily Rate', 'Days Left', 'Suggested Qty', 'Action'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.73rem', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {aiFiltered.map((r, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb', borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: '#1e293b' }}>{r.product_name}</td>
                      <td style={{ padding: '9px 12px', color: '#64748b', fontSize: '0.77rem' }}>{fmtLocation(r.location)}</td>
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{ background: r.priority.bg, color: r.priority.color, borderRadius: 99, padding: '3px 9px', fontWeight: 800, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{r.priority.label}</span>
                      </td>
                      <td style={{ padding: '9px 12px', fontWeight: 900, color: r.qty <= 0 ? '#dc2626' : r.qty < 5 ? '#dc2626' : '#374151' }}>{r.qty}</td>
                      <td style={{ padding: '9px 12px', color: r.dailyRate > 0 ? '#374151' : '#94a3b8', fontSize: '0.8rem' }}>
                        {r.dailyRate > 0 ? `${r.dailyRate.toFixed(2)}/d` : <span title="No movement data — estimate based on quantity">—</span>}
                      </td>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: r.daysOfStock === 999 ? '#94a3b8' : r.daysOfStock <= 7 ? '#dc2626' : r.daysOfStock <= 14 ? '#d97706' : '#ca8a04' }}>
                        {r.daysOfStock === 999 ? '—' : `${r.daysOfStock}d`}
                      </td>
                      <td style={{ padding: '9px 12px', fontWeight: 800, color: '#7c3aed' }}>{r.suggestedOrder > 0 ? r.suggestedOrder : '—'}</td>
                      <td style={{ padding: '9px 12px' }}>
                        <button onClick={() => { setOrderModal(r); setOrderQty(String(r.suggestedOrder || '')); setOrderNote(''); }}
                          style={{ padding: '5px 12px', background: '#c41e3a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                          + Request Order
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h3 className="font-bold text-gray-800">Classic Threshold View</h3>
              <div className="flex gap-2 items-center">
                <span className="text-xs text-gray-500">Default threshold: 10 units</span>
                <Button size="sm" variant="secondary" onClick={() => {
                  const rows = allItems.map(r => `<tr><td>${r.product_name}</td><td>${fmtLocation(r.location)}</td><td>${r.qty}</td><td>${r.threshold}</td><td>${r.classicStatus}</td></tr>`).join('');
                  printDocument('Reorder Alerts', `<table><thead><tr><th>Product</th><th>Location</th><th>Qty</th><th>Threshold</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`);
                }}><Printer size={14} /> Print</Button>
              </div>
            </div>
          </CardHeader>
          <Table
            columns={[
              { header: 'Product', render: r => <span className="font-semibold text-sm">{r.product_name}</span> },
              { header: 'Location', render: r => <span className="text-xs text-gray-500">{fmtLocation(r.location)}</span> },
              { header: 'Qty', render: r => <span className={`font-bold ${r.classicStatus === 'Critical' ? 'text-red-600' : r.classicStatus === 'Low' ? 'text-amber-600' : 'text-gray-700'}`}>{r.qty}</span> },
              { header: 'Threshold', key: 'threshold' },
              { header: 'Status', render: r => <Badge variant={r.classicStatus === 'Critical' ? 'danger' : r.classicStatus === 'Low' ? 'warning' : 'success'}>{r.classicStatus}</Badge> },
              { header: 'Actions', render: r => (
                <Button size="sm" variant="secondary" onClick={() => { setEditProduct(r.product_name); setEditThreshold(String(r.threshold)); }}>Set Threshold</Button>
              )},
            ]}
            data={allItems.sort((a, b) => { const o = { Critical: 0, Low: 1, OK: 2 }; return o[a.classicStatus] - o[b.classicStatus]; })}
            emptyMessage="No stock data"
          />
        </Card>
      )}

      {/* ── Order Request Modal ───────────────────── */}
      <Modal open={!!orderModal} onClose={() => setOrderModal(null)} title={`🤖 AI Order Request — ${orderModal?.product_name}`} size="md">
        <div className="p-6 space-y-4">
          <Alert type="info">
            AI recommends ordering <strong>{orderModal?.suggestedOrder || '—'} units</strong> based on a daily consumption rate of <strong>{orderModal?.dailyRate > 0 ? `${orderModal?.dailyRate?.toFixed(2)}/day` : 'unavailable'}</strong>. This covers ~30 days of supply.
          </Alert>
          {orderAlert && <Alert type={orderAlert.type}>{orderAlert.msg}</Alert>}
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px' }}>
            <div className="text-xs text-gray-500 font-semibold mb-1">Transfer Details</div>
            <div className="text-sm"><strong>From:</strong> Country Stock</div>
            <div className="text-sm"><strong>To:</strong> {fmtLocation(orderModal?.location)}</div>
            <div className="text-sm"><strong>Product:</strong> {orderModal?.product_name}</div>
            <div className="text-sm"><strong>Current Stock:</strong> {orderModal?.qty} units ({orderModal?.daysOfStock === 999 ? 'demand unknown' : `${orderModal?.daysOfStock} days left`})</div>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-semibold text-gray-700">Quantity to Order <span className="text-red-500">*</span></label>
            <input type="number" min="1" value={orderQty} onChange={e => setOrderQty(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary" />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-semibold text-gray-700">Notes (optional)</label>
            <textarea rows={2} value={orderNote} onChange={e => setOrderNote(e.target.value)}
              placeholder="Additional instructions for this order…"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary resize-none" />
          </div>
          <div className="flex gap-3 pt-1">
            <Button onClick={createOrderRequest} disabled={submitting || !orderQty}><Truck size={15} /> {submitting ? 'Creating…' : 'Create Transfer Request'}</Button>
            <Button variant="secondary" onClick={() => setOrderModal(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* ── Classic Threshold Edit Modal ─────────── */}
      <Modal open={!!editProduct} onClose={() => setEditProduct(null)} title={`Set Reorder Threshold: ${editProduct}`} size="sm">
        <div className="p-6 space-y-4">
          <Input label="Reorder Threshold (units)" type="number" min="1" value={editThreshold} onChange={e => setEditThreshold(e.target.value)} />
          <div className="flex gap-3">
            <Button onClick={() => { if (editProduct && editThreshold) { setThresholds(prev => ({ ...prev, [editProduct]: Number(editThreshold) })); setEditProduct(null); setEditThreshold(''); } }}>Save</Button>
            <Button variant="secondary" onClick={() => setEditProduct(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function BatchTab({ branch }) {
  const [apiBatches, setApiBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [alert, setAlert] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState({ product_name: '', quantity: '', manufacture_date: '', expiry_date: '', location: branch && branch !== 'all' ? branch : 'country_stock' });

  useEffect(() => {
    api.stock.batches()
      .then(d => setApiBatches(Array.isArray(d) ? d : d.batches || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.product_name || !form.quantity) {
      setAlert({ type: 'error', msg: 'Product and quantity are required' });
      return;
    }
    try {
      await api.stock.createBatch({
        product_name: form.product_name,
        quantity: Number(form.quantity),
        batch_number: `BATCH-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(apiBatches.length + 1).padStart(3, '0')}`,
        expiry_date: form.expiry_date || null,
        unit_price: getCIFPrice(form.product_name),
        location: form.location,
      });
      setAlert({ type: 'success', msg: 'Batch created and saved' });
      setForm({ product_name: '', quantity: '', manufacture_date: '', expiry_date: '', location: branch && branch !== 'all' ? branch : 'country_stock' });
      setShowForm(false);
      const d = await api.stock.batches().catch(() => []);
      setApiBatches(Array.isArray(d) ? d : d.batches || []);
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    }
  };

  const getDaysUntilExpiry = (expiryDate) => {
    if (!expiryDate) return null;
    const diff = new Date(expiryDate) - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const getExpiryStatus = (days) => {
    if (days === null) return { label: 'N/A', variant: 'default' };
    if (days <= 0) return { label: 'Expired', variant: 'danger' };
    if (days <= 30) return { label: 'Expiring Soon', variant: 'warning' };
    return { label: 'OK', variant: 'success' };
  };

  if (loading) return <LoadingSpinner />;

  const allBatches = apiBatches
    .filter(b => branch === 'all' || (b.location || '').toLowerCase().replace(/\s+/g, '_') === branch)
    .filter(b => !searchTerm || (b.product_name || '').toLowerCase().includes(searchTerm.toLowerCase()))
    .map(b => ({
      batch_number: b.batch_number || b.barcode || '-',
      product_name: b.product_name,
      quantity: b.quantity,
      expiry_date: b.expiry_date,
      location: b.location || '-',
    }));

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} className="mb-4">{alert.msg}</Alert>}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">
              Batch Tracking
              {branch !== 'all' && <span className="text-xs font-normal text-gray-400 ml-2">— {fmtLocation(branch)}</span>}
            </h3>
            <div className="flex gap-2 flex-wrap">
              <div className="relative">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="pl-7 pr-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary"
                  placeholder="Search product..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              </div>
              <Button size="sm" variant="secondary" onClick={() => {
                const rows = allBatches.map(r => `<tr><td>${r.batch_number||''}</td><td>${r.product_name||''}</td><td>${r.quantity||0}</td><td>${r.expiry_date?formatDate(r.expiry_date):'-'}</td><td>${r.location||''}</td></tr>`).join('');
                printDocument('Batch Tracking Report', `<table><thead><tr><th>Batch #</th><th>Product</th><th>Qty</th><th>Expiry</th><th>Location</th></tr></thead><tbody>${rows}</tbody></table>`);
              }}><Printer size={14} /> Print</Button>
              <Button size="sm" onClick={() => setShowForm(true)}><Plus size={16} /> New Batch</Button>
            </div>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Batch #', render: r => <span className="font-mono text-xs font-bold">{r.batch_number}</span> },
            { header: 'Product', key: 'product_name' },
            { header: 'Qty', render: r => <span className={Number(r.quantity) < 10 ? 'text-red-600 font-bold' : 'font-medium'}>{r.quantity}</span> },
            { header: 'Expiry Date', render: r => r.expiry_date ? formatDate(r.expiry_date) : '-' },
            { header: 'Location', render: r => <span className="text-xs">{fmtLocation(r.location)}</span> },
            { header: 'Days Left', render: r => { const d = getDaysUntilExpiry(r.expiry_date); return d !== null ? d : '-'; } },
            { header: 'Status', render: r => { const s = getExpiryStatus(getDaysUntilExpiry(r.expiry_date)); return <Badge variant={s.variant}>{s.label}</Badge>; } },
          ]}
          data={allBatches}
          emptyMessage={branch !== 'all' ? `No batches at ${fmtLocation(branch)}` : 'No batches tracked'}
        />
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="New Batch" size="md">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Product</label>
            <select
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
              value={form.product_name}
              onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
              required
            >
              <option value="">Select product...</option>
              {getLiveProductList().map(p => <option key={p.description} value={p.description}>{p.description}</option>)}
            </select>
          </div>
          <Input label="Quantity" type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} required />
          <Input label="Manufacture Date" type="date" value={form.manufacture_date} onChange={e => setForm(f => ({ ...f, manufacture_date: e.target.value }))} />
          <Input label="Expiry Date" type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Location</label>
            <select className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary"
              value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}>
              <optgroup label="Warehouses">
                <option value="country_stock">Country Stock (Main)</option>
                <option value="windhoek_warehouse">Windhoek Warehouse</option>
                <option value="ondangwa_warehouse">Ondangwa Warehouse</option>
              </optgroup>
              <optgroup label="Branches">
                {BRANCHES.map(b => <option key={b} value={b.toLowerCase().replace(/\s+/g, '_')}>{b}</option>)}
              </optgroup>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="submit">Create Batch</Button>
            <Button variant="secondary" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── Shared period helper ──────────────────────────────────────────────────────
function getDefaultPeriod() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  return {
    from: `${y}-${String(m + 1).padStart(2, '0')}-01`,
    to: now.toISOString().slice(0, 10),
  };
}

function applyPeriodPreset(preset, setter) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  let from, to;
  if (preset === 'this_month') {
    from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    to = now.toISOString().slice(0, 10);
  } else if (preset === 'last_month') {
    const lm = m === 0 ? 11 : m - 1, ly = m === 0 ? y - 1 : y;
    const days = new Date(ly, lm + 1, 0).getDate();
    from = `${ly}-${String(lm + 1).padStart(2, '0')}-01`;
    to = `${ly}-${String(lm + 1).padStart(2, '0')}-${String(days).padStart(2, '0')}`;
  } else if (preset === 'last_3') {
    const d = new Date(y, m - 2, 1);
    from = d.toISOString().slice(0, 10);
    to = now.toISOString().slice(0, 10);
  } else if (preset === 'ytd') {
    from = `${y}-01-01`;
    to = now.toISOString().slice(0, 10);
  }
  setter({ from, to });
}

function PeriodFilter({ period, onChange }) {
  const presets = [
    { key: 'this_month', label: 'This Month' },
    { key: 'last_month', label: 'Last Month' },
    { key: 'last_3', label: 'Last 3 Months' },
    { key: 'ytd', label: 'Year to Date' },
  ];
  const def = getDefaultPeriod();
  const isDefault = period.from === def.from && period.to === def.to;
  return (
    <div style={{ background: '#fff', border: '1.5px solid #f0e8ea', borderRadius: 14, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
      <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#374151', whiteSpace: 'nowrap' }}>📅 Period:</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {presets.map(p => {
          const def2 = {};
          applyPeriodPreset(p.key, v => { def2.from = v.from; def2.to = v.to; });
          const active = period.from === def2.from && period.to === def2.to;
          return (
            <button key={p.key} onClick={() => applyPeriodPreset(p.key, onChange)}
              style={{ padding: '5px 12px', borderRadius: 16, fontSize: '0.78rem', fontWeight: 700, border: 'none', cursor: 'pointer', background: active ? '#c41e3a' : '#f1f5f9', color: active ? '#fff' : '#64748b', transition: 'all .15s' }}>
              {p.label}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Custom:</span>
        <input type="date" value={period.from} onChange={e => onChange({ ...period, from: e.target.value })}
          style={{ padding: '4px 9px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.8rem', outline: 'none', color: '#374151', cursor: 'pointer' }} />
        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>to</span>
        <input type="date" value={period.to} onChange={e => onChange({ ...period, to: e.target.value })}
          style={{ padding: '4px 9px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.8rem', outline: 'none', color: '#374151', cursor: 'pointer' }} />
      </div>
    </div>
  );
}

function fmtPeriodLabel(from, to) {
  const opts = { day: '2-digit', month: 'short', year: 'numeric' };
  const a = new Date(from + 'T00:00:00').toLocaleDateString('en-NA', opts);
  const b = new Date(to + 'T00:00:00').toLocaleDateString('en-NA', opts);
  return from === to ? a : `${a} – ${b}`;
}

// ─── Branch Stock Tab ─────────────────────────────────────────────────────────
function BranchStockTab({ branch }) {
  const [batches, setBatches] = useState([]);
  const [walkinSales, setWalkinSales] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState(branch && branch !== 'all' ? branch : 'all');
  const [viewMode, setViewMode] = useState('dashboard');
  const [productSearch, setProductSearch] = useState('');
  const [period, setPeriod] = useState(getDefaultPeriod);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.stock.batches().then(d => Array.isArray(d) ? d : d.batches || []).catch(() => []),
      api.branch.walkinSales().then(d => Array.isArray(d) ? d : d.sales || d.walkin_sales || []).catch(() => []),
      api.stock.movements().then(d => Array.isArray(d) ? d : d.movements || []).catch(() => []),
    ]).then(([b, s, m]) => {
      setBatches(b);
      setWalkinSales(s);
      setMovements(m);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <LoadingSpinner />;

  const fmtBranch = (b) => b ? b.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '-';
  const now = new Date();
  const periodStart = new Date(period.from + 'T00:00:00');
  const periodEnd = new Date(period.to + 'T23:59:59');
  const periodLabel = fmtPeriodLabel(period.from, period.to);

  // Group batches by branch location
  const branchLocations = new Set();
  batches.forEach(b => {
    const loc = b.location || '';
    if (loc && !loc.includes('warehouse') && loc !== 'country_stock') branchLocations.add(loc);
  });
  // Also add known branches from BRANCHES constant mapped to snake_case
  BRANCHES.forEach(b => branchLocations.add(b.toLowerCase().replace(/\s+/g, '_')));

  const buildBranchSummary = (branchKey) => {
    const branchBatches = batches.filter(b => {
      const loc = (b.location || '').toLowerCase().replace(/\s+/g, '_');
      return loc === branchKey;
    });
    const branchSales = walkinSales.filter(s => {
      const br = (s.branch || '').toLowerCase().replace(/\s+/g, '_');
      return br === branchKey;
    });
    const branchMovs = movements.filter(m => {
      const loc = (m.location || '').toLowerCase().replace(/\s+/g, '_');
      return loc === branchKey;
    });

    const closingQty = branchBatches.reduce((s, b) => s + Number(b.quantity || 0), 0);
    const closingValue = branchBatches.reduce((s, b) => s + Number(b.quantity || 0) * Number(b.unit_price || 0), 0);
    const expiryQty = branchBatches.filter(b => b.expiry_date && new Date(b.expiry_date) < now).reduce((s, b) => s + Number(b.quantity || 0), 0);

    const movsPeriod = branchMovs.filter(m => m.created_at && new Date(m.created_at) >= periodStart && new Date(m.created_at) <= periodEnd);
    const issued = movsPeriod.filter(m => (m.movement_type || '').includes('in') || (m.movement_type || '').includes('receiv')).reduce((s, m) => s + Number(m.quantity || 0), 0);
    const returns_ = movsPeriod.filter(m => (m.movement_type || '').includes('return')).reduce((s, m) => s + Number(m.quantity || 0), 0);
    const writeoffs = movsPeriod.filter(m => (m.movement_type || '').includes('write')).reduce((s, m) => s + Number(m.quantity || 0), 0);

    const salesPeriod = branchSales.filter(s => s.created_at && new Date(s.created_at) >= periodStart && new Date(s.created_at) <= periodEnd);
    const salesQty = salesPeriod.reduce((s, r) => {
      const items = (() => { try { return typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []); } catch { return []; } })();
      return s + items.reduce((si, i) => si + Number(i.quantity || 0), 0);
    }, 0);
    const salesRevenue = salesPeriod.reduce((s, r) => s + Number(r.total_amount || r.amount || 0), 0);

    // Opening = Closing − Issued + Sales + Returns + Expiring + Write-offs (backwards from closing)
    const opening = Math.max(0, closingQty + salesQty + writeoffs + expiryQty - issued + returns_);

    // Products list
    const productMap = {};
    branchBatches.forEach(b => {
      const name = b.product_name || 'Unknown';
      if (!productMap[name]) productMap[name] = { product_name: name, qty: 0, value: 0, expiring: false };
      productMap[name].qty += Number(b.quantity || 0);
      productMap[name].value += Number(b.quantity || 0) * Number(b.unit_price || 0);
      if (b.expiry_date && new Date(b.expiry_date) < now) productMap[name].expiring = true;
    });
    const products = Object.values(productMap);

    return { branchKey, closingQty, closingValue, expiryQty, issued, returns: returns_, writeoffs, salesQty, salesRevenue, opening, products, batchCount: branchBatches.length };
  };

  const allBranchSummaries = BRANCHES.map(b => {
    const key = b.toLowerCase().replace(/\s+/g, '_');
    return { name: b, key, ...buildBranchSummary(key) };
  }).filter(br => br.batchCount > 0 || br.salesQty > 0 || selectedBranch !== 'all');

  const displayBranches = selectedBranch === 'all' ? allBranchSummaries : allBranchSummaries.filter(b => b.key === selectedBranch);

  const companySummary = {
    closing: allBranchSummaries.reduce((s, b) => s + b.closingQty, 0),
    closingValue: allBranchSummaries.reduce((s, b) => s + b.closingValue, 0),
    salesQty: allBranchSummaries.reduce((s, b) => s + b.salesQty, 0),
    salesRevenue: allBranchSummaries.reduce((s, b) => s + b.salesRevenue, 0),
    issued: allBranchSummaries.reduce((s, b) => s + b.issued, 0),
    returns: allBranchSummaries.reduce((s, b) => s + b.returns, 0),
    expiry: allBranchSummaries.reduce((s, b) => s + b.expiryQty, 0),
  };

  const printBranchReport = (br) => {
    const win = window.open('', '_blank');
    if (!win) return;
    const pRows = br.products.map(p => `<tr><td>${p.product_name}</td><td style="font-weight:800;color:${p.qty===0?'#c41e3a':p.qty<10?'#d97706':'#166534'}">${p.qty}</td><td>${p.expiring?'<span style="color:#c41e3a;font-weight:700">⚠ Expiring</span>':'-'}</td><td>N$ ${p.value.toFixed(2)}</td></tr>`).join('');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Branch Stock — ${br.name}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;padding:24px}.header{display:flex;justify-content:space-between;border-bottom:3px solid #c41e3a;padding-bottom:10px;margin-bottom:16px}.company{color:#c41e3a;font-weight:900;font-size:15px}.formula-box{border:1.5px solid #f0e8ea;border-radius:10px;padding:14px;margin-bottom:14px}.formula-row{display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #f1f5f9}.formula-label{font-weight:600;color:#374151}.formula-val{font-weight:900;font-size:14px}.closing-row{display:flex;justify-content:space-between;padding:10px 12px;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-top:2px solid #86efac}.closing-label{font-weight:800;color:#166534;font-size:13px}.closing-val{font-weight:900;font-size:18px;color:#15803d}table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#c41e3a;color:#fff;font-weight:700;padding:6px 8px;text-align:left;font-size:10px}td{padding:5px 8px;border-bottom:1px solid #f1f5f9;font-size:10px}tr:nth-child(even) td{background:#fdf7f8}.print-btn{position:fixed;top:12px;right:12px;background:#c41e3a;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:700;cursor:pointer}@media print{.print-btn{display:none}}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Print</button>
    <div class="header"><div><div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div><div style="font-size:14px;font-weight:800;color:#8b0000;margin-top:4px">📍 Branch Stock Report — ${br.name}</div><div style="color:#64748b;font-size:10px;margin-top:3px">Period: ${periodLabel}</div></div><div style="text-align:right;color:#64748b;font-size:10px;line-height:1.6">Date: ${now.toLocaleDateString('en-NA',{day:'2-digit',month:'long',year:'numeric'})}<br>Generated by: Stock Management</div></div>
    <div class="formula-box">
      <div style="font-weight:800;color:#c41e3a;font-size:13px;margin-bottom:10px;border-bottom:1px solid #fecaca;padding-bottom:6px">📐 Stock Formula — ${periodLabel}</div>
      <div class="formula-row"><span class="formula-label">Opening Stock</span><span class="formula-val" style="color:#1e3a5f">${br.opening.toLocaleString()}</span></div>
      <div class="formula-row"><span class="formula-label">+ Issued / Received Stock</span><span class="formula-val" style="color:#166534">+${br.issued.toLocaleString()}</span></div>
      <div class="formula-row"><span class="formula-label">− Sales (units sold)</span><span class="formula-val" style="color:#c41e3a">−${br.salesQty.toLocaleString()}</span></div>
      <div class="formula-row"><span class="formula-label">− Returns</span><span class="formula-val" style="color:#92400e">−${br.returns.toLocaleString()}</span></div>
      <div class="formula-row"><span class="formula-label">− Expiring / Expired Stock</span><span class="formula-val" style="color:#c41e3a">−${br.expiryQty.toLocaleString()}</span></div>
      <div class="formula-row"><span class="formula-label">− Promotions / Campaign Adjustments</span><span class="formula-val" style="color:#c41e3a">−0</span></div>
      <div class="closing-row"><span class="closing-label">= Closing Stock</span><span class="closing-val">${br.closingQty.toLocaleString()}</span></div>
      <div style="padding:8px 12px;background:#fafafa;font-size:10px;color:#64748b;display:flex;justify-content:space-between"><span>Closing Value: <strong style="color:#c41e3a">N$ ${br.closingValue.toFixed(2)}</strong></span><span>Sales Revenue: <strong style="color:#1e3a5f">N$ ${br.salesRevenue.toFixed(2)}</strong></span></div>
    </div>
    <div style="font-size:9px;font-weight:800;color:#c41e3a;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;border-bottom:1px solid #fecaca;padding-bottom:4px">Current Product Inventory</div>
    <table><thead><tr><th>Product</th><th>Qty on Hand</th><th>Expiry Status</th><th>Stock Value</th></tr></thead><tbody>${pRows||'<tr><td colspan="4" style="text-align:center;color:#94a3b8">No inventory on file</td></tr>'}</tbody></table>
    </body></html>`);
    win.document.close();
  };

  const printCompanyReport = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const brRows = allBranchSummaries.map(br => `<tr><td style="font-weight:700">${br.name}</td><td>${br.opening.toLocaleString()}</td><td style="color:#166534;font-weight:700">+${br.issued.toLocaleString()}</td><td style="color:#92400e">−${br.returns.toLocaleString()}</td><td style="color:#c41e3a">−${br.expiryQty.toLocaleString()}</td><td style="color:#c41e3a">${br.salesQty.toLocaleString()}</td><td style="font-weight:800;color:#15803d">${br.closingQty.toLocaleString()}</td><td>N$ ${br.closingValue.toFixed(2)}</td></tr>`).join('');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Company Stock Summary</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;padding:24px}.header{display:flex;justify-content:space-between;border-bottom:3px solid #c41e3a;padding-bottom:10px;margin-bottom:16px}.company{color:#c41e3a;font-weight:900;font-size:15px}.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}.kpi{border:1.5px solid #f0e8ea;border-radius:8px;padding:10px 12px;text-align:center}.kpi-val{font-size:18px;font-weight:900;color:#c41e3a;margin-top:4px}.kpi-label{font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase}table{width:100%;border-collapse:collapse}th{background:#c41e3a;color:#fff;font-weight:700;padding:7px 8px;text-align:left;font-size:10px}td{padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:10px}tr:nth-child(even) td{background:#fdf7f8}.total-row td{font-weight:800;background:#fff0f3!important;border-top:2px solid #fecaca}.print-btn{position:fixed;top:12px;right:12px;background:#c41e3a;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:700;cursor:pointer}@media print{.print-btn{display:none}}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Print</button>
    <div class="header"><div><div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div><div style="font-size:14px;font-weight:800;color:#8b0000;margin-top:4px">🏢 Company Stock Summary — All Branches</div><div style="color:#64748b;font-size:10px;margin-top:3px">Period: ${periodLabel} · ${allBranchSummaries.length} Branch(es)</div></div><div style="text-align:right;color:#64748b;font-size:10px;line-height:1.6">Date: ${now.toLocaleDateString('en-NA',{day:'2-digit',month:'long',year:'numeric'})}<br>Generated by: Stock Management</div></div>
    <div class="kpi-grid"><div class="kpi"><div class="kpi-label">Total Closing Stock</div><div class="kpi-val">${companySummary.closing.toLocaleString()}</div></div><div class="kpi"><div class="kpi-label">Total Stock Value</div><div class="kpi-val">N$ ${companySummary.closingValue.toFixed(0)}</div></div><div class="kpi"><div class="kpi-label">Total Sales (units)</div><div class="kpi-val">${companySummary.salesQty.toLocaleString()}</div></div><div class="kpi"><div class="kpi-label">Total Sales Revenue</div><div class="kpi-val">N$ ${companySummary.salesRevenue.toFixed(0)}</div></div></div>
    <table><thead><tr><th>Branch</th><th>Opening</th><th>Issued</th><th>Returns</th><th>Expiring</th><th>Sales (units)</th><th>Closing Qty</th><th>Closing Value</th></tr></thead>
    <tbody>${brRows}
    <tr class="total-row"><td><strong>COMPANY TOTAL</strong></td><td>-</td><td><strong style="color:#166534">${companySummary.issued.toLocaleString()}</strong></td><td><strong style="color:#92400e">${companySummary.returns.toLocaleString()}</strong></td><td><strong style="color:#c41e3a">${companySummary.expiry.toLocaleString()}</strong></td><td><strong style="color:#c41e3a">${companySummary.salesQty.toLocaleString()}</strong></td><td><strong style="color:#15803d">${companySummary.closing.toLocaleString()}</strong></td><td><strong>N$ ${companySummary.closingValue.toFixed(2)}</strong></td></tr>
    </tbody></table></body></html>`);
    win.document.close();
  };

  return (
    <div>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', borderRadius: 14, padding: '16px 20px', marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.12em', margin: 0 }}>Stock Management · Branch View</p>
          <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800, margin: '3px 0 0' }}>🏪 Per-Branch Stock Dashboard</h3>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.78rem', margin: '3px 0 0' }}>Live stock balances per shop · {periodLabel}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={loadData} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', padding: '7px 14px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>🔄 Refresh</button>
          <button onClick={printCompanyReport} style={{ background: '#fff', border: 'none', color: '#c41e3a', padding: '7px 14px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer' }}>🖨️ Company Report PDF</button>
        </div>
      </div>

      {/* Period filter */}
      <PeriodFilter period={period} onChange={setPeriod} />

      {/* Company KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, marginBottom: 18 }}>
        {[
          ['Total Branches', allBranchSummaries.length, '#1e3a5f', '#f4f7fb'],
          ['Closing Stock', companySummary.closing.toLocaleString(), '#15803d', '#f0fdf4'],
          ['Stock Value', `N$${Math.round(companySummary.closingValue).toLocaleString()}`, '#c41e3a', '#fff0f3'],
          ['Sales (units)', companySummary.salesQty.toLocaleString(), '#c41e3a', '#fef2f2'],
          ['Sales Revenue', `N$${Math.round(companySummary.salesRevenue).toLocaleString()}`, '#166534', '#f0fdf4'],
          ['Expiring Items', companySummary.expiry.toLocaleString(), companySummary.expiry > 0 ? '#c41e3a' : '#166534', '#fef2f2'],
        ].map(([l, v, col, bg]) => (
          <div key={l} style={{ background: bg, border: '1.5px solid #f0e8ea', borderRadius: 12, padding: '12px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em' }}>{l}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 900, color: col, marginTop: 4 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {[{ id: 'dashboard', label: '📊 Dashboard' }, { id: 'products', label: '📦 Products' }].map(v => (
          <button key={v.id} onClick={() => setViewMode(v.id)} style={{ padding: '7px 18px', borderRadius: 20, fontSize: '0.83rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: viewMode === v.id ? '#c41e3a' : '#f1f5f9', color: viewMode === v.id ? '#fff' : '#64748b' }}>{v.label}</button>
        ))}
        <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} style={{ marginLeft: 'auto', padding: '7px 12px', border: '1.5px solid #e8d5d8', borderRadius: 20, fontSize: '0.83rem', outline: 'none', color: '#374151', fontWeight: 600 }}>
          <option value="all">All Branches</option>
          {BRANCHES.map(b => <option key={b} value={b.toLowerCase().replace(/\s+/g, '_')}>{b}</option>)}
        </select>
      </div>

      {/* Dashboard view — card per branch */}
      {viewMode === 'dashboard' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 14 }}>
          {displayBranches.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🏪</div>
              <p style={{ fontWeight: 600 }}>No branch stock data available</p>
              <p style={{ fontSize: '0.82rem', marginTop: 6 }}>Stock data appears here once inventory is loaded into branches via transfers from the warehouse</p>
            </div>
          )}
          {displayBranches.map(br => (
            <div key={br.key} style={{ background: '#fff', border: '1.5px solid #f0e8ea', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(196,30,58,0.06)' }}>
              <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem' }}>📍 {br.name}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.72rem' }}>{br.products.length} products</span>
                  <button onClick={() => printBranchReport(br)} style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', padding: '4px 10px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>🖨️ Print</button>
                </div>
              </div>
              <div>
                {[
                  ['Opening Stock', br.opening, '#1e3a5f'],
                  ['+ Issued / Received', br.issued, '#166534'],
                  ['− Sales (units)', br.salesQty, '#c41e3a'],
                  ['− Returns', br.returns, '#92400e'],
                  ['− Expiring', br.expiryQty, '#c41e3a'],
                  ['− Promotions', 0, '#c41e3a'],
                ].map(([label, val, color]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: '0.82rem', color: '#374151', fontWeight: 600 }}>{label}</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 800, color }}>{Number(val || 0).toLocaleString()}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', borderTop: '2px solid #86efac' }}>
                  <span style={{ fontSize: '0.88rem', color: '#166534', fontWeight: 800 }}>= Closing Stock</span>
                  <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#15803d' }}>{br.closingQty.toLocaleString()}</span>
                </div>
                <div style={{ padding: '8px 16px', background: '#fafafa', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b' }}>
                  <span>Sales: <strong style={{ color: '#c41e3a' }}>{br.salesQty} units</strong></span>
                  <span>Revenue: <strong style={{ color: '#1e3a5f' }}>N$ {br.salesRevenue.toFixed(2)}</strong></span>
                  <span>Value: <strong style={{ color: '#1e3a5f' }}>N$ {br.closingValue.toFixed(0)}</strong></span>
                </div>
                {br.expiryQty > 0 && (
                  <div style={{ padding: '6px 16px', background: '#fff0f3', borderTop: '1px solid #fecaca', fontSize: '0.75rem', color: '#c41e3a', fontWeight: 700 }}>
                    ⚠️ {br.expiryQty} units expiring/expired
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Products view */}
      {viewMode === 'products' && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h3 className="font-bold text-gray-800">Product Stock by Branch</h3>
              <Button size="sm" variant="secondary" onClick={() => {
                const allProds = displayBranches.flatMap(br => br.products.map(p => ({ ...p, branch: br.name })));
                const rows = allProds.map(p => `<tr><td>${p.product_name}</td><td>${p.branch}</td><td style="font-weight:800;color:${p.qty===0?'#c41e3a':p.qty<10?'#d97706':'#166534'}">${p.qty}</td><td>${p.expiring?'⚠ Expiring':'-'}</td><td>N$ ${p.value.toFixed(2)}</td></tr>`).join('');
                printDocument('Per-Branch Product Stock', `<table><thead><tr><th>Product</th><th>Branch</th><th>Qty</th><th>Expiry</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table>`, true);
              }}><Printer size={14} /> Print</Button>
            </div>
          </CardHeader>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
            <input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search products…" style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <Table
            columns={[
              { header: 'Product', render: r => <span className="font-semibold">{r.product_name}</span> },
              { header: 'Branch', render: r => <Badge variant="info">{r.branch}</Badge> },
              { header: 'Qty', render: r => <span style={{ fontWeight: 800, color: r.qty === 0 ? '#c41e3a' : r.qty < 10 ? '#d97706' : '#166534' }}>{r.qty}</span> },
              { header: 'Status', render: r => r.qty === 0 ? <Badge variant="danger">Out of Stock</Badge> : r.qty < 10 ? <Badge variant="warning">Low</Badge> : <Badge variant="success">OK</Badge> },
              { header: 'Expiry', render: r => r.expiring ? <Badge variant="danger">⚠ Expiring</Badge> : '-' },
              { header: 'Stock Value', render: r => `N$ ${r.value.toFixed(2)}` },
            ]}
            data={displayBranches.flatMap(br => br.products.map(p => ({ ...p, branch: br.name }))).filter(p => !productSearch || p.product_name.toLowerCase().includes(productSearch.toLowerCase()))}
            emptyMessage="No product data available for selected branch(es)"
          />
        </Card>
      )}
    </div>
  );
}

// ─── Stock Reports Tab ─────────────────────────────────────────────────────────
function StockReportsTab({ branch }) {
  const [batches, setBatches] = useState([]);
  const [walkinSales, setWalkinSales] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState(branch && branch !== 'all' ? branch : 'all');
  const [misReport, setMisReport] = useState(null);
  const [period, setPeriod] = useState(getDefaultPeriod);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.stock.batches().then(d => Array.isArray(d) ? d : d.batches || []).catch(() => []),
      api.branch.walkinSales().then(d => Array.isArray(d) ? d : d.sales || d.walkin_sales || []).catch(() => []),
      api.stock.movements().then(d => Array.isArray(d) ? d : d.movements || []).catch(() => []),
      api.mis.stockReport().catch(() => null),
    ]).then(([b, s, m, mis]) => {
      setBatches(b);
      setWalkinSales(s);
      setMovements(m);
      setMisReport(mis);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <LoadingSpinner />;

  const now = new Date();
  const periodStart = new Date(period.from + 'T00:00:00');
  const periodEnd = new Date(period.to + 'T23:59:59');
  const periodLabel = fmtPeriodLabel(period.from, period.to);

  const buildFormula = (branchKey) => {
    const branchBatches = batches.filter(b => (b.location || '').toLowerCase().replace(/\s+/g, '_') === branchKey);
    const branchSales = walkinSales.filter(s => (s.branch || '').toLowerCase().replace(/\s+/g, '_') === branchKey);
    const branchMovs = movements.filter(m => (m.location || '').toLowerCase().replace(/\s+/g, '_') === branchKey);

    const closingQty = branchBatches.reduce((s, b) => s + Number(b.quantity || 0), 0);
    const closingValue = branchBatches.reduce((s, b) => s + Number(b.quantity || 0) * Number(b.unit_price || 0), 0);
    const expiryQty = branchBatches.filter(b => b.expiry_date && new Date(b.expiry_date) < now).reduce((s, b) => s + Number(b.quantity || 0), 0);

    const movsPeriod = branchMovs.filter(m => m.created_at && new Date(m.created_at) >= periodStart && new Date(m.created_at) <= periodEnd);
    const issued = movsPeriod.filter(m => (m.movement_type || '').includes('in') || (m.movement_type || '').includes('receiv')).reduce((s, m) => s + Number(m.quantity || 0), 0);
    const returns_ = movsPeriod.filter(m => (m.movement_type || '').includes('return')).reduce((s, m) => s + Number(m.quantity || 0), 0);

    const salesPeriod = branchSales.filter(s => s.created_at && new Date(s.created_at) >= periodStart && new Date(s.created_at) <= periodEnd);
    const salesQty = salesPeriod.reduce((s, r) => {
      const items = (() => { try { return typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []); } catch { return []; } })();
      return s + items.reduce((si, i) => si + Number(i.quantity || 0), 0);
    }, 0);

    // Opening = Closing − Issued + Sales + Returns + Expiring (backwards from closing)
    const opening = Math.max(0, closingQty + salesQty + returns_ + expiryQty - issued);
    return { opening, issued, returns: returns_, expiryQty, promotions: 0, closing: closingQty, closingValue, salesQty };
  };

  const branchReports = BRANCHES.map(b => {
    const key = b.toLowerCase().replace(/\s+/g, '_');
    const formula = buildFormula(key);
    return { name: b, key, formula };
  });

  const displayReports = selectedBranch === 'all' ? branchReports : branchReports.filter(r => r.key === selectedBranch);

  const companySummary = {
    opening: branchReports.reduce((s, r) => s + r.formula.opening, 0),
    issued: branchReports.reduce((s, r) => s + r.formula.issued, 0),
    returns: branchReports.reduce((s, r) => s + r.formula.returns, 0),
    expiryQty: branchReports.reduce((s, r) => s + r.formula.expiryQty, 0),
    promotions: 0,
    closing: branchReports.reduce((s, r) => s + r.formula.closing, 0),
    closingValue: branchReports.reduce((s, r) => s + r.formula.closingValue, 0),
    salesQty: branchReports.reduce((s, r) => s + r.formula.salesQty, 0),
  };

  const printAllBranches = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const brRows = displayReports.map(br => `<tr><td style="font-weight:700">${br.name}</td><td>${br.formula.opening.toLocaleString()}</td><td style="color:#166534;font-weight:700">+${br.formula.issued.toLocaleString()}</td><td style="color:#c41e3a;font-weight:700">−${br.formula.salesQty.toLocaleString()}</td><td style="color:#92400e">−${br.formula.returns.toLocaleString()}</td><td style="color:#c41e3a">−${br.formula.expiryQty.toLocaleString()}</td><td style="color:#c41e3a">−0</td><td style="font-weight:800;color:#15803d">${br.formula.closing.toLocaleString()}</td><td>N$ ${br.formula.closingValue.toFixed(2)}</td></tr>`).join('');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Stock Formula Report</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;padding:24px}.header{display:flex;justify-content:space-between;border-bottom:3px solid #c41e3a;padding-bottom:10px;margin-bottom:16px}.company{color:#c41e3a;font-weight:900;font-size:15px}.formula-banner{background:linear-gradient(135deg,#c41e3a,#8b0000);color:#fff;border-radius:10px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}.fb-item{text-align:center}.fb-val{font-size:14px;font-weight:900}.fb-label{font-size:8px;opacity:.7;font-weight:700;text-transform:uppercase}table{width:100%;border-collapse:collapse}th{background:#c41e3a;color:#fff;font-weight:700;padding:6px 8px;text-align:left;font-size:10px}td{padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:10px}tr:nth-child(even) td{background:#fdf7f8}.total-row td{font-weight:800;background:#fff0f3!important;border-top:2px solid #fecaca}.print-btn{position:fixed;top:12px;right:12px;background:#c41e3a;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:700;cursor:pointer}@media print{.print-btn{display:none}}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Print</button>
    <div class="header"><div><div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div><div style="font-size:14px;font-weight:800;color:#8b0000;margin-top:4px">📋 Stock Formula Report — ${selectedBranch === 'all' ? 'All Branches' : displayReports[0]?.name || ''}</div><div style="color:#64748b;font-size:10px;margin-top:3px">Period: ${periodLabel}</div></div><div style="text-align:right;color:#64748b;font-size:10px;line-height:1.6">Date: ${now.toLocaleDateString('en-NA',{day:'2-digit',month:'long',year:'numeric'})}<br>Generated by: Stock Management</div></div>
    <div class="formula-banner"><div class="fb-item"><div class="fb-val">${companySummary.opening.toLocaleString()}</div><div class="fb-label">Opening</div></div><div style="font-size:16px;font-weight:900">+</div><div class="fb-item"><div class="fb-val">${companySummary.issued.toLocaleString()}</div><div class="fb-label">Issued</div></div><div style="font-size:16px;font-weight:900">−</div><div class="fb-item"><div class="fb-val">${companySummary.salesQty.toLocaleString()}</div><div class="fb-label">Sales</div></div><div style="font-size:16px;font-weight:900">−</div><div class="fb-item"><div class="fb-val">${companySummary.returns.toLocaleString()}</div><div class="fb-label">Returns</div></div><div style="font-size:16px;font-weight:900">−</div><div class="fb-item"><div class="fb-val">${companySummary.expiryQty.toLocaleString()}</div><div class="fb-label">Expiring</div></div><div style="font-size:16px;font-weight:900">−</div><div class="fb-item"><div class="fb-val">0</div><div class="fb-label">Promotions</div></div><div style="font-size:16px;font-weight:900">=</div><div class="fb-item"><div class="fb-val" style="font-size:18px">${companySummary.closing.toLocaleString()}</div><div class="fb-label">Closing</div></div></div>
    <table><thead><tr><th>Branch</th><th>Opening</th><th>+ Issued</th><th>− Sales</th><th>− Returns</th><th>− Expiring</th><th>− Promotions</th><th>= Closing Qty</th><th>Closing Value</th></tr></thead>
    <tbody>${brRows}
    <tr class="total-row"><td><strong>COMPANY TOTAL</strong></td><td><strong>${companySummary.opening.toLocaleString()}</strong></td><td><strong style="color:#166534">+${companySummary.issued.toLocaleString()}</strong></td><td><strong style="color:#c41e3a">−${companySummary.salesQty.toLocaleString()}</strong></td><td><strong style="color:#92400e">−${companySummary.returns.toLocaleString()}</strong></td><td><strong style="color:#c41e3a">−${companySummary.expiryQty.toLocaleString()}</strong></td><td><strong>−0</strong></td><td><strong style="color:#15803d">${companySummary.closing.toLocaleString()}</strong></td><td><strong>N$ ${companySummary.closingValue.toFixed(2)}</strong></td></tr>
    </tbody></table></body></html>`);
    win.document.close();
  };

  return (
    <div>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', borderRadius: 14, padding: '16px 20px', marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.12em', margin: 0 }}>Stock Management · Reports</p>
          <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800, margin: '3px 0 0' }}>📋 Stock Formula Reports</h3>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.78rem', margin: '3px 0 0' }}>Opening + Issued − Sales − Returns − Expiring − Promotions = Closing · {periodLabel}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={loadData} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', padding: '7px 14px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>🔄 Refresh</button>
          <button onClick={printAllBranches} style={{ background: '#fff', border: 'none', color: '#c41e3a', padding: '7px 14px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer' }}>🖨️ Print Full Report PDF</button>
        </div>
      </div>

      {/* Period filter */}
      <PeriodFilter period={period} onChange={setPeriod} />

      {/* Company summary formula */}
      <div style={{ background: '#fff', border: '1.5px solid #f0e8ea', borderRadius: 14, padding: '16px 20px', marginBottom: 18 }}>
        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#c41e3a', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12, borderBottom: '1px solid #fecaca', paddingBottom: 8 }}>📐 Company-Wide Formula — {periodLabel}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))', gap: 8 }}>
          {[
            ['Opening Stock', companySummary.opening, '#1e3a5f', '#f4f7fb'],
            ['+ Issued / Received', companySummary.issued, '#166534', '#f0fdf4'],
            ['− Sales (units)', companySummary.salesQty, '#c41e3a', '#fef2f2'],
            ['− Returns', companySummary.returns, '#92400e', '#fffbeb'],
            ['− Expiring', companySummary.expiryQty, '#c41e3a', '#fef2f2'],
            ['− Promotions', 0, '#c41e3a', '#fef2f2'],
            ['= Closing Stock', companySummary.closing, '#15803d', '#f0fdf4'],
          ].map(([l, v, col, bg]) => (
            <div key={l} style={{ background: bg, border: '1.5px solid #f0e8ea', borderRadius: 10, padding: '10px 12px', textAlign: 'center', ...(l.includes('=') ? { borderColor: '#86efac', gridColumn: 'span 2' } : {}) }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em' }}>{l}</div>
              <div style={{ fontSize: l.includes('=') ? '1.4rem' : '1.1rem', fontWeight: 900, color: col, marginTop: 4 }}>{Number(v || 0).toLocaleString()}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 16, fontSize: '0.78rem', color: '#64748b', paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
          <span>Stock Value: <strong style={{ color: '#c41e3a' }}>N$ {companySummary.closingValue.toFixed(2)}</strong></span>
          <span>Sales (units): <strong style={{ color: '#c41e3a' }}>{companySummary.salesQty.toLocaleString()}</strong></span>
        </div>
      </div>

      {/* Branch filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151' }}>Filter by branch:</span>
        <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} style={{ padding: '7px 12px', border: '1.5px solid #e8d5d8', borderRadius: 20, fontSize: '0.83rem', outline: 'none', color: '#374151', fontWeight: 600 }}>
          <option value="all">All Branches</option>
          {BRANCHES.map(b => <option key={b} value={b.toLowerCase().replace(/\s+/g, '_')}>{b}</option>)}
        </select>
      </div>

      {/* Per-branch report table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">Per-Branch Stock Formula</h3>
            <Button size="sm" variant="secondary" onClick={printAllBranches}><Printer size={14} /> Print Report</Button>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Branch', render: r => <span className="font-bold text-gray-800">{r.name}</span> },
            { header: 'Opening', render: r => <span style={{ color: '#1e3a5f', fontWeight: 700 }}>{r.formula.opening.toLocaleString()}</span> },
            { header: '+ Issued', render: r => <span style={{ color: '#166534', fontWeight: 700 }}>+{r.formula.issued.toLocaleString()}</span> },
            { header: '− Sales', render: r => <span style={{ color: '#c41e3a', fontWeight: 700 }}>−{r.formula.salesQty.toLocaleString()}</span> },
            { header: '− Returns', render: r => <span style={{ color: '#92400e', fontWeight: 700 }}>−{r.formula.returns.toLocaleString()}</span> },
            { header: '− Expiring', render: r => <span style={{ color: '#c41e3a', fontWeight: 700 }}>−{r.formula.expiryQty.toLocaleString()}</span> },
            { header: '− Promotions', render: () => '−0' },
            { header: '= Closing', render: r => <span style={{ color: '#15803d', fontWeight: 900, fontSize: '1rem' }}>{r.formula.closing.toLocaleString()}</span> },
            { header: 'Stock Value', render: r => <span style={{ fontWeight: 600, color: '#1e3a5f' }}>N$ {r.formula.closingValue.toFixed(2)}</span> },
          ]}
          data={displayReports}
          emptyMessage="No data available"
        />
        {/* Total row */}
        <div style={{ padding: '10px 16px', background: '#fff0f3', borderTop: '2px solid #fecaca', display: 'flex', gap: 24, fontSize: '0.82rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, color: '#c41e3a' }}>COMPANY TOTAL</span>
          <span>Opening: <strong>{companySummary.opening.toLocaleString()}</strong></span>
          <span>Issued: <strong style={{ color: '#166534' }}>+{companySummary.issued.toLocaleString()}</strong></span>
          <span>Sales: <strong style={{ color: '#c41e3a' }}>−{companySummary.salesQty.toLocaleString()}</strong></span>
          <span>Returns: <strong style={{ color: '#92400e' }}>−{companySummary.returns.toLocaleString()}</strong></span>
          <span>Expiring: <strong style={{ color: '#c41e3a' }}>−{companySummary.expiryQty.toLocaleString()}</strong></span>
          <span>Closing: <strong style={{ color: '#15803d', fontSize: '1rem' }}>{companySummary.closing.toLocaleString()}</strong></span>
          <span>Value: <strong>N$ {companySummary.closingValue.toFixed(2)}</strong></span>
        </div>
      </Card>

      {/* MIS stock report reference */}
      {misReport && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: '#f4f7fb', border: '1.5px solid #c8d8e8', borderRadius: 12, fontSize: '0.82rem', color: '#1e3a5f' }}>
          <strong>📊 MIS Stock Report also available</strong> — The MIS portal provides an additional automated stock formula report cross-referenced with branch data. Check the MIS portal for the combined view.
        </div>
      )}
    </div>
  );
}

function RealtimeTab({ branch }) {
  const [batches, setBatches] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchData = useCallback(() => {
    Promise.all([
      api.stock.batches().then(d => Array.isArray(d) ? d : d.batches || []).catch(() => []),
      api.stock.movements().then(d => Array.isArray(d) ? d : d.movements || []).catch(() => []),
    ]).then(([b, m]) => {
      setBatches(b);
      setMovements(m);
      setLastRefresh(new Date());
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) return <LoadingSpinner />;

  const filterB = (b) => branch === 'all' || (b.location || '').toLowerCase().replace(/\s+/g, '_') === branch;
  const filterM = (m) => branch === 'all' || (m.location || m.source_location || m.destination_location || '').toLowerCase().replace(/\s+/g, '_') === branch;

  const filteredBatches = batches.filter(filterB);
  const filteredMovements = movements.filter(filterM);

  const stockByProduct = {};
  filteredBatches.forEach(b => {
    const name = b.product_name || 'Unknown';
    if (!stockByProduct[name]) stockByProduct[name] = { qty: 0, lastMovement: null, location: b.location };
    stockByProduct[name].qty += Number(b.quantity || 0);
  });

  filteredMovements.forEach(m => {
    const name = m.product_name || 'Unknown';
    if (stockByProduct[name] && (!stockByProduct[name].lastMovement || new Date(m.created_at) > new Date(stockByProduct[name].lastMovement))) {
      stockByProduct[name].lastMovement = m.created_at;
    }
  });

  const stockCards = Object.entries(stockByProduct).map(([name, data]) => ({ name, ...data }));
  const recentMovements = [...filteredMovements].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            <Zap size={20} className="text-yellow-500" /> Real-Time Stock Dashboard
          </h3>
          <p className="text-xs text-gray-500">Auto-refreshes every 30 seconds | Last: {formatDateTime(lastRefresh)}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={fetchData}><Zap size={14} /> Refresh Now</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {stockCards.map(item => (
          <Card key={item.name} className="hover:shadow-md transition-shadow">
            <CardBody>
              <h4 className="text-sm font-semibold text-gray-800 truncate" title={item.name}>{item.name}</h4>
              <div className="flex justify-between items-end mt-2">
                <div>
                  <p className="text-2xl font-bold text-primary">{item.qty}</p>
                  <p className="text-xs text-gray-400">in stock</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">{item.lastMovement ? formatDateTime(item.lastMovement) : 'No movements'}</p>
                </div>
              </div>
            </CardBody>
          </Card>
        ))}
        {stockCards.length === 0 && <div className="col-span-full"><EmptyState icon={<Package size={48} />} title="No stock data" description="No real-time stock data available" /></div>}
      </div>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Live Movement Feed</h3></CardHeader>
        <Table
          columns={[
            { header: 'Time', render: r => formatDateTime(r.created_at) },
            { header: 'Product', key: 'product_name' },
            { header: 'Type', render: r => <Badge variant={r.movement_type === 'in' ? 'success' : r.movement_type === 'out' ? 'danger' : 'warning'}>{r.movement_type || 'Movement'}</Badge> },
            { header: 'Quantity', key: 'quantity' },
            { header: 'Location', key: 'location' },
          ]}
          data={recentMovements}
          emptyMessage="No recent movements"
        />
      </Card>
    </div>
  );
}

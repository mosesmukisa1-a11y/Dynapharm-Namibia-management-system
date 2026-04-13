import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { useStockRealtime } from '../../hooks/useStockRealtime';
import StaffServicesTab from '../../components/StaffServicesTab';
import StaffMessagesTab from '../../components/StaffMessagesTab';
import DispatchNote from '../../components/DispatchNote';
import { PRICE_LIST, getCIFPrice, getDPCPrice, getProductProfit, findProductPrice, getLiveProductList } from '../../lib/pricing';
import { formatCurrency, formatDateTime, formatDate, BRANCHES, BRANCH_DETAILS } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Table, Modal, Alert, Select, Textarea } from '../../components/ui';
import { Package, Warehouse, Truck, ArrowLeftRight, Globe, BarChart3, ClipboardList, FileSpreadsheet, Zap, Share2, ShoppingCart, Plus, Download, Filter, Search, DollarSign, TrendingUp, Ship, Calendar, CheckCircle, Printer, Tag, Edit2, Clock, XCircle, Brain, AlertTriangle, TrendingDown, MapPin, Users, Activity, Shield, Bell, RefreshCw, Target, Cpu, Megaphone } from 'lucide-react';
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

// ── Field Stock Tab ──────────────────────────────────────────────────────────
function FieldStockTab() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);
  const [showReturn, setShowReturn] = useState(null);
  const [returnQty, setReturnQty] = useState('');
  const [soldQty, setSoldQty] = useState('');
  const [form, setForm] = useState({ officer_name: '', team_name: '', product_name: '', batch_no: '', expiry_date: '', quantity_issued: '', origin_location: '', origin_type: 'warehouse', notes: '' });
  const [productOptions, setProductOptions] = useState(PRICE_LIST.map(p => p.description).sort());
  const [search, setSearch] = useState('');

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.stock.fieldStock().catch(() => []),
      api.prices.list().catch(() => []),
    ]).then(([fsData, priceData]) => {
      const rows = Array.isArray(fsData) ? fsData : [];
      setRecords(rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      const namesSet = new Set(PRICE_LIST.map(p => p.description));
      const prices = Array.isArray(priceData) ? priceData : [];
      prices.filter(p => !p.is_package && p.description).forEach(p => namesSet.add(p.description));
      setProductOptions([...namesSet].sort());
    }).finally(() => setLoading(false));
  }, []);

  const { connected: wsConnected } = useStockRealtime({ onUpdate: loadData });

  useEffect(() => { loadData(); }, [loadData]);

  const handleIssue = async (e) => {
    e.preventDefault();
    if (!form.officer_name || !form.product_name || !form.quantity_issued || Number(form.quantity_issued) <= 0) {
      setAlert({ type: 'error', msg: 'Officer name, product, and quantity are required' });
      return;
    }
    setSubmitting(true);
    try {
      await api.stock.createFieldStock({
        officer_name: form.officer_name,
        team_name: form.team_name || null,
        product_name: form.product_name,
        batch_no: form.batch_no || null,
        expiry_date: form.expiry_date || null,
        quantity_issued: Number(form.quantity_issued),
        origin_location: form.origin_location || 'windhoek_warehouse',
        origin_type: form.origin_type || 'warehouse',
        notes: form.notes || null,
        created_by: user?.full_name || user?.username,
      });
      setShowForm(false);
      setForm({ officer_name: '', team_name: '', product_name: '', batch_no: '', expiry_date: '', quantity_issued: '', origin_location: '', origin_type: 'warehouse', notes: '' });
      setAlert({ type: 'success', msg: `Stock issued to ${form.officer_name} successfully` });
      setTimeout(loadData, 100);
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturn = async (record) => {
    const returned = Number(returnQty) || 0;
    const sold = Number(soldQty) || 0;
    if (returned <= 0 && sold <= 0) {
      setAlert({ type: 'error', msg: 'Enter return or sold quantity' });
      return;
    }
    try {
      await api.stock.updateFieldStock(record.id, {
        quantity_returned: Number(record.quantity_returned || 0) + returned,
        quantity_sold: Number(record.quantity_sold || 0) + sold,
      });
      setShowReturn(null);
      setReturnQty('');
      setSoldQty('');
      setAlert({ type: 'success', msg: 'Field stock updated successfully' });
      setTimeout(loadData, 100);
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    }
  };

  if (loading) return <LoadingSpinner />;

  const filtered = search.trim() ? records.filter(r => {
    const q = search.toLowerCase();
    return (r.officer_name || '').toLowerCase().includes(q) || (r.product_name || '').toLowerCase().includes(q) || (r.team_name || '').toLowerCase().includes(q);
  }) : records;

  const activeRecords = filtered.filter(r => r.status === 'issued');
  const closedRecords = filtered.filter(r => r.status === 'closed');
  const totalIssued = activeRecords.reduce((s, r) => s + Number(r.quantity_issued || 0), 0);
  const totalBalance = activeRecords.reduce((s, r) => s + Number(r.balance || 0), 0);
  const totalSold = records.reduce((s, r) => s + Number(r.quantity_sold || 0), 0);
  const totalReturned = records.reduce((s, r) => s + Number(r.quantity_returned || 0), 0);

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} className="mb-4" onClose={() => setAlert(null)}>{alert.msg}</Alert>}

      <Card className="bg-gradient-to-r from-orange-50 to-yellow-50 border-orange-200">
        <CardBody>
          <div className="flex items-start gap-4">
            <Users size={32} className="text-orange-600 mt-1" />
            <div>
              <h3 className="font-bold text-orange-900">Field Stock Management</h3>
              <p className="text-sm text-orange-700 mt-1">
                Track stock issued to field officers/teams. Record returns, sales, and monitor outstanding balances.
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Active Issues" value={activeRecords.length} color="orange" icon={<Users size={24} />} />
        <StatCard title="Total Issued" value={totalIssued.toLocaleString()} color="blue" icon={<Package size={24} />} />
        <StatCard title="Field Balance" value={totalBalance.toLocaleString()} color="purple" icon={<Activity size={24} />} />
        <StatCard title="Sold / Returned" value={`${totalSold} / ${totalReturned}`} color="green" icon={<TrendingUp size={24} />} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              Field Stock Records
              {wsConnected && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#dcfce7', color: '#166534', borderRadius: 99, padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />LIVE</span>}
            </h3>
            <div className="flex gap-2">
              <div className="relative">
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search officer, product..."
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 w-48" />
              </div>
              <Button size="sm" variant="secondary" onClick={loadData}>Refresh</Button>
              <Button size="sm" variant="secondary" onClick={() => {
                const rows = filtered.map(r => `<tr><td>${r.officer_name||''}</td><td>${r.product_name||''}</td><td>${r.batch_no||'-'}</td><td>${r.quantity_issued||0}</td><td>${r.quantity_returned||0}</td><td>${r.quantity_sold||0}</td><td>${r.balance||0}</td><td>${r.status||''}</td></tr>`).join('');
                printDocument('Field Stock Report', `<table><thead><tr><th>Officer</th><th>Product</th><th>Batch</th><th>Issued</th><th>Returned</th><th>Sold</th><th>Balance</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`);
              }}><Printer size={14} /> Print</Button>
              <Button size="sm" onClick={() => setShowForm(true)}><Plus size={16} /> Issue to Field</Button>
            </div>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Date', render: r => formatDateTime(r.created_at || r.issue_date) },
            { header: 'Officer', render: r => <div><span className="font-medium">{r.officer_name}</span>{r.team_name && <span className="text-xs text-gray-400 block">{r.team_name}</span>}</div> },
            { header: 'Product', render: r => <span className="text-xs">{r.product_name}</span> },
            { header: 'Batch', render: r => r.batch_no || '-' },
            { header: 'Expiry', render: r => r.expiry_date ? formatDate(r.expiry_date) : '-' },
            { header: 'Issued', render: r => <span className="font-bold">{r.quantity_issued}</span> },
            { header: 'Returned', render: r => r.quantity_returned || 0 },
            { header: 'Sold', render: r => r.quantity_sold || 0 },
            { header: 'Balance', render: r => <span className={Number(r.balance) > 0 ? 'text-orange-600 font-bold' : 'text-green-600 font-bold'}>{r.balance || 0}</span> },
            { header: 'Status', render: r => <Badge variant={r.status === 'issued' ? 'warning' : 'success'}>{r.status || 'issued'}</Badge> },
            { header: '', render: r => r.status === 'issued' ? (
              <button onClick={() => { setShowReturn(r); setReturnQty(''); setSoldQty(''); }}
                style={{ padding: '4px 10px', background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd', borderRadius: 6, cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700 }}>
                Return/Sold
              </button>
            ) : null },
          ]}
          data={filtered}
          emptyMessage="No field stock records yet"
        />
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Issue Stock to Field Officer" size="md">
        <form onSubmit={handleIssue} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Officer Name *" value={form.officer_name} onChange={e => setForm(f => ({ ...f, officer_name: e.target.value }))} placeholder="e.g. John Doe" />
            <Input label="Team Name" value={form.team_name} onChange={e => setForm(f => ({ ...f, team_name: e.target.value }))} placeholder="e.g. Northern Team" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product *</label>
              <input list="field-prod-list" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" value={form.product_name}
                onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} placeholder="Search products..." autoComplete="off" />
              <datalist id="field-prod-list">{productOptions.map(name => <option key={name} value={name} />)}</datalist>
            </div>
            <Input label="Quantity *" type="number" min="1" value={form.quantity_issued} onChange={e => setForm(f => ({ ...f, quantity_issued: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Batch #" value={form.batch_no} onChange={e => setForm(f => ({ ...f, batch_no: e.target.value }))} />
            <Input label="Expiry Date" type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Origin</label>
              <select className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" value={form.origin_location} onChange={e => setForm(f => ({ ...f, origin_location: e.target.value }))}>
                <option value="">Select origin...</option>
                <option value="windhoek_warehouse">Windhoek Warehouse</option>
                <option value="ondangwa_warehouse">Ondangwa Warehouse</option>
                <option value="country_stock">Country Stock</option>
                {BRANCH_DETAILS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>
          <Input label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Purpose, event, etc." />
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={submitting}>{submitting ? 'Issuing...' : 'Issue Stock'}</Button>
            <Button variant="secondary" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!showReturn} onClose={() => setShowReturn(null)} title={`Record Return/Sale — ${showReturn?.product_name || ''}`} size="sm">
        {showReturn && (
          <div className="p-6 space-y-4">
            <p className="text-sm text-gray-600">
              Officer: <strong>{showReturn.officer_name}</strong> · Balance: <strong>{showReturn.balance}</strong> units
            </p>
            <Input label="Quantity Returned" type="number" min="0" max={showReturn.balance} value={returnQty} onChange={e => setReturnQty(e.target.value)} />
            <Input label="Quantity Sold" type="number" min="0" max={showReturn.balance} value={soldQty} onChange={e => setSoldQty(e.target.value)} />
            <div className="flex gap-3 pt-2">
              <Button onClick={() => handleReturn(showReturn)}>Update</Button>
              <Button variant="secondary" onClick={() => setShowReturn(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
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
  const [globalBranch, setGlobalBranch] = useState(user?.branch || 'all');

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
    { id: 'fieldStock', label: 'Field Stock', icon: '👥' },
    { id: 'adjustments', label: 'Edit Requests', icon: '✏️' },
    { id: 'campaigns', label: 'Campaigns', icon: '📢' },
    { id: 'staffServices', label: 'Staff Services', icon: '👤' },
    { id: 'messages', label: 'My Messages', icon: '📨' },
  ];

  const branchOptions = [
    { value: 'all', label: '🌍 All Branches' },
    ...BRANCH_DETAILS.map(b => ({ value: b.id, label: `📍 ${b.name}` })),
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
        {activeTab === 'fieldStock' && <FieldStockTab />}
        {activeTab === 'adjustments' && <AdjustmentsTab />}
        {activeTab === 'campaigns' && <StockCampaignsTab />}
        {activeTab === 'staffServices' && <StaffServicesTab accentColor="#92400e" />}
        {activeTab === 'messages' && <StaffMessagesTab accentColor="#92400e" />}
      </div>
    </div>
  );
}

// ── AI Command Center ─────────────────────────────────────────────────────────
function AICommandCenter({ branch }) {
  const [data, setData] = useState({ batches: [], movements: [], transfers: [], sales: [], branchData: [] });
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
      api.branch.stockSummary().then(d => d.branches || []).catch(() => []),
    ]).then(([batches, movements, transfers, sales, branchData]) => {
      setData({ batches, movements, transfers, sales, branchData });
      setLastRefresh(new Date());
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingSpinner />;

  const filterBatch = (b) => branch === 'all' || (b.location || '').toLowerCase().replace(/\s+/g, '_') === branch;
  const filteredBatches = data.batches.filter(filterBatch);

  const branchBatchesFlat = data.branchData.flatMap(br => (br.inventory || []).map(inv => ({
    product_name: inv.product_name, description: inv.product_name,
    batch_no: inv.batch_no, expiry_date: inv.expiry_date,
    quantity: inv.quantity, unit_price: inv.unit_price || getDPCPrice(inv.product_name || ''),
    location: br.branch_id,
  })));
  const allBatches = [...filteredBatches, ...branchBatchesFlat];

  const now = new Date();
  const thirtyFwd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const ninetyFwd = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const totalQty = allBatches.reduce((s, b) => s + Number(b.quantity || 0), 0);
  const totalValue = allBatches.reduce((s, b) => s + Number(b.quantity || 0) * (Number(b.unit_price || 0) || getDPCPrice(b.product_name || '')), 0);
  const expiredBatches = allBatches.filter(b => b.expiry_date && new Date(b.expiry_date) < now && Number(b.quantity) > 0);
  const expiringBatches = allBatches.filter(b => b.expiry_date && new Date(b.expiry_date) > now && new Date(b.expiry_date) <= thirtyFwd);

  const productTotals = {};
  allBatches.forEach(b => {
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

  const insights = stockAI.generateInsights(allBatches, data.movements, data.transfers);

  const reorderRecs = stockAI.getReorderRecommendations(allBatches, data.movements, data.sales)
    .slice(0, 8);

  const branchHealthScores = BRANCH_DETAILS.map(br => {
    const key = br.id;
    const brData = data.branchData.find(bd => bd.branch_id === key);
    const brBatches = brData ? (brData.inventory || []).map(inv => ({
      product_name: inv.product_name, quantity: inv.quantity, expiry_date: inv.expiry_date,
    })) : [];
    const health = stockAI.getBranchHealth(brBatches);
    const totalStk = brData ? (brData.closing_qty || 0) : 0;
    const pendingReqs = data.transfers.filter(t => (t.to_location || '') === key && (t.status === 'pending' || t.status === 'requested')).length;
    return { name: br.name, key, health, totalStk, pendingReqs };
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
  const [data, setData] = useState({ batches: [], movements: [], transfers: [], imports: [], fieldStock: [], branchData: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.stock.batches().then(d => Array.isArray(d) ? d : d.batches || []).catch(() => []),
      api.stock.movements().then(d => Array.isArray(d) ? d : d.movements || []).catch(() => []),
      api.stock.transfers().then(d => Array.isArray(d) ? d : d.transfers || []).catch(() => []),
      api.stock.supplierImports().catch(() => []),
      api.stock.fieldStock().catch(() => []),
      api.branch.stockSummary().then(d => d.branches || []).catch(() => []),
    ]).then(([batches, movements, transfers, imports, fieldStock, branchData]) => {
      setData({
        batches,
        movements,
        transfers,
        imports: Array.isArray(imports) ? imports : [],
        fieldStock: Array.isArray(fieldStock) ? fieldStock : [],
        branchData,
      });
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const filterBatch = (b) => branch === 'all' || (b.location || '').toLowerCase().replace(/\s+/g, '_') === branch;
  const filteredBatches = data.batches.filter(filterBatch);
  const filteredMovements = branch === 'all' ? data.movements : data.movements.filter(m =>
    (m.location || m.source_location || m.destination_location || '').toLowerCase().replace(/\s+/g, '_') === branch
  );

  const branchTotalQty = data.branchData.reduce((s, br) => s + (br.closing_qty || 0), 0);
  const branchTotalDPC = data.branchData.reduce((s, br) => {
    return s + (br.inventory || []).reduce((si, inv) => {
      const qty = Number(inv.quantity || 0);
      return si + qty * (Number(inv.unit_price || 0) || getDPCPrice(inv.product_name || ''));
    }, 0);
  }, 0);

  const warehouseQty = filteredBatches.reduce((sum, b) => sum + Number(b.remaining_quantity || b.quantity || 0), 0);
  const totalItems = warehouseQty + branchTotalQty;
  const totalCIF = filteredBatches.reduce((sum, b) => {
    const qty = Number(b.remaining_quantity || b.quantity || 0);
    const cif = Number(b.cif_unit_cost || b.unit_price || 0);
    return sum + qty * cif;
  }, 0);
  const totalDPC = filteredBatches.reduce((sum, b) => {
    const qty = Number(b.remaining_quantity || b.quantity || 0);
    const dpc = Number(b.dpc_unit_value || 0) || getDPCPrice(b.description || b.product_name || '');
    return sum + qty * dpc;
  }, 0) + branchTotalDPC;
  const pendingTransfers = data.transfers.filter(t => {
    const related = branch === 'all' || (t.from_location || '').toLowerCase().replace(/\s+/g, '_') === branch || (t.to_location || '').toLowerCase().replace(/\s+/g, '_') === branch;
    return related && (t.status === 'pending' || t.status === 'pending_approval' || t.status === 'submitted');
  }).length;
  const inTransit = data.transfers.filter(t => {
    const related = branch === 'all' || (t.from_location || '').toLowerCase().replace(/\s+/g, '_') === branch || (t.to_location || '').toLowerCase().replace(/\s+/g, '_') === branch;
    return related && (t.status === 'in_transit' || t.status === 'dispatched' || t.status === 'approved');
  }).length;

  const countryBatches = data.batches.filter(b => (b.location || '') === 'country_stock');
  const countryQty = countryBatches.reduce((s, b) => s + Number(b.remaining_quantity || b.quantity || 0), 0);
  const whkBatches = data.batches.filter(b => b.location === 'windhoek_warehouse');
  const whkQty = whkBatches.reduce((s, b) => s + Number(b.remaining_quantity || b.quantity || 0), 0);
  const ondBatches = data.batches.filter(b => b.location === 'ondangwa_warehouse');
  const ondQty = ondBatches.reduce((s, b) => s + Number(b.remaining_quantity || b.quantity || 0), 0);
  const fieldQty = data.fieldStock.reduce((s, f) => s + Number(f.balance || 0), 0);

  const now = new Date();
  const expiryThreshold = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const allBatchesForExpiry = [
    ...filteredBatches,
    ...data.branchData.flatMap(br => (br.inventory || []).map(inv => ({
      product_name: inv.product_name,
      description: inv.product_name,
      batch_no: inv.batch_no,
      expiry_date: inv.expiry_date,
      remaining_quantity: inv.quantity,
      location: br.branch_id,
    }))),
  ];
  const expiringBatches = allBatchesForExpiry.filter(b => {
    if (!b.expiry_date) return false;
    const exp = new Date(b.expiry_date);
    return exp <= expiryThreshold && Number(b.remaining_quantity || b.quantity || 0) > 0;
  });
  const expiredBatches = expiringBatches.filter(b => new Date(b.expiry_date) <= now);
  const soonExpiring = expiringBatches.filter(b => new Date(b.expiry_date) > now);

  const lowStockProducts = (() => {
    const byProduct = {};
    allBatchesForExpiry.forEach(b => {
      const name = b.description || b.product_name || 'Unknown';
      if (!byProduct[name]) byProduct[name] = 0;
      byProduct[name] += Number(b.remaining_quantity || b.quantity || 0);
    });
    return Object.entries(byProduct).filter(([, qty]) => qty > 0 && qty <= 10).sort((a, b) => a[1] - b[1]);
  })();

  return (
    <div>
      {branch !== 'all' && (
        <div style={{ marginBottom: 16, padding: '8px 14px', background: '#fff0f3', border: '1.5px solid #fecaca', borderRadius: 10, fontSize: '0.82rem', color: '#9b1c2e', fontWeight: 600 }}>
          Showing overview for: <strong>{fmtLocation(branch)}</strong>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Stock Units" value={totalItems.toLocaleString()} color="blue" icon={<Package size={24} />} />
        <StatCard title="Stock Value (CIF)" value={formatCurrency(totalCIF)} color="green" icon={<DollarSign size={24} />} />
        <StatCard title="Stock Value (DPC)" value={formatCurrency(totalDPC)} color="blue" icon={<TrendingUp size={24} />} />
        <StatCard title="Pending / In Transit" value={`${pendingTransfers} / ${inTransit}`} color="orange" icon={<Truck size={24} />} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-xs text-blue-600 font-semibold mb-1">Country Stock</p>
          <p className="text-xl font-bold text-blue-800">{countryQty.toLocaleString()}</p>
          <p className="text-xs text-blue-500">{countryBatches.length} batches</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-xs text-green-600 font-semibold mb-1">Windhoek WH</p>
          <p className="text-xl font-bold text-green-800">{whkQty.toLocaleString()}</p>
          <p className="text-xs text-green-500">{whkBatches.length} batches</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
          <p className="text-xs text-purple-600 font-semibold mb-1">Ondangwa WH</p>
          <p className="text-xl font-bold text-purple-800">{ondQty.toLocaleString()}</p>
          <p className="text-xs text-purple-500">{ondBatches.length} batches</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
          <p className="text-xs text-orange-600 font-semibold mb-1">Field Stock</p>
          <p className="text-xl font-bold text-orange-800">{fieldQty.toLocaleString()}</p>
          <p className="text-xs text-orange-500">{data.fieldStock.filter(f => f.status === 'issued').length} active issues</p>
        </div>
      </div>

      {data.branchData.length > 0 && (
        <div className="mb-6">
          <p style={{ fontSize: '0.78rem', fontWeight: 800, color: '#c41e3a', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 8 }}>Branch Stock</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.branchData.map(br => (
              <div key={br.branch_id} className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <p className="text-xs text-red-600 font-semibold mb-1">{fmtLocation(br.branch_id)}</p>
                <p className="text-xl font-bold text-red-800">{(br.closing_qty || 0).toLocaleString()}</p>
                <p className="text-xs text-red-500">{br.product_count || 0} products</p>
              </div>
            ))}
            <div className="bg-red-100 border-2 border-red-300 rounded-xl p-4 text-center">
              <p className="text-xs text-red-700 font-bold mb-1">All Branches</p>
              <p className="text-xl font-black text-red-900">{branchTotalQty.toLocaleString()}</p>
              <p className="text-xs text-red-600 font-semibold">DP: {formatCurrency(branchTotalDPC)}</p>
            </div>
          </div>
        </div>
      )}

      {(expiredBatches.length > 0 || soonExpiring.length > 0 || lowStockProducts.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {(expiredBatches.length > 0 || soonExpiring.length > 0) && (
            <Card className="border-red-200">
              <CardHeader><h3 className="font-bold text-red-700"><AlertTriangle size={16} className="inline mr-1" />Expiry Alerts</h3></CardHeader>
              <CardBody>
                {expiredBatches.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-bold text-red-600 mb-1">EXPIRED ({expiredBatches.length})</p>
                    {expiredBatches.slice(0, 5).map((b, i) => (
                      <div key={i} className="flex justify-between text-xs py-1 border-b border-red-100">
                        <span className="text-red-700">{b.description || b.product_name} — Batch {b.batch_no || b.batch_number || '-'}</span>
                        <span className="text-red-600 font-bold">{formatDate(b.expiry_date)} ({Number(b.remaining_quantity || b.quantity || 0)} units)</span>
                      </div>
                    ))}
                  </div>
                )}
                {soonExpiring.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-orange-600 mb-1">EXPIRING WITHIN 90 DAYS ({soonExpiring.length})</p>
                    {soonExpiring.slice(0, 5).map((b, i) => (
                      <div key={i} className="flex justify-between text-xs py-1 border-b border-orange-100">
                        <span className="text-orange-700">{b.description || b.product_name} — Batch {b.batch_no || b.batch_number || '-'}</span>
                        <span className="text-orange-600 font-bold">{formatDate(b.expiry_date)} ({Number(b.remaining_quantity || b.quantity || 0)} units)</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          )}
          {lowStockProducts.length > 0 && (
            <Card className="border-yellow-200">
              <CardHeader><h3 className="font-bold text-yellow-700"><TrendingDown size={16} className="inline mr-1" />Low Stock Alerts ({lowStockProducts.length})</h3></CardHeader>
              <CardBody>
                {lowStockProducts.slice(0, 10).map(([name, qty], i) => (
                  <div key={i} className="flex justify-between text-xs py-1.5 border-b border-yellow-100">
                    <span className="text-gray-700">{name}</span>
                    <Badge variant="warning">{qty} units</Badge>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h3 className="font-bold text-gray-800">Recent Stock Movements {branch !== 'all' && <span className="text-xs text-gray-400 font-normal">— {fmtLocation(branch)}</span>}</h3>
              <Button size="sm" variant="secondary" onClick={() => {
                const rows = filteredMovements.slice(0,15).map(r => `<tr><td>${formatDateTime(r.created_at)}</td><td>${r.product_name||''}</td><td>${r.movement_type||'Movement'}</td><td>${r.quantity||''}</td><td>${r.source_location||''}</td><td>${r.destination_location||''}</td></tr>`).join('');
                printDocument('Recent Stock Movements', `<table><thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>From</th><th>To</th></tr></thead><tbody>${rows}</tbody></table>`);
              }}><Printer size={14} /> Print</Button>
            </div>
          </CardHeader>
          <Table
            columns={[
              { header: 'Date', render: r => formatDateTime(r.created_at) },
              { header: 'Product', render: r => <span className="text-xs">{r.product_name || ''}</span> },
              { header: 'Type', render: r => <Badge variant={
                ['import_received','received','transfer_in'].includes(r.movement_type) ? 'success' :
                ['dispatched','transfer_out','field_issue'].includes(r.movement_type) ? 'warning' :
                ['write_off','return'].includes(r.movement_type) ? 'danger' : 'info'
              }>{(r.movement_type || 'movement').replace(/_/g, ' ')}</Badge> },
              { header: 'Batch', render: r => r.batch_no || r.batchNo || '—' },
              { header: 'Expiry', render: r => (r.expiry_date || r.expiryDate) ? formatDate(r.expiry_date || r.expiryDate) : '—' },
              { header: 'Qty', key: 'quantity' },
              { header: 'DP Value', render: r => formatCurrency(Number(r.quantity || 0) * (Number(r.dpc_unit_value || 0) || getDPCPrice(r.product_name || ''))) },
              { header: 'From/To', render: r => <span className="text-xs">{fmtLocation(r.source_location || '')} → {fmtLocation(r.destination_location || '')}</span> },
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
                if (!byLoc[label]) byLoc[label] = { qty: 0, cifValue: 0, dpcValue: 0, batches: 0 };
                const qty = Number(b.remaining_quantity || b.quantity || 0);
                byLoc[label].qty += qty;
                byLoc[label].cifValue += qty * Number(b.cif_unit_cost || b.unit_price || 0);
                byLoc[label].dpcValue += qty * (Number(b.dpc_unit_value || 0) || getDPCPrice(b.description || b.product_name || ''));
                byLoc[label].batches++;
              });
              const entries = Object.entries(byLoc).sort((a, b) => b[1].cifValue - a[1].cifValue);
              return entries.length > 0 ? entries.map(([loc, d]) => (
                <div key={loc} className="flex justify-between items-center py-3 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="font-medium text-gray-800">{loc}</p>
                    <p className="text-xs text-gray-500">{d.qty.toLocaleString()} units · {d.batches} batches</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-700">{formatCurrency(d.cifValue)}</p>
                    <p className="text-xs text-blue-600">DPC: {formatCurrency(d.dpcValue)}</p>
                  </div>
                </div>
              )) : <p className="text-sm text-gray-400 text-center py-4">No stock data for this filter</p>;
            })()}
          </CardBody>
        </Card>
      </div>

      {data.imports.length > 0 && (
        <Card className="mt-6">
          <CardHeader><h3 className="font-bold text-gray-800">Recent Supplier Imports</h3></CardHeader>
          <Table
            columns={[
              { header: 'Date', render: r => formatDateTime(r.created_at || r.date_received) },
              { header: 'Supplier', render: r => <span className="text-xs">{r.supplier_name || '-'}</span> },
              { header: 'GRN', render: r => <span className="text-xs font-mono">{r.grn_number || '-'}</span> },
              { header: 'Product', key: 'product_name' },
              { header: 'Batch', render: r => r.batch_no || '-' },
              { header: 'Qty', key: 'quantity' },
              { header: 'CIF Total', render: r => formatCurrency(Number(r.cif_total_value || 0)) },
              { header: 'Destination', render: r => <span className="text-xs">{fmtLocation(r.destination_warehouse || 'country_stock')}</span> },
            ]}
            data={data.imports.slice(0, 10)}
            emptyMessage="No imports"
          />
        </Card>
      )}
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
  const [items, setItems] = useState([{ product_name: '', quantity: '', cif_price: '', dpc_price: '', carton_no: '', expiry_date: '', batch_number: '' }]);
  const [form, setForm] = useState({ supplier: 'Dynapharm International (Malaysia)', shipping_ref: '', grn_number: '', invoice_number: '', arrival_date: '', destination_warehouse: 'country_stock', notes: '' });
  const [errors, setErrors] = useState({});
  const [productOptions, setProductOptions] = useState(PRICE_LIST.map(p => p.description).sort());

  useEffect(() => {
    const loadData = async () => {
      try {
        const [batchData, importData, priceData, prodData] = await Promise.allSettled([
          api.stock.batches(),
          api.stock.supplierImports(),
          api.prices.list(),
          api.products.list(),
        ]);
        if (importData.status === 'fulfilled') {
          const impRows = Array.isArray(importData.value) ? importData.value : [];
          if (impRows.length > 0) {
            setImports(impRows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
          } else if (batchData.status === 'fulfilled') {
            const all = Array.isArray(batchData.value) ? batchData.value : batchData.value?.batches || [];
            setImports(all.filter(b => b.location === 'country_stock').sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
          }
        } else if (batchData.status === 'fulfilled') {
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

  const addItem = () => setItems(prev => [...prev, { product_name: '', quantity: '', cif_price: '', dpc_price: '', carton_no: '', expiry_date: '', batch_number: '' }]);
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const updateItem = (idx, field, value) => {
    setItems(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      if (field === 'product_name') {
        const cif = getCIFPrice(value);
        if (cif > 0) updated[idx].cif_price = String(cif);
        const dpc = getDPCPrice(value);
        if (dpc > 0) updated[idx].dpc_price = String(dpc);
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
        const cifUnit = Number(item.cif_price) || getCIFPrice(item.product_name);
        const dpcUnit = Number(item.dpc_price) || getDPCPrice(item.product_name);
        await api.stock.createSupplierImport({
          supplier_name: form.supplier,
          import_reference: form.shipping_ref || null,
          grn_number: form.grn_number || null,
          invoice_number: form.invoice_number || null,
          shipment_reference: form.shipping_ref || null,
          product_name: item.product_name,
          quantity: Number(item.quantity),
          batch_no: item.batch_number || null,
          expiry_date: item.expiry_date || null,
          cif_unit_cost: cifUnit,
          dpc_unit_value: dpcUnit,
          date_received: form.arrival_date || new Date().toISOString(),
          destination_warehouse: form.destination_warehouse || 'country_stock',
          origin_country: 'Malaysia',
          notes: `Carton: ${item.carton_no || 'N/A'} | ${form.notes || ''}`.trim(),
          metadata: { carton_no: item.carton_no, shipping_ref: form.shipping_ref, arrival_date: form.arrival_date },
        });
      }
      setAlert({ type: 'success', msg: `${validItems.length} product(s) imported to Country Stock successfully` });
      setItems([{ product_name: '', quantity: '', cif_price: '', dpc_price: '', carton_no: '', expiry_date: '', batch_number: '' }]);
      setForm({ supplier: 'Dynapharm International (Malaysia)', shipping_ref: '', grn_number: '', invoice_number: '', arrival_date: '', destination_warehouse: 'country_stock', notes: '' });
      setShowForm(false);
      const d = await api.stock.supplierImports().catch(() => []);
      const impRows = Array.isArray(d) ? d : [];
      setImports(impRows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const totalCIF = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.cif_price) || 0), 0);
  const totalDPC = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.dpc_price) || 0), 0);

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
            { header: 'Date', render: r => formatDateTime(r.created_at || r.date_received) },
            { header: 'GRN', render: r => <span className="text-xs font-mono">{r.grn_number || r.import_reference || '-'}</span> },
            { header: 'Product', key: 'product_name' },
            { header: 'Batch #', render: r => r.batch_no || r.batch_number || '-' },
            { header: 'Expiry', render: r => (r.expiry_date ? formatDate(r.expiry_date) : '-') },
            { header: 'Qty', key: 'quantity' },
            { header: 'CIF/unit', render: r => formatCurrency(Number(r.cif_unit_cost || r.unit_price || 0)) },
            { header: 'CIF Total', render: r => {
              const cif = Number(r.cif_total_value || 0) || (Number(r.quantity || 0) * Number(r.cif_unit_cost || r.unit_price || 0));
              return formatCurrency(cif);
            }},
            { header: 'DPC/unit', render: r => formatCurrency(Number(r.dpc_unit_value || 0)) },
            { header: 'Destination', render: r => <span className="text-xs">{fmtLocation(r.destination_warehouse || r.location || 'country_stock')}</span> },
            { header: 'Status', render: r => <Badge variant={r.status === 'received' ? 'success' : 'info'}>{r.status || 'received'}</Badge> },
            { header: '', render: r => (
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Supplier" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} />
            <Input label="GRN Number" value={form.grn_number} onChange={e => setForm(f => ({ ...f, grn_number: e.target.value }))} placeholder="GRN-2026-001" />
            <Input label="Invoice Number" value={form.invoice_number} onChange={e => setForm(f => ({ ...f, invoice_number: e.target.value }))} placeholder="INV-2026-001" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Shipping Reference / B/L No." value={form.shipping_ref} onChange={e => setForm(f => ({ ...f, shipping_ref: e.target.value }))} placeholder="e.g. BL-2026-0042" />
            <Input label="Arrival Date" type="date" value={form.arrival_date} onChange={e => setForm(f => ({ ...f, arrival_date: e.target.value }))} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Destination</label>
              <div className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700 flex items-center gap-2">
                <span className="text-base">🏳️</span> Country Stock <span className="text-xs text-gray-400 ml-1">(all imports land here first)</span>
              </div>
            </div>
          </div>
          <div>
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
                    <div className="col-span-3 md:col-span-2">
                      <label className="text-xs text-gray-500 mb-1 block">CIF Price (N$)</label>
                      <input type="number" min="0" step="0.01" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" placeholder="Auto" value={item.cif_price} onChange={e => updateItem(idx, 'cif_price', e.target.value)} />
                    </div>
                    <div className="col-span-3 md:col-span-2">
                      <label className="text-xs text-gray-500 mb-1 block">DPC Price (N$)</label>
                      <input type="number" min="0" step="0.01" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" placeholder="Auto" value={item.dpc_price} onChange={e => updateItem(idx, 'dpc_price', e.target.value)} />
                    </div>
                    <div className="col-span-3 md:col-span-2 text-xs font-medium text-gray-700 pt-5">
                      CIF: {formatCurrency((Number(item.quantity) || 0) * (Number(item.cif_price) || 0))}
                    </div>
                    <div className="col-span-3 md:col-span-2 text-xs font-medium text-gray-700 pt-5">
                      DPC: {formatCurrency((Number(item.quantity) || 0) * (Number(item.dpc_price) || 0))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-6 mt-3 font-bold text-gray-800">
              <span>Total CIF: {formatCurrency(totalCIF)}</span>
              <span>Total DPC: {formatCurrency(totalDPC)}</span>
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
  const { user } = useAuth();
  const [data, setData] = useState({ items: [], summary: {}, locationBreakdown: [] });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [adjRecord, setAdjRecord] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState('holdings');

  const [releaseOpen, setReleaseOpen] = useState(false);
  const [releaseWarehouse, setReleaseWarehouse] = useState('windhoek_warehouse');
  const [releaseItems, setReleaseItems] = useState([]);
  const [releaseNotes, setReleaseNotes] = useState('');
  const [releasing, setReleasing] = useState(false);
  const [releaseAlert, setReleaseAlert] = useState(null);

  const loadData = useCallback(() => {
    setLoading(true);
    api.stock.countryStock()
      .then(d => {
        setData({
          items: d.items || [],
          summary: d.summary || {},
          locationBreakdown: d.locationBreakdown || [],
        });
      })
      .catch(() => setData({ items: [], summary: {}, locationBreakdown: [] }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!releaseOpen) loadData();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadData, releaseOpen]);

  const filtered = search.trim()
    ? data.items.filter(i => (i.productName || '').toLowerCase().includes(search.toLowerCase()) || (i.batchNo || '').toLowerCase().includes(search.toLowerCase()))
    : data.items;

  const byProduct = {};
  filtered.forEach(i => {
    const n = i.productName || 'Unknown';
    if (!byProduct[n]) byProduct[n] = { productName: n, totalQty: 0, batches: 0, earliestExpiry: null, stockValueDP: 0 };
    byProduct[n].totalQty += i.closingQty;
    byProduct[n].batches += 1;
    byProduct[n].stockValueDP += i.stockValueDP;
    if (i.expiryDate && (!byProduct[n].earliestExpiry || i.expiryDate < byProduct[n].earliestExpiry)) {
      byProduct[n].earliestExpiry = i.expiryDate;
    }
  });
  const productRows = Object.values(byProduct).sort((a, b) => b.totalQty - a.totalQty);

  const { distinctProducts = 0, totalUnits = 0, stockValueDP = 0, lowStockItems = 0 } = data.summary;

  const openReleaseModal = (item) => {
    setReleaseItems([{ productName: item.productName, batchNo: item.batchNo, expiryDate: item.expiryDate, quantity: '', availableQty: item.closingQty }]);
    setReleaseWarehouse('windhoek_warehouse');
    setReleaseNotes('');
    setReleaseAlert(null);
    setReleaseOpen(true);
  };

  const handleRelease = async (e) => {
    e.preventDefault();
    const toSend = releaseItems.filter(i => Number(i.quantity) > 0);
    if (toSend.length === 0) { setReleaseAlert({ type: 'error', msg: 'Enter a quantity greater than 0 for at least one item' }); return; }
    const over = toSend.find(i => Number(i.quantity) > Number(i.availableQty));
    if (over) { setReleaseAlert({ type: 'error', msg: `Quantity for "${over.productName}" exceeds available country stock (${over.availableQty})` }); return; }
    setReleasing(true);
    try {
      const result = await api.stock.releaseToWarehouse({
        warehouseId: releaseWarehouse,
        items: toSend.map(i => ({ productName: i.productName, batchNo: i.batchNo, expiryDate: i.expiryDate, quantity: Number(i.quantity) })),
        releasedBy: user?.full_name || user?.username || 'system',
        notes: releaseNotes || undefined,
      });
      setReleaseAlert({ type: 'success', msg: `${result.itemsReleased} item(s) released to ${fmtLocation(releaseWarehouse)} (Ref: ${result.referenceId})` });
      setTimeout(() => { setReleaseOpen(false); loadData(); }, 1800);
    } catch (err) {
      setReleaseAlert({ type: 'error', msg: err.message || 'Release failed' });
    } finally {
      setReleasing(false);
    }
  };

  const locationTypeLabel = (t) => t === 'country' ? '🌍 Country Stock' : t === 'warehouse' ? '🏢 Warehouse' : '🏪 Branch';
  const locationTypeBg = (t) => t === 'country' ? '#eff6ff' : t === 'warehouse' ? '#f0fdf4' : '#fefce8';
  const locationTypeBorder = (t) => t === 'country' ? '#bfdbfe' : t === 'warehouse' ? '#bbf7d0' : '#fde68a';

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      <div style={{ background: 'linear-gradient(135deg,#1e3a8a,#1e40af)', borderRadius: 14, padding: '16px 22px', color: '#fff' }}>
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Globe size={20} />
              <h2 style={{ fontWeight: 900, fontSize: '1.1rem', margin: 0 }}>Country Stock — National Staging Area</h2>
            </div>
            <p style={{ fontSize: '0.82rem', opacity: 0.8, margin: 0 }}>
              All imported stock lands here first and must be formally released to a warehouse before distribution.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => { setReleaseItems([]); setReleaseWarehouse('windhoek_warehouse'); setReleaseNotes(''); setReleaseAlert(null); setReleaseOpen(true); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700 }}>
              <ArrowLeftRight size={15} /> Release to Warehouse
            </button>
            <button onClick={loadData}
              style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700 }}>
              <RefreshCw size={13} style={{ display: 'inline', marginRight: 4 }} />Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Distinct Products" value={distinctProducts} color="blue" icon={<Globe size={24} />} />
        <StatCard title="Total Units at Country" value={totalUnits.toLocaleString()} color="green" icon={<Package size={24} />} />
        <StatCard title="DPC Value" value={formatCurrency(stockValueDP)} color="purple" icon={<DollarSign size={24} />} />
        <StatCard title="Low Stock Items" value={lowStockItems} color={lowStockItems > 0 ? 'red' : 'green'} icon={<AlertTriangle size={24} />} />
      </div>

      <div className="flex gap-2">
        {[
          { id: 'holdings', label: '📦 Country Holdings' },
          { id: 'breakdown', label: '🗺️ Live Location Breakdown' },
        ].map(t => (
          <button key={t.id} onClick={() => setActiveSubTab(t.id)}
            style={{ padding: '7px 18px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.83rem',
              background: activeSubTab === t.id ? '#1e3a8a' : '#f1f5f9', color: activeSubTab === t.id ? '#fff' : '#475569' }}>
            {t.label}
          </button>
        ))}
      </div>

      {activeSubTab === 'holdings' && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-gray-800">Country Stock — On-Hand Inventory</h3>
                <p className="text-xs text-gray-500 mt-0.5">Quantities sourced from inventory_balances (live view). Use "Release to Warehouse" to move stock.</p>
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                <div className="relative">
                  <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search product or batch..."
                    className="pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 w-52" />
                </div>
              </div>
            </div>
          </CardHeader>
          <Table
            columns={[
              { header: 'Product', render: r => <span className="font-medium text-gray-800">{r.productName}</span> },
              { header: 'Batch #', render: r => <span className="font-mono text-xs">{r.batchNo || '—'}</span> },
              { header: 'Expiry', render: r => {
                if (!r.expiryDate) return '—';
                const days = Math.floor((new Date(r.expiryDate) - new Date()) / 86400000);
                return <span className={days <= 30 ? 'text-red-600 font-bold text-xs' : days <= 90 ? 'text-amber-600 font-semibold text-xs' : 'text-xs'}>{formatDate(r.expiryDate)}{days <= 90 ? ` (${days}d)` : ''}</span>;
              }},
              { header: 'Available at Country', render: r => (
                <span className={r.closingQty < 10 ? 'text-red-600 font-bold' : r.closingQty < 50 ? 'text-amber-600 font-semibold' : 'text-green-700 font-semibold'}>
                  {r.closingQty.toLocaleString()}
                </span>
              )},
              { header: 'DPC Value', render: r => <span className="text-xs">{formatCurrency(r.stockValueDP)}</span> },
              { header: '', render: r => r.closingQty > 0 ? (
                <button onClick={() => openReleaseModal(r)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 6, cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700 }}>
                  <ArrowLeftRight size={12} /> Release
                </button>
              ) : null },
            ]}
            data={filtered}
            emptyMessage="No country stock on hand — receive a supplier import to populate this."
          />
        </Card>
      )}

      {activeSubTab === 'breakdown' && (
        <div className="space-y-4">
          <div style={{ padding: '10px 14px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, fontSize: '0.82rem', color: '#0369a1' }}>
            Live view of all stock units across every location. Updates automatically as stock moves through the system.
          </div>
          {data.locationBreakdown.length === 0 ? (
            <Card><CardBody><p className="text-gray-500 text-sm text-center py-6">No inventory data available yet.</p></CardBody></Card>
          ) : (
            data.locationBreakdown.map(loc => (
              <Card key={`${loc.locationType}||${loc.locationId}`}>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <span style={{ padding: '3px 10px', background: locationTypeBg(loc.locationType), border: `1px solid ${locationTypeBorder(loc.locationType)}`, borderRadius: 99, fontSize: '0.75rem', fontWeight: 700 }}>
                        {locationTypeLabel(loc.locationType)}
                      </span>
                      <span className="font-bold text-gray-800">{fmtLocation(loc.locationId)}</span>
                    </div>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#374151' }}>
                      {loc.totalUnits.toLocaleString()} units
                    </span>
                  </div>
                </CardHeader>
                <Table
                  columns={[
                    { header: 'Product', render: r => <span className="text-sm font-medium text-gray-800">{r.productName}</span> },
                    { header: 'Batch', render: r => <span className="font-mono text-xs text-gray-500">{r.batchNo || '—'}</span> },
                    { header: 'Units On-Hand', render: r => (
                      <span className={r.closingQty < 10 ? 'text-red-600 font-bold' : r.closingQty < 50 ? 'text-amber-600 font-semibold' : 'text-green-700 font-semibold'}>
                        {r.closingQty.toLocaleString()}
                      </span>
                    )},
                    { header: 'DPC Value', render: r => <span className="text-xs text-gray-600">{formatCurrency(r.stockValueDP)}</span> },
                  ]}
                  data={loc.products}
                  emptyMessage="No stock at this location."
                />
              </Card>
            ))
          )}
        </div>
      )}

      <Modal open={releaseOpen} onClose={() => setReleaseOpen(false)} title="Release Stock to Warehouse" size="lg">
        <form onSubmit={handleRelease} className="p-6 space-y-5">
          <Alert type="info">
            This moves stock from Country Stock to the selected warehouse in the inventory system. The warehouse will receive a warehouse_receipt movement and country stock will be decremented.
          </Alert>
          {releaseAlert && <Alert type={releaseAlert.type}>{releaseAlert.msg}</Alert>}

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Destination Warehouse <span className="text-red-500">*</span></label>
            <select value={releaseWarehouse} onChange={e => setReleaseWarehouse(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20">
              <option value="windhoek_warehouse">🏢 Windhoek Warehouse</option>
              <option value="ondangwa_warehouse">🏬 Ondangwa Warehouse</option>
            </select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">Items to Release <span className="text-red-500">*</span></label>
              <button type="button" onClick={() => setReleaseItems(prev => [...prev, { productName: '', batchNo: '', expiryDate: '', quantity: '', availableQty: 0, batchKey: '' }])}
                style={{ padding: '4px 10px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 6, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
                + Add Row
              </button>
            </div>
            {releaseItems.length === 0 && (
              <p className="text-sm text-gray-400 italic">No items selected. Use "Add Row" or click Release on a batch row in the table.</p>
            )}
            {releaseItems.map((item, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr auto', gap: 8, alignItems: 'center', padding: '8px 10px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div>
                  {item.productName && item.batchNo ? (
                    <div>
                      <div className="text-sm font-semibold text-gray-800">{item.productName}</div>
                      <div className="text-xs text-gray-500">Batch: <span className="font-mono">{item.batchNo}</span>{item.expiryDate ? ` · Exp: ${formatDate(item.expiryDate)}` : ''}</div>
                    </div>
                  ) : (
                    <select value={item.batchKey || ''} onChange={e => {
                      const key = e.target.value;
                      const match = data.items.find(i => `${i.productName}||${i.batchNo}` === key);
                      setReleaseItems(prev => prev.map((r, i) => i === idx ? {
                        ...r, batchKey: key,
                        productName: match?.productName || '',
                        batchNo: match?.batchNo || '',
                        expiryDate: match?.expiryDate || '',
                        availableQty: match?.closingQty || 0,
                      } : r));
                    }} className="w-full px-2 py-1.5 rounded border border-gray-300 text-xs">
                      <option value="">Select product + batch...</option>
                      {data.items.filter(i => i.closingQty > 0).map(i => (
                        <option key={`${i.productName}||${i.batchNo}`} value={`${i.productName}||${i.batchNo}`}>
                          {i.productName} — Batch: {i.batchNo || 'N/A'} (Avail: {i.closingQty}){i.expiryDate ? ` · Exp: ${formatDate(i.expiryDate)}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" min="1" max={item.availableQty || undefined} value={item.quantity}
                    onChange={e => setReleaseItems(prev => prev.map((r, i) => i === idx ? { ...r, quantity: e.target.value } : r))}
                    placeholder="Qty" className="w-20 px-2 py-1.5 rounded border border-gray-300 text-sm text-center" />
                  {item.availableQty > 0 && <span className="text-xs text-gray-500 whitespace-nowrap">/ {item.availableQty} avail</span>}
                </div>
                <button type="button" onClick={() => setReleaseItems(prev => prev.filter((_, i) => i !== idx))}
                  style={{ padding: '4px 8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Notes (optional)</label>
            <textarea value={releaseNotes} onChange={e => setReleaseNotes(e.target.value)} rows={2}
              placeholder="Add any notes about this release..."
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary resize-none" />
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="submit" disabled={releasing || releaseItems.filter(i => Number(i.quantity) > 0).length === 0}>
              <ArrowLeftRight size={15} /> {releasing ? 'Releasing…' : `Release to ${fmtLocation(releaseWarehouse)}`}
            </Button>
            <Button variant="secondary" type="button" onClick={() => setReleaseOpen(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>

      <RequestAdjustmentModal
        open={!!adjRecord} onClose={() => setAdjRecord(null)}
        record={adjRecord} targetType="country_stock" location="country_stock"
      />
    </div>
  );
}

function WarehouseTab({ name }) {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [incomingTransfers, setIncomingTransfers] = useState([]);
  const [outboundTransfers, setOutboundTransfers] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDispatch, setShowDispatch] = useState(false);
  const [dispatchCart, setDispatchCart] = useState([]);
  const [dispatchBranch, setDispatchBranch] = useState('');
  const [dispatchNote, setDispatchNote] = useState('');
  const [dispatchBatchSelections, setDispatchBatchSelections] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!showDispatch) return;
    setDispatchBatchSelections(prev => {
      const next = { ...prev };
      let changed = false;
      const cartDescs = new Set(dispatchCart.map(c => c.description));
      Object.keys(next).forEach(desc => {
        if (!cartDescs.has(desc)) { delete next[desc]; changed = true; }
      });
      dispatchCart.forEach(item => {
        if (!next[item.description]) {
          const available = batches
            .filter(b => {
              const nm = (b.product_name || b.description || '').toLowerCase();
              const rem = Number(b.remaining_quantity ?? b.remainingQuantity ?? b.quantity ?? 0);
              return nm === item.description.toLowerCase() && rem > 0;
            })
            .sort((a, b) => {
              const da = a.expiry_date || a.expiryDate || '';
              const db = b.expiry_date || b.expiryDate || '';
              if (!da && !db) return 0; if (!da) return 1; if (!db) return -1;
              return da < db ? -1 : da > db ? 1 : 0;
            });
          if (available.length > 0) { next[item.description] = available[0].id; changed = true; }
        }
      });
      return changed ? next : prev;
    });
  }, [dispatchCart, showDispatch, batches]);

  const [receivingId, setReceivingId] = useState(null);
  const [alert, setAlert] = useState(null);
  const [adjRecord, setAdjRecord] = useState(null);
  const [subTab, setSubTab] = useState('inventory');
  const [outboundSearch, setOutboundSearch] = useState('');
  const [outboundStatusFilter, setOutboundStatusFilter] = useState('');
  const [viewAuditTransfer, setViewAuditTransfer] = useState(null);
  const [viewDispatchNoteTransfer, setViewDispatchNoteTransfer] = useState(null);
  const location = name.toLowerCase() + '_warehouse';

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.stock.batches().then(d => (Array.isArray(d) ? d : d.batches || []).filter(b => b.location === location)),
      api.stock.transfers(`branch=${encodeURIComponent(location)}`).then(d => Array.isArray(d) ? d : d.transfers || []),
      api.stock.transfers(`fromWarehouse=${encodeURIComponent(location)}`).then(d => Array.isArray(d) ? d : d.transfers || []),
      api.stock.movements().then(d => Array.isArray(d) ? d : d.movements || []),
    ])
      .then(([batchData, inbound, outbound, movData]) => {
        setBatches(batchData);
        setIncomingTransfers(inbound.filter(t => t.status !== 'cancelled'));
        setOutboundTransfers(outbound.filter(t => t.status !== 'cancelled'));
        const locKey = location.toLowerCase();
        setMovements(movData.filter(m => {
          const src = (m.source_location || '').toLowerCase();
          const dst = (m.destination_location || '').toLowerCase();
          return src.includes(locKey) || dst.includes(locKey) || src.includes(name.toLowerCase()) || dst.includes(name.toLowerCase());
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [location, name]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleReceiveDistribution = async (transfer) => {
    setReceivingId(transfer.id);
    try {
      const items = Array.isArray(transfer.items) ? transfer.items : [];
      if (items.length > 0) {
        for (const item of items) {
          if (Number(item.quantity) > 0) {
            await api.stock.createBatch({
              product_name: item.productName || item.productId || transfer.product_name,
              quantity: Number(item.quantity),
              location,
              batch_number: `RCV-${transfer.id.slice(-6).toUpperCase()}`,
              notes: `Received from Country Stock — transfer ${transfer.id}`,
            });
          }
        }
      } else if (transfer.product_name) {
        await api.stock.createBatch({
          product_name: transfer.product_name,
          quantity: transfer.quantity,
          location,
          batch_number: `RCV-${transfer.id.slice(-6).toUpperCase()}`,
          notes: `Received from Country Stock — transfer ${transfer.id}`,
        });
      }
      await api.stock.updateTransfer(transfer.id, { status: 'received', received_by: user?.full_name || user?.username });
      setAlert({ type: 'success', msg: `Stock received into ${name} Warehouse from Country Stock` });
      setTimeout(() => loadData(), 100);
    } catch (err) {
      setAlert({ type: 'error', msg: err.message || 'Failed to receive transfer' });
    } finally {
      setReceivingId(null);
    }
  };

  const getAvailableBatchesForProduct = (productDesc) => {
    return batches
      .filter(b => {
        const name = (b.product_name || b.description || '').toLowerCase();
        const remaining = Number(b.remaining_quantity ?? b.remainingQuantity ?? b.quantity ?? 0);
        return name === productDesc.toLowerCase() && remaining > 0;
      })
      .sort((a, b) => {
        const da = a.expiry_date || a.expiryDate || '';
        const db = b.expiry_date || b.expiryDate || '';
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da < db ? -1 : da > db ? 1 : 0;
      });
  };

  const getBatchSource = (batch) => {
    const notes = (batch.notes || '').toLowerCase();
    const batchNo = (batch.batch_no || batch.batchNo || batch.batch_number || '').toUpperCase();
    if (notes.includes('country stock') || batchNo.startsWith('RCV-')) return 'Country Stock';
    return 'Supplier Import';
  };

  const handleDispatchToBranch = async (e) => {
    e.preventDefault();
    if (!dispatchBranch) { setAlert({ type: 'error', msg: 'Please select a destination branch' }); return; }
    if (dispatchCart.length === 0) { setAlert({ type: 'error', msg: 'Add at least one product to dispatch' }); return; }
    for (const c of dispatchCart) {
      const available = getAvailableBatchesForProduct(c.description);
      if (available.length === 0) {
        setAlert({ type: 'error', msg: `"${c.description}" has no available stock batches in this warehouse and cannot be dispatched.` });
        return;
      }
      const selectedBatchId = dispatchBatchSelections[c.description];
      const selectedBatch = selectedBatchId ? available.find(b => b.id === selectedBatchId) : null;
      if (!selectedBatch) {
        setAlert({ type: 'error', msg: `Please select a batch for "${c.description}" before submitting.` });
        return;
      }
      const batchRemaining = Number(selectedBatch.remaining_quantity ?? selectedBatch.remainingQuantity ?? selectedBatch.quantity ?? 0);
      if (c.qty > batchRemaining) {
        setAlert({ type: 'error', msg: `Dispatch quantity (${c.qty}) for "${c.description}" exceeds selected batch's available stock (${batchRemaining}).` });
        return;
      }
    }
    setSubmitting(true);
    try {
      const items = dispatchCart.map(c => {
        const selectedBatchId = dispatchBatchSelections[c.description];
        const available = getAvailableBatchesForProduct(c.description);
        const selectedBatch = available.find(b => b.id === selectedBatchId);
        return {
          productName: c.description,
          quantity: c.qty,
          batchNo: selectedBatch?.batch_no || selectedBatch?.batchNo || selectedBatch?.batch_number || null,
          expiryDate: selectedBatch?.expiry_date || selectedBatch?.expiryDate || null,
        };
      });
      await api.stock.createTransfer({
        from_location: location,
        to_location: dispatchBranch,
        items,
        status: 'pending_approval',
        dispatchNotes: dispatchNote || undefined,
        created_by: user?.full_name || user?.username,
        preparedByRole: user?.role || null,
      });
      setShowDispatch(false);
      setDispatchCart([]);
      setDispatchBranch('');
      setDispatchNote('');
      setDispatchBatchSelections({});
      setAlert({ type: 'success', msg: `Dispatch submitted for GM approval. ${dispatchCart.length} product(s) → ${fmtLocation(dispatchBranch)}` });
      setTimeout(() => loadData(), 100);
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const statusColor = { pending: 'warning', pending_approval: 'warning', submitted: 'info', approved: 'success', dispatched: 'info', in_transit: 'info', received: 'success', delivered: 'success', rejected: 'danger', cancelled: 'default' };

  const incomingFromCountry = incomingTransfers.filter(t => {
    const from = (t.fromWarehouse || t.from_location || '').toLowerCase().replace(/\s+/g, '_');
    return from === 'country_stock';
  });
  const pendingReceipt = incomingFromCountry.filter(t => t.status === 'submitted' || t.status === 'in_transit' || t.status === 'pending' || t.status === 'approved');
  const receivedHistory = incomingFromCountry.filter(t => t.status === 'received' || t.status === 'delivered');

  const branchDestinations = [
    { value: '', label: 'Select destination branch...' },
    ...BRANCH_DETAILS.map(b => ({ value: b.id, label: b.name })),
  ];

  const whSubTabs = [
    { id: 'inventory', label: `📦 Inventory (${batches.length})` },
    { id: 'incoming', label: `📥 Incoming (${pendingReceipt.length})${pendingReceipt.length > 0 ? ' 🔔' : ''}` },
    { id: 'outbound', label: `🚚 Outbound (${outboundTransfers.length})` },
    { id: 'movements', label: `📊 Movements (${movements.length})` },
  ];

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      {alert && <Alert type={alert.type} className="mb-2" onClose={() => setAlert(null)}>{alert.msg}</Alert>}

      <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', borderRadius: 14, padding: '16px 22px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: '1.1rem' }}>{name} Warehouse</div>
          <div style={{ fontSize: '0.78rem', opacity: 0.85, marginTop: 4 }}>
            {batches.length} product lines · {batches.reduce((s, b) => s + Number(b.remaining_quantity || b.quantity || 0), 0).toLocaleString()} units
            {' · CIF: '}{formatCurrency(batches.reduce((s, b) => s + Number(b.remaining_quantity || b.quantity || 0) * Number(b.cif_unit_cost || b.unit_price || 0), 0))}
            {' · DPC: '}{formatCurrency(batches.reduce((s, b) => s + Number(b.remaining_quantity || b.quantity || 0) * (Number(b.dpc_unit_value || 0) || getDPCPrice(b.description || b.product_name || '')), 0))}
          </div>
        </div>
        <Button size="sm" onClick={() => setShowDispatch(true)} style={{ background: '#fff', color: '#c41e3a', fontWeight: 700 }}>
          <Truck size={15} className="mr-1" /> Dispatch to Branch
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {whSubTabs.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)} className="px-4 py-2 rounded-full text-sm font-semibold cursor-pointer border-none transition-all"
            style={subTab === t.id ? { background: '#fff0f3', color: '#c41e3a', border: '2px solid #fecaca' } : { background: '#f8fafc', color: '#64748b', border: '2px solid #f1f5f9' }}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'inventory' && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h3 className="font-bold text-gray-800">{name} Warehouse — Current Inventory</h3>
              <Button size="sm" variant="secondary" onClick={loadData}>↺ Refresh</Button>
            </div>
          </CardHeader>
          <Table
            columns={[
              { header: 'Product', render: r => <span className="text-xs font-medium">{r.description || r.product_name || ''}</span> },
              { header: 'Batch #', render: r => r.batch_no || r.batch_number || '—' },
              { header: 'Available', render: r => <span className={Number(r.remaining_quantity || r.quantity) < 10 ? 'text-red-600 font-bold' : 'font-medium'}>{r.remaining_quantity || r.quantity}</span> },
              { header: 'Dispatched', render: r => r.dispatched_quantity || 0 },
              { header: 'Expiry', render: r => {
                if (!r.expiry_date) return '—';
                const days = Math.floor((new Date(r.expiry_date) - new Date()) / 86400000);
                return <span className={days <= 30 ? 'text-red-600 font-bold' : days <= 90 ? 'text-amber-600' : ''}>{formatDate(r.expiry_date)}{days <= 90 ? ` (${days}d)` : ''}</span>;
              }},
              { header: 'CIF/Unit', render: r => formatCurrency(Number(r.cif_unit_cost || r.unit_price || 0)) },
              { header: 'DPC/Unit', render: r => formatCurrency(Number(r.dpc_unit_value || 0) || getDPCPrice(r.description || r.product_name || '')) },
              { header: '', render: r => (
                <button onClick={() => setAdjRecord(r)} title="Request correction (requires GM approval)"
                  style={{ padding: '4px 10px', background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 6, cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Edit2 size={12} /> Edit
                </button>
              )},
            ]}
            data={batches}
            emptyMessage={`No confirmed stock in ${name} warehouse yet. Receive incoming distributions from Country Stock to populate inventory.`}
          />
        </Card>
      )}

      {subTab === 'incoming' && (
        <div className="space-y-4">
          <Card className="bg-gradient-to-r from-blue-50 to-cyan-50 border-blue-200">
            <CardBody>
              <p className="text-sm text-blue-800">
                <strong>Incoming from Country Stock</strong> — These are distributions allocated to {name} Warehouse.
                Click "Confirm Receipt" to add the stock to your warehouse inventory.
              </p>
            </CardBody>
          </Card>

          {pendingReceipt.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="font-bold text-gray-800">📥 Pending Receipt ({pendingReceipt.length})</h3>
                <p className="text-xs text-gray-500 mt-0.5">Distributions from Country Stock awaiting your confirmation.</p>
              </CardHeader>
              <Table
                columns={[
                  { header: 'Products', render: r => {
                    const items = Array.isArray(r.items) ? r.items : [];
                    if (items.length > 0) return <span className="text-sm">{items.map(i => `${i.productName || i.product_name} × ${i.quantity}`).join(', ')}</span>;
                    return <span className="font-medium">{r.product_name || '—'}</span>;
                  }},
                  { header: 'Total Qty', render: r => {
                    const items = Array.isArray(r.items) ? r.items : [];
                    const total = items.length > 0 ? items.reduce((s, i) => s + Number(i.quantity || 0), 0) : (r.quantity || 0);
                    return <span className="font-bold text-primary">{total}</span>;
                  }},
                  { header: 'From', render: r => fmtLocation(r.fromWarehouse || r.from_location) },
                  { header: 'Status', render: r => <Badge variant={statusColor[r.status] || 'default'}>{(r.status || 'pending').replace(/_/g, ' ')}</Badge> },
                  { header: 'Date', render: r => formatDate(r.createdAt || r.created_at) },
                  { header: 'Action', render: r => (
                    <Button size="sm" variant="success" onClick={() => handleReceiveDistribution(r)} disabled={receivingId === r.id}>
                      {receivingId === r.id ? 'Receiving...' : '✓ Confirm Receipt'}
                    </Button>
                  )},
                ]}
                data={pendingReceipt}
                emptyMessage="No distributions pending receipt"
              />
            </Card>
          )}

          {receivedHistory.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="font-bold text-gray-800">✓ Receipt History</h3>
              </CardHeader>
              <Table
                columns={[
                  { header: 'Products', render: r => {
                    const items = Array.isArray(r.items) ? r.items : [];
                    if (items.length > 0) return <span className="text-xs">{items.map(i => `${i.productName || i.product_name} × ${i.quantity}`).join(', ')}</span>;
                    return <span className="text-sm">{r.product_name || '—'}</span>;
                  }},
                  { header: 'Total Qty', render: r => {
                    const items = Array.isArray(r.items) ? r.items : [];
                    return items.length > 0 ? items.reduce((s, i) => s + Number(i.quantity || 0), 0) : (r.quantity || 0);
                  }},
                  { header: 'Status', render: r => <Badge variant="success">Received</Badge> },
                  { header: 'Received By', render: r => <span className="text-xs">{r.receivedBy || r.received_by || '—'}</span> },
                  { header: 'Date', render: r => formatDate(r.createdAt || r.created_at) },
                ]}
                data={receivedHistory}
                emptyMessage="No receipt history yet"
              />
            </Card>
          )}

          {pendingReceipt.length === 0 && receivedHistory.length === 0 && (
            <EmptyState icon={<Package size={48} />} title="No Incoming Distributions" description={`No stock has been distributed to ${name} Warehouse from Country Stock yet. Use the Distribution tab to allocate stock.`} />
          )}
        </div>
      )}

      {subTab === 'outbound' && (() => {
        const [outSearch, setOutSearch] = [outboundSearch, setOutboundSearch];
        const [outStatusFilter, setOutStatusFilter] = [outboundStatusFilter, setOutboundStatusFilter];
        const filteredOutbound = outboundTransfers.filter(r => {
          if (outStatusFilter && r.status !== outStatusFilter) return false;
          if (outSearch) {
            const s = outSearch.toLowerCase();
            const items = Array.isArray(r.items) ? r.items : [];
            const itemNames = items.map(i => (i.productName || i.product_name || '').toLowerCase()).join(' ');
            const dest = (r.toBranch || r.to_location || '').toLowerCase();
            return itemNames.includes(s) || dest.includes(s) || (r.product_name || '').toLowerCase().includes(s) || (r.dispatchNotes || r.dispatch_notes || '').toLowerCase().includes(s);
          }
          return true;
        });
        return (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-gray-800">{name} Warehouse — Outbound to Branches</h3>
                <p className="text-xs text-gray-500 mt-0.5">Dispatches from this warehouse to branches. Requires GM approval before branch can receive.</p>
              </div>
              <Button size="sm" onClick={() => setShowDispatch(true)}>
                <Truck size={14} className="mr-1" /> New Dispatch
              </Button>
            </div>
          </CardHeader>
          <div className="px-4 pb-3 flex gap-3 flex-wrap items-center">
            <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
              <input type="text" value={outSearch} onChange={e => setOutSearch(e.target.value)} placeholder="Search products, branch, notes…"
                style={{ width: '100%', padding: '7px 10px 7px 30px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.83rem', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <select value={outStatusFilter} onChange={e => setOutStatusFilter(e.target.value)}
              style={{ padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.83rem', background: '#fff', cursor: 'pointer' }}>
              <option value="">All Statuses</option>
              <option value="pending_approval">Pending Approval</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="returned">Returned</option>
              <option value="delivered">Delivered</option>
            </select>
            <span className="text-xs text-gray-400">{filteredOutbound.length} of {outboundTransfers.length}</span>
          </div>
          <Table
            columns={[
              { header: 'Products', render: r => {
                const items = Array.isArray(r.items) ? r.items : [];
                if (items.length > 0) return <span className="text-xs">{items.map(i => `${i.productName || i.product_name} × ${i.quantity}`).join(', ')}</span>;
                return <span className="font-medium">{r.product_name || '—'}</span>;
              }},
              { header: 'Total Qty', render: r => {
                const items = Array.isArray(r.items) ? r.items : [];
                return items.length > 0 ? items.reduce((s, i) => s + Number(i.quantity || 0), 0) : (r.quantity || 0);
              }},
              { header: 'To Branch', render: r => fmtLocation(r.toBranch || r.to_location) },
              { header: 'Status', render: r => {
                const meta = r.metadata || {};
                const isAmended = meta.amended || r.amendedByGm || r.amended_by_gm;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Badge variant={statusColor[r.status] || 'default'}>{(r.status || 'pending').replace(/_/g, ' ')}</Badge>
                    {isAmended && <span style={{ fontSize: '0.68rem', color: '#d97706', fontWeight: 700 }}>⚠ GM Amended</span>}
                  </div>
                );
              }},
              { header: 'GM Action', render: r => {
                const action = r.gmAction || r.gm_action;
                if (!action) return <span className="text-gray-400 text-xs">—</span>;
                const colors = { approve: '#16a34a', reject: '#dc2626', amend_approve: '#d97706', return: '#6366f1' };
                return <span style={{ fontSize: '0.75rem', fontWeight: 700, color: colors[action] || '#64748b' }}>{(action || '').replace(/_/g, ' ')}</span>;
              }},
              { header: 'Date', render: r => formatDate(r.createdAt || r.created_at) },
              { header: '', render: r => (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button onClick={() => setViewAuditTransfer(r)} className="text-xs font-bold cursor-pointer border-none bg-transparent" style={{ color: '#6366f1' }}>
                    Audit Trail
                  </button>
                  <button onClick={() => setViewDispatchNoteTransfer(r)} className="text-xs font-bold cursor-pointer border-none bg-transparent" style={{ color: '#c41e3a' }} title="View Dispatch Note">
                    <Printer size={13} />
                  </button>
                </div>
              )},
            ]}
            data={filteredOutbound}
            emptyMessage={`No outbound dispatches from ${name} warehouse yet`}
          />
        </Card>
        );
      })()}

      {subTab === 'movements' && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-gray-800">{name} Warehouse — Stock Movements</h3>
                <p className="text-xs text-gray-500 mt-0.5">All stock movements in and out of {name} Warehouse.</p>
              </div>
              <button onClick={() => {
                const rows = movements.map(m => `<tr><td>${m.product_name||'-'}</td><td>${m.movement_type||'-'}</td><td>${m.quantity||'-'}</td><td>${fmtLocation(m.source_location)}</td><td>${fmtLocation(m.destination_location)}</td><td>${formatDateTime(m.created_at)}</td></tr>`).join('');
                printDocument(`${name} Warehouse Movements`, `<table><thead><tr><th>Product</th><th>Type</th><th>Qty</th><th>From</th><th>To</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table>`);
              }} className="px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer" style={{ background: '#c41e3a', color: '#fff' }}>Print</button>
            </div>
          </CardHeader>
          <div className="px-4 pb-3 grid grid-cols-3 gap-3">
            {['received','dispatched','adjustment'].map(type => {
              const total = movements.filter(m => (m.movement_type||'').includes(type)).reduce((s, m) => s + Number(m.quantity || 0), 0);
              return (
                <div key={type} style={{ background: type === 'received' ? '#f0fdf4' : type === 'dispatched' ? '#eff6ff' : '#fffbeb', border: `1px solid ${type === 'received' ? '#86efac' : type === 'dispatched' ? '#93c5fd' : '#fcd34d'}`, borderRadius: 10, padding: '10px 14px' }}>
                  <div className="text-lg font-bold">{total}</div>
                  <div className="text-xs font-semibold capitalize" style={{ color: type === 'received' ? '#166534' : type === 'dispatched' ? '#1e40af' : '#92400e' }}>{type}</div>
                </div>
              );
            })}
          </div>
          <Table
            columns={[
              { header: 'Product', render: r => r.product_name || '-' },
              { header: 'Type', render: r => <Badge variant={r.movement_type==='received'?'success':r.movement_type==='dispatched'||r.movement_type==='out'?'info':r.movement_type==='write_off'?'danger':'warning'}>{(r.movement_type||'').replace(/_/g,' ')}</Badge> },
              { header: 'Qty', render: r => <span className="font-bold">{r.quantity}</span> },
              { header: 'From', render: r => <span className="text-xs">{fmtLocation(r.source_location)}</span> },
              { header: 'To', render: r => <span className="text-xs">{fmtLocation(r.destination_location)}</span> },
              { header: 'Reference', render: r => <span className="font-mono text-xs text-gray-500">{r.reference || r.reference_id || '—'}</span> },
              { header: 'Date', render: r => formatDate(r.created_at) },
            ]}
            data={movements}
            emptyMessage={`No stock movements recorded for ${name} warehouse`}
          />
        </Card>
      )}

      <Modal open={showDispatch} onClose={() => setShowDispatch(false)} title={`Dispatch from ${name} Warehouse to Branch`} size="lg">
        <form onSubmit={handleDispatchToBranch} style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '24px 24px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 14px', fontSize: '0.83rem', color: '#92400e' }}>
            ⚠️ <strong>GM Approval Required:</strong> This dispatch will be sent to the General Manager for approval. Once approved, the branch can confirm receipt.
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Source</label>
              <div className="px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-700">
                🏭 {name} Warehouse
              </div>
            </div>
            <Select label="Destination Branch" options={branchDestinations} value={dispatchBranch} onChange={e => setDispatchBranch(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Products & Quantities</label>
            <ProductMultiCart cart={dispatchCart} onCartChange={setDispatchCart} />
          </div>
          {dispatchCart.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Batch Selection</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {dispatchCart.map(item => {
                  const availableBatches = getAvailableBatchesForProduct(item.description);
                  const selectedId = dispatchBatchSelections[item.description];
                  const effectiveBatch = selectedId
                    ? availableBatches.find(b => b.id === selectedId) || availableBatches[0]
                    : availableBatches[0];
                  return (
                    <div key={item.description} style={{ border: '1.5px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 600, fontSize: '0.83rem', color: '#1e293b' }}>
                        📦 {item.description}
                      </div>
                      {availableBatches.length === 0 ? (
                        <div style={{ padding: '10px 12px', fontSize: '0.82rem', color: '#ef4444' }}>
                          ⚠️ No available batches found for this product in the warehouse
                        </div>
                      ) : (
                        <>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                          <thead>
                            <tr style={{ background: '#f1f5f9' }}>
                              <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#64748b', width: 32 }}></th>
                              <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#64748b' }}>Batch #</th>
                              <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#64748b' }}>Expiry</th>
                              <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: '#64748b' }}>Avail. Qty</th>
                              <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#64748b' }}>Source</th>
                            </tr>
                          </thead>
                          <tbody>
                            {availableBatches.map((batch, idx) => {
                              const isSelected = (selectedId || effectiveBatch?.id) === batch.id;
                              const source = getBatchSource(batch);
                              const remaining = Number(batch.remaining_quantity ?? batch.remainingQuantity ?? batch.quantity ?? 0);
                              const expiry = batch.expiry_date || batch.expiryDate || null;
                              return (
                                <tr key={batch.id || idx}
                                  onClick={() => setDispatchBatchSelections(prev => ({ ...prev, [item.description]: batch.id }))}
                                  style={{ cursor: 'pointer', background: isSelected ? '#eff6ff' : idx % 2 === 0 ? '#fff' : '#fafafa', borderTop: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                                    <input type="radio" readOnly checked={isSelected} style={{ accentColor: '#2563eb' }} />
                                  </td>
                                  <td style={{ padding: '7px 10px', fontWeight: isSelected ? 700 : 500, color: '#1e293b', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                                    {batch.batch_no || batch.batchNo || batch.batch_number || '—'}
                                  </td>
                                  <td style={{ padding: '7px 10px', color: expiry ? '#1e293b' : '#94a3b8' }}>
                                    {expiry ? expiry.slice(0, 7) : 'No expiry'}
                                  </td>
                                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: remaining > 0 ? '#16a34a' : '#94a3b8' }}>
                                    {remaining}
                                  </td>
                                  <td style={{ padding: '7px 10px' }}>
                                    <span style={{
                                      display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 600,
                                      background: source === 'Country Stock' ? '#ecfdf5' : '#eff6ff',
                                      color: source === 'Country Stock' ? '#059669' : '#2563eb',
                                      border: source === 'Country Stock' ? '1px solid #6ee7b7' : '1px solid #bfdbfe'
                                    }}>
                                      {source}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        {effectiveBatch && !(effectiveBatch.expiry_date || effectiveBatch.expiryDate) && (
                          <div style={{ padding: '7px 12px', background: '#fffbeb', borderTop: '1px solid #fcd34d', fontSize: '0.78rem', color: '#92400e' }}>
                            ⚠️ The selected batch has no expiry date on record. The expiry will be looked up automatically from the batch registry at save time — please verify this batch has an expiry date recorded in the system.
                          </div>
                        )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dispatch Notes (optional)</label>
            <textarea className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 resize-y" rows={2}
              value={dispatchNote} onChange={e => setDispatchNote(e.target.value)} placeholder="Delivery instructions, urgency, etc..." />
          </div>
          </div>
          <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: '1px solid #e2e8f0', padding: '14px 24px', display: 'flex', gap: 12, zIndex: 10 }}>
            <Button type="submit" disabled={submitting || dispatchCart.length === 0 || dispatchCart.some(c => getAvailableBatchesForProduct(c.description).length === 0)}>
              {submitting ? 'Submitting...' : `📤 Submit for GM Approval (${dispatchCart.reduce((s, c) => s + c.qty, 0)} units)`}
            </Button>
            <Button variant="secondary" type="button" onClick={() => setShowDispatch(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>

      <RequestAdjustmentModal
        open={!!adjRecord} onClose={() => setAdjRecord(null)}
        record={adjRecord} targetType="warehouse" location={location}
      />

      <Modal open={!!viewAuditTransfer} onClose={() => setViewAuditTransfer(null)} title="Dispatch Audit Trail" size="lg">
        {viewAuditTransfer && (() => {
          const t = viewAuditTransfer;
          const meta = t.metadata || {};
          const items = Array.isArray(t.items) ? t.items : [];
          const events = [];
          events.push({ time: t.createdAt || t.created_at, action: 'Created', detail: `Dispatch created by ${t.createdBy || t.created_by || '—'}`, color: '#6366f1' });
          if (t.gmAction || t.gm_action) {
            const action = t.gmAction || t.gm_action;
            const actionLabel = { approve: 'Approved', reject: 'Rejected', amend_approve: 'Amended & Approved', return: 'Returned for Correction' };
            events.push({ time: t.amendedAt || t.amended_at || t.updatedAt || t.updated_at, action: `GM: ${actionLabel[action] || action}`, detail: t.gmComment || t.gm_comment || '', color: action === 'approve' ? '#16a34a' : action === 'reject' ? '#dc2626' : action === 'amend_approve' ? '#d97706' : '#6366f1' });
          }
          if (t.amendedByGm || t.amended_by_gm) {
            events.push({ time: t.amendedAt || t.amended_at, action: 'GM Amendment', detail: `Amended by ${t.amendedByGm || t.amended_by_gm}`, color: '#d97706' });
          }
          if (meta.amendment_log) {
            const log = Array.isArray(meta.amendment_log) ? meta.amendment_log : [meta.amendment_log];
            log.forEach((entry, i) => {
              if (typeof entry === 'string') events.push({ time: null, action: `Amendment Note ${i + 1}`, detail: entry, color: '#d97706' });
              else if (entry) events.push({ time: entry.date || entry.time, action: `Amendment: ${entry.action || 'change'}`, detail: entry.detail || entry.note || JSON.stringify(entry), color: '#d97706' });
            });
          }
          if (t.receiptStatus || t.receipt_status) {
            events.push({ time: t.updatedAt || t.updated_at, action: `Branch Receipt: ${(t.receiptStatus || t.receipt_status || '').replace(/_/g, ' ')}`, detail: t.signatureName || t.signature_name ? `Signed by: ${t.signatureName || t.signature_name}` : '', color: '#16a34a' });
          }
          if (t.discrepancyFlag || t.discrepancy_flag) {
            events.push({ time: null, action: 'Discrepancy Reported', detail: t.branchReceiptNote || t.branch_receipt_note || 'Discrepancy flagged during receipt', color: '#dc2626' });
          }
          if (t.status === 'delivered' || t.status === 'received') {
            events.push({ time: t.updatedAt || t.updated_at, action: 'Delivered', detail: 'Transfer completed', color: '#16a34a' });
          }
          return (
            <div className="p-6 space-y-5">
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px' }}>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-gray-500">Transfer ID:</span> <span className="font-mono font-bold">#{t.id}</span></div>
                  <div><span className="text-gray-500">Status:</span> <Badge variant={statusColor[t.status] || 'default'}>{(t.status || '').replace(/_/g, ' ')}</Badge></div>
                  <div><span className="text-gray-500">From:</span> <span className="font-semibold">{fmtLocation(t.fromWarehouse || t.from_location)}</span></div>
                  <div><span className="text-gray-500">To:</span> <span className="font-semibold">{fmtLocation(t.toBranch || t.to_location)}</span></div>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-gray-800 mb-2 text-sm">Items</h4>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead><tr style={{ background: '#f8fafc' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>Product</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>Batch</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>Expiry</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>Qty Sent</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>Qty Approved</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, borderBottom: '1px solid #e2e8f0' }}>Qty Received</th>
                    </tr></thead>
                    <tbody>{items.map((it, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 12px', fontWeight: 600 }}>{it.productName || it.product_name}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'center', fontFamily: 'monospace', fontSize: '0.78rem' }}>{it.batchNo || it.batch_no || '—'}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'center', fontSize: '0.78rem', color: (it.expiryDate || it.expiry_date) ? 'inherit' : '#9ca3af' }}>{it.expiryDate || it.expiry_date ? formatDate(it.expiryDate || it.expiry_date) : (it.batchNo || it.batch_no ? 'N/A' : '—')}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 700 }}>{it.quantity}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 700, color: it.quantityApproved || it.quantity_approved ? '#d97706' : '#64748b' }}>{it.quantityApproved || it.quantity_approved || '—'}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 700, color: it.quantityReceived || it.quantity_received ? '#16a34a' : '#64748b' }}>{it.quantityReceived || it.quantity_received || '—'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-gray-800 mb-2 text-sm">Timeline</h4>
                <div style={{ borderLeft: '3px solid #e2e8f0', paddingLeft: 16 }}>
                  {events.map((ev, idx) => (
                    <div key={idx} style={{ marginBottom: 14, position: 'relative' }}>
                      <div style={{ position: 'absolute', left: -24, top: 3, width: 12, height: 12, borderRadius: '50%', background: ev.color, border: '2px solid #fff', boxShadow: '0 0 0 2px ' + ev.color + '40' }} />
                      <div style={{ fontWeight: 700, fontSize: '0.83rem', color: ev.color }}>{ev.action}</div>
                      {ev.time && <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 1 }}>{formatDateTime(ev.time)}</div>}
                      {ev.detail && <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 2 }}>{ev.detail}</div>}
                    </div>
                  ))}
                </div>
              </div>

              {(t.gmComment || t.gm_comment) && (
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 14px' }}>
                  <div className="text-xs font-bold text-yellow-800 mb-1">GM Comment</div>
                  <div className="text-sm text-yellow-900">{t.gmComment || t.gm_comment}</div>
                </div>
              )}

              {(t.dispatchNotes || t.dispatch_notes) && (
                <div style={{ background: '#f0f9ff', border: '1px solid #93c5fd', borderRadius: 8, padding: '10px 14px' }}>
                  <div className="text-xs font-bold text-blue-800 mb-1">Dispatch Notes</div>
                  <div className="text-sm text-blue-900">{t.dispatchNotes || t.dispatch_notes}</div>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      {viewDispatchNoteTransfer && <DispatchNote transfer={viewDispatchNoteTransfer} onClose={() => setViewDispatchNoteTransfer(null)} />}
    </div>
  );
}

function DistributionTab({ branch }) {
  const { user } = useAuth();
  const [cart, setCart] = useState([]);
  const [destination, setDestination] = useState('');
  const [transferNote, setTransferNote] = useState('');
  const [adjRecord, setAdjRecord] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);
  const [recentTransfers, setRecentTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [countryBatches, setCountryBatches] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [transferData, batchData] = await Promise.allSettled([
        api.stock.transfers(),
        api.stock.batches(),
      ]);
      if (transferData.status === 'fulfilled') {
        const all = Array.isArray(transferData.value) ? transferData.value : transferData.value?.transfers || [];
        setRecentTransfers(all);
      }
      if (batchData.status === 'fulfilled') {
        const all = Array.isArray(batchData.value) ? batchData.value : batchData.value?.batches || [];
        setCountryBatches(all.filter(b => b.location === 'country_stock'));
      }
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const warehouseDestinations = [
    { value: '', label: 'Select destination warehouse...' },
    { value: 'windhoek_warehouse', label: '🏢 Windhoek Warehouse' },
    { value: 'ondangwa_warehouse', label: '🏬 Ondangwa Warehouse' },
  ];

  const availableByProduct = {};
  const batchesByProduct = {};
  countryBatches.forEach(b => {
    const name = b.product_name || '';
    if (!availableByProduct[name]) availableByProduct[name] = 0;
    availableByProduct[name] += Number(b.remaining_quantity || b.quantity || 0);
    if (!batchesByProduct[name]) batchesByProduct[name] = [];
    batchesByProduct[name].push(b);
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!destination) { setAlert({ type: 'error', msg: 'Please select a destination warehouse' }); return; }
    if (cart.length === 0) { setAlert({ type: 'error', msg: 'Add at least one product to distribute' }); return; }
    const overAllocated = cart.filter(c => c.qty > (availableByProduct[c.description] || 0));
    if (overAllocated.length > 0) {
      setAlert({ type: 'error', msg: `Insufficient Country Stock for: ${overAllocated.map(c => `${c.description} (need ${c.qty}, available ${availableByProduct[c.description] || 0})`).join(', ')}` });
      return;
    }
    setSubmitting(true);
    try {
      const items = cart.map(c => ({ productName: c.description, quantity: c.qty }));
      await api.stock.createTransfer({
        from_location: 'country_stock',
        to_location: destination,
        items,
        status: 'pending_approval',
        dispatchNotes: transferNote || undefined,
        created_by: user?.full_name || user?.username,
        preparedByRole: user?.role || null,
      });
      setAlert({ type: 'success', msg: `Distribution of ${cart.length} product(s) to ${fmtLocation(destination)} submitted for GM approval` });
      setCart([]);
      setDestination('');
      setTransferNote('');
      await loadData();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const WAREHOUSE_KEYS = ['windhoek_warehouse', 'ondangwa_warehouse'];
  const distTransfers = recentTransfers.filter(t => {
    const from = (t.fromWarehouse || t.from_location || '').toLowerCase().replace(/\s+/g, '_');
    const to = (t.toBranch || t.to_location || '').toLowerCase().replace(/\s+/g, '_');
    return from === 'country_stock' && WAREHOUSE_KEYS.includes(to);
  });

  const statusBadge = (status) => {
    const s = (status || 'pending').toLowerCase();
    if (s === 'received') return <Badge variant="success">Received</Badge>;
    if (s === 'in_transit' || s === 'submitted') return <Badge variant="info">{s === 'submitted' ? 'Submitted' : 'In Transit'}</Badge>;
    if (s === 'cancelled' || s === 'rejected') return <Badge variant="danger">{s === 'cancelled' ? 'Cancelled' : 'Rejected'}</Badge>;
    return <Badge variant="warning">{status || 'Pending'}</Badge>;
  };

  const totalCartQty = cart.reduce((s, c) => s + c.qty, 0);

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} className="mb-4">{alert.msg}</Alert>}

      <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
        <CardBody>
          <div className="flex items-start gap-4">
            <Truck size={32} className="text-green-600 mt-1" />
            <div>
              <h3 className="font-bold text-green-900">Distribution — Country Stock → Warehouses</h3>
              <p className="text-sm text-green-700 mt-1">
                Distribute imported stock from the national Country Stock pool to Windhoek or Ondangwa Warehouse.
                Warehouse managers will confirm receipt, then dispatch to branches.
              </p>
              <p className="text-xs text-green-600 mt-1 font-semibold">
                Flow: Country Stock → Warehouse Receipt → Warehouse Dispatch to Branch → GM Approval → Branch Receipt
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><h3 className="font-bold text-gray-800">Create Distribution Transfer</h3></CardHeader>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Source</label>
                <div className="px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-700">
                  🌍 Country Stock
                </div>
              </div>
              <Select label="Destination Warehouse" options={warehouseDestinations} value={destination} onChange={e => setDestination(e.target.value)} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Products & Quantities</label>
              <ProductMultiCart cart={cart} onCartChange={setCart} />
              {cart.length > 0 && (
                <div className="mt-2 space-y-1">
                  {cart.map(c => {
                    const avail = availableByProduct[c.description] || 0;
                    const over = c.qty > avail;
                    const pBatches = batchesByProduct[c.description] || [];
                    return (
                      <div key={c.description} className={`px-3 py-2 rounded text-xs ${over ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-100'}`}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{c.description}</span>
                          <span className={over ? 'text-red-600 font-bold' : 'text-gray-500'}>
                            Qty: {c.qty} / Available: {avail}{over ? ' OVER' : ''}
                          </span>
                        </div>
                        {pBatches.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {pBatches.slice(0, 3).map((b, i) => {
                              const exp = b.expiry_date ? new Date(b.expiry_date) : null;
                              const daysLeft = exp ? Math.ceil((exp - new Date()) / 86400000) : null;
                              return (
                                <span key={i} className="px-1.5 py-0.5 rounded text-xs" style={{ background: daysLeft !== null && daysLeft < 90 ? '#fef2f2' : '#f0fdf4', border: '1px solid', borderColor: daysLeft !== null && daysLeft < 90 ? '#fecaca' : '#bbf7d0', color: '#374151' }}>
                                  B:{b.batch_no || b.batch_number || '-'} | {Number(b.remaining_quantity || b.quantity || 0)}u{exp ? ` | Exp:${formatDate(b.expiry_date)}` : ''}
                                </span>
                              );
                            })}
                            {pBatches.length > 3 && <span className="text-gray-400">+{pBatches.length - 3} more</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Transfer Note (optional)</label>
              <textarea
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20 resize-y"
                rows={2} value={transferNote} onChange={e => setTransferNote(e.target.value)}
                placeholder="Add notes for this distribution..."
              />
            </div>

            <div className="flex items-center gap-4">
              <Button type="submit" disabled={submitting || cart.length === 0}>
                <Truck size={16} /> {submitting ? 'Distributing...' : `Distribute ${totalCartQty} Unit${totalCartQty !== 1 ? 's' : ''} to Warehouse`}
              </Button>
              {cart.length > 0 && <span className="text-sm text-gray-500">{cart.length} product(s), {totalCartQty} total units</span>}
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">Distribution History <span className="text-xs font-normal text-gray-400">(Country Stock → Warehouses)</span></h3>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={loadData}>↺ Refresh</Button>
              <Button size="sm" variant="secondary" onClick={() => {
                const rows = distTransfers.map(r => {
                  const items = Array.isArray(r.items) ? r.items : [];
                  const prodList = items.length > 0 ? items.map(i => `${i.productName || i.product_name} × ${i.quantity}`).join(', ') : (r.product_name || '—');
                  const totalQ = items.length > 0 ? items.reduce((s, i) => s + Number(i.quantity || 0), 0) : (r.quantity || 0);
                  return `<tr><td>${formatDateTime(r.created_at)}</td><td>${fmtLocation(r.fromWarehouse || r.from_location)}</td><td>${fmtLocation(r.toBranch || r.to_location)}</td><td>${prodList}</td><td>${totalQ}</td><td>${r.status || 'Pending'}</td></tr>`;
                }).join('');
                printDocument('Distribution History — Country Stock → Warehouses', `<table><thead><tr><th>Date</th><th>From</th><th>To</th><th>Products</th><th>Total Qty</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`);
              }}><Printer size={14} /> Print</Button>
            </div>
          </div>
        </CardHeader>
        {loading ? <LoadingSpinner /> : (
          <Table
            columns={[
              { header: 'Date', render: r => formatDateTime(r.created_at) },
              { header: 'To Warehouse', render: r => <span className="text-xs font-medium text-blue-700">{fmtLocation(r.toBranch || r.to_location)}</span> },
              { header: 'Products', render: r => {
                const items = Array.isArray(r.items) ? r.items : [];
                if (items.length > 0) return <span className="text-xs">{items.map(i => `${i.productName || i.product_name} × ${i.quantity}`).join(', ')}</span>;
                return <span className="text-xs">{r.product_name || '—'}</span>;
              }},
              { header: 'Total Qty', render: r => {
                const items = Array.isArray(r.items) ? r.items : [];
                return items.length > 0 ? items.reduce((s, i) => s + Number(i.quantity || 0), 0) : (r.quantity || 0);
              }},
              { header: 'Status', render: r => statusBadge(r.status) },
              { header: 'Notes', render: r => <span className="text-xs text-gray-500 truncate max-w-[120px] block">{r.dispatchNotes || r.dispatch_notes || '—'}</span> },
              { header: '', render: r => (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => {
                    const items = Array.isArray(r.items) ? r.items : [];
                    const prodRows = items.length > 0
                      ? items.map(i => `<tr><td>${i.productName || i.product_name}</td><td>${i.batch_no || i.batchNo || '-'}</td><td>${(i.expiry_date || i.expiryDate) ? formatDate(i.expiry_date || i.expiryDate) : '-'}</td><td>${i.quantity}</td></tr>`).join('')
                      : `<tr><td>${r.product_name || '—'}</td><td>${r.batch_no || r.batchNo || '-'}</td><td>${(r.expiry_date || r.expiryDate) ? formatDate(r.expiry_date || r.expiryDate) : '-'}</td><td>${r.quantity || 0}</td></tr>`;
                    const totalQ = items.length > 0 ? items.reduce((s, i) => s + Number(i.quantity || 0), 0) : (r.quantity || 0);
                    const win = window.open('', '_blank');
                    if (!win) return;
                    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Dispatch Note — ${r.id}</title>
                    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;padding:24px}.header{display:flex;justify-content:space-between;border-bottom:3px solid #c41e3a;padding-bottom:10px;margin-bottom:16px}.company{color:#c41e3a;font-weight:900;font-size:15px}.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;border:1.5px solid #f0e8ea;border-radius:10px;padding:14px}.detail-item{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dotted #e2e8f0}.detail-label{font-weight:600;color:#64748b;font-size:10px}.detail-val{font-weight:800;color:#1e293b;font-size:10px}table{width:100%;border-collapse:collapse;margin-top:10px}th{background:#c41e3a;color:#fff;font-weight:700;padding:6px 8px;text-align:left;font-size:10px}td{padding:5px 8px;border-bottom:1px solid #f1f5f9;font-size:10px}tr:nth-child(even) td{background:#fdf7f8}.total-row td{font-weight:800;background:#fff0f3!important;border-top:2px solid #fecaca}.sig-section{margin-top:30px;display:grid;grid-template-columns:1fr 1fr;gap:40px}.sig-box{border-top:1.5px solid #1e293b;padding-top:8px;font-size:10px;color:#64748b}.print-btn{position:fixed;top:12px;right:12px;background:#c41e3a;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:700;cursor:pointer}@media print{.print-btn{display:none}}</style></head><body>
                    <button class="print-btn" onclick="window.print()">Print</button>
                    <div class="header"><div><div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div><div style="font-size:14px;font-weight:800;color:#8b0000;margin-top:4px">DISPATCH NOTE</div></div><div style="text-align:right;color:#64748b;font-size:10px;line-height:1.6">Date: ${new Date().toLocaleDateString('en-NA',{day:'2-digit',month:'long',year:'numeric'})}<br>DN#: ${r.id || ''}</div></div>
                    <div class="detail-grid"><div class="detail-item"><span class="detail-label">Transfer ID</span><span class="detail-val">${r.id||''}</span></div><div class="detail-item"><span class="detail-label">Date Created</span><span class="detail-val">${formatDateTime(r.created_at)}</span></div><div class="detail-item"><span class="detail-label">From</span><span class="detail-val">Country Stock</span></div><div class="detail-item"><span class="detail-label">To</span><span class="detail-val">${fmtLocation(r.toBranch || r.to_location)}</span></div><div class="detail-item"><span class="detail-label">Status</span><span class="detail-val">${r.status||'Pending'}</span></div><div class="detail-item"><span class="detail-label">Total Items</span><span class="detail-val">${totalQ} units</span></div></div>
                    <div style="font-weight:800;color:#c41e3a;font-size:11px;margin-bottom:4px;border-bottom:1px solid #fecaca;padding-bottom:4px">PRODUCTS DISPATCHED</div>
                    <table><thead><tr><th>Product Description</th><th>Batch No.</th><th>Expiry</th><th>Qty Sent</th></tr></thead><tbody>${prodRows}<tr class="total-row"><td colspan="3"><strong>TOTAL</strong></td><td><strong>${totalQ}</strong></td></tr></tbody></table>
                    ${r.dispatchNotes || r.dispatch_notes ? `<div style="margin-top:14px;padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;font-size:10px;color:#374151"><strong>Notes:</strong> ${r.dispatchNotes || r.dispatch_notes}</div>` : ''}
                    <div class="sig-section"><div class="sig-box">Dispatched By (Name & Signature)</div><div class="sig-box">Received By (Name & Signature)</div></div>
                    <div style="margin-top:16px;font-size:9px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:8px">Dynapharm International Namibia — Stock Management System</div>
                    </body></html>`);
                    win.document.close();
                  }}>
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
            emptyMessage="No distribution transfers yet. Use the form above to distribute Country Stock to warehouses."
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
  const [viewDispatchNote, setViewDispatchNote] = useState(null);

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
    ...BRANCH_DETAILS.map(b => ({ value: b.id, label: b.name })),
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
                <Button size="sm" variant="ghost" title="View dispatch note" onClick={() => setViewDispatchNote(r)}><Printer size={12} /></Button>
              </div>
            )},
          ]}
          data={filteredTransfers}
          emptyMessage={branch !== 'all' ? `No transfers for ${fmtLocation(branch)}` : 'No transfers recorded'}
        />
      </Card>

      {viewDispatchNote && <DispatchNote transfer={viewDispatchNote} onClose={() => setViewDispatchNote(null)} />}

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

  const { connected: wsConnected } = useStockRealtime({ onUpdate: loadMovements });

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
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              Stock Movements
              {branch !== 'all' && <span className="text-xs font-normal text-gray-400 ml-2">— {fmtLocation(branch)}</span>}
              {wsConnected && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#dcfce7', color: '#166534', borderRadius: 99, padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />LIVE</span>}
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
            { header: 'Product', render: r => <span className="text-xs">{r.product_name || ''}</span> },
            { header: 'Batch', render: r => <span className="text-xs font-mono">{r.batch_no || '-'}</span> },
            { header: 'Expiry', render: r => <span className="text-xs">{(r.expiry_date || r.expiryDate) ? formatDate(r.expiry_date || r.expiryDate) : '—'}</span> },
            { header: 'Type', render: r => <Badge variant={
              ['in','received','import_received','transfer_in'].includes(r.movement_type) ? 'success' :
              ['out','dispatched','transfer_out','field_issue'].includes(r.movement_type) ? 'danger' :
              ['write_off','return'].includes(r.movement_type) ? 'warning' : 'info'
            }>{(r.movement_type || '-').replace(/_/g, ' ')}</Badge> },
            { header: 'Qty', render: r => <span className="font-semibold">{r.quantity}</span> },
            { header: 'DP Value', render: r => <span className="text-xs font-semibold">{formatCurrency(Number(r.quantity || 0) * (Number(r.dpc_unit_value || 0) || getDPCPrice(r.product_name || '')))}</span> },
            { header: 'From', render: r => <span className="text-xs">{fmtLocation(r.source_location || r.location || '')}</span> },
            { header: 'To', render: r => <span className="text-xs">{fmtLocation(r.destination_location || '')}</span> },
            { header: 'Reference', render: r => <span className="text-xs text-gray-500 truncate max-w-[120px] block">{r.reference_id || r.reference || '—'}</span> },
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
                {BRANCH_DETAILS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
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
  const [viewRequest, setViewRequest] = useState(null);
  const [viewOrderDispatchNote, setViewOrderDispatchNote] = useState(null);
  const [dispatchRequest, setDispatchRequest] = useState(null);
  const [dispatchWH, setDispatchWH] = useState('country_stock');
  const [cart, setCart] = useState([]);
  const [priority, setPriority] = useState('normal');
  const [requestBranch, setRequestBranch] = useState(branch && branch !== 'all' ? fmtLocation(branch) : '');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [alert, setAlert] = useState(null);

  // Sales Preview state
  const [showSalesPreview, setShowSalesPreview] = useState(false);
  const [spDateFrom, setSpDateFrom] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [spDateTo, setSpDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [spLoading, setSpLoading] = useState(false);
  const [spResults, setSpResults] = useState([]);
  const [spError, setSpError] = useState('');

  const loadSalesPreview = async () => {
    if (!spDateFrom || !spDateTo) { setSpError('Please select both dates'); return; }
    setSpLoading(true);
    setSpError('');
    setSpResults([]);
    try {
      const branchesToQuery = branch && branch !== 'all'
        ? BRANCH_DETAILS.filter(b => b.id === branch || b.name.toLowerCase() === branch.toLowerCase())
        : BRANCH_DETAILS;

      const results = await Promise.all(
        branchesToQuery.map(async (b) => {
          try {
            const data = await api.get(`/reports/sales/branch?branchId=${encodeURIComponent(b.id)}&startDate=${spDateFrom}&endDate=${spDateTo}`);
            return {
              branchId: b.id,
              branchName: b.name,
              transactions: data.transactions || 0,
              totalUnits: data.totalUnits || 0,
              walkinSales: data.walkinSales || 0,
              memberSales: data.memberSales || 0,
              nonMemberSales: data.nonMemberSales || 0,
              prescriptionSales: data.prescriptionSales || 0,
              totalRevenue: data.totalSales || 0,
            };
          } catch {
            return { branchId: b.id, branchName: b.name, transactions: 0, totalUnits: 0, walkinSales: 0, memberSales: 0, nonMemberSales: 0, prescriptionSales: 0, totalRevenue: 0 };
          }
        })
      );
      setSpResults(results.filter(r => r.totalRevenue > 0 || r.totalUnits > 0));
    } catch (err) {
      setSpError(err.message || 'Failed to load sales data');
    } finally {
      setSpLoading(false);
    }
  };

  const loadRequests = useCallback(() => {
    setLoading(true);
    api.stock.requests()
      .then(d => setRequests(Array.isArray(d) ? d : d.requests || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  useEffect(() => {
    if (branch && branch !== 'all') setRequestBranch(fmtLocation(branch));
  }, [branch]);

  const handleAction = async (reqId, action, extra = {}) => {
    setActionLoading(prev => ({ ...prev, [reqId]: action }));
    try {
      await api.stock.updateRequest(reqId, { status: action, ...extra, updated_by: user?.full_name || user?.username });
      setAlert({ type: 'success', msg: `Request ${action === 'approved' ? 'approved' : action === 'rejected' ? 'rejected' : action === 'dispatched' ? 'dispatched to branch' : 'updated'} successfully` });
      setTimeout(() => loadRequests(), 100);
      return true;
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
      return false;
    } finally {
      setActionLoading(prev => { const n = { ...prev }; delete n[reqId]; return n; });
    }
  };

  const handleDispatchAsTransfer = async () => {
    if (!dispatchRequest) return;
    setSubmitting(true);
    try {
      const items = Array.isArray(dispatchRequest.items) ? dispatchRequest.items : [];
      const branchName = dispatchRequest.requestingBranch || dispatchRequest.requesting_branch || '';
      for (const item of items) {
        await api.stock.createTransfer({
          from_location: dispatchWH,
          to_location: branchName.toLowerCase().replace(/\s+/g, '_'),
          product_name: item.productName || item.productId,
          quantity: Number(item.quantity),
          status: 'pending_approval',
          notes: `Fulfilling request ${dispatchRequest.requestNumber || dispatchRequest.id}`,
          created_by: user?.full_name || user?.username,
        });
      }
      await api.stock.updateRequest(dispatchRequest.id, { status: 'dispatched', updated_by: user?.full_name || user?.username });
      setDispatchRequest(null);
      setAlert({ type: 'success', msg: `Transfer submitted for GM approval: ${fmtLocation(dispatchWH)} → ${branchName}. Once approved, branch can receive the delivery.` });
      setTimeout(() => loadRequests(), 100);
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (cart.length === 0) { setAlert({ type: 'error', msg: 'Select at least one product' }); return; }
    if (!requestBranch) { setAlert({ type: 'error', msg: 'Requesting branch is required' }); return; }
    setSubmitting(true);
    try {
      await api.stock.createRequest({
        requesting_branch: requestBranch,
        priority,
        notes,
        created_by: user?.full_name || user?.username || 'Stock Manager',
        items: cart.map(item => ({ productId: item.description, productName: item.description, quantity: Number(item.qty), unit: 'units' })),
      });
      setShowForm(false);
      setCart([]); setPriority('normal'); setNotes('');
      setAlert({ type: 'success', msg: `Stock request submitted for ${requestBranch}` });
      setTimeout(() => loadRequests(), 100);
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally { setSubmitting(false); }
  };

  if (loading) return <LoadingSpinner />;

  const filteredRequests = branch === 'all' ? requests : requests.filter(r => {
    const rb = (r.requestingBranch || r.requesting_branch || '').toLowerCase().replace(/\s+/g, '_');
    return rb === branch;
  });

  const pending = filteredRequests.filter(r => !r.status || r.status === 'pending');
  const approved = filteredRequests.filter(r => r.status === 'approved');
  const dispatched = filteredRequests.filter(r => r.status === 'dispatched');
  const completed = filteredRequests.filter(r => r.status === 'received' || r.status === 'fulfilled' || r.status === 'rejected');

  const RequestCard = ({ r }) => {
    const items = Array.isArray(r.items) ? r.items : [];
    const isLoading = actionLoading[r.id];
    const branchName = r.requestingBranch || r.requesting_branch || '—';
    return (
      <div style={{ background: '#fff', border: '1.5px solid #f0f0f0', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <div className="flex justify-between items-start gap-2 mb-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm text-gray-800">{branchName}</span>
              <Badge variant={(r.priority||r.urgency) === 'urgent' ? 'danger' : (r.priority||r.urgency) === 'high' ? 'warning' : 'default'}>{r.priority || 'normal'}</Badge>
              <Badge variant={r.status === 'approved' ? 'success' : r.status === 'dispatched' ? 'info' : r.status === 'received' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}>{r.status || 'pending'}</Badge>
            </div>
            <div className="text-xs text-gray-400 mt-0.5">{formatDateTime(r.createdAt || r.created_at)} · {r.requestNumber || r.id}</div>
          </div>
          <button onClick={() => setViewRequest(r)} className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 font-semibold border-none cursor-pointer">👁 View</button>
        </div>
        <div className="flex flex-wrap gap-1 mb-3">
          {items.length === 0 ? <span className="text-xs text-gray-400">No items listed</span> : items.slice(0, 6).map((it, i) => (
            <span key={i} className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-800 border border-red-100">{it.productName || it.productId} x{it.quantity}{it.batch_no ? ` [B:${it.batch_no}]` : ''}</span>
          ))}
          {items.length > 6 && <span className="text-xs text-gray-400">+{items.length - 6} more</span>}
        </div>
        <div className="text-xs text-gray-400 mb-2">
          {r.status === 'dispatched' && <span>Dispatched from: <strong>{fmtLocation(r.dispatch_warehouse || r.dispatchWarehouse || 'warehouse')}</strong></span>}
          {(r.status === 'received' || r.status === 'fulfilled') && <span>Received at: <strong>{branchName}</strong> from {fmtLocation(r.dispatch_warehouse || r.dispatchWarehouse || 'warehouse')}</span>}
          {r.updated_at && <span className="ml-2">| Updated: {formatDateTime(r.updated_at)}</span>}
        </div>
        {r.notes && <div className="text-xs text-gray-500 italic mb-3">{r.notes}</div>}
        <div className="flex gap-2 flex-wrap">
          {(!r.status || r.status === 'pending') && (<>
            <button disabled={!!isLoading} onClick={() => handleAction(r.id, 'approved')} className="px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer" style={{ background: '#166534', color: '#fff', opacity: isLoading ? 0.6 : 1 }}>{isLoading === 'approved' ? '...' : '✓ Approve'}</button>
            <button disabled={!!isLoading} onClick={() => handleAction(r.id, 'rejected')} className="px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer" style={{ background: '#fef2f2', color: '#c41e3a', border: '1px solid #fecaca' }}>{isLoading === 'rejected' ? '...' : '✗ Reject'}</button>
          </>)}
          {r.status === 'approved' && (
            <button disabled={!!isLoading} onClick={() => { setDispatchRequest(r); setDispatchWH('country_stock'); }} className="px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer" style={{ background: '#1e40af', color: '#fff' }}>🚚 Dispatch to Branch</button>
          )}
          {r.status === 'dispatched' && (
            <span className="text-xs text-blue-600 font-semibold bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100">📦 Awaiting branch receipt</span>
          )}
          {(r.status === 'received' || r.status === 'fulfilled') && (
            <span className="text-xs text-green-700 font-semibold bg-green-50 px-3 py-1.5 rounded-lg border border-green-100">✅ Received by branch</span>
          )}
          {(r.status === 'dispatched' || r.status === 'received' || r.status === 'fulfilled') && (
            <button onClick={() => setViewOrderDispatchNote(r)} className="px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer flex items-center gap-1" style={{ background: '#fff0f3', color: '#c41e3a', border: '1px solid #fecaca' }}>
              <Printer size={11} /> Dispatch Note
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {alert && <Alert type={alert.type} className="mb-4">{alert.msg}</Alert>}

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10, padding: '12px 16px' }}>
          <div className="text-2xl font-bold text-yellow-800">{pending.length}</div>
          <div className="text-xs font-semibold text-yellow-700">Pending Approval</div>
        </div>
        <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 10, padding: '12px 16px' }}>
          <div className="text-2xl font-bold text-green-800">{approved.length}</div>
          <div className="text-xs font-semibold text-green-700">Approved — Ready to Dispatch</div>
        </div>
        <div style={{ background: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: 10, padding: '12px 16px' }}>
          <div className="text-2xl font-bold text-blue-800">{dispatched.length}</div>
          <div className="text-xs font-semibold text-blue-700">Dispatched — In Transit</div>
        </div>
        <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 10, padding: '12px 16px' }}>
          <div className="text-2xl font-bold text-gray-700">{completed.length}</div>
          <div className="text-xs font-semibold text-gray-500">Completed / Rejected</div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">
              Branch Stock Requests
              {branch !== 'all' && <span className="text-xs font-normal text-gray-400 ml-2">— {fmtLocation(branch)}</span>}
            </h3>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="secondary" onClick={() => { setShowSalesPreview(true); setSpResults([]); setSpError(''); }}><BarChart3 size={14} /> Sales Preview</Button>
              <Button size="sm" variant="secondary" onClick={() => {
                const rows = filteredRequests.map(r => {
                  const items = Array.isArray(r.items) ? r.items.map(i => `${i.productName||i.productId} ×${i.quantity}`).join('; ') : '';
                  return `<tr><td>${formatDateTime(r.createdAt||r.created_at)}</td><td>${r.requestingBranch||r.requesting_branch||''}</td><td>${items}</td><td>${r.priority||'normal'}</td><td>${r.status||'pending'}</td><td>${r.notes||''}</td></tr>`;
                }).join('');
                printDocument('Branch Stock Requests', `<table><thead><tr><th>Date</th><th>Branch</th><th>Items</th><th>Priority</th><th>Status</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>`);
              }}><Printer size={14} /> Print</Button>
              <Button size="sm" onClick={loadRequests} variant="secondary">↺ Refresh</Button>
              <Button size="sm" onClick={() => { setShowForm(true); setAlert(null); }}><Plus size={16} /> New Request</Button>
            </div>
          </div>
        </CardHeader>
        <div className="p-4 space-y-3">
          {filteredRequests.length === 0
            ? <p className="text-center text-gray-400 py-8">{branch !== 'all' ? `No requests for ${fmtLocation(branch)}` : 'No stock requests'}</p>
            : filteredRequests.map(r => <RequestCard key={r.id} r={r} />)
          }
        </div>
      </Card>

      {/* View Request Detail Modal */}
      <Modal open={!!viewRequest} onClose={() => setViewRequest(null)} title={`Request — ${viewRequest?.requestingBranch || viewRequest?.requesting_branch || ''}`} size="lg">
        {viewRequest && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Request #:</span> <span className="font-mono font-bold">{viewRequest.requestNumber || viewRequest.id}</span></div>
              <div><span className="text-gray-500">Branch:</span> <span className="font-bold">{viewRequest.requestingBranch || viewRequest.requesting_branch}</span></div>
              <div><span className="text-gray-500">Priority:</span> <Badge variant={(viewRequest.priority) === 'urgent' ? 'danger' : viewRequest.priority === 'high' ? 'warning' : 'default'}>{viewRequest.priority || 'normal'}</Badge></div>
              <div><span className="text-gray-500">Status:</span> <Badge variant={viewRequest.status === 'approved' ? 'success' : viewRequest.status === 'rejected' ? 'danger' : 'info'}>{viewRequest.status || 'pending'}</Badge></div>
              <div className="col-span-2"><span className="text-gray-500">Created:</span> {formatDateTime(viewRequest.createdAt || viewRequest.created_at)} {viewRequest.createdBy && `by ${viewRequest.createdBy}`}</div>
              {viewRequest.notes && <div className="col-span-2"><span className="text-gray-500">Notes:</span> {viewRequest.notes}</div>}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">Items Requested:</p>
              <div className="space-y-1.5">
                {(Array.isArray(viewRequest.items) ? viewRequest.items : []).map((it, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-red-50 border border-red-100">
                    <span className="text-sm font-medium">{it.productName || it.productId}</span>
                    <span className="font-bold text-red-700">×{it.quantity} {it.unit||'units'}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              {(!viewRequest.status || viewRequest.status === 'pending') && (<>
                <Button disabled={!!actionLoading[viewRequest.id]} onClick={async () => { const ok = await handleAction(viewRequest.id, 'approved'); if (ok) setViewRequest(null); }}>
                  {actionLoading[viewRequest.id] === 'approved' ? 'Approving...' : '✓ Approve'}
                </Button>
                <Button variant="danger" disabled={!!actionLoading[viewRequest.id]} onClick={async () => { const ok = await handleAction(viewRequest.id, 'rejected'); if (ok) setViewRequest(null); }}>
                  {actionLoading[viewRequest.id] === 'rejected' ? 'Rejecting...' : '✗ Reject'}
                </Button>
              </>)}
              {viewRequest.status === 'approved' && (
                <Button onClick={() => { setDispatchRequest(viewRequest); setViewRequest(null); setDispatchWH('country_stock'); }}>🚚 Dispatch to Branch</Button>
              )}
              <Button variant="secondary" disabled={!!actionLoading[viewRequest?.id]} onClick={() => setViewRequest(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Dispatch Transfer Modal */}
      <Modal open={!!dispatchRequest} onClose={() => setDispatchRequest(null)} title="Dispatch Stock to Branch" size="md">
        {dispatchRequest && (
          <div className="p-6 space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
              <p className="font-semibold text-blue-800 mb-1">Fulfilling: {dispatchRequest.requestNumber || dispatchRequest.id}</p>
              <p className="text-blue-700">→ Destination: <strong>{dispatchRequest.requestingBranch || dispatchRequest.requesting_branch}</strong></p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-700 mb-1">Items to dispatch:</p>
              {(Array.isArray(dispatchRequest.items) ? dispatchRequest.items : []).map((it, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
                  <span className="text-sm">{it.productName || it.productId}</span>
                  <span className="font-bold">×{it.quantity}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-semibold text-gray-700">Dispatching From Warehouse <span className="text-red-500">*</span></label>
              <select value={dispatchWH} onChange={e => setDispatchWH(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2">
                <option value="country_stock">Country Stock (Main)</option>
                <option value="windhoek_warehouse">Windhoek Warehouse</option>
                <option value="ondangwa_warehouse">Ondangwa Warehouse</option>
              </select>
            </div>
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
              ⚠️ <strong>GM Approval Required:</strong> This transfer will be sent to the General Manager for approval before the branch can receive it. Once the GM approves, the branch will see it in their Receive tab.
              <br /><br />Route: <strong>{fmtLocation(dispatchWH)}</strong> → <strong>{dispatchRequest.requestingBranch || dispatchRequest.requesting_branch}</strong>
            </div>
            <div className="flex gap-3 pt-2">
              <Button onClick={handleDispatchAsTransfer} disabled={submitting}>{submitting ? 'Submitting...' : '📤 Submit for GM Approval'}</Button>
              <Button variant="secondary" onClick={() => setDispatchRequest(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Sales Preview Modal */}
      <Modal open={showSalesPreview} onClose={() => setShowSalesPreview(false)} title="Branch Sales Preview" size="xl">
        <div className="p-6 space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-600">From Date</label>
              <input type="date" value={spDateFrom} onChange={e => setSpDateFrom(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-600">To Date</label>
              <input type="date" value={spDateTo} onChange={e => setSpDateTo(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary" />
            </div>
            <Button onClick={loadSalesPreview} disabled={spLoading}>
              {spLoading ? 'Loading…' : '📊 Apply'}
            </Button>
            {spResults.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => {
                const rows = spResults.map(r =>
                  `<tr><td>${r.branchName}</td><td style="text-align:right">${r.transactions}</td><td style="text-align:right">${formatCurrency(r.walkinSales)}</td><td style="text-align:right">${formatCurrency(r.memberSales)}</td><td style="text-align:right">${formatCurrency(r.prescriptionSales)}</td><td style="text-align:right"><strong>${formatCurrency(r.totalRevenue)}</strong></td></tr>`
                ).join('');
                const totals = spResults.reduce((acc, r) => ({ txns: acc.txns + r.transactions, walkin: acc.walkin + r.walkinSales, member: acc.member + r.memberSales, rx: acc.rx + r.prescriptionSales, total: acc.total + r.totalRevenue }), { txns: 0, walkin: 0, member: 0, rx: 0, total: 0 });
                printDocument('Branch Sales Preview', `<p style="font-size:11px;color:#555;margin-bottom:8px">Period: ${spDateFrom} to ${spDateTo}</p><table><thead><tr><th>Branch</th><th>Transactions</th><th>Walk-in Sales</th><th>Member Sales</th><th>Rx Sales</th><th>Total Revenue</th></tr></thead><tbody>${rows}<tr style="font-weight:bold;background:#f0f0f0"><td>TOTAL</td><td style="text-align:right">${totals.txns}</td><td style="text-align:right">${formatCurrency(totals.walkin)}</td><td style="text-align:right">${formatCurrency(totals.member)}</td><td style="text-align:right">${formatCurrency(totals.rx)}</td><td style="text-align:right">${formatCurrency(totals.total)}</td></tr></tbody></table>`);
              }}><Printer size={13} /> Print</Button>
            )}
          </div>
          {spError && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{spError}</div>}
          {spLoading && <div className="text-center py-8 text-gray-400"><LoadingSpinner /></div>}
          {!spLoading && spResults.length === 0 && !spError && (
            <div className="text-center py-8 text-gray-400 text-sm">Select a date range and click Apply to load sales data.</div>
          )}
          {!spLoading && spResults.length > 0 && (() => {
            const totalTransactions = spResults.reduce((s, r) => s + r.transactions, 0);
            const totalWalkin = spResults.reduce((s, r) => s + r.walkinSales, 0);
            const totalMember = spResults.reduce((s, r) => s + r.memberSales, 0);
            const totalRx = spResults.reduce((s, r) => s + r.prescriptionSales, 0);
            const grandTotal = spResults.reduce((s, r) => s + r.totalRevenue, 0);
            return (
              <div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div style={{ background: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: 10, padding: '10px 14px' }}>
                    <div className="text-xs text-blue-600 font-semibold">Walk-in Sales</div>
                    <div className="text-lg font-bold text-blue-800">{formatCurrency(totalWalkin)}</div>
                  </div>
                  <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 10, padding: '10px 14px' }}>
                    <div className="text-xs text-green-600 font-semibold">Member Sales</div>
                    <div className="text-lg font-bold text-green-800">{formatCurrency(totalMember)}</div>
                  </div>
                  <div style={{ background: '#fdf4ff', border: '1.5px solid #e9d5ff', borderRadius: 10, padding: '10px 14px' }}>
                    <div className="text-xs text-purple-600 font-semibold">Rx / Prescription</div>
                    <div className="text-lg font-bold text-purple-800">{formatCurrency(totalRx)}</div>
                  </div>
                  <div style={{ background: '#fff7ed', border: '1.5px solid #fed7aa', borderRadius: 10, padding: '10px 14px' }}>
                    <div className="text-xs text-orange-600 font-semibold">Grand Total</div>
                    <div className="text-lg font-bold text-orange-800">{formatCurrency(grandTotal)}</div>
                  </div>
                </div>
                <div className="overflow-auto" style={{ maxHeight: 360 }}>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr style={{ background: '#8b0000', color: '#fff' }}>
                        <th className="px-3 py-2 text-left text-xs font-semibold">Branch</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold">Transactions</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold">Walk-in</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold">Members</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold">Rx</th>
                        <th className="px-3 py-2 text-right text-xs font-semibold">Total Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {spResults.sort((a, b) => b.totalRevenue - a.totalRevenue).map((r, i) => (
                        <tr key={r.branchId} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                          <td className="px-3 py-2 font-medium text-gray-800">{r.branchName}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{r.transactions}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{formatCurrency(r.walkinSales)}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{formatCurrency(r.memberSales)}</td>
                          <td className="px-3 py-2 text-right text-gray-600">{formatCurrency(r.prescriptionSales)}</td>
                          <td className="px-3 py-2 text-right font-bold text-gray-900">{formatCurrency(r.totalRevenue)}</td>
                        </tr>
                      ))}
                      <tr style={{ background: '#fef3c7', borderTop: '2px solid #fcd34d' }}>
                        <td className="px-3 py-2 font-bold text-gray-800">TOTAL ({spResults.length} branches)</td>
                        <td className="px-3 py-2 text-right font-bold">{totalTransactions}</td>
                        <td className="px-3 py-2 text-right font-bold">{formatCurrency(totalWalkin)}</td>
                        <td className="px-3 py-2 text-right font-bold">{formatCurrency(totalMember)}</td>
                        <td className="px-3 py-2 text-right font-bold">{formatCurrency(totalRx)}</td>
                        <td className="px-3 py-2 text-right font-bold text-orange-800">{formatCurrency(grandTotal)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={() => setShowSalesPreview(false)}>Close</Button>
          </div>
        </div>
      </Modal>

      {/* New Request Modal */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setCart([]); }} title="New Stock Request" size="xl">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {alert && <Alert type={alert.type}>{alert.msg}</Alert>}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Requesting Branch <span className="text-red-500">*</span></label>
              <select value={requestBranch} onChange={e => setRequestBranch(e.target.value)} required
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary">
                <option value="">Select branch...</option>
                {BRANCH_DETAILS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <Select label="Priority" options={[{ value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' }]} value={priority} onChange={e => setPriority(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Products <span className="font-normal text-gray-400">(search and click to add)</span></label>
            <ProductMultiCart cart={cart} onCartChange={setCart} />
          </div>
          <Textarea label="Notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Additional details..." />
          {cart.length > 0 && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '8px 14px', fontSize: '0.83rem', color: '#166534' }}>
              Ready to submit <strong>{cart.length}</strong> product{cart.length !== 1 ? 's' : ''} for <strong>{requestBranch || '—'}</strong> — priority: <strong>{priority}</strong>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={submitting || cart.length === 0 || !requestBranch}>{submitting ? 'Submitting…' : 'Submit Request'}</Button>
            <Button variant="secondary" type="button" onClick={() => { setShowForm(false); setCart([]); }}>Cancel</Button>
          </div>
        </form>
      </Modal>

      {viewOrderDispatchNote && (() => {
        const r = viewOrderDispatchNote;
        const branchName = r.requestingBranch || r.requesting_branch || '';
        const items = Array.isArray(r.items) ? r.items : [];
        const transferView = {
          id: r.requestNumber || r.id,
          created_at: r.createdAt || r.created_at,
          from_location: r.dispatch_warehouse || r.dispatchWarehouse || 'country_stock',
          to_location: branchName.toLowerCase().replace(/\s+/g, '_'),
          items: items.map(i => ({ productName: i.productName || i.productId, quantity: i.quantity, batch_no: i.batch_no })),
          status: r.status,
          dispatch_notes: r.notes,
          created_by: r.createdBy || r.created_by,
        };
        return <DispatchNote transfer={transferView} onClose={() => setViewOrderDispatchNote(null)} />;
      })()}
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
            branch: s.branch_id || s.branch || '-',
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
    const loc = l === 'windhoek_warehouse' ? 'Windhoek' : l === 'ondangwa_warehouse' ? 'Ondangwa' : 'Branches & Other';
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
                {BRANCH_DETAILS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
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
  const [branchData, setBranchData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState(branch && branch !== 'all' ? branch : 'all');
  const [viewMode, setViewMode] = useState('dashboard');
  const [productSearch, setProductSearch] = useState('');
  const [period, setPeriod] = useState(getDefaultPeriod);
  const [drillBranch, setDrillBranch] = useState(null);
  const [movTypeFilter, setMovTypeFilter] = useState('all');

  const loadData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (period.from) params.set('date_from', period.from);
    if (period.to) params.set('date_to', period.to);
    api.branch.stockSummary(params.toString())
      .then(d => setBranchData(d.branches || []))
      .catch(() => setBranchData([]))
      .finally(() => setLoading(false));
  }, [period.from, period.to]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <LoadingSpinner />;

  const fmtBranch = (b) => b ? b.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '-';
  const now = new Date();
  const periodLabel = fmtPeriodLabel(period.from, period.to);

  const allBranchSummaries = BRANCH_DETAILS.map(b => {
    const key = b.id;
    const data = branchData.find(d => d.branch_id === key);
    if (!data) return { name: b.name, key: b.id, noData: true, closingQty: 0, closingDPC: 0, closingValue: 0, products: [], movements: [], salesQty: 0, salesRevenue: 0, salesCount: 0, issued: 0, dispensedQty: 0, transferredOut: 0, transferredIn: 0, returns: 0, writeoffs: 0, expiryQty: 0, expiredQty: 0, expiringQty: 0, opening: 0, batchCount: 0, lowStockCount: 0, lastMovement: null, sourceWarehouse: null };
    const closingQty = data.closing_qty || 0;
    const closingDPC = (data.inventory || []).reduce((s, inv) => {
      const qty = Number(inv.quantity || 0);
      return s + qty * (Number(inv.unit_price || 0) || getDPCPrice(inv.product_name || inv.description || ''));
    }, 0);
    const products = [];
    const productMap = {};
    (data.inventory || []).forEach(inv => {
      const name = inv.product_name || inv.description || 'Unknown';
      const mapKey = `${name}||${inv.batch_no || ''}`;
      if (!productMap[mapKey]) productMap[mapKey] = { product_name: name, qty: 0, dpcValue: 0, batchNo: inv.batch_no || null, expiryDate: inv.expiry_date || null, expiring: false, source_warehouse: inv.source_warehouse || null };
      const qty = Number(inv.quantity || 0);
      productMap[mapKey].qty += qty;
      productMap[mapKey].dpcValue += qty * (Number(inv.unit_price || 0) || getDPCPrice(name));
      if (inv.expiry_date && new Date(inv.expiry_date) < now) productMap[mapKey].expiring = true;
    });
    Object.values(productMap).forEach(p => products.push(p));
    return {
      name: b.name, key,
      closingQty,
      closingDPC,
      closingValue: closingDPC,
      expiryQty: (data.expired_qty || 0) + (data.expiring_qty || 0),
      expiredQty: data.expired_qty || 0,
      expiringQty: data.expiring_qty || 0,
      issued: data.qty_received || 0,
      returns: data.qty_returned || 0,
      writeoffs: data.qty_written_off || 0,
      salesQty: data.qty_sold || 0,
      dispensedQty: data.qty_dispensed || 0,
      transferredOut: data.qty_transferred_out || 0,
      transferredIn: data.qty_transferred_in || 0,
      salesRevenue: data.sales_revenue || 0,
      salesCount: data.sales_count || 0,
      opening: data.opening_qty || 0,
      products,
      batchCount: (data.inventory || []).length,
      lowStockCount: data.low_stock_count || 0,
      movements: data.movements || [],
      lastMovement: data.last_movement,
      sourceWarehouse: data.source_warehouse,
    };
  }).filter(Boolean).filter(br => br.batchCount > 0 || br.salesQty > 0 || br.issued > 0 || selectedBranch !== 'all');

  const displayBranches = selectedBranch === 'all' ? allBranchSummaries : allBranchSummaries.filter(b => b.key === selectedBranch);

  const companySummary = {
    closing: allBranchSummaries.reduce((s, b) => s + b.closingQty, 0),
    closingValue: allBranchSummaries.reduce((s, b) => s + b.closingDPC, 0),
    salesQty: allBranchSummaries.reduce((s, b) => s + b.salesQty, 0),
    salesRevenue: allBranchSummaries.reduce((s, b) => s + b.salesRevenue, 0),
    issued: allBranchSummaries.reduce((s, b) => s + b.issued, 0),
    dispensed: allBranchSummaries.reduce((s, b) => s + b.dispensedQty, 0),
    returns: allBranchSummaries.reduce((s, b) => s + b.returns, 0),
    expiry: allBranchSummaries.reduce((s, b) => s + b.expiryQty, 0),
    writeoffs: allBranchSummaries.reduce((s, b) => s + b.writeoffs, 0),
  };

  const printBranchReport = (br) => {
    const win = window.open('', '_blank');
    if (!win) return;
    const pRows = br.products.map(p => `<tr><td>${p.product_name}</td><td>${p.batchNo||'-'}</td><td>${p.expiryDate?formatDate(p.expiryDate):'-'}</td><td style="font-weight:800;color:${p.qty===0?'#c41e3a':p.qty<10?'#d97706':'#166534'}">${p.qty}</td><td>${p.expiring?'<span style="color:#c41e3a;font-weight:700">Expiring</span>':'-'}</td><td>N$ ${(p.dpcValue||0).toFixed(2)}</td></tr>`).join('');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Branch Stock — ${br.name}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;padding:24px}.header{display:flex;justify-content:space-between;border-bottom:3px solid #c41e3a;padding-bottom:10px;margin-bottom:16px}.company{color:#c41e3a;font-weight:900;font-size:15px}.formula-box{border:1.5px solid #f0e8ea;border-radius:10px;padding:14px;margin-bottom:14px}.formula-row{display:flex;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #f1f5f9}.formula-label{font-weight:600;color:#374151}.formula-val{font-weight:900;font-size:14px}.closing-row{display:flex;justify-content:space-between;padding:10px 12px;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border-top:2px solid #86efac}.closing-label{font-weight:800;color:#166534;font-size:13px}.closing-val{font-weight:900;font-size:18px;color:#15803d}table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#c41e3a;color:#fff;font-weight:700;padding:6px 8px;text-align:left;font-size:10px}td{padding:5px 8px;border-bottom:1px solid #f1f5f9;font-size:10px}tr:nth-child(even) td{background:#fdf7f8}.print-btn{position:fixed;top:12px;right:12px;background:#c41e3a;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:700;cursor:pointer}@media print{.print-btn{display:none}}</style></head><body>
    <button class="print-btn" onclick="window.print()">Print</button>
    <div class="header"><div><div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div><div style="font-size:14px;font-weight:800;color:#8b0000;margin-top:4px">Branch Stock Report — ${br.name}</div><div style="color:#64748b;font-size:10px;margin-top:3px">Period: ${periodLabel}</div></div><div style="text-align:right;color:#64748b;font-size:10px;line-height:1.6">Date: ${now.toLocaleDateString('en-NA',{day:'2-digit',month:'long',year:'numeric'})}<br>Generated by: Stock Management</div></div>
    <div class="formula-box">
      <div style="font-weight:800;color:#c41e3a;font-size:13px;margin-bottom:10px;border-bottom:1px solid #fecaca;padding-bottom:6px">Stock Formula — ${periodLabel}</div>
      <div class="formula-row"><span class="formula-label">Opening Stock</span><span class="formula-val" style="color:#1e3a5f">${br.opening.toLocaleString()}</span></div>
      <div class="formula-row"><span class="formula-label">+ Issued / Received Stock</span><span class="formula-val" style="color:#166534">+${br.issued.toLocaleString()}</span></div>
      <div class="formula-row"><span class="formula-label">- Sales (units sold)</span><span class="formula-val" style="color:#c41e3a">-${br.salesQty.toLocaleString()}</span></div>
      <div class="formula-row"><span class="formula-label">- Prescription Dispensed</span><span class="formula-val" style="color:#c41e3a">-${br.dispensedQty.toLocaleString()}</span></div>
      <div class="formula-row"><span class="formula-label">- Transfers Out</span><span class="formula-val" style="color:#92400e">-${br.transferredOut.toLocaleString()}</span></div>
      <div class="formula-row"><span class="formula-label">- Write-offs</span><span class="formula-val" style="color:#c41e3a">-${br.writeoffs.toLocaleString()}</span></div>
      <div class="formula-row"><span class="formula-label">+ Returns</span><span class="formula-val" style="color:#166534">+${br.returns.toLocaleString()}</span></div>
      <div class="closing-row"><span class="closing-label">= Closing Stock</span><span class="closing-val">${br.closingQty.toLocaleString()}</span></div>
      <div style="padding:8px 12px;background:#fafafa;font-size:10px;color:#64748b;display:flex;justify-content:space-between"><span>DP Value: <strong style="color:#c41e3a">N$ ${br.closingDPC.toFixed(2)}</strong></span><span>Sales Revenue: <strong style="color:#1e3a5f">N$ ${br.salesRevenue.toFixed(2)}</strong></span></div>
    </div>
    <div style="font-size:9px;font-weight:800;color:#c41e3a;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px;border-bottom:1px solid #fecaca;padding-bottom:4px">Current Product Inventory</div>
    <table><thead><tr><th>Product</th><th>Batch</th><th>Expiry</th><th>Qty</th><th>Status</th><th>DP Value</th></tr></thead><tbody>${pRows||'<tr><td colspan="6" style="text-align:center;color:#94a3b8">No inventory on file</td></tr>'}</tbody></table>
    </body></html>`);
    win.document.close();
  };

  const printCompanyReport = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const brRows = allBranchSummaries.map(br => `<tr><td style="font-weight:700">${br.name}</td><td>${br.opening.toLocaleString()}</td><td style="color:#166534;font-weight:700">+${br.issued.toLocaleString()}</td><td style="color:#c41e3a">-${br.salesQty.toLocaleString()}</td><td style="color:#c41e3a">-${br.dispensedQty.toLocaleString()}</td><td style="color:#c41e3a">-${br.writeoffs.toLocaleString()}</td><td style="color:#92400e">+${br.returns.toLocaleString()}</td><td style="font-weight:800;color:#15803d">${br.closingQty.toLocaleString()}</td><td>N$ ${br.closingDPC.toFixed(2)}</td></tr>`).join('');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Company Stock Summary</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;padding:24px}.header{display:flex;justify-content:space-between;border-bottom:3px solid #c41e3a;padding-bottom:10px;margin-bottom:16px}.company{color:#c41e3a;font-weight:900;font-size:15px}.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}.kpi{border:1.5px solid #f0e8ea;border-radius:8px;padding:10px 12px;text-align:center}.kpi-val{font-size:18px;font-weight:900;color:#c41e3a;margin-top:4px}.kpi-label{font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase}table{width:100%;border-collapse:collapse}th{background:#c41e3a;color:#fff;font-weight:700;padding:7px 8px;text-align:left;font-size:10px}td{padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:10px}tr:nth-child(even) td{background:#fdf7f8}.total-row td{font-weight:800;background:#fff0f3!important;border-top:2px solid #fecaca}.print-btn{position:fixed;top:12px;right:12px;background:#c41e3a;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:700;cursor:pointer}@media print{.print-btn{display:none}}</style></head><body>
    <button class="print-btn" onclick="window.print()">Print</button>
    <div class="header"><div><div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div><div style="font-size:14px;font-weight:800;color:#8b0000;margin-top:4px">Company Stock Summary — All Branches</div><div style="color:#64748b;font-size:10px;margin-top:3px">Period: ${periodLabel} · ${allBranchSummaries.length} Branch(es)</div></div><div style="text-align:right;color:#64748b;font-size:10px;line-height:1.6">Date: ${now.toLocaleDateString('en-NA',{day:'2-digit',month:'long',year:'numeric'})}<br>Generated by: Stock Management</div></div>
    <div class="kpi-grid"><div class="kpi"><div class="kpi-label">Total Closing Stock</div><div class="kpi-val">${companySummary.closing.toLocaleString()}</div></div><div class="kpi"><div class="kpi-label">DP Stock Value</div><div class="kpi-val">N$ ${companySummary.closingValue.toFixed(0)}</div></div><div class="kpi"><div class="kpi-label">Total Sales (units)</div><div class="kpi-val">${companySummary.salesQty.toLocaleString()}</div></div><div class="kpi"><div class="kpi-label">Total Sales Revenue</div><div class="kpi-val">N$ ${companySummary.salesRevenue.toFixed(0)}</div></div></div>
    <table><thead><tr><th>Branch</th><th>Opening</th><th>Received</th><th>Sales</th><th>Dispensed</th><th>Write-offs</th><th>Returns</th><th>Closing</th><th>DP Value</th></tr></thead>
    <tbody>${brRows}
    <tr class="total-row"><td><strong>COMPANY TOTAL</strong></td><td>-</td><td><strong style="color:#166534">${companySummary.issued.toLocaleString()}</strong></td><td><strong style="color:#c41e3a">${companySummary.salesQty.toLocaleString()}</strong></td><td><strong style="color:#c41e3a">${companySummary.dispensed.toLocaleString()}</strong></td><td><strong style="color:#c41e3a">${companySummary.writeoffs.toLocaleString()}</strong></td><td><strong style="color:#166534">${companySummary.returns.toLocaleString()}</strong></td><td><strong style="color:#15803d">${companySummary.closing.toLocaleString()}</strong></td><td><strong>N$ ${companySummary.closingValue.toFixed(2)}</strong></td></tr>
    </tbody></table></body></html>`);
    win.document.close();
  };

  if (drillBranch) {
    const br = allBranchSummaries.find(b => b.key === drillBranch);
    if (!br) { setDrillBranch(null); return null; }
    const movTypes = [...new Set((br.movements || []).map(m => m.movement_type))];
    const filteredMovements = movTypeFilter === 'all' ? (br.movements || []) : (br.movements || []).filter(m => m.movement_type === movTypeFilter);
    const filteredProducts = productSearch ? br.products.filter(p => p.product_name.toLowerCase().includes(productSearch.toLowerCase())) : br.products;
    const movTypeBadge = (t) => {
      const map = { transfer_in: { label: 'Received', bg: '#dcfce7', color: '#166534' }, received: { label: 'Received', bg: '#dcfce7', color: '#166534' }, receive: { label: 'Received', bg: '#dcfce7', color: '#166534' }, transfer_out: { label: 'Transfer Out', bg: '#fef2f2', color: '#c41e3a' }, sale: { label: 'Sale', bg: '#fef3c7', color: '#92400e' }, walk_in_member_sale: { label: 'Member Sale', bg: '#fef3c7', color: '#92400e' }, walk_in_non_member_sale: { label: 'Non-member Sale', bg: '#fef3c7', color: '#92400e' }, prescription_dispense: { label: 'Rx Dispense', bg: '#ede9fe', color: '#6d28d9' }, dispense: { label: 'Dispense', bg: '#ede9fe', color: '#6d28d9' }, write_off: { label: 'Write-off', bg: '#fef2f2', color: '#c41e3a' }, return: { label: 'Return', bg: '#e0e7ff', color: '#3730a3' }, reserved: { label: 'Reserved', bg: '#f1f5f9', color: '#475569' } };
      const m = map[t] || { label: (t || '-').replace(/_/g, ' '), bg: '#f1f5f9', color: '#475569' };
      return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: '0.7rem', fontWeight: 700, background: m.bg, color: m.color }}>{m.label}</span>;
    };
    return (
      <div>
        <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', borderRadius: 14, padding: '16px 20px', marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <button onClick={() => { setDrillBranch(null); setProductSearch(''); setMovTypeFilter('all'); }} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '4px 12px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', marginBottom: 6 }}>Back to Dashboard</button>
            <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800, margin: '3px 0 0' }}>{br.name} — Detailed Stock View</h3>
            <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.78rem', margin: '3px 0 0' }}>Branch inventory, movements, and stock formula · {periodLabel}</p>
          </div>
          <button onClick={() => printBranchReport(br)} style={{ background: '#fff', border: 'none', color: '#c41e3a', padding: '7px 14px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer' }}>Print Branch Report</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 8, marginBottom: 16 }}>
          {[
            ['Opening', br.opening, '#1e3a5f'], ['+ Received', br.issued, '#166534'], ['- Sales', br.salesQty, '#c41e3a'],
            ['- Dispensed', br.dispensedQty, '#6d28d9'], ['- Trf Out', br.transferredOut, '#92400e'], ['- Write-offs', br.writeoffs, '#c41e3a'],
            ['+ Returns', br.returns, '#166534'], ['= Closing', br.closingQty, '#15803d'], ['DP Value', `N$${Math.round(br.closingDPC).toLocaleString()}`, '#c41e3a'],
            ['Low Stock', br.lowStockCount, br.lowStockCount > 0 ? '#d97706' : '#166534'], ['Expiring', br.expiringQty || 0, br.expiringQty > 0 ? '#d97706' : '#166534'], ['Expired', br.expiredQty || 0, br.expiredQty > 0 ? '#c41e3a' : '#166534'],
          ].map(([l, v, c]) => (
            <div key={l} style={{ background: '#fff', border: '1.5px solid #f0e8ea', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em' }}>{l}</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 900, color: c, marginTop: 2 }}>{typeof v === 'number' ? v.toLocaleString() : v}</div>
            </div>
          ))}
        </div>

        <div style={{ background: '#fff', border: '1.5px solid #f0e8ea', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '12px 16px', borderBottom: '2px solid #fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h4 style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.9rem', margin: 0 }}>Product Inventory — {br.name}</h4>
            <input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search products..." style={{ padding: '6px 12px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.82rem', outline: 'none', width: 220 }} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: '#c41e3a' }}>
                  {['Product', 'Batch', 'Expiry', 'Qty', 'Status', 'DP Unit', 'DP Total', 'Source'].map(h => (
                    <th key={h} style={{ padding: '8px 10px', color: '#fff', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 && <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No products found</td></tr>}
                {filteredProducts.map((p, i) => {
                  const dpUnit = getDPCPrice(p.product_name);
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fdf8f8', borderBottom: '1px solid #f5f0f0' }}>
                      <td style={{ padding: '7px 10px', fontWeight: 600, color: '#1e293b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.product_name}>{p.product_name}</td>
                      <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: '#6b7280', fontSize: '0.74rem' }}>{p.batchNo || '-'}</td>
                      <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: p.expiring ? '#c41e3a' : '#6b7280', fontWeight: p.expiring ? 700 : 400, fontSize: '0.74rem' }}>{p.expiryDate ? formatDate(p.expiryDate) : '-'}{p.expiring ? ' (EXP)' : ''}</td>
                      <td style={{ padding: '7px 10px', fontWeight: 800, color: p.qty === 0 ? '#c41e3a' : p.qty < 5 ? '#d97706' : '#166534', textAlign: 'right' }}>{p.qty}</td>
                      <td style={{ padding: '7px 10px' }}>{p.qty === 0 ? <span style={{ color: '#c41e3a', fontWeight: 700 }}>Out</span> : p.qty < 5 ? <span style={{ color: '#d97706', fontWeight: 700 }}>Low</span> : <span style={{ color: '#166534', fontWeight: 600 }}>OK</span>}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', color: '#374151' }}>N$ {dpUnit.toFixed(2)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#c41e3a' }}>N$ {(p.qty * dpUnit).toFixed(2)}</td>
                      <td style={{ padding: '7px 10px', color: '#6b7280', fontSize: '0.74rem' }}>{p.source_warehouse ? fmtBranch(p.source_warehouse) : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ background: '#fff', border: '1.5px solid #f0e8ea', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '2px solid #fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h4 style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.9rem', margin: 0 }}>Movement Ledger — {br.name} ({filteredMovements.length})</h4>
            <select value={movTypeFilter} onChange={e => setMovTypeFilter(e.target.value)} style={{ padding: '5px 10px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.82rem', outline: 'none' }}>
              <option value="all">All Types</option>
              {movTypes.map(t => <option key={t} value={t}>{(t || '').replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
              <thead>
                <tr style={{ background: '#c41e3a' }}>
                  {['Date', 'Product', 'Batch', 'Expiry', 'Type', 'Qty', 'DP Value', 'From', 'To', 'Reference', 'Staff', 'Notes'].map(h => (
                    <th key={h} style={{ padding: '7px 8px', color: '#fff', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMovements.length === 0 && <tr><td colSpan={12} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No movements recorded</td></tr>}
                {filteredMovements.map((m, i) => {
                  const isOut = ['sale', 'transfer_out', 'write_off', 'dispense', 'prescription_dispense', 'field_use'].some(t => (m.movement_type || '').toLowerCase().includes(t));
                  const dpUnit = getDPCPrice(m.product_name || '');
                  const qty = Math.abs(Number(m.quantity || 0));
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fdf8f8', borderBottom: '1px solid #f5f0f0' }}>
                      <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', color: '#6b7280', fontSize: '0.74rem' }}>{m.created_at ? formatDateTime(m.created_at) : '-'}</td>
                      <td style={{ padding: '6px 8px', fontWeight: 600, color: '#1e293b', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.product_name || '-'}</td>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#6b7280', fontSize: '0.72rem' }}>{m.batch_no || '-'}</td>
                      <td style={{ padding: '6px 8px', color: '#6b7280', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{m.expiry_date ? formatDate(m.expiry_date) : '-'}</td>
                      <td style={{ padding: '6px 8px' }}>{movTypeBadge(m.movement_type)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: isOut ? '#c41e3a' : '#166534' }}>{isOut ? '-' : '+'}{qty}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: dpUnit > 0 ? '#1e293b' : '#94a3b8', fontWeight: 600 }}>{dpUnit > 0 ? `N$ ${(qty * dpUnit).toFixed(2)}` : '-'}</td>
                      <td style={{ padding: '6px 8px', color: '#6b7280', fontSize: '0.72rem' }}>{m.source_location ? fmtBranch(m.source_location) : '-'}</td>
                      <td style={{ padding: '6px 8px', color: '#6b7280', fontSize: '0.72rem' }}>{m.destination_location ? fmtBranch(m.destination_location) : '-'}</td>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#6b7280', fontSize: '0.7rem' }}>{m.reference_id || '-'}</td>
                      <td style={{ padding: '6px 8px', color: '#6b7280', fontSize: '0.72rem' }}>{m.created_by || '-'}</td>
                      <td style={{ padding: '6px 8px', color: '#6b7280', fontSize: '0.72rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.notes || ''}>{m.notes || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', borderRadius: 14, padding: '16px 20px', marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.12em', margin: 0 }}>Stock Management · Branch View</p>
          <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800, margin: '3px 0 0' }}>Per-Branch Stock Dashboard</h3>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.78rem', margin: '3px 0 0' }}>Live stock balances per shop · {periodLabel}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={loadData} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', padding: '7px 14px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>Refresh</button>
          <button onClick={printCompanyReport} style={{ background: '#fff', border: 'none', color: '#c41e3a', padding: '7px 14px', borderRadius: 20, fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer' }}>Company Report PDF</button>
        </div>
      </div>

      <PeriodFilter period={period} onChange={setPeriod} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 10, marginBottom: 18 }}>
        {[
          ['Total Branches', allBranchSummaries.length, '#1e3a5f', '#f4f7fb'],
          ['Closing Stock', companySummary.closing.toLocaleString(), '#15803d', '#f0fdf4'],
          ['DP Stock Value', `N$${Math.round(companySummary.closingValue).toLocaleString()}`, '#c41e3a', '#fff0f3'],
          ['Sales (units)', companySummary.salesQty.toLocaleString(), '#c41e3a', '#fef2f2'],
          ['Dispensed', companySummary.dispensed.toLocaleString(), '#6d28d9', '#f5f3ff'],
          ['Sales Revenue', `N$${Math.round(companySummary.salesRevenue).toLocaleString()}`, '#166534', '#f0fdf4'],
          ['Write-offs', companySummary.writeoffs.toLocaleString(), companySummary.writeoffs > 0 ? '#c41e3a' : '#166534', '#fef2f2'],
          ['Expiring', companySummary.expiry.toLocaleString(), companySummary.expiry > 0 ? '#c41e3a' : '#166534', '#fef2f2'],
        ].map(([l, v, col, bg]) => (
          <div key={l} style={{ background: bg, border: '1.5px solid #f0e8ea', borderRadius: 12, padding: '10px 12px', textAlign: 'center' }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em' }}>{l}</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 900, color: col, marginTop: 3 }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {[{ id: 'dashboard', label: 'Dashboard' }, { id: 'products', label: 'Products' }, { id: 'movements', label: 'Movement Ledger' }].map(v => (
          <button key={v.id} onClick={() => setViewMode(v.id)} style={{ padding: '7px 18px', borderRadius: 20, fontSize: '0.83rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: viewMode === v.id ? '#c41e3a' : '#f1f5f9', color: viewMode === v.id ? '#fff' : '#64748b' }}>{v.label}</button>
        ))}
        <select value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)} style={{ marginLeft: 'auto', padding: '7px 12px', border: '1.5px solid #e8d5d8', borderRadius: 20, fontSize: '0.83rem', outline: 'none', color: '#374151', fontWeight: 600 }}>
          <option value="all">All Branches</option>
          {BRANCH_DETAILS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {viewMode === 'dashboard' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 14 }}>
          {displayBranches.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🏪</div>
              <p style={{ fontWeight: 600 }}>No branch stock data available</p>
              <p style={{ fontSize: '0.82rem', marginTop: 6 }}>Stock data appears here once inventory is loaded into branches via transfers from the warehouse</p>
            </div>
          )}
          {displayBranches.map(br => (
            <div key={br.key} style={{ background: '#fff', border: '1.5px solid #f0e8ea', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(196,30,58,0.06)', cursor: 'pointer' }} onClick={() => setDrillBranch(br.key)}>
              <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem' }}>{br.name}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.72rem' }}>{br.products.length} products</span>
                  <button onClick={(e) => { e.stopPropagation(); printBranchReport(br); }} style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', padding: '4px 10px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>Print</button>
                </div>
              </div>
              <div>
                {[
                  ['Opening Stock', br.opening, '#1e3a5f'],
                  ['+ Received / Issued', br.issued, '#166534'],
                  ['- Sales (units)', br.salesQty, '#c41e3a'],
                  ['- Prescription Dispensed', br.dispensedQty, '#6d28d9'],
                  ['- Transfers Out', br.transferredOut, '#92400e'],
                  ['- Write-offs', br.writeoffs, '#c41e3a'],
                  ['+ Returns', br.returns, '#166534'],
                ].map(([label, val, color]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 16px', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: '0.8rem', color: '#374151', fontWeight: 600 }}>{label}</span>
                    <span style={{ fontSize: '0.92rem', fontWeight: 800, color }}>{Number(val || 0).toLocaleString()}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', borderTop: '2px solid #86efac' }}>
                  <span style={{ fontSize: '0.88rem', color: '#166534', fontWeight: 800 }}>= Closing Stock</span>
                  <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#15803d' }}>{br.closingQty.toLocaleString()}</span>
                </div>
                <div style={{ padding: '8px 16px', background: '#fafafa', display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 4, fontSize: '0.72rem', color: '#64748b' }}>
                  <span>DP Value: <strong style={{ color: '#c41e3a' }}>N$ {br.closingDPC.toFixed(2)}</strong></span>
                  <span>Revenue: <strong style={{ color: '#166534' }}>N$ {br.salesRevenue.toFixed(2)}</strong></span>
                  <span>Sales: <strong style={{ color: '#c41e3a' }}>{br.salesQty} units</strong></span>
                  <span>Dispensed: <strong style={{ color: '#6d28d9' }}>{br.dispensedQty} units</strong></span>
                </div>
                {(br.expiryQty > 0 || br.lowStockCount > 0) && (
                  <div style={{ padding: '6px 16px', background: '#fff0f3', borderTop: '1px solid #fecaca', fontSize: '0.73rem', color: '#c41e3a', fontWeight: 700, display: 'flex', gap: 12 }}>
                    {br.expiryQty > 0 && <span>{br.expiryQty} expiring/expired</span>}
                    {br.lowStockCount > 0 && <span style={{ color: '#d97706' }}>{br.lowStockCount} low stock</span>}
                  </div>
                )}
                {br.lastMovement && (
                  <div style={{ padding: '4px 16px 6px', background: '#f8fafc', fontSize: '0.68rem', color: '#94a3b8' }}>
                    Last movement: {formatDateTime(br.lastMovement)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {viewMode === 'movements' && (
        <div style={{ background: '#fff', border: '1.5px solid #f0e8ea', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '2px solid #fecaca', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <h4 style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.9rem', margin: 0 }}>All Branch Movements</h4>
            <input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search product..." style={{ padding: '6px 12px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.82rem', outline: 'none', width: 200 }} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
              <thead>
                <tr style={{ background: '#c41e3a' }}>
                  {['Date', 'Branch', 'Product', 'Batch', 'Expiry', 'Type', 'Qty', 'DP Value', 'From', 'To', 'Ref', 'Staff'].map(h => (
                    <th key={h} style={{ padding: '7px 8px', color: '#fff', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const allMovs = displayBranches.flatMap(br => (br.movements || []).map(m => ({ ...m, _branch: br.name })));
                  const filtMovs = productSearch ? allMovs.filter(m => (m.product_name || '').toLowerCase().includes(productSearch.toLowerCase())) : allMovs;
                  if (filtMovs.length === 0) return <tr><td colSpan={12} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No movements found</td></tr>;
                  return filtMovs.slice(0, 200).map((m, i) => {
                    const isOut = ['sale', 'transfer_out', 'write_off', 'dispense', 'prescription_dispense', 'field_use'].some(t => (m.movement_type || '').includes(t));
                    const dpUnit = getDPCPrice(m.product_name || '');
                    const qty = Math.abs(Number(m.quantity || 0));
                    const tMap = { transfer_in: 'Received', received: 'Received', receive: 'Received', transfer_out: 'Transfer Out', sale: 'Sale', walk_in_member_sale: 'Member Sale', walk_in_non_member_sale: 'Non-member Sale', prescription_dispense: 'Rx Dispense', dispense: 'Dispense', write_off: 'Write-off', return: 'Return', reserved: 'Reserved' };
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fdf8f8', borderBottom: '1px solid #f5f0f0' }}>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', color: '#6b7280', fontSize: '0.72rem' }}>{m.created_at ? formatDateTime(m.created_at) : '-'}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 700, color: '#1e293b', fontSize: '0.74rem' }}>{m._branch}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 600, color: '#1e293b', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.product_name || '-'}</td>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#6b7280', fontSize: '0.72rem' }}>{m.batch_no || '-'}</td>
                        <td style={{ padding: '6px 8px', color: '#6b7280', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{m.expiry_date ? formatDate(m.expiry_date) : '-'}</td>
                        <td style={{ padding: '6px 8px' }}><span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 10, fontSize: '0.68rem', fontWeight: 700, background: isOut ? '#fef2f2' : '#dcfce7', color: isOut ? '#c41e3a' : '#166534' }}>{tMap[m.movement_type] || (m.movement_type || '-').replace(/_/g, ' ')}</span></td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: isOut ? '#c41e3a' : '#166534' }}>{isOut ? '-' : '+'}{qty}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#374151', fontWeight: 600 }}>{dpUnit > 0 ? `N$ ${(qty * dpUnit).toFixed(2)}` : '-'}</td>
                        <td style={{ padding: '6px 8px', color: '#6b7280', fontSize: '0.72rem' }}>{m.source_location ? fmtBranch(m.source_location) : '-'}</td>
                        <td style={{ padding: '6px 8px', color: '#6b7280', fontSize: '0.72rem' }}>{m.destination_location ? fmtBranch(m.destination_location) : '-'}</td>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#6b7280', fontSize: '0.68rem' }}>{m.reference_id || '-'}</td>
                        <td style={{ padding: '6px 8px', color: '#6b7280', fontSize: '0.72rem' }}>{m.created_by || '-'}</td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode === 'products' && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h3 className="font-bold text-gray-800">Product Stock by Branch</h3>
              <Button size="sm" variant="secondary" onClick={() => {
                const allProds = displayBranches.flatMap(br => br.products.map(p => ({ ...p, branch: br.name })));
                const rows = allProds.map(p => { const dpU = getDPCPrice(p.product_name); return `<tr><td>${p.product_name}</td><td>${p.branch}</td><td>${p.batchNo||'-'}</td><td>${p.expiryDate?formatDate(p.expiryDate):'-'}</td><td style="font-weight:800;color:${p.qty===0?'#c41e3a':p.qty<10?'#d97706':'#166534'}">${p.qty}</td><td>${p.expiring?'<span style="color:#c41e3a">Expiring</span>':'-'}</td><td>N$ ${dpU.toFixed(2)}</td><td>N$ ${(p.qty*dpU).toFixed(2)}</td></tr>`; }).join('');
                printDocument('Per-Branch Product Stock', `<table><thead><tr><th>Product</th><th>Branch</th><th>Batch</th><th>Expiry</th><th>Qty</th><th>Status</th><th>DP Unit</th><th>DP Value</th></tr></thead><tbody>${rows}</tbody></table>`, true);
              }}><Printer size={14} /> Print</Button>
            </div>
          </CardHeader>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
            <input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search products…" style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <Table
            columns={[
              { header: 'Product', render: r => <span className="font-semibold text-xs">{r.product_name}</span> },
              { header: 'Branch', render: r => <Badge variant="info">{r.branch}</Badge> },
              { header: 'Batch', render: r => <span className="text-xs font-mono">{r.batchNo || '-'}</span> },
              { header: 'Expiry', render: r => {
                if (!r.expiryDate) return '-';
                const exp = new Date(r.expiryDate);
                const daysLeft = Math.ceil((exp - new Date()) / 86400000);
                return <span style={{ color: daysLeft < 0 ? '#c41e3a' : daysLeft < 90 ? '#d97706' : '#166534', fontWeight: 700, fontSize: '0.78rem' }}>{formatDate(r.expiryDate)}{daysLeft < 0 ? ' (EXPIRED)' : daysLeft < 90 ? ` (${daysLeft}d)` : ''}</span>;
              }},
              { header: 'Qty', render: r => <span style={{ fontWeight: 800, color: r.qty === 0 ? '#c41e3a' : r.qty < 10 ? '#d97706' : '#166534' }}>{r.qty}</span> },
              { header: 'Status', render: r => r.qty === 0 ? <Badge variant="danger">Out of Stock</Badge> : r.qty < 10 ? <Badge variant="warning">Low</Badge> : <Badge variant="success">OK</Badge> },
              { header: 'DP Unit', render: r => <span className="text-xs">N$ {getDPCPrice(r.product_name).toFixed(2)}</span> },
              { header: 'DP Value', render: r => <span className="text-xs font-semibold" style={{ color: '#c41e3a' }}>N$ {(r.qty * getDPCPrice(r.product_name)).toFixed(2)}</span> },
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
  const [branchData, setBranchData] = useState([]);
  const [batches, setBatches] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState(branch && branch !== 'all' ? branch : 'all');
  const [misReport, setMisReport] = useState(null);
  const [period, setPeriod] = useState(getDefaultPeriod);

  const loadData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (period.from) params.set('date_from', period.from);
    if (period.to) params.set('date_to', period.to);
    Promise.all([
      api.branch.stockSummary(params.toString()).then(d => d.branches || []).catch(() => []),
      api.stock.batches().then(d => Array.isArray(d) ? d : d.batches || []).catch(() => []),
      api.mis.stockReport().catch(() => null),
      api.stock.movements().then(d => Array.isArray(d) ? d : d.movements || []).catch(() => []),
    ]).then(([bd, b, mis, m]) => {
      setBranchData(bd);
      setBatches(b);
      setMisReport(mis);
      setMovements(m);
    }).finally(() => setLoading(false));
  }, [period.from, period.to]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <LoadingSpinner />;

  const now = new Date();
  const periodLabel = fmtPeriodLabel(period.from, period.to);
  const periodStart = period.from ? new Date(period.from) : new Date(0);
  const periodEnd = period.to ? new Date(period.to + 'T23:59:59') : new Date('2099-12-31');

  const branchReports = BRANCH_DETAILS.map(br => {
    const key = br.id;
    const b = br.name;
    const data = branchData.find(d => d.branch_id === key);
    if (!data) return { name: b, key, formula: { opening: 0, issued: 0, returns: 0, expiryQty: 0, dispensed: 0, writeoffs: 0, promotions: 0, closing: 0, closingValue: 0, closingDPC: 0, salesQty: 0, salesRevenue: 0 } };
    const closingDPC = (data.inventory || []).reduce((s, inv) => {
      const qty = Number(inv.quantity || 0);
      return s + qty * (Number(inv.unit_price || 0) || getDPCPrice(inv.product_name || ''));
    }, 0);
    return {
      name: b, key,
      formula: {
        opening: data.opening_qty || 0,
        issued: data.qty_received || 0,
        returns: data.qty_returned || 0,
        expiryQty: (data.expired_qty || 0) + (data.expiring_qty || 0),
        dispensed: data.qty_dispensed || 0,
        writeoffs: data.qty_written_off || 0,
        promotions: 0,
        closing: data.closing_qty || 0,
        closingValue: closingDPC,
        closingDPC,
        salesQty: data.qty_sold || 0,
        salesRevenue: data.sales_revenue || 0,
      }
    };
  });

  const displayReports = selectedBranch === 'all' ? branchReports : branchReports.filter(r => r.key === selectedBranch);

  const companySummary = {
    opening: branchReports.reduce((s, r) => s + r.formula.opening, 0),
    issued: branchReports.reduce((s, r) => s + r.formula.issued, 0),
    returns: branchReports.reduce((s, r) => s + r.formula.returns, 0),
    expiryQty: branchReports.reduce((s, r) => s + r.formula.expiryQty, 0),
    dispensed: branchReports.reduce((s, r) => s + r.formula.dispensed, 0),
    writeoffs: branchReports.reduce((s, r) => s + r.formula.writeoffs, 0),
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
          {BRANCH_DETAILS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
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

      {/* Expiry Report */}
      <Card style={{ marginTop: 18 }}>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">Expiry & Shelf-Life Report</h3>
            <Button size="sm" variant="secondary" onClick={() => {
              const expiringBatches = batches.filter(b => b.expiry_date).sort((a,b) => new Date(a.expiry_date) - new Date(b.expiry_date));
              const rows = expiringBatches.map(b => {
                const exp = new Date(b.expiry_date);
                const daysLeft = Math.ceil((exp - now) / 86400000);
                const status = daysLeft < 0 ? 'EXPIRED' : daysLeft < 30 ? 'CRITICAL' : daysLeft < 90 ? 'WARNING' : 'OK';
                return `<tr><td>${b.description || b.product_name || ''}</td><td>${b.batch_no || b.batch_number || '-'}</td><td>${fmtLocation(b.location)}</td><td>${Number(b.remaining_quantity || b.quantity || 0)}</td><td style="color:${daysLeft<0?'#c41e3a':daysLeft<90?'#d97706':'#166534'};font-weight:700">${formatDate(b.expiry_date)}</td><td style="font-weight:700;color:${daysLeft<0?'#c41e3a':daysLeft<90?'#d97706':'#166534'}">${daysLeft < 0 ? daysLeft + 'd (EXPIRED)' : daysLeft + 'd'}</td><td style="font-weight:700;color:${status==='EXPIRED'?'#c41e3a':status==='CRITICAL'?'#dc2626':status==='WARNING'?'#d97706':'#166534'}">${status}</td></tr>`;
              }).join('');
              printDocument('Expiry & Shelf-Life Report', `<table><thead><tr><th>Product</th><th>Batch</th><th>Location</th><th>Qty</th><th>Expiry Date</th><th>Days Left</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`);
            }}><Printer size={14} /> Print Expiry Report</Button>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Product', render: r => <span className="text-xs font-semibold">{r.description || r.product_name}</span> },
            { header: 'Batch', render: r => <span className="text-xs font-mono">{r.batch_no || r.batch_number || '-'}</span> },
            { header: 'Location', render: r => <span className="text-xs">{fmtLocation(r.location)}</span> },
            { header: 'Qty', render: r => <span className="font-semibold">{Number(r.remaining_quantity || r.quantity || 0)}</span> },
            { header: 'Expiry', render: r => {
              const exp = new Date(r.expiry_date);
              const d = Math.ceil((exp - now) / 86400000);
              return <span style={{ color: d < 0 ? '#c41e3a' : d < 90 ? '#d97706' : '#166534', fontWeight: 700, fontSize: '0.78rem' }}>{formatDate(r.expiry_date)}</span>;
            }},
            { header: 'Days Left', render: r => {
              const d = Math.ceil((new Date(r.expiry_date) - now) / 86400000);
              return <span style={{ fontWeight: 800, color: d < 0 ? '#c41e3a' : d < 30 ? '#dc2626' : d < 90 ? '#d97706' : '#166534' }}>{d < 0 ? `${d}d (EXPIRED)` : `${d}d`}</span>;
            }},
            { header: 'Status', render: r => {
              const d = Math.ceil((new Date(r.expiry_date) - now) / 86400000);
              return d < 0 ? <Badge variant="danger">EXPIRED</Badge> : d < 30 ? <Badge variant="danger">CRITICAL</Badge> : d < 90 ? <Badge variant="warning">WARNING</Badge> : <Badge variant="success">OK</Badge>;
            }},
          ]}
          data={batches.filter(b => b.expiry_date).sort((a,b) => new Date(a.expiry_date) - new Date(b.expiry_date))}
          emptyMessage="No batches with expiry dates found"
        />
      </Card>

      {/* Stock Valuation Report */}
      <Card style={{ marginTop: 18 }}>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">Stock Valuation Report (CIF & DPC)</h3>
            <Button size="sm" variant="secondary" onClick={() => {
              const locGroups = {};
              batches.forEach(b => {
                const loc = b.location || 'unknown';
                if (!locGroups[loc]) locGroups[loc] = { qty: 0, cif: 0, dpc: 0 };
                const qty = Number(b.remaining_quantity || b.quantity || 0);
                locGroups[loc].qty += qty;
                locGroups[loc].cif += qty * Number(b.cif_unit_cost || b.unit_price || 0);
                locGroups[loc].dpc += qty * (Number(b.dpc_unit_value || 0) || getDPCPrice(b.description || b.product_name || ''));
              });
              const rows = Object.entries(locGroups).map(([loc, d]) => `<tr><td style="font-weight:700">${fmtLocation(loc)}</td><td>${d.qty.toLocaleString()}</td><td>N$ ${d.cif.toFixed(2)}</td><td>N$ ${d.dpc.toFixed(2)}</td><td>N$ ${(d.dpc - d.cif).toFixed(2)}</td></tr>`).join('');
              const totals = Object.values(locGroups).reduce((s,d) => ({ qty: s.qty+d.qty, cif: s.cif+d.cif, dpc: s.dpc+d.dpc }), { qty:0, cif:0, dpc:0 });
              printDocument('Stock Valuation Report', `<table><thead><tr><th>Location</th><th>Total Qty</th><th>CIF Value</th><th>DPC Value</th><th>Margin</th></tr></thead><tbody>${rows}<tr class="total-row" style="font-weight:800;background:#fff0f3;border-top:2px solid #fecaca"><td>TOTAL</td><td>${totals.qty.toLocaleString()}</td><td>N$ ${totals.cif.toFixed(2)}</td><td>N$ ${totals.dpc.toFixed(2)}</td><td>N$ ${(totals.dpc-totals.cif).toFixed(2)}</td></tr></tbody></table>`);
            }}><Printer size={14} /> Print Valuation Report</Button>
          </div>
        </CardHeader>
        {(() => {
          const locGroups = {};
          batches.forEach(b => {
            const loc = b.location || 'unknown';
            if (!locGroups[loc]) locGroups[loc] = { location: loc, qty: 0, cif: 0, dpc: 0 };
            const qty = Number(b.remaining_quantity || b.quantity || 0);
            locGroups[loc].qty += qty;
            locGroups[loc].cif += qty * Number(b.cif_unit_cost || b.unit_price || 0);
            locGroups[loc].dpc += qty * (Number(b.dpc_unit_value || 0) || getDPCPrice(b.description || b.product_name || ''));
          });
          const valData = Object.values(locGroups);
          const totals = valData.reduce((s,d) => ({ qty: s.qty+d.qty, cif: s.cif+d.cif, dpc: s.dpc+d.dpc }), { qty:0, cif:0, dpc:0 });
          return (<>
            <Table
              columns={[
                { header: 'Location', render: r => <span className="font-bold text-sm">{fmtLocation(r.location)}</span> },
                { header: 'Total Qty', render: r => <span className="font-semibold">{r.qty.toLocaleString()}</span> },
                { header: 'CIF Value', render: r => <span className="text-xs">N$ {r.cif.toFixed(2)}</span> },
                { header: 'DPC Value', render: r => <span className="text-xs font-semibold" style={{ color: '#c41e3a' }}>N$ {r.dpc.toFixed(2)}</span> },
                { header: 'Margin', render: r => <span className="text-xs font-semibold" style={{ color: (r.dpc - r.cif) > 0 ? '#166534' : '#c41e3a' }}>N$ {(r.dpc - r.cif).toFixed(2)}</span> },
              ]}
              data={valData}
              emptyMessage="No stock data"
            />
            <div style={{ padding: '10px 16px', background: '#fff0f3', borderTop: '2px solid #fecaca', display: 'flex', gap: 24, fontSize: '0.82rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, color: '#c41e3a' }}>TOTAL</span>
              <span>Qty: <strong>{totals.qty.toLocaleString()}</strong></span>
              <span>CIF: <strong>N$ {totals.cif.toFixed(2)}</strong></span>
              <span>DPC: <strong style={{ color: '#c41e3a' }}>N$ {totals.dpc.toFixed(2)}</strong></span>
              <span>Margin: <strong style={{ color: '#166534' }}>N$ {(totals.dpc - totals.cif).toFixed(2)}</strong></span>
            </div>
          </>);
        })()}
      </Card>

      {/* Movement Log Report */}
      <Card style={{ marginTop: 18 }}>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">Stock Movement Log</h3>
            <Button size="sm" variant="secondary" onClick={() => {
              const periodMoves = movements.filter(m => m.created_at && new Date(m.created_at) >= periodStart && new Date(m.created_at) <= periodEnd)
                .sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
              const rows = periodMoves.map(m => `<tr><td>${formatDateTime(m.created_at)}</td><td>${m.product_name||''}</td><td>${(m.movement_type||'').replace(/_/g,' ')}</td><td>${m.quantity||0}</td><td>${fmtLocation(m.source_location||m.location||'')}</td><td>${fmtLocation(m.destination_location||'')}</td><td>${m.reference_id||m.reference||'-'}</td><td>${m.recorded_by||m.created_by||'-'}</td></tr>`).join('');
              printDocument(`Stock Movement Log — ${periodLabel}`, `<table><thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>From</th><th>To</th><th>Reference</th><th>By</th></tr></thead><tbody>${rows}</tbody></table>`);
            }}><Printer size={14} /> Print Movement Log</Button>
          </div>
        </CardHeader>
        <Table
          columns={[
            { header: 'Date', render: r => formatDateTime(r.created_at) },
            { header: 'Product', render: r => <span className="text-xs">{r.product_name || ''}</span> },
            { header: 'Batch', render: r => <span className="text-xs font-mono">{r.batch_no || r.batchNo || '—'}</span> },
            { header: 'Expiry', render: r => <span className="text-xs">{(r.expiry_date || r.expiryDate) ? formatDate(r.expiry_date || r.expiryDate) : '—'}</span> },
            { header: 'Type', render: r => <Badge variant={
              ['in','received','import_received','transfer_in'].includes(r.movement_type) ? 'success' :
              ['out','dispatched','transfer_out','field_issue'].includes(r.movement_type) ? 'danger' : 'warning'
            }>{(r.movement_type || '-').replace(/_/g, ' ')}</Badge> },
            { header: 'Qty', render: r => <span className="font-semibold">{r.quantity}</span> },
            { header: 'DP Value', render: r => <span className="text-xs font-semibold">{formatCurrency(Number(r.quantity || 0) * (Number(r.dpc_unit_value || 0) || getDPCPrice(r.product_name || '')))}</span> },
            { header: 'From', render: r => <span className="text-xs">{fmtLocation(r.source_location || r.location || '')}</span> },
            { header: 'To', render: r => <span className="text-xs">{fmtLocation(r.destination_location || '')}</span> },
            { header: 'Ref', render: r => <span className="text-xs text-gray-500">{r.reference_id || r.reference || '-'}</span> },
          ]}
          data={movements.filter(m => m.created_at && new Date(m.created_at) >= periodStart && new Date(m.created_at) <= periodEnd).sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 100)}
          emptyMessage="No movements in selected period"
        />
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

// ── Stock Campaigns Tab ────────────────────────────────────────────────────────
const CAMP_TYPES = [
  { value: 'discount', label: '🏷️ Discount', desc: 'Percentage off on selected products' },
  { value: 'buy_x_get_y', label: '🎁 Buy X Get Y', desc: 'Purchase N and get M free' },
  { value: 'bv_achievement', label: '🏆 BV Achievement', desc: 'Prizes for accumulating BV points' },
  { value: 'elite_bingo', label: '🎯 Elite Bingo', desc: 'Recruit + maintain BV target' },
  { value: 'custom', label: '⚙️ Custom', desc: 'Define your own rules' },
];

const CAMP_COLORS = {
  discount: { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8' },
  buy_x_get_y: { bg: '#f0fdf4', border: '#86efac', text: '#166534' },
  bv_achievement: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e' },
  elite_bingo: { bg: '#fdf4ff', border: '#d8b4fe', text: '#6b21a8' },
  custom: { bg: '#f8fafc', border: '#cbd5e1', text: '#475569' },
  pending_approval: { bg: '#fff7ed', border: '#fdba74', text: '#9a3412' },
  rejected: { bg: '#fef2f2', border: '#fca5a5', text: '#991b1b' },
};

function campStatusBadge(c) {
  if (c.status === 'pending_approval') return <Badge variant="warning"><Clock size={11} className="inline mr-1" />Pending Approval</Badge>;
  if (c.status === 'rejected') return <Badge variant="danger"><XCircle size={11} className="inline mr-1" />Rejected</Badge>;
  if (c.status === 'completed') return <Badge variant="default">Completed</Badge>;
  const now = new Date();
  const end = new Date(c.end_date);
  const start = new Date(c.start_date);
  if (now > end) return <Badge variant="default">Ended</Badge>;
  if (now < start) return <Badge variant="info">Upcoming</Badge>;
  return <Badge variant="success">Active</Badge>;
}

function StockCampaignsTab() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [alert, setAlert] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const defaultForm = {
    name: '', description: '', campaign_type: 'buy_x_get_y',
    start_date: '', end_date: '', scope: 'countrywide',
    target_branches: [],
    conditions: {}, prize: {},
    discount_percentage: 0,
    stock_assignments: [{ product: '', quantity: '', branch: 'all' }],
  };
  const [form, setForm] = useState(defaultForm);

  const load = () => {
    setLoading(true);
    api.get('/campaigns').then(d => {
      setCampaigns(Array.isArray(d) ? d : d.campaigns || []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.get('/prices').then(d => {
      const list = Array.isArray(d) ? d : (d.prices || d.products || []);
      setProducts(list.filter(p => !p.is_package));
    }).catch(() => {});
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.name || !form.start_date || !form.end_date) {
      setAlert({ type: 'error', msg: 'Campaign name, start date and end date are required.' });
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/campaigns', {
        ...form,
        status: 'pending_approval',
        submitted_by: user?.username || user?.full_name || 'stock',
        discount_percentage: form.campaign_type === 'discount' ? Number(form.conditions?.discount_pct || 0) : 0,
      });
      setAlert({ type: 'success', msg: 'Campaign submitted for GM approval.' });
      setForm(defaultForm);
      setShowForm(false);
      load();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = statusFilter === 'all' ? campaigns : campaigns.filter(c => c.status === statusFilter);
  const pendingCount = campaigns.filter(c => c.status === 'pending_approval').length;

  const tc = form.campaign_type ? (CAMP_COLORS[form.campaign_type] || CAMP_COLORS.custom) : CAMP_COLORS.custom;

  return (
    <div className="space-y-5">
      {alert && <Alert type={alert.type} onClose={() => setAlert(null)}>{alert.msg}</Alert>}

      <div className="rounded-xl p-5" style={{ background: 'linear-gradient(135deg,#1e3a5f,#2980b9)' }}>
        <div className="flex items-center gap-3">
          <Megaphone size={28} className="text-white" />
          <div>
            <h3 className="text-white text-lg font-bold m-0">📢 Stock Campaigns</h3>
            <p className="text-white/70 text-sm mt-0.5 m-0">Create campaigns for GM approval. Approved campaigns become active.</p>
          </div>
        </div>
        <div className="flex gap-4 mt-3">
          {[
            { label: 'Total', val: campaigns.length, color: '#93c5fd' },
            { label: 'Pending Approval', val: pendingCount, color: '#fcd34d' },
            { label: 'Active', val: campaigns.filter(c => c.status === 'active' || (c.status === 'upcoming' && new Date() >= new Date(c.start_date) && new Date() <= new Date(c.end_date))).length, color: '#86efac' },
            { label: 'Rejected', val: campaigns.filter(c => c.status === 'rejected').length, color: '#fca5a5' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-xl font-black" style={{ color: s.color }}>{s.val}</div>
              <div className="text-xs text-white/60">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          {['all', 'pending_approval', 'upcoming', 'active', 'completed', 'rejected'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              style={{ padding: '5px 14px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem',
                background: statusFilter === s ? '#2980b9' : '#f1f5f9', color: statusFilter === s ? '#fff' : '#475569' }}>
              {s === 'pending_approval' ? 'Pending Approval' : s.charAt(0).toUpperCase() + s.slice(1)}
              {s === 'pending_approval' && pendingCount > 0 && (
                <span style={{ marginLeft: 5, background: 'rgba(255,255,255,0.2)', borderRadius: 99, padding: '1px 6px', fontSize: '0.72rem' }}>{pendingCount}</span>
              )}
            </button>
          ))}
        </div>
        <Button onClick={() => { setShowForm(f => !f); setAlert(null); }}>
          <Plus size={16} /> {showForm ? 'Cancel' : 'Submit New Campaign'}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <h3 className="font-bold text-gray-800">Submit New Campaign for GM Approval</h3>
          </CardHeader>
          <CardBody>
            <Alert type="info" className="mb-4">
              This campaign will be sent to the GM for approval before becoming active.
            </Alert>
            <form onSubmit={handleCreate} className="space-y-5">
              <div>
                <div className="text-sm font-semibold text-gray-700 mb-2">Campaign Type</div>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                  {CAMP_TYPES.map(t => (
                    <button key={t.value} type="button" onClick={() => setForm(f => ({ ...f, campaign_type: t.value, conditions: {}, prize: {} }))}
                      className="p-3 rounded-lg border-2 text-left transition-all"
                      style={form.campaign_type === t.value
                        ? { background: CAMP_COLORS[t.value].bg, borderColor: CAMP_COLORS[t.value].border }
                        : { background: '#f8fafc', borderColor: '#e2e8f0' }}>
                      <div className="font-semibold text-sm" style={{ color: form.campaign_type === t.value ? CAMP_COLORS[t.value].text : '#374151' }}>{t.label}</div>
                      <div className="text-xs text-gray-500 mt-1">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <Input label="Campaign Title *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Buy 2 Get 1 Free Promotion" />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 min-h-[60px]"
                  placeholder="Brief summary of this campaign..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Start Date *" type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                <Input label="End Date *" type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>

              {/* Conditions summary */}
              <div className="p-4 rounded-xl border-2" style={{ background: tc.bg, borderColor: tc.border }}>
                <div className="font-semibold text-sm mb-3" style={{ color: tc.text }}>📋 Conditions / Rules</div>
                <StockCampaignConditionsForm type={form.campaign_type} conditions={form.conditions} onChange={c => setForm(f => ({ ...f, conditions: c }))} products={products} />
              </div>

              <div className="p-4 rounded-xl border-2 border-amber-200 bg-amber-50">
                <div className="font-semibold text-sm text-amber-800 mb-3">🏆 Prize / Reward</div>
                <StockCampaignPrizeForm type={form.campaign_type} prize={form.prize} onChange={p => setForm(f => ({ ...f, prize: p }))} products={products} />
              </div>

              <div className="p-4 rounded-xl border-2 border-purple-200 bg-purple-50">
                <div className="font-semibold text-sm text-purple-800 mb-1">📦 Stock Assignment</div>
                <div className="text-xs text-purple-600 mb-3">Specify the products and quantities allocated for this campaign across branches.</div>
                {(form.stock_assignments || [{ product: '', quantity: '', branch: 'all' }]).map((a, i) => (
                  <div key={i} className="grid grid-cols-3 gap-2 mb-2 items-end">
                    <div className="col-span-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Product</label>
                      <select value={a.product} onChange={e => {
                        const sa = [...(form.stock_assignments || [{ product: '', quantity: '', branch: 'all' }])];
                        sa[i] = { ...sa[i], product: e.target.value };
                        setForm(f => ({ ...f, stock_assignments: sa }));
                      }} className="w-full px-2 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-purple-300">
                        <option value="">-- Select --</option>
                        {products.map(p => <option key={p.id || p.name} value={p.name || p.product_name}>{p.name || p.product_name}</option>)}
                      </select>
                    </div>
                    <Input label="Qty Reserved" type="number" min="0" value={a.quantity}
                      onChange={e => { const sa = [...(form.stock_assignments || [])]; sa[i] = { ...sa[i], quantity: e.target.value }; setForm(f => ({ ...f, stock_assignments: sa })); }} />
                    <div className="flex gap-1 items-center">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                        <select value={a.branch} onChange={e => { const sa = [...(form.stock_assignments || [])]; sa[i] = { ...sa[i], branch: e.target.value }; setForm(f => ({ ...f, stock_assignments: sa })); }}
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-purple-300">
                          <option value="all">All Branches</option>
                          {BRANCH_DETAILS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </div>
                      {i > 0 && <button type="button" onClick={() => { const sa = [...(form.stock_assignments || [])]; sa.splice(i, 1); setForm(f => ({ ...f, stock_assignments: sa })); }}
                        className="text-red-400 hover:text-red-600 mt-4 shrink-0">✕</button>}
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => setForm(f => ({ ...f, stock_assignments: [...(f.stock_assignments || [{ product: '', quantity: '', branch: 'all' }]), { product: '', quantity: '', branch: 'all' }] }))}
                  className="text-xs text-purple-700 hover:underline mt-1">+ Add Product</button>
              </div>

              <div className="flex gap-3 pt-2 border-t border-gray-100">
                <Button type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit for GM Approval'}</Button>
                <Button variant="ghost" type="button" onClick={() => { setShowForm(false); setForm(defaultForm); }}>Cancel</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {loading ? <LoadingSpinner /> : (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-gray-400">No campaigns found. Submit a new campaign above.</div>
          ) : filtered.map(c => {
            const cColors = CAMP_COLORS[c.status === 'pending_approval' ? 'pending_approval' : c.status === 'rejected' ? 'rejected' : (c.campaign_type || 'custom')] || CAMP_COLORS.custom;
            return (
              <div key={c.id} className="rounded-xl border-2 overflow-hidden" style={{ borderColor: cColors.border, background: cColors.bg }}>
                <div className="p-4">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-bold text-gray-800">{c.name}</span>
                        {campStatusBadge(c)}
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#fff', border: `1px solid ${cColors.border}`, color: cColors.text }}>
                          {CAMP_TYPES.find(t => t.value === c.campaign_type)?.label || c.campaign_type}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{formatDate(c.start_date)} → {formatDate(c.end_date)}</div>
                      {c.description && <div className="text-sm text-gray-600 mt-1">{c.description}</div>}
                      {c.submitted_by && <div className="text-xs text-gray-400 mt-1">Submitted by: {c.submitted_by}</div>}
                      {c.status === 'rejected' && c.rejection_note && (
                        <div className="mt-2 text-xs text-red-600 bg-red-50 rounded p-2 border border-red-200">
                          <strong>Rejection reason:</strong> {c.rejection_note}
                        </div>
                      )}
                      {c.status === 'pending_approval' && (
                        <div className="mt-2 text-xs text-amber-700 bg-amber-50 rounded p-2 border border-amber-200">
                          ⏳ Awaiting GM review
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StockCampaignConditionsForm({ type, conditions, onChange, products = [] }) {
  const set = (key, val) => onChange({ ...conditions, [key]: val });
  const getArr = (key) => Array.isArray(conditions[key]) ? conditions[key] : (conditions[key] ? String(conditions[key]).split(',').map(s => s.trim()).filter(Boolean) : []);

  if (type === 'discount') return (
    <div className="space-y-3">
      <Input label="Discount %" type="number" min="1" max="100" value={conditions.discount_pct || ''} onChange={e => set('discount_pct', e.target.value)} placeholder="e.g. 15" />
      <Input label="Minimum Purchase Amount (N$)" type="number" value={conditions.min_purchase || ''} onChange={e => set('min_purchase', e.target.value)} placeholder="0 = no minimum" />
    </div>
  );
  if (type === 'buy_x_get_y') return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Input label="Buy quantity (X)" type="number" min="1" value={conditions.buy_qty || ''} onChange={e => set('buy_qty', e.target.value)} placeholder="e.g. 1" />
        <Input label="Get quantity free (Y)" type="number" min="1" value={conditions.get_qty || ''} onChange={e => set('get_qty', e.target.value)} placeholder="e.g. 1" />
      </div>
      <Input label="Qualifying Products (comma-separated, blank = all)" value={conditions.products_text || ''} onChange={e => set('products_text', e.target.value)} placeholder="e.g. Shake, Grow" />
    </div>
  );
  if (type === 'bv_achievement') return (
    <div className="space-y-3">
      <Input label="Maximum Winners (0 = unlimited)" type="number" min="0" value={conditions.max_winners || ''} onChange={e => set('max_winners', e.target.value)} placeholder="0" />
    </div>
  );
  if (type === 'elite_bingo') return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Input label="Min BV Required" type="number" value={conditions.min_bv || '3000'} onChange={e => set('min_bv', e.target.value)} placeholder="3000" />
        <Input label="Min New Recruits" type="number" value={conditions.min_recruits || '2'} onChange={e => set('min_recruits', e.target.value)} placeholder="2" />
      </div>
    </div>
  );
  return (
    <div className="space-y-3">
      <Input label="Minimum BV" type="number" value={conditions.min_bv || ''} onChange={e => set('min_bv', e.target.value)} placeholder="Optional" />
      <Input label="Other Rules" value={conditions.rules || ''} onChange={e => set('rules', e.target.value)} placeholder="Describe additional conditions..." />
    </div>
  );
}

function StockCampaignPrizeForm({ type, prize, onChange, products = [] }) {
  const set = (key, val) => onChange({ ...prize, [key]: val });
  if (type === 'discount') return (
    <Input label="Discount Description" value={prize.description || ''} onChange={e => set('description', e.target.value)} placeholder="e.g. Up to 15% off on selected items" />
  );
  if (type === 'buy_x_get_y') return (
    <div className="space-y-3">
      <Input label="Free Product Name" value={prize.free_product || ''} onChange={e => set('free_product', e.target.value)} placeholder="e.g. Shake" />
      <Input label="Prize Description" value={prize.description || ''} onChange={e => set('description', e.target.value)} placeholder="e.g. Buy 1 Get 1 Free" />
    </div>
  );
  if (type === 'bv_achievement') return (
    <div className="space-y-3">
      <div className="text-sm font-medium text-gray-700 mb-1">Prize Tiers</div>
      {(prize.tiers || [{ bv_required: '', label: '', prize: '' }]).map((tier, i) => (
        <div key={i} className="p-3 border border-gray-200 rounded-lg space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-gray-500">TIER {i + 1}</span>
            {i > 0 && <button type="button" onClick={() => { const t = [...(prize.tiers || [])]; t.splice(i, 1); set('tiers', t); }} className="text-xs text-red-500 hover:underline">Remove</button>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input label="Min BV" type="number" value={tier.bv_required || ''} onChange={e => { const t = [...(prize.tiers || [])]; t[i] = { ...t[i], bv_required: e.target.value }; set('tiers', t); }} placeholder="e.g. 3000" />
            <Input label="Tier Label" value={tier.label || ''} onChange={e => { const t = [...(prize.tiers || [])]; t[i] = { ...t[i], label: e.target.value }; set('tiers', t); }} placeholder="e.g. Gold" />
            <Input label="Prize" value={tier.prize || ''} onChange={e => { const t = [...(prize.tiers || [])]; t[i] = { ...t[i], prize: e.target.value }; set('tiers', t); }} placeholder="e.g. Hamper" />
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
      <Input label="Prize Description" value={prize.description || ''} onChange={e => set('description', e.target.value)} placeholder="e.g. N$1400 cash" />
    </div>
  );
  return (
    <div className="space-y-3">
      <Input label="Prize Description" value={prize.description || ''} onChange={e => set('description', e.target.value)} placeholder="e.g. Trophy, cash, voucher..." />
      <Input label="Prize Value (N$)" type="number" value={prize.value || ''} onChange={e => set('value', e.target.value)} placeholder="Optional monetary value" />
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { useStockRealtime } from '../../hooks/useStockRealtime';
import StaffServicesTab from '../../components/StaffServicesTab';
import StaffMessagesTab from '../../components/StaffMessagesTab';
import DispatchNote from '../../components/DispatchNote';
import { getCIFPrice, getDPCPrice, getProductProfit, findProductPrice, getLiveProductList, setLivePrices } from '../../lib/pricing';
import { formatCurrency, formatDateTime, formatDate, BRANCHES, BRANCH_DETAILS } from '../../lib/constants';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Table, Modal, Alert, Select, Textarea } from '../../components/ui';
import { Package, Warehouse, Truck, ArrowLeftRight, Globe, BarChart3, ClipboardList, FileSpreadsheet, Zap, Share2, ShoppingCart, Plus, Download, Filter, Search, DollarSign, TrendingUp, Ship, Calendar, CheckCircle, Printer, Tag, Edit2, Clock, XCircle, Brain, AlertTriangle, TrendingDown, MapPin, Users, Activity, Shield, Bell, RefreshCw, Target, Cpu, Megaphone } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

// CIF helper: uses stored cif_unit_cost when > 0, otherwise looks up live GM price list
const getBatchCIF = (b) => {
  const stored = Number(b.cif_unit_cost);
  if (stored > 0) return stored;
  return getCIFPrice(b.product_name || b.description || '');
};

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
    if (daysOfStock <= 14)  return { label: 'CRITICAL',     color: '#dc2626', bg: '#fef2f2', score: 95 };
    if (daysOfStock <= 30)  return { label: 'URGENT',       color: '#d97706', bg: '#fffbeb', score: 80 };
    if (daysOfStock <= 90)  return { label: 'REORDER NOW',  color: '#ca8a04', bg: '#fefce8', score: 60 };
    if (daysOfStock <= 180) return { label: 'PLAN AHEAD',   color: '#2563eb', bg: '#eff6ff', score: 30 };
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
    const expiredBatches = batches.filter(b => b.expiry_date && new Date(b.expiry_date) < now && Number(b.remaining_quantity || b.quantity || 0) > 0);
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
      productMap[key].qty += Number(b.remaining_quantity || b.quantity || 0);
      if (b.expiry_date && (!productMap[key].expiry || new Date(b.expiry_date) < new Date(productMap[key].expiry))) productMap[key].expiry = b.expiry_date;
    });
    return Object.values(productMap).map(p => {
      const dailyRate = stockAI.getDailyRate(p.product_name, movements);
      const daysOfStock = stockAI.getDaysOfStock(p.qty, dailyRate);
      const priority = stockAI.getPriority(daysOfStock, p.qty);
      const suggestedOrder = dailyRate > 0 ? Math.ceil(dailyRate * 180) : (p.qty < 5 ? 180 : 0);
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
    { value: 'quantity', label: 'Quantity (Current Stock)' },
    { value: 'expiry_date', label: 'Expiry Date' },
    { value: 'batch_number', label: 'Batch Number' },
    { value: 'unit_price', label: 'Unit Price (CIF)' },
    { value: 'dpc_unit_value', label: 'Unit DP Price' },
    { value: 'notes', label: 'Notes' },
  ];
  // distribution transfers only support quantity + notes (stock_transfers has no other stock fields)
  const fieldOptions = targetType === 'distribution'
    ? allFieldOptions.filter(o => o.value === 'quantity' || o.value === 'notes')
    : allFieldOptions;

  const currentValue = record ? (
    field === 'quantity' ? (record.remaining_quantity ?? record.remainingQuantity ?? record.quantity ?? '—') :
    field === 'expiry_date' ? (record.expiry_date ? formatDate(record.expiry_date) : '—') :
    field === 'batch_number' ? (record.batchNo || record.batch_number || record.batch_no || '—') :
    field === 'unit_price' ? (record.unit_price ?? record.unitPrice ?? '—') :
    field === 'dpc_unit_value' ? (record.dpc_unit_value ?? record.dpcUnitValue ?? '—') :
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
  const [records, setRecords]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert]         = useState(null);
  const [showReturn, setShowReturn] = useState(null);
  const [returnQty, setReturnQty] = useState('');
  const [soldQty, setSoldQty]     = useState('');
  const [detail, setDetail]       = useState(null);
  const [search, setSearch]       = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('issued');
  const [viewMode, setViewMode]   = useState('officer');  // 'officer' | 'product' | 'branch'
  const [productOptions, setProductOptions] = useState([]);
  const [form, setForm] = useState({
    officer_name: '', team_name: '', product_name: '', batch_no: '',
    expiry_date: '', quantity_issued: '', origin_location: '', origin_type: 'warehouse', notes: '',
  });

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.stock.fieldStock().catch(() => []),
      api.prices.list().catch(() => []),
    ]).then(([fsData, priceData]) => {
      const rows = Array.isArray(fsData) ? fsData : [];
      setRecords(rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      const prices = Array.isArray(priceData) ? priceData : [];
      if (prices.length > 0) setLivePrices(prices);
      const namesSet = new Set(prices.filter(p => !p.is_package && p.description).map(p => p.description));
      setProductOptions([...namesSet].sort());
    }).finally(() => setLoading(false));
  }, []);

  const { connected: wsConnected } = useStockRealtime({ onUpdate: loadData });
  useEffect(() => { loadData(); }, [loadData]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const fmtDate = ts => { try { return ts ? new Date(ts).toLocaleDateString('en-ZA',{day:'2-digit',month:'short',year:'numeric'}) : '—'; } catch { return '—'; } };
  const fmtDateTime = ts => { try { return ts ? new Date(ts).toLocaleString('en-ZA',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—'; } catch { return '—'; } };
  const daysOut  = r => r.created_at ? Math.floor((Date.now() - new Date(r.created_at)) / 86400000) : 0;
  const daysExp  = d => { if (!d) return null; return Math.ceil((new Date(d) - Date.now()) / 86400000); };
  const getDP    = name => { const p = getLiveProductList().find(p => p.description === name); return Number(p?.dp || 0); };
  const isOverdue = r => r.status === 'issued' && Number(r.balance || 0) > 0 && daysOut(r) > 7;

  const fmtLoc = loc => {
    const l = (loc||'').toLowerCase();
    if (!l) return '—';
    if (l === 'country_stock') return 'Country Stock';
    if (l === 'windhoek_warehouse') return 'Windhoek WH';
    if (l === 'ondangwa_warehouse') return 'Ondangwa WH';
    const bd = BRANCH_DETAILS.find(b => b.id === l);
    return bd ? bd.name : (loc||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  };
  const locColor = loc => {
    const l = (loc||'').toLowerCase();
    if (l === 'country_stock') return '#6b7280';
    if (l.includes('warehouse')) return '#2563eb';
    return '#c41e3a';
  };
  const locBg = loc => {
    const l = (loc||'').toLowerCase();
    if (l === 'country_stock') return '#f3f4f6';
    if (l.includes('warehouse')) return '#eff6ff';
    return '#fff0f3';
  };

  // ── Filters ──────────────────────────────────────────────────────────────────
  const statusFiltered = statusFilter === 'all' ? records : records.filter(r => r.status === statusFilter);
  const branchFiltered = branchFilter === 'all' ? statusFiltered : statusFiltered.filter(r =>
    (r.origin_location||'').toLowerCase() === branchFilter.toLowerCase()
  );
  const searched = !search.trim() ? branchFiltered : branchFiltered.filter(r => {
    const q = search.toLowerCase();
    return (r.officer_name||'').toLowerCase().includes(q)
      || (r.product_name||'').toLowerCase().includes(q)
      || (r.team_name||'').toLowerCase().includes(q)
      || (r.batch_no||'').toLowerCase().includes(q);
  });

  // ── Stats (from all records, not filtered) ───────────────────────────────────
  const activeRecs   = records.filter(r => r.status === 'issued');
  const totalBalance = activeRecs.reduce((s,r) => s + Number(r.balance || 0), 0);
  const totalIssued  = activeRecs.reduce((s,r) => s + Number(r.quantity_issued || 0), 0);
  const totalSold    = records.reduce((s,r) => s + Number(r.quantity_sold || 0), 0);
  const overdueRecs  = activeRecs.filter(isOverdue);
  const fieldValue   = activeRecs.reduce((s,r) => s + Number(r.balance||0) * getDP(r.product_name), 0);

  // ── Branch summary ─────────────────────────────────────────────────────────
  const branchMap = {};
  activeRecs.forEach(r => {
    const lk = (r.origin_location||'unknown').toLowerCase();
    if (!branchMap[lk]) branchMap[lk] = { loc: r.origin_location, count: 0, balance: 0, overdue: 0 };
    branchMap[lk].count++;
    branchMap[lk].balance += Number(r.balance || 0);
    if (isOverdue(r)) branchMap[lk].overdue++;
  });
  const branchSummary = Object.entries(branchMap).sort(([,a],[,b]) => b.balance - a.balance);

  // ── By-Officer grouping ────────────────────────────────────────────────────
  const officerMap = {};
  searched.forEach(r => {
    const key = r.officer_name || 'Unknown';
    if (!officerMap[key]) officerMap[key] = { name: key, team: r.team_name, branch: r.origin_location, records: [], balance: 0, issued: 0, sold: 0, returned: 0, overdue: 0 };
    officerMap[key].records.push(r);
    officerMap[key].balance   += Number(r.balance || 0);
    officerMap[key].issued    += Number(r.quantity_issued || 0);
    officerMap[key].sold      += Number(r.quantity_sold || 0);
    officerMap[key].returned  += Number(r.quantity_returned || 0);
    if (isOverdue(r)) officerMap[key].overdue++;
  });
  const officerRows = Object.values(officerMap).sort((a,b) => b.balance - a.balance);

  // ── By-Product grouping ────────────────────────────────────────────────────
  const productMap = {};
  searched.forEach(r => {
    const key = r.product_name || 'Unknown';
    if (!productMap[key]) productMap[key] = { name: key, records: [], balance: 0, issued: 0, officers: new Set(), branches: new Set() };
    productMap[key].records.push(r);
    productMap[key].balance += Number(r.balance || 0);
    productMap[key].issued  += Number(r.quantity_issued || 0);
    productMap[key].officers.add(r.officer_name);
    productMap[key].branches.add((r.origin_location||'').toLowerCase());
  });
  const productRows = Object.values(productMap).sort((a,b) => b.balance - a.balance);

  // ── Issue handler ────────────────────────────────────────────────────────────
  const handleIssue = async (e) => {
    e.preventDefault();
    if (!form.officer_name || !form.product_name || !form.quantity_issued || Number(form.quantity_issued) <= 0) {
      setAlert({ type:'error', msg:'Officer name, product, and quantity are required' });
      return;
    }
    setSubmitting(true);
    try {
      await api.stock.createFieldStock({
        officer_name:     form.officer_name,
        team_name:        form.team_name || null,
        product_name:     form.product_name,
        batch_no:         form.batch_no || null,
        expiry_date:      form.expiry_date || null,
        quantity_issued:  Number(form.quantity_issued),
        origin_location:  form.origin_location || 'windhoek_warehouse',
        origin_type:      form.origin_type || 'warehouse',
        notes:            form.notes || null,
        created_by:       user?.full_name || user?.username,
      });
      setShowForm(false);
      setForm({ officer_name:'', team_name:'', product_name:'', batch_no:'', expiry_date:'', quantity_issued:'', origin_location:'', origin_type:'warehouse', notes:'' });
      setAlert({ type:'success', msg:`Stock issued to ${form.officer_name} successfully` });
      setTimeout(loadData, 100);
    } catch (err) {
      setAlert({ type:'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReturn = async (record) => {
    const returned = Number(returnQty) || 0;
    const sold     = Number(soldQty)   || 0;
    if (returned <= 0 && sold <= 0) { setAlert({ type:'error', msg:'Enter return or sold quantity' }); return; }
    try {
      await api.stock.updateFieldStock(record.id, {
        quantity_returned: Number(record.quantity_returned || 0) + returned,
        quantity_sold:     Number(record.quantity_sold || 0) + sold,
      });
      setShowReturn(null);
      setReturnQty('');
      setSoldQty('');
      if (detail?.id === record.id) setDetail(null);
      setAlert({ type:'success', msg:'Field stock updated successfully' });
      setTimeout(loadData, 100);
    } catch (err) {
      setAlert({ type:'error', msg: err.message });
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} onClose={() => setAlert(null)}>{alert.msg}</Alert>}

      {/* ── Stat Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label:'Active Issues',       value: activeRecs.length,                                            color:'#d97706', bg:'#fffbeb', border:'#fde68a' },
          { label:'Units on Field',      value: totalBalance.toLocaleString(),                                color:'#c41e3a', bg:'#fff0f3', border:'#fecaca' },
          { label:'Field Value (N$)',    value: fieldValue > 0 ? Math.round(fieldValue).toLocaleString('en-ZA') : '—', color:'#7c3aed', bg:'#fdf4ff', border:'#d8b4fe' },
          { label:'Sold This Period',    value: totalSold.toLocaleString(),                                   color:'#16a34a', bg:'#f0fdf4', border:'#86efac' },
          { label:'Overdue (>7 days)',   value: overdueRecs.length, color: overdueRecs.length > 0 ? '#dc2626' : '#374151', bg: overdueRecs.length > 0 ? '#fef2f2' : '#f8fafc', border: overdueRecs.length > 0 ? '#fecaca' : '#e2e8f0' },
        ].map(s => (
          <div key={s.label} style={{ borderRadius:10, padding:'11px 14px', background:s.bg, border:`1.5px solid ${s.border}` }}>
            <div style={{ fontSize:'1.45rem', fontWeight:900, color:s.color, lineHeight:1 }}>{s.value}</div>
            <div style={{ fontSize:'0.69rem', color:'#64748b', fontWeight:700, marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Overdue Alert ─────────────────────────────────────────────────── */}
      {overdueRecs.length > 0 && (
        <div style={{ background:'#fef2f2', border:'1.5px solid #fecaca', borderRadius:10, padding:'10px 16px' }}>
          <div style={{ fontWeight:800, color:'#dc2626', fontSize:'0.82rem', marginBottom:5 }}>
            🚨 {overdueRecs.length} overdue field issue{overdueRecs.length !== 1 ? 's' : ''} — balance unaccounted for more than 7 days
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
            {overdueRecs.map((r,i) => (
              <button key={i} onClick={() => setDetail(r)}
                style={{ background:'#fff', border:'1px solid #fecaca', borderRadius:6, padding:'3px 10px', fontSize:'0.71rem', fontWeight:700, color:'#dc2626', cursor:'pointer' }}>
                {r.officer_name} · {r.product_name} · {Number(r.balance||0)} units · {daysOut(r)}d out
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Branch filter pills ───────────────────────────────────────────── */}
      {branchSummary.length > 0 && (
        <div>
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Field Stock by Origin Branch — click to filter</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            <button onClick={() => setBranchFilter('all')}
              style={{ padding:'5px 13px', borderRadius:99, border:`2px solid ${branchFilter==='all'?'#c41e3a':'#e2e8f0'}`, background:branchFilter==='all'?'#fff0f3':'#fff', fontSize:'0.76rem', fontWeight:700, cursor:'pointer', color:branchFilter==='all'?'#c41e3a':'#374151' }}>
              All Branches
            </button>
            {branchSummary.map(([lk, s]) => (
              <button key={lk} onClick={() => setBranchFilter(branchFilter === lk ? 'all' : lk)}
                style={{ padding:'5px 13px', borderRadius:99, border:`2px solid ${branchFilter===lk ? locColor(lk) : '#e2e8f0'}`, background:branchFilter===lk ? locBg(lk) : '#fff', fontSize:'0.76rem', fontWeight:700, cursor:'pointer', color:branchFilter===lk ? locColor(lk) : '#374151', display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ width:7, height:7, borderRadius:'50%', background:locColor(lk), display:'inline-block' }} />
                {fmtLoc(lk)}
                <span style={{ fontWeight:900, color:locColor(lk) }}>{s.balance.toLocaleString()} units</span>
                {s.overdue > 0 && <span style={{ background:'#fef2f2', color:'#dc2626', borderRadius:99, padding:'0 5px', fontSize:'0.62rem', fontWeight:800 }}>⚠{s.overdue}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <Card>
        <CardBody>
          <div style={{ display:'flex', flexWrap:'wrap', gap:10, alignItems:'center' }}>
            <div style={{ position:'relative', flex:1, minWidth:200 }}>
              <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#94a3b8' }} />
              <input style={{ width:'100%', paddingLeft:32, paddingRight:12, paddingTop:8, paddingBottom:8, borderRadius:8, border:'1px solid #d1d5db', fontSize:'0.83rem', outline:'none' }}
                placeholder="Search officer, product, batch…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select style={{ padding:'7px 12px', borderRadius:8, border:'1px solid #d1d5db', fontSize:'0.83rem', background:'#fff', cursor:'pointer' }}
              value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="issued">Active (Issued)</option>
              <option value="closed">Closed</option>
              <option value="all">All Records</option>
            </select>
            <div style={{ display:'flex', borderRadius:8, border:'1px solid #d1d5db', overflow:'hidden', fontSize:'0.83rem' }}>
              {[['officer','By Officer'],['product','By Product'],['branch','By Branch']].map(([v,l]) => (
                <button key={v} onClick={() => setViewMode(v)}
                  style={{ padding:'7px 13px', fontWeight:700, background: viewMode===v ? '#c41e3a' : '#fff', color: viewMode===v ? '#fff' : '#374151', border:'none', cursor:'pointer' }}>
                  {l}
                </button>
              ))}
            </div>
            <Button size="sm" variant="secondary" onClick={loadData}>↺ Refresh</Button>
            <Button size="sm" variant="secondary" onClick={() => {
              const rows = searched.map(r => `<tr><td>${r.officer_name||''}</td><td>${r.team_name||''}</td><td>${r.product_name||''}</td><td>${fmtLoc(r.origin_location||'')}</td><td>${r.batch_no||'—'}</td><td>${r.quantity_issued||0}</td><td>${r.quantity_returned||0}</td><td>${r.quantity_sold||0}</td><td>${r.balance||0}</td><td>${daysOut(r)}d</td><td>${r.status||''}</td></tr>`).join('');
              printDocument('Field Stock Report', `<table><thead><tr><th>Officer</th><th>Team</th><th>Product</th><th>Branch</th><th>Batch</th><th>Issued</th><th>Returned</th><th>Sold</th><th>Balance</th><th>Days Out</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`);
            }}><Printer size={14} /> Print</Button>
            <Button size="sm" onClick={() => setShowForm(true)}><Plus size={14} /> Issue to Field</Button>
          </div>
        </CardBody>
      </Card>

      {/* ── Detail Modal ──────────────────────────────────────────────────── */}
      {detail && (
        <Modal open={!!detail} onClose={() => setDetail(null)} title={`Field Stock Detail — ${detail.officer_name}`} size="md">
          <div className="p-6 space-y-4">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[
                ['Officer',         detail.officer_name],
                ['Team',            detail.team_name || '—'],
                ['Product',         detail.product_name],
                ['Batch #',         detail.batch_no || '—'],
                ['Origin Branch',   fmtLoc(detail.origin_location)],
                ['Issue Date',      fmtDateTime(detail.created_at)],
                ['Days on Field',   `${daysOut(detail)} day${daysOut(detail) !== 1 ? 's' : ''}`],
                ['Expiry Date',     fmtDate(detail.expiry_date)],
                ['Qty Issued',      Number(detail.quantity_issued||0).toLocaleString()],
                ['Qty Returned',    Number(detail.quantity_returned||0).toLocaleString()],
                ['Qty Sold',        Number(detail.quantity_sold||0).toLocaleString()],
                ['Balance Out',     Number(detail.balance||0).toLocaleString()],
                ['DP Value (bal)',  getDP(detail.product_name) > 0 ? `N$ ${Math.round(Number(detail.balance||0) * getDP(detail.product_name)).toLocaleString('en-ZA')}` : '—'],
                ['Status',          (detail.status||'issued').toUpperCase()],
                ['Issued By',       detail.created_by || '—'],
                ['Notes',           detail.notes || '—'],
              ].map(([k,v]) => (
                <div key={k} style={{ background:'#f8fafc', borderRadius:8, padding:'8px 12px' }}>
                  <div style={{ fontSize:'0.66rem', color:'#94a3b8', fontWeight:700, textTransform:'uppercase' }}>{k}</div>
                  <div style={{ fontSize:'0.87rem', fontWeight:700, color:'#1e293b', marginTop:1, wordBreak:'break-word' }}>{v}</div>
                </div>
              ))}
            </div>
            {/* Progress bar */}
            {Number(detail.quantity_issued||0) > 0 && (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.72rem', color:'#64748b', marginBottom:3 }}>
                  <span>Accounted for: {(Number(detail.quantity_returned||0)+Number(detail.quantity_sold||0)).toLocaleString()} / {Number(detail.quantity_issued||0).toLocaleString()}</span>
                  <span>{Math.round((Number(detail.quantity_returned||0)+Number(detail.quantity_sold||0))/Number(detail.quantity_issued)*100)}%</span>
                </div>
                <div style={{ height:8, background:'#f1f5f9', borderRadius:99, overflow:'hidden' }}>
                  <div style={{ height:'100%', background:'#16a34a', borderRadius:99, width:`${Math.min(100,Math.round((Number(detail.quantity_returned||0)+Number(detail.quantity_sold||0))/Number(detail.quantity_issued)*100))}%` }} />
                </div>
                {isOverdue(detail) && <div style={{ fontSize:'0.7rem', color:'#dc2626', fontWeight:700, marginTop:4 }}>⚠️ Overdue — {daysOut(detail)} days on field with outstanding balance</div>}
              </div>
            )}
            {detail.status === 'issued' && (
              <div style={{ display:'flex', gap:10, paddingTop:4 }}>
                <button onClick={() => { setShowReturn(detail); setReturnQty(''); setSoldQty(''); setDetail(null); }}
                  style={{ padding:'8px 16px', background:'#1d4ed8', color:'#fff', border:'none', borderRadius:8, fontWeight:700, fontSize:'0.82rem', cursor:'pointer' }}>
                  Record Return / Sale
                </button>
                <button onClick={() => setDetail(null)}
                  style={{ padding:'8px 16px', background:'#f1f5f9', color:'#374151', border:'none', borderRadius:8, fontWeight:700, fontSize:'0.82rem', cursor:'pointer' }}>
                  Close
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      {viewMode === 'officer' && (
        <Card>
          <CardHeader>
            <h3 style={{ fontWeight:800, color:'#1e293b' }}>
              Field Officers
              {wsConnected && <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:'#dcfce7', color:'#166534', borderRadius:99, padding:'2px 8px', fontSize:'0.68rem', fontWeight:700, marginLeft:8 }}><span style={{ width:5, height:5, borderRadius:'50%', background:'#16a34a', display:'inline-block' }} />LIVE</span>}
              <span style={{ fontSize:'0.72rem', color:'#94a3b8', fontWeight:400, marginLeft:8 }}>{officerRows.length} officer{officerRows.length !== 1 ? 's' : ''}</span>
            </h3>
          </CardHeader>
          {officerRows.length === 0 ? (
            <CardBody><EmptyState icon={<Users size={40} />} title="No field stock records" description="Issue stock to a field officer to get started" /></CardBody>
          ) : (
            officerRows.map((officer, oi) => (
              <div key={officer.name} style={{ borderBottom:'1px solid #f1f5f9' }}>
                {/* Officer header row */}
                <div style={{ padding:'10px 16px', background: oi%2===0 ? '#fafafa' : '#fff', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                  <div style={{ flex:1, minWidth:140 }}>
                    <div style={{ fontWeight:800, color:'#1e293b', fontSize:'0.88rem' }}>{officer.name}</div>
                    {officer.team && <div style={{ fontSize:'0.68rem', color:'#94a3b8' }}>{officer.team}</div>}
                  </div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    <span style={{ background:locBg(officer.branch), color:locColor(officer.branch), border:`1px solid ${locColor(officer.branch)}30`, borderRadius:99, padding:'2px 8px', fontSize:'0.68rem', fontWeight:800 }}>
                      <span style={{ width:5, height:5, borderRadius:'50%', background:locColor(officer.branch), display:'inline-block', marginRight:3, verticalAlign:'middle' }} />
                      {fmtLoc(officer.branch)}
                    </span>
                    {officer.overdue > 0 && <span style={{ background:'#fef2f2', color:'#dc2626', borderRadius:99, padding:'2px 8px', fontSize:'0.68rem', fontWeight:800, border:'1px solid #fecaca' }}>⚠ {officer.overdue} overdue</span>}
                  </div>
                  <div style={{ display:'flex', gap:16, fontSize:'0.78rem' }}>
                    <span><span style={{ color:'#94a3b8' }}>Issued:</span> <strong>{officer.issued.toLocaleString()}</strong></span>
                    <span><span style={{ color:'#94a3b8' }}>Sold:</span> <strong style={{ color:'#16a34a' }}>{officer.sold.toLocaleString()}</strong></span>
                    <span><span style={{ color:'#94a3b8' }}>Returned:</span> <strong style={{ color:'#2563eb' }}>{officer.returned.toLocaleString()}</strong></span>
                    <span><span style={{ color:'#94a3b8' }}>Balance:</span> <strong style={{ color: officer.balance > 0 ? '#c41e3a' : '#16a34a' }}>{officer.balance.toLocaleString()}</strong></span>
                  </div>
                </div>
                {/* Product rows under this officer */}
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.77rem' }}>
                    <thead>
                      <tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                        {['Product','Batch #','Expiry','Issue Date','Days Out','Issued','Returned','Sold','Balance','DP Value','Status',''].map(h => (
                          <th key={h} style={{ padding:'6px 10px', textAlign:'left', fontWeight:700, color:'#64748b', fontSize:'0.66rem', whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {officer.records.map((r, ri) => {
                        const do_ = daysOut(r);
                        const de  = daysExp(r.expiry_date);
                        const bal = Number(r.balance || 0);
                        const dpVal = bal * getDP(r.product_name);
                        const overdue = isOverdue(r);
                        return (
                          <tr key={r.id || ri} style={{ background: overdue ? '#fef9f9' : '#fff', borderBottom:'1px solid #f8fafc', cursor:'pointer' }}
                            onClick={() => setDetail(r)}
                            onMouseEnter={e => e.currentTarget.style.background='#fef2f2'}
                            onMouseLeave={e => e.currentTarget.style.background= overdue ? '#fef9f9' : '#fff'}>
                            <td style={{ padding:'7px 10px', fontWeight:700, color:'#1e293b', maxWidth:160 }}>
                              <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={r.product_name}>{r.product_name}</div>
                            </td>
                            <td style={{ padding:'7px 10px', fontFamily:'monospace', fontSize:'0.7rem', color:'#6b21a8' }}>{r.batch_no || '—'}</td>
                            <td style={{ padding:'7px 10px', whiteSpace:'nowrap', color: de !== null && de <= 30 ? '#dc2626' : '#374151', fontWeight: de !== null && de <= 30 ? 700 : 400 }}>
                              {fmtDate(r.expiry_date)}
                              {de !== null && de <= 30 && de > 0 && <div style={{ fontSize:'0.62rem', color:'#dc2626' }}>{de}d left</div>}
                              {de !== null && de <= 0 && <div style={{ fontSize:'0.62rem', color:'#dc2626', fontWeight:800 }}>EXPIRED</div>}
                            </td>
                            <td style={{ padding:'7px 10px', whiteSpace:'nowrap', color:'#64748b' }}>{fmtDate(r.created_at)}</td>
                            <td style={{ padding:'7px 10px', fontWeight: overdue ? 800 : 400, color: overdue ? '#dc2626' : do_ > 3 ? '#d97706' : '#374151' }}>
                              {do_}d {overdue && '⚠'}
                            </td>
                            <td style={{ padding:'7px 10px', color:'#64748b' }}>{Number(r.quantity_issued||0).toLocaleString()}</td>
                            <td style={{ padding:'7px 10px', color:'#2563eb', fontWeight:700 }}>{Number(r.quantity_returned||0).toLocaleString()}</td>
                            <td style={{ padding:'7px 10px', color:'#16a34a', fontWeight:700 }}>{Number(r.quantity_sold||0).toLocaleString()}</td>
                            <td style={{ padding:'7px 10px', fontWeight:900, color: bal > 0 ? '#c41e3a' : '#16a34a' }}>{bal.toLocaleString()}</td>
                            <td style={{ padding:'7px 10px', fontWeight:700, color:'#374151' }}>{dpVal > 0 ? `N$ ${Math.round(dpVal).toLocaleString('en-ZA')}` : '—'}</td>
                            <td style={{ padding:'7px 10px' }}>
                              <span style={{ background: r.status==='issued' ? '#fffbeb' : '#f0fdf4', color: r.status==='issued' ? '#d97706' : '#16a34a', borderRadius:99, padding:'2px 7px', fontSize:'0.65rem', fontWeight:800 }}>
                                {r.status||'issued'}
                              </span>
                            </td>
                            <td style={{ padding:'7px 10px' }}>
                              {r.status === 'issued' && (
                                <button onClick={ev => { ev.stopPropagation(); setShowReturn(r); setReturnQty(''); setSoldQty(''); }}
                                  style={{ padding:'3px 8px', background:'#dbeafe', color:'#1e40af', border:'1px solid #93c5fd', borderRadius:5, cursor:'pointer', fontSize:'0.7rem', fontWeight:700, whiteSpace:'nowrap' }}>
                                  Return/Sold
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </Card>
      )}

      {viewMode === 'product' && (
        <Card>
          <CardHeader>
            <h3 style={{ fontWeight:800, color:'#1e293b' }}>Products on Field
              <span style={{ fontSize:'0.72rem', color:'#94a3b8', fontWeight:400, marginLeft:8 }}>{productRows.length} product{productRows.length !== 1 ? 's' : ''}</span>
            </h3>
          </CardHeader>
          {productRows.length === 0 ? (
            <CardBody><EmptyState icon={<Package size={40} />} title="No products on field" description="No field stock records match the current filters" /></CardBody>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
                <thead>
                  <tr style={{ background:'#fef2f2', borderBottom:'2px solid #fecaca' }}>
                    {['Product','Balance (units)','DP Value','Officers','Branches','Total Issued','Records'].map(h => (
                      <th key={h} style={{ padding:'9px 12px', textAlign:'left', fontWeight:700, color:'#475569', fontSize:'0.71rem', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {productRows.map((p, i) => {
                    const dp = getDP(p.name);
                    const val = p.balance * dp;
                    const brs = [...p.branches].filter(Boolean);
                    return (
                      <tr key={p.name} style={{ background:i%2===0?'#fff':'#f9fafb', borderBottom:'1px solid #f1f5f9' }}>
                        <td style={{ padding:'9px 12px', fontWeight:800, color:'#1e293b', maxWidth:200 }}>
                          <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={p.name}>{p.name}</div>
                        </td>
                        <td style={{ padding:'9px 12px', fontWeight:900, color: p.balance > 0 ? '#c41e3a' : '#16a34a', fontSize:'0.9rem' }}>{p.balance.toLocaleString()}</td>
                        <td style={{ padding:'9px 12px', fontWeight:700, color:'#374151' }}>{val > 0 ? `N$ ${Math.round(val).toLocaleString('en-ZA')}` : '—'}</td>
                        <td style={{ padding:'9px 12px', color:'#64748b' }}>{p.officers.size}</td>
                        <td style={{ padding:'9px 12px' }}>
                          <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                            {brs.slice(0,4).map(lk => (
                              <span key={lk} style={{ background:locBg(lk), color:locColor(lk), border:`1px solid ${locColor(lk)}22`, borderRadius:99, padding:'1px 6px', fontSize:'0.64rem', fontWeight:800 }}>
                                {fmtLoc(lk).replace(' Warehouse','').replace(' WH','')}
                              </span>
                            ))}
                            {brs.length > 4 && <span style={{ fontSize:'0.64rem', color:'#94a3b8' }}>+{brs.length-4}</span>}
                          </div>
                        </td>
                        <td style={{ padding:'9px 12px', color:'#64748b' }}>{p.issued.toLocaleString()}</td>
                        <td style={{ padding:'9px 12px', color:'#64748b' }}>{p.records.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {viewMode === 'branch' && (
        <div className="space-y-3">
          {branchSummary.length === 0 ? (
            <Card><CardBody><EmptyState icon={<Package size={40} />} title="No branch data" description="No active field stock records" /></CardBody></Card>
          ) : branchSummary.map(([lk, s]) => {
            const branchRecs = searched.filter(r => (r.origin_location||'').toLowerCase() === lk);
            if (branchRecs.length === 0) return null;
            return (
              <Card key={lk}>
                <CardHeader>
                  <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                    <span style={{ background:locBg(lk), color:locColor(lk), border:`1.5px solid ${locColor(lk)}44`, borderRadius:99, padding:'4px 12px', fontWeight:800, fontSize:'0.8rem', display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ width:8, height:8, borderRadius:'50%', background:locColor(lk), display:'inline-block' }} />
                      {fmtLoc(lk)}
                    </span>
                    <span style={{ fontSize:'0.78rem', color:'#64748b' }}>
                      {branchRecs.length} record{branchRecs.length!==1?'s':''} · <strong style={{ color:locColor(lk) }}>{branchRecs.reduce((s,r)=>s+Number(r.balance||0),0).toLocaleString()} units</strong> outstanding
                    </span>
                    {branchRecs.filter(isOverdue).length > 0 && (
                      <span style={{ background:'#fef2f2', color:'#dc2626', borderRadius:99, padding:'2px 8px', fontSize:'0.68rem', fontWeight:800, border:'1px solid #fecaca' }}>
                        ⚠ {branchRecs.filter(isOverdue).length} overdue
                      </span>
                    )}
                  </div>
                </CardHeader>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.79rem' }}>
                    <thead>
                      <tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                        {['Officer','Product','Batch','Issued','Returned','Sold','Balance','Days Out','DP Value','Status',''].map(h => (
                          <th key={h} style={{ padding:'7px 10px', textAlign:'left', fontWeight:700, color:'#64748b', fontSize:'0.66rem', whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {branchRecs.sort((a,b) => Number(b.balance||0) - Number(a.balance||0)).map((r, ri) => {
                        const do_ = daysOut(r);
                        const bal = Number(r.balance || 0);
                        const dpVal = bal * getDP(r.product_name);
                        const overdue = isOverdue(r);
                        return (
                          <tr key={r.id||ri} onClick={() => setDetail(r)} style={{ background: overdue ? '#fef9f9' : ri%2===0?'#fff':'#fafafa', borderBottom:'1px solid #f1f5f9', cursor:'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.background='#fef2f2'}
                            onMouseLeave={e => e.currentTarget.style.background=overdue?'#fef9f9':ri%2===0?'#fff':'#fafafa'}>
                            <td style={{ padding:'7px 10px', fontWeight:700, color:'#1e293b' }}>
                              {r.officer_name}
                              {r.team_name && <div style={{ fontSize:'0.63rem', color:'#94a3b8' }}>{r.team_name}</div>}
                            </td>
                            <td style={{ padding:'7px 10px', maxWidth:160 }}>
                              <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={r.product_name}>{r.product_name}</div>
                            </td>
                            <td style={{ padding:'7px 10px', fontFamily:'monospace', fontSize:'0.7rem', color:'#6b21a8' }}>{r.batch_no||'—'}</td>
                            <td style={{ padding:'7px 10px', color:'#64748b' }}>{Number(r.quantity_issued||0).toLocaleString()}</td>
                            <td style={{ padding:'7px 10px', color:'#2563eb', fontWeight:700 }}>{Number(r.quantity_returned||0).toLocaleString()}</td>
                            <td style={{ padding:'7px 10px', color:'#16a34a', fontWeight:700 }}>{Number(r.quantity_sold||0).toLocaleString()}</td>
                            <td style={{ padding:'7px 10px', fontWeight:900, color:bal>0?'#c41e3a':'#16a34a' }}>{bal.toLocaleString()}</td>
                            <td style={{ padding:'7px 10px', fontWeight:overdue?800:400, color:overdue?'#dc2626':do_>3?'#d97706':'#374151' }}>{do_}d{overdue&&' ⚠'}</td>
                            <td style={{ padding:'7px 10px', fontWeight:700, color:'#374151' }}>{dpVal>0?`N$ ${Math.round(dpVal).toLocaleString('en-ZA')}`:'—'}</td>
                            <td style={{ padding:'7px 10px' }}>
                              <span style={{ background:r.status==='issued'?'#fffbeb':'#f0fdf4', color:r.status==='issued'?'#d97706':'#16a34a', borderRadius:99, padding:'2px 7px', fontSize:'0.65rem', fontWeight:800 }}>{r.status||'issued'}</span>
                            </td>
                            <td style={{ padding:'7px 10px' }}>
                              {r.status==='issued' && (
                                <button onClick={ev => { ev.stopPropagation(); setShowReturn(r); setReturnQty(''); setSoldQty(''); }}
                                  style={{ padding:'3px 8px', background:'#dbeafe', color:'#1e40af', border:'1px solid #93c5fd', borderRadius:5, cursor:'pointer', fontSize:'0.7rem', fontWeight:700, whiteSpace:'nowrap' }}>
                                  Return/Sold
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Issue to Field Modal ──────────────────────────────────────────── */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Issue Stock to Field Officer" size="md">
        <form onSubmit={handleIssue} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Officer Name *" value={form.officer_name} onChange={e => setForm(f=>({...f,officer_name:e.target.value}))} placeholder="e.g. John Doe" />
            <Input label="Team Name" value={form.team_name} onChange={e => setForm(f=>({...f,team_name:e.target.value}))} placeholder="e.g. Northern Team" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Product *</label>
              <input list="field-prod-list" className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm" value={form.product_name}
                onChange={e => setForm(f=>({...f,product_name:e.target.value}))} placeholder="Search products…" autoComplete="off" />
              <datalist id="field-prod-list">{productOptions.map(name => <option key={name} value={name} />)}</datalist>
            </div>
            <Input label="Quantity *" type="number" min="1" value={form.quantity_issued} onChange={e => setForm(f=>({...f,quantity_issued:e.target.value}))} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Batch #" value={form.batch_no} onChange={e => setForm(f=>({...f,batch_no:e.target.value}))} />
            <Input label="Expiry Date" type="date" value={form.expiry_date} onChange={e => setForm(f=>({...f,expiry_date:e.target.value}))} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Origin Branch / Warehouse</label>
              <select className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white" value={form.origin_location} onChange={e => setForm(f=>({...f,origin_location:e.target.value}))}>
                <option value="">Select origin…</option>
                <optgroup label="Warehouses">
                  <option value="windhoek_warehouse">Windhoek Warehouse</option>
                  <option value="ondangwa_warehouse">Ondangwa Warehouse</option>
                  <option value="country_stock">Country Stock</option>
                </optgroup>
                <optgroup label="Branches">
                  {BRANCH_DETAILS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </optgroup>
              </select>
            </div>
          </div>
          <Input label="Notes" value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} placeholder="Purpose, event, campaign…" />
          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={submitting}>{submitting ? 'Issuing…' : 'Issue Stock'}</Button>
            <Button variant="secondary" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>

      {/* ── Return / Sale Modal ───────────────────────────────────────────── */}
      <Modal open={!!showReturn} onClose={() => setShowReturn(null)} title={`Record Return/Sale — ${showReturn?.product_name || ''}`} size="sm">
        {showReturn && (
          <div className="p-6 space-y-4">
            <div style={{ background:'#f8fafc', borderRadius:8, padding:'10px 14px', fontSize:'0.82rem' }}>
              <div><strong>Officer:</strong> {showReturn.officer_name}</div>
              <div><strong>Product:</strong> {showReturn.product_name}</div>
              <div><strong>Outstanding Balance:</strong> <span style={{ fontWeight:800, color:'#c41e3a' }}>{showReturn.balance} units</span></div>
              <div><strong>Days on Field:</strong> {daysOut(showReturn)} days</div>
            </div>
            <Input label="Quantity Returned to Stock" type="number" min="0" max={showReturn.balance} value={returnQty} onChange={e => setReturnQty(e.target.value)} />
            <Input label="Quantity Sold in Field" type="number" min="0" max={showReturn.balance} value={soldQty} onChange={e => setSoldQty(e.target.value)} />
            {returnQty && soldQty && Number(returnQty)+Number(soldQty) > Number(showReturn.balance) && (
              <p style={{ fontSize:'0.76rem', color:'#dc2626', fontWeight:700 }}>⚠ Total ({Number(returnQty)+Number(soldQty)}) exceeds balance ({showReturn.balance})</p>
            )}
            <div className="flex gap-3 pt-2">
              <Button onClick={() => handleReturn(showReturn)} disabled={Number(returnQty||0)+Number(soldQty||0) > Number(showReturn.balance||0)}>Update</Button>
              <Button variant="secondary" onClick={() => setShowReturn(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── Credit Refund Approvals Tab ────────────────────────────────────────────────
function RefundApprovalsTab() {
  const { user } = useAuth();
  const [requests, setRequests]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [filter, setFilter]               = useState('pending');
  const [acting, setActing]               = useState({});
  const [rejectionReasons, setRejectionReasons] = useState({});
  const [showReject, setShowReject]       = useState({});
  const [alert, setAlert]                 = useState(null);

  const load = () => {
    setLoading(true);
    api.stock.listRefundRequests()
      .then(d => setRequests(d.requests || []))
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const fmtDate = ts => { try { return ts ? new Date(ts).toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; } catch { return '—'; } };
  const fmtN = n => `N$ ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtLoc = loc => {
    const bd = BRANCH_DETAILS.find(b => b.id === (loc || '').toLowerCase().replace(/ /g,'_'));
    return bd ? bd.name : (loc || '—').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const handleApprove = async req => {
    setActing(a => ({ ...a, [req.id]: 'approving' }));
    try {
      await api.stock.approveRefundRequest(req.id, { approved_by: user?.full_name || user?.username || 'Stock Manager' });
      setAlert({ type: 'success', msg: `✅ Refund approved — ${req.quantity} × "${req.product_name}" stock restored to ${fmtLoc(req.branch_id)}.` });
      load();
    } catch (e) {
      setAlert({ type: 'error', msg: `Failed: ${e.message}` });
    } finally { setActing(a => ({ ...a, [req.id]: undefined })); }
  };

  const handleReject = async req => {
    const reason = rejectionReasons[req.id]?.trim();
    if (!reason) { setAlert({ type: 'error', msg: 'Please enter a rejection reason.' }); return; }
    setActing(a => ({ ...a, [req.id]: 'rejecting' }));
    try {
      await api.stock.rejectRefundRequest(req.id, { approved_by: user?.full_name || user?.username || 'Stock Manager', rejection_reason: reason });
      setAlert({ type: 'success', msg: `Refund request for "${req.product_name}" rejected.` });
      setShowReject(s => ({ ...s, [req.id]: false }));
      load();
    } catch (e) {
      setAlert({ type: 'error', msg: `Failed: ${e.message}` });
    } finally { setActing(a => ({ ...a, [req.id]: undefined })); }
  };

  const pending = requests.filter(r => r.status === 'pending');
  const today   = new Date().toISOString().slice(0, 10);
  const approvedToday = requests.filter(r => r.status === 'approved' && (r.processed_at || '').slice(0, 10) === today);
  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} onClose={() => setAlert(null)}>{alert.msg}</Alert>}

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', borderRadius: 14, padding: '16px 22px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ fontWeight: 900, fontSize: '1.08rem', margin: 0 }}>↩️ Credit Refund Approvals</h3>
          <p style={{ fontSize: '0.8rem', opacity: 0.8, margin: '3px 0 0' }}>
            Review branch refund requests. Approval returns stock to the branch and deducts the amount from branch sales automatically.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {pending.length > 0 && <span style={{ background: '#fbbf24', color: '#78350f', borderRadius: 99, padding: '5px 14px', fontSize: '0.8rem', fontWeight: 800 }}>⏳ {pending.length} Pending</span>}
          <button onClick={load} style={{ padding: '7px 16px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 99, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>↺ Refresh</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {[
          { label: 'Pending Approval',    value: pending.length, color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
          { label: 'Approved Today',      value: approvedToday.length, color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
          { label: 'Total Approved',      value: requests.filter(r => r.status === 'approved').length, color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' },
          { label: 'Total Rejected',      value: requests.filter(r => r.status === 'rejected').length, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
          { label: 'Value (Approved)',     value: fmtN(requests.filter(r => r.status === 'approved').reduce((s, r) => s + Number(r.refund_amount || 0), 0)), color: '#374151', bg: '#f8fafc', border: '#e2e8f0' },
        ].map(s => (
          <div key={s.label} style={{ padding: '11px 14px', background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: 10, textAlign: 'center' }}>
            <div style={{ fontSize: typeof s.value === 'string' ? '0.9rem' : '1.6rem', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: '0.69rem', color: '#64748b', fontWeight: 700, marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['all', 'pending', 'approved', 'rejected'].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{ padding: '5px 14px', borderRadius: 99, border: '1.5px solid', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', borderColor: filter === s ? '#c41e3a' : '#e2e8f0', background: filter === s ? '#fff0f3' : '#fff', color: filter === s ? '#c41e3a' : '#64748b' }}>
            {s.charAt(0).toUpperCase() + s.slice(1)} ({s === 'all' ? requests.length : requests.filter(r => r.status === s).length})
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>✅</div>
          <div style={{ fontWeight: 700 }}>No {filter === 'all' ? '' : filter} refund requests</div>
        </div>
      )}

      {/* Refund Cards */}
      <div className="space-y-3">
        {filtered.map(req => {
          const borderColor = req.status === 'pending' ? '#fde68a' : req.status === 'approved' ? '#86efac' : '#fecaca';
          const bgColor     = req.status === 'pending' ? '#fffbeb' : req.status === 'approved' ? '#f0fdf4' : '#fef2f2';
          const badgeColor  = req.status === 'pending' ? ['#fffbeb','#b45309','#fde68a','⏳ Pending'] : req.status === 'approved' ? ['#f0fdf4','#16a34a','#86efac','✅ Approved'] : ['#fef2f2','#dc2626','#fecaca','❌ Rejected'];
          return (
            <div key={req.id} style={{ border: `2px solid ${borderColor}`, borderRadius: 14, padding: '18px 20px', background: bgColor }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 14 }}>
                {/* Left info */}
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '3px 10px', borderRadius: 99, background: badgeColor[0], color: badgeColor[1], border: `1.5px solid ${badgeColor[2]}` }}>{badgeColor[3]}</span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Submitted: {fmtDate(req.created_at)}</span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>ID: {req.id}</span>
                  </div>
                  <div style={{ fontWeight: 900, fontSize: '1.05rem', color: '#1e293b', marginBottom: 6 }}>{req.product_name}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: '0.83rem', color: '#475569' }}>
                    <span>🏬 <strong>{fmtLoc(req.branch_id)}</strong></span>
                    <span>📦 Qty: <strong>{Number(req.quantity)}</strong></span>
                    <span>💰 Unit: <strong>{fmtN(req.unit_price)}</strong></span>
                    <span>💳 Total Refund: <strong style={{ color: '#c41e3a', fontSize: '0.95rem' }}>{fmtN(req.refund_amount)}</strong></span>
                    {req.batch_no       && <span>🔖 Batch: <strong>{req.batch_no}</strong></span>}
                    {req.sale_reference && <span>🧾 Ref: <strong>{req.sale_reference}</strong></span>}
                  </div>
                  <div style={{ marginTop: 8, fontSize: '0.85rem', color: '#374151' }}><strong>Reason:</strong> {req.reason}</div>
                  <div style={{ marginTop: 4, fontSize: '0.78rem', color: '#94a3b8' }}>
                    Requested by: {req.requested_by || '—'}
                    {req.approved_by && ` · Processed by: ${req.approved_by}`}
                    {req.processed_at && ` on ${fmtDate(req.processed_at)}`}
                  </div>
                  {req.rejection_reason && (
                    <div style={{ marginTop: 6, padding: '6px 10px', background: '#fee2e2', borderRadius: 8, fontSize: '0.82rem', color: '#b91c1c' }}>
                      <strong>Rejection Reason:</strong> {req.rejection_reason}
                    </div>
                  )}
                </div>
                {/* Action buttons (pending only) */}
                {req.status === 'pending' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 170 }}>
                    <button onClick={() => handleApprove(req)} disabled={!!acting[req.id]}
                      style={{ padding: '9px 20px', background: acting[req.id] === 'approving' ? '#d1fae5' : 'linear-gradient(135deg,#16a34a,#15803d)', color: acting[req.id] === 'approving' ? '#15803d' : '#fff', border: 'none', borderRadius: 9, fontWeight: 800, fontSize: '0.88rem', cursor: acting[req.id] ? 'default' : 'pointer' }}>
                      {acting[req.id] === 'approving' ? '⏳ Approving…' : '✅ Approve Refund'}
                    </button>
                    <button onClick={() => setShowReject(s => ({ ...s, [req.id]: !s[req.id] }))} disabled={!!acting[req.id]}
                      style={{ padding: '9px 20px', background: '#fff', color: '#dc2626', border: '2px solid #fecaca', borderRadius: 9, fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer' }}>
                      ❌ Reject
                    </button>
                    {showReject[req.id] && (
                      <div>
                        <textarea
                          value={rejectionReasons[req.id] || ''}
                          onChange={e => setRejectionReasons(r => ({ ...r, [req.id]: e.target.value }))}
                          placeholder="Reason for rejection (required)…"
                          rows={2}
                          style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #fca5a5', borderRadius: 8, fontSize: '0.83rem', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                        />
                        <button onClick={() => handleReject(req)} disabled={!!acting[req.id]}
                          style={{ marginTop: 4, width: '100%', padding: '8px 0', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer' }}>
                          {acting[req.id] === 'rejecting' ? '⏳ Rejecting…' : 'Confirm Rejection'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Adjustment Requests History Tab ───────────────────────────────────────────
function AdjustmentsTab() {
  const { user } = useAuth();
  const [adjustments, setAdjustments]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [filter, setFilter]             = useState('pending');
  const [acting, setActing]             = useState({});    // { [id]: 'approving'|'rejecting' }
  const [gmNotes, setGmNotes]           = useState({});    // { [id]: string }
  const [showNotes, setShowNotes]       = useState({});    // { [id]: bool }
  const [alert, setAlert]               = useState(null);
  const [detail, setDetail]             = useState(null);

  const isGM = ['gm','manager','admin','superadmin','GM','Manager','Admin','SuperAdmin'].some(r =>
    (user?.role || user?.position || '').toLowerCase().includes(r.toLowerCase())
  );

  const load = () => {
    setLoading(true);
    api.get('/stock-adjustments')
      .then(d => setAdjustments(Array.isArray(d) ? d.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)) : []))
      .catch(() => setAdjustments([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const fmtDateTime = ts => { try { return ts ? new Date(ts).toLocaleString('en-ZA',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'; } catch { return '—'; } };
  const fmtDate = ts => { try { return ts ? new Date(ts).toLocaleDateString('en-ZA',{day:'2-digit',month:'short',year:'numeric'}) : '—'; } catch { return '—'; } };
  const timeAgo = ts => { if (!ts) return '—'; const s = Math.floor((Date.now()-new Date(ts))/1000); if(s<60) return `${s}s ago`; if(s<3600) return `${Math.floor(s/60)}m ago`; if(s<86400) return `${Math.floor(s/3600)}h ago`; return `${Math.floor(s/86400)}d ago`; };
  const fmtField = f => (f||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  const fmtLoc = loc => {
    const l = (loc||'').toLowerCase();
    if (l === 'country_stock') return 'Country Stock';
    if (l === 'windhoek_warehouse') return 'Windhoek WH';
    if (l === 'ondangwa_warehouse') return 'Ondangwa WH';
    const bd = BRANCH_DETAILS.find(b => b.id === l);
    return bd ? bd.name : (loc||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  };
  const targetLabel = t => {
    if (t === 'import' || t === 'country_stock') return 'Import / Country Stock Batch';
    if (t === 'warehouse') return 'Warehouse Batch';
    if (t === 'distribution') return 'Distribution Record';
    return fmtField(t);
  };
  const fieldDesc = (field, oldV, newV) => {
    if (field === 'remaining_quantity' || field === 'quantity') return `Change stock quantity from ${oldV||'—'} → ${newV} units`;
    if (field === 'expiry_date')  return `Change expiry date from ${fmtDate(oldV)} → ${fmtDate(newV)}`;
    if (field === 'unit_price')   return `Change unit cost from N$ ${oldV} → N$ ${newV}`;
    if (field === 'batch_number') return `Change batch # from "${oldV}" → "${newV}"`;
    if (field === 'notes')        return `Update notes`;
    return `Change ${fmtField(field)} from "${oldV}" → "${newV}"`;
  };

  // ── Actions ──────────────────────────────────────────────────────────────────
  const handleApprove = async (adj) => {
    setActing(a => ({...a, [adj.id]:'approving'}));
    try {
      await api.stock.approveAdjustment(adj.id, { gm_notes: gmNotes[adj.id] || '' });
      setAlert({ type:'success', msg:`✅ Request ${adj.adj_number} approved — changes applied immediately to ${targetLabel(adj.target_type)}` });
      setShowNotes(n => ({...n, [adj.id]:false}));
      load();
    } catch(e) {
      setAlert({ type:'error', msg:`Failed to approve: ${e.message}` });
    } finally {
      setActing(a => ({...a, [adj.id]:undefined}));
    }
  };

  const handleReject = async (adj) => {
    if (!gmNotes[adj.id]?.trim()) {
      setShowNotes(n => ({...n, [adj.id]:true}));
      setAlert({ type:'error', msg:'Please enter a reason for rejection in the GM Notes field before rejecting.' });
      return;
    }
    setActing(a => ({...a, [adj.id]:'rejecting'}));
    try {
      await api.stock.rejectAdjustment(adj.id, { gm_notes: gmNotes[adj.id] || '' });
      setAlert({ type:'success', msg:`❌ Request ${adj.adj_number} rejected.` });
      setShowNotes(n => ({...n, [adj.id]:false}));
      load();
    } catch(e) {
      setAlert({ type:'error', msg:`Failed to reject: ${e.message}` });
    } finally {
      setActing(a => ({...a, [adj.id]:undefined}));
    }
  };

  // ── Stats ────────────────────────────────────────────────────────────────────
  const pending  = adjustments.filter(a => a.status === 'pending');
  const today    = new Date().toISOString().slice(0,10);
  const approvedToday = adjustments.filter(a => a.status === 'approved' && (a.approved_at||'').slice(0,10) === today);
  const rejected = adjustments.filter(a => a.status === 'rejected');
  const filtered = filter === 'all' ? adjustments : adjustments.filter(a => a.status === filter);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} onClose={() => setAlert(null)}>{alert.msg}</Alert>}

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ background:'linear-gradient(135deg,#c41e3a,#8b0000)', borderRadius:14, padding:'16px 22px', color:'#fff', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
        <div>
          <h3 style={{ fontWeight:900, fontSize:'1.08rem', margin:0 }}>✏️ Stock Edit Requests</h3>
          <p style={{ fontSize:'0.8rem', opacity:0.8, margin:'3px 0 0' }}>
            All correction requests submitted for GM approval. {isGM ? 'As GM, you can approve or reject below.' : 'Requests you submit appear here for GM review.'}
          </p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {pending.length > 0 && <span style={{ background:'#fbbf24', color:'#78350f', borderRadius:99, padding:'5px 14px', fontSize:'0.8rem', fontWeight:800 }}>⏳ {pending.length} Awaiting GM</span>}
          <button onClick={load} style={{ padding:'7px 16px', background:'rgba(255,255,255,0.15)', color:'#fff', border:'1px solid rgba(255,255,255,0.35)', borderRadius:99, fontSize:'0.82rem', fontWeight:700, cursor:'pointer' }}>↺ Refresh</button>
        </div>
      </div>

      {/* ── Stat cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label:'Pending GM Approval', value:pending.length,       color:'#d97706', bg:'#fffbeb', border:'#fde68a' },
          { label:'Approved Today',      value:approvedToday.length,  color:'#16a34a', bg:'#f0fdf4', border:'#86efac' },
          { label:'Rejected',            value:rejected.length,       color:'#dc2626', bg:'#fef2f2', border:'#fecaca' },
          { label:'Total Requests',      value:adjustments.length,    color:'#374151', bg:'#f8fafc', border:'#e2e8f0' },
        ].map(s => (
          <div key={s.label} style={{ borderRadius:10, padding:'11px 14px', background:s.bg, border:`1.5px solid ${s.border}` }}>
            <div style={{ fontSize:'1.6rem', fontWeight:900, color:s.color, lineHeight:1 }}>{s.value}</div>
            <div style={{ fontSize:'0.69rem', color:'#64748b', fontWeight:700, marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filter tabs ─────────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {[['pending','Pending',pending.length],['approved','Approved',null],['rejected','Rejected',null],['all','All',adjustments.length]].map(([s,l,cnt]) => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ padding:'7px 18px', borderRadius:99, border:'none', cursor:'pointer', fontWeight:700, fontSize:'0.83rem',
              background:filter===s ? '#c41e3a' : '#f1f5f9', color:filter===s ? '#fff' : '#475569' }}>
            {l}{cnt !== null ? ` (${cnt})` : ''}
          </button>
        ))}
      </div>

      {/* ── Pending requests as full detail cards ────────────────────────── */}
      {filter === 'pending' && (
        <div className="space-y-3">
          {pending.length === 0 ? (
            <Card><CardBody><EmptyState icon={<CheckCircle size={40} />} title="No pending requests" description="All caught up! No stock edit requests are awaiting approval." /></CardBody></Card>
          ) : pending.map(adj => (
            <div key={adj.id} style={{ border:'2px solid #fde68a', borderRadius:14, background:'#fff', overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
              {/* ── Card header ── */}
              <div style={{ background:'linear-gradient(90deg,#fffbeb,#fef9c3)', padding:'12px 18px', display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:10 }}>
                <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                  <span style={{ background:'#fbbf24', color:'#78350f', borderRadius:99, padding:'3px 10px', fontWeight:800, fontSize:'0.73rem' }}>⏳ PENDING APPROVAL</span>
                  <span style={{ fontFamily:'monospace', fontSize:'0.75rem', fontWeight:800, color:'#6b21a8' }}>{adj.adj_number}</span>
                  <span style={{ fontSize:'0.72rem', color:'#64748b' }}>Submitted {timeAgo(adj.created_at)}</span>
                </div>
                <button onClick={() => setDetail(adj)}
                  style={{ fontSize:'0.72rem', color:'#2563eb', fontWeight:700, background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:6, padding:'3px 10px', cursor:'pointer' }}>
                  View Full Detail
                </button>
              </div>

              {/* ── Two column: requester + request details ── */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:0 }}>
                {/* Who is requesting */}
                <div style={{ padding:'16px 20px', borderRight:'1px solid #f1f5f9' }}>
                  <div style={{ fontSize:'0.68rem', fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>👤 Requested By</div>
                  <div style={{ fontWeight:900, color:'#1e293b', fontSize:'1rem', marginBottom:2 }}>{adj.requested_by_name || adj.requested_by || 'Unknown'}</div>
                  {adj.requested_by && adj.requested_by !== adj.requested_by_name && (
                    <div style={{ fontSize:'0.72rem', color:'#94a3b8', fontFamily:'monospace' }}>ID: {adj.requested_by}</div>
                  )}
                  {adj.location && (
                    <div style={{ marginTop:6 }}>
                      <span style={{ background:'#fff0f3', color:'#c41e3a', border:'1px solid #fecaca', borderRadius:99, padding:'2px 8px', fontSize:'0.7rem', fontWeight:800 }}>
                        📍 {fmtLoc(adj.location)}
                      </span>
                    </div>
                  )}
                  <div style={{ marginTop:8, fontSize:'0.72rem', color:'#64748b' }}>
                    <div><span style={{ color:'#94a3b8' }}>Date:</span> {fmtDateTime(adj.created_at)}</div>
                    <div style={{ marginTop:2 }}><span style={{ color:'#94a3b8' }}>Request type:</span> {targetLabel(adj.target_type)}</div>
                    {adj.target_id && <div style={{ marginTop:2 }}><span style={{ color:'#94a3b8' }}>Target ID:</span> <span style={{ fontFamily:'monospace', fontSize:'0.68rem' }}>{adj.target_id}</span></div>}
                  </div>
                </div>

                {/* What is being requested */}
                <div style={{ padding:'16px 20px' }}>
                  <div style={{ fontSize:'0.68rem', fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>📦 What is Being Requested</div>
                  {adj.product_name && (
                    <div style={{ fontWeight:800, color:'#1e293b', fontSize:'0.92rem', marginBottom:6 }}>{adj.product_name}</div>
                  )}
                  {/* Change being requested */}
                  <div style={{ background:'#f8fafc', borderRadius:10, padding:'10px 14px', marginBottom:8 }}>
                    <div style={{ fontSize:'0.7rem', color:'#64748b', fontWeight:700, marginBottom:4 }}>CHANGE REQUESTED:</div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      <span style={{ background:'#fef2f2', color:'#dc2626', border:'1px solid #fecaca', borderRadius:6, padding:'4px 10px', fontWeight:800, fontSize:'0.82rem' }}>
                        {adj.old_value !== undefined && adj.old_value !== null ? String(adj.old_value) : '—'}
                      </span>
                      <span style={{ color:'#94a3b8', fontWeight:700, fontSize:'1.1rem' }}>→</span>
                      <span style={{ background:'#f0fdf4', color:'#16a34a', border:'1px solid #86efac', borderRadius:6, padding:'4px 10px', fontWeight:800, fontSize:'0.82rem' }}>
                        {adj.new_value !== undefined ? String(adj.new_value) : '—'}
                      </span>
                    </div>
                    <div style={{ fontSize:'0.71rem', color:'#64748b', marginTop:5 }}>
                      Field: <strong>{fmtField(adj.field_to_adjust)}</strong> — {fieldDesc(adj.field_to_adjust, adj.old_value, adj.new_value)}
                    </div>
                  </div>
                  {/* Reason */}
                  <div style={{ background:'#fefce8', borderRadius:8, padding:'8px 12px', border:'1px solid #fef08a' }}>
                    <div style={{ fontSize:'0.68rem', color:'#92400e', fontWeight:800, marginBottom:2 }}>REASON / JUSTIFICATION:</div>
                    <div style={{ fontSize:'0.82rem', color:'#1e293b', fontWeight:600 }}>{adj.reason || 'No reason provided'}</div>
                  </div>
                </div>
              </div>

              {/* ── GM Action area (only visible to GMs) ── */}
              {isGM && (
                <div style={{ background:'#f8fafc', borderTop:'1px solid #e2e8f0', padding:'14px 20px' }}>
                  <div style={{ fontSize:'0.72rem', fontWeight:800, color:'#64748b', marginBottom:8, textTransform:'uppercase' }}>GM Action</div>
                  {/* Notes input */}
                  {(showNotes[adj.id] || gmNotes[adj.id]) && (
                    <div style={{ marginBottom:10 }}>
                      <textarea rows={2} value={gmNotes[adj.id]||''} onChange={e => setGmNotes(n => ({...n,[adj.id]:e.target.value}))}
                        placeholder="GM notes / reason for approval or rejection (required for rejection)…"
                        style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid #d1d5db', fontSize:'0.82rem', resize:'vertical', outline:'none', fontFamily:'inherit' }} />
                    </div>
                  )}
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                    {!showNotes[adj.id] && !gmNotes[adj.id] && (
                      <button onClick={() => setShowNotes(n=>({...n,[adj.id]:true}))}
                        style={{ padding:'6px 12px', background:'#f1f5f9', border:'1px solid #d1d5db', borderRadius:7, fontSize:'0.76rem', fontWeight:700, cursor:'pointer', color:'#64748b' }}>
                        + Add GM Notes
                      </button>
                    )}
                    <button onClick={() => handleApprove(adj)} disabled={!!acting[adj.id]}
                      style={{ padding:'8px 20px', background: acting[adj.id]==='approving' ? '#86efac' : '#16a34a', color:'#fff', border:'none', borderRadius:8, fontWeight:800, fontSize:'0.84rem', cursor:'pointer', display:'flex', alignItems:'center', gap:6, opacity:acting[adj.id]?0.7:1 }}>
                      <CheckCircle size={15} /> {acting[adj.id]==='approving' ? 'Approving & Applying…' : 'Approve & Apply Change'}
                    </button>
                    <button onClick={() => handleReject(adj)} disabled={!!acting[adj.id]}
                      style={{ padding:'8px 20px', background: acting[adj.id]==='rejecting' ? '#fca5a5' : '#dc2626', color:'#fff', border:'none', borderRadius:8, fontWeight:800, fontSize:'0.84rem', cursor:'pointer', display:'flex', alignItems:'center', gap:6, opacity:acting[adj.id]?0.7:1 }}>
                      <XCircle size={15} /> {acting[adj.id]==='rejecting' ? 'Rejecting…' : 'Reject Request'}
                    </button>
                    <span style={{ fontSize:'0.7rem', color:'#94a3b8' }}>Approval applies the change to stock immediately. Rejection requires GM notes.</span>
                  </div>
                </div>
              )}
              {!isGM && (
                <div style={{ background:'#f8fafc', borderTop:'1px solid #e2e8f0', padding:'10px 20px', fontSize:'0.75rem', color:'#94a3b8' }}>
                  ⏳ Awaiting GM review. You will be notified once a decision is made.
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Approved / Rejected / All — table view ──────────────────────── */}
      {filter !== 'pending' && (
        <Card>
          <CardHeader>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
              <h3 style={{ fontWeight:800, color:'#1e293b' }}>
                {filter === 'approved' ? '✅ Approved Requests' : filter === 'rejected' ? '❌ Rejected Requests' : '📋 All Requests'}
                <span style={{ fontSize:'0.72rem', color:'#94a3b8', fontWeight:400, marginLeft:8 }}>({filtered.length})</span>
              </h3>
              <div style={{ fontSize:'0.72rem', color:'#64748b' }}>Click any row for full details</div>
            </div>
          </CardHeader>
          {filtered.length === 0 ? (
            <CardBody><EmptyState icon={<Package size={36} />} title="No records" description="No requests match this filter" /></CardBody>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8rem' }}>
                <thead>
                  <tr style={{ background:'#f8fafc', borderBottom:'2px solid #e2e8f0' }}>
                    {['Ref #','Requested By','Product','Location','Change','Reason','Status','Decided By','GM Notes','Date'].map(h => (
                      <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontWeight:700, color:'#475569', fontSize:'0.68rem', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((adj, i) => (
                    <tr key={adj.id} onClick={() => setDetail(adj)} style={{ background:i%2===0?'#fff':'#f9fafb', borderBottom:'1px solid #f1f5f9', cursor:'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background='#fef2f2'}
                      onMouseLeave={e => e.currentTarget.style.background=i%2===0?'#fff':'#f9fafb'}>
                      <td style={{ padding:'8px 12px', fontFamily:'monospace', fontSize:'0.71rem', fontWeight:800, color:'#6b21a8', whiteSpace:'nowrap' }}>{adj.adj_number}</td>
                      <td style={{ padding:'8px 12px', fontWeight:700, color:'#1e293b', whiteSpace:'nowrap' }}>
                        {adj.requested_by_name || adj.requested_by || '—'}
                        {adj.location && <div style={{ fontSize:'0.65rem', color:'#c41e3a', fontWeight:700 }}>{fmtLoc(adj.location)}</div>}
                      </td>
                      <td style={{ padding:'8px 12px', maxWidth:180 }}>
                        <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={adj.product_name}>{adj.product_name || '—'}</div>
                        <div style={{ fontSize:'0.65rem', color:'#94a3b8' }}>{targetLabel(adj.target_type)}</div>
                      </td>
                      <td style={{ padding:'8px 12px', fontSize:'0.72rem', color:'#64748b' }}>{fmtLoc(adj.location)}</td>
                      <td style={{ padding:'8px 12px', whiteSpace:'nowrap' }}>
                        <span style={{ background:'#fef2f2', color:'#dc2626', borderRadius:4, padding:'1px 5px', fontSize:'0.7rem', fontWeight:700 }}>{String(adj.old_value||'—')}</span>
                        <span style={{ color:'#94a3b8', margin:'0 4px' }}>→</span>
                        <span style={{ background:'#f0fdf4', color:'#16a34a', borderRadius:4, padding:'1px 5px', fontSize:'0.7rem', fontWeight:700 }}>{String(adj.new_value||'—')}</span>
                        <div style={{ fontSize:'0.63rem', color:'#94a3b8', marginTop:1 }}>{fmtField(adj.field_to_adjust)}</div>
                      </td>
                      <td style={{ padding:'8px 12px', maxWidth:160 }}>
                        <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:'0.75rem', color:'#64748b' }} title={adj.reason}>{adj.reason||'—'}</div>
                      </td>
                      <td style={{ padding:'8px 12px', whiteSpace:'nowrap' }}>
                        {adj.status==='approved' && <span style={{ background:'#f0fdf4', color:'#16a34a', borderRadius:99, padding:'2px 8px', fontSize:'0.68rem', fontWeight:800, border:'1px solid #86efac' }}>✅ Approved</span>}
                        {adj.status==='rejected' && <span style={{ background:'#fef2f2', color:'#dc2626', borderRadius:99, padding:'2px 8px', fontSize:'0.68rem', fontWeight:800, border:'1px solid #fecaca' }}>❌ Rejected</span>}
                        {adj.status==='pending'  && <span style={{ background:'#fffbeb', color:'#d97706', borderRadius:99, padding:'2px 8px', fontSize:'0.68rem', fontWeight:800, border:'1px solid #fde68a' }}>⏳ Pending</span>}
                      </td>
                      <td style={{ padding:'8px 12px', fontSize:'0.72rem', color:'#64748b', whiteSpace:'nowrap' }}>
                        {adj.approved_by_name || adj.approved_by || '—'}
                        {adj.approved_at && <div style={{ fontSize:'0.63rem', color:'#94a3b8' }}>{fmtDate(adj.approved_at)}</div>}
                      </td>
                      <td style={{ padding:'8px 12px', maxWidth:140 }}>
                        <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:'0.72rem', color:'#64748b', fontStyle:'italic' }} title={adj.gm_notes}>{adj.gm_notes || <span style={{ color:'#e2e8f0' }}>—</span>}</div>
                      </td>
                      <td style={{ padding:'8px 12px', fontSize:'0.72rem', color:'#94a3b8', whiteSpace:'nowrap' }}>{fmtDateTime(adj.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ── Full Detail Modal ─────────────────────────────────────────────── */}
      {detail && (
        <Modal open={!!detail} onClose={() => setDetail(null)} title={`Edit Request — ${detail.adj_number}`} size="md">
          <div className="p-6 space-y-4">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[
                ['Ref Number',    detail.adj_number],
                ['Status',        (detail.status||'').toUpperCase()],
                ['Requested By',  detail.requested_by_name || detail.requested_by || '—'],
                ['Requester ID',  detail.requested_by || '—'],
                ['Branch / Location', fmtLoc(detail.location)],
                ['Request Type',  targetLabel(detail.target_type)],
                ['Target Record', detail.target_id || '—'],
                ['Product',       detail.product_name || '—'],
                ['Field Changed', fmtField(detail.field_to_adjust)],
                ['Old Value',     String(detail.old_value ?? '—')],
                ['New Value',     String(detail.new_value ?? '—')],
                ['Reason',        detail.reason || '—'],
                ['Submitted',     fmtDateTime(detail.created_at)],
                ['Decided By',    detail.approved_by_name || detail.approved_by || '—'],
                ['Decision Date', fmtDateTime(detail.approved_at)],
                ['GM Notes',      detail.gm_notes || '—'],
              ].map(([k,v]) => (
                <div key={k} style={{ background:'#f8fafc', borderRadius:8, padding:'8px 12px' }}>
                  <div style={{ fontSize:'0.65rem', color:'#94a3b8', fontWeight:700, textTransform:'uppercase' }}>{k}</div>
                  <div style={{ fontSize:'0.86rem', fontWeight:700, color:'#1e293b', marginTop:1, wordBreak:'break-word' }}>{v}</div>
                </div>
              ))}
            </div>
            {detail.status === 'pending' && isGM && (
              <div style={{ background:'#fffbeb', border:'1.5px solid #fde68a', borderRadius:10, padding:'14px 16px' }}>
                <div style={{ fontWeight:800, color:'#92400e', fontSize:'0.8rem', marginBottom:8 }}>Take Action</div>
                <textarea rows={2} value={gmNotes[detail.id]||''} onChange={e => setGmNotes(n=>({...n,[detail.id]:e.target.value}))}
                  placeholder="GM notes (required for rejection)…"
                  style={{ width:'100%', padding:'8px 12px', borderRadius:8, border:'1px solid #d1d5db', fontSize:'0.82rem', resize:'vertical', fontFamily:'inherit', marginBottom:10 }} />
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => { handleApprove(detail); setDetail(null); }} disabled={!!acting[detail.id]}
                    style={{ padding:'8px 20px', background:'#16a34a', color:'#fff', border:'none', borderRadius:8, fontWeight:800, fontSize:'0.84rem', cursor:'pointer' }}>
                    ✅ Approve & Apply
                  </button>
                  <button onClick={() => { handleReject(detail); setDetail(null); }} disabled={!!acting[detail.id]}
                    style={{ padding:'8px 20px', background:'#dc2626', color:'#fff', border:'none', borderRadius:8, fontWeight:800, fontSize:'0.84rem', cursor:'pointer' }}>
                    ❌ Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
export default function StockPortal() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('aiDashboard');
  const [globalBranch, setGlobalBranch] = useState(user?.branch || 'all');

  const tabs = [
    { id: 'aiDashboard', label: 'Command Center', icon: '🧠' },
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'branchStock', label: 'Branch Stock', icon: '🏪' },
    { id: 'stockReports', label: 'Stock Reports', icon: '📋' },
    { id: 'supplierImport', label: 'Supplier Import', icon: '🚢' },
    { id: 'countryStock', label: 'Country Stock', icon: '🌍' },
    { id: 'warehouses', label: 'Warehouses', icon: '🏭' },
    { id: 'distribution', label: 'Distribution', icon: '🚚' },
    { id: 'transfers', label: 'Transfers', icon: '🔄' },
    { id: 'inventory', label: 'Inventory', icon: '📦' },
    { id: 'orders', label: 'Orders', icon: '🧾' },
    { id: 'valuation', label: 'Valuation', icon: '💎' },
    { id: 'barcode', label: 'Barcode', icon: '🏷️' },
    { id: 'reorder', label: 'Reorder', icon: '🤖' },
    { id: 'batch', label: 'Batch', icon: '🔢' },
    { id: 'writeOffs', label: 'Write-Offs', icon: '❌' },
    { id: 'realtime', label: 'Realtime', icon: '⚡' },
    { id: 'fieldStock', label: 'Field Stock', icon: '👥' },
    { id: 'refundApprovals', label: 'Refund Approvals', icon: '↩️' },
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
            <Brain size={24} className="text-primary" /> Stock Management System
          </h1>
          <p className="text-sm text-gray-500">Intelligent inventory control · Branch-connected · Real-time insights</p>
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
        {activeTab === 'warehouses' && <WarehousesTab />}
        {activeTab === 'distribution' && <DistributionTab branch={globalBranch} />}
        {activeTab === 'transfers' && <TransfersTab branch={globalBranch} />}
        {activeTab === 'inventory' && <InventoryTab branch={globalBranch} />}
        {activeTab === 'orders' && <OrdersTab branch={globalBranch} />}
        {activeTab === 'valuation' && <ValuationTab branch={globalBranch} />}
        {activeTab === 'barcode' && <BarcodeTab />}
        {activeTab === 'reorder' && <SmartReorderTab branch={globalBranch} />}
        {activeTab === 'batch' && <BatchTab branch={globalBranch} />}
        {activeTab === 'writeOffs' && <WriteOffsTab branch={globalBranch} />}
        {activeTab === 'realtime' && <RealtimeTab branch={globalBranch} />}
        {activeTab === 'fieldStock' && <FieldStockTab />}
        {activeTab === 'refundApprovals' && <RefundApprovalsTab />}
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
      api.prices.list().catch(() => []),
      api.stock.batches().then(d => Array.isArray(d) ? d : d.batches || []).catch(() => []),
      api.stock.movements().then(d => Array.isArray(d) ? d : d.movements || []).catch(() => []),
      api.stock.transfers().then(d => Array.isArray(d) ? d : d.transfers || []).catch(() => []),
      api.branch.walkinSales().then(d => Array.isArray(d) ? d : d.sales || d.walkin_sales || []).catch(() => []),
      api.branch.stockSummary().then(d => d.branches || []).catch(() => []),
    ]).then(([priceData, batches, movements, transfers, sales, branchData]) => {
      if (Array.isArray(priceData) && priceData.length > 0) setLivePrices(priceData);
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
    quantity: inv.quantity, unit_price: inv.unit_price || getCIFPrice(inv.product_name || ''),
    location: br.branch_id,
  })));
  const allBatches = [...filteredBatches, ...branchBatchesFlat];

  const now = new Date();
  const thirtyFwd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const ninetyFwd = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  const effQty = (b) => Number(b.remaining_quantity || b.quantity || 0);
  const totalQty = allBatches.reduce((s, b) => s + effQty(b), 0);
  const totalValue = allBatches.reduce((s, b) => s + effQty(b) * (Number(b.unit_price || 0) || getDPCPrice(b.product_name || '')), 0);
  const expiredBatches = allBatches.filter(b => b.expiry_date && new Date(b.expiry_date) < now && effQty(b) > 0);
  const expiringBatches = allBatches.filter(b => b.expiry_date && new Date(b.expiry_date) > now && new Date(b.expiry_date) <= thirtyFwd);

  const productTotals = {};
  allBatches.forEach(b => {
    if (!productTotals[b.product_name]) productTotals[b.product_name] = { qty: 0, location: b.location };
    productTotals[b.product_name].qty += effQty(b);
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
              <h2 style={{ fontWeight: 900, fontSize: '1.15rem', margin: 0 }}>🧠 Stock Command Center</h2>
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
          <Cpu size={16} className="text-primary" /> Stock Insights
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
              <h3 className="font-bold text-gray-800 flex items-center gap-2"><Target size={16} className="text-primary" /> Reorder Recommendations</h3>
              <Button size="sm" variant="secondary" onClick={() => {
                const rows = reorderRecs.map(r => `<tr><td>${r.product_name}</td><td>${fmtLocation(r.location)}</td><td>${r.priority.label}</td><td>${r.qty}</td><td>${r.dailyRate}/day</td><td>${r.daysOfStock === 999 ? '—' : r.daysOfStock + ' days'}</td><td>${r.suggestedOrder}</td></tr>`).join('');
                printDocument('Reorder Recommendations', `<table><thead><tr><th>Product</th><th>Location</th><th>Priority</th><th>Current Qty</th><th>Daily Rate</th><th>Days Left</th><th>Suggested Order</th></tr></thead><tbody>${rows}</tbody></table>`);
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
  const [data, setData] = useState({ batches: [], movements: [], transfers: [], imports: [], fieldStock: [], branchData: [], locationBreakdown: [] });
  const [loading, setLoading] = useState(true);

  const loadOverview = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.prices.list().catch(() => []),
      api.stock.batches().then(d => Array.isArray(d) ? d : d.batches || []).catch(() => []),
      api.stock.movements().then(d => Array.isArray(d) ? d : d.movements || []).catch(() => []),
      api.stock.transfers().then(d => Array.isArray(d) ? d : d.transfers || []).catch(() => []),
      api.stock.supplierImports().catch(() => []),
      api.stock.fieldStock().catch(() => []),
      api.branch.stockSummary().then(d => d.branches || []).catch(() => []),
      api.stock.countryStock().then(d => d.locationBreakdown || []).catch(() => []),
    ]).then(([priceData, batches, movements, transfers, imports, fieldStock, branchData, locationBreakdown]) => {
      if (Array.isArray(priceData) && priceData.length > 0) setLivePrices(priceData);
      setData({
        batches,
        movements,
        transfers,
        imports: Array.isArray(imports) ? imports : [],
        fieldStock: Array.isArray(fieldStock) ? fieldStock : [],
        branchData,
        locationBreakdown: Array.isArray(locationBreakdown) ? locationBreakdown : [],
      });
    }).finally(() => setLoading(false));
  }, []);

  useStockRealtime({ onUpdate: loadOverview });
  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => {
    const iv = setInterval(loadOverview, 60000);
    return () => clearInterval(iv);
  }, [loadOverview]);

  if (loading) return <LoadingSpinner />;

  const filterBatch = (b) => branch === 'all' || (b.location || '').toLowerCase().replace(/\s+/g, '_') === branch;
  const filteredBatches = data.batches.filter(filterBatch);
  const WAREHOUSE_LOCS = new Set(['country_stock', 'windhoek_warehouse', 'ondangwa_warehouse']);
  const isWarehouseLoc = (loc) => {
    if (!loc) return false;
    const s = loc.toLowerCase().replace(/\s+/g, '_');
    return WAREHOUSE_LOCS.has(s) || s.includes('warehouse') || s === 'country_stock';
  };
  const warehouseMovements = data.movements.filter(m =>
    isWarehouseLoc(m.source_location) || isWarehouseLoc(m.destination_location)
  );
  const filteredMovements = branch === 'all'
    ? warehouseMovements
    : warehouseMovements.filter(m =>
        (m.location || m.source_location || m.destination_location || '').toLowerCase().replace(/\s+/g, '_') === branch
      );

  const branchTotalQty = data.branchData.reduce((s, br) => s + (br.closing_qty || 0), 0);
  const branchTotalDPC = data.branchData.reduce((s, br) => {
    return s + (br.inventory || []).reduce((si, inv) => {
      const qty = Number(inv.quantity || 0);
      return si + qty * (getDPCPrice(inv.product_name || '') || Number(inv.unit_price || 0));
    }, 0);
  }, 0);

  const warehouseQty = filteredBatches.reduce((sum, b) => sum + Number(b.remaining_quantity || b.quantity || 0), 0);
  const totalItems = warehouseQty + branchTotalQty;
  const totalCIF = filteredBatches.reduce((sum, b) => {
    const qty = Number(b.remaining_quantity || b.quantity || 0);
    const cif = getBatchCIF(b);
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
  const whkBatches = data.batches.filter(b => b.location === 'windhoek_warehouse');
  const ondBatches = data.batches.filter(b => b.location === 'ondangwa_warehouse');
  // Use inventory_balances (locationBreakdown) for accurate qty — stock_batches.remaining_quantity
  // can drift from the true balance tracked in inventory_balances via stock_movements.
  const lb = data.locationBreakdown || [];
  const csEntry  = lb.find(l => l.locationId === 'country_stock');
  const whkEntry = lb.find(l => l.locationId === 'windhoek_warehouse');
  const ondEntry = lb.find(l => l.locationId === 'ondangwa_warehouse');
  const countryQty = csEntry  ? Number(csEntry.totalUnits  || 0) : countryBatches.reduce((s, b) => s + Number(b.remaining_quantity || b.quantity || 0), 0);
  const whkQty    = whkEntry  ? Number(whkEntry.totalUnits || 0) : whkBatches.reduce((s, b) => s + Number(b.remaining_quantity || b.quantity || 0), 0);
  const ondQty    = ondEntry  ? Number(ondEntry.totalUnits || 0) : ondBatches.reduce((s, b) => s + Number(b.remaining_quantity || b.quantity || 0), 0);
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
              <h3 className="font-bold text-gray-800">Recent Warehouse Movements {branch !== 'all' && <span className="text-xs text-gray-400 font-normal">— {fmtLocation(branch)}</span>}</h3>
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
                byLoc[label].cifValue += qty * getBatchCIF(b);
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
              { header: 'CIF Total', render: r => formatCurrency(Number(r.cif_total_value) > 0 ? Number(r.cif_total_value) : getBatchCIF(r) * Number(r.quantity || 0)) },
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
  const [productOptions, setProductOptions] = useState([]);

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
        const namesSet = new Set();
        if (priceData.status === 'fulfilled') {
          const prices = Array.isArray(priceData.value) ? priceData.value : [];
          if (prices.length > 0) setLivePrices(prices);
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
            { header: 'CIF/unit', render: r => formatCurrency(getBatchCIF(r)) },
            { header: 'CIF Total', render: r => {
              const cif = Number(r.cif_total_value || 0) || (Number(r.quantity || 0) * getBatchCIF(r));
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
  const [releaseItems, setReleaseItems] = useState([]);
  const [releaseNotes, setReleaseNotes] = useState('');
  const [releasing, setReleasing] = useState(false);
  const [releaseAlert, setReleaseAlert] = useState(null);

  const [editRecord, setEditRecord] = useState(null);

  const isAdmin = ['admin', 'superadmin', 'super_admin'].includes((user?.role || '').toLowerCase());

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
    setReleaseItems([{ productName: item.productName, batchNo: item.batchNo, expiryDate: item.expiryDate, qtyWindhoek: '', qtyOndangwa: '', availableQty: item.closingQty }]);
    setReleaseNotes('');
    setReleaseAlert(null);
    setReleaseOpen(true);
  };

  const handleRelease = async (e) => {
    e.preventDefault();
    const actor = user?.full_name || user?.username || 'system';

    // Build per-warehouse item lists
    const windhoekItems = releaseItems
      .filter(i => Number(i.qtyWindhoek) > 0)
      .map(i => ({ productName: i.productName, batchNo: i.batchNo, expiryDate: i.expiryDate, quantity: Number(i.qtyWindhoek) }));
    const ondangwaItems = releaseItems
      .filter(i => Number(i.qtyOndangwa) > 0)
      .map(i => ({ productName: i.productName, batchNo: i.batchNo, expiryDate: i.expiryDate, quantity: Number(i.qtyOndangwa) }));

    if (windhoekItems.length === 0 && ondangwaItems.length === 0) {
      setReleaseAlert({ type: 'error', msg: 'Enter at least one quantity (Windhoek or Ondangwa) greater than 0' });
      return;
    }

    // Validate totals don't exceed available stock per item
    for (const item of releaseItems) {
      const total = Number(item.qtyWindhoek || 0) + Number(item.qtyOndangwa || 0);
      if (total > Number(item.availableQty)) {
        setReleaseAlert({ type: 'error', msg: `Combined quantity for "${item.productName}" (${total}) exceeds available country stock (${item.availableQty})` });
        return;
      }
    }

    setReleasing(true);
    try {
      const refs = [];
      if (windhoekItems.length > 0) {
        const r = await api.stock.releaseToWarehouse({ warehouseId: 'windhoek_warehouse', items: windhoekItems, releasedBy: actor, notes: releaseNotes || undefined });
        refs.push(`Windhoek: ${r.referenceId}`);
      }
      if (ondangwaItems.length > 0) {
        const r = await api.stock.releaseToWarehouse({ warehouseId: 'ondangwa_warehouse', items: ondangwaItems, releasedBy: actor, notes: releaseNotes || undefined });
        refs.push(`Ondangwa: ${r.referenceId}`);
      }
      const destLabel = refs.length === 2 ? 'both warehouses' : refs.length === 1 && windhoekItems.length > 0 ? 'Windhoek Warehouse' : 'Ondangwa Warehouse';
      setReleaseAlert({ type: 'success', msg: `Dispatch submitted for GM approval — stock released to ${destLabel}. (${refs.join(' · ')}) Stock remains at Country Stock until each warehouse confirms receipt.` });
      setTimeout(() => { setReleaseOpen(false); loadData(); }, 2200);
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
            <button onClick={() => { setReleaseItems([]); setReleaseNotes(''); setReleaseAlert(null); setReleaseOpen(true); }}
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
              { header: '', render: r => (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {r.closingQty > 0 && (
                    <button onClick={() => openReleaseModal(r)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 12px', background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 6, cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700 }}>
                      <ArrowLeftRight size={12} /> Release
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={() => setEditRecord(r)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 6, cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700 }}>
                      <Edit2 size={11} /> Edit
                    </button>
                  )}
                </div>
              ) },
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

      <Modal open={releaseOpen} onClose={() => setReleaseOpen(false)} title="Release Imported Stock to Warehouses" size="xl">
        <form onSubmit={handleRelease} className="p-6 space-y-5">
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', fontSize: '0.83rem', color: '#1e40af', display: 'flex', gap: 8 }}>
            <span style={{ fontSize: '1rem' }}>🏭</span>
            <span>Enter how many units of each batch to send to <strong>Windhoek Warehouse</strong> and/or <strong>Ondangwa Warehouse</strong>. You can split a single batch across both. Leave a field blank (or 0) to skip that warehouse.</span>
          </div>
          {releaseAlert && <Alert type={releaseAlert.type}>{releaseAlert.msg}</Alert>}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">Items to Dispatch <span className="text-red-500">*</span></label>
              <button type="button" onClick={() => setReleaseItems(prev => [...prev, { productName: '', batchNo: '', expiryDate: '', qtyWindhoek: '', qtyOndangwa: '', availableQty: 0, batchKey: '' }])}
                style={{ padding: '4px 10px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 6, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
                + Add Row
              </button>
            </div>

            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr 1fr auto', gap: 8, padding: '4px 10px' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Product / Batch</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>🏢 Windhoek</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>🏬 Ondangwa</span>
              <span />
            </div>

            {releaseItems.length === 0 && (
              <p className="text-sm text-gray-400 italic px-2">No items selected. Use "+ Add Row" or click "Release" on a batch in the table above.</p>
            )}

            {releaseItems.map((item, idx) => {
              const total = Number(item.qtyWindhoek || 0) + Number(item.qtyOndangwa || 0);
              const overLimit = item.availableQty > 0 && total > item.availableQty;
              return (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr 1fr auto', gap: 8, alignItems: 'center', padding: '8px 10px', background: overLimit ? '#fef2f2' : '#f8fafc', borderRadius: 8, border: `1px solid ${overLimit ? '#fecaca' : '#e2e8f0'}` }}>
                  {/* Product info or selector */}
                  <div>
                    {item.productName ? (
                      <div>
                        <div className="text-sm font-semibold text-gray-800">{item.productName}</div>
                        <div className="text-xs text-gray-500">
                          {item.batchNo ? <>Batch: <span className="font-mono">{item.batchNo}</span></> : 'No batch'}
                          {item.expiryDate ? ` · Exp: ${formatDate(item.expiryDate)}` : ''}
                          {item.availableQty > 0 && <span className={`ml-2 font-semibold ${overLimit ? 'text-red-600' : 'text-gray-400'}`}>({total}/{item.availableQty} avail)</span>}
                        </div>
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
                        <option value="">Select product + batch…</option>
                        {data.items.filter(i => i.closingQty > 0).map(i => (
                          <option key={`${i.productName}||${i.batchNo}`} value={`${i.productName}||${i.batchNo}`}>
                            {i.productName} — Batch: {i.batchNo || 'N/A'} (Avail: {i.closingQty}){i.expiryDate ? ` · Exp: ${formatDate(i.expiryDate)}` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  {/* Windhoek qty */}
                  <div className="flex flex-col items-center gap-0.5">
                    <input type="number" min="0" max={item.availableQty || undefined} value={item.qtyWindhoek}
                      onChange={e => setReleaseItems(prev => prev.map((r, i) => i === idx ? { ...r, qtyWindhoek: e.target.value } : r))}
                      placeholder="0"
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #bfdbfe', background: '#eff6ff', textAlign: 'center', fontSize: '0.88rem', fontWeight: 700, color: '#1e40af' }} />
                  </div>
                  {/* Ondangwa qty */}
                  <div className="flex flex-col items-center gap-0.5">
                    <input type="number" min="0" max={item.availableQty || undefined} value={item.qtyOndangwa}
                      onChange={e => setReleaseItems(prev => prev.map((r, i) => i === idx ? { ...r, qtyOndangwa: e.target.value } : r))}
                      placeholder="0"
                      style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #bbf7d0', background: '#f0fdf4', textAlign: 'center', fontSize: '0.88rem', fontWeight: 700, color: '#065f46' }} />
                  </div>
                  <button type="button" onClick={() => setReleaseItems(prev => prev.filter((_, i) => i !== idx))}
                    style={{ padding: '4px 8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
                </div>
              );
            })}
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Notes (optional)</label>
            <textarea value={releaseNotes} onChange={e => setReleaseNotes(e.target.value)} rows={2}
              placeholder="Add any dispatch notes…"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary resize-none" />
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="submit" disabled={releasing || (
              releaseItems.filter(i => Number(i.qtyWindhoek) > 0 || Number(i.qtyOndangwa) > 0).length === 0
            )}>
              <ArrowLeftRight size={15} /> {releasing ? 'Dispatching…' : 'Dispatch to Warehouses'}
            </Button>
            <Button variant="secondary" type="button" onClick={() => setReleaseOpen(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>

      <RequestAdjustmentModal
        open={!!adjRecord} onClose={() => setAdjRecord(null)}
        record={adjRecord} targetType="country_stock" location="country_stock"
      />

      <AdminCountryStockEditModal
        open={!!editRecord}
        record={editRecord}
        onClose={() => setEditRecord(null)}
        onSaved={() => { setEditRecord(null); loadData(); }}
      />
    </div>
  );
}

function AdminCountryStockEditModal({ open, record, onClose, onSaved }) {
  const { user } = useAuth();
  const [remainingQty, setRemainingQty] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [newBatchNo, setNewBatchNo] = useState('');
  const [unitDp, setUnitDp] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    if (record) {
      setRemainingQty(String(record.closingQty ?? ''));
      setExpiryDate(record.expiryDate ? record.expiryDate.slice(0, 10) : '');
      setNewBatchNo(record.batchNo || '');
      setUnitDp(String(record.unitDP ?? ''));
      setNotes('');
      setReason('');
      setAlert(null);
    }
  }, [record]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!reason.trim()) { setAlert({ type: 'error', msg: 'Reason is required' }); return; }
    setSaving(true);
    setAlert(null);
    try {
      await api.stock.editCountryStock({
        productName: record.productName,
        batchNo: record.batchNo,
        remainingQty: remainingQty !== '' ? Number(remainingQty) : undefined,
        expiryDate: expiryDate || undefined,
        newBatchNo: newBatchNo !== record.batchNo ? newBatchNo : undefined,
        unitDp: unitDp !== '' ? Number(unitDp) : undefined,
        notes: notes || undefined,
        reason,
      });
      setAlert({ type: 'success', msg: 'Stock record updated successfully.' });
      setTimeout(() => onSaved(), 800);
    } catch (err) {
      setAlert({ type: 'error', msg: err.message || 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit Country Stock Record (Admin)" size="md">
      {record && (
        <form onSubmit={handleSave} className="p-6 space-y-4">
          <Alert type="warning">
            This is a direct admin edit. Changes take effect immediately without GM approval. All edits are logged for audit.
          </Alert>
          {alert && <Alert type={alert.type}>{alert.msg}</Alert>}

          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px' }}>
            <p className="text-xs text-gray-500 font-semibold mb-0.5">Editing</p>
            <p className="text-sm font-bold text-gray-800">{record.productName}</p>
            <p className="text-xs text-gray-500">Batch: {record.batchNo || '—'} · Current qty: {record.closingQty?.toLocaleString()}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700">Quantity on Hand</label>
              <input type="number" min="0" step="1" value={remainingQty} onChange={e => setRemainingQty(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700">Unit DP (N$)</label>
              <input type="number" min="0" step="0.01" value={unitDp} onChange={e => setUnitDp(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700">Batch Number</label>
              <input type="text" value={newBatchNo} onChange={e => setNewBatchNo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary" />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700">Expiry Date</label>
              <input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary" />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-gray-700">Internal Notes (optional)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Physical recount correction"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary" />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-gray-700">Reason for Change <span className="text-red-500">*</span></label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} required
              placeholder="State why this record is being corrected (e.g. data entry error, physical stocktake discrepancy)..."
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary resize-y" />
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="submit" disabled={saving}><Edit2 size={14} /> {saving ? 'Saving…' : 'Save Changes'}</Button>
            <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          </div>
        </form>
      )}
    </Modal>
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
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [alert, setAlert] = useState(null);
  const [adjRecord, setAdjRecord] = useState(null);
  const [subTab, setSubTab] = useState('inventory');
  const [outboundSearch, setOutboundSearch] = useState('');
  const [outboundStatusFilter, setOutboundStatusFilter] = useState('');
  const [viewAuditTransfer, setViewAuditTransfer] = useState(null);
  const [viewDispatchNoteTransfer, setViewDispatchNoteTransfer] = useState(null);
  const [mvDateFrom, setMvDateFrom] = useState('');
  const [mvDateTo, setMvDateTo] = useState('');
  const [mvTypeFilter, setMvTypeFilter] = useState('');
  const [mvProductSearch, setMvProductSearch] = useState('');
  const [writeoffReturns, setWriteoffReturns] = useState([]);
  const location = name.toLowerCase() + '_warehouse';
  const whKey = name.toLowerCase();

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.stock.batches().then(d => (Array.isArray(d) ? d : d.batches || []).filter(b => b.location === location)).catch(() => []),
      api.stock.transfers(`branch=${encodeURIComponent(location)}`).then(d => Array.isArray(d) ? d : d.transfers || []).catch(() => []),
      api.stock.transfers(`fromWarehouse=${encodeURIComponent(location)}`).then(d => Array.isArray(d) ? d : d.transfers || []).catch(() => []),
      api.stock.movements().then(d => Array.isArray(d) ? d : d.movements || []).catch(() => []),
      api.stock.warehouseReturns(whKey).then(d => Array.isArray(d) ? d : d.returns || []).catch(() => []),
    ])
      .then(([batchData, inbound, outbound, movData, returnsData]) => {
        setBatches(batchData);
        setIncomingTransfers(inbound.filter(t => t.status !== 'cancelled'));
        setOutboundTransfers(outbound.filter(t => t.status !== 'cancelled'));
        const locKey = location.toLowerCase();
        setMovements(movData.filter(m => {
          const src = (m.source_location || '').toLowerCase();
          const dst = (m.destination_location || '').toLowerCase();
          return src.includes(locKey) || dst.includes(locKey) || src.includes(name.toLowerCase()) || dst.includes(name.toLowerCase());
        }));
        setWriteoffReturns(returnsData);
      })
      .finally(() => setLoading(false));
  }, [location, name, whKey]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const iv = setInterval(loadData, 60000);
    return () => clearInterval(iv);
  }, [loadData]);

  const handleAcceptDispatch = async (transfer) => {
    setReceivingId(transfer.id);
    try {
      await api.stock.warehouseReceiveStock({
        transferId: transfer.id,
        action: 'accept',
        receivedBy: user?.full_name || user?.username,
      });
      setAlert({ type: 'success', msg: `✅ Stock accepted into ${name} Warehouse — inventory updated` });
      setTimeout(() => loadData(), 100);
    } catch (err) {
      setAlert({ type: 'error', msg: err.message || 'Failed to accept dispatch' });
    } finally {
      setReceivingId(null);
    }
  };

  const handleRejectDispatch = async (transfer, reason) => {
    setRejectingId(transfer.id);
    try {
      await api.stock.warehouseReceiveStock({
        transferId: transfer.id,
        action: 'reject',
        rejectionReason: reason || 'Rejected by warehouse',
      });
      setAlert({ type: 'warning', msg: `❌ Dispatch rejected — stock remains in Country Stock. Stock Controller notified.` });
      setRejectModal(null);
      setRejectReason('');
      setTimeout(() => loadData(), 100);
    } catch (err) {
      setAlert({ type: 'error', msg: err.message || 'Failed to reject dispatch' });
    } finally {
      setRejectingId(null);
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
    const id = (batch.id || '').toUpperCase();
    if (id.startsWith('SB-WO-') || notes.includes('write-off return') || notes.includes('write_off_return') || notes.includes('returned from branch')) return 'Branch Return';
    return 'Country Stock';
  };

  const returnsMap = writeoffReturns.reduce((m, r) => {
    const key = (r.batch_no || '').toLowerCase() + '||' + (r.product_name || '').toLowerCase();
    if (!m[key]) m[key] = r;
    return m;
  }, {});

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
    const from = (t.fromWarehouse || t.from_warehouse || t.from_location || '').toLowerCase().replace(/\s+/g, '_');
    return from === 'country_stock';
  });
  const pendingGMApproval = incomingFromCountry.filter(t => t.status === 'pending_approval' || t.status === 'pending');
  const pendingReceipt = incomingFromCountry.filter(t => t.status === 'approved');
  const receivedHistory = incomingFromCountry.filter(t => t.status === 'received' || t.status === 'delivered');
  const rejectedTransfers = incomingFromCountry.filter(t => t.status === 'rejected' || t.status === 'cancelled');


  const branchDestinations = [
    { value: '', label: 'Select destination branch...' },
    ...BRANCH_DETAILS.map(b => ({ value: b.id, label: b.name })),
  ];

  const whSubTabs = [
    { id: 'inventory', label: `📦 Inventory (${batches.length})` },
    { id: 'incoming', label: `📥 Incoming (${pendingGMApproval.length + pendingReceipt.length + receivedHistory.length})${(pendingGMApproval.length + pendingReceipt.length) > 0 ? ' 🔔' : ''}` },
    { id: 'outbound', label: `🚚 Outbound (${outboundTransfers.length})` },
    { id: 'movements', label: `📊 Movements (${movements.length})` },
    { id: 'returns', label: `↩ Branch Returns (${writeoffReturns.length})${writeoffReturns.length > 0 ? ' 🔔' : ''}` },
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
            {' · CIF: '}{formatCurrency(batches.reduce((s, b) => s + Number(b.remaining_quantity || b.quantity || 0) * getBatchCIF(b), 0))}
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
              { header: 'Source', render: r => {
                const src = getBatchSource(r);
                if (src === 'Branch Return') {
                  const key = (r.batch_no || r.batch_number || '').toLowerCase() + '||' + (r.description || r.product_name || '').toLowerCase();
                  const retEntry = returnsMap[key];
                  const sourceBranch = retEntry?.source_branch || (() => {
                    const m = (retEntry?.notes || r.dispatch_source || r.notes || '').match(/Branch:\s*([^\s.,]+)/i);
                    return m ? m[1] : null;
                  })();
                  const branchLabel = sourceBranch ? fmtLocation(sourceBranch) : 'Branch';
                  return <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 5, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>↩ {branchLabel}</span>;
                }
                const dispSrc = r.dispatch_source;
                const fromLabel = dispSrc
                  ? (dispSrc.toLowerCase().includes('country') ? 'Country Stock' : fmtLocation(dispSrc))
                  : 'Country Stock';
                return <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '2px 8px', borderRadius: 5, fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }}>📦 {fromLabel}</span>;
              }},
              { header: 'Available', render: r => <span className={Number(r.remaining_quantity || r.quantity) < 10 ? 'text-red-600 font-bold' : 'font-medium'}>{r.remaining_quantity || r.quantity}</span> },
              { header: 'Dispatched', render: r => r.dispatched_quantity || 0 },
              { header: 'Expiry', render: r => {
                if (!r.expiry_date) return '—';
                const days = Math.floor((new Date(r.expiry_date) - new Date()) / 86400000);
                return <span className={days <= 30 ? 'text-red-600 font-bold' : days <= 90 ? 'text-amber-600' : ''}>{formatDate(r.expiry_date)}{days <= 90 ? ` (${days}d)` : ''}</span>;
              }},
              { header: 'CIF/Unit', render: r => formatCurrency(getBatchCIF(r)) },
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
          {/* Reject confirmation modal */}
          {rejectModal && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 440, maxWidth: '95vw', boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>
                <h3 style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1e293b', marginBottom: 8 }}>Reject Warehouse Dispatch?</h3>
                <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 16 }}>
                  Rejecting will cancel this dispatch. Stock remains in Country Stock. The Stock Controller can resubmit a corrected dispatch.
                </p>
                <div style={{ marginBottom: 18 }}>
                  <label style={{ fontWeight: 700, fontSize: '0.83rem', color: '#374151', display: 'block', marginBottom: 6 }}>Rejection Reason (optional)</label>
                  <textarea
                    rows={3}
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="e.g. Incorrect quantities, wrong products, batch mismatch..."
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.85rem', resize: 'vertical' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setRejectModal(null); setRejectReason(''); }}
                    style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid #d1d5db', background: '#f8fafc', color: '#374151', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>
                    Cancel
                  </button>
                  <button onClick={() => handleRejectDispatch(rejectModal, rejectReason)} disabled={rejectingId === rejectModal.id}
                    style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', opacity: rejectingId === rejectModal.id ? 0.7 : 1 }}>
                    {rejectingId === rejectModal.id ? 'Rejecting…' : 'Confirm Rejection'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <Card style={{ background: 'linear-gradient(135deg,#eff6ff,#f0fdf4)', borderColor: '#bfdbfe' }}>
            <CardBody>
              <p className="text-sm" style={{ color: '#1e3a8a' }}>
                <strong>Country Stock Dispatch Workflow:</strong> Stock Controller submits dispatch → GM approves → Warehouse accepts or rejects. Stock only moves into warehouse inventory on acceptance.
              </p>
            </CardBody>
          </Card>

          {/* Section 1: Awaiting GM Approval */}
          {pendingGMApproval.length > 0 && (
            <Card>
              <CardHeader style={{ background: '#fefce8', borderBottom: '1px solid #fde68a', borderRadius: '12px 12px 0 0' }}>
                <h3 className="font-bold" style={{ color: '#92400e' }}>⏳ Awaiting GM Approval ({pendingGMApproval.length})</h3>
                <p className="text-xs mt-0.5" style={{ color: '#b45309' }}>These dispatches are pending General Manager approval. Stock is still at Country Stock — no action needed from warehouse yet.</p>
              </CardHeader>
              <div className="overflow-x-auto">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ background: '#fefce8', borderBottom: '2px solid #fde68a' }}>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#92400e' }}>Product(s)</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#92400e' }}>Batch #</th>
                      <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: '#92400e' }}>Qty</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#92400e' }}>Submitted By</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#92400e' }}>Date</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#92400e' }}>Ref</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#92400e' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingGMApproval.map((transfer, ti) => {
                      const items = Array.isArray(transfer.items) && transfer.items.length > 0
                        ? transfer.items
                        : [{ productName: transfer.product_name || '—', batchNo: null, quantity: transfer.quantity || 0 }];
                      return items.map((item, ii) => (
                        <tr key={`${transfer.id}-${ii}`} style={{ background: ti % 2 === 0 ? '#fffbeb' : '#fefce8', borderBottom: '1px solid #fde68a' }}>
                          <td style={{ padding: '9px 12px', fontWeight: 600, color: '#1e293b' }}>{item.productName || '—'}</td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 5, fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 700 }}>
                              {item.batchNo || item.batch_no || '—'}
                            </span>
                          </td>
                          <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 800, color: '#7c3aed' }}>{Number(item.quantity || 0).toLocaleString()}</td>
                          {ii === 0 && (
                            <>
                              <td style={{ padding: '9px 12px', color: '#64748b', fontSize: '0.8rem' }} rowSpan={items.length}>{transfer.createdBy || transfer.dispatchedBy || '—'}</td>
                              <td style={{ padding: '9px 12px', color: '#64748b', whiteSpace: 'nowrap', fontSize: '0.8rem' }} rowSpan={items.length}>{formatDate(transfer.createdAt || transfer.created_at)}</td>
                              <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: '0.75rem', color: '#64748b' }} rowSpan={items.length}>{transfer.dispatchReference || transfer.id?.slice(-8) || '—'}</td>
                              <td style={{ padding: '9px 12px' }} rowSpan={items.length}>
                                <Badge variant="warning">Awaiting GM</Badge>
                              </td>
                            </>
                          )}
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Section 2: GM-Approved — Awaiting Warehouse Receipt */}
          {pendingReceipt.length > 0 && (
            <Card>
              <CardHeader style={{ background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', borderRadius: '12px 12px 0 0' }}>
                <h3 className="font-bold" style={{ color: '#166534' }}>✅ GM Approved — Awaiting Your Receipt ({pendingReceipt.length})</h3>
                <p className="text-xs mt-0.5" style={{ color: '#15803d' }}>These dispatches are approved. Inspect the stock details then Accept to add to warehouse inventory, or Reject if there is an issue.</p>
              </CardHeader>
              <div className="overflow-x-auto">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ background: '#f0fdf4', borderBottom: '2px solid #bbf7d0' }}>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#166534' }}>Product Name</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#166534' }}>Batch #</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#166534' }}>Expiry</th>
                      <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: '#166534' }}>Qty</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#166534' }}>Approved By</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#166534' }}>Date</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#166534' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingReceipt.map((transfer, ti) => {
                      const items = Array.isArray(transfer.items) && transfer.items.length > 0
                        ? transfer.items
                        : [{ productName: transfer.product_name || '—', batchNo: null, expiryDate: null, quantity: transfer.quantity || 0 }];
                      const isBusy = receivingId === transfer.id || rejectingId === transfer.id;
                      return items.map((item, ii) => (
                        <tr key={`${transfer.id}-${ii}`} style={{ background: ti % 2 === 0 ? '#fff' : '#f0fdf4', borderBottom: '1px solid #dcfce7' }}>
                          <td style={{ padding: '9px 12px', fontWeight: 600, color: '#1e293b' }}>{item.productName || '—'}</td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 5, fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 700 }}>
                              {item.batchNo || item.batch_no || '—'}
                            </span>
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            {(() => {
                              const d = item.expiryDate || item.expiry_date;
                              if (!d) return <span style={{ color: '#94a3b8' }}>—</span>;
                              const days = Math.floor((new Date(d) - new Date()) / 86400000);
                              return <span style={{ color: days <= 30 ? '#dc2626' : days <= 90 ? '#d97706' : '#16a34a', fontWeight: days <= 90 ? 700 : 400 }}>{formatDate(d)}{days <= 90 ? ` (${days}d)` : ''}</span>;
                            })()}
                          </td>
                          <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 800, color: '#7c3aed', fontSize: '0.95rem' }}>
                            {Number(item.quantity || 0).toLocaleString()}
                          </td>
                          {ii === 0 && (
                            <>
                              <td style={{ padding: '9px 12px', color: '#15803d', fontSize: '0.8rem', fontWeight: 600 }} rowSpan={items.length}>
                                {transfer.gmApprovedBy || '—'}
                              </td>
                              <td style={{ padding: '9px 12px', color: '#64748b', whiteSpace: 'nowrap', fontSize: '0.8rem' }} rowSpan={items.length}>
                                {formatDate(transfer.gmApprovedAt || transfer.createdAt)}
                              </td>
                              <td style={{ padding: '9px 12px' }} rowSpan={items.length}>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                  <button
                                    onClick={() => handleAcceptDispatch(transfer)}
                                    disabled={isBusy}
                                    style={{ padding: '5px 14px', borderRadius: 7, border: 'none', background: isBusy ? '#d1d5db' : '#16a34a', color: '#fff', fontWeight: 700, cursor: isBusy ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}>
                                    {receivingId === transfer.id ? 'Accepting…' : '✓ Accept'}
                                  </button>
                                  <button
                                    onClick={() => { setRejectModal(transfer); setRejectReason(''); }}
                                    disabled={isBusy}
                                    style={{ padding: '5px 14px', borderRadius: 7, border: '1px solid #fca5a5', background: isBusy ? '#f8fafc' : '#fef2f2', color: '#dc2626', fontWeight: 700, cursor: isBusy ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}>
                                    ✕ Reject
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Section 3: Receipt History */}
          {receivedHistory.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="font-bold text-gray-800">✓ Receipt History ({receivedHistory.length})</h3>
                <p className="text-xs text-gray-500 mt-0.5">All stock successfully received into {name} Warehouse from Country Stock.</p>
              </CardHeader>
              <div className="overflow-x-auto">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Product Name</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Batch #</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Expiry</th>
                      <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Qty Received</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Received By</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Date Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receivedHistory.map((transfer, ti) => {
                      const items = Array.isArray(transfer.items) && transfer.items.length > 0
                        ? transfer.items
                        : [{ productName: transfer.product_name || '—', batchNo: null, expiryDate: null, quantity: transfer.quantity || 0 }];
                      const receivedBy = transfer.receivedBy || transfer.received_by || '—';
                      const receivedAt = transfer.receivedAt || transfer.received_at || transfer.updatedAt || transfer.updated_at;
                      return items.map((item, ii) => (
                        <tr key={`${transfer.id}-${ii}`} style={{ background: ti % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '9px 12px', fontWeight: 600, color: '#1e293b' }}>{item.productName || '—'}</td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{ background: '#f0fdf4', color: '#166534', padding: '2px 8px', borderRadius: 5, fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 700 }}>
                              {item.batchNo || item.batch_no || '—'}
                            </span>
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            {(() => {
                              const d = item.expiryDate || item.expiry_date;
                              if (!d) return <span style={{ color: '#94a3b8' }}>—</span>;
                              const days = Math.floor((new Date(d) - new Date()) / 86400000);
                              return <span style={{ color: days <= 30 ? '#dc2626' : days <= 90 ? '#d97706' : '#16a34a', fontWeight: days <= 90 ? 700 : 400 }}>{formatDate(d)}{days <= 90 ? ` (${days}d)` : ''}</span>;
                            })()}
                          </td>
                          <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 800, color: '#7c3aed', fontSize: '0.95rem' }}>
                            {Number(item.quantityReceived ?? item.quantity_received ?? item.quantity ?? 0).toLocaleString()}
                          </td>
                          {ii === 0 && (
                            <>
                              <td style={{ padding: '9px 12px' }} rowSpan={items.length}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#d1fae5', color: '#065f46', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.7rem', flexShrink: 0 }}>
                                    {(receivedBy !== '—' ? receivedBy : '?')[0]?.toUpperCase()}
                                  </span>
                                  <span style={{ color: '#1e293b', fontWeight: 600, fontSize: '0.82rem' }}>{receivedBy}</span>
                                </div>
                              </td>
                              <td style={{ padding: '9px 12px', color: '#64748b', whiteSpace: 'nowrap', fontSize: '0.8rem' }} rowSpan={items.length}>
                                {receivedAt ? formatDate(receivedAt) : '—'}
                              </td>
                            </>
                          )}
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Section 4: Rejected */}
          {rejectedTransfers.length > 0 && (
            <Card>
              <CardHeader style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca', borderRadius: '12px 12px 0 0' }}>
                <h3 className="font-bold" style={{ color: '#991b1b' }}>❌ Rejected Dispatches ({rejectedTransfers.length})</h3>
                <p className="text-xs mt-0.5" style={{ color: '#b91c1c' }}>Dispatches rejected by this warehouse. The Stock Controller can resubmit with corrections.</p>
              </CardHeader>
              <div className="overflow-x-auto">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                  <thead>
                    <tr style={{ background: '#fef2f2', borderBottom: '2px solid #fecaca' }}>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#991b1b' }}>Product(s)</th>
                      <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: '#991b1b' }}>Qty</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#991b1b' }}>Rejection Reason</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#991b1b' }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rejectedTransfers.map((transfer, ti) => {
                      const items = Array.isArray(transfer.items) && transfer.items.length > 0
                        ? transfer.items
                        : [{ productName: transfer.product_name || '—', quantity: transfer.quantity || 0 }];
                      const totalQty = items.reduce((s, i) => s + Number(i.quantity || 0), 0);
                      const productNames = [...new Set(items.map(i => i.productName || '—'))].join(', ');
                      return (
                        <tr key={transfer.id} style={{ background: ti % 2 === 0 ? '#fff' : '#fef2f2', borderBottom: '1px solid #fecaca' }}>
                          <td style={{ padding: '9px 12px', fontWeight: 600, color: '#1e293b' }}>{productNames}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: '#7c3aed' }}>{totalQty.toLocaleString()}</td>
                          <td style={{ padding: '9px 12px', color: '#64748b', fontSize: '0.8rem', fontStyle: 'italic' }}>{transfer.dispatchNotes || transfer.dispatch_notes || '—'}</td>
                          <td style={{ padding: '9px 12px', color: '#64748b', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{formatDate(transfer.updatedAt || transfer.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {pendingGMApproval.length === 0 && pendingReceipt.length === 0 && receivedHistory.length === 0 && rejectedTransfers.length === 0 && (
            <EmptyState icon={<Package size={48} />} title="No Incoming Dispatches" description={`No stock has been dispatched to ${name} Warehouse from Country Stock yet. The Stock Controller uses Country Stock to submit warehouse dispatches.`} />
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
                if (items.length > 0) return (
                  <div className="space-y-0.5">
                    {items.map((i, idx) => {
                      const sent = Number(i.quantity || 0);
                      const approved = i.quantityApproved ?? i.quantity_approved;
                      const approvedN = approved != null ? Number(approved) : null;
                      const amended = approvedN != null && approvedN !== sent;
                      return (
                        <div key={idx} style={{ fontSize: '0.78rem' }}>
                          <span style={{ fontWeight: 600 }}>{i.productName || i.product_name}</span>
                          <span style={{ color: '#64748b' }}> × {sent}</span>
                          {approvedN != null && (
                            <span style={{ marginLeft: 4, fontWeight: 700, color: amended ? '#d97706' : '#16a34a', fontSize: '0.72rem' }}>
                              {amended ? `→ ${approvedN} approved` : '✓ approved'}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
                return <span className="font-medium">{r.product_name || '—'}</span>;
              }},
              { header: 'Sent / Approved', render: r => {
                const items = Array.isArray(r.items) ? r.items : [];
                const totalSent = items.length > 0 ? items.reduce((s, i) => s + Number(i.quantity || 0), 0) : (r.quantity || 0);
                const hasApproved = items.some(i => (i.quantityApproved ?? i.quantity_approved) != null);
                const totalApproved = hasApproved ? items.reduce((s, i) => {
                  const a = i.quantityApproved ?? i.quantity_approved;
                  return s + Number(a != null ? a : i.quantity || 0);
                }, 0) : null;
                const amended = totalApproved != null && totalApproved !== totalSent;
                return (
                  <div style={{ lineHeight: 1.4 }}>
                    <div style={{ fontWeight: 700 }}>{totalSent}</div>
                    {totalApproved != null && (
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: amended ? '#d97706' : '#16a34a' }}>
                        {amended ? `→ ${totalApproved} approved` : `✓ ${totalApproved} approved`}
                      </div>
                    )}
                  </div>
                );
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
              { header: 'Action', render: r => (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {r.status === 'approved' && (
                    <button
                      onClick={async () => {
                        try {
                          await api.stock.updateTransfer(r.id, { status: 'dispatched', dispatched_by: user?.full_name || user?.fullName || user?.username });
                          setAlert({ type: 'success', msg: `Transfer dispatched — dispatch note created` });
                          setTimeout(() => loadData(), 100);
                        } catch (err) {
                          setAlert({ type: 'error', msg: err.message || 'Dispatch failed' });
                        }
                      }}
                      style={{ background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      🚚 Dispatch
                    </button>
                  )}
                  {r.status === 'dispatched' && (
                    <button
                      onClick={async () => {
                        try {
                          await api.stock.updateTransfer(r.id, { status: 'in_transit' });
                          setAlert({ type: 'success', msg: 'Marked as in transit' });
                          setTimeout(() => loadData(), 100);
                        } catch (err) {
                          setAlert({ type: 'error', msg: err.message });
                        }
                      }}
                      style={{ background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      In Transit
                    </button>
                  )}
                  <button onClick={() => setViewAuditTransfer(r)} className="text-xs font-bold cursor-pointer border-none bg-transparent" style={{ color: '#6366f1' }}>
                    Audit
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

      {subTab === 'movements' && (() => {
        const IN_TYPES = ['transfer_in','warehouse_receipt','received','import','adjustment_in','country_release','receipt'];
        const OUT_TYPES = ['dispatch','branch_dispatch','reserved','write_off','adjustment_out','released','transfer_out','dispatched','out'];
        const mvDir = m => {
          const t = (m.movement_type || '').toLowerCase();
          if (IN_TYPES.some(k => t.includes(k))) return 'in';
          if (OUT_TYPES.some(k => t.includes(k))) return 'out';
          // fallback: check if warehouse is the destination (in) or source (out)
          const dst = (m.destination_location || '').toLowerCase();
          const src = (m.source_location || '').toLowerCase();
          const loc = location.toLowerCase();
          if (dst.includes(loc) || dst.includes(name.toLowerCase())) return 'in';
          if (src.includes(loc) || src.includes(name.toLowerCase())) return 'out';
          return 'other';
        };
        const mvTypeBg = m => {
          const d = mvDir(m);
          if (d === 'in') return { bg: '#f0fdf4', color: '#166534', border: '#86efac' };
          if (d === 'out') return { bg: '#fef2f2', color: '#991b1b', border: '#fca5a5' };
          return { bg: '#fffbeb', color: '#92400e', border: '#fcd34d' };
        };

        // Apply filters
        let filtered = [...movements].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        if (mvDateFrom) filtered = filtered.filter(m => new Date(m.created_at) >= new Date(mvDateFrom));
        if (mvDateTo) filtered = filtered.filter(m => new Date(m.created_at) <= new Date(mvDateTo + 'T23:59:59'));
        if (mvTypeFilter) {
          if (mvTypeFilter === '__in__') filtered = filtered.filter(m => mvDir(m) === 'in');
          else if (mvTypeFilter === '__out__') filtered = filtered.filter(m => mvDir(m) === 'out');
          else filtered = filtered.filter(m => (m.movement_type || '').toLowerCase() === mvTypeFilter);
        }
        if (mvProductSearch) {
          const s = mvProductSearch.toLowerCase();
          filtered = filtered.filter(m => (m.product_name || '').toLowerCase().includes(s) || (m.batch_no || '').toLowerCase().includes(s));
        }

        // Summary stats from filtered data
        const totalIn = filtered.filter(m => mvDir(m) === 'in').reduce((s, m) => s + Number(m.quantity || 0), 0);
        const totalOut = filtered.filter(m => mvDir(m) === 'out').reduce((s, m) => s + Number(m.quantity || 0), 0);
        const totalAdj = filtered.filter(m => mvDir(m) === 'other').reduce((s, m) => s + Number(m.quantity || 0), 0);
        const netMovement = totalIn - totalOut;

        // Per-product summary
        const productMap = {};
        filtered.forEach(m => {
          const key = m.product_name || '—';
          if (!productMap[key]) productMap[key] = { product: key, in: 0, out: 0, adj: 0, batches: new Set() };
          const d = mvDir(m);
          if (d === 'in') productMap[key].in += Number(m.quantity || 0);
          else if (d === 'out') productMap[key].out += Number(m.quantity || 0);
          else productMap[key].adj += Number(m.quantity || 0);
          if (m.batch_no) productMap[key].batches.add(m.batch_no);
        });
        const productSummary = Object.values(productMap);

        // Remaining from live batches
        const getRemainingForProduct = pname => batches
          .filter(b => (b.description || b.product_name || '').toLowerCase() === (pname || '').toLowerCase())
          .reduce((s, b) => s + Number(b.remaining_quantity || b.quantity || 0), 0);

        const allTypes = [...new Set(movements.map(m => m.movement_type).filter(Boolean))];

        const printMovements = () => {
          const dateRange = mvDateFrom || mvDateTo ? `<div style="font-size:11px;color:#666;margin-bottom:8px">Period: ${mvDateFrom || 'all'} to ${mvDateTo || 'present'}</div>` : '';
          const summaryHtml = `
            <div style="display:flex;gap:20px;margin-bottom:16px;flex-wrap:wrap">
              <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px 16px;min-width:120px">
                <div style="font-size:22px;font-weight:900;color:#166534">${totalIn.toLocaleString()}</div>
                <div style="font-size:11px;color:#166534;font-weight:700">TOTAL RECEIVED</div>
              </div>
              <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:10px 16px;min-width:120px">
                <div style="font-size:22px;font-weight:900;color:#991b1b">${totalOut.toLocaleString()}</div>
                <div style="font-size:11px;color:#991b1b;font-weight:700">TOTAL DISPATCHED</div>
              </div>
              ${totalAdj > 0 ? `<div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:10px 16px;min-width:120px"><div style="font-size:22px;font-weight:900;color:#92400e">${totalAdj.toLocaleString()}</div><div style="font-size:11px;color:#92400e;font-weight:700">ADJUSTMENTS</div></div>` : ''}
              <div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:8px;padding:10px 16px;min-width:120px">
                <div style="font-size:22px;font-weight:900;color:#1e40af">${netMovement >= 0 ? '+' : ''}${netMovement.toLocaleString()}</div>
                <div style="font-size:11px;color:#1e40af;font-weight:700">NET MOVEMENT</div>
              </div>
            </div>`;
          const productRows = productSummary.map(p => {
            const rem = getRemainingForProduct(p.product);
            return `<tr><td style="padding:6px 10px;font-weight:600">${p.product}</td><td style="padding:6px 10px;text-align:center;color:#166534;font-weight:700">+${p.in}</td><td style="padding:6px 10px;text-align:center;color:#991b1b;font-weight:700">-${p.out}</td>${p.adj ? `<td style="padding:6px 10px;text-align:center;color:#92400e;font-weight:700">${p.adj}</td>` : '<td style="padding:6px 10px;text-align:center;color:#94a3b8">—</td>'}<td style="padding:6px 10px;text-align:center;font-weight:800;color:#1d4ed8">${rem}</td></tr>`;
          }).join('');
          const detailRows = filtered.map(m => {
            const d = mvDir(m);
            const sign = d === 'in' ? '+' : d === 'out' ? '-' : '±';
            const clr = d === 'in' ? '#166534' : d === 'out' ? '#991b1b' : '#92400e';
            return `<tr><td style="padding:5px 8px">${m.product_name||'—'}</td><td style="padding:5px 8px;font-family:monospace;font-size:10px">${m.batch_no||'—'}</td><td style="padding:5px 8px;font-size:10px">${m.expiry_date ? formatDate(m.expiry_date) : '—'}</td><td style="padding:5px 8px;text-transform:capitalize;font-size:10px">${(m.movement_type||'').replace(/_/g,' ')}</td><td style="padding:5px 8px;font-weight:800;color:${clr};text-align:center">${sign}${Number(m.quantity||0)}</td><td style="padding:5px 8px;font-size:10px">${fmtLocation(m.source_location)}</td><td style="padding:5px 8px;font-size:10px">${fmtLocation(m.destination_location)}</td><td style="padding:5px 8px;font-family:monospace;font-size:9px">${m.reference_id||m.reference||'—'}</td><td style="padding:5px 8px;font-size:10px">${m.created_by||'—'}</td><td style="padding:5px 8px;font-size:10px;white-space:nowrap">${formatDateTime(m.created_at)}</td></tr>`;
          }).join('');
          printDocument(`${name} Warehouse — Stock Movements Report`, `
            ${dateRange}
            ${summaryHtml}
            <h3 style="font-size:13px;font-weight:800;margin:16px 0 6px;color:#1e293b">Per-Product Summary</h3>
            <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:12px">
              <thead><tr style="background:#f1f5f9"><th style="padding:6px 10px;text-align:left">Product</th><th style="padding:6px 10px">Received</th><th style="padding:6px 10px">Dispatched</th><th style="padding:6px 10px">Adjusted</th><th style="padding:6px 10px">Remaining</th></tr></thead>
              <tbody>${productRows}</tbody>
            </table>
            <h3 style="font-size:13px;font-weight:800;margin:16px 0 6px;color:#1e293b">Movement Detail (${filtered.length} records)</h3>
            <table style="width:100%;border-collapse:collapse;font-size:11px">
              <thead><tr style="background:#f1f5f9"><th style="padding:5px 8px;text-align:left">Product</th><th style="padding:5px 8px">Batch</th><th style="padding:5px 8px">Expiry</th><th style="padding:5px 8px">Type</th><th style="padding:5px 8px">Qty</th><th style="padding:5px 8px">From</th><th style="padding:5px 8px">To</th><th style="padding:5px 8px">Reference</th><th style="padding:5px 8px">By</th><th style="padding:5px 8px">Date & Time</th></tr></thead>
              <tbody>${detailRows}</tbody>
            </table>
          `);
        };

        return (
          <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Total Received', value: totalIn, sign: '+', bg: '#f0fdf4', border: '#86efac', color: '#166534', icon: '📥' },
                { label: 'Total Dispatched', value: totalOut, sign: '-', bg: '#fef2f2', border: '#fca5a5', color: '#991b1b', icon: '📤' },
                { label: 'Adjustments', value: totalAdj, sign: '±', bg: '#fffbeb', border: '#fcd34d', color: '#92400e', icon: '⚖️' },
                { label: 'Net Movement', value: netMovement, sign: netMovement >= 0 ? '+' : '', bg: '#eff6ff', border: '#93c5fd', color: '#1e40af', icon: '📊' },
              ].map(s => (
                <div key={s.label} style={{ background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: 12, padding: '12px 16px' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: s.color }}>{s.sign}{s.value.toLocaleString()}</div>
                  <div style={{ fontSize: '0.73rem', fontWeight: 700, color: s.color, marginTop: 2 }}>{s.icon} {s.label}</div>
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 1 }}>{mvDateFrom || mvDateTo ? `${mvDateFrom||'start'} – ${mvDateTo||'now'}` : 'All time'}</div>
                </div>
              ))}
            </div>

            {/* Per-product summary */}
            {productSummary.length > 0 && (
              <Card>
                <CardHeader><h4 className="font-bold text-gray-800 text-sm">📦 Per-Product Summary</h4></CardHeader>
                <div className="overflow-x-auto">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Product</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Batch(es)</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#166534' }}>Received ↓</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#991b1b' }}>Dispatched ↑</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#92400e' }}>Adjusted</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#1d4ed8' }}>Remaining Now</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productSummary.map((p, idx) => {
                        const rem = getRemainingForProduct(p.product);
                        const low = rem > 0 && rem < 10;
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b' }}>{p.product}</td>
                            <td style={{ padding: '8px 12px' }}>
                              {[...p.batches].map(b => (
                                <span key={b} style={{ background: '#eff6ff', color: '#1d4ed8', padding: '1px 6px', borderRadius: 4, fontSize: '0.72rem', fontFamily: 'monospace', fontWeight: 700, marginRight: 3 }}>{b}</span>
                              ))}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 800, color: '#166534', fontSize: '1rem' }}>+{p.in}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 800, color: '#991b1b', fontSize: '1rem' }}>-{p.out}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#92400e' }}>{p.adj || <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              <span style={{ fontWeight: 900, fontSize: '1rem', color: low ? '#dc2626' : rem === 0 ? '#94a3b8' : '#1d4ed8' }}>
                                {rem}
                                {low && <span style={{ fontSize: '0.65rem', color: '#dc2626', marginLeft: 4, fontWeight: 700 }}>LOW</span>}
                                {rem === 0 && <span style={{ fontSize: '0.65rem', color: '#94a3b8', marginLeft: 4 }}>EMPTY</span>}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Filters + detailed table */}
            <Card>
              <CardHeader>
                <div className="flex justify-between items-start flex-wrap gap-3">
                  <div>
                    <h3 className="font-bold text-gray-800">{name} Warehouse — Movement Detail</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{filtered.length} of {movements.length} movements shown</p>
                  </div>
                  <div className="flex gap-2 flex-wrap items-center">
                    <Button size="sm" variant="secondary" onClick={loadData}>↺ Refresh</Button>
                    <button onClick={printMovements}
                      style={{ padding: '6px 14px', background: '#c41e3a', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                      🖨 Print PDF
                    </button>
                  </div>
                </div>

                {/* Filter controls */}
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="col-span-2 md:col-span-1" style={{ position: 'relative' }}>
                    <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                    <input type="text" value={mvProductSearch} onChange={e => setMvProductSearch(e.target.value)}
                      placeholder="Search product / batch…"
                      style={{ width: '100%', padding: '7px 10px 7px 28px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <select value={mvTypeFilter} onChange={e => setMvTypeFilter(e.target.value)}
                    style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.8rem', background: '#fff' }}>
                    <option value="">All Types</option>
                    <option value="__in__">📥 Inbound only</option>
                    <option value="__out__">📤 Outbound only</option>
                    {allTypes.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
                  </select>
                  <input type="date" value={mvDateFrom} onChange={e => setMvDateFrom(e.target.value)}
                    style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.8rem' }} />
                  <input type="date" value={mvDateTo} onChange={e => setMvDateTo(e.target.value)}
                    style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.8rem' }} />
                </div>
                {(mvDateFrom || mvDateTo || mvTypeFilter || mvProductSearch) && (
                  <button onClick={() => { setMvDateFrom(''); setMvDateTo(''); setMvTypeFilter(''); setMvProductSearch(''); }}
                    style={{ marginTop: 6, fontSize: '0.75rem', color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                    ✕ Clear filters
                  </button>
                )}
              </CardHeader>

              {filtered.length === 0 ? (
                <CardBody>
                  <EmptyState icon={<Package size={40} />} title="No movements found" description="Try adjusting your filters or date range." />
                </CardBody>
              ) : (
                <div className="overflow-x-auto">
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.81rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', position: 'sticky', top: 0 }}>
                        <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151', minWidth: 160 }}>Product</th>
                        <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Batch #</th>
                        <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Expiry</th>
                        <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Direction</th>
                        <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Type</th>
                        <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Quantity</th>
                        <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>From</th>
                        <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>To</th>
                        <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Reference</th>
                        <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Performed By</th>
                        <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>Date & Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((m, idx) => {
                        const d = mvDir(m);
                        const st = mvTypeBg(m);
                        const sign = d === 'in' ? '+' : d === 'out' ? '-' : '±';
                        const qty = Number(m.quantity || 0);
                        const expiry = m.expiry_date;
                        const expiryDays = expiry ? Math.floor((new Date(expiry) - new Date()) / 86400000) : null;
                        return (
                          <tr key={m.id || idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b' }}>{m.product_name || '—'}</td>
                            <td style={{ padding: '8px 12px' }}>
                              {m.batch_no
                                ? <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '2px 7px', borderRadius: 5, fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700 }}>{m.batch_no}</span>
                                : <span style={{ color: '#cbd5e1' }}>—</span>}
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              {expiry ? (
                                <span style={{ color: expiryDays <= 30 ? '#dc2626' : expiryDays <= 90 ? '#d97706' : '#374151', fontWeight: expiryDays <= 90 ? 700 : 400, fontSize: '0.78rem' }}>
                                  {formatDate(expiry)}{expiryDays <= 90 ? ` (${expiryDays}d)` : ''}
                                </span>
                              ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              <span style={{ width: 28, height: 28, borderRadius: '50%', background: st.bg, border: `2px solid ${st.border}`, color: st.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.95rem' }}>
                                {d === 'in' ? '↓' : d === 'out' ? '↑' : '↕'}
                              </span>
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, padding: '2px 8px', borderRadius: 5, fontSize: '0.72rem', fontWeight: 700, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                                {(m.movement_type || 'unknown').replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              <span style={{ fontWeight: 900, fontSize: '1.05rem', color: d === 'in' ? '#166534' : d === 'out' ? '#dc2626' : '#d97706' }}>
                                {sign}{qty.toLocaleString()}
                              </span>
                            </td>
                            <td style={{ padding: '8px 12px', fontSize: '0.78rem', color: '#475569' }}>{fmtLocation(m.source_location)}</td>
                            <td style={{ padding: '8px 12px', fontSize: '0.78rem', color: '#475569' }}>{fmtLocation(m.destination_location)}</td>
                            <td style={{ padding: '8px 12px' }}>
                              <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#6366f1', background: '#eef2ff', padding: '2px 6px', borderRadius: 4 }}>
                                {m.reference_id || m.reference || '—'}
                              </span>
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              {m.created_by ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#e0e7ff', color: '#3730a3', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.65rem', flexShrink: 0 }}>
                                    {m.created_by[0]?.toUpperCase()}
                                  </span>
                                  <span style={{ fontSize: '0.78rem', color: '#374151' }}>{m.created_by}</span>
                                </div>
                              ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                            </td>
                            <td style={{ padding: '8px 12px', fontSize: '0.76rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                              <div style={{ fontWeight: 600, color: '#374151' }}>{formatDate(m.created_at)}</div>
                              <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{m.created_at ? new Date(m.created_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#f1f5f9', borderTop: '2px solid #e2e8f0' }}>
                        <td colSpan={5} style={{ padding: '8px 12px', fontWeight: 700, color: '#374151', fontSize: '0.8rem' }}>
                          TOTALS ({filtered.length} movements)
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                            <span style={{ color: '#166534' }}>+{totalIn}</span>
                            {' / '}
                            <span style={{ color: '#dc2626' }}>-{totalOut}</span>
                          </div>
                        </td>
                        <td colSpan={5} style={{ padding: '8px 12px', fontSize: '0.75rem', color: '#64748b' }}>
                          Net: <span style={{ fontWeight: 800, color: netMovement >= 0 ? '#166534' : '#dc2626' }}>{netMovement >= 0 ? '+' : ''}{netMovement}</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </Card>
          </div>
        );
      })()}

      {subTab === 'returns' && (
        <div className="space-y-4">
          <div style={{ background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: 12, padding: '12px 18px' }}>
            <p className="text-sm" style={{ color: '#92400e' }}>
              <strong>↩ Branch Returns</strong> — Stock that was written off at a branch and approved to be returned to this warehouse by the General Manager.
              Each entry here corresponds to a GM-approved write-off that credited stock back to <strong>{name} Warehouse</strong>.
            </p>
          </div>

          {writeoffReturns.length === 0 ? (
            <Card>
              <CardBody>
                <EmptyState
                  icon={<Package size={40} />}
                  title="No Branch Returns Yet"
                  description={`No written-off stock has been returned to ${name} Warehouse so far. When a GM approves a branch write-off with redistribution back to this warehouse, the entries will appear here.`}
                />
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div>
                    <h3 className="font-bold text-gray-800">↩ Branch Returns — {name} Warehouse</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{writeoffReturns.length} return event{writeoffReturns.length !== 1 ? 's' : ''} — stock credited back from branch write-offs</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={loadData}>↺ Refresh</Button>
                </div>
              </CardHeader>
              <div className="overflow-x-auto">
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#fffbeb', borderBottom: '2px solid #fcd34d' }}>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#92400e' }}>Product</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#92400e' }}>Batch #</th>
                      <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: '#92400e' }}>Qty Returned</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#92400e' }}>Source Branch</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#92400e' }}>Write-Off Reason</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#92400e' }}>Approved By</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#92400e' }}>Reference</th>
                      <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#92400e' }}>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {writeoffReturns.map((r, idx) => {
                      const branch = r.source_branch || (() => {
                        const m = (r.notes || '').match(/Branch:\s*([^\s.]+)/i);
                        return m ? m[1] : null;
                      })();
                      const branchLabel = branch ? fmtLocation(branch) : '—';
                      const reason = r.write_off_reason || r.reason || (() => {
                        const m = (r.notes || '').match(/Reason:\s*([^.]+)/i);
                        return m ? m[1].trim() : null;
                      })();
                      return (
                        <tr key={r.id || idx} style={{ background: idx % 2 === 0 ? '#fff' : '#fffbeb', borderBottom: '1px solid #fef3c7' }}>
                          <td style={{ padding: '9px 12px', fontWeight: 600, color: '#1e293b' }}>{r.product_name || '—'}</td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 5, fontFamily: 'monospace', fontSize: '0.76rem', fontWeight: 700 }}>
                              {r.batch_no || '—'}
                            </span>
                          </td>
                          <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 800, color: '#d97706', fontSize: '0.95rem' }}>
                            +{Number(r.quantity || 0).toLocaleString()}
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{ background: '#fef2f2', color: '#991b1b', padding: '2px 8px', borderRadius: 5, fontSize: '0.76rem', fontWeight: 700 }}>
                              {branchLabel}
                            </span>
                          </td>
                          <td style={{ padding: '9px 12px', color: '#64748b', fontSize: '0.78rem' }}>
                            {reason ? <span style={{ fontStyle: 'italic' }}>{String(reason).replace(/_/g, ' ')}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            {r.created_by ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#fef3c7', color: '#92400e', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.65rem', flexShrink: 0 }}>
                                  {r.created_by[0]?.toUpperCase()}
                                </span>
                                <span style={{ fontSize: '0.78rem', color: '#374151' }}>{r.created_by}</span>
                              </div>
                            ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                          </td>
                          <td style={{ padding: '9px 12px' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: '0.73rem', color: '#64748b' }}>{r.reference || '—'}</span>
                          </td>
                          <td style={{ padding: '9px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: 600, color: '#374151', fontSize: '0.78rem' }}>{formatDate(r.created_at)}</div>
                            <div style={{ color: '#94a3b8', fontSize: '0.69rem' }}>{r.created_at ? new Date(r.created_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#fef3c7', borderTop: '2px solid #fcd34d' }}>
                      <td colSpan={2} style={{ padding: '8px 12px', fontWeight: 700, color: '#92400e', fontSize: '0.8rem' }}>
                        TOTAL RETURNS ({writeoffReturns.length} events)
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 900, color: '#d97706', fontSize: '0.9rem' }}>
                        +{writeoffReturns.reduce((s, r) => s + Number(r.quantity || 0), 0).toLocaleString()}
                      </td>
                      <td colSpan={5} style={{ padding: '8px 12px', fontSize: '0.75rem', color: '#92400e' }}>
                        units returned from branch write-offs
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}
        </div>
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
            const approvedItems = items.filter(it => (it.quantityApproved ?? it.quantity_approved) != null);
            const approvedDetail = approvedItems.length > 0
              ? approvedItems.map(it => {
                  const sent = Number(it.quantity || 0);
                  const approved = Number(it.quantityApproved ?? it.quantity_approved ?? sent);
                  const name = it.productName || it.product_name || 'Product';
                  const diff = approved !== sent ? ` (was ${sent})` : '';
                  return `${name}: ${approved} approved${diff}`;
                }).join(' · ')
              : (t.gmComment || t.gm_comment || '');
            const gmComment = t.gmComment || t.gm_comment;
            const fullDetail = [approvedDetail, gmComment && approvedItems.length > 0 ? `Comment: ${gmComment}` : ''].filter(Boolean).join(' — ');
            events.push({ time: t.amendedAt || t.amended_at || t.updatedAt || t.updated_at, action: `GM: ${actionLabel[action] || action}`, detail: fullDetail, color: action === 'approve' ? '#16a34a' : action === 'reject' ? '#dc2626' : action === 'amend_approve' ? '#d97706' : '#6366f1' });
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
          const isAmendedTransfer = meta.amended || t.amendedByGm || t.amended_by_gm;
          const amendmentLog = meta.amendment_log ? (Array.isArray(meta.amendment_log) ? meta.amendment_log : [meta.amendment_log]) : [];
          return (
            <div className="p-6 space-y-5">
              {isAmendedTransfer && (
                <div style={{ background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: amendmentLog.length > 0 ? 8 : 0 }}>
                    <span style={{ fontSize: '1.1rem' }}>⚠️</span>
                    <span style={{ fontWeight: 800, color: '#92400e', fontSize: '0.92rem' }}>Amended by GM — Repack Required</span>
                    {(t.amendedByGm || t.amended_by_gm) && (
                      <span style={{ fontSize: '0.78rem', color: '#b45309', marginLeft: 'auto' }}>by {t.amendedByGm || t.amended_by_gm}{(t.amendedAt || t.amended_at) ? ` on ${formatDate(t.amendedAt || t.amended_at)}` : ''}</span>
                    )}
                  </div>
                  {amendmentLog.length > 0 && (
                    <ul style={{ margin: 0, padding: '0 0 0 20px', fontSize: '0.82rem', color: '#78350f' }}>
                      {amendmentLog.map((entry, i) => {
                        if (typeof entry === 'string') return <li key={i}>{entry}</li>;
                        const product = entry.product || entry.productName || entry.product_name || '';
                        const from = entry.from !== undefined ? entry.from : (entry.original !== undefined ? entry.original : null);
                        const to = entry.to !== undefined ? entry.to : (entry.approved !== undefined ? entry.approved : null);
                        if (product && from !== null && to !== null) return <li key={i}><strong>{product}</strong>: {from} → {to}</li>;
                        return <li key={i}>{entry.detail || entry.note || JSON.stringify(entry)}</li>;
                      })}
                    </ul>
                  )}
                </div>
              )}
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
                        <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 700 }}>
                          {(() => {
                            const approved = it.quantityApproved ?? it.quantity_approved;
                            const sent = Number(it.quantity || 0);
                            if (approved == null) return <span style={{ color: '#94a3b8' }}>—</span>;
                            const n = Number(approved);
                            const changed = n !== sent;
                            return (
                              <span style={{ color: changed ? '#d97706' : '#16a34a', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                {n}
                                {changed && <span style={{ fontSize: '0.68rem', color: '#9ca3af', fontWeight: 400 }}>({sent} sent)</span>}
                              </span>
                            );
                          })()}
                        </td>
                        <td style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 700 }}>
                          {(() => {
                            const received = it.quantityReceived ?? it.quantity_received;
                            if (received == null) return <span style={{ color: '#94a3b8' }}>—</span>;
                            return <span style={{ color: '#16a34a' }}>{Number(received)}</span>;
                          })()}
                        </td>
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

const WAREHOUSE_SOURCES = [
  { value: 'windhoek_warehouse', label: '🏢 Windhoek Warehouse' },
  { value: 'ondangwa_warehouse', label: '🏬 Ondangwa Warehouse' },
  { value: 'country_stock',      label: '📦 Country Stock' },
];

function BranchRequestsPanel() {
  const { user } = useAuth();
  const [requests, setRequests]                   = useState([]);
  const [loading, setLoading]                     = useState(true);
  const [dispatchReq, setDispatchReq]             = useState(null);
  const [dispatchWH, setDispatchWH]               = useState('windhoek_warehouse');
  const [dispatching, setDispatching]             = useState(false);
  const [modalAlert, setModalAlert]               = useState(null);
  const [denyReq, setDenyReq]                     = useState(null);
  const [denyReason, setDenyReason]               = useState('');
  const [denying, setDenying]                     = useState(false);
  const [alert, setAlert]                         = useState(null);
  const [statusFilter, setStatusFilter]           = useState('approved');
  const [fefoMap, setFefoMap]                     = useState({});
  const [fefoLoading, setFefoLoading]             = useState(false);
  const [altFefoMap, setAltFefoMap]               = useState({});
  const [altFefoLoading, setAltFefoLoading]       = useState(false);
  const [shortfallMode, setShortfallMode]         = useState('block');
  const [shortfallAcknowledged, setShortfallAcknowledged] = useState(false);
  const [adjustedQtys, setAdjustedQtys]           = useState({});

  const load = useCallback(() => {
    setLoading(true);
    api.stock.requests()
      .then(d => setRequests(Array.isArray(d) ? d : d.requests || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api.system.getSettings('dispatch_shortfall_mode')
      .then(d => { if (d?.value) setShortfallMode(d.value); })
      .catch(() => {});
  }, []);

  const lookupFefoBatches = useCallback(async (req, warehouse) => {
    if (!req || !warehouse) return;
    const items = Array.isArray(req.items) ? req.items : [];
    if (items.length === 0) return;
    setFefoLoading(true);
    setFefoMap({});
    try {
      const results = {};
      await Promise.all(items.map(async (item) => {
        const productName = item.productName || item.product_name || item.productId || '';
        const qty = Number(item.quantity || 0);
        if (!productName || qty <= 0) return;
        try {
          const resp = await api.stock.fefoBatches({ product: productName, location: warehouse, qty });
          results[productName] = { batches: resp.batches || [], shortfall: resp.shortfall || 0 };
        } catch {
          results[productName] = { batches: [], shortfall: qty };
        }
      }));
      setFefoMap(results);
    } finally {
      setFefoLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (dispatchReq && dispatchWH) {
      setShortfallAcknowledged(false);
      lookupFefoBatches(dispatchReq, dispatchWH);
    }
  }, [dispatchReq, dispatchWH, lookupFefoBatches]);

  // When a shortfall exists, probe all other warehouses for the affected products
  // so the stock manager can see where stock is available without switching manually.
  useEffect(() => {
    if (fefoLoading || !dispatchReq) {
      setAltFefoMap({});
      return;
    }
    const items = Array.isArray(dispatchReq.items) ? dispatchReq.items : [];
    const shortfallItems = items.filter(it => {
      const n = it.productName || it.product_name || it.productId || '';
      return fefoMap[n]?.shortfall > 0;
    });
    if (shortfallItems.length === 0) {
      setAltFefoMap({});
      return;
    }
    const otherWarehouses = WAREHOUSE_SOURCES.filter(w => w.value !== dispatchWH);
    if (otherWarehouses.length === 0) return;

    let cancelled = false;
    setAltFefoLoading(true);
    const result = {};
    Promise.all(
      otherWarehouses.map(async (wh) => {
        const whResult = {};
        await Promise.all(shortfallItems.map(async (it) => {
          const n = it.productName || it.product_name || it.productId || '';
          const qty = Number(it.quantity || 0);
          try {
            const resp = await api.stock.fefoBatches({ product: n, location: wh.value, qty });
            const available = (resp.batches || []).reduce((s, b) => s + Number(b.allocated_qty || 0), 0);
            whResult[n] = { available, shortfall: resp.shortfall || 0, canFill: (resp.shortfall || 0) === 0 };
          } catch {
            whResult[n] = { available: 0, shortfall: qty, canFill: false };
          }
        }));
        result[wh.value] = whResult;
      })
    ).then(() => { if (!cancelled) setAltFefoMap(result); })
     .catch(() => {})
     .finally(() => { if (!cancelled) setAltFefoLoading(false); });
    return () => { cancelled = true; };
  }, [fefoLoading, fefoMap, dispatchWH, dispatchReq]);

  const visibleRequests = requests.filter(r => {
    if (statusFilter === 'approved') return r.status === 'approved';
    if (statusFilter === 'pending')  return !r.status || r.status === 'pending';
    if (statusFilter === 'recent')   return r.status === 'dispatched' || r.status === 'rejected';
    return true;
  });

  const approvedCount = requests.filter(r => r.status === 'approved').length;
  const pendingCount  = requests.filter(r => !r.status || r.status === 'pending').length;

  const dispatchHasShortfall = (() => {
    if (!dispatchReq) return false;
    const items = Array.isArray(dispatchReq.items) ? dispatchReq.items : [];
    return items.some(it => {
      const n = it.productName || it.product_name || it.productId || '';
      const fefoResult = fefoMap[n];
      if (!fefoResult || fefoResult.shortfall <= 0) return false;
      return !(n in adjustedQtys);
    });
  })();

  const shortfallSummary = (() => {
    if (!dispatchReq) return [];
    const items = Array.isArray(dispatchReq.items) ? dispatchReq.items : [];
    return items
      .filter(it => {
        const n = it.productName || it.product_name || it.productId || '';
        return fefoMap[n]?.shortfall > 0;
      })
      .map(it => {
        const n = it.productName || it.product_name || it.productId || '';
        return { name: n, shortfall: fefoMap[n].shortfall };
      });
  })();

  const handleAutoAdjust = () => {
    const newAdj = {};
    for (const it of (Array.isArray(dispatchReq?.items) ? dispatchReq.items : [])) {
      const n = it.productName || it.product_name || it.productId || '';
      const fefoResult = fefoMap[n];
      if (!fefoResult || fefoResult.shortfall <= 0) continue;
      const original = Number(it.quantity || 0);
      const dispatched = Math.max(0, original - fefoResult.shortfall);
      newAdj[n] = { original, dispatched };
    }
    setAdjustedQtys(newAdj);
  };

  const handleDispatch = async () => {
    if (!dispatchReq) return;
    setModalAlert(null);

    const items = Array.isArray(dispatchReq.items) ? dispatchReq.items : [];
    const whLabel = WAREHOUSE_SOURCES.find(w => w.value === dispatchWH)?.label || dispatchWH;

    // Guard: FEFO lookup must be complete for all items before dispatch is allowed.
    // This closes the race window between modal open and async FEFO resolution.
    const allFefoLoaded = items.every(it => {
      const n = it.productName || it.product_name || '';
      return !n || (n in fefoMap);
    });
    if (fefoLoading || !allFefoLoaded) {
      setModalAlert({ type: 'error', msg: 'Batch resolution is still loading. Please wait a moment and try again.' });
      return;
    }

    // Block or warn dispatch if any item has a quantity shortfall in the selected warehouse.
    if (dispatchHasShortfall) {
      if (shortfallMode === 'block') {
        const shortfallItems = items
          .filter(it => {
            const n = it.productName || it.product_name || it.productId || '';
            return fefoMap[n]?.shortfall > 0;
          })
          .map(it => {
            const n = it.productName || it.product_name || it.productId || '';
            return `${n} (${fefoMap[n].shortfall} units short)`;
          });
        setModalAlert({ type: 'error', msg: `❌ Cannot dispatch — insufficient stock in ${whLabel}: ${shortfallItems.join(', ')}. Select a different warehouse or update stock levels first.` });
        return;
      }
      if (!shortfallAcknowledged) {
        setModalAlert({ type: 'error', msg: '⚠️ Please tick the shortfall acknowledgement checkbox before dispatching.' });
        return;
      }
    }

    setDispatching(true);
    try {
      const branchId = (dispatchReq.requestingBranch || dispatchReq.requesting_branch || '').toLowerCase().replace(/\s+/g, '_');
      const actor = user?.full_name || user?.fullName || user?.username || 'Stock Manager';
      const reqLabel = dispatchReq.requestNumber || dispatchReq.request_number || dispatchReq.id;

      // Build all movement records first so a partial failure doesn't leave the
      // request in a dispatched state without movement records.
      const movementPromises = [];
      for (const item of items) {
        const productName = item.productName || item.product_name || '';
        if (!productName || Number(item.quantity || 0) <= 0) continue;
        const fefoResult = fefoMap[productName];
        // Only create movements for batches with allocated_qty > 0.
        // dispatchHasShortfall guard above ensures every item has batches.
        for (const batch of (fefoResult?.batches || [])) {
          if (!batch.allocated_qty || batch.allocated_qty <= 0) continue;
          movementPromises.push(
            api.stock.createMovement({
              movement_type: 'warehouse_dispatch',
              product_name: productName,
              quantity: batch.allocated_qty,
              source_location: dispatchWH,
              source_location_type: 'warehouse',
              destination_location: branchId,
              destination_location_type: 'branch',
              reference_id: dispatchReq.id,
              batch_no: batch.batch_no || null,
              expiry_date: batch.expiry_date || null,
              notes: `Dispatched from ${whLabel} to ${fmtLocation(branchId)} — request ${reqLabel}. Batch: ${batch.batch_no || 'N/A'}${adjustedQtys[productName] ? ` [AUTO-ADJUSTED: originally ${adjustedQtys[productName].original}, dispatched ${adjustedQtys[productName].dispatched}]` : ''}`,
              created_by: actor,
            })
          );
        }
      }

      // Create all movements, then mark the request dispatched atomically.
      await Promise.all(movementPromises);

      await api.stock.updateRequest(dispatchReq.id, {
        status: 'dispatched',
        dispatch_warehouse: dispatchWH,
        dispatched_by: actor,
        dispatched_at: new Date().toISOString(),
        notes: `Dispatched from ${whLabel} by ${actor}`,
      });

      setAlert({ type: 'success', msg: `✅ ${items.length} item(s) dispatched from ${whLabel} to ${fmtLocation(branchId)}. Branch can now receive the delivery.` });
      setDispatchReq(null);
      setFefoMap({});
      setAltFefoMap({});
      setAdjustedQtys({});
      setModalAlert(null);
      setTimeout(() => load(), 150);
    } catch (err) {
      setModalAlert({ type: 'error', msg: err.message || 'Dispatch failed — please try again' });
    } finally {
      setDispatching(false);
    }
  };

  const handleDeny = async () => {
    if (!denyReq) return;
    setDenying(true);
    try {
      const actor = user?.full_name || user?.fullName || user?.username || 'Stock Manager';
      await api.stock.updateRequest(denyReq.id, {
        status: 'rejected',
        notes: denyReason || 'Denied by stock manager',
        reviewed_by: actor,
        reviewed_at: new Date().toISOString(),
      });
      setAlert({ type: 'success', msg: `Request from ${fmtLocation(denyReq.requestingBranch || denyReq.requesting_branch)} denied.` });
      setDenyReq(null);
      setDenyReason('');
      setTimeout(() => load(), 150);
    } catch (err) {
      setAlert({ type: 'error', msg: err.message || 'Action failed' });
    } finally {
      setDenying(false);
    }
  };

  const PRIORITY_STYLE = {
    urgent: { background: '#fef2f2', color: '#c41e3a', border: '1px solid #fecaca', fontWeight: 700 },
    high:   { background: '#fffbeb', color: '#92400e', border: '1px solid #fcd34d', fontWeight: 700 },
    normal: { background: '#f0f9ff', color: '#1e40af', border: '1px solid #bfdbfe' },
  };

  return (
    <div style={{ marginBottom: 28 }}>
      {alert && (
        <div style={{ background: alert.type === 'error' ? '#fef2f2' : '#f0fdf4', border: `1px solid ${alert.type === 'error' ? '#fca5a5' : '#86efac'}`, borderRadius: 10, padding: '10px 16px', marginBottom: 12, color: alert.type === 'error' ? '#991b1b' : '#166534', fontWeight: 600, fontSize: '0.88rem' }}>
          {alert.msg}
          <button onClick={() => setAlert(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: 'inherit' }}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.15rem' }}>📋</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1rem', color: '#1e293b' }}>Branch Stock Requests</div>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Stock requested by branches — dispatch or deny directly from here</div>
          </div>
          {approvedCount > 0 && (
            <span style={{ background: '#c41e3a', color: '#fff', borderRadius: 99, padding: '2px 10px', fontWeight: 800, fontSize: '0.78rem' }}>
              {approvedCount} awaiting dispatch
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['approved','✅ Approved'], ['pending','⏳ Pending GM'], ['recent','📁 Recent']].map(([v, l]) => (
            <button key={v} onClick={() => setStatusFilter(v)}
              style={{ padding: '5px 14px', borderRadius: 99, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', border: '1.5px solid', borderColor: statusFilter === v ? '#c41e3a' : '#e2e8f0', background: statusFilter === v ? '#fff0f3' : '#f8fafc', color: statusFilter === v ? '#c41e3a' : '#64748b' }}>
              {l}{v === 'approved' && approvedCount > 0 ? ` (${approvedCount})` : v === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
            </button>
          ))}
          <button onClick={load} style={{ padding: '5px 12px', borderRadius: 99, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', border: '1.5px solid #e2e8f0', background: '#f8fafc', color: '#64748b' }}>↺</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8', fontSize: '0.85rem' }}>Loading requests…</div>
      ) : visibleRequests.length === 0 ? (
        <div style={{ background: '#f8fafc', border: '1.5px dashed #e2e8f0', borderRadius: 12, padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
          {statusFilter === 'approved' ? 'No approved requests waiting for dispatch' : statusFilter === 'pending' ? 'No pending requests' : 'No recent activity'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {visibleRequests.map(r => {
            const items = Array.isArray(r.items) ? r.items : [];
            const branch = r.requestingBranch || r.requesting_branch || '—';
            const pri = (r.priority || 'normal').toLowerCase();
            const priStyle = PRIORITY_STYLE[pri] || PRIORITY_STYLE.normal;
            return (
              <div key={r.id} style={{ background: '#fff', border: r.status === 'approved' ? '2px solid #f59e0b' : '1.5px solid #f0f0f0', borderRadius: 14, padding: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.06)', position: 'relative' }}>
                {r.status === 'approved' && (
                  <div style={{ position: 'absolute', top: -1, right: 16, background: '#f59e0b', color: '#fff', fontSize: '0.68rem', fontWeight: 800, padding: '2px 10px', borderRadius: '0 0 8px 8px', letterSpacing: '0.04em' }}>
                    AWAITING DISPATCH
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.97rem', color: '#1e293b' }}>
                      📍 {fmtLocation(branch)}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>
                      {r.requestNumber || r.id} · {formatDateTime(r.createdAt || r.created_at)}
                    </div>
                    {r.createdBy && (
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 1 }}>
                        👤 Requested by: <strong>{r.createdBy}</strong>
                      </div>
                    )}
                    {r.approvedBy && (
                      <div style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: 1 }}>
                        ✅ Approved by: <strong>{r.approvedBy}</strong>{r.approvedAt ? ` · ${formatDateTime(r.approvedAt)}` : ''}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ ...priStyle, borderRadius: 99, padding: '2px 10px', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                      {pri === 'urgent' ? '🔴' : pri === 'high' ? '🟠' : '🔵'} {pri}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                      {r.status === 'dispatched' ? `✅ Dispatched from ${fmtLocation(r.dispatchWarehouse || r.dispatch_warehouse || 'warehouse')}` : r.status === 'rejected' ? '❌ Denied' : ''}
                    </span>
                  </div>
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Products Requested ({items.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {items.length === 0 ? (
                      <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No items listed</span>
                    ) : items.map((it, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7, padding: '5px 10px' }}>
                        {(() => {
                          const name = it.productName || it.productId || it.product_name;
                          const isUnknown = !name || name === 'Item' || name === 'UNKNOWN';
                          return (
                            <span style={{ fontWeight: isUnknown ? 400 : 600, fontSize: '0.82rem', color: isUnknown ? '#94a3b8' : '#1e293b', fontStyle: isUnknown ? 'italic' : 'normal' }}>
                              {isUnknown ? '⚠ Name not recorded' : name}
                            </span>
                          );
                        })()}
                        <span style={{ fontWeight: 800, fontSize: '0.85rem', color: '#c41e3a', marginLeft: 8, whiteSpace: 'nowrap' }}>× {it.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {r.notes && (
                  <div style={{ fontSize: '0.78rem', color: '#64748b', fontStyle: 'italic', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, padding: '5px 10px', marginBottom: 10 }}>
                    💬 {r.notes}
                  </div>
                )}

                {r.status === 'approved' && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => { setDispatchReq(r); setDispatchWH('windhoek_warehouse'); setModalAlert(null); }}
                      style={{ flex: 1, minWidth: 120, background: '#c41e3a', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 0', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      🚚 Dispatch
                    </button>
                    <button
                      onClick={() => { setDenyReq(r); setDenyReason(''); }}
                      style={{ background: '#fef2f2', color: '#c41e3a', border: '1.5px solid #fecaca', borderRadius: 9, padding: '9px 14px', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                      ✕ Deny
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dispatch Modal */}
      {dispatchReq && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#1e293b', marginBottom: 4 }}>🚚 Dispatch Request</div>
            <div style={{ fontSize: '0.83rem', color: '#64748b', marginBottom: 18 }}>
              Dispatching stock to <strong>{fmtLocation(dispatchReq.requestingBranch || dispatchReq.requesting_branch)}</strong>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.83rem', color: '#374151', marginBottom: 6 }}>Dispatch From (Source Warehouse)</label>
              <select value={dispatchWH} onChange={e => setDispatchWH(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.88rem', background: '#fff', outline: 'none' }}>
                {WAREHOUSE_SOURCES.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
            </div>

            {/* FEFO Batch Resolution Panel */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Items & FEFO Batch Assignment</span>
                {fefoLoading && <span style={{ fontSize: '0.72rem', color: '#1d6fa4', fontWeight: 600 }}>⏳ Resolving batches…</span>}
              </div>
              {(Array.isArray(dispatchReq.items) ? dispatchReq.items : []).map((it, i) => {
                const items = dispatchReq.items;
                const n = it.productName || it.productId || it.product_name;
                const bad = !n || n === 'Item' || n === 'UNKNOWN';
                const fefoResult = fefoMap[n];
                const hasBatches = fefoResult?.batches?.length > 0;
                const hasShortfall = fefoResult?.shortfall > 0;
                return (
                  <div key={i} style={{ marginBottom: i < items.length - 1 ? 10 : 0, paddingBottom: i < items.length - 1 ? 10 : 0, borderBottom: i < items.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: hasBatches ? 5 : 0 }}>
                      <span style={{ fontWeight: bad ? 400 : 600, fontStyle: bad ? 'italic' : 'normal', color: bad ? '#94a3b8' : '#1e293b', fontSize: '0.85rem' }}>
                        {bad ? '⚠ Name not recorded' : n}
                      </span>
                      <span style={{ fontWeight: 800, color: '#c41e3a', fontSize: '0.85rem' }}>× {it.quantity}</span>
                    </div>
                    {!fefoLoading && fefoResult && hasBatches && (
                      <div style={{ paddingLeft: 10, borderLeft: '3px solid #1d6fa4' }}>
                        {fefoResult.batches.map((b, bi) => (
                          <div key={bi} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.77rem', color: '#374151', marginTop: 3 }}>
                            <span style={{ fontFamily: 'monospace', background: '#e0f2fe', padding: '1px 6px', borderRadius: 4, fontWeight: 700, color: '#0c4a6e' }}>{b.batch_no || '—'}</span>
                            <span style={{ color: '#64748b' }}>Exp: {b.expiry_date ? new Date(b.expiry_date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                            <span style={{ fontWeight: 700, color: '#166534', marginLeft: 'auto' }}>qty: {b.allocated_qty}</span>
                          </div>
                        ))}
                        {hasShortfall && (
                          <div style={{ marginTop: 4, fontSize: '0.74rem', color: '#b45309', fontWeight: 700 }}>
                            ⚠️ Stock shortfall: {fefoResult.shortfall} units unavailable in {WAREHOUSE_SOURCES.find(w => w.value === dispatchWH)?.label || dispatchWH}
                          </div>
                        )}
                      </div>
                    )}
                    {!fefoLoading && fefoResult && !hasBatches && (
                      <div style={{ paddingLeft: 10, fontSize: '0.75rem', color: '#b45309', fontWeight: 600, marginTop: 3 }}>
                        ⚠️ No batch records found in {WAREHOUSE_SOURCES.find(w => w.value === dispatchWH)?.label || dispatchWH} — dispatch will proceed without batch info
                      </div>
                    )}
                    {!fefoLoading && !fefoResult && !fefoLoading && (
                      <div style={{ paddingLeft: 10, fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>Loading batch info…</div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '8px 12px', marginBottom: 18, fontSize: '0.78rem', color: '#9a3412' }}>
              ✅ FEFO batch numbers and expiry dates will be recorded automatically. The branch receipt form will be pre-filled with these details. {shortfallMode === 'block' ? 'Dispatch is blocked if any item has insufficient warehouse stock.' : 'A warning is shown if any item has insufficient stock — acknowledgement required to proceed.'}
            </div>

            {modalAlert && (
              <div style={{ background: modalAlert.type === 'error' ? '#fef2f2' : '#f0fdf4', border: `1px solid ${modalAlert.type === 'error' ? '#fca5a5' : '#86efac'}`, borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: '0.83rem', fontWeight: 600, color: modalAlert.type === 'error' ? '#991b1b' : '#166534' }}>
                {modalAlert.msg}
              </div>
            )}

            {dispatchHasShortfall && !fefoLoading && (() => {
              const isWarn = shortfallMode === 'warn';
              return (
                <div style={{ background: isWarn ? '#fffbeb' : '#fef2f2', border: `2px solid ${isWarn ? '#fbbf24' : '#f87171'}`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: '1.1rem' }}>{isWarn ? '⚠️' : '🚫'}</span>
                    <span style={{ fontWeight: 800, fontSize: '0.88rem', color: isWarn ? '#92400e' : '#991b1b' }}>
                      {isWarn ? 'Stock Shortfall Warning' : 'Insufficient Stock — Dispatch Blocked'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: isWarn ? '#78350f' : '#7f1d1d', marginBottom: 8 }}>
                    The following products cannot be fully filled from <strong>{WAREHOUSE_SOURCES.find(w => w.value === dispatchWH)?.label || dispatchWH}</strong>:
                  </div>
                  <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {shortfallSummary.map((s, i) => (
                      <li key={i} style={{ fontSize: '0.82rem', fontWeight: 700, color: isWarn ? '#92400e' : '#991b1b' }}>
                        {s.name} — <span style={{ color: isWarn ? '#b45309' : '#b91c1c' }}>{s.shortfall} unit{s.shortfall !== 1 ? 's' : ''} short</span>
                      </li>
                    ))}
                  </ul>
                  {isWarn ? (
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10, cursor: 'pointer' }}>
                      <input type="checkbox" checked={shortfallAcknowledged} onChange={e => setShortfallAcknowledged(e.target.checked)}
                        style={{ marginTop: 2, accentColor: '#d97706', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.78rem', color: '#92400e', fontWeight: 600 }}>
                        I acknowledge the shortfall and confirm that a partial dispatch is acceptable for this order.
                      </span>
                    </label>
                  ) : (
                    <div style={{ marginTop: 8, fontSize: '0.77rem', color: '#9a3412', fontWeight: 600 }}>
                      Select a different source warehouse or resolve the stock shortfall before dispatching.
                    </div>
                  )}
                  {!isWarn && Object.keys(adjustedQtys).length === 0 && (
                    <button onClick={handleAutoAdjust}
                      style={{ marginTop: 10, padding: '7px 16px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', width: '100%' }}>
                      ⚡ Auto-Adjust Quantities to Available Stock
                    </button>
                  )}
                  {!isWarn && Object.keys(adjustedQtys).length > 0 && (
                    <div style={{ marginTop: 10, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '8px 12px', fontSize: '0.78rem', color: '#166534' }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>✅ Quantities auto-adjusted — dispatch unblocked:</div>
                      <ul style={{ margin: 0, padding: '0 0 0 16px' }}>
                        {Object.entries(adjustedQtys).map(([name, { original, dispatched }]) => (
                          <li key={name}><strong>{name}</strong>: {original} → {dispatched} units{dispatched === 0 ? ' (removed from dispatch)' : ''}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!isWarn && (
                    <>
                      {/* Alternative warehouse availability (block mode) */}
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #fca5a5' }}>
                        <div style={{ fontSize: '0.77rem', fontWeight: 700, color: '#7f1d1d', marginBottom: 6 }}>
                          📦 Stock availability in other warehouses:
                        </div>
                        {altFefoLoading ? (
                          <div style={{ fontSize: '0.75rem', color: '#9a3412', fontStyle: 'italic' }}>⏳ Checking other warehouses…</div>
                        ) : (
                          WAREHOUSE_SOURCES.filter(w => w.value !== dispatchWH).map(wh => {
                            const whData = altFefoMap[wh.value] || {};
                            const allCanFill = shortfallSummary.length > 0 && shortfallSummary.every(s => whData[s.name]?.canFill);
                            const anyAvailable = shortfallSummary.some(s => (whData[s.name]?.available || 0) > 0);
                            return (
                              <div key={wh.value} style={{ marginBottom: 6, background: allCanFill ? '#f0fdf4' : anyAvailable ? '#fffbeb' : '#fafafa', border: `1px solid ${allCanFill ? '#86efac' : anyAvailable ? '#fcd34d' : '#e2e8f0'}`, borderRadius: 8, padding: '8px 10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: shortfallSummary.length > 1 ? 5 : 0 }}>
                                  <button
                                    onClick={() => { setDispatchWH(wh.value); setAltFefoMap({}); }}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: '0.82rem', color: allCanFill ? '#166534' : anyAvailable ? '#92400e' : '#374151', textDecoration: 'underline', padding: 0 }}>
                                    {wh.label}
                                  </button>
                                  {allCanFill ? (
                                    <span style={{ fontSize: '0.72rem', background: '#bbf7d0', color: '#166534', borderRadius: 99, padding: '1px 8px', fontWeight: 700 }}>✅ Can fill order</span>
                                  ) : anyAvailable ? (
                                    <span style={{ fontSize: '0.72rem', background: '#fef3c7', color: '#92400e', borderRadius: 99, padding: '1px 8px', fontWeight: 700 }}>⚠️ Partial stock</span>
                                  ) : (
                                    <span style={{ fontSize: '0.72rem', background: '#fee2e2', color: '#991b1b', borderRadius: 99, padding: '1px 8px', fontWeight: 700 }}>❌ No stock</span>
                                  )}
                                </div>
                                {shortfallSummary.map(s => {
                                  const info = whData[s.name];
                                  return (
                                    <div key={s.name} style={{ fontSize: '0.74rem', color: '#475569', display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 2 }}>
                                      <span style={{ fontWeight: 600 }}>{s.name}</span>
                                      <span style={{ color: info?.canFill ? '#166534' : info?.available > 0 ? '#92400e' : '#991b1b', fontWeight: 700 }}>
                                        {info ? `${info.available} avail${info.shortfall > 0 ? ` (${info.shortfall} short)` : ''}` : '—'}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })
                        )}
                      </div>
                      <div style={{ marginTop: 8, fontSize: '0.77rem', color: '#9a3412', fontWeight: 600 }}>
                        Click a warehouse above to switch source, or resolve the shortfall before dispatching.
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleDispatch}
                disabled={dispatching || fefoLoading || (dispatchHasShortfall && shortfallMode === 'block')}
                style={{ flex: 1, background: (dispatchHasShortfall && shortfallMode === 'block') ? '#94a3b8' : '#c41e3a', color: '#fff', border: 'none', borderRadius: 9, padding: '11px 0', fontWeight: 800, fontSize: '0.88rem', cursor: (dispatching || fefoLoading || (dispatchHasShortfall && shortfallMode === 'block')) ? 'not-allowed' : 'pointer', opacity: (dispatching || fefoLoading) ? 0.7 : 1 }}>
                {dispatching ? 'Dispatching…' : fefoLoading ? 'Resolving batches…' : (dispatchHasShortfall && shortfallMode === 'block') ? '🚫 Insufficient Stock' : '🚚 Confirm Dispatch'}
              </button>
              <button onClick={() => { setDispatchReq(null); setModalAlert(null); setFefoMap({}); setAltFefoMap({}); setAdjustedQtys({}); setShortfallAcknowledged(false); }} disabled={dispatching}
                style={{ background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 9, padding: '11px 18px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deny Modal */}
      {denyReq && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#c41e3a', marginBottom: 4 }}>✕ Deny Request</div>
            <div style={{ fontSize: '0.83rem', color: '#64748b', marginBottom: 16 }}>
              Denying stock request from <strong>{fmtLocation(denyReq.requestingBranch || denyReq.requesting_branch)}</strong>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: '0.83rem', color: '#374151', marginBottom: 6 }}>Reason for denial (optional)</label>
              <textarea value={denyReason} onChange={e => setDenyReason(e.target.value)} rows={3}
                placeholder="e.g. Stock not available, request duplicate…"
                style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.85rem', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={handleDeny} disabled={denying}
                style={{ flex: 1, background: '#fef2f2', color: '#c41e3a', border: '1.5px solid #fecaca', borderRadius: 9, padding: '11px 0', fontWeight: 800, fontSize: '0.88rem', cursor: denying ? 'not-allowed' : 'pointer', opacity: denying ? 0.7 : 1 }}>
                {denying ? 'Denying…' : '✕ Confirm Denial'}
              </button>
              <button onClick={() => setDenyReq(null)}
                style={{ background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: 9, padding: '11px 18px', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function WarehousesTab() {
  const [selected, setSelected] = useState('windhoek');
  return (
    <div>
      <BranchRequestsPanel />
      <div style={{ borderTop: '2px solid #f0f0f0', margin: '8px 0 18px', paddingTop: 18 }}>
        <div style={{ fontWeight: 800, fontSize: '1rem', color: '#1e293b', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🏭</span> Warehouse Management
        </div>
        <div className="flex gap-2 mb-4">
          {[{ id: 'windhoek', label: '🏢 Windhoek Warehouse' }, { id: 'ondangwa', label: '🏬 Ondangwa Warehouse' }].map(w => (
            <button key={w.id} onClick={() => setSelected(w.id)}
              style={{ padding: '8px 20px', borderRadius: 99, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', border: '2px solid', borderColor: selected === w.id ? '#c41e3a' : '#e2e8f0', background: selected === w.id ? '#fff0f3' : '#f8fafc', color: selected === w.id ? '#c41e3a' : '#64748b' }}>
              {w.label}
            </button>
          ))}
        </div>
        <WarehouseTab name={selected === 'windhoek' ? 'Windhoek' : 'Ondangwa'} />
      </div>
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
  useEffect(() => {
    const iv = setInterval(loadData, 60000);
    return () => clearInterval(iv);
  }, [loadData]);

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
  const { user } = useAuth();
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
      await api.stock.createTransfer({
        from_location: fromLocation,
        to_location: toLocation,
        items: cart.map(item => ({ productName: item.description, quantity: Number(item.qty) })),
        status: 'pending_approval',
        created_by: user?.full_name || user?.username,
      });
      setAlert({ type: 'success', msg: `Transfer of ${cart.length} product${cart.length !== 1 ? 's' : ''} created successfully` });
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
      const payload = { status: newStatus };
      if (newStatus === 'dispatched') {
        payload.dispatched_by = user?.full_name || user?.fullName || user?.username;
      }
      await api.stock.updateTransfer(id, payload);
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
  const approvedPending = filteredTransfers.filter(t => t.status === 'approved');

  return (
    <div>
      {alert && <Alert type={alert.type} className="mb-4">{alert.msg}</Alert>}
      {approvedPending.length > 0 && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.1rem' }}>📦</span>
          <div>
            <span style={{ fontWeight: 700, color: '#92400e' }}>{approvedPending.length} GM-approved transfer{approvedPending.length !== 1 ? 's' : ''} awaiting dispatch</span>
            <span style={{ color: '#a16207', fontSize: '0.82rem', marginLeft: 6 }}>— scroll down to find and click "Dispatch" on each one</span>
          </div>
        </div>
      )}
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
            { header: 'Product(s)', render: r => {
              const items = Array.isArray(r.items) ? r.items : [];
              if (items.length > 0) {
                const display = items.slice(0, 2).map(i => i.productName || i.product_name || '—').join(', ');
                return <span className="text-sm" title={items.map(i => `${i.productName || i.product_name} ×${i.quantity_approved ?? i.quantityApproved ?? i.quantity}`).join('\n')}>
                  {display}{items.length > 2 ? ` +${items.length - 2} more` : ''}
                </span>;
              }
              return <span className="text-sm">{r.product_name || '—'}</span>;
            }},
            { header: 'Qty', render: r => {
              const items = Array.isArray(r.items) ? r.items : [];
              if (items.length > 1) return <span title={items.map(i => `${i.productName || i.product_name} ×${i.quantity_approved ?? i.quantityApproved ?? i.quantity ?? 0}`).join('\n')}>{items.reduce((s, i) => s + Number(i.quantity_approved ?? i.quantityApproved ?? i.quantity ?? 0), 0)} ({items.length} items)</span>;
              return r.quantity || 0;
            }},
            { header: 'Status', render: r => {
              if (r.status === 'approved') return <Badge variant="warning" style={{ background: '#fef9c3', color: '#854d0e', border: '1px solid #fde68a' }}>✅ Approved — Ready to Dispatch</Badge>;
              if (r.status === 'completed' || r.status === 'delivered') return <Badge variant="success">{r.status}</Badge>;
              if (r.status === 'in_transit' || r.status === 'dispatched') return <Badge variant="info">{r.status.replace(/_/g, ' ')}</Badge>;
              return <Badge variant="warning">{r.status || 'Pending'}</Badge>;
            }},
            { header: 'Notes', render: r => {
              const note = r.notes || (r.metadata && r.metadata.notes) || (typeof r.metadata === 'string' ? (() => { try { return JSON.parse(r.metadata).notes; } catch { return ''; } })() : '');
              return note ? <span className="text-xs text-gray-500 truncate max-w-[120px] block" title={note}>{note}</span> : <span className="text-xs text-gray-300">—</span>;
            }},
            { header: 'Actions', render: r => (
              <div className="flex gap-1 flex-wrap">
                {(!r.status || r.status === 'pending' || r.status === 'approved') && (
                  <Button size="sm" variant="warning" onClick={() => updateStatus(r.id, 'dispatched')}>
                    {r.status === 'approved' ? '🚚 Dispatch' : 'Dispatch'}
                  </Button>
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

  // ── data state ──────────────────────────────────────────────
  const [movements, setMovements]     = useState([]);
  const [batches, setBatches]         = useState([]);
  const [imports, setImports]         = useState([]);
  const [transfers, setTransfers]     = useState([]);
  const [branchMovements, setBranchMovements] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [alert, setAlert]             = useState(null);

  // ── filter state ─────────────────────────────────────────────
  const [dateFrom, setDateFrom]       = useState('');
  const [dateTo, setDateTo]           = useState('');
  const [mvSearch, setMvSearch]       = useState('');
  const [mvTypeFilter, setMvTypeFilter] = useState('');
  const [mvSection, setMvSection]     = useState('summary'); // 'summary' | 'movements' | 'batches'

  // ── record-movement form ─────────────────────────────────────
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [recordForm, setRecordForm]   = useState({
    product_name: '', movement_type: 'in', quantity: '',
    location: branch && branch !== 'all' ? branch : 'country_stock',
    reference: '', notes: '',
  });

  const loadAll = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.stock.movements().then(d => Array.isArray(d) ? d : d.movements || []),
      api.stock.batches().then(d => Array.isArray(d) ? d : d.batches || []),
      api.stock.supplierImports().catch(() => []).then(d => Array.isArray(d) ? d : d.imports || []),
      api.stock.transfers().catch(() => []).then(d => Array.isArray(d) ? d : d.transfers || []),
      fetch('/api/branch/inventory-movements', { credentials: 'include' }).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([mvs, bts, imps, trfs, brMvs]) => {
      setMovements(mvs);
      setBatches(bts);
      setImports(Array.isArray(imps) ? imps : []);
      setTransfers(Array.isArray(trfs) ? trfs : []);
      setBranchMovements(Array.isArray(brMvs) ? brMvs : (brMvs?.movements || []));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const { connected: wsConnected } = useStockRealtime({ onUpdate: loadAll });
  useEffect(() => { loadAll(); }, [loadAll]);

  // ── date-range helpers ───────────────────────────────────────
  const inPeriod = (dateStr) => {
    if (!dateStr) return true;
    const d = new Date(dateStr);
    if (dateFrom && d < new Date(dateFrom)) return false;
    if (dateTo   && d > new Date(dateTo + 'T23:59:59')) return false;
    return true;
  };
  const quickRange = (days) => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - days);
    setDateFrom(from.toISOString().split('T')[0]);
    setDateTo(to.toISOString().split('T')[0]);
  };

  // ── period-filtered slices ───────────────────────────────────
  const periodImports   = imports.filter(i => inPeriod(i.date_received || i.created_at));
  const periodMovements = movements.filter(m => inPeriod(m.created_at));
  const periodTransfers = transfers.filter(t => inPeriod(t.created_at || t.createdAt));
  const periodBranchMvs = branchMovements.filter(b => inPeriod(b.created_at));

  // ── KPI computations ─────────────────────────────────────────
  const totalImported = periodImports.reduce((s, i) => s + Number(i.quantity || 0), 0);
  const importedValue  = periodImports.reduce((s, i) => s + Number(i.cif_total_value || 0), 0);

  const countryStockQty  = batches.filter(b => b.location === 'country_stock').reduce((s, b) => s + Number(b.remaining_quantity || 0), 0);
  const countryStockDPC  = batches.filter(b => b.location === 'country_stock').reduce((s, b) => s + Number(b.remaining_quantity || 0) * (getDPCPrice(b.product_name || b.description || '') || Number(b.unit_price || 0)), 0);
  const warehouseQty     = batches.filter(b => b.location && b.location !== 'country_stock' && !b.location.includes('branch')).reduce((s, b) => s + Number(b.remaining_quantity || 0), 0);
  const totalAvailable   = batches.filter(b => b.status !== 'expired' && b.status !== 'depleted').reduce((s, b) => s + Number(b.remaining_quantity || 0), 0);

  const distributedToBranches = periodTransfers.filter(t => {
    const dest = (t.toBranch || t.to_location || '').toLowerCase();
    return ['delivered','received'].includes(t.status) && dest && !dest.includes('warehouse') && !dest.includes('country_stock');
  }).reduce((s, t) => {
    const items = Array.isArray(t.items) ? t.items : [];
    return s + (items.length > 0 ? items.reduce((a, i) => a + Number(i.quantityReceived ?? i.quantity_received ?? i.quantity ?? 0), 0) : Number(t.quantity || 0));
  }, 0);
  const branchHeld    = batches.filter(b => b.location && b.location.toLowerCase().includes('branch')).reduce((s, b) => s + Number(b.remaining_quantity || 0), 0) ||
                        periodBranchMvs.filter(b => b.type === 'receive').reduce((s, b) => s + Number(b.quantity || 0), 0);
  const branchSold    = periodBranchMvs.filter(b => ['dispense','sale','sold','issue'].includes((b.type||'').toLowerCase())).reduce((s, b) => s + Number(b.quantity || 0), 0);
  const writtenOff    = periodMovements.filter(m => (m.movement_type||'').toLowerCase().includes('write_off') || (m.movement_type||'').toLowerCase().includes('write-off')).reduce((s, m) => s + Number(m.quantity || 0), 0);
  const expiredBatches = batches.filter(b => b.status === 'expired');
  const expiredQty    = expiredBatches.reduce((s, b) => s + Number(b.remaining_quantity || 0), 0);
  const releasedToWh  = periodMovements.filter(m => ['transfer_in','warehouse_receipt','received'].some(k => (m.movement_type||'').toLowerCase().includes(k)) && (m.destination_location||'').toLowerCase().includes('warehouse')).reduce((s, m) => s + Number(m.quantity || 0), 0);

  // ── per-product summary ──────────────────────────────────────
  const productNames = [...new Set([
    ...imports.map(i => i.product_name),
    ...batches.map(b => b.description || b.product_name),
  ].filter(Boolean))];

  const productSummary = productNames.map(name => {
    const norm = (n) => (n||'').toLowerCase().trim();
    const nName = norm(name);
    const imp   = periodImports.filter(i => norm(i.product_name) === nName).reduce((s, i) => s + Number(i.quantity||0), 0);
    const csBatches = batches.filter(b => norm(b.description || b.product_name) === nName && b.location === 'country_stock');
    const whBatches = batches.filter(b => norm(b.description || b.product_name) === nName && b.location && b.location !== 'country_stock' && !b.location.includes('branch'));
    const expBatches = batches.filter(b => norm(b.description || b.product_name) === nName && b.status === 'expired');
    const csHeld = csBatches.reduce((s, b) => s + Number(b.remaining_quantity||0), 0);
    const whHeld = whBatches.reduce((s, b) => s + Number(b.remaining_quantity||0), 0);
    const expQty = expBatches.reduce((s, b) => s + Number(b.remaining_quantity||0), 0);
    const branchRcvd = periodBranchMvs.filter(b => norm(b.product_name) === nName && b.type === 'receive').reduce((s, b) => s + Number(b.quantity||0), 0);
    const sold   = periodBranchMvs.filter(b => norm(b.product_name) === nName && ['dispense','sale','sold','issue'].includes((b.type||'').toLowerCase())).reduce((s, b) => s + Number(b.quantity||0), 0);
    const woff   = periodMovements.filter(m => norm(m.product_name) === nName && (m.movement_type||'').toLowerCase().includes('write')).reduce((s, m) => s + Number(m.quantity||0), 0);
    const batNum = [...new Set(batches.filter(b => norm(b.description || b.product_name) === nName).map(b => b.batch_no).filter(Boolean))];
    const dpcVal = getDPCPrice(name);
    return { name, imp, csHeld, whHeld, branchRcvd, sold, woff, expQty, batNum, dpcVal, totalHeld: csHeld + whHeld };
  }).filter(p => p.imp > 0 || p.csHeld > 0 || p.whHeld > 0 || p.branchRcvd > 0 || p.sold > 0 || p.expQty > 0);

  // ── filtered movements for the detail table ─────────────────
  const filteredMvs = periodMovements.filter(m => {
    if (branch !== 'all' && (m.source_location || m.destination_location || '').toLowerCase().replace(/\s+/g,'_') !== branch) {
      const src = (m.source_location||'').toLowerCase();
      const dst = (m.destination_location||'').toLowerCase();
      if (!src.includes(branch) && !dst.includes(branch)) return false;
    }
    if (mvTypeFilter && m.movement_type !== mvTypeFilter) return false;
    if (mvSearch && !(m.product_name||'').toLowerCase().includes(mvSearch.toLowerCase()) && !(m.batch_no||'').toLowerCase().includes(mvSearch.toLowerCase())) return false;
    return true;
  });

  // ── print ────────────────────────────────────────────────────
  const handlePrint = () => {
    const period = dateFrom || dateTo ? `${dateFrom||'start'} to ${dateTo||'now'}` : 'All time';
    const kpiHtml = `
      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:18px">
        ${[
          ['🚢 Imported', totalImported, '#166534','#f0fdf4','#86efac'],
          ['🏪 Country Stock', countryStockQty, '#1e40af','#eff6ff','#93c5fd'],
          ['🏭 In Warehouses', warehouseQty, '#7c3aed','#f5f3ff','#c4b5fd'],
          ['📦 At Branches', branchHeld, '#0369a1','#f0f9ff','#7dd3fc'],
          ['💊 Branch Sold', branchSold, '#16a34a','#f0fdf4','#86efac'],
          ['⚠️ Expired', expiredQty, '#dc2626','#fef2f2','#fca5a5'],
          ['✏️ Written Off', writtenOff, '#92400e','#fffbeb','#fcd34d'],
          ['✅ Total Available', totalAvailable, '#065f46','#ecfdf5','#34d399'],
        ].map(([label,val,color,bg,border]) => `<div style="background:${bg};border:1.5px solid ${border};border-radius:8px;padding:10px 14px;min-width:110px;text-align:center"><div style="font-size:24px;font-weight:900;color:${color}">${val}</div><div style="font-size:10px;font-weight:700;color:${color};margin-top:2px">${label}</div></div>`).join('')}
      </div>`;
    const prodRows = productSummary.map((p,i) => `<tr style="background:${i%2===0?'#fff':'#f8fafc'}"><td style="padding:5px 8px;font-weight:600">${p.name}</td><td style="padding:5px 8px;text-align:center;color:#166534;font-weight:700">${p.imp||'—'}</td><td style="padding:5px 8px;text-align:center;color:#1e40af">${p.csHeld||'—'}</td><td style="padding:5px 8px;text-align:center;color:#7c3aed">${p.whHeld||'—'}</td><td style="padding:5px 8px;text-align:center;color:#0369a1">${p.branchRcvd||'—'}</td><td style="padding:5px 8px;text-align:center;color:#16a34a">${p.sold||'—'}</td><td style="padding:5px 8px;text-align:center;color:#dc2626">${p.expQty||'—'}</td><td style="padding:5px 8px;text-align:center;color:#92400e">${p.woff||'—'}</td><td style="padding:5px 8px;text-align:center;font-weight:800;color:#065f46">${p.csHeld+p.whHeld}</td></tr>`).join('');
    const mvRows = filteredMvs.map(m => `<tr><td style="padding:4px 7px;font-size:10px">${formatDateTime(m.created_at)}</td><td style="padding:4px 7px;font-size:10px">${m.product_name||'—'}</td><td style="padding:4px 7px;font-family:monospace;font-size:9px">${m.batch_no||'—'}</td><td style="padding:4px 7px;font-size:10px;text-transform:capitalize">${(m.movement_type||'').replace(/_/g,' ')}</td><td style="padding:4px 7px;font-weight:700;text-align:center">${m.quantity||0}</td><td style="padding:4px 7px;font-size:10px">${fmtLocation(m.source_location||m.location||'')}</td><td style="padding:4px 7px;font-size:10px">${fmtLocation(m.destination_location||'')}</td><td style="padding:4px 7px;font-size:9px;font-family:monospace">${m.reference_id||m.reference||'—'}</td></tr>`).join('');
    printDocument('Dynapharm Stock Inventory Report', `
      <div style="font-size:11px;color:#64748b;margin-bottom:4px">Period: <strong>${period}</strong> &nbsp;|&nbsp; Generated: ${new Date().toLocaleString('en-ZA')}</div>
      ${kpiHtml}
      <h3 style="font-size:13px;font-weight:800;margin:14px 0 6px;color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:4px">Per-Product Breakdown</h3>
      <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:18px">
        <thead><tr style="background:#f1f5f9"><th style="padding:5px 8px;text-align:left">Product</th><th>Imported</th><th>Country Stock</th><th>Warehouses</th><th>To Branches</th><th>Sold</th><th>Expired</th><th>Written Off</th><th>Available</th></tr></thead>
        <tbody>${prodRows}</tbody>
      </table>
      <h3 style="font-size:13px;font-weight:800;margin:14px 0 6px;color:#1e293b;border-bottom:2px solid #e2e8f0;padding-bottom:4px">Movement Detail (${filteredMvs.length} records)</h3>
      <table style="width:100%;border-collapse:collapse;font-size:10px">
        <thead><tr style="background:#f1f5f9"><th style="padding:4px 7px;text-align:left">Date</th><th>Product</th><th>Batch</th><th>Type</th><th>Qty</th><th>From</th><th>To</th><th>Reference</th></tr></thead>
        <tbody>${mvRows}</tbody>
      </table>
    `);
  };

  // ── record movement ──────────────────────────────────────────
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
      loadAll();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message || 'Failed to record movement' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  const mvTypes = [...new Set(movements.map(m => m.movement_type).filter(Boolean))];
  const periodLabel = dateFrom || dateTo ? `${dateFrom||'start'} – ${dateTo||'now'}` : 'All time';

  return (
    <div className="space-y-5">
      {alert && <Alert type={alert.type} className="mb-2" onClose={() => setAlert(null)}>{alert.msg}</Alert>}

      {/* ── Period selector ── */}
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-bold text-gray-700">📅 Period:</span>
            {[['Today',0],['7 days',7],['30 days',30],['90 days',90],['This year',365]].map(([label,days]) => (
              <button key={label} onClick={() => days === 0 ? (setDateFrom(new Date().toISOString().split('T')[0]), setDateTo(new Date().toISOString().split('T')[0])) : quickRange(days)}
                style={{ padding: '4px 12px', borderRadius: 20, border: '1.5px solid #e2e8f0', background: '#f8fafc', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', color: '#475569' }}>
                {label}
              </button>
            ))}
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.8rem' }} />
            <span className="text-gray-400 text-sm">to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.8rem' }} />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); }}
                style={{ fontSize: '0.75rem', color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>✕ Clear</button>
            )}
            <div className="flex-1" />
            <div className="flex gap-2">
              {wsConnected && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#dcfce7', color: '#166534', borderRadius: 99, padding: '3px 10px', fontSize: '0.72rem', fontWeight: 700 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: '#16a34a', display: 'inline-block' }} />LIVE</span>}
              <button onClick={handlePrint}
                style={{ padding: '6px 14px', background: '#c41e3a', color: '#fff', border: 'none', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                🖨 Print Report
              </button>
              <Button size="sm" onClick={() => { setShowRecordForm(true); setAlert(null); }}>
                <Plus size={14} /> Record Movement
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* ── KPI Summary cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Imported', sub: 'from supplier', value: totalImported, sub2: importedValue ? `CIF: ${formatCurrency(importedValue)}` : null, icon: '🚢', bg: '#f0fdf4', border: '#86efac', color: '#166534' },
          { label: 'Country Stock', sub: 'on hand', value: countryStockQty, sub2: countryStockDPC > 0 ? `${formatCurrency(countryStockDPC)} est. DPC` : null, icon: '🏪', bg: '#eff6ff', border: '#93c5fd', color: '#1e40af' },
          { label: 'In Warehouses', sub: 'on hand', value: warehouseQty, icon: '🏭', bg: '#f5f3ff', border: '#c4b5fd', color: '#7c3aed' },
          { label: 'Released to Wh.', sub: 'period movements', value: releasedToWh, icon: '📤', bg: '#fff7ed', border: '#fed7aa', color: '#c2410c' },
          { label: 'At Branches', sub: 'received', value: branchHeld, icon: '📦', bg: '#f0f9ff', border: '#7dd3fc', color: '#0369a1' },
          { label: 'Branch Sold', sub: 'dispensed', value: branchSold, icon: '💊', bg: '#ecfdf5', border: '#6ee7b7', color: '#065f46' },
          { label: 'Expired Stock', sub: `${expiredBatches.length} batche${expiredBatches.length !== 1 ? 's' : ''}`, value: expiredQty, icon: '⚠️', bg: '#fef2f2', border: '#fca5a5', color: '#dc2626' },
          { label: 'Written Off', sub: 'all time', value: writtenOff, icon: '✏️', bg: '#fffbeb', border: '#fcd34d', color: '#92400e' },
          { label: 'Total Available', sub: 'all locations', value: totalAvailable, icon: '✅', bg: '#ecfdf5', border: '#34d399', color: '#065f46', bold: true },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border: `2px solid ${s.border}`, borderRadius: 12, padding: '14px 16px', gridColumn: s.bold ? 'span 1' : undefined }}>
            <div style={{ fontSize: '0.8rem', marginBottom: 2 }}>{s.icon}</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 900, color: s.color, lineHeight: 1.1 }}>{s.value.toLocaleString()}</div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: s.color, marginTop: 3 }}>{s.label}</div>
            <div style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: 1 }}>{s.sub}</div>
            {s.sub2 && <div style={{ fontSize: '0.68rem', color: s.color, marginTop: 1, fontWeight: 600 }}>{s.sub2}</div>}
          </div>
        ))}
      </div>

      {/* ── Period label ── */}
      <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center' }}>
        Showing: <strong style={{ color: '#475569' }}>{periodLabel}</strong> · {periodImports.length} imports · {filteredMvs.length} movements · {periodTransfers.length} transfers
      </div>

      {/* ── Section tabs ── */}
      <div className="flex gap-2 flex-wrap">
        {[['summary','📊 Per-Product Summary'],['batches','🗂 Batch Status'],['movements','📋 Movement Log']].map(([id,label]) => (
          <button key={id} onClick={() => setMvSection(id)}
            style={{ padding: '7px 18px', borderRadius: 20, border: `2px solid ${mvSection===id?'#fecaca':'#f1f5f9'}`, background: mvSection===id?'#fff0f3':'#f8fafc', color: mvSection===id?'#c41e3a':'#64748b', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Per-Product Summary ── */}
      {mvSection === 'summary' && (
        <Card>
          <CardHeader>
            <h3 className="font-bold text-gray-800">📊 Per-Product Stock Summary</h3>
            <p className="text-xs text-gray-500 mt-0.5">Full lifecycle per product — imports through to sales and what remains.</p>
          </CardHeader>
          {productSummary.length === 0 ? (
            <CardBody><EmptyState icon={<Package size={40} />} title="No product data" description="No stock records found for the selected period." /></CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.81rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: '#374151', minWidth: 180 }}>Product</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, color: '#166534', fontSize: '0.75rem' }}>🚢 Imported</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, color: '#1e40af', fontSize: '0.75rem' }}>🏪 Country Stock</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, color: '#7c3aed', fontSize: '0.75rem' }}>🏭 Warehouse</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, color: '#0369a1', fontSize: '0.75rem' }}>📦 To Branches</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, color: '#065f46', fontSize: '0.75rem' }}>💊 Branch Sold</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, color: '#dc2626', fontSize: '0.75rem' }}>⚠️ Expired</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, color: '#92400e', fontSize: '0.75rem' }}>✏️ Written Off</th>
                    <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, color: '#065f46', fontSize: '0.75rem' }}>✅ Available</th>
                  </tr>
                </thead>
                <tbody>
                  {productSummary.map((p, idx) => {
                    const available = p.csHeld + p.whHeld;
                    const low = available > 0 && available < 10;
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '9px 12px' }}>
                          <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.83rem' }}>{p.name}</div>
                          <div style={{ marginTop: 2 }}>
                            {p.batNum.slice(0,3).map(b => (
                              <span key={b} style={{ background: '#eff6ff', color: '#1d4ed8', padding: '1px 5px', borderRadius: 4, fontSize: '0.68rem', fontFamily: 'monospace', marginRight: 3, fontWeight: 700 }}>{b}</span>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: '9px 8px', textAlign: 'center', fontWeight: 700, color: p.imp ? '#166534' : '#cbd5e1' }}>{p.imp || '—'}</td>
                        <td style={{ padding: '9px 8px', textAlign: 'center', fontWeight: 700, color: p.csHeld ? '#1e40af' : '#cbd5e1' }}>{p.csHeld || '—'}</td>
                        <td style={{ padding: '9px 8px', textAlign: 'center', fontWeight: 700, color: p.whHeld ? '#7c3aed' : '#cbd5e1' }}>{p.whHeld || '—'}</td>
                        <td style={{ padding: '9px 8px', textAlign: 'center', fontWeight: 700, color: p.branchRcvd ? '#0369a1' : '#cbd5e1' }}>{p.branchRcvd || '—'}</td>
                        <td style={{ padding: '9px 8px', textAlign: 'center', fontWeight: 700, color: p.sold ? '#065f46' : '#cbd5e1' }}>{p.sold || '—'}</td>
                        <td style={{ padding: '9px 8px', textAlign: 'center', fontWeight: 700, color: p.expQty ? '#dc2626' : '#cbd5e1' }}>{p.expQty || '—'}</td>
                        <td style={{ padding: '9px 8px', textAlign: 'center', fontWeight: 700, color: p.woff ? '#92400e' : '#cbd5e1' }}>{p.woff || '—'}</td>
                        <td style={{ padding: '9px 8px', textAlign: 'center' }}>
                          <span style={{ fontSize: '1rem', fontWeight: 900, color: low ? '#dc2626' : available === 0 ? '#94a3b8' : '#065f46' }}>
                            {available}
                            {low && <span style={{ fontSize: '0.62rem', display: 'block', color: '#dc2626', fontWeight: 700 }}>LOW STOCK</span>}
                            {available === 0 && <span style={{ fontSize: '0.62rem', display: 'block', color: '#94a3b8' }}>OUT OF STOCK</span>}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f1f5f9', borderTop: '2px solid #e2e8f0', fontWeight: 800 }}>
                    <td style={{ padding: '9px 12px', color: '#374151', fontSize: '0.82rem' }}>TOTALS</td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: '#166534' }}>{productSummary.reduce((s,p)=>s+p.imp,0)||'—'}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: '#1e40af' }}>{productSummary.reduce((s,p)=>s+p.csHeld,0)||'—'}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: '#7c3aed' }}>{productSummary.reduce((s,p)=>s+p.whHeld,0)||'—'}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: '#0369a1' }}>{productSummary.reduce((s,p)=>s+p.branchRcvd,0)||'—'}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: '#065f46' }}>{productSummary.reduce((s,p)=>s+p.sold,0)||'—'}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: '#dc2626' }}>{productSummary.reduce((s,p)=>s+p.expQty,0)||'—'}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: '#92400e' }}>{productSummary.reduce((s,p)=>s+p.woff,0)||'—'}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: '#065f46' }}>{productSummary.reduce((s,p)=>s+p.csHeld+p.whHeld,0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ── Batch Status Overview ── */}
      {mvSection === 'batches' && (
        <Card>
          <CardHeader>
            <h3 className="font-bold text-gray-800">🗂 Batch Status Overview</h3>
            <p className="text-xs text-gray-500 mt-0.5">All batches across country stock, warehouses and branches.</p>
          </CardHeader>
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.81rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Product</th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Batch #</th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Location</th>
                  <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Original Qty</th>
                  <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Dispatched</th>
                  <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Remaining</th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Expiry</th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Status</th>
                  <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>CIF/Unit</th>
                  <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>DPC/Unit</th>
                </tr>
              </thead>
              <tbody>
                {batches.sort((a,b) => {
                  const statusOrder = { expired: 0, depleted: 1, active: 2 };
                  return (statusOrder[a.status]??3) - (statusOrder[b.status]??3);
                }).map((b, idx) => {
                  const expiry = b.expiry_date;
                  const days = expiry ? Math.floor((new Date(expiry) - new Date()) / 86400000) : null;
                  const rem = Number(b.remaining_quantity || 0);
                  const orig = Number(b.quantity || 0);
                  const pct = orig > 0 ? Math.round((rem / orig) * 100) : 0;
                  const statusStyles = {
                    active: { bg: '#f0fdf4', color: '#166534', border: '#86efac' },
                    expired: { bg: '#fef2f2', color: '#dc2626', border: '#fca5a5' },
                    depleted: { bg: '#f8fafc', color: '#94a3b8', border: '#e2e8f0' },
                  };
                  const ss = statusStyles[b.status] || statusStyles.active;
                  return (
                    <tr key={b.id || idx} style={{ borderBottom: '1px solid #f1f5f9', background: b.status === 'expired' ? '#fff5f5' : b.status === 'depleted' ? '#fafafa' : idx % 2 === 0 ? '#fff' : '#fafafe' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b' }}>{b.description || b.product_name || '—'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '2px 7px', borderRadius: 5, fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 700 }}>{b.batch_no || '—'}</span>
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: '0.78rem', color: '#64748b' }}>{fmtLocation(b.location || b.warehouse_id || '')}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700 }}>{orig.toLocaleString()}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', color: '#dc2626', fontWeight: 700 }}>{Number(b.dispatched_quantity||0).toLocaleString()}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ fontWeight: 900, color: rem === 0 ? '#94a3b8' : rem < 10 ? '#dc2626' : '#065f46', fontSize: '0.95rem' }}>{rem.toLocaleString()}</div>
                        {orig > 0 && <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{pct}%</div>}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        {expiry ? (
                          <span style={{ color: days !=null && days <= 0 ? '#dc2626' : days !=null && days <= 30 ? '#ea580c' : days !=null && days <= 90 ? '#d97706' : '#374151', fontWeight: days !=null && days <= 90 ? 700 : 400, fontSize: '0.78rem' }}>
                            {formatDate(expiry)}{days != null && days <= 90 && days > 0 ? ` (${days}d)` : days != null && days <= 0 ? ' EXPIRED' : ''}
                          </span>
                        ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ background: ss.bg, color: ss.color, border: `1px solid ${ss.border}`, padding: '2px 8px', borderRadius: 5, fontSize: '0.72rem', fontWeight: 700, textTransform: 'capitalize' }}>
                          {b.status || 'active'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: '0.78rem', color: '#475569' }}>{formatCurrency(Number(b.cif_unit_cost || 0))}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: '0.78rem', color: '#475569' }}>{formatCurrency(Number(b.dpc_unit_value || 0) || getDPCPrice(b.description || b.product_name || ''))}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f1f5f9', borderTop: '2px solid #e2e8f0', fontWeight: 800 }}>
                  <td colSpan={3} style={{ padding: '8px 12px', color: '#374151' }}>TOTALS ({batches.length} batches)</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>{batches.reduce((s,b)=>s+Number(b.quantity||0),0).toLocaleString()}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', color: '#dc2626' }}>{batches.reduce((s,b)=>s+Number(b.dispatched_quantity||0),0).toLocaleString()}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', color: '#065f46' }}>{batches.reduce((s,b)=>s+Number(b.remaining_quantity||0),0).toLocaleString()}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* ── Movement Log ── */}
      {mvSection === 'movements' && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start flex-wrap gap-3">
              <div>
                <h3 className="font-bold text-gray-800">📋 Movement Log</h3>
                <p className="text-xs text-gray-500 mt-0.5">{filteredMvs.length} movements in period</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2 flex-wrap">
              <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
                <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                <input type="text" value={mvSearch} onChange={e => setMvSearch(e.target.value)} placeholder="Search product / batch…"
                  style={{ width: '100%', padding: '7px 10px 7px 28px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <select value={mvTypeFilter} onChange={e => setMvTypeFilter(e.target.value)}
                style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.8rem', background: '#fff' }}>
                <option value="">All Types</option>
                {mvTypes.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
              </select>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.81rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Date & Time</th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Product</th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Batch #</th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Expiry</th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Type</th>
                  <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>Qty</th>
                  <th style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>DPC Value</th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>From</th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>To</th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>Reference</th>
                  <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#374151' }}>By</th>
                </tr>
              </thead>
              <tbody>
                {filteredMvs.map((m, idx) => {
                  const isIn = ['in','received','import_received','transfer_in','warehouse_receipt','receipt'].some(k => (m.movement_type||'').toLowerCase().includes(k));
                  const isOut = ['out','dispatched','transfer_out','dispatch','write_off','released'].some(k => (m.movement_type||'').toLowerCase().includes(k));
                  const typeColor = isIn ? { bg: '#f0fdf4', color: '#166534', border: '#86efac' } : isOut ? { bg: '#fef2f2', color: '#991b1b', border: '#fca5a5' } : { bg: '#fffbeb', color: '#92400e', border: '#fcd34d' };
                  const expiry = m.expiry_date;
                  const days = expiry ? Math.floor((new Date(expiry) - new Date()) / 86400000) : null;
                  const dpcVal = Number(m.quantity||0) * (Number(m.dpc_unit_value||0) || getDPCPrice(m.product_name||''));
                  return (
                    <tr key={m.id||idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.78rem', color: '#374151' }}>{formatDate(m.created_at)}</div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{m.created_at ? new Date(m.created_at).toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit'}) : ''}</div>
                      </td>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b', maxWidth: 180 }}>{m.product_name || '—'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        {m.batch_no ? <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 700 }}>{m.batch_no}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: '0.78rem' }}>
                        {expiry ? <span style={{ color: days !=null && days <= 30 ? '#dc2626' : days !=null && days <= 90 ? '#d97706' : '#374151', fontWeight: days !=null && days <= 90 ? 700 : 400 }}>{formatDate(expiry)}{days != null && days <= 90 ? ` (${days}d)` : ''}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ background: typeColor.bg, color: typeColor.color, border: `1px solid ${typeColor.border}`, padding: '2px 8px', borderRadius: 5, fontSize: '0.72rem', fontWeight: 700, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                          {(m.movement_type||'—').replace(/_/g,' ')}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 900, fontSize: '1rem', color: isIn ? '#166534' : isOut ? '#dc2626' : '#d97706' }}>
                        {isIn ? '+' : isOut ? '-' : '±'}{Number(m.quantity||0).toLocaleString()}
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center', fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>
                        {dpcVal > 0 ? formatCurrency(dpcVal) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: '0.78rem', color: '#475569' }}>{fmtLocation(m.source_location||m.location||'')}</td>
                      <td style={{ padding: '8px 12px', fontSize: '0.78rem', color: '#475569' }}>{fmtLocation(m.destination_location||'')}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: '#6366f1', background: '#eef2ff', padding: '2px 5px', borderRadius: 4 }}>
                          {m.reference_id||m.reference||'—'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', fontSize: '0.78rem', color: '#374151' }}>{m.created_by || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredMvs.length === 0 && (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>No movements found for this period / filter.</div>
            )}
          </div>
        </Card>
      )}

      {/* ── Record movement modal ── */}
      <Modal open={showRecordForm} onClose={() => setShowRecordForm(false)} title="Record Stock Movement" size="md">
        <form onSubmit={handleRecordMovement} className="p-6 space-y-4">
          {alert && <Alert type={alert.type}>{alert.msg}</Alert>}
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Product <span className="text-red-500">*</span></label>
            <select className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary"
              value={recordForm.product_name} onChange={e => setRecordForm(f => ({ ...f, product_name: e.target.value }))} required>
              <option value="">Select product...</option>
              {getLiveProductList().map(p => <option key={p.description} value={p.description}>{p.description}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Movement Type</label>
              <select className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary"
                value={recordForm.movement_type} onChange={e => setRecordForm(f => ({ ...f, movement_type: e.target.value }))}>
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
            <select className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary"
              value={recordForm.location} onChange={e => setRecordForm(f => ({ ...f, location: e.target.value }))}>
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
            <Button type="submit" disabled={submitting || !recordForm.product_name || !recordForm.quantity}>{submitting ? 'Saving...' : 'Record Movement'}</Button>
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

  const [fefoMap, setFefoMap] = useState({});
  const [fefoLoading, setFefoLoading] = useState(false);
  const [fefoModalAlert, setFefoModalAlert] = useState(null);
  const [shortfallMode, setShortfallMode] = useState('block');
  const [shortfallAcknowledged, setShortfallAcknowledged] = useState(false);
  const [adjustedQtys, setAdjustedQtys] = useState({});

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

  const lookupFefoBatches = useCallback(async (req, warehouse) => {
    if (!req || !warehouse) return;
    const items = Array.isArray(req.items) ? req.items : [];
    if (items.length === 0) return;
    setFefoLoading(true);
    setFefoMap({});
    try {
      // Aggregate quantities by product name so duplicate product lines are handled correctly
      const productTotals = {};
      for (const item of items) {
        const productName = item.productName || item.product_name || item.productId || '';
        const qty = Number(item.quantity || 0);
        if (!productName || qty <= 0) continue;
        productTotals[productName] = (productTotals[productName] || 0) + qty;
      }
      const results = {};
      await Promise.all(Object.entries(productTotals).map(async ([productName, qty]) => {
        try {
          const resp = await api.stock.fefoBatches({ product: productName, location: warehouse, qty });
          results[productName] = { batches: resp.batches || [], shortfall: resp.shortfall || 0, totalQty: qty };
        } catch {
          results[productName] = { batches: [], shortfall: qty, totalQty: qty };
        }
      }));
      setFefoMap(results);
    } finally {
      setFefoLoading(false);
    }
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  useEffect(() => {
    if (dispatchRequest && dispatchWH) {
      setFefoModalAlert(null);
      setShortfallAcknowledged(false);
      lookupFefoBatches(dispatchRequest, dispatchWH);
    } else {
      setFefoMap({});
    }
  }, [dispatchRequest, dispatchWH, lookupFefoBatches]);

  useEffect(() => {
    api.system.getSettings('dispatch_shortfall_mode')
      .then(d => { if (d?.value) setShortfallMode(d.value); })
      .catch(() => {});
  }, []);

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

  const dispatchHasShortfall = (() => {
    if (!dispatchRequest) return false;
    const items = Array.isArray(dispatchRequest.items) ? dispatchRequest.items : [];
    return items.some(it => {
      const n = it.productName || it.product_name || it.productId || '';
      if (!fefoMap[n] || fefoMap[n].shortfall <= 0) return false;
      return !(n in adjustedQtys);
    });
  })();

  const shortfallSummary = (() => {
    // fefoMap is keyed by unique product name (aggregated), so iterate it directly
    return Object.entries(fefoMap)
      .filter(([, v]) => v?.shortfall > 0)
      .map(([name, v]) => ({ name, shortfall: v.shortfall }));
  })();

  const handleAutoAdjust = () => {
    const newAdj = {};
    for (const [productName, fefoResult] of Object.entries(fefoMap)) {
      if (!fefoResult || fefoResult.shortfall <= 0) continue;
      const original = fefoResult.totalQty || 0;
      const dispatched = Math.max(0, original - fefoResult.shortfall);
      newAdj[productName] = { original, dispatched };
    }
    setAdjustedQtys(newAdj);
  };

  const handleDispatchAsTransfer = async () => {
    if (!dispatchRequest) return;
    setFefoModalAlert(null);

    const items = Array.isArray(dispatchRequest.items) ? dispatchRequest.items : [];
    const whLabel = WAREHOUSE_SOURCES.find(w => w.value === dispatchWH)?.label || fmtLocation(dispatchWH);

    const allFefoLoaded = items.every(it => {
      const n = it.productName || it.product_name || it.productId || '';
      return !n || (n in fefoMap);
    });
    if (fefoLoading || !allFefoLoaded) {
      setFefoModalAlert({ type: 'error', msg: 'Batch resolution is still loading. Please wait a moment and try again.' });
      return;
    }
    if (dispatchHasShortfall) {
      if (shortfallMode === 'block') {
        const shortfallItems = items
          .filter(it => {
            const n = it.productName || it.product_name || it.productId || '';
            return fefoMap[n]?.shortfall > 0;
          })
          .map(it => {
            const n = it.productName || it.product_name || it.productId || '';
            return `${n} (${fefoMap[n].shortfall} units short)`;
          });
        setFefoModalAlert({ type: 'error', msg: `❌ Cannot dispatch — insufficient stock in ${whLabel}: ${shortfallItems.join(', ')}. Select a different warehouse or update stock levels first.` });
        return;
      }
      if (!shortfallAcknowledged) {
        setFefoModalAlert({ type: 'error', msg: '⚠️ Please tick the shortfall acknowledgement checkbox before dispatching.' });
        return;
      }
    }

    setSubmitting(true);
    try {
      const branchName = dispatchRequest.requestingBranch || dispatchRequest.requesting_branch || '';
      const actor = user?.full_name || user?.username;
      const reqLabel = dispatchRequest.requestNumber || dispatchRequest.id;

      // Build transfer items from aggregated fefoMap — skip products already expanded
      // (handles duplicate product lines: fefoMap holds total qty per unique product)
      const transferItems = [];
      const seenProducts = new Set();
      for (const item of items) {
        const productName = item.productName || item.product_name || item.productId || '';
        if (!productName || Number(item.quantity || 0) <= 0) continue;
        if (seenProducts.has(productName)) continue;
        seenProducts.add(productName);
        const fefoResult = fefoMap[productName];
        if (fefoResult && fefoResult.batches && fefoResult.batches.length > 0) {
          const adjInfo = adjustedQtys[productName] || null;
          for (const batch of fefoResult.batches) {
            if (!batch.allocated_qty || batch.allocated_qty <= 0) continue;
            transferItems.push({
              productName,
              productId: productName,
              quantity: batch.allocated_qty,
              batchNo: batch.batch_no || null,
              expiryDate: batch.expiry_date || null,
              unit: item.unit || 'units',
              ...(adjInfo ? { autoAdjusted: true, originalQty: adjInfo.original } : {}),
            });
          }
        } else {
          // No batch records — use total aggregated quantity from fefoMap
          const totalQty = fefoResult?.totalQty ?? items.reduce((s, it) => {
            const n = it.productName || it.product_name || it.productId || '';
            return n === productName ? s + Number(it.quantity || 0) : s;
          }, 0);
          const adjInfo = adjustedQtys[productName] || null;
          transferItems.push({
            productName,
            productId: productName,
            quantity: totalQty,
            unit: item.unit || 'units',
            ...(adjInfo ? { autoAdjusted: true, originalQty: adjInfo.original } : {}),
          });
        }
      }

      const autoAdjustedProducts = Object.keys(adjustedQtys).length > 0 ? adjustedQtys : undefined;
      await api.stock.createTransfer({
        from_location: dispatchWH,
        to_location: branchName.toLowerCase().replace(/\s+/g, '_'),
        status: 'pending_approval',
        requestId: dispatchRequest.id,
        requestNumber: reqLabel,
        notes: `Fulfilling request ${reqLabel}${autoAdjustedProducts ? ' [quantities auto-adjusted to available stock]' : ''}`,
        created_by: actor,
        items: transferItems,
        autoAdjustedProducts,
      });

      await api.stock.updateRequest(dispatchRequest.id, {
        status: 'dispatched',
        dispatch_warehouse: dispatchWH,
        dispatched_by: actor,
        dispatched_at: new Date().toISOString(),
        updated_by: actor,
      });
      setDispatchRequest(null);
      setFefoMap({});
      setAdjustedQtys({});
      setAlert({ type: 'success', msg: `Transfer submitted for GM approval: ${whLabel} → ${branchName}. FEFO batches pre-resolved — branch receive form will be pre-filled once GM approves.` });
      setTimeout(() => loadRequests(), 100);
    } catch (err) {
      setFefoModalAlert({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
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
      <Modal open={!!dispatchRequest} onClose={() => { setDispatchRequest(null); setFefoMap({}); setFefoModalAlert(null); }} title="Dispatch Stock to Branch (GM Approval)" size="lg">
        {dispatchRequest && (() => {
          const dispItems = Array.isArray(dispatchRequest.items) ? dispatchRequest.items : [];
          const whLabel = WAREHOUSE_SOURCES.find(w => w.value === dispatchWH)?.label || fmtLocation(dispatchWH);
          return (
            <div className="p-6 space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                <p className="font-semibold text-blue-800 mb-1">Fulfilling: {dispatchRequest.requestNumber || dispatchRequest.id}</p>
                <p className="text-blue-700">→ Destination: <strong>{dispatchRequest.requestingBranch || dispatchRequest.requesting_branch}</strong></p>
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-semibold text-gray-700">Dispatching From Warehouse <span className="text-red-500">*</span></label>
                <select value={dispatchWH} onChange={e => setDispatchWH(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2">
                  {WAREHOUSE_SOURCES.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </div>

              {/* FEFO Batch Resolution Panel — rendered from aggregated fefoMap to avoid duplicate product rows */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Items & FEFO Batch Assignment</span>
                  {fefoLoading && <span style={{ fontSize: '0.72rem', color: '#1d6fa4', fontWeight: 600 }}>⏳ Resolving batches…</span>}
                </div>
                {fefoLoading
                  ? dispItems.map((it, i) => {
                      const n = it.productName || it.productId || it.product_name || '';
                      return (
                        <div key={i} style={{ marginBottom: 6, fontSize: '0.83rem', color: '#64748b' }}>
                          <span style={{ fontWeight: 600, color: '#1e293b' }}>{n || '—'}</span>
                          <span style={{ marginLeft: 6, color: '#94a3b8' }}>…</span>
                        </div>
                      );
                    })
                  : Object.entries(fefoMap).map(([productName, fefoResult], i, arr) => {
                      const hasBatches = fefoResult?.batches?.length > 0;
                      const hasShortfall = fefoResult?.shortfall > 0;
                      return (
                        <div key={productName} style={{ marginBottom: i < arr.length - 1 ? 10 : 0, paddingBottom: i < arr.length - 1 ? 10 : 0, borderBottom: i < arr.length - 1 ? '1px solid #e2e8f0' : 'none' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: hasBatches ? 5 : 0 }}>
                            <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.85rem' }}>{productName || '—'}</span>
                            <span style={{ fontWeight: 800, color: '#c41e3a', fontSize: '0.85rem' }}>×{fefoResult.totalQty}</span>
                          </div>
                          {hasBatches && (
                            <div style={{ paddingLeft: 10, borderLeft: '3px solid #1d6fa4' }}>
                              {fefoResult.batches.map((b, bi) => (
                                <div key={bi} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.77rem', color: '#374151', marginTop: 3 }}>
                                  <span style={{ fontFamily: 'monospace', background: '#e0f2fe', padding: '1px 6px', borderRadius: 4, fontWeight: 700, color: '#0c4a6e' }}>{b.batch_no || '—'}</span>
                                  <span style={{ color: '#64748b' }}>Exp: {b.expiry_date ? new Date(b.expiry_date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</span>
                                  <span style={{ fontWeight: 700, color: '#166534', marginLeft: 'auto' }}>qty: {b.allocated_qty}</span>
                                </div>
                              ))}
                              {hasShortfall && (
                                <div style={{ marginTop: 4, fontSize: '0.74rem', color: '#b45309', fontWeight: 700 }}>
                                  ⚠️ Stock shortfall: {fefoResult.shortfall} units unavailable in {whLabel}
                                </div>
                              )}
                            </div>
                          )}
                          {!hasBatches && (
                            <div style={{ paddingLeft: 10, fontSize: '0.75rem', color: '#b45309', fontWeight: 600, marginTop: 3 }}>
                              ⚠️ No batch records found in {whLabel} — dispatch will proceed without batch info
                            </div>
                          )}
                        </div>
                      );
                    })
                }
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                ✅ <strong>FEFO batches pre-resolved:</strong> Batch numbers and expiry dates shown above will be stored on the transfer record so the GM can review them and the branch receive form will be pre-filled automatically.
                <br /><br />⚠️ <strong>GM Approval Required:</strong> This transfer goes to the General Manager for approval before the branch can receive it. Route: <strong>{whLabel}</strong> → <strong>{dispatchRequest.requestingBranch || dispatchRequest.requesting_branch}</strong>
              </div>

              {dispatchHasShortfall && !fefoLoading && (() => {
                const isWarn = shortfallMode === 'warn';
                return (
                  <div style={{ background: isWarn ? '#fffbeb' : '#fef2f2', border: `2px solid ${isWarn ? '#fbbf24' : '#f87171'}`, borderRadius: 10, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: '1.1rem' }}>{isWarn ? '⚠️' : '🚫'}</span>
                      <span style={{ fontWeight: 800, fontSize: '0.88rem', color: isWarn ? '#92400e' : '#991b1b' }}>
                        {isWarn ? 'Stock Shortfall Warning' : 'Insufficient Stock — Dispatch Blocked'}
                      </span>
                    </div>
                    <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {shortfallSummary.map((s, i) => (
                        <li key={i} style={{ fontSize: '0.82rem', fontWeight: 700, color: isWarn ? '#92400e' : '#991b1b' }}>
                          {s.name} — <span style={{ color: isWarn ? '#b45309' : '#b91c1c' }}>{s.shortfall} unit{s.shortfall !== 1 ? 's' : ''} short</span>
                        </li>
                      ))}
                    </ul>
                    {isWarn ? (
                      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10, cursor: 'pointer' }}>
                        <input type="checkbox" checked={shortfallAcknowledged} onChange={e => setShortfallAcknowledged(e.target.checked)}
                          style={{ marginTop: 2, accentColor: '#d97706', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.78rem', color: '#92400e', fontWeight: 600 }}>
                          I acknowledge the shortfall and confirm that a partial dispatch is acceptable for this order.
                        </span>
                      </label>
                    ) : (
                      <div style={{ marginTop: 8, fontSize: '0.77rem', color: '#9a3412', fontWeight: 600 }}>Select a different source warehouse or resolve the stock shortfall before dispatching.</div>
                    )}
                    {!isWarn && Object.keys(adjustedQtys).length === 0 && (
                      <button onClick={handleAutoAdjust}
                        style={{ marginTop: 10, padding: '7px 16px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', width: '100%' }}>
                        ⚡ Auto-Adjust Quantities to Available Stock
                      </button>
                    )}
                    {!isWarn && Object.keys(adjustedQtys).length > 0 && (
                      <div style={{ marginTop: 10, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: '8px 12px', fontSize: '0.78rem', color: '#166534' }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>✅ Quantities auto-adjusted — dispatch unblocked:</div>
                        <ul style={{ margin: 0, padding: '0 0 0 16px' }}>
                          {Object.entries(adjustedQtys).map(([name, { original, dispatched }]) => (
                            <li key={name}><strong>{name}</strong>: {original} → {dispatched} units{dispatched === 0 ? ' (removed from dispatch)' : ''}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })()}

              {fefoModalAlert && (
                <div style={{ background: fefoModalAlert.type === 'error' ? '#fef2f2' : '#f0fdf4', border: `1px solid ${fefoModalAlert.type === 'error' ? '#fca5a5' : '#86efac'}`, borderRadius: 8, padding: '8px 12px', fontSize: '0.83rem', fontWeight: 600, color: fefoModalAlert.type === 'error' ? '#991b1b' : '#166534' }}>
                  {fefoModalAlert.msg}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleDispatchAsTransfer}
                  disabled={submitting || fefoLoading || (dispatchHasShortfall && shortfallMode === 'block')}
                >
                  {submitting ? 'Submitting...' : fefoLoading ? '⏳ Resolving batches...' : (dispatchHasShortfall && shortfallMode === 'block') ? '🚫 Insufficient Stock' : '📤 Submit for GM Approval'}
                </Button>
                <Button variant="secondary" onClick={() => { setDispatchRequest(null); setFefoMap({}); setFefoModalAlert(null); setAdjustedQtys({}); setShortfallAcknowledged(false); }}>Cancel</Button>
              </div>
            </div>
          );
        })()}
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
        const statusMap = {
          pending: 'pending_approval',
          approved: 'approved',
          dispatched: 'approved',
          received: 'received',
          fulfilled: 'received',
          rejected: 'rejected',
        };
        const mappedStatus = statusMap[r.status] || 'pending_approval';
        const hasApproval = ['approved', 'dispatched', 'received', 'fulfilled'].includes(r.status);
        const hasReceipt  = r.status === 'received' || r.status === 'fulfilled';
        const priority    = r.priority || r.urgency || 'normal';
        const noteParts   = [
          r.notes,
          priority !== 'normal' ? `Priority: ${priority.toUpperCase()}` : '',
        ].filter(Boolean);
        const transferView = {
          id: r.id,
          dispatchReference: r.requestNumber || `RQ-${String(r.id).padStart(6, '0')}`,
          created_at:    r.createdAt    || r.created_at    || null,
          dispatched_at: r.dispatchedAt || r.dispatched_at || r.updated_at || null,
          from_location: r.dispatch_warehouse || r.dispatchWarehouse || 'country_stock',
          to_location:   branchName.toLowerCase().replace(/\s+/g, '_'),
          status:        mappedStatus,
          dispatchNotes: noteParts.length ? noteParts.join(' | ') : undefined,
          created_by:    r.createdBy    || r.created_by    || null,
          dispatched_by: r.dispatchedBy || r.dispatched_by || r.updated_by || null,
          preparedByRole: 'Stock Controller',
          gmAction:      hasApproval ? 'approve' : null,
          gmApprovedBy:  r.approvedBy  || r.approved_by   || null,
          gmApprovedAt:  r.approvedAt  || r.approved_at   || null,
          receiptStatus: hasReceipt ? 'received' : null,
          signatureName: r.receivedBy  || r.received_by   || null,
          branchReceiptNote: r.receiptNote || r.receipt_note || null,
          discrepancyFlag: r.discrepancyFlag || r.discrepancy_flag || false,
          items: items.map(i => ({
            productName:       i.productName       || i.product_name   || i.productId || '—',
            productCode:       i.productCode       || i.product_code   || i.sku       || '',
            batchNo:           i.batchNo           || i.batch_no       || '',
            expiryDate:        i.expiryDate        || i.expiry_date    || null,
            unit:              i.unit              || 'units',
            quantity:          Number(i.quantity   || 0),
            quantityApproved:  i.quantityApproved  != null ? Number(i.quantityApproved)
                             : i.quantity_approved != null ? Number(i.quantity_approved)
                             : hasApproval ? Number(i.quantity || 0) : null,
            quantityReceived:  i.quantityReceived  != null ? Number(i.quantityReceived)
                             : i.quantity_received != null ? Number(i.quantity_received)
                             : hasReceipt ? Number(i.quantity || 0) : null,
            discrepancyNote:   i.discrepancyNote   || i.discrepancy_note || '',
            lineNote:          i.lineNote          || i.line_note        || '',
          })),
        };
        return <DispatchNote transfer={transferView} onClose={() => setViewOrderDispatchNote(null)} />;
      })()}
    </div>
  );
}

function ValuationTab({ branch }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('product');

  const loadValuation = useCallback(() => {
    setLoading(true);
    api.stock.batches()
      .then(d => setBatches(Array.isArray(d) ? d : d.batches || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useStockRealtime({ onUpdate: loadValuation });
  useEffect(() => { loadValuation(); }, [loadValuation]);
  useEffect(() => {
    const iv = setInterval(loadValuation, 60000);
    return () => clearInterval(iv);
  }, [loadValuation]);

  if (loading) return <LoadingSpinner />;

  const getDP  = name => { const p = getLiveProductList().find(p => p.description === name); return p ? Number(p.dp  || 0) : 0; };
  const getCIF = name => { const p = getLiveProductList().find(p => p.description === name); return p ? Number(p.cif || 0) : 0; };

  const WAREHOUSES = ['windhoek_warehouse', 'ondangwa_warehouse'];

  const activeBatches = batches.filter(b => {
    const loc = (b.location || '').toLowerCase();
    if (loc === 'country_stock') return false;
    const remaining = Number(b.remaining_quantity ?? b.remainingQuantity ?? b.quantity ?? 0);
    if (remaining <= 0) return false;
    const st = (b.status || '').toLowerCase();
    if (st === 'expired' || st === 'depleted' || st === 'written_off') return false;
    return true;
  });

  const scopedBatches = branch === 'all' ? activeBatches
    : activeBatches.filter(b => {
        const loc = (b.location || '').toLowerCase().replace(/\s+/g, '_');
        return loc === branch || loc === branch + '_warehouse';
      });

  const fmtLoc = loc => {
    const l = (loc || '').toLowerCase();
    if (l === 'windhoek_warehouse') return 'Windhoek Warehouse';
    if (l === 'ondangwa_warehouse') return 'Ondangwa Warehouse';
    const bd = BRANCH_DETAILS.find(b => b.id === l || b.id === l.replace(/_branch$/, ''));
    if (bd) return bd.name;
    return loc.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const computeGroup = batches => {
    const byLoc = {};
    batches.forEach(b => {
      const loc = (b.location || 'unknown').toLowerCase();
      const qty = Number(b.remaining_quantity ?? b.remainingQuantity ?? b.quantity ?? 0);
      const dp  = getDP(b.product_name  || b.description) || Number(b.unit_price || b.dpc_unit_value || 0);
      const cif = getCIF(b.product_name || b.description) || Number(b.cif_unit_cost || 0);
      if (!byLoc[loc]) byLoc[loc] = { qty: 0, dpValue: 0, cifValue: 0, isWarehouse: WAREHOUSES.includes(loc) };
      byLoc[loc].qty      += qty;
      byLoc[loc].dpValue  += qty * dp;
      byLoc[loc].cifValue += qty * cif;
    });
    return byLoc;
  };

  const groups = computeGroup(scopedBatches);

  const warehouses = Object.entries(groups).filter(([, g]) => g.isWarehouse);
  const branchEntries = Object.entries(groups).filter(([, g]) => !g.isWarehouse);

  const whTotals   = warehouses.reduce((s, [, g]) => ({ qty: s.qty + g.qty, dp: s.dp + g.dpValue, cif: s.cif + g.cifValue }), { qty: 0, dp: 0, cif: 0 });
  const brTotals   = branchEntries.reduce((s, [, g]) => ({ qty: s.qty + g.qty, dp: s.dp + g.dpValue, cif: s.cif + g.cifValue }), { qty: 0, dp: 0, cif: 0 });
  const grandQty   = whTotals.qty + brTotals.qty;
  const grandDP    = whTotals.dp  + brTotals.dp;
  const grandCIF   = whTotals.cif + brTotals.cif;

  const productMap = {};
  scopedBatches.forEach(b => {
    const name = b.product_name || b.description || 'Unknown';
    const loc  = (b.location || 'unknown').toLowerCase();
    const qty  = Number(b.remaining_quantity ?? b.remainingQuantity ?? b.quantity ?? 0);
    const dp   = getDP(name)  || Number(b.unit_price || b.dpc_unit_value || 0);
    const cif  = getCIF(name) || Number(b.cif_unit_cost || 0);
    const key  = `${name}||${loc}`;
    if (!productMap[key]) productMap[key] = { product: name, location: fmtLoc(loc), isWarehouse: WAREHOUSES.includes(loc), qty: 0, dpValue: 0, cifValue: 0, dp, cif };
    productMap[key].qty      += qty;
    productMap[key].dpValue  += qty * dp;
    productMap[key].cifValue += qty * cif;
  });
  const breakdown = Object.values(productMap).sort((a, b) => b.dpValue - a.dpValue);

  const branchSummary = branchEntries
    .map(([loc, g]) => ({ name: fmtLoc(loc), qty: g.qty, dpValue: g.dpValue, cifValue: g.cifValue }))
    .sort((a, b) => b.dpValue - a.dpValue);

  return (
    <div className="space-y-6">
      {/* ── Top summary: warehouses + branches ─────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {warehouses.length === 0
          ? <div style={{ border: '1.5px dashed #e5e7eb', borderRadius: 10, padding: '14px 18px', color: '#9ca3af', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Warehouse size={20} /> No warehouse stock on hand
            </div>
          : warehouses.map(([loc, g]) => (
              <StatCard key={loc}
                title={fmtLoc(loc)}
                value={`N$ ${Math.round(g.dpValue).toLocaleString('en-ZA')}`}
                subtitle={`${g.qty.toLocaleString()} units · CIF N$ ${Math.round(g.cifValue).toLocaleString('en-ZA')}`}
                color="blue"
                icon={<Warehouse size={22} />}
              />
            ))
        }
        <StatCard
          title="All Branches Combined"
          value={`N$ ${Math.round(brTotals.dp).toLocaleString('en-ZA')}`}
          subtitle={`${brTotals.qty.toLocaleString()} units across ${branchEntries.length} location${branchEntries.length !== 1 ? 's' : ''}`}
          color="green"
          icon={<Package size={22} />}
        />
      </div>

      {/* ── Grand total banner ──────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg,#f0fdf4,#ecfdf5)', border: '1.5px solid #86efac', borderRadius: 12, padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-1">Total Stock Value (DP) — Warehouses + Branches</div>
          <div className="text-3xl font-bold text-emerald-800">N$ {Math.round(grandDP).toLocaleString('en-ZA')}</div>
          <div className="text-sm text-emerald-600 mt-1">CIF cost N$ {Math.round(grandCIF).toLocaleString('en-ZA')} · Margin N$ {Math.round(grandDP - grandCIF).toLocaleString('en-ZA')}</div>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-1">Total Units on Hand</div>
          <div className="text-2xl font-bold text-emerald-800">{grandQty.toLocaleString()}</div>
          <div className="text-xs text-emerald-500 mt-1">Warehouses: {whTotals.qty.toLocaleString()} · Branches: {brTotals.qty.toLocaleString()}</div>
        </div>
      </div>

      {/* ── Branch-by-branch breakdown ──────────────────────────────────────── */}
      {branchSummary.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="font-bold text-gray-800">Branch Stock Values</h3>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ background: '#fef2f2' }}>
                  <th className="text-left px-4 py-2.5 font-semibold text-gray-700 border-b">Branch</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-gray-700 border-b">Units on Hand</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-gray-700 border-b">CIF Value</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-gray-700 border-b">DP Value</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-gray-700 border-b">Margin</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-gray-700 border-b">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {branchSummary.map((br, i) => (
                  <tr key={br.name} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td className="px-4 py-2.5 font-medium text-gray-800 border-b">{br.name}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700 border-b">{br.qty.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600 border-b">N$ {Math.round(br.cifValue).toLocaleString('en-ZA')}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-800 border-b">N$ {Math.round(br.dpValue).toLocaleString('en-ZA')}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-700 border-b">N$ {Math.round(br.dpValue - br.cifValue).toLocaleString('en-ZA')}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500 border-b">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div className="h-1.5 rounded-full" style={{ width: `${grandDP > 0 ? Math.min(100, (br.dpValue/grandDP)*100) : 0}%`, background: '#c41e3a' }} />
                        </div>
                        <span>{grandDP > 0 ? ((br.dpValue/grandDP)*100).toFixed(1) : 0}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr style={{ background: '#fff7ed', borderTop: '2px solid #fb923c', fontWeight: 700 }}>
                  <td className="px-4 py-2.5">BRANCH TOTALS</td>
                  <td className="px-4 py-2.5 text-right">{brTotals.qty.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right">N$ {Math.round(brTotals.cif).toLocaleString('en-ZA')}</td>
                  <td className="px-4 py-2.5 text-right">N$ {Math.round(brTotals.dp).toLocaleString('en-ZA')}</td>
                  <td className="px-4 py-2.5 text-right text-emerald-700">N$ {Math.round(brTotals.dp - brTotals.cif).toLocaleString('en-ZA')}</td>
                  <td className="px-4 py-2.5 text-right">{grandDP > 0 ? ((brTotals.dp/grandDP)*100).toFixed(1) : 0}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Per-product detail ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <h3 className="font-bold text-gray-800">Product Valuation Detail</h3>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                {[['product','By Product'],['location','By Location']].map(([v,l]) => (
                  <button key={v} onClick={() => setViewMode(v)}
                    className="px-3 py-1.5 font-medium border-none cursor-pointer"
                    style={{ background: viewMode === v ? '#c41e3a' : '#fff', color: viewMode === v ? '#fff' : '#374151' }}>{l}</button>
                ))}
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => {
              const rows = breakdown.map(r => `<tr><td>${r.product}</td><td>${r.location}</td><td style="text-align:right">${r.qty}</td><td style="text-align:right">N$ ${Math.round(r.cif).toLocaleString()}</td><td style="text-align:right">N$ ${Math.round(r.dpValue).toLocaleString()}</td><td style="text-align:right">N$ ${Math.round(r.dpValue-r.cifValue).toLocaleString()}</td></tr>`).join('');
              const total = `<tr style="font-weight:800;background:#f0fdf4"><td colspan="2">GRAND TOTAL</td><td style="text-align:right">${grandQty.toLocaleString()}</td><td style="text-align:right">N$ ${Math.round(grandCIF).toLocaleString()}</td><td style="text-align:right">N$ ${Math.round(grandDP).toLocaleString()}</td><td style="text-align:right">N$ ${Math.round(grandDP-grandCIF).toLocaleString()}</td></tr>`;
              printDocument('Stock Valuation Report', `<table><thead><tr><th>Product</th><th>Location</th><th style="text-align:right">Qty</th><th style="text-align:right">CIF Value</th><th style="text-align:right">DP Value</th><th style="text-align:right">Margin</th></tr></thead><tbody>${rows}${total}</tbody></table>`, true);
            }}><Printer size={14} /> Print Report</Button>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ background: '#c41e3a' }}>
                {['Product','Location','Qty on Hand','Unit CIF','Unit DP','Total CIF','Total DP (Value)','Margin'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-white text-xs font-bold uppercase tracking-wide"
                    style={{ textAlign: ['Qty on Hand','Unit CIF','Unit DP','Total CIF','Total DP (Value)','Margin'].includes(h) ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {breakdown.length === 0
                ? <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No active stock in warehouses or branches</td></tr>
                : breakdown.map((r, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td className="px-3 py-2.5 font-medium text-gray-800 border-b max-w-[180px]" title={r.product}>
                      <div className="truncate">{r.product}</div>
                      {r.isWarehouse && <div className="text-xs text-blue-500 font-normal mt-0.5">warehouse</div>}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 border-b text-xs">{r.location}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-gray-800 border-b">{r.qty.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500 border-b text-xs">{r.cif > 0 ? `N$ ${r.cif.toLocaleString('en-ZA', {minimumFractionDigits:0,maximumFractionDigits:0})}` : '—'}</td>
                    <td className="px-3 py-2.5 text-right text-gray-500 border-b text-xs">{r.dp > 0 ? `N$ ${r.dp.toLocaleString('en-ZA', {minimumFractionDigits:0,maximumFractionDigits:0})}` : '—'}</td>
                    <td className="px-3 py-2.5 text-right text-gray-600 border-b">{r.cifValue > 0 ? `N$ ${Math.round(r.cifValue).toLocaleString('en-ZA')}` : '—'}</td>
                    <td className="px-3 py-2.5 text-right font-semibold border-b" style={{ color: '#c41e3a' }}>N$ {Math.round(r.dpValue).toLocaleString('en-ZA')}</td>
                    <td className="px-3 py-2.5 text-right text-emerald-700 border-b">N$ {Math.round(r.dpValue - r.cifValue).toLocaleString('en-ZA')}</td>
                  </tr>
                ))
              }
              {breakdown.length > 0 && (
                <tr style={{ background: '#fff0f3', borderTop: '2px solid #c41e3a', fontWeight: 800 }}>
                  <td className="px-3 py-3" colSpan={2}>GRAND TOTAL</td>
                  <td className="px-3 py-3 text-right">{grandQty.toLocaleString()}</td>
                  <td colSpan={2}></td>
                  <td className="px-3 py-3 text-right">N$ {Math.round(grandCIF).toLocaleString('en-ZA')}</td>
                  <td className="px-3 py-3 text-right" style={{ color: '#c41e3a' }}>N$ {Math.round(grandDP).toLocaleString('en-ZA')}</td>
                  <td className="px-3 py-3 text-right text-emerald-700">N$ {Math.round(grandDP - grandCIF).toLocaleString('en-ZA')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Code128-B SVG barcode generator ─────────────────────────────────────────
// Only ASCII 32–126 (Code128-B charset) is supported. Characters outside that
// range are silently stripped so the SVG is always valid.
function code128SVG(value) {
  if (!value) return '';
  // Strip chars outside Code128-B printable range; cap at 20 chars so the
  // physical barcode stays compact and scannable when printed.
  const safe = String(value).replace(/[^\x20-\x7E]/g, '').slice(0, 20);
  if (!safe) return '';
  const CODE128_START_B = 104, CODE128_STOP = 106;
  const P = [
    '11011001100','11001101100','11001100110','10010011000','10010001100','10001001100','10011001000','10011000100','10001100100','11001001000',
    '11001000100','11000100100','10110011100','10011011100','10011001110','10111001100','10011101100','10011100110','11001110010','11001011100',
    '11001001110','11011100100','11001110100','11100101100','11100100110','11101100100','11100110100','11100110010','11011011000','11011000110',
    '11000110110','10100011000','10001011000','10001000110','10110001000','10001101000','10001100010','11010001000','11000101000','11000100010',
    '10110111000','10110001110','10001101110','10111011000','10111000110','10001110110','11101110110','11010001110','11000101110','11011101000',
    '11011100010','11011101110','11101011000','11101000110','11100010110','11101101000','11101100010','11100011010','11101111010','11001000010',
    '11110001010','10100110000','10100001100','10010110000','10010000110','10000101100','10000100110','10110010000','10110000100','10011010000',
    '10011000010','10000110100','10000110010','11000010010','11001010000','11110111010','11000010100','10001111010','10100111100','10010111100',
    '10010011110','10111100100','10011110100','10011110010','11110100100','11110010100','11110010010','11011011110','11110110110','11110101000',
    '11110100010','10111011110','10111101110','11101011110','11110101110','11010000100','11010010000','11010011100','1100011101011',
  ];
  const cv = c => c.charCodeAt(0) - 32;
  let chk = CODE128_START_B, bits = P[CODE128_START_B];
  for (let i = 0; i < safe.length; i++) {
    const v = cv(safe[i]);
    if (v < 0 || v > 95 || !P[v]) continue;
    chk += v * (i + 1);
    bits += P[v];
  }
  bits += P[chk % 103] + P[CODE128_STOP];

  // 1 SVG unit per module — no CSS max-width, which destroys bar ratios on print.
  // Quiet zones of 10 modules on each side are required for scanner recognition.
  const bw = 1, bh = 48, qz = 10;
  let x = qz, rects = '';
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] === '1') rects += `<rect x="${x}" y="0" width="${bw}" height="${bh}" fill="black"/>`;
    x += bw;
  }
  const tw = x + qz, th = bh + 14;
  const label = safe.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${tw} ${th}" width="${tw}" height="${th}" style="display:block;background:white;"><rect x="0" y="0" width="${tw}" height="${th}" fill="white"/>${rects}<text x="${tw/2}" y="${bh+11}" text-anchor="middle" font-family="monospace" font-size="9" font-weight="bold" fill="black">${label}</text></svg>`;
}

function BarcodeLabelDisplay({ code, name, batch, expiry, location, qty, dp }) {
  const svg = code ? code128SVG(code) : null;
  const fmtExp = d => { try { return d ? new Date(d).toLocaleDateString('en-ZA',{month:'short',year:'numeric'}) : null; } catch { return d; } };
  return (
    <div style={{ border: '1.5px solid #d1d5db', borderRadius: 8, padding: '10px 12px', textAlign: 'center', background: '#fff', width: 240, flexShrink: 0 }}>
      <div style={{ fontSize: 8, fontWeight: 800, color: '#c41e3a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>DYNAPHARM NAMIBIA</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.3, marginBottom: 6, minHeight: 28, overflow: 'hidden' }}>{name}</div>
      {batch && <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 1 }}>Batch: <strong style={{ color: '#374151' }}>{batch}</strong></div>}
      {expiry && <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 1 }}>Exp: <strong style={{ color: '#374151' }}>{fmtExp(expiry)}</strong></div>}
      {location && <div style={{ fontSize: 9, color: '#6b7280', marginBottom: 4 }}>Loc: <strong style={{ color: '#374151' }}>{location}</strong></div>}
      {svg
        ? <div dangerouslySetInnerHTML={{ __html: svg }} style={{ display:'flex', justifyContent:'center', margin:'4px 0' }} />
        : <div style={{ height: 56, background: '#f3f4f6', borderRadius: 4, margin: '4px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#9ca3af' }}>No barcode assigned</div>
      }
      {code && <div style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: '#374151', letterSpacing: 1 }}>{code}</div>}
      {dp > 0 && <div style={{ fontSize: 11, fontWeight: 800, color: '#c41e3a', marginTop: 4 }}>NAD {formatCurrency(dp)}</div>}
      {qty != null && <div style={{ fontSize: 9, color: '#6b7280', marginTop: 2 }}>Qty on hand: {qty}</div>}
    </div>
  );
}

function BarcodeTab() {
  const [batches, setBatches]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [locFilter, setLocFilter]     = useState('all');
  const [codeFilter, setCodeFilter]   = useState('all');
  const [assigningId, setAssigningId] = useState(null);
  const [assignCode, setAssignCode]   = useState('');
  const [saving, setSaving]           = useState(false);
  const [alert, setAlert]             = useState(null);
  const [selected, setSelected]       = useState({});
  const [preview, setPreview]         = useState(null);

  const load = () => {
    setLoading(true);
    api.stock.batches()
      .then(d => setBatches(Array.isArray(d) ? d : d.batches || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const fmtDate = d => { try { return d ? new Date(d).toLocaleDateString('en-ZA', { day:'2-digit', month:'short', year:'numeric' }) : '—'; } catch { return d || '—'; } };
  const fmtLoc  = loc => {
    const l = (loc || '').toLowerCase();
    if (l === 'windhoek_warehouse') return 'Windhoek WH';
    if (l === 'ondangwa_warehouse') return 'Ondangwa WH';
    const bd = BRANCH_DETAILS.find(b => b.id === l || b.id === l.replace(/_branch$/, ''));
    return bd ? bd.name : loc.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };
  const getDP = name => { const p = getLiveProductList().find(p => p.description === name); return p ? Number(p.dp || 0) : 0; };
  const suggestCode = b => {
    if (b.batch_no || b.batch_number) return `DYN-${(b.batch_no || b.batch_number).replace(/\s+/g,'').toUpperCase().slice(0,10)}`;
    const idx = getLiveProductList().findIndex(p => p.description === (b.product_name || b.description));
    return `DYN-${String(idx >= 0 ? idx : Math.floor(Math.random()*9000)+1000).padStart(4,'0')}`;
  };

  const activeBatches = batches.filter(b => {
    const loc = (b.location || '').toLowerCase();
    if (loc === 'country_stock') return false;
    const rem = Number(b.remaining_quantity ?? b.remainingQuantity ?? b.quantity ?? 0);
    if (rem <= 0) return false;
    const st = (b.status || '').toLowerCase();
    if (st === 'expired' || st === 'depleted' || st === 'written_off') return false;
    return true;
  });

  const locations = ['all', ...new Set(activeBatches.map(b => (b.location||'').toLowerCase()).filter(Boolean))];

  const filtered = activeBatches.filter(b => {
    const term = search.toLowerCase();
    if (term && !(b.product_name||b.description||'').toLowerCase().includes(term) &&
        !(b.batch_no||b.batch_number||'').toLowerCase().includes(term) &&
        !(b.barcode||'').toLowerCase().includes(term)) return false;
    if (locFilter !== 'all' && (b.location||'').toLowerCase() !== locFilter) return false;
    if (codeFilter === 'assigned'   &&  !b.barcode) return false;
    if (codeFilter === 'unassigned' &&   b.barcode) return false;
    return true;
  });

  const totalAssigned   = activeBatches.filter(b => b.barcode).length;
  const totalUnassigned = activeBatches.length - totalAssigned;

  const handleSave = async (batchId) => {
    if (!assignCode.trim()) return;
    setSaving(true);
    setAlert(null);
    try {
      await api.stock.updateBatch(batchId, { barcode: assignCode.trim() });
      setAlert({ type: 'success', msg: `Barcode ${assignCode.trim()} assigned successfully` });
      setAssigningId(null);
      setAssignCode('');
      load();
    } catch {
      setAlert({ type: 'error', msg: 'Failed to assign barcode — please try again' });
    } finally { setSaving(false); }
  };

  const makeLabelHTML = (b, qty = 1) => {
    const name = b.product_name || b.description || '';
    const bno  = b.batch_no || b.batch_number || '';
    const exp  = b.expiry_date;
    const loc  = fmtLoc(b.location || '');
    const rem  = Number(b.remaining_quantity ?? b.remainingQuantity ?? b.quantity ?? 0);
    const dp   = getDP(name) || Number(b.unit_price || b.dpc_unit_value || 0);
    const code = b.barcode || '';
    const svg  = code ? code128SVG(code) : '';
    const labelCss = `
      .lbl { border: 1.5px solid #d1d5db; border-radius: 8px; padding: 10px 14px; width: 240px; text-align: center; display: inline-block; margin: 4px; vertical-align: top; background: #fff; }
      .lbl-brand { font-size: 8px; font-weight: 800; color: #c41e3a; text-transform: uppercase; letter-spacing: 1px; }
      .lbl-name  { font-size: 10px; font-weight: 700; color: #1a1a1a; margin: 5px 0; min-height: 28px; line-height: 1.3; }
      .lbl-meta  { font-size: 9px; color: #6b7280; margin: 1px 0; }
      .lbl-meta strong { color: #374151; }
      .lbl-barcode { margin: 5px auto 2px; display: flex; justify-content: center; overflow: visible; }
      .lbl-barcode svg { display: block; }
      .lbl-code  { font-family: monospace; font-size: 10px; font-weight: 700; letter-spacing: 1px; color: #374151; }
      .lbl-price { font-size: 11px; font-weight: 800; color: #c41e3a; margin-top: 3px; }
      .lbl-qty   { font-size: 9px; color: #6b7280; margin-top: 2px; }
    `;
    const singleLabel = `
      <div class="lbl">
        <div class="lbl-brand">DYNAPHARM NAMIBIA</div>
        <div class="lbl-name">${name}</div>
        ${bno  ? `<div class="lbl-meta">Batch: <strong>${bno}</strong></div>` : ''}
        ${exp  ? `<div class="lbl-meta">Expiry: <strong>${fmtDate(exp)}</strong></div>` : ''}
        <div class="lbl-meta">Location: <strong>${loc}</strong></div>
        ${svg  ? `<div class="lbl-barcode">${svg}</div>` : '<div style="height:40px;background:#f3f4f6;border-radius:4px;margin:5px 0;display:flex;align-items:center;justify-content:center;font-size:9px;color:#9ca3af">No barcode</div>'}
        ${code ? `<div class="lbl-code">${code}</div>` : ''}
        ${dp   ? `<div class="lbl-price">NAD ${Math.round(dp).toLocaleString('en-ZA')}</div>` : ''}
        <div class="lbl-qty">Qty on hand: ${rem}</div>
      </div>`;
    return { labelCss, html: Array.from({ length: qty }, () => singleLabel).join('') };
  };

  const printSingle = (b) => {
    const { labelCss, html } = makeLabelHTML(b);
    const w = window.open('', '_blank', 'width=600,height=500');
    w.document.write(`<!DOCTYPE html><html><head><title>Label — ${b.product_name||b.description||''}</title><style>
      body { font-family: Arial, sans-serif; padding: 16px; }
      @media print { @page { margin: 8mm; } .no-print { display:none!important; } }
      ${labelCss}
    </style></head><body>
      ${html}
      <div class="no-print" style="margin-top:16px;text-align:center">
        <button onclick="window.print()" style="padding:8px 24px;background:#c41e3a;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px">🖨️ Print Label</button>
      </div>
    </body></html>`);
    w.document.close();
  };

  const printSelected_ = () => {
    const ids = Object.keys(selected).filter(id => selected[id]);
    if (!ids.length) return;
    const items = filtered.filter(b => ids.includes(b.id));
    const { labelCss } = makeLabelHTML(items[0]);
    const allHtml = items.map(b => makeLabelHTML(b).html).join('');
    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(`<!DOCTYPE html><html><head><title>Barcode Labels (${items.length})</title><style>
      body { font-family: Arial, sans-serif; padding: 16px; }
      @media print { @page { margin: 8mm; } .no-print { display:none!important; } }
      ${labelCss}
    </style></head><body>
      <div style="margin-bottom:12px;font-size:11px;color:#555;font-weight:bold">DYNAPHARM INTERNATIONAL NAMIBIA — Barcode Labels (${items.length} batch${items.length>1?'es':''})</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${allHtml}</div>
      <div class="no-print" style="margin-top:16px;text-align:center">
        <button onclick="window.print()" style="padding:8px 24px;background:#c41e3a;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px">🖨️ Print All Labels</button>
      </div>
    </body></html>`);
    w.document.close();
  };

  const toggleAll = () => {
    const allIds = filtered.map(b => b.id);
    const allSelected = allIds.every(id => selected[id]);
    const next = {};
    if (!allSelected) allIds.forEach(id => { next[id] = true; });
    setSelected(next);
  };
  const numSelected = Object.values(selected).filter(Boolean).length;

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} onClose={() => setAlert(null)}>{alert.msg}</Alert>}

      {/* ── Stats ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 10, padding: '12px 16px' }}>
          <div className="text-2xl font-bold text-green-800">{activeBatches.length}</div>
          <div className="text-xs font-semibold text-green-700">Active Batches</div>
        </div>
        <div style={{ background: '#eff6ff', border: '1.5px solid #93c5fd', borderRadius: 10, padding: '12px 16px' }}>
          <div className="text-2xl font-bold text-blue-800">{totalAssigned}</div>
          <div className="text-xs font-semibold text-blue-700">Barcodes Assigned</div>
        </div>
        <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10, padding: '12px 16px' }}>
          <div className="text-2xl font-bold text-yellow-800">{totalUnassigned}</div>
          <div className="text-xs font-semibold text-yellow-700">Awaiting Barcode</div>
        </div>
      </div>

      {/* ── Filters + Bulk Actions ─────────────────────────────────────── */}
      <Card>
        <CardBody>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary"
                placeholder="Search product, batch#, barcode…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary bg-white"
              value={locFilter} onChange={e => setLocFilter(e.target.value)}>
              <option value="all">All Locations</option>
              {locations.filter(l => l !== 'all').map(l => <option key={l} value={l}>{fmtLoc(l)}</option>)}
            </select>
            <select className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary bg-white"
              value={codeFilter} onChange={e => setCodeFilter(e.target.value)}>
              <option value="all">All Barcodes</option>
              <option value="assigned">Assigned only</option>
              <option value="unassigned">Unassigned only</option>
            </select>
            <Button size="sm" variant="secondary" onClick={load}>↺ Refresh</Button>
            {numSelected > 0 && (
              <Button size="sm" onClick={printSelected_} style={{ background: '#c41e3a', color: '#fff' }}>
                <Printer size={14} /> Print {numSelected} Label{numSelected > 1 ? 's' : ''}
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      {/* ── Label Preview modal ────────────────────────────────────────── */}
      {preview && (
        <Modal open={!!preview} onClose={() => setPreview(null)} title="Label Preview" size="sm">
          <div className="p-6 flex flex-col items-center gap-4">
            <BarcodeLabelDisplay
              code={preview.barcode || ''}
              name={preview.product_name || preview.description}
              batch={preview.batch_no || preview.batch_number}
              expiry={preview.expiry_date}
              location={fmtLoc(preview.location)}
              qty={Number(preview.remaining_quantity ?? preview.remainingQuantity ?? preview.quantity ?? 0)}
              dp={getDP(preview.product_name || preview.description) || Number(preview.unit_price || 0)}
            />
            <Button onClick={() => { printSingle(preview); setPreview(null); }} style={{ background: '#c41e3a', color: '#fff' }}>
              <Printer size={14} /> Print This Label
            </Button>
          </div>
        </Modal>
      )}

      {/* ── Main Table ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-bold text-gray-800">
              Active Batch Barcodes
              <span className="text-xs font-normal text-gray-400 ml-2">({filtered.length} batch{filtered.length !== 1 ? 'es' : ''})</span>
            </h3>
            <div className="text-xs text-gray-500">Country stock excluded · Only available batches with remaining qty shown</div>
          </div>
        </CardHeader>
        {loading ? <LoadingSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ background: '#fef2f2', borderBottom: '2px solid #fecaca' }}>
                  <th className="px-3 py-2.5 text-left" style={{ width: 36 }}>
                    <input type="checkbox" className="accent-primary cursor-pointer"
                      checked={filtered.length > 0 && filtered.every(b => selected[b.id])}
                      onChange={toggleAll} />
                  </th>
                  {['Product','Batch #','Expiry','Location','Qty on Hand','Barcode','Actions'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-bold text-gray-700 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0
                  ? <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400">No active batches found — import stock or adjust filters</td></tr>
                  : filtered.map((b, i) => {
                      const name    = b.product_name || b.description || '—';
                      const bno     = b.batch_no || b.batch_number || '—';
                      const rem     = Number(b.remaining_quantity ?? b.remainingQuantity ?? b.quantity ?? 0);
                      const dp      = getDP(name) || Number(b.unit_price || 0);
                      const isEditing = assigningId === b.id;
                      const expDate = b.expiry_date ? new Date(b.expiry_date) : null;
                      const isExpiringSoon = expDate && expDate < new Date(Date.now() + 90 * 86400000);
                      return (
                        <tr key={b.id} style={{ background: selected[b.id] ? '#fef2f2' : i % 2 === 0 ? '#fff' : '#fafafa' }}>
                          <td className="px-3 py-2.5 border-b">
                            <input type="checkbox" className="accent-primary cursor-pointer"
                              checked={!!selected[b.id]} onChange={e => setSelected(p => ({ ...p, [b.id]: e.target.checked }))} />
                          </td>
                          <td className="px-3 py-2.5 border-b font-medium text-gray-800 max-w-[180px]">
                            <div className="truncate text-sm" title={name}>{name}</div>
                            {dp > 0 && <div className="text-xs text-gray-400">DP: N$ {Math.round(dp).toLocaleString('en-ZA')}</div>}
                          </td>
                          <td className="px-3 py-2.5 border-b font-mono text-xs text-gray-600">{bno}</td>
                          <td className="px-3 py-2.5 border-b text-xs" style={{ color: isExpiringSoon ? '#dc2626' : '#374151', fontWeight: isExpiringSoon ? 700 : 400 }}>
                            {fmtDate(b.expiry_date)}
                            {isExpiringSoon && <div className="text-xs text-red-500">⚠ &lt;90 days</div>}
                          </td>
                          <td className="px-3 py-2.5 border-b text-xs text-gray-600">{fmtLoc(b.location)}</td>
                          <td className="px-3 py-2.5 border-b font-bold text-gray-800">{rem.toLocaleString()}</td>
                          <td className="px-3 py-2.5 border-b" style={{ minWidth: 180 }}>
                            {isEditing ? (
                              <div className="flex gap-1 items-center">
                                <input className="px-2 py-1 rounded border border-gray-300 text-xs w-32 font-mono focus:outline-none focus:ring-1 focus:border-primary"
                                  value={assignCode} onChange={e => setAssignCode(e.target.value)}
                                  placeholder="e.g. DYN-0001" autoFocus
                                  onKeyDown={e => { if (e.key === 'Enter') handleSave(b.id); if (e.key === 'Escape') setAssigningId(null); }} />
                                <button onClick={() => handleSave(b.id)} disabled={saving || !assignCode.trim()}
                                  className="px-2 py-1 rounded text-xs font-bold border-none cursor-pointer"
                                  style={{ background: '#166534', color: '#fff', opacity: saving ? 0.6 : 1 }}>{saving ? '…' : '✓'}</button>
                                <button onClick={() => setAssigningId(null)}
                                  className="px-2 py-1 rounded text-xs font-bold border-none cursor-pointer"
                                  style={{ background: '#f3f4f6', color: '#374151' }}>✕</button>
                              </div>
                            ) : b.barcode ? (
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded" style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #86efac' }}>{b.barcode}</span>
                                <button onClick={() => { setAssigningId(b.id); setAssignCode(b.barcode); }}
                                  className="text-xs px-1.5 py-0.5 rounded border-none cursor-pointer" style={{ background: '#eff6ff', color: '#1d4ed8' }} title="Edit barcode">✏</button>
                              </div>
                            ) : (
                              <button onClick={() => { setAssigningId(b.id); setAssignCode(suggestCode(b)); }}
                                className="px-2.5 py-1 rounded-lg text-xs font-bold border-none cursor-pointer flex items-center gap-1"
                                style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
                                <Tag size={11} /> Assign Code
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-2.5 border-b">
                            <div className="flex gap-1">
                              <button onClick={() => setPreview(b)} title="Preview label"
                                className="px-2 py-1 rounded text-xs font-bold border-none cursor-pointer"
                                style={{ background: '#f8fafc', color: '#374151', border: '1px solid #e2e8f0' }}>👁</button>
                              <button onClick={() => printSingle(b)} title="Print label now"
                                className="px-2 py-1 rounded text-xs font-bold border-none cursor-pointer flex items-center gap-1"
                                style={{ background: b.barcode ? '#fff0f3' : '#f3f4f6', color: b.barcode ? '#c41e3a' : '#9ca3af', border: b.barcode ? '1px solid #fecaca' : '1px solid #e5e7eb' }}>
                                <Printer size={11} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                }
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Bulk selection hint ────────────────────────────────────────── */}
      {numSelected > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-xl" style={{ background: '#c41e3a', color: '#fff' }}>
          <span className="font-semibold text-sm">{numSelected} batch{numSelected > 1 ? 'es' : ''} selected</span>
          <button onClick={printSelected_} className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-bold border-none cursor-pointer" style={{ background: '#fff', color: '#c41e3a' }}>
            <Printer size={14} /> Print Labels
          </button>
          <button onClick={() => setSelected({})} className="text-white/70 hover:text-white text-lg border-none bg-transparent cursor-pointer">✕</button>
        </div>
      )}
    </div>
  );
}

function SmartReorderTab({ branch }) {
  const { user } = useAuth();
  const [batches, setBatches]         = useState([]);
  const [movements, setMovements]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [thresholds, setThresholds]   = useState({});
  const [editProduct, setEditProduct] = useState(null);
  const [editThreshold, setEditThreshold] = useState('');
  const [viewMode, setViewMode]       = useState('ai');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [orderModal, setOrderModal]   = useState(null);
  const [orderQty, setOrderQty]       = useState('');
  const [orderNote, setOrderNote]     = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [orderAlert, setOrderAlert]   = useState(null);
  const [poList, setPoList]           = useState([]);
  const [poLoading, setPoLoading]     = useState(false);
  const [showPOs, setShowPOs]         = useState(false);
  const [updatingPo, setUpdatingPo]   = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.stock.batches().then(d => Array.isArray(d) ? d : d.batches || []).catch(() => []),
      api.stock.movements().then(d => Array.isArray(d) ? d : d.movements || []).catch(() => []),
    ]).then(([b, m]) => { setBatches(b); setMovements(m); }).finally(() => setLoading(false));
  }, []);

  const loadPOs = useCallback(() => {
    setPoLoading(true);
    api.stock.supplierOrders()
      .then(d => setPoList(Array.isArray(d) ? d : d.orders || []))
      .catch(() => {})
      .finally(() => setPoLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (showPOs) loadPOs(); }, [showPOs, loadPOs]);

  if (loading) return <LoadingSpinner />;

  const filterBatch = (b) => branch === 'all' || (b.location || '').toLowerCase().replace(/\s+/g, '_') === branch;
  const filteredBatches = batches.filter(filterBatch);

  // ── Aggregate by product + location, use remaining_quantity ───────────
  const productMap = {};
  filteredBatches.forEach(b => {
    const loc = (b.location || '').toLowerCase();
    if (loc === 'country_stock') return;
    const key = `${b.product_name}||${loc || 'unknown'}`;
    if (!productMap[key]) productMap[key] = { product_name: b.product_name, location: b.location || 'unknown', qty: 0, expiry: null };
    productMap[key].qty += Number(b.remaining_quantity ?? b.remainingQuantity ?? b.quantity ?? 0);
    if (b.expiry_date && (!productMap[key].expiry || new Date(b.expiry_date) < new Date(productMap[key].expiry)))
      productMap[key].expiry = b.expiry_date;
  });

  const allItems = Object.values(productMap).map(p => {
    const dailyRate = stockAI.getDailyRate(p.product_name, movements, branch === 'all' ? null : branch);
    const daysOfStock = stockAI.getDaysOfStock(p.qty, dailyRate);
    const priority = stockAI.getPriority(daysOfStock, p.qty);
    const threshold = thresholds[p.product_name] || 10;
    // Suggested order = 6-month supply minus current stock
    const sixMonthNeed = dailyRate > 0 ? Math.ceil(dailyRate * 180) : (p.qty < 5 ? 180 : 0);
    const suggestedOrder = Math.max(0, sixMonthNeed - p.qty);
    const classicStatus = p.qty < 5 ? 'Critical' : p.qty < threshold ? 'Low' : 'OK';
    return { ...p, dailyRate, daysOfStock, priority, threshold, suggestedOrder, classicStatus };
  }).sort((a, b) => b.priority.score - a.priority.score);

  // Items that need action = anything with < 6 months stock remaining
  const aiActionable = allItems.filter(i => i.priority.score > 0);
  const aiFiltered = priorityFilter === 'all' ? aiActionable
    : priorityFilter === 'critical' ? aiActionable.filter(i => i.priority.score >= 90)
    : priorityFilter === 'urgent'   ? aiActionable.filter(i => i.priority.score >= 70 && i.priority.score < 90)
    : priorityFilter === 'reorder'  ? aiActionable.filter(i => i.priority.score >= 50 && i.priority.score < 70)
    :                                  aiActionable.filter(i => i.priority.score > 0  && i.priority.score < 50);

  const oosCount       = allItems.filter(i => i.qty <= 0).length;
  const criticalCount  = allItems.filter(i => i.qty > 0 && i.daysOfStock <= 14 && i.daysOfStock < 999).length;
  const urgentCount    = allItems.filter(i => i.daysOfStock > 14 && i.daysOfStock <= 30).length;
  const reorderCount   = allItems.filter(i => i.daysOfStock > 30 && i.daysOfStock <= 90).length;
  const planCount      = allItems.filter(i => i.daysOfStock > 90 && i.daysOfStock <= 180).length;

  // ── Create Supplier Purchase Order ────────────────────────────────────
  const createSupplierOrder = async () => {
    if (!orderModal || !orderQty) return;
    setSubmitting(true);
    setOrderAlert(null);
    try {
      await api.stock.createSupplierOrder({
        product_name: orderModal.product_name,
        quantity: Number(orderQty),
        days_remaining: orderModal.daysOfStock === 999 ? null : orderModal.daysOfStock,
        daily_rate: orderModal.dailyRate > 0 ? orderModal.dailyRate : null,
        priority_label: orderModal.priority.label,
        location: orderModal.location,
        notes: orderNote || `Reorder — ${orderModal.priority.label}. Days remaining: ${orderModal.daysOfStock === 999 ? 'N/A' : orderModal.daysOfStock + 'd'}. Daily rate: ${orderModal.dailyRate > 0 ? orderModal.dailyRate.toFixed(2) + '/day' : 'not calculated'}.`,
        requested_by: user?.id || user?.username,
        requested_by_name: user?.full_name || user?.name || user?.username,
      });
      setOrderAlert({ type: 'success', msg: `Supplier Purchase Order created for ${Number(orderQty)} × ${orderModal.product_name}` });
      setOrderModal(null);
      setOrderQty('');
      setOrderNote('');
      if (showPOs) loadPOs();
    } catch (err) {
      setOrderAlert({ type: 'error', msg: err.message || 'Failed to create order' });
    } finally { setSubmitting(false); }
  };

  const updatePoStatus = async (po, status) => {
    setUpdatingPo(po.id);
    try {
      await api.stock.updateSupplierOrder(po.id, { status, submitted_by: user?.full_name || user?.username });
      loadPOs();
    } catch {}
    finally { setUpdatingPo(null); }
  };

  const fmtDays = d => d == null ? '—' : d === 999 ? '—' : d <= 30 ? `${d}d ⚠` : d <= 90 ? `${d}d` : `${Math.round(d/30)}mo`;
  const poStatusColor = s => s === 'draft' ? '#94a3b8' : s === 'submitted' ? '#2563eb' : s === 'confirmed' ? '#16a34a' : s === 'received' ? '#059669' : s === 'cancelled' ? '#dc2626' : '#374151';

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', borderRadius: 14, padding: '14px 20px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontWeight: 900, fontSize: '1.05rem', margin: 0 }}>
            🤖 Supplier Reorder Intelligence
          </h3>
          <p style={{ fontSize: '0.78rem', opacity: 0.85, margin: '3px 0 0' }}>
            Flags products with &lt;6 months stock based on actual daily sales velocity · Generates supplier purchase orders automatically
            {branch !== 'all' && ` · ${fmtLocation(branch)}`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setViewMode(viewMode === 'ai' ? 'classic' : 'ai')}
            style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 99, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
            {viewMode === 'ai' ? '📊 Classic View' : '📈 Smart View'}
          </button>
          <button onClick={() => { setShowPOs(s => !s); }}
            style={{ padding: '6px 14px', background: showPOs ? '#fff' : 'rgba(255,255,255,0.15)', color: showPOs ? '#c41e3a' : '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 99, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
            📋 {showPOs ? 'Hide' : 'Show'} PO History
          </button>
          <button onClick={load}
            style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 99, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {orderAlert && <Alert type={orderAlert.type} onClose={() => setOrderAlert(null)}>{orderAlert.msg}</Alert>}

      {/* ── Stats — 6-month horizon ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Flagged', value: aiActionable.length, color: '#374151', bg: '#f8fafc', border: '#e2e8f0', filter: 'all' },
          { label: 'Critical / OOS', value: oosCount + criticalCount, color: '#dc2626', bg: '#fef2f2', border: '#fecaca', filter: 'critical' },
          { label: 'Urgent < 30d',  value: urgentCount,  color: '#d97706', bg: '#fffbeb', border: '#fde68a', filter: 'urgent' },
          { label: 'Reorder < 90d', value: reorderCount, color: '#ca8a04', bg: '#fefce8', border: '#fef08a', filter: 'reorder' },
          { label: 'Plan < 6 mo',   value: planCount,    color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', filter: 'plan' },
        ].map(s => (
          <div key={s.filter} onClick={() => setPriorityFilter(s.filter)}
            style={{ cursor: 'pointer', borderRadius: 12, padding: '11px 12px', background: priorityFilter === s.filter ? s.bg : '#f8fafc', border: `2px solid ${priorityFilter === s.filter ? s.border : '#e2e8f0'}`, textAlign: 'center', transition: 'all .15s' }}>
            <div style={{ fontSize: '1.7rem', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── PO History ────────────────────────────────────────────────────── */}
      {showPOs && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h3 className="font-bold text-gray-800">📋 Supplier Purchase Orders</h3>
              <Button size="sm" variant="secondary" onClick={loadPOs}>↺ Refresh</Button>
            </div>
          </CardHeader>
          {poLoading ? <LoadingSpinner /> : poList.length === 0 ? (
            <CardBody><EmptyState icon={<Package size={40} />} title="No supplier orders yet" description="Click '+ Order from Supplier' on any flagged product to create the first order." /></CardBody>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    {['PO Ref', 'Product', 'Location', 'Qty', 'Priority', 'Days at Order', 'Status', 'Requested By', 'Date', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {poList.map((po, i) => (
                    <tr key={po.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb', borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '0.73rem', fontWeight: 700, color: '#6b21a8' }}>{po.order_ref}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: '#1e293b', maxWidth: 160 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{po.product_name}</div></td>
                      <td style={{ padding: '8px 12px', color: '#64748b', fontSize: '0.77rem' }}>{fmtLocation(po.location || '')}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 900, color: '#374151' }}>{po.quantity_ordered?.toLocaleString()}</td>
                      <td style={{ padding: '8px 12px' }}>
                        {po.priority_label && <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 7px', borderRadius: 99, background: po.priority_label?.includes('CRITICAL') ? '#fef2f2' : po.priority_label?.includes('URGENT') ? '#fffbeb' : '#eff6ff', color: po.priority_label?.includes('CRITICAL') ? '#dc2626' : po.priority_label?.includes('URGENT') ? '#d97706' : '#2563eb' }}>{po.priority_label}</span>}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#64748b' }}>{fmtDays(po.days_remaining)}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '3px 9px', borderRadius: 99, background: poStatusColor(po.status) + '1a', color: poStatusColor(po.status), textTransform: 'capitalize' }}>{po.status}</span>
                      </td>
                      <td style={{ padding: '8px 12px', color: '#64748b', fontSize: '0.77rem' }}>{po.requested_by_name || po.requested_by || '—'}</td>
                      <td style={{ padding: '8px 12px', color: '#94a3b8', fontSize: '0.73rem', whiteSpace: 'nowrap' }}>{po.created_at ? new Date(po.created_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' }) : '—'}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <div className="flex gap-1 flex-wrap">
                          {po.status === 'draft' && (
                            <button onClick={() => updatePoStatus(po, 'submitted')} disabled={updatingPo === po.id}
                              style={{ padding: '3px 8px', fontSize: '0.7rem', fontWeight: 700, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              {updatingPo === po.id ? '…' : '→ Submit'}
                            </button>
                          )}
                          {po.status === 'submitted' && (
                            <button onClick={() => updatePoStatus(po, 'confirmed')} disabled={updatingPo === po.id}
                              style={{ padding: '3px 8px', fontSize: '0.7rem', fontWeight: 700, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              {updatingPo === po.id ? '…' : '✓ Confirm'}
                            </button>
                          )}
                          {po.status === 'confirmed' && (
                            <button onClick={() => updatePoStatus(po, 'received')} disabled={updatingPo === po.id}
                              style={{ padding: '3px 8px', fontSize: '0.7rem', fontWeight: 700, background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              {updatingPo === po.id ? '…' : '📥 Received'}
                            </button>
                          )}
                          {(po.status === 'draft' || po.status === 'submitted') && (
                            <button onClick={() => updatePoStatus(po, 'cancelled')} disabled={updatingPo === po.id}
                              style={{ padding: '3px 8px', fontSize: '0.7rem', fontWeight: 700, background: '#f1f5f9', color: '#dc2626', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                              ✕
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ── AI Reorder Queue ────────────────────────────────────────────── */}
      {viewMode === 'ai' ? (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <Brain size={16} className="text-primary" />
                  Products Needing Reorder
                  {priorityFilter !== 'all' && <Badge variant="warning">{priorityFilter} filter</Badge>}
                  {branch !== 'all' && <span className="text-xs text-gray-400 font-normal">— {fmtLocation(branch)}</span>}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">Based on 30-day sales velocity — products with less than 6 months supply remaining</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => {
                const rows = aiFiltered.map(r =>
                  `<tr><td>${r.product_name}</td><td>${fmtLocation(r.location)}</td><td>${r.priority.label}</td><td>${r.qty}</td><td>${r.dailyRate > 0 ? r.dailyRate.toFixed(2) + '/day' : '—'}</td><td>${r.daysOfStock === 999 ? '—' : r.daysOfStock + ' days'}</td><td>${r.suggestedOrder || '—'}</td></tr>`
                ).join('');
                printDocument('Reorder Report — 6-Month Horizon', `<table><thead><tr><th>Product</th><th>Location</th><th>Priority</th><th>Current Qty</th><th>Daily Rate</th><th>Days Left</th><th>Suggested Order</th></tr></thead><tbody>${rows}</tbody></table>`);
              }}><Printer size={14} /> Print</Button>
            </div>
          </CardHeader>
          {aiFiltered.length === 0 ? (
            <CardBody>
              <EmptyState icon={<CheckCircle size={48} className="text-green-500" />} title="All products have 6+ months supply" description={`No reorder action needed${branch !== 'all' ? ` for ${fmtLocation(branch)}` : ''}. The AI has verified all locations.`} />
            </CardBody>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                <thead>
                  <tr style={{ background: '#fef2f2', borderBottom: '2px solid #fecaca' }}>
                    {['Product', 'Location', 'AI Priority', 'Qty on Hand', 'Daily Rate', 'Days Left', 'Months Left', 'Order Qty (6mo)', 'Action'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', fontSize: '0.73rem', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {aiFiltered.map((r, i) => {
                    const monthsLeft = r.daysOfStock === 999 ? null : (r.daysOfStock / 30).toFixed(1);
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb', borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '9px 12px', fontWeight: 700, color: '#1e293b', maxWidth: 180 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.product_name}>{r.product_name}</div>
                        </td>
                        <td style={{ padding: '9px 12px', color: '#64748b', fontSize: '0.77rem' }}>{fmtLocation(r.location)}</td>
                        <td style={{ padding: '9px 12px' }}>
                          <span style={{ background: r.priority.bg, color: r.priority.color, borderRadius: 99, padding: '3px 9px', fontWeight: 800, fontSize: '0.7rem', whiteSpace: 'nowrap' }}>{r.priority.label}</span>
                        </td>
                        <td style={{ padding: '9px 12px', fontWeight: 900, color: r.qty <= 0 ? '#dc2626' : r.qty < 5 ? '#d97706' : '#374151' }}>{r.qty.toLocaleString()}</td>
                        <td style={{ padding: '9px 12px', color: r.dailyRate > 0 ? '#374151' : '#94a3b8', fontSize: '0.8rem' }}>
                          {r.dailyRate > 0 ? `${r.dailyRate.toFixed(2)}/d` : '—'}
                        </td>
                        <td style={{ padding: '9px 12px', fontWeight: 700, color: r.daysOfStock === 999 ? '#94a3b8' : r.daysOfStock <= 14 ? '#dc2626' : r.daysOfStock <= 30 ? '#d97706' : r.daysOfStock <= 90 ? '#ca8a04' : '#2563eb' }}>
                          {r.daysOfStock === 999 ? '—' : `${r.daysOfStock}d`}
                        </td>
                        <td style={{ padding: '9px 12px', fontWeight: 700, color: monthsLeft === null ? '#94a3b8' : Number(monthsLeft) < 1 ? '#dc2626' : Number(monthsLeft) < 3 ? '#d97706' : '#2563eb' }}>
                          {monthsLeft === null ? '—' : `${monthsLeft} mo`}
                        </td>
                        <td style={{ padding: '9px 12px', fontWeight: 800, color: '#7c3aed' }}>
                          {r.suggestedOrder > 0 ? r.suggestedOrder.toLocaleString() : '—'}
                          {r.suggestedOrder > 0 && r.dailyRate > 0 && <div style={{ fontSize: '0.67rem', color: '#94a3b8', fontWeight: 400 }}>covers ~6 mo</div>}
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          <button onClick={() => { setOrderModal(r); setOrderQty(String(r.suggestedOrder || '')); setOrderNote(''); }}
                            style={{ padding: '5px 11px', background: '#c41e3a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                            + Order from Supplier
                          </button>
                        </td>
                      </tr>
                    );
                  })}
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

      {/* ── Supplier Order Modal ─────────────────────────────────────────── */}
      <Modal open={!!orderModal} onClose={() => { setOrderModal(null); setOrderAlert(null); }} title={`📦 Supplier Purchase Order — ${orderModal?.product_name}`} size="md">
        <div className="p-6 space-y-4">
          <div style={{ background: 'linear-gradient(135deg,#fff0f3,#fef2f2)', border: '1.5px solid #fecaca', borderRadius: 10, padding: '12px 16px' }}>
            <div className="text-xs text-red-600 font-bold uppercase tracking-wide mb-2">Order Analysis</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-gray-500">Current Stock:</span> <strong>{orderModal?.qty?.toLocaleString()} units</strong></div>
              <div><span className="text-gray-500">Daily Rate:</span> <strong>{orderModal?.dailyRate > 0 ? `${Number(orderModal.dailyRate).toFixed(2)}/day` : 'Not available'}</strong></div>
              <div><span className="text-gray-500">Days Remaining:</span> <strong style={{ color: orderModal?.daysOfStock <= 30 ? '#dc2626' : orderModal?.daysOfStock <= 90 ? '#d97706' : '#2563eb' }}>{orderModal?.daysOfStock === 999 ? 'Unknown' : `${orderModal?.daysOfStock} days (${(orderModal?.daysOfStock / 30).toFixed(1)} mo)`}</strong></div>
              <div><span className="text-gray-500">Priority:</span> <strong style={{ color: orderModal?.priority?.color }}>{orderModal?.priority?.label}</strong></div>
            </div>
            <div className="text-xs text-gray-500 mt-2">Suggested order covers 6 months of supply. Adjust quantity below as needed.</div>
          </div>
          {orderAlert && <Alert type={orderAlert.type}>{orderAlert.msg}</Alert>}
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 14px', fontSize: '0.85rem' }}>
            <div className="text-xs text-gray-500 font-semibold mb-1">Order Details</div>
            <div><strong>Product:</strong> {orderModal?.product_name}</div>
            <div><strong>Destination:</strong> {fmtLocation(orderModal?.location || '')}</div>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-semibold text-gray-700">
              Quantity to Order <span className="text-red-500">*</span>
              {orderModal?.suggestedOrder > 0 && <span className="text-xs text-gray-400 font-normal ml-2">(AI suggestion: {Number(orderModal.suggestedOrder).toLocaleString()} units)</span>}
            </label>
            <input type="number" min="1" value={orderQty} onChange={e => setOrderQty(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary" />
            {orderQty && orderModal?.dailyRate > 0 && (
              <p className="text-xs text-gray-500">This quantity covers approximately <strong>{Math.round(Number(orderQty) / orderModal.dailyRate)} days</strong> ({(Math.round(Number(orderQty) / orderModal.dailyRate) / 30).toFixed(1)} months) of supply.</p>
            )}
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-semibold text-gray-700">Notes for Supplier (optional)</label>
            <textarea rows={2} value={orderNote} onChange={e => setOrderNote(e.target.value)}
              placeholder="Delivery instructions, urgency notes, preferred pack size…"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary resize-none" />
          </div>
          <div className="flex gap-3 pt-1">
            <Button onClick={createSupplierOrder} disabled={submitting || !orderQty} style={{ background: '#c41e3a', color: '#fff' }}>
              <Package size={15} /> {submitting ? 'Creating…' : 'Create Supplier Order'}
            </Button>
            <Button variant="secondary" onClick={() => { setOrderModal(null); setOrderAlert(null); }}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* ── Classic Threshold Edit Modal ────────────────────────────────── */}
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
  const [rawBatches, setRawBatches]   = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [locFilter, setLocFilter]     = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [viewMode, setViewMode]       = useState('batch');
  const [detail, setDetail]           = useState(null);
  const [showForm, setShowForm]       = useState(false);
  const [alert, setAlert]             = useState(null);
  const [form, setForm]               = useState({ product_name: '', quantity: '', manufacture_date: '', expiry_date: '', location: branch && branch !== 'all' ? branch : 'country_stock' });

  const load = () => {
    setLoading(true);
    api.stock.batches()
      .then(d => setRawBatches(Array.isArray(d) ? d : d.batches || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const fmtLoc = loc => {
    const l = (loc || '').toLowerCase();
    if (l === 'country_stock')       return 'Country Stock';
    if (l === 'windhoek_warehouse')  return 'Windhoek WH';
    if (l === 'ondangwa_warehouse')  return 'Ondangwa WH';
    const bd = BRANCH_DETAILS.find(b => b.id === l || b.id === l.replace(/_branch$/, ''));
    return bd ? bd.name : (loc||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  };
  const locType = loc => {
    const l = (loc||'').toLowerCase();
    if (l === 'country_stock') return 'country';
    if (l.includes('warehouse')) return 'warehouse';
    return 'branch';
  };
  const locColor = loc => { const t = locType(loc); return t === 'country' ? '#6b7280' : t === 'warehouse' ? '#2563eb' : '#c41e3a'; };
  const locBg    = loc => { const t = locType(loc); return t === 'country' ? '#f3f4f6' : t === 'warehouse' ? '#eff6ff' : '#fff0f3'; };
  const daysLeft = d => { if (!d) return null; return Math.ceil((new Date(d) - Date.now()) / 86400000); };
  const expiryBadge = days => {
    if (days === null) return { label: 'No expiry', color: '#94a3b8', bg: '#f8fafc' };
    if (days <= 0)  return { label: 'EXPIRED',   color: '#dc2626', bg: '#fef2f2' };
    if (days <= 30) return { label: '< 30 days', color: '#dc2626', bg: '#fef2f2' };
    if (days <= 90) return { label: '< 90 days', color: '#d97706', bg: '#fffbeb' };
    return { label: 'Good', color: '#16a34a', bg: '#f0fdf4' };
  };
  const fmtDate = d => { try { return d ? new Date(d).toLocaleDateString('en-ZA',{day:'2-digit',month:'short',year:'numeric'}) : '—'; } catch { return d||'—'; } };
  const getCIF = name => getCIFPrice(name) || 0;
  const getDP  = name => { const p = getLiveProductList().find(p => p.description === name); return Number(p?.dp || 0); };

  const allBatches = rawBatches.map(b => ({
    id:           b.id,
    batch_no:     b.batch_no || b.batch_number || `B-${b.id}`,
    product_name: b.product_name || b.description || '—',
    original_qty: Number(b.quantity || 0),
    remaining:    Number(b.remaining_quantity ?? b.remainingQuantity ?? b.quantity ?? 0),
    consumed:     Math.max(0, Number(b.quantity||0) - Number(b.remaining_quantity ?? b.remainingQuantity ?? b.quantity ?? 0)),
    expiry_date:  b.expiry_date || null,
    location:     b.location || 'unknown',
    status:       (b.status || 'active').toLowerCase(),
    barcode:      b.barcode || null,
    cif:          Number(b.unit_price || b.cif_unit_cost || getCIF(b.product_name) || 0),
    dp:           Number(b.dpc_unit_value || getDP(b.product_name) || 0),
    created_at:   b.created_at,
  }));

  const branchFiltered = branch === 'all'
    ? allBatches
    : allBatches.filter(b => (b.location||'').toLowerCase().replace(/\s+/g,'_') === branch);

  const statusFiltered = branchFiltered.filter(b => {
    if (statusFilter === 'active')   return b.status !== 'depleted' && b.status !== 'written_off' && b.remaining > 0 && (daysLeft(b.expiry_date) === null || daysLeft(b.expiry_date) > 0);
    if (statusFilter === 'expired')  return daysLeft(b.expiry_date) !== null && daysLeft(b.expiry_date) <= 0;
    if (statusFilter === 'depleted') return b.remaining <= 0 || b.status === 'depleted';
    if (statusFilter === 'expiring') { const d = daysLeft(b.expiry_date); return d !== null && d > 0 && d <= 90; }
    return true;
  });

  const locFiltered = locFilter === 'all'
    ? statusFiltered
    : statusFiltered.filter(b => (b.location||'').toLowerCase() === locFilter);

  const filtered = !search ? locFiltered : locFiltered.filter(b =>
    b.product_name.toLowerCase().includes(search.toLowerCase()) ||
    b.batch_no.toLowerCase().includes(search.toLowerCase()) ||
    (b.barcode||'').toLowerCase().includes(search.toLowerCase())
  );

  const locSummary = {};
  statusFiltered.forEach(b => {
    const l = (b.location||'unknown').toLowerCase();
    if (!locSummary[l]) locSummary[l] = { loc: b.location, batches: 0, remaining: 0, cifValue: 0 };
    locSummary[l].batches++;
    locSummary[l].remaining += b.remaining;
    locSummary[l].cifValue  += b.remaining * b.cif;
  });
  const sortedLocs = Object.entries(locSummary).sort(([a], [b]) => {
    const order = { country_stock: 0, windhoek_warehouse: 1, ondangwa_warehouse: 2 };
    return (order[a] ?? 10) - (order[b] ?? 10);
  });

  const productMap = {};
  filtered.forEach(b => {
    if (!productMap[b.product_name]) productMap[b.product_name] = { name: b.product_name, batches: [], totalRemaining: 0, locations: {} };
    productMap[b.product_name].batches.push(b);
    productMap[b.product_name].totalRemaining += b.remaining;
    const lk = (b.location||'').toLowerCase();
    productMap[b.product_name].locations[lk] = (productMap[b.product_name].locations[lk] || 0) + b.remaining;
  });
  const productRows = Object.values(productMap).sort((a,b) => b.totalRemaining - a.totalRemaining);

  const totalBatches   = statusFiltered.length;
  const totalRemaining = statusFiltered.reduce((s,b) => s + b.remaining, 0);
  const expiredCount   = statusFiltered.filter(b => daysLeft(b.expiry_date) !== null && daysLeft(b.expiry_date) <= 0).length;
  const expiringCount  = statusFiltered.filter(b => { const d = daysLeft(b.expiry_date); return d !== null && d > 0 && d <= 90; }).length;
  const totalCIF       = statusFiltered.reduce((s,b) => s + b.remaining * b.cif, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.product_name || !form.quantity) { setAlert({ type:'error', msg:'Product and quantity are required' }); return; }
    try {
      await api.stock.createBatch({
        product_name:  form.product_name,
        quantity:      Number(form.quantity),
        batch_number:  `BATCH-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(rawBatches.length+1).padStart(3,'0')}`,
        expiry_date:   form.expiry_date || null,
        unit_price:    getCIF(form.product_name),
        location:      form.location,
      });
      setAlert({ type:'success', msg:'Batch created and saved' });
      setForm({ product_name:'', quantity:'', manufacture_date:'', expiry_date:'', location: branch && branch !== 'all' ? branch : 'country_stock' });
      setShowForm(false);
      load();
    } catch (err) { setAlert({ type:'error', msg: err.message }); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} onClose={() => setAlert(null)}>{alert.msg}</Alert>}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Batches',    value: totalBatches,                                  color: '#374151', bg: '#f8fafc',  border: '#e2e8f0' },
          { label: 'Total Units',      value: totalRemaining.toLocaleString(),                color: '#1d4ed8', bg: '#eff6ff',  border: '#bfdbfe' },
          { label: 'Expired Batches',  value: expiredCount,                                   color: expiredCount  > 0 ? '#dc2626' : '#374151', bg: expiredCount  > 0 ? '#fef2f2' : '#f8fafc', border: expiredCount  > 0 ? '#fecaca' : '#e2e8f0' },
          { label: '< 90 Days Expiry', value: expiringCount,                                  color: expiringCount > 0 ? '#d97706' : '#374151', bg: expiringCount > 0 ? '#fffbeb' : '#f8fafc', border: expiringCount > 0 ? '#fde68a' : '#e2e8f0' },
          { label: 'CIF Value (N$)',   value: `${Math.round(totalCIF).toLocaleString('en-ZA')}`, color: '#16a34a', bg: '#f0fdf4',  border: '#86efac' },
        ].map(s => (
          <div key={s.label} style={{ borderRadius: 10, padding: '11px 14px', background: s.bg, border: `1.5px solid ${s.border}` }}>
            <div style={{ fontSize: '1.45rem', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: '0.69rem', color: '#64748b', fontWeight: 700, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Location cards */}
      <div>
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Stock by Location — click to filter</div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setLocFilter('all')}
            style={{ padding: '6px 14px', borderRadius: 99, border: `2px solid ${locFilter === 'all' ? '#c41e3a' : '#e2e8f0'}`, background: locFilter === 'all' ? '#fff0f3' : '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', color: locFilter === 'all' ? '#c41e3a' : '#374151' }}>
            All Locations
          </button>
          {sortedLocs.map(([lk, s]) => (
            <button key={lk} onClick={() => setLocFilter(locFilter === lk ? 'all' : lk)}
              style={{ padding: '6px 14px', borderRadius: 99, border: `2px solid ${locFilter === lk ? locColor(lk) : '#e2e8f0'}`, background: locFilter === lk ? locBg(lk) : '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', color: locFilter === lk ? locColor(lk) : '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: locColor(lk), display: 'inline-block' }} />
              {fmtLoc(lk)}
              <span style={{ fontWeight: 900, color: locColor(lk) }}>{s.remaining.toLocaleString()}</span>
              <span style={{ fontSize: '0.63rem', color: '#94a3b8', fontWeight: 400 }}>units · {s.batches} batches</span>
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardBody>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary"
                placeholder="Search product, batch #, barcode…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:border-primary"
              value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="active">Active batches</option>
              <option value="expiring">Expiring &lt; 90d</option>
              <option value="expired">Expired</option>
              <option value="depleted">Depleted</option>
              <option value="all">All batches</option>
            </select>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
              {[['batch','By Batch'],['product','By Product']].map(([v,l]) => (
                <button key={v} onClick={() => setViewMode(v)}
                  style={{ padding: '6px 14px', fontWeight: 700, background: viewMode === v ? '#c41e3a' : '#fff', color: viewMode === v ? '#fff' : '#374151', border: 'none', cursor: 'pointer' }}>
                  {l}
                </button>
              ))}
            </div>
            <Button size="sm" variant="secondary" onClick={load}>↺ Refresh</Button>
            <Button size="sm" onClick={() => setShowForm(true)}><Plus size={14} /> New Batch</Button>
            <Button size="sm" variant="secondary" onClick={() => {
              if (viewMode === 'batch') {
                const rows = filtered.map(r => `<tr><td>${r.batch_no}</td><td>${r.product_name}</td><td>${fmtLoc(r.location)}</td><td>${r.remaining}</td><td>${r.consumed}</td><td>${r.original_qty}</td><td>${fmtDate(r.expiry_date)}</td><td>N$ ${Math.round(r.remaining*r.cif).toLocaleString()}</td></tr>`).join('');
                printDocument('Batch Location Tracking', `<table><thead><tr><th>Batch #</th><th>Product</th><th>Location</th><th>Remaining</th><th>Consumed</th><th>Original</th><th>Expiry</th><th>CIF Value</th></tr></thead><tbody>${rows}</tbody></table>`);
              } else {
                const rows = productRows.map(r => `<tr><td>${r.name}</td><td>${r.totalRemaining}</td><td>${Object.entries(r.locations).map(([l,q])=>fmtLoc(l)+': '+q).join(' | ')}</td></tr>`).join('');
                printDocument('Product Location Distribution', `<table><thead><tr><th>Product</th><th>Total Remaining</th><th>Locations</th></tr></thead><tbody>${rows}</tbody></table>`);
              }
            }}><Printer size={14} /> Print</Button>
          </div>
        </CardBody>
      </Card>

      {/* Batch Detail Modal */}
      {detail && (
        <Modal open={!!detail} onClose={() => setDetail(null)} title={`Batch Detail — ${detail.batch_no}`} size="md">
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Batch #',           detail.batch_no],
                ['Product',           detail.product_name],
                ['Current Location',  fmtLoc(detail.location)],
                ['Status',            detail.status],
                ['Original Qty',      detail.original_qty.toLocaleString()],
                ['Remaining Qty',     detail.remaining.toLocaleString()],
                ['Consumed',          detail.consumed.toLocaleString()],
                ['Utilisation',       detail.original_qty > 0 ? `${Math.round(detail.consumed/detail.original_qty*100)}%` : '—'],
                ['CIF Unit',          detail.cif > 0 ? `N$ ${detail.cif.toFixed(2)}` : '—'],
                ['DP Unit',           detail.dp  > 0 ? `N$ ${detail.dp.toFixed(2)}`  : '—'],
                ['CIF Value (rem)',   detail.cif > 0 ? `N$ ${Math.round(detail.remaining*detail.cif).toLocaleString('en-ZA')}` : '—'],
                ['Barcode',           detail.barcode || 'Not assigned'],
                ['Expiry Date',       fmtDate(detail.expiry_date)],
                ['Days to Expiry',    daysLeft(detail.expiry_date) !== null ? `${daysLeft(detail.expiry_date)} days` : '—'],
                ['Imported',          fmtDate(detail.created_at)],
              ].map(([k, v]) => (
                <div key={k} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 12px' }}>
                  <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{k}</div>
                  <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e293b', marginTop: 1 }}>{v}</div>
                </div>
              ))}
            </div>
            {detail.original_qty > 0 && (
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Remaining: {detail.remaining} / {detail.original_qty}</span>
                  <span>{Math.round(detail.remaining/detail.original_qty*100)}% left</span>
                </div>
                <div style={{ height: 8, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.max(1,Math.round(detail.remaining/detail.original_qty*100))}%`, background: detail.remaining/detail.original_qty < 0.15 ? '#dc2626' : detail.remaining/detail.original_qty < 0.35 ? '#d97706' : '#16a34a', borderRadius: 99 }} />
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Main table */}
      {viewMode === 'batch' ? (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center flex-wrap gap-2">
              <h3 className="font-bold text-gray-800">
                Batch Location Tracker
                <span className="text-xs font-normal text-gray-400 ml-2">({filtered.length} batch{filtered.length !== 1 ? 'es' : ''})</span>
              </h3>
              <div className="text-xs text-gray-400">Click any row to view full detail</div>
            </div>
          </CardHeader>
          {filtered.length === 0 ? (
            <CardBody><EmptyState icon={<Package size={40} />} title="No batches found" description="Adjust the location or status filter above" /></CardBody>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#fef2f2', borderBottom: '2px solid #fecaca' }}>
                    {['Batch #','Product','Current Location','Original','Remaining','Consumed','Utilisation','CIF Value','Expiry','Status'].map(h => (
                      <th key={h} style={{ padding: '9px 11px', textAlign:'left', fontWeight:700, color:'#475569', fontSize:'0.71rem', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b, i) => {
                    const days = daysLeft(b.expiry_date);
                    const eb   = expiryBadge(days);
                    const pct  = b.original_qty > 0 ? Math.round(b.remaining / b.original_qty * 100) : 0;
                    const cifVal = b.remaining * b.cif;
                    return (
                      <tr key={b.id || i} onClick={() => setDetail(b)}
                        style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb', borderBottom:'1px solid #f1f5f9', cursor:'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.background='#fef2f2'}
                        onMouseLeave={e => e.currentTarget.style.background=i%2===0?'#fff':'#f9fafb'}>
                        <td style={{ padding:'9px 11px', fontFamily:'monospace', fontSize:'0.73rem', fontWeight:700, color:'#6b21a8', whiteSpace:'nowrap' }}>{b.batch_no}</td>
                        <td style={{ padding:'9px 11px', fontWeight:700, color:'#1e293b', maxWidth:180 }}>
                          <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={b.product_name}>{b.product_name}</div>
                        </td>
                        <td style={{ padding:'9px 11px' }}>
                          <span style={{ background:locBg(b.location), color:locColor(b.location), borderRadius:99, padding:'3px 9px', fontWeight:800, fontSize:'0.7rem', whiteSpace:'nowrap', border:`1px solid ${locColor(b.location)}30` }}>
                            <span style={{ width:6, height:6, borderRadius:'50%', background:locColor(b.location), display:'inline-block', marginRight:4, verticalAlign:'middle' }} />
                            {fmtLoc(b.location)}
                          </span>
                        </td>
                        <td style={{ padding:'9px 11px', color:'#94a3b8' }}>{b.original_qty.toLocaleString()}</td>
                        <td style={{ padding:'9px 11px', fontWeight:900, color: b.remaining <= 0 ? '#dc2626' : b.remaining < 10 ? '#d97706' : '#16a34a' }}>{b.remaining.toLocaleString()}</td>
                        <td style={{ padding:'9px 11px', color:'#94a3b8' }}>{b.consumed.toLocaleString()}</td>
                        <td style={{ padding:'9px 11px', minWidth:90 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                            <div style={{ flex:1, height:6, background:'#f1f5f9', borderRadius:99, overflow:'hidden' }}>
                              <div style={{ height:'100%', width:`${pct}%`, background: pct<15?'#dc2626':pct<35?'#d97706':'#16a34a', borderRadius:99 }} />
                            </div>
                            <span style={{ fontSize:'0.68rem', color:'#64748b', fontWeight:700, minWidth:28, textAlign:'right' }}>{pct}%</span>
                          </div>
                        </td>
                        <td style={{ padding:'9px 11px', fontWeight:700, color:'#374151' }}>{cifVal > 0 ? `N$ ${Math.round(cifVal).toLocaleString('en-ZA')}` : '—'}</td>
                        <td style={{ padding:'9px 11px', whiteSpace:'nowrap', fontWeight: days !== null && days <= 30 ? 700 : 400, color: days !== null && days <= 30 ? '#dc2626' : '#374151' }}>
                          {fmtDate(b.expiry_date)}
                          {days !== null && days > 0 && days <= 30 && <div style={{ fontSize:'0.65rem', color:'#dc2626' }}>{days}d left</div>}
                        </td>
                        <td style={{ padding:'9px 11px' }}>
                          <span style={{ background:eb.bg, color:eb.color, borderRadius:99, padding:'2px 8px', fontSize:'0.69rem', fontWeight:800, whiteSpace:'nowrap' }}>{eb.label}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <h3 className="font-bold text-gray-800">
              Product Location Distribution
              <span className="text-xs font-normal text-gray-400 ml-2">({productRows.length} product{productRows.length !== 1 ? 's' : ''})</span>
            </h3>
          </CardHeader>
          {productRows.length === 0 ? (
            <CardBody><EmptyState icon={<Package size={40} />} title="No products found" description="Adjust filters above" /></CardBody>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#fef2f2', borderBottom: '2px solid #fecaca' }}>
                    {['Product','Total Remaining','Location Breakdown','Batches','Earliest Expiry','Total CIF Value'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign:'left', fontWeight:700, color:'#475569', fontSize:'0.71rem', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {productRows.map((p, i) => {
                    const earliest = p.batches.filter(b=>b.expiry_date).sort((a,b)=>new Date(a.expiry_date)-new Date(b.expiry_date))[0];
                    const totalCIF = p.batches.reduce((s,b) => s + b.remaining * b.cif, 0);
                    const days = earliest ? daysLeft(earliest.expiry_date) : null;
                    return (
                      <tr key={p.name} style={{ background: i%2===0?'#fff':'#f9fafb', borderBottom:'1px solid #f1f5f9' }}>
                        <td style={{ padding:'10px 12px', fontWeight:800, color:'#1e293b', maxWidth:200 }}>
                          <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={p.name}>{p.name}</div>
                        </td>
                        <td style={{ padding:'10px 12px', fontWeight:900, color:'#1d4ed8', fontSize:'0.9rem' }}>{p.totalRemaining.toLocaleString()}</td>
                        <td style={{ padding:'10px 12px' }}>
                          <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                            {Object.entries(p.locations).sort(([,a],[,b])=>b-a).map(([lk, qty]) => (
                              <span key={lk} style={{ background:locBg(lk), color:locColor(lk), border:`1px solid ${locColor(lk)}30`, borderRadius:99, padding:'2px 8px', fontSize:'0.69rem', fontWeight:800, whiteSpace:'nowrap' }}>
                                <span style={{ width:5, height:5, borderRadius:'50%', background:locColor(lk), display:'inline-block', marginRight:3, verticalAlign:'middle' }} />
                                {fmtLoc(lk)} · {qty.toLocaleString()}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding:'10px 12px', color:'#64748b' }}>{p.batches.length}</td>
                        <td style={{ padding:'10px 12px', whiteSpace:'nowrap', fontWeight: days !== null && days <= 30 ? 700 : 400, color: days !== null && days <= 30 ? '#dc2626' : '#374151' }}>
                          {earliest ? fmtDate(earliest.expiry_date) : '—'}
                          {days !== null && days > 0 && days <= 30 && <div style={{ fontSize:'0.65rem', color:'#dc2626' }}>{days}d left</div>}
                          {days !== null && days <= 0 && <div style={{ fontSize:'0.65rem', color:'#dc2626', fontWeight:800 }}>EXPIRED</div>}
                        </td>
                        <td style={{ padding:'10px 12px', fontWeight:700, color:'#374151' }}>{totalCIF > 0 ? `N$ ${Math.round(totalCIF).toLocaleString('en-ZA')}` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* New Batch Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="New Batch" size="md">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Product</label>
            <select className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary"
              value={form.product_name} onChange={e => setForm(f=>({...f,product_name:e.target.value}))} required>
              <option value="">Select product…</option>
              {getLiveProductList().map(p => <option key={p.description} value={p.description}>{p.description}</option>)}
            </select>
          </div>
          <Input label="Quantity" type="number" min="1" value={form.quantity} onChange={e => setForm(f=>({...f,quantity:e.target.value}))} required />
          <Input label="Manufacture Date" type="date" value={form.manufacture_date} onChange={e => setForm(f=>({...f,manufacture_date:e.target.value}))} />
          <Input label="Expiry Date" type="date" value={form.expiry_date} onChange={e => setForm(f=>({...f,expiry_date:e.target.value}))} />
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Location</label>
            <select className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:border-primary"
              value={form.location} onChange={e => setForm(f=>({...f,location:e.target.value}))}>
              <optgroup label="Staging"><option value="country_stock">Country Stock (Staging)</option></optgroup>
              <optgroup label="Warehouses">
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

// ── Write-Offs Tab ─────────────────────────────────────────────────────────────
const REASON_CONFIG = {
  'Expired':            { color: '#b45309', bg: '#fffbeb', border: '#fde68a',  badge: '#f59e0b', label: 'Expired',              icon: '⏰', needsDisposal: true,  redistribution: false },
  'Damaged':            { color: '#dc2626', bg: '#fef2f2', border: '#fecaca',  badge: '#dc2626', label: 'Damaged',              icon: '💥', needsDisposal: true,  redistribution: false },
  'Damaged in storage': { color: '#dc2626', bg: '#fef2f2', border: '#fecaca',  badge: '#dc2626', label: 'Damaged',              icon: '💥', needsDisposal: true,  redistribution: false },
  'Contaminated':       { color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe',  badge: '#7c3aed', label: 'Contaminated',         icon: '☣️', needsDisposal: true,  redistribution: false },
  'Theft':              { color: '#374151', bg: '#f9fafb', border: '#e5e7eb',  badge: '#374151', label: 'Theft / Loss',         icon: '🚨', needsDisposal: false, redistribution: false },
  'Theft / Loss':       { color: '#374151', bg: '#f9fafb', border: '#e5e7eb',  badge: '#374151', label: 'Theft / Loss',         icon: '🚨', needsDisposal: false, redistribution: false },
  'Quality failure':    { color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd',  badge: '#0369a1', label: 'Quality / Recall',     icon: '🔬', needsDisposal: true,  redistribution: false },
  'Quality / Recall':   { color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd',  badge: '#0369a1', label: 'Quality / Recall',     icon: '🔬', needsDisposal: true,  redistribution: false },
  'Redistribution':     { color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc',  badge: '#0891b2', label: 'Redistribution',       icon: '🔄', needsDisposal: false, redistribution: true  },
  'Other':              { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb',  badge: '#6b7280', label: 'Other',                icon: '📋', needsDisposal: false, redistribution: false },
};
const DEFAULT_REASON_CFG = { color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb', badge: '#6b7280', label: 'Other', icon: '📋', needsDisposal: false };

function getReasonCfg(reason) {
  if (!reason) return DEFAULT_REASON_CFG;
  return REASON_CONFIG[reason] || Object.entries(REASON_CONFIG).find(([k]) => reason.toLowerCase().includes(k.toLowerCase()))?.[1] || DEFAULT_REASON_CFG;
}

function WriteOffsTab({ branch }) {
  const { user } = useAuth();
  const [movements, setMovements]   = useState([]);
  const [batches, setBatches]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [alert, setAlert]           = useState(null);
  const [showForm, setShowForm]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [disposing, setDisposing]   = useState({});
  const [search, setSearch]         = useState('');
  const [historyView, setHistoryView] = useState('pending');
  const emptyItem = () => ({ product_name: '', batch_id: '', quantity: '' });
  const [form, setForm]             = useState({
    reason: '', notes: '', location: '', target_location: '',
    items: [emptyItem()],
  });

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.stock.movements('limit=2000').then(d => Array.isArray(d) ? d : d.movements || []).catch(() => []),
      api.stock.batches().then(d => Array.isArray(d) ? d : d.batches || []).catch(() => []),
      branch && branch !== 'all'
        ? api.get(`/branch/inventory?branchId=${encodeURIComponent(branch)}`).then(d => Array.isArray(d) ? d : d.inventory || d.batches || []).catch(() => [])
        : Promise.resolve([]),
    ]).then(([mvs, centralBts, branchBts]) => {
      setMovements(mvs);
      const branchMapped = branchBts.map(b => ({
        ...b,
        id: b.id || `bib-${b.batch_no || b.batchNo}-${b.branch_id || branch}`,
        product_name: b.product_name || b.description,
        batch_no: b.batch_no || b.batchNo || b.batch_number,
        batch_number: b.batch_no || b.batchNo || b.batch_number,
        location: b.location || b.branch_id || branch,
        remaining_quantity: b.remaining_quantity ?? b.quantity ?? 0,
        status: b.status || 'in_stock',
      }));
      setBatches([...centralBts, ...branchMapped]);
    }).finally(() => setLoading(false));
  }, [branch]);
  useEffect(() => { load(); }, [load]);

  const writeoffs = movements.filter(m => {
    const t = (m.movement_type || '').toLowerCase();
    const isWO = t === 'write_off' || t === 'write-off' || t === 'written_off';
    if (!isWO) return false;
    if (branch === 'all') return true;
    const loc = (m.source_location || m.location || '').toLowerCase().replace(/\s+/g, '_');
    return loc === branch;
  }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Separate pending disposal vs disposed vs returned to warehouse
  // dispose_off = expired batches, need physical disposal at branch
  // returned_to_warehouse = non-expired, already re-credited to warehouse automatically
  const pendingDisposal = writeoffs.filter(m => m.disposal_status === 'pending_disposal' || m.disposal_status === 'dispose_off');
  const disposedItems   = writeoffs.filter(m => m.disposal_status === 'disposed');
  const returnedItems   = writeoffs.filter(m => m.disposal_status === 'returned_to_warehouse');
  const allHistory      = writeoffs;

  const filtered = search.trim()
    ? (historyView === 'pending' ? pendingDisposal : historyView === 'disposed' ? disposedItems : allHistory)
        .filter(m => (m.product_name || '').toLowerCase().includes(search.toLowerCase()) || (m.notes || '').toLowerCase().includes(search.toLowerCase()) || (m.write_off_reason || '').toLowerCase().includes(search.toLowerCase()))
    : (historyView === 'pending' ? pendingDisposal : historyView === 'disposed' ? disposedItems : allHistory);

  const totalQty  = writeoffs.reduce((s, m) => s + Number(m.quantity || 0), 0);
  const totalCIF  = writeoffs.reduce((s, m) => s + Number(m.quantity || 0) * getCIFPrice(m.product_name || ''), 0);

  // Group pending disposal by reason
  const pendingByReason = pendingDisposal.reduce((acc, m) => {
    const r = m.write_off_reason || (m.notes ? m.notes.split(' — ')[0] : null) || 'Other';
    if (!acc[r]) acc[r] = [];
    acc[r].push(m);
    return acc;
  }, {});

  const activeBatches = batches.filter(b => {
    const rem = Number(b.remaining_quantity ?? b.quantity ?? 0);
    const st  = (b.status || '').toLowerCase();
    const ok  = rem > 0 && st !== 'expired' && st !== 'depleted' && st !== 'written_off';
    if (!ok) return false;
    if (branch === 'all') return true;
    return (b.location || '').toLowerCase().replace(/\s+/g, '_') === branch;
  });

  // Item-level helpers
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, emptyItem()] }));
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  const updateItem = (idx, field, val) => setForm(f => ({
    ...f,
    items: f.items.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: val };
      if (field === 'batch_id') {
        const b = batches.find(b => String(b.id) === val);
        updated.product_name = b?.product_name || b?.description || item.product_name;
      }
      if (field === 'product_name') updated.batch_id = '';
      return updated;
    }),
  }));
  const getBatch = (item) => batches.find(b => String(b.id) === String(item.batch_id));
  const getMaxQty = (item) => {
    const b = getBatch(item);
    return b ? Number(b.remaining_quantity ?? b.quantity ?? 0) : 0;
  };

  const handleDispose = async (id) => {
    setDisposing(d => ({ ...d, [id]: true }));
    try {
      await api.stock.disposeWriteoff(id, { disposed_by: user?.full_name || user?.username });
      setAlert({ type: 'success', msg: 'Item marked as disposed.' });
      load();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message || 'Failed to mark disposed' });
    } finally {
      setDisposing(d => ({ ...d, [id]: false }));
    }
  };

  const handleDisposeAll = async (reason) => {
    const ids = pendingByReason[reason]?.map(m => m.id) || [];
    if (!ids.length) return;
    setDisposing(d => ({ ...d, [`group_${reason}`]: true }));
    try {
      await api.stock.disposeAllWriteoffs(ids, { disposed_by: user?.full_name || user?.username });
      setAlert({ type: 'success', msg: `All ${reason} items marked as disposed.` });
      load();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message || 'Failed to dispose group' });
    } finally {
      setDisposing(d => ({ ...d, [`group_${reason}`]: false }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.reason) { setAlert({ type: 'error', msg: 'Reason is required' }); return; }
    const isRedistrib = woIsRedistrib;
    if (isRedistrib && !form.target_location) { setAlert({ type: 'error', msg: 'Select the target location for redistribution' }); return; }
    const validItems = form.items.filter(it => it.product_name && Number(it.quantity) > 0);
    if (!validItems.length) { setAlert({ type: 'error', msg: 'Add at least one product with a quantity greater than zero' }); return; }
    for (const it of validItems) {
      const mxq = getMaxQty(it);
      if (mxq > 0 && Number(it.quantity) > mxq) {
        setAlert({ type: 'error', msg: `Cannot write off more than available stock (${mxq}) for ${it.product_name}` });
        return;
      }
    }
    const needsLocation = validItems.every(it => !getBatch(it)?.location) && !form.location;
    if (needsLocation && branch === 'all') { setAlert({ type: 'error', msg: 'Select the location written off from' }); return; }
    setSubmitting(true);
    const batchRef = `WO-${Date.now().toString(36).toUpperCase()}`;
    try {
      for (const it of validItems) {
        const sel = getBatch(it);
        await api.stock.createMovement({
          product_name:      it.product_name,
          movement_type:     'write_off',
          quantity:          Number(it.quantity),
          source_location:   sel?.location || form.location || (branch !== 'all' ? branch : ''),
          batch_no:          sel?.batch_no || sel?.batch_number || null,
          reason:            form.reason,
          write_off_reason:  form.reason,
          notes:             `${form.reason}${isRedistrib ? ` → ${form.target_location}` : ''}${form.notes ? ' — ' + form.notes : ''}`,
          created_by:        user?.full_name || user?.username,
          reference:         batchRef,
        });
        if (sel && Number(it.quantity) >= getMaxQty(it)) {
          await api.stock.updateBatch(sel.id, { status: 'written_off' });
        }
      }
      const productList = validItems.map(it => `${Number(it.quantity)} × ${it.product_name}`).join(', ');
      setAlert({
        type: 'success',
        msg: isRedistrib
          ? `Redistribution recorded: ${productList} — stock removed from source, pending receipt at ${form.target_location}.`
          : `Write-off recorded: ${productList} — ${validItems.length > 1 ? 'items' : 'item'} awaiting disposal confirmation.`,
      });
      setForm({ reason: '', notes: '', location: '', target_location: '', items: [emptyItem()] });
      setShowForm(false);
      load();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message || 'Failed to record write-off' });
    } finally { setSubmitting(false); }
  };

  const fmtDate = ts => { try { return ts ? new Date(ts).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; } catch { return '—'; } };
  const fmtLoc  = loc => {
    const l = (loc || '').toLowerCase();
    if (l === 'country_stock') return 'Country Stock';
    if (l === 'windhoek_warehouse') return 'Windhoek WH';
    if (l === 'ondangwa_warehouse') return 'Ondangwa WH';
    const bd = BRANCH_DETAILS.find(b => b.id === l);
    return bd ? bd.name : (loc || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const productOptions = [...new Set(activeBatches.map(b => b.product_name || b.description).filter(Boolean))].sort();
  const woIsRedistrib = getReasonCfg(form.reason).redistribution;
  const woShowLocationPicker = !form.items.every(it => getBatch(it)?.location) && branch === 'all';

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {alert && <Alert type={alert.type} onClose={() => setAlert(null)}>{alert.msg}</Alert>}

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#7f1d1d,#991b1b)', borderRadius: 14, padding: '14px 20px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontWeight: 900, fontSize: '1.05rem', margin: 0 }}>Stock Write-Offs & Disposal</h3>
          <p style={{ fontSize: '0.78rem', opacity: 0.85, margin: '3px 0 0' }}>
            Written-off stock is quarantined here · Stock managers must confirm physical disposal · Does not count as operational stock
          </p>
        </div>
        <Button onClick={() => setShowForm(s => !s)} style={{ background: '#fff', color: '#991b1b' }}>
          {showForm ? '✕ Cancel' : '+ New Write-Off'}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Pending Disposal', value: pendingDisposal.length, color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
          { label: 'Disposed', value: disposedItems.length, color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
          { label: 'Total Units Written Off', value: totalQty.toLocaleString(), color: '#9b1c1c', bg: '#fef2f2', border: '#fecaca' },
          { label: 'CIF Value Lost', value: formatCurrency(totalCIF), color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
        ].map(s => (
          <div key={s.label} style={{ borderRadius: 10, padding: '12px 16px', background: s.bg, border: `1.5px solid ${s.border}` }}>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 700, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Pending Disposal Banner */}
      {pendingDisposal.length > 0 && (
        <div style={{ background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: 12, padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: '1.1rem' }}>⚠️</span>
            <strong style={{ color: '#92400e', fontSize: '0.95rem' }}>{pendingDisposal.length} item{pendingDisposal.length !== 1 ? 's' : ''} awaiting physical disposal</strong>
            <span style={{ fontSize: '0.75rem', color: '#92400e', opacity: 0.8 }}>— These are NOT part of operational stock</span>
          </div>

          {/* Grouped by reason */}
          <div className="space-y-3">
            {Object.entries(pendingByReason).map(([reason, items]) => {
              const cfg = getReasonCfg(reason);
              const groupQty = items.reduce((s, m) => s + Number(m.quantity || 0), 0);
              const groupCIF = items.reduce((s, m) => s + Number(m.quantity || 0) * getCIFPrice(m.product_name || ''), 0);
              const isDisposingGroup = disposing[`group_${reason}`];
              return (
                <div key={reason} style={{ background: cfg.bg, border: `1.5px solid ${cfg.border}`, borderRadius: 10, overflow: 'hidden' }}>
                  {/* Group header */}
                  <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, borderBottom: `1px solid ${cfg.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '1rem' }}>{cfg.icon}</span>
                      <span style={{ fontWeight: 700, color: cfg.color, fontSize: '0.88rem' }}>{cfg.label}</span>
                      <span style={{ background: cfg.badge, color: '#fff', borderRadius: 9999, padding: '1px 8px', fontSize: '0.72rem', fontWeight: 700 }}>{items.length} item{items.length !== 1 ? 's' : ''} · {groupQty} units</span>
                      <span style={{ fontSize: '0.75rem', color: cfg.color, opacity: 0.8 }}>CIF: {formatCurrency(groupCIF)}</span>
                    </div>
                    {cfg.needsDisposal && (
                      <button
                        onClick={() => handleDisposeAll(reason)}
                        disabled={isDisposingGroup}
                        style={{ padding: '5px 14px', fontSize: '0.78rem', fontWeight: 700, background: cfg.color, color: '#fff', border: 'none', borderRadius: 7, cursor: isDisposingGroup ? 'not-allowed' : 'pointer', opacity: isDisposingGroup ? 0.6 : 1 }}
                      >
                        {isDisposingGroup ? 'Disposing…' : `Dispose All ${cfg.label}`}
                      </button>
                    )}
                  </div>
                  {/* Item rows */}
                  <div>
                    {items.map((m, i) => (
                      <div key={m.id || i} style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', borderBottom: i < items.length - 1 ? `1px solid ${cfg.border}` : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontWeight: 700, color: '#111827', fontSize: '0.85rem' }}>{m.product_name}</span>
                          {m.batch_no && <span style={{ marginLeft: 6, fontFamily: 'monospace', fontSize: '0.75rem', color: '#6b7280' }}>({m.batch_no})</span>}
                          <span style={{ marginLeft: 8, color: cfg.color, fontWeight: 700, fontSize: '0.82rem' }}>{Number(m.quantity || 0)} units</span>
                          <span style={{ marginLeft: 8, color: '#6b7280', fontSize: '0.75rem' }}>{fmtLoc(m.source_location || m.location)}</span>
                          {m.notes && <span style={{ marginLeft: 8, color: '#9ca3af', fontSize: '0.73rem' }}>· {m.notes}</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          <span style={{ fontSize: '0.73rem', color: '#9ca3af' }}>{fmtDate(m.created_at)}</span>
                          {cfg.needsDisposal ? (
                            <button
                              onClick={() => handleDispose(m.id)}
                              disabled={disposing[m.id]}
                              style={{ padding: '4px 12px', fontSize: '0.75rem', fontWeight: 700, background: cfg.color, color: '#fff', border: 'none', borderRadius: 6, cursor: disposing[m.id] ? 'not-allowed' : 'pointer', opacity: disposing[m.id] ? 0.6 : 1 }}
                            >
                              {disposing[m.id] ? '…' : 'Confirm Disposed'}
                            </button>
                          ) : cfg.redistribution ? (
                            <span style={{ padding: '3px 10px', fontSize: '0.73rem', color: '#0891b2', background: '#ecfeff', borderRadius: 6, fontWeight: 600, border: '1px solid #a5f3fc' }}>
                              🔄 Pending receipt at {(m.notes || '').match(/→\s*(.+?)(\s*—|$)/)?.[1] || 'target location'}
                            </span>
                          ) : (
                            <span style={{ padding: '3px 10px', fontSize: '0.73rem', color: '#6b7280', background: '#f3f4f6', borderRadius: 6, fontWeight: 600 }}>No disposal needed</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* New Write-Off Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 className="font-bold text-gray-800">Record New Write-Off</h4>
              <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>You can write off multiple products at once</span>
            </div>
          </CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-4" data-testid="writeoff-multi-form" aria-label="Multi-item Write-Off Form">

              {/* Shared: Reason, Location, Notes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Reason for Write-Off *</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.reason}
                    onChange={e => setForm(f => ({ ...f, reason: e.target.value, target_location: '' }))}>
                    <option value="">Select reason...</option>
                    <option value="Expired">Expired</option>
                    <option value="Damaged">Damaged in storage</option>
                    <option value="Contaminated">Contaminated</option>
                    <option value="Theft">Theft / Loss</option>
                    <option value="Quality failure">Quality / Recall</option>
                    <option value="Redistribution">Redistribution (Return for redistribution)</option>
                    <option value="Other">Other</option>
                  </select>
                  {woIsRedistrib && (
                    <p style={{ fontSize: '0.75rem', color: '#0891b2', marginTop: 4 }}>
                      🔄 Stock will be removed from source and flagged for receipt at the target location below.
                    </p>
                  )}
                </div>

                {woIsRedistrib && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Target Location (where stock will be received) *</label>
                    <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.target_location}
                      onChange={e => setForm(f => ({ ...f, target_location: e.target.value }))}>
                      <option value="">Select destination…</option>
                      <optgroup label="Country Stock">
                        <option value="Country Stock">Country Stock (Staging)</option>
                      </optgroup>
                      <optgroup label="Warehouses">
                        <option value="Windhoek Warehouse">Windhoek Warehouse</option>
                        <option value="Ondangwa Warehouse">Ondangwa Warehouse</option>
                      </optgroup>
                      <optgroup label="Branches">
                        {BRANCH_DETAILS.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                      </optgroup>
                    </select>
                  </div>
                )}

                {woShowLocationPicker && (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Default Source Location *</label>
                    <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" value={form.location}
                      onChange={e => setForm(f => ({ ...f, location: e.target.value }))}>
                      <option value="">Select location…</option>
                      <optgroup label="Country Stock">
                        <option value="country_stock">Country Stock (Staging)</option>
                      </optgroup>
                      <optgroup label="Warehouses">
                        <option value="windhoek_warehouse">Windhoek Warehouse</option>
                        <option value="ondangwa_warehouse">Ondangwa Warehouse</option>
                      </optgroup>
                      <optgroup label="Branches">
                        {BRANCH_DETAILS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </optgroup>
                    </select>
                  </div>
                )}
              </div>

              {/* Multi-item rows */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="block text-sm font-semibold text-gray-700">Products to Write Off *</label>
                  <button type="button" onClick={addItem}
                    style={{ fontSize: '0.78rem', fontWeight: 700, color: '#991b1b', background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 7, padding: '4px 12px', cursor: 'pointer' }}>
                    + Add Product
                  </button>
                </div>

                <div className="space-y-2">
                  {form.items.map((item, idx) => {
                    const batchesForProduct = activeBatches.filter(b => !item.product_name || (b.product_name || b.description) === item.product_name);
                    const mxq = getMaxQty(item);
                    return (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 90px 36px', gap: 6, alignItems: 'end', background: '#fafafa', borderRadius: 8, padding: '8px 10px', border: '1px solid #e5e7eb' }}>
                        <div>
                          {idx === 0 && <label className="block text-xs font-semibold text-gray-500 mb-1">Product</label>}
                          <select className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" value={item.product_name}
                            onChange={e => updateItem(idx, 'product_name', e.target.value)}>
                            <option value="">Select product…</option>
                            {productOptions.map(n => <option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                        <div>
                          {idx === 0 && <label className="block text-xs font-semibold text-gray-500 mb-1">Batch (optional)</label>}
                          <select className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" value={item.batch_id}
                            onChange={e => updateItem(idx, 'batch_id', e.target.value)}>
                            <option value="">No specific batch</option>
                            {batchesForProduct.map(b => (
                              <option key={b.id} value={b.id}>
                                {b.batch_no || b.batch_number || `B-${b.id}`} · {Number(b.remaining_quantity ?? b.quantity ?? 0)} units
                                {b.expiry_date ? ` · Exp ${new Date(b.expiry_date).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          {idx === 0 && <label className="block text-xs font-semibold text-gray-500 mb-1">Qty{mxq > 0 ? ` (max ${mxq})` : ''}</label>}
                          <input type="number" min="1" max={mxq > 0 ? mxq : undefined} value={item.quantity}
                            onChange={e => updateItem(idx, 'quantity', e.target.value)}
                            placeholder="0"
                            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center" />
                        </div>
                        <div style={{ display: 'flex', alignItems: idx === 0 ? 'flex-end' : 'center', paddingBottom: idx === 0 ? 0 : 0 }}>
                          <button type="button" onClick={() => removeItem(idx)}
                            disabled={form.items.length === 1}
                            style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #fecaca', background: form.items.length === 1 ? '#f9fafb' : '#fef2f2', color: form.items.length === 1 ? '#d1d5db' : '#dc2626', cursor: form.items.length === 1 ? 'not-allowed' : 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Running total */}
                {form.items.some(it => it.product_name && Number(it.quantity) > 0) && (
                  <div style={{ marginTop: 8, padding: '6px 12px', background: '#fef2f2', borderRadius: 7, fontSize: '0.8rem', color: '#7f1d1d', fontWeight: 600 }}>
                    Total: {form.items.reduce((s, it) => s + Number(it.quantity || 0), 0)} units across {form.items.filter(it => it.product_name && Number(it.quantity) > 0).length} product{form.items.filter(it => it.product_name && Number(it.quantity) > 0).length !== 1 ? 's' : ''}
                    {' '}· CIF: {formatCurrency(form.items.reduce((s, it) => s + Number(it.quantity || 0) * getCIFPrice(it.product_name || ''), 0))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Additional Notes</label>
                <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any additional context..." />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Saving...' : woIsRedistrib ? `Record Redistribution (${form.items.filter(it => it.product_name).length} product${form.items.filter(it => it.product_name).length !== 1 ? 's' : ''})` : `Record Write-Off (${form.items.filter(it => it.product_name).length} product${form.items.filter(it => it.product_name).length !== 1 ? 's' : ''})`}
                </Button>
                <Button type="button" variant="secondary" onClick={() => { setShowForm(false); setForm({ reason: '', notes: '', location: '', target_location: '', items: [emptyItem()] }); }}>Cancel</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {/* History & Audit Log */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-bold text-gray-800">Write-Off Audit Log</h4>
              {[
                { key: 'pending', label: `Pending Disposal (${pendingDisposal.length})` },
                { key: 'disposed', label: `Disposed (${disposedItems.length})` },
                { key: 'all', label: `All (${allHistory.length})` },
              ].map(tab => (
                <button key={tab.key} onClick={() => setHistoryView(tab.key)}
                  style={{ padding: '4px 12px', fontSize: '0.78rem', fontWeight: 700, borderRadius: 20, border: 'none', cursor: 'pointer',
                    background: historyView === tab.key ? '#991b1b' : '#f1f5f9',
                    color: historyView === tab.key ? '#fff' : '#374151' }}>
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="pl-7 pr-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/20"
                placeholder="Search product, reason, or notes..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {filtered.length === 0 ? (
            <EmptyState icon={<XCircle size={32} />} title={historyView === 'pending' ? 'No items awaiting disposal' : historyView === 'disposed' ? 'No disposed items yet' : 'No write-offs recorded'}
              description={historyView === 'pending' ? 'When stock is written off it will appear here awaiting physical disposal confirmation.' : 'Confirmed disposals will appear here.'} />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr style={{ background: '#fef2f2' }}>
                    {['Date', 'Product', 'Batch', 'Branch / Location', 'Reason', 'Qty', 'CIF Value', 'Status', 'Recorded By'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#7f1d1d', borderBottom: '1.5px solid #fecaca', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m, i) => {
                    const qty = Number(m.quantity || 0);
                    const cif = qty * getCIFPrice(m.product_name || '');
                    const reason = m.write_off_reason || (m.notes ? m.notes.split(' — ')[0] : null) || '—';
                    const cfg = getReasonCfg(reason);
                    const isDisposed = m.disposal_status === 'disposed';
                    const isPending  = m.disposal_status === 'pending_disposal';
                    return (
                      <tr key={m.id || i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: '1px solid #f1f5f9', opacity: isDisposed ? 0.75 : 1 }}>
                        <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: '#374151' }}>{fmtDate(m.created_at)}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 600, color: '#111827' }}>{m.product_name || '—'}</td>
                        <td style={{ padding: '8px 12px', color: '#6b7280', fontFamily: 'monospace', fontSize: '0.75rem' }}>{m.batch_no || '—'}</td>
                        <td style={{ padding: '8px 12px' }}><span style={{ padding: '2px 8px', borderRadius: 6, background: '#eff6ff', color: '#1d4ed8', fontSize: '0.75rem', fontWeight: 600 }}>{fmtLoc(m.source_location || m.location)}</span></td>
                        <td style={{ padding: '8px 12px' }}>
                          <span style={{ padding: '2px 8px', borderRadius: 6, background: cfg.bg, color: cfg.color, fontSize: '0.72rem', fontWeight: 700, border: `1px solid ${cfg.border}` }}>
                            {cfg.icon} {cfg.label !== 'Other' ? cfg.label : reason}
                          </span>
                        </td>
                        <td style={{ padding: '8px 12px', fontWeight: 700, color: '#dc2626' }}>{qty.toLocaleString()}</td>
                        <td style={{ padding: '8px 12px', color: '#b45309', fontWeight: 600 }}>{formatCurrency(cif)}</td>
                        <td style={{ padding: '8px 12px' }}>
                          {isDisposed ? (
                            <span style={{ padding: '2px 8px', borderRadius: 9999, background: '#dcfce7', color: '#166534', fontSize: '0.72rem', fontWeight: 700 }}>
                              ✔ Disposed {m.disposed_by ? `by ${m.disposed_by}` : ''} {m.disposed_at ? `· ${fmtDate(m.disposed_at)}` : ''}
                            </span>
                          ) : m.disposal_status === 'dispose_off' ? (
                            <span style={{ padding: '2px 8px', borderRadius: 9999, background: '#fef2f2', color: '#991b1b', fontSize: '0.72rem', fontWeight: 700, border: '1px solid #fecaca' }}>🗑️ Dispose Off (Expired)</span>
                          ) : m.disposal_status === 'returned_to_warehouse' ? (
                            <span style={{ padding: '2px 8px', borderRadius: 9999, background: '#f0fdf4', color: '#166534', fontSize: '0.72rem', fontWeight: 700, border: '1px solid #bbf7d0' }}>↩ Returned to Warehouse</span>
                          ) : isPending ? (
                            <span style={{ padding: '2px 8px', borderRadius: 9999, background: '#fef3c7', color: '#92400e', fontSize: '0.72rem', fontWeight: 700 }}>⏳ Awaiting Disposal</span>
                          ) : (
                            <span style={{ padding: '2px 8px', borderRadius: 9999, background: '#f1f5f9', color: '#475569', fontSize: '0.72rem', fontWeight: 600 }}>{m.status || '—'}</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 12px', color: '#6b7280', fontSize: '0.78rem' }}>{m.created_by || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#fef2f2', fontWeight: 700 }}>
                    <td colSpan={5} style={{ padding: '8px 12px', color: '#7f1d1d' }}>TOTAL ({filtered.length} events)</td>
                    <td style={{ padding: '8px 12px', color: '#dc2626' }}>{filtered.reduce((s,m) => s + Number(m.quantity||0), 0).toLocaleString()}</td>
                    <td style={{ padding: '8px 12px', color: '#b45309' }}>{formatCurrency(filtered.reduce((s,m) => s + Number(m.quantity||0)*getCIFPrice(m.product_name||''), 0))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ── Purchase Orders Tab ────────────────────────────────────────────────────────
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
  const [movCategoryFilter, setMovCategoryFilter] = useState('all');
  const [movProductSearch, setMovProductSearch] = useState('');

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
  const thirtyFwd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const periodLabel = fmtPeriodLabel(period.from, period.to);

  const EMPTY_BRANCH = (b) => ({ name: b.name, key: b.id, noData: true, closingQty: 0, closingDPC: 0, closingValue: 0, products: [], movements: [], salesQty: 0, salesRevenue: 0, salesCount: 0, issued: 0, dispensedQty: 0, transferredOut: 0, transferredIn: 0, returns: 0, writeoffs: 0, expiryQty: 0, expiredQty: 0, expiringQty: 0, opening: 0, batchCount: 0, lowStockCount: 0, lastMovement: null, sourceWarehouse: null });

  const allBranchSummaries = BRANCH_DETAILS.map(b => {
    const key = b.id;
    const data = branchData.find(d => d.branch_id === key);
    if (!data) return EMPTY_BRANCH(b);
    const closingQty = data.closing_qty || 0;
    const closingDPC = (data.inventory || []).reduce((s, inv) => {
      const qty = Number(inv.quantity || 0);
      return s + qty * (getDPCPrice(inv.product_name || inv.description || '') || Number(inv.unit_price || 0));
    }, 0);
    const products = [];
    const productMap = {};
    (data.inventory || []).forEach(inv => {
      const name = inv.product_name || inv.description || 'Unknown';
      const mapKey = `${name}||${inv.batch_no || ''}`;
      if (!productMap[mapKey]) productMap[mapKey] = { product_name: name, qty: 0, dpcValue: 0, batchNo: inv.batch_no || null, expiryDate: inv.expiry_date || null, expiring: false, expired: false, source_warehouse: inv.source_warehouse || null };
      const qty = Number(inv.quantity || 0);
      productMap[mapKey].qty += qty;
      productMap[mapKey].dpcValue += qty * (getDPCPrice(name) || Number(inv.unit_price || 0));
      if (inv.expiry_date) {
        const exp = new Date(inv.expiry_date);
        if (exp < now && qty > 0) productMap[mapKey].expired = true;
        else if (exp <= thirtyFwd && qty > 0) productMap[mapKey].expiring = true;
      }
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
  }).filter(Boolean);

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

  // ── Activity category → raw movement_type mapping ─────────────────────────
  const CATEGORY_MAP = {
    sold:           ['sale','walk_in_member_sale','walk_in_non_member_sale','walkin_sale','walk_in_sale','campaign_sale','member_sale','non_member_sale'],
    dispensed:      ['prescription_dispense','dispense'],
    received:       ['received','receive','transfer_in','branch_receipt','return_in'],
    returned:       ['return','refund_return'],
    written_off:    ['write_off'],
    transferred_out:['transfer_out'],
  };
  const CATEGORY_LABELS = { all:'All Activities', sold:'Sold', dispensed:'Rx Dispensed', received:'Received / Issued', returned:'Returned', written_off:'Written Off', transferred_out:'Transferred Out' };

  const applyMovCategory = (movs, cat) => {
    if (cat === 'all') return movs;
    const types = CATEGORY_MAP[cat] || [];
    return movs.filter(m => types.some(t => (m.movement_type || '').toLowerCase() === t));
  };

  const TYPE_LABEL_MAP = { transfer_in:'Received', received:'Received', receive:'Received', branch_receipt:'Received', transfer_out:'Transfer Out', sale:'Sale', walk_in_member_sale:'Member Sale', walk_in_non_member_sale:'Non-member Sale', walkin_sale:'Walk-in Sale', campaign_sale:'Campaign Sale', prescription_dispense:'Rx Dispense', dispense:'Dispense', write_off:'Write-off', return:'Return', refund_return:'Refund Return', return_in:'Return In' };

  // ── Sales Summary PDF (correct source: branch_inventory_movements via product-range API) ──
  const printSalesSummaryReport = (products, branchLabel, dateFrom, dateTo) => {
    const fmtD = d => d ? new Date(d).toLocaleDateString('en-NA', { day:'2-digit', month:'long', year:'numeric' }) : '-';
    const fmtN = n => n > 0 ? Number(n).toLocaleString() : '';
    const fmtV = v => v > 0 ? `N$ ${Number(v).toLocaleString('en-NA', { minimumFractionDigits:2, maximumFractionDigits:2 })}` : '-';

    const grandWalkin   = products.reduce((s, p) => s + (p.walkin       || 0), 0);
    const grandRx       = products.reduce((s, p) => s + (p.prescription || 0), 0);
    const grandCamp     = products.reduce((s, p) => s + (p.campaigns    || 0), 0);
    const grandTotal    = products.reduce((s, p) => s + (p.total        || 0), 0);
    const grandVal      = products.reduce((s, p) => s + (p.dp_value     || 0), 0);
    const grandRefunded = products.reduce((s, p) => s + (p.refunded     || 0), 0);
    const grandNet      = products.reduce((s, p) => s + (p.net ?? (p.total || 0)), 0);
    const grandRefundDp = products.reduce((s, p) => s + (p.refund_dp    || 0), 0);
    const hasRefunds    = grandRefunded > 0;

    const rows = products.map((p, i) => `<tr>
      <td style="color:#777;font-size:10px">${String(i+1).padStart(2,'0')}</td>
      <td>${p.product_name || '-'}</td>
      <td style="text-align:center;font-weight:700">${fmtN(p.walkin)}</td>
      <td style="text-align:center">${fmtN(p.prescription)}</td>
      <td style="text-align:center">${fmtN(p.campaigns)}</td>
      <td style="text-align:center;font-weight:800">${Number(p.total || 0).toLocaleString()}</td>
      ${hasRefunds ? `<td style="text-align:center;color:#c41e3a;font-weight:700">${(p.refunded||0)>0?'−'+Number(p.refunded).toLocaleString():''}</td><td style="text-align:center;font-weight:900;color:#166534">${Number(p.net??(p.total||0)).toLocaleString()}</td>` : ''}
      <td style="text-align:right;font-weight:600">${fmtV(p.dp_value)}</td>
    </tr>`).join('');

    const refundedCols = hasRefunds
      ? `<th style="text-align:center;width:70px;background:#7f1d1d">Refunded</th><th style="text-align:center;width:65px;background:#7f1d1d">Net Sold</th>`
      : '';
    const totalCols = hasRefunds ? 9 : 7;

    const bodyHtml = `
      <div style="display:flex;gap:40px;margin-bottom:10px">
        <div>
          <div style="font-size:9px;font-weight:800;color:#8b0000;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #ddd;padding-bottom:3px;margin-bottom:5px">Business Details</div>
          <div style="font-size:10px;line-height:1.8">DYNAPHARM INTERNATIONAL NAMIBIA<br>${branchLabel.toUpperCase()} SHOP</div>
        </div>
        <div>
          <div style="font-size:9px;font-weight:800;color:#8b0000;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #ddd;padding-bottom:3px;margin-bottom:5px">Report Filters</div>
          <div style="font-size:10px;line-height:1.8">
            STARTING: ${fmtD(dateFrom)}<br>
            ENDING: ${fmtD(dateTo)}<br>
            ${products.length} product${products.length !== 1 ? 's' : ''} · ${grandTotal.toLocaleString()} sold${hasRefunds ? ` · ${grandRefunded.toLocaleString()} refunded · ${grandNet.toLocaleString()} net` : ''}
          </div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:30px">#</th>
            <th>Description</th>
            <th style="text-align:center;width:78px">Walk-in Sales</th>
            <th style="text-align:center;width:78px">By Prescription</th>
            <th style="text-align:center;width:68px">Campaigns</th>
            <th style="text-align:center;width:58px">Total</th>
            ${refundedCols}
            <th style="text-align:right;width:104px">DP Value</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="${totalCols}" style="text-align:center;padding:20px;color:#aaa">No sales recorded for this period</td></tr>`}
        </tbody>
        <tfoot>
          <tr style="background:#8b0000;color:#fff;font-weight:800">
            <td colspan="2" style="padding:6px 8px">TOTALS — ${products.length} product${products.length !== 1 ? 's' : ''}</td>
            <td style="text-align:center;padding:6px 8px">${grandWalkin > 0 ? grandWalkin.toLocaleString() : ''}</td>
            <td style="text-align:center;padding:6px 8px">${grandRx     > 0 ? grandRx.toLocaleString()     : ''}</td>
            <td style="text-align:center;padding:6px 8px">${grandCamp   > 0 ? grandCamp.toLocaleString()   : ''}</td>
            <td style="text-align:center;padding:6px 8px">${grandTotal.toLocaleString()}</td>
            ${hasRefunds ? `<td style="text-align:center;padding:6px 8px">−${grandRefunded.toLocaleString()}</td><td style="text-align:center;padding:6px 8px">${grandNet.toLocaleString()}</td>` : ''}
            <td style="text-align:right;padding:6px 8px">${fmtV(grandVal)}${hasRefunds&&grandRefundDp>0?`<br><small style="font-weight:400;opacity:.85">−${fmtV(grandRefundDp)}</small><br><strong style="font-size:11.5px">Net: ${fmtV(Math.max(0,grandVal-grandRefundDp))}</strong>`:''}</td>
          </tr>
        </tfoot>
      </table>`;

    printDocument(`Branch Sales Report — ${branchLabel} — ${fmtD(dateFrom)} to ${fmtD(dateTo)}`, bodyHtml);
  };

  const printMovementsReport = (movs, titleSuffix, branchLabel) => {
    // ── Group by product, split into 4 sale categories ─────────────────────
    const WALKIN_TYPES       = ['sale','walk_in_member_sale','walk_in_non_member_sale','walkin_sale','member_sale','non_member_sale'];
    const PACKAGE_TYPES      = ['combo_sale','package_sale','bundle_sale'];
    const PRESCRIPTION_TYPES = ['prescription_dispense','dispense'];
    const CAMPAIGN_TYPES     = ['campaign_sale'];

    // Use uppercase key for case-insensitive dedup; track display name separately
    const prodMap = {};
    for (const m of movs) {
      const displayName = (m.product_name || 'Unknown').trim();
      const key = displayName.toUpperCase();
      if (!prodMap[key]) prodMap[key] = { displayName, walkin: 0, pkg: 0, rx: 0, camp: 0, dpUnit: getDPCPrice(displayName) };
      const qty = Math.abs(Number(m.quantity || 0));
      const t   = m.movement_type || '';
      if      (WALKIN_TYPES.includes(t))       prodMap[key].walkin += qty;
      else if (PACKAGE_TYPES.includes(t))      prodMap[key].pkg    += qty;
      else if (PRESCRIPTION_TYPES.includes(t)) prodMap[key].rx     += qty;
      else if (CAMPAIGN_TYPES.includes(t))     prodMap[key].camp   += qty;
      else                                      prodMap[key].walkin += qty;
    }
    const sorted = Object.entries(prodMap)
      .map(([, { displayName, walkin, pkg, rx, camp, dpUnit }]) => ({
        name: displayName, walkin, pkg, rx, camp,
        total: walkin + pkg + rx + camp,
        dpUnit
      }))
      .sort((a, b) => b.total - a.total);

    const grandWalkin = sorted.reduce((s, r) => s + r.walkin, 0);
    const grandPkg    = sorted.reduce((s, r) => s + r.pkg,    0);
    const grandRx     = sorted.reduce((s, r) => s + r.rx,     0);
    const grandCamp   = sorted.reduce((s, r) => s + r.camp,   0);
    const grandTotal  = sorted.reduce((s, r) => s + r.total,  0);
    const grandVal    = sorted.reduce((s, r) => s + (r.dpUnit > 0 ? r.total * r.dpUnit : 0), 0);

    // ── Date range from data ───────────────────────────────────────────────
    const dates   = movs.map(m => m.created_at).filter(Boolean).map(d => new Date(d));
    const minDate = dates.length ? new Date(Math.min(...dates)) : null;
    const maxDate = dates.length ? new Date(Math.max(...dates)) : null;
    const fmtD    = d => d ? d.toLocaleDateString('en-NA', { day:'2-digit', month:'long', year:'numeric' }) : '-';

    // ── Rows ───────────────────────────────────────────────────────────────
    const fmtN = n => n > 0 ? n.toLocaleString() : '';
    const rows = sorted.map((r, i) => {
      const val = r.dpUnit > 0
        ? `N$ ${(r.total * r.dpUnit).toLocaleString('en-NA', { minimumFractionDigits:2, maximumFractionDigits:2 })}`
        : '-';
      return `<tr>
        <td style="color:#777;font-size:10px">${String(i+1).padStart(2,'0')}</td>
        <td>${r.name}</td>
        <td style="text-align:center;font-weight:700">${fmtN(r.walkin)}</td>
        <td style="text-align:center">${fmtN(r.pkg)}</td>
        <td style="text-align:center">${fmtN(r.rx)}</td>
        <td style="text-align:center">${fmtN(r.camp)}</td>
        <td style="text-align:center;font-weight:800">${r.total.toLocaleString()}</td>
        <td style="text-align:right;font-weight:600">${val}</td>
      </tr>`;
    }).join('');

    // ── Body HTML passed to the system-standard printDocument() ───────────
    const bodyHtml = `
      <div style="display:flex;gap:40px;margin-bottom:10px">
        <div>
          <div style="font-size:9px;font-weight:800;color:#8b0000;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #ddd;padding-bottom:3px;margin-bottom:5px">Business Details</div>
          <div style="font-size:10px;line-height:1.8">DYNAPHARM INTERNATIONAL NAMIBIA<br>${branchLabel.toUpperCase()} SHOP</div>
        </div>
        <div>
          <div style="font-size:9px;font-weight:800;color:#8b0000;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #ddd;padding-bottom:3px;margin-bottom:5px">Report Filters</div>
          <div style="font-size:10px;line-height:1.8">
            STARTING: ${fmtD(minDate)}<br>
            ENDING: ${fmtD(maxDate)}<br>
            SORT BY: Quantity · ${sorted.length} product${sorted.length!==1?'s':''}
          </div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:30px">#</th>
            <th>Description</th>
            <th style="text-align:center;width:72px">Walk-in Sales</th>
            <th style="text-align:center;width:72px">Packages / Combos</th>
            <th style="text-align:center;width:72px">By Prescription</th>
            <th style="text-align:center;width:66px">Campaigns</th>
            <th style="text-align:center;width:56px">Total</th>
            <th style="text-align:right;width:104px">DP Value</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="8" style="text-align:center;padding:20px;color:#aaa">No records found</td></tr>`}
        </tbody>
        <tfoot>
          <tr style="background:#8b0000;color:#fff;font-weight:800">
            <td colspan="2" style="padding:6px 8px">TOTALS</td>
            <td style="text-align:center;padding:6px 8px">${grandWalkin > 0 ? grandWalkin.toLocaleString() : ''}</td>
            <td style="text-align:center;padding:6px 8px">${grandPkg    > 0 ? grandPkg.toLocaleString()    : ''}</td>
            <td style="text-align:center;padding:6px 8px">${grandRx     > 0 ? grandRx.toLocaleString()     : ''}</td>
            <td style="text-align:center;padding:6px 8px">${grandCamp   > 0 ? grandCamp.toLocaleString()   : ''}</td>
            <td style="text-align:center;padding:6px 8px">${grandTotal.toLocaleString()}</td>
            <td style="text-align:right;padding:6px 8px">${grandVal > 0 ? `N$ ${grandVal.toLocaleString('en-NA',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '-'}</td>
          </tr>
        </tfoot>
      </table>`;

    printDocument(`Stock Activity Report — ${titleSuffix} — ${branchLabel}`, bodyHtml);
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
                      <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: p.expired ? '#c41e3a' : p.expiring ? '#d97706' : '#6b7280', fontWeight: (p.expired || p.expiring) ? 700 : 400, fontSize: '0.74rem' }}>{p.expiryDate ? formatDate(p.expiryDate) : '-'}{p.expired ? ' (EXPIRED)' : p.expiring ? ' (EXPIRING)' : ''}</td>
                      <td style={{ padding: '7px 10px', fontWeight: 800, color: p.qty === 0 ? '#c41e3a' : p.qty < 10 ? '#d97706' : '#166534', textAlign: 'right' }}>{p.qty}</td>
                      <td style={{ padding: '7px 10px' }}>{p.qty === 0 ? <span style={{ color: '#c41e3a', fontWeight: 700 }}>Out</span> : p.expired ? <span style={{ color: '#c41e3a', fontWeight: 700 }}>Expired</span> : p.qty < 10 ? <span style={{ color: '#d97706', fontWeight: 700 }}>Low</span> : <span style={{ color: '#166534', fontWeight: 600 }}>OK</span>}</td>
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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={movTypeFilter} onChange={e => setMovTypeFilter(e.target.value)} style={{ padding: '5px 10px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.82rem', outline: 'none' }}>
                <option value="all">All Types</option>
                {movTypes.map(t => <option key={t} value={t}>{(t || '').replace(/_/g, ' ')}</option>)}
              </select>
              <button onClick={() => printMovementsReport(filteredMovements.map(m => ({ ...m, _branch: br.name })), (movTypeFilter === 'all' ? 'All Activities' : movTypeFilter.replace(/_/g,' ')), br.name)}
                style={{ padding: '5px 14px', background: '#c41e3a', border: 'none', borderRadius: 8, fontSize: '0.82rem', fontWeight: 800, color: '#fff', cursor: 'pointer' }}>
                📄 PDF
              </button>
            </div>
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
            <div key={br.key} style={{ background: '#fff', border: `1.5px solid ${br.noData ? '#e5e7eb' : '#f0e8ea'}`, borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(196,30,58,0.06)', cursor: br.noData ? 'default' : 'pointer', opacity: br.noData ? 0.7 : 1 }} onClick={() => !br.noData && setDrillBranch(br.key)}>
              <div style={{ background: br.noData ? 'linear-gradient(135deg,#6b7280,#4b5563)' : 'linear-gradient(135deg,#c41e3a,#8b0000)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: '0.95rem' }}>{br.name}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {br.noData
                    ? <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.72rem', fontStyle: 'italic' }}>No stock received yet</span>
                    : <>
                        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.72rem' }}>{br.products.length} products</span>
                        <button onClick={(e) => { e.stopPropagation(); printBranchReport(br); }} style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', padding: '4px 10px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}>Print</button>
                      </>
                  }
                </div>
              </div>
              {br.noData ? (
                <div style={{ padding: '20px 16px', textAlign: 'center', color: '#9ca3af', fontSize: '0.8rem' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>📦</div>
                  <p style={{ fontWeight: 600, color: '#6b7280' }}>No stock dispatched to this branch</p>
                  <p style={{ fontSize: '0.73rem', marginTop: 4 }}>Issue stock from the warehouse to begin tracking</p>
                </div>
              ) : (
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
                  {(br.expiredQty > 0 || br.expiringQty > 0 || br.lowStockCount > 0) && (
                    <div style={{ padding: '6px 16px', background: '#fff0f3', borderTop: '1px solid #fecaca', fontSize: '0.73rem', color: '#c41e3a', fontWeight: 700, display: 'flex', gap: 12 }}>
                      {br.expiredQty > 0 && <span>{br.expiredQty} expired</span>}
                      {br.expiringQty > 0 && <span style={{ color: '#d97706' }}>{br.expiringQty} expiring soon</span>}
                      {br.lowStockCount > 0 && <span style={{ color: '#d97706' }}>{br.lowStockCount} low stock</span>}
                    </div>
                  )}
                  {br.lastMovement && (
                    <div style={{ padding: '4px 16px 6px', background: '#f8fafc', fontSize: '0.68rem', color: '#94a3b8' }}>
                      Last movement: {formatDateTime(br.lastMovement)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {viewMode === 'movements' && (() => {
        const allMovs = displayBranches.flatMap(br => (br.movements || []).map(m => ({ ...m, _branch: br.name })));
        const catFiltered = applyMovCategory(allMovs, movCategoryFilter);
        const finalMovs = movProductSearch
          ? catFiltered.filter(m => (m.product_name || '').toLowerCase().includes(movProductSearch.toLowerCase()))
          : catFiltered;
        const branchLabel = selectedBranch === 'all' ? 'All Branches' : (BRANCH_DETAILS.find(b => b.id === selectedBranch)?.name || selectedBranch);
        const catLabel = CATEGORY_LABELS[movCategoryFilter] || 'All Activities';

        return (
          <div style={{ background: '#fff', border: '1.5px solid #f0e8ea', borderRadius: 14, overflow: 'hidden' }}>
            {/* ── Filter bar ── */}
            <div style={{ padding: '12px 16px', borderBottom: '2px solid #fecaca', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <h4 style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.9rem', margin: 0, flexShrink: 0 }}>
                Activity Ledger
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginLeft: 8 }}>({finalMovs.length} records)</span>
              </h4>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginLeft: 'auto', alignItems: 'center' }}>
                {/* Activity category filter */}
                <select value={movCategoryFilter} onChange={e => setMovCategoryFilter(e.target.value)}
                  style={{ padding: '6px 10px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.82rem', outline: 'none', color: '#374151', fontWeight: 600 }}>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {/* Product search */}
                <input value={movProductSearch} onChange={e => setMovProductSearch(e.target.value)}
                  placeholder="Search product…"
                  style={{ padding: '6px 12px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.82rem', outline: 'none', width: 180 }} />
                {/* Clear filters */}
                {(movCategoryFilter !== 'all' || movProductSearch) && (
                  <button onClick={() => { setMovCategoryFilter('all'); setMovProductSearch(''); }}
                    style={{ padding: '6px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.78rem', fontWeight: 600, color: '#64748b', cursor: 'pointer' }}>
                    ✕ Clear
                  </button>
                )}
                {/* PDF — current branch (fetches from branch_inventory_movements) */}
                <button onClick={async () => {
                  try {
                    const params = { date_from: period.from || '', date_to: period.to || '' };
                    if (selectedBranch !== 'all') params.branch_id = selectedBranch;
                    const d = await api.reports.branchProductRange(params);
                    let prods = d.products || [];
                    if (movProductSearch) prods = prods.filter(p => (p.product_name || '').toLowerCase().includes(movProductSearch.toLowerCase()));
                    printSalesSummaryReport(prods, branchLabel, d.date_from, d.date_to);
                  } catch (e) { alert('Failed to load sales data: ' + e.message); }
                }} style={{ padding: '6px 14px', background: '#c41e3a', border: 'none', borderRadius: 8, fontSize: '0.82rem', fontWeight: 800, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  📄 PDF — {branchLabel}
                </button>
                {/* PDF — all branches combined */}
                <button onClick={async () => {
                  try {
                    const params = { date_from: period.from || '', date_to: period.to || '', branch_id: 'all' };
                    const d = await api.reports.branchProductRange(params);
                    let prods = d.products || [];
                    if (movProductSearch) prods = prods.filter(p => (p.product_name || '').toLowerCase().includes(movProductSearch.toLowerCase()));
                    printSalesSummaryReport(prods, 'All Branches', d.date_from, d.date_to);
                  } catch (e) { alert('Failed to load sales data: ' + e.message); }
                }} style={{ padding: '6px 14px', background: '#1e3a5f', border: 'none', borderRadius: 8, fontSize: '0.82rem', fontWeight: 800, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  📄 PDF — All Branches
                </button>
              </div>
            </div>

            {/* ── Category summary pills ── */}
            <div style={{ padding: '8px 16px', borderBottom: '1px solid #fef2f2', display: 'flex', gap: 8, flexWrap: 'wrap', background: '#fdf7f8' }}>
              {Object.entries(CATEGORY_LABELS).filter(([k]) => k !== 'all').map(([k, v]) => {
                const cnt = applyMovCategory(allMovs, k).length;
                const active = movCategoryFilter === k;
                return (
                  <button key={k} onClick={() => setMovCategoryFilter(movCategoryFilter === k ? 'all' : k)}
                    style={{ padding: '4px 12px', borderRadius: 20, fontSize: '0.73rem', fontWeight: 700, border: `1px solid ${active ? '#c41e3a' : '#e8d5d8'}`, cursor: 'pointer', background: active ? '#c41e3a' : '#fff', color: active ? '#fff' : '#64748b' }}>
                    {v} <span style={{ opacity: 0.75 }}>({cnt})</span>
                  </button>
                );
              })}
            </div>

            {/* ── Product summary ── */}
            {finalMovs.length > 0 && (() => {
              const prodMap = {};
              for (const m of finalMovs) {
                const key = (m.product_name || 'Unknown').trim();
                if (!prodMap[key]) prodMap[key] = { qty: 0, dpVal: 0 };
                const qty = Math.abs(Number(m.quantity || 0));
                const dpUnit = getDPCPrice(m.product_name || '');
                prodMap[key].qty  += qty;
                prodMap[key].dpVal += dpUnit > 0 ? qty * dpUnit : 0;
              }
              const sorted = Object.entries(prodMap).sort((a, b) => b[1].qty - a[1].qty);
              const grandQty = sorted.reduce((s, [, v]) => s + v.qty, 0);
              const grandDp  = sorted.reduce((s, [, v]) => s + v.dpVal, 0);
              return (
                <div style={{ padding: '10px 16px 12px', borderBottom: '2px solid #fecaca', background: '#fafafa' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: '0.8rem', color: '#1e293b' }}>
                      Product Summary
                      <span style={{ fontWeight: 500, color: '#64748b', marginLeft: 6 }}>({sorted.length} product{sorted.length !== 1 ? 's' : ''})</span>
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Total units: <strong style={{ color: '#1e293b' }}>{grandQty}</strong>
                      {grandDp > 0 && <> &nbsp;·&nbsp; DP Value: <strong style={{ color: '#c41e3a' }}>N$ {grandDp.toFixed(2)}</strong></>}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 6 }}>
                    {sorted.map(([name, { qty, dpVal }], i) => (
                      <div key={i} style={{ background: '#fff', border: '1px solid #f0e8ea', borderRadius: 8, padding: '6px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: '0.73rem', fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={name}>{name}</span>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#fff', background: '#c41e3a', borderRadius: 10, padding: '1px 8px', minWidth: 28, textAlign: 'center' }}>{qty}</span>
                          {dpVal > 0 && <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>N$ {dpVal.toFixed(0)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* ── Movements table ── */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                <thead>
                  <tr style={{ background: '#c41e3a' }}>
                    {['Date', 'Branch', 'Product', 'Batch', 'Expiry', 'Activity', 'Qty', 'DP Value', 'From', 'To', 'Reference', 'Staff'].map(h => (
                      <th key={h} style={{ padding: '7px 8px', color: '#fff', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {finalMovs.length === 0 && (
                    <tr><td colSpan={12} style={{ padding: 28, textAlign: 'center', color: '#94a3b8' }}>
                      No {catLabel === 'All Activities' ? '' : catLabel.toLowerCase() + ' '}movements found
                    </td></tr>
                  )}
                  {finalMovs.slice(0, 500).map((m, i) => {
                    const isOut = CATEGORY_MAP.sold.includes(m.movement_type) || CATEGORY_MAP.written_off.includes(m.movement_type) || CATEGORY_MAP.transferred_out.includes(m.movement_type) || CATEGORY_MAP.dispensed.includes(m.movement_type);
                    const dpUnit = getDPCPrice(m.product_name || '');
                    const qty = Math.abs(Number(m.quantity || 0));
                    const typeLabel = TYPE_LABEL_MAP[m.movement_type] || (m.movement_type || '-').replace(/_/g, ' ');
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fdf8f8', borderBottom: '1px solid #f5f0f0' }}>
                        <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', color: '#6b7280', fontSize: '0.72rem' }}>{m.created_at ? formatDateTime(m.created_at) : '-'}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 700, color: '#1e293b', fontSize: '0.74rem' }}>{m._branch}</td>
                        <td style={{ padding: '6px 8px', fontWeight: 600, color: '#1e293b', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.product_name || ''}>{m.product_name || '-'}</td>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#6b7280', fontSize: '0.72rem' }}>{m.batch_no || '-'}</td>
                        <td style={{ padding: '6px 8px', color: '#6b7280', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>{m.expiry_date ? formatDate(m.expiry_date) : '-'}</td>
                        <td style={{ padding: '6px 8px' }}>
                          <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: 10, fontSize: '0.68rem', fontWeight: 700, background: isOut ? '#fef2f2' : '#dcfce7', color: isOut ? '#c41e3a' : '#166534' }}>{typeLabel}</span>
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: isOut ? '#c41e3a' : '#166534' }}>{isOut ? '-' : '+'}{qty}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', color: '#374151', fontWeight: 600 }}>{dpUnit > 0 ? `N$ ${(qty * dpUnit).toFixed(2)}` : '-'}</td>
                        <td style={{ padding: '6px 8px', color: '#6b7280', fontSize: '0.72rem' }}>{m.source_location ? fmtBranch(m.source_location) : '-'}</td>
                        <td style={{ padding: '6px 8px', color: '#6b7280', fontSize: '0.72rem' }}>{m.destination_location ? fmtBranch(m.destination_location) : '-'}</td>
                        <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#6b7280', fontSize: '0.68rem' }}>{m.reference_id || '-'}</td>
                        <td style={{ padding: '6px 8px', color: '#6b7280', fontSize: '0.72rem' }}>{m.created_by || '-'}</td>
                      </tr>
                    );
                  })}
                  {finalMovs.length > 500 && (
                    <tr><td colSpan={12} style={{ padding: '8px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.75rem', background: '#fdf7f8' }}>
                      Showing 500 of {finalMovs.length} records. Use the period filter above or narrow the activity filter to see more.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

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
    if (!data) return { name: b, key, formula: { opening: 0, issued: 0, salesQty: 0, dispensed: 0, writeoffs: 0, transferredOut: 0, returns: 0, closing: 0, closingValue: 0, salesRevenue: 0, expiringQty: 0, expiredQty: 0 } };
    const closingDPC = (data.inventory || []).reduce((s, inv) => {
      const qty = Number(inv.quantity || 0);
      return s + qty * (getDPCPrice(inv.product_name || '') || Number(inv.unit_price || 0));
    }, 0);
    return {
      name: b, key,
      formula: {
        opening:       data.opening_qty       || 0,
        issued:        data.qty_received      || 0,
        salesQty:      data.qty_sold          || 0,
        dispensed:     data.qty_dispensed     || 0,
        writeoffs:     data.qty_written_off   || 0,
        transferredOut:data.qty_transferred_out|| 0,
        returns:       data.qty_returned      || 0,
        closing:       data.closing_qty       || 0,
        closingValue:  closingDPC,
        salesRevenue:  data.sales_revenue     || 0,
        expiringQty:   data.expiring_qty      || 0,
        expiredQty:    data.expired_qty       || 0,
      }
    };
  });

  const displayReports = selectedBranch === 'all' ? branchReports : branchReports.filter(r => r.key === selectedBranch);

  const sum = (field) => branchReports.reduce((s, r) => s + (r.formula[field] || 0), 0);
  const companySummary = {
    opening:        sum('opening'),
    issued:         sum('issued'),
    salesQty:       sum('salesQty'),
    dispensed:      sum('dispensed'),
    writeoffs:      sum('writeoffs'),
    transferredOut: sum('transferredOut'),
    returns:        sum('returns'),
    closing:        sum('closing'),
    closingValue:   sum('closingValue'),
    salesRevenue:   sum('salesRevenue'),
    expiringQty:    sum('expiringQty'),
    expiredQty:     sum('expiredQty'),
  };

  const printAllBranches = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const brRows = displayReports.map(br => {
      const f = br.formula;
      return `<tr>
        <td style="font-weight:700">${br.name}</td>
        <td>${f.opening.toLocaleString()}</td>
        <td style="color:#166534;font-weight:700">+${f.issued.toLocaleString()}</td>
        <td style="color:#c41e3a;font-weight:700">−${f.salesQty.toLocaleString()}</td>
        <td style="color:#7c3aed;font-weight:700">−${f.dispensed.toLocaleString()}</td>
        <td style="color:#b45309;font-weight:700">−${f.writeoffs.toLocaleString()}</td>
        <td style="color:#0369a1;font-weight:700">−${f.transferredOut.toLocaleString()}</td>
        <td style="color:#166534;font-weight:700">+${f.returns.toLocaleString()}</td>
        <td style="font-weight:800;color:#15803d">${f.closing.toLocaleString()}</td>
        <td>N$ ${f.closingValue.toFixed(2)}</td>
      </tr>`;
    }).join('');
    const cs = companySummary;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Stock Formula Report</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;padding:24px}.header{display:flex;justify-content:space-between;border-bottom:3px solid #c41e3a;padding-bottom:10px;margin-bottom:16px}.company{color:#c41e3a;font-weight:900;font-size:15px}.formula-banner{background:linear-gradient(135deg,#c41e3a,#8b0000);color:#fff;border-radius:10px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}.fb-item{text-align:center;min-width:60px}.fb-val{font-size:14px;font-weight:900}.fb-label{font-size:8px;opacity:.7;font-weight:700;text-transform:uppercase}table{width:100%;border-collapse:collapse}th{background:#c41e3a;color:#fff;font-weight:700;padding:6px 8px;text-align:left;font-size:9px}td{padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:9.5px}tr:nth-child(even) td{background:#fdf7f8}.total-row td{font-weight:800;background:#fff0f3!important;border-top:2px solid #fecaca}.print-btn{position:fixed;top:12px;right:12px;background:#c41e3a;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:700;cursor:pointer}@media print{.print-btn{display:none}}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨️ Print</button>
    <div class="header"><div><div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div><div style="font-size:14px;font-weight:800;color:#8b0000;margin-top:4px">📋 Stock Formula Report — ${selectedBranch === 'all' ? 'All Branches' : displayReports[0]?.name || ''}</div><div style="color:#64748b;font-size:10px;margin-top:3px">Period: ${periodLabel}</div></div><div style="text-align:right;color:#64748b;font-size:10px;line-height:1.6">Date: ${now.toLocaleDateString('en-NA',{day:'2-digit',month:'long',year:'numeric'})}<br>Generated by: Stock Management</div></div>
    <div class="formula-banner">
      <div class="fb-item"><div class="fb-val">${cs.opening.toLocaleString()}</div><div class="fb-label">Opening</div></div>
      <div style="font-size:16px;font-weight:900">+</div>
      <div class="fb-item"><div class="fb-val">${cs.issued.toLocaleString()}</div><div class="fb-label">Received</div></div>
      <div style="font-size:16px;font-weight:900">−</div>
      <div class="fb-item"><div class="fb-val">${cs.salesQty.toLocaleString()}</div><div class="fb-label">Sales</div></div>
      <div style="font-size:16px;font-weight:900">−</div>
      <div class="fb-item"><div class="fb-val">${cs.dispensed.toLocaleString()}</div><div class="fb-label">Dispensed</div></div>
      <div style="font-size:16px;font-weight:900">−</div>
      <div class="fb-item"><div class="fb-val">${cs.writeoffs.toLocaleString()}</div><div class="fb-label">Write-offs</div></div>
      <div style="font-size:16px;font-weight:900">−</div>
      <div class="fb-item"><div class="fb-val">${cs.transferredOut.toLocaleString()}</div><div class="fb-label">Transferred Out</div></div>
      <div style="font-size:16px;font-weight:900">+</div>
      <div class="fb-item"><div class="fb-val">${cs.returns.toLocaleString()}</div><div class="fb-label">Returns</div></div>
      <div style="font-size:16px;font-weight:900">=</div>
      <div class="fb-item"><div class="fb-val" style="font-size:18px">${cs.closing.toLocaleString()}</div><div class="fb-label">Closing</div></div>
    </div>
    <table><thead><tr><th>Branch</th><th>Opening</th><th>+ Received</th><th>− Sales</th><th>− Dispensed</th><th>− Write-offs</th><th>− Transferred Out</th><th>+ Returns</th><th>= Closing Qty</th><th>Closing Value (DP)</th></tr></thead>
    <tbody>${brRows}
    <tr class="total-row">
      <td><strong>COMPANY TOTAL</strong></td>
      <td><strong>${cs.opening.toLocaleString()}</strong></td>
      <td><strong style="color:#166534">+${cs.issued.toLocaleString()}</strong></td>
      <td><strong style="color:#c41e3a">−${cs.salesQty.toLocaleString()}</strong></td>
      <td><strong style="color:#7c3aed">−${cs.dispensed.toLocaleString()}</strong></td>
      <td><strong style="color:#b45309">−${cs.writeoffs.toLocaleString()}</strong></td>
      <td><strong style="color:#0369a1">−${cs.transferredOut.toLocaleString()}</strong></td>
      <td><strong style="color:#166534">+${cs.returns.toLocaleString()}</strong></td>
      <td><strong style="color:#15803d">${cs.closing.toLocaleString()}</strong></td>
      <td><strong>N$ ${cs.closingValue.toFixed(2)}</strong></td>
    </tr>
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
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.78rem', margin: '3px 0 0' }}>Opening + Received − Sales − Dispensed − Write-offs − Transferred Out + Returns = Closing · {periodLabel}</p>
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
            { label: 'Opening Stock',       value: companySummary.opening,        color: '#1e3a5f', bg: '#f4f7fb' },
            { label: '+ Received',          value: companySummary.issued,         color: '#166534', bg: '#f0fdf4' },
            { label: '− Sales',             value: companySummary.salesQty,       color: '#c41e3a', bg: '#fef2f2' },
            { label: '− Dispensed',         value: companySummary.dispensed,      color: '#7c3aed', bg: '#faf5ff' },
            { label: '− Write-offs',        value: companySummary.writeoffs,      color: '#b45309', bg: '#fffbeb' },
            { label: '− Transferred Out',   value: companySummary.transferredOut, color: '#0369a1', bg: '#f0f9ff' },
            { label: '+ Returns',           value: companySummary.returns,        color: '#166534', bg: '#f0fdf4' },
            { label: '= Closing Stock',     value: companySummary.closing,        color: '#15803d', bg: '#f0fdf4', closing: true },
          ].map(({ label, value, color, bg, closing }) => (
            <div key={label} style={{ background: bg, border: `1.5px solid ${closing ? '#86efac' : '#f0e8ea'}`, borderRadius: 10, padding: '10px 12px', textAlign: 'center', ...(closing ? { gridColumn: 'span 2' } : {}) }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
              <div style={{ fontSize: closing ? '1.4rem' : '1.1rem', fontWeight: 900, color, marginTop: 4 }}>{Number(value || 0).toLocaleString()}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 16, fontSize: '0.78rem', color: '#64748b', paddingTop: 10, borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
          <span>Closing Stock Value (DP): <strong style={{ color: '#c41e3a' }}>N$ {companySummary.closingValue.toFixed(2)}</strong></span>
          <span>Sales Revenue: <strong style={{ color: '#166534' }}>N$ {(companySummary.salesRevenue || 0).toFixed(2)}</strong></span>
          {companySummary.expiringQty > 0 && <span>⚠️ Expiring soon: <strong style={{ color: '#d97706' }}>{companySummary.expiringQty.toLocaleString()} units</strong></span>}
          {companySummary.expiredQty > 0 && <span>🔴 Expired (in stock): <strong style={{ color: '#c41e3a' }}>{companySummary.expiredQty.toLocaleString()} units</strong></span>}
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
            { header: 'Branch',           render: r => <span className="font-bold text-gray-800">{r.name}</span> },
            { header: 'Opening',          render: r => <span style={{ color: '#1e3a5f', fontWeight: 700 }}>{r.formula.opening.toLocaleString()}</span> },
            { header: '+ Received',       render: r => <span style={{ color: '#166534', fontWeight: 700 }}>+{r.formula.issued.toLocaleString()}</span> },
            { header: '− Sales',          render: r => <span style={{ color: '#c41e3a', fontWeight: 700 }}>−{r.formula.salesQty.toLocaleString()}</span> },
            { header: '− Dispensed',      render: r => <span style={{ color: '#7c3aed', fontWeight: 700 }}>−{r.formula.dispensed.toLocaleString()}</span> },
            { header: '− Write-offs',     render: r => <span style={{ color: '#b45309', fontWeight: 700 }}>−{r.formula.writeoffs.toLocaleString()}</span> },
            { header: '− Transferred Out',render: r => <span style={{ color: '#0369a1', fontWeight: 700 }}>−{r.formula.transferredOut.toLocaleString()}</span> },
            { header: '+ Returns',        render: r => <span style={{ color: '#166534', fontWeight: 700 }}>+{r.formula.returns.toLocaleString()}</span> },
            { header: '= Closing',        render: r => <span style={{ color: '#15803d', fontWeight: 900, fontSize: '1rem' }}>{r.formula.closing.toLocaleString()}</span> },
            { header: 'Value (DP)',        render: r => <span style={{ fontWeight: 600, color: '#1e3a5f' }}>N$ {r.formula.closingValue.toFixed(2)}</span> },
          ]}
          data={displayReports}
          emptyMessage="No data available"
        />
        {/* Total row */}
        <div style={{ padding: '10px 16px', background: '#fff0f3', borderTop: '2px solid #fecaca', display: 'flex', gap: 18, fontSize: '0.81rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontWeight: 800, color: '#c41e3a' }}>COMPANY TOTAL</span>
          <span>Opening: <strong>{companySummary.opening.toLocaleString()}</strong></span>
          <span>+Received: <strong style={{ color: '#166534' }}>{companySummary.issued.toLocaleString()}</strong></span>
          <span>−Sales: <strong style={{ color: '#c41e3a' }}>{companySummary.salesQty.toLocaleString()}</strong></span>
          <span>−Dispensed: <strong style={{ color: '#7c3aed' }}>{companySummary.dispensed.toLocaleString()}</strong></span>
          <span>−Write-offs: <strong style={{ color: '#b45309' }}>{companySummary.writeoffs.toLocaleString()}</strong></span>
          <span>−Out: <strong style={{ color: '#0369a1' }}>{companySummary.transferredOut.toLocaleString()}</strong></span>
          <span>+Returns: <strong style={{ color: '#166534' }}>{companySummary.returns.toLocaleString()}</strong></span>
          <span style={{ fontWeight: 800 }}>= Closing: <strong style={{ color: '#15803d', fontSize: '1rem' }}>{companySummary.closing.toLocaleString()}</strong></span>
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
                locGroups[loc].cif += qty * getBatchCIF(b);
                locGroups[loc].dpc += qty * (Number(b.dpc_unit_value || 0) || getDPCPrice(b.description || b.product_name || ''));
              });
              const rows = Object.entries(locGroups).map(([loc, d]) => `<tr><td style="font-weight:700">${fmtLocation(loc)}</td><td>${d.qty.toLocaleString()}</td><td>N$ ${Math.round(d.cif).toLocaleString('en-ZA')}</td><td>N$ ${Math.round(d.dpc).toLocaleString('en-ZA')}</td><td>N$ ${Math.round(d.dpc - d.cif).toLocaleString('en-ZA')}</td></tr>`).join('');
              const totals = Object.values(locGroups).reduce((s,d) => ({ qty: s.qty+d.qty, cif: s.cif+d.cif, dpc: s.dpc+d.dpc }), { qty:0, cif:0, dpc:0 });
              printDocument('Stock Valuation Report', `<table><thead><tr><th>Location</th><th>Total Qty</th><th>CIF Value</th><th>DPC Value</th><th>Margin</th></tr></thead><tbody>${rows}<tr class="total-row" style="font-weight:800;background:#fff0f3;border-top:2px solid #fecaca"><td>TOTAL</td><td>${totals.qty.toLocaleString()}</td><td>N$ ${Math.round(totals.cif).toLocaleString('en-ZA')}</td><td>N$ ${Math.round(totals.dpc).toLocaleString('en-ZA')}</td><td>N$ ${Math.round(totals.dpc-totals.cif).toLocaleString('en-ZA')}</td></tr></tbody></table>`);
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
            locGroups[loc].cif += qty * getBatchCIF(b);
            locGroups[loc].dpc += qty * (Number(b.dpc_unit_value || 0) || getDPCPrice(b.description || b.product_name || ''));
          });
          const valData = Object.values(locGroups);
          const totals = valData.reduce((s,d) => ({ qty: s.qty+d.qty, cif: s.cif+d.cif, dpc: s.dpc+d.dpc }), { qty:0, cif:0, dpc:0 });
          return (<>
            <Table
              columns={[
                { header: 'Location', render: r => <span className="font-bold text-sm">{fmtLocation(r.location)}</span> },
                { header: 'Total Qty', render: r => <span className="font-semibold">{r.qty.toLocaleString()}</span> },
                { header: 'CIF Value', render: r => <span className="text-xs">N$ {Math.round(r.cif).toLocaleString('en-ZA')}</span> },
                { header: 'DPC Value', render: r => <span className="text-xs font-semibold" style={{ color: '#c41e3a' }}>N$ {Math.round(r.dpc).toLocaleString('en-ZA')}</span> },
                { header: 'Margin', render: r => <span className="text-xs font-semibold" style={{ color: (r.dpc - r.cif) > 0 ? '#166534' : '#c41e3a' }}>N$ {Math.round(r.dpc - r.cif).toLocaleString('en-ZA')}</span> },
              ]}
              data={valData}
              emptyMessage="No stock data"
            />
            <div style={{ padding: '10px 16px', background: '#fff0f3', borderTop: '2px solid #fecaca', display: 'flex', gap: 24, fontSize: '0.82rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, color: '#c41e3a' }}>TOTAL</span>
              <span>Qty: <strong>{totals.qty.toLocaleString()}</strong></span>
              <span>CIF: <strong>N$ {Math.round(totals.cif).toLocaleString('en-ZA')}</strong></span>
              <span>DPC: <strong style={{ color: '#c41e3a' }}>N$ {Math.round(totals.dpc).toLocaleString('en-ZA')}</strong></span>
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
  const [data, setData]               = useState(null);
  const [loading, setLoading]         = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [countdown, setCountdown]     = useState(10);
  const [newIds, setNewIds]           = useState(new Set());
  const [expandedProduct, setExpandedProduct] = useState(null);
  const [search, setSearch]           = useState('');
  const INTERVAL = 10;

  const fmtAgo = ts => {
    if (!ts) return '—';
    const s = Math.floor((Date.now() - new Date(ts)) / 1000);
    if (s < 60)   return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s/60)}m ago`;
    if (s < 86400) return `${Math.floor(s/3600)}h ago`;
    return new Date(ts).toLocaleDateString('en-ZA',{day:'2-digit',month:'short'});
  };
  const fmtTime = ts => { try { return ts ? new Date(ts).toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit',second:'2-digit'}) : '—'; } catch { return '—'; } };

  const locColor = type => {
    if (type === 'country')   return '#6b7280';
    if (type === 'warehouse') return '#2563eb';
    return '#c41e3a';
  };
  const locIcon = type => {
    if (type === 'country')   return '🏛️';
    if (type === 'warehouse') return '🏭';
    return '🏪';
  };
  const fmtLoc = (locationId) => {
    const l = (locationId||'').toLowerCase();
    if (!l || l === 'unknown') return '—';
    if (l === 'country_stock') return 'Country Stock';
    if (l === 'windhoek_warehouse') return 'Windhoek WH';
    if (l === 'ondangwa_warehouse') return 'Ondangwa WH';
    const bd = BRANCH_DETAILS.find(b => b.id === l);
    return bd ? bd.name : (locationId||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  };

  const mvTypeConfig = type => {
    const t = (type||'').toLowerCase();
    if (['transfer_in','receipt','return','stock_receipt'].includes(t))                           return { label:'Transfer In',  color:'#16a34a', bg:'#f0fdf4', dir:'+' };
    if (['transfer_out','dispatch','redistribution'].includes(t))                                  return { label:'Transfer Out', color:'#2563eb', bg:'#eff6ff', dir:'→' };
    if (['walkin_sale','walkin_member_sale','walkin_non_member_sale','walk_in_member_sale','walk_in_non_member_sale','sale'].includes(t)) return { label:'Sale',         color:'#c41e3a', bg:'#fff0f3', dir:'−' };
    if (t === 'prescription_dispense')                                                             return { label:'Dispense',     color:'#7c3aed', bg:'#fdf4ff', dir:'Rx' };
    if (['adjustment','stock_adjustment'].includes(t))                                             return { label:'Adjustment',   color:'#d97706', bg:'#fffbeb', dir:'±' };
    if (['write_off','written_off'].includes(t))                                                   return { label:'Write-off',    color:'#dc2626', bg:'#fef2f2', dir:'×' };
    if (['opening_stock','opening','initial'].includes(t))                                         return { label:'Opening Stock',color:'#0891b2', bg:'#ecfeff', dir:'↑' };
    return { label: (type||'Unknown').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()), color:'#64748b', bg:'#f8fafc', dir:'•' };
  };

  const fetchData = useCallback(async () => {
    try {
      const resp = await api.get('/stock/realtime').catch(() => null);
      if (!resp) return;
      const d = resp.data || resp;

      setData(prev => {
        const prevIds = new Set((prev?.recentMovements||[]).map(x => x.id));
        const incoming = d.recentMovements || [];
        const added = incoming.filter(x => x.id && !prevIds.has(x.id)).map(x => x.id);
        if (added.length > 0) {
          setNewIds(ids => { const next = new Set([...ids, ...added]); return next; });
          setTimeout(() => setNewIds(ids => { const next = new Set(ids); added.forEach(id => next.delete(id)); return next; }), 3000);
        }
        return d;
      });
      setLastRefresh(new Date());
    } catch(e) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, INTERVAL * 1000);
    const cd = setInterval(() => setCountdown(c => c <= 1 ? INTERVAL : c - 1), 1000);
    return () => { clearInterval(iv); clearInterval(cd); };
  }, [fetchData]);

  const allProducts = data?.products || [];
  const allMovements = data?.recentMovements || [];

  // ── Filter by global branch selector ────────────────────────────────────────
  const products = branch === 'all'
    ? allProducts
    : allProducts
        .map(p => ({
          ...p,
          locations: p.locations.filter(l => l.locationId === branch),
          totalQty:  p.locations.filter(l => l.locationId === branch).reduce((s,l) => s+l.qty, 0),
        }))
        .filter(p => p.totalQty > 0);

  const movements = branch === 'all' ? allMovements : allMovements.filter(m => {
    const sl = (m.source_location||'').toLowerCase().replace(/\s+/g,'_');
    const dl = (m.destination_location||'').toLowerCase().replace(/\s+/g,'_');
    return sl === branch || dl === branch;
  });

  // ── Search filter ────────────────────────────────────────────────────────────
  const filteredProducts = search.trim()
    ? products.filter(p => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    : products;

  // ── Derived stats ───────────────────────────────────────────────────────────
  const todayStr = new Date().toISOString().slice(0,10);
  const todayMoves = movements.filter(m => (m.created_at||'').slice(0,10) === todayStr);
  const totalUnits = products.reduce((s,p) => s + p.totalQty, 0);
  const lowCount   = products.filter(p => p.totalQty > 0 && p.totalQty < 10).length;

  const feed = [...movements]
    .sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0))
    .slice(0, 60);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
            <span style={{ width:10, height:10, borderRadius:'50%', background:'#16a34a', display:'inline-block', boxShadow:'0 0 0 3px #bbf7d0', animation:'pulse 2s infinite' }} />
            <h3 style={{ fontWeight:900, fontSize:'1rem', color:'#1e293b', margin:0 }}>⚡ Live Stock Dashboard</h3>
          </div>
          <p style={{ fontSize:'0.72rem', color:'#94a3b8', margin:0 }}>
            Auto-refreshes every {INTERVAL}s · Next in <strong style={{ color: countdown <= 3 ? '#dc2626' : '#374151' }}>{countdown}s</strong> · Last updated {fmtTime(lastRefresh)}
          </p>
          <div style={{ height:3, width:180, background:'#f1f5f9', borderRadius:99, marginTop:4, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${(countdown/INTERVAL)*100}%`, background: countdown <= 3 ? '#dc2626' : '#16a34a', borderRadius:99, transition:'width 1s linear' }} />
          </div>
        </div>
        <Button size="sm" onClick={() => { fetchData(); setCountdown(INTERVAL); }}>↺ Refresh Now</Button>
      </div>

      {/* ── 4 Stat cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon:'📦', label:'Total Units in Stock', value: totalUnits.toLocaleString(), color:'#1d4ed8', bg:'#eff6ff', border:'#bfdbfe' },
          { icon:'🧴', label:'Products Tracked',     value: products.length,              color:'#16a34a', bg:'#f0fdf4', border:'#86efac' },
          { icon:'🔄', label:'Movements Today',      value: todayMoves.length,             color:'#d97706', bg:'#fffbeb', border:'#fde68a' },
          { icon:'📉', label:'Low Stock Products',   value: lowCount, color: lowCount > 0 ? '#dc2626' : '#374151', bg: lowCount > 0 ? '#fef2f2' : '#f8fafc', border: lowCount > 0 ? '#fecaca' : '#e2e8f0' },
        ].map(s => (
          <div key={s.label} style={{ borderRadius:10, padding:'12px 14px', background:s.bg, border:`1.5px solid ${s.border}` }}>
            <div style={{ fontSize:'0.75rem', marginBottom:4 }}>{s.icon}</div>
            <div style={{ fontSize:'1.65rem', fontWeight:900, color:s.color, lineHeight:1 }}>{s.value}</div>
            <div style={{ fontSize:'0.67rem', color:'#64748b', fontWeight:700, marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Two-column layout ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Product Availability List ──────────────────────────────────── */}
        <Card style={{ display:'flex', flexDirection:'column' }}>
          <CardHeader>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <div>
                <span style={{ fontWeight:800, color:'#1e293b' }}>Product Availability</span>
                <span style={{ fontSize:'0.7rem', color:'#94a3b8', marginLeft:6 }}>{filteredProducts.length} of {products.length} products</span>
              </div>
              <div style={{ display:'flex', gap:6, alignItems:'center', fontSize:'0.68rem', color:'#64748b' }}>
                <span><span style={{ width:8, height:8, borderRadius:'50%', background:'#6b7280', display:'inline-block', marginRight:3 }} />Country</span>
                <span><span style={{ width:8, height:8, borderRadius:'50%', background:'#2563eb', display:'inline-block', marginRight:3 }} />WH</span>
                <span><span style={{ width:8, height:8, borderRadius:'50%', background:'#c41e3a', display:'inline-block', marginRight:3 }} />Branch</span>
              </div>
            </div>
            <div style={{ marginTop:8 }}>
              <input
                type="text"
                placeholder="Search product…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width:'100%', border:'1.5px solid #e2e8f0', borderRadius:8, padding:'5px 10px', fontSize:'0.8rem', outline:'none', background:'#f8fafc' }}
              />
            </div>
          </CardHeader>
          <div style={{ overflowY:'auto', flex:1, maxHeight:520 }}>
            {filteredProducts.length === 0 ? (
              <div style={{ padding:32, textAlign:'center', color:'#94a3b8', fontSize:'0.82rem' }}>
                {search ? 'No products match your search' : 'No stock data available'}
              </div>
            ) : (
              <div>
                {filteredProducts.map((p, i) => {
                  const isExpanded = expandedProduct === p.name;
                  const isLow = p.totalQty > 0 && p.totalQty < 10;
                  const isEmpty = p.totalQty <= 0;
                  return (
                    <div key={p.name}>
                      {/* ── Product row — click to expand ── */}
                      <div
                        onClick={() => setExpandedProduct(isExpanded ? null : p.name)}
                        style={{
                          padding:'10px 14px',
                          borderBottom: isExpanded ? 'none' : '1px solid #f1f5f9',
                          background: isExpanded ? '#fef9ff' : i%2===0 ? '#fff' : '#fafafa',
                          cursor:'pointer',
                          display:'flex', alignItems:'center', gap:10,
                          userSelect:'none',
                          transition:'background 0.15s',
                        }}
                      >
                        {/* Expand indicator */}
                        <span style={{ color:'#94a3b8', fontSize:'0.75rem', flexShrink:0, width:14, textAlign:'center' }}>
                          {isExpanded ? '▼' : '▶'}
                        </span>
                        {/* Product name */}
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:700, color:'#1e293b', fontSize:'0.82rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={p.name}>
                            {p.name}
                          </div>
                          {/* Mini location dots */}
                          <div style={{ display:'flex', gap:3, marginTop:3, flexWrap:'wrap' }}>
                            {p.locations.slice(0, 6).map(l => (
                              <span key={l.locationId} style={{ display:'inline-flex', alignItems:'center', gap:2, background:`${locColor(l.locationType)}11`, border:`1px solid ${locColor(l.locationType)}33`, borderRadius:99, padding:'1px 6px', fontSize:'0.6rem', fontWeight:700, color:locColor(l.locationType), whiteSpace:'nowrap' }}>
                                <span style={{ width:5, height:5, borderRadius:'50%', background:locColor(l.locationType), display:'inline-block' }} />
                                {l.locationName} · {l.qty}
                              </span>
                            ))}
                            {p.locations.length > 6 && <span style={{ fontSize:'0.6rem', color:'#94a3b8' }}>+{p.locations.length - 6} more</span>}
                          </div>
                        </div>
                        {/* Total qty badge */}
                        <div style={{ flexShrink:0, textAlign:'right' }}>
                          <span style={{
                            fontWeight:900, fontSize:'1.1rem',
                            color: isEmpty ? '#dc2626' : isLow ? '#d97706' : '#16a34a',
                          }}>
                            {p.totalQty.toLocaleString()}
                          </span>
                          <div style={{ fontSize:'0.6rem', color:'#94a3b8', fontWeight:700 }}>
                            {isEmpty ? 'OUT' : isLow ? 'LOW' : 'units'}
                          </div>
                        </div>
                      </div>

                      {/* ── Expanded location breakdown ── */}
                      {isExpanded && (
                        <div style={{ background:'#faf5ff', borderBottom:'2px solid #e9d5ff', padding:'8px 14px 12px 14px' }}>
                          <div style={{ fontSize:'0.7rem', fontWeight:700, color:'#7c3aed', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                            📍 Stock Breakdown — {p.name}
                            <span style={{ background:'#ede9fe', borderRadius:99, padding:'1px 8px', color:'#5b21b6', fontSize:'0.65rem' }}>{p.locations.length} location{p.locations.length !== 1 ? 's' : ''}</span>
                          </div>
                          <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                            {p.locations.map(l => {
                              const pct = p.totalQty > 0 ? Math.round((l.qty / p.totalQty) * 100) : 0;
                              const col = locColor(l.locationType);
                              return (
                                <div key={l.locationId} style={{ background:'#fff', borderRadius:8, padding:'8px 12px', border:`1.5px solid ${col}22` }}>
                                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                      <span style={{ fontSize:'0.85rem' }}>{locIcon(l.locationType)}</span>
                                      <span style={{ fontWeight:700, color:'#1e293b', fontSize:'0.82rem' }}>{l.locationName}</span>
                                      <span style={{ background:`${col}15`, color:col, borderRadius:99, padding:'1px 7px', fontSize:'0.63rem', fontWeight:700, textTransform:'capitalize' }}>{l.locationType}</span>
                                    </div>
                                    <div style={{ textAlign:'right' }}>
                                      <span style={{ fontWeight:900, fontSize:'1rem', color:col }}>{l.qty.toLocaleString()}</span>
                                      <span style={{ fontSize:'0.7rem', color:'#94a3b8', marginLeft:4 }}>units</span>
                                    </div>
                                  </div>
                                  {/* Progress bar */}
                                  <div style={{ height:5, background:'#f1f5f9', borderRadius:99, overflow:'hidden' }}>
                                    <div style={{ height:'100%', width:`${pct}%`, background:col, borderRadius:99, transition:'width 0.4s' }} />
                                  </div>
                                  <div style={{ fontSize:'0.62rem', color:'#94a3b8', marginTop:2 }}>{pct}% of total stock</div>
                                </div>
                              );
                            })}
                          </div>
                          {/* Close hint */}
                          <div style={{ textAlign:'center', marginTop:8 }}>
                            <span
                              onClick={() => setExpandedProduct(null)}
                              style={{ fontSize:'0.68rem', color:'#7c3aed', cursor:'pointer', fontWeight:700 }}
                            >
                              ▲ Close
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* ── Live Activity Feed ─────────────────────────────────────────── */}
        <Card style={{ display:'flex', flexDirection:'column' }}>
          <CardHeader>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <span style={{ fontWeight:800, color:'#1e293b' }}>Live Activity Feed</span>
                <span style={{ fontSize:'0.7rem', color:'#94a3b8', marginLeft:6 }}>{feed.length} movements</span>
              </div>
              <span style={{ fontSize:'0.68rem', color:'#16a34a', fontWeight:700, background:'#f0fdf4', borderRadius:99, padding:'2px 8px', border:'1px solid #86efac' }}>
                ● LIVE
              </span>
            </div>
          </CardHeader>
          <div style={{ overflowY:'auto', flex:1, maxHeight:560 }}>
            {feed.length === 0 ? (
              <div style={{ padding:32, textAlign:'center', color:'#94a3b8', fontSize:'0.82rem' }}>No movements recorded yet</div>
            ) : (
              <div>
                {feed.map((m, i) => {
                  const id   = m.id;
                  const cfg  = mvTypeConfig(m.movement_type);
                  const src  = m.source_location || '';
                  const dst  = m.destination_location || '';
                  const ts   = m.created_at;
                  const qty  = Number(m.quantity || 0);
                  const prod = m.product_name || '—';
                  const who  = m.created_by || '';
                  const isNew = newIds.has(id);
                  const srcType = src.includes('warehouse') ? 'warehouse' : src === 'country_stock' ? 'country' : 'branch';
                  const dstType = dst.includes('warehouse') ? 'warehouse' : dst === 'country_stock' ? 'country' : 'branch';
                  return (
                    <div key={id || i} style={{
                      padding:'10px 14px',
                      borderBottom:'1px solid #f1f5f9',
                      background: isNew ? '#f0fdf4' : i%2===0 ? '#fff' : '#fafafa',
                      transition:'background 1s',
                      display:'flex', gap:10, alignItems:'flex-start',
                    }}>
                      <div style={{ flexShrink:0, minWidth:72 }}>
                        <span style={{ background:cfg.bg, color:cfg.color, borderRadius:6, padding:'3px 7px', fontSize:'0.65rem', fontWeight:800, display:'block', textAlign:'center', border:`1px solid ${cfg.color}22` }}>{cfg.label}</span>
                        <div style={{ fontSize:'0.6rem', color:'#94a3b8', textAlign:'center', marginTop:2 }}>{fmtAgo(ts)}</div>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:800, color:'#1e293b', fontSize:'0.78rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={prod}>{prod}</div>
                        <div style={{ fontSize:'0.7rem', color:'#64748b', marginTop:1, display:'flex', flexWrap:'wrap', gap:'3px 8px' }}>
                          {src && <span><span style={{ color:locColor(srcType) }}>●</span> {fmtLoc(src)}</span>}
                          {src && dst && <span style={{ color:'#cbd5e1' }}>→</span>}
                          {dst && <span><span style={{ color:locColor(dstType) }}>●</span> {fmtLoc(dst)}</span>}
                          {who && <span style={{ color:'#94a3b8' }}>· {who}</span>}
                        </div>
                        {m.reference_id && <div style={{ fontSize:'0.65rem', color:'#94a3b8', marginTop:1, fontFamily:'monospace' }}>{m.reference_id}</div>}
                      </div>
                      <div style={{ flexShrink:0, textAlign:'right' }}>
                        <span style={{ fontWeight:900, fontSize:'0.9rem', color:cfg.color }}>{cfg.dir}{qty.toLocaleString()}</span>
                        <div style={{ fontSize:'0.6rem', color:'#94a3b8' }}>units</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

      </div>
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
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const defaultForm = {
    name: '', description: '', campaign_type: 'buy_x_get_y',
    start_date: '', end_date: '', scope: 'countrywide',
    target_branches: [],
    conditions: {}, prize: {},
    discount_percentage: 0,
    stock_assignments: [{ product: '', quantity: '', branch: 'all' }],
  };
  const [form, setForm] = useState(defaultForm);
  const [editForm, setEditForm] = useState(defaultForm);

  const safeJson = (val) => {
    if (!val) return {};
    if (typeof val === 'object') return val;
    try { return JSON.parse(val); } catch { return {}; }
  };

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

  const openEdit = (c) => {
    const cond = safeJson(c.conditions);
    const prize = safeJson(c.prize);
    const sa = Array.isArray(cond.stock_assignments) && cond.stock_assignments.length > 0
      ? cond.stock_assignments
      : [{ product: '', quantity: '', branch: 'all' }];
    setEditForm({
      name: c.name || '',
      description: c.description || '',
      campaign_type: c.campaign_type || 'buy_x_get_y',
      start_date: c.start_date ? c.start_date.slice(0, 10) : '',
      end_date: c.end_date ? c.end_date.slice(0, 10) : '',
      scope: c.scope || 'countrywide',
      target_branches: Array.isArray(c.target_branches) ? c.target_branches : [],
      conditions: { ...cond, stock_assignments: undefined },
      prize,
      discount_percentage: Number(c.discount_percentage || 0),
      stock_assignments: sa,
    });
    setEditingCampaign(c);
    setShowForm(false);
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    if (!editForm.name || !editForm.start_date || !editForm.end_date) {
      setAlert({ type: 'error', msg: 'Campaign name, start date and end date are required.' });
      return;
    }
    setEditSubmitting(true);
    try {
      const conditionsWithAssignments = {
        ...editForm.conditions,
        stock_assignments: Array.isArray(editForm.stock_assignments) ? editForm.stock_assignments.filter(a => a.product) : [],
      };
      await api.put(`/campaigns/${editingCampaign.id}`, {
        name: editForm.name,
        description: editForm.description,
        campaign_type: editForm.campaign_type,
        start_date: editForm.start_date,
        end_date: editForm.end_date,
        scope: editForm.scope,
        target_branches: editForm.target_branches,
        conditions: conditionsWithAssignments,
        prize: editForm.prize,
        discount_percentage: editForm.campaign_type === 'discount' ? Number(editForm.conditions?.discount_pct || 0) : 0,
      });
      setAlert({ type: 'success', msg: 'Campaign updated successfully.' });
      setEditingCampaign(null);
      load();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`Delete campaign "${c.name}" and all its participant records? This cannot be undone.`)) return;
    try {
      await api.delete(`/campaigns/${c.id}`);
      setAlert({ type: 'success', msg: `Campaign "${c.name}" deleted.` });
      if (editingCampaign?.id === c.id) setEditingCampaign(null);
      load();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
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
                        <option value="">-- Select product --</option>
                        {products.map(p => { const n = p.description || p.name || p.product_name || ''; return <option key={p.id || n} value={n}>{n}{p.dp ? ` — N$${p.dp}` : ''}</option>; })}
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

      {/* Edit Campaign Panel */}
      {editingCampaign && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-gray-800">✏️ Edit Campaign — {editingCampaign.name}</h3>
              <button onClick={() => setEditingCampaign(null)} className="text-gray-400 hover:text-gray-600 text-lg font-bold">✕</button>
            </div>
          </CardHeader>
          <CardBody>
            <form onSubmit={handleEdit} className="space-y-5">
              <div>
                <div className="text-sm font-semibold text-gray-700 mb-2">Campaign Type</div>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
                  {CAMP_TYPES.map(t => (
                    <button key={t.value} type="button" onClick={() => setEditForm(f => ({ ...f, campaign_type: t.value, conditions: {}, prize: {} }))}
                      className="p-3 rounded-lg border-2 text-left transition-all"
                      style={editForm.campaign_type === t.value
                        ? { background: CAMP_COLORS[t.value].bg, borderColor: CAMP_COLORS[t.value].border }
                        : { background: '#f8fafc', borderColor: '#e2e8f0' }}>
                      <div className="font-semibold text-sm" style={{ color: editForm.campaign_type === t.value ? CAMP_COLORS[t.value].text : '#374151' }}>{t.label}</div>
                      <div className="text-xs text-gray-500 mt-1">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <Input label="Campaign Title *" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 min-h-[60px]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Start Date *" type="date" value={editForm.start_date} onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))} />
                <Input label="End Date *" type="date" value={editForm.end_date} onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
              {(() => {
                const tc2 = editForm.campaign_type ? (CAMP_COLORS[editForm.campaign_type] || CAMP_COLORS.custom) : CAMP_COLORS.custom;
                return (
                  <div className="p-4 rounded-xl border-2" style={{ background: tc2.bg, borderColor: tc2.border }}>
                    <div className="font-semibold text-sm mb-3" style={{ color: tc2.text }}>📋 Conditions / Rules</div>
                    <StockCampaignConditionsForm type={editForm.campaign_type} conditions={editForm.conditions} onChange={c => setEditForm(f => ({ ...f, conditions: c }))} products={products} />
                  </div>
                );
              })()}
              <div className="p-4 rounded-xl border-2 border-amber-200 bg-amber-50">
                <div className="font-semibold text-sm text-amber-800 mb-3">🏆 Prize / Reward</div>
                <StockCampaignPrizeForm type={editForm.campaign_type} prize={editForm.prize} onChange={p => setEditForm(f => ({ ...f, prize: p }))} products={products} />
              </div>
              <div className="p-4 rounded-xl border-2 border-purple-200 bg-purple-50">
                <div className="font-semibold text-sm text-purple-800 mb-1">📦 Stock Assignment</div>
                <div className="text-xs text-purple-600 mb-3">Specify products and quantities allocated for this campaign across branches.</div>
                {(editForm.stock_assignments || [{ product: '', quantity: '', branch: 'all' }]).map((a, i) => (
                  <div key={i} className="grid grid-cols-3 gap-2 mb-2 items-end">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Product</label>
                      <select value={a.product} onChange={e => { const sa = [...editForm.stock_assignments]; sa[i] = { ...sa[i], product: e.target.value }; setEditForm(f => ({ ...f, stock_assignments: sa })); }}
                        className="w-full px-2 py-1.5 rounded-lg border border-gray-300 text-xs">
                        <option value="">-- Select product --</option>
                        {products.map(p => { const n = p.description || p.name || p.product_name || ''; return <option key={p.id || n} value={n}>{n}{p.dp ? ` — N$${p.dp}` : ''}</option>; })}
                      </select>
                    </div>
                    <Input label="Qty Reserved" type="number" min="0" value={a.quantity}
                      onChange={e => { const sa = [...editForm.stock_assignments]; sa[i] = { ...sa[i], quantity: e.target.value }; setEditForm(f => ({ ...f, stock_assignments: sa })); }} />
                    <div className="flex gap-1 items-center">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Branch</label>
                        <select value={a.branch} onChange={e => { const sa = [...editForm.stock_assignments]; sa[i] = { ...sa[i], branch: e.target.value }; setEditForm(f => ({ ...f, stock_assignments: sa })); }}
                          className="w-full px-2 py-1.5 rounded-lg border border-gray-300 text-xs">
                          <option value="all">All Branches</option>
                          {BRANCH_DETAILS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      </div>
                      {i > 0 && <button type="button" onClick={() => { const sa = [...editForm.stock_assignments]; sa.splice(i, 1); setEditForm(f => ({ ...f, stock_assignments: sa })); }}
                        className="text-red-400 hover:text-red-600 mt-4 shrink-0">✕</button>}
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => setEditForm(f => ({ ...f, stock_assignments: [...(f.stock_assignments || []), { product: '', quantity: '', branch: 'all' }] }))}
                  className="text-xs text-purple-700 hover:underline mt-1">+ Add Product</button>
              </div>
              <div className="flex gap-3 pt-2 border-t border-gray-100">
                <Button type="submit" disabled={editSubmitting}>{editSubmitting ? 'Saving…' : '✓ Save Changes'}</Button>
                <Button variant="ghost" type="button" onClick={() => setEditingCampaign(null)}>Cancel</Button>
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
            const isBeingEdited = editingCampaign?.id === c.id;
            return (
              <div key={c.id} className="rounded-xl border-2 overflow-hidden" style={{ borderColor: isBeingEdited ? '#6366f1' : cColors.border, background: isBeingEdited ? '#eef2ff' : cColors.bg }}>
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
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => isBeingEdited ? setEditingCampaign(null) : openEdit(c)}
                        style={{ padding: '5px 12px', background: isBeingEdited ? '#e0e7ff' : '#f1f5f9', color: isBeingEdited ? '#4f46e5' : '#475569', border: `1px solid ${isBeingEdited ? '#a5b4fc' : '#e2e8f0'}`, borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
                        {isBeingEdited ? '✕ Cancel Edit' : '✏️ Edit'}
                      </button>
                      <button onClick={() => handleDelete(c)}
                        style={{ padding: '5px 12px', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
                        🗑️ Delete
                      </button>
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
      <div>
        <label style={{ display:'block', fontSize:'0.78rem', fontWeight:700, color:'#374151', marginBottom:4 }}>Qualifying Products <span style={{ fontWeight:400, color:'#94a3b8' }}>(leave blank = all products)</span></label>
        <input list="camp-cond-products" value={conditions.products_text || ''} onChange={e => set('products_text', e.target.value)}
          placeholder="Type to search or enter product name…"
          style={{ width:'100%', padding:'7px 10px', border:'1.5px solid #d1d5db', borderRadius:8, fontSize:'0.83rem', outline:'none', boxSizing:'border-box' }} />
        <datalist id="camp-cond-products">
          {products.map(p => { const n = p.description || p.name || p.product_name || ''; return n ? <option key={n} value={n} /> : null; })}
        </datalist>
        <div style={{ fontSize:'0.7rem', color:'#94a3b8', marginTop:3 }}>You can enter multiple names separated by commas</div>
      </div>
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
      <div>
        <label style={{ display:'block', fontSize:'0.78rem', fontWeight:700, color:'#374151', marginBottom:4 }}>Free Product <span style={{ fontWeight:400, color:'#94a3b8' }}>(leave blank = same as paid product)</span></label>
        <input list="camp-prize-products" value={prize.free_product || ''} onChange={e => set('free_product', e.target.value)}
          placeholder="Type to search product…"
          style={{ width:'100%', padding:'7px 10px', border:'1.5px solid #d1d5db', borderRadius:8, fontSize:'0.83rem', outline:'none', boxSizing:'border-box' }} />
        <datalist id="camp-prize-products">
          {products.map(p => { const n = p.description || p.name || p.product_name || ''; return n ? <option key={n} value={n} /> : null; })}
        </datalist>
      </div>
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

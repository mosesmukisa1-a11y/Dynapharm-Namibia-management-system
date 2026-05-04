import { useState, useEffect, useRef, useMemo, useCallback, useContext, createContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { enqueue, generateOfflineId } from '../../lib/offlineQueue.js';
import { warmCache, addToCache, searchCache } from '../../lib/distributorCache.js';
import { useOffline } from '../../lib/OfflineProvider.jsx';
import { useStockRealtime } from '../../hooks/useStockRealtime';
import DistributorPerformanceTab from '../../components/DistributorPerformanceTab';
import DispatchNote from '../../components/DispatchNote';
import { formatCurrency, formatDateTime, formatDate, BRANCHES, COMPANY_INFO, BRANCH_DETAILS, getBranchDisplayName, getBranchId } from '../../lib/constants';
import { enrichProductsWithPricing, calculateCartTotals, generateReceiptNumber, PACKAGE_DATABASE, findProductPrice, calculatePrescriptionTotals, getConsultationFee, getPackagesForPOS, setLivePrices, getLiveProductList } from '../../lib/pricing';
import { generateReceiptHTML, printReceipt, generateSalesPDFHTML, printSalesPDF, generatePrescriptionQuoteHTML, generatePrescriptionQuotePDFHTML } from '../../lib/receipt';
import { Tabs, Card, CardBody, CardHeader, Button, Input, Badge, LoadingSpinner, EmptyState, StatCard, Table, Modal, Alert, Select, Textarea } from '../../components/ui';
import { ShoppingCart, FileText, Package, Landmark, CreditCard, ClipboardList, Gift, MessageSquare, Users, UserPlus, Map, Printer, AlertTriangle, Search, ArrowRightLeft, Trash2, RotateCcw, Heart, CheckCircle, Calendar, Megaphone, Clock, XCircle, Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { MembershipAgreementForm } from '../../components/MembershipAgreementForm';
import StaffMessagesTab from '../../components/StaffMessagesTab';
import BarcodeScanner from '../../components/BarcodeScanner';

const DEFAULT_REFERRAL = { name: 'Dynapharm Namibia', nb_number: 'NB005676', id: 'DEFAULT_REFERRAL' };

const PortalBranchContext = createContext(null);

const fmtLocation = (loc) => {
  if (!loc) return '—';
  const map = {
    country_stock: 'Country Stock', windhoek_warehouse: 'Windhoek Warehouse', ondangwa_warehouse: 'Ondangwa Warehouse',
    townshop: 'Windhoek CBD', windhoek_cbd: 'Windhoek CBD', windhoek: 'Windhoek CBD',
    oshakati_branch: 'Oshakati', hochland_park: 'Hochlandpark', 'hochland-park': 'Hochlandpark',
    walvisbay: 'Walvis Bay', katima: 'Katima Mulilo', katima_mulilo: 'Katima Mulilo',
  };
  const key = loc.toLowerCase().replace(/\s+/g, '_');
  if (map[key]) return map[key];
  if (map[loc.toLowerCase()]) return map[loc.toLowerCase()];
  return getBranchDisplayName(loc) || loc.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

function SalesReviewTab() {
  const portalBranch = useContext(PortalBranchContext);
  const { user } = useAuth();
  const effectiveBranchForReview = portalBranch || user?.branch || null;
  const todayISO = new Date().toISOString().slice(0, 10);
  const [salesPreviewFrom, setSalesPreviewFrom] = useState(todayISO);
  const [salesPreviewTo, setSalesPreviewTo] = useState(todayISO);
  const [salesPreviewData, setSalesPreviewData] = useState(null);
  const [salesPreviewLoading, setSalesPreviewLoading] = useState(false);
  const [salesPreviewError, setSalesPreviewError] = useState(null);

  const [showProductReport, setShowProductReport] = useState(false);
  const [productDate, setProductDate] = useState(todayISO);
  const [productData, setProductData] = useState(null);
  const [productLoading, setProductLoading] = useState(false);
  const [productError, setProductError] = useState(null);

  const fmtN = (n) => `N$ ${Math.round(Number(n || 0)).toLocaleString('en-ZA')}`;
  const fmtBV = (n) => Number(n || 0).toFixed(1);
  const branchLabel = (id) => getBranchDisplayName(id) || id || '—';

  useEffect(() => {
    setSalesPreviewData(null);
  }, [portalBranch]);

  const loadPreview = async () => {
    if (!salesPreviewFrom || !salesPreviewTo) return;
    setSalesPreviewLoading(true);
    setSalesPreviewError(null);
    try {
      const params = { from: salesPreviewFrom, to: salesPreviewTo };
      if (effectiveBranchForReview) params.branch = effectiveBranchForReview;
      const data = await api.reports.branchSalesSummary(params);
      setSalesPreviewData(data);
    } catch (err) {
      setSalesPreviewError(err.message || 'Failed to load sales data');
    } finally {
      setSalesPreviewLoading(false);
    }
  };

  const loadProductReport = async (date) => {
    setProductLoading(true);
    setProductError(null);
    try {
      const params = { date };
      if (effectiveBranchForReview) params.branch_id = effectiveBranchForReview;
      const data = await api.reports.branchDailyProducts(params);
      setProductData(data);
    } catch (err) {
      setProductError(err.message || 'Failed to load product report');
    } finally {
      setProductLoading(false);
    }
  };

  const printProductReport = () => {
    if (!productData) return;
    const branchName = effectiveBranchForReview ? (getBranchDisplayName(effectiveBranchForReview) || effectiveBranchForReview) : 'All Branches';
    const fmtC = (n) => `N$ ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const products = productData.products || [];
    const totals = productData.totals || {};
    const rows = products.map((p, i) =>
      `<tr style="background:${i % 2 === 0 ? '#fff' : '#fdf7f8'}">
        <td style="padding:7px 10px;border-bottom:1px solid #f0e8ea;font-size:10px">${i + 1}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f0e8ea;font-size:10px;font-weight:600">${p.product_name || '—'}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f0e8ea;font-size:10px;text-align:right;font-weight:700">${Number(p.total_qty).toLocaleString()}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f0e8ea;font-size:10px;text-align:right;font-weight:700;color:#166534">${fmtC(p.dp_amount)}</td>
        <td style="padding:7px 10px;border-bottom:1px solid #f0e8ea;font-size:10px;text-align:right;font-weight:700;color:#1d4ed8">${Number(p.bv_total).toFixed(1)}</td>
      </tr>`
    ).join('');
    const now = new Date();
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Daily Product Sales — ${productData.date}</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;padding:24px}.print-btn{position:fixed;top:12px;right:12px;background:#c41e3a;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:700;cursor:pointer}@media print{.print-btn{display:none}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}body{padding:10px}}</style>
    </head><body>
    <button class="print-btn" onclick="window.print()">Print</button>
    <div style="border-bottom:3px solid #c41e3a;padding-bottom:10px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="color:#c41e3a;font-weight:900;font-size:15px">DYNAPHARM INTERNATIONAL NAMIBIA</div>
        <div style="font-size:13px;font-weight:800;color:#8b0000;margin-top:4px">Daily Product Sales Report</div>
        <div style="color:#64748b;font-size:10px;margin-top:3px">${branchName} &nbsp;·&nbsp; ${productData.date}</div>
      </div>
      <div style="text-align:right;color:#64748b;font-size:10px;line-height:1.7">
        Date: ${now.toLocaleDateString('en-NA', { day: '2-digit', month: 'long', year: 'numeric' })}<br>
        Generated by: Branch Portal
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:0">
      <thead>
        <tr style="background:#c41e3a;color:#fff">
          <th style="padding:8px 10px;font-size:10px;text-align:left">#</th>
          <th style="padding:8px 10px;font-size:10px;text-align:left">Product Name</th>
          <th style="padding:8px 10px;font-size:10px;text-align:right">Qty Sold</th>
          <th style="padding:8px 10px;font-size:10px;text-align:right">DP Amount</th>
          <th style="padding:8px 10px;font-size:10px;text-align:right">BV Total</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:20px">No products sold</td></tr>'}</tbody>
      <tfoot>
        <tr style="background:#1e293b;color:#fff">
          <td colspan="2" style="padding:10px;font-size:11px;font-weight:800">TOTAL</td>
          <td style="padding:10px;text-align:right;font-size:11px;font-weight:800">${Number(totals.total_qty || 0).toLocaleString()}</td>
          <td style="padding:10px;text-align:right;font-size:11px;font-weight:900;color:#fbbf24">${fmtC(totals.dp_amount)}</td>
          <td style="padding:10px;text-align:right;font-size:11px;font-weight:900;color:#93c5fd">${Number(totals.bv_total || 0).toFixed(1)}</td>
        </tr>
      </tfoot>
    </table>
    <div style="font-size:9px;color:#94a3b8;text-align:center;margin-top:8px">DP = Distributor Price &nbsp;·&nbsp; BV = Business Volume</div>
    </body></html>`);
    win.document.close();
  };

  const rows = salesPreviewData?.rows || [];
  const grandTotal    = rows.reduce((s, r) => s + Number(r.total_revenue || 0), 0);
  const grandTx       = rows.reduce((s, r) => s + Number(r.transactions || 0), 0);
  // Walk-in Sales = ALL sales entered through the Walk-in tab (member + non-member combined)
  const grandWalkIn   = rows.reduce((s, r) => s + Number(r.member_total || 0) + Number(r.non_member_total || 0), 0);
  // Prescription Sales = all Prescription tab sales (paid / marked as paid)
  const grandRx       = rows.reduce((s, r) => s + Number(r.rx_total || 0), 0);
  // Campaign Sales = sold separately on POS
  const grandCampaign = rows.reduce((s, r) => s + Number(r.campaign_total || 0), 0);
  const grandConsult  = rows.reduce((s, r) => s + Number(r.consult_total || 0), 0);
  const grandRefund   = rows.reduce((s, r) => s + Number(r.refund_deductions || 0), 0);
  const thS = { padding: '9px 12px', textAlign: 'left', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '.04em', color: '#fff', background: '#c41e3a', whiteSpace: 'nowrap' };
  const thR = { ...thS, textAlign: 'right' };
  const tdS = { padding: '9px 12px', fontSize: '0.85rem', borderBottom: '1px solid #f0e8ea', color: '#1e293b', whiteSpace: 'nowrap' };
  const tdR = { ...tdS, textAlign: 'right', fontWeight: 700 };

  return (
    <Card>
      <CardHeader>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 className="font-bold text-gray-800 m-0">📈 Sales Review</h3>
            <p className="text-xs text-gray-500 m-0 mt-1">
              {effectiveBranchForReview
                ? <>Showing sales for <strong style={{ color: '#c41e3a' }}>{getBranchDisplayName(effectiveBranchForReview)}</strong> only</>
                : 'Select a date range to view sales totals across all branches'}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 20, padding: '14px 16px', background: '#fdf7f8', borderRadius: 10, border: '1px solid #f0e8ea' }}>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c41e3a', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>From</div>
            <input type="date" value={salesPreviewFrom} onChange={e => setSalesPreviewFrom(e.target.value)}
              style={{ padding: '8px 12px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.87rem', outline: 'none', cursor: 'pointer' }} />
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c41e3a', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>To</div>
            <input type="date" value={salesPreviewTo} onChange={e => setSalesPreviewTo(e.target.value)}
              style={{ padding: '8px 12px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.87rem', outline: 'none', cursor: 'pointer' }} />
          </div>
          <button onClick={loadPreview} disabled={salesPreviewLoading || !salesPreviewFrom || !salesPreviewTo}
            style={{ padding: '9px 22px', background: salesPreviewLoading ? '#fecaca' : 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 800, fontSize: '0.87rem', cursor: 'pointer', opacity: salesPreviewLoading ? 0.7 : 1 }}>
            {salesPreviewLoading ? '⏳ Loading…' : 'Apply'}
          </button>
        </div>

        {salesPreviewError && (
          <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#c41e3a', fontSize: '0.87rem', marginBottom: 16 }}>
            ⚠️ {salesPreviewError}
          </div>
        )}

        {!salesPreviewData && !salesPreviewLoading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📅</div>
            <div style={{ fontWeight: 600 }}>Select a date range and click Apply to load branch sales</div>
          </div>
        )}

        {salesPreviewData && rows.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📭</div>
            <div style={{ fontWeight: 600 }}>No sales recorded for {salesPreviewData.from} – {salesPreviewData.to}</div>
          </div>
        )}

        {rows.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 10 }}>
              Period: <strong>{salesPreviewData.from}</strong> to <strong>{salesPreviewData.to}</strong>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px rgba(196,30,58,0.08)' }}>
              <thead>
                <tr>
                  <th style={thS}>Branch</th>
                  <th style={thR}>Transactions</th>
                  <th style={{ ...thR, background: '#1d6fa4' }}>Walk-in Sales (DP)</th>
                  <th style={{ ...thR, background: '#15803d' }}>Prescription Sales (DP)</th>
                  <th style={{ ...thR, background: '#b45309' }}>Campaign Sales</th>
                  <th style={thR}>Consultation Fees</th>
                  <th style={{ ...thR, background: '#dc2626' }}>Refund Deductions</th>
                  <th style={{ ...thR, background: '#8b0000' }}>Total DP Sales</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const rowWalkIn = Number(r.member_total || 0) + Number(r.non_member_total || 0);
                  return (
                  <tr key={r.branch_id || i} style={{ background: i % 2 === 0 ? '#fff' : '#fdf7f8' }}>
                    <td style={tdS}><strong>{branchLabel(r.branch_id)}</strong></td>
                    <td style={tdR}>{Number(r.transactions || 0).toLocaleString()}</td>
                    <td style={{ ...tdR, color: '#1d6fa4' }}>{fmtN(rowWalkIn)}</td>
                    <td style={{ ...tdR, color: '#15803d' }}>{fmtN(r.rx_total)}</td>
                    <td style={{ ...tdR, color: '#b45309' }}>{fmtN(r.campaign_total)}</td>
                    <td style={tdR}>{fmtN(r.consult_total)}</td>
                    <td style={{ ...tdR, color: Number(r.refund_deductions || 0) > 0 ? '#dc2626' : '#94a3b8' }}>
                      {Number(r.refund_deductions || 0) > 0 ? `− ${fmtN(r.refund_deductions)}` : '—'}
                    </td>
                    <td style={{ ...tdR, color: '#c41e3a', fontWeight: 900, fontSize: '0.95rem' }}>{fmtN(r.total_revenue)}</td>
                  </tr>
                  );
                })}
                <tr style={{ background: '#1e293b' }}>
                  <td style={{ ...tdS, color: '#fff', fontWeight: 800, background: 'transparent' }}>TOTAL</td>
                  <td style={{ ...tdR, color: '#fff', background: 'transparent' }}>{grandTx.toLocaleString()}</td>
                  <td style={{ ...tdR, color: '#93c5fd', background: 'transparent' }}>{fmtN(grandWalkIn)}</td>
                  <td style={{ ...tdR, color: '#86efac', background: 'transparent' }}>{fmtN(grandRx)}</td>
                  <td style={{ ...tdR, color: '#fcd34d', background: 'transparent' }}>{fmtN(grandCampaign)}</td>
                  <td style={{ ...tdR, color: '#cbd5e1', background: 'transparent' }}>{fmtN(grandConsult)}</td>
                  <td style={{ ...tdR, color: grandRefund > 0 ? '#fca5a5' : '#94a3b8', background: 'transparent' }}>
                    {grandRefund > 0 ? `− ${fmtN(grandRefund)}` : '—'}
                  </td>
                  <td style={{ ...tdR, color: '#fbbf24', fontWeight: 900, fontSize: '1rem', background: 'transparent' }}>{fmtN(grandTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* ── Daily Product Sales Report ── */}
        <div style={{ marginTop: 28, borderTop: '2px dashed #f0e8ea', paddingTop: 20 }}>
          <button
            onClick={() => {
              const next = !showProductReport;
              setShowProductReport(next);
              if (next && !productData) loadProductReport(productDate);
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 20px', border: '1.5px solid #c41e3a',
              borderRadius: 9, background: showProductReport ? 'linear-gradient(135deg,#c41e3a,#8b0000)' : '#fff',
              color: showProductReport ? '#fff' : '#c41e3a',
              fontWeight: 800, fontSize: '0.87rem', cursor: 'pointer',
            }}
          >
            <span>📦</span>
            {showProductReport ? 'Hide Product Sales Report' : 'Daily Product Sales Report'}
          </button>

          {showProductReport && (
            <div style={{ marginTop: 16 }}>
              {/* Date + Load controls */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16, padding: '12px 16px', background: '#fdf7f8', borderRadius: 10, border: '1px solid #f0e8ea' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#c41e3a', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 5 }}>Date</div>
                  <input
                    type="date"
                    value={productDate}
                    max={todayISO}
                    onChange={e => setProductDate(e.target.value)}
                    style={{ padding: '8px 12px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.87rem', outline: 'none', cursor: 'pointer' }}
                  />
                </div>
                <button
                  onClick={() => loadProductReport(productDate)}
                  disabled={productLoading}
                  style={{ padding: '9px 20px', background: productLoading ? '#fecaca' : 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 800, fontSize: '0.87rem', cursor: 'pointer', opacity: productLoading ? 0.7 : 1 }}
                >
                  {productLoading ? '⏳ Loading…' : 'Load'}
                </button>
                {productData && !productLoading && (
                  <button
                    onClick={printProductReport}
                    style={{ padding: '9px 18px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                  >
                    🖨 Print
                  </button>
                )}
              </div>

              {productError && (
                <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#c41e3a', fontSize: '0.85rem', marginBottom: 12 }}>
                  ⚠️ {productError}
                </div>
              )}

              {productData && (
                <>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 10 }}>
                    Products sold on <strong>{productData.date}</strong>
                    {productData.products?.length === 0 && ' — no movements recorded'}
                  </div>
                  {productData.products?.length > 0 && (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: 10, overflow: 'hidden', boxShadow: '0 2px 8px rgba(196,30,58,0.08)', fontSize: '0.85rem' }}>
                        <thead>
                          <tr>
                            <th style={{ ...thS, width: 32 }}>#</th>
                            <th style={thS}>Product Name</th>
                            <th style={thR}>Qty Sold</th>
                            <th style={{ ...thR, background: '#166534' }}>DP Amount</th>
                            <th style={{ ...thR, background: '#1d4ed8' }}>BV Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {productData.products.map((p, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fdf7f8' }}>
                              <td style={{ ...tdS, color: '#94a3b8', fontSize: '0.78rem' }}>{i + 1}</td>
                              <td style={{ ...tdS, fontWeight: 600 }}>{p.product_name}</td>
                              <td style={{ ...tdR }}>{Number(p.total_qty).toLocaleString()}</td>
                              <td style={{ ...tdR, color: '#166534' }}>{fmtN(p.dp_amount)}</td>
                              <td style={{ ...tdR, color: '#1d4ed8' }}>{fmtBV(p.bv_total)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: '#1e293b' }}>
                            <td colSpan={2} style={{ ...tdS, color: '#fff', fontWeight: 800, background: 'transparent' }}>TOTAL</td>
                            <td style={{ ...tdR, color: '#fff', fontWeight: 900, background: 'transparent' }}>{Number(productData.totals?.total_qty || 0).toLocaleString()}</td>
                            <td style={{ ...tdR, color: '#fbbf24', fontWeight: 900, fontSize: '0.95rem', background: 'transparent' }}>{fmtN(productData.totals?.dp_amount)}</td>
                            <td style={{ ...tdR, color: '#93c5fd', fontWeight: 900, background: 'transparent' }}>{fmtBV(productData.totals?.bv_total)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

export default function BranchPortal() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('walkIn');
  const isAdmin = user?.role === 'admin';
  const isBranchManager = user?.role === 'branch_manager';
  const [selectedPortalBranch, setSelectedPortalBranch] = useState('');
  const [unreadComms, setUnreadComms] = useState(0);
  const effectiveBranch = selectedPortalBranch || user?.branch || '';
  const displayBranchName = getBranchDisplayName(effectiveBranch) || effectiveBranch || 'Branch Portal';
  const displayUserName = user?.fullName || user?.full_name || user?.name || user?.username || 'Staff';
  const displayRole = user?.role === 'dispenser' ? 'Dispenser' : user?.role === 'branch_manager' ? 'Branch Manager' : user?.role === 'admin' ? 'Administrator' : (user?.role || 'Staff');

  useEffect(() => {
    api.notifications.list('unread=true')
      .then(d => {
        const all = Array.isArray(d) ? d : d.notifications || [];
        const count = all.filter(n =>
          n.recipient_type === 'announcement' ||
          n.recipient_type === 'branch_alert' ||
          n.recipient_type === 'branch_notice'
        ).length;
        setUnreadComms(count);
      })
      .catch(() => {});
  }, []);

  const tabs = [
    { id: 'walkIn', label: 'Walk-in Sales', icon: '🛒' },
    { id: 'prescriptions', label: 'Prescriptions', icon: '💊' },
    { id: 'stock', label: 'Stock', icon: '📦' },
    { id: 'banking', label: 'Banking', icon: '🏦' },
    { id: 'payments', label: 'Payments', icon: '💳' },
    { id: 'distProfit', label: 'Distributor Profit', icon: '💰' },
    { id: 'onlineOrders', label: 'Online Orders', icon: '🛍️' },
    { id: 'bonus', label: 'Bonus', icon: '🎁' },
    { id: 'communication', label: unreadComms > 0 ? `Communication (${unreadComms})` : 'Communication', icon: '💬' },
    { id: 'staff', label: 'Staff', icon: '👤' },
    { id: 'messages', label: 'My Messages', icon: '📨' },
    { id: 'registration', label: 'Distributor Registration', icon: '📝' },
    { id: 'outsideReg', label: 'Outside Registrations', icon: '📋' },
    { id: 'fieldProgram', label: 'Field Program', icon: '🚐' },
    { id: 'distributorPerf', label: 'Distributor Performance', icon: '👥' },
    { id: 'salesReview', label: 'Sales Review', icon: '📈' },
    { id: 'refunds', label: 'Refund Requests', icon: '↩️' },
    { id: 'checkup', label: 'Check Up Booking', icon: '🩺' },
    { id: 'campaigns', label: 'Campaigns', icon: '📢' },
    { id: 'training', label: 'Training', icon: '🎓' },
    { id: 'priceList', label: 'Price List', icon: '💲' },
  ];

  return (
    <PortalBranchContext.Provider value={selectedPortalBranch || null}>
      <div>
        {/* ── Branded Portal Header ── */}
        <div style={{ background: 'linear-gradient(135deg,#8b0000 0%,#c41e3a 55%,#a01530 100%)', borderRadius: 16, padding: '0', marginBottom: 20, overflow: 'hidden', boxShadow: '0 6px 28px rgba(139,0,0,0.22)' }}>
          <div style={{ padding: '18px 24px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.18)' }}>
                <span style={{ fontSize: '1.6rem' }}>🏬</span>
              </div>
              <div>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 2 }}>DYNAPHARM INTERNATIONAL NAMIBIA</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{displayBranchName}</div>
                <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>Branch Operations Portal</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 2 }}>Logged in as</div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>{displayUserName}</div>
              <div style={{ display: 'inline-block', marginTop: 4, padding: '2px 10px', background: 'rgba(255,255,255,0.15)', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.2)' }}>{displayRole}</div>
            </div>
          </div>

          {/* Admin branch selector strip */}
          {isAdmin && (
            <div style={{ margin: '14px 24px 18px', padding: '10px 14px', background: 'rgba(0,0,0,0.18)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap' }}>Act as Branch</span>
              <select
                value={selectedPortalBranch}
                onChange={e => setSelectedPortalBranch(e.target.value)}
                style={{ flex: 1, maxWidth: 260, padding: '6px 10px', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 7, fontSize: '0.86rem', outline: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer' }}
              >
                <option value="" style={{ background: '#8b0000' }}>— Select branch —</option>
                {BRANCH_DETAILS.map(b => (
                  <option key={b.id} value={b.id} style={{ background: '#8b0000' }}>{b.name}</option>
                ))}
              </select>
              {effectiveBranch && (
                <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.75)', whiteSpace: 'nowrap' }}>
                  Acting as <strong style={{ color: '#fff' }}>{getBranchDisplayName(effectiveBranch)}</strong>
                </span>
              )}
            </div>
          )}
          {!isAdmin && (
            <div style={{ padding: '8px 24px 14px', fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>
              📍 Data is restricted to <strong style={{ color: 'rgba(255,255,255,0.8)' }}>{displayBranchName}</strong> only
            </div>
          )}
        </div>

        <div className="flex gap-2 mb-8 overflow-x-auto pb-1 flex-wrap" style={{ borderBottom: '3px solid #c41e3a' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-4 py-3 text-sm font-medium rounded-t-lg whitespace-nowrap cursor-pointer transition-all"
              style={activeTab === tab.id
                ? { background: 'linear-gradient(135deg, #3498db, #2980b9)', color: 'white', fontWeight: 600, boxShadow: '0 2px 8px rgba(52,152,219,0.2)' }
                : { background: 'transparent', color: '#64748b', border: 'none' }
              }
            >
              <span className="mr-1.5">{tab.icon}</span>{tab.label}
            </button>
          ))}
        </div>
        <div>
          {activeTab === 'walkIn' && <WalkInSalesTab />}
          {activeTab === 'prescriptions' && <PrescriptionsTab />}
          {activeTab === 'stock' && <BranchStockTab />}
          {activeTab === 'banking' && <BankingTab />}
          {activeTab === 'payments' && <BranchPaymentsTab />}
          {activeTab === 'distProfit' && <DistributorProfitTab />}
          {activeTab === 'onlineOrders' && <OnlineOrdersTab />}
          {activeTab === 'bonus' && <BonusTab />}
          {activeTab === 'communication' && <CommunicationTab />}
          {activeTab === 'staff' && <StaffTab />}
          {activeTab === 'messages' && <StaffMessagesTab />}
          {activeTab === 'registration' && <DistributorRegTab />}
          {activeTab === 'outsideReg' && <OutsideRegistrationsTab />}
          {activeTab === 'fieldProgram' && <FieldProgramTab />}
          {activeTab === 'distributorPerf' && <DistributorPerformanceTabWrapper />}
          {activeTab === 'salesReview' && <SalesReviewTab />}
          {activeTab === 'refunds' && <RefundRequestsTab />}
          {activeTab === 'checkup' && <CheckUpBookingTab />}
          {activeTab === 'campaigns' && <BranchCampaignsTab />}
          {activeTab === 'training' && <BranchTrainingTab />}
          {activeTab === 'priceList' && <BranchPriceListTab />}
        </div>
      </div>
    </PortalBranchContext.Provider>
  );
}

function DistributorPerformanceTabWrapper() {
  const { user } = useAuth();
  return <DistributorPerformanceTab branchFilter={user?.branch || null} title="Distributor Performance" />;
}

function printPriceListDoc(products) {
  const win = window.open('', '_blank');
  if (!win) return;
  const rows = products.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${p.description}</td>
      <td style="text-align:right">${Number(p.dp||0).toFixed(0)}</td>
      <td style="text-align:right">${Number(p.cp||0).toFixed(0)}</td>
      <td style="text-align:right">${Number(p.bv||0).toFixed(0)}</td>
      <td style="text-align:right;color:#16a34a;font-weight:700">${(Number(p.cp||0) - Number(p.dp||0)).toFixed(0)}</td>
    </tr>`).join('');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Dynapharm Price List</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size: 10px; color: #1e293b; padding: 24px; }
    .header { border-bottom: 3px solid #c41e3a; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-start; }
    .company { color: #c41e3a; font-weight: 900; font-size: 15px; }
    .sub { color: #64748b; font-size: 9px; margin-top: 3px; }
    .source { color: #7c3aed; font-size: 8px; margin-top: 2px; font-style: italic; }
    .meta { text-align: right; font-size: 9px; color: #64748b; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #c41e3a; color: #fff; font-weight: 700; padding: 6px 8px; text-align: left; font-size: 9px; text-transform: uppercase; }
    th.num { text-align: right; }
    td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; font-size: 9.5px; }
    tr:nth-child(even) td { background: #fdf7f8; }
    .dp-col { color: #991b1b; font-weight: 700; }
    .cp-col { color: #1e40af; font-weight: 700; }
    .margin-col { color: #15803d; font-weight: 700; }
    .print-btn { position:fixed; top:10px; right:10px; background:#c41e3a; color:#fff; border:none; padding:7px 16px; border-radius:7px; font-weight:700; cursor:pointer; font-size:11px; }
    .footer { margin-top:14px; font-size:8.5px; color:#94a3b8; text-align:center; border-top:1px dashed #e2e8f0; padding-top:8px; }
    .legend { display:flex; gap:16px; flex-wrap:wrap; justify-content:center; }
    @media print { .print-btn { display:none; } * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style></head><body>
  <button class="print-btn" onclick="window.print()">🖨️ Print</button>
  <div class="header">
    <div>
      <div class="company">Uganam Dynapharm Namibia</div>
      <div class="sub">Official Price List — ${new Date().toLocaleDateString('en-NA', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
      <div class="source">Prices sourced from GM Master Price List</div>
    </div>
    <div class="meta">${products.length} products &nbsp;·&nbsp; All prices in NAD (N$) &nbsp;·&nbsp; Staff reference only</div>
  </div>
  <table>
    <thead><tr>
      <th style="width:30px">#</th>
      <th>Product Description</th>
      <th class="num" title="Distributor Price — charged to registered members">DP — Member (N$)</th>
      <th class="num" title="Consumer Price — charged to walk-in clients">CP — Walk-in (N$)</th>
      <th class="num">BV</th>
      <th class="num" style="color:#bbf7d0" title="Branch margin per unit sold at CP">Margin (CP−DP)</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">
    <div class="legend">
      <span><strong>DP</strong> = Distributor Price (Member rate)</span>
      <span><strong>CP</strong> = Consumer Price (Walk-in rate)</span>
      <span><strong>BV</strong> = Business Volume points</span>
      <span><strong>Margin</strong> = Branch profit per unit when selling at CP</span>
    </div>
  </div>
  </body></html>`);
  win.document.close();
}

function BranchPriceListTab() {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState([]);

  useEffect(() => {
    const list = getLiveProductList().filter(p => !p.is_package);
    if (list.length > 0) {
      setProducts(list);
    } else {
      api.prices.list().then(data => {
        if (Array.isArray(data)) setProducts(data.filter(p => !p.is_package));
      }).catch(() => {});
    }
  }, []);

  const filtered = products.filter(p =>
    !search || (p.description || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-4 border-b" style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)' }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">💲 Official Price List</h2>
              <p className="text-xs text-red-100">{products.length} products &middot; Source: GM Master Price List &middot; <span style={{ color: '#fca5a5' }}>DP = Member rate &nbsp;·&nbsp; CP = Walk-in rate</span></p>
            </div>
            <button
              onClick={() => printPriceListDoc(filtered)}
              className="px-3 py-1.5 text-sm font-semibold rounded shadow"
              style={{ background: '#fff', color: '#c41e3a' }}
            >
              🖨️ Print Price List
            </button>
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
                  <th className="text-left py-2 px-3 border-b text-gray-600">Product</th>
                  <th className="text-right py-2 px-3 border-b" style={{ color: '#c41e3a' }} title="Distributor Price — applied to registered members">DP — Member (N$)</th>
                  <th className="text-right py-2 px-3 border-b" style={{ color: '#1d4ed8' }} title="Consumer Price — applied to walk-in clients">CP — Walk-in (N$)</th>
                  <th className="text-right py-2 px-3 border-b text-gray-500">BV</th>
                  <th className="text-right py-2 px-3 border-b" style={{ color: '#15803d' }} title="Branch margin when selling at CP = CP − DP">Margin (CP−DP)</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-gray-400">{search ? 'No products match your search.' : 'Price list loading…'}</td></tr>
                )}
                {filtered.map((p, i) => {
                  const dp     = Number(p.dp) || 0;
                  const cp     = Number(p.cp) || 0;
                  const margin = cp - dp;
                  return (
                    <tr key={p.id || i} className={`border-b hover:bg-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}>
                      <td className="py-2 px-3 font-medium text-gray-800">{p.description}</td>
                      <td className="py-2 px-3 text-right font-bold text-red-700">{formatCurrency(dp)}</td>
                      <td className="py-2 px-3 text-right font-bold text-blue-700">{formatCurrency(cp)}</td>
                      <td className="py-2 px-3 text-right"><span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{Number(p.bv) || 0}</span></td>
                      <td className="py-2 px-3 text-right font-semibold text-green-700">{margin > 0 ? `+${formatCurrency(margin)}` : formatCurrency(margin)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-4 mt-3 text-xs text-gray-500">
            <span><strong style={{ color: '#c41e3a' }}>DP</strong> = Distributor / Member Price</span>
            <span><strong style={{ color: '#1d4ed8' }}>CP</strong> = Consumer / Walk-in Price</span>
            <span><strong>BV</strong> = Business Volume points</span>
            <span><strong style={{ color: '#15803d' }}>Margin</strong> = Branch profit per unit sold at CP</span>
            <span className="text-purple-600">Prices sourced from GM Master Price List — read-only</span>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

// ── Credit Refund Requests Tab ─────────────────────────────────────────────────
function RefundRequestsTab() {
  const portalBranch = useContext(PortalBranchContext);
  const { user } = useAuth();
  const effectiveBranch = portalBranch || user?.branch || '';

  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert]   = useState(null);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState({
    product_name: '', batch_no: '', quantity: '',
    unit_price: '', sale_reference: '', reason: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.branch.refundRequests(effectiveBranch ? { branch_id: effectiveBranch } : {});
      setRequests(data.requests || []);
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [effectiveBranch]);

  const fmtDate = ts => { try { return ts ? new Date(ts).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'; } catch { return '—'; } };
  const fmtN = n => `N$ ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const statusBadge = status => {
    const c = {
      pending:  ['#fffbeb', '#b45309', '#fde68a', '⏳ Pending Approval'],
      approved: ['#f0fdf4', '#16a34a', '#86efac', '✅ Approved'],
      rejected: ['#fef2f2', '#dc2626', '#fecaca', '❌ Rejected'],
    }[status] || ['#f1f5f9', '#64748b', '#e2e8f0', 'Unknown'];
    return <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '3px 10px', borderRadius: 99, background: c[0], color: c[1], border: `1px solid ${c[2]}` }}>{c[3]}</span>;
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!form.product_name || !form.quantity || !form.unit_price || !form.reason) {
      setAlert({ type: 'error', msg: 'Please fill in all required fields.' });
      return;
    }
    setSubmitting(true);
    try {
      await api.branch.submitRefundRequest({
        branch_id:     effectiveBranch,
        product_name:  form.product_name.trim(),
        batch_no:      form.batch_no.trim() || null,
        quantity:      parseFloat(form.quantity),
        unit_price:    parseFloat(form.unit_price),
        sale_reference: form.sale_reference.trim() || null,
        reason:        form.reason.trim(),
        requested_by:  user?.full_name || user?.username || 'Branch Staff',
      });
      setAlert({ type: 'success', msg: '✅ Refund request submitted — awaiting Stock Manager approval.' });
      setShowForm(false);
      setForm({ product_name: '', batch_no: '', quantity: '', unit_price: '', sale_reference: '', reason: '' });
      load();
    } catch (err) {
      setAlert({ type: 'error', msg: err.message });
    } finally { setSubmitting(false); }
  };

  const lblS = { display: 'block', fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 };
  const inpS = { width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.88rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', borderRadius: 14, padding: '16px 22px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ fontWeight: 900, fontSize: '1.08rem', margin: 0 }}>↩️ Credit Refund Requests</h3>
          <p style={{ fontSize: '0.8rem', opacity: 0.8, margin: '3px 0 0' }}>
            Submit product return / refund requests. Stock Manager approves — stock is restored and sales adjusted automatically.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} style={{ padding: '7px 14px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 99, fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>↺ Refresh</button>
          <button onClick={() => setShowForm(s => !s)} style={{ padding: '8px 18px', background: showForm ? 'rgba(255,255,255,0.15)' : '#fff', color: showForm ? '#fff' : '#8b0000', border: '1.5px solid rgba(255,255,255,0.5)', borderRadius: 99, fontWeight: 800, fontSize: '0.87rem', cursor: 'pointer' }}>
            {showForm ? '✕ Cancel' : '+ New Refund Request'}
          </button>
        </div>
      </div>

      {alert && <Alert type={alert.type} onClose={() => setAlert(null)}>{alert.msg}</Alert>}

      {/* New Refund Form */}
      {showForm && (
        <form onSubmit={handleSubmit} style={{ background: '#fdf7f8', border: '2px solid #fecaca', borderRadius: 14, padding: '22px 24px' }}>
          <div style={{ fontWeight: 900, color: '#8b0000', fontSize: '1rem', marginBottom: 18 }}>📋 New Credit Refund Request</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div>
              <label style={lblS}>Product Name *</label>
              <input value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} required placeholder="e.g. BEE POLLEN CAPSULE (100'S)" style={inpS} />
            </div>
            <div>
              <label style={lblS}>Batch No (optional)</label>
              <input value={form.batch_no} onChange={e => setForm(f => ({ ...f, batch_no: e.target.value }))} placeholder="e.g. BT-2024-001" style={inpS} />
            </div>
            <div>
              <label style={lblS}>Quantity to Refund *</label>
              <input type="number" min="0.01" step="0.01" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} required placeholder="e.g. 2" style={inpS} />
            </div>
            <div>
              <label style={lblS}>Unit Price N$ (DP) *</label>
              <input type="number" min="0" step="0.01" value={form.unit_price} onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))} required placeholder="e.g. 290.00" style={inpS} />
            </div>
            <div>
              <label style={lblS}>Original Receipt / Sale Ref (optional)</label>
              <input value={form.sale_reference} onChange={e => setForm(f => ({ ...f, sale_reference: e.target.value }))} placeholder="e.g. RCP-20260504-1234" style={inpS} />
            </div>
            {form.quantity && form.unit_price && (
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <div style={{ padding: '10px 16px', background: '#fff0f3', border: '2px solid #fecaca', borderRadius: 10, fontWeight: 900, color: '#c41e3a', fontSize: '1rem', width: '100%' }}>
                  Refund Amount: {fmtN(parseFloat(form.quantity || 0) * parseFloat(form.unit_price || 0))}
                </div>
              </div>
            )}
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={lblS}>Reason for Refund *</label>
            <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} required placeholder="Describe why the product is being returned / credit is required…" rows={3} style={{ ...inpS, resize: 'vertical' }} />
          </div>
          <div style={{ marginTop: 16 }}>
            <button type="submit" disabled={submitting} style={{ padding: '10px 28px', background: submitting ? '#fecaca' : 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: '0.92rem', cursor: submitting ? 'default' : 'pointer' }}>
              {submitting ? '⏳ Submitting…' : '📤 Submit Refund Request'}
            </button>
          </div>
        </form>
      )}

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
        {[
          { label: 'Pending Approval', value: requests.filter(r => r.status === 'pending').length, color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
          { label: 'Approved',         value: requests.filter(r => r.status === 'approved').length, color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
          { label: 'Rejected',         value: requests.filter(r => r.status === 'rejected').length, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
          { label: 'Total Submitted',  value: requests.length, color: '#374151', bg: '#f8fafc', border: '#e2e8f0' },
        ].map(s => (
          <div key={s.label} style={{ padding: '11px 14px', background: s.bg, border: `1.5px solid ${s.border}`, borderRadius: 10, textAlign: 'center' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: '0.69rem', color: '#64748b', fontWeight: 700, marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {['all', 'pending', 'approved', 'rejected'].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{ padding: '5px 14px', borderRadius: 99, border: '1.5px solid', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', borderColor: filter === s ? '#c41e3a' : '#e2e8f0', background: filter === s ? '#fff0f3' : '#fff', color: filter === s ? '#c41e3a' : '#64748b' }}>
            {s.charAt(0).toUpperCase() + s.slice(1)} ({s === 'all' ? requests.length : requests.filter(r => r.status === s).length})
          </button>
        ))}
      </div>

      {loading && <LoadingSpinner />}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>↩️</div>
          <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>No refund requests</div>
          <div style={{ fontSize: '0.85rem', marginTop: 4 }}>Use the button above to submit a new credit refund request.</div>
        </div>
      )}

      {filtered.length > 0 && (
        <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid #f0e8ea' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#c41e3a' }}>
                {['Date', 'Product', 'Qty', 'Unit Price', 'Refund Amount', 'Sale Ref', 'Reason', 'Status', 'Notes'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', color: '#fff', fontWeight: 700, fontSize: '0.72rem', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id} style={{ background: i % 2 === 0 ? '#fff' : '#fdf7f8' }}>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</td>
                  <td style={{ padding: '9px 12px', fontWeight: 700, maxWidth: 180 }}>{r.product_name}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right' }}>{Number(r.quantity)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right' }}>{fmtN(r.unit_price)}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 900, color: '#c41e3a' }}>{fmtN(r.refund_amount)}</td>
                  <td style={{ padding: '9px 12px', color: '#64748b', fontSize: '0.78rem' }}>{r.sale_reference || '—'}</td>
                  <td style={{ padding: '9px 12px', maxWidth: 200, color: '#475569', fontSize: '0.82rem' }}>{r.reason}</td>
                  <td style={{ padding: '9px 12px' }}>{statusBadge(r.status)}</td>
                  <td style={{ padding: '9px 12px', color: '#64748b', fontSize: '0.78rem', maxWidth: 150 }}>{r.rejection_reason || (r.approved_by ? `By: ${r.approved_by}` : '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function WalkInSalesTab() {
  const { user } = useAuth();
  const { isOnline } = useOffline();
  const portalBranch = useContext(PortalBranchContext);
  const effectiveBranch = portalBranch || user?.branch || '';
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [cart, setCart] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [customerType, setCustomerType] = useState('registered');
  const [regSearch, setRegSearch] = useState('');
  const [regResults, setRegResults] = useState([]);
  const [selectedReg, setSelectedReg] = useState(null);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [referralSearch, setReferralSearch] = useState('');
  const [referralResults, setReferralResults] = useState([]);
  const [selectedReferral, setSelectedReferral] = useState(null);
  const [noReferral, setNoReferral] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [salesSearch, setSalesSearch] = useState('');
  const [salesDateFrom, setSalesDateFrom] = useState('');
  const [salesDateTo, setSalesDateTo] = useState('');
  const [regFromCache, setRegFromCache] = useState(false);
  const [refFromCache, setRefFromCache] = useState(false);
  const [scanMode, setScanMode] = useState(false);

  const loadSales = (branch) =>
    api.branch.walkinSales(branch ? `branch_id=${branch}` : '')
      .then(d => setSales(Array.isArray(d) ? d : d.sales || [])).catch(() => {});

  useEffect(() => {
    warmCache(); // pre-warm the local distributor cache while online
    Promise.all([
      api.prices.list().catch(() => []),
      api.products.list().catch(() => []),
    ]).then(([priceData, productsData]) => {
      if (Array.isArray(priceData) && priceData.length > 0) setLivePrices(priceData);

      // Build product list: start from GM price list (source of truth), then append
      // any DB products that have no price-list entry (backward compat).
      const effectivePriceList = Array.isArray(priceData)
        ? priceData.filter(p => !p.is_package)
        : [];

      const dbProducts = Array.isArray(productsData) ? productsData : productsData.products || [];

      // Map price-list entries to POS product shape
      const priceListSet = new Set();
      const priceListProducts = effectivePriceList.map((p, idx) => {
        const key = (p.description || '').toUpperCase().trim();
        priceListSet.add(key);
        // Find matching DB product to inherit id, image, etc.
        const dbMatch = dbProducts.find(db =>
          (db.name || db.description || '').toUpperCase().trim() === key
        );
        return {
          ...(dbMatch || {}),
          id: dbMatch?.id || `pl-${idx}-${key.replace(/\W+/g, '-').toLowerCase()}`,
          name: p.description,
          description: p.description,
          dp: Number(p.dp) || 0,
          cp: Number(p.cp) || 0,
          bv: Number(p.bv) || 0,
          cif: Number(p.cif) || 0,
          hasPricing: true,
        };
      });

      const packages = getPackagesForPOS();
      setProducts([...priceListProducts, ...packages]);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadSales(portalBranch);
  }, [portalBranch]);

  const normalizeDistributor = (d) => ({
    ...d,
    id: d.id || d.distributorId || d.distributor_id || '',
    name: d.name || d.fullName || d.distributor_name || d.full_name || '',
    nb_number: d.nb_number || d.nbNumber || d.distributor_code || '',
    phone: d.phone || d.mobile_no || '',
  });

  const regSearchTimer = useRef(null);
  const searchRegistered = (q) => {
    setRegSearch(q);
    if (selectedReg) setSelectedReg(null);
    if (q.length < 2) { setRegResults([]); setRegFromCache(false); return; }
    if (regSearchTimer.current) clearTimeout(regSearchTimer.current);
    regSearchTimer.current = setTimeout(async () => {
      if (!navigator.onLine) {
        const cached = searchCache(q);
        setRegResults(cached);
        setRegFromCache(true);
        return;
      }
      try {
        const res = await api.distributors.search(q);
        const results = Array.isArray(res) ? res : res.distributors || [];
        setRegResults(results);
        setRegFromCache(false);
        if (results.length > 0) addToCache(results);
      } catch { setRegResults(searchCache(q)); setRegFromCache(true); }
    }, 300);
  };
  const selectRegistered = (d) => { const nd = normalizeDistributor(d); setSelectedReg(nd); setRegResults([]); setRegFromCache(false); setRegSearch(nd.nb_number && nd.name ? `${nd.nb_number} — ${nd.name}` : nd.name || nd.nb_number || ''); };
  const clearRegistered = () => { setSelectedReg(null); setRegSearch(''); setRegFromCache(false); };

  const refSearchTimer = useRef(null);
  const searchReferrals = (q) => {
    setReferralSearch(q);
    if (q.length < 2) { setReferralResults([]); setRefFromCache(false); return; }
    if (refSearchTimer.current) clearTimeout(refSearchTimer.current);
    refSearchTimer.current = setTimeout(async () => {
      if (!navigator.onLine) {
        const cached = searchCache(q);
        setReferralResults(cached);
        setRefFromCache(true);
        return;
      }
      try {
        const res = await api.distributors.search(q);
        const results = Array.isArray(res) ? res : res.distributors || [];
        setReferralResults(results);
        setRefFromCache(false);
        if (results.length > 0) addToCache(results);
      } catch { setReferralResults(searchCache(q)); setRefFromCache(true); }
    }, 300);
  };
  const selectReferral = (d) => { setSelectedReferral(normalizeDistributor(d)); setReferralResults([]); setRefFromCache(false); setReferralSearch(''); };
  const clearReferral = () => { setSelectedReferral(null); setReferralSearch(''); setRefFromCache(false); };

  const toggleNoReferral = (checked) => {
    setNoReferral(checked);
    if (checked) { setSelectedReferral(DEFAULT_REFERRAL); setReferralSearch(''); setReferralResults([]); }
    else { setSelectedReferral(null); }
  };

  const isMember = customerType === 'registered';
  const [productCategory, setProductCategory] = useState('All');
  const [addedProductId, setAddedProductId] = useState(null);

  const productCategories = useMemo(() => {
    const cats = new Set();
    products.forEach(p => {
      const name = (p.name || p.description || '').toLowerCase();
      if (p.isCheckup) cats.add('Checkups');
      else if (p.isPackage) cats.add('Packages');
      else if (name.includes('grow') || name.includes('liquid') || name.includes('shake')) cats.add('Beverages');
      else if (name.includes('powder') || name.includes('protein')) cats.add('Supplements');
      else cats.add('Other');
    });
    return ['All', ...Array.from(cats).sort()];
  }, [products]);

  const filteredProducts = products.filter(p => {
    const matchSearch = !productSearch || (p.name || p.description || '').toLowerCase().includes(productSearch.toLowerCase());
    if (!matchSearch) return false;
    if (productCategory === 'All') return true;
    const name = (p.name || p.description || '').toLowerCase();
    if (productCategory === 'Checkups') return p.isCheckup;
    if (productCategory === 'Packages') return p.isPackage && !p.isCheckup;
    if (productCategory === 'Beverages') return !p.isCheckup && !p.isPackage && (name.includes('grow') || name.includes('liquid') || name.includes('shake'));
    if (productCategory === 'Supplements') return !p.isCheckup && !p.isPackage && (name.includes('powder') || name.includes('protein'));
    if (productCategory === 'Other') return !p.isCheckup && !p.isPackage && !name.includes('grow') && !name.includes('liquid') && !name.includes('shake') && !name.includes('powder') && !name.includes('protein');
    return true;
  });

  const addToCart = (product) => {
    setAddedProductId(product.id);
    setTimeout(() => setAddedProductId(null), 350);
    setCart(prev => {
      const existing = prev.find(c => c.id === product.id);
      if (existing) return prev.map(c => c.id === product.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { ...product, qty: 1 }];
    });
  };

  const handleBarcodeScan = (result) => {
    // Out-of-stock guard — API now returns outOfStock flag
    if (result.outOfStock) {
      setError(`No stock available for "${result.productName || 'this product'}"`);
      return;
    }
    const scannedName = (result.productName || '').toLowerCase().trim();
    const matched = products.find(p =>
      (p.name || p.description || '').toLowerCase().trim() === scannedName
    ) || products.find(p => {
      const pn = (p.name || p.description || '').toLowerCase();
      return pn.includes(scannedName) || scannedName.includes(pn);
    });
    if (matched) {
      addToCart(matched);
    } else if (result.productName) {
      // API now returns enriched dp/cp/bv from product_prices — use them directly.
      addToCart({
        id: `bc-${result.barcode || result.productId || Date.now()}`,
        name: result.productName,
        description: result.productName,
        dp: result.dp || result.unitPrice || 0,
        cp: result.cp || result.dp || result.unitPrice || 0,
        price: result.dp || result.unitPrice || 0,
        bv: result.bv || 0,
      });
    }
  };
  const updateQty = (id, delta) => setCart(prev => prev.map(c => c.id === id ? { ...c, qty: Math.max(1, c.qty + delta) } : c));
  const removeFromCart = (id) => setCart(prev => prev.filter(c => c.id !== id));

  const cartData = calculateCartTotals(cart, isMember);
  const branchProfit = !isMember ? cartData.items.reduce((s, item) => s + ((item.cp || 0) - (item.dp || 0)) * item.qty, 0) : 0;
  const branchAmount = !isMember ? cartData.items.reduce((s, item) => s + (item.dp || 0) * item.qty, 0) : 0;
  // Cashback owed to referring distributor from checkup services (non-member only)
  const checkupCashbackTotal = !isMember
    ? cartData.items.filter(i => i.isCheckup).reduce((s, i) => s + (i.cashbackPerUnit || 0) * i.qty, 0)
    : 0;

  const openModal = () => {
    setCustomerType('registered'); setRegSearch(''); setRegResults([]); setSelectedReg(null);
    setNewName(''); setNewPhone(''); setReferralSearch(''); setReferralResults([]);
    setSelectedReferral(null); setNoReferral(false); setCart([]); setProductSearch('');
    setProductCategory('All'); setPaymentMethod('cash'); setError(''); setShowModal(true);
  };
  const closeModal = () => setShowModal(false);

  const wiSetCustomerType = (type) => {
    setCustomerType(type);
    if (type === 'registered') { setNewName(''); setNewPhone(''); setReferralSearch(''); setReferralResults([]); setSelectedReferral(null); setNoReferral(false); }
    else {
      setSelectedReg(null); setRegSearch(''); setRegResults([]);
      if (type === 'prescription' || type === 'consultation') { setSelectedReferral(null); setNoReferral(true); }
    }
  };

  const wiReviewSale = () => {
    if (cart.length === 0) { setError('Please add products to cart'); return; }
    if (isMember && !selectedReg) { setError('Please select a registered client'); return; }
    if (!isMember && !newName.trim()) { setError('Please enter customer name'); return; }
    if (!isMember && customerType !== 'prescription' && customerType !== 'consultation' && !noReferral && !selectedReferral) { setError('Please select a referral distributor or tick "no referral"'); return; }
    setError('');
    setShowConfirmModal(true);
  };

  const completeSale = async () => {
    setSubmitting(true);
    setError('');
    try {
      const receiptNumber = generateReceiptNumber();
      const referral = isMember ? selectedReg : (selectedReferral || DEFAULT_REFERRAL);
      const custName = isMember ? (selectedReg?.name || '') : newName;
      const custPhone = isMember ? (selectedReg?.phone || '') : newPhone;

      const itemsWithProfit = cartData.items.map(item => ({
        product_id: item.id,
        product_name: item.name || item.description,
        quantity: item.qty,
        unit_price: item.unitPrice,
        line_total: item.lineTotal,
        bv: item.lineBV,
        lineProfit: !isMember ? ((item.cp || 0) - (item.dp || 0)) * item.qty : null,
        dpPrice: isMember ? (item.memberPrice != null ? item.memberPrice : item.dp || 0) : (item.dp || 0),
        cpPrice: item.cp || 0,
        isPackage: item.isPackage || false,
        components: item.isPackage && Array.isArray(item.components) ? item.components : undefined,
        // Checkup-specific fields (used in receipt distributor copy)
        isCheckup: item.isCheckup || false,
        checkupType: item.checkupType || null,
        cashbackPerUnit: !isMember && item.isCheckup ? (item.cashbackPerUnit || 0) : 0,
        consultantEarns: item.consultantEarns || null,
      }));

      const saleData = {
        receipt_number: receiptNumber,
        saleNumber: receiptNumber,
        branch: effectiveBranch,
        branchId: effectiveBranch,
        customer_type: isMember ? 'member' : customerType === 'prescription' ? 'prescription' : customerType === 'consultation' ? 'consultation' : 'non_member',
        customerType: isMember ? 'member' : customerType === 'prescription' ? 'prescription' : customerType === 'consultation' ? 'consultation' : 'non_member',
        customer_name: custName,
        customerName: custName,
        customerPhone: custPhone,
        distributor_id: isMember ? (selectedReg?.id || null) : null,
        distributor_name: isMember ? custName : null,
        distributor_nb: isMember ? (selectedReg?.nb_number || null) : null,
        referral_id: referral?.id || DEFAULT_REFERRAL.id,
        referral_name: referral?.name || referral?.full_name || DEFAULT_REFERRAL.name,
        referral_nb: referral?.nb_number || DEFAULT_REFERRAL.nb_number,
        payment_method: paymentMethod,
        paymentMethod: paymentMethod,
        items: itemsWithProfit,
        total_amount: cartData.totalAmount,
        total: cartData.totalAmount,
        subtotal: cartData.totalAmount,
        total_bv: cartData.totalBV,
        totalBV: cartData.totalBV,
        soldBy: user?.full_name || user?.username || null,
        distributorReferral: {
          id: referral?.id || DEFAULT_REFERRAL.id,
          name: referral?.name || referral?.full_name || DEFAULT_REFERRAL.name,
          nb_number: referral?.nb_number || DEFAULT_REFERRAL.nb_number,
        },
      };

      const saleOfflineId = generateOfflineId();
      const salePayloadWithId = { ...saleData, offline_id: saleOfflineId };
      if (!navigator.onLine) {
        await enqueue({
          type: 'walkin_sale',
          url: '/api/branch/walkin-sales',
          method: 'POST',
          body: salePayloadWithId,
          offlineId: saleOfflineId,
          label: `Walk-in sale · ${saleData.customer_type} · N$${saleData.total}`,
        });
      } else {
        await api.branch.createWalkinSale(salePayloadWithId);
      }

      const commonReceiptParams = {
        receiptNumber,
        branch: effectiveBranch,
        items: itemsWithProfit,
        totalAmount: saleData.total_amount,
        totalBV: saleData.total_bv || 0,
        paymentMethod: saleData.payment_method,
        customerType: saleData.customer_type,
        customerName: isMember ? custName : (custName || 'Walk-in Customer'),
        nbNumber: isMember ? (selectedReg?.nb_number || null) : null,
        referralName: !isMember ? (referral?.name || DEFAULT_REFERRAL.name) : null,
        referralNB: !isMember ? (referral?.nb_number || DEFAULT_REFERRAL.nb_number) : null,
        cashier: user?.full_name || user?.username || null,
      };

      printReceipt(generateReceiptHTML({
        ...commonReceiptParams,
        showBV: true,
        cashback: 0,
        branchAmount: !isMember ? branchAmount : null,
        distributorProfit: !isMember ? branchProfit : null,
      }));

      setShowConfirmModal(false);
      setShowModal(false);
      const salesRes = await api.branch.walkinSales(portalBranch ? `branch_id=${portalBranch}` : '').catch(() => ({ sales: [] }));
      setSales(Array.isArray(salesRes) ? salesRes : salesRes.sales || []);
    } catch (err) {
      setError(err.message || 'Failed to complete sale');
    } finally {
      setSubmitting(false);
    }
  };

  const paymentMethods = [
    { id: 'cash', label: 'Cash', icon: '💵' },
    { id: 'card', label: 'Card', icon: '💳' },
    { id: 'mobile', label: 'Mobile', icon: '📱' },
    { id: 'bank', label: 'Bank', icon: '🏦' },
  ];

  if (loading && products.length === 0 && sales.length === 0) return <LoadingSpinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-5 p-5 rounded-2xl text-white" style={{ background: 'linear-gradient(135deg,#c41e3a 0%,#8b0000 100%)', boxShadow: '0 4px 20px rgba(196,30,58,0.28)' }}>
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: 'rgba(255,255,255,0.15)' }}>🛒</div>
            <div>
              <h3 className="text-xl font-bold m-0">Walk-in Sales</h3>
              <p className="text-sm m-0" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {user?.branch ? `${getBranchDisplayName(user.branch)} Branch · Point of Sale` : 'Branch Point of Sale'}
              </p>
            </div>
          </div>
        </div>
        <button onClick={openModal} className="flex items-center gap-2 font-bold text-sm px-5 py-3 rounded-xl cursor-pointer transition-all" style={{ background: '#fff', color: '#c41e3a', border: 'none', boxShadow: '0 3px 12px rgba(0,0,0,0.18)', letterSpacing: '0.02em' }}>
          ＋ New Walk-in Sale
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '1.5px solid #93c5fd' }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">🪪</span>
            <span className="font-bold text-base" style={{ color: '#1e40af' }}>Registered Member</span>
          </div>
          <ul className="m-0 pl-4 space-y-1 text-sm" style={{ color: '#1e3a8a' }}>
            <li>Has an NB or DZ number in the system</li>
            <li>Pays at <strong>DP price</strong> (distributor price)</li>
            <li>Earns <strong>BV points</strong> on their account</li>
          </ul>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '1.5px solid #fcd34d' }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">👤</span>
            <span className="font-bold text-base" style={{ color: '#92400e' }}>New Customer</span>
          </div>
          <ul className="m-0 pl-4 space-y-1 text-sm" style={{ color: '#78350f' }}>
            <li>Walk-in, not yet registered</li>
            <li>Pays at <strong>CP price</strong> (consumer price)</li>
            <li>Referring distributor earns <strong>BVs &amp; profit</strong></li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <h4 className="m-0 font-semibold text-gray-700">Previous Walk-in Sales</h4>
          <button onClick={() => loadSales(portalBranch)} className="text-xs px-3 py-1.5 rounded-lg border cursor-pointer" style={{ color: '#64748b', borderColor: '#e2e8f0', background: '#fff' }}>↻ Refresh</button>
        </div>
        <div className="px-4 py-3 flex flex-wrap gap-2 items-center" style={{ borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
          <input
            type="text"
            placeholder="Search receipt #, customer name, NB/DZ#, payment…"
            value={salesSearch}
            onChange={e => setSalesSearch(e.target.value)}
            className="flex-1 text-sm rounded-lg px-3 py-2"
            style={{ minWidth: 180, border: '1.5px solid #e2e8f0' }}
          />
          <input type="date" value={salesDateFrom} onChange={e => setSalesDateFrom(e.target.value)}
            className="text-sm rounded-lg px-3 py-2" style={{ border: '1.5px solid #e2e8f0' }} />
          <span className="text-gray-400 text-xs">to</span>
          <input type="date" value={salesDateTo} onChange={e => setSalesDateTo(e.target.value)}
            className="text-sm rounded-lg px-3 py-2" style={{ border: '1.5px solid #e2e8f0' }} />
          {(salesSearch || salesDateFrom || salesDateTo) && (
            <button onClick={() => { setSalesSearch(''); setSalesDateFrom(''); setSalesDateTo(''); }}
              className="text-xs px-3 py-2 rounded-lg cursor-pointer border-none"
              style={{ background: '#f1f5f9', color: '#64748b' }}>✕ Clear</button>
          )}
        </div>
        {(() => {
          const q = salesSearch.toLowerCase();
          const filteredSales = sales.filter(s => {
            if (salesDateFrom) {
              const d = new Date(s.created_at || s.timestamp);
              if (d < new Date(salesDateFrom)) return false;
            }
            if (salesDateTo) {
              const d = new Date(s.created_at || s.timestamp);
              if (d > new Date(salesDateTo + 'T23:59:59')) return false;
            }
            if (q) {
              const receipt = (s.receipt_number || s.saleNumber || s.id || '').toString().toLowerCase();
              const name = (s.customerName || s.customer_name || s.fullName || s.distributor_name || '').toLowerCase();
              const nb = (s.nbNumber || s.nb_number || s.distributor_nb || s.distributor_code || '').toString().toLowerCase();
              const payment = (s.paymentMethod || s.payment_method || '').toLowerCase();
              if (!receipt.includes(q) && !name.includes(q) && !nb.includes(q) && !payment.includes(q)) return false;
            }
            return true;
          });
          if (filteredSales.length === 0) {
            return <p className="text-center text-gray-400 py-8">{sales.length === 0 ? 'No walk-in sales recorded yet' : 'No sales match your search'}</p>;
          }
          return (
          <div className="divide-y">
            {filteredSales.map((s, i) => {
              const sIsM = (s.customerType || s.customer_type) === 'member';
              const rawItems = s.products || s.items || [];
              // For old sales missing dpPrice, look up from loaded price list
              const lookupDp = (name) => {
                const p = products.find(pr => (pr.name || pr.description || '').toLowerCase().trim() === (name || '').toLowerCase().trim());
                return p ? (p.dp || 0) : 0;
              };
              const saleItems = rawItems.map(it => {
                if ((it.dpPrice != null && it.dpPrice > 0) || (it.dp != null && it.dp > 0)) return it;
                const lookedUpDp = lookupDp(it.product_name || it.name || it.description || '');
                return lookedUpDp > 0 ? { ...it, dpPrice: lookedUpDp, cpPrice: it.cpPrice || it.cp || 0 } : it;
              });
              const sBranchAmt = !sIsM ? saleItems.reduce((sum, it) => sum + ((it.dpPrice || it.dp || 0) * (Number(it.quantity || it.qty || 1))), 0) : null;
              const sTotalAmt = s.total || s.totalAmount || s.total_amount || 0;
              const saleParams = {
                receiptNumber: s.receipt_number || s.saleNumber || s.id,
                branch: s.branch || user?.branch || '',
                items: saleItems,
                totalAmount: sTotalAmt,
                totalBV: s.totalBV || s.total_bv || 0,
                paymentMethod: s.paymentMethod || s.payment_method || '',
                customerType: s.customerType || s.customer_type || 'non_member',
                customerName: s.customerName || s.customer_name || s.distributor_name || s.fullName || (sIsM ? null : 'Walk-in Customer'),
                nbNumber: sIsM ? (s.nbNumber || s.nb_number || s.distributor_nb || s.distributorReferral?.nb_number || null) : null,
                referralName: !sIsM ? (s.referral_name || s.distributorReferral?.name || null) : null,
                referralNB: !sIsM ? (s.referral_nb || s.distributorReferral?.nb_number || null) : null,
                cashier: s.soldBy || '',
                saleDate: s.created_at || s.timestamp,
                branchAmount: sBranchAmt,
                distributorProfit: !sIsM && sBranchAmt != null ? sTotalAmt - sBranchAmt : null,
              };
              return (
                <div key={i} className="flex items-center justify-between px-5 py-3.5 text-sm hover:bg-gray-50 transition-colors gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="font-mono font-semibold text-gray-700 text-xs">{saleParams.receiptNumber}</span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium shrink-0" style={{ background: sIsM ? '#dbeafe' : '#fef3c7', color: sIsM ? '#1e40af' : '#92400e' }}>
                      {sIsM ? '🏅 Member' : '👤 Walk-in'}
                    </span>
                    <span className="text-gray-500 truncate">{saleParams.customerName || '—'}</span>
                    {saleParams.nbNumber && <span className="text-xs text-gray-400 shrink-0">{saleParams.nbNumber}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold text-gray-800">{formatCurrency(saleParams.totalAmount)}</span>
                    <span className="text-xs text-gray-400 hidden sm:inline">{formatDate(s.created_at || s.timestamp)}</span>
                    <button onClick={(e) => { e.stopPropagation(); printReceipt(generateReceiptHTML({ ...saleParams, showBV: true, cashback: 0 })); }}
                      title="Print 80mm thermal receipt"
                      className="px-2.5 py-1 text-xs rounded border cursor-pointer" style={{ color: '#374151', borderColor: '#e2e8f0', background: '#fff' }}>🖨️ Thermal</button>
                    <button onClick={(e) => { e.stopPropagation(); printSalesPDF({ ...saleParams, showBV: sIsM, cashback: 0 }); }}
                      title="Open A4 PDF invoice"
                      className="px-2.5 py-1 text-xs rounded border cursor-pointer" style={{ color: '#fff', borderColor: '#c41e3a', background: '#c41e3a', fontWeight: 600 }}>📄 PDF</button>
                  </div>
                </div>
              );
            })}
          </div>
          );
        })()}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.72)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', backdropFilter: 'blur(3px)' }} onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div style={{ width: '100%', maxWidth: '1340px', background: '#fff', borderRadius: '22px', overflow: 'hidden', maxHeight: '96vh', display: 'flex', flexDirection: 'column', boxShadow: '0 32px 80px rgba(196,30,58,0.25)' }}>

            {/* POS Header */}
            <div style={{ background: 'linear-gradient(135deg,#c41e3a 0%,#8b0000 100%)', padding: '14px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', backdropFilter: 'blur(4px)' }}>🏪</div>
                <div>
                  <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800, letterSpacing: '-0.01em' }}>Branch Point of Sale</div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.76rem', marginTop: 1 }}>
                    {user?.branch ? `${getBranchDisplayName(user.branch)} Branch` : 'Dynapharm'} &nbsp;·&nbsp;
                    <span style={{ color: '#ffd0d8', fontWeight: 600 }}>{isMember ? '🏅 Member — DP Prices' : '👤 Walk-in — CP Prices'}</span>
                  </div>
                </div>
              </div>
              <button onClick={closeModal} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', width: 36, height: 36, borderRadius: '50%', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>×</button>
            </div>

            {/* 3-Column Body */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

              {/* ── COL 1: LEFT CONTROL PANEL ── */}
              <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid #f0e8ea', overflowY: 'auto', background: '#fff', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

                {error && <div style={{ background: '#fff0f3', border: '1px solid #fecaca', color: '#c41e3a', padding: '8px 12px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 500 }}>{error}</div>}

                {/* Customer Type */}
                <div>
                  <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '.12em', color: '#c41e3a', textTransform: 'uppercase', marginBottom: 8 }}>Customer Type</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[
                      { type: 'registered', icon: '🏅', label: 'Member', sub: 'DP price · BV', activeColor: '#c41e3a', activeBg: '#fff0f3', activeBorder: '#c41e3a' },
                      { type: 'new', icon: '👤', label: 'Walk-in', sub: 'CP price', activeColor: '#92400e', activeBg: '#fffbeb', activeBorder: '#f59e0b' },
                      { type: 'prescription', icon: '💊', label: 'Prescription', sub: 'CP price · Rx', activeColor: '#166534', activeBg: '#f0fdf4', activeBorder: '#16a34a' },
                      { type: 'consultation', icon: '🩺', label: 'Consultation', sub: 'Consult fee', activeColor: '#1e40af', activeBg: '#eff6ff', activeBorder: '#3b82f6' },
                    ].map(opt => {
                      const isAct = customerType === opt.type;
                      return (
                        <button key={opt.type} type="button" onClick={() => wiSetCustomerType(opt.type)}
                          style={{ padding: '10px 8px', border: isAct ? `2.5px solid ${opt.activeBorder}` : '1.5px solid #ede8e8', borderRadius: 12, background: isAct ? opt.activeBg : '#fafafa', cursor: 'pointer', textAlign: 'center', transition: 'all .15s', boxShadow: isAct ? `0 3px 10px ${opt.activeBorder}33` : 'none' }}>
                          <div style={{ fontSize: '1.25rem', marginBottom: 3 }}>{opt.icon}</div>
                          <div style={{ fontSize: '0.78rem', fontWeight: 800, color: isAct ? opt.activeColor : '#374151' }}>{opt.label}</div>
                          <div style={{ fontSize: '0.64rem', color: isAct ? opt.activeColor : '#94a3b8', marginTop: 1, opacity: 0.8 }}>{opt.sub}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Member or New Customer details */}
                {customerType === 'registered' ? (
                  <div>
                    <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '.12em', color: '#c41e3a', textTransform: 'uppercase', marginBottom: 8 }}>Member Lookup</div>
                    <div style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#c41e3a', fontSize: '0.9rem', pointerEvents: 'none' }}>🔍</div>
                      <input type="text" value={regSearch} placeholder="Search by name or NB/DZ code…" onChange={e => searchRegistered(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.85rem', boxSizing: 'border-box', background: '#fff', outline: 'none' }} />
                      {regResults.length > 0 && (
                        <div style={{ position: 'absolute', zIndex: 2000, width: '100%', background: '#fff', border: '1.5px solid #fecaca', borderRadius: 10, maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 28px rgba(196,30,58,0.15)', top: 'calc(100% + 4px)', left: 0 }}>
                          {regFromCache && (
                            <div style={{ padding: '5px 12px', fontSize: '0.68rem', fontWeight: 700, color: '#b45309', background: '#fef3c7', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 5 }}>
                              📴 Showing offline cached results
                            </div>
                          )}
                          {regResults.map(d => (
                            <button key={d.id || d.nb_number} onClick={() => selectRegistered(d)}
                              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderBottom: '1px solid #fff5f5', background: 'none', cursor: 'pointer', fontSize: '0.84rem' }}>
                              <div style={{ fontWeight: 700, color: '#1e293b' }}>{d.name || d.fullName || d.full_name}</div>
                              <div style={{ color: '#c41e3a', fontSize: '0.76rem', marginTop: 1 }}>{d.nb_number || d.nbNumber || d.distributor_code}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedReg && (
                      <div style={{ marginTop: 8, padding: '10px 12px', background: 'linear-gradient(135deg,#fff0f3,#ffe4e8)', border: '1.5px solid #f9a8b4', borderRadius: 10, fontSize: '0.84rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 800, color: '#9b1c2e' }}>{selectedReg.name}</div>
                          <div style={{ color: '#c41e3a', fontSize: '0.74rem', marginTop: 2 }}>{selectedReg.nb_number} · {selectedReg.phone || '—'}</div>
                        </div>
                        <button type="button" onClick={clearRegistered} style={{ border: 'none', background: '#fecaca', color: '#c41e3a', cursor: 'pointer', width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 700 }}>×</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '.12em', color: '#c41e3a', textTransform: 'uppercase', marginBottom: 8 }}>Customer Details</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full name *"
                        style={{ padding: '9px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none' }} />
                      <input type="tel" value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Phone number (optional)"
                        style={{ padding: '9px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none' }} />
                    </div>
                    <div style={{ marginTop: 12, padding: '12px', background: '#fffbeb', borderRadius: 11, border: '1.5px solid #fcd34d' }}>
                      <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '.12em', color: '#92400e', textTransform: 'uppercase', marginBottom: 8 }}>Referral Distributor</div>
                      <div style={{ position: 'relative' }}>
                        <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#f59e0b', fontSize: '0.9rem', pointerEvents: 'none', opacity: noReferral ? 0.4 : 1 }}>🔍</div>
                        <input type="text" value={referralSearch} onChange={e => searchReferrals(e.target.value)} placeholder="Search by name or NB/DZ code…" disabled={noReferral}
                          style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1.5px solid #fcd34d', borderRadius: 9, fontSize: '0.85rem', boxSizing: 'border-box', outline: 'none', opacity: noReferral ? 0.5 : 1, background: noReferral ? '#fef9ee' : '#fff' }} />
                        {referralResults.length > 0 && !noReferral && (
                          <div style={{ position: 'absolute', zIndex: 2000, width: '100%', background: '#fff', border: '1.5px solid #fcd34d', borderRadius: 10, maxHeight: 170, overflowY: 'auto', boxShadow: '0 8px 28px rgba(245,158,11,0.15)', top: 'calc(100% + 4px)', left: 0 }}>
                            {refFromCache && (
                              <div style={{ padding: '5px 12px', fontSize: '0.68rem', fontWeight: 700, color: '#b45309', background: '#fef3c7', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 5 }}>
                                📴 Showing offline cached results
                              </div>
                            )}
                            {referralResults.map(d => (
                              <button key={d.id || d.nb_number} onClick={() => selectReferral(d)}
                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderBottom: '1px solid #fffbeb', background: 'none', cursor: 'pointer', fontSize: '0.84rem' }}>
                                <div style={{ fontWeight: 700, color: '#1e293b' }}>{d.name || d.fullName || d.full_name}</div>
                                <div style={{ color: '#d97706', fontSize: '0.76rem', marginTop: 1 }}>{d.nb_number || d.nbNumber || d.distributor_code}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {selectedReferral && !noReferral && (
                        <div style={{ marginTop: 8, padding: '9px 12px', background: '#fff', border: '1px solid #fcd34d', borderRadius: 9, fontSize: '0.84rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 800, color: '#92400e' }}>{selectedReferral.name}</div>
                            <div style={{ color: '#d97706', fontSize: '0.75rem', marginTop: 2 }}>{selectedReferral.nb_number}</div>
                          </div>
                          <button type="button" onClick={clearReferral} style={{ border: 'none', background: '#fef3c7', color: '#d97706', cursor: 'pointer', width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', fontWeight: 700 }}>×</button>
                        </div>
                      )}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: '0.8rem', cursor: 'pointer', color: '#92400e', userSelect: 'none' }}>
                        <input type="checkbox" checked={noReferral} onChange={e => toggleNoReferral(e.target.checked)} style={{ width: 15, height: 15, accentColor: '#c41e3a' }} />
                        No referral — direct walk-in
                      </label>
                    </div>
                  </div>
                )}

                {/* Payment Method — large 2×2 icon tiles */}
                <div>
                  <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '.12em', color: '#c41e3a', textTransform: 'uppercase', marginBottom: 8 }}>Payment Method</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {paymentMethods.map(m => {
                      const isAct = paymentMethod === m.id;
                      return (
                        <button key={m.id} type="button" onClick={() => setPaymentMethod(m.id)}
                          style={{ padding: '14px 8px', border: isAct ? '3px solid #c41e3a' : '1.5px solid #e5e7eb', borderRadius: 14, background: isAct ? '#fff0f3' : '#fafafa', cursor: 'pointer', textAlign: 'center', transition: 'all .15s', boxShadow: isAct ? '0 4px 14px rgba(196,30,58,0.22)' : '0 1px 3px rgba(0,0,0,0.05)' }}>
                          <div style={{ fontSize: '1.6rem', marginBottom: 5 }}>{m.icon}</div>
                          <div style={{ fontSize: '0.8rem', fontWeight: isAct ? 800 : 600, color: isAct ? '#c41e3a' : '#374151' }}>{m.label}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ── COL 2: CENTER — PRODUCT CATALOG ── */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, background: '#f9f5f5' }}>

                {/* Search + price badge */}
                <div style={{ padding: '12px 16px 0', background: '#fff', flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: scanMode ? 6 : 10 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#c41e3a', fontSize: '0.9rem', pointerEvents: 'none' }}>🔍</div>
                      <input type="text" value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search products…"
                        style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setScanMode(m => !m)}
                      title="Toggle barcode scanner"
                      style={{ flexShrink: 0, padding: '7px 13px', borderRadius: 9, border: scanMode ? '2px solid #c41e3a' : '1.5px solid #d1d5db', background: scanMode ? '#fff0f3' : '#f8fafc', color: scanMode ? '#c41e3a' : '#374151', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .15s' }}
                    >
                      🔲 Scan
                    </button>
                    <span style={{ fontSize: '0.76rem', padding: '6px 12px', borderRadius: 20, fontWeight: 700, whiteSpace: 'nowrap', background: isMember ? '#fff0f3' : '#fffbeb', color: isMember ? '#c41e3a' : '#92400e', border: `1.5px solid ${isMember ? '#fecaca' : '#fcd34d'}` }}>
                      {isMember ? '🏅 DP Price' : '👤 CP Price'}
                    </span>
                  </div>
                  {scanMode && (
                    <BarcodeScanner
                      onResult={handleBarcodeScan}
                      onError={(msg) => setError(msg)}
                      placeholder="Aim scanner at product barcode…"
                      style={{ marginBottom: 10 }}
                    />
                  )}

                  {/* Category filter tabs */}
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 10, scrollbarWidth: 'none' }}>
                    {productCategories.map(cat => {
                      const isActive = productCategory === cat;
                      return (
                        <button key={cat} type="button" onClick={() => setProductCategory(cat)}
                          style={{ padding: '5px 14px', borderRadius: 20, border: isActive ? '2px solid #c41e3a' : '1.5px solid #e5e7eb', background: isActive ? '#c41e3a' : '#fff', color: isActive ? '#fff' : '#374151', fontSize: '0.78rem', fontWeight: isActive ? 700 : 500, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .15s', flexShrink: 0 }}>
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Product grid — image-first */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
                    {filteredProducts.length === 0 ? (
                      <div style={{ color: '#c4a0a7', gridColumn: '1/-1', textAlign: 'center', padding: '40px 0', fontSize: '0.9rem' }}>No products found</div>
                    ) : filteredProducts.slice(0, 80).map(p => {
                      const price = p.isCheckup
                        ? (isMember ? p.memberPrice : p.cp)
                        : (isMember ? (p.dp || p.price) : (p.cp || p.price));
                      const inCart = cart.find(c => c.id === p.id);
                      const profit = !isMember ? (p.cp || 0) - (p.dp || 0) : 0;
                      const accentColor = p.isCheckup ? '#0d9488' : p.isPackage ? '#3b82f6' : '#c41e3a';
                      const isAdding = addedProductId === p.id;
                      const primaryImage = p.images?.find(img => img.is_primary) || p.images?.[0];
                      const imageSrc = primaryImage?.image_data
                        ? (primaryImage.image_data.startsWith('data:')
                            ? primaryImage.image_data
                            : `data:${primaryImage.image_type || 'image/jpeg'};base64,${primaryImage.image_data}`)
                        : primaryImage?.image_url || null;
                      return (
                        <div key={p.id} style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', boxShadow: inCart ? `0 4px 16px ${accentColor}30` : '0 1px 4px rgba(0,0,0,0.08)', border: inCart ? `2px solid ${accentColor}` : '1.5px solid #eee', background: '#fff', display: 'flex', flexDirection: 'column', transform: isAdding ? 'scale(0.97)' : 'scale(1)', transition: 'transform 0.2s ease, box-shadow .15s, border .15s' }}>
                          {/* Square image area */}
                          <div style={{ position: 'relative', aspectRatio: '1/1', background: imageSrc ? '#f5f5f5' : `${accentColor}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                            {imageSrc ? (
                              <img src={imageSrc} alt={p.name || p.description} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <div style={{ textAlign: 'center', color: accentColor, opacity: 0.55 }}>
                                <div style={{ fontSize: '2rem' }}>{p.isCheckup ? '🩺' : p.isPackage ? '📦' : '🛍️'}</div>
                                <div style={{ fontSize: '0.58rem', fontWeight: 700, marginTop: 2 }}>No image</div>
                              </div>
                            )}
                            {/* BV badge floats over image */}
                            {p.bv > 0 && (
                              <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 2, background: '#fffbeb', border: '1px solid #fcd34d', color: '#d97706', borderRadius: 8, padding: '1px 6px', fontSize: '0.6rem', fontWeight: 800 }}>{p.bv} BV</div>
                            )}
                          </div>
                          {/* Card content */}
                          <div style={{ padding: '8px 10px 8px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <div style={{ fontWeight: 700, color: p.isCheckup ? '#0d9488' : '#1e293b', lineHeight: 1.3, fontSize: '0.78rem', marginBottom: 4, flex: 1 }}>{p.name || p.description}</div>
                            {p.isCheckup && <div style={{ fontSize: '0.6rem', color: '#0d9488', marginBottom: 2 }}>🩺 Health Check</div>}
                            {p.isPackage && !p.isCheckup && <div style={{ fontSize: '0.6rem', color: '#1d4ed8', marginBottom: 2 }}>📦 {p.components?.length || 0}-product bundle</div>}
                            <div style={{ fontWeight: 900, color: accentColor, fontSize: '1rem', marginBottom: 4 }}>{formatCurrency(price)}</div>
                            {!isMember && p.isCheckup && p.cashbackPerUnit > 0 && <div style={{ fontSize: '0.6rem', color: '#166534', marginBottom: 3, fontWeight: 700 }}>N${p.cashbackPerUnit} cashback</div>}
                            {!isMember && !p.isCheckup && profit > 0 && <div style={{ fontSize: '0.6rem', color: '#0891b2', marginBottom: 3, fontWeight: 700 }}>+{formatCurrency(profit)} profit</div>}
                            <button type="button" onClick={() => addToCart(p)}
                              style={{ width: '100%', padding: '6px 0', borderRadius: 9, border: 'none', background: inCart ? accentColor : `${accentColor}18`, color: inCart ? '#fff' : accentColor, fontWeight: 700, fontSize: '0.76rem', cursor: 'pointer', transition: 'all .15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              {inCart ? (
                                <><span style={{ fontWeight: 900 }}>{inCart.qty}</span> in cart</>
                              ) : '＋ Add'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ── COL 3: RIGHT — STICKY CART PANEL ── */}
              <div style={{ width: 300, flexShrink: 0, borderLeft: '1px solid #f0e8ea', background: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                {/* Order header with badge */}
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #f5eded', background: '#fafafa', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1.1rem' }}>🧾</span>
                  <span style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.95rem' }}>Order</span>
                  {cart.length > 0 && (
                    <span style={{ background: '#c41e3a', color: '#fff', borderRadius: 12, padding: '2px 9px', fontSize: '0.7rem', fontWeight: 800 }}>{cart.length} {cart.length === 1 ? 'item' : 'items'}</span>
                  )}
                </div>

                {/* Cart items — scrollable */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '6px 14px' }}>
                  {cart.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '36px 16px', color: '#c4a0a7' }}>
                      <div style={{ fontSize: '2rem', marginBottom: 8 }}>🛍️</div>
                      <div style={{ fontSize: '0.85rem' }}>No items yet</div>
                      <div style={{ fontSize: '0.75rem', marginTop: 4, opacity: 0.7 }}>Select products from the catalog</div>
                    </div>
                  ) : cartData.items.map(item => {
                    const lineProfit = !isMember ? ((item.cp || 0) - (item.dp || 0)) * item.qty : null;
                    return (
                      <div key={item.id} style={{ padding: '10px 0', borderBottom: '1px solid #fdf5f5' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                          <div style={{ flex: 1, minWidth: 0, paddingRight: 6 }}>
                            <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.82rem', lineHeight: 1.3 }}>{item.name || item.description}</div>
                            {lineProfit != null && lineProfit > 0 && <div style={{ fontSize: '0.68rem', color: '#0891b2', fontWeight: 600, marginTop: 1 }}>+{formatCurrency(lineProfit)} profit</div>}
                          </div>
                          <button type="button" onClick={() => removeFromCart(item.id)} style={{ border: 'none', background: 'transparent', color: '#d1d5db', cursor: 'pointer', width: 22, height: 22, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.9rem', flexShrink: 0, transition: 'color .15s' }} onMouseEnter={e => e.currentTarget.style.color='#ef4444'} onMouseLeave={e => e.currentTarget.style.color='#d1d5db'}>✕</button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', background: '#fef2f2', borderRadius: 20, border: '1.5px solid #fecaca', overflow: 'hidden' }}>
                            <button type="button" onClick={() => updateQty(item.id, -1)} style={{ width: 28, height: 26, border: 'none', borderRight: '1px solid #fecaca', background: 'transparent', cursor: 'pointer', color: '#c41e3a', fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                            <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 800, fontSize: '0.88rem', color: '#1e293b', padding: '0 2px' }}>{item.qty}</span>
                            <button type="button" onClick={() => updateQty(item.id, 1)} style={{ width: 28, height: 26, border: 'none', borderLeft: '1px solid #fecaca', background: 'transparent', cursor: 'pointer', color: '#c41e3a', fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                          </div>
                          <span style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.88rem' }}>{formatCurrency(item.lineTotal)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Cart sticky footer */}
                <div style={{ flexShrink: 0, borderTop: '2px solid #f0e8ea' }}>
                  {cart.length > 0 && (
                    <div style={{ padding: '10px 16px', background: '#fdf7f8', borderBottom: '1px solid #f5eded' }}>
                      {isMember && cartData.totalBV > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                          <span style={{ color: '#6b7280' }}>Total BV</span>
                          <span style={{ fontWeight: 800, color: '#d97706' }}>{cartData.totalBV.toFixed(1)} BV</span>
                        </div>
                      )}
                      {!isMember && branchProfit > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 4 }}>
                          <span style={{ color: '#6b7280' }}>Branch Profit</span>
                          <span style={{ fontWeight: 800, color: '#059669' }}>{formatCurrency(branchProfit)}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#374151' }}>Total</span>
                        <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#c41e3a' }}>{formatCurrency(cartData.totalAmount)}</span>
                      </div>
                    </div>
                  )}
                  <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button type="button" onClick={wiReviewSale}
                      style={{ width: '100%', padding: '12px 0', border: 'none', borderRadius: 12, background: cart.length === 0 ? '#e5e7eb' : 'linear-gradient(135deg,#c41e3a 0%,#8b0000 100%)', color: cart.length === 0 ? '#9ca3af' : '#fff', fontWeight: 800, cursor: cart.length === 0 ? 'not-allowed' : 'pointer', fontSize: '0.92rem', boxShadow: cart.length > 0 ? '0 4px 14px rgba(196,30,58,0.3)' : 'none', letterSpacing: '0.01em', transition: 'all .15s' }}
                      disabled={cart.length === 0}>
                      Review Sale →
                    </button>
                    <button type="button" onClick={closeModal}
                      style={{ width: '100%', padding: '9px 0', border: '1.5px solid #e5e7eb', borderRadius: 12, background: '#fff', color: '#6b7280', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {showConfirmModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.72)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(3px)' }}>
          <div style={{ maxWidth: 620, width: '100%', borderRadius: 22, overflow: 'hidden', background: '#fff', boxShadow: '0 30px 80px rgba(196,30,58,0.25)' }}>

            {/* Confirm header — red */}
            <div style={{ background: 'linear-gradient(135deg,#c41e3a 0%,#8b0000 100%)', padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>Confirm Sale</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', marginTop: 2 }}>Review details before processing payment</div>
              </div>
              <button onClick={() => setShowConfirmModal(false)} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            <div style={{ padding: '20px', maxHeight: '68vh', overflowY: 'auto', background: '#fdf7f8' }}>
              {error && <div style={{ background: '#fff0f3', border: '1px solid #fecaca', color: '#c41e3a', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: '0.82rem', fontWeight: 500 }}>{error}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                {/* Customer card */}
                <div style={{ background: '#fff', borderRadius: 14, padding: '15px', border: '1.5px solid #f0e8ea', boxShadow: '0 2px 8px rgba(196,30,58,0.06)' }}>
                  <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '.12em', color: '#c41e3a', textTransform: 'uppercase', marginBottom: 8 }}>Customer</div>
                  <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.97rem' }}>{isMember ? selectedReg?.name : newName}</div>
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 800, background: isMember ? '#fff0f3' : '#fffbeb', color: isMember ? '#c41e3a' : '#92400e', border: `1px solid ${isMember ? '#fecaca' : '#fcd34d'}` }}>
                      {isMember ? '🏅 Member' : '👤 Walk-in'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {isMember ? (selectedReg?.nb_number || '') : (newPhone || '')}
                    </span>
                  </div>
                  {!isMember && (selectedReferral || noReferral) && (
                    <div style={{ marginTop: 8, padding: '5px 9px', background: '#fffbeb', borderRadius: 7, border: '1px solid #fcd34d', fontSize: '0.77rem', color: '#92400e' }}>
                      Referral: <strong>{selectedReferral?.name || DEFAULT_REFERRAL.name}</strong>
                      {selectedReferral?.nb_number && <span style={{ color: '#d97706', marginLeft: 4 }}>({selectedReferral.nb_number})</span>}
                    </div>
                  )}
                </div>

                {/* Payment card */}
                <div style={{ background: '#fff', borderRadius: 14, padding: '15px', border: '1.5px solid #f0e8ea', boxShadow: '0 2px 8px rgba(196,30,58,0.06)' }}>
                  <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '.12em', color: '#c41e3a', textTransform: 'uppercase', marginBottom: 8 }}>Payment</div>
                  <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>
                    {paymentMethods.find(m => m.id === paymentMethod)?.icon} {paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)}
                  </div>
                  <div style={{ marginTop: 10, padding: '10px 13px', background: 'linear-gradient(135deg,#c41e3a,#8b0000)', borderRadius: 10 }}>
                    <div style={{ color: '#ffd0d8', fontWeight: 900, fontSize: '1.3rem' }}>{formatCurrency(cartData.totalAmount)}</div>
                    {isMember && <div style={{ color: '#fbbf24', fontSize: '0.72rem', marginTop: 2 }}>{cartData.totalBV.toFixed(1)} BV earned</div>}
                    {!isMember && branchProfit > 0 && <div style={{ color: '#86efac', fontSize: '0.72rem', marginTop: 2 }}>Branch profit: {formatCurrency(branchProfit)}</div>}
                  </div>
                </div>
              </div>

              {/* Items list */}
              <div style={{ background: '#fff', borderRadius: 14, padding: '15px', border: '1.5px solid #f0e8ea', marginBottom: 12, boxShadow: '0 2px 8px rgba(196,30,58,0.04)' }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '.12em', color: '#c41e3a', textTransform: 'uppercase', marginBottom: 10 }}>Items ({cart.length})</div>
                <div style={{ maxHeight: 175, overflowY: 'auto' }}>
                  {cartData.items.map((item, i) => {
                    const lineProfit = !isMember ? ((item.cp || 0) - (item.dp || 0)) * item.qty : null;
                    return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < cartData.items.length - 1 ? '1px solid #fdf5f5' : 'none', fontSize: '0.86rem' }}>
                        <div>
                          <span style={{ fontWeight: 700, color: '#1e293b' }}>{item.name || item.description}</span>
                          <span style={{ color: '#94a3b8', marginLeft: 5 }}>×{item.qty}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, color: '#c41e3a' }}>{formatCurrency(item.lineTotal)}</div>
                          {lineProfit != null && lineProfit > 0 && <div style={{ fontSize: '0.72rem', color: '#0891b2' }}>+{formatCurrency(lineProfit)} profit</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Non-member receipt notice */}
              {!isMember && (
                <div style={{ background: 'linear-gradient(135deg,#fff0f3,#ffe4e8)', borderRadius: 13, padding: '13px 16px', border: '1.5px solid #fecaca' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#9b1c2e', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Non-Member Sale Summary</div>
                  <div style={{ display: 'grid', gridTemplateColumns: `1fr 1fr ${checkupCashbackTotal > 0 ? '1fr 1fr' : '1fr'}`, gap: 8, textAlign: 'center' }}>
                    <div style={{ background: '#fff', borderRadius: 9, padding: '9px 6px', border: '1px solid #fecaca' }}>
                      <div style={{ fontSize: '0.65rem', color: '#c41e3a', marginBottom: 3, fontWeight: 700 }}>Customer Pays</div>
                      <div style={{ fontWeight: 900, color: '#8b0000', fontSize: '0.95rem' }}>{formatCurrency(cartData.totalAmount)}</div>
                    </div>
                    <div style={{ background: '#fff', borderRadius: 9, padding: '9px 6px', border: '1px solid #fecaca' }}>
                      <div style={{ fontSize: '0.65rem', color: '#c41e3a', marginBottom: 3, fontWeight: 700 }}>Branch Profit</div>
                      <div style={{ fontWeight: 900, color: '#166534', fontSize: '0.95rem' }}>{formatCurrency(branchProfit)}</div>
                    </div>
                    <div style={{ background: '#fff', borderRadius: 9, padding: '9px 6px', border: '1px solid #fecaca' }}>
                      <div style={{ fontSize: '0.65rem', color: '#d97706', marginBottom: 3, fontWeight: 700 }}>Distributor BV</div>
                      <div style={{ fontWeight: 900, color: '#8b0000', fontSize: '0.95rem' }}>{cartData.totalBV.toFixed(1)}</div>
                    </div>
                    {checkupCashbackTotal > 0 && (
                      <div style={{ background: '#f0fdf4', borderRadius: 9, padding: '9px 6px', border: '1px solid #86efac' }}>
                        <div style={{ fontSize: '0.65rem', color: '#166534', marginBottom: 3, fontWeight: 700 }}>🩺 Check Cashback</div>
                        <div style={{ fontWeight: 900, color: '#166534', fontSize: '0.95rem' }}>N${checkupCashbackTotal}</div>
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: 10, fontSize: '0.73rem', color: '#9b1c2e', textAlign: 'center', fontWeight: 600 }}>🧾🧾🧾 Three receipts will print: Customer → Distributor → Branch</div>
                </div>
              )}
            </div>

            {/* Action footer */}
            <div style={{ padding: '14px 24px', background: '#fff', borderTop: '1px solid #f0e8ea', display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center' }}>
              <button type="button" onClick={() => setShowConfirmModal(false)} style={{ padding: '10px 20px', border: '1.5px solid #e8d5d8', borderRadius: 11, background: '#fff', cursor: 'pointer', color: '#64748b', fontSize: '0.88rem', fontWeight: 600 }}>← Edit Sale</button>
              <button type="button" onClick={completeSale} disabled={submitting}
                style={{ padding: '11px 32px', border: 'none', borderRadius: 11, background: 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '0.92rem', opacity: submitting ? 0.65 : 1, boxShadow: '0 4px 14px rgba(196,30,58,0.35)', letterSpacing: '0.01em' }}>
                {submitting ? '⏳ Processing…' : '✅ Complete Sale'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PrescriptionsTab() {
  const { user } = useAuth();
  const portalBranch = useContext(PortalBranchContext);
  const effectiveBranch = portalBranch || user?.branch || '';
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [rxSearch, setRxSearch] = useState('');
  const [rxBranchFilter, setRxBranchFilter] = useState('');
  const [rxStatusFilter, setRxStatusFilter] = useState('all');
  const [rxFromDate, setRxFromDate] = useState('');
  const [rxToDate, setRxToDate] = useState('');
  const [rxGroupTab, setRxGroupTab] = useState('all');
  const [consultFeeMode, setConsultFeeMode] = useState({});
  const [consultFeePaid, setConsultFeePaid] = useState({});
  const [checkupFeeType, setCheckupFeeType] = useState({});
  const [dispensePreview, setDispensePreview] = useState(null);
  const [dispensing, setDispensing] = useState(false);
  const [rxDispensePayment, setRxDispensePayment] = useState('cash');
  const [expandedPackages, setExpandedPackages] = useState({});

  const CHECKUP_FEE_OPTIONS = {
    standard:        { label: 'Full Body Check Up',              fee: 200, cashback: 50, consultantEarns: 150 },
    report:          { label: 'Full Body Check Up (With Report)', fee: 250, cashback: 50, consultantEarns: 200 },
    followup:        { label: 'Follow-Up Visit',                 fee: 150, cashback: 0,  consultantEarns: 150 },
    followup_report: { label: 'Follow-Up Visit (With Report)',   fee: 200, cashback: 0,  consultantEarns: 200 },
  };
  const getCheckupType = (reportId) => checkupFeeType[reportId] || null;
  const setCheckupType = (reportId, type) => setCheckupFeeType(prev => ({ ...prev, [reportId]: type }));

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (effectiveBranch) params.branch = effectiveBranch;
    api.reports.list(params)
      .then(d => setReports(Array.isArray(d) ? d : d.reports || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [effectiveBranch]);

  if (loading && reports.length === 0) return <LoadingSpinner />;

  const getConsultMode = (reportId, isMem = false) => consultFeeMode[reportId] || (isMem ? 'inclusive' : 'separate');
  const setConsultMode = (reportId, mode) => setConsultFeeMode(prev => ({ ...prev, [reportId]: mode }));
  const isConsultPaid = (reportId) => !!consultFeePaid[reportId];
  const toggleConsultPaid = (reportId) => setConsultFeePaid(prev => ({ ...prev, [reportId]: !prev[reportId] }));

  const clearRxFilters = () => {
    setRxSearch(''); setRxBranchFilter(''); setRxStatusFilter('all'); setRxFromDate(''); setRxToDate(''); setRxGroupTab('all');
  };

  const refreshDispenserData = () => {
    setLoading(true);
    const params = {};
    if (effectiveBranch) params.branch = effectiveBranch;
    api.reports.list(params)
      .then(d => setReports(Array.isArray(d) ? d : d.reports || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const getMedicines = (r) => {
    if (r.medicines && Array.isArray(r.medicines) && r.medicines.length > 0) return r.medicines;
    const prescriptions = r.prescriptions || r.prescription || [];
    if (!Array.isArray(prescriptions)) return [];
    return prescriptions.map(p => {
      const name = typeof p === 'string' ? p : (p.product_name || p.name || p.product || '');
      return { name, dispensed: false, paid: false };
    });
  };

  const toggleDispense = (reportId, medIndex) => {
    setReports(prev => prev.map(r => {
      if (r.id !== reportId) return r;
      const meds = [...getMedicines(r)];
      meds[medIndex] = { ...meds[medIndex], dispensed: !meds[medIndex].dispensed };
      return { ...r, medicines: meds };
    }));
  };

  const togglePayment = (reportId, medIndex) => {
    setReports(prev => prev.map(r => {
      if (r.id !== reportId) return r;
      const meds = [...getMedicines(r)];
      meds[medIndex] = { ...meds[medIndex], paid: !meds[medIndex].paid };
      return { ...r, medicines: meds };
    }));
  };

  const saveDraft = async (report) => {
    const meds = getMedicines(report);
    const allDispensed = meds.length > 0 && meds.every(m => m.dispensed);
    const allPaid = allDispensed && meds.every(m => m.paid);
    const membershipStatus = report.membership_status || 'referred';
    const isMember = membershipStatus === 'member';
    try {
      await api.reports.update(report.id, {
        ...report,
        medicines: meds,
        branch: effectiveBranch || report.branch || '',
        dispensing_status: allDispensed ? 'dispensed' : 'draft',
      });
      if (allPaid && effectiveBranch) {
        const consultFee = getConsultationFee(membershipStatus);
        const rxItems = meds.map(m => {
          const p = getEffectivePrice(m.name);
          return { product_name: m.name, quantity: m.quantity || 1, unit_price: isMember ? (p.dp || 0) : (p.cp || 0) };
        });
        api.branch.captureRx({
          reportId: report.id,
          branchId: effectiveBranch,
          customerType: isMember ? 'member' : membershipStatus,
          items: rxItems,
          consultationFee: consultFee,
          capturedBy: user?.full_name || user?.username || '',
          serviceDate: (report.date || report.created_at || '').slice(0, 10),
        }).catch(e => console.warn('[captureRx] skipped:', e.message));
      }
      setAlert({ type: 'success', message: allPaid ? `Prescription completed & revenue recorded for ${report.id}` : `Draft saved for ${report.id}` });
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to save draft' });
    }
  };

  const openDispensePreview = (report) => {
    const meds = getMedicines(report);
    const membershipStatus = report.membership_status || 'referred';
    const isMember = membershipStatus === 'member';
    const consultFee = getConsultationFee(membershipStatus);

    const items = meds.map((m, medIdx) => {
      const p = getEffectivePrice(m.name);
      const expanded = isPackageExpanded(report.id, medIdx);
      const alreadyDispensedComps = Array.isArray(m.dispensed_components) ? new Set(m.dispensed_components) : new Set();
      if (p.isPackage && expanded && p.products) {
        const compState = getExpandedComponentState(report.id, medIdx);
        const components = p.products.map((comp, ci) => {
          const cp = getComponentPrice(comp.name);
          return {
            name: comp.name,
            quantity: Number(comp.quantity || 1),
            dp: cp.dp,
            cp: cp.cp,
            bv: cp.bv,
            fromPackage: m.name,
            selectedForDispense: !!compState[ci],
            alreadyDispensed: alreadyDispensedComps.has(comp.name),
          };
        });
        return { name: m.name, quantity: 1, dp: p.dp, cp: p.cp, bv: p.bv, isPackage: true, dispensed: !!m.dispensed, products: p.products, expandedIndividually: true, components, alreadyDispensedComps };
      }
      return { name: m.name, quantity: 1, dp: p.dp, cp: p.cp, bv: p.bv, isPackage: !!p.isPackage, dispensed: !!m.dispensed, products: p.products, expandedIndividually: false, alreadyDispensedComps };
    });

    const pendingItems = [];
    for (const item of items) {
      if (item.dispensed) continue;
      if (item.isPackage && item.expandedIndividually && item.components) {
        for (const comp of item.components) {
          if (comp.alreadyDispensed) continue;
          if (!comp.selectedForDispense) continue;
          pendingItems.push({ ...comp, isComponent: true });
        }
      } else if (item.isPackage && !item.expandedIndividually) {
        const remainingComps = (item.products || []).filter(c => !item.alreadyDispensedComps.has(c.name));
        if (remainingComps.length > 0) {
          pendingItems.push({ ...item, products: remainingComps });
        }
      } else {
        pendingItems.push(item);
      }
    }

    const currentConsultMode = getConsultMode(report.id, isMember);
    const currentCheckupType = getCheckupType(report.id);
    const currentCheckupOpt = currentCheckupType ? CHECKUP_FEE_OPTIONS[currentCheckupType] : null;

    setDispensePreview({
      report,
      items,
      pendingItems,
      isMember,
      membershipStatus,
      consultFee,
      consultMode: currentConsultMode,
      checkupType: currentCheckupType,
      checkupOpt: currentCheckupOpt,
      totalDP: items.reduce((s, i) => s + (i.dp || 0) * i.quantity, 0),
      totalCP: items.reduce((s, i) => s + (i.cp || 0) * i.quantity, 0),
      totalBV: items.reduce((s, i) => s + (i.bv || 0) * i.quantity, 0),
      pendingDP: pendingItems.reduce((s, i) => {
        if (i.isPackage && i.alreadyDispensedComps && i.alreadyDispensedComps.size > 0) {
          return s + (i.products || []).reduce((cs, c) => { const cp = getComponentPrice(c.name); return cs + (cp.dp || 0) * Number(c.quantity || 1); }, 0);
        }
        return s + (i.dp || 0) * (i.quantity || 1);
      }, 0),
      pendingCP: pendingItems.reduce((s, i) => {
        if (i.isPackage && i.alreadyDispensedComps && i.alreadyDispensedComps.size > 0) {
          return s + (i.products || []).reduce((cs, c) => { const cp = getComponentPrice(c.name); return cs + (cp.cp || 0) * Number(c.quantity || 1); }, 0);
        }
        return s + (i.cp || 0) * (i.quantity || 1);
      }, 0),
    });
  };

  const confirmDispense = async () => {
    if (!dispensePreview) return;
    const { report, pendingItems, isMember, membershipStatus } = dispensePreview;
    if (pendingItems.length === 0) {
      setAlert({ type: 'error', message: 'No pending items to dispense' });
      return;
    }
    setDispensing(true);
    try {
      const dispenseItems = [];
      for (const item of pendingItems) {
        if (item.isComponent) {
          const price = isMember ? item.dp : item.cp;
          dispenseItems.push({ product_name: item.name, quantity: item.quantity, unit_price: price || null, from_package: item.fromPackage || null });
        } else if (item.isPackage && item.products) {
          const hasPartialHistory = item.alreadyDispensedComps && item.alreadyDispensedComps.size > 0;
          if (hasPartialHistory) {
            for (const comp of item.products) {
              const cp = getComponentPrice(comp.name);
              const compPrice = isMember ? cp.dp : cp.cp;
              dispenseItems.push({ product_name: comp.name, quantity: Number(comp.quantity || 1) * (item.quantity || 1), unit_price: compPrice || null, from_package: item.name });
            }
          } else {
            dispenseItems.push({ product_name: item.name, quantity: item.quantity || 1, unit_price: isMember ? (item.dp || null) : (item.cp || null) });
          }
        } else {
          dispenseItems.push({ product_name: item.name, quantity: item.quantity, unit_price: isMember ? (item.dp || null) : (item.cp || null) });
        }
      }
      await api.branch.dispense({
        reportId: report.id,
        branchId: effectiveBranch,
        items: dispenseItems,
        createdBy: user?.full_name || user?.username || '',
        customerType: isMember ? 'member' : 'non_member',
        paymentMethod: rxDispensePayment,
        patientName: report.client_name || report.full_name || report.patient_name || 'Patient',
        consultationFee: dispensePreview.consultFee?.total || 0,
        consultMode: getConsultMode(report.id, isMember),
      });

      const pendingNonPkgNames = new Set(pendingItems.filter(i => !i.isComponent && !i.isPackage).map(i => i.name));
      const fullPackageNames = new Set();
      const componentsByPackage = {};
      for (const item of pendingItems) {
        if (item.isComponent && item.fromPackage) {
          if (!componentsByPackage[item.fromPackage]) componentsByPackage[item.fromPackage] = new Set();
          componentsByPackage[item.fromPackage].add(item.name);
        }
        if (item.isPackage && item.products) {
          const hasPartialHistory = item.alreadyDispensedComps && item.alreadyDispensedComps.size > 0;
          if (hasPartialHistory) {
            if (!componentsByPackage[item.name]) componentsByPackage[item.name] = new Set();
            for (const comp of item.products) {
              componentsByPackage[item.name].add(comp.name);
            }
          } else {
            fullPackageNames.add(item.name);
          }
        }
      }

      const updatedMeds = getMedicines(report).map((m, medIdx) => {
        if (pendingNonPkgNames.has(m.name)) return { ...m, dispensed: true };
        if (fullPackageNames.has(m.name)) return { ...m, dispensed: true };
        if (componentsByPackage[m.name]) {
          const p = getEffectivePrice(m.name);
          const allComponents = p.products || [];
          const dispensedComps = m.dispensed_components ? new Set(m.dispensed_components) : new Set();
          componentsByPackage[m.name].forEach(c => dispensedComps.add(c));
          const allDone = allComponents.every(comp => dispensedComps.has(comp.name));
          return { ...m, dispensed_components: Array.from(dispensedComps), dispensed: allDone ? true : !!m.dispensed };
        }
        return m;
      });
      const allDispensedNow = updatedMeds.every(m => m.dispensed);
      const someDispensed = updatedMeds.some(m => m.dispensed || (Array.isArray(m.dispensed_components) && m.dispensed_components.length > 0));
      const newStatus = allDispensedNow ? 'dispensed' : (someDispensed ? 'partial' : 'draft');
      await api.reports.update(report.id, {
        ...report,
        medicines: updatedMeds,
        dispensing_status: newStatus,
        dispensed_at: new Date().toISOString(),
        dispensed_by: user?.full_name || user?.username || '',
      });
      setReports(prev => prev.map(r => r.id === report.id ? { ...r, medicines: updatedMeds, dispensing_status: newStatus } : r));
      setDispensePreview(null);
      const msg = allDispensedNow
        ? `All items dispensed and stock deducted for ${report.id}`
        : `${pendingItems.length} item(s) dispensed. ${updatedMeds.filter(m => !m.dispensed).length} still pending.`;
      setAlert({ type: 'success', message: msg });
      setTimeout(() => refreshDispenserData(), 100);
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to dispense — stock may be insufficient' });
    } finally {
      setDispensing(false);
    }
  };

  const getEffectivePrice = (medName) => {
    const p = findProductPrice(medName);
    const pkg = PACKAGE_DATABASE[medName];
    if (p) return { dp: p.dp, cp: p.cp, bv: p.bv, isPackage: !!pkg, products: pkg?.products };
    return { dp: 0, cp: 0, bv: 0, isPackage: false };
  };

  const getComponentPrice = (compName) => {
    const p = findProductPrice(compName);
    if (p) return { dp: p.dp, cp: p.cp, bv: p.bv || 0 };
    return { dp: 0, cp: 0, bv: 0 };
  };

  const getPkgKey = (reportId, medIndex) => `${reportId}::${medIndex}`;

  const isPackageExpanded = (reportId, medIndex) => !!expandedPackages[getPkgKey(reportId, medIndex)];

  const togglePackageExpand = (reportId, medIndex) => {
    const key = getPkgKey(reportId, medIndex);
    setExpandedPackages(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getExpandedComponentState = (reportId, medIndex) => {
    const key = getPkgKey(reportId, medIndex);
    return expandedPackages[key + '_components'] || {};
  };

  const toggleComponentDispense = (reportId, medIndex, compIndex) => {
    const key = getPkgKey(reportId, medIndex) + '_components';
    setExpandedPackages(prev => {
      const current = prev[key] || {};
      return { ...prev, [key]: { ...current, [compIndex]: !current[compIndex] } };
    });
  };

  /* ── Prescription QUOTE (Thermal) ─────────────────────────────
     Goes to the customer BEFORE dispensing.
     Member = DP price only | Non-member = CP price only + consult fee
  ────────────────────────────────────────────────────────────── */
  const printPrescriptionQuoteThermal = (report, consultMode) => {
    const meds = getMedicines(report);
    const membershipStatus = report.membership_status || 'referred';
    const isMember = membershipStatus === 'member';
    const consultFee = getConsultationFee(membershipStatus);
    const items = meds.map(m => {
      const p = getEffectivePrice(m.name);
      return { name: m.name, dp: p.dp, cp: p.cp, bv: p.bv, isPackage: !!p.isPackage, dispensed: m.dispensed };
    });
    printReceipt(generatePrescriptionQuoteHTML({
      rxId: report.id,
      branch: effectiveBranch,
      patientName: report.client_name || report.full_name || 'Patient',
      membershipStatus,
      consultantName: report.consultant || null,
      items,
      consultFeeTotal: consultFee.total,
      consultFeeLabel: consultFee.label,
      consultMode: consultMode || (isMember ? 'inclusive' : 'separate'),
      date: report.created_at || report.date,
    }));
  };

  /* ── Prescription QUOTE (A4 PDF) ───────────────────────────── */
  const printPrescriptionPDF = (report, consultMode) => {
    const meds = getMedicines(report);
    const membershipStatus = report.membership_status || 'referred';
    const consultFee = getConsultationFee(membershipStatus);
    const items = meds.map(m => {
      const p = getEffectivePrice(m.name);
      return { name: m.name, dp: p.dp, cp: p.cp, bv: p.bv, isPackage: !!p.isPackage, dispensed: m.dispensed };
    });
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) return;
    w.document.write(generatePrescriptionQuotePDFHTML({
      rxId: report.id,
      branch: effectiveBranch,
      patientName: report.client_name || report.full_name || 'Patient',
      membershipStatus,
      consultantName: report.consultant || null,
      items,
      consultFeeTotal: consultFee.total,
      consultFeeLabel: consultFee.label,
      consultMode: consultMode || (membershipStatus === 'member' ? 'inclusive' : 'separate'),
      date: report.created_at || report.date,
    }));
    w.document.close();
  };

  /* ── Prescription RECEIPT (after dispensing, for billing) ─────
     Member: simple — DP price, BV, total
     Non-member: comprehensive — CP, DP, BV, profit, referral,
                 branch amount, N$50 cashback
  ────────────────────────────────────────────────────────────── */
  const printPrescriptionReceipt = (report, consultMode, checkupType) => {
    const allMeds = getMedicines(report);
    const dispensedMeds = allMeds.filter(m => m.dispensed || (Array.isArray(m.dispensed_components) && m.dispensed_components.length > 0));
    const meds = dispensedMeds.length > 0 ? dispensedMeds : allMeds;
    const membershipStatus = report.membership_status || 'referred';
    const isMember = membershipStatus === 'member';
    const consultFee = getConsultationFee(membershipStatus);
    const totals = calculatePrescriptionTotals(meds, membershipStatus);
    const isInclusive = consultMode === 'inclusive';
    const checkupOpt = checkupType ? CHECKUP_FEE_OPTIONS[checkupType] : null;

    const medItems = [];
    for (const m of meds) {
      const p = getEffectivePrice(m.name);
      if (p.isPackage && Array.isArray(m.dispensed_components) && m.dispensed_components.length > 0) {
        for (const compName of m.dispensed_components) {
          const cp = getComponentPrice(compName);
          medItems.push({
            product_name: compName,
            quantity: 1,
            unit_price: isMember ? cp.dp : cp.cp,
            line_total: isMember ? cp.dp : cp.cp,
            bv: cp.bv || 0,
            lineBV: cp.bv || 0,
            dpPrice: cp.dp || 0,
            cpPrice: cp.cp || 0,
            fromPackage: m.name,
          });
        }
      } else {
        medItems.push({
          product_name: m.name,
          quantity: 1,
          unit_price: isMember ? p.dp : p.cp,
          line_total: isMember ? p.dp : p.cp,
          bv: p.bv,
          lineBV: p.bv,
          dpPrice: p.dp || 0,
          cpPrice: p.cp || 0,
        });
      }
    }

    // Append checkup fee as a special item if selected
    const checkupItem = checkupOpt ? {
      product_name: checkupOpt.label,
      quantity: 1,
      unit_price: checkupOpt.fee,
      line_total: checkupOpt.fee,
      bv: 0,
      lineBV: 0,
      dpPrice: checkupOpt.fee - checkupOpt.cashback,
      cpPrice: checkupOpt.fee,
      isCheckup: true,
      cashbackPerUnit: isMember ? 0 : checkupOpt.cashback,
      consultantEarns: checkupOpt.consultantEarns,
    } : null;

    const items = checkupItem ? [...medItems, checkupItem] : medItems;

    const checkupTotal = checkupOpt ? checkupOpt.fee : 0;
    const rxBranchAmount = medItems.reduce((s, item) => s + (item.dpPrice || 0), 0);
    const rxDistProfit = medItems.reduce((s, item) => s + ((item.cpPrice || 0) - (item.dpPrice || 0)), 0);
    const totalBV = medItems.reduce((s, item) => s + (item.bv || 0), 0);
    const medTotal = medItems.reduce((s, item) => s + (isMember ? (item.dpPrice || 0) : (item.cpPrice || 0)), 0);
    const totalAmount = medTotal + checkupTotal + (isInclusive ? consultFee.total : 0);

    printReceipt(generateReceiptHTML({
      receiptNumber: 'RX-' + (report.id || Date.now()),
      branch: effectiveBranch,
      items,
      totalAmount,
      totalBV,
      paymentMethod: 'Prescription',
      customerType: isMember ? 'member' : 'non_member',
      customerName: report.client_name || report.full_name || 'Patient',
      nbNumber: report.nb_number || null,
      referralName: !isMember ? (report.referral_name || null) : null,
      referralNB: !isMember ? (report.referral_nb || null) : null,
      cashier: user?.full_name || user?.username || null,
      showBV: true,
      cashback: (!isMember && checkupOpt) ? checkupOpt.cashback : 0,
      branchAmount: !isMember ? rxBranchAmount : null,
      distributorProfit: !isMember ? rxDistProfit : null,
      consultFeeAmount: consultFee.total,
      consultFeeMode: consultMode,
    }));
  };

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  let filteredReports = reports.filter(r => {
    const meds = getMedicines(r);
    if (!meds || meds.length === 0) return false;
    if (effectiveBranch && r.branch && r.branch !== effectiveBranch) return false;
    if (rxSearch) {
      const q = rxSearch.toLowerCase();
      const match = (r.client_name || r.full_name || '').toLowerCase().includes(q)
        || (r.id || '').toString().includes(q)
        || (r.consultant || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (rxBranchFilter && (r.branch || '') !== rxBranchFilter) return false;
    if (rxStatusFilter !== 'all') {
      if (rxStatusFilter === 'pending') return meds.some(m => !m.dispensed);
      if (rxStatusFilter === 'dispensed') return meds.length > 0 && meds.every(m => m.dispensed);
      if (rxStatusFilter === 'paid') return meds.filter(m => m.dispensed).every(m => m.paid);
      if (rxStatusFilter === 'outstanding') return meds.some(m => m.dispensed && !m.paid);
    }
    if (rxFromDate) { const d = (r.created_at || r.date || '').slice(0, 10); if (d < rxFromDate) return false; }
    if (rxToDate) { const d = (r.created_at || r.date || '').slice(0, 10); if (d > rxToDate) return false; }
    if (rxGroupTab === 'recent') { if (new Date(r.created_at || r.date || 0) < sevenDaysAgo) return false; }
    if (rxGroupTab === 'partial') { const d = meds.filter(m => m.dispensed).length; if (d === 0 || d === meds.length) return false; }
    if (rxGroupTab === 'full') { if (!meds.every(m => m.dispensed)) return false; }
    return true;
  });

  filteredReports.sort((a, b) => new Date(b.created_at || b.date || 0) - new Date(a.created_at || a.date || 0));

  const branchReports = effectiveBranch
    ? reports.filter(r => !r.branch || r.branch === effectiveBranch)
    : reports;
  const groupCounts = {
    all: branchReports.filter(r => getMedicines(r).length > 0).length,
    recent: branchReports.filter(r => { const meds = getMedicines(r); return meds.length > 0 && new Date(r.created_at || r.date || 0) >= sevenDaysAgo; }).length,
    partial: branchReports.filter(r => { const meds = getMedicines(r); const d = meds.filter(m => m.dispensed).length; return d > 0 && d < meds.length; }).length,
    full: branchReports.filter(r => { const meds = getMedicines(r); return meds.length > 0 && meds.every(m => m.dispensed); }).length,
  };

  const dpModal = dispensePreview;
  const dpMedSubtotal = dpModal ? (dpModal.isMember ? dpModal.pendingDP : dpModal.pendingCP) : 0;
  const dpCheckupFeeAmt = dpModal?.checkupOpt ? dpModal.checkupOpt.fee : 0;
  const dpConsultFeeAmt = dpModal?.consultMode === 'inclusive' ? (dpModal.consultFee?.total || 0) : 0;
  const dpGrandTotal = dpMedSubtotal + dpCheckupFeeAmt + dpConsultFeeAmt;

  return (
    <div>
      <div className="flex items-center justify-between mb-5 p-5 rounded-2xl text-white" style={{ background: 'linear-gradient(135deg,#c41e3a 0%,#8b0000 100%)', boxShadow: '0 4px 20px rgba(196,30,58,0.28)' }}>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center text-2xl" style={{ background: 'rgba(255,255,255,0.12)' }}>💊</div>
          <div>
            <h3 className="text-xl font-bold m-0">Prescription Dispensing</h3>
            <p className="text-sm m-0" style={{ color: 'rgba(255,255,255,0.6)' }}>{user?.branch ? `${getBranchDisplayName(user.branch)} Branch` : 'Branch'} · Dispense, track and quote</p>
          </div>
        </div>
        <button onClick={refreshDispenserData} className="flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl cursor-pointer" style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}>↻ Refresh</button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { id: 'all', label: 'All', icon: '💊', activeBg: '#c41e3a', border: '#fecaca', bg: '#fff0f3', color: '#c41e3a' },
          { id: 'recent', label: 'Recent (7 days)', icon: '🕐', activeBg: '#059669', border: '#6ee7b7', bg: '#ecfdf5', color: '#065f46' },
          { id: 'partial', label: 'Partially Dispensed', icon: '⏳', activeBg: '#d97706', border: '#fcd34d', bg: '#fffbeb', color: '#92400e' },
          { id: 'full', label: 'Fully Dispensed', icon: '✅', activeBg: '#16a34a', border: '#86efac', bg: '#f0fdf4', color: '#166534' },
        ].map(tab => {
          const isActive = rxGroupTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setRxGroupTab(tab.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: `2px solid ${isActive ? tab.activeBg : tab.border}`, borderRadius: 10, background: isActive ? tab.activeBg : tab.bg, color: isActive ? '#fff' : tab.color, cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', transition: 'all .15s', boxShadow: isActive ? `0 3px 10px ${tab.activeBg}55` : 'none' }}>
              {tab.icon} {tab.label}
              <span style={{ padding: '1px 6px', borderRadius: 10, fontSize: '0.7rem', fontWeight: 700, background: isActive ? 'rgba(255,255,255,0.25)' : tab.activeBg, color: '#fff' }}>{groupCounts[tab.id]}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl p-4 mb-4" style={{ background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div className="flex gap-2 flex-wrap mb-3">
          <input type="text" placeholder="Search by name, report ID or consultant…" value={rxSearch} onChange={e => setRxSearch(e.target.value)}
            className="flex-1 text-sm rounded-lg px-3 py-2.5" style={{ minWidth: 200, border: '1.5px solid #e2e8f0' }} />
          <button onClick={refreshDispenserData} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white cursor-pointer border-none" style={{ background: '#16a34a' }}>🔍 Search</button>
          <button onClick={clearRxFilters} className="px-4 py-2.5 rounded-lg text-sm font-medium cursor-pointer border-none" style={{ background: '#f1f5f9', color: '#64748b' }}>♻️ Clear</button>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {(user?.role === 'admin' || user?.role === 'gm' || user?.role === 'director') && (
            <select value={rxBranchFilter} onChange={e => setRxBranchFilter(e.target.value)} className="text-sm rounded-lg px-3 py-2" style={{ border: '1.5px solid #e2e8f0' }}>
              <option value="">All Branches</option>
              {BRANCH_DETAILS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <select value={rxStatusFilter} onChange={e => setRxStatusFilter(e.target.value)} className="text-sm rounded-lg px-3 py-2" style={{ border: '1.5px solid #e2e8f0' }}>
            <option value="all">All Status</option>
            <option value="pending">⏳ Pending</option>
            <option value="dispensed">✅ Dispensed</option>
            <option value="paid">💰 Paid</option>
            <option value="outstanding">⚠️ Outstanding</option>
          </select>
          <input type="date" value={rxFromDate} onChange={e => setRxFromDate(e.target.value)} className="text-sm rounded-lg px-3 py-2" style={{ border: '1.5px solid #e2e8f0' }} />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" value={rxToDate} onChange={e => setRxToDate(e.target.value)} className="text-sm rounded-lg px-3 py-2" style={{ border: '1.5px solid #e2e8f0' }} />
        </div>
      </div>

      {alert && <div className="p-3 mb-3 rounded-lg text-sm" style={{ background: alert.type === 'success' ? '#dcfce7' : '#fee2e2', color: alert.type === 'success' ? '#166534' : '#991b1b' }}>{alert.message}</div>}

      {filteredReports.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-5xl mb-3">💊</div>
          <h3 className="text-lg font-semibold text-gray-500 mb-1">No prescriptions found</h3>
          <p className="text-sm">Prescriptions appear here once consultants create health reports.</p>
        </div>
      ) : filteredReports.map(report => {
        const medicines = getMedicines(report);
        const pendingCount = medicines.filter(m => !m.dispensed).length;
        const dispensedCount = medicines.filter(m => m.dispensed).length;
        const total = medicines.length;
        const pct = total > 0 ? Math.round((dispensedCount / total) * 100) : 0;
        const membershipStatus = report.membership_status || 'referred';
        const isMember = membershipStatus === 'member';
        const consultFee = getConsultationFee(membershipStatus);
        const totals = calculatePrescriptionTotals(medicines, membershipStatus);
        const consultMode = getConsultMode(report.id, isMember);
        const isInclusive = consultMode === 'inclusive';
        const medTotal = isMember ? totals.total.dp : totals.total.cp;
        const checkupType = getCheckupType(report.id);
        const checkupOpt = checkupType ? CHECKUP_FEE_OPTIONS[checkupType] : null;
        const checkupTotal = checkupOpt ? checkupOpt.fee : 0;
        const grandTotal = medTotal + checkupTotal + (isInclusive ? consultFee.total : 0);
        const allDispensed = pendingCount === 0 && total > 0;
        const headerGradient = allDispensed
          ? 'linear-gradient(135deg,#166534,#16a34a)'
          : pendingCount < total
            ? 'linear-gradient(135deg,#92400e,#d97706)'
            : 'linear-gradient(135deg,#c41e3a,#8b0000)';

        return (
          <div key={report.id} className="rounded-2xl overflow-hidden mb-5" style={{ background: '#fff', border: '1px solid #e2e8f0', boxShadow: '0 4px 16px rgba(0,0,0,0.07)' }}>

            <div className="p-5 text-white" style={{ background: headerGradient }}>
              <div className="flex justify-between items-start gap-3">
                <div>
                  <div className="text-xs font-bold tracking-widest mb-1" style={{ color: 'rgba(255,255,255,0.6)', letterSpacing: '0.12em' }}>PRESCRIPTION</div>
                  <div className="text-xl font-bold">{report.id}</div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ background: 'rgba(255,255,255,0.18)' }}>👤 {report.client_name || report.full_name || 'Patient'}</span>
                    {isMember
                      ? <span className="text-xs px-3 py-1 rounded-full font-bold" style={{ background: 'rgba(99,220,143,0.3)', color: '#d1fae5' }}>🏅 Member</span>
                      : <span className="text-xs px-3 py-1 rounded-full font-bold" style={{ background: 'rgba(251,191,36,0.3)', color: '#fef3c7' }}>👤 Non-Member</span>}
                    <span className="text-xs px-3 py-1 rounded-full font-bold" style={{ background: allDispensed ? 'rgba(74,222,128,0.3)' : dispensedCount > 0 ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.15)' }}>
                      {allDispensed ? `✅ Fully Dispensed` : dispensedCount > 0 ? `⚡ Partial (${dispensedCount}/${total})` : `⏳ Not Dispensed`}
                    </span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>{new Date(report.created_at || report.date || Date.now()).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                  <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.65)' }}>By: {report.consultant || 'Consultant'}</div>
                  <div className="text-xs mt-2 font-bold" style={{ color: 'rgba(255,255,255,0.9)' }}>{dispensedCount}/{total} dispensed</div>
                </div>
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
                  <span>Dispensing progress</span><span>{pct}%</span>
                </div>
                <div className="rounded-full overflow-hidden" style={{ height: 6, background: 'rgba(255,255,255,0.2)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct === 100 ? '#4ade80' : '#fbbf24' }} />
                </div>
              </div>
            </div>

            <div style={{ padding: '0 20px 20px' }}>

              {/* ── Medicines table ───────────────────────────────────────── */}
              <div style={{ marginBottom: 16, marginTop: 16 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>Prescribed Medicines</div>
                <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto auto', gap: 0, background: '#f8fafc', padding: '7px 12px', borderBottom: '2px solid #e2e8f0' }}>
                    <div />
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>Medicine</div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textAlign: 'right', paddingRight: 8 }}>{isMember ? 'DP' : 'CP'}</div>
                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textAlign: 'right' }}>Status</div>
                  </div>
                  {medicines.map((med, i) => {
                    const price = getEffectivePrice(med.name);
                    const unitPrice = isMember ? price.dp : price.cp;
                    const pkgExpanded = price.isPackage && isPackageExpanded(report.id, i);
                    const compState = pkgExpanded ? getExpandedComponentState(report.id, i) : {};
                    return (
                      <div key={i} style={{ borderBottom: i < medicines.length - 1 ? '1px solid #f1f5f9' : 'none', background: med.dispensed ? '#f0fdf4' : '#fff' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto auto', gap: 0, padding: '10px 12px', alignItems: 'start' }}>
                          <div style={{ paddingTop: 2 }}>
                            {!pkgExpanded && (
                              <input type="checkbox" checked={!!med.dispensed} onChange={() => toggleDispense(report.id, i)}
                                style={{ width: 16, height: 16, accentColor: '#16a34a', cursor: 'pointer' }} />
                            )}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: med.dispensed ? '#16a34a' : '#1e293b', textDecoration: med.dispensed ? 'line-through' : 'none', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              {med.name}
                              {price.isPackage && <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 4, background: '#dbeafe', color: '#1e40af', fontWeight: 700 }}>PKG</span>}
                            </div>
                            {isMember && price.bv > 0 && <div style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 600, marginTop: 2 }}>{price.bv} BV</div>}
                            {price.isPackage && price.products && !pkgExpanded && (
                              <div style={{ marginTop: 4, fontSize: '0.72rem', color: '#64748b' }}>
                                {price.products.map((pp, pi) => {
                                  const compP = getComponentPrice(pp.name);
                                  return (
                                    <div key={pi} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
                                      <span>{pp.name} ×{pp.quantity}</span>
                                      <span style={{ marginLeft: 8 }}>{isMember ? `N$${compP.dp}` : `N$${compP.cp}`}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {price.isPackage && !med.dispensed && (
                              <div style={{ marginTop: 6 }}>
                                <button onClick={() => togglePackageExpand(report.id, i)}
                                  style={{ fontSize: '0.7rem', padding: '3px 8px', borderRadius: 5, border: `1.5px solid ${pkgExpanded ? '#3b82f6' : '#93c5fd'}`, background: pkgExpanded ? '#dbeafe' : '#eff6ff', color: pkgExpanded ? '#1d4ed8' : '#1e40af', cursor: 'pointer', fontWeight: 600 }}>
                                  {pkgExpanded ? '↑ Full package' : '↓ Individual items'}
                                </button>
                              </div>
                            )}
                            {price.isPackage && pkgExpanded && price.products && (
                              <div style={{ marginTop: 6, borderRadius: 8, overflow: 'hidden', border: '1.5px solid #3b82f6', background: '#f0f6ff' }}>
                                <div style={{ padding: '5px 8px', background: '#dbeafe', fontSize: '0.68rem', fontWeight: 700, color: '#1e40af' }}>
                                  📦 Individual from {med.name}
                                </div>
                                {price.products.map((pp, pi) => {
                                  const compP = getComponentPrice(pp.name);
                                  const alreadyDispensed = Array.isArray(med.dispensed_components) && med.dispensed_components.includes(pp.name);
                                  const compSelected = !!compState[pi];
                                  return (
                                    <div key={pi} style={{ padding: '7px 8px', borderTop: '1px solid #bfdbfe', background: alreadyDispensed ? '#ecfdf5' : compSelected ? '#f0fdf4' : '#fff', display: 'flex', alignItems: 'center', gap: 7 }}>
                                      <input type="checkbox" checked={alreadyDispensed || compSelected} disabled={alreadyDispensed} onChange={() => !alreadyDispensed && toggleComponentDispense(report.id, i, pi)}
                                        style={{ width: 14, height: 14, accentColor: '#16a34a', cursor: alreadyDispensed ? 'not-allowed' : 'pointer', flexShrink: 0, opacity: alreadyDispensed ? 0.6 : 1 }} />
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: alreadyDispensed ? '#16a34a' : '#1e293b', textDecoration: alreadyDispensed ? 'line-through' : 'none' }}>
                                          {pp.name} <span style={{ color: '#94a3b8', fontWeight: 400 }}>×{pp.quantity}</span>
                                        </div>
                                      </div>
                                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#16a34a' }}>
                                        {isMember ? `N$${compP.dp}` : `N$${compP.cp}`}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {med.dispensed && (
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5, cursor: 'pointer' }}>
                                <input type="checkbox" checked={!!med.paid} onChange={() => togglePayment(report.id, i)}
                                  style={{ width: 13, height: 13, accentColor: '#2563eb' }} />
                                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: med.paid ? '#2563eb' : '#94a3b8' }}>
                                  {med.paid ? '💰 Paid' : 'Mark paid'}
                                </span>
                              </label>
                            )}
                          </div>
                          <div style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.85rem', color: '#1e293b', paddingRight: 8, paddingTop: 1, whiteSpace: 'nowrap' }}>N$ {unitPrice}</div>
                          <div style={{ textAlign: 'right', paddingTop: 1 }}>
                            {med.dispensed
                              ? <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '2px 6px', borderRadius: 4 }}>✓ Done</span>
                              : <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#94a3b8', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>Pending</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Fee Controls ─────────────────────────────────────────── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>

                {/* Health Check Fee */}
                <div style={{ borderRadius: 10, padding: '12px 14px', background: '#f0fdfa', border: `2px solid ${checkupType ? '#0d9488' : '#ccfbf1'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#0d9488', textTransform: 'uppercase', letterSpacing: '0.08em' }}>🩺 Health Check</div>
                      {checkupOpt
                        ? <div style={{ fontSize: '1rem', fontWeight: 900, color: '#0d9488', marginTop: 2 }}>N$ {checkupOpt.fee}</div>
                        : <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>None selected</div>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 1 }}>First Visit</div>
                    {[
                      { key: 'standard', label: 'Standard', sub: 'N$200' },
                      { key: 'report',   label: 'With Report', sub: 'N$250' },
                    ].map(opt => (
                      <button key={opt.key} onClick={() => setCheckupType(report.id, checkupType === opt.key ? null : opt.key)}
                        style={{ padding: '6px 10px', borderRadius: 7, border: `1.5px solid ${checkupType === opt.key ? '#0d9488' : '#ccfbf1'}`, background: checkupType === opt.key ? '#0d9488' : '#fff', color: checkupType === opt.key ? '#fff' : '#0f766e', fontWeight: checkupType === opt.key ? 700 : 500, cursor: 'pointer', fontSize: '0.75rem', textAlign: 'left', transition: 'all .12s' }}>
                        {opt.label} <span style={{ opacity: 0.7 }}>{opt.sub}</span>
                      </button>
                    ))}
                    <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4, marginBottom: 1 }}>Return / Follow-Up</div>
                    {[
                      { key: 'followup',        label: 'Follow-Up Visit', sub: 'N$150' },
                      { key: 'followup_report', label: 'With Report',     sub: 'N$200' },
                    ].map(opt => (
                      <button key={opt.key} onClick={() => setCheckupType(report.id, checkupType === opt.key ? null : opt.key)}
                        style={{ padding: '6px 10px', borderRadius: 7, border: `1.5px solid ${checkupType === opt.key ? '#7c3aed' : '#ede9fe'}`, background: checkupType === opt.key ? '#7c3aed' : '#fff', color: checkupType === opt.key ? '#fff' : '#6d28d9', fontWeight: checkupType === opt.key ? 700 : 500, cursor: 'pointer', fontSize: '0.75rem', textAlign: 'left', transition: 'all .12s' }}>
                        {opt.label} <span style={{ opacity: 0.7 }}>{opt.sub}</span>
                      </button>
                    ))}
                  </div>
                  {checkupOpt && (
                    <div style={{ marginTop: 6, fontSize: '0.68rem', color: checkupType?.startsWith('followup') ? '#6d28d9' : '#0f766e', background: checkupType?.startsWith('followup') ? '#ede9fe' : '#ccfbf1', padding: '4px 7px', borderRadius: 5 }}>
                      {checkupType?.startsWith('followup')
                        ? `Return client · Consultant N$${checkupOpt.consultantEarns}`
                        : (!isMember ? `Cashback N$${checkupOpt.cashback} · Consultant N$${checkupOpt.consultantEarns}` : `Member · Consultant N$${checkupOpt.fee}`)
                      }
                    </div>
                  )}
                </div>

                {/* Consultation Fee */}
                <div style={{ borderRadius: 10, padding: '12px 14px', background: '#fffbeb', border: `2px solid ${isInclusive ? '#16a34a' : '#fcd34d'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>💼 Consult Fee</div>
                      <div style={{ fontSize: '1rem', fontWeight: 900, color: '#92400e', marginTop: 2 }}>N$ {consultFee.total}</div>
                    </div>
                    <span style={{ fontSize: '0.66rem', padding: '2px 7px', borderRadius: 10, fontWeight: 700, background: isInclusive ? '#dcfce7' : '#fef3c7', color: isInclusive ? '#166534' : '#92400e' }}>
                      {isInclusive ? 'In Total' : 'Separate'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
                    <button onClick={() => setConsultMode(report.id, 'separate')}
                      style={{ flex: 1, padding: '6px', borderRadius: 7, border: `1.5px solid ${!isInclusive ? '#f59e0b' : '#e2e8f0'}`, background: !isInclusive ? '#fef3c7' : '#fff', color: !isInclusive ? '#92400e' : '#94a3b8', fontWeight: !isInclusive ? 700 : 500, cursor: 'pointer', fontSize: '0.72rem', transition: 'all .12s' }}>
                      Separate
                    </button>
                    <button onClick={() => setConsultMode(report.id, 'inclusive')}
                      style={{ flex: 1, padding: '6px', borderRadius: 7, border: `1.5px solid ${isInclusive ? '#16a34a' : '#e2e8f0'}`, background: isInclusive ? '#dcfce7' : '#fff', color: isInclusive ? '#166534' : '#94a3b8', fontWeight: isInclusive ? 700 : 500, cursor: 'pointer', fontSize: '0.72rem', transition: 'all .12s' }}>
                      Include
                    </button>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={isConsultPaid(report.id)} onChange={() => toggleConsultPaid(report.id)}
                      style={{ width: 14, height: 14, accentColor: '#16a34a' }} />
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, color: isConsultPaid(report.id) ? '#16a34a' : '#94a3b8' }}>
                      {isConsultPaid(report.id) ? '✓ Fee paid' : 'Mark paid'}
                    </span>
                  </label>
                  <div style={{ marginTop: 6, fontSize: '0.66rem', color: '#991b1b', background: '#fef2f2', padding: '3px 6px', borderRadius: 4, border: '1px solid #fecaca' }}>
                    ⚠ Not in branch sales
                  </div>
                </div>
              </div>

              {/* ── Quote Summary ─────────────────────────────────────────── */}
              <div style={{ borderRadius: 12, padding: '16px 18px', marginBottom: 16, background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', color: '#fff' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>Quote Summary</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem' }}>
                    <span style={{ color: 'rgba(255,255,255,0.7)' }}>Medicines ({total} item{total !== 1 ? 's' : ''})</span>
                    <span style={{ fontWeight: 700 }}>N$ {medTotal}</span>
                  </div>
                  {isMember && totals.total.bv > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem' }}>
                      <span style={{ color: 'rgba(255,255,255,0.6)' }}>Total BV earned</span>
                      <span style={{ fontWeight: 700, color: '#fbbf24' }}>{totals.total.bv} BV</span>
                    </div>
                  )}
                  {!isMember && (() => {
                    const nm_branchAmt = medicines.reduce((s, m) => { const p = getEffectivePrice(m.name); return s + (p.dp || 0); }, 0);
                    const nm_distProfit = medicines.reduce((s, m) => { const p = getEffectivePrice(m.name); return s + ((p.cp || 0) - (p.dp || 0)); }, 0);
                    return (<>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                        <span style={{ color: '#93c5fd' }}>Branch Amount (DP)</span>
                        <span style={{ fontWeight: 700, color: '#93c5fd' }}>N$ {nm_branchAmt}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                        <span style={{ color: '#86efac' }}>Distributor Profit</span>
                        <span style={{ fontWeight: 700, color: '#86efac' }}>N$ {nm_distProfit}</span>
                      </div>
                    </>);
                  })()}
                  {checkupOpt && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', padding: '5px 8px', borderRadius: 7, background: 'rgba(13,148,136,0.18)', border: '1px solid rgba(94,234,212,0.25)' }}>
                      <span style={{ color: '#5eead4' }}>🩺 {checkupOpt.label}</span>
                      <span style={{ fontWeight: 700, color: '#5eead4' }}>N$ {checkupOpt.fee}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', padding: '5px 8px', borderRadius: 7, background: isInclusive ? 'rgba(22,163,74,0.15)' : 'rgba(245,158,11,0.1)', border: `1px solid ${isInclusive ? 'rgba(74,222,128,0.25)' : 'rgba(251,191,36,0.25)'}` }}>
                    <span style={{ color: isInclusive ? '#4ade80' : '#fbbf24' }}>💼 {consultFee.label} <span style={{ opacity: 0.7, fontSize: '0.72rem' }}>({isInclusive ? 'included' : 'separate'})</span></span>
                    <span style={{ fontWeight: 700, color: isInclusive ? '#4ade80' : '#fbbf24' }}>N$ {consultFee.total}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.12)', marginTop: 4 }}>
                    <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>GRAND TOTAL{!isInclusive ? ' (excl. consult)' : ''}</span>
                    <span style={{ fontWeight: 900, fontSize: '1.25rem', color: '#4ade80' }}>N$ {grandTotal}</span>
                  </div>
                  {!isInclusive && (
                    <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
                      + N$ {consultFee.total} consultation fee billed separately
                    </div>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  {[
                    { label: 'Dispensed', val: isMember ? totals.dispensed.dp : totals.dispensed.cp, color: '#4ade80' },
                    { label: 'Paid', val: isMember ? totals.paid.dp : totals.paid.cp, color: '#60a5fa' },
                    { label: 'Outstanding', val: isMember ? totals.outstanding.dp : totals.outstanding.cp, color: '#f87171' },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ textAlign: 'center', borderRadius: 8, padding: '8px 4px', background: 'rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', marginBottom: 3 }}>{label}</div>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', color }}>N$ {val}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 flex-wrap justify-end">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button onClick={() => saveDraft(report)}
                    style={{ padding: '7px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, background: '#f8fafc', color: '#475569', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                    💾 Save Draft
                  </button>
                  <button onClick={() => printPrescriptionQuoteThermal(report, consultMode)}
                    style={{ padding: '7px 12px', border: '1.5px solid #d1d5db', borderRadius: 8, background: '#fff', color: '#374151', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                    🖨️ Print / Preview
                  </button>
                  <button onClick={() => printPrescriptionPDF(report, consultMode)}
                    style={{ padding: '7px 12px', border: '1.5px solid #93c5fd', borderRadius: 8, background: '#eff6ff', color: '#1e40af', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                    📄 PDF Quote
                  </button>
                </div>
                <div style={{ width: 1, background: 'rgba(255,255,255,0.15)', margin: '0 4px', alignSelf: 'stretch' }} />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button onClick={() => printPrescriptionReceipt(report, consultMode, checkupType)}
                    style={{ padding: '7px 14px', border: '1.5px solid #fecaca', borderRadius: 8, background: '#fff0f3', color: '#c41e3a', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>
                    🧾 Print Receipt
                  </button>
                  {pendingCount > 0 && (
                    <button onClick={() => openDispensePreview(report)}
                      style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: 'linear-gradient(135deg,#16a34a,#166534)', color: '#fff', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, boxShadow: '0 2px 8px rgba(22,163,74,0.35)' }}>
                      ✅ Confirm & Dispense ({pendingCount})
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {dispensePreview && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
          onClick={() => !dispensing && setDispensePreview(null)}>
          <div style={{ background: '#fff', borderRadius: 18, width: '95%', maxWidth: 620, maxHeight: '92vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '22px 26px 18px', background: 'linear-gradient(135deg,#166534,#16a34a)', borderRadius: '18px 18px 0 0', color: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>CONFIRM & DISPENSE</div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Prescription {dpModal.report.id}</h3>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.6)' }}>Grand Total</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#4ade80', lineHeight: 1.1 }}>N$ {Math.round(dpGrandTotal).toLocaleString("en-ZA")}</div>
                </div>
              </div>
            </div>
            <div style={{ padding: '20px 26px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', marginBottom: 20, padding: '14px 16px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                {[
                  { label: 'Patient', val: dpModal.report.client_name || dpModal.report.full_name || 'Patient' },
                  { label: 'Prescription', val: dpModal.report.id },
                  { label: 'Membership', val: dpModal.isMember ? '🏅 Member' : '👤 Non-Member', color: dpModal.isMember ? '#166534' : '#d97706' },
                  { label: 'Consultant', val: dpModal.report.consultant || '—' },
                ].map(({ label, val, color }) => (
                  <div key={label}>
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
                    <div style={{ fontWeight: 700, color: color || '#1e293b', fontSize: '0.87rem' }}>{val}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Medicines ({dpModal.pendingItems.length} item{dpModal.pendingItems.length !== 1 ? 's' : ''})</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginBottom: 4 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e2e8f0', fontSize: '0.68rem', fontWeight: 700, color: '#475569' }}>Product</th>
                    <th style={{ textAlign: 'center', padding: '8px 10px', borderBottom: '2px solid #e2e8f0', fontSize: '0.68rem', fontWeight: 700, color: '#475569' }}>Qty</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '2px solid #e2e8f0', fontSize: '0.68rem', fontWeight: 700, color: '#475569' }}>Unit Price</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '2px solid #e2e8f0', fontSize: '0.68rem', fontWeight: 700, color: '#475569' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {dpModal.pendingItems.map((item, i) => {
                    const unitPrice = dpModal.isMember ? (item.dp || 0) : (item.cp || 0);
                    const lineTotal = unitPrice * (item.quantity || 1);
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: item.isComponent ? '#f0f6ff' : '#fff' }}>
                        <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1e293b' }}>
                          <div>{item.name}{item.isPackage && !item.isComponent ? ' 📦' : ''}</div>
                          {item.isComponent && item.fromPackage && (
                            <div style={{ fontSize: '0.66rem', color: '#3b82f6', fontWeight: 500, marginTop: 1 }}>from {item.fromPackage}</div>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center', color: '#64748b' }}>{item.quantity}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#475569' }}>N$ {Math.round(unitPrice).toLocaleString("en-ZA")}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#1e293b' }}>N$ {Math.round(lineTotal).toLocaleString("en-ZA")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Fee breakdown summary */}
              <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e293b)', borderRadius: 12, padding: '14px 16px', marginBottom: 16, marginTop: 8 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 10 }}>Charge Summary</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem' }}>
                    <span style={{ color: 'rgba(255,255,255,0.7)' }}>Medicines subtotal</span>
                    <span style={{ fontWeight: 700, color: '#fff' }}>N$ {Math.round(dpMedSubtotal).toLocaleString("en-ZA")}</span>
                  </div>
                  {dpModal.checkupOpt && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', padding: '6px 8px', borderRadius: 8, background: 'rgba(13,148,136,0.2)', border: '1px solid rgba(94,234,212,0.25)' }}>
                      <span style={{ color: '#5eead4' }}>🩺 {dpModal.checkupOpt.label}</span>
                      <span style={{ fontWeight: 700, color: '#5eead4' }}>N$ {Math.round(dpModal.checkupOpt.fee).toLocaleString("en-ZA")}</span>
                    </div>
                  )}
                  {dpModal.consultMode === 'inclusive' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', padding: '6px 8px', borderRadius: 8, background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.25)' }}>
                      <span style={{ color: '#fbbf24' }}>💼 {dpModal.consultFee?.label} (included)</span>
                      <span style={{ fontWeight: 700, color: '#fbbf24' }}>N$ {Math.round(dpModal.consultFee?.total || 0).toLocaleString("en-ZA")}</span>
                    </div>
                  )}
                  {dpModal.consultMode !== 'inclusive' && (
                    <div style={{ fontSize: '0.73rem', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', padding: '2px 0' }}>
                      + Consultation fee (N$ {dpModal.consultFee?.total || 0}) billed separately
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.15)', marginTop: 4 }}>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff' }}>GRAND TOTAL</span>
                    <span style={{ fontWeight: 900, fontSize: '1.3rem', color: '#4ade80' }}>N$ {Math.round(dpGrandTotal).toLocaleString("en-ZA")}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '12px 14px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>Payment Method</label>
                <select value={rxDispensePayment} onChange={e => setRxDispensePayment(e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.83rem', background: '#fff' }}>
                  <option value="cash">💵 Cash</option>
                  <option value="card">💳 Card</option>
                  <option value="eft">🏦 EFT</option>
                  <option value="medical_aid">🏥 Medical Aid</option>
                </select>
              </div>
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 18, fontSize: '0.78rem', color: '#991b1b' }}>
                ⚠️ Clicking "Confirm & Dispense" will deduct stock using FEFO batch logic. This cannot be undone.
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setDispensePreview(null)} disabled={dispensing}
                  style={{ padding: '10px 20px', border: '1px solid #d1d5db', borderRadius: 10, background: '#fff', color: '#374151', cursor: dispensing ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                  Cancel
                </button>
                <button onClick={() => printPrescriptionQuoteThermal(dpModal.report, dpModal.consultMode)}
                  style={{ padding: '10px 20px', border: '1.5px solid #93c5fd', borderRadius: 10, background: '#eff6ff', color: '#1e40af', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                  🖨️ Print Preview
                </button>
                <button onClick={confirmDispense} disabled={dispensing}
                  style={{ padding: '10px 24px', border: 'none', borderRadius: 10, background: dispensing ? '#94a3b8' : 'linear-gradient(135deg,#16a34a,#166534)', color: '#fff', cursor: dispensing ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: '0.88rem', boxShadow: '0 3px 12px rgba(22,163,74,0.35)' }}>
                  {dispensing ? 'Dispensing...' : '✅ Confirm & Dispense'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PDF print helpers for reports ────────────────────────────────────────────
function printStockDocument(title, htmlBody, branch = '') {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; padding: 24px; }
    h1 { font-size: 16px; font-weight: 800; color: #c41e3a; margin-bottom: 2px; }
    h2 { font-size: 13px; font-weight: 700; color: #374151; margin-bottom: 12px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #c41e3a; padding-bottom: 10px; margin-bottom: 16px; }
    .company { color: #c41e3a; font-weight: 900; font-size: 15px; }
    .meta { text-align: right; color: #64748b; font-size: 10px; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #c41e3a; color: #fff; font-weight: 700; padding: 7px 8px; text-align: left; font-size: 10px; }
    td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; font-size: 10px; }
    tr:nth-child(even) td { background: #fdf7f8; }
    .total-row td { font-weight: 800; background: #fff0f3 !important; border-top: 2px solid #fecaca; }
    .badge { display:inline-block; padding: 1px 7px; border-radius: 20px; font-weight: 700; font-size: 9px; }
    .badge-red { background:#fef2f2; color:#c41e3a; border:1px solid #fecaca; }
    .badge-green { background:#f0fdf4; color:#166534; border:1px solid #bbf7d0; }
    .badge-amber { background:#fffbeb; color:#92400e; border:1px solid #fcd34d; }
    .badge-blue { background:#eff6ff; color:#1e40af; border:1px solid #93c5fd; }
    .print-btn { position:fixed; top:12px; right:12px; background:#c41e3a; color:#fff; border:none; padding:8px 18px; border-radius:8px; font-weight:700; cursor:pointer; font-size:12px; }
    @media print { * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } .print-btn { display:none; } body { padding:10px; } }
  </style></head><body>
  <button class="print-btn" onclick="window.print()">🖨️ Print</button>
  <div class="header">
    <div><div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div><h1>${title}</h1><h2>${branch ? branch + ' Branch' : ''}</h2></div>
    <div class="meta">Date: ${new Date().toLocaleDateString('en-NA', {day:'2-digit',month:'long',year:'numeric'})}<br>Time: ${new Date().toLocaleTimeString('en-NA', {hour:'2-digit',minute:'2-digit'})}<br>Generated by: Branch Portal</div>
  </div>
  ${htmlBody}
  </body></html>`);
  win.document.close();
}

function printPhysicalStockReport(inventory, branch) {
  const safeStr = (v, fallback = '[missing]') => (v != null && String(v).trim() !== '') ? String(v) : fallback;
  let totalDP = 0;
  const rows = inventory.map(r => {
    const pName = safeStr(r.product_name || r.productName || r.description, '[no product name]');
    const batchNo = safeStr(r.batch_no || r.batchNo || r.batch_number, '—');
    const q = Number(r.quantity || 0);
    const p = findProductPrice(pName !== '[no product name]' ? pName : '');
    const dpUnit = p?.dp ? Number(p.dp) : 0;
    const dpVal = dpUnit * q;
    totalDP += dpVal;
    const expRaw = r.expiry_date || r.expiryDate;
    let expLabel = '—';
    let isExp = false;
    if (expRaw) {
      const expDate = new Date(expRaw);
      if (!Number.isNaN(expDate.getTime())) {
        expLabel = expDate.toLocaleDateString('en-NA');
        isExp = expDate < new Date();
      } else {
        expLabel = '[invalid date]';
      }
    }
    const statusLabel = q <= 0 ? 'Out' : q < 10 ? 'Low' : isExp ? 'Expired' : 'OK';
    const statusColor = q <= 0 || isExp ? '#c41e3a' : q < 10 ? '#d97706' : '#166534';
    const qColor = q <= 0 ? '#c41e3a' : q < 10 ? '#d97706' : '#166534';
    return `<tr><td>${pName}</td><td>${batchNo}</td><td style="font-weight:700;color:${qColor}">${q}</td><td style="color:${statusColor};font-weight:600">${statusLabel}</td><td>${dpUnit > 0 ? `N$ ${Math.round(dpUnit).toLocaleString("en-ZA")}` : '—'}</td><td style="font-weight:700">${dpVal > 0 ? `N$ ${Math.round(dpVal).toLocaleString("en-ZA")}` : '—'}</td><td>${expLabel}</td></tr>`;
  }).join('');
  const total = inventory.reduce((s, r) => s + Number(r.quantity||0), 0);
  printStockDocument('Physical Stock Report (DP Valued)', `
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:10px;color:#166534;font-weight:600">All values use Distributor Price (DP)</div>
    <table><thead><tr><th>Product</th><th>Batch</th><th>Qty</th><th>Status</th><th>DP Unit</th><th>DP Value</th><th>Expiry</th></tr></thead><tbody>${rows}<tr class="total-row"><td colspan="2"><strong>TOTALS</strong></td><td><strong>${total}</strong></td><td></td><td></td><td style="font-weight:800;color:#c41e3a"><strong>N$ ${Math.round(totalDP).toLocaleString("en-ZA")}</strong></td><td></td></tr></tbody></table>`, branch);
}

function printStockMovementsReport(movements, branch) {
  const safeStr = (v, fallback = '[missing]') => (v != null && String(v).trim() !== '') ? String(v) : fallback;
  const fmtDate = (d) => {
    if (!d) return '[no date]';
    const parsed = new Date(d);
    if (Number.isNaN(parsed.getTime())) return '[invalid date]';
    return parsed.toLocaleDateString('en-NA', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
      parsed.toLocaleTimeString('en-NA', { hour: '2-digit', minute: '2-digit' });
  };
  const inTypes = ['received','receive','stock_receipt','transfer_in','return','return_in','adjustment'];
  let totalDPVal = 0;
  const rows = movements.map(r => {
    const pName = safeStr(r.product_name || r.productName, '[no product name]');
    const rawType = r.movement_type || r.type || '';
    const mType = safeStr(rawType.replace(/_/g, ' '), '[no type]');
    const p = findProductPrice(pName !== '[no product name]' ? pName : '');
    const absQty = Math.abs(Number(r.quantity || 0));
    const dpVal = p?.dp ? Number(p.dp) * absQty : 0;
    totalDPVal += dpVal;
    const staff = safeStr(r.created_by || r.createdBy, '—');
    const isOutward = !inTypes.includes(rawType.toLowerCase().replace(/ /g, '_'));
    const signedQty = isOutward ? `-${absQty}` : `+${absQty}`;
    const qColor = isOutward ? '#c41e3a' : '#166534';
    const batchNo = safeStr(r.batch_no || r.batchNo, '—');
    const fromLoc = safeStr(r.source_location || r.sourceLocation, '—');
    const toLoc = safeStr(r.destination_location || r.destinationLocation, '—');
    return `<tr><td>${fmtDate(r.created_at || r.createdAt)}</td><td>${pName}</td><td>${batchNo}</td><td><span style="display:inline-block;padding:1px 8px;border-radius:12px;font-size:9px;font-weight:700;background:#f1f5f9;border:1px solid #e2e8f0">${mType}</span></td><td style="text-align:right;font-weight:700;color:${qColor}">${signedQty}</td><td style="text-align:right">${dpVal > 0 ? `N$ ${Math.round(dpVal).toLocaleString("en-ZA")}` : '—'}</td><td>${fromLoc}</td><td>${toLoc}</td><td style="font-size:9px">${staff}</td></tr>`;
  }).join('');
  const totalQty = movements.reduce((s, r) => s + Math.abs(Number(r.quantity || 0)), 0);
  printStockDocument('Stock Movements Report (DP Valued)', `
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:10px;color:#166534;font-weight:600">All values use Distributor Price (DP)</div>
    <table><thead><tr><th>Date</th><th>Product</th><th>Batch</th><th>Type</th><th style="text-align:right">Qty</th><th style="text-align:right">DP Value</th><th>From</th><th>To</th><th>Staff</th></tr></thead><tbody>${rows || '<tr><td colspan="9" style="text-align:center;color:#94a3b8">No movements recorded</td></tr>'}
    <tr class="total-row"><td colspan="4"><strong>TOTAL</strong></td><td style="text-align:right"><strong>${totalQty}</strong></td><td style="text-align:right;font-weight:800;color:#c41e3a"><strong>N$ ${Math.round(totalDPVal).toLocaleString("en-ZA")}</strong></td><td colspan="3"></td></tr></tbody></table>`, branch);
}

function printReceivingStockReport(requests, branch) {
  const safeStr = (v, fallback = '[missing]') => (v != null && String(v).trim() !== '') ? String(v) : fallback;
  const fmtDate = (d) => {
    if (!d) return '[no date]';
    const parsed = new Date(d);
    return Number.isNaN(parsed.getTime()) ? '[invalid date]' : parsed.toLocaleDateString('en-NA');
  };
  const received = requests.filter(r => r.status === 'received' || r.status === 'approved' || r.status === 'dispatched');
  const rows = received.map(r => {
    const items = (() => { try { return typeof r.items === 'string' ? JSON.parse(r.items) : (Array.isArray(r.items) ? r.items : []); } catch { return []; } })();
    const reqNum = safeStr(r.request_number || r.id, '[no ref]');
    const fromBranch = safeStr(r.requesting_branch || r.from_branch, '—');
    const itemsStr = items.length > 0
      ? items.map(i => `${safeStr(i.product_name || i.name, '[unnamed]')} ×${Number(i.quantity || 0)}`).join(', ')
      : '[no items listed]';
    const priority = safeStr(r.priority, 'normal');
    const status = safeStr(r.status, 'unknown');
    const badgeClass = status === 'received' ? 'badge-green' : (status === 'approved' || status === 'dispatched') ? 'badge-blue' : 'badge-amber';
    return `<tr><td>${reqNum}</td><td>${fromBranch}</td><td style="font-size:9px">${itemsStr}</td><td>${priority}</td><td><span class="badge ${badgeClass}">${status}</span></td><td>${fmtDate(r.created_at)}</td></tr>`;
  }).join('');
  printStockDocument('Receiving Stock Report', `<table><thead><tr><th>Request #</th><th>Branch</th><th>Items</th><th>Priority</th><th>Status</th><th>Date</th></tr></thead><tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#94a3b8">No receiving records with dispatched/approved/received status</td></tr>'}</tbody></table>`, branch);
}

function printSalesReportDoc(sales, period, branch, onlineOrders, prescriptions) {
  const now = new Date();
  const periodLabel = period === 'today' ? now.toDateString() : now.toLocaleDateString('en-NA', { month: 'long', year: 'numeric' });

  const inPeriod = (dateStr) => {
    const d = new Date(dateStr);
    return period === 'today'
      ? d.toDateString() === now.toDateString()
      : d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  };

  // Walk-in sales breakdown
  const filtered = (Array.isArray(sales) ? sales : []).filter(s => inPeriod(s.created_at || s.timestamp));
  const memberSales = filtered.filter(r => (r.customerType || r.customer_type) === 'member');
  const nonMemberSales = filtered.filter(r => (r.customerType || r.customer_type) !== 'member');
  const memberTotal = memberSales.reduce((s, r) => s + Number(r.total || r.totalAmount || r.total_amount || 0), 0);
  const nonMemberTotal = nonMemberSales.reduce((s, r) => s + Number(r.total || r.totalAmount || r.total_amount || 0), 0);
  const walkinTotal = memberTotal + nonMemberTotal;

  // Payment method breakdown
  const cashSales = filtered.filter(r => (r.paymentMethod || r.payment_method || '').toLowerCase().includes('cash'));
  const cardSales = filtered.filter(r => (r.paymentMethod || r.payment_method || '').toLowerCase().includes('card') || (r.paymentMethod || r.payment_method || '').toLowerCase().includes('eft'));
  const cashTotal = cashSales.reduce((s, r) => s + Number(r.total || r.total_amount || 0), 0);
  const cardTotal = cardSales.reduce((s, r) => s + Number(r.total || r.total_amount || 0), 0);

  // Online orders breakdown
  const filteredOnline = (Array.isArray(onlineOrders) ? onlineOrders : []).filter(o => inPeriod(o.created_at));
  const onlineMember = filteredOnline.filter(o => o.customer_type === 'member');
  const onlineNonMember = filteredOnline.filter(o => o.customer_type !== 'member');
  const onlineMemberTotal = onlineMember.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const onlineNonMemberTotal = onlineNonMember.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const onlineTotal = onlineMemberTotal + onlineNonMemberTotal;

  // Prescription sales
  const filteredRx = (Array.isArray(prescriptions) ? prescriptions : []).filter(p => inPeriod(p.created_at || p.updated_at));
  const rxMember = filteredRx.filter(p => p.membership_status === 'member' || p.customer_type === 'member');
  const rxNonMember = filteredRx.filter(p => p.membership_status !== 'member' && p.customer_type !== 'member');

  const rxConsultRevenue = rxMember.length * 150 + rxNonMember.length * 200;
  const grandTotal = walkinTotal + onlineTotal + rxConsultRevenue;

  const fmtC = n => `N$ ${Math.round(Number(n || 0)).toLocaleString('en-ZA')}`;
  const statCard = (label, value, sub, color) =>
    `<div style="background:#fff;border:1.5px solid #f0e8ea;border-radius:10px;padding:12px;text-align:center">
      <div style="font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.06em">${label}</div>
      <div style="font-size:15px;font-weight:900;color:${color || '#c41e3a'};margin-top:4px">${value}</div>
      ${sub ? `<div style="font-size:9px;color:#94a3b8;margin-top:3px">${sub}</div>` : ''}
    </div>`;

  const sectionTitle = t => `<div style="font-size:10px;font-weight:800;color:#c41e3a;text-transform:uppercase;letter-spacing:.1em;border-bottom:2px solid #fecaca;padding-bottom:4px;margin:18px 0 10px">${t}</div>`;

  const tableRow = (cols, bold) => `<tr>${cols.map((c, i) => `<td style="${bold ? 'font-weight:800;background:#fff0f3;' : ''}${i === cols.length - 1 ? 'text-align:right;font-weight:700;color:#166534;' : ''}">${c}</td>`).join('')}</tr>`;

  const walkinRows = filtered.map(r => {
    const isM = (r.customerType || r.customer_type) === 'member';
    const rNB = r.nbNumber || r.nb_number || r.distributor_nb || r.distributor_code || '';
    return `<tr>
      <td>${r.receipt_number || r.saleNumber || r.id || '-'}</td>
      <td><span style="color:${isM ? '#1d4ed8' : '#374151'};font-weight:600">${isM ? '👤 Member' : '🚶 Walk-in'}</span></td>
      <td>${r.customerName || r.customer_name || r.fullName || r.distributor_name || 'Walk-in'}</td>
      <td>${rNB || '-'}</td>
      <td>${r.paymentMethod || r.payment_method || '-'}</td>
      <td style="font-weight:700;color:#166534;text-align:right">${fmtC(r.total || r.totalAmount || r.total_amount || 0)}</td>
      <td>${r.created_at ? new Date(r.created_at).toLocaleDateString('en-NA') : '-'}</td>
    </tr>`;
  }).join('');

  const onlineRows = filteredOnline.map(o => {
    const isM = o.customer_type === 'member';
    return `<tr>
      <td>${o.order_number || o.id || '-'}</td>
      <td><span style="color:${isM ? '#1d4ed8' : '#374151'};font-weight:600">${isM ? '👤 Member (DP)' : '🚶 Non-Member (CP)'}</span></td>
      <td>${o.customer_name || '-'}</td>
      <td>${o.payment_method || o.delivery_method || '-'}</td>
      <td style="font-weight:700;color:#166534;text-align:right">${fmtC(o.total_amount || 0)}</td>
      <td>${o.created_at ? new Date(o.created_at).toLocaleDateString('en-NA') : '-'}</td>
    </tr>`;
  }).join('');

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Sales Report — ${branch}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:Arial,sans-serif; font-size:11px; color:#1e293b; padding:24px; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #c41e3a; padding-bottom:10px; margin-bottom:16px; }
  .company { color:#c41e3a; font-weight:900; font-size:15px; }
  .grid-4 { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:14px; }
  .grid-5 { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; margin-bottom:14px; }
  table { width:100%; border-collapse:collapse; margin-top:4px; }
  th { background:#c41e3a; color:#fff; font-weight:700; padding:6px 8px; text-align:left; font-size:9.5px; }
  td { padding:5px 8px; border-bottom:1px solid #f1f5f9; font-size:9.5px; }
  tr:nth-child(even) td { background:#fdf7f8; }
  .total-row td { font-weight:800; background:#fff0f3 !important; border-top:2px solid #fecaca; }
  .meta { text-align:right; color:#64748b; font-size:10px; line-height:1.6; }
  .print-btn { position:fixed; top:12px; right:12px; background:#c41e3a; color:#fff; border:none; padding:8px 18px; border-radius:8px; font-weight:700; cursor:pointer; }
  @media print { * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } .print-btn { display:none; } body { padding:10px; } }
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨️ Print / PDF</button>
<div class="header">
  <div>
    <div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div>
    <div style="font-size:14px;font-weight:800;color:#8b0000;margin-top:4px">📊 Sales Report — ${period === 'today' ? 'Daily' : 'Monthly'}</div>
    <div style="color:#64748b;font-size:10px;margin-top:3px">${branch} Branch &nbsp;·&nbsp; Period: ${periodLabel}</div>
  </div>
  <div class="meta">Date: ${now.toLocaleDateString('en-NA', { day: '2-digit', month: 'long', year: 'numeric' })}<br>Time: ${now.toLocaleTimeString('en-NA', { hour: '2-digit', minute: '2-digit' })}</div>
</div>

<div style="background:#fff0f3;border:1.5px solid #fecaca;border-radius:10px;padding:14px;margin-bottom:16px">
  <div style="font-size:12px;font-weight:900;color:#c41e3a;margin-bottom:10px">GRAND TOTAL REVENUE</div>
  <div class="grid-4">
    ${statCard('Walk-in Sales Total', fmtC(walkinTotal), `${filtered.length} transactions`, '#c41e3a')}
    ${statCard('Online Orders Total', fmtC(onlineTotal), `${filteredOnline.length} orders`, '#1e40af')}
    ${statCard('Prescription Sales', `${filteredRx.length} Rx`, `${rxMember.length} member · ${rxNonMember.length} non-member`, '#166534')}
    ${statCard('GRAND TOTAL', fmtC(grandTotal), 'Walk-in + Online + Rx Consult', '#7c2d12')}
  </div>
</div>

${sectionTitle('Walk-in Sales Breakdown')}
<div class="grid-5">
  ${statCard('Member Sales', fmtC(memberTotal), `${memberSales.length} transactions`, '#1d4ed8')}
  ${statCard('Non-Member Sales', fmtC(nonMemberTotal), `${nonMemberSales.length} transactions`, '#374151')}
  ${statCard('Cash Payments', fmtC(cashTotal), `${cashSales.length} transactions`, '#166534')}
  ${statCard('Card / EFT', fmtC(cardTotal), `${cardSales.length} transactions`, '#0891b2')}
  ${statCard('Other Payments', fmtC(walkinTotal - cashTotal - cardTotal), `${filtered.length - cashSales.length - cardSales.length} transactions`, '#92400e')}
</div>
<table>
  <thead><tr><th>Receipt #</th><th>Customer Type</th><th>Customer</th><th>NB/DZ#</th><th>Payment</th><th style="text-align:right">Amount</th><th>Date</th></tr></thead>
  <tbody>${walkinRows || '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:12px">No walk-in sales in this period</td></tr>'}</tbody>
  ${filtered.length > 0 ? `<tfoot><tr class="total-row"><td colspan="4"><strong>WALK-IN TOTAL</strong></td><td></td><td style="text-align:right"><strong>${fmtC(walkinTotal)}</strong></td><td></td></tr></tfoot>` : ''}
</table>

${sectionTitle('Online Orders Breakdown')}
<div class="grid-4" style="margin-bottom:10px">
  ${statCard('Member Orders (DP)', fmtC(onlineMemberTotal), `${onlineMember.length} orders`, '#1d4ed8')}
  ${statCard('Non-Member Orders (CP)', fmtC(onlineNonMemberTotal), `${onlineNonMember.length} orders`, '#374151')}
  ${statCard('Total Orders', filteredOnline.length, '', '#c41e3a')}
  ${statCard('Online Revenue', fmtC(onlineTotal), '', '#166534')}
</div>
<table>
  <thead><tr><th>Order #</th><th>Customer Type</th><th>Customer</th><th>Method</th><th style="text-align:right">Amount</th><th>Date</th></tr></thead>
  <tbody>${onlineRows || '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:12px">No online orders in this period</td></tr>'}</tbody>
  ${filteredOnline.length > 0 ? `<tfoot><tr class="total-row"><td colspan="3"><strong>ONLINE TOTAL</strong></td><td></td><td style="text-align:right"><strong>${fmtC(onlineTotal)}</strong></td><td></td></tr></tfoot>` : ''}
</table>

${sectionTitle('Prescription Sales')}
<div class="grid-4" style="margin-bottom:10px">
  ${statCard('Total Prescriptions', filteredRx.length, 'Consultations', '#c41e3a')}
  ${statCard('Member Prescriptions', rxMember.length, 'N$150 consult fee', '#1d4ed8')}
  ${statCard('Non-Member Prescriptions', rxNonMember.length, 'N$200 consult fee', '#374151')}
  ${statCard('Consult Fee Revenue', fmtC(rxMember.length * 150 + rxNonMember.length * 200), 'estimated', '#166534')}
</div>
${filteredRx.length === 0 ? '<p style="color:#94a3b8;text-align:center;padding:12px">No prescriptions in this period</p>' : ''}

</body></html>`);
  win.document.close();
}
function printStockFormulaReport(inventory, movements, sales, branch) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodLabel = now.toLocaleDateString('en-NA', { month: 'long', year: 'numeric' });

  // Use enriched inventory data (qty_received/sold/dispensed/written_off) as the
  // single source of truth — avoids double-counting from raw movement logs.
  const received  = inventory.reduce((s, i) => s + Number(i.qty_received   || i.qtyReceived   || 0), 0);
  const sold      = inventory.reduce((s, i) => s + Number(i.qty_sold       || i.qtySold       || 0), 0);
  const dispensed = inventory.reduce((s, i) => s + Number(i.qty_dispensed  || i.qtyDispensed  || 0), 0);
  const writeOffs = inventory.reduce((s, i) => s + Number(i.qty_written_off|| i.qtyWrittenOff || 0), 0);
  const transferred = inventory.reduce((s, i) => s + Number(i.qty_transferred|| i.qtyTransferred|| 0), 0);
  const returns_  = inventory.reduce((s, i) => s + Number(i.qty_adjusted   || i.qtyAdjusted   || 0), 0);
  const closingQty   = inventory.reduce((s, i) => s + Number(i.quantity || 0), 0);
  const closingValue = inventory.reduce((s, i) => s + (Number(i.quantity || 0) * Number(i.unit_price || 0)), 0);
  const expiryItems = inventory.filter(i => i.expiry_date && new Date(i.expiry_date) < now);
  const expiryQty   = expiryItems.reduce((s, i) => s + Number(i.quantity || 0), 0);
  // Formula: Opening + Received = Closing + Sold + Dispensed + Write-offs + Transferred
  // => Opening = Closing + Sold + Dispensed + WriteOffs + Transferred − Received
  const opening = Math.max(0, closingQty + sold + dispensed + writeOffs + transferred - received);
  const salesQty = sold + dispensed;

  const win = window.open('', '_blank');
  if (!win) return;
  const fmt = (n) => Number(n||0).toLocaleString();
  const fmtC = (n) => `N$ ${Math.round(Number(n||0)).toLocaleString('en-ZA')}`;
  const fRow = (label, val, color, bg, borderTop) =>
    `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 18px;${bg?`background:${bg};`:''}${borderTop?`border-top:2px solid ${borderTop};`:''}border-bottom:1px solid #f1f5f9">
       <span style="font-size:12px;font-weight:700;color:#374151">${label}</span>
       <span style="font-size:16px;font-weight:900;color:${color||'#1e293b'}">${val}</span>
     </div>`;
  const invRows = inventory.map(i => `<tr><td>${i.product_name||i.description||'-'}</td><td>${i.batch_no||'-'}</td><td style="font-weight:800;color:${Number(i.quantity||0)<=0?'#c41e3a':Number(i.quantity||0)<10?'#d97706':'#166534'}">${i.quantity||0}</td><td>${i.unit_price?fmtC(i.unit_price):'-'}</td><td style="font-weight:700">${fmtC(Number(i.quantity||0)*Number(i.unit_price||0))}</td><td>${i.expiry_date?new Date(i.expiry_date).toLocaleDateString('en-NA'):'—'}</td></tr>`).join('');

  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Stock Report — ${branch}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; padding: 24px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #c41e3a; padding-bottom:10px; margin-bottom:16px; }
    .company { color:#c41e3a; font-weight:900; font-size:15px; }
    .sec-title { font-size:9px; font-weight:800; color:#c41e3a; text-transform:uppercase; letter-spacing:.12em; margin:14px 0 6px; border-bottom:1px solid #fecaca; padding-bottom:4px; }
    .formula-card { border:1.5px solid #f0e8ea; border-radius:12px; overflow:hidden; margin-bottom:16px; }
    .formula-header { background:linear-gradient(135deg,#c41e3a,#8b0000); color:#fff; padding:12px 18px; font-weight:800; font-size:13px; }
    table { width:100%; border-collapse:collapse; margin-top:4px; }
    th { background:#c41e3a; color:#fff; font-weight:700; padding:6px 8px; text-align:left; font-size:9.5px; }
    td { padding:5px 8px; border-bottom:1px solid #f1f5f9; font-size:9.5px; }
    tr:nth-child(even) td { background:#fdf7f8; }
    .total-row td { font-weight:800; background:#fff0f3 !important; border-top:2px solid #fecaca; }
    .meta { text-align:right; color:#64748b; font-size:10px; line-height:1.6; }
    .print-btn { position:fixed; top:12px; right:12px; background:#c41e3a; color:#fff; border:none; padding:8px 18px; border-radius:8px; font-weight:700; cursor:pointer; }
    @media print { * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } .print-btn { display:none; } body { padding:10px; } }
  </style></head><body>
  <button class="print-btn" onclick="window.print()">🖨️ Print</button>
  <div class="header">
    <div><div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div><div style="font-size:14px;font-weight:800;color:#8b0000;margin-top:4px">📊 Branch Stock Formula Report</div><div style="color:#64748b;font-size:10px;margin-top:3px">${branch} Branch &nbsp;·&nbsp; ${periodLabel}</div></div>
    <div class="meta">Date: ${now.toLocaleDateString('en-NA',{day:'2-digit',month:'long',year:'numeric'})}<br>Time: ${now.toLocaleTimeString('en-NA',{hour:'2-digit',minute:'2-digit'})}<br>Generated by: Branch Portal</div>
  </div>
  <div class="formula-card">
    <div class="formula-header">📐 Stock Calculation — ${periodLabel}</div>
    ${fRow('Opening Stock (estimated)', fmt(opening), '#1e3a5f', '#f4f7fb')}
    ${fRow('+ Issued / Received Stock', '+' + fmt(received), '#166534', '#f0fdf4')}
    ${fRow('− Sales (units sold)', '−' + fmt(salesQty), '#c41e3a', '#fef2f2')}
    ${fRow('− Returns', '−' + fmt(returns_), '#92400e', '#fffbeb')}
    ${fRow('− Expiring / Expired Stock', '−' + fmt(expiryQty), '#c41e3a', '#fef2f2')}
    ${fRow('− Promotions / Campaign Adjustments', '−0', '#c41e3a', '#fef2f2')}
    ${fRow('= Closing Stock', fmt(closingQty), '#15803d', 'linear-gradient(135deg,#f0fdf4,#dcfce7)', '#86efac')}
    <div style="padding:8px 18px;background:#fafafa;font-size:10px;color:#64748b;display:flex;justify-content:space-between"><span>Closing Value: <strong style="color:#c41e3a">${fmtC(closingValue)}</strong></span><span>Write-offs: <strong>${fmt(writeOffs)}</strong></span></div>
  </div>
  <div class="sec-title">Current Inventory — ${branch}</div>
  <table><thead><tr><th>Product</th><th>Batch</th><th>Qty</th><th>Unit Price</th><th>Stock Value</th><th>Expiry</th></tr></thead>
  <tbody>${invRows||'<tr><td colspan="6" style="text-align:center;color:#94a3b8">No inventory data</td></tr>'}
  <tr class="total-row"><td colspan="2"><strong>TOTALS</strong></td><td><strong>${fmt(closingQty)}</strong></td><td></td><td><strong>${fmtC(closingValue)}</strong></td><td></td></tr>
  </tbody></table>
  </body></html>`);
  win.document.close();
}
// ─── End PDF helpers ───────────────────────────────────────────────────────────

function BranchStockTab() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const portalBranch = useContext(PortalBranchContext);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState('inventory');
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [showWriteOffForm, setShowWriteOffForm] = useState(false);
  const [showReceiveForm, setShowReceiveForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);
  const [requests, setRequests] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [movements, setMovements] = useState([]);
  const [branchMovements, setBranchMovements] = useState([]);
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [requestItems, setRequestItems] = useState([]);
  const [requestPriority, setRequestPriority] = useState('normal');
  const [requestNotes, setRequestNotes] = useState('');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [receiveItems, setReceiveItems] = useState([]);
  const [receiveDeliveryNote, setReceiveDeliveryNote] = useState('');
  const [receiveReceivedBy, setReceiveReceivedBy] = useState('');
  const [receiveTransferModal, setReceiveTransferModal] = useState(null);
  const [receiveSignature, setReceiveSignature] = useState('');
  const [receiveNotes, setReceiveNotes] = useState('');
  const [viewDispatchNote, setViewDispatchNote] = useState(null);
  const [transferForm, setTransferForm] = useState({ product_name: '', quantity: '', to_branch: '', notes: '' });
  const [writeOffSelected, setWriteOffSelected] = useState({}); // { [batchId]: { quantity: '', reason: 'expired' } }
  const [writeOffSearch, setWriteOffSearch] = useState('');
  const [transferItems, setTransferItems] = useState([]);
  const [transferProductSearch, setTransferProductSearch] = useState('');
  const [transferToBranch, setTransferToBranch] = useState('');
  const [transferNotes, setTransferNotes] = useState('');
  const [viewRequest, setViewRequest] = useState(null);
  const [viewTransfer, setViewTransfer] = useState(null);
  const [invFilter, setInvFilter] = useState({ search: '', status: 'all', batch: '', expiry: '' });
  const [expandedInvProducts, setExpandedInvProducts] = useState(new Set());
  const [movFilter, setMovFilter] = useState({ search: '', type: 'all', dateFrom: '', dateTo: '' });
  const [stockCardModal, setStockCardModal] = useState(null);
  const [stockCardData, setStockCardData] = useState(null);
  const [stockCardLoading, setStockCardLoading] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(user?.branch || '');
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [availableBranches, setAvailableBranches] = useState([]);
  useEffect(() => {
    const isAdmin = user?.role === 'admin';

    // Non-admin users are always locked to their assigned branch — no lookup needed.
    if (!isAdmin) {
      if (user?.branch) {
        setSelectedBranch(user.branch);
        setAvailableBranches([user.branch]);
      }
      return;
    }

    // Admin: use the full branch list from BRANCH_DETAILS so ALL branches appear,
    // not just branches that happen to have existing inventory batches.
    const allBranchIds = BRANCH_DETAILS.map(b => b.id);
    setAvailableBranches(allBranchIds);
    // Default to portal-level branch if set, otherwise admin's own branch or first branch
    const adminBranch = portalBranch || (user?.branch && allBranchIds.includes(user.branch) ? user.branch : allBranchIds[0]);
    setSelectedBranch(adminBranch);
  }, []);

  // Sync with the portal-level "ACT AS BRANCH" selector — when admin switches at top level, mirror it here
  useEffect(() => {
    if (portalBranch && user?.role === 'admin') {
      setSelectedBranch(portalBranch);
    }
  }, [portalBranch]);

  const { connected: wsConnected } = useStockRealtime({
    onUpdate: useCallback(() => { if (selectedBranch) loadData(); }, [selectedBranch]),
  });

  const loadDataRef = useRef(0);
  useEffect(() => {
    if (selectedBranch) loadData();
    return () => { loadDataRef.current++; };
  }, [selectedBranch]);

  const loadData = async () => {
    const loadId = ++loadDataRef.current;
    setLoading(true);
    try {
      const activeBranch = selectedBranch;
      const branchParam = activeBranch ? `branch=${encodeURIComponent(activeBranch)}` : '';
      const movBranchParam = activeBranch ? `branch=${encodeURIComponent(activeBranch)}&limit=10000` : 'limit=10000';
      const [inv, reqs, trans, movs, prods, sl] = await Promise.all([
        api.branch.inventory(branchParam ? branchParam + '&include_movements=1&limit=10000' : 'include_movements=1&limit=10000').catch(() => ({ inventory: [], movements: [] })),
        api.stock.requests(branchParam).catch(() => ({ requests: [] })),
        api.stock.transfers(branchParam).catch(() => ({ transfers: [] })),
        api.get(`/stock-movements?${movBranchParam}`).catch(() => ({ movements: [] })),
        api.products.list().catch(() => []),
        api.branch.walkinSales(branchParam).catch(() => []),
      ]);
      if (loadId !== loadDataRef.current) return;
      const invData = Array.isArray(inv) ? inv : inv.inventory || [];
      const branchMovs = inv.movements || [];
      setInventory(invData);
      setBranchMovements(branchMovs);
      setRequests(Array.isArray(reqs) ? reqs : reqs.requests || []);
      setTransfers(Array.isArray(trans) ? trans : trans.transfers || []);
      const allMovs = Array.isArray(movs) ? movs : movs.movements || [];
      setMovements(allMovs);
      setProducts(Array.isArray(prods) ? prods : prods.products || []);
      setSales(Array.isArray(sl) ? sl : sl.sales || []);
    } catch {}
    if (loadId === loadDataRef.current) setLoading(false);
  };

  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const lowStock = inventory.filter(i => Number(i.quantity || 0) < 10 && Number(i.quantity || 0) > 0);
  const outOfStock = inventory.filter(i => Number(i.quantity || 0) <= 0);
  const expiringItems = inventory.filter(i => { const exp = i.expiry_date || i.expiryDate; if (!exp) return false; const d = new Date(exp); return d <= thirtyDays && d >= now; });
  const expiredItems = inventory.filter(i => { const exp = i.expiry_date || i.expiryDate; if (!exp) return false; return new Date(exp) < now; });

  const filteredProducts = products.filter(p => !productSearch || (p.name || p.description || '').toLowerCase().includes(productSearch.toLowerCase()));

  const addToRequestItems = (p) => {
    const name = p.name || p.description || p.id || 'Unknown Product';
    setRequestItems(prev => {
      const ex = prev.find(i => i.id === p.id);
      if (ex) return prev.map(i => i.id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { id: p.id, product_name: name, quantity: 1, dp: p.dp || p.price || 0, cp: p.cp || p.price || 0 }];
    });
  };
  const updateRequestQty = (id, delta) => setRequestItems(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i));
  const removeRequestItem = (id) => setRequestItems(prev => prev.filter(i => i.id !== id));

  const filteredTransferProducts = products.filter(p => !transferProductSearch || (p.name || p.description || '').toLowerCase().includes(transferProductSearch.toLowerCase()));
  const addToTransferItems = (p) => {
    setTransferItems(prev => {
      const ex = prev.find(i => i.id === p.id);
      if (ex) return prev.map(i => i.id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { id: p.id, product_name: p.name || p.description, quantity: 1 }];
    });
  };
  const updateTransferQty = (id, delta) => setTransferItems(prev => prev.map(i => i.id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i));
  const removeTransferItem = (id) => setTransferItems(prev => prev.filter(i => i.id !== id));
  const openTransferForm = () => { setTransferItems([]); setTransferProductSearch(''); setTransferToBranch(''); setTransferNotes(''); setShowTransferForm(true); };
  const parseItems = (r) => { try { return typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []); } catch { return []; } };

  const handleStockRequest = async () => {
    if (requestItems.length === 0) return;
    setSubmitting(true);
    try {
      await api.stock.createRequest({
        requesting_branch: selectedBranch || user?.branch || '',
        request_type: 'branch_restock',
        items: JSON.stringify(requestItems.map(i => ({ productId: i.id, productName: i.product_name, product_name: i.product_name, quantity: i.quantity }))),
        notes: requestNotes,
        priority: requestPriority,
        created_by: user?.full_name || user?.username || '',
      });
      setShowRequestForm(false);
      setRequestItems([]); setRequestPriority('normal'); setRequestNotes(''); setProductSearch('');
      setAlert({ type: 'success', message: 'Stock request submitted to Stock Management' });
      setTimeout(() => loadData(), 100);
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to submit request' });
    } finally { setSubmitting(false); }
  };

  const openReceiveForm = (req) => {
    const items = (() => { try { return typeof req.items === 'string' ? JSON.parse(req.items) : (req.items || []); } catch { return []; } })();
    setSelectedRequest(req);
    setReceiveItems(items.map(i => ({ ...i, received_qty: i.quantity })));
    setReceiveDeliveryNote('');
    setReceiveReceivedBy(user?.full_name || user?.username || '');
    setReceiveFormMsg(null);
    setShowReceiveForm(true);
  };

  const handleReceiveStock = async () => {
    if (!selectedRequest) return;
    setSubmitting(true);
    setReceiveFormMsg(null);
    try {
      const itemsToReceive = receiveItems.filter(item => Number(item.received_qty) > 0);
      for (const item of itemsToReceive) {
        if (!item.batch_no || !item.batch_no.trim()) {
          setReceiveFormMsg({ type: 'error', text: `Batch number is required for "${item.product_name}"` });
          setSubmitting(false);
          return;
        }
        if (!item.expiry_date) {
          setReceiveFormMsg({ type: 'error', text: `Expiry date is required for "${item.product_name}"` });
          setSubmitting(false);
          return;
        }
      }
      for (const item of itemsToReceive) {
          const productName = item.product_name || item.productName || item.productId || 'Unknown';
          const batchNo = item.batch_no?.trim() || '';
          const expiryDate = item.expiry_date || null;
          const qty = Number(item.received_qty);
          await api.stock.createMovement({
            product_name: productName,
            quantity: qty,
            movement_type: 'received',
            source_location: 'Warehouse',
            destination_location: selectedBranch || user?.branch || 'Branch',
            destination_location_type: 'branch',
            batch_no: batchNo,
            expiry_date: expiryDate,
            notes: `Received from request ${selectedRequest.request_number || selectedRequest.id}. Delivery note: ${receiveDeliveryNote || 'N/A'}. Batch: ${batchNo || 'N/A'}, Expiry: ${expiryDate || 'N/A'}`,
            reference_id: selectedRequest.id,
            created_by: receiveReceivedBy || user?.full_name || user?.username || null,
          });
          await api.branch.receiveInventory({
            action: 'receive',
            branchId: selectedBranch || user?.branch || 'Branch',
            productName,
            batchNo,
            expiryDate,
            quantity: qty,
            notes: `Received from request ${selectedRequest.request_number || selectedRequest.id}. Delivery note: ${receiveDeliveryNote || 'N/A'}`,
            createdBy: receiveReceivedBy || user?.full_name || user?.username || null,
          });
      }
      await api.stock.updateRequest(selectedRequest.id, { status: 'received' });
      setShowReceiveForm(false);
      setSelectedRequest(null);
      setReceiveFormMsg(null);
      setAlert({ type: 'success', message: 'Stock received and recorded successfully' });
      setSubTab('inventory');
      setTimeout(() => loadData(), 100);
    } catch (err) {
      setReceiveFormMsg({ type: 'error', text: err.message || 'Failed to record receipt' });
    } finally { setSubmitting(false); }
  };

  const handleTransfer = async () => {
    if (transferItems.length === 0 || !transferToBranch) return;
    setSubmitting(true);
    try {
      await api.stock.createTransfer({
        fromWarehouse: selectedBranch || user?.branch || '',
        toBranch: transferToBranch,
        items: transferItems.map(i => ({ product_name: i.product_name, quantity: i.quantity })),
        created_by: user?.full_name || user?.username || '',
        notes: transferNotes,
      });
      setShowTransferForm(false);
      setTransferItems([]); setTransferToBranch(''); setTransferNotes(''); setTransferProductSearch('');
      setAlert({ type: 'success', message: 'Stock transfer initiated successfully' });
      setTimeout(() => loadData(), 100);
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to create transfer' });
    } finally { setSubmitting(false); }
  };

  const handleWriteOff = async () => {
    const entries = Object.entries(writeOffSelected).filter(([, v]) => Number(v.quantity) > 0);
    if (!entries.length) return;
    // Validate quantities don't exceed available stock
    for (const [batchId, { quantity }] of entries) {
      const batch = inventory.find(i => i.id === batchId);
      if (batch && Number(quantity) > Number(batch.quantity || 0)) {
        const pName = batch.product_name || batch.productName;
        setAlert({ type: 'error', message: `Cannot write off ${quantity} of ${pName} — only ${batch.quantity} available in this batch` });
        return;
      }
    }
    setSubmitting(true);
    let successCount = 0;
    let totalDP = 0;
    try {
      for (const [batchId, { quantity, reason }] of entries) {
        const batch = inventory.find(i => i.id === batchId);
        if (!batch) continue;
        const pName = batch.product_name || batch.productName;
        const dp = findProductPrice(pName);
        const dpVal = dp?.dp ? Math.round(Number(dp.dp) * Number(quantity)) : 0;
        totalDP += dpVal;
        const reasonLabel = reason.charAt(0).toUpperCase() + reason.slice(1);
        await api.stock.createMovement({
          product_name: pName,
          quantity: Number(quantity),
          movement_type: 'write_off',
          status: 'pending_approval',
          source_location: selectedBranch || user?.branch || '',
          destination_location: 'written_off',
          batch_no: batch.batch_no || batch.batchNo || '',
          expiry_date: batch.expiry_date || batch.expiryDate || null,
          reason: reasonLabel,
          write_off_reason: reasonLabel,
          notes: `Write-off: ${reason}. Batch: ${batch.batch_no || batch.batchNo || 'N/A'}. Expiry: ${batch.expiry_date || batch.expiryDate || 'N/A'}. DP Value: N$ ${dpVal}`,
          reference_id: `WO-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
          created_by: user?.full_name || user?.username || '',
        });
        successCount++;
      }
      setShowWriteOffForm(false);
      setWriteOffSelected({});
      setWriteOffSearch('');
      setAlert({ type: 'success', message: `${successCount} write-off${successCount !== 1 ? 's' : ''} submitted for GM approval. Total DP value: N$ ${totalDP.toLocaleString('en-ZA')}.` });
      setTimeout(() => loadData(), 100);
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to record write-off' });
    } finally { setSubmitting(false); }
  };

  const openReceiveTransferModal = (transfer) => {
    const items = Array.isArray(transfer.items) ? transfer.items : [];
    const mapped = items.length > 0 ? items.map(it => ({
      ...it,
      quantitySent: it.quantityApproved != null ? it.quantityApproved : it.quantity,
      quantityReceived: it.quantityApproved != null ? it.quantityApproved : it.quantity,
      discrepancyNote: '',
      _hasDiscrepancy: false,
    })) : (transfer.product_name ? [{
      productName: transfer.product_name,
      productId: transfer.product_name,
      batchNo: null,
      expiryDate: null,
      quantity: transfer.quantity || 0,
      quantitySent: transfer.quantity || 0,
      quantityReceived: transfer.quantity || 0,
      discrepancyNote: '',
      _hasDiscrepancy: false,
      unit: 'units',
    }] : []);
    setReceiveItems(mapped);
    setReceiveSignature(user?.full_name || user?.username || '');
    setReceiveNotes('');
    setReceiveTransferModal(transfer);
  };

  const [receiveModalMsg, setReceiveModalMsg] = useState(null);
  const [receiveFormMsg, setReceiveFormMsg] = useState(null);

  const handleReceiveTransfer = async () => {
    const transfer = receiveTransferModal;
    if (!transfer) return;
    setSubmitting(true);
    setReceiveModalMsg(null);
    try {
      const receiverName = user?.full_name || user?.username || 'Branch Staff';
      const hasDiscrepancy = receiveItems.some(it => it._hasDiscrepancy || Number(it.quantityReceived) !== Number(it.quantitySent));
      const allZero = receiveItems.every(it => Number(it.quantityReceived) === 0);

      const receiptStatus = allZero ? 'discrepancy_reported' : hasDiscrepancy ? 'partially_received' : 'received';
      const transferStatus = hasDiscrepancy ? 'partially_received' : 'delivered';
      const updatedItems = receiveItems.map(({ _hasDiscrepancy, ...it }) => ({
        ...it,
        quantityReceived: Number(it.quantityReceived || 0),
        discrepancyNote: it.discrepancyNote || null,
      }));

      await api.stock.updateTransfer(transfer.id, {
        status: transferStatus,
        received_by: receiverName,
        signatureName: receiverName,
        branchReceiptNote: null,
        discrepancyFlag: hasDiscrepancy,
        receiptStatus,
        items: updatedItems,
      });

      const successMsg = hasDiscrepancy
        ? `Stock received with discrepancies noted. ${receiptStatus === 'partially_received' ? 'Partial receipt recorded.' : 'Discrepancy reported.'}`
        : `Stock received successfully from ${fmtLocation(transfer.fromWarehouse || transfer.from_location)}`;

      setReceiveTransferModal(null);
      setReceiveSignature('');
      setReceiveNotes('');
      setReceiveModalMsg(null);
      setAlert({ type: 'success', message: successMsg });
      setSubTab('inventory');
      setTimeout(() => loadData(), 100);
    } catch (err) {
      setReceiveModalMsg({ type: 'error', text: err.message || 'Failed to receive transfer' });
    } finally { setSubmitting(false); }
  };

  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    setSubmitting(true);
    try {
      if (rejectTarget.type === 'transfer') {
        await api.stock.updateTransfer(rejectTarget.id, {
          status: 'rejected',
          rejection_reason: rejectReason.trim(),
          rejected_by: user?.full_name || user?.username,
        });
      } else {
        await api.stock.updateRequest(rejectTarget.id, {
          status: 'rejected',
          rejection_reason: rejectReason.trim(),
        });
      }
      setRejectTarget(null);
      setRejectReason('');
      setAlert({ type: 'success', message: `${rejectTarget.type === 'transfer' ? 'Delivery' : 'Request'} rejected. Stock management has been notified.` });
      setTimeout(() => loadData(), 100);
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to reject' });
    } finally { setSubmitting(false); }
  };

  if (loading && inventory.length === 0 && requests.length === 0) return <LoadingSpinner />;

  const effectiveBranchForStock = selectedBranch || user?.branch || '';
  const branchKey = effectiveBranchForStock ? effectiveBranchForStock.toLowerCase().replace(/\s+/g, '_') : '';
  const branchMatchKeys = branchKey ? [
    branchKey,
    branchKey.replace(/_branch$/, ''),
    branchKey + '_branch',
    effectiveBranchForStock.toLowerCase(),
  ].filter(Boolean) : [];
  const isBranchMatch = (dest) => {
    if (!branchKey) return true;
    const d = (dest || '').toLowerCase().replace(/\s+/g, '_');
    return branchMatchKeys.some(k => d === k || d.includes(k) || k.includes(d));
  };
  const incomingDeliveries = transfers.filter(t => {
    const dest = t.toBranch || t.to_location || '';
    const st = (t.status || '').toLowerCase();
    const isApproved = st === 'approved' || st === 'in_transit' || st === 'dispatched';
    return isBranchMatch(dest) && isApproved;
  });
  // Pending requests approved/dispatched by stock management
  const pendingRequests = requests.filter(r => r.status === 'approved' || r.status === 'dispatched');
  const pendingReceive = pendingRequests; // keep for backward compat badge count
  const totalPendingReceive = incomingDeliveries.length + pendingRequests.length;
  const stockSubTabs = [
    { id: 'inventory', label: '📦 Inventory' },
    { id: 'alerts', label: `⚠️ Alerts (${lowStock.length + expiringItems.length + expiredItems.length + outOfStock.length})` },
    { id: 'requests', label: '📋 Requests' },
    { id: 'receive', label: `📥 Receive Stock${totalPendingReceive > 0 ? ` (${totalPendingReceive})` : ''}` },
    { id: 'transfers', label: '↔ Transfers' },
    { id: 'movements', label: '📊 Movements' },
    { id: 'reports', label: '🖨️ Reports' },
  ];

  const sectionLabel = (txt) => <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '.12em', color: '#c41e3a', textTransform: 'uppercase', marginBottom: 10 }}>{txt}</div>;

  return (
    <div>
      <div className="rounded-xl p-5 mb-5 flex justify-between items-center flex-wrap gap-3" style={{ background: 'linear-gradient(135deg,#c41e3a 0%,#8b0000 100%)', boxShadow: '0 4px 20px rgba(196,30,58,0.28)' }}>
        <div>
          <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1 m-0">Branch Operations</p>
          <h3 className="text-white text-lg font-bold m-0 flex items-center gap-2">
            📦 Stock Management
            {wsConnected && <span style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 99, padding: '1px 8px', fontSize: '0.7rem', fontWeight: 700 }}>● LIVE</span>}
          </h3>
          <p className="text-white/70 text-sm mt-1 m-0">Inventory · Request Stock · Receive · Reports</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => { setRequestItems([]); setProductSearch(''); setShowRequestForm(true); }} className="px-4 py-2 rounded-full font-semibold text-sm cursor-pointer" style={{ background: '#fff', color: '#c41e3a', border: 'none', fontWeight: 700 }}>📋 Request Stock</button>
          <button onClick={openTransferForm} className="px-4 py-2 rounded-full font-semibold text-sm cursor-pointer text-white" style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)' }}>↔ Transfer</button>
          <button onClick={() => setShowWriteOffForm(true)} className="px-4 py-2 rounded-full font-semibold text-sm cursor-pointer text-white" style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)' }}>🗑️ Write Off</button>
          {user?.role === 'admin' && (
            <button onClick={() => navigate('/stock')} className="px-4 py-2 rounded-full font-semibold text-sm cursor-pointer text-white" style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', gap: 5 }}>
              🏭 Stock Portal <span style={{ fontSize: '0.7rem', opacity: 0.8 }}>↗</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Summary Strip */}
      {(() => {
        const totalProducts = [...new Set(inventory.map(i => (i.product_name || i.productName || '').trim().toLowerCase()).filter(Boolean))].length;
        const totalDpValue = inventory.reduce((s, i) => { const p = findProductPrice(i.product_name || i.productName || ''); return s + (p?.dp ? Number(p.dp) : 0) * Number(i.quantity || 0); }, 0);
        const openReqs = requests.filter(r => r.status === 'pending' || r.status === 'submitted').length;
        const totalAlerts = outOfStock.length + expiredItems.length + lowStock.length + expiringItems.length;
        const kpis = [
          { label: 'Products', value: totalProducts, icon: '📦', color: '#1e3a5f', bg: '#f0f4ff', tab: 'inventory' },
          { label: 'Stock Value (DP)', value: `N$ ${Math.round(totalDpValue).toLocaleString('en-ZA')}`, icon: '💰', color: '#166534', bg: '#f0fdf4', tab: 'inventory' },
          { label: 'Pending Deliveries', value: totalPendingReceive, icon: '📥', color: totalPendingReceive > 0 ? '#1e40af' : '#94a3b8', bg: totalPendingReceive > 0 ? '#eff6ff' : '#f8fafc', tab: 'receive' },
          { label: 'Active Alerts', value: totalAlerts, icon: '⚠️', color: totalAlerts > 0 ? '#c41e3a' : '#94a3b8', bg: totalAlerts > 0 ? '#fef2f2' : '#f8fafc', tab: 'alerts' },
          { label: 'Open Requests', value: openReqs, icon: '📋', color: openReqs > 0 ? '#d97706' : '#94a3b8', bg: openReqs > 0 ? '#fffbeb' : '#f8fafc', tab: 'requests' },
        ];
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: 16 }}>
            {kpis.map(k => (
              <button key={k.label} onClick={() => setSubTab(k.tab)} style={{ background: k.bg, border: `1.5px solid ${k.color}22`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', textAlign: 'left', transition: 'box-shadow .15s' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = `0 4px 16px ${k.color}22`}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>{k.icon} {k.label}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 900, color: k.color }}>{k.value}</div>
              </button>
            ))}
          </div>
        );
      })()}

      {alert && <Alert type={alert.type} className="mb-4" onClose={() => setAlert(null)}>{alert.message}</Alert>}

      {/* Admin can switch branches; non-admin users are locked to their assigned branch */}
      {user?.role === 'admin' && availableBranches.length > 1 && (
        <div className="mb-4 flex items-center gap-3 p-3 rounded-lg" style={{ background: '#f8f9fa', border: '1px solid #e2e8f0' }}>
          <label className="text-sm font-semibold text-gray-600">Branch:</label>
          <select
            value={selectedBranch}
            onChange={e => setSelectedBranch(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm font-medium border"
            style={{ borderColor: '#cbd5e1', background: '#fff', minWidth: 180 }}
          >
            {availableBranches.map(b => (
              <option key={b} value={b}>{getBranchDisplayName(b) || b.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-2 mb-5 flex-wrap">
        {stockSubTabs.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)} className="px-4 py-2 rounded-full text-sm font-semibold cursor-pointer transition-all border-none"
            style={subTab === t.id ? { background: '#fff0f3', color: '#c41e3a', border: '2px solid #fecaca' } : { background: '#f9f5f5', color: '#64748b', border: '2px solid transparent' }}>{t.label}</button>
        ))}
      </div>

      {/* Stock Card Modal */}
      {stockCardModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,0,20,0.65)', zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 12px', overflowY: 'auto', backdropFilter: 'blur(3px)' }} onClick={e => { if (e.target === e.currentTarget) { setStockCardModal(null); setStockCardData(null); } }}>
          <div style={{ width: '100%', maxWidth: 900, background: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: '0 30px 80px rgba(196,30,58,0.2)', marginBottom: 24 }}>
            <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: '1.05rem' }}>📋 Stock Card — {stockCardModal}</div>
                <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.78rem', marginTop: 2 }}>{getBranchDisplayName(selectedBranch || user?.branch)} · Chronological movement ledger with running balances</div>
              </div>
              <button onClick={() => { setStockCardModal(null); setStockCardData(null); }} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: '18px 22px' }}>
              {stockCardLoading && <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>Loading stock card...</div>}
              {!stockCardLoading && stockCardData && (() => {
                const { ledger, summary, batches } = stockCardData;
                return (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(115px,1fr))', gap: 10, marginBottom: 16 }}>
                      {[
                        { label: 'Opening Balance', value: summary.openingBalance, color: '#1e3a5f' },
                        { label: '+ Received', value: `+${summary.totalReceived}`, color: '#166534' },
                        { label: '− Walk-in Sales', value: `−${summary.totalWalkinSold}`, color: '#c41e3a' },
                        { label: '− Dispensed (Rx)', value: `−${summary.totalDispensed}`, color: '#6366f1' },
                        ...(summary.totalTransferOut > 0 ? [{ label: '− Transfer Out', value: `−${summary.totalTransferOut}`, color: '#9333ea' }] : []),
                        ...(summary.totalWriteOff > 0 ? [{ label: '− Write Off', value: `−${summary.totalWriteOff}`, color: '#d97706' }] : []),
                        { label: 'Closing Balance', value: summary.closingBalance, color: summary.closingBalance > 0 ? '#166534' : '#c41e3a' },
                      ].map(card => (
                        <div key={card.label} style={{ background: '#f8f9fb', border: '1.5px solid #e8d5d8', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
                          <div style={{ fontWeight: 900, fontSize: '1.2rem', color: card.color }}>{card.value}</div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 3 }}>{card.label}</div>
                        </div>
                      ))}
                    </div>
                    {summary.formula && (
                      <div style={{ marginBottom: 12, padding: '8px 14px', background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 8, fontSize: '0.78rem', color: '#1e3a5f', fontFamily: 'monospace' }}>
                        <strong style={{ fontFamily: 'inherit' }}>Formula:</strong> {summary.formula}
                      </div>
                    )}
                    {batches && batches.length > 0 && (
                      <div style={{ marginBottom: 14, padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: '0.79rem', color: '#166534' }}>
                        <strong>Current Batches:</strong> {batches.map(b => `${b.batchNo || '—'} × ${b.quantity}${b.expiryDate ? ` (exp: ${String(b.expiryDate).slice(0,10)})` : ''}`).join(' · ')}
                      </div>
                    )}
                    {ledger.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>No movement records found for this product at this branch.</div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.77rem' }}>
                          <thead>
                            <tr style={{ background: '#f8f5f5' }}>
                              {['#','Date','Type','Batch','Qty','Direction','Opening','Closing','Reference','By'].map((h, i) => (
                                <th key={h} style={{ padding: '7px 8px', borderBottom: '2px solid #c41e3a', fontWeight: 700, color: '#374151', fontSize: '0.67rem', textTransform: 'uppercase', textAlign: i >= 4 && i <= 7 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {ledger.map((row, i) => {
                              const isIn = row.direction === 'in';
                              const isOut = row.direction === 'out';
                              const qColor = isIn ? '#166534' : isOut ? '#c41e3a' : '#64748b';
                              return (
                                <tr key={row.id || i} style={{ background: i % 2 === 0 ? '#fff' : '#fdf8f8', borderBottom: '1px solid #f0e8ea' }}>
                                  <td style={{ padding: '6px 8px', color: '#94a3b8', fontSize: '0.68rem' }}>{row.rowIndex}</td>
                                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', fontSize: '0.72rem', color: '#475569' }}>{row.date ? new Date(row.date).toLocaleDateString('en-NA', { day:'2-digit', month:'short', year:'numeric' }) : '—'}</td>
                                  <td style={{ padding: '6px 8px' }}>
                                    <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 12, fontSize: '0.65rem', fontWeight: 700, background: '#f1f5f9', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{row.typeLabel || row.type || '—'}</span>
                                  </td>
                                  <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: '0.72rem', color: '#6b7280' }}>{row.batchNo || '—'}</td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: qColor }}>{isIn ? '+' : isOut ? '−' : ''}{row.quantity}</td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                                    <span style={{ fontSize: '0.65rem', fontWeight: 700, color: qColor }}>{isIn ? 'IN ↑' : isOut ? 'OUT ↓' : 'NEUTRAL'}</span>
                                  </td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right', color: '#475569' }}>{row.balanceBefore}</td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: row.balanceAfter > 0 ? '#166534' : '#c41e3a' }}>{row.balanceAfter}</td>
                                  <td style={{ padding: '6px 8px', fontSize: '0.68rem', color: '#94a3b8', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.reference || ''}>{row.reference || '—'}</td>
                                  <td style={{ padding: '6px 8px', fontSize: '0.68rem', color: '#94a3b8' }}>{row.createdBy || '—'}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}
              {!stockCardLoading && !stockCardData && <div style={{ textAlign: 'center', padding: '40px 0', color: '#c41e3a' }}>Failed to load stock card data.</div>}
            </div>
          </div>
        </div>
      )}

      {subTab === 'inventory' && (() => {
        const openStockCard = async (productName) => {
          setStockCardModal(productName);
          setStockCardData(null);
          setStockCardLoading(true);
          try {
            const branchParam = selectedBranch || user?.branch || '';
            const qs = new URLSearchParams({ branchId: branchParam, productName }).toString();
            const resp = await api.get(`/branch/stock-card?${qs}`);
            setStockCardData(resp);
          } catch (e) {
            console.error('[openStockCard] error:', e);
          } finally {
            setStockCardLoading(false);
          }
        };

        const filteredInv = inventory.filter(r => {
          const pName = (r.product_name || r.productName || r.description || '').toLowerCase();
          if (invFilter.search && !pName.includes(invFilter.search.toLowerCase())) return false;
          if (invFilter.batch && !(r.batch_no || r.batchNo || '').toLowerCase().includes(invFilter.batch.toLowerCase())) return false;
          const q = Number(r.quantity || 0);
          const exp = r.expiry_date || r.expiryDate;
          const isExp = exp ? new Date(exp) < now : false;
          const isExpiring = exp ? new Date(exp) <= thirtyDays && new Date(exp) >= now : false;
          // Hide zero-quantity batches unless the user explicitly filters for Out of Stock
          if (q <= 0 && invFilter.status !== 'out') return false;
          if (invFilter.status === 'low' && !(q > 0 && q < 10)) return false;
          if (invFilter.status === 'out' && q > 0) return false;
          if (invFilter.status === 'expired' && !isExp) return false;
          if (invFilter.status === 'expiring' && !isExpiring) return false;
          if (invFilter.status === 'in_stock' && q <= 0) return false;
          return true;
        });

        // Group batches by product name so the same product doesn't repeat as multiple top-level rows
        const invProductGroups = [];
        const invGroupMap = {};
        for (const r of filteredInv) {
          const pName = r.product_name || r.productName || r.description || '';
          const normKey = pName.trim().toLowerCase();
          if (!invGroupMap[normKey]) {
            invGroupMap[normKey] = { productName: pName, batches: [], totalQty: 0, totalRcvd: 0, totalSold: 0, totalDisp: 0, totalTrf: 0, totalWO: 0, totalOpening: 0, totalDpValue: 0, hasExpired: false, hasExpiring: false, sourceWarehouse: null, lastMovement: null };
            invProductGroups.push(invGroupMap[normKey]);
          }
          const g = invGroupMap[normKey];
          const q = Number(r.quantity || 0);
          const exp = r.expiry_date || r.expiryDate;
          const p = findProductPrice(pName);
          const dpUnit = p?.dp ? Number(p.dp) : 0;
          g.batches.push(r);
          g.totalQty += q;
          g.totalRcvd += Number(r.qty_received || r.qtyReceived || 0);
          g.totalSold += Number(r.qty_sold || r.qtySold || 0);
          g.totalDisp += Number(r.qty_dispensed || r.qtyDispensed || 0);
          g.totalTrf += Number(r.qty_transferred || r.qtyTransferred || 0);
          g.totalWO += Number(r.qty_written_off || r.qtyWrittenOff || 0);
          g.totalDpValue += dpUnit * q;
          if (exp && new Date(exp) < now) g.hasExpired = true;
          if (exp && new Date(exp) <= thirtyDays && new Date(exp) >= now) g.hasExpiring = true;
          // Propagate source warehouse and last movement from batch rows to the group
          const bSrc = r.source_warehouse || r.sourceWarehouse;
          if (bSrc && !g.sourceWarehouse) g.sourceWarehouse = bSrc;
          const bLast = r.last_movement_date || r.lastMovementDate;
          if (bLast && (!g.lastMovement || bLast > g.lastMovement)) g.lastMovement = bLast;
        }
        // Opening = stock present before movement tracking began.
        // Makes the equation: Opening + Rcvd − Sold − Disp − Trf − W/O = Balance
        for (const g of invProductGroups) {
          g.totalOpening = Math.max(0, g.totalQty - (g.totalRcvd - g.totalSold - g.totalDisp - g.totalTrf - g.totalWO));
        }

        const totalQty = filteredInv.reduce((s, r) => s + Number(r.quantity || 0), 0);
        const totalDP = filteredInv.reduce((s, r) => {
          const price = Number(r.unit_price || r.unitPrice || 0);
          return s + price * Number(r.quantity || 0);
        }, 0);
        const lowCount = filteredInv.filter(r => { const q = Number(r.quantity || 0); return q > 0 && q < 10; }).length;
        const nearExpCount = filteredInv.filter(r => { const e = r.expiry_date || r.expiryDate; return e && new Date(e) <= thirtyDays && new Date(e) >= now; }).length;
        const thS = { textAlign: 'left', padding: '8px 6px', borderBottom: '2px solid #c41e3a', fontWeight: 700, color: '#374151', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' };
        const thR = { ...thS, textAlign: 'right' };
        const thC = { ...thS, textAlign: 'center' };
        const toggleInvProduct = (normKey) => {
          setExpandedInvProducts(prev => {
            const next = new Set(prev);
            if (next.has(normKey)) next.delete(normKey); else next.add(normKey);
            return next;
          });
        };

        return (
        <Card>
          <CardHeader className="flex justify-between items-center flex-wrap gap-3">
            <div>
              <h3 className="font-bold text-gray-800 m-0">Branch Inventory — {getBranchDisplayName(selectedBranch || user?.branch) || 'All'}</h3>
              <p className="text-xs text-gray-500 m-0 mt-1">Batch-level live stock with movement aggregates and DP valuations</p>
            </div>
            <button onClick={() => {
              if (!inventory || inventory.length === 0) { alert('No inventory data loaded yet. Please wait a moment and try again.'); return; }
              printPhysicalStockReport(inventory, selectedBranch || user?.branch || '');
            }} className="px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer" style={{ background: '#c41e3a', color: '#fff' }}>Print Report</button>
          </CardHeader>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0e8ea', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" placeholder="Search product..." value={invFilter.search} onChange={e => setInvFilter(p => ({ ...p, search: e.target.value }))}
              style={{ padding: '7px 12px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.82rem', width: 180, outline: 'none' }} />
            <input type="text" placeholder="Batch..." value={invFilter.batch} onChange={e => setInvFilter(p => ({ ...p, batch: e.target.value }))}
              style={{ padding: '7px 12px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.82rem', width: 100, outline: 'none' }} />
            <select value={invFilter.status} onChange={e => setInvFilter(p => ({ ...p, status: e.target.value }))}
              style={{ padding: '7px 12px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.82rem', outline: 'none' }}>
              <option value="all">All Status</option>
              <option value="in_stock">In Stock</option>
              <option value="low">Low Stock (&lt;10)</option>
              <option value="out">Out of Stock</option>
              <option value="expired">Expired</option>
              <option value="expiring">Expiring Soon</option>
            </select>
            {(invFilter.search || invFilter.batch || invFilter.status !== 'all') && (
              <button onClick={() => setInvFilter({ search: '', status: 'all', batch: '', expiry: '' })} style={{ padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.78rem', cursor: 'pointer', background: '#f9fafb', color: '#64748b' }}>Clear</button>
            )}
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#94a3b8' }}>{invProductGroups.length} product{invProductGroups.length !== 1 ? 's' : ''} · {filteredInv.length} batch line{filteredInv.length !== 1 ? 's' : ''}</span>
          </div>
          {/* Data-flow info strip */}
          <div style={{ padding: '8px 16px', background: '#f8fafc', borderBottom: '1px solid #f0e8ea', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em' }}>Stock drained by:</span>
            {[
              { label: '🛒 Walk-in Sales', color: '#2563eb' },
              { label: '💊 Rx Dispenses', color: '#6366f1' },
              { label: '↔ Branch Transfers', color: '#9333ea' },
              { label: '🗑️ Write-Offs', color: '#c41e3a' },
            ].map(d => (
              <span key={d.label} style={{ fontSize: '0.68rem', fontWeight: 700, color: d.color, background: `${d.color}11`, border: `1px solid ${d.color}33`, borderRadius: 20, padding: '2px 9px' }}>{d.label}</span>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: '#94a3b8' }}>Click any product row to open its Stock Card ledger</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
              <thead>
                <tr style={{ background: '#f8f5f5' }}>
                  <th style={thS}>Product</th>
                  <th style={thS}>Batch</th>
                  <th style={thS}>Expiry</th>
                  <th style={{ ...thR, color: '#1e3a5f' }} title="Prior stock before movement tracking began">Opening</th>
                  <th style={thR}>Rcvd</th>
                  <th style={thR}>Sold</th>
                  <th style={thR}>Disp</th>
                  <th style={thR}>Trf</th>
                  <th style={thR}>W/O</th>
                  <th style={thR}>Balance</th>
                  <th style={thC}>Status</th>
                  <th style={thR}>DP Unit</th>
                  <th style={thR}>DP Value</th>
                  <th style={thS}>Source</th>
                  <th style={thS}>Last Move</th>
                </tr>
              </thead>
              <tbody>
                {invProductGroups.length === 0 ? (
                  <tr><td colSpan={15} style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>No inventory data for this branch</td></tr>
                ) : invProductGroups.map((g, gIdx) => {
                  const normKey = g.productName.trim().toLowerCase();
                  const isExpanded = expandedInvProducts.has(normKey);
                  const hasManyBatches = g.batches.length > 1;
                  const p = findProductPrice(g.productName);
                  const dpUnit = p?.dp ? Number(p.dp) : 0;
                  const groupStatusLabel = g.totalQty <= 0 ? 'Out' : g.totalQty < 10 ? 'Low' : g.hasExpired ? 'Expired' : g.hasExpiring ? 'Expiring' : 'OK';
                  const groupStatusColor = g.totalQty <= 0 || g.hasExpired ? '#c41e3a' : g.totalQty < 10 || g.hasExpiring ? '#d97706' : '#166534';
                  const groupStatusBg = g.totalQty <= 0 || g.hasExpired ? '#fef2f2' : g.totalQty < 10 || g.hasExpiring ? '#fffbeb' : '#f0fdf4';
                  const cellStyle = { padding: '7px 6px', fontSize: '0.76rem' };
                  const rows = [(
                    <tr key={`group-${normKey}`}
                      style={{ background: gIdx % 2 === 0 ? 'white' : '#fdf8f8', borderBottom: hasManyBatches && isExpanded ? 'none' : '1px solid #f5f0f0', cursor: 'pointer' }}
                      onClick={() => { if (hasManyBatches) toggleInvProduct(normKey); else openStockCard(g.productName); }}
                      title={hasManyBatches ? `Click to ${isExpanded ? 'collapse' : 'expand'} ${g.batches.length} batches` : `Click to view stock card for ${g.productName}`}
                    >
                      <td style={{ ...cellStyle, fontWeight: 700, color: '#1e293b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.productName}>
                        {hasManyBatches && <span style={{ marginRight: 5, color: '#c41e3a', fontSize: '0.7rem', fontWeight: 900 }}>{isExpanded ? '▼' : '▶'}</span>}
                        {g.productName}
                        {hasManyBatches && <span style={{ marginLeft: 6, fontSize: '0.65rem', color: '#94a3b8', fontWeight: 500 }}>{g.batches.length} batches</span>}
                      </td>
                      <td style={{ ...cellStyle, color: '#94a3b8', fontSize: '0.72rem' }}>{hasManyBatches ? `${g.batches.length} batches` : (g.batches[0]?.batch_no || g.batches[0]?.batchNo || '—')}</td>
                      <td style={{ ...cellStyle, color: '#6b7280' }}>{hasManyBatches ? '—' : (() => { const exp = g.batches[0]?.expiry_date || g.batches[0]?.expiryDate; return exp ? formatDate(exp) : '—'; })()}</td>
                      <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600, color: g.totalOpening > 0 ? '#1e3a5f' : '#d1d5db' }} title="Prior stock before movement tracking">{g.totalOpening || '—'}</td>
                      <td style={{ ...cellStyle, textAlign: 'right', color: g.totalRcvd > 0 ? '#166534' : '#d1d5db' }}>{g.totalRcvd || '—'}</td>
                      <td style={{ ...cellStyle, textAlign: 'right', color: g.totalSold > 0 ? '#2563eb' : '#d1d5db' }}>{g.totalSold || '—'}</td>
                      <td style={{ ...cellStyle, textAlign: 'right', color: g.totalDisp > 0 ? '#6366f1' : '#d1d5db' }}>{g.totalDisp || '—'}</td>
                      <td style={{ ...cellStyle, textAlign: 'right', color: g.totalTrf > 0 ? '#9333ea' : '#d1d5db' }}>{g.totalTrf || '—'}</td>
                      <td style={{ ...cellStyle, textAlign: 'right', color: g.totalWO > 0 ? '#c41e3a' : '#d1d5db' }}>{g.totalWO || '—'}</td>
                      <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 800, fontSize: '0.88rem', color: g.totalQty <= 0 ? '#c41e3a' : g.totalQty < 10 ? '#d97706' : '#166534' }}>{g.totalQty}</td>
                      <td style={{ ...cellStyle, textAlign: 'center' }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700, color: groupStatusColor, background: groupStatusBg, border: `1px solid ${groupStatusColor}22` }}>{groupStatusLabel}</span>
                      </td>
                      <td style={{ ...cellStyle, textAlign: 'right', color: '#166534', fontWeight: 600 }}>{dpUnit > 0 ? `N$ ${Math.round(dpUnit).toLocaleString("en-ZA")}` : '—'}</td>
                      <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 700, color: g.totalDpValue > 0 ? '#1e293b' : '#94a3b8' }}>{g.totalDpValue > 0 ? `N$ ${Math.round(g.totalDpValue).toLocaleString("en-ZA")}` : '—'}</td>
                      <td style={{ ...cellStyle, color: '#6b7280', fontSize: '0.72rem', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.sourceWarehouse || ''}>
                        {g.sourceWarehouse ? fmtLocation(g.sourceWarehouse) : '—'}
                      </td>
                      <td style={{ ...cellStyle, color: '#6b7280', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                        {g.lastMovement ? formatDateTime(g.lastMovement) : '—'}
                      </td>
                    </tr>
                  )];
                  if (hasManyBatches && isExpanded) {
                    g.batches.forEach((r, bIdx) => {
                      const q = Number(r.quantity || 0);
                      const exp = r.expiry_date || r.expiryDate;
                      const isExp = exp ? new Date(exp) < now : false;
                      const isExpiring = exp ? new Date(exp) <= thirtyDays && new Date(exp) >= now : false;
                      const daysLeft = exp ? Math.ceil((new Date(exp) - now) / 86400000) : null;
                      const batchStatusColor = q <= 0 || isExp ? '#c41e3a' : q < 10 || isExpiring ? '#d97706' : '#166534';
                      const batchStatusBg = q <= 0 || isExp ? '#fef2f2' : q < 10 || isExpiring ? '#fffbeb' : '#f0fdf4';
                      const batchStatusLabel = q <= 0 ? 'Out' : q < 10 ? 'Low' : isExp ? 'Expired' : isExpiring ? 'Expiring' : 'OK';
                      const srcWh = r.source_warehouse || r.sourceWarehouse || '';
                      const lastMov = r.last_movement_date || r.lastMovementDate;
                      const batchCellStyle = { ...cellStyle, fontSize: '0.72rem', background: '#f8f5ff' };
                      rows.push(
                        <tr key={`batch-${r.id || normKey + bIdx}`}
                          style={{ borderBottom: bIdx === g.batches.length - 1 ? '2px solid #e8d5ff' : '1px solid #f0ecff', cursor: 'pointer' }}
                          onClick={() => openStockCard(g.productName)}
                          title={`View stock card for ${g.productName}`}
                        >
                          <td style={{ ...batchCellStyle, paddingLeft: 24, color: '#6366f1', fontStyle: 'italic' }}>↳ Batch {bIdx + 1}</td>
                          <td style={{ ...batchCellStyle, fontFamily: 'monospace', color: '#6366f1' }}>{r.batch_no || r.batchNo || '—'}</td>
                          <td style={{ ...batchCellStyle, color: isExp ? '#c41e3a' : isExpiring ? '#d97706' : '#6b7280', fontWeight: isExp || isExpiring ? 700 : 400 }}>
                            {exp ? formatDate(exp) : '—'}
                            {daysLeft !== null && daysLeft <= 90 && daysLeft >= 0 && <span style={{ display: 'block', fontSize: '0.62rem', color: daysLeft <= 30 ? '#c41e3a' : '#d97706' }}>{daysLeft}d</span>}
                          </td>
                          {(() => {
                            const bRcvd = Number(r.qty_received || r.qtyReceived || 0);
                            const bSold = Number(r.qty_sold || r.qtySold || 0);
                            const bDisp = Number(r.qty_dispensed || r.qtyDispensed || 0);
                            const bTrf  = Number(r.qty_transferred || r.qtyTransferred || 0);
                            const bWO   = Number(r.qty_written_off || r.qtyWrittenOff || 0);
                            const bOpen = Math.max(0, q - (bRcvd - bSold - bDisp - bTrf - bWO));
                            return <td style={{ ...batchCellStyle, textAlign: 'right', fontWeight: 600, color: bOpen > 0 ? '#1e3a5f' : '#d1d5db' }}>{bOpen || '—'}</td>;
                          })()}
                          <td style={{ ...batchCellStyle, textAlign: 'right', color: '#94a3b8' }}>{Number(r.qty_received || r.qtyReceived || 0) || '—'}</td>
                          <td style={{ ...batchCellStyle, textAlign: 'right', color: '#94a3b8' }}>{Number(r.qty_sold || r.qtySold || 0) || '—'}</td>
                          <td style={{ ...batchCellStyle, textAlign: 'right', color: '#94a3b8' }}>{Number(r.qty_dispensed || r.qtyDispensed || 0) || '—'}</td>
                          <td style={{ ...batchCellStyle, textAlign: 'right', color: '#94a3b8' }}>{Number(r.qty_transferred || r.qtyTransferred || 0) || '—'}</td>
                          <td style={{ ...batchCellStyle, textAlign: 'right', color: '#94a3b8' }}>{Number(r.qty_written_off || r.qtyWrittenOff || 0) || '—'}</td>
                          <td style={{ ...batchCellStyle, textAlign: 'right', fontWeight: 700, color: q <= 0 ? '#c41e3a' : q < 10 ? '#d97706' : '#6366f1' }}>{q}</td>
                          <td style={{ ...batchCellStyle, textAlign: 'center' }}>
                            <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 20, fontSize: '0.62rem', fontWeight: 700, color: batchStatusColor, background: batchStatusBg, border: `1px solid ${batchStatusColor}22` }}>{batchStatusLabel}</span>
                          </td>
                          <td style={{ ...batchCellStyle, textAlign: 'right', color: '#6b7280' }}>{dpUnit > 0 ? `N$ ${Math.round(dpUnit).toLocaleString("en-ZA")}` : '—'}</td>
                          <td style={{ ...batchCellStyle, textAlign: 'right', color: '#6b7280' }}>{dpUnit > 0 && q > 0 ? `N$ ${Math.round(dpUnit * q).toLocaleString("en-ZA")}` : '—'}</td>
                          <td style={{ ...batchCellStyle, color: '#6b7280', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={srcWh}>{srcWh ? fmtLocation(srcWh) : '—'}</td>
                          <td style={{ ...batchCellStyle, color: '#6b7280', whiteSpace: 'nowrap' }}>{lastMov ? formatDateTime(lastMov) : '—'}</td>
                        </tr>
                      );
                    });
                  }
                  return rows;
                })}
              </tbody>
              {filteredInv.length > 0 && (
                <tfoot>
                  <tr style={{ background: 'linear-gradient(90deg,#fdf2f4,#fef7f8)', borderTop: '2px solid #c41e3a' }}>
                    <td colSpan={3} style={{ padding: '10px 6px', fontWeight: 800, color: '#c41e3a', fontSize: '0.75rem', textTransform: 'uppercase' }}>Totals</td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 700, fontSize: '0.78rem', color: '#1e3a5f' }}>{invProductGroups.reduce((s, g) => s + g.totalOpening, 0) || ''}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 700, fontSize: '0.78rem', color: '#166534' }}>{filteredInv.reduce((s, r) => s + Number(r.qty_received || r.qtyReceived || 0), 0) || ''}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 700, fontSize: '0.78rem', color: '#2563eb' }}>{filteredInv.reduce((s, r) => s + Number(r.qty_sold || r.qtySold || 0), 0) || ''}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 700, fontSize: '0.78rem', color: '#6366f1' }}>{filteredInv.reduce((s, r) => s + Number(r.qty_dispensed || r.qtyDispensed || 0), 0) || ''}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 700, fontSize: '0.78rem', color: '#9333ea' }}>{filteredInv.reduce((s, r) => s + Number(r.qty_transferred || r.qtyTransferred || 0), 0) || ''}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 700, fontSize: '0.78rem', color: '#c41e3a' }}>{filteredInv.reduce((s, r) => s + Number(r.qty_written_off || r.qtyWrittenOff || 0), 0) || ''}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 800, fontSize: '0.92rem', color: '#1e293b' }}>{totalQty}</td>
                    <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: '0.68rem', color: '#64748b' }}>
                      {lowCount > 0 && <span style={{ color: '#d97706' }}>{lowCount} low</span>}
                      {lowCount > 0 && nearExpCount > 0 && ' · '}
                      {nearExpCount > 0 && <span style={{ color: '#c41e3a' }}>{nearExpCount} exp</span>}
                    </td>
                    <td style={{ padding: '10px 6px' }}></td>
                    <td style={{ padding: '10px 6px', textAlign: 'right', fontWeight: 800, fontSize: '0.88rem', color: '#c41e3a' }}>N$ {Math.round(totalDP).toLocaleString("en-ZA")}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
        );
      })()}

      {subTab === 'alerts' && (() => {
        const pendingReqs = requests.filter(r => r.status === 'pending' || r.status === 'submitted');
        const alertItems = [
          ...outOfStock.map(r => ({ ...r, alertType: 'Out of Stock', severity: 'critical', action: 'Request restock from warehouse immediately', quickAction: 'request' })),
          ...expiredItems.map(r => ({ ...r, alertType: 'Expired', severity: 'critical', action: 'Write off expired stock and remove from shelf', quickAction: 'writeoff' })),
          ...lowStock.map(r => ({ ...r, alertType: 'Low Stock', severity: 'warning', action: 'Submit restock request before stockout', quickAction: 'request' })),
          ...expiringItems.filter(r => !outOfStock.some(o => (o.product_name || o.productName) === (r.product_name || r.productName) && (o.batch_no || o.batchNo) === (r.batch_no || r.batchNo))).map(r => {
            const exp = r.expiry_date || r.expiryDate;
            const dLeft = exp ? Math.ceil((new Date(exp) - now) / 86400000) : null;
            return { ...r, alertType: 'Expiring Soon', severity: 'warning', action: dLeft !== null ? `${dLeft} day${dLeft !== 1 ? 's' : ''} until expiry — prioritize sale or plan write-off` : 'Prioritize sale or consider write-off plan', quickAction: 'writeoff' };
          }),
          ...pendingReqs.map(r => ({ product_name: `Request #${r.request_number || r.id}`, alertType: 'Pending Request', severity: 'info', action: 'Awaiting stock management approval', quantity: '-', batch_no: '-', expiry_date: null, quickAction: null })),
        ];
        const thA = { textAlign: 'left', padding: '8px 8px', borderBottom: '2px solid #c41e3a', fontSize: '0.68rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', whiteSpace: 'nowrap' };
        const totalCritical = outOfStock.length + expiredItems.length;
        const totalWarning = lowStock.length + expiringItems.length;
        return (
        <div className="space-y-4">
          {/* Priority summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, marginBottom: 8 }}>
            {[
              { label: 'Out of Stock', count: outOfStock.length, icon: '🚨', color: '#c41e3a', bg: '#fef2f2', note: 'Request immediately' },
              { label: 'Expired', count: expiredItems.length, icon: '⛔', color: '#c41e3a', bg: '#fef2f2', note: 'Write off & remove' },
              { label: 'Low Stock', count: lowStock.length, icon: '⚠️', color: '#d97706', bg: '#fffbeb', note: 'Request soon' },
              { label: 'Expiring Soon', count: expiringItems.length, icon: '⏳', color: '#d97706', bg: '#fffbeb', note: 'Prioritize sale' },
              { label: 'Pending Requests', count: pendingReqs.length, icon: '📋', color: '#2563eb', bg: '#eff6ff', note: 'Awaiting approval' },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, borderRadius: 12, padding: '14px 12px', textAlign: 'center', border: `1.5px solid ${s.color}${s.count > 0 ? '33' : '11'}`, opacity: s.count === 0 ? 0.5 : 1 }}>
                <div style={{ fontSize: '1.3rem', marginBottom: 2 }}>{s.icon}</div>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.count}</div>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, color: s.color, textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 3 }}>{s.label}</div>
                <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: 2 }}>{s.note}</div>
              </div>
            ))}
          </div>

          {/* Urgency banner */}
          {totalCritical > 0 && (
            <div style={{ background: 'linear-gradient(90deg,#fef2f2,#fff5f5)', border: '1.5px solid #fecaca', borderRadius: 10, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#c41e3a' }}>
                🚨 {totalCritical} critical issue{totalCritical !== 1 ? 's' : ''} require immediate attention
                {totalWarning > 0 && <span style={{ color: '#d97706', marginLeft: 12 }}>· {totalWarning} warning{totalWarning !== 1 ? 's' : ''} pending</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setRequestItems([]); setProductSearch(''); setShowRequestForm(true); }} style={{ padding: '6px 14px', borderRadius: 8, fontSize: '0.76rem', fontWeight: 700, border: 'none', background: '#c41e3a', color: '#fff', cursor: 'pointer' }}>📋 New Request</button>
                <button onClick={() => setShowWriteOffForm(true)} style={{ padding: '6px 14px', borderRadius: 8, fontSize: '0.76rem', fontWeight: 700, border: '1px solid #fecaca', background: '#fff', color: '#c41e3a', cursor: 'pointer' }}>🗑️ Write Off</button>
              </div>
            </div>
          )}

          {alertItems.length === 0 ? (
            <Card>
              <CardBody>
                <div style={{ textAlign: 'center', padding: '32px 16px' }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>✅</div>
                  <div style={{ fontWeight: 700, color: '#166534', fontSize: '1rem', marginBottom: 4 }}>All stock levels are healthy</div>
                  <div style={{ fontSize: '0.82rem', color: '#94a3b8' }}>No out-of-stock, expired, or low-stock items. Great work!</div>
                </div>
              </CardBody>
            </Card>
          ) : (
            <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 12, border: '1px solid #f0e8ea', boxShadow: '0 2px 8px rgba(196,30,58,0.05)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ background: '#f8f5f5' }}>
                    <th style={thA}>Priority</th>
                    <th style={thA}>Alert</th>
                    <th style={thA}>Product</th>
                    <th style={thA}>Batch</th>
                    <th style={thA}>Expiry</th>
                    <th style={{ ...thA, textAlign: 'right' }}>Balance</th>
                    <th style={thA}>Guidance</th>
                    <th style={{ ...thA, textAlign: 'center' }}>Quick Action</th>
                  </tr>
                </thead>
                <tbody>
                  {alertItems.map((a, i) => {
                    const sevColor = a.severity === 'critical' ? '#c41e3a' : a.severity === 'warning' ? '#d97706' : '#2563eb';
                    const sevBg = a.severity === 'critical' ? '#fef2f2' : a.severity === 'warning' ? '#fffbeb' : '#eff6ff';
                    const priorityLabel = a.severity === 'critical' ? '🔴 Critical' : a.severity === 'warning' ? '🟡 Warning' : '🔵 Info';
                    const exp = a.expiry_date || a.expiryDate;
                    const isExp = exp ? new Date(exp) < now : false;
                    const dLeft = exp ? Math.ceil((new Date(exp) - now) / 86400000) : null;
                    const pName = a.product_name || a.productName || a.description || '';
                    const batchId = a.id || '';
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#fdf8f8', borderBottom: '1px solid #f5f0f0' }}>
                        <td style={{ padding: '8px 8px', fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap', color: sevColor }}>{priorityLabel}</td>
                        <td style={{ padding: '8px' }}>
                          <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700, color: sevColor, background: sevBg, border: `1px solid ${sevColor}22`, whiteSpace: 'nowrap' }}>{a.alertType}</span>
                        </td>
                        <td style={{ padding: '8px', fontWeight: 600, color: '#1e293b' }}>{pName || '-'}</td>
                        <td style={{ padding: '8px', color: '#6b7280', fontFamily: 'monospace', fontSize: '0.74rem' }}>{a.batch_no || a.batchNo || '—'}</td>
                        <td style={{ padding: '8px', color: isExp ? '#c41e3a' : (dLeft !== null && dLeft <= 30) ? '#d97706' : '#6b7280', fontWeight: isExp || (dLeft !== null && dLeft <= 30) ? 700 : 400 }}>
                          {exp ? formatDate(exp) : '—'}
                          {dLeft !== null && dLeft >= 0 && dLeft <= 90 && <span style={{ display: 'block', fontSize: '0.65rem', color: dLeft <= 30 ? '#c41e3a' : '#d97706' }}>{dLeft}d left</span>}
                          {isExp && <span style={{ display: 'block', fontSize: '0.65rem', color: '#c41e3a', fontWeight: 700 }}>EXPIRED</span>}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, fontSize: '0.85rem', color: Number(a.quantity) <= 0 ? '#c41e3a' : Number(a.quantity) < 10 ? '#d97706' : '#1e293b' }}>{a.quantity ?? '—'}</td>
                        <td style={{ padding: '8px', fontSize: '0.73rem', color: '#64748b', maxWidth: 220 }}>{a.action}</td>
                        <td style={{ padding: '8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          {a.quickAction === 'request' && (
                            <button onClick={() => { setRequestItems([]); setProductSearch(pName); setShowRequestForm(true); }}
                              style={{ padding: '4px 10px', borderRadius: 7, fontSize: '0.68rem', fontWeight: 700, border: 'none', background: '#c41e3a', color: '#fff', cursor: 'pointer' }}>
                              📋 Request
                            </button>
                          )}
                          {a.quickAction === 'writeoff' && (
                            <button onClick={() => { setWriteOffSelected({ [batchId]: { quantity: '', reason: isExp ? 'expired' : 'other' } }); setWriteOffSearch(''); setShowWriteOffForm(true); }}
                              style={{ padding: '4px 10px', borderRadius: 7, fontSize: '0.68rem', fontWeight: 700, border: '1px solid #fecaca', background: '#fef2f2', color: '#c41e3a', cursor: 'pointer' }}>
                              🗑️ Write Off
                            </button>
                          )}
                          {!a.quickAction && <span style={{ color: '#94a3b8', fontSize: '0.68rem' }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        );
      })()}

      {subTab === 'requests' && (
        <Card>
          <CardHeader className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Stock Requests</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => printReceivingStockReport(requests, selectedBranch || user?.branch||'')} className="px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer" style={{ background: '#f1f5f9', color: '#374151' }}>📄 Print</button>
              <button onClick={() => { setRequestItems([]); setProductSearch(''); setShowRequestForm(true); }} className="px-4 py-2 rounded-lg text-sm font-bold border-none cursor-pointer" style={{ background: '#c41e3a', color: '#fff' }}>📋 New Request</button>
            </div>
          </CardHeader>
          <div style={{ padding: '8px 16px 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, padding: '7px 14px', fontSize: '0.74rem', color: '#0369a1', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>ℹ️ Requests are reviewed and approved in</span>
              {user?.role === 'admin'
                ? <button onClick={() => navigate('/stock')} style={{ fontWeight: 700, color: '#0369a1', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Stock Portal › Requests tab ↗</button>
                : <strong>Stock Portal › Requests tab</strong>
              }
              <span>— once approved they appear in Receive Stock.</span>
            </div>
          </div>
          <Table
            columns={[
              { header: 'Request #', render: r => <span className="font-mono text-xs">{r.requestNumber || r.request_number || r.id}</span> },
              { header: 'Requested For', render: r => <span className="font-semibold text-xs">{r.requestingBranch || r.requesting_branch || user?.branch || '-'}</span> },
              { header: 'Requested By', render: r => <span className="text-xs text-gray-600">{r.createdBy || r.created_by || '—'}</span> },
              { header: 'Items', render: r => {
                const items = Array.isArray(r.items) ? r.items : (() => { try { return typeof r.items==='string'?JSON.parse(r.items):[]; } catch { return []; } })();
                return <span className="text-xs text-gray-600">{items.slice(0,2).map(i=>`${i.productName||i.product_name||i.productId} x${i.quantity}`).join(', ')}{items.length>2?` +${items.length-2} more`:''}{items.length===0?'-':''}</span>;
              }},
              { header: 'Priority', render: r => <Badge variant={r.priority==='urgent'?'danger':r.priority==='high'?'warning':'info'}>{r.priority||'normal'}</Badge> },
              { header: 'Status', render: r => <Badge variant={r.status==='approved'?'success':r.status==='received'?'success':r.status==='rejected'?'danger':'warning'}>{r.status||'pending'}</Badge> },
              { header: 'Approved By', render: r => <span className="text-xs text-gray-600">{r.approvedBy || r.approved_by || r.reviewedBy || r.reviewed_by || '—'}</span> },
              { header: 'Date', render: r => formatDateTime(r.created_at || r.createdAt) },
              { header: '', render: r => (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setViewRequest(r)} className="px-3 py-1 text-xs rounded-lg font-bold border-none cursor-pointer" style={{ background: '#f1f5f9', color: '#374151' }}>View</button>
                  {(r.status==='approved'||r.status==='dispatched') && <button onClick={() => openReceiveForm(r)} className="px-3 py-1 text-xs rounded-lg font-bold border-none cursor-pointer" style={{ background: '#166534', color: '#fff' }}>Receive</button>}
                </div>
              )},
            ]}
            data={requests}
            emptyMessage="No stock requests yet — click New Request to start"
          />
        </Card>
      )}

      {subTab === 'receive' && (
        <div className="space-y-5">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800 text-lg m-0">📥 Receive Incoming Stock</h3>
            <button onClick={loadData} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white cursor-pointer font-semibold text-gray-500">↺ Refresh</button>
          </div>
          <div style={{ background: 'linear-gradient(90deg,#f0fdf4,#ecfdf5)', border: '1.5px solid #bbf7d0', borderRadius: 10, padding: '10px 16px', fontSize: '0.76rem', color: '#166534', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <span>🏭 Deliveries dispatched from</span>
            {user?.role === 'admin'
              ? <button onClick={() => navigate('/stock')} style={{ fontWeight: 700, color: '#166534', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Stock Portal › Distribution tab ↗</button>
              : <strong>Stock Portal › Distribution tab</strong>
            }
            <span>appear here once approved by GM. Receive them to update your inventory automatically.</span>
          </div>

          {incomingDeliveries.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                🚚 Incoming Warehouse Deliveries
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">{incomingDeliveries.length}</span>
              </h4>
              <div className="space-y-4">
                {incomingDeliveries.map(t => {
                  const fromLoc = fmtLocation(t.fromWarehouse || t.from_location || 'Warehouse');
                  const toLoc = fmtLocation(t.toBranch || t.to_location || user?.branch);
                  const tItems = Array.isArray(t.items) ? t.items : [];
                  const isAmended = t.gmAction === 'amend_approve' || t.metadata?.amended;
                  return (
                    <div key={t.id} style={{ background: '#fff', border: '1.5px solid #93c5fd', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(30,64,175,0.06)' }}>
                      <div style={{ background: 'linear-gradient(90deg,#eff6ff,#f0f7ff)', padding: '12px 18px', borderBottom: '1px solid #93c5fd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span className="font-bold text-gray-800 text-sm">📄 Dispatch Note</span>
                          <span className="ml-2 font-mono text-xs text-gray-500">{t.dispatchReference || t.id}</span>
                        </div>
                        <div className="flex gap-2 items-center">
                          <Badge variant="success">GM Approved</Badge>
                          {isAmended && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-semibold">Amended</span>}
                        </div>
                      </div>
                      <div className="p-4">
                        <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                          <div>
                            <span className="text-xs text-gray-500 font-semibold">From:</span>
                            <span className="ml-2 font-bold text-gray-800">{fromLoc}</span>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 font-semibold">To:</span>
                            <span className="ml-2 font-bold text-gray-800">{toLoc}</span>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 font-semibold">Date:</span>
                            <span className="ml-2 text-gray-700">{formatDateTime(t.createdAt || t.created_at)}</span>
                          </div>
                          <div>
                            <span className="text-xs text-gray-500 font-semibold">Prepared By:</span>
                            <span className="ml-2 text-gray-700">{t.createdBy || t.dispatchedBy || '—'}</span>
                          </div>
                        </div>

                        {isAmended && t.gmComment && (
                          <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 6, padding: 8, marginBottom: 12, fontSize: 12 }}>
                            <strong>GM Amendment Note:</strong> {t.gmComment}
                          </div>
                        )}

                        <table className="w-full text-xs border-collapse mb-3">
                          <thead>
                            <tr>
                              <th className="text-left py-1.5 px-2 border-b-2 border-blue-200 text-gray-600 bg-blue-50">Product</th>
                              <th className="text-left py-1.5 px-2 border-b-2 border-blue-200 text-gray-600 bg-blue-50">Batch</th>
                              <th className="text-left py-1.5 px-2 border-b-2 border-blue-200 text-gray-600 bg-blue-50">Expiry</th>
                              <th className="text-right py-1.5 px-2 border-b-2 border-blue-200 text-gray-600 bg-blue-50">
                                {isAmended ? 'Approved Qty' : 'Qty'}
                              </th>
                              <th className="text-left py-1.5 px-2 border-b-2 border-blue-200 text-gray-600 bg-blue-50">Unit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tItems.length > 0 ? tItems.map((it, i) => (
                              <tr key={i} className={i % 2 === 0 ? '' : 'bg-gray-50'}>
                                <td className="py-1.5 px-2 border-b font-medium">{it.productName || it.productId}</td>
                                <td className="py-1.5 px-2 border-b text-gray-600">{it.batchNo || '—'}</td>
                                <td className="py-1.5 px-2 border-b" style={{ color: it.expiryDate && new Date(it.expiryDate) < new Date(Date.now() + 90*86400000) ? '#dc2626' : it.expiryDate ? '#666' : '#9ca3af' }}>
                                  {it.expiryDate ? formatDate(it.expiryDate) : (it.batchNo ? 'N/A' : '—')}
                                </td>
                                <td className="py-1.5 px-2 border-b text-right font-bold">
                                  {isAmended && it.quantityApproved != null ? it.quantityApproved : it.quantity}
                                </td>
                                <td className="py-1.5 px-2 border-b text-gray-600">{it.unit || 'units'}</td>
                              </tr>
                            )) : (
                              <tr>
                                <td className="py-1.5 px-2 border-b">{t.product_name || '—'}</td>
                                <td className="py-1.5 px-2 border-b text-gray-500">—</td>
                                <td className="py-1.5 px-2 border-b text-gray-500">—</td>
                                <td className="py-1.5 px-2 border-b text-right font-bold">{t.quantity || 0}</td>
                                <td className="py-1.5 px-2 border-b text-gray-500">units</td>
                              </tr>
                            )}
                          </tbody>
                        </table>

                        {t.dispatchNotes && <p className="text-xs text-gray-500 italic mb-3">Notes: {t.dispatchNotes}</p>}

                        <div className="flex gap-2 flex-wrap">
                          <button onClick={() => setViewDispatchNote(t)}
                            className="px-3 py-2 rounded-lg text-xs font-bold cursor-pointer border border-gray-200 bg-white text-gray-700 hover:bg-gray-50">
                            📄 View Full Document
                          </button>
                          <button disabled={submitting} onClick={() => { setRejectTarget({ type: 'transfer', id: t.id, label: t.dispatchReference || t.id }); setRejectReason(''); }}
                            className="px-4 py-2 rounded-lg text-sm font-bold border-none cursor-pointer" style={{ background: '#fef2f2', color: '#991b1b', border: '1.5px solid #fca5a5', opacity: submitting ? 0.6 : 1 }}>
                            🚫 Reject
                          </button>
                          <button disabled={submitting} onClick={() => openReceiveTransferModal(t)}
                            className="flex-1 py-2 rounded-lg text-sm font-bold border-none cursor-pointer" style={{ background: '#1e40af', color: '#fff', opacity: submitting ? 0.6 : 1 }}>
                            📥 Receive Stock
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {pendingRequests.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                📋 Approved Branch Requests
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">{pendingRequests.length}</span>
              </h4>
              <div className="space-y-3">
                {pendingRequests.map(req => {
                  const items = (() => { try { return typeof req.items==='string'?JSON.parse(req.items):(req.items||[]); } catch { return []; } })();
                  return (
                    <div key={req.id} style={{ background: '#fff', border: '1.5px solid #f0e8ea', borderRadius: 14, padding: 18, boxShadow: '0 2px 8px rgba(196,30,58,0.06)' }}>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-bold text-gray-800">Request: <span className="font-mono text-sm">{req.requestNumber || req.request_number || req.id}</span></div>
                          <div className="text-sm text-gray-500 mt-1">Approved by Stock Management · {formatDateTime(req.createdAt || req.created_at)}</div>
                          {req.notes && <div className="text-xs text-gray-400 mt-1">Notes: {req.notes}</div>}
                        </div>
                        <div className="flex gap-2 items-center flex-wrap">
                          <Badge variant={req.status === 'dispatched' ? 'info' : 'success'}>{req.status}</Badge>
                          <button onClick={() => { setRejectTarget({ type: 'request', id: req.id, label: req.requestNumber || req.request_number || req.id }); setRejectReason(''); }}
                            className="px-3 py-2 rounded-lg text-xs font-bold cursor-pointer" style={{ background: '#fef2f2', color: '#991b1b', border: '1.5px solid #fca5a5' }}>
                            🚫 Reject
                          </button>
                          <button onClick={() => openReceiveForm(req)} className="px-4 py-2 rounded-lg text-sm font-bold border-none cursor-pointer" style={{ background: '#c41e3a', color: '#fff' }}>📥 Receive</button>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {items.map((item, i) => (
                          <span key={i} className="px-3 py-1 rounded-full text-xs font-medium" style={{ background: '#f9f5f5', border: '1px solid #f0e8ea', color: '#374151' }}>{item.productName || item.product_name} × {item.quantity}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {incomingDeliveries.length === 0 && pendingRequests.length === 0 && (
            <Card><CardBody><p className="text-center text-gray-400 py-8">No incoming stock — warehouse deliveries and approved requests will appear here</p></CardBody></Card>
          )}
        </div>
      )}

      {viewDispatchNote && <DispatchNote transfer={viewDispatchNote} onClose={() => setViewDispatchNote(null)} />}

      {rejectTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440, padding: 28, boxShadow: '0 24px 60px rgba(0,0,0,0.22)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: '1.4rem' }}>🚫</span>
              <h3 style={{ margin: 0, color: '#991b1b', fontSize: '1.05rem', fontWeight: 800 }}>
                Reject {rejectTarget.type === 'transfer' ? 'Delivery' : 'Stock Request'}
              </h3>
            </div>
            <p style={{ color: '#6b7280', fontSize: '0.83rem', margin: '0 0 6px' }}>
              Ref: <strong style={{ color: '#374151' }}>{rejectTarget.label}</strong>
            </p>
            <p style={{ color: '#374151', fontSize: '0.85rem', margin: '0 0 14px' }}>
              Provide a reason — this will be logged and visible to warehouse / stock management.
            </p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (required)…"
              rows={3}
              style={{ width: '100%', border: '1.5px solid #fca5a5', borderRadius: 8, padding: '10px 12px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', resize: 'vertical', color: '#374151', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => { setRejectTarget(null); setRejectReason(''); }}
                style={{ flex: 1, padding: '10px', border: '1.5px solid #e5e7eb', borderRadius: 8, background: '#f9fafb', color: '#374151', fontWeight: 600, cursor: 'pointer', fontSize: '0.88rem' }}>
                Cancel
              </button>
              <button
                disabled={!rejectReason.trim() || submitting}
                onClick={handleReject}
                style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 8, background: '#c41e3a', color: '#fff', fontWeight: 700, cursor: (!rejectReason.trim() || submitting) ? 'not-allowed' : 'pointer', fontSize: '0.88rem', opacity: (!rejectReason.trim() || submitting) ? 0.6 : 1 }}>
                {submitting ? 'Rejecting…' : '✓ Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {receiveTransferModal && (() => {
        const rtm = receiveTransferModal;
        const gmAction = rtm.gmAction || rtm.gm_action;
        const gmComment = rtm.gmComment || rtm.gm_comment;
        const gmApprovedBy = rtm.amendedByGm || rtm.amended_by_gm || rtm.approvedBy || rtm.approved_by;
        const dispatchNotes = rtm.dispatchNotes || rtm.dispatch_notes;
        const anyDiscrepancy = receiveItems.some(it => it._hasDiscrepancy);
        const totalDispatched = receiveItems.reduce((s, it) => s + Number(it.quantitySent || 0), 0);
        const totalReceiving = receiveItems.reduce((s, it) => s + Number(it.quantityReceived || 0), 0);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: 'white', borderRadius: 14, width: '100%', maxWidth: 860, maxHeight: '93vh', overflow: 'auto', boxShadow: '0 25px 60px rgba(0,0,0,0.35)' }}>

              {/* ── HEADER ── */}
              <div style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #1e40af 100%)', padding: '18px 24px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2 style={{ color: '#fff', margin: 0, fontSize: 18, fontWeight: 700 }}>📥 Receive Dispatched Stock</h2>
                  <p style={{ color: 'rgba(255,255,255,0.75)', margin: '4px 0 0', fontSize: 13 }}>
                    Ref: {rtm.dispatchReference || rtm.dispatch_reference || rtm.id}
                    &nbsp;·&nbsp;
                    {fmtLocation(rtm.fromWarehouse || rtm.from_location)} → {getBranchDisplayName(rtm.toBranch || rtm.to_location || user?.branch)}
                  </p>
                </div>
                <button onClick={() => { setReceiveTransferModal(null); setReceiveModalMsg(null); }}
                  style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
              </div>

              <div style={{ padding: 24 }}>

                {/* ── GM-APPROVED DISPATCH NOTE SUMMARY ── */}
                <div style={{ background: '#f0f9ff', border: '1.5px solid #bae6fd', borderRadius: 10, padding: '16px 20px', marginBottom: 22 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <span style={{ fontSize: 20 }}>📋</span>
                    <span style={{ fontWeight: 800, color: '#0c4a6e', fontSize: 14, textTransform: 'uppercase', letterSpacing: 0.5 }}>GM-Approved Dispatch Note</span>
                    {gmAction && (
                      <span style={{ marginLeft: 'auto', padding: '3px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                        background: (gmAction === 'approve' || gmAction === 'amend_approve') ? '#dcfce7' : '#fef2f2',
                        color: (gmAction === 'approve' || gmAction === 'amend_approve') ? '#166534' : '#991b1b',
                        border: `1px solid ${(gmAction === 'approve' || gmAction === 'amend_approve') ? '#86efac' : '#fca5a5'}` }}>
                        {gmAction === 'amend_approve' ? '✅ Amended & Approved' : gmAction === 'approve' ? '✅ Approved' : '❌ Rejected'}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px 20px' }}>
                    {[
                      { label: 'From', value: fmtLocation(rtm.fromWarehouse || rtm.from_location) },
                      { label: 'To Branch', value: getBranchDisplayName(rtm.toBranch || rtm.to_location || user?.branch) },
                      { label: 'Dispatch Date', value: formatDateTime(rtm.dispatchedAt || rtm.dispatched_at || rtm.created_at) },
                      { label: 'Dispatched By', value: rtm.dispatchedBy || rtm.dispatched_by || rtm.createdBy || rtm.created_by || '—' },
                      { label: 'GM Approved By', value: gmApprovedBy || '—' },
                      { label: 'Receiving Officer', value: user?.full_name || user?.username },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {gmComment && (
                    <div style={{ marginTop: 12, padding: '8px 12px', background: '#fefce8', border: '1px solid #fde68a', borderRadius: 6, fontSize: 12 }}>
                      <strong>GM Note:</strong> {gmComment}
                    </div>
                  )}
                  {dispatchNotes && (
                    <div style={{ marginTop: 8, padding: '8px 12px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12 }}>
                      <strong>Dispatch Notes:</strong> {dispatchNotes}
                    </div>
                  )}
                </div>

                {/* ── INSTRUCTION ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Verify items against physical delivery</div>
                  <div style={{ fontSize: 12, color: '#64748b', background: '#f1f5f9', padding: '3px 10px', borderRadius: 20, border: '1px solid #e2e8f0' }}>
                    All items are pre-confirmed as received in full — only tap <strong>Mark Discrepancy</strong> if something is short or damaged
                  </div>
                </div>

                {/* ── ITEMS TABLE ── */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
                  <thead>
                    <tr style={{ background: '#1e40af' }}>
                      <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, color: '#fff', fontWeight: 700, textTransform: 'uppercase' }}>Product</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, color: '#fff', fontWeight: 700, textTransform: 'uppercase' }}>Batch / Expiry</th>
                      <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 11, color: '#fff', fontWeight: 700, textTransform: 'uppercase' }}>Qty Dispatched</th>
                      <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 11, color: '#fff', fontWeight: 700, textTransform: 'uppercase' }}>Receipt Status</th>
                      <th style={{ textAlign: 'center', padding: '10px 12px', fontSize: 11, color: '#fff', fontWeight: 700, textTransform: 'uppercase' }}>Qty Received</th>
                      <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 11, color: '#fff', fontWeight: 700, textTransform: 'uppercase' }}>Discrepancy Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiveItems.map((it, i) => {
                      const flagged = it._hasDiscrepancy;
                      const expiring = it.expiryDate && new Date(it.expiryDate) < new Date(Date.now() + 90 * 86400000);
                      return (
                        <tr key={i} style={{ background: flagged ? '#fef2f2' : (i % 2 === 0 ? '#fff' : '#f9fafb'), borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '11px 12px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{it.productName || it.productId}</td>
                          <td style={{ padding: '11px 12px', fontSize: 12 }}>
                            <div style={{ color: '#374151', fontFamily: 'monospace' }}>{it.batchNo || <span style={{ color: '#9ca3af' }}>—</span>}</div>
                            {it.expiryDate && (
                              <div style={{ fontSize: 11, marginTop: 2, color: expiring ? '#dc2626' : '#6b7280', fontWeight: expiring ? 700 : 400 }}>
                                {expiring ? '⚠️ ' : ''}{formatDate(it.expiryDate)}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '11px 12px', textAlign: 'center', fontWeight: 800, fontSize: 16, color: '#374151' }}>{it.quantitySent}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {flagged ? (
                              <button onClick={() => setReceiveItems(prev => prev.map((p, j) => j === i
                                ? { ...p, _hasDiscrepancy: false, quantityReceived: p.quantitySent, discrepancyNote: '' } : p))}
                                style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                ⚠️ Discrepancy
                              </button>
                            ) : (
                              <button onClick={() => setReceiveItems(prev => prev.map((p, j) => j === i
                                ? { ...p, _hasDiscrepancy: true, quantityReceived: '' } : p))}
                                style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#dcfce7', color: '#166534', border: '1px solid #86efac', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                ✅ All Received
                              </button>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            {flagged ? (
                              <input type="number" min="0" max={it.quantitySent}
                                value={it.quantityReceived}
                                onChange={e => {
                                  const val = Math.max(0, Math.min(Number(e.target.value) || 0, Number(it.quantitySent)));
                                  setReceiveItems(prev => prev.map((p, j) => j === i ? { ...p, quantityReceived: val } : p));
                                }}
                                placeholder="0"
                                style={{ width: 72, padding: '6px 8px', border: '1.5px solid #fca5a5', borderRadius: 7, textAlign: 'center', fontSize: 15, fontWeight: 700, background: '#fef2f2' }} />
                            ) : (
                              <span style={{ fontSize: 16, fontWeight: 800, color: '#166534' }}>{it.quantitySent}</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {flagged && (
                              <input type="text" placeholder="Reason for discrepancy (required)"
                                value={it.discrepancyNote || ''}
                                onChange={e => setReceiveItems(prev => prev.map((p, j) => j === i ? { ...p, discrepancyNote: e.target.value } : p))}
                                style={{ width: '100%', padding: '6px 10px', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 12 }} />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f1f5f9', borderTop: '2.5px solid #1e40af' }}>
                      <td colSpan={2} style={{ padding: '9px 12px', fontWeight: 800, fontSize: 13, color: '#1e293b' }}>TOTAL</td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 800, fontSize: 15, color: '#374151' }}>{totalDispatched}</td>
                      <td></td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', fontWeight: 800, fontSize: 15, color: anyDiscrepancy ? '#dc2626' : '#166534' }}>
                        {totalReceiving}
                        {anyDiscrepancy && totalDispatched !== totalReceiving && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', marginLeft: 4 }}>({totalReceiving - totalDispatched})</span>
                        )}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>

                {/* ── DISCREPANCY WARNING ── */}
                {anyDiscrepancy && (
                  <div style={{ background: '#fff7ed', border: '1px solid #fb923c', borderRadius: 8, padding: '10px 16px', marginBottom: 16, fontSize: 13 }}>
                    ⚠️ <strong>Discrepancies noted.</strong> Please enter the actual quantity received and a reason for each flagged item above. This will be reported to the GM.
                  </div>
                )}

                {/* ── AUTO-SIGNED RECEIVER BADGE ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, marginBottom: 18 }}>
                  <span style={{ fontSize: 22 }}>🖊️</span>
                  <div>
                    <div style={{ fontSize: 11, color: '#166534', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Received By (Auto-signed)</div>
                    <div style={{ fontWeight: 700, color: '#15803d', fontSize: 14 }}>{user?.full_name || user?.username}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>Timestamp will be recorded automatically</div>
                </div>

                {receiveModalMsg && (
                  <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13, fontWeight: 600,
                    background: receiveModalMsg.type === 'error' ? '#fee2e2' : '#dcfce7',
                    color: receiveModalMsg.type === 'error' ? '#991b1b' : '#166534',
                    border: `1px solid ${receiveModalMsg.type === 'error' ? '#fecaca' : '#bbf7d0'}` }}>
                    {receiveModalMsg.type === 'error' ? '❌' : '✅'} {receiveModalMsg.text}
                  </div>
                )}

                {/* ── ACTION BUTTONS ── */}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button onClick={() => { setReceiveTransferModal(null); setReceiveModalMsg(null); }} disabled={submitting}
                    style={{ padding: '10px 20px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 8, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, opacity: submitting ? 0.5 : 1 }}>
                    Cancel
                  </button>
                  <button onClick={() => setViewDispatchNote(rtm)} disabled={submitting}
                    style={{ padding: '10px 20px', background: '#fff', border: '1.5px solid #3b82f6', borderRadius: 8, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, color: '#1d4ed8', opacity: submitting ? 0.5 : 1 }}>
                    📄 Full Document View
                  </button>
                  <button onClick={handleReceiveTransfer} disabled={submitting}
                    style={{ padding: '10px 26px', background: anyDiscrepancy ? '#d97706' : '#166534', color: 'white', border: 'none', borderRadius: 8, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, opacity: submitting ? 0.6 : 1 }}>
                    {submitting ? 'Processing...' : anyDiscrepancy ? '⚠️ Confirm with Discrepancies' : '✅ Confirm — All Stock Received'}
                  </button>
                </div>

              </div>
            </div>
          </div>
        );
      })()}

      {subTab === 'transfers' && (
        <Card>
          <CardHeader className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Stock Transfers</h3>
            <div style={{ display: 'flex', gap: 8 }}>
            </div>
          </CardHeader>
          <div style={{ padding: '8px 16px 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: 8, padding: '7px 14px', fontSize: '0.74rem', color: '#6d28d9', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>↔ Warehouse dispatches appear here for receiving. Full transfer lifecycle managed in</span>
              {user?.role === 'admin'
                ? <button onClick={() => navigate('/stock')} style={{ fontWeight: 700, color: '#6d28d9', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Stock Portal › Transfers tab ↗</button>
                : <strong>Stock Portal › Transfers tab</strong>
              }
            </div>
          </div>
          <div style={{ padding: '8px 16px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => { const win = window.open('','_blank'); if (!win) return; const rows = transfers.filter(r => isBranchMatch(r.toBranch || r.to_branch || r.to_location || '')).map(r => { const items = (()=>{try{return typeof r.items==='string'?JSON.parse(r.items):(r.items||[]);}catch{return [];}})(); return `<tr><td>${r.from_warehouse||user?.branch||'-'}</td><td>${r.to_branch||'-'}</td><td>${items.map(i=>`${i.product_name} ×${i.quantity}`).join(', ')||'-'}</td><td><span class="badge ${r.status==='delivered'?'badge-green':r.status==='dispatched'?'badge-blue':'badge-amber'}">${r.status||'pending'}</span></td><td>${r.created_at?new Date(r.created_at).toLocaleDateString('en-NA'):'-'}</td></tr>`; }).join(''); win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Stock Transfers</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;padding:24px}.header{display:flex;justify-content:space-between;border-bottom:3px solid #c41e3a;padding-bottom:10px;margin-bottom:16px}.company{color:#c41e3a;font-weight:900;font-size:15px}table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#c41e3a;color:#fff;font-weight:700;padding:7px 8px;text-align:left;font-size:10px}td{padding:6px 8px;border-bottom:1px solid #f1f5f9;font-size:10px}tr:nth-child(even) td{background:#fdf7f8}.badge{display:inline-block;padding:1px 7px;border-radius:20px;font-weight:700;font-size:9px}.badge-green{background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}.badge-blue{background:#eff6ff;color:#1e40af;border:1px solid #93c5fd}.badge-amber{background:#fffbeb;color:#92400e;border:1px solid #fcd34d}.print-btn{position:fixed;top:12px;right:12px;background:#c41e3a;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:700;cursor:pointer}@media print{*{print-color-adjust:exact;-webkit-print-color-adjust:exact}.print-btn{display:none}}</style></head><body><button class="print-btn" onclick="window.print()">🖨️ Print</button><div class="header"><div><div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div><div style="font-size:14px;font-weight:800;color:#8b0000;margin-top:4px">↔ Stock Transfers Report</div><div style="color:#64748b;font-size:10px;margin-top:3px">${user?.branch||'Branch'}</div></div><div style="text-align:right;color:#64748b;font-size:10px">Date: ${new Date().toLocaleDateString('en-NA',{day:'2-digit',month:'long',year:'numeric'})}</div></div><table><thead><tr><th>From</th><th>To Branch</th><th>Items</th><th>Status</th><th>Date</th></tr></thead><tbody>${rows||'<tr><td colspan="5" style="text-align:center;color:#94a3b8">No transfers</td></tr>'}</tbody></table></body></html>`); win.document.close(); }} className="px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer" style={{ background: '#f1f5f9', color: '#374151' }}>📄 Print</button>
              <button onClick={openTransferForm} className="px-4 py-2 rounded-lg text-sm font-bold border-none cursor-pointer" style={{ background: '#c41e3a', color: '#fff' }}>New Transfer</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: '#f8f5f5' }}>
                  {['Transfer #', 'From', 'To', 'Products (Batch / Expiry / Qty)', 'Status', 'Date', 'Prepared By', 'Received By', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 8px', borderBottom: '2px solid #c41e3a', fontSize: '0.68rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Only show transfers where this branch is the destination
                  const branchTransfers = transfers.filter(t => isBranchMatch(t.toBranch || t.to_branch || t.to_location || ''));
                  if (branchTransfers.length === 0) return (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>No transfers for this branch yet</td></tr>
                  );
                  return branchTransfers.map((t, idx) => {
                  const items = Array.isArray(t.items) ? t.items : (() => { try { return typeof t.items === 'string' ? JSON.parse(t.items) : []; } catch { return []; } })();
                  const statusColors = { delivered: '#166534', received: '#166534', dispatched: '#1e40af', approved: '#7c3aed', pending: '#d97706', rejected: '#c41e3a' };
                  const statusBgs = { delivered: '#f0fdf4', received: '#f0fdf4', dispatched: '#eff6ff', approved: '#f5f3ff', pending: '#fffbeb', rejected: '#fef2f2' };
                  return (
                    <tr key={t.id || idx} style={{ background: idx % 2 === 0 ? 'white' : '#fdf8f8', borderBottom: '1px solid #f5f0f0', verticalAlign: 'top' }}>
                      <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '0.74rem', color: '#374151' }}>{t.dispatchReference || t.dispatch_reference || t.id || '-'}</td>
                      <td style={{ padding: '8px', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap' }}>{fmtLocation(t.fromWarehouse || t.from_location || user?.branch)}</td>
                      <td style={{ padding: '8px', fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap' }}>{fmtLocation(t.toBranch || t.to_location)}</td>
                      <td style={{ padding: '8px', maxWidth: 300 }}>
                        {items.length > 0 ? items.map((it, i) => (
                          <div key={i} style={{ fontSize: '0.74rem', marginBottom: i < items.length - 1 ? 3 : 0, paddingBottom: i < items.length - 1 ? 3 : 0, borderBottom: i < items.length - 1 ? '1px dotted #e5e7eb' : 'none' }}>
                            <span style={{ fontWeight: 600, color: '#1e293b' }}>{it.productName || it.product_name || it.productId}</span>
                            {(it.batchNo || it.batch_no) && <span style={{ color: '#9333ea', marginLeft: 6, fontFamily: 'monospace', fontSize: '0.7rem' }}>B:{it.batchNo || it.batch_no}</span>}
                            {(it.expiryDate || it.expiry_date) && <span style={{ color: '#d97706', marginLeft: 4, fontSize: '0.7rem' }}>Exp:{formatDate(it.expiryDate || it.expiry_date)}</span>}
                            <span style={{ color: '#6b7280', marginLeft: 4 }}>x{it.quantityApproved || it.quantity_approved || it.quantity}</span>
                          </div>
                        )) : <span style={{ color: '#94a3b8' }}>{t.product_name ? `${t.product_name} x${t.quantity}` : '-'}</span>}
                      </td>
                      <td style={{ padding: '8px' }}>
                        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700, color: statusColors[t.status] || '#64748b', background: statusBgs[t.status] || '#f1f5f9', border: `1px solid ${statusColors[t.status] || '#e2e8f0'}22` }}>{(t.status || 'pending').replace(/_/g, ' ')}</span>
                      </td>
                      <td style={{ padding: '8px', color: '#6b7280', fontSize: '0.76rem', whiteSpace: 'nowrap' }}>{formatDateTime(t.createdAt || t.created_at)}</td>
                      <td style={{ padding: '8px', color: '#6b7280', fontSize: '0.76rem' }}>{t.createdBy || t.created_by || t.dispatchedBy || t.dispatched_by || '—'}</td>
                      <td style={{ padding: '8px', color: '#6b7280', fontSize: '0.76rem' }}>{t.receivedBy || t.received_by || '—'}</td>
                      <td style={{ padding: '8px' }}>
                        <button onClick={() => setViewTransfer(t)} className="px-3 py-1 text-xs rounded-lg font-bold border-none cursor-pointer" style={{ background: '#f1f5f9', color: '#374151' }}>View</button>
                      </td>
                    </tr>
                  );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {subTab === 'movements' && (() => {
        const allMov = [...movements, ...branchMovements.map(m => ({
          ...m,
          product_name: m.productName || m.product_name,
          movement_type: m.type || m.movementType || m.movement_type,
          batch_no: m.batchNo || m.batch_no,
          source_location: m.sourceBranchId || m.source_branch_id || '',
          destination_location: m.destinationBranchId || m.destination_branch_id || '',
          reference_id: m.reference,
          created_by: m.createdBy || m.created_by,
          created_at: m.createdAt || m.created_at,
          notes: m.notes,
        }))].sort((a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0));
        const seen = new Set();
        const dedupMov = allMov.filter(m => {
          const key = `${m.id || ''}-${m.product_name || m.productName || ''}-${m.movement_type || m.type || ''}-${m.quantity || 0}-${(m.created_at || m.createdAt || '').toString().slice(0, 19)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        const filteredMov = dedupMov.filter(m => {
          const pName = (m.product_name || m.productName || '').toLowerCase();
          if (movFilter.search && !pName.includes(movFilter.search.toLowerCase())) return false;
          const mType = (m.movement_type || m.type || '').toLowerCase();
          if (movFilter.type !== 'all' && mType !== movFilter.type) return false;
          if (movFilter.dateFrom) { const d = new Date(m.created_at || m.createdAt); if (d < new Date(movFilter.dateFrom)) return false; }
          if (movFilter.dateTo) { const d = new Date(m.created_at || m.createdAt); if (d > new Date(movFilter.dateTo + 'T23:59:59')) return false; }
          return true;
        });
        const inwardTypes = ['received', 'receive', 'stock_receipt', 'transfer_in', 'return', 'return_in', 'adjustment'];
        const outwardTypes = ['sale', 'walk_in_member_sale', 'walk_in_non_member_sale', 'write_off', 'transfer_out', 'field_use', 'return_out', 'dispense', 'prescription_dispense', 'online_order_sale', 'campaign_sale', 'campaign_free_item'];
        const totalInward = filteredMov.filter(m => inwardTypes.includes((m.movement_type || m.type || '').toLowerCase())).reduce((s, m) => s + Math.abs(Number(m.quantity || 0)), 0);
        const totalOutward = filteredMov.filter(m => outwardTypes.includes((m.movement_type || m.type || '').toLowerCase())).reduce((s, m) => s + Math.abs(Number(m.quantity || 0)), 0);
        const totalDPOut = filteredMov.filter(m => outwardTypes.includes((m.movement_type || m.type || '').toLowerCase())).reduce((s, m) => {
          const capturedPrice = Number(m.unit_price || m.unitPrice || m.unit_dp || m.unitDp || 0);
          return s + capturedPrice * Math.abs(Number(m.quantity || 0));
        }, 0);
        const typeLabel = (t) => {
          const map = { received: 'Stock Receipt', receive: 'Stock Receipt', stock_receipt: 'Stock Receipt', sale: 'Walk-in Sale', walk_in_member_sale: 'Member Sale', walk_in_non_member_sale: 'Non-member Sale', write_off: 'Write Off', transfer_in: 'Transfer In', transfer_out: 'Transfer Out', field_use: 'Field Use', return: 'Return In', return_in: 'Return In', return_out: 'Return Out', adjustment: 'Adjustment', dispense: 'Prescription Dispense', prescription_dispense: 'Prescription Dispense', online_order_sale: 'Online Order Sale', campaign_sale: 'Campaign Sale', campaign_free_item: 'Campaign Free Item' };
          return map[t] || (t || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        };
        const typeBadge = (t) => {
          const tl = (t || '').toLowerCase();
          const colors = { received: '#166534', receive: '#166534', sale: '#2563eb', write_off: '#c41e3a', transfer_in: '#7c3aed', transfer_out: '#9333ea', field_use: '#0891b2', return: '#059669', adjustment: '#d97706', dispense: '#6366f1', campaign_sale: '#b45309', campaign_free_item: '#b91c1c' };
          const bgs = { received: '#f0fdf4', receive: '#f0fdf4', sale: '#eff6ff', write_off: '#fef2f2', transfer_in: '#f5f3ff', transfer_out: '#faf5ff', field_use: '#ecfeff', return: '#ecfdf5', adjustment: '#fffbeb', dispense: '#eef2ff', campaign_sale: '#fffbeb', campaign_free_item: '#fff0f0' };
          const color = colors[tl] || '#64748b';
          const bg = bgs[tl] || '#f1f5f9';
          return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700, color, background: bg, border: `1px solid ${color}22`, whiteSpace: 'nowrap' }}>{typeLabel(tl)}</span>;
        };
        const movTypes = [...new Set(dedupMov.map(m => (m.movement_type || m.type || '').toLowerCase()).filter(Boolean))];

        return (
        <Card>
          <CardHeader className="flex justify-between items-center flex-wrap gap-3">
            <div>
              <h3 className="font-bold text-gray-800 m-0">Stock Movement Ledger</h3>
              <p className="text-xs text-gray-500 m-0 mt-1">Complete audit trail — all stock-affecting transactions</p>
            </div>
            <button onClick={() => printStockMovementsReport(filteredMov, selectedBranch || user?.branch||'')} className="px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer" style={{ background: '#c41e3a', color: '#fff' }}>📄 Print</button>
          </CardHeader>
          <div style={{ padding: '6px 16px 8px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', borderBottom: '1px solid #f0e8ea', background: '#fafafa' }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em' }}>Populated by:</span>
            {[
              { label: '🛒 Walk-in Sales tab', color: '#2563eb' },
              { label: '💊 Prescriptions tab', color: '#6366f1' },
              { label: '📦 Stock Tab actions (receive, transfer, write-off)', color: '#c41e3a' },
              { label: '🏭 Warehouse dispatches', color: '#9333ea' },
            ].map(d => (
              <span key={d.label} style={{ fontSize: '0.65rem', fontWeight: 600, color: d.color, background: `${d.color}10`, border: `1px solid ${d.color}28`, borderRadius: 20, padding: '2px 8px' }}>{d.label}</span>
            ))}
          </div>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0e8ea', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" placeholder="Search product..." value={movFilter.search} onChange={e => setMovFilter(p => ({ ...p, search: e.target.value }))}
              style={{ padding: '7px 12px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.82rem', width: 160, outline: 'none' }} />
            <select value={movFilter.type} onChange={e => setMovFilter(p => ({ ...p, type: e.target.value }))}
              style={{ padding: '7px 12px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.82rem', outline: 'none' }}>
              <option value="all">All Types</option>
              {movTypes.map(t => <option key={t} value={t}>{typeLabel(t)}</option>)}
            </select>
            <input type="date" value={movFilter.dateFrom} onChange={e => setMovFilter(p => ({ ...p, dateFrom: e.target.value }))}
              style={{ padding: '6px 10px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.8rem', outline: 'none' }} />
            <span style={{ color: '#94a3b8', fontSize: '0.78rem' }}>to</span>
            <input type="date" value={movFilter.dateTo} onChange={e => setMovFilter(p => ({ ...p, dateTo: e.target.value }))}
              style={{ padding: '6px 10px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.8rem', outline: 'none' }} />
            {(movFilter.search || movFilter.type !== 'all' || movFilter.dateFrom || movFilter.dateTo) && (
              <button onClick={() => setMovFilter({ search: '', type: 'all', dateFrom: '', dateTo: '' })} style={{ padding: '6px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.78rem', cursor: 'pointer', background: '#f9fafb', color: '#64748b' }}>Clear</button>
            )}
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#94a3b8' }}>{filteredMov.length} record{filteredMov.length !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, padding: '12px 16px', borderBottom: '1px solid #f0e8ea' }}>
            <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#166534' }}>{totalInward}</div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>Inward</div>
            </div>
            <div style={{ background: '#fef2f2', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#c41e3a' }}>{totalOutward}</div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#c41e3a', textTransform: 'uppercase' }}>Outward</div>
            </div>
            <div style={{ background: '#eff6ff', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1e40af' }}>{totalInward - totalOutward}</div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase' }}>Net</div>
            </div>
            <div style={{ background: '#fdf2f4', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#c41e3a' }}>N$ {Math.round(totalDPOut).toLocaleString("en-ZA")}</div>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#c41e3a', textTransform: 'uppercase' }}>DP Out</div>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: '#f8f5f5' }}>
                  {['Date', 'Product', 'Batch', 'Expiry', 'Type', 'Qty', 'DP Value', 'From', 'To', 'Reference', 'Staff', 'Notes'].map(h => (
                    <th key={h} style={{ textAlign: h === 'Qty' || h === 'DP Value' ? 'right' : 'left', padding: '8px 8px', borderBottom: '2px solid #c41e3a', fontSize: '0.68rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMov.length === 0 ? (
                  <tr><td colSpan={12} style={{ textAlign: 'center', padding: '32px 0', color: '#94a3b8' }}>No movements recorded</td></tr>
                ) : filteredMov.map((m, idx) => {
                  const pName = m.product_name || m.productName || '-';
                  const mType = (m.movement_type || m.type || '').toLowerCase();
                  const capturedPrice = Number(m.unit_price || m.unitPrice || m.unit_dp || m.unitDp || 0);
                  const dpVal = capturedPrice * Math.abs(Number(m.quantity || 0));
                  const isOut = outwardTypes.includes(mType);
                  return (
                    <tr key={m.id || idx} style={{ background: idx % 2 === 0 ? 'white' : '#fdf8f8', borderBottom: '1px solid #f5f0f0' }}>
                      <td style={{ padding: '7px 8px', whiteSpace: 'nowrap', color: '#6b7280', fontSize: '0.76rem' }}>{formatDateTime(m.created_at || m.createdAt)}</td>
                      <td style={{ padding: '7px 8px', fontWeight: 600, color: '#1e293b', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pName}</td>
                      <td style={{ padding: '7px 8px', color: '#6b7280', fontFamily: 'monospace', fontSize: '0.74rem' }}>{m.batch_no || m.batchNo || '—'}</td>
                      <td style={{ padding: '7px 8px', color: '#6b7280', fontSize: '0.74rem', whiteSpace: 'nowrap' }}>{(m.expiry_date || m.expiryDate) ? new Date(m.expiry_date || m.expiryDate).toLocaleDateString('en-ZA') : '—'}</td>
                      <td style={{ padding: '7px 8px' }}>{typeBadge(mType)}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: isOut ? '#c41e3a' : '#166534' }}>{isOut ? '-' : '+'}{Math.abs(Number(m.quantity || 0))}</td>
                      <td style={{ padding: '7px 8px', textAlign: 'right', color: dpVal > 0 ? '#1e293b' : '#94a3b8', fontWeight: 600 }}>{dpVal > 0 ? `N$ ${Math.round(dpVal).toLocaleString("en-ZA")}` : '—'}</td>
                      <td style={{ padding: '7px 8px', color: '#6b7280', fontSize: '0.74rem', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtLocation(m.source_location || m.sourceLocation) || '—'}</td>
                      <td style={{ padding: '7px 8px', color: '#6b7280', fontSize: '0.74rem', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtLocation(m.destination_location || m.destinationLocation) || '—'}</td>
                      <td style={{ padding: '7px 8px', color: '#6b7280', fontFamily: 'monospace', fontSize: '0.72rem', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.reference_id || m.referenceId || m.reference || '—'}</td>
                      <td style={{ padding: '7px 8px', color: '#6b7280', fontSize: '0.74rem', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.created_by || m.createdBy || '—'}</td>
                      <td style={{ padding: '7px 8px', color: '#94a3b8', fontSize: '0.72rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.notes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        );
      })()}

      {subTab === 'reports' && (() => {
        const branchName = getBranchDisplayName(selectedBranch || user?.branch) || 'Branch';
        const branchIdParam = selectedBranch || user?.branch || '';
        const todayStr = new Date().toISOString().slice(0, 10);
        const monthStr = new Date().toISOString().slice(0, 7);
        const monthLabel = new Date().toLocaleDateString('en-NA', { month: 'long', year: 'numeric' });

        const fmtC = (n) => `N$ ${Math.round(Number(n || 0)).toLocaleString('en-ZA')}`;
        const fmt = (n) => Number(n || 0).toLocaleString();

        const buildPaymentBreakdownHTML = (paymentMethods) => {
          if (!paymentMethods || Object.keys(paymentMethods).length === 0) return '';
          const rows = Object.entries(paymentMethods).map(([pm, d]) =>
            `<tr><td style="padding:4px 8px;font-size:10px;color:#374151;text-transform:capitalize">${pm}</td><td style="padding:4px 8px;font-size:10px;text-align:center">${d.count}</td><td style="padding:4px 8px;font-size:10px;text-align:right;font-weight:700;color:#1e40af">${fmtC(d.value)}</td></tr>`
          ).join('');
          return `<table style="width:100%;border-collapse:collapse;margin-top:4px;background:#f0f9ff;border-radius:6px;overflow:hidden">
            <thead><tr style="background:#1e40af;color:#fff"><th style="padding:4px 8px;font-size:9px;text-align:left">Payment Method</th><th style="padding:4px 8px;font-size:9px;text-align:center">Count</th><th style="padding:4px 8px;font-size:9px;text-align:right">Amount</th></tr></thead>
            <tbody>${rows}</tbody></table>`;
        };

        const buildRxLineItemsHTML = (lineItems) => {
          if (!Array.isArray(lineItems) || lineItems.length === 0) return '<p style="font-size:10px;color:#94a3b8;margin:4px 0">No prescription dispenses recorded</p>';
          const rows = lineItems.map(li => {
            const productRows = Array.isArray(li.products) && li.products.length > 0
              ? li.products.map(p =>
                  `<tr style="background:#f5f3ff"><td style="padding:3px 8px 3px 20px;font-size:9px;color:#6366f1" colspan="2">&rarr; ${p.product_name || '—'}${p.batch_no ? ` [${p.batch_no}]` : ''}</td><td style="padding:3px 8px;font-size:9px;text-align:center;color:#6366f1">${p.qty}</td><td style="padding:3px 8px;font-size:9px;text-align:right;color:#6366f1">${fmtC(p.dp_value)}</td><td></td></tr>`
                ).join('')
              : '';
            return `<tr><td style="padding:4px 8px;font-size:10px">${li.client_name || 'Patient'}</td><td style="padding:4px 8px;font-size:10px">${li.client_type || '—'}</td><td style="padding:4px 8px;font-size:10px;text-align:center">${li.total_qty || li.qty}</td><td style="padding:4px 8px;font-size:10px;text-align:right;font-weight:700;color:#6366f1">${fmtC(li.total_dp_value || li.value)}</td><td style="padding:4px 8px;font-size:10px;text-transform:capitalize">${li.payment_method || '—'}</td></tr>${productRows}`;
          }).join('');
          return `<table style="width:100%;border-collapse:collapse;margin-top:4px"><thead><tr style="background:#6366f1;color:#fff"><th style="padding:4px 8px;font-size:9px;text-align:left">Patient</th><th style="padding:4px 8px;font-size:9px;text-align:left">Type</th><th style="padding:4px 8px;font-size:9px;text-align:center">Qty</th><th style="padding:4px 8px;font-size:9px;text-align:right">DP Value</th><th style="padding:4px 8px;font-size:9px;text-align:left">Payment</th></tr></thead><tbody>${rows}</tbody></table>`;
        };

        const buildCampaignLineItemsHTML = (lineItems) => {
          if (!Array.isArray(lineItems) || lineItems.length === 0) return '';
          const rows = lineItems.map((li, idx) => {
            const productRows = Array.isArray(li.products) && li.products.length > 0
              ? li.products.map(p =>
                  `<tr style="background:#fffbeb"><td style="padding:3px 8px 3px 20px;font-size:9px;color:#92400e" colspan="2">&rarr; ${p.product_name || '—'}${p.batch_no ? ` [${p.batch_no}]` : ''}</td><td style="padding:3px 8px;font-size:9px;text-align:center;color:#92400e">${p.qty}</td><td style="padding:3px 8px;font-size:9px;text-align:right;color:#b45309;font-weight:700">${fmtC(p.dp_value)}</td></tr>`
                ).join('')
              : '';
            const refShort = (li.reference_id || '').slice(-8).toUpperCase();
            return `<tr style="background:${idx % 2 === 0 ? '#fff' : '#fafaf8'}"><td style="padding:4px 8px;font-size:10px;color:#92400e;font-family:monospace">${refShort}</td><td style="padding:4px 8px;font-size:10px;text-align:center">${li.total_qty || 0}</td><td style="padding:4px 8px;font-size:10px;text-align:right;font-weight:700;color:#b45309">${fmtC(li.total_dp_value || 0)}</td></tr>${productRows}`;
          }).join('');
          return `<table style="width:100%;border-collapse:collapse;margin-top:4px;border-radius:6px;overflow:hidden"><thead><tr style="background:#b45309;color:#fff"><th style="padding:4px 8px;font-size:9px;text-align:left">Sale Ref</th><th style="padding:4px 8px;font-size:9px;text-align:center">Qty</th><th style="padding:4px 8px;font-size:9px;text-align:right">DP Value</th></tr></thead><tbody>${rows}</tbody></table>`;
        };

        const printDPSalesReportFromData = (data, period) => {
          const c = data.consultations || {};
          const wi = data.walkin_sales || {};
          const mem = data.member_sales || {};
          const nm = data.non_member_sales || {};
          const on = data.online_order_sales || {};
          const rx = data.prescription_dispensing || {};
          const camp = data.campaign_sales || {};
          const grandTotal = data.grand_total || 0;
          const bs = data.branch_summary || {};
          const totalQty = data.total_qty_sold || 0;
          const totalTx = data.total_transactions || 0;
          const nmCp = bs.nm_cp_total || 0;
          const nmDp = bs.nm_dp_total || nm.value || 0;
          const campDp = camp.value || bs.campaign_total || 0;
          const refundTotal = data.refund_deductions?.total_amount || bs.refund_deductions || 0;

          // Merge payment method maps from multiple sources
          const mergePMs = (...maps) => {
            const merged = {};
            for (const pm of maps) {
              for (const [method, d] of Object.entries(pm || {})) {
                if (!merged[method]) merged[method] = { count: 0, value: 0 };
                merged[method].count += d.count || 0;
                merged[method].value = parseFloat((merged[method].value + (d.value || 0)).toFixed(2));
              }
            }
            return merged;
          };

          // Walk-in Sales = general walk-in + member walk-in + non-member walk-in
          // (all clients who did NOT see a consultant — no prescription)
          const wiTx  = (wi.transactions || 0) + (mem.transactions || 0) + (nm.transactions || 0);
          const wiQty = (wi.qty || 0) + (mem.qty || 0) + (nm.qty || 0);
          const wiDp  = parseFloat(((wi.value || 0) + (mem.value || 0) + nmDp).toFixed(2));
          const wiPMs = mergePMs(wi.payment_methods, mem.payment_methods, nm.payment_methods);

          const sections = [
            { title: '1. Consultation Fees', tx: c.transactions || 0, qty: c.qty || 0, dp: c.fee_value || c.value || 0, pmBreakdown: c.payment_methods },
            { title: '2. Walk-in Sales (Members & Non-members)', tx: wiTx, qty: wiQty, dp: wiDp, cp: nmCp || undefined, pmBreakdown: wiPMs,
              subSections: [
                mem.transactions > 0 ? { label: 'Member Walk-in (DP)', pmBreakdown: mem.payment_methods } : null,
                nm.transactions  > 0 ? { label: 'Non-member Walk-in (CP/DP)', pmBreakdown: nm.payment_methods } : null,
                wi.transactions  > 0 ? { label: 'General Walk-in', pmBreakdown: wi.payment_methods } : null,
              ].filter(Boolean)
            },
            { title: '3. Prescription Sales (after consultation)', tx: rx.transactions || 0, qty: rx.qty || 0, dp: rx.value || 0, pmBreakdown: rx.payment_methods, lineItems: rx.line_items },
            { title: '4. Online Order Sales', tx: on.transactions || 0, qty: on.qty || 0, dp: on.value || 0, pmBreakdown: on.payment_methods },
            ...(camp.transactions > 0 ? [{ title: '5. Campaign Sales (DP)', tx: camp.transactions || 0, qty: camp.qty || 0, dp: campDp, pmBreakdown: camp.payment_methods, campaignLineItems: camp.line_items, isCampaign: true }] : []),
          ];

          const sectionRows = sections.map(sec => {
            const hasCP = sec.cp != null && sec.cp > 0;
            const isCamp = sec.isCampaign;
            const dpCell = `<td style="padding:8px 12px;border-bottom:1px solid #f0e8ea;text-align:right;font-weight:700;color:${isCamp ? '#b45309' : '#166534'}">${fmtC(sec.dp)}</td>`;
            const cpCell = hasCP
              ? `<td style="padding:8px 12px;border-bottom:1px solid #f0e8ea;text-align:right;font-weight:700;color:#1d4ed8">${fmtC(sec.cp)}</td>`
              : `<td style="padding:8px 12px;border-bottom:1px solid #f0e8ea;text-align:right;color:#94a3b8">—</td>`;
            const titleStyle = isCamp ? 'padding:8px 12px;border-bottom:1px solid #f0e8ea;font-weight:700;color:#b45309;background:#fffbeb' : 'padding:8px 12px;border-bottom:1px solid #f0e8ea;font-weight:600';
            return `<tr><td style="${titleStyle}">${sec.title}</td><td style="padding:8px;border-bottom:1px solid #f0e8ea;text-align:center">${sec.tx}</td><td style="padding:8px;border-bottom:1px solid #f0e8ea;text-align:right">${sec.qty}</td>${dpCell}${cpCell}</tr>`;
          }).join('');

          const detailSections = sections.map(sec => {
            const rxHtml = sec.lineItems ? buildRxLineItemsHTML(sec.lineItems) : '';
            const campHtml = sec.campaignLineItems ? buildCampaignLineItemsHTML(sec.campaignLineItems) : '';
            // Walk-in: show sub-section breakdowns per type
            if (sec.subSections && sec.subSections.length > 0) {
              const subHtml = sec.subSections.map(s => {
                const pmHtml = buildPaymentBreakdownHTML(s.pmBreakdown);
                return pmHtml ? `<div style="margin-left:8px;margin-bottom:6px"><span style="font-size:9px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em">${s.label}</span>${pmHtml}</div>` : '';
              }).filter(Boolean).join('');
              if (!subHtml) return '';
              return `<h4 style="font-size:10px;color:#374151;margin:10px 0 4px;font-weight:700">${sec.title}</h4>${subHtml}`;
            }
            if (sec.isCampaign) {
              if (!campHtml) return '';
              return `<h4 style="font-size:10px;color:#b45309;margin:10px 0 4px;font-weight:700;background:#fffbeb;padding:4px 6px;border-radius:4px">🎁 ${sec.title}</h4>${campHtml}`;
            }
            const pmHtml = buildPaymentBreakdownHTML(sec.pmBreakdown);
            if (!pmHtml && !rxHtml) return '';
            return `<h4 style="font-size:10px;color:#374151;margin:10px 0 4px;font-weight:700">${sec.title}</h4>${pmHtml}${rxHtml}`;
          }).filter(Boolean).join('');

          printStockDocument(`DP Sales Report — ${period}`, `
            <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:11px;color:#166534;font-weight:600">DP = Distributor Price &nbsp;·&nbsp; CP = Consumer Price (shown for Non-member Walk-in Sales only)</div>
            <h3 style="font-size:12px;color:#c41e3a;margin:16px 0 8px;border-bottom:1px solid #fecaca;padding-bottom:4px">SALES BY CATEGORY</h3>
            <table style="width:100%;border-collapse:collapse;font-size:11px">
              <thead><tr style="background:#c41e3a;color:#fff"><th style="text-align:left;padding:8px 12px">Category</th><th style="text-align:center;padding:8px">Transactions</th><th style="text-align:right;padding:8px">Qty</th><th style="text-align:right;padding:8px 12px">DP Total</th><th style="text-align:right;padding:8px 12px;background:#1d4ed8">CP Total</th></tr></thead>
              <tbody>${sectionRows}</tbody>
            </table>
            <h3 style="font-size:12px;color:#c41e3a;margin:20px 0 8px;border-bottom:1px solid #fecaca;padding-bottom:4px">PAYMENT METHOD BREAKDOWN & DISPENSING DETAIL</h3>
            ${detailSections || '<p style="font-size:10px;color:#94a3b8">No transactions recorded</p>'}
            <h3 style="font-size:12px;color:#c41e3a;margin:20px 0 8px;border-bottom:1px solid #fecaca;padding-bottom:4px">TOTALS</h3>
            <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px">
              <tr style="background:#fdf2f4"><td style="padding:10px 12px;font-weight:800;color:#c41e3a">Total Transactions</td><td style="padding:10px 12px;text-align:right;font-weight:800">${totalTx}</td></tr>
              <tr><td style="padding:8px 12px;font-weight:700">Total Qty Sold</td><td style="padding:8px 12px;text-align:right;font-weight:700">${fmt(totalQty)}</td></tr>
              <tr style="background:#f0f9ff"><td style="padding:8px 12px;font-weight:700;color:#1d4ed8">Non-member Walk-in — CP (Gross)</td><td style="padding:8px 12px;text-align:right;font-weight:700;color:#1d4ed8">${fmtC(nmCp)}</td></tr>
              <tr><td style="padding:8px 12px;font-weight:700;color:#166534">Non-member Walk-in — DP (Net)</td><td style="padding:8px 12px;text-align:right;font-weight:700;color:#166534">${fmtC(nmDp)}</td></tr>
              <tr style="background:#fdf2f4"><td style="padding:10px 12px;font-weight:800;color:#c41e3a;font-size:12px">Grand Total (DP)</td><td style="padding:10px 12px;text-align:right;font-weight:800;color:#c41e3a;font-size:13px">${fmtC(grandTotal)}</td></tr>
            </table>
            <h3 style="font-size:12px;color:#c41e3a;margin:20px 0 8px;border-bottom:1px solid #fecaca;padding-bottom:4px">DP SALES SUMMARY</h3>
            <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px">
              <tr style="background:#f8fafc"><td style="padding:6px 12px;border-bottom:1px solid #f0e8ea">Branch</td><td style="padding:6px 12px;text-align:right;border-bottom:1px solid #f0e8ea;font-weight:700">${branchName}</td></tr>
              <tr><td style="padding:6px 12px;border-bottom:1px solid #f0e8ea">Period</td><td style="padding:6px 12px;text-align:right;border-bottom:1px solid #f0e8ea;font-weight:700">${period}</td></tr>
            </table>
            <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:4px">
              <tr style="background:#f0fdf4">
                <td style="padding:9px 14px;font-weight:700;color:#166534">Consultation Fees (DP)</td>
                <td style="padding:9px 14px;text-align:right;font-weight:700;color:#166534">${fmtC(c.fee_value || c.value || 0)}</td>
              </tr>
              <tr>
                <td style="padding:9px 14px;font-weight:700;color:#1e293b">Walk-in Sales — Members &amp; Non-members (DP)</td>
                <td style="padding:9px 14px;text-align:right;font-weight:700;color:#1e293b">${fmtC(wiDp)}</td>
              </tr>
              <tr style="background:#f0fdf4">
                <td style="padding:9px 14px;font-weight:700;color:#166534">Prescription Sales (DP)</td>
                <td style="padding:9px 14px;text-align:right;font-weight:700;color:#166534">${fmtC(rx.value || 0)}</td>
              </tr>
              ${on.transactions > 0 ? `<tr><td style="padding:9px 14px;font-weight:700;color:#1e293b">Online Order Sales (DP)</td><td style="padding:9px 14px;text-align:right;font-weight:700;color:#1e293b">${fmtC(on.value || 0)}</td></tr>` : ''}
              ${campDp > 0 ? `<tr style="background:#fffbeb"><td style="padding:9px 14px;font-weight:700;color:#b45309">🎁 Campaign Sales (DP)</td><td style="padding:9px 14px;text-align:right;font-weight:700;color:#b45309">${fmtC(campDp)}</td></tr>` : ''}
              ${refundTotal > 0 ? `<tr style="background:#fef2f2"><td style="padding:9px 14px;font-weight:700;color:#dc2626">Less: Credit Refunds (Approved)</td><td style="padding:9px 14px;text-align:right;font-weight:700;color:#dc2626">− ${fmtC(refundTotal)}</td></tr>` : ''}
              <tr style="border-top:2px solid #c41e3a">
                <td style="padding:14px 14px;font-weight:900;color:#fff;font-size:13px;letter-spacing:0.03em;background:linear-gradient(135deg,#c41e3a,#8b0000)">TOTAL DP SALES</td>
                <td style="padding:14px 14px;text-align:right;font-weight:900;color:#fff;font-size:18px;background:linear-gradient(135deg,#c41e3a,#8b0000)">${fmtC(grandTotal)}</td>
              </tr>
            </table>
            <div style="font-size:9px;color:#94a3b8;text-align:center;margin-top:6px">All amounts shown at Distributor Price (DP) — the amount that belongs to the company</div>`, branchName);
        };

        const printStockFormulaFromData = (data) => {
          const products = data.products || [];
          const totals = data.totals || {};
          const period = `${data.period_start || ''} to ${data.period_end || ''}`;
          const now = new Date();
          const fRow = (label, val, color, bg, borderTop) =>
            `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 18px;${bg ? `background:${bg};` : ''}${borderTop ? `border-top:2px solid ${borderTop};` : ''}border-bottom:1px solid #f1f5f9">
               <span style="font-size:12px;font-weight:700;color:#374151">${label}</span>
               <span style="font-size:16px;font-weight:900;color:${color || '#1e293b'}">${val}</span>
             </div>`;
          const invRows = products.map(p =>
            `<tr><td style="padding:5px 8px;font-size:9.5px">${p.product_name || '-'}</td><td style="padding:5px 8px;font-size:9.5px;text-align:right">${fmt(p.opening_qty)}</td><td style="padding:5px 8px;font-size:9.5px;text-align:right;color:#166534">${fmt(p.received_qty)}</td><td style="padding:5px 8px;font-size:9.5px;text-align:right;color:#2563eb">${fmt(p.sold_qty)}</td><td style="padding:5px 8px;font-size:9.5px;text-align:right;color:#6366f1">${fmt(p.dispensed_qty)}</td><td style="padding:5px 8px;font-size:9.5px;text-align:right;color:#9333ea">${fmt(p.transferred_qty)}</td><td style="padding:5px 8px;font-size:9.5px;text-align:right;color:#c41e3a">${fmt(p.written_off_qty)}</td><td style="padding:5px 8px;font-size:9.5px;text-align:right;font-weight:800;color:${Number(p.closing_qty) <= 0 ? '#c41e3a' : '#166534'}">${fmt(p.closing_qty)}</td><td style="padding:5px 8px;font-size:9.5px;text-align:right;font-weight:700">${fmtC(p.dp_total_value)}</td></tr>`
          ).join('');
          const win = window.open('', '_blank');
          if (!win) return;
          win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Stock Formula Report — ${branchName}</title>
          <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;padding:24px}.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #c41e3a;padding-bottom:10px;margin-bottom:16px}.company{color:#c41e3a;font-weight:900;font-size:15px}.print-btn{position:fixed;top:12px;right:12px;background:#c41e3a;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-weight:700;cursor:pointer}@media print{*{print-color-adjust:exact;-webkit-print-color-adjust:exact}.print-btn{display:none}body{padding:10px}}</style>
          </head><body>
          <button class="print-btn" onclick="window.print()">Print</button>
          <div class="header">
            <div><div class="company">DYNAPHARM INTERNATIONAL NAMIBIA</div><div style="font-size:14px;font-weight:800;color:#8b0000;margin-top:4px">Branch Stock Formula Report</div><div style="color:#64748b;font-size:10px;margin-top:3px">${branchName} &nbsp;&middot;&nbsp; ${period}</div></div>
            <div style="text-align:right;color:#64748b;font-size:10px;line-height:1.6">Date: ${now.toLocaleDateString('en-NA', { day: '2-digit', month: 'long', year: 'numeric' })}<br>Generated by: Branch Portal</div>
          </div>
          <div style="border:1.5px solid #f0e8ea;border-radius:12px;overflow:hidden;margin-bottom:16px">
            <div style="background:linear-gradient(135deg,#c41e3a,#8b0000);color:#fff;padding:12px 18px;font-weight:800;font-size:13px">Stock Calculation — ${period}</div>
            ${fRow('Opening Stock', fmt(totals.opening_qty || 0), '#1e3a5f', '#f4f7fb')}
            ${fRow('+ Received', '+' + fmt(totals.received_qty || 0), '#166534', '#f0fdf4')}
            ${fRow('&minus; Sold (Walk-in)', '&minus;' + fmt(totals.sold_qty || 0), '#c41e3a', '#fef2f2')}
            ${fRow('&minus; Dispensed (Prescription)', '&minus;' + fmt(totals.dispensed_qty || 0), '#6366f1', '#f5f3ff')}
            ${fRow('&minus; Transferred Out', '&minus;' + fmt(totals.transferred_qty || 0), '#9333ea', '#fdf4ff')}
            ${fRow('&minus; Written Off', '&minus;' + fmt(totals.written_off_qty || 0), '#c41e3a', '#fef2f2')}
            ${fRow('= Closing Stock', fmt(totals.closing_qty || 0), '#15803d', 'linear-gradient(135deg,#f0fdf4,#dcfce7)', '#86efac')}
            <div style="padding:8px 18px;background:#fafafa;font-size:10px;color:#64748b">Total DP Value of Sales + Dispenses: <strong style="color:#c41e3a">${fmtC(totals.dp_total_value || 0)}</strong></div>
          </div>
          <h3 style="font-size:9px;font-weight:800;color:#c41e3a;text-transform:uppercase;letter-spacing:.12em;margin:14px 0 6px;border-bottom:1px solid #fecaca;padding-bottom:4px">Per-Product Detail</h3>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:#c41e3a;color:#fff"><th style="padding:6px 8px;font-size:9px;text-align:left">Product</th><th style="padding:6px 8px;font-size:9px;text-align:right">Opening</th><th style="padding:6px 8px;font-size:9px;text-align:right">+Received</th><th style="padding:6px 8px;font-size:9px;text-align:right">&minus;Sold</th><th style="padding:6px 8px;font-size:9px;text-align:right">&minus;Disp</th><th style="padding:6px 8px;font-size:9px;text-align:right">&minus;Trf</th><th style="padding:6px 8px;font-size:9px;text-align:right">&minus;W/O</th><th style="padding:6px 8px;font-size:9px;text-align:right">Closing</th><th style="padding:6px 8px;font-size:9px;text-align:right">DP Value</th></tr></thead>
            <tbody>${invRows || '<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:12px">No inventory data</td></tr>'}</tbody>
            <tfoot><tr style="background:#fdf2f4;border-top:2px solid #c41e3a"><td style="padding:6px 8px;font-size:9.5px;font-weight:800">TOTAL</td><td style="padding:6px 8px;font-size:9.5px;text-align:right;font-weight:800">${fmt(totals.opening_qty || 0)}</td><td style="padding:6px 8px;font-size:9.5px;text-align:right;font-weight:800;color:#166534">${fmt(totals.received_qty || 0)}</td><td style="padding:6px 8px;font-size:9.5px;text-align:right;font-weight:800;color:#2563eb">${fmt(totals.sold_qty || 0)}</td><td style="padding:6px 8px;font-size:9.5px;text-align:right;font-weight:800;color:#6366f1">${fmt(totals.dispensed_qty || 0)}</td><td style="padding:6px 8px;font-size:9.5px;text-align:right;font-weight:800;color:#9333ea">${fmt(totals.transferred_qty || 0)}</td><td style="padding:6px 8px;font-size:9.5px;text-align:right;font-weight:800;color:#c41e3a">${fmt(totals.written_off_qty || 0)}</td><td style="padding:6px 8px;font-size:9.5px;text-align:right;font-weight:800;color:#166534">${fmt(totals.closing_qty || 0)}</td><td style="padding:6px 8px;font-size:9.5px;text-align:right;font-weight:800">${fmtC(totals.dp_total_value || 0)}</td></tr></tfoot>
          </table>
          </body></html>`);
          win.document.close();
        };

        const handleDailyReport = async () => {
          try {
            const data = await api.reports.branchSalesDaily({ branch_id: branchIdParam, date: todayStr });
            printDPSalesReportFromData(data, 'Daily — ' + new Date().toLocaleDateString('en-NA'));
          } catch (e) {
            alert('Failed to load daily report: ' + (e.message || 'Unknown error'));
          }
        };

        const handleMonthlyReport = async () => {
          try {
            const data = await api.reports.branchSalesMonthly({ branch_id: branchIdParam, month: monthStr });
            printDPSalesReportFromData(data, monthLabel);
          } catch (e) {
            alert('Failed to load monthly report: ' + (e.message || 'Unknown error'));
          }
        };

        const handleStockFormulaReport = async () => {
          try {
            const data = await api.reports.branchStockFormula({ branch_id: branchIdParam, month: monthStr });
            printStockFormulaFromData(data);
          } catch (e) {
            alert('Failed to load stock formula report: ' + (e.message || 'Unknown error'));
          }
        };

        return (
        <div>
          {/* Cross-portal data sources banner */}
          <div style={{ background: 'linear-gradient(90deg,#f8fafc,#f0f4ff)', border: '1.5px solid #c7d2fe', borderRadius: 12, padding: '12px 18px', marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e3a5f' }}>📊 Report data sources:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1 }}>
              {[
                { label: '🛒 Walk-in Sales', desc: 'member, non-member, general sales' },
                { label: '💊 Prescriptions', desc: 'dispenses with patient & product detail' },
                { label: '📦 Stock Movements', desc: 'receipts, transfers, write-offs' },
                { label: '💳 Bonus Payments', desc: 'distributor payouts by branch' },
              ].map(s => (
                <span key={s.label} title={s.desc} style={{ fontSize: '0.68rem', fontWeight: 600, color: '#3730a3', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 20, padding: '3px 10px', cursor: 'help' }}>{s.label}</span>
              ))}
            </div>
            {user?.role === 'admin' && (
              <button onClick={() => navigate('/stock')} style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1e40af', background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8, padding: '5px 12px', cursor: 'pointer' }}>
                🏭 View Warehouse Reports ↗
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 14 }}>
            {[
              { icon: '📊', title: 'Daily DP Sales Report', desc: "Today's sales — all categories including Rx dispenses with payment method breakdown. Server-side aggregation covers all records.", action: handleDailyReport },
              { icon: '📈', title: 'Monthly DP Sales Report', desc: `${monthLabel} — complete DP report with payment breakdown and Rx patient detail lines. No data load limits.`, action: handleMonthlyReport },
              { icon: '📦', title: 'Physical Stock Report', desc: 'Current batch-level inventory with movement aggregates & DP values', action: () => {
                if (!inventory || inventory.length === 0) { alert('No inventory data loaded for this branch. Please wait for data to load or select a branch first.'); return; }
                printPhysicalStockReport(inventory, branchName);
              }},
              { icon: '🔢', title: 'Stock Formula Report', desc: 'Opening + Received − Sold − Dispensed − Transfers − Write-offs = Closing (server-side per product)', action: handleStockFormulaReport },
              { icon: '🔄', title: 'Stock Movements Report', desc: 'Full movement ledger: receipts, sales, write-offs, transfers, dispenses', action: () => {
                if (!movements || movements.length === 0) { alert('No movement records loaded for this branch. Please navigate to the Movements tab first to load data, or check if this branch has any recorded movements.'); return; }
                printStockMovementsReport(movements, branchName);
              }},
              { icon: '📥', title: 'Receiving Stock Report', desc: 'Stock received from warehouse with dispatch details', action: () => {
                if (!requests || requests.length === 0) { alert('No stock requests loaded for this branch. Please navigate to the Stock Requests tab first to load data.'); return; }
                printReceivingStockReport(requests, branchName);
              }},
              { icon: '🎁', title: 'Bonus Payments Report', desc: 'Distributor bonus payments made by this branch with optional date range filter.', action: async () => {
                try {
                  const fromDate = prompt('From date (YYYY-MM-DD), leave blank for all:') || '';
                  const toDate = prompt('To date (YYYY-MM-DD), leave blank for all:') || '';
                  const params = { branch: branchIdParam };
                  if (fromDate) params.from = fromDate;
                  if (toDate) params.to = toDate;
                  const result = await api.branch.bonusPayments(params);
                  const paidList = result.paidHistory || [];
                  if (paidList.length === 0) { alert('No bonus payments recorded for this branch.'); return; }
                  const totalPaid = paidList.reduce((s, p) => s + Number(p.amount || 0), 0);
                  const rows = paidList.map(p =>
                    `<tr><td style="padding:7px 10px;border-bottom:1px solid #f0e8ea">${p.nb_number || '-'}</td><td style="padding:7px 10px;border-bottom:1px solid #f0e8ea">${p.distributor_name || '-'}</td><td style="padding:7px 10px;border-bottom:1px solid #f0e8ea">${p.period || '-'}</td><td style="padding:7px 10px;border-bottom:1px solid #f0e8ea;text-align:right;font-weight:700;color:#166534">N$ ${Math.round(Number(p.amount || 0)).toLocaleString("en-ZA")}</td><td style="padding:7px 10px;border-bottom:1px solid #f0e8ea">${p.paid_at ? new Date(p.paid_at).toLocaleDateString('en-NA') : '-'}</td></tr>`
                  ).join('');
                  printStockDocument(`Bonus Payments Report — ${branchName}`, `
                    <h3 style="font-size:12px;color:#c41e3a;margin:16px 0 8px;border-bottom:1px solid #fecaca;padding-bottom:4px">DISTRIBUTOR BONUS PAYMENTS</h3>
                    <table style="width:100%;border-collapse:collapse;font-size:11px">
                      <thead><tr style="background:#c41e3a;color:#fff"><th style="text-align:left;padding:8px 10px">NB Number</th><th style="text-align:left;padding:8px 10px">Distributor</th><th style="text-align:left;padding:8px 10px">Period</th><th style="text-align:right;padding:8px 10px">Amount</th><th style="text-align:left;padding:8px 10px">Date Paid</th></tr></thead>
                      <tbody>${rows}</tbody>
                      <tfoot><tr style="background:#f0fdf4;border-top:2px solid #86efac"><td colspan="3" style="padding:10px;font-weight:800">TOTAL PAID</td><td style="padding:10px;text-align:right;font-weight:900;color:#166534;font-size:13px">N$ ${Math.round(totalPaid).toLocaleString("en-ZA")}</td><td></td></tr></tfoot>
                    </table>`, branchName);
                } catch (e) {
                  alert('Failed to load bonus payments: ' + (e.message || 'Unknown error'));
                }
              }},
            ].map(card => (
              <div key={card.title} style={{ background: '#fff', border: '1.5px solid #f0e8ea', borderRadius: 14, padding: '18px 20px', boxShadow: '0 2px 8px rgba(196,30,58,0.06)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: '2rem' }}>{card.icon}</div>
                <div>
                  <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.95rem' }}>{card.title}</div>
                  <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>{card.desc}</div>
                </div>
                <button onClick={card.action} className="mt-auto px-4 py-2.5 rounded-xl font-bold text-sm border-none cursor-pointer" style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', boxShadow: '0 3px 10px rgba(196,30,58,0.25)' }}>
                  Preview &amp; Print
                </button>
              </div>
            ))}
          </div>
        </div>
        );
      })()}


      {/* Request Stock Modal — Product Table */}
      {showRequestForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', backdropFilter: 'blur(3px)' }}>
          <div style={{ width: '100%', maxWidth: 900, background: '#fff', borderRadius: 20, overflow: 'hidden', maxHeight: '95vh', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(196,30,58,0.2)' }}>
            <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>📋 Request Stock from Warehouse</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', marginTop: 2 }}>{getBranchDisplayName(selectedBranch || user?.branch) || ''} · Select products from catalogue</div>
              </div>
              <button onClick={() => setShowRequestForm(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* Product picker */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #f0e8ea' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0e8ea', flexShrink: 0 }}>
                  <BarcodeScanner
                    autoFocus={false}
                    placeholder="Scan barcode to add to request…"
                    style={{ marginBottom: 8 }}
                    onResult={(result) => {
                      const scannedName = (result.productName || '').toLowerCase().trim();
                      const matched = products.find(p =>
                        (p.name || p.description || '').toLowerCase().trim() === scannedName
                      ) || products.find(p => {
                        const pn = (p.name || p.description || '').toLowerCase();
                        return pn.includes(scannedName) || scannedName.includes(pn);
                      });
                      if (result.outOfStock) {
                        return;
                      } else if (matched) {
                        addToRequestItems(matched);
                      } else if (result.productName) {
                        addToRequestItems({ id: `bc-${result.barcode || result.productId || Date.now()}`, name: result.productName, description: result.productName, dp: result.dp || result.unitPrice || 0, cp: result.cp || result.dp || result.unitPrice || 0, price: result.dp || result.unitPrice || 0, bv: result.bv || 0 });
                      }
                    }}
                  />
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#c41e3a', fontSize: '0.9rem', pointerEvents: 'none' }}>🔍</div>
                    <input type="text" value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search catalogue products…"
                      style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: 8 }}>
                    {filteredProducts.slice(0, 80).map(p => {
                      const inReq = requestItems.find(i => i.id === p.id);
                      return (
                        <button key={p.id} onClick={() => addToRequestItems(p)} type="button"
                          style={{ padding: '10px', border: inReq ? '2.5px solid #c41e3a' : '1.5px solid #f0e8ea', borderRadius: 11, background: inReq ? '#fff0f3' : '#fff', cursor: 'pointer', textAlign: 'left', position: 'relative' }}>
                          {inReq && <div style={{ position: 'absolute', top: 6, right: 6, background: '#c41e3a', color: '#fff', borderRadius: '50%', width: 20, height: 20, fontSize: '0.7rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{inReq.quantity}</div>}
                          <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.8rem', lineHeight: 1.3, paddingRight: inReq ? 22 : 0 }}>{p.name || p.description}</div>
                          <div style={{ fontSize: '0.75rem', color: '#c41e3a', fontWeight: 700, marginTop: 5 }}>DP: {formatCurrency(p.dp || p.price || 0)}</div>
                        </button>
                      );
                    })}
                    {filteredProducts.length === 0 && <p style={{ color: '#94a3b8', gridColumn: '1/-1', textAlign: 'center', padding: '24px 0' }}>No products found</p>}
                  </div>
                </div>
              </div>

              {/* Request summary sidebar */}
              <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#fdf7f8' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #f0e8ea', flexShrink: 0 }}>
                  {sectionLabel('Request Items')}
                  <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                    {requestItems.length === 0 ? <p style={{ color: '#c4a0a7', fontSize: '0.82rem', textAlign: 'center', padding: '16px 0' }}>Click products to add them</p> : requestItems.map(item => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid #fdf5f5' }}>
                        <div style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600, color: '#1e293b', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.product_name}</div>
                        <button onClick={() => updateRequestQty(item.id, -1)} style={{ width: 22, height: 22, border: '1px solid #fecaca', borderRadius: 5, background: '#fff', cursor: 'pointer', color: '#c41e3a', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                        <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 800, fontSize: '0.85rem' }}>{item.quantity}</span>
                        <button onClick={() => updateRequestQty(item.id, 1)} style={{ width: 22, height: 22, border: '1px solid #fecaca', borderRadius: 5, background: '#fff', cursor: 'pointer', color: '#c41e3a', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                        <button onClick={() => removeRequestItem(item.id)} style={{ width: 20, height: 20, border: 'none', borderRadius: 5, background: '#fef2f2', cursor: 'pointer', color: '#ef4444', fontWeight: 800, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ padding: '14px 16px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    {sectionLabel('Priority')}
                    <select value={requestPriority} onChange={e => setRequestPriority(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.87rem', outline: 'none' }}>
                      <option value="normal">Normal</option>
                      <option value="high">High Priority</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                  <div>
                    {sectionLabel('Notes')}
                    <textarea value={requestNotes} onChange={e => setRequestNotes(e.target.value)} rows={3} placeholder="Reason or additional notes…" style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.85rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>

                <div style={{ padding: '12px 16px', borderTop: '1px solid #f0e8ea', display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => setShowRequestForm(false)} style={{ flex: 1, padding: '10px', border: '1.5px solid #e8d5d8', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600, fontSize: '0.87rem' }}>Cancel</button>
                  <button onClick={handleStockRequest} disabled={submitting || requestItems.length === 0}
                    style={{ flex: 2, padding: '10px', border: 'none', borderRadius: 10, background: requestItems.length === 0 ? '#fecaca' : 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', fontWeight: 800, cursor: requestItems.length===0?'not-allowed':'pointer', fontSize: '0.87rem', opacity: submitting?0.65:1 }}>
                    {submitting ? '⏳ Submitting…' : `📋 Submit (${requestItems.length} item${requestItems.length!==1?'s':''})`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Receive Stock Modal */}
      {showReceiveForm && selectedRequest && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', backdropFilter: 'blur(3px)' }}>
          <div style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 30px 80px rgba(196,30,58,0.2)' }}>
            <div style={{ background: 'linear-gradient(135deg,#166534,#15803d)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>📥 Receive Stock</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', marginTop: 2 }}>Request: {selectedRequest.request_number || selectedRequest.id}</div>
              </div>
              <button onClick={() => setShowReceiveForm(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: '20px', maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ marginBottom: 16 }}>
                {sectionLabel('Items to Receive')}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {receiveItems.map((item, i) => (
                    <div key={i} style={{ padding: '10px 14px', background: '#f9f5f5', borderRadius: 10, border: '1px solid #f0e8ea' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.88rem' }}>{item.product_name}</div>
                          <div style={{ fontSize: '0.74rem', color: '#64748b', marginTop: 1 }}>Requested: {item.quantity}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                          <label style={{ fontSize: '0.68rem', color: '#c41e3a', fontWeight: 700 }}>Qty Received</label>
                          <input type="number" min="0" value={item.received_qty}
                            onChange={e => setReceiveItems(prev => prev.map((r, j) => j===i ? {...r, received_qty: e.target.value} : r))}
                            style={{ width: 70, padding: '5px 8px', border: '1.5px solid #fecaca', borderRadius: 7, fontSize: '0.87rem', textAlign: 'center', outline: 'none' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: '0.65rem', color: '#c41e3a', fontWeight: 700, display: 'block', marginBottom: 2 }}>Batch No *</label>
                          <input type="text" value={item.batch_no || ''} placeholder="e.g. BN-2024-001"
                            onChange={e => setReceiveItems(prev => prev.map((r, j) => j===i ? {...r, batch_no: e.target.value} : r))}
                            style={{ width: '100%', padding: '5px 8px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: '0.65rem', color: '#c41e3a', fontWeight: 700, display: 'block', marginBottom: 2 }}>Expiry Date *</label>
                          <input type="date" value={item.expiry_date || ''}
                            onChange={e => setReceiveItems(prev => prev.map((r, j) => j===i ? {...r, expiry_date: e.target.value} : r))}
                            style={{ width: '100%', padding: '5px 8px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Delivery Note / Waybill #</label>
                  <input type="text" value={receiveDeliveryNote} onChange={e => setReceiveDeliveryNote(e.target.value)} placeholder="e.g. WB-20240320-001"
                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Received By</label>
                  <input type="text" value={receiveReceivedBy} onChange={e => setReceiveReceivedBy(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid #f0e8ea', background: '#fff' }}>
              {receiveFormMsg && (
                <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 600,
                  background: receiveFormMsg.type === 'error' ? '#fee2e2' : '#dcfce7',
                  color: receiveFormMsg.type === 'error' ? '#991b1b' : '#166534',
                  border: `1px solid ${receiveFormMsg.type === 'error' ? '#fecaca' : '#bbf7d0'}` }}>
                  {receiveFormMsg.type === 'error' ? '❌' : '✅'} {receiveFormMsg.text}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowReceiveForm(false); setReceiveFormMsg(null); }} disabled={submitting} style={{ padding: '10px 20px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: submitting ? 'not-allowed' : 'pointer', color: '#64748b', fontWeight: 600, fontSize: '0.87rem', opacity: submitting ? 0.5 : 1 }}>Cancel</button>
                <button onClick={handleReceiveStock} disabled={submitting}
                  style={{ padding: '10px 28px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#166534,#15803d)', color: '#fff', fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '0.9rem', opacity: submitting?0.65:1 }}>
                  {submitting ? '⏳ Recording…' : '✅ Confirm Receipt'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Stock Form - full catalogue picker */}
      {showTransferForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', backdropFilter: 'blur(3px)' }}>
          <div style={{ width: '100%', maxWidth: 900, background: '#fff', borderRadius: 20, overflow: 'hidden', maxHeight: '95vh', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(196,30,58,0.2)' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e3a5f,#0f2040)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>↔ Transfer Stock to Branch</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', marginTop: 2 }}>From: <strong style={{ color: '#fff' }}>{getBranchDisplayName(selectedBranch || user?.branch) || 'Your Branch'}</strong> · Select destination and products</div>
              </div>
              <button onClick={() => setShowTransferForm(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* Product picker */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid #e8eef4' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #e8eef4', flexShrink: 0 }}>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#1e3a5f', fontSize: '0.9rem', pointerEvents: 'none' }}>🔍</div>
                    <input type="text" value={transferProductSearch} onChange={e => setTransferProductSearch(e.target.value)} placeholder="Search catalogue products…"
                      style={{ width: '100%', padding: '9px 12px 9px 34px', border: '1.5px solid #c8d8e8', borderRadius: 9, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: 8 }}>
                    {filteredTransferProducts.slice(0, 80).map(p => {
                      const inList = transferItems.find(i => i.id === p.id);
                      return (
                        <button key={p.id} onClick={() => addToTransferItems(p)} type="button"
                          style={{ padding: '10px', border: inList ? '2.5px solid #1e3a5f' : '1.5px solid #e0e8f0', borderRadius: 11, background: inList ? '#eef3f9' : '#fff', cursor: 'pointer', textAlign: 'left', position: 'relative' }}>
                          {inList && <div style={{ position: 'absolute', top: 6, right: 6, background: '#1e3a5f', color: '#fff', borderRadius: '50%', width: 20, height: 20, fontSize: '0.7rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{inList.quantity}</div>}
                          <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.8rem', lineHeight: 1.3, paddingRight: inList ? 22 : 0 }}>{p.name || p.description}</div>
                          <div style={{ fontSize: '0.75rem', color: '#1e3a5f', fontWeight: 700, marginTop: 5 }}>DP: {formatCurrency(p.dp || p.price || 0)}</div>
                        </button>
                      );
                    })}
                    {filteredTransferProducts.length === 0 && <p style={{ color: '#94a3b8', gridColumn: '1/-1', textAlign: 'center', padding: '24px 0' }}>No products found</p>}
                  </div>
                </div>
              </div>

              {/* Transfer summary sidebar */}
              <div style={{ width: 290, flexShrink: 0, display: 'flex', flexDirection: 'column', background: '#f4f7fb' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #dbe6f0', flexShrink: 0 }}>
                  {sectionLabel('Transfer Details')}
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: '0.73rem', fontWeight: 700, color: '#1e3a5f', display: 'block', marginBottom: 4 }}>From Branch</label>
                    <div style={{ padding: '8px 12px', background: '#dbe6f0', borderRadius: 8, fontSize: '0.87rem', fontWeight: 700, color: '#0f2040' }}>{getBranchDisplayName(selectedBranch || user?.branch) || 'Your Branch'}</div>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.73rem', fontWeight: 700, color: '#1e3a5f', display: 'block', marginBottom: 4 }}>To Branch *</label>
                    <select value={transferToBranch} onChange={e => setTransferToBranch(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #c8d8e8', borderRadius: 8, fontSize: '0.87rem', outline: 'none', background: '#fff' }}>
                      <option value="">Select destination branch…</option>
                      {BRANCH_DETAILS.filter(b => b.id !== (selectedBranch || user?.branch)).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ padding: '12px 16px', borderBottom: '1px solid #dbe6f0', flexShrink: 0 }}>
                  {sectionLabel('Items to Transfer')}
                  <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                    {transferItems.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '0.82rem', textAlign: 'center', padding: '16px 0' }}>Click products to add them</p> : transferItems.map(item => (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0', borderBottom: '1px solid #e8f0f8' }}>
                        <div style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600, color: '#1e293b', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.product_name}</div>
                        <button onClick={() => updateTransferQty(item.id, -1)} style={{ width: 22, height: 22, border: '1px solid #c8d8e8', borderRadius: 5, background: '#fff', cursor: 'pointer', color: '#1e3a5f', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                        <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 800, fontSize: '0.85rem' }}>{item.quantity}</span>
                        <button onClick={() => updateTransferQty(item.id, 1)} style={{ width: 22, height: 22, border: '1px solid #c8d8e8', borderRadius: 5, background: '#fff', cursor: 'pointer', color: '#1e3a5f', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                        <button onClick={() => removeTransferItem(item.id)} style={{ width: 20, height: 20, border: 'none', borderRadius: 5, background: '#e8f0f8', cursor: 'pointer', color: '#1e3a5f', fontWeight: 800, fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ padding: '12px 16px', flexShrink: 0 }}>
                  {sectionLabel('Notes')}
                  <textarea value={transferNotes} onChange={e => setTransferNotes(e.target.value)} rows={3} placeholder="Reason for transfer or additional notes…" style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #c8d8e8', borderRadius: 8, fontSize: '0.85rem', resize: 'none', outline: 'none', boxSizing: 'border-box', background: '#fff' }} />
                </div>

                <div style={{ padding: '12px 16px', borderTop: '1px solid #dbe6f0', display: 'flex', gap: 8, flexShrink: 0, marginTop: 'auto' }}>
                  <button onClick={() => setShowTransferForm(false)} style={{ flex: 1, padding: '10px', border: '1.5px solid #c8d8e8', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600, fontSize: '0.87rem' }}>Cancel</button>
                  <button onClick={handleTransfer} disabled={submitting || transferItems.length === 0 || !transferToBranch}
                    style={{ flex: 2, padding: '10px', border: 'none', borderRadius: 10, background: (transferItems.length === 0 || !transferToBranch) ? '#c8d8e8' : 'linear-gradient(135deg,#1e3a5f,#0f2040)', color: '#fff', fontWeight: 800, cursor: (transferItems.length===0||!transferToBranch)?'not-allowed':'pointer', fontSize: '0.87rem', opacity: submitting?0.65:1 }}>
                    {submitting ? '⏳ Transferring…' : `↔ Transfer (${transferItems.length} item${transferItems.length!==1?'s':''})`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Request Modal */}
      {viewRequest && (
        <div onClick={e => { if (e.target === e.currentTarget) setViewRequest(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(3px)' }}>
          <div style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 30px 80px rgba(196,30,58,0.2)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 800 }}>📋 Request Details</div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.77rem', marginTop: 2, fontFamily: 'monospace' }}>{viewRequest.request_number || viewRequest.id}</div>
              </div>
              <button onClick={() => setViewRequest(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'Requesting Branch', value: viewRequest.requesting_branch || user?.branch || '-' },
                  { label: 'Priority', value: viewRequest.priority || 'normal' },
                  { label: 'Status', value: viewRequest.status || 'pending' },
                  { label: 'Date', value: formatDateTime(viewRequest.created_at) },
                  { label: 'Created By', value: viewRequest.created_by || '-' },
                  { label: 'Request Type', value: (viewRequest.request_type || 'branch_restock').replace(/_/g, ' ') },
                ].map(f => (
                  <div key={f.label} style={{ background: '#f8f9fa', padding: '10px 14px', borderRadius: 10 }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#c41e3a', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 3 }}>{f.label}</div>
                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.88rem' }}>{f.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#c41e3a', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Requested Items</div>
                {parseItems(viewRequest).map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f9f5f5', borderRadius: 9, border: '1px solid #f0e8ea', marginBottom: 6 }}>
                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.88rem' }}>{item.product_name}</div>
                    <div style={{ background: '#c41e3a', color: '#fff', borderRadius: 20, padding: '2px 12px', fontWeight: 800, fontSize: '0.82rem' }}>× {item.quantity}</div>
                  </div>
                ))}
                {parseItems(viewRequest).length === 0 && <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No items recorded</p>}
              </div>
              {viewRequest.notes && (
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Notes</div>
                  <div style={{ color: '#374151', fontSize: '0.87rem' }}>{viewRequest.notes}</div>
                </div>
              )}
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #f0e8ea', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
              {(viewRequest.status==='approved'||viewRequest.status==='dispatched') && (
                <button onClick={() => { openReceiveForm(viewRequest); setViewRequest(null); }} style={{ padding: '10px 22px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#166534,#15803d)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '0.9rem' }}>📥 Receive Stock</button>
              )}
              <button onClick={() => setViewRequest(null)} style={{ padding: '10px 22px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600, fontSize: '0.87rem' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* View Transfer Modal */}
      {viewTransfer && (
        <div onClick={e => { if (e.target === e.currentTarget) setViewTransfer(null); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', backdropFilter: 'blur(3px)' }}>
          <div style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 30px 80px rgba(30,58,95,0.25)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e3a5f,#0f2040)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 800 }}>↔ Transfer Details</div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.77rem', marginTop: 2, fontFamily: 'monospace' }}>{viewTransfer.id || '-'}</div>
              </div>
              <button onClick={() => setViewTransfer(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {[
                  { label: 'From', value: fmtLocation(viewTransfer.fromWarehouse || viewTransfer.from_location || user?.branch) },
                  { label: 'To', value: fmtLocation(viewTransfer.toBranch || viewTransfer.to_location) },
                  { label: 'Status', value: viewTransfer.status || 'pending' },
                  { label: 'Date', value: formatDateTime(viewTransfer.createdAt || viewTransfer.created_at) },
                  { label: 'Created By', value: viewTransfer.createdBy || viewTransfer.created_by || '-' },
                ].map(f => (
                  <div key={f.label} style={{ background: '#f4f7fb', padding: '10px 14px', borderRadius: 10 }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#1e3a5f', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 3 }}>{f.label}</div>
                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.88rem' }}>{f.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#1e3a5f', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Items Transferred</div>
                {parseItems(viewTransfer).map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f4f7fb', borderRadius: 9, border: '1px solid #dbe6f0', marginBottom: 6 }}>
                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.88rem' }}>{item.product_name}</div>
                    <div style={{ background: '#1e3a5f', color: '#fff', borderRadius: 20, padding: '2px 12px', fontWeight: 800, fontSize: '0.82rem' }}>× {item.quantity}</div>
                  </div>
                ))}
                {parseItems(viewTransfer).length === 0 && <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No items recorded</p>}
              </div>
              {viewTransfer.notes && (
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Notes</div>
                  <div style={{ color: '#374151', fontSize: '0.87rem' }}>{viewTransfer.notes}</div>
                </div>
              )}
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
              <button onClick={() => setViewTransfer(null)} style={{ padding: '10px 22px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600, fontSize: '0.87rem' }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showWriteOffForm && (() => {
        const woInv = inventory.filter(i => Number(i.quantity || 0) > 0);
        const woSearchLc = writeOffSearch.toLowerCase();
        const woFiltered = writeOffSearch
          ? woInv.filter(i => (i.product_name || i.productName || '').toLowerCase().includes(woSearchLc) || (i.batch_no || i.batchNo || '').toLowerCase().includes(woSearchLc))
          : woInv;
        const selectedIds = Object.keys(writeOffSelected);
        const allVisibleChecked = woFiltered.length > 0 && woFiltered.every(i => writeOffSelected[i.id]);
        const validEntries = Object.entries(writeOffSelected).filter(([, v]) => Number(v.quantity) > 0);
        const totalDP = validEntries.reduce((sum, [batchId, { quantity }]) => {
          const batch = inventory.find(i => i.id === batchId);
          if (!batch) return sum;
          const dp = findProductPrice(batch.product_name || batch.productName);
          return sum + (dp?.dp ? Math.round(Number(dp.dp) * Number(quantity)) : 0);
        }, 0);
        const toggleAll = () => {
          if (allVisibleChecked) {
            const next = { ...writeOffSelected };
            woFiltered.forEach(i => delete next[i.id]);
            setWriteOffSelected(next);
          } else {
            const next = { ...writeOffSelected };
            woFiltered.forEach(i => { if (!next[i.id]) next[i.id] = { quantity: '', reason: 'expired' }; });
            setWriteOffSelected(next);
          }
        };
        const toggleRow = (id) => {
          const next = { ...writeOffSelected };
          if (next[id]) { delete next[id]; } else { next[id] = { quantity: '', reason: 'expired' }; }
          setWriteOffSelected(next);
        };
        const updateRow = (id, field, value) => setWriteOffSelected(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', backdropFilter: 'blur(3px)' }}>
            <div style={{ width: '100%', maxWidth: 860, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 30px 80px rgba(196,30,58,0.22)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
              {/* Header */}
              <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                  <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>Write Off Stock</div>
                  <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.78rem', marginTop: 2 }}>Check items below, enter quantities, then submit for GM approval</div>
                </div>
                <button onClick={() => { setShowWriteOffForm(false); setWriteOffSelected({}); setWriteOffSearch(''); }} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
              {/* Search bar */}
              <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', flexShrink: 0, display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Search by product name or batch..."
                  value={writeOffSearch}
                  onChange={e => setWriteOffSearch(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.85rem', outline: 'none' }}
                />
                {selectedIds.length > 0 && (
                  <span style={{ fontSize: '0.78rem', color: '#c41e3a', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {selectedIds.length} item{selectedIds.length !== 1 ? 's' : ''} selected
                  </span>
                )}
              </div>
              {/* Table */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ background: '#fef2f2', borderBottom: '2px solid #fecaca' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'center', width: 36 }}>
                        <input type="checkbox" checked={allVisibleChecked} onChange={toggleAll} style={{ cursor: 'pointer', width: 15, height: 15 }} title="Select all visible" />
                      </th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', color: '#7f1d1d', fontWeight: 700 }}>Product</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', color: '#7f1d1d', fontWeight: 700 }}>Batch</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', color: '#7f1d1d', fontWeight: 700 }}>Expiry</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right', color: '#7f1d1d', fontWeight: 700 }}>Available</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center', color: '#7f1d1d', fontWeight: 700, minWidth: 100 }}>Write-off Qty</th>
                      <th style={{ padding: '10px 8px', textAlign: 'center', color: '#7f1d1d', fontWeight: 700, minWidth: 130 }}>Reason</th>
                      <th style={{ padding: '10px 8px', textAlign: 'right', color: '#7f1d1d', fontWeight: 700 }}>DP Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {woFiltered.length === 0 && (
                      <tr><td colSpan={8} style={{ padding: '28px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>No inventory items match your search</td></tr>
                    )}
                    {woFiltered.map((item, idx) => {
                      const id = item.id;
                      const isChecked = !!writeOffSelected[id];
                      const sel = writeOffSelected[id] || {};
                      const pName = item.product_name || item.productName;
                      const dp = findProductPrice(pName);
                      const dpUnit = dp?.dp ? Number(dp.dp) : 0;
                      const woQty = Number(sel.quantity || 0);
                      const dpLine = isChecked && woQty > 0 ? Math.round(dpUnit * woQty) : null;
                      const expRaw = item.expiry_date || item.expiryDate;
                      const isExp = expRaw ? new Date(expRaw) < new Date() : false;
                      const rowBg = isChecked ? '#fff5f5' : idx % 2 === 0 ? '#fff' : '#fafafa';
                      const overQty = isChecked && woQty > Number(item.quantity || 0);
                      return (
                        <tr key={id} style={{ background: rowBg, borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <input type="checkbox" checked={isChecked} onChange={() => toggleRow(id)} style={{ cursor: 'pointer', width: 15, height: 15 }} />
                          </td>
                          <td style={{ padding: '8px 12px', fontWeight: isChecked ? 700 : 400, color: '#1e293b' }}>
                            {pName}
                          </td>
                          <td style={{ padding: '8px 12px', color: '#475569', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                            {item.batch_no || item.batchNo || <span style={{ color: '#cbd5e1' }}>N/A</span>}
                          </td>
                          <td style={{ padding: '8px 12px', color: isExp ? '#dc2626' : '#475569', fontWeight: isExp ? 700 : 400 }}>
                            {expRaw ? formatDate(expRaw) : <span style={{ color: '#cbd5e1' }}>N/A</span>}
                            {isExp && <span style={{ marginLeft: 4, fontSize: '0.7rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '1px 4px', color: '#dc2626' }}>EXP</span>}
                          </td>
                          <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700, color: '#1e293b' }}>
                            {Number(item.quantity || 0).toLocaleString('en-ZA')}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            {isChecked ? (
                              <input
                                type="number"
                                min="1"
                                max={Number(item.quantity || 0)}
                                value={sel.quantity}
                                onChange={e => updateRow(id, 'quantity', e.target.value)}
                                placeholder="Qty"
                                style={{ width: 80, padding: '5px 8px', border: `1.5px solid ${overQty ? '#dc2626' : '#e2e8f0'}`, borderRadius: 7, fontSize: '0.82rem', outline: 'none', textAlign: 'center', background: overQty ? '#fef2f2' : '#fff' }}
                              />
                            ) : (
                              <span style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            {isChecked ? (
                              <select
                                value={sel.reason || 'expired'}
                                onChange={e => updateRow(id, 'reason', e.target.value)}
                                style={{ padding: '5px 6px', border: '1.5px solid #e2e8f0', borderRadius: 7, fontSize: '0.78rem', outline: 'none', background: '#fff' }}
                              >
                                <option value="expired">Expired</option>
                                <option value="damaged">Damaged</option>
                                <option value="lost">Lost</option>
                                <option value="spoiled">Spoiled</option>
                                <option value="adjustment-approved">Adjustment</option>
                              </select>
                            ) : (
                              <span style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 8px', textAlign: 'right', fontWeight: 700, color: dpLine !== null ? '#c41e3a' : '#cbd5e1', fontSize: '0.8rem' }}>
                            {dpLine !== null ? `N$ ${dpLine.toLocaleString('en-ZA')}` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Footer */}
              <div style={{ padding: '14px 20px', borderTop: '2px solid #fef2f2', background: '#fffbfb', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  {validEntries.length > 0 ? (
                    <>
                      <span style={{ fontWeight: 700, color: '#1e293b' }}>{validEntries.length}</span> item{validEntries.length !== 1 ? 's' : ''} to write off &nbsp;·&nbsp;
                      Total DP: <span style={{ fontWeight: 800, color: '#c41e3a' }}>N$ {totalDP.toLocaleString('en-ZA')}</span>
                    </>
                  ) : (
                    <span style={{ color: '#94a3b8' }}>Check items and enter quantities to submit</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => { setShowWriteOffForm(false); setWriteOffSelected({}); setWriteOffSearch(''); }} style={{ padding: '10px 20px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600, fontSize: '0.87rem' }}>Cancel</button>
                  <button
                    onClick={handleWriteOff}
                    disabled={submitting || validEntries.length === 0}
                    style={{ padding: '10px 28px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', fontWeight: 800, cursor: (submitting || validEntries.length === 0) ? 'not-allowed' : 'pointer', fontSize: '0.9rem', opacity: (submitting || validEntries.length === 0) ? 0.55 : 1 }}
                  >
                    {submitting ? 'Submitting...' : `Submit ${validEntries.length > 0 ? validEntries.length : ''} for GM Approval`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}

function BankingTab() {
  const { user } = useAuth();
  const [deposits, setDeposits] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bankSubTab, setBankSubTab] = useState('deposits');
  const [alert, setAlert] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Deposit form
  const [showDepositForm, setShowDepositForm] = useState(false);
  const [depositForm, setDepositForm] = useState({ amount: '', bank_name: '', reference: '', deposit_date: '', notes: '' });

  // Expense form
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ category: 'Supplies', amount: '', description: '', receipt_ref: '', date: new Date().toISOString().slice(0, 10) });
  const [approvedCAS, setApprovedCAS] = useState([]);
  const [selectedCAS, setSelectedCAS] = useState(null);
  const [casLoading, setCasLoading] = useState(false);

  // Cash drawer
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerOpening, setDrawerOpening] = useState('');
  const [drawerEntries, setDrawerEntries] = useState([]);
  const [drawerEntry, setDrawerEntry] = useState({ type: 'in', amount: '', description: '' });

  useEffect(() => {
    Promise.all([
      api.branch.deposits().catch(() => []),
      api.branch.expenses().catch(() => []),
    ]).then(([d, e]) => {
      setDeposits(Array.isArray(d) ? d : d.deposits || []);
      setExpenses(Array.isArray(e) ? e : e.expenses || []);
    }).finally(() => setLoading(false));
  }, []);

  const reloadAll = async () => {
    const [d, e] = await Promise.all([api.branch.deposits().catch(() => []), api.branch.expenses().catch(() => [])]);
    setDeposits(Array.isArray(d) ? d : d.deposits || []);
    setExpenses(Array.isArray(e) ? e : e.expenses || []);
  };

  const submitDeposit = async () => {
    if (!depositForm.amount || Number(depositForm.amount) <= 0 || !depositForm.bank_name.trim()) {
      setAlert({ type: 'error', message: 'Amount and bank name are required' }); return;
    }
    setSubmitting(true);
    try {
      await api.branch.createDeposit({ amount: Number(depositForm.amount), bankName: depositForm.bank_name.trim(), slipNumber: depositForm.reference.trim(), date: depositForm.deposit_date || new Date().toISOString().slice(0, 10), notes: depositForm.notes.trim() });
      setAlert({ type: 'success', message: 'Deposit recorded successfully' });
      setDepositForm({ amount: '', bank_name: '', reference: '', deposit_date: '', notes: '' });
      setShowDepositForm(false);
      await reloadAll();
    } catch (err) { setAlert({ type: 'error', message: err.message || 'Failed to record deposit' }); }
    finally { setSubmitting(false); }
  };

  const openExpenseForm = async () => {
    setShowExpenseForm(true);
    setAlert(null);
    setBankSubTab('expenses');
    setSelectedCAS(null);
    setApprovedCAS([]);
    setCasLoading(true);
    try {
      const res = await api.get('/cash-requests');
      const all = Array.isArray(res) ? res : [];
      setApprovedCAS(all.filter(r => (r.status || '').toLowerCase() === 'approved'));
    } catch { setApprovedCAS([]); }
    finally { setCasLoading(false); }
  };

  const submitExpense = async () => {
    if (!selectedCAS) {
      setAlert({ type: 'error', message: 'You must link this expense to an approved cash advance request (CAS).' }); return;
    }
    if (!expenseForm.amount || Number(expenseForm.amount) <= 0 || !expenseForm.description.trim()) {
      setAlert({ type: 'error', message: 'Amount and description are required' }); return;
    }
    setSubmitting(true);
    try {
      const expOfflineId = generateOfflineId();
      const expPayload = {
        category: expenseForm.category,
        amount: Number(expenseForm.amount),
        description: expenseForm.description.trim(),
        receipt_ref: expenseForm.receipt_ref.trim(),
        date: expenseForm.date,
        branch: user?.branch || '',
        offline_id: expOfflineId,
        metadata: {
          cas_id: selectedCAS.id || selectedCAS.staffId,
          cas_number: selectedCAS.saleNumber || selectedCAS.request_number || selectedCAS.requestNumber,
          cas_purpose: selectedCAS.purpose,
          cas_amount: Number(selectedCAS.amount || 0),
        },
      };
      if (!navigator.onLine) {
        await enqueue({
          type: 'expense',
          url: '/api/branch/expenses',
          method: 'POST',
          body: expPayload,
          offlineId: expOfflineId,
          label: `Expense · ${expenseForm.category} · N$${expenseForm.amount}`,
        });
      } else {
        await api.branch.createExpense(expPayload);
      }
      setAlert({ type: 'success', message: navigator.onLine ? 'Branch expense recorded and linked to CAS ' + (selectedCAS.requestNumber || selectedCAS.saleNumber || '') : 'Expense saved offline — will sync when connected' });
      setExpenseForm({ category: 'Supplies', amount: '', description: '', receipt_ref: '', date: new Date().toISOString().slice(0, 10) });
      setSelectedCAS(null);
      setShowExpenseForm(false);
      await reloadAll();
    } catch (err) { setAlert({ type: 'error', message: err.message || 'Failed to record expense' }); }
    finally { setSubmitting(false); }
  };

  const addDrawerEntry = () => {
    if (!drawerEntry.amount || Number(drawerEntry.amount) <= 0) return;
    setDrawerEntries(prev => [...prev, { ...drawerEntry, amount: Number(drawerEntry.amount), time: new Date().toLocaleTimeString('en-NA', { hour: '2-digit', minute: '2-digit' }) }]);
    setDrawerEntry({ type: 'in', amount: '', description: '' });
  };
  const drawerBalance = Number(drawerOpening || 0) + drawerEntries.reduce((s, e) => s + (e.type === 'in' ? e.amount : -e.amount), 0);

  if (loading && deposits.length === 0 && expenses.length === 0) return <LoadingSpinner />;

  const inputStyle = { width: '100%', padding: '10px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' };
  const labelStyle = { fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 };

  return (
    <div>
      <div className="rounded-xl p-5 mb-5 flex justify-between items-center flex-wrap gap-3" style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', boxShadow: '0 4px 20px rgba(196,30,58,0.28)' }}>
        <div>
          <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1 m-0">Branch Finance</p>
          <h3 className="text-white text-lg font-bold m-0">🏦 Banking & Finance</h3>
          <p className="text-white/70 text-sm mt-1 m-0">Deposits · Cash Drawer · Expenses</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => { setShowDepositForm(true); setAlert(null); }} className="px-4 py-2 rounded-full font-semibold text-sm cursor-pointer" style={{ background: '#fff', color: '#c41e3a', border: 'none', fontWeight: 700 }}>💰 New Deposit</button>
          <button onClick={() => { setShowDrawer(true); setAlert(null); }} className="px-4 py-2 rounded-full font-semibold text-sm cursor-pointer text-white" style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)' }}>💵 Cash Drawer</button>
          <button onClick={openExpenseForm} className="px-4 py-2 rounded-full font-semibold text-sm cursor-pointer text-white" style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)' }}>💸 Record Expense</button>
        </div>
      </div>

      {alert && <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: alert.type === 'success' ? '#f0fdf4' : '#fef2f2', color: alert.type === 'success' ? '#166534' : '#991b1b', border: `1px solid ${alert.type === 'success' ? '#86efac' : '#fca5a5'}` }}>{alert.message}</div>}

      <div className="flex gap-2 mb-5">
        {[{ id: 'deposits', label: '💰 Deposits' }, { id: 'expenses', label: '💸 Expenses' }].map(t => (
          <button key={t.id} onClick={() => setBankSubTab(t.id)}
            style={{ padding: '8px 20px', borderRadius: 20, fontSize: '0.85rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: bankSubTab === t.id ? '#c41e3a' : '#f1f5f9', color: bankSubTab === t.id ? '#fff' : '#64748b' }}>
            {t.label}
          </button>
        ))}
      </div>

      {bankSubTab === 'deposits' && (
        <Card>
          <CardHeader><h3 className="font-bold text-gray-800">Bank Deposits</h3></CardHeader>
          <Table
            columns={[
              { header: 'Date', render: r => formatDateTime(r.deposit_date || r.date || r.created_at) },
              { header: 'Amount', render: r => <span className="font-bold text-green-600">{formatCurrency(r.amount)}</span> },
              { header: 'Bank', render: r => r.bank_name || r.bankName || '-' },
              { header: 'Reference', render: r => r.reference || r.slip_number || '-' },
              { header: 'Status', render: r => <Badge variant={r.status === 'verified' ? 'success' : 'warning'}>{r.status || 'Pending'}</Badge> },
            ]}
            data={deposits}
            emptyMessage="No deposits recorded — click New Deposit to start"
          />
        </Card>
      )}

      {bankSubTab === 'expenses' && (
        <Card>
          <CardHeader className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">Branch Expenses</h3>
            <div style={{ fontWeight: 700, color: '#c41e3a', fontSize: '0.9rem' }}>Total: {formatCurrency(expenses.reduce((s, e) => s + Number(e.amount || 0), 0))}</div>
          </CardHeader>
          <Table
            columns={[
              { header: 'Date', render: r => formatDateTime(r.date || r.created_at) },
              { header: 'Category', render: r => <Badge variant="info">{r.category || '-'}</Badge> },
              { header: 'Description', render: r => <span className="text-sm">{r.description || '-'}</span> },
              { header: 'Amount', render: r => <span className="font-bold text-red-600">{formatCurrency(r.amount)}</span> },
              { header: 'Receipt Ref', render: r => r.receipt_ref || r.receiptRef || '-' },
              { header: 'Status', render: r => <Badge variant={r.status === 'approved' ? 'success' : 'warning'}>{r.status || 'Pending'}</Badge> },
            ]}
            data={expenses}
            emptyMessage="No expenses recorded — click Record Expense to start"
          />
        </Card>
      )}

      {/* Deposit Form Modal */}
      {showDepositForm && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowDepositForm(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(3px)' }}>
          <div style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 30px 80px rgba(196,30,58,0.2)', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'linear-gradient(135deg,#166534,#15803d)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 800 }}>💰 Record Bank Deposit</div>
              <button onClick={() => setShowDepositForm(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelStyle}>Amount (N$) *</label><input type="number" min="1" value={depositForm.amount} onChange={e => setDepositForm(f => ({ ...f, amount: e.target.value }))} style={inputStyle} placeholder="0.00" /></div>
                <div><label style={labelStyle}>Bank Name *</label><input type="text" value={depositForm.bank_name} onChange={e => setDepositForm(f => ({ ...f, bank_name: e.target.value }))} style={inputStyle} placeholder="e.g. FNB, Standard Bank" /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelStyle}>Reference / Slip #</label><input type="text" value={depositForm.reference} onChange={e => setDepositForm(f => ({ ...f, reference: e.target.value }))} style={inputStyle} placeholder="Deposit slip ref" /></div>
                <div><label style={labelStyle}>Deposit Date</label><input type="date" value={depositForm.deposit_date} onChange={e => setDepositForm(f => ({ ...f, deposit_date: e.target.value }))} style={inputStyle} /></div>
              </div>
              <div><label style={labelStyle}>Notes</label><textarea value={depositForm.notes} onChange={e => setDepositForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Optional notes…" style={{ ...inputStyle, resize: 'none' }} /></div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowDepositForm(false)} style={{ flex: 1, padding: '11px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600 }}>Cancel</button>
                <button onClick={submitDeposit} disabled={submitting} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#166534,#15803d)', color: '#fff', fontWeight: 800, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.65 : 1 }}>{submitting ? '⏳ Saving…' : '💰 Record Deposit'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expense Form Modal */}
      {showExpenseForm && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowExpenseForm(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(3px)' }}>
          <div style={{ width: '100%', maxWidth: 500, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 30px 80px rgba(196,30,58,0.2)', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 800 }}>💸 Record Branch Expense</div>
              <button onClick={() => setShowExpenseForm(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, overflowY: 'auto', flex: 1 }}>
              {/* CAS selector - required */}
              <div style={{ padding: 14, borderRadius: 10, border: '2px solid', borderColor: selectedCAS ? '#86efac' : '#fca5a5', background: selectedCAS ? '#f0fdf4' : '#fef2f2' }}>
                <label style={{ ...labelStyle, color: selectedCAS ? '#166534' : '#991b1b' }}>🔗 Link to Approved Branch CAS Request *</label>
                {casLoading ? (
                  <div style={{ fontSize: '0.82rem', color: '#64748b' }}>Loading approved CAS requests for your branch…</div>
                ) : approvedCAS.length === 0 ? (
                  <div style={{ fontSize: '0.82rem', color: '#b91c1c', fontWeight: 600 }}>
                    No approved CAS requests found. You must have a GM-approved Branch Expense Cash Advance (CAS) before recording an expense.
                    <div style={{ marginTop: 4, fontSize: '0.78rem', color: '#64748b', fontWeight: 400 }}>Submit a CAS request from the Staff tab → CAS Requests and wait for GM approval.</div>
                  </div>
                ) : (
                  <select value={selectedCAS ? (selectedCAS.id || '') : ''} onChange={e => {
                    const cas = approvedCAS.find(r => (r.id || r.staffId) === e.target.value) || null;
                    setSelectedCAS(cas);
                    if (cas) setExpenseForm(f => ({ ...f, description: f.description || cas.purpose || '' }));
                  }} style={{ ...inputStyle, borderColor: selectedCAS ? '#86efac' : '#d1d5db', background: selectedCAS ? '#f0fdf4' : '#fff' }}>
                    <option value="">— Select an approved CAS request —</option>
                    {approvedCAS.map(r => (
                      <option key={r.id || r.staffId} value={r.id || r.staffId}>
                        {r.saleNumber || r.requestNumber || r.request_number || r.id} · N${Math.round(Number(r.amount || 0)).toLocaleString("en-ZA")} · {r.purpose}
                      </option>
                    ))}
                  </select>
                )}
                {selectedCAS && (
                  <div style={{ marginTop: 8, fontSize: '0.78rem', color: '#166534' }}>
                    ✅ CAS: {selectedCAS.saleNumber || selectedCAS.requestNumber || selectedCAS.id} · N$ {Math.round(Number(selectedCAS.amount || 0)).toLocaleString("en-ZA")} · {selectedCAS.purpose}
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Expense Category *</label>
                  <select value={expenseForm.category} onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                    {['Supplies', 'Transport', 'Maintenance', 'Utilities', 'Marketing', 'Staff Welfare', 'Equipment', 'Cleaning', 'Communication', 'Other'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><label style={labelStyle}>Amount (N$) *</label><input type="number" min="1" value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))} style={inputStyle} placeholder="0.00" /></div>
              </div>
              <div><label style={labelStyle}>Description *</label><textarea value={expenseForm.description} onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Describe the expense…" style={{ ...inputStyle, resize: 'none' }} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={labelStyle}>Receipt / Ref #</label><input type="text" value={expenseForm.receipt_ref} onChange={e => setExpenseForm(f => ({ ...f, receipt_ref: e.target.value }))} style={inputStyle} placeholder="Receipt reference" /></div>
                <div><label style={labelStyle}>Date</label><input type="date" value={expenseForm.date} onChange={e => setExpenseForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} /></div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowExpenseForm(false)} style={{ flex: 1, padding: '11px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600 }}>Cancel</button>
                <button onClick={submitExpense} disabled={submitting || !selectedCAS || approvedCAS.length === 0} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', fontWeight: 800, cursor: (submitting || !selectedCAS) ? 'not-allowed' : 'pointer', opacity: (submitting || !selectedCAS) ? 0.65 : 1 }}>{submitting ? '⏳ Saving…' : '💸 Record Expense'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cash Drawer Modal */}
      {showDrawer && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowDrawer(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(3px)' }}>
          <div style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 30px 80px rgba(196,30,58,0.2)', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e3a5f,#0f2040)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 800 }}>💵 Cash Drawer</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.77rem', marginTop: 2 }}>Daily cash register — {new Date().toLocaleDateString('en-NA', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
              </div>
              <button onClick={() => setShowDrawer(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem' }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
              {/* Opening balance */}
              <div style={{ background: '#f4f7fb', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1e3a5f', textTransform: 'uppercase', letterSpacing: '.08em', display: 'block', marginBottom: 6 }}>Opening Balance (N$)</label>
                <input type="number" min="0" value={drawerOpening} onChange={e => setDrawerOpening(e.target.value)} placeholder="Enter opening cash amount…" style={{ width: '100%', padding: '10px 14px', border: '2px solid #c8d8e8', borderRadius: 9, fontSize: '1.05rem', fontWeight: 700, outline: 'none', boxSizing: 'border-box', textAlign: 'right' }} />
              </div>

              {/* Add entry */}
              <div style={{ border: '1.5px dashed #fecaca', borderRadius: 12, padding: '14px 16px', marginBottom: 16, background: '#fff8f8' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#c41e3a', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Add Cash Movement</div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <select value={drawerEntry.type} onChange={e => setDrawerEntry(d => ({ ...d, type: e.target.value }))} style={{ padding: '8px 12px', border: '1.5px solid #fecaca', borderRadius: 8, fontSize: '0.87rem', fontWeight: 700, color: drawerEntry.type === 'in' ? '#166534' : '#c41e3a', outline: 'none', background: drawerEntry.type === 'in' ? '#f0fdf4' : '#fff0f3' }}>
                    <option value="in">+ Cash In</option>
                    <option value="out">− Cash Out</option>
                  </select>
                  <input type="number" min="1" value={drawerEntry.amount} onChange={e => setDrawerEntry(d => ({ ...d, amount: e.target.value }))} placeholder="Amount" style={{ flex: 1, padding: '8px 12px', border: '1.5px solid #fecaca', borderRadius: 8, fontSize: '0.87rem', fontWeight: 700, outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="text" value={drawerEntry.description} onChange={e => setDrawerEntry(d => ({ ...d, description: e.target.value }))} placeholder="Description (e.g. Sale payment, Petty cash)" style={{ flex: 1, padding: '8px 12px', border: '1.5px solid #fecaca', borderRadius: 8, fontSize: '0.85rem', outline: 'none' }} />
                  <button onClick={addDrawerEntry} style={{ padding: '8px 16px', border: 'none', borderRadius: 8, background: '#c41e3a', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem' }}>+ Add</button>
                </div>
              </div>

              {/* Entries */}
              {drawerEntries.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Today's Movements</div>
                  {drawerEntries.map((e, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', background: e.type === 'in' ? '#f0fdf4' : '#fef2f2', borderRadius: 9, border: `1px solid ${e.type === 'in' ? '#86efac' : '#fca5a5'}`, marginBottom: 6 }}>
                      <div>
                        <span style={{ fontWeight: 700, color: e.type === 'in' ? '#166534' : '#c41e3a', fontSize: '0.85rem' }}>{e.type === 'in' ? '+' : '−'} N$ {Math.round(Number(e.amount)).toLocaleString("en-ZA")}</span>
                        <span style={{ marginLeft: 10, fontSize: '0.8rem', color: '#64748b' }}>{e.description || '—'}</span>
                      </div>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{e.time}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Balance summary */}
              <div style={{ background: 'linear-gradient(135deg,#1e3a5f,#0f2040)', borderRadius: 12, padding: '16px 20px', color: '#fff' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, textAlign: 'center' }}>
                  <div><div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', fontWeight: 700 }}>Opening</div><div style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: 4 }}>N$ {Math.round(Number(drawerOpening || 0)).toLocaleString("en-ZA")}</div></div>
                  <div><div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', fontWeight: 700 }}>Movements</div><div style={{ fontSize: '1.1rem', fontWeight: 800, marginTop: 4, color: drawerBalance - Number(drawerOpening || 0) >= 0 ? '#86efac' : '#fca5a5' }}>{drawerBalance - Number(drawerOpening || 0) >= 0 ? '+' : ''}N$ {Math.round(drawerBalance - Number(drawerOpening || 0)).toLocaleString('en-ZA')}</div></div>
                  <div><div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', fontWeight: 700 }}>Closing Balance</div><div style={{ fontSize: '1.3rem', fontWeight: 900, marginTop: 4, color: '#fbbf24' }}>N$ {Math.round(drawerBalance).toLocaleString("en-ZA")}</div></div>
                </div>
              </div>
            </div>
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
              <button onClick={() => setShowDrawer(false)} style={{ padding: '10px 28px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600 }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DistributorProfitTab() {
  const portalBranch = useContext(PortalBranchContext);
  const { user } = useAuth();
  const branchId = portalBranch || user?.branch || '';

  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [payingNb, setPayingNb] = useState(null);
  const [payForm, setPayForm] = useState({ payment_method: 'Cash', note: '' });
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [expandedNb, setExpandedNb] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [activeView, setActiveView] = useState('list');

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.branch.distributorProfitGroups({ branch_id: branchId });
      setGroups(res.groups || []);
    } catch { setGroups([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (branchId) load(); }, [branchId]);

  const totalPending = groups.reduce((s, g) => s + (g.pending || 0), 0);
  const totalPaid = groups.reduce((s, g) => s + (g.paid || 0), 0);

  const handlePayAll = async (nb) => {
    setPaySubmitting(true);
    try {
      await api.branch.payDistributorProfit(nb, branchId, {
        payment_method: payForm.payment_method,
        note: payForm.note,
        paid_by: user?.full_name || user?.username || 'branch',
      });
      setAlert({ type: 'success', msg: 'Payment recorded successfully' });
      setPayingNb(null);
      await load();
    } catch (e) {
      setAlert({ type: 'error', msg: e.message || 'Payment failed' });
    } finally { setPaySubmitting(false); }
  };

  const kpiCard = (label, value, sub, color) => (
    <div style={{ background: color, borderRadius: 14, padding: '18px 20px', color: '#fff', minWidth: 160, flex: 1 }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, opacity: 0.75, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1.55rem', fontWeight: 900 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', opacity: 0.8, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const filteredGroups = groups.filter(g => {
    const statusOk = filterStatus === 'all' || (filterStatus === 'pending' ? g.pending > 0 : g.paid > 0);
    const searchOk = !search.trim() || (g.distributor_name || '').toLowerCase().includes(search.toLowerCase()) || (g.distributor_nb || '').toLowerCase().includes(search.toLowerCase());
    return statusOk && searchOk;
  });

  const exportCSV = () => {
    const rows = [['Distributor NB', 'Distributor Name', 'Pending (N$)', 'Paid (N$)', 'Total (N$)', 'Sales Count']];
    groups.forEach(g => {
      rows.push([g.distributor_nb, g.distributor_name || '', g.pending.toFixed(2), g.paid.toFixed(2), (g.pending + g.paid).toFixed(2), g.entries?.length || 0]);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `distributor-profit-${branchId}-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    const branchLabel = (branchId || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const rows = groups.map(g => `
      <tr>
        <td>${g.distributor_nb}</td>
        <td>${g.distributor_name || '—'}</td>
        <td style="text-align:right;color:#c41e3a;font-weight:700">N$ ${g.pending.toFixed(2)}</td>
        <td style="text-align:right;color:#166534;font-weight:700">N$ ${g.paid.toFixed(2)}</td>
        <td style="text-align:right;font-weight:800">N$ ${(g.pending + g.paid).toFixed(2)}</td>
        <td style="text-align:center">${g.entries?.length || 0}</td>
        <td style="text-align:center"><span style="padding:2px 8px;border-radius:10px;background:${g.pending > 0 ? '#fee2e2' : '#dcfce7'};color:${g.pending > 0 ? '#c41e3a' : '#166534'};font-weight:700">${g.pending > 0 ? 'PENDING' : 'SETTLED'}</span></td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><title>Distributor Profit Report — ${branchLabel}</title><style>
      body{font-family:Arial,sans-serif;margin:24px;color:#1e293b}h1{color:#c41e3a;margin:0}h2{color:#374151;margin:4px 0 0}
      .meta{color:#94a3b8;font-size:13px;margin-bottom:20px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{background:#f8fafc;padding:9px 10px;text-align:left;border-bottom:2px solid #e2e8f0;font-weight:700;color:#374151}
      td{padding:8px 10px;border-bottom:1px solid #f1f5f9}
      .totals{margin-top:16px;display:flex;gap:20px}
      .kpi{background:#f8fafc;border-radius:8px;padding:12px 16px;flex:1}
      .kpi-label{font-size:11px;font-weight:700;text-transform:uppercase;color:#94a3b8;margin-bottom:4px}
      .kpi-val{font-size:1.4rem;font-weight:900}
    </style></head><body>
      <h1>💰 Distributor Profit Report</h1>
      <h2>${branchLabel}</h2>
      <div class="meta">Generated: ${new Date().toLocaleString('en-ZA')} · ${groups.length} distributor(s)</div>
      <div class="totals">
        <div class="kpi"><div class="kpi-label">Total Pending</div><div class="kpi-val" style="color:#c41e3a">N$ ${totalPending.toFixed(2)}</div></div>
        <div class="kpi"><div class="kpi-label">Total Paid</div><div class="kpi-val" style="color:#166534">N$ ${totalPaid.toFixed(2)}</div></div>
        <div class="kpi"><div class="kpi-label">Grand Total</div><div class="kpi-val">N$ ${(totalPending + totalPaid).toFixed(2)}</div></div>
      </div>
      <br/>
      <table><thead><tr><th>NB Number</th><th>Name</th><th style="text-align:right">Pending</th><th style="text-align:right">Paid</th><th style="text-align:right">Total</th><th style="text-align:center">Sales</th><th style="text-align:center">Status</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </body></html>`;
    const w = window.open('', '_blank'); w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400);
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading distributor profit data…</div>;

  return (
    <div style={{ padding: '20px 0' }}>
      {alert && (
        <div style={{ margin: '0 0 16px', padding: '10px 16px', borderRadius: 8, background: alert.type === 'success' ? '#f0fdf4' : '#fff1f2', border: `1px solid ${alert.type === 'success' ? '#86efac' : '#fca5a5'}`, color: alert.type === 'success' ? '#166534' : '#991b1b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{alert.msg}</span>
          <button onClick={() => setAlert(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'inherit' }}>×</button>
        </div>
      )}

      {/* KPI Row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {kpiCard('Pending Payout', formatCurrency(totalPending), `${groups.filter(g => g.pending > 0).length} distributor(s)`, '#c41e3a')}
        {kpiCard('Total Paid Out', formatCurrency(totalPaid), `${groups.filter(g => g.paid > 0).length} distributor(s)`, '#166534')}
        {kpiCard('Total Profit Generated', formatCurrency(totalPending + totalPaid), `${groups.length} distributor(s)`, '#1e40af')}
      </div>

      {/* Info Note */}
      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', fontSize: '0.78rem', color: '#92400e', marginBottom: 18 }}>
        💡 Distributor profit = CP − DP earned by the referring distributor on each non-member walk-in sale. Pending amounts need to be paid out to distributors.
      </div>

      {/* View Toggle + Export Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[{ id: 'list', label: '📋 Payout List' }, { id: 'report', label: '📊 Profit Report' }].map(v => (
          <button key={v.id} onClick={() => setActiveView(v.id)}
            style={{ padding: '6px 16px', borderRadius: 20, border: '1.5px solid', borderColor: activeView === v.id ? '#c41e3a' : '#e2e8f0', background: activeView === v.id ? '#c41e3a' : '#fff', color: activeView === v.id ? '#fff' : '#374151', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
            {v.label}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={exportCSV} style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #16a34a', background: '#f0fdf4', color: '#166534', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
            ⬇ Export CSV
          </button>
          <button onClick={printReport} style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #1d4ed8', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer' }}>
            🖨 Print Report
          </button>
        </div>
      </div>

      {/* Report View */}
      {activeView === 'report' && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #e2e8f0', overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ background: 'linear-gradient(135deg,#1e293b,#334155)', color: '#fff', padding: '16px 20px' }}>
            <div style={{ fontSize: '1rem', fontWeight: 800 }}>📊 Distributor Profit Report</div>
            <div style={{ fontSize: '0.78rem', opacity: 0.75, marginTop: 2 }}>
              {(branchId || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} · Generated {new Date().toLocaleDateString('en-ZA', { day: '2-digit', month: 'long', year: 'numeric' })}
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, color: '#374151' }}>NB Number</th>
                  <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 700, color: '#374151' }}>Distributor Name</th>
                  <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 700, color: '#374151' }}>Sales</th>
                  <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 700, color: '#c41e3a' }}>Pending (N$)</th>
                  <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 700, color: '#166534' }}>Paid (N$)</th>
                  <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 700, color: '#1d4ed8' }}>Total (N$)</th>
                  <th style={{ textAlign: 'center', padding: '10px 14px', fontWeight: 700, color: '#374151' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(g => (
                  <tr key={g.distributor_nb} style={{ borderBottom: '1px solid #f1f5f9', background: g.pending > 0 ? '#fffbeb' : '#fff' }}>
                    <td style={{ padding: '9px 14px', fontFamily: 'monospace', color: '#374151', fontSize: '0.78rem' }}>{g.distributor_nb}</td>
                    <td style={{ padding: '9px 14px', fontWeight: 600, color: '#1e293b' }}>{g.distributor_name || '—'}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'center', color: '#64748b' }}>{g.entries?.length || 0}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 800, color: g.pending > 0 ? '#c41e3a' : '#94a3b8' }}>{formatCurrency(g.pending)}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 700, color: g.paid > 0 ? '#166534' : '#94a3b8' }}>{formatCurrency(g.paid)}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 800, color: '#1e293b' }}>{formatCurrency(g.pending + g.paid)}</td>
                    <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: g.pending > 0 ? '#fee2e2' : '#dcfce7', color: g.pending > 0 ? '#c41e3a' : '#166534' }}>
                        {g.pending > 0 ? '⏳ Pending' : '✅ Settled'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                  <td colSpan={3} style={{ padding: '10px 14px', fontWeight: 800, color: '#374151' }}>TOTALS ({groups.length} distributors)</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 900, color: '#c41e3a' }}>{formatCurrency(totalPending)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 900, color: '#166534' }}>{formatCurrency(totalPaid)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 900, color: '#1e293b' }}>{formatCurrency(totalPending + totalPaid)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* List View controls */}
      {activeView === 'list' && <>
      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search distributor name or NB number…"
          style={{ flex: 1, minWidth: 200, padding: '7px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: '0.85rem', outline: 'none' }}
        />
        {['all', 'pending', 'paid'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            style={{ padding: '5px 16px', borderRadius: 20, border: '1.5px solid', borderColor: filterStatus === s ? '#c41e3a' : '#e2e8f0', background: filterStatus === s ? '#c41e3a' : '#fff', color: filterStatus === s ? '#fff' : '#374151', fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer' }}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Distributor Groups */}
      {filteredGroups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>💰</div>
          <div style={{ fontWeight: 600 }}>No distributor profit entries yet</div>
          <div style={{ fontSize: '0.8rem', marginTop: 4 }}>Profit will appear here automatically when non-member walk-in sales are recorded.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredGroups.map(g => {
            const isExpanded = expandedNb === g.distributor_nb;
            const hasPending = g.pending > 0;
            return (
              <div key={g.distributor_nb} style={{ background: '#fff', border: '1.5px solid', borderColor: hasPending ? '#fca5a5' : '#d1fae5', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                {/* Header Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', gap: 12, flexWrap: 'wrap', cursor: 'pointer' }} onClick={() => setExpandedNb(isExpanded ? null : g.distributor_nb)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 20, background: hasPending ? '#fee2e2' : '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>
                      {hasPending ? '⏳' : '✅'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.95rem' }}>{g.distributor_name || g.distributor_nb}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{g.distributor_nb} · {g.entries?.length || 0} sale(s)</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexShrink: 0 }}>
                    {g.pending > 0 && <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>PENDING</div>
                      <div style={{ fontWeight: 800, color: '#c41e3a', fontSize: '1rem' }}>{formatCurrency(g.pending)}</div>
                    </div>}
                    {g.paid > 0 && <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>PAID</div>
                      <div style={{ fontWeight: 700, color: '#166534', fontSize: '1rem' }}>{formatCurrency(g.paid)}</div>
                    </div>}
                    {hasPending && (
                      <button onClick={e => { e.stopPropagation(); setPayingNb(g.distributor_nb); setPayForm({ payment_method: 'Cash', note: '' }); }}
                        style={{ padding: '7px 16px', borderRadius: 8, background: '#c41e3a', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                        Pay Out
                      </button>
                    )}
                    <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded Entry List */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #f1f5f9', padding: '12px 18px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <thead>
                        <tr style={{ color: '#94a3b8', borderBottom: '1px solid #f1f5f9' }}>
                          <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>Receipt</th>
                          <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>Date</th>
                          <th style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 600 }}>Profit</th>
                          <th style={{ textAlign: 'center', padding: '4px 6px', fontWeight: 600 }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(g.entries || []).map((e, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f8fafc' }}>
                            <td style={{ padding: '5px 6px', color: '#374151', fontFamily: 'monospace' }}>{e.sale_receipt || e.sale_id || '—'}</td>
                            <td style={{ padding: '5px 6px', color: '#64748b' }}>{e.sale_date ? new Date(e.sale_date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                            <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 700, color: e.status === 'paid' ? '#166534' : '#c41e3a' }}>{formatCurrency(Number(e.profit_amount))}</td>
                            <td style={{ padding: '5px 6px', textAlign: 'center' }}>
                              <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: e.status === 'paid' ? '#dcfce7' : '#fee2e2', color: e.status === 'paid' ? '#166534' : '#c41e3a' }}>
                                {e.status === 'paid' ? '✓ Paid' : '⏳ Pending'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pay Out Modal (inline) */}
                {payingNb === g.distributor_nb && (
                  <div style={{ borderTop: '1.5px solid #fca5a5', background: '#fff8f8', padding: '16px 18px' }}>
                    <div style={{ fontWeight: 700, color: '#c41e3a', marginBottom: 12 }}>Pay Out {formatCurrency(g.pending)} to {g.distributor_name || g.distributor_nb}</div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Payment Method</label>
                        <select value={payForm.payment_method} onChange={e => setPayForm(p => ({ ...p, payment_method: e.target.value }))}
                          style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1.5px solid #e2e8f0', fontSize: '0.85rem' }}>
                          {['Cash', 'EFT', 'Bank Transfer', 'Mobile Money'].map(m => <option key={m}>{m}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: 2, minWidth: 200 }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Note (optional)</label>
                        <input value={payForm.note} onChange={e => setPayForm(p => ({ ...p, note: e.target.value }))} placeholder="Payment reference or note"
                          style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1.5px solid #e2e8f0', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button onClick={() => handlePayAll(g.distributor_nb)} disabled={paySubmitting}
                        style={{ padding: '8px 20px', borderRadius: 8, background: '#166534', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', opacity: paySubmitting ? 0.6 : 1 }}>
                        {paySubmitting ? 'Processing…' : `Confirm Pay ${formatCurrency(g.pending)}`}
                      </button>
                      <button onClick={() => setPayingNb(null)}
                        style={{ padding: '8px 16px', borderRadius: 8, background: '#f1f5f9', color: '#374151', border: 'none', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </>}
    </div>
  );
}

function BranchPaymentsTab() {
  const portalBranch = useContext(PortalBranchContext);
  const { user } = useAuth();
  const branchId = portalBranch || user?.branch || '';

  const [allEntries, setAllEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ description: '', amount: '', category: 'General', payment_method: 'Cash', notes: '' });
  const [paymentForm, setPaymentForm] = useState({ client_name: '', amount: '', payment_method: 'Cash', reference: '', notes: '' });

  const EXPENSE_CATEGORIES = ['General', 'Stationery', 'Cleaning', 'Transport', 'Utilities', 'Maintenance', 'Staff Welfare', 'Other'];

  const load = async () => {
    setLoading(true);
    try {
      const [salesRes, bonusRes, expensesRes, paymentsRes] = await Promise.allSettled([
        api.branch.walkinSales(`branch=${encodeURIComponent(branchId)}&limit=300`),
        api.branch.bonusPayments({ branch: branchId }),
        api.branch.expenses({ branch: branchId, limit: 300 }),
        api.branch.payments({ branch: branchId }),
      ]);

      const entries = [];

      if (salesRes.status === 'fulfilled') {
        const sales = salesRes.value?.sales || [];
        sales.forEach(s => entries.push({
          id: s.id,
          type: 'sale',
          direction: 'in',
          date: s.sale_date || s.created_at,
          description: `Walk-in Sale — ${s.customer_name || s.customerName || 'Customer'}`,
          subtext: `${s.payment_method || s.paymentMethod || 'Cash'} · ${(s.items || []).length || '?'} item(s)`,
          amount: Number(s.total || s.totalAmount || 0),
          by: s.created_by || s.soldBy || '',
          reference: s.sale_number || s.saleNumber || '',
          raw: s,
        }));
      }

      if (bonusRes.status === 'fulfilled') {
        const paid = bonusRes.value?.paidHistory || [];
        paid.forEach(p => entries.push({
          id: p.id,
          type: 'bonus_payment',
          direction: 'out',
          date: p.paid_at,
          description: `Bonus Payment — ${p.distributor_name || ''}`,
          subtext: `NB: ${p.nb_number} · Period: ${p.period}`,
          amount: Number(p.amount || 0),
          by: p.recorded_by || '',
          reference: p.id,
          raw: p,
        }));
      }

      if (expensesRes.status === 'fulfilled') {
        const exps = expensesRes.value?.expenses || [];
        exps.forEach(e => {
          if (!branchId || e.branchId === branchId || e.branch_id === branchId) {
            entries.push({
              id: e.id,
              type: 'expense',
              direction: 'out',
              date: e.date || e.createdAt,
              description: e.description || 'Expense',
              subtext: `${e.category || 'General'} · ${e.paymentMethod || e.payment_method || 'Cash'}`,
              amount: Number(e.amount || 0),
              by: e.createdBy || e.created_by || '',
              reference: '',
              raw: e,
            });
          }
        });
      }

      if (paymentsRes.status === 'fulfilled') {
        const pays = paymentsRes.value?.payments || [];
        pays.forEach(p => entries.push({
          id: p.id,
          type: 'payment',
          direction: 'in',
          date: p.date || p.recordedAt,
          description: `Payment — ${p.clientName || p.client_name || 'Client'}`,
          subtext: `${p.method || p.payment_method || ''} · ${p.reference || ''}`.replace(/^ · | · $/, ''),
          amount: Number(p.amount || 0),
          by: p.recordedBy || p.recorded_by || '',
          reference: p.invoiceNumber || p.invoice_number || p.reference || '',
          raw: p,
        }));
      }

      entries.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setAllEntries(entries);
    } catch (err) {
      setAlert({ type: 'error', message: 'Failed to load payment data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [branchId]);

  const handleRecordExpense = async () => {
    if (!expenseForm.description.trim() || !expenseForm.amount || Number(expenseForm.amount) <= 0) return;
    setSubmitting(true);
    try {
      const exp2OfflineId = generateOfflineId();
      const exp2Payload = {
        branchId,
        description: expenseForm.description.trim(),
        amount: Number(expenseForm.amount),
        category: expenseForm.category,
        paymentMethod: expenseForm.payment_method,
        notes: expenseForm.notes.trim(),
        date: new Date().toISOString().slice(0, 10),
        offline_id: exp2OfflineId,
      };
      if (!navigator.onLine) {
        await enqueue({
          type: 'expense',
          url: '/api/branch/expenses',
          method: 'POST',
          body: exp2Payload,
          offlineId: exp2OfflineId,
          label: `Expense · ${expenseForm.category} · N$${expenseForm.amount}`,
        });
      } else {
        await api.branch.createExpense(exp2Payload);
      }
      setAlert({ type: 'success', message: navigator.onLine ? 'Expense recorded successfully.' : 'Expense saved offline — will sync when connected' });
      setExpenseForm({ description: '', amount: '', category: 'General', payment_method: 'Cash', notes: '' });
      setShowExpenseForm(false);
      load();
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to record expense' });
    } finally { setSubmitting(false); }
  };

  const handleRecordPayment = async () => {
    if (!paymentForm.client_name.trim() || !paymentForm.amount || Number(paymentForm.amount) <= 0) return;
    setSubmitting(true);
    try {
      await api.branch.createPayment({
        branchId,
        clientName: paymentForm.client_name.trim(),
        amount: Number(paymentForm.amount),
        method: paymentForm.payment_method,
        reference: paymentForm.reference.trim(),
        notes: paymentForm.notes.trim(),
        date: new Date().toISOString().slice(0, 10),
      });
      setAlert({ type: 'success', message: 'Payment recorded.' });
      setPaymentForm({ client_name: '', amount: '', payment_method: 'Cash', reference: '', notes: '' });
      setShowPaymentForm(false);
      load();
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to record payment' });
    } finally { setSubmitting(false); }
  };

  const TYPE_CONFIG = {
    sale:          { label: 'Walk-in Sale',     color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: '🛒' },
    bonus_payment: { label: 'Bonus Payment',    color: '#c41e3a', bg: '#fff0f0', border: '#fecaca', icon: '🎁' },
    expense:       { label: 'Expense',          color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: '📤' },
    payment:       { label: 'Payment Received', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', icon: '💳' },
  };

  const TYPE_TABS = [
    { key: 'all', label: 'All Transactions' },
    { key: 'sale', label: '🛒 Sales' },
    { key: 'bonus_payment', label: '🎁 Bonus Payments' },
    { key: 'expense', label: '📤 Expenses' },
    { key: 'payment', label: '💳 Payments' },
  ];

  const filtered = allEntries.filter(e => {
    if (typeFilter !== 'all' && e.type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!(e.description || '').toLowerCase().includes(q) && !(e.subtext || '').toLowerCase().includes(q) && !(e.reference || '').toLowerCase().includes(q) && !(e.by || '').toLowerCase().includes(q)) return false;
    }
    if (dateFrom && e.date && e.date.slice(0, 10) < dateFrom) return false;
    if (dateTo && e.date && e.date.slice(0, 10) > dateTo) return false;
    return true;
  });

  const totalSales = filtered.filter(e => e.type === 'sale').reduce((s, e) => s + e.amount, 0);
  const totalBonus = filtered.filter(e => e.type === 'bonus_payment').reduce((s, e) => s + e.amount, 0);
  const totalExpenses = filtered.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0);
  const totalPayments = filtered.filter(e => e.type === 'payment').reduce((s, e) => s + e.amount, 0);
  const totalIn = totalSales + totalPayments;
  const totalOut = totalBonus + totalExpenses;

  const countByType = (type) => allEntries.filter(e => e.type === type).length;

  if (loading && allEntries.length === 0) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-5" style={{ background: 'linear-gradient(135deg, #1e3a5f, #2980b9)' }}>
        <h3 className="text-white text-lg font-bold m-0">💳 Branch Payments Ledger</h3>
        <p className="text-white/75 text-sm mt-1 m-0">All money in and out — sales, bonus payouts, expenses, deposits</p>
      </div>

      {alert && <Alert type={alert.type} className="mb-2" onClose={() => setAlert(null)}>{alert.message}</Alert>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl p-4 bg-green-50 border border-green-200 text-center">
          <p className="text-xs text-green-600 uppercase font-semibold tracking-wide">Total In</p>
          <p className="text-xl font-black text-green-700">{formatCurrency(totalIn)}</p>
          <p className="text-xs text-green-500">{filtered.filter(e => e.direction === 'in').length} entries</p>
        </div>
        <div className="rounded-xl p-4 bg-red-50 border border-red-200 text-center">
          <p className="text-xs text-red-600 uppercase font-semibold tracking-wide">Total Out</p>
          <p className="text-xl font-black text-red-700">{formatCurrency(totalOut)}</p>
          <p className="text-xs text-red-500">{filtered.filter(e => e.direction === 'out').length} entries</p>
        </div>
        <div className="rounded-xl p-4 border text-center" style={{ background: '#f8fafc', borderColor: '#cbd5e1' }}>
          <p className="text-xs uppercase font-semibold tracking-wide" style={{ color: '#0f172a' }}>Net Cash</p>
          <p className="text-xl font-black" style={{ color: totalIn - totalOut >= 0 ? '#15803d' : '#b91c1c' }}>{formatCurrency(Math.abs(totalIn - totalOut))}</p>
          <p className="text-xs" style={{ color: totalIn - totalOut >= 0 ? '#16a34a' : '#c41e3a' }}>{totalIn - totalOut >= 0 ? '▲ surplus' : '▼ deficit'}</p>
        </div>
        <div className="rounded-xl p-4 bg-blue-50 border border-blue-200 text-center">
          <p className="text-xs text-blue-600 uppercase font-semibold tracking-wide">Transactions</p>
          <p className="text-xl font-black text-blue-700">{filtered.length}</p>
          <p className="text-xs text-blue-500">of {allEntries.length} total</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TYPE_TABS.map(tab => (
          <button key={tab.key} onClick={() => setTypeFilter(tab.key)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold border-none cursor-pointer transition-all"
            style={typeFilter === tab.key
              ? { background: '#1e3a5f', color: '#fff' }
              : { background: '#f1f5f9', color: '#374151' }}>
            {tab.label} {tab.key !== 'all' && <span className="ml-1 opacity-70">({countByType(tab.key)})</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 items-center bg-gray-50 rounded-xl p-3 border border-gray-200">
        <input type="text" placeholder="Search description, reference, by…" value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none" />
        <span className="text-gray-400 text-xs">to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none" />
        <button onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); setTypeFilter('all'); }}
          className="px-3 py-2 rounded-lg text-xs font-semibold border-none cursor-pointer bg-gray-200 text-gray-600">Clear</button>
        <button onClick={load} className="px-3 py-2 rounded-lg text-xs font-semibold border-none cursor-pointer text-white" style={{ background: '#2980b9' }}>🔄 Refresh</button>
        <button onClick={() => setShowExpenseForm(true)} className="px-3 py-2 rounded-lg text-xs font-semibold border-none cursor-pointer text-white" style={{ background: '#d97706' }}>📤 Record Expense</button>
        <button onClick={() => setShowPaymentForm(true)} className="px-3 py-2 rounded-lg text-xs font-semibold border-none cursor-pointer text-white" style={{ background: '#16a34a' }}>➕ Record Payment</button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
          <h4 className="font-bold text-gray-800 text-sm">Transaction Ledger</h4>
          <span className="text-xs text-gray-500">{filtered.length} records shown</span>
        </div>
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">💳</p>
            <p className="text-gray-500 font-medium">No transactions found</p>
            <p className="text-gray-400 text-xs mt-1">Try adjusting your filters or date range</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Reference</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">By</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Flow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(e => {
                  const cfg = TYPE_CONFIG[e.type] || TYPE_CONFIG.payment;
                  return (
                    <tr key={`${e.type}-${e.id}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">
                        {e.date ? new Date(e.date).toLocaleDateString('en-NA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800 text-sm leading-tight">{e.description}</p>
                        {e.subtext && <p className="text-xs text-gray-400 mt-0.5">{e.subtext}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-mono">{e.reference || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{e.by || '—'}</td>
                      <td className="px-4 py-3 text-right font-black text-base" style={{ color: e.direction === 'in' ? '#15803d' : '#b91c1c' }}>
                        {e.direction === 'in' ? '+' : '−'}{formatCurrency(e.amount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold"
                          style={e.direction === 'in' ? { background: '#dcfce7', color: '#166534' } : { background: '#fee2e2', color: '#991b1b' }}>
                          {e.direction === 'in' ? '▲ IN' : '▼ OUT'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-gray-300 bg-gray-50">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-right text-xs font-bold text-gray-600 uppercase tracking-wide">Totals for current filter</td>
                  <td className="px-4 py-3 text-right">
                    <div className="text-xs font-semibold text-green-700">+{formatCurrency(totalIn)}</div>
                    <div className="text-xs font-semibold text-red-700">−{formatCurrency(totalOut)}</div>
                    <div className="text-sm font-black border-t border-gray-300 mt-1 pt-1" style={{ color: totalIn - totalOut >= 0 ? '#15803d' : '#b91c1c' }}>
                      {totalIn - totalOut >= 0 ? '+' : '−'}{formatCurrency(Math.abs(totalIn - totalOut))}
                    </div>
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <Modal open={showExpenseForm} onClose={() => setShowExpenseForm(false)} title="📤 Record Expense" size="md">
        <div className="p-6 space-y-4">
          <Input label="Description" placeholder="What was purchased or paid for?" value={expenseForm.description} onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))} />
          <Input label="Amount (N$)" type="number" min="0.01" step="0.01" value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select value={expenseForm.category} onChange={e => setExpenseForm(f => ({ ...f, category: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none">
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Paid By</label>
              <select value={expenseForm.payment_method} onChange={e => setExpenseForm(f => ({ ...f, payment_method: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none">
                <option>Cash</option>
                <option>Card</option>
                <option>Bank Transfer</option>
                <option>Mobile</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea value={expenseForm.notes} onChange={e => setExpenseForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none resize-none" rows={2}
              placeholder="Receipt number, supplier, reason…" />
          </div>
          <div className="flex gap-3">
            <Button className="flex-1" variant="warning" onClick={handleRecordExpense} disabled={submitting}>
              {submitting ? 'Saving…' : '📤 Save Expense'}
            </Button>
            <Button variant="secondary" onClick={() => setShowExpenseForm(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      <Modal open={showPaymentForm} onClose={() => setShowPaymentForm(false)} title="💳 Record Payment Received" size="md">
        <div className="p-6 space-y-4">
          <Input label="Client / Payer Name" value={paymentForm.client_name} onChange={e => setPaymentForm(f => ({ ...f, client_name: e.target.value }))} />
          <Input label="Amount (N$)" type="number" min="0.01" step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
              <select value={paymentForm.payment_method} onChange={e => setPaymentForm(f => ({ ...f, payment_method: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none">
                <option>Cash</option>
                <option>Card</option>
                <option>Mobile</option>
                <option>Bank Transfer</option>
              </select>
            </div>
            <Input label="Reference / Invoice #" value={paymentForm.reference} onChange={e => setPaymentForm(f => ({ ...f, reference: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
            <textarea value={paymentForm.notes} onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none resize-none" rows={2}
              placeholder="Invoice details, reason for payment…" />
          </div>
          <div className="flex gap-3">
            <Button className="flex-1" variant="success" onClick={handleRecordPayment} disabled={submitting}>
              {submitting ? 'Saving…' : '💳 Save Payment'}
            </Button>
            <Button variant="secondary" onClick={() => setShowPaymentForm(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function parseOrderItems(raw) {
  try { return typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []); } catch { return []; }
}

function OrderItemsTable({ items, customerType }) {
  if (!items || items.length === 0) return <p className="text-xs text-gray-400 italic">No product details available.</p>;
  const isMember = customerType === 'member';
  const subtotal = items.reduce((s, i) => s + Number(i.unit_price || i.dp || i.cp || 0) * Number(i.quantity || 1), 0);
  return (
    <table className="w-full text-xs border-collapse mt-2">
      <thead>
        <tr style={{ background: '#f8fafc' }}>
          <th className="text-left py-1 px-2 border-b text-gray-500 font-semibold">Product</th>
          <th className="text-center py-1 px-2 border-b text-gray-500 font-semibold">Qty</th>
          <th className="text-right py-1 px-2 border-b text-gray-500 font-semibold">Unit Price</th>
          <th className="text-right py-1 px-2 border-b text-gray-500 font-semibold">BV</th>
          <th className="text-right py-1 px-2 border-b text-gray-500 font-semibold">Line Total</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, i) => {
          const qty = Number(item.quantity || 1);
          const price = Number(item.unit_price || (isMember ? item.dp : item.cp) || 0);
          const bv = Number(item.bv || 0);
          return (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'}>
              <td className="py-1 px-2 border-b font-medium text-gray-800">{item.product_name || item.name || item.description || '-'}</td>
              <td className="py-1 px-2 border-b text-center text-gray-700">{qty}</td>
              <td className="py-1 px-2 border-b text-right text-gray-700">{formatCurrency(price)}</td>
              <td className="py-1 px-2 border-b text-right text-blue-600">{(bv * qty).toFixed(1)}</td>
              <td className="py-1 px-2 border-b text-right font-bold text-green-700">{formatCurrency(price * qty)}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr style={{ background: '#fff8f8' }}>
          <td colSpan={4} className="py-1 px-2 border-t-2 font-bold text-right text-gray-700">Subtotal:</td>
          <td className="py-1 px-2 border-t-2 font-bold text-right text-green-800">{formatCurrency(subtotal)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function OrderPaymentModal({ order, onClose, onPaid }) {
  const [method, setMethod] = useState('cash');
  const [cashGiven, setCashGiven] = useState('');
  const [cardRef, setCardRef] = useState('');
  const [partialCash, setPartialCash] = useState('');
  const [partialCard, setPartialCard] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const total = Number(order.total_amount || order.total || 0);
  const cashChange = method === 'cash' ? Math.max(0, Number(cashGiven || 0) - total) : 0;
  const partialTotal = Number(partialCash || 0) + Number(partialCard || 0);
  const partialValid = Math.abs(partialTotal - total) < 0.01;

  const handlePay = async () => {
    setErr('');
    if (method === 'cash' && Number(cashGiven || 0) < total) { setErr(`Cash given must be at least ${formatCurrency(total)}`); return; }
    if (method === 'card' && !cardRef.trim()) { setErr('Please enter card/EFT reference number.'); return; }
    if (method === 'partial' && !partialValid) { setErr(`Partial amounts must total exactly ${formatCurrency(total)} (currently ${formatCurrency(partialTotal)})`); return; }
    setSaving(true);
    try {
      await api.orders.update(order.id, {
        payment_status: 'paid',
        payment_method: method === 'partial' ? `Cash N$${partialCash} + Card N$${partialCard}` : method,
        status: 'delivered',
      });
      onPaid(order.id, method);
      onClose();
    } catch (e) { setErr(e.message || 'Payment failed'); }
    finally { setSaving(false); }
  };

  const btnStyle = (m) => ({
    flex: 1, padding: '10px 8px', borderRadius: 8, border: method === m ? '2px solid #c41e3a' : '2px solid #e5e7eb',
    background: method === m ? '#fff5f5' : '#fff', fontWeight: 700, fontSize: '0.82rem',
    cursor: 'pointer', color: method === m ? '#c41e3a' : '#374151',
  });

  return (
    <Modal title={`💳 Process Payment — ${order.order_number || order.id}`} onClose={onClose}>
      <div className="p-5 space-y-4">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
          <div className="flex justify-between"><span className="text-gray-500">Customer</span><span className="font-semibold">{order.customer_name || '-'}</span></div>
          <div className="flex justify-between mt-1"><span className="text-gray-500">Type</span>
            <span className={`font-semibold ${order.customer_type === 'member' ? 'text-blue-600' : 'text-gray-700'}`}>
              {order.customer_type === 'member' ? '👤 Member (DP)' : '🚶 Non-Member (CP)'}
            </span>
          </div>
          {order.delivery_method && <div className="flex justify-between mt-1"><span className="text-gray-500">Delivery</span><span className="font-semibold capitalize">{order.delivery_method}</span></div>}
          {Number(order.delivery_fee) > 0 && <div className="flex justify-between mt-1"><span className="text-gray-500">Delivery Fee</span><span className="font-semibold">{formatCurrency(order.delivery_fee)}</span></div>}
          <div className="flex justify-between mt-2 pt-2 border-t border-gray-200">
            <span className="font-bold text-gray-700">TOTAL DUE</span>
            <span className="font-bold text-lg text-red-700">{formatCurrency(total)}</span>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Payment Method</p>
          <div className="flex gap-2">
            <button style={btnStyle('cash')} onClick={() => setMethod('cash')}>💵 Cash</button>
            <button style={btnStyle('card')} onClick={() => setMethod('card')}>💳 Card / EFT</button>
            <button style={btnStyle('partial')} onClick={() => setMethod('partial')}>⚖️ Partial</button>
          </div>
        </div>

        {method === 'cash' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Cash Given (N$)</label>
            <input type="number" min={total} step="0.01" value={cashGiven} onChange={e => setCashGiven(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" placeholder="0.00" />
            {Number(cashGiven) >= total && (
              <div className="bg-green-50 border border-green-200 rounded p-2 text-sm font-bold text-green-700">
                Change to give: {formatCurrency(cashChange)}
              </div>
            )}
          </div>
        )}

        {method === 'card' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Card / EFT Reference #</label>
            <input type="text" value={cardRef} onChange={e => setCardRef(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" placeholder="e.g. TXN123456" />
          </div>
        )}

        {method === 'partial' && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500">Cash + Card split must equal {formatCurrency(total)}</p>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Cash (N$)</label>
                <input type="number" min="0" step="0.01" value={partialCash} onChange={e => setPartialCash(e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Card / EFT (N$)</label>
                <input type="number" min="0" step="0.01" value={partialCard} onChange={e => setPartialCard(e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" />
              </div>
            </div>
            <div className={`text-xs font-bold ${partialValid ? 'text-green-700' : 'text-red-600'}`}>
              Total: {formatCurrency(partialTotal)} {partialValid ? '✓ Matches' : `(need ${formatCurrency(total - partialTotal)} more)`}
            </div>
          </div>
        )}

        {err && <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700">{err}</div>}

        <div className="flex gap-3 pt-1">
          <button onClick={handlePay} disabled={saving}
            className="flex-1 py-2.5 rounded-lg text-white font-bold text-sm disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#27ae60,#1e8449)' }}>
            {saving ? 'Processing…' : `✓ Confirm Payment ${formatCurrency(total)}`}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg border border-gray-300 text-gray-600 font-medium text-sm hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

function PendingMembershipsSection({ branch }) {
  const { user } = useAuth();
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [approving, setApproving] = useState(null);
  const [approveForm, setApproveForm] = useState({ payment_method: 'cash', payment_reference: '' });
  const [alert, setAlert] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/distributor-agreement?status=pending_payment${branch ? `&branch=${encodeURIComponent(branch)}` : ''}`);
      setRegistrations(res.agreements || []);
    } catch { setRegistrations([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [branch]);

  const handleApprove = async (agr) => {
    setAlert(null);
    try {
      const res = await api.patch('/distributor-agreement', {
        id: agr.id,
        payment_method: approveForm.payment_method,
        payment_reference: approveForm.payment_reference || null,
      });
      setAlert({ type: 'success', message: `✅ NB Number issued: ${res.nb_number} — ${res.distributor_name}` });
      setApproving(null);
      load();
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Approval failed' });
    }
  };

  const pending = registrations.filter(r => !r.nb_number || r.status === 'pending_payment');

  if (loading) return <div className="text-center py-4 text-gray-400 text-sm">Loading pending registrations…</div>;
  if (pending.length === 0) return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-5 text-center text-gray-400 text-sm">
      ✅ No pending membership registrations
    </div>
  );

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base font-bold text-amber-700">⏳ Pending Member Registrations</span>
        <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{pending.length}</span>
        <button onClick={load} className="ml-auto text-xs text-gray-400 hover:text-gray-600 cursor-pointer border-none bg-transparent">🔄 Refresh</button>
      </div>
      {alert && <Alert type={alert.type} className="mb-3">{alert.message}</Alert>}
      <div className="space-y-2">
        {pending.map(agr => {
          const isExp = expanded === agr.id;
          const isApp = approving === agr.id;
          return (
            <div key={agr.id} className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-800">{agr.first_name} {agr.last_name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-200 text-amber-800 font-semibold">Awaiting Payment</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold capitalize">{agr.kit_type} Kit</span>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                      <span>📅 {new Date(agr.created_at).toLocaleDateString('en-NA', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      <span>📞 {agr.contact_mobile}</span>
                      {agr.sponsor_id && <span>👤 Sponsor: {agr.sponsor_id}</span>}
                      <span className="font-mono text-gray-400">{agr.id}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 ml-2">
                    <button onClick={() => setExpanded(isExp ? null : agr.id)}
                      className="px-3 py-1.5 rounded-lg border border-amber-300 text-xs font-semibold text-amber-700 bg-white hover:bg-amber-50 cursor-pointer">
                      {isExp ? '▲ Hide' : '▼ Details'}
                    </button>
                    <button onClick={() => { setApproving(isApp ? null : agr.id); setAlert(null); }}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-white cursor-pointer border-none"
                      style={{ background: 'linear-gradient(135deg,#166534,#15803d)' }}>
                      ✅ Issue NB
                    </button>
                  </div>
                </div>

                {isExp && (
                  <div className="mt-3 border-t border-amber-200 pt-3 grid grid-cols-2 gap-2 text-xs text-gray-700">
                    {[
                      ['Full Name', `${agr.first_name} ${agr.middle_initial || ''} ${agr.last_name}`.trim()],
                      ['Mobile', agr.contact_mobile],
                      ['Branch', agr.processing_branch],
                      ['Kit Type', agr.kit_type],
                      ['Upline', agr.upline_id || '—'],
                      ['Sponsor', agr.sponsor_id || '—'],
                      ['Declaration Date', agr.declaration_date || '—'],
                      ['Submitted By', agr.created_by || '—'],
                    ].map(([k, v]) => (
                      <div key={k} className="bg-white rounded p-2 border border-amber-100">
                        <span className="text-gray-400 block">{k}</span>
                        <span className="font-semibold">{v}</span>
                      </div>
                    ))}
                  </div>
                )}

                {isApp && (
                  <div className="mt-3 border-t border-amber-200 pt-3 bg-white rounded-lg p-3 border border-green-200">
                    <p className="text-sm font-semibold text-green-800 mb-2">Confirm Payment & Issue NB Number</p>
                    <p className="text-xs text-gray-600 mb-3">
                      Confirm you have received <strong>N$ 1,200.00</strong> from <strong>{agr.first_name} {agr.last_name}</strong>. 
                      This will assign an NB number and deduct the {agr.kit_type} starter kit from stock.
                    </p>
                    <div className="flex gap-3 flex-wrap mb-3">
                      <div className="flex-1 min-w-[150px]">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method</label>
                        <select value={approveForm.payment_method}
                          onChange={e => setApproveForm(f => ({ ...f, payment_method: e.target.value }))}
                          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-300">
                          <option value="cash">Cash</option>
                          <option value="bank_transfer">Bank Transfer</option>
                          <option value="mobile_money">Mobile Money</option>
                          <option value="card">Card</option>
                          <option value="cheque">Cheque</option>
                        </select>
                      </div>
                      <div className="flex-1 min-w-[150px]">
                        <label className="block text-xs font-medium text-gray-600 mb-1">Reference / Receipt No.</label>
                        <input type="text" value={approveForm.payment_reference}
                          onChange={e => setApproveForm(f => ({ ...f, payment_reference: e.target.value }))}
                          placeholder="Optional"
                          className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-300" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleApprove(agr)}
                        className="flex-1 py-2 rounded-lg text-sm font-bold text-white cursor-pointer border-none"
                        style={{ background: 'linear-gradient(135deg,#166534,#15803d)' }}>
                        ✅ Confirm Payment & Issue NB Number
                      </button>
                      <button onClick={() => setApproving(null)}
                        className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 border border-gray-300 bg-white cursor-pointer hover:bg-gray-50">
                        Cancel
                      </button>
                    </div>
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

function OnlineOrdersTab() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [alert, setAlert] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [paymentOrder, setPaymentOrder] = useState(null);
  const [statusFilter, setStatusFilter] = useState('active');

  const loadOrders = async () => {
    setLoading(true);
    try {
      const d = await api.orders.list();
      const all = Array.isArray(d) ? d : d.orders || [];
      const branchOrders = user?.branch
        ? all.filter(o => (o.branch_id || o.branch || '').toLowerCase() === user.branch.toLowerCase()
            || (o.branch_name || '').toLowerCase().includes(user.branch.toLowerCase()))
        : all;
      setOrders(branchOrders);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadOrders(); }, []);

  const updateStatus = async (id, status) => {
    setUpdating(id);
    setAlert(null);
    try {
      await api.orders.update(id, { status });
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
      setAlert({ type: 'success', message: status === 'delivered' ? 'Order marked delivered.' : `Order status updated to ${status}.` });
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to update order' });
    } finally { setUpdating(null); }
  };

  const onPaid = (id, method) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, payment_status: 'paid', payment_method: method, status: 'delivered' } : o));
    setAlert({ type: 'success', message: 'Payment processed. Order marked as delivered.' });
  };

  const statusBadge = (status) => {
    const map = { pending: 'warning', processing: 'info', shipped: 'primary', delivered: 'success', completed: 'success', cancelled: 'danger' };
    return <Badge variant={map[status] || 'default'}>{status}</Badge>;
  };

  const payBadge = (ps) => {
    if (ps === 'paid') return <span className="text-xs font-bold text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">✓ Paid</span>;
    return <span className="text-xs font-bold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">⏳ Unpaid</span>;
  };

  if (loading && orders.length === 0) return <LoadingSpinner />;

  const filterMap = {
    active: orders.filter(o => ['pending','processing','shipped'].includes(o.status)),
    completed: orders.filter(o => ['delivered','completed'].includes(o.status)),
    cancelled: orders.filter(o => o.status === 'cancelled'),
    all: orders,
  };

  const displayed = filterMap[statusFilter] || orders;

  const stats = {
    pending: orders.filter(o => o.status === 'pending').length,
    processing: orders.filter(o => o.status === 'processing').length,
    delivered: orders.filter(o => ['delivered','completed'].includes(o.status)).length,
    unpaid: orders.filter(o => o.payment_status !== 'paid' && ['shipped','delivered'].includes(o.status)).length,
  };

  return (
    <div>
      <PendingMembershipsSection branch={user?.branch} />

      <div className="rounded-xl p-5 mb-5" style={{ background: 'linear-gradient(135deg, #1e3a5f, #2980b9)' }}>
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div>
            <h3 className="text-white text-lg font-bold m-0">🛍️ Online Orders{user?.branch ? ` — ${getBranchDisplayName(user.branch)}` : ''}</h3>
            <p className="text-white/75 text-sm mt-1 m-0">Full order details, product breakdown, and payment processing.</p>
          </div>
          <button onClick={loadOrders} className="px-4 py-2.5 rounded-lg text-white text-sm font-semibold cursor-pointer border-none" style={{ background: 'linear-gradient(135deg, #27ae60, #1e8449)' }}>🔄 Refresh</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {[['Pending',stats.pending,'#fbbf24'],['Processing',stats.processing,'#60a5fa'],['Delivered',stats.delivered,'#4ade80'],['Unpaid',stats.unpaid,'#f87171']].map(([l,v,c]) => (
            <div key={l} className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-white/70 text-xs mb-0.5">{l}</p>
              <p className="text-2xl font-bold" style={{ color: c }}>{v}</p>
            </div>
          ))}
        </div>
      </div>

      {alert && <Alert type={alert.type} className="mb-4">{alert.message}</Alert>}

      <div className="flex gap-2 mb-4 flex-wrap">
        {[['active','Active Orders'],['completed','Completed'],['cancelled','Cancelled'],['all','All']].map(([key,lbl]) => (
          <button key={key} onClick={() => setStatusFilter(key)}
            className="px-4 py-1.5 rounded-full text-sm font-semibold border cursor-pointer transition-all"
            style={{ background: statusFilter === key ? '#1e3a5f' : '#f1f5f9', color: statusFilter === key ? '#fff' : '#475569', borderColor: statusFilter === key ? '#1e3a5f' : '#e2e8f0' }}>
            {lbl} {key === 'active' && stats.pending + stats.processing > 0 && <span className="ml-1 bg-yellow-400 text-yellow-900 rounded-full px-1.5 text-xs">{stats.pending + stats.processing}</span>}
          </button>
        ))}
      </div>

      {displayed.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-white rounded-xl border border-gray-100">
          <p className="text-lg">📭 No {statusFilter === 'all' ? '' : statusFilter} orders</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayed.map(order => {
            const items = parseOrderItems(order.items);
            const isExpanded = expandedId === order.id;
            const totalBV = items.reduce((s, i) => s + Number(i.bv || 0) * Number(i.quantity || 1), 0);

            return (
              <div key={order.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                <div className="p-4">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-800">{order.order_number || order.id}</span>
                        {statusBadge(order.status)}
                        {payBadge(order.payment_status)}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${order.customer_type === 'member' ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-gray-50 text-gray-600 border border-gray-200'}`}>
                          {order.customer_type === 'member' ? '👤 Member (DP)' : '🚶 Non-Member (CP)'}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-gray-700 mt-1">{order.customer_name || '-'}</p>
                      <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
                        <span>📅 {formatDateTime(order.created_at)}</span>
                        {order.delivery_method && <span>🚚 {order.delivery_method}</span>}
                        {order.payment_method && <span>💳 {order.payment_method}</span>}
                        {order.distributor_code && order.distributor_code !== 'NB005676' && <span>🔗 Ref: {order.distributor_code}</span>}
                        <span>📦 {items.length} product{items.length !== 1 ? 's' : ''} · BV: {totalBV.toFixed(1)}</span>
                      </div>
                    </div>
                    <div className="text-right ml-3">
                      <p className="text-lg font-bold text-green-700">{formatCurrency(order.total_amount || order.total || 0)}</p>
                      {Number(order.delivery_fee) > 0 && <p className="text-xs text-gray-500">incl. delivery {formatCurrency(order.delivery_fee)}</p>}
                    </div>
                  </div>

                  <div className="flex gap-2 mt-3 flex-wrap">
                    <button onClick={() => setExpandedId(isExpanded ? null : order.id)}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer">
                      {isExpanded ? '▲ Hide Products' : `▼ Show Products (${items.length})`}
                    </button>
                    {order.status === 'pending' && (
                      <button onClick={() => updateStatus(order.id, 'processing')} disabled={updating === order.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white cursor-pointer border-none"
                        style={{ background: '#d97706' }}>⚙️ Process</button>
                    )}
                    {order.status === 'processing' && (
                      <button onClick={() => updateStatus(order.id, 'shipped')} disabled={updating === order.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white cursor-pointer border-none"
                        style={{ background: '#2563eb' }}>🚚 Ship</button>
                    )}
                    {order.status === 'shipped' && order.payment_status !== 'paid' && (
                      <button onClick={() => setPaymentOrder(order)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white cursor-pointer border-none"
                        style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)' }}>💳 Process Payment</button>
                    )}
                    {order.status === 'shipped' && order.payment_status === 'paid' && (
                      <button onClick={() => updateStatus(order.id, 'delivered')} disabled={updating === order.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white cursor-pointer border-none"
                        style={{ background: '#16a34a' }}>✓ Mark Delivered</button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/60">
                    <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Order Items — Price shown is {order.customer_type === 'member' ? 'Distributor Price (DP)' : 'Consumer Price (CP)'}</p>
                    <OrderItemsTable items={items} customerType={order.customer_type} />
                    {order.notes && <p className="text-xs text-gray-500 mt-2"><strong>Notes:</strong> {order.notes}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {paymentOrder && (
        <OrderPaymentModal
          order={paymentOrder}
          onClose={() => setPaymentOrder(null)}
          onPaid={onPaid}
        />
      )}
    </div>
  );
}

function printBonusPaymentReceipt({ payment_id, nb_number, distributor_name, period, amount, paid_at, branch_id, recorded_by, notes }) {
  const branchLabel = (branch_id || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const dateStr = paid_at ? new Date(paid_at).toLocaleDateString('en-NA', { day: '2-digit', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('en-NA', { day: '2-digit', month: 'long', year: 'numeric' });
  const amtStr = `N$ ${Math.round(Number(amount)).toLocaleString("en-ZA").replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  const win = window.open('', '_blank', 'width=420,height=620');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bonus Receipt</title><style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Courier New',monospace;font-size:12px;color:#1e293b;background:#fff;padding:0}
    .wrap{width:320px;margin:0 auto;padding:18px 14px}
    .logo{text-align:center;margin-bottom:8px}
    .co{font-size:13px;font-weight:900;color:#c41e3a;letter-spacing:0.5px}
    .sub{font-size:9px;color:#64748b;margin-top:1px}
    .title{text-align:center;font-size:11px;font-weight:700;border-top:2px dashed #cbd5e1;border-bottom:2px dashed #cbd5e1;padding:6px 0;margin:10px 0;letter-spacing:1px;color:#1e40af}
    .row{display:flex;justify-content:space-between;padding:3px 0;font-size:11px}
    .row.bold{font-weight:700}
    .label{color:#64748b}
    .val{font-weight:600;text-align:right;max-width:190px;word-break:break-word}
    .divider{border-top:1px dashed #cbd5e1;margin:8px 0}
    .amount-box{background:#f0fdf4;border:2px solid #22c55e;border-radius:8px;padding:10px;text-align:center;margin:12px 0}
    .amount-lbl{font-size:9px;color:#16a34a;font-weight:700;letter-spacing:1px;text-transform:uppercase}
    .amount-val{font-size:22px;font-weight:900;color:#15803d;margin-top:2px}
    .stamp{text-align:center;margin-top:16px;padding:8px;border:2px solid #22c55e;border-radius:8px;background:#f0fdf4}
    .stamp-text{font-size:14px;font-weight:900;color:#15803d;letter-spacing:2px}
    .sig{margin-top:20px;border-top:1px solid #1e293b;padding-top:4px;font-size:9px;color:#64748b;text-align:center}
    .footer{text-align:center;font-size:9px;color:#94a3b8;margin-top:14px;border-top:1px dashed #cbd5e1;padding-top:8px}
    .print-btn{display:block;width:100%;margin-top:14px;padding:10px;background:#c41e3a;color:#fff;border:none;border-radius:6px;font-weight:700;font-size:13px;cursor:pointer}
    @media print{.print-btn{display:none}body{padding:0}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body>
  <div class="wrap">
    <div class="logo">
      <div class="co">DYNAPHARM INTERNATIONAL</div>
      <div class="co" style="font-size:11px">NAMIBIA</div>
      <div class="sub">Bonus Payment Receipt</div>
    </div>
    <div class="title">✓ BONUS PAYMENT RECEIPT</div>
    <div class="row"><span class="label">Receipt #</span><span class="val">${payment_id}</span></div>
    <div class="row"><span class="label">Date</span><span class="val">${dateStr}</span></div>
    <div class="row"><span class="label">Branch</span><span class="val">${branchLabel}</span></div>
    <div class="divider"></div>
    <div class="row bold"><span class="label">NB Number</span><span class="val">${nb_number}</span></div>
    <div class="row bold"><span class="label">Distributor</span><span class="val">${distributor_name}</span></div>
    <div class="row"><span class="label">Bonus Period</span><span class="val">${period}</span></div>
    <div class="amount-box">
      <div class="amount-lbl">Total Amount Paid</div>
      <div class="amount-val">${amtStr}</div>
    </div>
    <div class="divider"></div>
    <div class="row"><span class="label">Recorded By</span><span class="val">${recorded_by || '—'}</span></div>
    ${notes ? `<div class="row"><span class="label">Notes</span><span class="val">${notes}</span></div>` : ''}
    <div class="stamp">
      <div class="stamp-text">✓ PAID IN FULL</div>
    </div>
    <div class="sig">Distributor Signature: ___________________________</div>
    <div class="sig" style="margin-top:10px">Authorised By: ___________________________</div>
    <div class="footer">This is an official Dynapharm bonus payment record.<br>Keep this receipt for your records.</div>
    <button class="print-btn" onclick="window.print();setTimeout(()=>window.close(),500)">🖨️ Print Receipt</button>
  </div></body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

function BonusTab() {
  const portalBranch = useContext(PortalBranchContext);
  const { user } = useAuth();
  const branchId = portalBranch || user?.branch || '';
  const [pendingBonuses, setPendingBonuses] = useState([]);
  const [paidHistory, setPaidHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedBonus, setSelectedBonus] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [payNotes, setPayNotes] = useState('');
  const [bonusSearch, setBonusSearch] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.branch.bonusPayments({ branch: branchId });
      setPendingBonuses(result.bonuses || []);
      setPaidHistory(result.paidHistory || []);
    } catch (err) {
      setAlert({ type: 'error', message: 'Failed to load bonus data: ' + (err.message || '') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [branchId]);

  const openConfirm = (bonus) => {
    setSelectedBonus(bonus);
    setPayNotes('');
    setShowConfirm(true);
  };

  const handleProcessPayment = async () => {
    if (!selectedBonus) return;
    setSubmitting(true);
    try {
      const result = await api.branch.recordBonusPayment({
        bonus_id: selectedBonus.id,
        branch_id: branchId,
        paid_at: new Date().toISOString().slice(0, 10),
        notes: payNotes,
      });
      setShowConfirm(false);
      setSelectedBonus(null);
      setAlert({ type: 'success', message: `✅ Bonus of ${formatCurrency(result.amount_paid)} paid to ${result.receipt?.distributor_name || ''}. Printing receipt…` });
      load();
      if (result.receipt) {
        setTimeout(() => printBonusPaymentReceipt({ ...result.receipt, branch_id: branchId }), 300);
      }
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to process payment' });
    } finally {
      setSubmitting(false);
    }
  };

  const reprintFromHistory = (p) => {
    printBonusPaymentReceipt({
      payment_id: p.id,
      nb_number: p.nb_number,
      distributor_name: p.distributor_name,
      period: p.period,
      amount: p.amount,
      paid_at: p.paid_at,
      branch_id: p.branch_id || branchId,
      recorded_by: p.recorded_by,
      notes: p.notes,
    });
  };

  const filtered = pendingBonuses.filter(b => {
    const q = bonusSearch.toLowerCase();
    const matchSearch = !bonusSearch || (b.distributor_name || '').toLowerCase().includes(q) || (b.nb_number || '').toLowerCase().includes(q);
    const matchPeriod = !filterPeriod || (b.period || '') === filterPeriod;
    return matchSearch && matchPeriod;
  });

  const allPeriods = [...new Set([...pendingBonuses, ...paidHistory].map(b => b.period).filter(Boolean))].sort().reverse();
  const totalOutstanding = filtered.reduce((s, b) => s + Math.max(0, Number(b.amount_earned) - Number(b.amount_paid)), 0);
  const totalPaidThisBranch = paidHistory.reduce((s, p) => s + Number(p.amount || 0), 0);

  if (loading && pendingBonuses.length === 0 && paidHistory.length === 0) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-5" style={{ background: 'linear-gradient(135deg, #1e3a5f, #2980b9)' }}>
        <h3 className="text-white text-lg font-bold m-0">🎁 Distributor Bonus Payments</h3>
        <p className="text-white/75 text-sm mt-1 m-0">Process cash bonus payments to distributors. Each bonus can only be paid once across all branches.</p>
      </div>

      {alert && <Alert type={alert.type} className="mb-4" onClose={() => setAlert(null)}>{alert.message}</Alert>}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="rounded-xl p-4 bg-orange-50 border border-orange-200 text-center">
          <p className="text-xs text-orange-600 uppercase tracking-wide font-semibold">Pending Payouts</p>
          <p className="text-2xl font-bold text-orange-700">{filtered.length}</p>
          <p className="text-xs text-orange-500">{formatCurrency(totalOutstanding)} outstanding</p>
        </div>
        <div className="rounded-xl p-4 bg-green-50 border border-green-200 text-center">
          <p className="text-xs text-green-600 uppercase tracking-wide font-semibold">Paid By This Branch</p>
          <p className="text-2xl font-bold text-green-700">{paidHistory.length}</p>
          <p className="text-xs text-green-500">{formatCurrency(totalPaidThisBranch)} total paid</p>
        </div>
        <div className="rounded-xl p-4 bg-blue-50 border border-blue-200 text-center">
          <p className="text-xs text-blue-600 uppercase tracking-wide font-semibold">Bonus Periods</p>
          <p className="text-2xl font-bold text-blue-700">{allPeriods.length}</p>
          <p className="text-xs text-blue-500">{allPeriods[0] || '—'} latest</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <input type="text" placeholder="Search NB/DZ or Name..." value={bonusSearch} onChange={e => setBonusSearch(e.target.value)}
          className="flex-1 min-w-[200px] px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-200" />
        <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none">
          <option value="">All Periods</option>
          {allPeriods.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <Button size="sm" variant="secondary" onClick={load}>🔄 Refresh</Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-orange-50 border-b border-orange-200 flex items-center justify-between">
          <div>
            <h4 className="font-bold text-gray-800">Pending Bonus Payouts</h4>
            <p className="text-xs text-gray-500">Distributors awaiting payment — any branch can process</p>
          </div>
          <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-1 rounded-full">{filtered.length} pending</span>
        </div>
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">🎁</p>
            <p className="text-gray-500 font-medium">No pending bonuses</p>
            <p className="text-gray-400 text-xs mt-1">Finance uploads bonus records each month from the Finance Portal</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">NB Number</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Distributor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Period</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount to Pay</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(b => {
                  const outstanding = Math.max(0, Number(b.amount_earned) - Number(b.amount_paid));
                  return (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono font-bold text-primary text-sm">{b.nb_number}</td>
                      <td className="px-4 py-3 font-medium">{b.distributor_name}</td>
                      <td className="px-4 py-3 text-gray-600">{b.period}</td>
                      <td className="px-4 py-3 text-right font-bold text-orange-600 text-base">{formatCurrency(outstanding)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => openConfirm(b)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white border-none cursor-pointer"
                            style={{ background: 'linear-gradient(135deg,#16a34a,#15803d)' }}
                          >
                            💳 Process Payment
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {paidHistory.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-green-50 border-b border-green-200 flex items-center justify-between">
            <div>
              <h4 className="font-bold text-gray-800">✅ Bonus Payments Made by This Branch</h4>
              <p className="text-xs text-gray-500">All distributor bonuses processed here — click Print to reprint receipts</p>
            </div>
            <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full">{paidHistory.length} paid</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">NB Number</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Distributor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Period</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Amount Paid</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Recorded By</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paidHistory.map(p => (
                  <tr key={p.id} className="hover:bg-green-50">
                    <td className="px-4 py-3 font-mono text-primary text-sm font-bold">{p.nb_number}</td>
                    <td className="px-4 py-3 font-medium">{p.distributor_name}</td>
                    <td className="px-4 py-3 text-gray-600">{p.period}</td>
                    <td className="px-4 py-3 text-right font-bold text-green-700">{formatCurrency(p.amount)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDate(p.paid_at)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{p.recorded_by || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => reprintFromHistory(p)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold border-none cursor-pointer"
                        style={{ background: '#f1f5f9', color: '#374151' }}
                      >
                        🖨️ Print Receipt
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={showConfirm} onClose={() => { setShowConfirm(false); setSelectedBonus(null); }} title="Process Bonus Payment" size="md">
        {selectedBonus && (
          <div className="p-6 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 font-medium">
              ⚠️ This payment will be recorded as PAID IN FULL and marked across all branches. This action cannot be undone.
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-blue-600 font-medium">Distributor</span>
                <span className="font-bold text-blue-900">{selectedBonus.distributor_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-blue-600 font-medium">NB Number</span>
                <span className="font-mono font-bold text-blue-900">{selectedBonus.nb_number}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-blue-600 font-medium">Bonus Period</span>
                <span className="font-bold text-blue-900">{selectedBonus.period}</span>
              </div>
              <div className="border-t border-blue-200 pt-2 flex justify-between">
                <span className="text-blue-600 font-medium">Amount to Pay</span>
                <span className="text-xl font-black text-green-700">{formatCurrency(Math.max(0, Number(selectedBonus.amount_earned) - Number(selectedBonus.amount_paid)))}</span>
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Notes / Remarks (optional)</label>
              <textarea value={payNotes} onChange={e => setPayNotes(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none resize-none" rows={2}
                placeholder="ID verified, receipt number, any notes…" />
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
              📄 A receipt will be printed automatically after processing.
            </div>
            <div className="flex gap-3">
              <button
                className="flex-1 py-3 rounded-lg text-white font-bold text-sm border-none cursor-pointer disabled:opacity-50"
                style={{ background: submitting ? '#94a3b8' : 'linear-gradient(135deg,#16a34a,#15803d)' }}
                onClick={handleProcessPayment}
                disabled={submitting}
              >
                {submitting ? '⏳ Processing…' : `💳 Confirm & Pay ${formatCurrency(Math.max(0, Number(selectedBonus.amount_earned) - Number(selectedBonus.amount_paid)))}`}
              </button>
              <Button variant="secondary" onClick={() => { setShowConfirm(false); setSelectedBonus(null); }}>Cancel</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function CommunicationTab() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);
  const [commFilter, setCommFilter] = useState('all');
  const [recipients, setRecipients] = useState({ hr: false, gm: false, director: false, finance: false, frontdesk: false, mis: false });
  const [commMessage, setCommMessage] = useState('');

  useEffect(() => {
    api.notifications.list()
      .then(d => setAnnouncements(Array.isArray(d) ? d : d.notifications || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    const selectedRecipients = Object.entries(recipients).filter(([,v]) => v).map(([k]) => k);
    if (!commMessage.trim() || selectedRecipients.length === 0) return;
    setSubmitting(true);
    try {
      await api.notifications.create({
        title: 'Staff Communication',
        message: commMessage.trim(),
        type: 'communication',
        target: 'branch',
        recipients: selectedRecipients,
      });
      setAlert({ type: 'success', message: 'Communication sent successfully' });
      setCommMessage('');
      setRecipients({ hr: false, gm: false, director: false, finance: false, frontdesk: false, mis: false });
      const res = await api.notifications.list().catch(() => ({ notifications: [] }));
      setAnnouncements(Array.isArray(res) ? res : res.notifications || []);
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to send communication' });
    } finally {
      setSubmitting(false);
    }
  };

  const filterTabs = [
    { key: 'all', label: 'All' },
    { key: 'hr', label: '👥 HR' },
    { key: 'gm', label: '👔 GM' },
    { key: 'director', label: '🎯 Director' },
    { key: 'finance', label: '💰 Finance' },
    { key: 'frontdesk', label: '🖥️ Front Desk' },
    { key: 'mis', label: '📊 MIS' },
  ];

  const filteredAnnouncements = commFilter === 'all'
    ? announcements
    : announcements.filter(a => (a.target || a.type || '').toLowerCase().includes(commFilter));

  if (loading && announcements.length === 0) return <LoadingSpinner />;

  return (
    <div>
      <div className="rounded-xl p-5 mb-5" style={{ background: 'linear-gradient(135deg, #1e3a5f, #2980b9)' }}>
        <h3 className="text-white text-lg font-bold m-0">💬 Staff Communications</h3>
        <p className="text-white/75 text-sm mt-1 m-0">Review messages from HR, GM, Director, Finance, Front Desk and MIS, then send updates back to them.</p>
      </div>

      {alert && <Alert type={alert.type} className="mb-4">{alert.message}</Alert>}

      <div className="flex gap-2 mb-4 flex-wrap" style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
        {filterTabs.map(t => (
          <button key={t.key} onClick={() => setCommFilter(t.key)} className="px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer border-none transition-colors" style={commFilter === t.key ? { background: 'linear-gradient(135deg, #3498db, #2980b9)', color: 'white' } : { background: '#e2e8f0', color: '#4a5568' }}>{t.label}</button>
        ))}
      </div>

      <div style={{ maxHeight: '300px', overflowY: 'auto', background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '20px' }}>
        {filteredAnnouncements.length === 0 ? (
          <p className="text-center py-5" style={{ color: '#7f8c8d' }}>No messages</p>
        ) : (
          <div className="space-y-3">
            {filteredAnnouncements.map((a, i) => (
              <div key={a.id || i} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex justify-between items-start">
                  <h4 className="font-semibold text-gray-800 text-sm">{a.title}</h4>
                  <span className="text-xs text-gray-400">{formatDateTime(a.created_at)}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1">{a.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2" style={{ color: '#c41e3a' }}>Choose recipients</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {[
              { key: 'hr', label: '👥 HR' },
              { key: 'gm', label: '👔 GM' },
              { key: 'director', label: '🎯 Director' },
              { key: 'finance', label: '💰 Finance' },
              { key: 'frontdesk', label: '🖥️ Front Desk' },
              { key: 'mis', label: '📊 MIS' },
            ].map(r => (
              <label key={r.key} className="flex items-center gap-2 text-sm cursor-pointer p-1.5 rounded hover:bg-gray-50">
                <input type="checkbox" checked={recipients[r.key]} onChange={e => setRecipients({ ...recipients, [r.key]: e.target.checked })} className="w-4 h-4" />
                {r.label}
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={() => setRecipients({ hr: true, gm: true, director: true, finance: true, frontdesk: true, mis: true })} className="px-3 py-1 rounded text-xs font-semibold cursor-pointer border-none" style={{ background: 'linear-gradient(135deg, #3498db, #2471a3)', color: 'white' }}>Select All</button>
            <button type="button" onClick={() => setRecipients({ hr: false, gm: false, director: false, finance: false, frontdesk: false, mis: false })} className="px-3 py-1 rounded text-xs font-semibold cursor-pointer border-none bg-gray-200 text-gray-600">Clear</button>
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-semibold text-gray-700 mb-2" style={{ color: '#c41e3a' }}>Message</label>
          <textarea value={commMessage} onChange={e => setCommMessage(e.target.value)} rows={4} placeholder="Type your update or request..." required className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 resize-vertical" />
        </div>
        <div className="flex gap-3 flex-wrap">
          <button type="submit" disabled={submitting} className="px-5 py-2.5 rounded-lg text-white text-sm font-semibold cursor-pointer border-none" style={{ background: 'linear-gradient(135deg, #27ae60, #1e8449)' }}>{submitting ? 'Sending...' : 'Send Communication'}</button>
          <button type="button" onClick={() => { setCommMessage(''); setRecipients({ hr: false, gm: false, director: false, finance: false, frontdesk: false, mis: false }); }} className="px-5 py-2.5 rounded-lg text-sm font-semibold cursor-pointer border-none bg-gray-200 text-gray-600">Clear</button>
        </div>
      </form>
    </div>
  );
}

function StaffTab() {
  const { user } = useAuth();
  const [alert, setAlert] = useState(null);
  const [staffSubTab, setStaffSubTab] = useState('leave');

  // Leave state
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveLoading, setLeaveLoading] = useState(true);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ type: 'Annual', startDate: '', endDate: '', reason: '', urgent: false });

  // CAS (Branch Expense Cash Advance) state
  const [cashRequests, setCashRequests] = useState([]);
  const [cashLoading, setCashLoading] = useState(true);
  const [showCashForm, setShowCashForm] = useState(false);
  const [cashSubmitting, setCashSubmitting] = useState(false);
  const [cashForm, setCashForm] = useState({ amount: '', expenseCategory: 'Office Supplies', purpose: '', neededBy: '' });

  useEffect(() => {
    api.get('/leave-requests').then(d => setLeaveRequests(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setLeaveLoading(false));
    api.get('/cash-requests').then(d => setCashRequests(Array.isArray(d) ? d : [])).catch(() => {}).finally(() => setCashLoading(false));
  }, []);

  const refreshLeave = () => api.get('/leave-requests').then(d => setLeaveRequests(Array.isArray(d) ? d : [])).catch(() => {});
  const refreshCash = () => api.get('/cash-requests').then(d => setCashRequests(Array.isArray(d) ? d : [])).catch(() => {});

  const submitLeave = async () => {
    if (!leaveForm.startDate || !leaveForm.endDate || !leaveForm.reason.trim()) {
      setAlert({ type: 'error', message: 'Please fill in all required fields' }); return;
    }
    setLeaveSubmitting(true);
    try {
      await api.post('/leave-requests', { type: leaveForm.type, startDate: leaveForm.startDate, endDate: leaveForm.endDate, reason: leaveForm.reason, urgent: leaveForm.urgent });
      setAlert({ type: 'success', message: 'Leave request submitted successfully' });
      setLeaveForm({ type: 'Annual', startDate: '', endDate: '', reason: '', urgent: false });
      setShowLeaveForm(false);
      await refreshLeave();
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to submit leave request' });
    } finally { setLeaveSubmitting(false); }
  };

  const submitCash = async () => {
    if (!cashForm.amount || Number(cashForm.amount) <= 0 || !cashForm.purpose.trim()) {
      setAlert({ type: 'error', message: 'Please enter a valid amount and expense description' }); return;
    }
    setCashSubmitting(true);
    try {
      await api.post('/cash-requests', { amount: Number(cashForm.amount), purpose: cashForm.purpose, neededBy: cashForm.neededBy, expenseCategory: cashForm.expenseCategory });
      setAlert({ type: 'success', message: 'Branch expense cash advance (CAS) submitted — awaiting Finance review.' });
      setCashForm({ amount: '', expenseCategory: 'Office Supplies', purpose: '', neededBy: '' });
      setShowCashForm(false);
      await refreshCash();
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to submit CAS request' });
    } finally { setCashSubmitting(false); }
  };

  const leaveTypeColor = (t) => ({ Annual: '#166534', Sick: '#9a3412', Emergency: '#7c2d12', Unpaid: '#374151' }[t] || '#374151');
  const statusBadge = (s) => {
    const colors = { Pending: { bg: '#fffbeb', color: '#92400e', border: '#fcd34d' }, Approved: { bg: '#f0fdf4', color: '#166534', border: '#86efac' }, Rejected: { bg: '#fef2f2', color: '#991b1b', border: '#fca5a5' } };
    const c = colors[s] || colors.Pending;
    return <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.73rem', fontWeight: 700, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>{s || 'Pending'}</span>;
  };

  return (
    <div>
      <div className="rounded-xl p-5 mb-5 flex justify-between items-center flex-wrap gap-3" style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', boxShadow: '0 4px 20px rgba(196,30,58,0.28)' }}>
        <div>
          <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-1 m-0">Staff Services</p>
          <h3 className="text-white text-lg font-bold m-0">👤 Leave & CAS Management</h3>
          <p className="text-white/70 text-sm mt-1 m-0">Submit leave requests and branch expense cash advances (CAS)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowLeaveForm(true); setAlert(null); setStaffSubTab('leave'); }} className="px-4 py-2 rounded-full font-semibold text-sm cursor-pointer" style={{ background: '#fff', color: '#c41e3a', border: 'none', fontWeight: 700 }}>📅 Request Leave</button>
          <button onClick={() => { setShowCashForm(true); setAlert(null); setStaffSubTab('cash'); }} className="px-4 py-2 rounded-full font-semibold text-sm cursor-pointer text-white" style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)' }}>💵 New CAS Request</button>
        </div>
      </div>

      {alert && <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: alert.type === 'success' ? '#f0fdf4' : '#fef2f2', color: alert.type === 'success' ? '#166534' : '#991b1b', border: `1px solid ${alert.type === 'success' ? '#86efac' : '#fca5a5'}` }}>{alert.message}</div>}

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-5">
        {[{ id: 'leave', label: '📅 Leave Requests' }, { id: 'cash', label: '💵 CAS Requests' }].map(t => (
          <button key={t.id} onClick={() => setStaffSubTab(t.id)}
            style={{ padding: '8px 20px', borderRadius: 20, fontSize: '0.85rem', fontWeight: 600, border: 'none', cursor: 'pointer', background: staffSubTab === t.id ? '#c41e3a' : '#f1f5f9', color: staffSubTab === t.id ? '#fff' : '#64748b', transition: 'all 0.2s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Leave Requests */}
      {staffSubTab === 'leave' && (
        <Card>
          <CardHeader className="flex justify-between items-center">
            <h3 className="font-bold text-gray-800">My Leave Requests</h3>
            <button onClick={refreshLeave} className="px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer" style={{ background: '#f9f5f5', color: '#64748b' }}>🔄 Refresh</button>
          </CardHeader>
          {leaveLoading ? <div className="p-6 text-center text-gray-400">Loading…</div> : leaveRequests.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <div className="text-4xl mb-3">📅</div>
              <p className="font-semibold text-gray-500">No leave requests yet</p>
              <p className="text-sm mt-1">Click "Request Leave" to submit your first request</p>
            </div>
          ) : (
            <div className="divide-y">
              {leaveRequests.map((r, i) => (
                <div key={r.id || i} style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 800, background: '#fff0f3', color: leaveTypeColor(r.type), border: `1px solid #fecaca` }}>{r.type || 'Annual'}</span>
                      {r.urgent && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.7rem', fontWeight: 700, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}>URGENT</span>}
                      {statusBadge(r.status)}
                    </div>
                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.9rem' }}>{r.startDate} → {r.endDate}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>{r.reason}</div>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'right' }}>{r.submittedAt ? new Date(r.submittedAt).toLocaleDateString('en-NA') : '-'}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* CAS Requests */}
      {staffSubTab === 'cash' && (
        <Card>
          <CardHeader className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-gray-800">Branch Expense Cash Advances (CAS)</h3>
              <p className="text-xs text-gray-400 mt-0.5">Cash requested for branch operating expenses</p>
            </div>
            <button onClick={refreshCash} className="px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer" style={{ background: '#f9f5f5', color: '#64748b' }}>🔄 Refresh</button>
          </CardHeader>
          {cashLoading ? <div className="p-6 text-center text-gray-400">Loading…</div> : cashRequests.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <div className="text-4xl mb-3">💵</div>
              <p className="font-semibold text-gray-500">No CAS requests yet</p>
              <p className="text-sm mt-1">Click "New CAS Request" to request cash for branch expenses</p>
            </div>
          ) : (
            <div className="divide-y">
              {cashRequests.map((r, i) => (
                <div key={r.id || i} style={{ padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, color: '#166534', fontSize: '0.95rem' }}>N$ {Math.round(Number(r.amount || 0)).toLocaleString("en-ZA")}</span>
                      {r.expenseCategory && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 700, background: '#eff6ff', color: '#1e40af', border: '1px solid #93c5fd' }}>{r.expenseCategory}</span>}
                      {statusBadge(r.status)}
                    </div>
                    <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.88rem' }}>{r.purpose}</div>
                    {r.neededBy && <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>Needed by: {r.neededBy}</div>}
                    {r.requestNumber && <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 2, fontFamily: 'monospace' }}>{r.requestNumber}</div>}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'right' }}>{r.submittedAt ? new Date(r.submittedAt).toLocaleDateString('en-NA') : '-'}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Leave Request Form Modal */}
      {showLeaveForm && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowLeaveForm(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(3px)' }}>
          <div style={{ width: '100%', maxWidth: 500, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 30px 80px rgba(196,30,58,0.2)' }}>
            <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 800 }}>📅 Submit Leave Request</div>
              <button onClick={() => setShowLeaveForm(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Leave Type *</label>
                <select value={leaveForm.type} onChange={e => setLeaveForm(f => ({ ...f, type: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.9rem', outline: 'none' }}>
                  {['Annual', 'Sick', 'Emergency', 'Unpaid', 'Maternity', 'Study'].map(t => <option key={t} value={t}>{t} Leave</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Start Date *</label>
                  <input type="date" value={leaveForm.startDate} onChange={e => setLeaveForm(f => ({ ...f, startDate: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>End Date *</label>
                  <input type="date" value={leaveForm.endDate} min={leaveForm.startDate} onChange={e => setLeaveForm(f => ({ ...f, endDate: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Reason / Notes *</label>
                <textarea value={leaveForm.reason} onChange={e => setLeaveForm(f => ({ ...f, reason: e.target.value }))} rows={3} placeholder="Please provide a reason for your leave request…" style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.87rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: '#dc2626', userSelect: 'none' }}>
                <input type="checkbox" checked={leaveForm.urgent} onChange={e => setLeaveForm(f => ({ ...f, urgent: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#c41e3a' }} />
                Mark as URGENT (requires immediate approval)
              </label>
              <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                <button onClick={() => setShowLeaveForm(false)} style={{ flex: 1, padding: '11px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600, fontSize: '0.9rem' }}>Cancel</button>
                <button onClick={submitLeave} disabled={leaveSubmitting} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', fontWeight: 800, cursor: leaveSubmitting ? 'not-allowed' : 'pointer', fontSize: '0.9rem', opacity: leaveSubmitting ? 0.65 : 1 }}>
                  {leaveSubmitting ? '⏳ Submitting…' : '📅 Submit Leave Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CAS — Branch Expense Cash Advance Form Modal */}
      {showCashForm && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowCashForm(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(3px)' }}>
          <div style={{ width: '100%', maxWidth: 500, background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 30px 80px rgba(196,30,58,0.2)' }}>
            <div style={{ background: 'linear-gradient(135deg,#1e40af,#1d4ed8)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#fff', fontSize: '1.05rem', fontWeight: 800 }}>💵 Branch Expense Cash Advance (CAS)</div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', marginTop: 2 }}>Request branch operating expense funding</div>
              </div>
              <button onClick={() => setShowCashForm(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ padding: '10px 14px', background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe', fontSize: '0.8rem', color: '#1e40af' }}>
                This cash advance request is for <strong>branch operating expenses</strong> — not for personal use. Finance will review and the GM will approve.
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Expense Category *</label>
                <select value={cashForm.expenseCategory} onChange={e => setCashForm(f => ({ ...f, expenseCategory: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}>
                  {['Office Supplies', 'Rent', 'Utilities', 'Cleaning & Hygiene', 'Maintenance & Repairs', 'Transport & Fuel', 'Security', 'Communication', 'Staff Welfare', 'Marketing & Events', 'Other'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Amount Requested (N$) *</label>
                <input type="number" min="1" value={cashForm.amount} onChange={e => setCashForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '1rem', fontWeight: 700, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Expense Description *</label>
                <textarea value={cashForm.purpose} onChange={e => setCashForm(f => ({ ...f, purpose: e.target.value }))} rows={3} placeholder="Describe the expense in detail — what will the cash be used for?" style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.87rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 5 }}>Date Needed By</label>
                <input type="date" value={cashForm.neededBy} onChange={e => setCashForm(f => ({ ...f, neededBy: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                <button onClick={() => setShowCashForm(false)} style={{ flex: 1, padding: '11px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600, fontSize: '0.9rem' }}>Cancel</button>
                <button onClick={submitCash} disabled={cashSubmitting} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 10, background: 'linear-gradient(135deg,#1e40af,#1d4ed8)', color: '#fff', fontWeight: 800, cursor: cashSubmitting ? 'not-allowed' : 'pointer', fontSize: '0.9rem', opacity: cashSubmitting ? 0.65 : 1 }}>
                  {cashSubmitting ? '⏳ Submitting…' : '💵 Submit CAS Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OutsideRegistrationsTab() {
  const { user } = useAuth();
  const portalBranch = useContext(PortalBranchContext);
  const effectiveBranch = portalBranch || user?.branch || '';
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [approving, setApproving] = useState(null);
  const [approveForm, setApproveForm] = useState({ payment_method: 'cash', payment_reference: '' });
  const [alert, setAlert] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/distributor-agreement?status=pending_payment${effectiveBranch ? `&branch=${encodeURIComponent(effectiveBranch)}` : ''}`);
      setRegistrations(Array.isArray(res.agreements) ? res.agreements : []);
    } catch { setRegistrations([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [effectiveBranch]);

  const handleApprove = async (agr) => {
    setAlert(null);
    try {
      const res = await api.patch('/distributor-agreement', {
        id: agr.id,
        payment_method: approveForm.payment_method,
        payment_reference: approveForm.payment_reference || null,
      });
      setAlert({ type: 'success', message: `✅ NB Number issued: ${res.nb_number} — ${res.distributor_name}` });
      setApproving(null);
      load();
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Approval failed' });
    }
  };

  return (
    <div className="space-y-5">
      <div style={{ background: 'linear-gradient(135deg,#1e3a5f,#2d6a9f)', borderRadius: 16, padding: '20px 24px', color: '#fff' }}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>📋 Outside Registrations</h2>
            <p style={{ fontSize: '0.85rem', opacity: 0.8, margin: '4px 0 0' }}>
              Online pre-registrations waiting for payment & NB number issuance
              {effectiveBranch ? ` — ${getBranchDisplayName(effectiveBranch) || effectiveBranch}` : ''}
            </p>
          </div>
          <button onClick={load} style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem' }}>
            🔄 Refresh
          </button>
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.8rem', fontWeight: 900, color: '#fbbf24' }}>{registrations.length}</div>
            <div style={{ fontSize: '0.72rem', opacity: 0.75 }}>Awaiting Processing</div>
          </div>
        </div>
      </div>

      {alert && <Alert type={alert.type} className="mb-3" onClose={() => setAlert(null)}>{alert.message}</Alert>}

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <strong>How it works:</strong> When a new member fills out the online membership agreement form and selects this branch, their application appears here. Collect the <strong>N$ 1,200.00</strong> registration fee, select payment method, and click <strong>Issue NB Number</strong> to register them in the system.
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-400">Loading outside registrations…</div>
      ) : registrations.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-10 text-center">
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>✅</div>
          <p className="text-gray-500 font-semibold">No pending outside registrations</p>
          <p className="text-xs text-gray-400 mt-1">All online pre-registrations for this branch have been processed.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {registrations.map(agr => {
            const isExp = expanded === agr.id;
            const isApp = approving === agr.id;
            return (
              <div key={agr.id} className="bg-white border-2 border-amber-200 rounded-xl overflow-hidden shadow-sm">
                <div className="p-4">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-gray-800 text-base">{agr.first_name} {agr.last_name}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold border border-amber-200">⏳ Awaiting Payment</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold capitalize">{agr.kit_type} Kit</span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                        <span>📅 {new Date(agr.created_at).toLocaleDateString('en-NA', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                        <span>📞 {agr.contact_mobile}</span>
                        {agr.sponsor_id && <span>👤 Sponsor: <strong>{agr.sponsor_id}</strong></span>}
                        {agr.upline_id && <span>⬆ Upline: <strong>{agr.upline_id}</strong></span>}
                        <span className="font-mono text-gray-300">{agr.id}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => setExpanded(isExp ? null : agr.id)}
                        style={{ padding: '6px 12px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}>
                        {isExp ? 'Hide ▲' : 'View ▼'}
                      </button>
                      <button onClick={() => { setApproving(isApp ? null : agr.id); setApproveForm({ payment_method: 'cash', payment_reference: '' }); }}
                        style={{ padding: '6px 14px', background: isApp ? '#fee2e2' : '#dcfce7', color: isApp ? '#991b1b' : '#166534', border: `1px solid ${isApp ? '#fca5a5' : '#86efac'}`, borderRadius: 7, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700 }}>
                        {isApp ? '✕ Cancel' : '💳 Process Payment'}
                      </button>
                    </div>
                  </div>

                  {isExp && (
                    <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-xs text-gray-600">
                      {agr.mailing_address_street && <div><span className="text-gray-400">Address:</span> {agr.mailing_address_street}</div>}
                      {agr.mailing_address_town && <div><span className="text-gray-400">Town:</span> {agr.mailing_address_town}</div>}
                      {agr.nationality && <div><span className="text-gray-400">Nationality:</span> {agr.nationality}</div>}
                      {agr.birthdate && <div><span className="text-gray-400">Birthdate:</span> {agr.birthdate}</div>}
                      {agr.sex && <div><span className="text-gray-400">Sex:</span> {agr.sex}</div>}
                    </div>
                  )}

                  {isApp && (
                    <div className="mt-3 pt-3 border-t border-green-100 bg-green-50 rounded-lg p-3">
                      <p className="text-xs font-bold text-green-800 mb-2">💳 Collect N$ 1,200.00 — Select Payment Method</p>
                      <div className="flex gap-2 mb-2 flex-wrap">
                        {['cash', 'card', 'eft'].map(m => (
                          <button key={m} type="button"
                            onClick={() => setApproveForm(f => ({ ...f, payment_method: m }))}
                            style={{ padding: '5px 14px', background: approveForm.payment_method === m ? '#16a34a' : '#fff', color: approveForm.payment_method === m ? '#fff' : '#374151', border: `1px solid ${approveForm.payment_method === m ? '#16a34a' : '#d1d5db'}`, borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem', textTransform: 'capitalize' }}>
                            {m === 'cash' ? '💵 Cash' : m === 'card' ? '💳 Card' : '🏦 EFT'}
                          </button>
                        ))}
                      </div>
                      <input type="text" placeholder="Receipt / EFT reference (optional)"
                        value={approveForm.payment_reference}
                        onChange={e => setApproveForm(f => ({ ...f, payment_reference: e.target.value }))}
                        className="w-full px-3 py-1.5 border border-green-300 rounded-lg text-xs mb-2 focus:outline-none focus:ring-1 focus:ring-green-400" />
                      <button onClick={() => handleApprove(agr)}
                        style={{ width: '100%', padding: '9px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                        ✅ Confirm Payment & Issue NB Number
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DistributorRegTab() {
  const { user } = useAuth();
  return <MembershipAgreementForm mode="branch" userBranch={user?.branch} />;
}

function printFieldRequestDoc(req, branchName) {
  const prods = Array.isArray(req.products) ? req.products : [];
  const rows = prods.map((p, i) => `<tr><td>${i+1}</td><td>${p.product_name||'-'}</td><td style="text-align:center">${p.quantity||0}</td><td>${p.unit||'units'}</td><td style="width:120px;border-bottom:1px solid #ccc">&nbsp;</td></tr>`).join('');
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Field Program Request — ${req.id}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #1e293b; padding: 28px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #c41e3a; padding-bottom: 12px; margin-bottom: 18px; }
    .company { color: #c41e3a; font-weight: 900; font-size: 16px; }
    .title { font-size: 14px; font-weight: 800; color: #8b0000; margin-top: 4px; }
    .meta { text-align: right; color: #64748b; font-size: 10px; line-height: 1.7; }
    .section { margin-bottom: 16px; }
    .section-title { font-size: 9px; font-weight: 800; color: #c41e3a; text-transform: uppercase; letter-spacing: .12em; margin-bottom: 8px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .info-box { background: #fdf7f8; border: 1px solid #f0e8ea; border-radius: 6px; padding: 8px 12px; }
    .info-label { font-size: 9px; color: #94a3b8; text-transform: uppercase; font-weight: 700; }
    .info-value { font-size: 12px; font-weight: 800; color: #1e293b; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th { background: #c41e3a; color: #fff; font-weight: 700; padding: 7px 8px; text-align: left; font-size: 10px; }
    td { padding: 7px 8px; border-bottom: 1px solid #f1f5f9; font-size: 10px; }
    tr:nth-child(even) td { background: #fdf7f8; }
    .terms { background: #fff8f8; border: 1.5px solid #fecaca; border-radius: 6px; padding: 12px; margin-top: 16px; font-size: 9.5px; line-height: 1.6; }
    .terms h4 { color: #c41e3a; font-size: 10px; margin-bottom: 8px; }
    .sig-area { margin-top: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .sig-box { border-top: 2px solid #c41e3a; padding-top: 6px; }
    .sig-label { font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase; }
    .sig-value { font-size: 11px; font-weight: 800; color: #1e293b; margin-top: 3px; font-style: italic; }
    .copy-label { text-align: center; margin-top: 20px; font-size: 9px; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; border-top: 1px dashed #e2e8f0; padding-top: 8px; }
    .print-btn { position:fixed; top:12px; right:12px; background:#c41e3a; color:#fff; border:none; padding:8px 18px; border-radius:8px; font-weight:700; cursor:pointer; font-size:12px; }
    @media print { * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } .print-btn { display:none; } }
  </style></head><body>
  <button class="print-btn" onclick="window.print()">🖨️ Print</button>
  <div class="header">
    <div><div class="company">Uganam Dynapharm Namibia</div><div class="title">🚐 Field Program Stock Request</div><div style="color:#64748b;font-size:10px;margin-top:3px">${branchName ? branchName + ' Branch' : ''}</div></div>
    <div class="meta">Request ID: <strong>${req.id||'-'}</strong><br>Date: ${req.date ? new Date(req.date).toLocaleDateString('en-NA',{day:'2-digit',month:'long',year:'numeric'}) : '-'}<br>Status: <strong>${(req.status||'Pending').toUpperCase()}</strong><br>Printed: ${new Date().toLocaleDateString('en-NA')}</div>
  </div>
  <div class="section">
    <div class="section-title">Distributor Details</div>
    <div class="info-grid">
      <div class="info-box"><div class="info-label">Full Name</div><div class="info-value">${req.distributor_name||'-'}</div></div>
      <div class="info-box"><div class="info-label">NB Number</div><div class="info-value">${req.distributor_code||'-'}</div></div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">Requested Products</div>
    <table><thead><tr><th>#</th><th>Product Name</th><th style="text-align:center">Qty</th><th>Unit</th><th>Verified Qty</th></tr></thead><tbody>${rows}</tbody></table>
  </div>
  ${req.notes ? `<div class="section"><div class="section-title">Notes / Purpose</div><div style="padding:8px 12px;background:#fdf7f8;border-radius:6px;font-size:10.5px">${req.notes}</div></div>` : ''}
  <div class="terms">
    <h4>Terms and Conditions of Stock Handling Commitment</h4>
    <ol style="padding-left:16px">
      <li><strong>Stock Accountability:</strong> The distributor is fully responsible for all stock received and must account for every item.</li>
      <li><strong>FEFO Compliance:</strong> Stock will be issued following First Expired First Out (FEFO) principles.</li>
      <li><strong>Storage Requirements:</strong> Stock must be stored in appropriate conditions as per product specifications.</li>
      <li><strong>Damage/Loss Reporting:</strong> Any damaged or lost stock must be reported immediately to the branch manager.</li>
      <li><strong>Return Policy:</strong> Unused stock may be returned within 30 days if in original condition and packaging.</li>
      <li><strong>Sales Records:</strong> Complete sales records must be maintained and submitted as required.</li>
      <li><strong>Payment Terms:</strong> Payment for stock must be made according to agreed terms.</li>
      <li><strong>Compliance:</strong> All stock must be used/sold in compliance with Dynapharm policies and local regulations.</li>
    </ol>
  </div>
  <div class="sig-area">
    <div class="sig-box"><div class="sig-label">Distributor Signature</div><div class="sig-value">${req.signature || req.distributor_name || '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}</div><div style="font-size:9px;color:#94a3b8;margin-top:2px">${req.distributor_name||''}</div></div>
    <div class="sig-box"><div class="sig-label">Branch Manager / Dispenser</div><div class="sig-value">${req.created_by||'&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}</div><div style="font-size:9px;color:#94a3b8;margin-top:2px">Date: ${req.date ? new Date(req.date).toLocaleDateString('en-NA') : '___________________'}</div></div>
  </div>
  <div class="copy-label">DISTRIBUTOR COPY — Please keep this copy for your records</div>
  </body></html>`);
  win.document.close();
}

function FieldProgramTab() {
  const { user } = useAuth();
  const [fpTab, setFpTab] = useState('requests');
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState(null);
  const [distributorSearch, setDistributorSearch] = useState('');
  const [distributorResults, setDistributorResults] = useState([]);
  const [selectedDistributors, setSelectedDistributors] = useState([]);
  const [productRows, setProductRows] = useState([{ product: '', quantity: '', unit: '', suggestions: [], showSug: false }]);
  const [requestDate, setRequestDate] = useState(new Date().toISOString().slice(0, 10));
  const [requestBranch, setRequestBranch] = useState(user?.branch || '');
  const [requestNotes, setRequestNotes] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [catalogue, setCatalogue] = useState([]);
  const [priceList, setPriceList] = useState([]);
  const [lastSubmitted, setLastSubmitted] = useState(null);
  const [scanRowIdx, setScanRowIdx] = useState(null);
  const [reconcileId, setReconcileId] = useState(null);
  const [returnedQtys, setReturnedQtys] = useState({});
  const [dpPricesMap, setDpPricesMap] = useState({});
  const [reconcileNotes, setReconcileNotes] = useState('');
  const [reconciling, setReconciling] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/field_program_requests').catch(() => []),
      api.products.list().catch(() => []),
      api.prices.list().catch(() => []),
    ]).then(([d, prods, pl]) => {
      setActivities(Array.isArray(d) ? d : d.requests || d.activities || []);
      setCatalogue(Array.isArray(prods) ? prods : prods.products || []);
      setPriceList(Array.isArray(pl) ? pl : pl.prices || []);
    }).finally(() => setLoading(false));
  }, []);

  const loadActivities = async () => {
    setLoading(true);
    const res = await api.get('/field_program_requests').catch(() => []);
    setActivities(Array.isArray(res) ? res : res.requests || res.activities || []);
    setLoading(false);
  };

  const distSearchTimer = useRef(null);
  const searchDistributor = (val) => {
    setDistributorSearch(val);
    if (val.length < 2) { setDistributorResults([]); return; }
    if (distSearchTimer.current) clearTimeout(distSearchTimer.current);
    distSearchTimer.current = setTimeout(async () => {
      try {
        const res = await api.distributors.search(val);
        const list = Array.isArray(res) ? res : res.distributors || [];
        setDistributorResults(list.filter(r => !selectedDistributors.find(s => s.id === r.id)).slice(0, 8));
      } catch { setDistributorResults([]); }
    }, 300);
  };

  const addDistributor = (d) => {
    if (selectedDistributors.find(x => x.id === d.id)) return;
    setSelectedDistributors(prev => [...prev, d]);
    setDistributorSearch('');
    setDistributorResults([]);
  };

  const removeDistributor = (id) => setSelectedDistributors(prev => prev.filter(d => d.id !== id));

  const addProductRow = () => setProductRows([...productRows, { product: '', quantity: '', unit: '', suggestions: [], showSug: false }]);
  const removeProductRow = (idx) => setProductRows(productRows.filter((_, i) => i !== idx));
  const updateProductRow = (idx, field, val) => {
    const rows = [...productRows];
    rows[idx][field] = val;
    if (field === 'product') {
      const q = val.toLowerCase();
      const filtered = q.length === 0
        ? catalogue.slice(0, 10)
        : catalogue.filter(p => (p.name||p.description||'').toLowerCase().includes(q)).slice(0, 8);
      rows[idx].suggestions = filtered;
      rows[idx].showSug = filtered.length > 0;
    }
    setProductRows(rows);
  };
  const focusProductRow = (idx) => {
    const rows = [...productRows];
    if (!rows[idx].product) {
      rows[idx].suggestions = catalogue.slice(0, 10);
      rows[idx].showSug = rows[idx].suggestions.length > 0;
      setProductRows(rows);
    }
  };
  const blurProductRow = (idx) => {
    setTimeout(() => {
      const rows = [...productRows];
      rows[idx].showSug = false;
      setProductRows(rows);
    }, 180);
  };
  const selectProductSuggestion = (idx, p) => {
    const rows = [...productRows];
    rows[idx].product = p.name || p.description;
    rows[idx].suggestions = [];
    rows[idx].showSug = false;
    setProductRows(rows);
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (selectedDistributors.length === 0 || !agreeTerms) return;
    const validProducts = productRows.filter(r => r.product.trim() && r.quantity);
    if (validProducts.length === 0) return;
    setSubmitting(true);
    const primary = selectedDistributors[0];
    const reqData = {
      id: `FP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      distributor_id: primary.id,
      distributor_name: primary.distributor_name || primary.name,
      distributor_code: primary.distributor_code || primary.nb_number,
      distributors: selectedDistributors.map(d => ({ id: d.id, name: d.distributor_name || d.name, code: d.distributor_code || d.nb_number })),
      date: requestDate,
      branch: requestBranch || user?.branch || '',
      products: validProducts.map(r => ({ product_name: r.product, quantity: Number(r.quantity), unit: r.unit })),
      notes: requestNotes.trim(),
      signature: selectedDistributors.map(d => d.distributor_name || d.name).join(', '),
      status: 'pending',
      created_by: user?.full_name || user?.username || '',
    };
    try {
      await api.post('/field_program_requests', reqData);
      setAlert({ type: 'success', message: 'Field program request submitted successfully' });
      setLastSubmitted(reqData);
      setShowForm(false);
      setSelectedDistributors([]);
      setDistributorSearch('');
      setProductRows([{ product: '', quantity: '', unit: '', suggestions: [], showSug: false }]);
      setRequestNotes('');
      setAgreeTerms(false);
      loadActivities();
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to submit request' });
    } finally { setSubmitting(false); }
  };

  const reconcileTarget = activities.find(a => a.id === reconcileId) || null;

  const lookupDpPrice = (productName) => {
    const needle = (productName || '').trim().toUpperCase();
    // 1. Try price list first (product_prices table — same source as GM price list)
    const plMatch = priceList.find(p => (p.description || '').trim().toUpperCase() === needle);
    if (plMatch && plMatch.dp != null && Number(plMatch.dp) > 0) return Number(plMatch.dp);
    // 2. Partial match in price list
    const plPartial = priceList.find(p => (p.description || '').trim().toUpperCase().includes(needle) || needle.includes((p.description || '').trim().toUpperCase()));
    if (plPartial && plPartial.dp != null && Number(plPartial.dp) > 0) return Number(plPartial.dp);
    // 3. Fall back to products catalogue
    const catMatch = catalogue.find(c => (c.name || c.description || '').trim().toUpperCase() === needle);
    if (catMatch && catMatch.dp != null) return Number(catMatch.dp);
    return '';
  };

  const openReconcile = (req) => {
    const prods = Array.isArray(req.products) ? req.products : [];
    const returned = Array.isArray(req.returned_items) ? req.returned_items : [];
    const initQtys = {};
    const initDp = {};
    prods.forEach(p => {
      const name = p.product_name;
      const ret = returned.find(r => r.product_name === name);
      initQtys[name] = ret ? String(ret.returned_qty) : '';
      // If already reconciled use stored price, otherwise look up from price list
      if (ret?.dp_price != null && Number(ret.dp_price) > 0) {
        initDp[name] = String(ret.dp_price);
      } else {
        const found = lookupDpPrice(name);
        initDp[name] = found !== '' ? String(found) : '';
      }
    });
    setReturnedQtys(initQtys);
    setDpPricesMap(initDp);
    setReconcileNotes(req.notes || '');
    setReconcileId(req.id);
  };

  const closeReconcile = () => setReconcileId(null);

  const handleReconcileSave = async () => {
    if (!reconcileTarget) return;
    setReconciling(true);
    const prods = Array.isArray(reconcileTarget.products) ? reconcileTarget.products : [];
    const returned_items = prods.map(p => ({
      product_name: p.product_name,
      issued_qty: Number(p.quantity) || 0,
      returned_qty: Number(returnedQtys[p.product_name] || 0),
      dp_price: Number(dpPricesMap[p.product_name] || 0),
    }));
    try {
      await api.put('/field_program_requests', {
        id: reconcileTarget.id,
        returned_items,
        status: 'reconciled',
        notes: reconcileNotes,
        reconciled_by: user?.full_name || user?.username || '',
        reconciled_at: new Date().toISOString(),
      });
      setAlert({ type: 'success', message: 'Reconciliation saved. DP payable has been calculated.' });
      await loadActivities();
      setReconcileId(null);
    } catch (err) {
      setAlert({ type: 'error', message: err.message || 'Failed to save reconciliation' });
    } finally { setReconciling(false); }
  };

  const reconcileProducts = reconcileTarget ? (Array.isArray(reconcileTarget.products) ? reconcileTarget.products : []) : [];
  const reconcileTotalPayable = reconcileProducts.reduce((sum, p) => {
    const net = Math.max(0, (Number(p.quantity) || 0) - Number(returnedQtys[p.product_name] || 0));
    return sum + net * Number(dpPricesMap[p.product_name] || 0);
  }, 0);

  const getDistributorDisplay = (req) => {
    const dists = Array.isArray(req.distributors) && req.distributors.length > 0 ? req.distributors : null;
    if (dists) return dists.map(d => d.name).join(', ');
    return req.distributor_name || '-';
  };

  if (loading && activities.length === 0) return <LoadingSpinner />;

  return (
    <div>
      {/* Header */}
      <div className="rounded-xl p-5 mb-5 flex justify-between items-center flex-wrap gap-3" style={{ background: 'linear-gradient(135deg,#c41e3a 0%,#8b0000 100%)', boxShadow: '0 4px 20px rgba(196,30,58,0.28)' }}>
        <div>
          <h3 className="text-white text-lg font-bold m-0">🚐 Field Program — Stock Requests</h3>
          <p className="text-white/70 text-sm mt-1 m-0">Distributor stock requests for field program activities. FEFO compliant.</p>
        </div>
        <button onClick={() => setShowForm(true)} className="px-5 py-2.5 rounded-full font-bold text-sm cursor-pointer border-none" style={{ background: '#fff', color: '#c41e3a' }}>➕ New Stock Request</button>
      </div>

      {alert && <Alert type={alert.type} className="mb-4" onClose={() => setAlert(null)}>{alert.message}</Alert>}

      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, borderBottom: '2px solid #f1f5f9' }}>
        {[
          { id: 'requests', label: '📋 Requests', count: activities.length },
          { id: 'reconcile', label: '⚖️ Reconcile', count: activities.filter(a => a.status !== 'reconciled').length },
        ].map(t => (
          <button key={t.id} onClick={() => { setFpTab(t.id); if (t.id === 'requests') setReconcileId(null); }}
            style={{ padding: '9px 18px', border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', marginBottom: -2, borderBottom: fpTab === t.id ? '2px solid #c41e3a' : '2px solid transparent', background: fpTab === t.id ? '#fff0f3' : 'transparent', color: fpTab === t.id ? '#c41e3a' : '#64748b' }}>
            {t.label}
            {t.count > 0 && <span style={{ marginLeft: 6, background: fpTab === t.id ? '#c41e3a' : '#e2e8f0', color: fpTab === t.id ? '#fff' : '#64748b', borderRadius: 10, padding: '1px 7px', fontSize: '0.73rem' }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ── REQUESTS tab ── */}
      {fpTab === 'requests' && (
        <>
          {lastSubmitted && (
            <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 12, padding: '12px 16px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.87rem', color: '#166534', fontWeight: 600 }}>Last request: <span className="font-mono">{lastSubmitted.id}</span> — {getDistributorDisplay(lastSubmitted)}</div>
              <button onClick={() => printFieldRequestDoc(lastSubmitted, user?.branch||'')} className="px-4 py-2 rounded-lg text-sm font-bold border-none cursor-pointer" style={{ background: '#c41e3a', color: '#fff' }}>🖨️ Print Distributor Copy</button>
            </div>
          )}
          <Card>
            <CardHeader className="flex justify-between items-center">
              <h3 className="font-bold text-gray-800">Field Program Requests</h3>
              <button onClick={loadActivities} className="px-3 py-1.5 rounded-lg text-xs font-semibold border-none cursor-pointer" style={{ background: '#f9f5f5', color: '#64748b' }}>🔄 Refresh</button>
            </CardHeader>
            <Table
              columns={[
                { header: 'ID', render: r => <span className="text-xs font-mono">{r.id}</span> },
                { header: 'Distributor(s)', render: r => (
                  <div>
                    <div className="font-semibold text-sm">{getDistributorDisplay(r)}</div>
                    {Array.isArray(r.distributors) && r.distributors.length > 1 && <div className="text-xs font-medium" style={{ color: '#3b82f6' }}>{r.distributors.length} members</div>}
                  </div>
                )},
                { header: 'Date', render: r => formatDate(r.date) },
                { header: 'Products', render: r => { const prods = Array.isArray(r.products)?r.products:[]; return <span className="text-xs text-gray-600">{prods.slice(0,2).map(p=>`${p.product_name} ×${p.quantity}`).join(', ')}{prods.length>2?` +${prods.length-2} more`:''}</span>; }},
                { header: 'Status', render: r => <Badge variant={r.status==='approved'||r.status==='reconciled'?'success':r.status==='rejected'?'danger':'warning'}>{(r.status||'Pending').replace(/_/g,' ')}</Badge> },
                { header: '', render: r => (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap' }}>
                    <button onClick={() => printFieldRequestDoc(r, user?.branch||'')} className="px-3 py-1.5 text-xs rounded-lg font-bold border-none cursor-pointer" style={{ background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>🖨️ Print</button>
                    <button onClick={() => { setFpTab('reconcile'); openReconcile(r); }} className="px-3 py-1.5 text-xs rounded-lg font-bold border-none cursor-pointer" style={{ background: r.status === 'reconciled' ? '#f0fdf4' : '#c41e3a', color: r.status === 'reconciled' ? '#166534' : '#fff', border: 'none', whiteSpace: 'nowrap' }}>
                      {r.status === 'reconciled' ? '✅ Reconciled' : '⚖️ Reconcile'}
                    </button>
                  </div>
                )},
              ]}
              data={activities}
              emptyMessage="No field program requests yet"
            />
          </Card>
        </>
      )}

      {/* ── RECONCILE tab ── */}
      {fpTab === 'reconcile' && (
        <div>
          {!reconcileTarget ? (
            <Card>
              <CardHeader>
                <h3 className="font-bold text-gray-800">⚖️ Select a Request to Reconcile</h3>
                <p className="text-sm text-gray-500 mt-0.5">Mark what stock was returned and the system will calculate the DP amount payable by the distributor(s).</p>
              </CardHeader>
              {activities.length === 0 ? (
                <CardBody><EmptyState icon={<span style={{ fontSize: 40 }}>📋</span>} title="No requests yet" description="Submit a field program stock request first, then reconcile it here." /></CardBody>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#fdf7f8' }}>
                        {['ID', 'Distributor(s)', 'Date', 'Products', 'Status', ''].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.73rem', fontWeight: 800, color: '#c41e3a', textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '2px solid #fecaca', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activities.map((r, i) => {
                        const isReconciled = r.status === 'reconciled';
                        const prods = Array.isArray(r.products) ? r.products : [];
                        return (
                          <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fdf7f8', opacity: isReconciled ? 0.75 : 1 }}>
                            <td style={{ padding: '10px 14px', fontSize: '0.78rem', fontFamily: 'monospace', color: '#64748b' }}>{r.id}</td>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{getDistributorDisplay(r)}</div>
                              {Array.isArray(r.distributors) && r.distributors.length > 1 && <div style={{ fontSize: '0.72rem', color: '#3b82f6' }}>{r.distributors.length} members</div>}
                            </td>
                            <td style={{ padding: '10px 14px', fontSize: '0.82rem', color: '#64748b', whiteSpace: 'nowrap' }}>{formatDate(r.date)}</td>
                            <td style={{ padding: '10px 14px', fontSize: '0.78rem', color: '#64748b' }}>
                              {prods.slice(0, 2).map(p => `${p.product_name} ×${p.quantity}`).join(', ')}
                              {prods.length > 2 && ` +${prods.length - 2} more`}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: '0.72rem', fontWeight: 700, background: isReconciled ? '#dcfce7' : r.status === 'rejected' ? '#fef2f2' : '#fef3c7', color: isReconciled ? '#166534' : r.status === 'rejected' ? '#c41e3a' : '#92400e' }}>
                                {(r.status || 'pending').replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <button onClick={() => openReconcile(r)}
                                style={{ padding: '7px 14px', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem', background: isReconciled ? '#f0fdf4' : 'linear-gradient(135deg,#c41e3a,#8b0000)', color: isReconciled ? '#166534' : '#fff', whiteSpace: 'nowrap' }}>
                                {isReconciled ? '✅ View / Edit' : '⚖️ Reconcile'}
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
            <div>
              <button onClick={closeReconcile} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, background: '#fff', color: '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', marginBottom: 14 }}>
                ← Back to list
              </button>
              <Card>
                <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', borderRadius: '12px 12px 0 0', padding: '14px 20px' }}>
                  <div style={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>⚖️ Reconcile: {reconcileTarget.id}</div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', marginTop: 3 }}>
                    {formatDate(reconcileTarget.date)} · {getDistributorDisplay(reconcileTarget)}
                    {Array.isArray(reconcileTarget.distributors) && reconcileTarget.distributors.length > 1 && ` (${reconcileTarget.distributors.length} members)`}
                  </div>
                </div>
                <CardBody>
                  {/* Participating distributors chips */}
                  {Array.isArray(reconcileTarget.distributors) && reconcileTarget.distributors.length > 1 && (
                    <div style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#c41e3a', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Participating Distributors</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {reconcileTarget.distributors.map((d, i) => (
                          <div key={i} style={{ padding: '4px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 20, fontSize: '0.8rem', fontWeight: 600, color: '#1e40af' }}>
                            {d.name}{d.code ? <span style={{ opacity: 0.6, marginLeft: 6 }}>· {d.code}</span> : ''}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reconcile table */}
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#c41e3a', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>Stock Reconciliation — Enter Returned Quantities</div>
                  <div style={{ overflowX: 'auto', marginBottom: 20 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: '#fdf7f8' }}>
                          {['Product', 'Issued', 'Returned', 'Net Sold/Used', 'DP Price (N$)', 'DP Payable (N$)'].map(h => (
                            <th key={h} style={{ padding: '9px 12px', textAlign: ['Issued','Returned','Net Sold/Used','DP Price (N$)','DP Payable (N$)'].includes(h) ? 'center' : 'left', fontSize: '0.71rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '2px solid #f1f5f9', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {reconcileProducts.map((p, i) => {
                          const issued = Number(p.quantity) || 0;
                          const returned = Number(returnedQtys[p.product_name] || 0);
                          const net = Math.max(0, issued - returned);
                          const dp = Number(dpPricesMap[p.product_name] || 0);
                          const payable = net * dp;
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fdf7f8' }}>
                              <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1e293b' }}>{p.product_name}</td>
                              <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: '#374151' }}>{issued}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                <input type="number" min="0" max={issued} value={returnedQtys[p.product_name] ?? ''} onChange={e => setReturnedQtys(prev => ({ ...prev, [p.product_name]: e.target.value }))} placeholder="0"
                                  style={{ width: 70, padding: '5px 8px', border: '1.5px solid #fcd34d', borderRadius: 7, textAlign: 'center', fontSize: '0.85rem', outline: 'none', background: '#fffbeb' }} />
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: net > 0 ? '#c41e3a' : '#166534' }}>{net}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                <input type="number" min="0" step="0.01" value={dpPricesMap[p.product_name] ?? ''} onChange={e => setDpPricesMap(prev => ({ ...prev, [p.product_name]: e.target.value }))} placeholder="0.00"
                                  style={{ width: 84, padding: '5px 8px', border: '1.5px solid #e8d5d8', borderRadius: 7, textAlign: 'center', fontSize: '0.85rem', outline: 'none' }} />
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800, color: payable > 0 ? '#8b0000' : '#64748b' }}>
                                {payable > 0 ? `N$ ${payable.toFixed(2)}` : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#fdf7f8', borderTop: '2px solid #fecaca' }}>
                          <td colSpan={5} style={{ padding: '12px 14px', fontWeight: 800, color: '#8b0000', fontSize: '0.9rem', textAlign: 'right' }}>Total DP Payable by Distributor(s):</td>
                          <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 900, color: '#8b0000', fontSize: '1.1rem' }}>N$ {reconcileTotalPayable.toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Summary card */}
                  <div style={{ background: reconcileTotalPayable > 0 ? '#fff0f3' : '#f0fdf4', border: `2px solid ${reconcileTotalPayable > 0 ? '#fecaca' : '#86efac'}`, borderRadius: 12, padding: '16px 20px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: reconcileTotalPayable > 0 ? '#c41e3a' : '#166534', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                        {reconcileTotalPayable > 0 ? '💳 DP Amount Payable' : '✅ No Payment Due'}
                      </div>
                      <div style={{ fontSize: '1.75rem', fontWeight: 900, color: reconcileTotalPayable > 0 ? '#8b0000' : '#166534', marginTop: 2 }}>
                        N$ {reconcileTotalPayable.toFixed(2)}
                      </div>
                      <div style={{ fontSize: '0.73rem', color: '#64748b', marginTop: 2 }}>Net stock sold/used × DP price per unit</div>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#64748b', textAlign: 'right' }}>
                      <div>Distributor(s): <strong>{getDistributorDisplay(reconcileTarget)}</strong></div>
                      <div>Request: <span style={{ fontFamily: 'monospace' }}>{reconcileTarget.id}</span></div>
                      {reconcileTarget.reconciled_at && <div style={{ color: '#16a34a', marginTop: 2 }}>Previously reconciled: {new Date(reconcileTarget.reconciled_at).toLocaleDateString('en-NA')}</div>}
                    </div>
                  </div>

                  {/* Notes */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Reconciliation Notes</label>
                    <textarea value={reconcileNotes} onChange={e => setReconcileNotes(e.target.value)} rows={2} placeholder="Optional notes about returns, damages, or adjustments…"
                      style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.85rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <button onClick={closeReconcile} style={{ padding: '10px 20px', border: '1.5px solid #e8d5d8', borderRadius: 11, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600, fontSize: '0.87rem' }}>Cancel</button>
                    <button onClick={handleReconcileSave} disabled={reconciling}
                      style={{ padding: '11px 28px', border: 'none', borderRadius: 11, background: 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '0.9rem', opacity: reconciling ? 0.6 : 1, boxShadow: '0 4px 14px rgba(196,30,58,0.3)' }}>
                      {reconciling ? '⏳ Saving…' : '💾 Save Reconciliation'}
                    </button>
                  </div>
                </CardBody>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ── FORM MODAL (multiple distributors) ── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', backdropFilter: 'blur(3px)' }}>
          <div style={{ width: '100%', maxWidth: 720, background: '#fff', borderRadius: 22, overflow: 'hidden', maxHeight: '96vh', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(196,30,58,0.25)' }}>
            <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 800 }}>🚐 Field Program Stock Request</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.78rem', marginTop: 2 }}>{user?.branch ? `${getBranchDisplayName(user.branch)} Branch` : ''} · Distributor verification required</div>
              </div>
              <button onClick={() => setShowForm(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* ── MULTIPLE DISTRIBUTORS ── */}
              <div style={{ background: '#fffbeb', border: '2px solid #fcd34d', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '.12em', color: '#92400e', textTransform: 'uppercase', marginBottom: 10 }}>
                  Distributors *
                  <span style={{ fontWeight: 400, fontSize: '0.75rem', textTransform: 'none', color: '#b45309', marginLeft: 6 }}>— add one or more members participating in the field program</span>
                </div>

                {/* Added distributors list */}
                {selectedDistributors.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                    {selectedDistributors.map((d, i) => (
                      <div key={d.id} style={{ padding: '8px 12px', background: '#fff', border: '1px solid #fcd34d', borderRadius: 9, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#92400e', marginRight: 8 }}>#{i + 1}{i === 0 ? ' (Primary)' : ''}</span>
                          <span style={{ fontWeight: 700, color: '#1e293b' }}>{d.distributor_name || d.name}</span>
                          <span style={{ fontSize: '0.78rem', color: '#d97706', marginLeft: 10 }}>{d.distributor_code || d.nb_number}</span>
                        </div>
                        <button onClick={() => removeDistributor(d.id)} style={{ border: 'none', background: '#fef3c7', color: '#d97706', cursor: 'pointer', width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Search to add more distributors */}
                <div style={{ position: 'relative' }}>
                  <input type="text" value={distributorSearch} onChange={e => searchDistributor(e.target.value)}
                    placeholder={selectedDistributors.length === 0 ? 'Search by NB/DZ number or name…' : '➕ Add another distributor…'}
                    autoComplete="off"
                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #fcd34d', borderRadius: 9, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box' }} />
                  {distributorResults.length > 0 && (
                    <div style={{ position: 'absolute', zIndex: 100, width: '100%', background: '#fff', border: '1.5px solid #fcd34d', borderRadius: 10, maxHeight: 200, overflowY: 'auto', boxShadow: '0 8px 24px rgba(245,158,11,.15)', top: 'calc(100% + 4px)', left: 0 }}>
                      {distributorResults.map((d, i) => (
                        <div key={d.id || i} onClick={() => addDistributor(d)} style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #fffbeb', fontSize: '0.85rem' }}>
                          <div style={{ fontWeight: 700, color: '#1e293b' }}>{d.distributor_name || d.name}</div>
                          <div style={{ color: '#d97706', fontSize: '0.76rem', marginTop: 2 }}>{d.distributor_code || d.nb_number}{d.mobile_no || d.phone ? ` · ${d.mobile_no || d.phone}` : ''}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {selectedDistributors.length > 0 && (
                  <div style={{ fontSize: '0.73rem', color: '#92400e', marginTop: 7, fontWeight: 600 }}>
                    ✓ {selectedDistributors.length} distributor{selectedDistributors.length > 1 ? 's' : ''} added
                  </div>
                )}
              </div>

              {/* Date and Branch */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Request Date *</label>
                  <input type="date" value={requestDate} onChange={e => setRequestDate(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Branch *</label>
                  {user?.branch ? (
                    <div style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.87rem', background: '#faf9f9', color: '#374151', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#c41e3a', fontWeight: 700 }}>🏪</span>
                      <span style={{ fontWeight: 700 }}>{getBranchDisplayName(user.branch)}</span>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: 4 }}>(your branch)</span>
                    </div>
                  ) : (
                    <select value={requestBranch} onChange={e => setRequestBranch(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box', background: '#fff', color: '#374151', cursor: 'pointer' }}>
                      <option value="">Select branch…</option>
                      {BRANCH_DETAILS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  )}
                </div>
              </div>

              {/* Requested Products */}
              <div>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '.12em', color: '#c41e3a', textTransform: 'uppercase', marginBottom: 10 }}>Requested Products *</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {productRows.map((row, idx) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 0.8fr 0.8fr auto auto', gap: 8, alignItems: 'end' }}>
                        <div style={{ position: 'relative' }}>
                          {idx === 0 && <label style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 3 }}>Product *</label>}
                          <input type="text" value={row.product} onChange={e => updateProductRow(idx, 'product', e.target.value)} onFocus={() => focusProductRow(idx)} onBlur={() => blurProductRow(idx)} placeholder="Click to browse or type to search…"
                            style={{ width: '100%', padding: '8px 11px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                          {row.showSug && row.suggestions.length > 0 && (
                            <div style={{ position: 'absolute', zIndex: 200, width: '100%', background: '#fff', border: '1.5px solid #fecaca', borderRadius: 9, maxHeight: 170, overflowY: 'auto', boxShadow: '0 6px 20px rgba(196,30,58,.12)', top: '100%', left: 0 }}>
                              {row.suggestions.map((p, si) => (
                                <div key={si} onClick={() => selectProductSuggestion(idx, p)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #fff5f5', fontSize: '0.84rem', display: 'flex', justifyContent: 'space-between' }}>
                                  <span style={{ fontWeight: 600 }}>{p.name || p.description}</span>
                                  <span style={{ color: '#c41e3a', fontSize: '0.78rem', fontWeight: 700 }}>DP: {formatCurrency(p.dp || p.price || 0)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          {idx === 0 && <label style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 3 }}>Qty *</label>}
                          <input type="number" value={row.quantity} onChange={e => updateProductRow(idx, 'quantity', e.target.value)} min="1" placeholder="0"
                            style={{ width: '100%', padding: '8px 11px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', textAlign: 'center' }} />
                        </div>
                        <div>
                          {idx === 0 && <label style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 3 }}>Unit</label>}
                          <input type="text" value={row.unit} onChange={e => updateProductRow(idx, 'unit', e.target.value)} placeholder="boxes"
                            style={{ width: '100%', padding: '8px 11px', border: '1.5px solid #e8d5d8', borderRadius: 8, fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <button type="button" onClick={() => setScanRowIdx(scanRowIdx === idx ? null : idx)} title="Scan barcode for this row"
                          style={{ padding: '8px 10px', borderRadius: 8, border: scanRowIdx === idx ? '2px solid #c41e3a' : '1.5px solid #d1d5db', background: scanRowIdx === idx ? '#fff0f3' : '#f8fafc', color: scanRowIdx === idx ? '#c41e3a' : '#374151', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', flexShrink: 0 }}>
                          🔲
                        </button>
                        <button type="button" onClick={() => removeProductRow(idx)} disabled={productRows.length === 1}
                          style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: productRows.length===1?'#f1f5f9':'#fef2f2', color: productRows.length===1?'#94a3b8':'#c41e3a', cursor: productRows.length===1?'not-allowed':'pointer', fontWeight: 700, fontSize: '0.85rem' }}>×</button>
                      </div>
                      {scanRowIdx === idx && (
                        <BarcodeScanner autoFocus={true} placeholder="Aim scanner at product barcode…" style={{ marginLeft: 0 }}
                          onResult={(result) => {
                            const rows = [...productRows];
                            rows[idx].product = result.productName || '';
                            rows[idx].suggestions = [];
                            rows[idx].showSug = false;
                            setProductRows(rows);
                            setScanRowIdx(null);
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addProductRow} style={{ marginTop: 10, padding: '8px 16px', borderRadius: 9, border: '1.5px dashed #fecaca', background: '#fff0f3', color: '#c41e3a', cursor: 'pointer', fontWeight: 700, fontSize: '0.83rem' }}>➕ Add Product Row</button>
              </div>

              {/* Notes */}
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#374151', display: 'block', marginBottom: 4 }}>Purpose / Notes</label>
                <textarea value={requestNotes} onChange={e => setRequestNotes(e.target.value)} rows={3} placeholder="Brief description of field program activity or purpose…"
                  style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #e8d5d8', borderRadius: 9, fontSize: '0.85rem', resize: 'none', outline: 'none', boxSizing: 'border-box' }} />
              </div>

              {/* Terms */}
              <div style={{ background: '#fff8f8', border: '2px solid #fecaca', borderRadius: 11, padding: 16, maxHeight: 220, overflowY: 'auto' }}>
                <div style={{ fontWeight: 800, color: '#c41e3a', fontSize: '0.87rem', marginBottom: 10 }}>Terms and Conditions of Stock Handling Commitment</div>
                <ol style={{ paddingLeft: 16, fontSize: '0.82rem', lineHeight: 1.65, color: '#374151' }}>
                  <li><strong>Stock Accountability:</strong> The distributor is fully responsible for all stock received and must account for every item.</li>
                  <li><strong>FEFO Compliance:</strong> Stock will be issued following First Expired First Out (FEFO) principles.</li>
                  <li><strong>Storage Requirements:</strong> Stock must be stored in appropriate conditions as per product specifications.</li>
                  <li><strong>Damage/Loss Reporting:</strong> Any damaged or lost stock must be reported immediately to the branch manager.</li>
                  <li><strong>Return Policy:</strong> Unused stock may be returned within 30 days if in original condition and packaging.</li>
                  <li><strong>Sales Records:</strong> Complete sales records must be maintained and submitted as required.</li>
                  <li><strong>Payment Terms:</strong> Payment for stock must be made according to agreed terms.</li>
                  <li><strong>Compliance:</strong> All stock must be used/sold in compliance with Dynapharm policies and local regulations.</li>
                </ol>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer', fontSize: '0.83rem', color: '#374151' }}>
                  <input type="checkbox" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#c41e3a' }} />
                  I have read and agree to the Terms and Conditions of Stock Handling Commitment *
                </label>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #f0e8ea', display: 'flex', gap: 10, justifyContent: 'flex-end', background: '#fff', flexShrink: 0 }}>
              <button onClick={() => setShowForm(false)} style={{ padding: '10px 20px', border: '1.5px solid #e8d5d8', borderRadius: 11, background: '#fff', cursor: 'pointer', color: '#64748b', fontWeight: 600, fontSize: '0.87rem' }}>Cancel</button>
              <button onClick={handleSubmit} disabled={submitting || !agreeTerms || selectedDistributors.length === 0 || productRows.filter(r => r.product.trim() && r.quantity).length === 0}
                style={{ padding: '11px 32px', border: 'none', borderRadius: 11, background: 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '0.92rem', opacity: (submitting || !agreeTerms || selectedDistributors.length === 0) ? 0.55 : 1, boxShadow: '0 4px 14px rgba(196,30,58,0.3)' }}>
                {submitting ? '⏳ Submitting…' : '✅ Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── BODY SYSTEMS for Health Checkup ─── */
const CHECKUP_BODY_SYSTEMS = [
  { id: 'cardiovascular', label: 'Cardiovascular System', questions: ['Blood pressure issues', 'Heart palpitations', 'Chest pain', 'Shortness of breath', 'Swollen ankles', 'Numbness in extremities', 'Cold hands/feet'] },
  { id: 'respiratory', label: 'Respiratory System', questions: ['Chronic cough', 'Difficulty breathing', 'Asthma/allergies', 'Frequent colds', 'Wheezing', 'Sinus problems'] },
  { id: 'digestive', label: 'Digestive System', questions: ['Stomach pain', 'Bloating/gas', 'Constipation/diarrhea', 'Poor appetite', 'Acid reflux/heartburn', 'Nausea', 'Liver problems'] },
  { id: 'musculoskeletal', label: 'Musculoskeletal System', questions: ['Joint pain', 'Back pain', 'Muscle weakness', 'Limited mobility', 'Arthritis', 'Bone density concerns'] },
  { id: 'nervous', label: 'Nervous System', questions: ['Headaches/migraines', 'Dizziness', 'Numbness/tingling', 'Sleep problems', 'Memory issues', 'Stress/anxiety', 'Depression'] },
  { id: 'endocrine', label: 'Endocrine System', questions: ['Diabetes', 'Thyroid issues', 'Weight changes', 'Fatigue', 'Hormonal imbalance', 'Excessive thirst'] },
  { id: 'immune', label: 'Immune System', questions: ['Frequent infections', 'Slow healing', 'Allergic reactions', 'Autoimmune conditions', 'HIV/AIDS related', 'Low energy'] },
  { id: 'urinary', label: 'Urinary System', questions: ['Frequent urination', 'Pain during urination', 'Kidney problems', 'Incontinence', 'Prostate issues'] },
  { id: 'reproductive', label: 'Reproductive System', questions: ['Menstrual irregularities', 'Fertility concerns', 'Menopause symptoms', 'Sexual health issues'] },
  { id: 'skin', label: 'Skin & Hair', questions: ['Skin rashes', 'Acne', 'Eczema/psoriasis', 'Hair loss', 'Dry/oily skin', 'Wound healing issues'] },
];

const CHECKUP_EMPTY_FORM = {
  fullName: '', phone: '', email: '', dob: '', gender: '',
  weight: '', height: '',
  primaryReason: '', waterIntake: '', exerciseFreq: '', sleepHours: '', stressLevel: '',
  currentMedications: '', allergies: '', medicalHistory: '',
  symptoms: {}, notes: '', declaration: false,
};

function CheckUpBookingTab() {
  const { user } = useAuth();
  const selectedPortalBranch = useContext(PortalBranchContext);
  const effectiveBranch = selectedPortalBranch || user?.branch || '';
  const branchDisplayName = getBranchDisplayName(effectiveBranch) || effectiveBranch;

  const [subTab, setSubTab] = useState('book');
  const [customerType, setCustomerType] = useState('non-member');
  const [distributors, setDistributors] = useState([]);
  const [distributorSearch, setDistributorSearch] = useState('');
  const [selectedDistributor, setSelectedDistributor] = useState(null);
  const [referralName, setReferralName] = useState('');
  const [referralNB, setReferralNB] = useState('');
  const [refDistSearch, setRefDistSearch] = useState('');
  const [refDistResults, setRefDistResults] = useState([]);
  const [refDistLoading, setRefDistLoading] = useState(false);
  const [selectedRefDist, setSelectedRefDist] = useState(null);
  const [form, setForm] = useState({ ...CHECKUP_EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [appointments, setAppointments] = useState([]);
  const [aptsLoading, setAptsLoading] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState({});
  const [selectedApt, setSelectedApt] = useState(null);
  const [aptFilter, setAptFilter] = useState('upcoming');
  const [previewOpen, setPreviewOpen] = useState(false);

  const isMember = customerType === 'member';
  const DEFAULT_REF_NAME = COMPANY_INFO.defaultReferralName || 'Dynapharm Namibia';
  const DEFAULT_REF_NB = COMPANY_INFO.defaultReferralNB || 'NB005676';
  const effectiveReferralName = isMember
    ? (selectedDistributor?.distributor_name || '')
    : (selectedRefDist ? selectedRefDist.fullName : (referralName.trim() || DEFAULT_REF_NAME));
  const effectiveReferralNB = isMember
    ? (selectedDistributor?.distributor_code || '')
    : (selectedRefDist ? selectedRefDist.nbNumber : (referralNB.trim() || DEFAULT_REF_NB));

  const searchRefDistributors = (q) => {
    setRefDistSearch(q);
    if (q.length < 2) { setRefDistResults([]); return; }
    setRefDistLoading(true);
    clearTimeout(window._refDistTimer);
    window._refDistTimer = setTimeout(async () => {
      try {
        const res = await api.distributors.search(q);
        setRefDistResults(Array.isArray(res) ? res : res.distributors || []);
      } catch { setRefDistResults([]); }
      finally { setRefDistLoading(false); }
    }, 300);
  };

  const selectRefDist = (d) => {
    setSelectedRefDist(d);
    setRefDistSearch('');
    setRefDistResults([]);
    setReferralName(d.fullName || '');
    setReferralNB(d.nbNumber || '');
  };

  const clearRefDist = () => {
    setSelectedRefDist(null);
    setReferralName('');
    setReferralNB('');
    setRefDistSearch('');
    setRefDistResults([]);
  };

  const filteredDistributors = distributors.filter(d =>
    !distributorSearch ||
    (d.distributor_name || '').toLowerCase().includes(distributorSearch.toLowerCase()) ||
    (d.distributor_code || '').toLowerCase().includes(distributorSearch.toLowerCase())
  );

  useEffect(() => {
    api.distributors.list()
      .then(data => setDistributors(Array.isArray(data) ? data : data.distributors || []))
      .catch(() => {});
  }, []);

  const loadAppointments = () => {
    setAptsLoading(true);
    const params = 'type=checkup' + (effectiveBranch ? `&branch=${encodeURIComponent(effectiveBranch)}` : '');
    api.appointments.list(params)
      .then(data => setAppointments(Array.isArray(data) ? data : []))
      .catch(() => setAppointments([]))
      .finally(() => setAptsLoading(false));
  };

  useEffect(() => {
    if (subTab === 'appointments') loadAppointments();
  }, [subTab, effectiveBranch]);

  const updateField = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const toggleSymptom = (system, symptom) => {
    setForm(prev => {
      const current = prev.symptoms[system] || [];
      const updated = current.includes(symptom) ? current.filter(s => s !== symptom) : [...current, symptom];
      return { ...prev, symptoms: { ...prev.symptoms, [system]: updated } };
    });
  };

  const calcBMI = () => {
    const h = parseFloat(form.height);
    const w = parseFloat(form.weight);
    if (!h || !w || h <= 0) return null;
    return (w / ((h / 100) ** 2)).toFixed(1);
  };
  const bmiValue = calcBMI();
  const bmiCategory = (bmi) => {
    if (!bmi) return '';
    const b = parseFloat(bmi);
    if (b < 18.5) return 'Underweight';
    if (b < 25) return 'Normal';
    if (b < 30) return 'Overweight';
    return 'Obese';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isMember && !selectedDistributor) { setError('Please select the client\'s NB/DZ number'); return; }
    if (!form.fullName.trim()) { setError('Please enter the client\'s full name'); return; }
    if (!form.phone.trim()) { setError('Please enter the client\'s phone number'); return; }
    if (!form.declaration) { setError('Please confirm the client\'s declaration'); return; }
    setError('');
    setSubmitting(true);
    try {
      const now = new Date();
      await api.appointments.create({
        type: 'checkup',
        full_name: form.fullName,
        phone: form.phone,
        email: form.email,
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().slice(0, 5),
        branch: branchDisplayName,
        notes: form.notes,
        client_reference: effectiveReferralNB,
        status: 'pending',
        data: {
          customer_type: customerType,
          membershipStatus: isMember ? 'member' : 'referred',
          membership_status: isMember ? 'member' : 'referred',
          gender: form.gender,
          dob: form.dob,
          height: form.height,
          weight: form.weight,
          bmi: bmiValue,
          bmi_category: bmiCategory(bmiValue),
          primary_reason: form.primaryReason,
          water_intake: form.waterIntake,
          exercise_freq: form.exerciseFreq,
          sleep_hours: form.sleepHours,
          stress_level: form.stressLevel,
          current_medications: form.currentMedications,
          allergies: form.allergies,
          medical_history: form.medicalHistory,
          symptoms: form.symptoms,
          referral_name: effectiveReferralName,
          referral_nb: effectiveReferralNB,
          booked_by: user?.username || user?.name || 'Branch Staff',
          branch: branchDisplayName,
        },
      });
      setSubmitted(true);
    } catch (err) {
      setError(err.message || 'Failed to submit appointment');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSubmitted(false);
    setCustomerType('non-member');
    setSelectedDistributor(null);
    setDistributorSearch('');
    setReferralName('');
    setReferralNB('');
    setSelectedRefDist(null);
    setRefDistSearch('');
    setRefDistResults([]);
    setForm({ ...CHECKUP_EMPTY_FORM });
    setError('');
  };

  const updateStatus = async (aptId, newStatus) => {
    setStatusUpdating(prev => ({ ...prev, [aptId]: true }));
    try {
      await api.appointments.update(aptId, { status: newStatus });
      setAppointments(prev => prev.map(a => a.id === aptId ? { ...a, status: newStatus } : a));
    } catch (err) {
      alert('Failed to update status: ' + (err.message || 'Unknown error'));
    } finally {
      setStatusUpdating(prev => ({ ...prev, [aptId]: false }));
    }
  };

  const aptStatusColor = (s) => {
    switch ((s || '').toLowerCase()) {
      case 'completed': return { bg: '#dcfce7', color: '#166534' };
      case 'cancelled': return { bg: '#fee2e2', color: '#991b1b' };
      case 'in_progress': return { bg: '#dbeafe', color: '#1e40af' };
      case 'checked_in': return { bg: '#ede9fe', color: '#6d28d9' };
      case 'scheduled': return { bg: '#fef9c3', color: '#854d0e' };
      default: return { bg: '#f1f5f9', color: '#475569' };
    }
  };

  const upcomingApts = appointments.filter(a => !['completed', 'cancelled'].includes((a.status || '').toLowerCase()));
  const completedApts = appointments.filter(a => (a.status || '').toLowerCase() === 'completed');
  const cancelledApts = appointments.filter(a => (a.status || '').toLowerCase() === 'cancelled');
  const displayApts = aptFilter === 'upcoming' ? upcomingApts : aptFilter === 'completed' ? completedApts : cancelledApts;

  return (
    <div>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#c41e3a,#8b0000)', borderRadius: 14, padding: '18px 22px', marginBottom: 22, color: '#fff', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: 10 }}>
          <Heart size={28} color="#fff" />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1.15rem' }}>Full Body Check Up Booking</div>
          <div style={{ opacity: 0.82, fontSize: '0.88rem', marginTop: 2 }}>{branchDisplayName} Branch · Book client appointments for health consultations</div>
        </div>
      </div>

      {/* Sub-tab switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 22, borderBottom: '2px solid #f0e8ea', paddingBottom: 0 }}>
        {[
          { id: 'book', icon: '📋', label: 'Book Appointment' },
          { id: 'appointments', icon: '📅', label: 'Appointments' },
        ].map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            style={{ padding: '10px 18px', border: 'none', borderBottom: subTab === t.id ? '3px solid #c41e3a' : '3px solid transparent', background: 'none', fontWeight: subTab === t.id ? 700 : 500, color: subTab === t.id ? '#c41e3a' : '#64748b', cursor: 'pointer', fontSize: '0.92rem', transition: 'all .15s', marginBottom: -2 }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── BOOK APPOINTMENT ── */}
      {subTab === 'book' && (
        submitted ? (
          <div style={{ maxWidth: 500, margin: '0 auto', padding: '40px 20px', textAlign: 'center' }}>
            <div style={{ width: 80, height: 80, background: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <CheckCircle size={40} color="#16a34a" />
            </div>
            <h2 style={{ fontWeight: 800, fontSize: '1.4rem', color: '#111827', marginBottom: 8 }}>Appointment Booked!</h2>
            <p style={{ color: '#6b7280', marginBottom: 24 }}>The client's full body checkup form has been submitted. A consultant at the <strong>{branchDisplayName}</strong> branch will attend to them shortly.</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={resetForm} style={{ padding: '10px 24px', background: 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer' }}>Book Another</button>
              <button onClick={() => { resetForm(); setSubTab('appointments'); }} style={{ padding: '10px 24px', background: '#f1f5f9', color: '#374151', border: '1.5px solid #e2e8f0', borderRadius: 10, fontWeight: 600, cursor: 'pointer' }}>View Appointments</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ maxWidth: 800, margin: '0 auto', paddingBottom: 90 }}>
            {error && <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 16px', marginBottom: 16, color: '#991b1b', fontWeight: 600, fontSize: '0.9rem' }}>{error}</div>}

            {/* Customer type toggle */}
            <div style={{ background: '#fff', border: '1.5px solid #e8d5d8', borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Client Type</div>
              <div style={{ display: 'flex', gap: 10 }}>
                {[{ id: 'member', label: '🏅 Registered Member', sub: 'Has NB/DZ number' }, { id: 'non-member', label: '👤 Non-Member', sub: 'Walk-in or referred' }].map(ct => (
                  <button key={ct.id} type="button" onClick={() => { setCustomerType(ct.id); setSelectedDistributor(null); setDistributorSearch(''); }}
                    style={{ flex: 1, padding: '10px 14px', border: `2px solid ${customerType === ct.id ? '#c41e3a' : '#e2e8f0'}`, borderRadius: 10, background: customerType === ct.id ? '#fff0f3' : '#fafafa', cursor: 'pointer', textAlign: 'left', transition: 'all .15s' }}>
                    <div style={{ fontWeight: 700, color: customerType === ct.id ? '#c41e3a' : '#374151', fontSize: '0.88rem' }}>{ct.label}</div>
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 2 }}>{ct.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Member NB lookup */}
            {isMember && (
              <div style={{ background: '#fff', border: '1.5px solid #e8d5d8', borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#374151', marginBottom: 10 }}>Member NB/DZ Number</div>
                {selectedDistributor ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff0f3', border: '1.5px solid #fca5a5', borderRadius: 8, padding: '10px 14px' }}>
                    <div>
                      <span style={{ fontWeight: 800, color: '#c41e3a' }}>{selectedDistributor.distributor_code}</span>
                      <span style={{ color: '#374151', marginLeft: 8 }}>{selectedDistributor.distributor_name}</span>
                    </div>
                    <button type="button" onClick={() => setSelectedDistributor(null)} style={{ background: 'none', border: 'none', color: '#c41e3a', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>Change</button>
                  </div>
                ) : (
                  <div>
                    <div style={{ position: 'relative', marginBottom: 8 }}>
                      <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                      <input value={distributorSearch} onChange={e => setDistributorSearch(e.target.value)}
                        placeholder="Search by NB/DZ number or member name..."
                        style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 9, paddingBottom: 9, border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #f0e8ea', borderRadius: 8, background: '#fff' }}>
                      {filteredDistributors.length === 0 ? (
                        <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>No distributors found</div>
                      ) : filteredDistributors.slice(0, 20).map(d => (
                        <button type="button" key={d.id} onClick={() => {
                          setSelectedDistributor(d);
                          setDistributorSearch('');
                          if (d.distributor_name) updateField('fullName', d.distributor_name);
                          if (d.mobile_no || d.phone) updateField('phone', d.mobile_no || d.phone || '');
                          if (d.email) updateField('email', d.email);
                        }}
                          style={{ width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderBottom: '1px solid #f9f0f2', background: 'none', cursor: 'pointer', fontSize: '0.86rem', transition: 'background .1s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#fff0f3'}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                          <span style={{ fontWeight: 700, color: '#c41e3a' }}>{d.distributor_code}</span>
                          <span style={{ color: '#374151', marginLeft: 8 }}>{d.distributor_name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Non-member referral */}
            {!isMember && (
              <div style={{ background: '#fff', border: '1.5px solid #e8d5d8', borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#374151', marginBottom: 10 }}>Referring Distributor (Optional)</div>

                {selectedRefDist ? (
                  /* Selected referral card */
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff0f3', border: '1.5px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
                    <div>
                      <span style={{ fontWeight: 800, color: '#c41e3a' }}>{selectedRefDist.nbNumber}</span>
                      <span style={{ color: '#374151', marginLeft: 8 }}>{selectedRefDist.fullName}</span>
                    </div>
                    <button type="button" onClick={clearRefDist} style={{ background: 'none', border: 'none', color: '#c41e3a', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>Change</button>
                  </div>
                ) : (
                  /* Search input + dropdown */
                  <div style={{ position: 'relative', marginBottom: 8 }}>
                    <div style={{ position: 'relative' }}>
                      <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                      <input
                        value={refDistSearch}
                        onChange={e => searchRefDistributors(e.target.value)}
                        placeholder="Search distributor by name or NB/DZ number..."
                        style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 9, paddingBottom: 9, border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }}
                      />
                      {refDistLoading && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#94a3b8' }}>Searching…</span>}
                    </div>
                    {refDistResults.length > 0 && (
                      <div style={{ position: 'absolute', zIndex: 50, left: 0, right: 0, background: '#fff', border: '1.5px solid #e8d5d8', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.10)', maxHeight: 180, overflowY: 'auto', marginTop: 2 }}>
                        {refDistResults.map((d, idx) => (
                          <button type="button" key={d.distributorId || idx}
                            onClick={() => selectRefDist(d)}
                            style={{ width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderBottom: '1px solid #f9f0f2', background: 'none', cursor: 'pointer', fontSize: '0.86rem' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#fff0f3'}
                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                            <span style={{ fontWeight: 700, color: '#c41e3a' }}>{d.nbNumber}</span>
                            <span style={{ color: '#374151', marginLeft: 8 }}>{d.fullName}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {refDistSearch.length >= 2 && !refDistLoading && refDistResults.length === 0 && (
                      <div style={{ padding: '8px 12px', color: '#94a3b8', fontSize: '0.84rem', background: '#fafafa', border: '1px solid #f0e8ea', borderRadius: 8, marginTop: 2 }}>No distributors found — you can enter manually below</div>
                    )}
                  </div>
                )}

                {/* Manual fallback fields (shown when no distributor selected) */}
                {!selectedRefDist && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 8 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Referral Name (manual)</label>
                      <input value={referralName} onChange={e => setReferralName(e.target.value)} placeholder={`Default: ${DEFAULT_REF_NAME}`}
                        style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Referral NB/DZ Number (manual)</label>
                      <input value={referralNB} onChange={e => setReferralNB(e.target.value)} placeholder={`Default: ${DEFAULT_REF_NB}`}
                        style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                )}

                <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 6 }}>
                  {selectedRefDist
                    ? <>Referral set to <strong>{selectedRefDist.fullName} ({selectedRefDist.nbNumber})</strong></>
                    : <>If blank, <strong>{DEFAULT_REF_NAME} ({DEFAULT_REF_NB})</strong> will be used as default referral.</>}
                </p>
              </div>
            )}

            {/* Personal Information */}
            <div style={{ background: '#fff', border: '1.5px solid #e8d5d8', borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#374151', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={16} color="#c41e3a" /> Personal Information
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Full Name *', key: 'fullName', type: 'text', placeholder: 'Client full name' },
                  { label: 'Phone Number *', key: 'phone', type: 'tel', placeholder: '+264 8x xxx xxxx' },
                  { label: 'Email', key: 'email', type: 'email', placeholder: 'client@email.com' },
                  { label: 'Date of Birth', key: 'dob', type: 'date', placeholder: '' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{f.label}</label>
                    <input type={f.type} value={form[f.key]} onChange={e => updateField(f.key, e.target.value)} placeholder={f.placeholder}
                      style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                ))}
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Gender</label>
                  <select value={form.gender} onChange={e => updateField('gender', e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.87rem', outline: 'none', background: '#fff', boxSizing: 'border-box' }}>
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Branch</label>
                  <input type="text" readOnly value={branchDisplayName}
                    style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.87rem', background: '#f8fafc', color: '#64748b', boxSizing: 'border-box', fontStyle: 'italic' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Height (cm)</label>
                  <input type="number" min="50" max="250" value={form.height} onChange={e => updateField('height', e.target.value)} placeholder="e.g. 165"
                    style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Weight (kg)</label>
                  <input type="number" min="1" max="400" value={form.weight} onChange={e => updateField('weight', e.target.value)} placeholder="e.g. 70"
                    style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                {bmiValue && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 10, border: `2px solid ${parseFloat(bmiValue) < 18.5 ? '#93c5fd' : parseFloat(bmiValue) < 25 ? '#86efac' : parseFloat(bmiValue) < 30 ? '#fcd34d' : '#fca5a5'}`, background: parseFloat(bmiValue) < 18.5 ? '#eff6ff' : parseFloat(bmiValue) < 25 ? '#f0fdf4' : parseFloat(bmiValue) < 30 ? '#fefce8' : '#fef2f2' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 900, color: parseFloat(bmiValue) < 18.5 ? '#2563eb' : parseFloat(bmiValue) < 25 ? '#16a34a' : parseFloat(bmiValue) < 30 ? '#d97706' : '#dc2626' }}>{bmiValue}</div>
                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>BMI</div>
                        <div style={{ fontWeight: 700, color: parseFloat(bmiValue) < 18.5 ? '#2563eb' : parseFloat(bmiValue) < 25 ? '#16a34a' : parseFloat(bmiValue) < 30 ? '#d97706' : '#dc2626' }}>{bmiCategory(bmiValue)}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Lifestyle & Health History */}
            <div style={{ background: '#fff', border: '1.5px solid #e8d5d8', borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#374151', marginBottom: 12 }}>🩺 Lifestyle &amp; Health History</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Primary Reason for Visit</label>
                  <input type="text" value={form.primaryReason} onChange={e => updateField('primaryReason', e.target.value)} placeholder="e.g. Weight management, Joint pain, Fatigue..."
                    style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                {[
                  { label: 'Water Intake per Day', key: 'waterIntake', options: ['Less than 1L/day', '1–2L/day', '2–3L/day', 'More than 3L/day'] },
                  { label: 'Exercise Frequency', key: 'exerciseFreq', options: ['None', '1–2x per week', '3–4x per week', 'Daily'] },
                  { label: 'Sleep (hours/night)', key: 'sleepHours', options: ['Less than 5', '5–6', '6–7', '7–8', 'More than 8'] },
                  { label: 'Stress Level (1–10)', key: 'stressLevel', options: [1,2,3,4,5,6,7,8,9,10].map(n => `${n}`) },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{f.label}</label>
                    <select value={form[f.key]} onChange={e => updateField(f.key, e.target.value)}
                      style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.87rem', outline: 'none', background: '#fff', boxSizing: 'border-box' }}>
                      <option value="">— Select —</option>
                      {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
                {[
                  { label: 'Current Medications', key: 'currentMedications', placeholder: 'e.g. Metformin 500mg, Aspirin...' },
                  { label: 'Known Allergies', key: 'allergies', placeholder: 'e.g. Penicillin, Peanuts...' },
                ].map(f => (
                  <div key={f.key}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{f.label}</label>
                    <input type="text" value={form[f.key]} onChange={e => updateField(f.key, e.target.value)} placeholder={f.placeholder}
                      style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                ))}
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Medical History</label>
                  <input type="text" value={form.medicalHistory} onChange={e => updateField('medicalHistory', e.target.value)} placeholder="e.g. Diabetes, Hypertension, previous surgeries..."
                    style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.87rem', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
            </div>

            {/* Symptom Checklist */}
            <div style={{ background: '#fff', border: '1.5px solid #e8d5d8', borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#374151', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Heart size={16} color="#c41e3a" /> Symptom Checklist
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                {CHECKUP_BODY_SYSTEMS.map(system => (
                  <div key={system.id} style={{ gridColumn: window.innerWidth < 640 ? '1 / -1' : 'auto' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#c41e3a', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid #f9d5da' }}>{system.label}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 4 }}>
                      {system.questions.map(q => (
                        <label key={q} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderRadius: 6, cursor: 'pointer', fontSize: '0.83rem', color: '#374151', transition: 'background .1s' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#fff0f3'}
                          onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                          <input type="checkbox" checked={(form.symptoms[system.id] || []).includes(q)} onChange={() => toggleSymptom(system.id, q)}
                            style={{ accentColor: '#c41e3a', width: 14, height: 14, flexShrink: 0 }} />
                          {q}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes & Declaration */}
            <div style={{ background: '#fff', border: '1.5px solid #e8d5d8', borderRadius: 12, padding: '14px 18px', marginBottom: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Additional Notes</label>
                <textarea value={form.notes} onChange={e => updateField('notes', e.target.value)} rows={3}
                  placeholder="Any additional health concerns or information the consultant should know..."
                  style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: '0.87rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: '#f8fafc', borderRadius: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.declaration} onChange={e => updateField('declaration', e.target.checked)}
                  style={{ accentColor: '#c41e3a', marginTop: 2, width: 16, height: 16, flexShrink: 0 }} />
                <span style={{ fontSize: '0.83rem', color: '#374151' }}>
                  I confirm that all information provided is accurate and the client has consented to having their health data recorded for consultation purposes.
                </span>
              </label>
            </div>

            {/* Sticky Submit Footer */}
            <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: '2px solid #f0e8ea', padding: '14px 0', zIndex: 20 }}>
              <div style={{ display: 'flex', gap: 10, maxWidth: 800, margin: '0 auto' }}>
                <button type="button" onClick={() => setPreviewOpen(true)}
                  style={{ padding: '11px 20px', border: '1.5px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', color: '#374151', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}>
                  Preview
                </button>
                <button type="submit" disabled={submitting}
                  style={{ flex: 1, padding: '12px 24px', border: 'none', borderRadius: 10, background: submitting ? '#94a3b8' : 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: submitting ? 'not-allowed' : 'pointer', boxShadow: '0 4px 14px rgba(196,30,58,0.3)', transition: 'all .15s' }}>
                  {submitting ? '⏳ Submitting...' : '🩺 Book Checkup Appointment'}
                </button>
              </div>
            </div>

            {/* Preview Modal */}
            {previewOpen && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                onClick={() => setPreviewOpen(false)}>
                <div style={{ background: '#fff', borderRadius: 14, maxWidth: 580, width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: 24 }}
                  onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ fontWeight: 800, color: '#c41e3a', margin: 0 }}>Form Preview</h3>
                    <button type="button" onClick={() => setPreviewOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#64748b' }}>✕</button>
                  </div>
                  <div style={{ background: '#fff0f3', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.85rem' }}>
                    <strong>Type:</strong> {isMember ? 'Registered Member' : 'Non-Member'} &nbsp;|&nbsp; <strong>Referral:</strong> {effectiveReferralName} ({effectiveReferralNB})
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: '0.85rem', marginBottom: 12 }}>
                    <div><strong>Name:</strong> {form.fullName || '—'}</div>
                    <div><strong>Phone:</strong> {form.phone || '—'}</div>
                    <div><strong>Email:</strong> {form.email || '—'}</div>
                    <div><strong>DOB:</strong> {form.dob || '—'}</div>
                    <div><strong>Gender:</strong> {form.gender || '—'}</div>
                    <div><strong>Branch:</strong> {branchDisplayName}</div>
                    <div><strong>Height:</strong> {form.height ? `${form.height} cm` : '—'}</div>
                    <div><strong>Weight:</strong> {form.weight ? `${form.weight} kg` : '—'}</div>
                    {bmiValue && <div style={{ gridColumn: '1/-1' }}><strong>BMI:</strong> {bmiValue} — {bmiCategory(bmiValue)}</div>}
                  </div>
                  {Object.entries(form.symptoms).filter(([, v]) => v.length > 0).length > 0 && (
                    <div style={{ borderTop: '1px solid #f0e8ea', paddingTop: 10, marginTop: 10 }}>
                      <strong style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase' }}>Reported Symptoms</strong>
                      {Object.entries(form.symptoms).filter(([, v]) => v.length > 0).map(([sys, sxs]) => (
                        <div key={sys} style={{ fontSize: '0.83rem', marginTop: 4 }}>
                          <strong style={{ textTransform: 'capitalize' }}>{sys}:</strong> {sxs.join(', ')}
                        </div>
                      ))}
                    </div>
                  )}
                  {form.notes && <div style={{ marginTop: 10, fontSize: '0.85rem' }}><strong>Notes:</strong> {form.notes}</div>}
                </div>
              </div>
            )}
          </form>
        )
      )}

      {/* ── APPOINTMENTS LIST ── */}
      {subTab === 'appointments' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { id: 'upcoming', label: `Upcoming (${upcomingApts.length})`, color: '#1e40af' },
                { id: 'completed', label: `Completed (${completedApts.length})`, color: '#166534' },
                { id: 'cancelled', label: `Cancelled (${cancelledApts.length})`, color: '#991b1b' },
              ].map(f => (
                <button key={f.id} onClick={() => setAptFilter(f.id)}
                  style={{ padding: '7px 14px', border: `1.5px solid ${aptFilter === f.id ? f.color : '#e2e8f0'}`, borderRadius: 8, background: aptFilter === f.id ? f.color : '#fff', color: aptFilter === f.id ? '#fff' : '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', transition: 'all .15s' }}>
                  {f.label}
                </button>
              ))}
            </div>
            <button onClick={loadAppointments}
              style={{ padding: '7px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, background: '#f8fafc', color: '#64748b', fontWeight: 600, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              🔄 Refresh
            </button>
          </div>

          {aptsLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>Loading appointments...</div>
          ) : displayApts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
              <Calendar size={36} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.4 }} />
              <div style={{ fontWeight: 600 }}>No {aptFilter} appointments for {branchDisplayName}</div>
              {aptFilter === 'upcoming' && <button onClick={() => setSubTab('book')} style={{ marginTop: 12, padding: '8px 18px', background: 'linear-gradient(135deg,#c41e3a,#8b0000)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem' }}>Book First Appointment</button>}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {displayApts.map(apt => {
                let aptData = {};
                try { aptData = typeof apt.data === 'string' ? JSON.parse(apt.data) : (apt.data || {}); } catch(e) {}
                const sc = aptStatusColor(apt.status);
                return (
                  <div key={apt.id} style={{ background: '#fff', border: '1.5px solid #e8d5d8', borderRadius: 12, padding: '14px 18px', cursor: 'pointer', transition: 'box-shadow .15s' }}
                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(196,30,58,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                    onClick={() => setSelectedApt(selectedApt?.id === apt.id ? null : apt)}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.95rem' }}>{apt.full_name}</div>
                        <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: 2 }}>
                          {apt.phone} {apt.email ? `· ${apt.email}` : ''} · {apt.date} {apt.time}
                        </div>
                        {aptData.primary_reason && <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 2 }}>Reason: {aptData.primary_reason}</div>}
                        {apt.client_reference && <div style={{ fontSize: '0.78rem', color: '#c41e3a', marginTop: 2 }}>Ref: {apt.client_reference}</div>}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                        <span style={{ padding: '3px 10px', borderRadius: 20, background: sc.bg, color: sc.color, fontSize: '0.78rem', fontWeight: 700, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
                          {(apt.status || 'pending').replace(/_/g, ' ')}
                        </span>
                        {aptData.membershipStatus && (
                          <span style={{ fontSize: '0.75rem', color: aptData.membershipStatus === 'member' ? '#c41e3a' : '#64748b', fontWeight: 600 }}>
                            {aptData.membershipStatus === 'member' ? '🏅 Member' : '👤 Non-Member'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expanded detail + status actions */}
                    {selectedApt?.id === apt.id && (
                      <div style={{ marginTop: 14, borderTop: '1px solid #f0e8ea', paddingTop: 12 }} onClick={e => e.stopPropagation()}>
                        {(aptData.bmi || aptData.gender || aptData.dob) && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 10 }}>
                            {aptData.gender && <div style={{ background: '#f8fafc', borderRadius: 8, padding: '6px 10px', fontSize: '0.8rem' }}><div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>Gender</div><strong>{aptData.gender}</strong></div>}
                            {aptData.dob && <div style={{ background: '#f8fafc', borderRadius: 8, padding: '6px 10px', fontSize: '0.8rem' }}><div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>DOB</div><strong>{aptData.dob}</strong></div>}
                            {aptData.bmi && <div style={{ background: '#f8fafc', borderRadius: 8, padding: '6px 10px', fontSize: '0.8rem' }}><div style={{ color: '#94a3b8', fontSize: '0.72rem' }}>BMI</div><strong>{aptData.bmi} ({aptData.bmi_category || ''})</strong></div>}
                          </div>
                        )}
                        {Object.entries(aptData.symptoms || {}).filter(([, v]) => Array.isArray(v) && v.length > 0).length > 0 && (
                          <div style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>Reported Symptoms</div>
                            {Object.entries(aptData.symptoms).filter(([, v]) => Array.isArray(v) && v.length > 0).map(([sys, sxs]) => (
                              <div key={sys} style={{ fontSize: '0.8rem', color: '#374151', marginBottom: 2 }}>
                                <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{sys}:</span> {sxs.join(', ')}
                              </div>
                            ))}
                          </div>
                        )}
                        {apt.notes && <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 10 }}><strong>Notes:</strong> {apt.notes}</div>}
                        {['completed', 'cancelled'].includes((apt.status || '').toLowerCase()) ? null : (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {apt.status !== 'checked_in' && (
                              <button onClick={() => updateStatus(apt.id, 'checked_in')} disabled={statusUpdating[apt.id]}
                                style={{ padding: '7px 14px', border: 'none', borderRadius: 8, background: '#ede9fe', color: '#6d28d9', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                                {statusUpdating[apt.id] ? '...' : '✅ Check In'}
                              </button>
                            )}
                            {apt.status !== 'in_progress' && (
                              <button onClick={() => updateStatus(apt.id, 'in_progress')} disabled={statusUpdating[apt.id]}
                                style={{ padding: '7px 14px', border: 'none', borderRadius: 8, background: '#dbeafe', color: '#1e40af', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                                {statusUpdating[apt.id] ? '...' : '🔄 In Progress'}
                              </button>
                            )}
                            <button onClick={() => updateStatus(apt.id, 'completed')} disabled={statusUpdating[apt.id]}
                              style={{ padding: '7px 14px', border: 'none', borderRadius: 8, background: '#dcfce7', color: '#166534', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                              {statusUpdating[apt.id] ? '...' : '🎉 Mark Completed'}
                            </button>
                            <button onClick={() => updateStatus(apt.id, 'cancelled')} disabled={statusUpdating[apt.id]}
                              style={{ padding: '7px 14px', border: 'none', borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>
                              {statusUpdating[apt.id] ? '...' : '✕ Cancel'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shared distributor normalizer (used in WalkInSalesTab, BranchCampaignsTab, etc.) ─
function normalizeDistributor(d) {
  return {
    ...d,
    id: d.id || d.distributorId || d.distributor_id || '',
    name: d.name || d.fullName || d.distributor_name || d.full_name || '',
    nb_number: d.nb_number || d.nbNumber || d.distributor_code || '',
    phone: d.phone || d.mobile_no || '',
  };
}

// ── Branch Campaigns Tab ───────────────────────────────────────────────────────
const BRANCH_CAMP_TYPE_LABELS = {
  discount: '🏷️ Discount',
  buy_x_get_y: '🎁 Buy X Get Y',
  bv_achievement: '🏆 BV Achievement',
  elite_bingo: '🎯 Elite Bingo',
  custom: '⚙️ Custom',
};
const BRANCH_CAMP_COLORS = {
  discount: { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8' },
  buy_x_get_y: { bg: '#f0fdf4', border: '#86efac', text: '#166534' },
  bv_achievement: { bg: '#fffbeb', border: '#fcd34d', text: '#92400e' },
  elite_bingo: { bg: '#fdf4ff', border: '#d8b4fe', text: '#6b21a8' },
  custom: { bg: '#f8fafc', border: '#cbd5e1', text: '#475569' },
};

function branchCampBadge(c) {
  const now = new Date();
  const start = new Date(c.start_date);
  const end = new Date(c.end_date);
  if (now > end) return <Badge variant="default">Ended</Badge>;
  if (now < start) return <Badge variant="info">Upcoming</Badge>;
  return <Badge variant="success">Active</Badge>;
}

function isLiveCampaign(c) {
  const now = new Date();
  return now >= new Date(c.start_date) && now <= new Date(c.end_date);
}

function printCampaignReceipt(receipt, branchDisplayName) {
  const isMember = receipt.customer_type === 'member';
  const rawItems = Array.isArray(receipt.items) ? receipt.items : [];

  // Map campaign items to the format expected by generateReceiptHTML
  // Free items show as N$0 with 🎁 label appended to name — customer/dist/branch copies all see them
  const mappedItems = rawItems.map(it => ({
    product_name: it.is_free ? `${it.product_name} 🎁 (FREE)` : it.product_name,
    name:         it.is_free ? `${it.product_name} 🎁 (FREE)` : it.product_name,
    quantity:     it.quantity || 1,
    qty:          it.quantity || 1,
    // Customer copy uses cpPrice (or unit_price as fallback)
    cpPrice:      it.is_free ? 0 : Number(it.cp || 0),
    unit_price:   it.is_free ? 0 : Number(it.cp || it.unit_price || 0),
    unitPrice:    it.is_free ? 0 : Number(it.cp || it.unit_price || 0),
    // Distributor/Branch copies use dpPrice
    dpPrice:      it.is_free ? 0 : Number(it.dp || 0),
    // BV fields
    bv:           it.is_free ? 0 : Number(it.bv || 0),
    lineBV:       it.is_free ? 0 : Number(it.total_bv || 0),
    // Line totals
    line_total:   it.is_free ? 0 : Number(it.total_cp || it.total || 0),
    lineTotal:    it.is_free ? 0 : Number(it.total_cp || it.total || 0),
  }));

  const campaignBanner = `<div style="background:#9b1c2e;color:#fff;text-align:center;padding:5px 10px;border-radius:6px;font-weight:700;font-size:11px;margin-bottom:6px;">🎁 Campaign: ${receipt.campaign_name || 'Campaign Sale'}</div>`;

  const receiptHTML = generateReceiptHTML({
    receiptNumber:   receipt.sale_number,
    branch:          branchDisplayName || receipt.branch,
    items:           mappedItems,
    totalAmount:     Number(receipt.total || 0),
    totalBV:         Number(receipt.total_bv || 0),
    paymentMethod:   'Cash',
    customerType:    isMember ? 'member' : 'non_member',
    customerName:    receipt.customer_name || '',
    nbNumber:        isMember ? (receipt.nb_number || '') : '',
    referralName:    !isMember ? (receipt.referral_name || 'Dynapharm Namibia') : null,
    referralNB:      !isMember ? (receipt.referral_nb || '') : null,
    cashier:         receipt.cashier || null,
    showBV:          true,
    cashback:        0,
    branchAmount:    !isMember ? Number(receipt.total_dp || 0) : null,
    distributorProfit: !isMember ? Number(receipt.profit_amount || 0) : null,
  });

  // Inject campaign banner right after the first <div ...> opening tag
  const withBanner = receiptHTML.replace(
    /(<div[^>]*max-width[^>]*>)/,
    `$1${campaignBanner}`
  );

  printReceipt(withBanner);
}

function BranchCampaignsTab() {
  const { user } = useAuth();
  const portalBranch = useContext(PortalBranchContext);
  const effectiveBranch = portalBranch || user?.branch || '';

  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alertMsg, setAlertMsg] = useState(null);
  const [saleModal, setSaleModal] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [prices, setPrices] = useState([]);
  const [saleForm, setSaleForm] = useState({ paid_product: '', paid_qty: 1, free_product: '', free_qty: 1, notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState('active');
  const [lastReceipt, setLastReceipt] = useState(null);

  // Member search state
  const [campMemberType, setCampMemberType] = useState('member');
  const [campSearch, setCampSearch] = useState('');
  const [campResults, setCampResults] = useState([]);
  const [campSelected, setCampSelected] = useState(null);
  const [nonMemberName, setNonMemberName] = useState('');
  const [campRefSearch, setCampRefSearch] = useState('');
  const [campRefResults, setCampRefResults] = useState([]);
  const [campRefSelected, setCampRefSelected] = useState(null);
  const campSearchTimer = useRef(null);
  const campRefTimer = useRef(null);

  useEffect(() => {
    setLoading(true);
    api.get('/campaigns').then(d => {
      const all = Array.isArray(d) ? d : (d.campaigns || []);
      const relevant = all.filter(c => {
        if (c.status === 'pending_approval' || c.status === 'rejected') return false;
        const scope = (c.scope || '').toLowerCase();
        if (!scope || scope === 'countrywide' || scope === 'nationwide' || scope === 'all') return true;
        const cond = typeof c.conditions === 'string'
          ? (() => { try { return JSON.parse(c.conditions); } catch { return {}; } })()
          : (c.conditions || {});
        const stockAssignments = Array.isArray(cond.stock_assignments) ? cond.stock_assignments : [];
        const assignedBranches = stockAssignments.map(a => a.branch).filter(Boolean);
        if (assignedBranches.includes('all') || assignedBranches.includes(effectiveBranch)) return true;
        if (assignedBranches.length > 0) return false;
        let branches = c.target_branches;
        if (typeof branches === 'string') { try { branches = JSON.parse(branches); } catch { return true; } }
        if (Array.isArray(branches) && branches.length > 0) {
          return branches.includes('all') || branches.includes(effectiveBranch);
        }
        return true;
      });
      setCampaigns(relevant);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [effectiveBranch]);

  const searchCampMember = (q) => {
    setCampSearch(q);
    if (campSelected) setCampSelected(null);
    setCampResults([]);
    if (!q || q.length < 2) return;
    if (campSearchTimer.current) clearTimeout(campSearchTimer.current);
    campSearchTimer.current = setTimeout(async () => {
      try {
        const res = await api.distributors.search(q);
        setCampResults(Array.isArray(res) ? res : (res.distributors || []));
      } catch { setCampResults([]); }
    }, 300);
  };

  const selectCampMember = (d) => {
    const nd = normalizeDistributor(d);
    setCampSelected(nd);
    setCampResults([]);
    setCampSearch(nd.nb_number && nd.name ? `${nd.nb_number} — ${nd.name}` : nd.name || nd.nb_number || '');
  };

  const searchCampRef = (q) => {
    setCampRefSearch(q);
    if (campRefSelected) setCampRefSelected(null);
    setCampRefResults([]);
    if (!q || q.length < 2) return;
    if (campRefTimer.current) clearTimeout(campRefTimer.current);
    campRefTimer.current = setTimeout(async () => {
      try {
        const res = await api.distributors.search(q);
        setCampRefResults(Array.isArray(res) ? res : (res.distributors || []));
      } catch { setCampRefResults([]); }
    }, 300);
  };

  const selectCampRef = (d) => {
    const nd = normalizeDistributor(d);
    setCampRefSelected(nd);
    setCampRefResults([]);
    setCampRefSearch(nd.nb_number && nd.name ? `${nd.nb_number} — ${nd.name}` : nd.name || nd.nb_number || '');
  };

  const openSaleModal = (c) => {
    setSaleModal(c);
    setLastReceipt(null);
    const cond = typeof c.conditions === 'string' ? (() => { try { return JSON.parse(c.conditions); } catch { return {}; } })() : (c.conditions || {});
    const prize = typeof c.prize === 'string' ? (() => { try { return JSON.parse(c.prize); } catch { return {}; } })() : (c.prize || {});
    const productsText = getProductsText(cond);
    const prefillPaid = productsText.split(',')[0]?.trim() || '';
    const prefillFree = prize.free_product || '';
    const prefillBuyQty = cond.buy_qty || 1;
    const prefillGetQty = cond.get_qty || 1;
    setSaleForm({ paid_product: prefillPaid, paid_qty: prefillBuyQty, free_product: prefillFree, free_qty: prefillGetQty, notes: '' });
    setCampMemberType('member');
    setCampSearch(''); setCampResults([]); setCampSelected(null);
    setNonMemberName('');
    setCampRefSearch(''); setCampRefResults([]); setCampRefSelected(null);
    setAlertMsg(null);
    api.stock.branchInventory(`branch=${encodeURIComponent(effectiveBranch)}`).then(d => {
      setInventory(Array.isArray(d) ? d : (d.inventory || []));
    }).catch(() => {});
    api.get('/prices').then(d => {
      setPrices(Array.isArray(d) ? d : (d.prices || d.products || []));
    }).catch(() => {});
  };

  // Derive products_text from conditions, handling both array (conditions.products) and string (conditions.products_text)
  const getProductsText = (cond) => {
    if (cond.products_text && typeof cond.products_text === 'string' && cond.products_text.trim()) {
      return cond.products_text.trim();
    }
    if (Array.isArray(cond.products) && cond.products.length > 0) {
      return cond.products.join(', ');
    }
    return '';
  };

  // Derive campaign products directly from campaign setup (not from user selection)
  const getCampProducts = (c) => {
    if (!c) return { paidProduct: '', freeProduct: '', buyQty: 1, getQty: 1 };
    const cond = typeof c.conditions === 'string' ? (() => { try { return JSON.parse(c.conditions); } catch { return {}; } })() : (c.conditions || {});
    const prize = typeof c.prize === 'string' ? (() => { try { return JSON.parse(c.prize); } catch { return {}; } })() : (c.prize || {});
    const productsText = getProductsText(cond);
    const paidProduct = productsText.split(',')[0]?.trim() || '';
    const freeProduct = prize.free_product || '';
    const buyQty = Number(cond.buy_qty || 1);
    const getQty = Number(cond.get_qty || 1);
    return { paidProduct, freeProduct, buyQty, getQty };
  };

  const handleSale = async (e) => {
    e.preventDefault();
    const isMember = campMemberType === 'member';
    const isBuyXGetY = saleModal?.campaign_type === 'buy_x_get_y';
    const { paidProduct: campPaidProduct, freeProduct: campFreeProduct, buyQty, getQty } = getCampProducts(saleModal);

    // For buy_x_get_y: use the campaign's configured product first; only fall back to manual selection if campaign has no product set
    const finalPaidProduct = isBuyXGetY ? (campPaidProduct || saleForm.paid_product) : saleForm.paid_product;
    // Free product: use campaign prize config → fall back to same item as paid
    const finalFreeProduct = isBuyXGetY ? (campFreeProduct || finalPaidProduct) : saleForm.free_product;
    const finalPaidQty = Number(saleForm.paid_qty);
    const finalFreeQty = isBuyXGetY ? Math.floor(finalPaidQty / buyQty) * getQty : Number(saleForm.free_qty);

    if (isMember && !campSelected) {
      setAlertMsg({ type: 'error', msg: 'Please search and select the member by NB/DZ number.' });
      return;
    }
    if (!isMember && !nonMemberName.trim()) {
      setAlertMsg({ type: 'error', msg: 'Please enter the non-member customer name.' });
      return;
    }
    if (!finalPaidProduct) {
      setAlertMsg({ type: 'error', msg: 'Please select the product being purchased.' });
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.branch.campaignSale({
        campaign_id:    saleModal.id,
        campaign_name:  saleModal.name,
        branch:         effectiveBranch,
        customer_type:  campMemberType,
        customer_name:  isMember ? (campSelected?.name || '') : nonMemberName.trim(),
        distributor_nb: isMember ? (campSelected?.nb_number || '') : '',
        nb_number:      isMember ? (campSelected?.nb_number || '') : '',
        referral_nb:    !isMember ? (campRefSelected?.nb_number || '') : '',
        referral_name:  !isMember ? (campRefSelected?.name || '') : '',
        paid_product:   finalPaidProduct,
        paid_qty:       finalPaidQty,
        free_product:   finalFreeProduct,
        free_qty:       finalFreeQty,
        notes:          saleForm.notes,
        processed_by:   user?.username || user?.full_name || 'branch',
      });
      setLastReceipt(result.receipt || null);
      setAlertMsg({ type: 'success', msg: 'Campaign sale processed successfully!' });
    } catch (err) {
      setAlertMsg({ type: 'error', msg: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const now = new Date();
  const filtered = filterStatus === 'all' ? campaigns
    : filterStatus === 'active' ? campaigns.filter(c => isLiveCampaign(c))
    : filterStatus === 'upcoming' ? campaigns.filter(c => new Date(c.start_date) > now)
    : campaigns.filter(c => new Date(c.end_date) < now);

  const productOptions = inventory.map(i => ({ value: i.product_name || i.name, label: `${i.product_name || i.name} (qty: ${i.total_qty ?? i.quantity ?? 0})` }));

  return (
    <div className="space-y-5">
      <div className="rounded-xl p-5" style={{ background: 'linear-gradient(135deg,#8b0000,#c41e3a)' }}>
        <div className="flex items-center gap-3">
          <Megaphone size={28} className="text-white" />
          <div>
            <h3 className="text-white text-lg font-bold m-0">📢 Branch Campaigns</h3>
            <p className="text-white/70 text-sm mt-0.5 m-0">View active promotions and process campaign sales.</p>
          </div>
        </div>
        <div className="flex gap-5 mt-3">
          {[
            { label: 'Active', val: campaigns.filter(c => isLiveCampaign(c)).length, color: '#86efac' },
            { label: 'Upcoming', val: campaigns.filter(c => new Date(c.start_date) > now).length, color: '#fcd34d' },
            { label: 'Ended', val: campaigns.filter(c => new Date(c.end_date) < now).length, color: '#fca5a5' },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-2xl font-black" style={{ color: s.color }}>{s.val}</div>
              <div className="text-xs text-white/60">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[
          { id: 'active', label: 'Active Now' },
          { id: 'upcoming', label: 'Upcoming' },
          { id: 'ended', label: 'Ended' },
          { id: 'all', label: 'All' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilterStatus(f.id)}
            style={{ padding: '5px 14px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem',
              background: filterStatus === f.id ? '#c41e3a' : '#f1f5f9', color: filterStatus === f.id ? '#fff' : '#475569' }}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? <LoadingSpinner /> : (
        filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <div style={{ fontSize: 48, opacity: 0.3 }}>📢</div>
            <div className="mt-2">No campaigns found for this filter.</div>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(c => {
              const cc = BRANCH_CAMP_COLORS[c.campaign_type] || BRANCH_CAMP_COLORS.custom;
              const live = isLiveCampaign(c);
              const prize = typeof c.prize === 'string' ? (() => { try { return JSON.parse(c.prize); } catch { return {}; } })() : (c.prize || {});
              const cond = typeof c.conditions === 'string' ? (() => { try { return JSON.parse(c.conditions); } catch { return {}; } })() : (c.conditions || {});
              return (
                <div key={c.id} className="rounded-xl border-2 overflow-hidden" style={{ borderColor: cc.border, background: cc.bg }}>
                  <div className="p-4">
                    <div className="flex flex-wrap justify-between items-start gap-3">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-bold text-gray-800">{c.name}</span>
                          {branchCampBadge(c)}
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#fff', color: cc.text, border: `1px solid ${cc.border}` }}>
                            {BRANCH_CAMP_TYPE_LABELS[c.campaign_type] || c.campaign_type}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mb-1">{formatDate(c.start_date)} → {formatDate(c.end_date)}</div>
                        {c.description && <div className="text-sm text-gray-600 mb-1">{c.description}</div>}
                        <div className="text-xs text-gray-600 space-y-0.5">
                          {cond.buy_qty && cond.get_qty && <div>📌 Buy <strong>{cond.buy_qty}</strong>, get <strong>{cond.get_qty}</strong> free</div>}
                          {cond.discount_pct && <div>📌 Discount: <strong>{cond.discount_pct}%</strong> off</div>}
                          {cond.min_purchase && <div>📌 Min purchase: N${cond.min_purchase}</div>}
                          {prize.description && <div>🏆 {prize.description}</div>}
                          {prize.free_product && <div>🎁 Free product: <strong>{prize.free_product}</strong></div>}
                          {prize.cash_reward && <div>💰 Cash reward: N${prize.cash_reward}</div>}
                        </div>
                      </div>
                      {live && (
                        <button onClick={() => openSaleModal(c)}
                          style={{ padding: '8px 18px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                          + Process Sale
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {saleModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 28, maxWidth: 540, width: '100%', boxShadow: '0 24px 64px rgba(0,0,0,0.3)', maxHeight: '93vh', overflowY: 'auto' }}>
            <div className="flex justify-between items-center mb-4">
              <div>
                <div className="font-bold text-lg text-gray-800">Process Campaign Sale</div>
                <div className="text-sm text-gray-500">{saleModal.name}</div>
              </div>
              <button onClick={() => setSaleModal(null)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
            </div>
            {alertMsg && <Alert type={alertMsg.type} className="mb-4" onClose={() => setAlertMsg(null)}>{alertMsg.msg}</Alert>}

            {lastReceipt && (
              <div style={{ background: '#f0fdf4', border: '2px solid #86efac', borderRadius: 12, padding: 16, marginBottom: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 32 }}>✅</div>
                <div style={{ fontWeight: 700, color: '#15803d', marginBottom: 6 }}>Sale Processed Successfully!</div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Receipt #{lastReceipt.sale_number}</div>
                <div className="flex gap-2 justify-center">
                  <button type="button" onClick={() => printCampaignReceipt(lastReceipt, effectiveBranch)}
                    style={{ padding: '8px 20px', background: '#9b1c2e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>
                    🖨 Print Receipt
                  </button>
                  <button type="button" onClick={() => setSaleModal(null)}
                    style={{ padding: '8px 20px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                    Close
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleSale} className="space-y-4">
              {/* Member / Non-Member toggle */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Customer Type</label>
                <div className="flex gap-2">
                  {[{ id: 'member', label: '👤 Member' }, { id: 'non_member', label: '🚶 Non-Member' }].map(t => (
                    <button key={t.id} type="button" onClick={() => { setCampMemberType(t.id); setCampSelected(null); setCampSearch(''); setCampResults([]); setNonMemberName(''); setCampRefSelected(null); setCampRefSearch(''); setCampRefResults([]); }}
                      style={{ flex: 1, padding: '8px 10px', border: '2px solid', borderColor: campMemberType === t.id ? '#9b1c2e' : '#e2e8f0', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '0.8rem', background: campMemberType === t.id ? '#9b1c2e' : '#f8fafc', color: campMemberType === t.id ? '#fff' : '#475569' }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Member NB search */}
              {campMemberType === 'member' ? (
                <div style={{ position: 'relative' }}>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Search Member by NB/DZ# or Name</label>
                  <input type="text" value={campSearch} onChange={e => searchCampMember(e.target.value)}
                    placeholder="Type NB/DZ number or name…" autoComplete="off"
                    style={{ width: '100%', padding: '9px 12px', border: '1.5px solid', borderColor: campSelected ? '#16a34a' : '#d1d5db', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: campSelected ? '#f0fdf4' : '#fff' }} />
                  {campResults.length > 0 && (
                    <div style={{ position: 'absolute', zIndex: 100, background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.13)', top: '100%', left: 0, right: 0, maxHeight: 200, overflowY: 'auto' }}>
                      {campResults.slice(0, 8).map(d => {
                        const nd = normalizeDistributor(d);
                        return (
                          <div key={nd.id || nd.nb_number} onClick={() => selectCampMember(d)}
                            style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{nd.name}</div>
                            <div style={{ fontSize: 11, color: '#9b1c2e' }}>{nd.nb_number} · {nd.phone || '—'}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {campSelected && (
                    <div style={{ marginTop: 6, padding: '8px 12px', background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 800, color: '#15803d', fontSize: 13 }}>{campSelected.name}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{campSelected.nb_number}</div>
                      </div>
                      <button type="button" onClick={() => { setCampSelected(null); setCampSearch(''); setCampResults([]); }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16 }}>✕</button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Non-Member Customer Name</label>
                    <input type="text" value={nonMemberName} onChange={e => setNonMemberName(e.target.value)}
                      placeholder="Enter customer name…"
                      style={{ width: '100%', padding: '9px 12px', border: '1.5px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ position: 'relative' }}>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Referring Member (optional)</label>
                    <input type="text" value={campRefSearch} onChange={e => searchCampRef(e.target.value)}
                      placeholder="Search referring member by NB/DZ# or name…" autoComplete="off"
                      style={{ width: '100%', padding: '9px 12px', border: '1.5px solid', borderColor: campRefSelected ? '#16a34a' : '#d1d5db', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: campRefSelected ? '#f0fdf4' : '#fff' }} />
                    {campRefResults.length > 0 && (
                      <div style={{ position: 'absolute', zIndex: 100, background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.13)', top: '100%', left: 0, right: 0, maxHeight: 180, overflowY: 'auto' }}>
                        {campRefResults.slice(0, 8).map(d => {
                          const nd = normalizeDistributor(d);
                          return (
                            <div key={nd.id || nd.nb_number} onClick={() => selectCampRef(d)}
                              style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#fef2f2'}
                              onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                              <div style={{ fontWeight: 700, fontSize: 13 }}>{nd.name}</div>
                              <div style={{ fontSize: 11, color: '#9b1c2e' }}>{nd.nb_number} · {nd.phone || '—'}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {campRefSelected && (
                      <div style={{ marginTop: 6, padding: '6px 10px', background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 12 }}>
                          <span style={{ fontWeight: 700, color: '#15803d' }}>{campRefSelected.name}</span>
                          <span style={{ color: '#64748b', marginLeft: 6 }}>{campRefSelected.nb_number}</span>
                        </div>
                        <button type="button" onClick={() => { setCampRefSelected(null); setCampRefSearch(''); setCampRefResults([]); }} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}>✕</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* ── Product section — for buy_x_get_y campaigns products are locked to campaign setup ── */}
              {(() => {
                const isBXGY = saleModal?.campaign_type === 'buy_x_get_y';
                const { paidProduct, freeProduct, buyQty, getQty } = getCampProducts(saleModal);
                const paidQty = Number(saleForm.paid_qty) || buyQty;
                const derivedFreeQty = Math.floor(paidQty / buyQty) * getQty;

                // Check if campaign's configured paid product matches something in branch inventory
                const campPaidValid = paidProduct && productOptions.some(
                  p => p.value.trim().toLowerCase() === paidProduct.trim().toLowerCase()
                );
                // Effective free product: from campaign prize, or same as paid item
                const effectiveFreeProduct = freeProduct || paidProduct || saleForm.paid_product || '';

                if (isBXGY) {
                  return (
                    <>
                      {/* Paid product — always locked to campaign configuration */}
                      <div className="p-3 rounded-lg border-2 border-blue-200 bg-blue-50 space-y-2">
                        <div className="text-sm font-semibold text-blue-800">
                          Paid Item <span className="text-blue-600 font-normal text-xs">(deducted as sale)</span>
                        </div>
                        {paidProduct ? (
                          <div className="flex items-center gap-3 p-2 bg-white border border-blue-300 rounded-lg">
                            <span style={{ fontSize: 20 }}>📦</span>
                            <div className="flex-1">
                              <div className="font-bold text-gray-800 text-sm">{paidProduct}</div>
                              <div className="text-xs text-gray-500">Buy {buyQty} unit(s) to qualify</div>
                            </div>
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">From campaign setup</span>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                              ⚠️ No product configured in this campaign — select from your inventory
                            </div>
                            <select value={saleForm.paid_product} onChange={e => setSaleForm(f => ({ ...f, paid_product: e.target.value }))}
                              className="w-full px-3 py-2 rounded-lg border border-blue-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                              <option value="">-- Select product --</option>
                              {productOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                            </select>
                          </div>
                        )}
                        <div className="flex items-end gap-3">
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Quantity purchased</label>
                            <input type="number" min={buyQty} value={saleForm.paid_qty}
                              onChange={e => setSaleForm(f => ({ ...f, paid_qty: e.target.value }))}
                              style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #93c5fd', borderRadius: 8, fontSize: 14, outline: 'none', background: '#fff' }} />
                          </div>
                          <div className="text-xs text-blue-600 pb-2">Min: {buyQty}</div>
                        </div>
                      </div>
                      {/* Free product pill — always shows something (falls back to paid item) */}
                      <div className="p-3 rounded-lg border-2 border-green-200 bg-green-50 space-y-2">
                        <div className="text-sm font-semibold text-green-800">
                          Free / Bonus Item <span className="text-green-600 font-normal text-xs">(deducted as campaign free item)</span>
                        </div>
                        <div className="flex items-center gap-3 p-2 bg-white border border-green-300 rounded-lg">
                          <span style={{ fontSize: 20 }}>🎁</span>
                          <div className="flex-1">
                            {effectiveFreeProduct ? (
                              <>
                                <div className="font-bold text-gray-800 text-sm">{effectiveFreeProduct}</div>
                                <div className="text-xs text-gray-500">
                                  {derivedFreeQty} free unit(s) for buying {paidQty} × {campPaidValid ? paidProduct : (saleForm.paid_product || '…')}
                                  {!freeProduct && <span className="ml-1 text-amber-600">(same as paid item)</span>}
                                </div>
                              </>
                            ) : (
                              <div className="text-xs text-gray-400 italic">Select a paid product above to determine the free item</div>
                            )}
                          </div>
                          {effectiveFreeProduct && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">{derivedFreeQty} FREE</span>}
                        </div>
                      </div>
                    </>
                  );
                }
                // Non-buy_x_get_y: manual product selection from inventory
                return (
                  <>
                    <div className="p-3 rounded-lg border-2 border-blue-200 bg-blue-50 space-y-3">
                      <div className="text-sm font-semibold text-blue-800">Paid Item (deducted as sale)</div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Product</label>
                          <select value={saleForm.paid_product} onChange={e => setSaleForm(f => ({ ...f, paid_product: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200">
                            <option value="">-- Select product --</option>
                            {productOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                          </select>
                        </div>
                        <Input label="Qty" type="number" min="1" value={saleForm.paid_qty} onChange={e => setSaleForm(f => ({ ...f, paid_qty: e.target.value }))} />
                      </div>
                    </div>
                    <div className="p-3 rounded-lg border border-green-200 bg-green-50 space-y-2">
                      <div className="text-sm font-semibold text-green-800">Free / Bonus Item <span className="text-green-600 font-normal text-xs">(optional)</span></div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">Product (if any)</label>
                          <select value={saleForm.free_product} onChange={e => setSaleForm(f => ({ ...f, free_product: e.target.value }))}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-green-200">
                            <option value="">-- None --</option>
                            {productOptions.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                          </select>
                        </div>
                        {saleForm.free_product && <Input label="Qty" type="number" min="1" value={saleForm.free_qty} onChange={e => setSaleForm(f => ({ ...f, free_qty: e.target.value }))} />}
                      </div>
                    </div>
                  </>
                );
              })()}
              {/* ── Price Preview ─────────────────────────────────────────────── */}
              {(() => {
                const prodName = (saleForm.paid_product || '').trim().toLowerCase();
                const row = prices.find(p =>
                  (p.description || p.name || '').toLowerCase() === prodName
                );
                if (!row) return null;
                const dp  = parseFloat(row.dp)  || 0;
                const cp  = parseFloat(row.cp)  || 0;
                const bv  = parseFloat(row.bv)  || 0;
                const qty = parseInt(saleForm.paid_qty, 10) || 1;
                const isMem = campMemberType === 'member';
                const unitPrice   = isMem ? dp : cp;
                const lineTotal   = Math.round(unitPrice * qty * 100) / 100;
                const lineBv      = isMem ? Math.round(bv * qty * 100) / 100 : 0;
                const profit      = isMem ? 0 : Math.round((cp - dp) * qty * 100) / 100;
                return (
                  <div style={{ background: isMem ? '#eff6ff' : '#fefce8', border: `1px solid ${isMem ? '#bfdbfe' : '#fde68a'}`, borderRadius: 10, padding: '10px 14px', fontSize: '0.82rem' }}>
                    <div style={{ fontWeight: 700, color: isMem ? '#1d4ed8' : '#92400e', marginBottom: 6 }}>
                      {isMem ? '🔵 Member Price Breakdown' : '🟡 Non-Member Price Breakdown'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 18px', color: '#374151' }}>
                      <span>Unit price ({isMem ? 'DP' : 'CP'}):</span>
                      <span style={{ fontWeight: 600 }}>N$ {unitPrice.toFixed(2)}</span>
                      {isMem && <><span>BV per unit:</span><span style={{ fontWeight: 600 }}>{bv.toFixed(2)} pts</span></>}
                      <span>Qty:</span><span style={{ fontWeight: 600 }}>{qty}</span>
                      <span style={{ borderTop: '1px dashed #d1d5db', paddingTop: 4 }}>Total:</span>
                      <span style={{ fontWeight: 700, color: '#15803d', borderTop: '1px dashed #d1d5db', paddingTop: 4 }}>N$ {lineTotal.toFixed(2)}</span>
                      {isMem && (
                        <><span>Total BV:</span><span style={{ fontWeight: 700, color: '#1d4ed8' }}>{lineBv.toFixed(2)} pts</span></>
                      )}
                      {!isMem && profit > 0 && (
                        <><span>Branch profit:</span><span style={{ fontWeight: 700, color: '#b45309' }}>N$ {profit.toFixed(2)}</span></>
                      )}
                    </div>
                  </div>
                );
              })()}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea value={saleForm.notes} onChange={e => setSaleForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 min-h-[50px]"
                  placeholder="Any additional notes..." />
              </div>
              <div className="flex gap-3 pt-2 border-t border-gray-100">
                <button type="submit" disabled={submitting}
                  style={{ flex: 1, padding: '10px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }}>
                  {submitting ? 'Processing…' : '✓ Process Campaign Sale'}
                </button>
                <button type="button" onClick={() => setSaleModal(null)}
                  style={{ padding: '10px 18px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: 10, cursor: 'pointer', fontWeight: 600 }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── BRANCH TRAINING TAB ──────────────────────────────────── */
const BRANCH_MEETING_PLATFORMS = [
  { id: 'zoom',       label: 'Zoom',           icon: '🎥', color: '#2D8CFF', bg: '#eff6ff' },
  { id: 'teams',      label: 'Teams',          icon: '💼', color: '#5b5ea6', bg: '#f5f3ff' },
  { id: 'meet',       label: 'Google Meet',    icon: '📹', color: '#0F9D58', bg: '#f0fdf4' },
  { id: 'webex',      label: 'Cisco Webex',    icon: '🌐', color: '#00A0D1', bg: '#ecfeff' },
  { id: 'skype',      label: 'Skype',          icon: '💬', color: '#00AFF0', bg: '#eff6ff' },
  { id: 'goto',       label: 'GoTo Meeting',   icon: '🖥️', color: '#f97316', bg: '#fff7ed' },
  { id: 'whatsapp',   label: 'WhatsApp',       icon: '📱', color: '#25D366', bg: '#f0fdf4' },
  { id: 'youtube',    label: 'YouTube Live',    icon: '▶️', color: '#FF0000', bg: '#fff5f5' },
  { id: 'facebook',   label: 'Facebook Live',   icon: '📘', color: '#1877F2', bg: '#eff6ff' },
  { id: 'telegram',   label: 'Telegram',        icon: '✈️', color: '#2AABEE', bg: '#f0f9ff' },
  { id: 'campaign',   label: 'Campaign Event',  icon: '🎯', color: '#c41e3a', bg: '#fff0f3' },
  { id: 'in_person',  label: 'In-Person',      icon: '📍', color: '#64748b', bg: '#f8fafc' },
];

function branchGetPlatform(id) {
  return BRANCH_MEETING_PLATFORMS.find(p => p.id === id) || BRANCH_MEETING_PLATFORMS[BRANCH_MEETING_PLATFORMS.length - 1];
}

function BranchTrainingTab() {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPast, setShowPast] = useState(false);

  useEffect(() => {
    api.get('/training-schedules')
      .then(d => setSchedules(Array.isArray(d) ? d : []))
      .catch(() => setSchedules([]))
      .finally(() => setLoading(false));
  }, []);

  const AUDIENCE_FOR_BRANCH = ['all', 'branch_staff', 'all_staff'];
  let events = schedules.filter(s => AUDIENCE_FOR_BRANCH.includes(s.target_audience || 'all'));
  if (!showPast) events = events.filter(s => new Date(s.date) >= new Date(new Date().toDateString()));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: 'linear-gradient(135deg,#065f46,#047857)', borderRadius: 14, padding: '20px 24px', color: '#fff', display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 40 }}>🎓</span>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>Online Training Sessions</h2>
          <p style={{ margin: '4px 0 0', opacity: 0.85, fontSize: '0.9rem' }}>Click &ldquo;Join Meeting&rdquo; to attend your scheduled training</p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: '#64748b', cursor: 'pointer' }}>
          <input type="checkbox" checked={showPast} onChange={e => setShowPast(e.target.checked)} />
          Show past sessions
        </label>
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#94a3b8' }}>{events.length} session{events.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : events.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 14, border: '2px dashed #e2e8f0' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📅</div>
          <p style={{ fontWeight: 600, color: '#374151', margin: 0 }}>No upcoming training sessions</p>
          <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: 6 }}>Sessions will appear here when scheduled by the training team.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {events.map(s => {
            const platform = branchGetPlatform(s.platform || 'in_person');
            const isOnline = s.platform && s.platform !== 'in_person';
            const isPast = new Date(s.date) < new Date(new Date().toDateString());
            return (
              <div key={s.id} style={{ borderRadius: 12, border: `2px solid ${isOnline ? platform.color + '44' : '#e2e8f0'}`, overflow: 'hidden', opacity: isPast ? 0.6 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: platform.bg, color: platform.color, fontSize: '0.8rem', fontWeight: 700 }}>
                  <span style={{ fontSize: '1.1rem' }}>{platform.icon}</span>
                  <span>{platform.label}</span>
                  {s.target_audience === 'branch_staff' && <span style={{ marginLeft: 'auto' }}>🏬 Branch Staff</span>}
                  {s.target_audience === 'all_staff' && <span style={{ marginLeft: 'auto' }}>👥 All Staff</span>}
                  {s.target_audience === 'all' && <span style={{ marginLeft: 'auto' }}>🌍 Everyone</span>}
                </div>
                <div style={{ padding: '16px', background: '#fff', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 52, background: platform.bg, borderRadius: 10, padding: '6px 4px', textAlign: 'center', border: `2px solid ${platform.color}33` }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', color: platform.color }}>
                      {new Date(s.date).toLocaleDateString('en', { month: 'short' })}
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#1f2937', lineHeight: 1.1 }}>{new Date(s.date).getDate()}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1f2937' }}>{s.title}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 16px', marginTop: 4 }}>
                      {s.time && <span style={{ fontSize: '0.8rem', color: '#64748b' }}>🕐 {s.time}</span>}
                      {s.location && <span style={{ fontSize: '0.8rem', color: '#64748b' }}>📍 {s.location}</span>}
                      {s.trainer && <span style={{ fontSize: '0.8rem', color: '#64748b' }}>👤 {s.trainer}</span>}
                    </div>
                    {s.description && <p style={{ margin: '8px 0 0', fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>{s.description}</p>}
                  </div>
                  <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700, background: isPast ? '#f1f5f9' : '#dbeafe', color: isPast ? '#64748b' : '#1d4ed8' }}>
                      {isPast ? 'Past' : 'Upcoming'}
                    </span>
                    {isOnline && s.meeting_link && !isPast && (
                      <a href={s.meeting_link} target="_blank" rel="noreferrer"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, background: platform.color, color: '#fff', fontWeight: 700, fontSize: '0.82rem', textDecoration: 'none' }}>
                        🔗 Join Meeting
                      </a>
                    )}
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
